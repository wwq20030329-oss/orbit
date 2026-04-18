import { DrawerActions } from '@react-navigation/native';

export function closeNearestDrawer(navigation: any) {
    let current = navigation;
    while (current) {
        const state = current.getState?.();
        if (state?.type === 'drawer') {
            current.dispatch(DrawerActions.closeDrawer());
            return true;
        }
        current = current.getParent?.();
    }
    return false;
}
