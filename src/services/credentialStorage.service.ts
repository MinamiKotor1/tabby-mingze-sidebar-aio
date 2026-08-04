import { Injectable } from '@angular/core'
import { ConfigService, VaultService } from 'tabby-core'
import { RDPProfileOptions, SSHProfile, SSHProfileOptions } from '../models/interfaces'
import { resolveSshCredentialOptions } from '../utils/sshProfile'

export { resolveSshCredentialOptions } from '../utils/sshProfile'

export const VAULT_SECRET_TYPE_SSH_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_RDP_PASSWORD = 'rdp:password'

const DEFAULT_RDP_PORT = 3389
const RDP_KEYTAR_DEFAULT_ACCOUNT = '<default>'

interface KeytarApi {
    setPassword: (service: string, account: string, password: string) => Promise<void>
    getPassword: (service: string, account: string) => Promise<string | null>
    deletePassword: (service: string, account: string) => Promise<boolean>
}

export interface StoredCredentialTarget {
    service: string
    account: string
}

export type CredentialStorageBackend = 'vault' | 'keytar'

export function buildSshVaultKey (
    profile: Pick<SSHProfile, 'options'>,
    defaults: Partial<SSHProfileOptions> = {},
): { user: string, host: string, port: number } {
    const options = resolveSshCredentialOptions(profile.options, defaults)
    return {
        user: options.user,
        host: options.host,
        port: options.port,
    }
}

export function buildSshKeytarTarget (
    profile: Pick<SSHProfile, 'options'>,
    defaults: Partial<SSHProfileOptions> = {},
): StoredCredentialTarget {
    const options = resolveSshCredentialOptions(profile.options, defaults)
    let service = `ssh@${options.host}`
    if (options.port) service += `:${options.port}`
    return {
        service,
        account: options.user,
    }
}

export function buildRdpVaultKey (
    options: Partial<RDPProfileOptions>,
    defaults: Partial<RDPProfileOptions> = {},
): { host: string, port: number, user: string } {
    const effective = normalizeRdpCredentialOptions(options, defaults)
    return {
        host: effective.host || '',
        port: effective.port || DEFAULT_RDP_PORT,
        user: effective.username || '',
    }
}

export function resolveRdpCredentialOptions (
    options: Partial<RDPProfileOptions>,
    defaults: Partial<RDPProfileOptions> = {},
): RDPProfileOptions {
    return {
        ...options,
        host: options.host !== undefined
            ? options.host
            : (defaults.host !== undefined ? defaults.host : ''),
        port: options.port !== undefined
            ? options.port
            : (defaults.port !== undefined ? defaults.port : DEFAULT_RDP_PORT),
        username: options.username !== undefined
            ? options.username
            : (defaults.username !== undefined ? defaults.username : ''),
    }
}

export function normalizeRdpCredentialOptions (
    options: Partial<RDPProfileOptions>,
    defaults: Partial<RDPProfileOptions> = {},
): RDPProfileOptions {
    const effective = resolveRdpCredentialOptions(options, defaults)
    const portValue = Number(effective.port || DEFAULT_RDP_PORT)
    const roundedPort = Number.isFinite(portValue) ? Math.round(portValue) : DEFAULT_RDP_PORT

    return {
        ...effective,
        host: String(effective.host || '').replace(/[\r\n]+/g, '').trim(),
        port: roundedPort >= 1 && roundedPort <= 65535 ? roundedPort : DEFAULT_RDP_PORT,
        username: sanitizeCredentialText(effective.username),
    }
}

export function buildRdpKeytarTarget (
    options: Partial<RDPProfileOptions>,
    defaults: Partial<RDPProfileOptions> = {},
): StoredCredentialTarget {
    const effective = normalizeRdpCredentialOptions(options, defaults)
    return {
        service: `rdp@${effective.host || ''}:${effective.port || DEFAULT_RDP_PORT}`,
        account: effective.username || RDP_KEYTAR_DEFAULT_ACCOUNT,
    }
}

