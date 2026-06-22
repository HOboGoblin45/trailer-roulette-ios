//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v2.0.0, continuous).
//
//  Architecture (verified in headless WebKit with iOS UA):
//
//    1. Modal UIViewController hosts a fresh WKWebView.
//    2. WKWebView navigates directly to our Vercel proxy URL —
//       https://trailer-roulette.vercel.app/embed?v=ID — as the main
//       frame. This is a normal HTTPS navigation, NOT loadHTMLString.
//    3. The proxy page hosts the YouTube iframe. From YouTube's
//       perspective the embed comes from a real third-party https
//       origin (trailer-roulette.vercel.app), which is what their
//       embedded-player terms doc requires for embedder identification.
//    4. The proxy page (landing-page/api/embed.js Edge Function) forwards
//       YouTube IFrame Player events to native via webkit.messageHandlers
//       .trailerEvent. We get onReady, stateChange (1=PLAYING, 0=ENDED),
//       and onError.
//    5. Custom UI chrome (Done + Skip buttons, title, white header,
//       black video stage) so the experience feels in-app.
//
//  v2.0.0 — CONTINUOUS PLAYBACK:
//    The modal no longer dismisses between trailers. When a trailer ends
//    (or the user taps Skip), if JS has enqueued a "next" video id we
//    reload the SAME WKWebView to the next proxy URL in place — the modal
//    stays up, so there is no dismiss/re-present flash between trailers.
//    We notify JS of each in-place advance via notifyListeners so the JS
//    queue / metadata / watchlist stay in sync and JS can enqueue the
//    following video.
//
//    Backward-compatible: if no "next" is enqueued, behaviour is exactly
//    as v1.9.0 — finish with reason "ended"/"skip" and let JS reopen. So
//    a missing handshake degrades to the proven path, never a hang.
//
//  Why prior versions failed:
//    - Loading the embed URL directly with manual Referer header (v1.7.x)
//      hit WebKit Bug 169846 (Referer stripped on cross-origin sub-resources).
//    - loadHTMLString:baseURL:https://www.youtube.com (v1.8.3) caused YT
//      to reject as "youtube.com embedding youtube.com" — Error 152.
//    - Static iframe inside the main app's Capacitor WebView (v1.5.x) —
//      nested cross-origin iframe, Bug 169846 strips the Referer.
//

import Foundation
import UIKit
import WebKit
import Capacitor

@objc(TrailerPlayer)
public class TrailerPlayer: CAPPlugin {

    private weak var presentedVC: TrailerPlayerViewController?
    private var pendingCall: CAPPluginCall?

    @objc func openTrailer(_ call: CAPPluginCall) {
        guard let videoId = sanitizedId(call.getString("youtubeKey")) else {
            call.reject("Missing or invalid youtubeKey")
            return
        }
        let title = call.getString("title") ?? ""
        let nextId = sanitizedId(call.getString("nextYoutubeKey"))
        let nextTitle = call.getString("nextTitle") ?? ""

        DispatchQueue.main.async {
            guard let presenter = self.resolvePresenter() else {
                call.reject("No presenter (no active scene/window)")
                return
            }
            if let existing = self.presentedVC {
                existing.dismiss(animated: false) {
                    self.pendingCall?.resolve(["dismissed": true, "reason": "replaced"])
                    self.pendingCall = nil
                    self.presentTrailer(videoId: videoId, title: title,
                                        nextId: nextId, nextTitle: nextTitle,
                                        from: presenter, call: call)
                }
                return
            }
            self.presentTrailer(videoId: videoId, title: title,
                                nextId: nextId, nextTitle: nextTitle,
                                from: presenter, call: call)
        }
    }

    /// Tell the open player what to chain to next. Called by JS as it
    /// prefetches the upcoming trailer key. No-op (resolves false) if the
    /// player isn't open.
    @objc func enqueueNext(_ call: CAPPluginCall) {
        let nextId = sanitizedId(call.getString("youtubeKey"))
        let nextTitle = call.getString("title") ?? ""
        DispatchQueue.main.async {
            guard let vc = self.presentedVC else {
                call.resolve(["queued": false, "reason": "not-open"])
                return
            }
            vc.setNext(videoId: nextId, title: nextTitle)
            call.resolve(["queued": nextId != nil])
        }
    }

