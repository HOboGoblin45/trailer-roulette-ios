//
//  AirplayPlugin.swift
//  Trailer Roulette — AirPlay route picker
//
//  Wraps AVRoutePickerView so JS can present the system AirPlay picker and
//  observe AirPlay state. Capacitor auto-registers this plugin via the
//  CAP_PLUGIN macro in AirplayPlugin.m.
//

import Foundation
import AVKit
import Capacitor

@objc(AirplayPlugin)
public class AirplayPlugin: CAPPlugin {

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
                picker.activeTintColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 1.0) // gold
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
