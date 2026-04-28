import * as React from 'react';
import { Platform } from 'react-native';

import { AdvancedNewSessionScreen } from './index';
import { PhoneNewSessionHome } from '@/components/PhoneNewSessionHome';
import { useIsTablet } from '@/utils/responsive';

export default React.memo(function AdvancedNewSessionRoute() {
    const isTablet = useIsTablet();

    if (!isTablet && (Platform.OS === 'ios' || Platform.OS === 'android')) {
        return <PhoneNewSessionHome />;
    }

    return <AdvancedNewSessionScreen />;
});
