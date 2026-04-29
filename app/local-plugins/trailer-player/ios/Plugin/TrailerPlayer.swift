//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v1.7.0).
//
//  Why a custom WKWebView modal instead of SFSafariViewController:
//
//  Charlie's UX feedback after v1.6.0: SFSafariViewController works
//  technically but it shows Safari's URL bar and feels like leaving the
//  app. We need real in-app playback — branded chrome, no URL bar, a
//  fullscreen video that looks like part of Trailer Roulette.
//
//  The trick that makes this work where v1.1.0–v1.5.1 failed:
//
//  WebKit Bug 169846 strips the HTTP Referer header on cross-origin
//  iframe loads inside the *main app's* WKWebView. The bug does NOT
//  fire for the MAIN-FRAME request of a fresh WKWebView when we set
//  the Referer ourselves on the URLRequest. So the recipe is:
//
//    1. Create a dedicated WKWebView inside our own modal VC.
//    2. Build a URLRequest pointing directly at youtube.com/embed/ID.
//    3. setValue("https://www.youtube.com/", forHTTPHeaderField: "Referer")
//    4. webView.load(request) — Referer survives the navigation.
//    5. YouTube accepts the embed (referer is valid public-DNS https),
//       the embed page becomes the main document, and all its same-
//       origin sub-resources work normally.
//
//  No SFSafariViewController, no @capacitor/browser, no proxy page.
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

            // Replace any open trailer modal with the new one.
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

/// Modal view controller that hosts the WKWebView. App-themed chrome
/// (no Safari URL bar). Tapping Done dismisses; the trailer is loaded
/// directly from youtube.com/embed/ as the main frame with a proper
/// Referer header, sidestepping WebKit Bug 169846.
class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private let videoId: String
    private let videoTitle: String
    private let onDismiss: (String) -> Void

    private var webView: WKWebView!
    private var loadingIndicator: UIActivityIndicatorView!

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
        // Allow inline media playback (iOS would otherwise force fullscreen).
        config.allowsInlineMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []   // permit autoplay
        config.allowsPictureInPictureMediaPlayback = true

        // Inject a JS bridge so YT IFrame Player events bubble to native:
        // - 'ended' → resolve dismissal so the React side advances queue
        // - 'error' → log + resolve so user isn't stuck on a broken trailer
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
        // Done button (top-right) — Apple HIG navigation pattern.
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.setTitleColor(Self.accentColor, for: .normal)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        view.addSubview(doneButton)

        // Title centered between safe-area top and the player area.
        let titleLabel = UILabel()
        titleLabel.text = videoTitle.isEmpty ? "Trailer" : videoTitle
        titleLabel.textColor = Self.textColor
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // Loading indicator while iframe boots.
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
        // youtube-nocookie is the embed-friendly variant; same network
        // path as youtube.com/embed but doesn't drop tracking cookies.
        let urlString = "https://www.youtube-nocookie.com/embed/\(videoId)" +
                        "?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&enablejsapi=1"
        guard let url = URL(string: urlString) else {
            self.onDismiss("invalid-url")
            self.dismiss(animated: true)
            return
        }

        // The KEY insight: setting Referer on a URLRequest survives the
        // main-frame load. WebKit Bug 169846 only strips referers on
        // cross-origin sub-resource iframe loads, not main-frame requests.
        var request = URLRequest(url: url)
        request.setValue("https://www.youtube.com/", forHTTPHeaderField: "Referer")
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )

        webView.load(request)
    }

    @objc private func doneTapped() {
        onDismiss("user")
        dismiss(animated: true)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimating()

        // Wire up onStateChange detection by injecting a tiny script that
        // listens to the YT IFrame Player and posts to the native bridge.
        // We can't bind to the YT Player object directly because it's
        // inside the embed's own document, but the embed page exposes
        // window.postMessage for state changes when enablejsapi=1.
        let script = """
        (function() {
          window.addEventListener('message', function(e) {
            try {
              var data = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
              if (data && data.event === 'onStateChange' && data.info === 0) {
                // 0 = ENDED
                window.webkit.messageHandlers.trailerEvent.postMessage({ kind: 'ended' });
              }
              if (data && data.event === 'onError') {
                window.webkit.messageHandlers.trailerEvent.postMessage({ kind: 'error', code: data.info });
              }
            } catch (err) { /* noop */ }
          });
          // Tell the YT player we're listening.
          var iframe = document.querySelector('iframe') || (window.location.pathname.indexOf('/embed/') >= 0 ? null : null);
          // The embed *is* the document — register listener directly.
          var p = function() {
            try {
              window.postMessage({ event: 'listening', id: '\(videoId)', channel: 'widget' }, '*');
            } catch (err) {}
          };
          p(); setTimeout(p, 500); setTimeout(p, 1500);
        })();
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadingIndicator.stopAnimating()
        // Still render whatever loaded; don't auto-dismiss on transient errors.
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "trailerEvent",
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }
        switch kind {
        case "ended":
            DispatchQueue.main.async { [weak self] in
                self?.onDismiss("ended")
                self?.dismiss(animated: true)
            }
        case "error":
            // Surface error code to console; don't auto-dismiss — user
            // may still want to interact with whatever YT rendered.
            print("[TrailerPlayer] YT player error: \(body["code"] ?? "unknown")")
        default:
            break
        }
    }
}
