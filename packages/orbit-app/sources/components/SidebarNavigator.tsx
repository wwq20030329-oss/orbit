import { useAuth } from '@/auth/AuthContext';
import * as React from 'react';
import { Drawer } from 'expo-router/drawer';
import { usePathname } from 'expo-router';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useIsTablet } from '@/utils/responsive';
import { SidebarView } from './SidebarView';
import { useWindowDimensions } from 'react-native';
import { PhoneDrawerContent } from './PhoneDrawerContent';

function isDrawerOpen(state: unknown): boolean {
    const history = (state as { history?: Array<{ type?: string; status?: string }> } | undefined)?.history;
    if (!Array.isArray(history)) {
        return false;
    }

    return history.some((entry) => entry?.type === 'drawer' && entry?.status === 'open');
}

export function buildSidebarNavigatorOptions(args: {
    showPermanentDrawer: boolean;
    showPhoneDrawer: boolean;
    drawerWidth: number;
    isStandaloneSettingsFlow: boolean;
}) {
    if (args.showPhoneDrawer) {
        return {
            freezeOnBlur: true,
            lazy: false,
            headerShown: false,
            drawerType: 'front' as const,
            swipeEnabled: !args.isStandaloneSettingsFlow,
            swipeEdgeWidth: 28,
            overlayColor: 'rgba(0,0,0,0.18)',
            drawerStyle: {
                width: args.drawerWidth,
                borderRightWidth: 0,
            },
        };
    }

    if (!args.showPermanentDrawer) {
        return {
            freezeOnBlur: true,
            lazy: true,
            headerShown: false,
            drawerType: 'front' as const,
            swipeEnabled: false,
            drawerStyle: {
                width: 0,
                display: 'none' as const,
            },
        };
    }

    return {
        freezeOnBlur: true,
        lazy: true,
        headerShown: false,
        drawerType: 'permanent' as const,
        drawerStyle: {
            backgroundColor: 'white',
            borderRightWidth: 0,
            width: args.drawerWidth,
        },
        swipeEnabled: false,
        drawerActiveTintColor: 'transparent',
        drawerInactiveTintColor: 'transparent',
        drawerItemStyle: { display: 'none' as const },
        drawerLabelStyle: { display: 'none' as const },
    };
}

export function shouldRenderSidebarDrawerContent(args: {
    isAuthenticated: boolean;
    showPermanentDrawer: boolean;
    showPhoneDrawer: boolean;
    isStandaloneSettingsFlow: boolean;
}) {
    if (!args.isAuthenticated) {
        return false;
    }

    if (args.showPermanentDrawer) {
        return true;
    }

    return !(args.showPhoneDrawer && args.isStandaloneSettingsFlow);
}

export const SidebarNavigator = React.memo(() => {
    const auth = useAuth();
    const isTablet = useIsTablet();
    const pathname = usePathname();
    const showPermanentDrawer = auth.isAuthenticated && isTablet;
    const showPhoneDrawer = auth.isAuthenticated && !isTablet;
    const isStandaloneSettingsFlow = pathname.startsWith('/settings');
    const { width: windowWidth } = useWindowDimensions();

    // Calculate drawer width only when needed
    const drawerWidth = React.useMemo(() => {
        if (showPhoneDrawer) {
            return Math.min(Math.max(Math.floor(windowWidth * 0.86), 300), 380);
        }
        if (!showPermanentDrawer) return 280; // Default width for hidden drawer
        return Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);
    }, [windowWidth, showPermanentDrawer, showPhoneDrawer]);

    const drawerNavigationOptions = React.useMemo(() => {
        return buildSidebarNavigatorOptions({
            showPermanentDrawer,
            showPhoneDrawer,
            drawerWidth,
            isStandaloneSettingsFlow,
        });
    }, [showPermanentDrawer, showPhoneDrawer, drawerWidth, isStandaloneSettingsFlow]);
    const shouldRenderDrawerContent = React.useMemo(
        () => shouldRenderSidebarDrawerContent({
            isAuthenticated: auth.isAuthenticated,
            showPermanentDrawer,
            showPhoneDrawer,
            isStandaloneSettingsFlow,
        }),
        [auth.isAuthenticated, showPermanentDrawer, showPhoneDrawer, isStandaloneSettingsFlow],
    );

    // Keep the permanent drawer stable while letting phone settings screens opt out entirely.
    const drawerContent = React.useCallback(
        (props: DrawerContentComponentProps) => (
            showPermanentDrawer
                ? <SidebarView />
                : <PhoneDrawerContent
                    drawerNavigation={props.navigation}
                    isVisible={isDrawerOpen(props.state)}
                />
        ),
        [showPermanentDrawer],
    );

    return (
        <Drawer
            screenOptions={drawerNavigationOptions}
            drawerContent={shouldRenderDrawerContent ? drawerContent : undefined}
        />
    )
});
