import * as React from 'react';

import { Modal } from '@/modal';
import { getOrbitActionErrorMessage } from './orbitActionError';
import { t } from '@/text';

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
                        console.error('[useOrbitAction] action failed', error);
                        Modal.alert(t('common.error'), getOrbitActionErrorMessage(error), [{ text: t('common.ok'), style: 'cancel' }]);
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
