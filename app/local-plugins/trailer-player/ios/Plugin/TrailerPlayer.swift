//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v1.9.0).
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
//    5. Custom UI chrome (Done button, title, dark navy bg) so the
//       experience feels in-app — no Safari URL bar.
//
//  Why prior versions failed:
//    - Loading the embed URL directly with manual Referer header (v1.7.x)
//      hit WebKit Bug 169846 (Referer stripped on cross-origin sub-resources).
//    - loadHTMLString:baseURL:https://www.youtube.com (v1.8.3) caused YT
//      to reject as "youtube.com embedding youtube.com" — Error 152.
//    - Static iframe inside the main app's Capacitor WebView (v1.5.x) —
//      nested cross-origin iframe, Bug 169846 strips the Referer.
//
//  This v1.9.0 architecture sidesteps all of those: a fresh WKWebView, a
//  real top-level https navigation to a third-party origin, no manual
//  header injection.
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
        guard let videoId = call.getString("youtubeKey"), !videoId.isEmpty else {
            call.reject("Missing youtubeKey")
            return
        }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        if videoId.unicodeScalars.contains(where: { !allowed.contains($0) }) {
            call.reject("Invalid youtubeKey")
            return
        }
        let title = call.getString("title") ?? ""

        DispatchQueue.main.async {
            guard let presenter = self.resolvePresenter() else {
                call.reject("No presenter (no active scene/window)")
                return
            }
            if let existing = self.presentedVC {
                existing.dismiss(animated: true) {
                    self.pendingCall?.resolve(["dismissed": true, "reason": "replaced"])
                    self.pendingCall = nil
                    self.presentTrailer(videoId: videoId, title: title, from: presenter, call: call)
                }
                return
            }
            self.presentTrailer(videoId: videoId, title: title, from: presenter, call: call)
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

    private func presentTrailer(videoId: String, title: String, from presenter: UIViewController, call: CAPPluginCall) {
        let vc = TrailerPlayerViewController(videoId: videoId, title: title) { [weak self] reason in
            guard let self = self else { return }
            self.presentedVC = nil
            self.pendingCall?.resolve(["dismissed": true, "reason": reason])
            self.pendingCall = nil
        }
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

    private let videoId: String
    private let videoTitle: String
    private let onDismiss: (String) -> Void

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!

    private var didFinish = false
    private var watchdogTimer: Timer?
    private var sawPlaying = false

    private static let backgroundColor = UIColor(red: 0.055, green: 0.090, blue: 0.149, alpha: 1.0)
    private static let accentColor = UIColor(red: 0.831, green: 0.686, blue: 0.216, alpha: 1.0)
    private static let textColor = UIColor(red: 0.957, green: 0.957, blue: 0.949, alpha: 1.0)

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

    init(videoId: String, title: String, onDismiss: @escaping (String) -> Void) {
        self.videoId = videoId
        self.videoTitle = title
        self.onDismiss = onDismiss
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit { watchdogTimer?.invalidate() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.backgroundColor
        setupWebView()
        setupChrome()
        loadProxyURL()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
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
        webView.backgroundColor = Self.backgroundColor
        webView.isOpaque = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = Self.backgroundColor
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
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.setTitleColor(Self.accentColor, for: .normal)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        view.addSubview(doneButton)

        let titleLabel = UILabel()
        titleLabel.text = videoTitle.isEmpty ? "Trailer" : videoTitle
        titleLabel.textColor = Self.textColor
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = Self.accentColor
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        view.addSubview(spinner)
        self.loadingIndicator = spinner

        NSLayoutConstraint.activate([
            doneButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            doneButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            doneButton.heightAnchor.constraint(equalToConstant: 44),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 60),

            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 76),
            titleLabel.trailingAnchor.constraint(equalTo: doneButton.leadingAnchor, constant: -8),
            titleLabel.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),

            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func loadProxyURL() {
        var components = URLComponents()
        components.scheme = "https"
        components.host = Self.proxyHost
        components.path = "/embed"
        components.queryItems = [URLQueryItem(name: "v", value: videoId)]
        guard let url = components.url else {
            dismissUnplayable("invalid-url")
            return
        }
        // Direct HTTPS navigation. The proxy page handles the YT iframe.
        webView.load(URLRequest(url: url))

        // Watchdog: if state=PLAYING never fires within 12s, dismiss as
        // unplayable. Real playback starts in 2-3s normally.
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 12.0, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish, !self.sawPlaying else { return }
            self.dismissUnplayable("watchdog")
        }
    }

    @objc private func doneTapped() {
        finish(reason: "user")
    }

    private func finish(reason: String) {
        guard !didFinish else { return }
        didFinish = true
        watchdogTimer?.invalidate(); watchdogTimer = nil
        DispatchQueue.main.async { [weak self] in
            self?.onDismiss(reason)
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
                dismissUnplayable("escape-to-youtube")
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
            dismissUnplayable("popup-to-youtube")
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
            // YT.Player has loaded and is ready. State change should
            // follow shortly.
            print("[TrailerPlayer] YT.Player onReady")

        case "stateChange":
            // 1=PLAYING, 0=ENDED, 2=PAUSED, 3=BUFFERING, 5=CUED
            let state = (body["state"] as? Int) ?? -99
            if state == 1 {
                // Real playback — kill watchdog so we don't dismiss a
                // healthy long trailer.
                sawPlaying = true
                watchdogTimer?.invalidate(); watchdogTimer = nil
            } else if state == 0 {
                finish(reason: "ended")
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
                dismissUnplayable("yt:\(code)")
            } else {
                dismissUnplayable("yt:unknown:\(code)")
            }

        default:
            break
        }
    }
}