    @objc func closeTrailer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.presentedVC else {
                call.resolve(["closed": false, "reason": "not-open"])
                return
            }
            vc.dismiss(animated: true) {
                call.resolve(["closed": true])
            }
        }
    }

    private func sanitizedId(_ raw: String?) -> String? {
        guard let id = raw, !id.isEmpty else { return nil }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        if id.unicodeScalars.contains(where: { !allowed.contains($0) }) { return nil }
        return id
    }

    private func presentTrailer(videoId: String, title: String,
                                nextId: String?, nextTitle: String,
                                from presenter: UIViewController, call: CAPPluginCall) {
        let vc = TrailerPlayerViewController(
            videoId: videoId,
            title: title,
            onEvent: { [weak self] name, data in
                // In-place lifecycle events (advance, start) while the
                // player stays open. JS keeps its queue in sync and
                // enqueues the following video.
                self?.notifyListeners(name, data: data)
            },
            onDismiss: { [weak self] reason, playedId in
                guard let self = self else { return }
                self.presentedVC = nil
                self.pendingCall?.resolve(["dismissed": true,
                                           "reason": reason,
                                           "youtubeKey": playedId])
                self.pendingCall = nil
            }
        )
        if let nextId = nextId { vc.setNext(videoId: nextId, title: nextTitle) }
        vc.modalPresentationStyle = .fullScreen
        vc.modalTransitionStyle = .coverVertical

        self.presentedVC = vc
        self.pendingCall = call
        call.keepAlive = true

        presenter.present(vc, animated: true, completion: nil)
    }

    private func resolvePresenter() -> UIViewController? {
        let activeScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        for scene in activeScenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first,
               let root = window.rootViewController {
                var top: UIViewController = root
                while let presented = top.presentedViewController {
                    top = presented
                }
                return top
            }
        }
        return self.bridge?.viewController
    }
}

// MARK: - View controller

