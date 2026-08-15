//
//  TrailerPlayer.swift
//  Trailer Roulette — in-app YouTube playback (v3.2.0, ad-hardened).
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
//       onError — and since v3.2.0 a 1s heartbeat ('hb') plus pinned
//       content metadata ('meta').
//    5. iOS 26 Liquid Glass chrome — controls float over full-bleed video
//       behind a glass header with specular highlights and motion response.
//       Falls back to dark translucent blur on iOS 15–25.
//
//  v3.2.0 — AD-HARDENED WATCHDOG + END DETECTION (the "~13 seconds" fix):
//    The v3.1.0 watchdog skipped a video as unplayable when no PLAYING (1)
//    arrived within 12s. But several pre-roll ad variants keep the CONTENT
//    player in UNSTARTED while the ad runs — no PLAYING fires until the ad
//    finishes. Result: every trailer whose ad ran past ~12s was skipped at
//    ~13s (12s watchdog + ~1s load), which was the "trailers stop after about
//    13 seconds" regression. The watchdog is now LIVENESS-based, not
//    PLAYING-based:
//      - dead page  (no proxy messages at all within 12s)        -> skip
//      - dead player (page alive but YT never spoke within 20s)  -> skip
//      - hard cap   (no content playback within 75s)             -> skip
//    A live page serving a long ad keeps sending heartbeats, so it is never
//    mistaken for a dead video. Errors still skip instantly via 'error'.
//
//    End detection is hardened the same way as endDetection.js: the resume-
//    confirm window is 5s until content playback is CONFIRMED (>= 3s observed
//    forward progress whose duration matches the pinned content metadata),
//    then 1.2s; and the "reached the end" fast-path additionally requires the
//    confirmation + pin match, so a >= 32s ad ending at its own duration can
//    no longer fake a real end. All of it degrades gracefully against an
//    un-redeployed (v3.1.0) proxy — no heartbeats simply means the liveness
//    rules fall back to ready/stateChange traffic and the hard cap.
//
//  v3.2.1 — CORRECTIONS TO THE ABOVE:
//    v3.2.0 fixed the watchdog but left two paths still waiting on state
//    events, in a bug whose defining symptom is that state events do not fire:
//      - The end-confirm timer was cancelled only by a stateChange 1/3. When
//        the next ad in a pod (or the trailer itself) started silently, nothing
//        cancelled it, so the timer fired and the trailer was skipped a few
//        seconds in. Forward progress from 'hb'/'stateChange' samples now
//        cancels it too. A genuinely ended video cannot: its currentTime stops
//        advancing, which progressEpsilonSeconds tests for.
//      - contentConfirmedNow() accepted an unpinned clip past 32s, so a long
//        unskippable ad confirmed as content — shortening the confirm window
//        below a typical ad-pod gap and unlocking the fast-path at the AD's
//        end. Confirmation and the fast-path now both require a pin.
//    The proxy also now synthesises a stateChange:1 (marked syn:true) as soon
//    as playback demonstrably advances, because that is the only liveness
//    signal builds older than v3.2.0 understand. We honour it as liveness and
//    cancel any pending end, but do NOT let it retire the watchdog — our own
//    heartbeat-based rules are better, and keeping the 75s hard cap armed
//    means a page that goes silent mid-ad still recovers.
//
//  v3.2.2 — PLAYER FEEL (make it read as a first-class Apple video player):
//    Six presentation-only changes. End detection, the liveness watchdog and
//    the proxy handshake are byte-for-byte unchanged in behaviour; the new code
//    only READS their state (lastContentTime / lastContentDuration /
//    contentConfirmedNow()) and adds UI calls alongside them.
//      1. Poster backdrop instead of black. The modal used to present onto pure
//         black with a lone spinner for the 2-3s the proxy page takes to load —
//         seconds after the user was looking at this exact movie's artwork
//         full-bleed on the roulette stage. It read as the app crashing to
//         black. openTrailer now accepts an optional posterUrl, blurred and
//         dimmed OVER the webView (the black being covered is the proxy page's
//         own opaque body, so a backdrop underneath would achieve nothing) and
//         dissolved away the instant anything plays. Absent posterUrl = the old
//         black stage exactly, so this can never make things worse.
//         IMPORTANT: it retires on the first observed playback of ANY kind,
//         including a pre-roll ad, for YouTube policy reasons. Do not "improve"
//         that; markStageLive() explains, and there is a timer backstop.
//      2. Cross-dissolve in, interactive swipe-down out, presented
//         .overFullScreen so the roulette stage stays rendered behind the
//         player and the drag reveals the artwork instead of window black. The
//         user is already looking at this movie's artwork, so dissolving into
//         the trailer is continuous where a sheet sliding up over it was a
//         context switch. Swipe-down is what every first-party full-screen iOS
//         video player does; before this, Done was the only way out.
//      3. Auto-hiding chrome (3s idle). The glass header used to sit on the
//         video forever. SAFETY RULE, enforced in three places: the chrome can
//         never be both invisible AND the only exit — it stays pinned while the
//         spinner is up, it is made non-interactive while hidden so a blind tap
//         restores it instead of landing on Done, and the swipe-down works
//         whether or not the chrome is on screen.
//      4. A progress line along the bottom edge of the glass, driven by the
//         heartbeat's t/d — gated on contentConfirmedNow() so a pre-roll ad's
//         clock can never drive it, and reset on every load/swap.
//      5. Title cross-fade + haptics. Chaining used to snap the title text and
//         was completely silent to the hand.
//      6. Chrome polish. Skip is an SF Symbol matching the mute glyph (it was
//         the text "Skip ▸"), the faked alpha-0.55 "disabled" look is gone,
//         every control has a 44x44 target and an accessibility label.
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
public class TrailerPlayer: CAPPlugin, CAPBridgedPlugin {
    // CAPACITOR 6+ REGISTRATION (v3.4.1). This class subclassed CAPPlugin alone,
    // which is the Capacitor 5 shape. Capacitor 6 removed automatic plugin
    // registration: the bridge only binds classes conforming to CAPBridgedPlugin
    // (see CapacitorBridge.swift, `typealias CapacitorPlugin = CAPPlugin &
    // CAPBridgedPlugin`, and its "Plugin must conform to CAPBridgedPlugin" log).
    // Without it the plugin is invisible to JS, registerPlugin() silently resolves
    // to the web fallback, and every native feature in this file never runs — with
    // no error anywhere, because falling back is what registerPlugin is designed
    // to do. That is exactly what happened: a full day of native work on the
    // player had no effect on the device, because none of it was ever reachable.

