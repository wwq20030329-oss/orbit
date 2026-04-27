import '../theme.css';
import * as React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Fonts from 'expo-font';
import * as Notifications from 'expo-notifications';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { AuthProvider } from '@/auth/AuthContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SidebarNavigator } from '@/components/SidebarNavigator';
import sodium from '@/encryption/libsodium.lib';
import { View, Platform, Linking } from 'react-native';
import { ModalProvider } from '@/modal';
import { PostHogProvider } from 'posthog-react-native';
import { tracking } from '@/track/tracking';
import { syncRestore } from '@/sync/sync';
import { useTrackScreens } from '@/track/useTrackScreens';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { StatusBarProvider } from '@/components/StatusBarProvider';
// import * as SystemUI from 'expo-system-ui';
import { initConsoleLogging, setConsoleOutputEnabled } from '@/utils/consoleLogging';
import { useLocalSetting } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { AsyncLock } from '@/utils/lock';
import { getSessionIdentifierFromNotificationResponse } from '@/utils/notificationRouting';
import { navigateToSession } from '@/hooks/useNavigateToSession';
import { applyVoiceUpsellOverride } from '@/realtime/voiceExperiment';
import { useAuth } from '@/auth/AuthContext';
import { approveAccountLinkUrl, isAccountLinkUrl } from '@/auth/accountLinkUrl';
import { Modal } from '@/modal';
import { t } from '@/text';

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// Setup Android notification channel (required for Android 8.0+)
if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
    });
}

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary,
} from 'expo-router';

// Configure splash screen
SplashScreen.setOptions({
    fade: true,
    duration: 300,
})
SplashScreen.preventAutoHideAsync();

// Set window background color - now handled by Unistyles
// SystemUI.setBackgroundColorAsync('white');

// Remote logging to local log server (configured via Dev > Log Server setting)
initConsoleLogging()

// Component to apply horizontal safe area padding
function HorizontalSafeAreaWrapper({ children }: { children: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={{
            flex: 1,
            paddingLeft: insets.left,
            paddingRight: insets.right
        }}>
            {children}
        </View>
    );
}

let lock = new AsyncLock();
let loaded = false;