export function hasSameSshCredentialTarget (
    a: Pick<SSHProfile, 'options'>,
    b: Pick<SSHProfile, 'options'>,
    backend: CredentialStorageBackend,
    defaults: Partial<SSHProfileOptions> = {},
): boolean {
    if (backend === 'vault') {
        const keyA = buildSshVaultKey(a, defaults)
        const keyB = buildSshVaultKey(b, defaults)
        return keyA.host === keyB.host && keyA.port === keyB.port && keyA.user === keyB.user
    }

    return targetsMatch(buildSshKeytarTarget(a, defaults), buildSshKeytarTarget(b, defaults))
}

export function hasSameRdpCredentialTarget (
    a: Partial<RDPProfileOptions>,
    b: Partial<RDPProfileOptions>,
    backend: CredentialStorageBackend,
    defaults: Partial<RDPProfileOptions> = {},
): boolean {
    if (backend === 'vault') {
        const keyA = buildRdpVaultKey(a, defaults)
        const keyB = buildRdpVaultKey(b, defaults)
        return keyA.host === keyB.host && keyA.port === keyB.port && keyA.user === keyB.user
    }

    return targetsMatch(buildRdpKeytarTarget(a, defaults), buildRdpKeytarTarget(b, defaults))
}

function targetsMatch (a: StoredCredentialTarget, b: StoredCredentialTarget): boolean {
    return a.service === b.service && a.account === b.account
}

function sanitizeCredentialText (value?: string): string | undefined {
    if (!value) return undefined
    const cleaned = String(value).replace(/[\r\n]+/g, '').trim()
    return cleaned || undefined
}

@Injectable({ providedIn: 'root' })
export class CredentialStorageService {
    constructor (
        private vault: VaultService,
        private config?: ConfigService,
    ) {}

