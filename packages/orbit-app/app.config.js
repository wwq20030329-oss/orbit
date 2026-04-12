import { buildIosTransportSecurity } from './config/iosTransportSecurity.js';

const variant = process.env.APP_ENV || 'development';
const name = {
    development: "Orbit (dev)",
    preview: "Orbit (preview)",
    production: "Orbit"
}[variant];
const bundleId = {
    development: "com.orbit.app.dev",
    preview: "com.orbit.app.preview",
    production: "com.orbit.app"
}[variant];
// const stagingElevenLabsAgentId = 'agent_7801k2c0r5hjfraa1kdbytpvs6yt';
const productionElevenLabsAgentId = 'agent_6701k211syvvegba4kt7m68nxjmw';
const elevenLabsAgentId = {
    development: productionElevenLabsAgentId,
    preview: productionElevenLabsAgentId,
    production: productionElevenLabsAgentId,
}[variant];
const consoleLoggingDefault = {
    development: true,
    preview: true,
    production: false,
}[variant];
const publicAppUrl = process.env.ORBIT_PUBLIC_APP_URL || process.env.ORBIT_WEBAPP_URL || (variant === 'production' ? 'https://app.orbit.engineering' : '');
const publicSiteUrl = process.env.ORBIT_PUBLIC_SITE_URL || (variant === 'production' ? 'https://orbit.engineering' : '');
const updatesEnabled = variant === 'production';
const runtimeVersion = updatesEnabled ? '21' : `21-${variant}-local`;
const iosTransportSecurity = buildIosTransportSecurity({
    variant,
    serverUrls: [
        process.env.EXPO_PUBLIC_SERVER_URL,
        process.env.EXPO_PUBLIC_ORBIT_SERVER_URL,
        process.env.EXPO_PUBLIC_HAPPY_SERVER_URL,
        process.env.ORBIT_DEV_SERVER_URL,
        process.env.ORBIT_SERVER_URL,
    ],
});
const publicAppConfig = (() => {
    if (!publicAppUrl) {
        return null;
    }

    try {
        return new URL(publicAppUrl);
    } catch {
        return null;
    }
})();
const publicAppHostname = publicAppConfig?.protocol === 'https:' ? publicAppConfig.hostname : null;
const associatedDomains = variant === 'production' && publicAppHostname ? [`applinks:${publicAppHostname}`] : [];
const intentFilters = variant === 'production' && publicAppHostname ? [
    {
        action: "VIEW",
        autoVerify: true,
        data: [
            {
                scheme: "https",
                host: publicAppHostname,
                pathPrefix: "/"
            }
        ],
        category: ["BROWSABLE", "DEFAULT"]
    }
] : [];

export default {
    expo: {
        name,
        slug: "orbit",
        version: "1.7.0",
        runtimeVersion,
        orientation: "default",
        icon: "./sources/assets/images/icon.png",
        scheme: "orbit",
        userInterfaceStyle: "automatic",
        ios: {
            supportsTablet: true,
            bundleIdentifier: bundleId,
            config: {
                usesNonExemptEncryption: false
            },
            infoPlist: {
                NSAppTransportSecurity: iosTransportSecurity,
                NSMicrophoneUsageDescription: "Allow $(PRODUCT_NAME) to access your microphone for voice conversations with AI.",
                NSLocalNetworkUsageDescription: "Allow $(PRODUCT_NAME) to find and connect to local devices on your network.",
                NSBonjourServices: ["_http._tcp", "_https._tcp"]
            },
            associatedDomains
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./sources/assets/images/icon-adaptive.png",
                monochromeImage: "./sources/assets/images/icon-monochrome.png",
                backgroundColor: "#18171C"
            },
            permissions: [
                "android.permission.RECORD_AUDIO",
                "android.permission.MODIFY_AUDIO_SETTINGS",
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.POST_NOTIFICATIONS",
            ],
            blockedPermissions: [
                "android.permission.ACTIVITY_RECOGNITION",
                // Not using external storage/media access for now — blocks Google Play photo/video permission declaration
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
            ],
            package: bundleId,
            googleServicesFile: "./google-services.json",
            intentFilters
        },
        web: {
            bundler: "metro",
            output: "single",
            favicon: "./sources/assets/images/favicon.png"
        },
        plugins: [
            require("./plugins/withEinkCompatibility.js"),
            [
                "expo-router",
                {
                    root: "./sources/app"
                }
            ],
            "expo-updates",
            "expo-asset",
            "expo-localization",
            "expo-mail-composer",
            "expo-secure-store",
            "expo-web-browser",
            "react-native-vision-camera",
            "react-native-audio-api",
            "@livekit/react-native-expo-plugin",
            "@config-plugins/react-native-webrtc",
            [
                "expo-audio",
                {
                    microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone for voice conversations."
                }
            ],
            [
                "expo-location",
                {
                    locationAlwaysAndWhenInUsePermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location.",
                    locationAlwaysPermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location.",
                    locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location."
                }
            ],
            [
                "expo-calendar",
                {
                    "calendarPermission": "Allow $(PRODUCT_NAME) to access your calendar to improve AI quality."
                }
            ],
            [
                "expo-camera",
                {
                    cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan QR codes and share photos with AI.",
                    microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone for voice conversations.",
                    recordAudioAndroid: true
                }
            ],
            [
                "expo-notifications",
                {
                    "enableBackgroundRemoteNotifications": true,
                    "icon": "./sources/assets/images/icon-notification.png"
                }
            ],
            [
                'expo-splash-screen',
                {
                    ios: {
                        backgroundColor: "#F2F2F7",
                        dark: {
                            backgroundColor: "#1C1C1E",
                        }
                    },
                    android: {
                        image: "./sources/assets/images/splash-android-light.png",
                        backgroundColor: "#F5F5F5",
                        dark: {
                            image: "./sources/assets/images/splash-android-dark.png",
                            backgroundColor: "#1e1e1e",
                        }
                    }
                }
            ]
        ],
        updates: updatesEnabled ? {
            url: "https://u.expo.dev/4558dd3d-cd5a-47cd-bad9-e591a241cc06",
            requestHeaders: {
                "expo-channel-name": "production"
            }
        } : {
            enabled: false,
            checkAutomatically: "NEVER",
            fallbackToCacheTimeout: 0
        },
        experiments: {
            typedRoutes: true
        },
        extra: {
            router: {
                root: "./sources/app"
            },
            eas: {
                projectId: "4558dd3d-cd5a-47cd-bad9-e591a241cc06"
            },
            app: {
                postHogKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
                revenueCatAppleKey: process.env.EXPO_PUBLIC_REVENUE_CAT_APPLE,
                revenueCatGoogleKey: process.env.EXPO_PUBLIC_REVENUE_CAT_GOOGLE,
                revenueCatStripeKey: process.env.EXPO_PUBLIC_REVENUE_CAT_STRIPE,
                elevenLabsAgentId,
                consoleLoggingDefault,
                publicAppUrl,
                publicSiteUrl,
            }
        },
        owner: "orbit"
    }
};
