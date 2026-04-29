//
//  TrailerPlayer.swift
//  Trailer Roulette — YouTube playback via SFSafariViewController.
//
//  Why a local plugin instead of @capacitor/browser:
//
//  1. WKWebView strips the HTTP Referer header on cross-origin iframe
//     loads (WebKit Bug 169846). YouTube's July 2025 update made that
//     header mandatory, so EVERY in-WKWebView iframe approach we tried
//     (v1.1.0 through v1.5.1) fails with "Error 153 Video player
//     configuration error" no matter how we configure the embed.
//
//  2. SFSafariViewController is a real Safari context — not WKWebView.
//     YouTube treats it like any other Safari tab and plays without
//     complaint. Apple's HIG explicitly recommends SFSafariViewController
//     for displaying third-party web content.
//
//  3. We can't use @capacitor/browser because in scene-based apps
//     (which Capacitor 6 uses on iOS 13+), Browser.open with
//     presentationStyle: 'fullscreen' silently fails. The view
//     controller is presented onto a UIWindow that's not in the view
//     hierarchy — see ionic-team/capacitor#5969. The fix involves
//     resolving the active scene's keyWindow, which @capacitor/browser
//     doesn't do correctly on the version we're pinned to. By writing
//     our own, we control that resolution path.
//

import Foundation
import SafariServices
import Capacitor

@objc(TrailerPlayer)
public class TrailerPlayer: CAPPlugin, SFSafariViewControllerDelegate {

    /// The currently-presented SFSafariViewController, retained so we can
    /// dismiss it programmatically (e.g. when the React side wants to
    /// pause playback because the app was backgrounded).
    private weak var presentedSafari: SFSafariViewController?

    /// The pending JS call we'll resolve when Safari is dismissed. Only
    /// one trailer can be open at a time.
    private var pendingCall: CAPPluginCall?

    @objc func openTrailer(_ call: CAPPluginCall) {
        guard let videoId = call.getString("youtubeKey"), !videoId.isEmpty else {
            call.reject("Missing youtubeKey")
            return
        }

        // Validate roughly — YouTube IDs are alnum/-/_ and 6-20 chars in
        // practice. Bail out on anything obviously malformed so we don't
        // launch Safari to an error page.
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        if videoId.unicodeScalars.contains(where: { !allowed.contains($0) }) {
            call.reject("Invalid youtubeKey")
            return
        }

        guard let url = URL(string: "https://www.youtube.com/watch?v=\(videoId)") else {
            call.reject("Couldn't build URL")
            return
        }

        DispatchQueue.main.async {
            // Resolve the presenting view controller via the active scene.
            // Going through self.bridge?.viewController fails in some scene
            // configurations (the bridge VC is on a UIWindow that's not in
            // the active hierarchy). Resolving via UIWindowScene is the
            // pattern that works on iOS 13+ universally.
            guard let presenter = self.resolvePresenter() else {
                call.reject("No presenter (no active scene/window)")
                return
            }

            // If we already have a Safari modal up, reuse the call slot —
            // dismiss the old one and open the new URL. Resolving the old
            // call as cancelled keeps JS-side state honest.
            if let existing = self.presentedSafari {
                existing.dismiss(animated: true) {
                    self.pendingCall?.resolve(["dismissed": true, "reason": "replaced"])
                    self.pendingCall = nil
                    self.presentSafari(url: url, from: presenter, call: call)
                }
                return
            }
            self.presentSafari(url: url, from: presenter, call: call)
        }
    }

    @objc func closeTrailer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let safari = self.presentedSafari else {
                call.resolve(["closed": false, "reason": "not-open"])
                return
            }
            safari.dismiss(animated: true) {
                // safariViewControllerDidFinish will resolve pendingCall
                // and clear state; this call just confirms close was issued.
                call.resolve(["closed": true])
            }
        }
    }

    // MARK: - SFSafariViewControllerDelegate

    public func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        // User dismissed by tapping Done. Resolve pending JS call so the
        // React side can advance to the next trailer.
        DispatchQueue.main.async {
            self.pendingCall?.resolve(["dismissed": true, "reason": "user"])
            self.pendingCall = nil
            self.presentedSafari = nil
        }
    }

    // MARK: - Private helpers

    private func presentSafari(url: URL, from presenter: UIViewController, call: CAPPluginCall) {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        config.barCollapsingEnabled = false

        let safari = SFSafariViewController(url: url, configuration: config)
        safari.delegate = self
        safari.dismissButtonStyle = .done
        // Default presentation style — NOT .fullScreen, which is what
        // triggers the "Unbalanced calls to begin/end appearance
        // transitions" + silent-fail bug in scene-based apps. Default
        // (.automatic → .pageSheet on iPad, .fullScreen on iPhone) works
        // because UIKit picks the right path internally.
        safari.modalPresentationStyle = .automatic

        // Apple gold accent on the Safari toolbar to match the app brand.
        safari.preferredBarTintColor = UIColor(red: 0.06, green: 0.09, blue: 0.15, alpha: 1.0) // dark navy
        safari.preferredControlTintColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 1.0) // gold

        self.presentedSafari = safari
        self.pendingCall = call

        presenter.present(safari, animated: true, completion: nil)
        call.keepAlive = true
    }

    /// Find a view controller capable of presenting a modal in the
    /// currently-active window scene. Falls back to the bridge VC.
    private func resolvePresenter() -> UIViewController? {
        // Prefer the currently-foregrounded scene's keyWindow — this is
        // the path that survives multiwindow/multitasking on iPad and
        // the SceneDelegate pattern Capacitor uses on iOS 13+.
        let activeScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }

        for scene in activeScenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first,
               let root = window.rootViewController {
                // Walk up to the topmost presented controller so we don't
                // try to present-on-top of an already-presenting VC.
                var top: UIViewController = root
                while let presented = top.presentedViewController {
                    top = presented
                }
                return top
            }
        }

        // Fallback: Capacitor's bridge VC, in case scenes haven't fully
        // activated yet (rare; mostly during cold launch).
        return self.bridge?.viewController
    }
}
