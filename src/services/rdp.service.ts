import { Injectable } from '@angular/core'
import { HostAppService, Platform, NotificationsService, ConfigService } from 'tabby-core'
import { RDPProfile, RDPProfileOptions, CONFIG_KEY } from '../models/interfaces'
import {
    CredentialStorageService,
    normalizeRdpCredentialOptions,
    VAULT_SECRET_TYPE_RDP_PASSWORD,
} from './credentialStorage.service'
import { formatRdpAddress } from '../utils/rdp'

const DEFAULT_RDP_WIDTH = 1920
const DEFAULT_RDP_HEIGHT = 1080
const DEFAULT_RDP_PORT = 3389
const LAUNCH_MAP_MAX_SIZE = 64
const PROCESS_START_TIMEOUT = 5000
const CMDKEY_TIMEOUT = 5000

export { VAULT_SECRET_TYPE_RDP_PASSWORD }

export interface RdpLaunchResult {
    launched: boolean
    client?: string
    reason?: 'duplicate'
}

@Injectable({ providedIn: 'root' })
export class RdpService {
    private lastLaunchAt = new Map<string, number>()

    constructor (
        private hostApp: HostAppService,
        private notifications: NotificationsService,
        private config: ConfigService,
        private credentials: CredentialStorageService,
    ) {}

    async launch (profile: RDPProfile): Promise<RdpLaunchResult> {
        if (this.hostApp.platform !== Platform.Windows) {
            throw new Error('RDP is only supported on Windows (mstsc.exe)')
        }

        const opts = this.normalizeOptions(profile.options)
        if (!opts.host) {
            throw new Error('Invalid RDP host')
        }

        const key = formatRdpAddress(opts.host, opts.port || DEFAULT_RDP_PORT)
        const reservation = this.reserveLaunch(key)
        if (reservation === null) {
            return { launched: false, reason: 'duplicate' }
        }

        try {
            const password = await this.loadPassword(opts)
            if (password) {
                opts.password = password
            }

            await this.storeSavedCredentials(opts)

            const args = this.buildLaunchArgs(opts)
            if (args.length === 0) {
                throw new Error('Failed to prepare RDP launch arguments')
            }

            const launchTarget = this.getClientPath()
            if (launchTarget === 'system-default') {
                await this.spawnDetached('explorer.exe', [args[0]], 'Failed to open system default RDP handler')
                return { launched: true, client: 'system-default' }
            }

            await this.spawnDetached(launchTarget, args, `Failed to launch ${launchTarget}`)
            return { launched: true, client: launchTarget }
        } catch (error) {
            if (this.lastLaunchAt.get(key) === reservation) {
                this.lastLaunchAt.delete(key)
            }
            throw error
        }
    }

    isActive (profile: RDPProfile): boolean {
        const opts = this.normalizeOptions(profile.options)
        if (!opts.host) return false
        const key = formatRdpAddress(opts.host, opts.port || DEFAULT_RDP_PORT)
        const last = this.lastLaunchAt.get(key)
        if (!last) return false
        return Date.now() - last < 3600000
    }

    async savePassword (opts: Partial<RDPProfileOptions>, password: string): Promise<void> {
        await this.credentials.saveRdpPassword(opts, password)
    }

    async loadPassword (opts: Partial<RDPProfileOptions>): Promise<string | null> {
        const plaintext = this.sanitizePassword(opts.password)
        if (plaintext) return plaintext
        return this.credentials.loadRdpPassword(opts)
    }

    async deletePassword (opts: Partial<RDPProfileOptions>): Promise<void> {
        await this.credentials.deleteRdpPassword(opts)
    }

    async deletePasswordEverywhere (opts: Partial<RDPProfileOptions>): Promise<void> {
        await this.credentials.deleteRdpPasswordEverywhere(opts)
    }

    hasSameCredentialIdentity (a: Partial<RDPProfileOptions>, b: Partial<RDPProfileOptions>): boolean {
        return this.credentials.hasSameRdpCredentialIdentity(a, b)
    }

    hasSameCredentialIdentityAnywhere (a: Partial<RDPProfileOptions>, b: Partial<RDPProfileOptions>): boolean {
        return this.credentials.hasSameRdpCredentialIdentityAnywhere(a, b)
    }

    hasOverlappingWindowsCredentialTargets (
        a: Partial<RDPProfileOptions>,
        b: Partial<RDPProfileOptions>,
    ): boolean {
        const targetsB = new Set(this.buildCredentialTargets(b).map(target => target.toLowerCase()))
        return this.buildCredentialTargets(a).some(target => targetsB.has(target.toLowerCase()))
    }

    async deleteCredentials (opts: Partial<RDPProfileOptions>): Promise<void> {
        const results = await Promise.allSettled([
            this.deletePasswordEverywhere(opts),
            this.deleteSavedWindowsCredentials(opts),
        ])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
    }

