import * as React from 'react';
import { DrawerActions, useNavigation, useRoute } from '@react-navigation/native';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

import { SessionView } from '@/-session/SessionView';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { PhoneConversationShell } from '@/components/PhoneConversationShell';
import { replaceToSession } from '@/hooks/useNavigateToSession';
import { storage } from '@/sync/storage';
import { replaceToPhoneWorkspaceSession } from '@/utils/phoneWorkspaceNavigation';
import { getSessionRoutePlaceholder } from '@/utils/sessionRoutePlaceholder';
import {
    getInitialSessionRouteResolution,
    resolveSessionRoute,
} from '@/utils/sessionRouteResolution';
import { t } from '@/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight, useIsTablet } from '@/utils/responsive';

function shouldPreserveArchivedHistorySession(
    session: ReturnType<typeof storage.getState>['sessions'][string] | null,
    historyVariant: boolean,
): boolean {
    if (!historyVariant || !session) {
        return false;
    }

    return session.metadata?.lifecycleState === 'archived'
        && Boolean(
            session.metadata?.claudeSessionId
            || session.metadata?.codexThreadId
            || session.metadata?.geminiSessionId
            || (
                session.metadata?.nativeHistorySourceTool
                && session.metadata?.nativeHistorySourceBackendId
            ),
        );
}

