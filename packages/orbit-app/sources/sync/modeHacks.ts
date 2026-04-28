export type HackableMode = {
    key: string;
    name: string;
    description?: string | null;
};

export function hackMode<T extends HackableMode>(mode: T): T {
    const normalizedName = mode.name.trim().toLowerCase();
    const normalizedKey = mode.key.trim().toLowerCase();
    const compactName = normalizedName.replace(/[\s,/_-]+/g, '');

    if (normalizedKey === 'build' && (normalizedName === 'build' || compactName === 'buildbuild')) {
        return { ...mode, name: 'Build' };
    }
    if (normalizedKey === 'plan' && (normalizedName === 'plan' || compactName === 'planplan')) {
        return { ...mode, name: 'Plan' };
    }
    return mode;
}

export function hackModes<T extends HackableMode>(modes: T[]): T[] {
    return modes.map(hackMode);
}