    async deleteProfileCredentials (profile: RDPProfile): Promise<void> {
        const others = this.getOtherStoredRdpProfiles(profile)
        const secureShared = others.some(other => (
            this.hasSameCredentialIdentityAnywhere(other.options || {}, profile.options)
        ))
        const windowsShared = others.some(other => (
            this.hasOverlappingWindowsCredentialTargets(other.options || {}, profile.options)
        ))

        const operations: Promise<void>[] = []
        if (!secureShared) operations.push(this.deletePasswordEverywhere(profile.options))
        if (!windowsShared) operations.push(this.deleteSavedWindowsCredentials(profile.options))

        const results = await Promise.allSettled(operations)
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
    }

    async deletePreviousCredentials (opts: Partial<RDPProfileOptions>): Promise<void> {
        const results = await Promise.allSettled([
            this.deletePassword(opts),
            this.deleteSavedWindowsCredentials(opts),
        ])
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
    }

    async deleteSavedWindowsCredentials (opts: Partial<RDPProfileOptions>): Promise<void> {
        if (this.hostApp.platform !== Platform.Windows) return

        const targets = this.buildCredentialTargets(opts)
        await Promise.all(targets.map(async target => {
            try {
                const deleted = await this.runCmdKey([`/delete:${target}`])
                if (!deleted) {
                    throw new Error(`cmdkey.exe could not delete ${target}`)
                }
            } catch (error) {
                console.warn(`Could not remove Windows credential ${target}`, error)
                throw error
            }
        }))
    }

    private buildLaunchArgs (opts: RDPProfileOptions): string[] {
        const tmpPath = this.writeTempRdpFile(this.buildRdpFileContent(opts))
        this.cleanupTempFileLater(tmpPath)
        return [tmpPath]
    }

    private getOtherStoredRdpProfiles (profile: RDPProfile): RDPProfile[] {
        const stored = (this.config.store.profiles || []).filter(candidate => candidate?.type === 'rdp')
        let excludedSnapshot = false

        return stored.filter(candidate => {
            if (profile.id && candidate.id === profile.id) return false
            if (!profile.id && !excludedSnapshot && this.matchesProfileSnapshot(candidate, profile)) {
                excludedSnapshot = true
                return false
            }
            return true
        }) as RDPProfile[]
    }

    private matchesProfileSnapshot (a: RDPProfile, b: RDPProfile): boolean {
        return a.name === b.name &&
            (a.group || '') === (b.group || '') &&
            this.hasSameCredentialIdentityAnywhere(a.options || {}, b.options || {})
    }

    private buildRdpFileContent (opts: RDPProfileOptions): string {
        const size = this.resolveDesktopSize(opts)
        const lines: string[] = [
            `full address:s:${formatRdpAddress(opts.host, opts.port || DEFAULT_RDP_PORT)}`,
        ]

        if (opts.username) {
            lines.push(`username:s:${opts.username}`)
        }
        if (opts.domain) {
            lines.push(`domain:s:${opts.domain}`)
        }

        if (opts.username && opts.password) {
            lines.push('prompt for credentials:i:0')
        }

        if (opts.fullscreen) {
            lines.push('screen mode id:i:2')
        } else {
            lines.push('screen mode id:i:1')
            lines.push(`desktopwidth:i:${size.width}`)
            lines.push(`desktopheight:i:${size.height}`)
            lines.push('smart sizing:i:0')
        }

        if (opts.admin) {
            lines.push('administrative session:i:1')
        }

        return lines.join('\r\n') + '\r\n'
    }

    private resolveDesktopSize (opts: RDPProfileOptions): { width: number, height: number } {
        if (opts.fullscreen) {
            return {
                width: DEFAULT_RDP_WIDTH,
                height: DEFAULT_RDP_HEIGHT,
            }
        }

        const width = this.normalizeDimension(opts.width) || DEFAULT_RDP_WIDTH
        const height = this.normalizeDimension(opts.height) || DEFAULT_RDP_HEIGHT
        return { width, height }
    }

    private writeTempRdpFile (content: string): string {
        const os = require('os')
        const path = require('path')
        const fs = require('fs')
        const tmpDir = os.tmpdir()
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const tmpFile = path.join(tmpDir, `tabby-rdp-${suffix}.rdp`)
        fs.writeFileSync(tmpFile, content, 'utf-8')
        return tmpFile
    }

    private cleanupTempFileLater (tmpPath: string): void {
        setTimeout(() => {
            try {
                const fs = require('fs')
                fs.unlinkSync(tmpPath)
            } catch {
                // Best-effort cleanup.
            }
        }, 120000)
    }

    private reserveLaunch (key: string): number | null {
        const now = Date.now()
        const last = this.lastLaunchAt.get(key) || 0
        if (now - last < 1500) return null

        this.lastLaunchAt.set(key, now)
        if (this.lastLaunchAt.size > LAUNCH_MAP_MAX_SIZE) {
            const cutoff = now - 3600000
            for (const [storedKey, timestamp] of this.lastLaunchAt) {
                if (timestamp < cutoff) this.lastLaunchAt.delete(storedKey)
            }
        }
        return now
    }

