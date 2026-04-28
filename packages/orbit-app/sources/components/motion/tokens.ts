import { Easing, ReduceMotion, type WithSpringConfig } from 'react-native-reanimated';

/**
 * Single source of truth for motion in the app. Every animation should pull
 * its duration and curve from here so micro-interactions feel cohesive and
 * we can tune the whole product by editing one file.
 *
 * The taxonomy mirrors the Material 3 motion guidance:
 *   - micro    : tiny ack/confirm beats (badges, taps)
 *   - short    : everyday transitions (chip toggles, fades)
 *   - medium   : layout shifts (collapse/expand, sheet entrances)
 *   - long     : large surface transitions (full-screen modals)
 *
 * `expressive` springs are reserved for moments we explicitly want to draw
 * attention to (e.g. permission banner appearing). Default UI uses
 * `standard` for predictable, calm motion.
 */
export const DURATION = {
    micro: 120,
    short: 180,
    medium: 240,
    long: 320,
} as const;

export const EASING = {
    /** Standard ease — feels neutral, use as default. */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** Decelerate — surfaces entering / appearing on screen. */
    decelerate: Easing.out(Easing.cubic),
    /** Accelerate — surfaces leaving the screen. */
    accelerate: Easing.in(Easing.cubic),
} as const;

export const SPRING: Record<'standard' | 'expressive' | 'gentle', WithSpringConfig> = {
    standard: {
        damping: 20,
        stiffness: 220,
        mass: 0.9,
        reduceMotion: ReduceMotion.System,
    },
    expressive: {
        damping: 16,
        stiffness: 240,
        mass: 0.9,
        reduceMotion: ReduceMotion.System,
    },
    gentle: {
        damping: 24,
        stiffness: 160,
        mass: 1,
        reduceMotion: ReduceMotion.System,
    },
};

export const BACKDROP_OPACITY = 0.45;
