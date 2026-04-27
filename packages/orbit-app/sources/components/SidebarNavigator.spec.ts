import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock('expo-router/drawer', () => ({
    Drawer: () => null,
}));

vi.mock('expo-router', () => ({
    usePathname: () => '/',
    useRouter: () => ({}),
}));

vi.mock('@/utils/responsive', () => ({
    useIsTablet: () => false,
}));

vi.mock('./SidebarView', () => ({
    SidebarView: () => null,
}));

vi.mock('./PhoneDrawerContent', () => ({
    PhoneDrawerContent: () => null,
}));

vi.mock('react-native', () => ({
    useWindowDimensions: () => ({ width: 1200, height: 800 }),
}));

import {
    buildSidebarNavigatorOptions,
    shouldRenderSidebarDrawerContent,
} from './SidebarNavigator';

describe('buildSidebarNavigatorOptions', () => {
    it('builds a phone drawer that stays openable but is disabled on standalone settings screens', () => {
        const options = buildSidebarNavigatorOptions({
            showPermanentDrawer: false,
            showPhoneDrawer: true,
            drawerWidth: 320,
            isStandaloneSettingsFlow: true,
        });

        expect(options.drawerType).toBe('front');
        expect(options.lazy).toBe(false);
        expect(options.swipeEnabled).toBe(false);
        expect(options.drawerStyle).toEqual({
            width: 320,
            borderRightWidth: 0,
        });
    });

    it('hides the drawer completely when no drawer should be shown', () => {
        const options = buildSidebarNavigatorOptions({
            showPermanentDrawer: false,
            showPhoneDrawer: false,
            drawerWidth: 280,
            isStandaloneSettingsFlow: false,
        });

        expect(options.drawerType).toBe('front');
        expect(options.lazy).toBe(true);
        expect(options.swipeEnabled).toBe(false);
        expect(options.drawerStyle).toEqual({
            width: 0,
            display: 'none',
        });
    });

    it('builds the permanent drawer configuration for tablets', () => {
        const options = buildSidebarNavigatorOptions({
            showPermanentDrawer: true,
            showPhoneDrawer: false,
            drawerWidth: 360,
            isStandaloneSettingsFlow: false,
        });

        expect(options.drawerType).toBe('permanent');
        expect(options.lazy).toBe(true);
        expect(options.swipeEnabled).toBe(false);
        expect(options.drawerStyle).toEqual({
            backgroundColor: 'white',
            borderRightWidth: 0,
            width: 360,
        });
    });
});

describe('shouldRenderSidebarDrawerContent', () => {
    it('skips phone drawer content while standalone settings is on top', () => {
        expect(shouldRenderSidebarDrawerContent({
            isAuthenticated: true,
            showPermanentDrawer: false,
            showPhoneDrawer: true,
            isStandaloneSettingsFlow: true,
        })).toBe(false);
    });

    it('keeps tablet drawer content available across settings routes', () => {
        expect(shouldRenderSidebarDrawerContent({
            isAuthenticated: true,
            showPermanentDrawer: true,
            showPhoneDrawer: false,
            isStandaloneSettingsFlow: true,
        })).toBe(true);
    });

    it('never renders drawer content when signed out', () => {
        expect(shouldRenderSidebarDrawerContent({
            isAuthenticated: false,
            showPermanentDrawer: false,
            showPhoneDrawer: true,
            isStandaloneSettingsFlow: false,
        })).toBe(false);
    });
});