export default React.memo(() => {
    const route = useRoute();
    const navigation = useNavigation();
    const router = useRouter();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const sessionId = (route.params! as any).id as string;
    const homeVariant = (route.params! as any).home === '1';
    const historyVariant = (route.params! as any).history === '1';
    const usePhoneConversationSession = !isTablet && (Platform.OS === 'ios' || Platform.OS === 'android');
    const routedSession = storage((state) => state.sessions[sessionId] ?? null);
    const preserveArchivedHistorySession = React.useMemo(
        () => shouldPreserveArchivedHistorySession(routedSession, historyVariant),
        [historyVariant, routedSession],
    );
    const initialRouteResolution = React.useMemo(() => {
        if (preserveArchivedHistorySession) {
            return {
                initialSessionId: sessionId,
                displaySessionId: sessionId,
                resolvedSessionId: sessionId,
                shouldReplaceRoute: false,
            };
        }

        return getInitialSessionRouteResolution(sessionId);
    }, [preserveArchivedHistorySession, sessionId]);
    const routePlaceholder = React.useMemo(() => (
        getSessionRoutePlaceholder(sessionId)
    ), [sessionId]);
    const [resolvedSessionId, setResolvedSessionId] = React.useState<string | null>(initialRouteResolution.resolvedSessionId);
    const [displaySessionId, setDisplaySessionId] = React.useState<string | null>(initialRouteResolution.displaySessionId);
    const [isResolving, setIsResolving] = React.useState(initialRouteResolution.resolvedSessionId === null);

    React.useEffect(() => {
        if (preserveArchivedHistorySession) {
            setResolvedSessionId(sessionId);
            setDisplaySessionId(sessionId);
            setIsResolving(false);
            return;
        }

        const nextInitialRouteResolution = getInitialSessionRouteResolution(sessionId);
        setResolvedSessionId(nextInitialRouteResolution.resolvedSessionId);
        setDisplaySessionId(nextInitialRouteResolution.displaySessionId);
        setIsResolving(nextInitialRouteResolution.resolvedSessionId === null);

        let cancelled = false;

        (async () => {
            try {
                const routeResolution = await resolveSessionRoute(sessionId);
                if (cancelled) {
                    return;
                }

                const nextSessionId = routeResolution.resolvedSessionId;
                if (!nextSessionId) {
                    if (routeResolution.displaySessionId) {
                        setResolvedSessionId(routeResolution.displaySessionId);
                        setDisplaySessionId(routeResolution.displaySessionId);
                        setIsResolving(false);
                        return;
                    }

                    router.replace('/');
                    return;
                }

                setResolvedSessionId(nextSessionId);
                setDisplaySessionId(nextSessionId);
                setIsResolving(false);

                if (routeResolution.shouldReplaceRoute) {
                    if (usePhoneConversationSession) {
                        if (storage.getState().sessions[nextSessionId]) {
                            replaceToPhoneWorkspaceSession(router, nextSessionId);
                        }
                        return;
                    }

                    if (homeVariant) {
                        router.replace(`/session/${encodeURIComponent(nextSessionId)}?home=1`);
                    } else {
                        replaceToSession(router, nextSessionId);
                    }
                }
            } catch {
                if (cancelled) {
                    return;
                }

                if (!nextInitialRouteResolution.resolvedSessionId) {
                    if (nextInitialRouteResolution.displaySessionId) {
                        setResolvedSessionId(nextInitialRouteResolution.displaySessionId);
                        setDisplaySessionId(nextInitialRouteResolution.displaySessionId);
                        setIsResolving(false);
                        return;
                    }

                    router.replace('/');
                    return;
                }

                setResolvedSessionId(nextInitialRouteResolution.resolvedSessionId);
                setDisplaySessionId(nextInitialRouteResolution.displaySessionId);
                setIsResolving(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [homeVariant, preserveArchivedHistorySession, router, sessionId, usePhoneConversationSession]);

    const provisionalSessionId = resolvedSessionId ?? displaySessionId;
    const hasProvisionalSession = storage((state) => (
        provisionalSessionId ? Boolean(state.sessions[provisionalSessionId]) : false
    ));
    const redirectedPhoneSessionIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!usePhoneConversationSession || !provisionalSessionId) {
            return;
        }

        if (!hasProvisionalSession) {
            return;
        }

        if (redirectedPhoneSessionIdRef.current === provisionalSessionId) {
            return;
        }

        redirectedPhoneSessionIdRef.current = provisionalSessionId;
        replaceToPhoneWorkspaceSession(router, provisionalSessionId);
    }, [hasProvisionalSession, provisionalSessionId, router, usePhoneConversationSession]);

    if (!provisionalSessionId) {
        if (usePhoneConversationSession) {
            return (
                <PhoneConversationShell title={routePlaceholder?.title ?? t('common.loading')}>
                    <View
                        style={{
                            flex: 1,
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 12,
                            paddingHorizontal: 24,
                        }}
                    >
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                            {t('terminal.connecting')}
                        </Text>
                        {routePlaceholder?.previewText && (
                            <View
                                style={{
                                    width: '100%',
                                    maxWidth: 520,
                                    marginTop: 8,
                                    borderRadius: 16,
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                    backgroundColor: theme.colors.surfaceHigh,
                                }}
                            >
                                <Text
                                    numberOfLines={6}
                                    style={{
                                        color: theme.colors.textSecondary,
                                        fontSize: 14,
                                        lineHeight: 20,
                                    }}
                                >
                                    {routePlaceholder.previewText}
                                </Text>
                            </View>
                        )}
                    </View>
                </PhoneConversationShell>
            );
        }

        return (
            <>
                <ChatHeaderView
                    title={routePlaceholder?.title ?? t('common.loading')}
                    subtitle={routePlaceholder?.subtitle}
                    flavor={routePlaceholder?.flavor ?? null}
                    isConnected={false}
                    onBackPress={() => {
                        if (homeVariant) {
                            navigation.dispatch(DrawerActions.openDrawer());
                            return;
                        }

                        router.back();
                    }}
                    leadingIcon={homeVariant ? 'menu' : 'back'}
                />
                <View
                    style={{
                        flex: 1,
                        paddingTop: safeArea.top + headerHeight,
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 24,
                    }}
                >
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                        {t('terminal.connecting')}
                    </Text>
                    {routePlaceholder?.previewText && (
                        <View
                            style={{
                                width: '100%',
                                maxWidth: 520,
                                marginTop: 8,
                                borderRadius: 16,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: theme.colors.surfaceHigh,
                            }}
                        >
                            <Text
                                numberOfLines={6}
                                style={{
                                    color: theme.colors.textSecondary,
                                    fontSize: 14,
                                    lineHeight: 20,
                                }}
                            >
                                {routePlaceholder.previewText}
                            </Text>
                        </View>
                    )}
                </View>
            </>
        );
    }

    return (
        usePhoneConversationSession ? (
            <PhoneConversationShell title={routePlaceholder?.title ?? t('common.loading')}>
                <View
                    style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 24,
                    }}
                >
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                        {t('terminal.connecting')}
                    </Text>
                </View>
            </PhoneConversationShell>
        ) : (
            <SessionView
                id={provisionalSessionId}
                nativeConnectionPending={isResolving && resolvedSessionId === null}
                headerVariant={homeVariant ? 'home' : 'default'}
            />
        )
    );
});
