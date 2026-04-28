//
//  AirplayPlugin.m
//  Capacitor plugin registration. Capacitor reads this Objective-C macro to
//  expose the Swift class to the JS bridge under the name "AirplayPlugin".
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AirplayPlugin, "AirplayPlugin",
    CAP_PLUGIN_METHOD(presentRoutePicker, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isAirPlayActive, CAPPluginReturnPromise);
)
