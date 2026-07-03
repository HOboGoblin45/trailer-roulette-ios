//
//  TrailerPlayer.m
//  Capacitor plugin registration. Capacitor reads this Objective-C macro
//  to expose the Swift class to the JS bridge under the name "TrailerPlayer".
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(TrailerPlayer, "TrailerPlayer",
    CAP_PLUGIN_METHOD(openTrailer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enqueueNext, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setMuted, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(closeTrailer, CAPPluginReturnPromise);
)
