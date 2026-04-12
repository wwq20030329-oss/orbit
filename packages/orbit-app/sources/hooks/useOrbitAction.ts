import * as React from 'react';

import { Modal } from '@/modal';
import { OrbitError } from '@/utils/errors';

export function useOrbitAction(action: () => Promise<void>) {
    const [loading, setLoading] = React.useState(false);
    const loadingRef = React.useRef(false);

    const doAction = React.useCallback(() => {
        if (loadingRef.current) {
            return;
        }

        loadingRef.current = true;
        setLoading(true);

        (async () => {
            try {
                while (true) {
                    try {
                        await action();
                        break;
                    } catch (error) {
                        if (error instanceof OrbitError) {
                            Modal.alert('Error', error.message, [{ text: 'OK', style: 'cancel' }]);
                            break;
                        }

                        Modal.alert('Error', 'Unknown error', [{ text: 'OK', style: 'cancel' }]);
                        break;
                    }
                }
            } finally {
                loadingRef.current = false;
                setLoading(false);
            }
        })();
    }, [action]);

    return [loading, doAction] as const;
}
