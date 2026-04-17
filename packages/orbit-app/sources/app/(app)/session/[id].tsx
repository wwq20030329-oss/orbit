import * as React from 'react';
import { useRoute } from '@react-navigation/native';
import { ActivityIndicator, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

import { SessionView } from '@/-session/SessionView';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { replaceToSession } from '@/hooks/useNavigateToSession';
import { getSessionRoutePlaceholder } from '@/utils/sessionRoutePlaceholder';
import {
    getInitialSessionRouteResolution,
    resolveSessionRoute,
} from '@/utils/sessionRouteResolution';
import { t } from '@/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@/utils/responsive';

export default React.memo(() => {
    const route = useRoute();
    const router = useRouter();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const sessionId = (route.params! as any).id as string;
    const initialRouteResolution = React.useMemo(() => (
        getInitialSessionRouteResolution(sessionId)
    ), [sessionId]);
    const routePlaceholder = React.useMemo(() => (
        getSessionRoutePlaceholder(sessionId)
    ), [sessionId]);
    const [resolvedSessionId, setResolvedSessionId] = React.useState<string | null>(initialRouteResolution.resolvedSessionId);
    const [displaySessionId, setDisplaySessionId] = React.useState<string | null>(initialRouteResolution.displaySessionId);
    const [isResolving, setIsResolving] = React.useState(initialRouteResolution.resolvedSessionId === null);

    React.useEffect(() => {
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
                    replaceToSession(router, nextSessionId);
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
    }, [router, sessionId]);

    const provisionalSessionId = resolvedSessionId ?? displaySessionId;
    if (!provisionalSessionId) {
        return (
            <>
                <ChatHeaderView
                    title={routePlaceholder?.title ?? t('common.loading')}
                    subtitle={routePlaceholder?.subtitle}
                    flavor={routePlaceholder?.flavor ?? null}
                    isConnected={false}
                    onBackPress={() => router.back()}
                />
                <View
                    style={{
                        flex: 1,
                        paddingTop: safeArea.top + headerHeight,
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 12,
                    }}
                >
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                        {t('terminal.connecting')}
                    </Text>
                </View>
            </>
        );
    }

    return (
        <SessionView
            id={provisionalSessionId}
            nativeConnectionPending={isResolving && resolvedSessionId === null}
        />
    );
});