    private async spawnDetached (command: string, args: string[], errorMessage: string): Promise<void> {
        const { spawn } = require('child_process')
        const proc = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        })

        await new Promise<void>((resolve, reject) => {
            let started = false
            const timer = setTimeout(() => {
                if (!started) {
                    proc.kill()
                    reject(new Error(`${errorMessage}: process start timed out`))
                }
            }, PROCESS_START_TIMEOUT)

            proc.once('spawn', () => {
                started = true
                clearTimeout(timer)
                resolve()
            })
            proc.once('error', (error: Error) => {
                clearTimeout(timer)
                if (!started) {
                    reject(new Error(`${errorMessage}: ${error.message}`))
                } else {
                    this.notifications.error(errorMessage, error.message)
                }
            })
        })

        proc.unref()
    }

    private async storeSavedCredentials (opts: RDPProfileOptions): Promise<void> {
        if (!opts.host || !opts.username || !opts.password) return

        const username = this.buildCredentialUsername(opts)
        if (!username) return

        const results = await Promise.all(this.buildCredentialTargets(opts).map(target => (
            this.runCmdKey([
                `/generic:${target}`,
                `/user:${username}`,
                `/pass:${opts.password}`,
            ]).catch(error => {
                console.warn(`Could not save Windows credential ${target}`, error)
                return false
            })
        )))

        if (!results.some(Boolean)) {
            this.notifications.info('Windows could not pre-save the RDP credential; mstsc may prompt for it')
        }
    }

    private buildCredentialTargets (opts: Partial<RDPProfileOptions>): string[] {
        const effective = normalizeRdpCredentialOptions(opts, this.getRdpDefaults())
        const host = effective.host
        if (!host) return []

        const targets = [`TERMSRV/${host}`]
        const port = effective.port || DEFAULT_RDP_PORT
        if (port !== DEFAULT_RDP_PORT) {
            targets.push(`TERMSRV/${formatRdpAddress(host, port)}`)
        }
        return targets
    }

    private getRdpDefaults (): Partial<RDPProfileOptions> {
        return this.config.store.profileDefaults?.rdp?.options || {}
    }

    private async runCmdKey (args: string[]): Promise<boolean> {
        const { spawn } = require('child_process')
        const proc = spawn('cmdkey.exe', args, {
            stdio: 'ignore',
            windowsHide: true,
        })

        return new Promise<boolean>((resolve, reject) => {
            let settled = false
            const finish = (callback: () => void): void => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                callback()
            }
            const timer = setTimeout(() => {
                proc.kill()
                finish(() => reject(new Error('cmdkey.exe timed out')))
            }, CMDKEY_TIMEOUT)

            proc.once('error', (error: Error) => finish(() => reject(error)))
            proc.once('exit', (code: number | null) => finish(() => resolve(code === 0)))
        })
    }

    private buildCredentialUsername (opts: RDPProfileOptions): string | undefined {
        const user = this.sanitizeText(opts.username)
        if (!user) return undefined

        const domain = this.sanitizeText(opts.domain)
        return domain ? `${domain}\\${user}` : user
    }

    private normalizeOptions (opts: RDPProfileOptions): RDPProfileOptions {
        const host = (opts.host || '').replace(/[\r\n]+/g, '').trim()
        const normalized: RDPProfileOptions = {
            ...opts,
            host,
            port: this.normalizePort(opts.port),
            username: this.sanitizeText(opts.username),
            password: this.sanitizePassword(opts.password),
            domain: this.sanitizeText(opts.domain),
            width: this.normalizeDimension(opts.width),
            height: this.normalizeDimension(opts.height),
        }

        if (normalized.fullscreen) {
            normalized.width = undefined
            normalized.height = undefined
        }
        return normalized
    }

    private sanitizeText (value?: string): string | undefined {
        if (!value) return undefined
        const cleaned = value.replace(/[\r\n]+/g, '').trim()
        return cleaned || undefined
    }

    private sanitizePassword (value?: string): string | undefined {
        if (value === undefined || value === null) return undefined
        const cleaned = String(value).replace(/[\r\n]+/g, '')
        return cleaned || undefined
    }

    private normalizePort (port?: number): number {
        const value = Number(port || DEFAULT_RDP_PORT)
        if (!Number.isFinite(value)) return DEFAULT_RDP_PORT
        const rounded = Math.round(value)
        return rounded >= 1 && rounded <= 65535 ? rounded : DEFAULT_RDP_PORT
    }

    private normalizeDimension (value?: number): number | undefined {
        if (value === undefined || value === null || value === 0) return undefined
        const num = Number(value)
        if (!Number.isFinite(num)) return undefined
        const rounded = Math.round(num)
        return rounded >= 640 && rounded <= 8192 ? rounded : undefined
    }

    private getClientPath (): string {
        const raw = this.config.store[CONFIG_KEY]?.rdpClientPath
        const value = typeof raw === 'string' ? raw.trim() : ''
        if (!value) return 'mstsc.exe'

        const lower = value.toLowerCase()
        if (lower === 'default' || lower === 'auto' || lower === 'system-default') {
            return 'system-default'
        }
        return value
    }
}
