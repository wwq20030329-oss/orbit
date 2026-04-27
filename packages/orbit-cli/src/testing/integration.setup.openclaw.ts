import { shouldRunOpenClawIntegration } from '@/openclaw/testAvailability'

import { installIntegrationEnvironment } from './installIntegrationEnvironment'

if (await shouldRunOpenClawIntegration()) {
    await installIntegrationEnvironment({
        template: 'authenticated-empty',
        up: true,
    })
}