function stringifyNotificationPayload(value: unknown): string {
    try {
        const serialized = JSON.stringify(value, null, 2);
        return serialized ?? String(value);
    } catch (error) {
        return `[unserializable notification payload: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}

async function loadFonts() {
    await lock.inLock(async () => {
        if (loaded) {
            return;
        }
        loaded = true;
        await Fonts.loadAsync({
            SpaceMono: require('@/assets/fonts/SpaceMono-Regular.ttf'),
            'IBMPlexSans-Regular': require('@/assets/fonts/IBMPlexSans-Regular.ttf'),
            'IBMPlexSans-Italic': require('@/assets/fonts/IBMPlexSans-Italic.ttf'),
            'IBMPlexSans-SemiBold': require('@/assets/fonts/IBMPlexSans-SemiBold.ttf'),
            'IBMPlexMono-Regular': require('@/assets/fonts/IBMPlexMono-Regular.ttf'),
            'IBMPlexMono-Italic': require('@/assets/fonts/IBMPlexMono-Italic.ttf'),
            'IBMPlexMono-SemiBold': require('@/assets/fonts/IBMPlexMono-SemiBold.ttf'),
            'BricolageGrotesque-Bold': require('@/assets/fonts/BricolageGrotesque-Bold.ttf'),
            ...FontAwesome.font,
        });
    });
}

function getDevEnvironmentCredentials(): AuthCredentials | null {
    if (!__DEV__) {
        return null;
    }

    const token = process.env.EXPO_PUBLIC_DEV_TOKEN;
    const secret = process.env.EXPO_PUBLIC_DEV_SECRET;
    if (!token || !secret) {
        return null;
    }

    return { token, secret };
}

function AccountLinkHandler() {
    const auth = useAuth();
    const handledUrls = React.useRef<Set<string>>(new Set());

    const handleUrl = React.useCallback(async (url: string | null) => {
        if (!url || !isAccountLinkUrl(url) || handledUrls.current.has(url)) {
            return;
        }

        handledUrls.current.add(url);

        if (!auth.credentials?.token || !auth.credentials.secret) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'));
            return;
        }

        try {
            await approveAccountLinkUrl(auth.credentials, url);
            Modal.alert(t('common.success'), t('modals.deviceLinkedSuccessfully'));
        } catch (error) {
            console.error('Failed to approve account link from deep link:', error);
            Modal.alert(t('common.error'), t('modals.failedToLinkDevice'));
        }
    }, [auth.credentials]);

    React.useEffect(() => {
        let active = true;

        void Linking.getInitialURL().then((url) => {
            if (active) {
                void handleUrl(url);
            }
        }).catch((error) => {
            console.log('Failed to read initial URL:', error);
        });

        const subscription = Linking.addEventListener('url', (event) => {
            void handleUrl(event.url);
        });

        return () => {
            active = false;
            subscription.remove();
        };
    }, [handleUrl]);

    return null;
}

export default function RootLayout() {
    const router = useRouter();
    const { theme } = useUnistyles();
    const navigationTheme = React.useMemo(() => {
        if (theme.dark) {
            return {
                ...DarkTheme,
                colors: {
                    ...DarkTheme.colors,
                    background: theme.colors.groupped.background,
                }
            }
        }
        return {
            ...DefaultTheme,
            colors: {
                ...DefaultTheme.colors,
                background: theme.colors.groupped.background,
            }
        };
    }, [theme.dark]);

    //
    // Init sequence
    //
    const [initState, setInitState] = React.useState<{ credentials: AuthCredentials | null } | null>(null);
    React.useEffect(() => {
        let isMounted = true;
        (async () => {
            let credentials: AuthCredentials | null = null;
            try {
                await Promise.all([
                    loadFonts(),
                    sodium.ready,
                ]);

                credentials = await TokenStorage.getCredentials();
                const devCredentials = getDevEnvironmentCredentials();

                if (devCredentials) {
                    const credentialsChanged = credentials?.token !== devCredentials.token
                        || credentials?.secret !== devCredentials.secret;

                    if (credentialsChanged) {
                        const saved = await TokenStorage.setCredentials(devCredentials);
                        if (saved) {
                            credentials = devCredentials;
                        }
                    }

                }

                if (isMounted) {
                    setInitState({ credentials });
                }

                if (credentials) {
                    void syncRestore(credentials).catch((error) => {
                        // Restoring cached sync state should not block the app from opening.
                        console.error('Sync restore failed during startup:', error);
                    });
                }
            } catch (error) {
                console.error('Error initializing:', error);
                if (isMounted) {
                    setInitState({ credentials: null });
                }
            }
        })();

        return () => {
            isMounted = false;
        };
    }, []);

    React.useEffect(() => {
        if (initState) {
            void SplashScreen.hideAsync();
        }
    }, [initState]);

    const handledNotificationIds = React.useRef<Set<string>>(new Set());
    const handleNotificationResponse = React.useCallback(async (response: Notifications.NotificationResponse | null) => {
        if (!response) {
            console.log('[PUSH ROUTING] Notification response is null');
            return;
        }

        console.log('[PUSH ROUTING] Full notification response:\n' + stringifyNotificationPayload(response));

        const responseId = response.notification.request.identifier;
        if (handledNotificationIds.current.has(responseId)) {
            console.log(`[PUSH ROUTING] Duplicate notification response ignored: ${responseId}`);
            return;
        }

        handledNotificationIds.current.add(responseId);

        try {
            if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
                console.log(`[PUSH ROUTING] Ignoring non-default action: ${response.actionIdentifier}`);
                return;
            }

            console.log(
                '[PUSH ROUTING] notification.request.content.data:\n' +
                stringifyNotificationPayload(response.notification.request.content.data)
            );
            const sessionIdentifier = getSessionIdentifierFromNotificationResponse(response);
            console.log(`[PUSH ROUTING] Computed session identifier: ${sessionIdentifier ?? 'null'}`);
            if (!sessionIdentifier) {
                console.log('[PUSH ROUTING] No session identifier found in notification.request.content.data');
                return;
            }

            console.log(`[PUSH ROUTING] Navigating to session: ${sessionIdentifier}`);
            navigateToSession(router, sessionIdentifier);
        } finally {
            try {
                await Notifications.clearLastNotificationResponseAsync();
            } catch (error) {
                console.log('Failed to clear last notification response:', error);
            }
        }
    }, [router]);

    React.useEffect(() => {
        if (!initState) {
            return;
        }

        let active = true;
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            void handleNotificationResponse(response);
        });

        void (async () => {
            try {
                const response = await Notifications.getLastNotificationResponseAsync();
                if (active) {
                    await handleNotificationResponse(response);
                }
            } catch (error) {
                console.log('Failed to read last notification response:', error);
            }
        })();

        return () => {
            active = false;
            subscription.remove();
        };
    }, [handleNotificationResponse, initState]);


    // Track the screens
    useTrackScreens()

    // Sync console output toggle from Dev screen
    const consoleLoggingEnabled = useLocalSetting('consoleLoggingEnabled');
    const devModeEnabled = __DEV__ || useLocalSetting('devModeEnabled');
    const voiceUpsellOverride = useLocalSetting('voiceUpsellOverride');
    React.useEffect(() => {
        setConsoleOutputEnabled(consoleLoggingEnabled);
    }, [consoleLoggingEnabled]);

    React.useEffect(() => {
        if (!devModeEnabled || !voiceUpsellOverride) {
            return;
        }
        applyVoiceUpsellOverride(voiceUpsellOverride);
    }, [devModeEnabled, voiceUpsellOverride]);

    //
    // Not inited
    //

    if (!initState) {
        return null;
    }

    //
    // Boot
    //

    let providers = (
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <AuthProvider initialCredentials={initState.credentials}>
                        <ThemeProvider value={navigationTheme}>
                            <StatusBarProvider />
                            <ModalProvider>
                                <AccountLinkHandler />
                                <RealtimeProvider>
                                    <HorizontalSafeAreaWrapper>
                                        <SidebarNavigator />
                                    </HorizontalSafeAreaWrapper>
                                </RealtimeProvider>
                            </ModalProvider>
                        </ThemeProvider>
                    </AuthProvider>
                </GestureHandlerRootView>
            </KeyboardProvider>
        </SafeAreaProvider>
    );
    if (tracking) {
        providers = (
            <PostHogProvider client={tracking}>
                {providers}
            </PostHogProvider>
        );
    }

    return providers;
}