    public let identifier = "TrailerPlayer"
    public let jsName = "TrailerPlayer"          // must match registerPlugin('TrailerPlayer')
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openTrailer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enqueueNext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeTrailer", returnType: CAPPluginReturnPromise),
    ]


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
        // v3.2.2: optional artwork (TMDB backdrop or poster) for the loading
        // stage. Strictly optional — a missing/empty/unusable value leaves the
        // black stage we had before, so an un-updated JS caller changes nothing.
        let posterUrl = call.getString("posterUrl")
        // v3.4.0: the queue, so YouTube's own player can sequence it. See
        // applyPlaylist(). Sanitised the same way as any other id; anything
        // malformed is dropped rather than poisoning the list.
        let playlist = (call.getArray("playlist") as? [String] ?? []).compactMap { self.sanitizedId($0) }
        let playlistTitles = call.getArray("playlistTitles") as? [String] ?? []

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
                                        posterUrl: posterUrl,
                                        from: presenter, call: call)
                }
                return
            }
            self.presentTrailer(videoId: videoId, title: title, muted: muted,
                                nextId: nextId, nextTitle: nextTitle,
                                posterUrl: posterUrl,
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
                                posterUrl: String?,
                                playlist: [String] = [], playlistTitles: [String] = [],
                                from presenter: UIViewController, call: CAPPluginCall) {
        let vc = TrailerPlayerViewController(
            videoId: videoId,
            title: title,
            muted: muted,
            posterUrl: posterUrl,
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
        vc.setPlaylist(playlist, titles: playlistTitles)
        // v3.2.2: .overFullScreen, not .fullScreen. UIKit tears the presenting
        // view controller's view out of the hierarchy for a .fullScreen
        // presentation, so the interactive swipe-down (A2) dragged the player
        // over flat window black — the gesture felt like it was uncovering a
        // void instead of putting the trailer back down on the roulette stage
        // it came from. .overFullScreen keeps that stage rendered underneath.
        // The player's own root view and webView are opaque near-black, so
        // nothing shows through at rest; the stage is revealed only by the
        // drag's translation and alpha.
        vc.modalPresentationStyle = .overFullScreen
        // v3.2.2: dissolve, not a sheet sliding up. The screen behind this is
        // the roulette stage showing THIS movie's artwork full-bleed, and the
        // player's own loading stage is now that same artwork (A1) — a
        // cross-dissolve reads as the artwork resolving into the trailer,
        // whereas coverVertical read as a modal interrupting it. Paired with
        // the interactive swipe-down dismissal in TrailerPlayerViewController.
        vc.modalTransitionStyle = .crossDissolve
        // Required consequence of .overFullScreen: UIKit only hands status bar
        // control to a presented VC automatically when the style is
        // .fullScreen. Without this, TrailerPlayerViewController's
        // prefersStatusBarHidden = true would be ignored and the status bar
        // would reappear over the video — a regression introduced purely by the
        // presentation style change above.
        vc.modalPresentationCapturesStatusBarAppearance = true

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

class TrailerPlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate,
                                   WKScriptMessageHandler, UIGestureRecognizerDelegate {

    private var videoId: String
    private var videoTitle: String
    private var isMuted: Bool
    /// v3.2.2: artwork for the loading stage (A1). nil / empty = black stage.
    private let posterUrl: String?
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

    // v3.2.2 UI state. All of it is presentation only — nothing here is read by
    // end detection or the watchdog.
    /// The glass header. Held so the auto-hide can fade it, and so the
    /// swipe-down gesture can refuse to start on top of its buttons.
    private var chromeEffectView: UIVisualEffectView!
    private var gradientFadeView: GradientFadeView!
    /// The blurred/dimmed poster stage that replaces the 2-3s of pure black.
    private var backdropContainer: UIView!
    private var backdropImageView: UIImageView!
    private var backdropTask: URLSessionDataTask?
    /// Drops the backdrop even if no playback signal ever arrives. The backdrop
    /// sits ABOVE the webView, so this is a YouTube policy backstop, not a
    /// nicety — see markStageLive() / startBackdropSafetyTimer().
    private var backdropSafetyTimer: Timer?
    /// Set once playback has demonstrably happened; retires the backdrop for
    /// the rest of the session (in-place chaining is ~0.5s and the webView
    /// keeps painting through it, so a second poster stage would be a flash).
    private var stageIsLive = false
    /// Progress line. `progressFraction` is kept in points-independent form so
    /// viewDidLayoutSubviews can re-derive the fill width across rotation.
    private var progressTrack: UIView!
    private var progressFill: UIView!
    private var progressFillWidth: NSLayoutConstraint!
    private var progressFraction: CGFloat = 0
    /// True once contentConfirmedNow() has said the clock belongs to the
    /// trailer rather than to a pre-roll ad.
    private var progressRevealed = false
    private var chromeVisible = true
    private var chromeHideTimer: Timer?
    /// Impact generators are stored (not created per hit) so prepare() has
    /// somewhere to live — an unprepared generator fires with visible latency.
    private let softHaptic = UIImpactFeedbackGenerator(style: .soft)
    private let lightHaptic = UIImpactFeedbackGenerator(style: .light)

    private var didFinish = false
    private var watchdogTimer: Timer?
    private var sawPlaying = false

    // Liveness tracking for the ad-aware watchdog (v3.2.0). A pre-roll ad can
    // legitimately delay content PLAYING far past 12s, so "no PLAYING yet" is
    // NOT evidence of a dead video — silence is. See startWatchdog().
    private var watchdogStartedAt = Date()
    private var receivedAnyMessage = false // any proxy message since (re)load
    private var sawYtSignal = false        // the YT iframe itself has spoken

    // Epoch token (v3.2.0): each load/swap increments this and hands it to the
    // proxy (?e= on cold loads, trLoad's 2nd arg on swaps); a v3.2.0+ proxy
    // echoes it on every message. postMessage delivery is async, so a message
    // from the PREVIOUS video can land after we reset state for the next one —
    // without the token, a stale end-of-video heartbeat could re-arm the fast
    // path and prematurely skip the new video. Mismatched epochs are dropped.
    // Messages without an echo (older proxy) are accepted for compatibility.
    private var epochToken = 0

    // Ad-aware end detection (v3.1.0, hardened v3.2.0). YouTube fires
    // onStateChange ENDED (0) when a pre-roll AD finishes, before the real
    // trailer plays; advancing on that raw event is the "trailers only play
    // ~15s" bug. We confirm a real end the same way the web player
    // (endDetection.js) and proxy do: accept it immediately only if playback
    // reached the end of the CONFIRMED content (>= 3s of observed forward
    // progress on a clip whose duration matches the pinned metadata),
    // otherwise wait — 5s before content confirms (ad pods gap slowly), 1.2s
    // after (real ends stay snappy). An ad boundary resumes playback (state
    // 1/3) and cancels the pending end; a real end resumes nothing.
    private var endConfirmTimer: Timer?
    private var lastContentTime: Double = 0
    private var lastContentDuration: Double = 0
    private var pinnedDuration: Double = 0   // content metadata from proxy 'meta', 0 = none
    private var hbContentConfirmed = false   // proxy-side confirmation via 'hb'
    private var progressAccum: Double = 0    // native-side forward-progress accumulation
    private var epochLastT: Double?

    // v3.4.0 — PLAYLIST MODE. YouTube's own player can sequence a list of video
    // ids and move between them itself. Every version up to 3.3.2 instead
    // detected the end of each trailer and loaded the next one by hand, which
    // meant reimplementing, against signals YouTube deliberately keeps vague,
    // the one thing its player already does natively. Handing it the queue
    // removes the entire failure class: no end screen, no replay button, no
    // closing and reopening the modal, no cold page load between trailers.
    private var playlistIds: [String] = []
    private var playlistTitles: [String] = []
    private var playlistIndex = 0
    private var playlistActive = false
    /// Armed at a confirmed end while the playlist is driving. If YouTube moves
    /// on by itself first, playback cancels it. If it fires, the playlist did
    /// not take and we fall back to the hand-rolled advance, so the worst case
    /// is a few seconds late rather than the permanent stall this replaces.
    private var playlistWatchTimer: Timer?
    private static let playlistHandoffSeconds: TimeInterval = 4.0
    /// When playback last demonstrably advanced. The hard cap must not shoot
    /// down a trailer that is visibly playing just because the content player
    /// never announced PLAYING.
    private var lastProgressAt: Date?
    private static let endConfirmSeconds: TimeInterval = 1.2
    private static let preContentConfirmSeconds: TimeInterval = 5.0
    private static let minContentSeconds: Double = 32
    private static let endEpsilonSeconds: Double = 1.5
    private static let pinEpsilonSeconds: Double = 2.5
    private static let confirmProgressSeconds: Double = 3.0
    /// With no pinned content duration (v3.1.0 proxy still deployed), a clip
    /// whose own duration exceeds this is treated as the trailer rather than an
    /// ad. Sits above YouTube's pre-roll inventory (6s bumpers to 30s spots;
    /// longer skippable ones are skipped at 5s) and below essentially every
    /// real trailer. Only consulted when pinnedDuration is 0.
    private static let unpinnedContentSeconds: Double = 65
    /// A sample must advance by more than this to count as playback. Smaller
    /// deltas are the player re-reporting where it already is — exactly what
    /// it does once a video has genuinely ENDED.
    private static let progressEpsilonSeconds: Double = 0.25
    private static let watchdogDeadPageSeconds: TimeInterval = 12.0
    private static let watchdogSilentPlayerSeconds: TimeInterval = 20.0
    private static let watchdogHardCapSeconds: TimeInterval = 75.0
    /// How long playback must have been frozen for the hard cap to count the
    /// video as dead rather than simply long.
    private static let watchdogStaleProgressSeconds: TimeInterval = 20.0

    // v3.2.2 presentation constants.
    /// Idle time before the glass chrome fades off the video.
    private static let chromeIdleSeconds: TimeInterval = 3.0
    private static let chromeFadeSeconds: TimeInterval = 0.3
    private static let backdropFadeSeconds: TimeInterval = 0.35
    /// Hard ceiling on how long the poster may cover the player when no
    /// playback signal arrives. Policy backstop — see markStageLive().
    private static let backdropMaxSeconds: TimeInterval = 6.0
    private static let progressRevealSeconds: TimeInterval = 0.25
    /// One heartbeat is 1s; animating each step over 0.95s makes the progress
    /// line glide continuously instead of ticking once a second.
    private static let progressGlideSeconds: TimeInterval = 0.95
    private static let progressBarHeight: CGFloat = 2.5
    /// Swipe-down dismissal thresholds — either a decisive distance or a flick.
    private static let dismissDistanceThreshold: CGFloat = 140
    private static let dismissVelocityThreshold: CGFloat = 900
    /// How round the stage gets at full drag, so it detaches from the display
    /// edges the way a real interactive sheet does.
    private static let dismissCornerRadius: CGFloat = 38
    private static let minimumTapTarget: CGFloat = 44

    // Immersive dark theme — video fills the entire screen, Liquid Glass
    // header floats above it. Blue accents, near-white title.
    private static let stageColor = UIColor.black
    private static let accentColor = UIColor(red: 0.239, green: 0.647, blue: 0.957, alpha: 1.0) // #3DA5F4
    private static let titleColor = UIColor(red: 0.961, green: 0.961, blue: 0.961, alpha: 1.0)  // near-white
    private static let progressTrackColor = UIColor.white.withAlphaComponent(0.12)

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
         posterUrl: String? = nil,
         onEvent: @escaping (String, [String: Any]) -> Void,
         onDismiss: @escaping (String, String) -> Void) {
        self.videoId = videoId
        self.videoTitle = title
        self.isMuted = muted
        self.posterUrl = posterUrl
        self.onEvent = onEvent
        self.onDismiss = onDismiss
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit {
        watchdogTimer?.invalidate()
        endConfirmTimer?.invalidate()
        chromeHideTimer?.invalidate()
        backdropSafetyTimer?.invalidate()
        backdropTask?.cancel()
    }

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
        // MUST stay opaque. Since v3.2.2 this VC is presented .overFullScreen,
        // so the roulette stage underneath is still rendered and would show
        // through any transparency here. The only thing allowed to make this
        // player see-through is the swipe-down drag's own alpha.
        view.backgroundColor = Self.stageColor
        // Order is load-bearing, and it is the OPPOSITE of what it looks like:
        // the backdrop is added AFTER the webView so it sits ABOVE it, and
        // BEFORE the chrome so it sits below that. It has to cover the webView,
        // because the thing we are hiding is the proxy page's own opaque black
        // body. See setupBackdrop().
        setupWebView()
        setupBackdrop()
        setupGlassChrome()
        setupStageGestures()
        // Warm the taptic engine now; the first advance can be seconds away but
        // an unprepared generator fires late enough to feel disconnected.
        softHaptic.prepare()
        lightHaptic.prepare()
        loadVideo(videoId: videoId)
    }

    /// Keep the progress fill correct across rotation and safe-area changes.
    /// The fill is a constant-width constraint (NSLayoutConstraint.multiplier
    /// is read-only after creation), so the point value has to be re-derived
    /// whenever the track's width changes. Converges in one extra pass: once
    /// the constant matches, this stops dirtying layout.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let track = progressTrack, let widthC = progressFillWidth else { return }
        let full = track.bounds.width
        guard full > 0 else { return }
        let target = full * progressFraction
        if abs(widthC.constant - target) > 0.5 { widthC.constant = target }
    }

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        [.portrait, .landscapeLeft, .landscapeRight]
    }

    // MARK: - v3.2.2 A1: poster backdrop instead of a black stage

    /// The loading stage the modal dissolves onto, and off.
    ///
    /// Symptom this fixes: the player presented onto pure black with a lone
    /// UIActivityIndicatorView for the 2-3s the Vercel proxy page needs to
    /// load — immediately after the user had been looking at this exact
    /// movie's TMDB artwork full-bleed on the roulette stage. Throwing that
    /// away and showing black reads as the app crashing, not as loading.
    ///
    /// The group is image -> 45% black dim -> blur, so the blur samples the
    /// already-dimmed art and the result reads as an out-of-focus backdrop
    /// rather than a stretched still competing with the video.
    ///
    /// Z-ORDER: ABOVE the webView, below the glass chrome. This is deliberate
    /// and it was wrong the other way round in the first cut of v3.2.2. Putting
    /// it below the webView achieves nothing, because the thing that makes the
    /// stage black is not an empty WKWebView — it is the proxy page's own
    /// `html, body { background:#000 }` (landing-page/api/embed.js), and behind
    /// that the YouTube iframe is opaque too. Making the proxy transparent
    /// would not help for the same reason. The only way to replace that black
    /// with artwork is to cover it and then dissolve away.
    ///
    /// Because it now genuinely covers the player, WHEN it goes is a
    /// correctness question, not a taste one — see markStageLive().
    private func setupBackdrop() {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        // Non-interactive: it sits over the webView now, so it must not
        // intercept a touch meant for the video or for the swipe-down gesture.
        container.isUserInteractionEnabled = false
        container.backgroundColor = Self.stageColor
        view.addSubview(container)
        self.backdropContainer = container

        let image = UIImageView()
        image.contentMode = .scaleAspectFill
        image.clipsToBounds = true
        image.translatesAutoresizingMaskIntoConstraints = false
        // Starts invisible and fades in when (if) the bytes arrive, so a slow
        // network shows the old black stage rather than a pop-in.
        image.alpha = 0
        container.addSubview(image)
        self.backdropImageView = image

        let dim = UIView()
        dim.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        dim.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(dim)

        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
        blur.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(blur)

        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: view.topAnchor),
            container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            container.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        for child in [image, dim, blur] as [UIView] {
            NSLayoutConstraint.activate([
                child.topAnchor.constraint(equalTo: container.topAnchor),
                child.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                child.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                child.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
        }

        loadBackdropImage()
        // Arm the policy backstop the moment the poster can appear.
        startBackdropSafetyTimer()
    }

    /// Fetch the artwork off the main thread. Any failure — no URL, bad bytes,
    /// no network — silently leaves the black stage we already had, so this
    /// path has no way to make the player worse than it was before v3.2.2.
    private func loadBackdropImage() {
        guard let raw = posterUrl, !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme == "https" else { return }
        let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard error == nil, let data = data, let img = UIImage(data: data) else { return }
            // URLSession calls back on a background queue; every UIKit touch
            // below has to hop to main.
            DispatchQueue.main.async {
                guard let self = self, !self.didFinish, !self.stageIsLive,
                      let imageView = self.backdropImageView else { return }
                imageView.image = img
                UIView.animate(withDuration: 0.28, delay: 0, options: [.curveEaseOut],
                               animations: { imageView.alpha = 1 }, completion: nil)
            }
        }
        backdropTask = task
        task.resume()
    }

    /// Retire the poster stage the instant ANY playback is observed.
    ///
    /// ==== DO NOT MAKE THIS WAIT LONGER. READ THIS FIRST. ====
    ///
    /// The obvious "improvement" here is to hold the artwork until
    /// contentConfirmedNow() is true, so the user never sees a pre-roll ad
    /// behind a bare black frame. That would be a policy violation, not a
    /// polish win. The backdrop is now ABOVE the webView, so it genuinely
    /// covers the player, and a pre-roll ad IS playback. YouTube API Services
    /// Developer Policies section III.I.5 forbids clients that "modify,
    /// interfere with, replace, or block advertisements placed or served by
    /// YouTube" — holding an opaque poster over a running ad is blocking it.
    ///
    /// So the trigger is the FIRST OBSERVED PLAYBACK OF ANY KIND, deliberately
    /// the loosest signal available:
    ///   - stateChange:1, real OR the proxy's synthesised one (v3.2.1 `syn`), or
    ///   - the first forward progress from any sample (noteProgressIfMoved).
    /// The instant pixels move, the poster goes. Content confirmation is NOT
    /// consulted anywhere in this path, and must not be.
    ///
    /// Also deliberately NOT hooked to webView(_:didFinish:) — that fires when
    /// the proxy page merely exists, which is too EARLY: it would dump us back
    /// onto the black page for the second or two of player bootstrap that
    /// follows. Too early is a UX bug; too late is a policy breach; "when
    /// something plays" is the one point that is neither.
    ///
    /// backdropSafetyTimer is the backstop for the case where no playback
    /// signal ever arrives (an old proxy with no heartbeat serving an ad
    /// variant that never reports PLAYING). It drops the poster on a timer so
    /// the policy holds even when we are blind. See startBackdropSafetyTimer().
    ///
    /// Idempotent; once retired it stays retired for the session.
    private func markStageLive() {
        guard !stageIsLive else { return }
        stageIsLive = true
        backdropTask?.cancel()
        backdropTask = nil
        backdropSafetyTimer?.invalidate()
        backdropSafetyTimer = nil
        guard let container = backdropContainer else { return }
        UIView.animate(withDuration: Self.backdropFadeSeconds, delay: 0, options: [.curveEaseOut],
                       animations: { container.alpha = 0 },
                       completion: { [weak self] _ in
                           // Drop the decoded image; in-place chaining is a
                           // ~0.5s trLoad swap during which the webView keeps
                           // painting the previous frame, so re-showing a
                           // poster between trailers would be a flash, not a
                           // courtesy.
                           self?.backdropContainer?.isHidden = true
                           self?.backdropImageView?.image = nil
                       })
    }

    /// Hard ceiling on how long the poster may cover the player.
    ///
    /// markStageLive() needs a playback signal, and there is one configuration
    /// that never sends us one: a pre-v3.2.0 proxy (no 'hb' heartbeat, so no
    /// progress samples) serving one of the ad variants that keeps the content
    /// player UNSTARTED for the whole ad — the exact case the v3.2.0 watchdog
    /// work exists for. Blind, we would sit on an opaque poster over a running
    /// ad, which is the section III.I.5 problem described in markStageLive().
    ///
    /// So the poster comes down on a timer regardless. Landing back on the
    /// proxy page's black body after 6s is a cosmetic disappointment; covering
    /// an ad is not, so the tie goes to dropping it. 6s comfortably clears the
    /// 2-3s page load this feature exists for, and any healthy path retires the
    /// poster on its own well before the timer fires.
    private func startBackdropSafetyTimer() {
        backdropSafetyTimer?.invalidate()
        backdropSafetyTimer = Timer.scheduledTimer(withTimeInterval: Self.backdropMaxSeconds,
                                                   repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.backdropSafetyTimer = nil
            self.markStageLive()
        }
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
        // Unchanged from v3.2.1 — deliberately. An earlier v3.2.2 draft made
        // these .clear to let a backdrop sitting BELOW the webView show
        // through; that approach was wrong (the proxy page's own black body,
        // and the YouTube iframe behind it, are opaque) and the backdrop moved
        // above the webView instead. So these stay black, and the player has no
        // transparency of its own to leak the stage through under the new
        // .overFullScreen presentation.
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
        self.chromeEffectView = effectView

        // The contentView is where controls go — they render INSIDE the
        // glass material, not floating above it.
        let chrome = effectView.contentView

        // Done button — left side
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        doneButton.setTitleColor(Self.accentColor, for: .normal)
        // v3.2.2: VoiceOver reads the title, but "Done" alone does not say what
        // it finishes — the hint does.
        doneButton.accessibilityLabel = "Done"
        doneButton.accessibilityHint = "Closes the trailer player"
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        chrome.addSubview(doneButton)

        // Skip button — right side.
        // v3.2.2: this was the text "Skip ▸" sitting immediately beside a
        // symbol-based mute button — two different button languages inside 30
        // points of chrome. An SF Symbol matches the mute glyph, and a square
        // symbol button gives a predictable 44x44 target instead of a tap area
        // that changes size with the label.
        let skip = UIButton(type: .system)
        skip.setImage(UIImage(systemName: "forward.end.fill"), for: .normal)
        skip.tintColor = Self.accentColor
        skip.accessibilityLabel = "Skip to next trailer"
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
        self.gradientFadeView = gradient

        // v3.2.2 A4: progress line along the bottom edge of the glass.
        //
        // It is a SIBLING of the chrome rather than a child of its contentView
        // because the glass clips to a 16pt bottom corner radius, which would
        // bite the ends off a full-width bar.
        //
        // Two independent gates drive its alpha: content confirmation (it stays
        // at 0 until contentConfirmedNow() is true, so a pre-roll ad's clock
        // never draws a bar) and chrome visibility (it fades out with the
        // header it belongs to, the way a first-party player's scrubber does).
        let track = UIView()
        track.backgroundColor = Self.progressTrackColor
        track.translatesAutoresizingMaskIntoConstraints = false
        track.alpha = 0
        track.isUserInteractionEnabled = false
        // Decorative: VoiceOver users get the trailer, not a progress readout,
        // and an unlabelled 2.5pt element in the swipe order is pure noise.
        track.isAccessibilityElement = false
        view.addSubview(track)
        self.progressTrack = track

        let fill = UIView()
        fill.backgroundColor = Self.accentColor
        fill.translatesAutoresizingMaskIntoConstraints = false
        fill.isUserInteractionEnabled = false
        fill.isAccessibilityElement = false
        track.addSubview(fill)
        self.progressFill = fill
        let fillWidth = fill.widthAnchor.constraint(equalToConstant: 0)
        self.progressFillWidth = fillWidth

        NSLayoutConstraint.activate([
            // Effect view: spans full width, from top of screen to
            // safe area top + 48pt (same height as the old solid header).
            effectView.topAnchor.constraint(equalTo: view.topAnchor),
            effectView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            effectView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            effectView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48),

            // Done button — bottom-left of glass chrome.
            // v3.2.2: the 44pt height was already there; the width minimum
            // guarantees the HIG target even if the title is ever localised
            // to something short.
            doneButton.leadingAnchor.constraint(equalTo: chrome.leadingAnchor, constant: 16),
            doneButton.bottomAnchor.constraint(equalTo: chrome.bottomAnchor, constant: -2),
            doneButton.heightAnchor.constraint(equalToConstant: Self.minimumTapTarget),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: Self.minimumTapTarget),

            // Skip button — bottom-right of glass chrome. Square 44x44 now that
            // it is a symbol rather than text.
            skip.trailingAnchor.constraint(equalTo: chrome.trailingAnchor, constant: -16),
            skip.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
            skip.heightAnchor.constraint(equalToConstant: Self.minimumTapTarget),
            skip.widthAnchor.constraint(equalToConstant: Self.minimumTapTarget),

            // Mute button — left of Skip
            mute.trailingAnchor.constraint(equalTo: skip.leadingAnchor, constant: -10),
            mute.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
            mute.heightAnchor.constraint(equalToConstant: Self.minimumTapTarget),
            mute.widthAnchor.constraint(equalToConstant: Self.minimumTapTarget),

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

            // Progress line — flush with the bottom edge of the glass, full
            // width. It ends exactly where the gradient begins, so the two
            // never overlap regardless of z-order.
            track.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            track.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            track.bottomAnchor.constraint(equalTo: effectView.bottomAnchor),
            track.heightAnchor.constraint(equalToConstant: Self.progressBarHeight),

            fill.leadingAnchor.constraint(equalTo: track.leadingAnchor),
            fill.topAnchor.constraint(equalTo: track.topAnchor),
            fill.bottomAnchor.constraint(equalTo: track.bottomAnchor),
            fillWidth,
        ])

        refreshMuteAffordance()
        refreshSkipAffordance()
    }

    // MARK: - v3.2.2 A4: progress line

    /// Zero the line for a fresh video. Called on both a cold loadVideo and an
    /// in-place swapVideo — without this the outgoing trailer's fill would sit
    /// at ~100% while the next one buffers, which reads as a stuck player.
    private func resetProgressBar() {
        progressRevealed = false
        progressFraction = 0
        progressTrack?.layer.removeAllAnimations()
        progressFill?.layer.removeAllAnimations()
        progressFillWidth?.constant = 0
        progressTrack?.alpha = 0
        progressTrack?.layoutIfNeeded()
    }

    /// Drive the line from the heartbeat clock we already receive.
    ///
    /// Callers MUST have checked contentConfirmedNow() first — that is the only
    /// thing standing between this and a pre-roll ad's clock drawing a bar that
    /// fills up and resets, which would be worse than no bar at all.
    private func syncProgressFromClock() {
        guard let track = progressTrack, let widthC = progressFillWidth else { return }
        // Prefer the live duration; fall back to the pinned content duration
        // from the proxy's 'meta' when a sample omitted it.
        let duration = lastContentDuration > 0 ? lastContentDuration : pinnedDuration
        guard duration.isFinite, duration > 0,
              lastContentTime.isFinite, lastContentTime >= 0 else { return }
        let fraction = CGFloat(max(0.0, min(1.0, lastContentTime / duration)))

        if !progressRevealed {
            progressRevealed = true
            if chromeVisible {
                UIView.animate(withDuration: Self.progressRevealSeconds, delay: 0,
                               options: [.curveEaseOut],
                               animations: { track.alpha = 1 }, completion: nil)
            }
        }

        progressFraction = fraction
        let full = track.bounds.width > 0 ? track.bounds.width : view.bounds.width
        widthC.constant = full * fraction
        // Heartbeats land once a second. Gliding each step linearly over 0.95s
        // makes the line move continuously instead of stepping;
        // .beginFromCurrentState keeps the hand-off smooth when a beat is late,
        // dropped, or arrives during a swap.
        UIView.animate(withDuration: Self.progressGlideSeconds, delay: 0,
                       options: [.curveLinear, .beginFromCurrentState],
                       animations: { track.layoutIfNeeded() }, completion: nil)
    }

    // MARK: - v3.2.2 A3: auto-hiding chrome

    /// May the chrome fade itself out right now?
    ///
    /// SAFETY RULE: the chrome must never be both invisible AND the only way
    /// out. It stays pinned while the loading spinner is up — the state in
    /// which a user is most likely to give up and want out, and the one state
    /// where nothing on screen is worth an unobstructed view. (There is no
    /// error state to pin for: every error path in this VC either chains in
    /// place or calls finish(), so an error never sits on screen.) The other
    /// two halves of the rule live in hideChrome() — which makes the hidden
    /// chrome non-interactive — and in the swipe-down gesture, which works
    /// whether or not the chrome is visible.
    private func chromeMayAutoHide() -> Bool {
        // v3.4.0: OFF. Hiding the chrome was a v3.2.2 idea that looked right on
        // paper and was wrong on a device: at the end of a trailer the app's
        // Done, Skip and mute had all faded out, so the only thing on screen
        // was YouTube's end screen and its replay button. The app handed the
        // display to YouTube at exactly the moment it needed to be in charge.
        // Controls stay up. Everything that drives it is left intact so this is
        // a one-line change to revisit, but not before it can be seen running.
        return false
    }

    private func showChrome(restartIdleTimer: Bool = true) {
        chromeVisible = true
        chromeEffectView?.isUserInteractionEnabled = true
        let progressAlpha: CGFloat = progressRevealed ? 1 : 0
        UIView.animate(withDuration: Self.chromeFadeSeconds, delay: 0, options: [.curveEaseOut],
                       animations: {
                           self.chromeEffectView?.alpha = 1
                           self.gradientFadeView?.alpha = 1
                           self.progressTrack?.alpha = progressAlpha
                       }, completion: nil)
        if restartIdleTimer { scheduleChromeAutoHide() }
    }

    private func hideChrome() {
        guard chromeMayAutoHide() else { return }
        chromeVisible = false
        // Non-interactive while hidden: a blind tap has to RESTORE the chrome,
        // not land on whichever invisible button happens to be under the
        // finger. Dismissing the player by accident because you tapped to see
        // the controls would be the worst possible outcome of this feature.
        chromeEffectView?.isUserInteractionEnabled = false
        UIView.animate(withDuration: Self.chromeFadeSeconds, delay: 0, options: [.curveEaseOut],
                       animations: {
                           self.chromeEffectView?.alpha = 0
                           self.gradientFadeView?.alpha = 0
                           self.progressTrack?.alpha = 0
                       }, completion: nil)
    }

    private func scheduleChromeAutoHide() {
        chromeHideTimer?.invalidate()
        chromeHideTimer = nil
        guard chromeMayAutoHide() else { return }
        chromeHideTimer = Timer.scheduledTimer(withTimeInterval: Self.chromeIdleSeconds,
                                               repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.chromeHideTimer = nil
            self.hideChrome()
        }
    }

    private func cancelChromeAutoHide() {
        chromeHideTimer?.invalidate()
        chromeHideTimer = nil
    }

    // MARK: - v3.2.2 A2/A3: stage gestures

    /// Tap restores the chrome; a downward drag dismisses the player.
    ///
    /// Before this, Done was the only exit from a full-screen video player,
    /// which no first-party iOS player is. The drag is what makes the
    /// auto-hiding chrome safe: there is always a way out even when nothing is
    /// on screen.
    private func setupStageGestures() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handleDismissPan(_:)))
        pan.delegate = self
        // The buttons and the web content keep their own touches; the pan only
        // takes over once gestureRecognizerShouldBegin has agreed it is a real
        // downward drag that did not start on the chrome.
        pan.cancelsTouchesInView = false
        view.addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleStageTap(_:)))
        tap.delegate = self
        // Without this the root-view tap recogniser swallows the touch that was
        // on its way to Done / Mute / Skip.
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
    }

    @objc private func handleStageTap(_ recognizer: UITapGestureRecognizer) {
        // Any tap on the stage brings the chrome back and restarts the idle
        // clock. We never hide on tap: a tap-to-hide would let the user remove
        // the visible exit by accident, and the drag already covers "get this
        // out of my way".
        showChrome()
    }

    @objc private func handleDismissPan(_ recognizer: UIPanGestureRecognizer) {
        // Measure against the untransformed container, not against view itself
        // — view carries the drag transform, and reading a delta out of the
        // thing you are moving is how drag handlers end up with feedback loops.
        let reference = view.superview ?? view
        let translation = recognizer.translation(in: reference)
        let screenHeight = max(view.bounds.height, 1)

        switch recognizer.state {
        case .began, .changed:
            // Rubber-band upward drags: this gesture only ever means "put it
            // away", so pulling up should feel like resistance, not travel.
            let offset = translation.y >= 0 ? translation.y : translation.y / 4
            let travel = max(0, offset)
            let progress = min(1, travel / screenHeight)
            view.transform = CGAffineTransform(translationX: 0, y: travel)
            // Fade toward 0.75, not toward 0 — the stage should read as being
            // set down, not as evaporating.
            view.alpha = 1.0 - (0.25 * progress)
            view.layer.masksToBounds = true
            view.layer.cornerRadius = Self.dismissCornerRadius * progress
            // Hold the chrome still mid-drag; an exit disappearing under the
            // user's thumb is disorienting.
            cancelChromeAutoHide()

        case .ended, .cancelled, .failed:
            let velocity = recognizer.velocity(in: reference)
            let committed = translation.y > Self.dismissDistanceThreshold
                || velocity.y > Self.dismissVelocityThreshold
            if committed {
                UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseIn],
                               animations: {
                                   self.view.transform = CGAffineTransform(translationX: 0, y: screenHeight)
                                   self.view.alpha = 0.75
                               },
                               completion: { [weak self] _ in
                                   // ALWAYS through finish(): calling dismiss()
                                   // here would leave the kept-alive
                                   // openTrailer CAPPluginCall unresolved and
                                   // the JS side awaiting a dead modal forever.
                                   self?.finish(reason: "user")
                               })
            } else {
                UIView.animate(withDuration: 0.38, delay: 0, usingSpringWithDamping: 0.82,
                               initialSpringVelocity: 0.4, options: [.curveEaseOut],
                               animations: {
                                   self.view.transform = .identity
                                   self.view.alpha = 1
                                   self.view.layer.cornerRadius = 0
                               },
                               completion: { [weak self] _ in
                                   self?.view.layer.masksToBounds = false
                                   self?.scheduleChromeAutoHide()
                               })
            }

        default:
            break
        }
    }

    // MARK: - UIGestureRecognizerDelegate

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // Never start on top of the glass chrome — Done / Mute / Skip have to
        // stay ordinary buttons, and a drag that starts on a control is a
        // mis-hit, not a dismissal. Only guarded while the chrome is actually
        // visible and interactive; once it has auto-hidden, its frame is just
        // more stage.
        if let chrome = chromeEffectView, chromeVisible, chrome.alpha > 0.01 {
            let point = gestureRecognizer.location(in: view)
            if chrome.frame.contains(point) { return false }
        }
        guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
        // Downward and mostly vertical. A horizontal swipe is not a dismissal,
        // and an upward one certainly is not.
        let velocity = pan.velocity(in: view)
        return velocity.y > 0 && abs(velocity.y) > abs(velocity.x)
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                  shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // The tap (restore chrome) and the pan (dismiss) must coexist, and
        // neither may fight the WKWebView's own recognisers.
        return true
    }

    /// Load (or reload, in place) the proxy page for a given video.
    private func loadVideo(videoId: String) {
        epochToken += 1
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
            URLQueryItem(name: "e", value: String(epochToken)),
        ]
        if isMuted { items.append(URLQueryItem(name: "mute", value: "1")) }
        components.queryItems = items
        guard let url = components.url else {
            dismissUnplayable("invalid-url")
            return
        }

        sawPlaying = false
        receivedAnyMessage = false // cold navigation: the page must prove it's alive
        sawYtSignal = false
        resetContentProgress()
        resetProgressBar()  // v3.2.2 (UI only): new video, new clock
        loadingIndicator?.startAnimating()
        showChrome()        // v3.2.2 (UI only): pinned while the spinner is up
        // Direct HTTPS navigation. The proxy page handles the YT iframe.
        webView.load(URLRequest(url: url))
        startWatchdog()
    }

    /// Ad-aware liveness watchdog (v3.2.0). The old rule — "no PLAYING within
    /// 12s = unplayable" — skipped LIVE trailers at ~13s, because several
    /// pre-roll ad variants keep the content player in UNSTARTED (no PLAYING
    /// event) while the ad runs. Silence is the real evidence of death:
    ///   - No proxy messages at all within 12s      -> dead page, skip.
    ///   - Page alive but YT never spoke within 20s -> dead player, skip.
    ///   - No content playback within 75s hard cap  -> give up, skip.
    /// A live page serving an ad keeps sending heartbeats/state traffic, so
    /// it sails through until the ad finishes. Dead video IDs still skip
    /// instantly via the 'error' event; Skip/Done stay available throughout.
    private func startWatchdog() {
        watchdogTimer?.invalidate()
        watchdogStartedAt = Date()
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if self.didFinish || self.sawPlaying {
                self.watchdogTimer?.invalidate(); self.watchdogTimer = nil
                return
            }
            let elapsed = Date().timeIntervalSince(self.watchdogStartedAt)
            // The hard cap is a backstop for "nothing is happening", not a
            // playback time limit: a video whose picture is visibly moving is
            // alive whatever the player says about its state. Without this,
            // an ad variant that never reports PLAYING would have the trailer
            // dismissed at 75s mid-playback.
            let playbackIsStale: Bool = {
                guard let last = self.lastProgressAt else { return true }
                return Date().timeIntervalSince(last) >= Self.watchdogStaleProgressSeconds
            }()
            let dead =
                (elapsed >= Self.watchdogDeadPageSeconds && !self.receivedAnyMessage) ||
                (elapsed >= Self.watchdogSilentPlayerSeconds && !self.sawYtSignal) ||
                (elapsed >= Self.watchdogHardCapSeconds && playbackIsStale)
            guard dead else { return }
            self.watchdogTimer?.invalidate(); self.watchdogTimer = nil
            if self.nextVideoId != nil {
                self.advanceInPlace(reason: "advanced", cause: "unplayable")
            } else {
                self.dismissUnplayable("watchdog")
            }
        }
    }

    func setPlaylist(_ ids: [String], titles: [String]) {
        playlistIds = ids
        playlistTitles = titles
        playlistIndex = 0
    }

    /// Hand the queue to YouTube. Injected straight into the existing iframe,
    /// which already carries enablejsapi=1 — so this needs no change to the
    /// proxy page and works against the version deployed today.
    private func applyPlaylist() {
        guard !playlistActive, playlistIds.count > 1 else { return }
        let quoted = playlistIds.map { "'\($0)'" }.joined(separator: ",")
        let js = """
        (function(){try{var f=document.getElementById('yt');
        if(!f||!f.contentWindow)return 'no';
        f.contentWindow.postMessage(JSON.stringify({event:'command',func:'loadPlaylist',
          args:[[\(quoted)],0,0]}),'https://www.youtube-nocookie.com');
        return 'ok';}catch(e){return 'err';}})()
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            if (result as? String) == "ok" {
                self.playlistActive = true
                print("[TrailerPlayer] playlist handed to YouTube: \(self.playlistIds.count) videos")
            }
        }
    }

    private func cancelPlaylistWatch() {
        playlistWatchTimer?.invalidate()
        playlistWatchTimer = nil
    }

    /// YouTube moved to the next item on its own. Sync our chrome and tell JS
    /// so its queue, metadata panel and prefetch keep pace with what is on
    /// screen. Playback is not touched — it never stopped.
    private func playlistDidAdvance() {
        cancelPlaylistWatch()
        guard playlistActive else { return }
        let played = playlistIndex < playlistIds.count ? playlistIds[playlistIndex] : videoId
        playlistIndex += 1
        guard playlistIndex < playlistIds.count else {
            // Batch exhausted; let the normal path take over from here.
            playlistActive = false
            return
        }
        videoId = playlistIds[playlistIndex]
        if playlistIndex < playlistTitles.count {
            videoTitle = playlistTitles[playlistIndex]
            let newTitle = videoTitle.isEmpty ? "Trailer" : videoTitle
            if let label = titleLabel {
                UIView.transition(with: label, duration: 0.28, options: [.transitionCrossDissolve],
                                  animations: { label.text = newTitle }, completion: nil)
            }
        }
        resetContentProgress()
        resetProgressBar()
        fireHaptic(softHaptic)
        onEvent("trailerEvent", ["event": "advanced", "cause": "ended",
                                 "from": played, "youtubeKey": videoId])
    }

    private func resetContentProgress() {
        lastContentTime = 0
        lastContentDuration = 0
        pinnedDuration = 0
        hbContentConfirmed = false
        progressAccum = 0
        epochLastT = nil
        lastProgressAt = nil
        cancelEndConfirm()
    }

    /// Fold a time/duration sample (from 'stateChange' or 'hb' messages) into
    /// the progress model. Forward deltas < 8s count as genuinely-watched
    /// playback; larger jumps are seeks/swap glitches and are ignored.
    ///
    /// Returns true when playback demonstrably ADVANCED, which is the one
    /// signal that survives ad variants that never fire a state change.
    @discardableResult
    private func ingestProgress(t: Double?, d: Double?) -> Bool {
        if let d = d, d > 0 { lastContentDuration = d }
        guard let t = t else { return false }
        var moved = false
        if let last = epochLastT, t > last + Self.progressEpsilonSeconds, (t - last) < 8 {
            progressAccum += (t - last)
            moved = true
        }
        epochLastT = t
        lastContentTime = t
        return moved
    }

    /// Playback advanced, so whatever ENDED we are holding was an ad boundary
    /// — even though nothing announced itself as PLAYING. Waiting only for a
    /// state event here is what let the confirm timer fire mid-ad-pod and skip
    /// a live trailer. A real end never reaches this: playback has stopped.
    private func noteProgressIfMoved(_ moved: Bool) {
        guard moved, !didFinish else { return }
        lastProgressAt = Date()
        cancelEndConfirm()
        // v3.2.2 (UI ONLY — no effect on end detection or the watchdog):
        // demonstrated forward progress is the strongest evidence we ever get
        // that something is on screen, and it arrives even for the ad variants
        // that never announce PLAYING. The poster stage covers the player, so
        // it must come down the instant ANY playback — ad or trailer — starts;
        // see markStageLive() for the YouTube policy reason it is gated here
        // and not on contentConfirmedNow().
        markStageLive()
    }

    /// Does a reported duration look like the pinned content (when pinned)?
    private func pinOk(_ d: Double) -> Bool {
        if pinnedDuration <= 0 { return true }
        return d > 0 && abs(d - pinnedDuration) <= Self.pinEpsilonSeconds
    }

    /// Has REAL content (not an ad) demonstrably played? Confirming that means
    /// claiming THIS clip is the trailer, which needs something to check it
    /// against: the pinned content duration from the proxy's 'meta'. Two
    /// signals, either suffices — the proxy's own confirmation ('hb' cc flag),
    /// or >= 3s of natively-accumulated forward progress on a pin-matching
    /// clip.
    ///
    /// v3.2.1 removed the unpinned path entirely, reasoning that a long
    /// unskippable ad passes any "looks long enough" test. Right about ads,
    /// wrong about deployment: the pin only exists once the v3.2.1+ proxy is
    /// live, and against the v3.1.0 proxy that is still deployed this was
    /// permanently false. Every trailer then took the full 5s pre-content
    /// window at its end — and YouTube fills those five seconds with its own
    /// replay button, which is what users ended up tapping. Refusing to decide
    /// is not the safe choice when the cost of not deciding is the app visibly
    /// stalling on every trailer.
    ///
    /// So the unpinned path is back, with a far higher bar than v3.2.0's:
    /// unpinnedContentSeconds, not minContentSeconds. A clip whose own duration
    /// runs past a minute is not pre-roll — YouTube's pre-roll inventory is 6s
    /// bumpers through 30s spots, and the long skippable ones get skipped at
    /// 5s. The 45s ad that v3.2.1 was protecting against still fails this test
    /// and still gets the conservative window.
    private func contentConfirmedNow() -> Bool {
        if hbContentConfirmed { return true }
        if pinnedDuration > 0,
           progressAccum >= Self.confirmProgressSeconds,
           pinOk(lastContentDuration) { return true }
        if pinnedDuration <= 0,
           progressAccum >= Self.confirmProgressSeconds,
           lastContentDuration >= Self.unpinnedContentSeconds { return true }
        return false
    }

    private func cancelEndConfirm() {
        endConfirmTimer?.invalidate()
        endConfirmTimer = nil
    }

    /// Decide whether a YouTube ENDED (0) is a real end or a pre-roll ad
    /// boundary. Fast path: playback reached the end of a plausibly-long
    /// video AND the content itself was confirmed playing (a long ad ending
    /// at its own duration can't fake both). Otherwise wait — 5s before
    /// content confirms (ad pods can gap slowly), 1.2s after — and an ad
    /// boundary resumes playback (state 1/3) which cancels the pending end;
    /// a real end resumes nothing.
    private func handleEndCandidate() {
        if didFinish { return }
        // Fast-path when we hold content metadata and this clip matches it.
        if pinnedDuration > 0,
           pinOk(lastContentDuration),
           lastContentDuration > 0,
           lastContentTime >= lastContentDuration - Self.endEpsilonSeconds,
           lastContentTime >= Self.minContentSeconds,
           contentConfirmedNow() {
            performConfirmedEnd()
            return
        }
        // Unpinned fallback, for as long as the deployed proxy predates the
        // 'meta' pin. Playback reached the end of a clip that ran longer than
        // any pre-roll ad does, so this is the trailer finishing. Without this
        // the app stalls five seconds on YouTube's replay screen at the end of
        // every single trailer, which is a far worse and far more frequent
        // failure than the rare long-ad case the pin exists to catch.
        if pinnedDuration <= 0,
           lastContentDuration >= Self.unpinnedContentSeconds,
           lastContentTime >= lastContentDuration - Self.endEpsilonSeconds {
            performConfirmedEnd()
            return
        }
        cancelEndConfirm()
        // Whatever plays after this boundary (the next ad in a pod, or the
        // real content) accumulates progress from scratch.
        let wait = contentConfirmedNow() ? Self.endConfirmSeconds : Self.preContentConfirmSeconds
        progressAccum = 0
        epochLastT = nil
        endConfirmTimer = Timer.scheduledTimer(withTimeInterval: wait, repeats: false) { [weak self] _ in
            guard let self = self, !self.didFinish else { return }
            self.endConfirmTimer = nil
            self.performConfirmedEnd()
        }
    }

    /// A confirmed real end: chain to the next trailer in place if primed,
    /// else finish so JS advances + reopens (the proven fallback path).
    private func performConfirmedEnd() {
        cancelEndConfirm()
        // Playlist mode: YouTube owns the transition. Do NOT close the modal or
        // swap the video by hand - that would fight the player and skip an
        // item. Give it playlistHandoffSeconds to move on; if it does, playback
        // resuming cancels this timer and playlistDidAdvance() syncs the
        // chrome. If it does not, the playlist never took and we fall back to
        // the old behaviour, so this can be late but cannot dead-end.
        if playlistActive {
            cancelPlaylistWatch()
            playlistWatchTimer = Timer.scheduledTimer(
                withTimeInterval: Self.playlistHandoffSeconds, repeats: false
            ) { [weak self] _ in
                guard let self = self, !self.didFinish else { return }
                self.playlistWatchTimer = nil
                self.playlistActive = false
                print("[TrailerPlayer] playlist handoff timed out; falling back")
                self.performConfirmedEnd()
            }
            return
        }
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
        // v3.2.2: a bare speaker glyph reads to VoiceOver as nothing at all,
        // and the label has to describe what the tap DOES, not the current
        // state — otherwise "Mute" while already muted is ambiguous.
        btn.accessibilityLabel = isMuted ? "Unmute" : "Mute"
    }

    /// Gapless swap (v2.9.0): ask the already-initialized proxy page to swap
    /// the video in place via window.trLoad — no page reload, ~0.5s instead of
    /// 2-3s. If the deployed proxy predates trLoad, fall back to a full reload
    /// so playback always works regardless of which proxy version is live.
    private func swapVideo(_ id: String) {
        sawPlaying = false
        epochToken += 1
        resetContentProgress()
        resetProgressBar()  // v3.2.2 (UI only): the outgoing trailer's fill was
                            // sitting at ~100%; leaving it there while the next
                            // one buffers reads as a stuck player.
        loadingIndicator?.startAnimating()
        showChrome()        // v3.2.2 (UI only): pinned while the spinner is up
        // Pass the new epoch token; a pre-v3.2.0 proxy's trLoad ignores the
        // extra argument, so this stays backward compatible.
        let js = "(typeof window.trLoad==='function' && window.trLoad('\(id)', \(epochToken))) ? 'ok' : 'no'"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            if (result as? String) == "ok" {
                // Gapless swap: the SAME page just answered us, so its
                // liveness is already proven — only the hard cap and the
                // error path apply until the new video reaches PLAYING.
                self.receivedAnyMessage = true
                self.sawYtSignal = true
                self.startWatchdog() // await the new video's PLAYING event
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
        // v3.2.2: cross-fade rather than snap. Assigning .text directly made
        // the header flick to a different movie mid-session, which read as a
        // rendering glitch instead of a channel change.
        let newTitle = videoTitle.isEmpty ? "Trailer" : videoTitle
        if let label = titleLabel {
            UIView.transition(with: label, duration: 0.28, options: [.transitionCrossDissolve],
                              animations: { label.text = newTitle }, completion: nil)
        }
        // v3.2.2: a soft tap marks the moment the channel changes. An
        // auto-advance previously had no feedback in the hand at all, so a
        // trailer ending and the next one starting felt like the same event as
        // a stall. Fires for every in-place advance, including the ones caused
        // by an unplayable video — the user still needs to know it moved.
        fireHaptic(softHaptic)
        refreshSkipAffordance()
        // Tell JS: we advanced in place. JS shifts its queue, updates the
        // metadata panel beneath the modal, and enqueues the next key.
        onEvent("trailerEvent", ["event": reason, "cause": cause, "from": played, "youtubeKey": next])
        swapVideo(next)
    }

    /// v3.2.2: the faked disabled look is gone.
    ///
    /// The old code dimmed Skip to alpha 0.55 whenever nothing was primed. That
    /// was a lie: Skip has ALWAYS worked with nothing primed — it just exits so
    /// JS can advance the queue and reopen, instead of chaining in place. A
    /// control that looks disabled but isn't teaches the user not to trust the
    /// chrome, and it also fails the brief's "replace the faked alpha with real
    /// isEnabled" only in letter: the honest translation of "it still works" is
    /// enabled and fully opaque, not isEnabled = false, which would take
    /// working functionality away. So: always enabled, no alpha games, and the
    /// only thing that distinguishes the two outcomes is the VoiceOver hint,
    /// which is where a difference this subtle actually belongs.
    private func refreshSkipAffordance() {
        guard let button = skipButton else { return }
        button.isEnabled = true
        button.accessibilityHint = (nextVideoId != nil)
            ? "Plays the next trailer"
            : "Closes the player and moves on to the next trailer"
    }

    /// Impact generators fire late unless they have been warmed, so re-prepare
    /// after every hit — the next advance or Skip is then instant.
    private func fireHaptic(_ generator: UIImpactFeedbackGenerator) {
        generator.impactOccurred()
        generator.prepare()
    }

    @objc private func doneTapped() {
        finish(reason: "user")
    }

    @objc private func muteTapped() {
        setMuted(!isMuted)
        // v3.2.2: touching a control restarts the chrome's idle clock, so the
        // header does not fade out from under a user who is actively using it.
        scheduleChromeAutoHide()
        // Keep the JS side's muted state in sync with the in-player toggle.
        onEvent("trailerEvent", ["event": "muteChanged", "muted": isMuted])
    }

    /// External close (plugin closeTrailer / app backgrounded). Resolves the
    /// pending openTrailer call via onDismiss like any other finish.
    func finishExternally(reason: String) {
        finish(reason: reason)
    }

    @objc private func skipTapped() {
        // v3.2.2: a crisp .light tap acknowledges the press itself, distinct in
        // character from the duller .soft thud that marks the advance a beat
        // later — the press is the user's action, the advance is the app's
        // answer, and they should not feel like the same event.
        fireHaptic(lightHaptic)
        scheduleChromeAutoHide()
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
        // v3.2.2: the chrome idle timer retains self until it fires, and the
        // backdrop download would otherwise keep running for a player that no
        // longer exists.
        cancelChromeAutoHide()
        backdropSafetyTimer?.invalidate(); backdropSafetyTimer = nil
        backdropTask?.cancel(); backdropTask = nil
        releaseMessageHandler()
        let played = videoId
        DispatchQueue.main.async { [weak self] in
            self?.onDismiss(reason, played)
            self?.dismiss(animated: true)
        }
    }

    /// Break the WKUserContentController -> handler retain cycle. The content
    /// controller holds its script-message handler STRONGLY, so without this
    /// every session leaked the whole VC + WKWebView (and the proxy page kept
    /// heartbeating into a dead handler forever). Idempotent.
    private func releaseMessageHandler() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "trailerEvent")
    }

    /// Safety net: if the VC disappears through any path that didn't go
    /// through finish() (OS-level dismissal, parent teardown), still resolve
    /// the pending call so the JS side never awaits a dead modal.
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // v3.2.2: unconditional — the chrome timer, the backdrop safety timer
        // and the artwork download must not outlive the view on ANY teardown
        // path, including the ones that already went through finish().
        cancelChromeAutoHide()
        backdropSafetyTimer?.invalidate(); backdropSafetyTimer = nil
        backdropTask?.cancel(); backdropTask = nil
        if !didFinish && (isBeingDismissed || presentingViewController == nil) {
            didFinish = true
            watchdogTimer?.invalidate(); watchdogTimer = nil
            endConfirmTimer?.invalidate(); endConfirmTimer = nil
            releaseMessageHandler()
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
        // v3.2.2 (UI only): the chrome was pinned while the spinner was up; the
        // page is up now, so start the idle clock. The poster backdrop
        // deliberately does NOT retire here — navigation completing only proves
        // the page exists, and the buffering that follows is exactly when a
        // black stage feels broken. See markStageLive().
        scheduleChromeAutoHide()
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

        // Drop stale-epoch messages: a v3.2.0+ proxy echoes the epoch token we
        // handed it, so anything from a PREVIOUS video (postMessage delivery is
        // async across load/swap boundaries) is discarded before it can pollute
        // liveness flags or end-detection state. No echo = older proxy = accept.
        if let e = numberValue(body["e"]), Int(e) != epochToken { return }

        // Any proxy message proves the PAGE is alive (watchdog rule 1).
        receivedAnyMessage = true

        switch kind {
        case "pageLoaded", "iframeLoaded":
            // Informational; just confirms the proxy page is alive.
            print("[TrailerPlayer] proxy event: \(kind)")

        case "ready":
            // The YT player itself has spoken (watchdog rule 2).
            sawYtSignal = true
            print("[TrailerPlayer] YT.Player onReady")
            applyPlaylist()

        case "hb":
            // v3.2.0 proxy heartbeat: 1s liveness + progress + the proxy's own
            // content confirmation. Old native builds never see this; old
            // proxies never send it — both directions degrade gracefully.
            if (body["yt"] as? Bool) == true { sawYtSignal = true }
            if (body["cc"] as? Bool) == true { hbContentConfirmed = true }
            noteProgressIfMoved(ingestProgress(t: numberValue(body["t"]), d: numberValue(body["d"])))
            // v3.2.2 (UI ONLY): the heartbeat is the only clock we have, so the
            // progress line rides it — but ONLY once contentConfirmedNow() says
            // that clock belongs to the trailer. Without that gate a pre-roll
            // ad would fill the bar and reset it, which is worse than no bar.
            // This reads contentConfirmedNow(); it does not change it.
            if contentConfirmedNow() { syncProgressFromClock() }

        case "meta":
            // v3.2.0 proxy: content duration pinned from initialDelivery
            // BEFORE any ad played — the ground truth that gates the
            // end-detection fast-path against long ads.
            sawYtSignal = true
            if let p = numberValue(body["pin"]), p > 0 { pinnedDuration = p }

        case "stateChange":
            // 1=PLAYING, 0=ENDED, 2=PAUSED, 3=BUFFERING, 5=CUED
            sawYtSignal = true
            let state = (body["state"] as? Int) ?? -99
            // The v3.1.0+ proxy also sends the player's current time / duration
            // so we can tell a real end from a pre-roll ad boundary. Older
            // proxies omit these; the confirm timer covers that case.
            noteProgressIfMoved(ingestProgress(t: numberValue(body["t"]), d: numberValue(body["d"])))
            // v3.2.1 proxies mark a PLAYING they synthesised from observed
            // playback progress, sent so that pre-v3.2.0 builds (which only
            // ever cancel their watchdog on a stateChange:1) survive a silent
            // pre-roll ad. It is real evidence of liveness, but it is not the
            // YT player declaring itself started, so we keep our own watchdog
            // armed — the heartbeat rules and the 75s hard cap are stricter.
            let synthesised = (body["syn"] as? Bool) == true
            if state == 1 || state == 3 {
                // PLAYING or BUFFERING: playback (re)started, so any pending
                // "ended" was a pre-roll ad boundary — cancel it.
                cancelEndConfirm()
                // ...and if we were waiting to see whether YouTube would move
                // to the next playlist item, this is it doing exactly that.
                if playlistActive && playlistWatchTimer != nil { playlistDidAdvance() }
                if state == 1 {
                    // Real playback — hide any loading spinner (a gapless
                    // trLoad swap fires no navigation event) and tell JS.
                    loadingIndicator?.stopAnimating()
                    // v3.2.2 (UI ONLY): playback is live, so the poster stage
                    // comes down, and the chrome can start its idle clock now
                    // that the spinner is gone. NOTE this is deliberately
                    // OUTSIDE the `if !synthesised` check below — a proxy-
                    // synthesised PLAYING is still evidence that pixels are
                    // moving, and the poster must not outlive that even though
                    // the watchdog stays armed. See markStageLive().
                    markStageLive()
                    scheduleChromeAutoHide()
                    onEvent("trailerEvent", ["event": "started", "youtubeKey": videoId])
                    if !synthesised {
                        // The player itself reported PLAYING: retire the
                        // watchdog so a healthy long trailer is never dismissed.
                        sawPlaying = true
                        watchdogTimer?.invalidate(); watchdogTimer = nil
                    }
                }
            } else if state == 0 {
                // Trailer *or a pre-roll ad* finished. Confirm it's a real end
                // before advancing — see handleEndCandidate().
                handleEndCandidate()
            }

        case "error":
            sawYtSignal = true
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
