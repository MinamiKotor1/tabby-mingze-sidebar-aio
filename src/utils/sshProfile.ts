import type { PartialProfile } from 'tabby-core'
import type { SSHProfile, SSHProfileOptions } from '../models/interfaces'
import { createCustomProfileId } from './profile'

const DEFAULT_SSH_PORT = 22
const DEFAULT_SSH_USER = 'root'
const DEFAULT_SSH_HOST: string = null

export type SshIdentityOptions = Record<'host' | 'port' | 'user', unknown>

export interface SshProfileEditState {
    name: string
    group: string
    sourceProfile: PartialProfile<SSHProfile>
    sourceOptions: Record<string, any>
    options: SSHProfileOptions
    initialIdentityOptions: SshIdentityOptions
    initialGroup: string
    initialPassword: string
}

interface BuildSshProfileDataOptions {
    sourceProfile: PartialProfile<SSHProfile> | null
    sourceOptions: Record<string, any>
    initialIdentityOptions: SshIdentityOptions
    initialGroup: string
    name: string
    group: string
    currentOptions: SSHProfileOptions
    normalizedOptions: SSHProfileOptions
    existing: PartialProfile<SSHProfile> | null
}

export interface BuiltSshProfileData {
    profileData: SSHProfile
    password: string
    hadPlaintextPassword: boolean
}

export interface ResolveSshEditingIndexOptions {
    profiles: any[]
    profileId: string | null
    editingIndex: number | null
    initialProfile: PartialProfile<SSHProfile> | null
}

export function resolveSshCredentialOptions (
    options: Partial<SSHProfileOptions>,
    defaults: Partial<SSHProfileOptions> = {},
): SSHProfileOptions {
    return {
        ...options,
        host: options.host !== undefined
            ? options.host
            : (defaults.host !== undefined ? defaults.host : DEFAULT_SSH_HOST),
        user: options.user !== undefined
            ? options.user
            : (defaults.user !== undefined ? defaults.user : DEFAULT_SSH_USER),
        port: options.port !== undefined
            ? options.port
            : (defaults.port !== undefined ? defaults.port : DEFAULT_SSH_PORT),
    }
}

export function createSshProfileEditState (
    profile: PartialProfile<SSHProfile>,
    defaults: Partial<SSHProfileOptions>,
    baseOptions: SSHProfileOptions,
): SshProfileEditState {
    const sourceProfile = cloneSshProfile(profile)
    const sourceOptions = { ...(profile?.options || {}) }
    const options = {
        ...baseOptions,
        ...resolveSshCredentialOptions(sourceOptions, defaults),
    }

    return {
        name: profile?.name || '',
        group: profile?.group || '',
        sourceProfile,
        sourceOptions,
        options,
        initialIdentityOptions: {
            host: options.host,
            port: options.port,
            user: options.user,
        },
        initialGroup: profile?.group || '',
        initialPassword: cleanSshPassword(profile?.options?.password) || '',
    }
}

export function buildSshProfileData (
    input: BuildSshProfileDataOptions,
): BuiltSshProfileData {
    const {
        sourceProfile,
        sourceOptions,
        initialIdentityOptions,
        initialGroup,
        name,
        group,
        currentOptions,
        normalizedOptions,
        existing,
    } = input
    const options: Record<string, any> = {
        ...sourceOptions,
        host: normalizedOptions.host,
        port: normalizedOptions.port,
        user: normalizedOptions.user,
    }

    restoreUnchangedIdentityOption(
        options,
        sourceProfile,
        sourceOptions,
        initialIdentityOptions,
        'host',
        currentOptions.host,
    )
    restoreUnchangedIdentityOption(
        options,
        sourceProfile,
        sourceOptions,
        initialIdentityOptions,
        'user',
        currentOptions.user,
    )
    restoreUnchangedIdentityOption(
        options,
        sourceProfile,
        sourceOptions,
        initialIdentityOptions,
        'port',
        currentOptions.port,
    )

    const password = cleanSshPassword(normalizedOptions.password) || ''
    const hadPlaintextPassword = !!cleanSshPassword(sourceOptions.password)
    delete options.password

    const profileData = {
        ...(sourceProfile || {}),
        id: existing?.id || createCustomProfileId('ssh', name || normalizedOptions.host),
        type: 'ssh',
        name: name || `${normalizedOptions.user || 'root'}@${normalizedOptions.host}:${normalizedOptions.port}`,
        group: group || undefined,
        options,
    } as SSHProfile

    if (sourceProfile && Object.is(group, initialGroup)) {
        if (Object.prototype.hasOwnProperty.call(sourceProfile, 'group')) {
            profileData.group = sourceProfile.group
        } else {
            delete profileData.group
        }
    } else if (!profileData.group) {
        delete profileData.group
    }

    if (!existing) {
        profileData.isBuiltin = false
        profileData.isTemplate = false
    }

    return { profileData, password, hadPlaintextPassword }
}

