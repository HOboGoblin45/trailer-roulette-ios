//
//  AirplayPlugin.swift
//  Trailer Roulette — AirPlay route picker
//
//  Wraps AVRoutePickerView so JS can present the system AirPlay picker and
//  observe AirPlay state.
//
//  Registration (v3.4.1): the comment here used to say Capacitor auto-registers
//  this via the CAP_PLUGIN macro. That mechanism was removed in Capacitor 6 —
//  the bridge now binds only classes conforming to CAPBridgedPlugin. Without it
//  registerPlugin() silently resolved to the web fallback, whose
//  presentRoutePicker returns { presented: false } and does nothing, so the
//  AirPlay button — one of the app's two buttons — has been dead on device.
//

import Foundation
import AVKit
import Capacitor

@objc(AirplayPlugin)
public class AirplayPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "AirplayPlugin"
    public let jsName = "AirplayPlugin"          // must match registerPlugin('AirplayPlugin')
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "presentRoutePicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAirPlayActive", returnType: CAPPluginReturnPromise),
    ]


    private var routePickerView: AVRoutePickerView?

    @objc func presentRoutePicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let bridgeVC = self.bridge?.viewController else {
                call.reject("No bridge view controller")
                return
            }

            // Reuse the existing picker if we created one previously.
            let picker: AVRoutePickerView
            if let existing = self.routePickerView {
                picker = existing
            } else {
                picker = AVRoutePickerView(frame: .zero)
                picker.activeTintColor = UIColor(red: 0.239, green: 0.647, blue: 0.957, alpha: 1.0) // light-blue #3DA5F4
                picker.tintColor = .white
                picker.prioritizesVideoDevices = true
                picker.isHidden = true
                bridgeVC.view.addSubview(picker)
                self.routePickerView = picker
            }

            // Trigger the picker by sending a touch-up event to its embedded UIButton.
            for subview in picker.subviews {
                if let button = subview as? UIButton {
                    button.sendActions(for: .touchUpInside)
                    call.resolve([
                        "presented": true,
                        "source": "AVRoutePickerView"
                    ])
                    return
                }
            }
            call.resolve(["presented": false, "reason": "no-button"])
        }
    }

    @objc func isAirPlayActive(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        let isActive = session.currentRoute.outputs.contains { output in
            output.portType == .airPlay
        }
        call.resolve(["active": isActive])
    }
}
