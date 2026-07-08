//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v3.0.0, Liquid Glass).
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
//    5. iOS 26 Liquid Glass chrome — controls float over full-bleed video
//       behind a glass header with specular highlights and motion response.
//       Falls back to dark translucent blur on iOS 15–25.
//
//  v3.1.0 — AD-AWARE END DETECTION:
//    YouTube fires onStateChange ENDED (0) when a pre-roll AD finishes, before
//    the real trailer plays. Advancing on that raw event cut every ad-backed
//    trailer off after ~15s. We now confirm a real end (playback reached the
//    video's end, or it stays ended without an ad boundary resuming playback
//    within ~1.2s) before advancing. Mirrors endDetection.js and the proxy.
//
//  v3.0.0 — LIQUID GLASS (iOS 26 HIG):
//    The header bar now uses UIGlassEffect on iOS 26+ for authentic Liquid
//    Glass material (light bending, specular highlights, device-motion
//    responsiveness). The video is full-bleed beneath the glass header.
//    A gradient fade smooths the transition from glass to content.
//    On older iOS, a dark translucent blur provides a similar but static
//    frosted look.
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
        let muted = call.getBool("muted") ?? false
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
                    self.presentTrailer(videoId: videoId, title: title, muted: muted,
                                        nextId: nextId, nextTitle: nextTitle,
                                        from: presenter, call: call)
                }
                return
            }
            self.presentTrailer(videoId: videoId, title: title, muted: muted,
                                nextId: nextId, nextTitle: nextTitle,
                                from: presenter, call: call)
        }
    }

    /// Mute / unmute the playing video in place (YouTube IFrame API command
    /// relayed through the proxy page). No-op (resolves false) if the player
    /// isn't open.
    @objc func setMuted(_ call: CAPPluginCall) {
        let muted = call.getBool("muted") ?? true
        DispatchQueue.main.async {
            guard let vc = self.presentedVC else {
                call.resolve(["applied": false, "reason": "not-open"])
                return
            }
            vc.setMuted(muted)
            call.resolve(["applied": true, "muted": muted])
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
            // Route through finish() so the pending openTrailer call resolves
            // too — dismissing the VC directly would leave that promise (and
            // its keepAlive'd CAPPluginCall) hanging forever on the JS side.
            vc.finishExternally(reason: "closed")
            call.resolve(["closed": true])
        }
    }

    private func sanitizedId(_ raw: String?) -> String? {
        guard let id = raw, !id.isEmpty else { return nil }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        if id.unicodeScalars.contains(where: { !allowed.contains($0) }) { return nil }
        return id
    }

    private func presentTrailer(videoId: String, title: String, muted: Bool,
                                nextId: String?, nextTitle: String,
                                from presenter: UIViewController, call: CAPPluginCall) {
        let vc = TrailerPlayerViewController(
            videoId: videoId,
            title: title,
            muted: muted,
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

// MARK: - Gradient fade view (glass → content transition)

/// A 32pt gradient layer that sits between the glass header and the video,
/// smoothing the edge where translucent chrome meets full-bleed content.
private class GradientFadeView: UIView {
    private let gradientLayer = CAGradientLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        gradientLayer.colors = [
            UIColor.black.withAlphaComponent(0.45).cgColor,
            UIColor.black.withAlphaComponent(0.0).cgColor,
        ]
        gradientLayer.locations = [0.0, 1.0]
        layer.addSublayer(gradientLayer)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        gradientLayer.frame = bounds
    }
}

// MARK: - View controller

class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private var videoId: String
    private var videoTitle: String
    private var isMuted: Bool
    private let onEvent: (String, [String: Any]) -> Void
    private let onDismiss: (String, String) -> Void

    // The next trailer to chain to in place. Updated by JS via enqueueNext.
    private var nextVideoId: String?
    private var nextVideoTitle: String = ""

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!
    private var titleLabel: UILabel!
    private var skipButton: UIButton!
    private var muteButton: UIButton!

    private var didFinish = false
    private var watchdogTimer: Timer?
    private var sawPlaying = false

    // Ad-aware end detection (v3.1.0). YouTube fires onStateChange ENDED (0)
    // when a pre-roll AD finishes, before the real trailer plays; advancing on
    // that raw event is the "trailers only play ~15s" bug. We confirm a real
    // end the same way the web player (endDetection.js) and proxy do: accept it
    // immediately only if playback reached the end of a plausibly-long video,
    // otherwise wait briefly — an ad boundary resumes playback (state 1/3) and
    // cancels the pending end, while a real end resumes nothing.
    private var endConfirmTimer: Timer?
    private var lastContentTime: Double = 0
    private var lastContentDuration: Double = 0
    private static let endConfirmSeconds: TimeInterval = 1.2
    private static let minContentSeconds: Double = 32
    private static let endEpsilonSeconds: Double = 1.5

    // Immersive dark theme — video fills the entire screen, Liquid Glass
    // header floats above it. Blue accents, near-white title.
    private static let stageColor = UIColor.black
    private static let accentColor = UIColor(red: 0.239, green: 0.647, blue: 0.957, alpha: 1.0) // #3DA5F4
    private static let titleColor = UIColor(red: 0.961, green: 0.961, blue: 0.961, alpha: 1.0)  // near-white

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
         muted: Bool = false,
         onEvent: @escaping (String, [String: Any]) -> Void,
         onDismiss: @escaping (String, String) -> Void) {
        self.videoId = videoId
        self.videoTitle = title
        self.isMuted = muted
        self.onEvent = onEvent
        self.onDismiss = onDismiss
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit { watchdogTimer?.invalidate(); endConfirmTimer?.invalidate() }

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
        setupGlassChrome()
        loadVideo(videoId: videoId)
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
        webView.backgroundColor = Self.stageColor
        webView.isOpaque = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = Self.stageColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // v3.0.0: Full-bleed video — pin to view.topAnchor so the video
        // extends behind the glass header. Previously pinned to
        // safeAreaLayoutGuide.topAnchor + 48 (solid black header).
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        self.webView = webView
    }

    /// v3.0.0: Glass chrome — UIGlassEffect on iOS 26+ for real Liquid Glass,
    /// UIBlurEffect(.systemChromeMaterialDark) fallback on iOS 15–25.
    /// Controls float inside the effect view's contentView so they sit
    /// within the glass material, not on top of a plain UIView.
    private func setupGlassChrome() {
        // Create the glass/blur effect view
        let effectView: UIVisualEffectView
        if #available(iOS 26.0, *) {
            let glassEffect = UIGlassEffect()
            glassEffect.isInteractive = true
            effectView = UIVisualEffectView(effect: glassEffect)
        } else {
            let blurEffect = UIBlurEffect(style: .systemChromeMaterialDark)
            effectView = UIVisualEffectView(effect: blurEffect)
        }
        effectView.translatesAutoresizingMaskIntoConstraints = false

        // Bottom corners only — the glass header sits at the top of the
        // screen so the top corners touch the display edge.
        effectView.layer.cornerRadius = 16
        effectView.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        effectView.clipsToBounds = true
        view.addSubview(effectView)

        // The contentView is where controls go — they render INSIDE the
        // glass material, not floating above it.
        let chrome = effectView.contentView

        // Done button — left side
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.setTitleColor(Self.accentColor, for: .normal)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        chrome.addSubview(doneButton)

        // Skip button — right side
        let skip = UIButton(type: .system)
        skip.setTitle("Skip ▸", for: .normal)
        skip.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        skip.setTitleColor(Self.accentColor, for: .normal)
        skip.translatesAutoresizingMaskIntoConstraints = false
        skip.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
        chrome.addSubview(skip)
        self.skipButton = skip

        // Mute toggle — to the left of Skip
        let mute = UIButton(type: .system)
        mute.setImage(UIImage(systemName: muteIconName()), for: .normal)
        mute.tintColor = Self.accentColor
        mute.translatesAutoresizingMaskIntoConstraints = false
        mute.addTarget(self, action: #selector(muteTapped), for: .touchUpInside)
        chrome.addSubview(mute)
        self.muteButton = mute

        // Title label — centered between Done and Mute
        let titleLabel = UILabel()
        titleLabel.text = videoTitle.isEmpty ? "Trailer" : videoTitle
        titleLabel.textColor = Self.titleColor
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        chrome.addSubview(titleLabel)
        self.titleLabel = titleLabel

        // Loading spinner — centered on the webView
        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = Self.accentColor
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        view.addSubview(spinner)
        self.loadingIndicator = spinner

        // Gradient fade — 32pt strip below the glass header
        let gradient = GradientFadeView()
        gradient.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(gradient)

        NSLayoutConstraint.activate([
            // Effect view: spans full width, from top of screen to
            // safe area top + 48pt (same height as the old solid header).
            effectView.topAnchor.constraint(equalTo: view.topAnchor),
            effectView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            effectView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            effectView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48),

            // Done button — bottom-left of glass chrome
            doneButton.leadingAnchor.constraint(equalTo: chrome.leadingAnchor, constant: 16),
            doneButton.bottomAnchor.constraint(equalTo: chrome.bottomAnchor, constant: -2),
            doneButton.heightAnchor.constraint(equalToConstant: 44),

            // Skip button — bottom-right of glass chrome
            skip.trailingAnchor.constraint(equalTo: chrome.trailingAnchor, constant: -16),
            skip.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
            skip.heightAnchor.constraint(equalToConstant: 44),

            // Mute button — left of Skip
            mute.trailingAnchor.constraint(equalTo: skip.leadingAnchor, constant: -10),
            mute.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
            mute.heightAnchor.constraint(equalToConstant: 44),
            mute.widthAnchor.constraint(equalToConstant: 44),

            // Title — centered between Done and Mute
            titleLabel.leadingAnchor.constraint(equalTo: doneButton.trailingAnchor, constant: 8),
            titleLabel.trailingAnchor.constraint(equalTo: mute.leadingAnchor, constant: -8),
            titleLabel.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),

            // Spinner — centered on video
            spinner.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: webView.centerYAnchor),

            // Gradient fade — 32pt strip directly below glass header
            gradient.topAnchor.constraint(equalTo: effectView.bottomAnchor),
            gradient.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            gradient.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            gradient.heightAnchor.constraint(equalToConstant: 32),
        ])
    }

    /// Load (or reload, in place) the proxy page for a given video.
    private func loadVideo(videoId: String) {
        var components = URLComponents()
        components.scheme = "https"
        components.host = Self.proxyHost
        components.path = "/embed"
        // v3.0.0: hide YouTube's own chrome so the Liquid Glass header owns the UI.
        var items = [
            URLQueryItem(name: "v", value: videoId),
            URLQueryItem(name: "controls", value: "0"),
            URLQueryItem(name: "iv_load_policy", value: "3"),
            URLQueryItem(name: "fs", value: "0"),
        ]
        if isMuted { items.append(URLQueryItem(name: "mute", value: "1")) }
        components.queryItems = items
        guard let url = components.url else {
            dismissUnplayable("invalid-url")
            return
        }

        sawPlaying = false
        resetContentProgress()
        loadingIndicator?.startAnimating()
        // Direct HTTPS navigation. The proxy page handles the YT iframe.
        webView.load(URLRequest(url: url))
        startWatchdog()
    }

    /// Watchdog: if state=PLAYING never fires within 12s, treat this video as
    /// unplayable. Real playback starts in 2-3s normally. A bad video mid-
    /// session skips to the next rather than killing the whole player.
    private func startWatchdog() {
        watchdogTimer?.invalidate()
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 12.0, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish, !self.sawPlaying else { return }
            if self.nextVideoId != nil {
                self.advanceInPlace(reason: "advanced", cause: "unplayable")
            } else {
                self.dismissUnplayable("watchdog")
            }
        }
    }

    private func resetContentProgress() {
        lastContentTime = 0
        lastContentDuration = 0
        cancelEndConfirm()
    }

    private func cancelEndConfirm() {
        endConfirmTimer?.invalidate()
        endConfirmTimer = nil
    }

    /// Decide whether a YouTube ENDED (0) is a real end or a pre-roll ad
    /// boundary. Fast path: if playback reached the end of a plausibly-long
    /// video, it's real. Otherwise wait endConfirmSeconds — an ad boundary
    /// resumes playback (state 1/3) and cancels this; a real end doesn't.
    private func handleEndCandidate() {
        if didFinish { return }
        if lastContentDuration > 0,
           lastContentTime >= lastContentDuration - Self.endEpsilonSeconds,
           lastContentTime >= Self.minContentSeconds {
            performConfirmedEnd()
            return
        }
        cancelEndConfirm()
        endConfirmTimer = Timer.scheduledTimer(withTimeInterval: Self.endConfirmSeconds, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish else { return }
            self.endConfirmTimer = nil
            self.performConfirmedEnd()
        }
    }

    /// A confirmed real end: chain to the next trailer in place if primed,
    /// else finish so JS advances + reopens (the proven fallback path).
    private func performConfirmedEnd() {
        cancelEndConfirm()
        if nextVideoId != nil {
            advanceInPlace(reason: "advanced")
        } else {
            finish(reason: "ended")
        }
    }

    /// JS/JSON numbers arrive as NSNumber; coerce to Double defensively.
    private func numberValue(_ raw: Any?) -> Double? {
        if let n = raw as? NSNumber { return n.doubleValue }
        if let d = raw as? Double { return d }
        if let i = raw as? Int { return Double(i) }
        return nil
    }

    /// Apply mute/unmute to the live YT player via the IFrame API's
    /// postMessage command channel — injected from the proxy page's own
    /// context, so it works even on proxy versions that predate trMute.
    func setMuted(_ muted: Bool) {
        isMuted = muted
        refreshMuteAffordance()
        let fn = muted ? "mute" : "unMute"
        let js = """
        (function(){try{var f=document.getElementById('yt');if(!f)return 'no';
        f.contentWindow.postMessage(JSON.stringify({event:'command',func:'\(fn)',args:[]}),'*');
        return 'ok';}catch(e){return 'err';}})()
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private func muteIconName() -> String {
        return isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"
    }

    private func refreshMuteAffordance() {
        guard let btn = muteButton else { return }
        btn.setImage(UIImage(systemName: muteIconName()), for: .normal)
    }

    /// Gapless swap (v2.9.0): ask the already-initialized proxy page to swap
    /// the video in place via window.trLoad — no page reload, ~0.5s instead of
    /// 2-3s. If the deployed proxy predates trLoad, fall back to a full reload
    /// so playback always works regardless of which proxy version is live.
    private func swapVideo(_ id: String) {
        sawPlaying = false
        resetContentProgress()
        loadingIndicator?.startAnimating()
        let js = "(typeof window.trLoad==='function' && window.trLoad('\(id)')) ? 'ok' : 'no'"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            if (result as? String) == "ok" {
                self.startWatchdog() // gapless swap; await the new PLAYING event
            } else {
                self.loadVideo(videoId: id) // older proxy → reload the URL
            }
        }
    }

    /// Chain to the queued next video without dismissing the modal. This is
    /// what makes playback continuous — no dismiss/re-present flash.
    /// `cause` tells JS *why* ("ended" | "unplayable" | "user") so it can e.g.
    /// blocklist a dead video id without interrupting the session.
    private func advanceInPlace(reason: String, cause: String = "ended") {
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
        onEvent("trailerEvent", ["event": reason, "cause": cause, "from": played, "youtubeKey": next])
        swapVideo(next)
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

    @objc private func muteTapped() {
        setMuted(!isMuted)
        // Keep the JS side's muted state in sync with the in-player toggle.
        onEvent("trailerEvent", ["event": "muteChanged", "muted": isMuted])
    }

    /// External close (plugin closeTrailer / app backgrounded). Resolves the
    /// pending openTrailer call via onDismiss like any other finish.
    func finishExternally(reason: String) {
        finish(reason: reason)
    }

    @objc private func skipTapped() {
        if nextVideoId != nil {
            advanceInPlace(reason: "skipped", cause: "user")
        } else {
            // Nothing primed — exit and let JS advance + reopen.
            finish(reason: "skip")
        }
    }

    private func finish(reason: String) {
        guard !didFinish else { return }
        didFinish = true
        watchdogTimer?.invalidate(); watchdogTimer = nil
        endConfirmTimer?.invalidate(); endConfirmTimer = nil
        let played = videoId
        DispatchQueue.main.async { [weak self] in
            self?.onDismiss(reason, played)
            self?.dismiss(animated: true)
        }
    }

    /// Safety net: if the VC disappears through any path that didn't go
    /// through finish() (OS-level dismissal, parent teardown), still resolve
    /// the pending call so the JS side never awaits a dead modal.
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if !didFinish && (isBeingDismissed || presentingViewController == nil) {
            didFinish = true
            watchdogTimer?.invalidate(); watchdogTimer = nil
            endConfirmTimer?.invalidate(); endConfirmTimer = nil
            onDismiss("closed", videoId)
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
            // The v3.1.0 proxy also sends the player's current time / duration
            // so we can tell a real end from a pre-roll ad boundary. Older
            // proxies omit these; the confirm timer covers that case.
            if let t = numberValue(body["t"]) { lastContentTime = t }
            if let d = numberValue(body["d"]), d > 0 { lastContentDuration = d }
            if state == 1 || state == 3 {
                // PLAYING or BUFFERING: playback (re)started, so any pending
                // "ended" was a pre-roll ad boundary — cancel it.
                cancelEndConfirm()
                if state == 1 {
                    // Real playback — kill watchdog so we don't dismiss a
                    // healthy long trailer, hide any loading spinner (a gapless
                    // trLoad swap fires no navigation event), and tell JS.
                    sawPlaying = true
                    watchdogTimer?.invalidate(); watchdogTimer = nil
                    loadingIndicator?.stopAnimating()
                    onEvent("trailerEvent", ["event": "started", "youtubeKey": videoId])
                }
            } else if state == 0 {
                // Trailer *or a pre-roll ad* finished. Confirm it's a real end
                // before advancing — see handleEndCandidate().
                handleEndCandidate()
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
                    advanceInPlace(reason: "advanced", cause: "unplayable")
                } else {
                    dismissUnplayable("yt:\(code)")
                }
            } else {
                if nextVideoId != nil {
                    advanceInPlace(reason: "advanced", cause: "unplayable")
                } else {
                    dismissUnplayable("yt:unknown:\(code)")
                }
            }

        default:
            break
        }
    }
}
