const CUSTOM_PROFILE_TYPES = new Set(['ssh', 'telnet', 'rdp'])

interface StoredProfile {
    id?: string
    type?: string
    name?: string
}

type ProfileHotkeyMap = Record<string, unknown>

export interface ProfileDeletionPlan<T> {
    profileIndex: number
    storedProfile: T
    profiles: T[]
    profileHotkeys: ProfileHotkeyMap | null | undefined
    hotkeysChanged: boolean
}

function slugifyProfileName (name: string): string {
    const slug = String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return slug || 'profile'
}

function generateUuid (): string {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID()
    }

    const bytes = new Uint8Array(16)
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes)
    } else {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256)
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
    ].join('-')
}

export function createCustomProfileId (type: string, name: string): string {
    return `${type}:custom:${slugifyProfileName(name)}:${generateUuid()}`
}

// Tabby moved this helper between classes in 1.0.235, but kept the key format.
export function getProfileHotkeyName (profile: StoredProfile): string | null {
    const identity = profile.id ?? profile.name
    return typeof identity === 'string' ? identity.replace(/\./g, '-') : null
}

export function createProfileDeletionPlan<T extends StoredProfile> (
    profiles: readonly T[],
    target: StoredProfile,
    profileHotkeys?: ProfileHotkeyMap | null,
): ProfileDeletionPlan<T> | null {
    const profileIndex = profiles.findIndex(profile => (
        profile === target || (!!target.id && profile.id === target.id)
    ))
    if (profileIndex < 0) return null

    const updatedProfiles = [...profiles]
    const [storedProfile] = updatedProfiles.splice(profileIndex, 1)
    const profileHotkeyName = getProfileHotkeyName(target)
    let updatedHotkeys = profileHotkeys
    let hotkeysChanged = false

    if (
        profileHotkeys &&
        profileHotkeyName !== null &&
        Object.prototype.hasOwnProperty.call(profileHotkeys, profileHotkeyName)
    ) {
        updatedHotkeys = { ...profileHotkeys }
        delete updatedHotkeys[profileHotkeyName]
        hotkeysChanged = true
    }

    return {
        profileIndex,
        storedProfile,
        profiles: updatedProfiles,
        profileHotkeys: updatedHotkeys,
        hotkeysChanged,
    }
}

export function backfillMissingCustomProfileIds (
    profiles: unknown,
    profileHotkeys?: ProfileHotkeyMap | null,
): number {
    if (!Array.isArray(profiles)) return 0

    const knownIds = new Set(
        profiles
            .map(profile => (profile as StoredProfile | null)?.id)
            .filter((id): id is string => !!id),
    )
    let updated = 0

    for (const value of profiles) {
        if (!value || typeof value !== 'object') continue

        const profile = value as StoredProfile
        if (profile.id || !profile.type || !CUSTOM_PROFILE_TYPES.has(profile.type)) continue

        const profileName = typeof profile.name === 'string' && profile.name
            ? profile.name
            : profile.type.toUpperCase()
        const previousHotkeyName = typeof profile.name === 'string'
            ? profile.name.replace(/\./g, '-')
            : undefined

        let id: string
        do {
            id = createCustomProfileId(profile.type, profileName)
        } while (knownIds.has(id))

        // Only add the standard identity field; all legacy profile fields remain intact.
        profile.id = id
        knownIds.add(id)

        if (
            previousHotkeyName &&
            profileHotkeys &&
            Object.prototype.hasOwnProperty.call(profileHotkeys, previousHotkeyName) &&
            !Object.prototype.hasOwnProperty.call(profileHotkeys, id)
        ) {
            const hotkey = profileHotkeys[previousHotkeyName]
            profileHotkeys[id] = Array.isArray(hotkey) ? [...hotkey] : hotkey
        }
        updated++
    }

    return updated
}
