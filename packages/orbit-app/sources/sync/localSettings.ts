import * as z from 'zod';

//
// Schema
//

export const LocalSettingsSchema = z.object({
    // Developer settings (device-specific)
    debugMode: z.boolean().describe('Enable debug logging'),
    devModeEnabled: z.boolean().describe('Enable developer menu in settings'),
    voiceUpsellOverride: z.enum(['control', 'show-paywall-before-first-voice-chat', 'voice-onboarding-and-upsell']).nullable().describe('Developer-only local override for the voice-upsell PostHog flag'),
    themePreference: z.enum(['light', 'dark', 'adaptive']).describe('Theme preference: light, dark, or adaptive (follows system)'),
    markdownCopyV2: z.boolean().describe('Replace native paragraph selection with long-press modal for full markdown copy'),
    consoleLoggingEnabled: z.boolean().describe('Enable console output in production builds'),
    verboseLogging: z.boolean().describe('Log all network requests and responses'),
    // CLI version acknowledgments - keyed by machineId
    acknowledgedCliVersions: z.record(z.string(), z.string()).describe('Acknowledged CLI versions per machine'),
    preferredCliToolTab: z.enum(['claude', 'codex', 'gemini', 'openclaw']).nullable().describe('Preferred CLI tool tab on the phone workspace and sessions screen'),
    cliThreadScopeByTool: z.record(z.string(), z.enum(['current-project', 'all-projects'])).describe('Visible scope per CLI tool on the sessions screen'),
    collapsedCliSections: z.record(z.string(), z.boolean()).describe('Collapsed state for CLI session sections'),
    collapsedCliProjectGroups: z.record(z.string(), z.boolean()).describe('Collapsed state for CLI project groups'),
    hiddenNativeCliEntries: z.record(z.string(), z.number()).describe('Locally hidden native CLI entries keyed by machine/tool/backend'),
    drawerPinnedCliThreadIds: z.record(z.string(), z.number()).describe('Locally pinned CLI thread IDs in the drawer, keyed by stable CLI thread ID'),
    drawerHiddenCliThreadIds: z.record(z.string(), z.number()).describe('Locally hidden CLI thread IDs in the drawer, keyed by stable CLI thread ID'),
    lastOpenedSessionIdentifier: z.string().nullable().describe('Most recent session or native thread identifier opened on this device'),
});

//
// NOTE: Local settings are device-specific and should NOT be synced.
// These are preferences that make sense to be different on each device.
//

const LocalSettingsSchemaPartial = LocalSettingsSchema.passthrough().partial();

export type LocalSettings = z.infer<typeof LocalSettingsSchema>;

//
// Defaults
//

export const localSettingsDefaults: LocalSettings = {
    debugMode: false,
    devModeEnabled: false,
    voiceUpsellOverride: null,
    themePreference: 'adaptive',
    markdownCopyV2: false,
    consoleLoggingEnabled: false,
    verboseLogging: false,
    acknowledgedCliVersions: {},
    preferredCliToolTab: null,
    cliThreadScopeByTool: {},
    collapsedCliSections: {},
    collapsedCliProjectGroups: {},
    hiddenNativeCliEntries: {},
    drawerPinnedCliThreadIds: {},
    drawerHiddenCliThreadIds: {},
    lastOpenedSessionIdentifier: null,
};
Object.freeze(localSettingsDefaults);

//
// Parsing
//

export function localSettingsParse(settings: unknown): LocalSettings {
    const parsed = LocalSettingsSchemaPartial.safeParse(settings);
    if (!parsed.success) {
        return { ...localSettingsDefaults };
    }
    return { ...localSettingsDefaults, ...parsed.data };
}

//
// Applying changes
//

export function applyLocalSettings(settings: LocalSettings, delta: Partial<LocalSettings>): LocalSettings {
    return { ...localSettingsDefaults, ...settings, ...delta };
}
