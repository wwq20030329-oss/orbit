import React from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    View,
} from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { BACKDROP_OPACITY, DURATION, EASING, SPRING } from '@/components/motion/tokens';

interface BaseModalProps {
    visible: boolean;
    onClose?: () => void;
    children: React.ReactNode;
    /**
     * Kept for backwards compatibility — value is ignored. Animations are now
     * driven by Reanimated for parity with the rest of the app.
     */
    animationType?: 'fade' | 'slide' | 'none';
    transparent?: boolean;
    closeOnBackdrop?: boolean;
}

/**
 * Centred dialog primitive. Uses spring-in / fade-out so it feels alive
 * without losing the snappy "system dialog" character users expect from
 * confirms, prompts and alerts.
 *
 * The component stays mounted for one extra frame after `visible=false`
 * so the exit animation can play before unmount.
 */
export function BaseModal({
    visible,
    onClose,
    children,
    transparent = true,
    closeOnBackdrop = true,
}: BaseModalProps) {
    const progress = useSharedValue(0);
    const [mounted, setMounted] = React.useState(visible);

    React.useEffect(() => {
        if (visible) {
            setMounted(true);
            progress.value = withSpring(1, SPRING.standard);
        } else {
            progress.value = withTiming(
                0,
                { duration: DURATION.short, easing: EASING.accelerate },
                (finished) => {
                    if (finished) {
                        runOnJS(setMounted)(false);
                    }
                },
            );
        }
    }, [progress, visible]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: progress.value * BACKDROP_OPACITY,
    }));

    const contentStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ scale: 0.92 + progress.value * 0.08 }],
    }));

    const handleBackdropPress = React.useCallback(() => {
        if (closeOnBackdrop && onClose) onClose();
    }, [closeOnBackdrop, onClose]);

    if (!mounted) return null;

    return (
        <Modal
            visible
            transparent={transparent}
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="auto">
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={handleBackdropPress} />
                </Animated.View>

                <Animated.View style={[styles.content, contentStyle]}>
                    <View>{children}</View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
    },
    content: {
        zIndex: 1,
    },
});