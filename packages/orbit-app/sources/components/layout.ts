import { Dimensions } from 'react-native';
import { getDeviceType } from '@/utils/responsive';
import { isRunningOnMac } from '@/utils/platform';

// Calculate max width based on device type
function getMaxWidth(): number {
    const deviceType = getDeviceType();

    // For phones, use the max dimension (width or height)
    if (deviceType === 'phone') {
        const { width, height } = Dimensions.get('window');
        return Math.max(width, height);
    }

    if (isRunningOnMac()) {
        return Number.POSITIVE_INFINITY;
    }

    // For tablets, use 800px
    return 800;
}

// Calculate max width based on device type
function getMaxLayoutWidth(): number {
    const deviceType = getDeviceType();

    // For phones, use the max dimension (width or height)
    if (deviceType === 'phone') {
        const { width, height } = Dimensions.get('window');
        return Math.max(width, height);
    }

    if (isRunningOnMac()) {
        return 1400;
    }

    // For tablets, use 800px
    return 800;
}

export const layout = {
    maxWidth: getMaxLayoutWidth(),
    headerMaxWidth: getMaxWidth()
}