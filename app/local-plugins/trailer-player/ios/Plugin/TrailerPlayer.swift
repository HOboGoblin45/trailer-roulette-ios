//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v1.8.3).
//
//  This is the proven WKYTPlayerView pattern, refined per:
//
//   • YouTube's official embedded player terms documentation:
//     https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity
//     "API Clients that use the YouTube embedded player (including the
//      YouTube IFrame Player API) must provide identification through
//      the HTTP Referer request header... YouTube recommends using
//      strict-origin-when-cross-origin Referrer-Policy."
//
//   • The verbatim YTPlayerView-iframe-player.html template from
//     hmhv/YoutubePlayer-in-WKWebView (Google's iOS reference impl).
//
//  Key design choices:
//
//   1. `baseURL = https://www.youtube.com/` (not about:blank). This
//      makes WKWebView treat the loaded HTML as if served from
//      youtube.com — all sub-resource requests automatically carry
//      Referer: https://www.youtube.com/, satisfying YouTube's
//      documented requirement.
//
//   2. The HTML template loads https://www.youtube.com/iframe_api
//      (the official YouTube SDK script) and creates the player via
//      `new YT.Player()`. YouTube's own JS handles the cross-origin
//      handshake, postMessage origins, and embed protocol.
//
//   3. JS → native callbacks via the `ytplayer://` URL scheme. The
//      JS does `window.location.href = 'ytplayer://...'` (matches the
//      official template exactly). WKNavigationDelegate intercepts the
//      navigation, parses the URL, and cancels.
//
//   4. WKNavigationDelegate also acts as an allowlist for sub-resource
//      loads — only the YouTube/Google host set passes; main-frame nav
//      to youtube.com/watch (the "embed disabled, watch on YT" link)
//      is treated as the unplayable signal.
//
//   5. 10-second watchdog: if onPlaying never fires, dismiss as
//      unplayable. Real playback events kill the watchdog.
//
//   6. onError codes 2/100/101/150/152 → dismiss as unplayable. React
//      side records the bad youtubeKey and skips it for the rest of
//      the session.
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

// MARK: - Player view controller

