import * as React from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from '@/components/haptics';
import { BACKDROP_OPACITY, DURATION, EASING, SPRING } from './tokens';

interface BottomSheetProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /**
     * Distance from the bottom safe area edge. Lifts the sheet visually like
     * a card stack instead of sticking it to the very bottom of the screen.
     */
    bottomOffset?: number;
    /** Disable swipe-down dismiss (e.g. when content has its own scroll). */
    disableSwipeDismiss?: boolean;
    /** Extra horizontal inset; sheet defaults to 16. */
    horizontalInset?: number;
}

const DRAG_DISMISS_THRESHOLD = 90; // px
const DRAG_VELOCITY_DISMISS_THRESHOLD = 700; // px/s

/**
 * App-wide bottom sheet primitive.
 *
 * Renders inside a transparent native Modal so it always sits above any
 * existing UI (including other sheets). Animation and gesture handling are
 * driven by Reanimated on the UI thread for 60fps even when JS is busy.
 *
 * Behaviour:
 *   - Tap backdrop → close
 *   - Drag down past 90 px or fling > 700 px/s → close (with haptic)
 *   - Drag down within threshold → springs back into place
 *   - Backdrop fade tracks drag distance so the dismiss feels tactile
 */
export const BottomSheet = React.memo<BottomSheetProps>((props) => {
    const styles = stylesheet;
    const translateY = useSharedValue(800); // start off-screen
    const dragOffset = useSharedValue(0);
    const [mounted, setMounted] = React.useState(props.visible);
    const [contentHeight, setContentHeight] = React.useState(400);

    const close = React.useCallback(() => {
        props.onClose();
    }, [props.onClose]);

    React.useEffect(() => {
        if (props.visible) {
            setMounted(true);
            translateY.value = withSpring(0, SPRING.standard);
            dragOffset.value = 0;
        } else {
            translateY.value = withTiming(
                contentHeight + 80,
                { duration: DURATION.medium, easing: EASING.accelerate },
                (finished) => {
                    if (finished) {
                        runOnJS(setMounted)(false);
                    }
                },
            );
        }
    }, [props.visible, contentHeight, dragOffset, translateY]);

    const panGesture = React.useMemo(() => (
        Gesture.Pan()
            .enabled(!props.disableSwipeDismiss)
            .onUpdate((e) => {
                // Only follow downward drags. Pulling up has no semantic
                // here so we damp it heavily to feel "fixed".
                dragOffset.value = e.translationY > 0
                    ? e.translationY
                    : e.translationY * 0.15;
            })
            .onEnd((e) => {
                const shouldDismiss =
                    e.translationY > DRAG_DISMISS_THRESHOLD ||
                    e.velocityY > DRAG_VELOCITY_DISMISS_THRESHOLD;
                if (shouldDismiss) {
                    runOnJS(hapticsLight)();
                    runOnJS(close)();
                } else {
                    dragOffset.value = withSpring(0, SPRING.standard);
                }
            })
    ), [close, dragOffset, props.disableSwipeDismiss]);

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value + dragOffset.value }],
    }));

    const backdropAnimatedStyle = useAnimatedStyle(() => {
        // Fade out while dragging so users get visual feedback.
        const dragProgress = interpolate(
            dragOffset.value,
            [0, DRAG_DISMISS_THRESHOLD * 1.5],
            [1, 0],
            Extrapolation.CLAMP,
        );
        const enterProgress = interpolate(
            translateY.value,
            [0, contentHeight],
            [1, 0],
            Extrapolation.CLAMP,
        );
        return { opacity: BACKDROP_OPACITY * Math.min(dragProgress, enterProgress) };
    });

    const handleLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
        const h = event.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - contentHeight) > 4) {
            setContentHeight(h);
        }
    }, [contentHeight]);

    if (!mounted) return null;

    const horizontalInset = props.horizontalInset ?? 16;

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={close}
        >
            <View style={styles.root} pointerEvents="box-none">
                <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} pointerEvents="auto">
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={close} />
                </Animated.View>

                <GestureDetector gesture={panGesture}>
                    <Animated.View
                        style={[
                            styles.sheetWrap,
                            {
                                marginBottom: props.bottomOffset ?? 16,
                                marginHorizontal: horizontalInset,
                            },
                            sheetAnimatedStyle,
                        ]}
                        onLayout={handleLayout}
                    >
                        <Handle />
                        {props.children}
                    </Animated.View>
                </GestureDetector>
            </View>
        </Modal>
    );
});

function Handle() {
    const { theme } = useUnistyles();
    return (
        <View style={stylesheet.handleWrap}>
            <View style={[stylesheet.handle, { backgroundColor: theme.colors.divider }]} />
        </View>
    );
}

const stylesheet = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
    },
    sheetWrap: {
        borderRadius: 24,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 14,
    },
    handleWrap: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
    },
}));
