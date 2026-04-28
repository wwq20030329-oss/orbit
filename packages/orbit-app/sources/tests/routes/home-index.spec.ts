import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    authStateRef,
    responsiveStateRef,
    mainViewSpy,
    phoneSessionHomeSpy,
} = vi.hoisted(() => ({
    authStateRef: {
        current: {
            isAuthenticated: true,
            login: vi.fn(),
        },
    },
    responsiveStateRef: {
        current: {
            isTablet: false,
            isLandscape: false,
        },
    },
    mainViewSpy: vi.fn(),
    phoneSessionHomeSpy: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
    useAuth: () => authStateRef.current,
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Text: () => null,
    View: () => null,
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/encryption/base64', () => ({
    encodeBase64: () => 'encoded-secret',
}));

vi.mock('@/auth/authGetToken', () => ({
    authGetToken: vi.fn(),
}));

vi.mock('expo-router', () => ({
    router: { push: vi.fn() },
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: () => ({}),
    },
    useUnistyles: () => ({ theme: {} }),
}));

vi.mock('expo-crypto', () => ({
    getRandomBytesAsync: vi.fn(),
}));

vi.mock('@/utils/responsive', () => ({
    useIsLandscape: () => responsiveStateRef.current.isLandscape,
    useIsTablet: () => responsiveStateRef.current.isTablet,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/track', () => ({
    trackAccountCreated: vi.fn(),
    trackAccountRestored: vi.fn(),
}));

vi.mock('@/components/HomeHeader', () => ({
    HomeHeaderNotAuth: () => null,
}));

vi.mock('@/components/MainView', () => ({
    MainView: (props: { variant: string }) => {
        mainViewSpy(props);
        return null;
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/components/BrandLogo', () => ({
    BrandWordmark: () => null,
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: vi.fn(),
    },
}));

vi.mock('@/components/PhoneSessionHome', () => ({
    PhoneSessionHome: () => {
        phoneSessionHomeSpy();
        return null;
    },
}));

vi.mock('@/components/RoundButton', () => ({
    RoundButton: () => null,
}));

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => { unmount: () => void };
};

import { AuthenticatedHome } from '../../app/(app)/index';

describe('AuthenticatedHome', () => {
    beforeEach(() => {
        authStateRef.current = {
            isAuthenticated: true,
            login: vi.fn(),
        };
        responsiveStateRef.current = {
            isTablet: false,
            isLandscape: false,
        };
        mainViewSpy.mockClear();
        phoneSessionHomeSpy.mockClear();
    });

    it('renders the phone session home on phones', () => {
        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(AuthenticatedHome));
        });

        expect(phoneSessionHomeSpy).toHaveBeenCalledTimes(1);
        expect(mainViewSpy).not.toHaveBeenCalled();

        renderer.unmount();
    });

    it('renders the main view placeholder on tablets', () => {
        responsiveStateRef.current = {
            isTablet: true,
            isLandscape: false,
        };

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(AuthenticatedHome));
        });

        expect(mainViewSpy).toHaveBeenCalledWith({ variant: 'phone' });
        expect(phoneSessionHomeSpy).not.toHaveBeenCalled();

        renderer.unmount();
    });
});
