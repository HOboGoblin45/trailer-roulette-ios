//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v1.8.1).
//
//  v1.7.0 introduced the in-app modal WKWebView with Referer header on the
//  main-frame URLRequest. v1.7.1 added postMessage-based error detection.
//  v1.8.1 fixes a real-world failure mode Charlie hit:
//
//    - YouTube refuses to embed Trailer X (modern studio upload, common).
//    - The embed page renders YT's "Watch video on YouTube" error UI.
//    - postMessage error events DON'T fire because the embed is the main
//      document — there's no parent window for the IFrame API to message.
//    - User taps "Watch on YouTube" link → WKWebView attempts to navigate
//      to https://www.youtube.com/watch?v=ID, which iOS may resolve as a
//      universal link to the YouTube app, sending the user out of Trailer
//      Roulette.
//
//  Fix in this version:
//    1. WKNavigationDelegate's decidePolicyFor intercepts ANY navigation
//       away from the original embed URL (anything that isn't the embed
//       itself or its same-origin sub-resources). That means: tapping
//       "Watch on YouTube," tapping the YouTube logo, any external link
//       attempt — all get treated as the "unplayable" signal. We cancel
//       the navigation, dismiss the modal with reason=unplayable:nav, and
//       the React side marks the key bad and advances the queue.
//    2. DOM polling: every 800ms we evaluate JS that checks for YT's error
//       container (.ytp-error or the "Watch on YouTube" link). If found,
//       same dismiss path.
//    3. Watchdog: if the embed page hasn't reached a playing state within
//       8s of load completion, we assume it's stuck (rare) and dismiss.
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

    // MARK: - Private

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
    private var initialURL: URL!

    /// Once true, we've decided this trailer is unplayable and are tearing
    /// down — guards against double-dismiss from multiple detectors firing
    /// in close succession (nav delegate + DOM poll + watchdog).
    private var didFinishUnplayable = false

    private var domPollTimer: Timer?
    private var watchdogTimer: Timer?

    private static let backgroundColor = UIColor(red: 0.055, green: 0.090, blue: 0.149, alpha: 1.0) // #0E1726
    private static let accentColor = UIColor(red: 0.831, green: 0.686, blue: 0.216, alpha: 1.0)     // #D4AF37
    private static let textColor = UIColor(red: 0.957, green: 0.957, blue: 0.949, alpha: 1.0)       // #F4F4F2

    init(videoId: String, title: String, onDismiss: @escaping (String) -> Void) {
        self.videoId = videoId
        self.videoTitle = title
        self.onDismiss = onDismiss
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit {
        domPollTimer?.invalidate()
        watchdogTimer?.invalidate()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.backgroundColor
        setupWebView()
        setupChrome()
        loadTrailer()
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

    private func loadTrailer() {
        let urlString = "https://www.youtube-nocookie.com/embed/\(videoId)" +
                        "?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&enablejsapi=1"
        guard let url = URL(string: urlString) else {
            self.dismissUnplayable("invalid-url")
            return
        }
        self.initialURL = url

        var request = URLRequest(url: url)
        request.setValue("https://www.youtube.com/", forHTTPHeaderField: "Referer")
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        webView.load(request)

        // Watchdog: if we don't see playback within 8 seconds, give up.
        // Most embeddable trailers reach playing state within 1–2s; the
        // common failure mode (embed disabled) doesn't reach it at all.
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 8.0, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinishUnplayable else { return }
            self.dismissUnplayable("watchdog")
        }
    }

    @objc private func doneTapped() {
        invalidateTimers()
        onDismiss("user")
        dismiss(animated: true)
    }

    private func dismissUnplayable(_ subreason: String) {
        guard !didFinishUnplayable else { return }
        didFinishUnplayable = true
        invalidateTimers()
        let reason = "unplayable:\(subreason)"
        DispatchQueue.main.async { [weak self] in
            self?.onDismiss(reason)
            self?.dismiss(animated: true)
        }
    }

    private func invalidateTimers() {
        domPollTimer?.invalidate(); domPollTimer = nil
        watchdogTimer?.invalidate(); watchdogTimer = nil
    }

    // MARK: - WKNavigationDelegate

    /// Decide whether to allow each navigation. The MAIN trick of v1.8.1:
    /// if the WKWebView tries to navigate ANYWHERE except the original
    /// embed URL or its same-origin assets (youtube-nocookie.com), we
    /// treat that as the user-bouncing-to-YouTube signal — cancel and
    /// dismiss as unplayable.
    public func webView(_ webView: WKWebView,
                        decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let initial = initialURL else {
            decisionHandler(.allow)
            return
        }
        let host = url.host ?? ""

        // Always allow the very first main-frame request (the embed URL itself).
        if navigationAction.targetFrame?.isMainFrame == true && url == initial {
            decisionHandler(.allow)
            return
        }

        // youtube-nocookie sub-resources (CSS, JS, video stream) are fine —
        // those load same-origin from the embed page, the player works.
        if host == "www.youtube-nocookie.com" || host == "youtube-nocookie.com" ||
           host.hasSuffix(".googlevideo.com") || host.hasSuffix(".ytimg.com") ||
           host == "fonts.gstatic.com" || host == "www.gstatic.com" {
            decisionHandler(.allow)
            return
        }

        // youtube.com/watch (the "watch on YouTube" escape link) and any
        // other youtube.com / youtu.be navigation that's a main-frame
        // request → bounce to YT detected. Cancel + dismiss.
        let path = url.path
        let isMain = navigationAction.targetFrame?.isMainFrame ?? false
        if isMain &&
           (host.hasSuffix("youtube.com") || host == "youtu.be") &&
           (path.contains("/watch") || path == "/" || path.hasPrefix("/playlist") || path.hasPrefix("/channel") || path.hasPrefix("/@")) {
            decisionHandler(.cancel)
            dismissUnplayable("escape-to-youtube")
            return
        }

        // Any other external link (App Store, Twitter share, etc.): cancel
        // to keep the user inside our modal. Don't auto-dismiss because the
        // embed itself is still working — the user just clicked a sub-link.
        if isMain && host != "" && host != initial.host {
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimating()
        startDomPolling()

        // Inject the listening script for the postMessage path. It still
        // works as a fallback in some contexts even though the embed-as-
        // main-doc case is the common one.
        let listen = """
        (function() {
          window.addEventListener('message', function(e) {
            try {
              var data = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
              if (!data) return;
              if (data.event === 'onStateChange' && data.info === 0) {
                window.webkit.messageHandlers.trailerEvent.postMessage({ kind: 'ended' });
              }
              if (data.event === 'onStateChange' && data.info === 1) {
                window.webkit.messageHandlers.trailerEvent.postMessage({ kind: 'playing' });
              }
              if (data.event === 'onError') {
                window.webkit.messageHandlers.trailerEvent.postMessage({ kind: 'error', code: data.info });
              }
            } catch (err) {}
          });
          var p = function() {
            try { window.postMessage({ event: 'listening', id: '\(videoId)', channel: 'widget' }, '*'); } catch(e) {}
          };
          p(); setTimeout(p, 500); setTimeout(p, 1500);
        })();
        """
        webView.evaluateJavaScript(listen, completionHandler: nil)
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadingIndicator.stopAnimating()
        let nsErr = error as NSError
        // Not-connected / network-down / SSL: dismiss as unplayable so the
        // queue advances rather than parking on a blank screen.
        if nsErr.code == NSURLErrorNotConnectedToInternet ||
           nsErr.code == NSURLErrorTimedOut ||
           nsErr.code == NSURLErrorCannotConnectToHost {
            dismissUnplayable("network:\(nsErr.code)")
        }
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadingIndicator.stopAnimating()
        let nsErr = error as NSError
        if nsErr.code == NSURLErrorCancelled { return } // our cancel(), not a real failure
        dismissUnplayable("provisional:\(nsErr.code)")
    }

    // MARK: - WKUIDelegate (block popup-style window opens)

    public func webView(_ webView: WKWebView,
                        createWebViewWith configuration: WKWebViewConfiguration,
                        for navigationAction: WKNavigationAction,
                        windowFeatures: WKWindowFeatures) -> WKWebView? {
        // The embed sometimes tries to open links in a new window (target=
        // _blank or window.open). Same intent as a youtube.com nav —
        // treat as escape signal.
        if let url = navigationAction.request.url,
           let host = url.host,
           host.hasSuffix("youtube.com") || host == "youtu.be" {
            dismissUnplayable("popup-to-youtube")
        }
        return nil
    }

    // MARK: - DOM polling for the YT error UI

    private func startDomPolling() {
        domPollTimer?.invalidate()
        domPollTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            self?.pollForError()
        }
    }

    private func pollForError() {
        // Look for: YT error container, "Watch on YouTube" link, or the
        // text "Video unavailable". Any positive hit → unplayable.
        let probe = """
        (function(){
          var sel = ['.ytp-error', '.ytp-error-content', '[class*="ytp-error"]'];
          for (var i = 0; i < sel.length; i++) {
            if (document.querySelector(sel[i])) return 'ytp-error';
          }
          var links = document.querySelectorAll('a');
          for (var j = 0; j < links.length; j++) {
            var href = (links[j].href || '').toLowerCase();
            if (href.indexOf('youtube.com/watch') >= 0) return 'watch-link';
          }
          var body = (document.body && document.body.innerText) || '';
          if (body.indexOf('Watch on YouTube') >= 0 ||
              body.indexOf('Video unavailable') >= 0 ||
              body.indexOf('Video player configuration error') >= 0) {
            return 'error-text';
          }
          return null;
        })();
        """
        webView.evaluateJavaScript(probe) { [weak self] result, _ in
            guard let self = self, !self.didFinishUnplayable else { return }
            if let hit = result as? String, !hit.isEmpty {
                self.dismissUnplayable("dom:\(hit)")
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "trailerEvent",
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }
        switch kind {
        case "playing":
            // We saw a real playback event — kill the watchdog so we
            // don't wrongly dismiss a slow-starting trailer.
            watchdogTimer?.invalidate(); watchdogTimer = nil
        case "ended":
            invalidateTimers()
            DispatchQueue.main.async { [weak self] in
                self?.onDismiss("ended")
                self?.dismiss(animated: true)
            }
        case "error":
            let code = body["code"] as? Int ?? -1
            if [2, 100, 101, 150, 152].contains(code) {
                dismissUnplayable("yt:\(code)")
            }
        default:
            break
        }
    }
}