export function resolveSshEditingIndex (input: ResolveSshEditingIndexOptions): number {
    const { profiles, profileId, editingIndex, initialProfile } = input

    if (profileId) {
        const byId = profiles.findIndex(profile => profile.id === profileId)
        if (byId >= 0) return byId
    }

    if (editingIndex !== null && editingIndex >= 0 && editingIndex < profiles.length) {
        return editingIndex
    }

    if (initialProfile?.type === 'ssh' && !initialProfile.isBuiltin) {
        return findSshProfileIndexBySnapshot(profiles, initialProfile)
    }

    return -1
}

export function findSshProfileIndexBySnapshot (
    profiles: any[],
    snapshot: PartialProfile<SSHProfile>,
): number {
    const host = cleanSshHost(snapshot.options?.host)
    const port = normalizeSshPort(snapshot.options?.port)
    const user = cleanSshText(snapshot.options?.user) || 'root'
    const name = snapshot.name || ''
    const group = snapshot.group || ''

    return profiles.findIndex(profile => (
        profile.type === 'ssh' &&
        (profile.name || '') === name &&
        (profile.group || '') === group &&
        cleanSshHost(profile.options?.host) === host &&
        normalizeSshPort(profile.options?.port) === port &&
        (cleanSshText(profile.options?.user) || 'root') === user
    ))
}

export function normalizeSshProfileOptions (options: SSHProfileOptions): SSHProfileOptions {
    return {
        ...options,
        host: cleanSshHost(options.host),
        port: normalizeSshPort(options.port),
        user: cleanSshText(options.user) || 'root',
        password: cleanSshPassword(options.password),
        auth: options.auth ?? null,
        privateKeys: Array.isArray(options.privateKeys) ? options.privateKeys.filter(Boolean) : [],
    }
}

export function hasSshConnectionTarget (
    options: SSHProfileOptions,
    sourceOptions: Record<string, any>,
    defaults: Partial<SSHProfileOptions>,
): boolean {
    const proxyCommand = sourceOptions.proxyCommand !== undefined
        ? sourceOptions.proxyCommand
        : defaults.proxyCommand
    return !!cleanSshHost(options.host) || !!proxyCommand
}

export function cleanSshPassword (value?: string): string | undefined {
    if (value === undefined || value === null) return undefined
    const cleaned = String(value).replace(/[\r\n]+/g, '')
    return cleaned || undefined
}

export function cloneSshProfile<T> (profile: T): T {
    if (!profile) return profile
    return {
        ...(profile as any),
        options: { ...((profile as any).options || {}) },
    }
}

function cleanSshHost (value?: string): string {
    return (value || '').replace(/[\r\n]+/g, '').trim()
}

function cleanSshText (value?: string): string | undefined {
    if (!value) return undefined
    const cleaned = value.replace(/[\r\n]+/g, '').trim()
    return cleaned || undefined
}

function normalizeSshPort (port?: number): number {
    const value = Number(port || DEFAULT_SSH_PORT)
    if (!Number.isFinite(value)) return DEFAULT_SSH_PORT
    const rounded = Math.round(value)
    if (rounded < 1 || rounded > 65535) return DEFAULT_SSH_PORT
    return rounded
}

function restoreUnchangedIdentityOption (
    options: Record<string, any>,
    sourceProfile: PartialProfile<SSHProfile> | null,
    sourceOptions: Record<string, any>,
    initialIdentityOptions: SshIdentityOptions,
    key: 'host' | 'port' | 'user',
    currentValue: unknown,
): void {
    if (!sourceProfile || !Object.is(currentValue, initialIdentityOptions[key])) return

    if (Object.prototype.hasOwnProperty.call(sourceOptions, key)) {
        options[key] = sourceOptions[key]
    } else {
        delete options[key]
    }
}
