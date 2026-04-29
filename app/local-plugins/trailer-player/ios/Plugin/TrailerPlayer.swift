//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v1.8.2).
//
//  THIS VERSION IS A PORT of the proven WKYTPlayerView pattern.
//
//  Background: every approach that loaded a YouTube embed URL directly
//  as the WKWebView's main frame (v1.1.0 inline iframe, v1.2.0 IFrame
//  Player API, v1.5.x Vercel proxy, v1.7.x main-frame Referer trick,
//  v1.8.0/v1.8.1 nav interception) failed for at least one common case
//  because we were fighting WKWebView's request layer. The proper fix
//  is the pattern Google's youtube-ios-player-helper / BuzzFeed's
//  WKYTPlayerView library has used since 2014:
//
//    1. Load a tiny inline HTML template via `loadHTMLString:baseURL:`
//       with `baseURL = about:blank`. The HTML is the *parent* page that
//       hosts the YouTube player.
//    2. The HTML pulls in `https://www.youtube.com/iframe_api` (the
//       official YouTube SDK script) and creates the player via
//       `new YT.Player(...)`. YouTube's own client-side JS handles all
//       the cross-origin handshake, postMessage origins, and the parts
//       of the embed protocol that get tripped up when we try to be
//       clever.
//    3. JS → native callbacks travel through a custom `ytplayer://`
//       URL scheme. The WKNavigationDelegate intercepts requests with
//       that scheme, parses the path/query as event data, and cancels
//       the navigation.
//    4. The WKNavigationDelegate also acts as an allowlist for sub-
//       resource loads — anything outside the YouTube/Google domain set
//       gets cancelled (and treated as the unplayable signal when
//       it's an attempt to escape to youtube.com proper).
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

// MARK: - View controller hosting the YT IFrame Player

class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private let videoId: String
    private let videoTitle: String
    private let onDismiss: (String) -> Void

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!

    /// Once true, we've decided this trailer is unplayable and are tearing
    /// down — guards against double-dismiss.
    private var didFinish = false
    private var watchdogTimer: Timer?

    private static let backgroundColor = UIColor(red: 0.055, green: 0.090, blue: 0.149, alpha: 1.0)
    private static let accentColor = UIColor(red: 0.831, green: 0.686, blue: 0.216, alpha: 1.0)
    private static let textColor = UIColor(red: 0.957, green: 0.957, blue: 0.949, alpha: 1.0)

    /// Hosts that the YT IFrame Player + embed need to load to play a video.
    /// Any nav target outside this set is treated as either an external link
    /// (cancelled silently) or — if it's youtube.com/watch — the "embed
    /// disabled, escape to YT app" signal.
    private static let allowedHosts: Set<String> = [
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
        "youtube-nocookie.com",
        "i.ytimg.com",
        "s.ytimg.com",
        "yt3.ggpht.com",
        "fonts.gstatic.com",
        "www.gstatic.com",
        "fonts.googleapis.com",
        "play.google.com",
        "static.doubleclick.net",
        "googleads.g.doubleclick.net",
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

    /// The HTML template we load. Modeled on Google's
    /// YTPlayerView-iframe-player.html resource. Key behaviors:
    ///  - Loads the official IFrame API script from www.youtube.com.
    ///  - Creates the player via `new YT.Player('player', {...})`.
    ///  - Routes all events back to native via `ytplayer://` URL scheme.
    private func playerHTML(videoId: String) -> String {
        // %@ is replaced via String(format:) — we pre-escape the videoId
        // (already validated as alnum/-/_) and avoid any Swift string
        // interpolation that could break the HTML.
        let safeVideoId = videoId
            .replacingOccurrences(of: "\"", with: "")
            .replacingOccurrences(of: "<", with: "")

        return """
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<style>
  html, body { height: 100%; width: 100%; margin: 0; padding: 0; background: #000; overflow: hidden; }
  #player { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
  var player = null;
  var didReportPlaying = false;

  function postEvent(name, data) {
    // Use a hidden iframe to fire a request to our custom scheme. This
    // is the WKYTPlayerView pattern — WKNavigationDelegate intercepts
    // the request, decodes the event, and cancels the navigation. We
    // briefly insert + remove the iframe to avoid leaking DOM.
    try {
      var url = 'ytplayer://' + name;
      if (data !== undefined && data !== null) {
        url += '?data=' + encodeURIComponent(String(data));
      }
      var f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = url;
      document.body.appendChild(f);
      setTimeout(function () { try { f.remove(); } catch(e){} }, 200);
    } catch (e) { /* noop */ }
  }

  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      videoId: '\(safeVideoId)',
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 1,
        fs: 1
      },
      events: {
        onReady: function (e) {
          postEvent('onReady');
          try { e.target.playVideo(); } catch (err) {}
        },
        onStateChange: function (e) {
          // 1 = PLAYING, 0 = ENDED. Track first PLAYING for watchdog.
          if (e.data === 1 && !didReportPlaying) {
            didReportPlaying = true;
            postEvent('onPlaying');
          }
          if (e.data === 0) postEvent('onEnded');
        },
        onError: function (e) {
          // 2 / 100 / 101 / 150: unplayable; report and let native dismiss.
          postEvent('onError', e.data);
        }
      }
    });
  }

  // Nudge the API loader if the script gets cached without the global.
  setTimeout(function () {
    if (!player && typeof YT === 'undefined') {
      postEvent('onError', -1);
    }
  }, 6000);
</script>
</body>
</html>
"""
    }

    private func loadPlayerHTML() {
        let html = playerHTML(videoId: videoId)
        // baseURL = about:blank is what WKYTPlayerView uses by default.
        // The IFrame API and the embed handshake work with this — YouTube's
        // own SDK scripts handle origin/referrer correctly.
        let baseURL = URL(string: "about:blank")
        webView.loadHTMLString(html, baseURL: baseURL)

        // Watchdog: if onPlaying never fires within 10s, assume embed is
        // dead and dismiss as unplayable. Real playback kills this.
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

        // ytplayer:// — our custom JS→native callback channel.
        if url.scheme == "ytplayer" {
            handleCallback(url: url)
            decisionHandler(.cancel)
            return
        }

        // about:blank for the initial loadHTMLString → allow.
        if url.absoluteString == "about:blank" || url.scheme == "about" || url.scheme == "data" {
            decisionHandler(.allow)
            return
        }

        // YouTube + Google sub-resources for the IFrame Player + the
        // embed page: allow.
        if let host = url.host, Self.allowedHosts.contains(host) {
            // Special case: a main-frame nav to youtube.com/watch is the
            // "embed disabled, watch on YT" escape link. Treat as
            // unplayable + dismiss.
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
        // Block popup/window.open attempts. If a YT link tries to open a
        // new window, treat it as the escape signal.
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
        case "onReady":
            // Spinner already cleared by didFinish navigation; nothing more.
            break
        case "onPlaying":
            // Real playback started — kill the watchdog.
            watchdogTimer?.invalidate(); watchdogTimer = nil
        case "onEnded":
            finish(reason: "ended")
        case "onError":
            let code = Int(data ?? "") ?? -1
            // 2=invalid id, 100=not found, 101/150=embed disabled, 152=variant
            if [2, 100, 101, 150, 152].contains(code) {
                dismissUnplayable("yt:\(code)")
            } else if code == -1 {
                dismissUnplayable("api-not-loaded")
            } else {
                // Unknown code → still dismiss so user isn't stuck.
                dismissUnplayable("yt:\(code)")
            }
        default:
            break
        }
    }
}