    async saveSshPassword (profile: SSHProfile, password: string): Promise<void> {
        if (this.vault.isEnabled()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_SSH_PASSWORD,
                key: buildSshVaultKey(profile, this.getSshDefaults()),
                value: password,
            })
        } else {
            await this.setKeytarCredential(buildSshKeytarTarget(profile, this.getSshDefaults()), password)
        }
    }

    async loadSshPassword (profile: SSHProfile): Promise<string | null> {
        if (this.vault.isEnabled()) {
            const secret = await this.vault.getSecret(
                VAULT_SECRET_TYPE_SSH_PASSWORD,
                buildSshVaultKey(profile, this.getSshDefaults()),
            )
            return secret?.value ?? null
        }
        return this.getKeytarCredential(buildSshKeytarTarget(profile, this.getSshDefaults()))
    }

    async deleteSshPasswordEverywhere (profile: SSHProfile): Promise<void> {
        await this.deleteEverywhere(
            VAULT_SECRET_TYPE_SSH_PASSWORD,
            buildSshVaultKey(profile, this.getSshDefaults()),
            buildSshKeytarTarget(profile, this.getSshDefaults()),
        )
    }

    async deleteSshPassword (profile: SSHProfile): Promise<void> {
        if (this.vault.isEnabled()) {
            await this.vault.removeSecret(
                VAULT_SECRET_TYPE_SSH_PASSWORD,
                buildSshVaultKey(profile, this.getSshDefaults()),
            )
        } else {
            await this.deleteKeytarCredential(buildSshKeytarTarget(profile, this.getSshDefaults()), true)
        }
    }

    hasSameSshCredentialIdentity (a: SSHProfile, b: SSHProfile): boolean {
        return hasSameSshCredentialTarget(
            a,
            b,
            this.vault.isEnabled() ? 'vault' : 'keytar',
            this.getSshDefaults(),
        )
    }

    hasSameSshCredentialIdentityAnywhere (a: SSHProfile, b: SSHProfile): boolean {
        const defaults = this.getSshDefaults()
        return hasSameSshCredentialTarget(a, b, 'vault', defaults) ||
            hasSameSshCredentialTarget(a, b, 'keytar', defaults)
    }

    async saveRdpPassword (options: Partial<RDPProfileOptions>, password: string): Promise<void> {
        if (this.vault.isEnabled()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_RDP_PASSWORD,
                key: buildRdpVaultKey(options, this.getRdpDefaults()),
                value: password,
            })
        } else {
            await this.setKeytarCredential(buildRdpKeytarTarget(options, this.getRdpDefaults()), password)
        }
    }

    async loadRdpPassword (options: Partial<RDPProfileOptions>): Promise<string | null> {
        if (this.vault.isEnabled()) {
            const secret = await this.vault.getSecret(
                VAULT_SECRET_TYPE_RDP_PASSWORD,
                buildRdpVaultKey(options, this.getRdpDefaults()),
            )
            return secret?.value ?? null
        }
        return this.getKeytarCredential(buildRdpKeytarTarget(options, this.getRdpDefaults()))
    }

    async deleteRdpPasswordEverywhere (options: Partial<RDPProfileOptions>): Promise<void> {
        await this.deleteEverywhere(
            VAULT_SECRET_TYPE_RDP_PASSWORD,
            buildRdpVaultKey(options, this.getRdpDefaults()),
            buildRdpKeytarTarget(options, this.getRdpDefaults()),
        )
    }

    async deleteRdpPassword (options: Partial<RDPProfileOptions>): Promise<void> {
        if (this.vault.isEnabled()) {
            await this.vault.removeSecret(
                VAULT_SECRET_TYPE_RDP_PASSWORD,
                buildRdpVaultKey(options, this.getRdpDefaults()),
            )
        } else {
            await this.deleteKeytarCredential(buildRdpKeytarTarget(options, this.getRdpDefaults()), true)
        }
    }

    hasSameRdpCredentialIdentity (a: Partial<RDPProfileOptions>, b: Partial<RDPProfileOptions>): boolean {
        return hasSameRdpCredentialTarget(
            a,
            b,
            this.vault.isEnabled() ? 'vault' : 'keytar',
            this.getRdpDefaults(),
        )
    }

    hasSameRdpCredentialIdentityAnywhere (
        a: Partial<RDPProfileOptions>,
        b: Partial<RDPProfileOptions>,
    ): boolean {
        const defaults = this.getRdpDefaults()
        return hasSameRdpCredentialTarget(a, b, 'vault', defaults) ||
            hasSameRdpCredentialTarget(a, b, 'keytar', defaults)
    }

    async migratePlaintextPasswords (profiles: any[]): Promise<boolean> {
        let changed = false

        for (const profile of profiles) {
            const password = profile?.options?.password
            if (typeof password !== 'string' || !password) {
                continue
            }

            try {
                if (profile.type === 'ssh') {
                    const effective = resolveSshCredentialOptions(profile.options, this.getSshDefaults())
                    if (!effective.user) continue
                    await this.saveSshPassword(profile as SSHProfile, password)
                } else if (profile.type === 'rdp') {
                    await this.saveRdpPassword(profile.options, password)
                } else {
                    continue
                }
                delete profile.options.password
                changed = true
            } catch (error) {
                console.error(`Could not migrate ${profile.type} password for ${profile.name || 'unnamed profile'}`, error)
            }
        }

        return changed
    }

    private async deleteEverywhere (
        vaultType: string,
        vaultKey: Record<string, unknown>,
        keytarTarget: StoredCredentialTarget,
    ): Promise<void> {
        const results = await Promise.allSettled([
            this.vault.removeSecret(vaultType, vaultKey),
            this.deleteKeytarCredential(keytarTarget, true),
        ])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) {
            throw failure.reason
        }
    }

    private async setKeytarCredential (target: StoredCredentialTarget, password: string): Promise<void> {
        await this.getKeytar().setPassword(target.service, target.account, password)
    }

    private async getKeytarCredential (target: StoredCredentialTarget): Promise<string | null> {
        return this.getKeytar().getPassword(target.service, target.account)
    }

    private async deleteKeytarCredential (target: StoredCredentialTarget, rethrow: boolean): Promise<void> {
        try {
            await this.getKeytar().deletePassword(target.service, target.account)
        } catch (error) {
            if (rethrow) throw error
            console.warn('Could not remove stale system credential', error)
        }
    }

    private getKeytar (): KeytarApi {
        return require('keytar') as KeytarApi
    }

    private getSshDefaults (): Partial<SSHProfileOptions> {
        return this.config?.store?.profileDefaults?.ssh?.options || {}
    }

    private getRdpDefaults (): Partial<RDPProfileOptions> {
        return this.config?.store?.profileDefaults?.rdp?.options || {}
    }
}
