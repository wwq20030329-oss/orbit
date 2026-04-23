import { buildIosTransportSecurity } from './config/iosTransportSecurity.js';

const variant = process.env.APP_ENV || 'development';
const name = {
    development: "Orbit (dev)",
    preview: "Orbit (preview)",
    production: "Orbit"
}[variant];
const slug = {
    development: "orbit-dev",
    preview: "orbit-preview",
    production: "orbit",
}[variant];
const bundleId = {
    development: "com.orbit.app.dev",
    preview: "com.orbit.app.preview",
    production: "com.orbit.app"
}[variant];
const urlScheme = {
    development: "orbitdev",
    preview: "orbitpreview",
    production: "orbit",
}[variant];
// ElevenLabs agent id is environment-specific. Hard-coding the production
// agent for every variant (as older builds did) means dev and preview
// sessions consume the production agent's quota and pollute its analytics.
// We honour the following precedence:
//   1. EXPO_PUBLIC_ELEVENLABS_AGENT_ID_<VARIANT>  (e.g. ..._DEVELOPMENT)
//   2. EXPO_PUBLIC_ELEVENLABS_AGENT_ID            (generic override)
//   3. The variant-specific default baked in below.
// The production default is still the original shared agent; dev/preview
// fall back to it only if no dedicated agent is configured.
const productionElevenLabsAgentId = 'agent_6701k211syvvegba4kt7m68nxjmw';
const elevenLabsAgentEnvByVariant = {
    development: process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID_DEVELOPMENT,
    preview: process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID_PREVIEW,
    production: process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID_PRODUCTION,
};
const elevenLabsAgentId =
    elevenLabsAgentEnvByVariant[variant] ||
    process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ||
    productionElevenLabsAgentId;
const consoleLoggingDefault = {
    development: true,
    preview: true,
    production: false,
}[variant];
const publicAppUrl = process.env.ORBIT_PUBLIC_APP_URL || process.env.ORBIT_WEBAPP_URL || (variant === 'production' ? 'https://app.orbit.engineering' : '');
const publicSiteUrl = process.env.ORBIT_PUBLIC_SITE_URL || (variant === 'production' ? 'https://orbit.engineering' : '');
const defaultServerUrl =
    process.env.EXPO_PUBLIC_SERVER_URL ||
    process.env.EXPO_PUBLIC_ORBIT_SERVER_URL ||
    process.env.ORBIT_DEV_SERVER_URL ||
    process.env.ORBIT_SERVER_URL ||
    'https://api.2003383.xyz';
const fallbackServerUrls = variant === 'production'
    ? []
    : ['http://192.227.228.53:3005'];
const updatesEnabled = variant === 'production';
const runtimeVersion = updatesEnabled ? '21' : `21-${variant}-local`;
const iosTransportSecurity = buildIosTransportSecurity({
    variant,
    serverUrls: [
        defaultServerUrl,
        ...fallbackServerUrls,
        process.env.EXPO_PUBLIC_SERVER_URL,
        process.env.EXPO_PUBLIC_ORBIT_SERVER_URL,
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
const notificationsPlugin = variant === 'production'
    ? [[
        "expo-notifications",
        {
            "enableBackgroundRemoteNotifications": true,
            "icon": "./sources/assets/images/icon-notification.png"
        }
    ]]
    : [];
const devClientPlugin = variant === 'production'
    ? []
    : [[
        "expo-dev-client",
        {
            launchMode: "launcher"
        }
    ]];

export default {
    expo: {
        name,
        slug,
        version: "1.7.0",
        runtimeVersion,
        orientation: "default",
        icon: "./sources/assets/images/icon.png",
        scheme: urlScheme,
        userInterfaceStyle: "automatic",
        ios: {
            supportsTablet: true,
            bundleIdentifier: bundleId,
            config: {
                // The app ships end-to-end encryption (tweetnacl / libsodium)
                // for message content confidentiality. Under US Export Admin
                // Regulations this is NOT exempt (ECCN 5D002). Setting true
                // means Apple will prompt for Export Compliance documentation
                // on first submission — typical paths are a BIS Year-End
                // Self-Classification Report, or the Mass Market exemption
                // (ERN / CCATS). See:
                // https://developer.apple.com/documentation/security/complying_with_encryption_export_regulations
                usesNonExemptEncryption: true
            },
            infoPlist: {
                NSAppTransportSecurity: iosTransportSecurity,
                NSMicrophoneUsageDescription: "Allow $(PRODUCT_NAME) to access your microphone for voice conversations with AI.",
                NSLocalNetworkUsageDescription: "Allow $(PRODUCT_NAME) to find and connect to local devices on your network.",
                NSBonjourServices: ["_http._tcp", "_https._tcp"]
            },
            privacyManifests: {
                NSPrivacyAccessedAPITypes: [
                    {
                        // File timestamp APIs (fs.stat/mtime) — used by file
                        // upload / artifact code paths that inspect local
                        // files before sending.
                        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
                        NSPrivacyAccessedAPITypeReasons: ["C617.1"]
                    },
                    {
                        // UserDefaults — MMKV and AsyncStorage libraries
                        // transitively read/write preferences.
                        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
                        NSPrivacyAccessedAPITypeReasons: ["CA92.1"]
                    },
                    {
                        // System boot time — posthog-react-native reads
                        // process uptime for analytics session tracking.
                        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
                        NSPrivacyAccessedAPITypeReasons: ["35F9.1"]
                    },
                    {
                        // Disk space — expo-file-system / upload code checks
                        // available free space before writing temp files.
                        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
                        NSPrivacyAccessedAPITypeReasons: ["E174.1"]
                    }
                ],
                NSPrivacyTracking: false,
                NSPrivacyTrackingDomains: [],
                NSPrivacyCollectedDataTypes: []
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
            ...devClientPlugin,
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
            ...notificationsPlugin,
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
                serverUrl: defaultServerUrl,
                // Fallback URLs are baked per variant. Production bundles
                // intentionally receive an EMPTY list — we never downgrade
                // to plain HTTP in the App Store build. See serverConfig.ts
                // for the runtime consumer.
                fallbackServerUrls,
                urlScheme,
                elevenLabsAgentId,
                consoleLoggingDefault,
                publicAppUrl,
                publicSiteUrl,
            }
        },
        owner: "orbit"
    }
};