class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private let videoId: String
    private let videoTitle: String
    private let onDismiss: (String) -> Void

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!

    private var didFinish = false
    private var watchdogTimer: Timer?

    private static let backgroundColor = UIColor(red: 0.055, green: 0.090, blue: 0.149, alpha: 1.0)
    private static let accentColor = UIColor(red: 0.831, green: 0.686, blue: 0.216, alpha: 1.0)
    private static let textColor = UIColor(red: 0.957, green: 0.957, blue: 0.949, alpha: 1.0)

    /// Hosts permitted by the WKNavigationDelegate allowlist. The set
    /// matches what the YT IFrame Player loads in practice (player JS,
    /// embed page, video CDN, fonts, ads).
    private static let allowedHosts: Set<String> = [
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
        loadPlayerHTML()
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

    /// HTML template — verbatim port of YTPlayerView-iframe-player.html
    /// from hmhv/YoutubePlayer-in-WKWebView, with the player params
    /// inlined for our single-use case.
    ///
    ///   - Uses YT.ready(...) (handles both already-loaded and loading
    ///     states correctly)
    ///   - Defines onReady / onStateChange / onPlayerError as named
    ///     globals; events config references them by string
    ///   - Callbacks fire via window.location.href = 'ytplayer://...'
    ///     (this is what WKNavigationDelegate intercepts cleanly as a
    ///     main-frame navigation; hidden-iframe tricks aren't needed)
    ///   - playerVars includes origin: 'https://www.youtube.com'
    private func playerHTML() -> String {
        return """
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>
  body { margin: 0; width: 100%; height: 100%; background-color: #000000; }
  html { width: 100%; height: 100%; background-color: #000000; }
  .embed-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .embed-container iframe,
  .embed-container object,
  .embed-container embed {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
  }
</style>
</head>
<body>
<div class="embed-container">
  <div id="player"></div>
</div>
<script src="https://www.youtube.com/iframe_api" onerror="window.location.href='ytplayer://onYouTubeIframeAPIFailedToLoad'"></script>
<script>
var player;
var error = false;

YT.ready(function () {
  player = new YT.Player('player', {
    videoId: '\(videoId)',
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      controls: 1,
      fs: 1,
      origin: 'https://www.youtube.com'
    },
    events: {
      onReady: 'onReady',
      onStateChange: 'onStateChange',
      onPlaybackQualityChange: 'onPlaybackQualityChange',
      onError: 'onPlayerError'
    }
  });
  player.setSize(window.innerWidth, window.innerHeight);
  window.location.href = 'ytplayer://onYouTubeIframeAPIReady';
});

function onReady(event) {
  window.location.href = 'ytplayer://onReady';
  try { event.target.playVideo(); } catch (e) {}
}

function onStateChange(event) {
  if (!error) {
    window.location.href = 'ytplayer://onStateChange?data=' + event.data;
  } else {
    error = false;
  }
}

function onPlaybackQualityChange(event) {
  window.location.href = 'ytplayer://onPlaybackQualityChange?data=' + event.data;
}

function onPlayerError(event) {
  if (event.data == 100) error = true;
  window.location.href = 'ytplayer://onError?data=' + event.data;
}

window.onresize = function () {
  if (player) { player.setSize(window.innerWidth, window.innerHeight); }
};
</script>
</body>
</html>
"""
    }

    private func loadPlayerHTML() {
        let html = playerHTML()
        // baseURL = https://www.youtube.com gives WKWebView a real-looking
        // origin. Sub-resource requests pick up Referer: https://www.youtube.com/
        // automatically — exactly what YouTube's embedded player terms doc
        // requires for embedder identification.
        let baseURL = URL(string: "https://www.youtube.com")
        webView.loadHTMLString(html, baseURL: baseURL)

        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish else { return }
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

        // ytplayer:// — JS→native callback channel.
        if url.scheme == "ytplayer" {
            handleCallback(url: url)
            decisionHandler(.cancel)
            return
        }

        // about:blank, data:, file: schemes are part of how WKWebView
        // bootstraps loadHTMLString; allow them.
        if url.scheme == "about" || url.scheme == "data" || url.scheme == "file" {
            decisionHandler(.allow)
            return
        }

        if let host = url.host, Self.allowedHosts.contains(host) {
            // Special case: main-frame nav to youtube.com/watch is the
            // "embed disabled, watch on YouTube" escape link. Treat as
            // unplayable.
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

    // MARK: - JS callback dispatch (ytplayer:// scheme)

    private func handleCallback(url: URL) {
        let event = url.host ?? ""
        var data: String?
        if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let q = comps.queryItems {
            data = q.first(where: { $0.name == "data" })?.value
        }
        switch event {
        case "onYouTubeIframeAPIReady":
            // SDK script loaded successfully; the YT.ready callback will
            // create the player and fire onReady next.
            break
        case "onYouTubeIframeAPIFailedToLoad":
            dismissUnplayable("api-load-failed")
        case "onReady":
            // Player constructed and play attempted. State change should
            // follow shortly with PLAYING (1).
            break
        case "onStateChange":
            // 1 = PLAYING, 0 = ENDED, 2 = PAUSED, 3 = BUFFERING
            let state = Int(data ?? "") ?? -99
            if state == 1 {
                // Real playback — kill watchdog.
                watchdogTimer?.invalidate(); watchdogTimer = nil
            } else if state == 0 {
                finish(reason: "ended")
            }
        case "onPlaybackQualityChange":
            break
        case "onError":
            let code = Int(data ?? "") ?? -1
            // 2 = invalid id, 5 = HTML5 player, 100 = not found,
            // 101 = embed disabled, 150 = same as 101, 152 = 2025 variant
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
