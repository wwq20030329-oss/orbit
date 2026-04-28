import * as React from 'react';
import { View } from 'react-native';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { PhoneConversationSession } from '@/components/PhoneConversationSession';
import { PhoneNewSessionHome } from '@/components/PhoneNewSessionHome';
import { storage, usePhoneWorkspaceSessionIdMutable } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';

const TRANSITION_DURATION_MS = 180;

const stylesheet = StyleSheet.create(() => ({
    container: {
        flex: 1,
    },
    layer: {
        flex: 1,
    },
}));

export const PhoneSessionHome = React.memo(() => {
    const [activeSessionId] = usePhoneWorkspaceSessionIdMutable();
    const styles = stylesheet;
    const [displayedSessionId, setDisplayedSessionId] = React.useState<string | null>(activeSessionId);
    const transitionPhaseRef = React.useRef<'idle' | 'fading-out' | 'fading-in'>('idle');
    const commitDisplayedSession = React.useCallback((nextSessionId: string | null) => {
        React.startTransition(() => {
            setDisplayedSessionId(nextSessionId);
        });
    }, []);
    const setTransitionPhase = React.useCallback((phase: 'idle' | 'fading-out' | 'fading-in') => {
        transitionPhaseRef.current = phase;
    }, []);
    const transitionProgress = useSharedValue(1);
    const activeSessionTarget = storage(useShallow((state) => {
        if (!activeSessionId) {
            return {
                hasSession: false,
                hasPendingSeed: false,
            };
        }

        return {
            hasSession: Boolean(state.sessions[activeSessionId]),
            hasPendingSeed: Boolean(state.pendingPhoneConversationSeeds[activeSessionId]),
        };
    }));
    const isTargetReady = !activeSessionId || activeSessionTarget.hasSession || activeSessionTarget.hasPendingSeed;

    React.useEffect(() => {
        if (activeSessionId === displayedSessionId) {
            return;
        }
        if (!isTargetReady) {
            return;
        }
        if (transitionPhaseRef.current !== 'idle') {
            return;
        }

        transitionPhaseRef.current = 'fading-out';
        const nextSessionId = activeSessionId ?? null;
        transitionProgress.value = withTiming(0, {
            duration: 110,
            easing: Easing.inOut(Easing.quad),
        }, (finished) => {
            if (!finished) {
                runOnJS(setTransitionPhase)('idle');
                return;
            }

            runOnJS(commitDisplayedSession)(nextSessionId);
            runOnJS(setTransitionPhase)('fading-in');
            transitionProgress.value = withTiming(1, {
                duration: TRANSITION_DURATION_MS,
                easing: Easing.out(Easing.cubic),
            }, (fadeInFinished) => {
                if (fadeInFinished) {
                    runOnJS(setTransitionPhase)('idle');
                }
            });
        });
    }, [activeSessionId, commitDisplayedSession, displayedSessionId, isTargetReady, setTransitionPhase, transitionProgress]);

    const layerStyle = useAnimatedStyle(() => ({
        opacity: 0.82 + (transitionProgress.value * 0.18),
        transform: [
            {
                translateY: (1 - transitionProgress.value) * 10,
            },
        ],
    }));

    const baseContent = React.useMemo(() => (
        displayedSessionId
            ? <PhoneConversationSession sessionId={displayedSessionId} />
            : <PhoneNewSessionHome />
    ), [displayedSessionId]);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.layer, layerStyle]}>
                {baseContent}
            </Animated.View>
        </View>
    );
});