class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private var videoId: String
    private var videoTitle: String
    private let onEvent: (String, [String: Any]) -> Void
    private let onDismiss: (String, String) -> Void

    // The next trailer to chain to in place. Updated by JS via enqueueNext.
    private var nextVideoId: String?
    private var nextVideoTitle: String = ""

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!
    private var titleLabel: UILabel!
    private var skipButton: UIButton!

    private var didFinish = false
    private var watchdogTimer: Timer?
    private var sawPlaying = false

    // Light theme to match the app (white header, light-blue accents,
    // black video stage — video always looks best on black).
    private static let stageColor = UIColor.black
    private static let headerColor = UIColor.white
    private static let accentColor = UIColor(red: 0.239, green: 0.647, blue: 0.957, alpha: 1.0) // #3DA5F4
    private static let titleColor = UIColor(red: 0.059, green: 0.090, blue: 0.133, alpha: 1.0)  // #0F1722

    /// The Vercel proxy host — verified third-party origin that YouTube
    /// accepts as a legitimate embedder. Anything else here = player
    /// rejected. Must match what the Edge Function rewrites and what
    /// the iframe URL's `origin` parameter declares.
    private static let proxyHost = "trailer-roulette.vercel.app"

    private static let allowedHosts: Set<String> = [
        "trailer-roulette.vercel.app",
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
        "youtube-nocookie.com",
        "i.ytimg.com",
        "s.ytimg.com",
        "yt3.ggpht.com",
        "yt3.googleusercontent.com",
        "fonts.gstatic.com",
        "www.gstatic.com",
        "fonts.googleapis.com",
        "play.google.com",
        "static.doubleclick.net",
        "googleads.g.doubleclick.net",
        "tpc.googlesyndication.com",
    ]

    init(videoId: String,
         title: String,
         onEvent: @escaping (String, [String: Any]) -> Void,
         onDismiss: @escaping (String, String) -> Void) {
        self.videoId = videoId
        self.videoTitle = title
        self.onEvent = onEvent
        self.onDismiss = onDismiss
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit { watchdogTimer?.invalidate() }

    /// Update what we chain to when the current trailer ends or is skipped.
    func setNext(videoId: String?, title: String) {
        self.nextVideoId = videoId
        self.nextVideoTitle = title
        DispatchQueue.main.async { [weak self] in
            self?.refreshSkipAffordance()
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.stageColor
        setupWebView()
        setupChrome()
        loadVideo(videoId: videoId)
    }

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        [.portrait, .landscapeLeft, .landscapeRight]
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsPictureInPictureMediaPlayback = true

        // Wire up the JS→native message channel that the Vercel proxy
        // page uses to relay YT IFrame Player events.
        let userContent = WKUserContentController()
        userContent.add(self, name: "trailerEvent")
        config.userContentController = userContent

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.backgroundColor = Self.stageColor
        webView.isOpaque = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = Self.stageColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        self.webView = webView
    }

    private func setupChrome() {
        // White header bar across the top safe area + 48pt control row.
        let header = UIView()
        header.backgroundColor = Self.headerColor
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.setTitleColor(Self.accentColor, for: .normal)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        header.addSubview(doneButton)

        let skip = UIButton(type: .system)
        skip.setTitle("Skip ▸", for: .normal)
        skip.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        skip.setTitleColor(Self.accentColor, for: .normal)
        skip.translatesAutoresizingMaskIntoConstraints = false
        skip.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        header.addSubview(skip)
        self.skipButton = skip

        let titleLabel = UILabel()
        titleLabel.text = videoTitle.isEmpty ? "Trailer" : videoTitle
        titleLabel.textColor = Self.titleColor
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)
        self.titleLabel = titleLabel

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = Self.accentColor
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        view.addSubview(spinner)
        self.loadingIndicator = spinner

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48),

            doneButton.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            doneButton.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -2),
            doneButton.heightAnchor.constraint(equalToConstant: 44),

            skip.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
            skip.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
            skip.heightAnchor.constraint(equalToConstant: 44),

            titleLabel.leadingAnchor.constraint(equalTo: doneButton.trailingAnchor, constant: 8),
            titleLabel.trailingAnchor.constraint(equalTo: skip.leadingAnchor, constant: -8),
            titleLabel.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),

            spinner.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
        ])
    }

    /// Load (or reload, in place) the proxy page for a given video.
    private func loadVideo(videoId: String) {
        var components = URLComponents()
        components.scheme = "https"
        components.host = Self.proxyHost
        components.path = "/embed"
        components.queryItems = [URLQueryItem(name: "v", value: videoId)]
        guard let url = components.url else {
            dismissUnplayable("invalid-url")
            return
        }

        sawPlaying = false
        loadingIndicator?.startAnimating()
        // Direct HTTPS navigation. The proxy page handles the YT iframe.
        webView.load(URLRequest(url: url))

        // Watchdog: if state=PLAYING never fires within 12s, treat this
        // video as unplayable. Real playback starts in 2-3s normally.
        watchdogTimer?.invalidate()
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 12.0, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish, !self.sawPlaying else { return }
            // A bad video mid-session shouldn't kill the whole player —
            // skip to the next if we have one.
            if self.nextVideoId != nil {
                self.advanceInPlace(reason: "advanced")
            } else {
                self.dismissUnplayable("watchdog")
            }
        }
    }

    /// Chain to the queued next video without dismissing the modal. This is
    /// what makes playback continuous — no dismiss/re-present flash.
    private func advanceInPlace(reason: String) {
        guard let next = nextVideoId else { return }
        let played = videoId
        videoId = next
        videoTitle = nextVideoTitle
        nextVideoId = nil
        nextVideoTitle = ""
        titleLabel?.text = videoTitle.isEmpty ? "Trailer" : videoTitle
        refreshSkipAffordance()
        // Tell JS: we advanced in place. JS shifts its queue, updates the
        // metadata panel beneath the modal, and enqueues the next key.
        onEvent("trailerEvent", ["event": reason, "from": played, "youtubeKey": next])
        loadVideo(videoId: next)
    }

    private func refreshSkipAffordance() {
        // Skip is always tappable (falls back to advancing the JS queue
        // even with nothing pre-queued), but we lighten it when there's
        // nothing primed so it reads as "skip & exit" vs "skip in place".
        skipButton?.alpha = (nextVideoId != nil) ? 1.0 : 0.55
    }

    @objc private func doneTapped() {
        finish(reason: "user")
    }

    @objc private func skipTapped() {
        if nextVideoId != nil {
            advanceInPlace(reason: "skipped")
        } else {
            // Nothing primed — exit and let JS advance + reopen.
            finish(reason: "skip")
        }
    }

    private func finish(reason: String) {
        guard !didFinish else { return }
        didFinish = true
        watchdogTimer?.invalidate(); watchdogTimer = nil
        let played = videoId
        DispatchQueue.main.async { [weak self] in
            self?.onDismiss(reason, played)
            self?.dismiss(animated: true)
        }
    }

    private func dismissUnplayable(_ subreason: String) {
        finish(reason: "unplayable:\(subreason)")
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView,
                        decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // about:, data:, file: schemes are part of WKWebView bootstrap.
        if url.scheme == "about" || url.scheme == "data" || url.scheme == "file" {
            decisionHandler(.allow)
            return
        }

        if let host = url.host, Self.allowedHosts.contains(host) {
            // Special case: main-frame nav to youtube.com/watch is the
            // "embed disabled, watch on YouTube" escape link. Intercept.
            let isMain = navigationAction.targetFrame?.isMainFrame ?? false
            let path = url.path
            if isMain && (host == "www.youtube.com" || host == "youtube.com" || host == "m.youtube.com") &&
               path.hasPrefix("/watch") {
                decisionHandler(.cancel)
                if nextVideoId != nil { advanceInPlace(reason: "advanced") }
                else { dismissUnplayable("escape-to-youtube") }
                return
            }
            decisionHandler(.allow)
            return
        }

        // Anything else: cancel. We're not a general-purpose browser.
        decisionHandler(.cancel)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimating()
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsErr = error as NSError
        if nsErr.code == NSURLErrorCancelled { return }
        dismissUnplayable("provisional:\(nsErr.code)")
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let nsErr = error as NSError
        if nsErr.code == NSURLErrorCancelled { return }
        dismissUnplayable("nav:\(nsErr.code)")
    }

    // MARK: - WKUIDelegate

    public func webView(_ webView: WKWebView,
                        createWebViewWith configuration: WKWebViewConfiguration,
                        for navigationAction: WKNavigationAction,
                        windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url,
           let host = url.host,
           host.hasSuffix("youtube.com") || host == "youtu.be" {
            if nextVideoId != nil { advanceInPlace(reason: "advanced") }
            else { dismissUnplayable("popup-to-youtube") }
        }
        return nil
    }

    // MARK: - WKScriptMessageHandler — events from the proxy page

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "trailerEvent" else { return }
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }

        switch kind {
        case "pageLoaded", "iframeLoaded":
            // Informational; just confirms the proxy page is alive.
            print("[TrailerPlayer] proxy event: \(kind)")

        case "ready":
            print("[TrailerPlayer] YT.Player onReady")

        case "stateChange":
            // 1=PLAYING, 0=ENDED, 2=PAUSED, 3=BUFFERING, 5=CUED
            let state = (body["state"] as? Int) ?? -99
            if state == 1 {
                // Real playback — kill watchdog so we don't dismiss a
                // healthy long trailer, and tell JS we started.
                sawPlaying = true
                watchdogTimer?.invalidate(); watchdogTimer = nil
                onEvent("trailerEvent", ["event": "started", "youtubeKey": videoId])
            } else if state == 0 {
                // Trailer finished. Chain in place if primed; else exit
                // and let JS advance + reopen (the proven v1.9 path).
                if nextVideoId != nil {
                    advanceInPlace(reason: "advanced")
                } else {
                    finish(reason: "ended")
                }
            }

        case "error":
            // YT IFrame Player error codes:
            //   2   = invalid videoId
            //   5   = HTML5 player error
            //   100 = video not found / made private
            //   101 = embedding disabled by uploader
            //   150 = same as 101 (different region)
            //   152 = 2025+ variant
            let code = (body["code"] as? Int) ?? -1
            if [2, 5, 100, 101, 150, 152].contains(code) {
                // Bad video — skip in place if we can, so a single dead
                // trailer never interrupts a continuous session.
                if nextVideoId != nil {
                    advanceInPlace(reason: "advanced")
                } else {
                    dismissUnplayable("yt:\(code)")
                }
            } else {
                if nextVideoId != nil {
                    advanceInPlace(reason: "advanced")
                } else {
                    dismissUnplayable("yt:unknown:\(code)")
                }
            }

        default:
            break
        }
    }
}
