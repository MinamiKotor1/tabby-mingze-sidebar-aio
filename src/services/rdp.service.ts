import { Injectable } from '@angular/core'
import { HostAppService, Platform, PlatformService, NotificationsService, ConfigService } from 'tabby-core'
import { RDPProfile, CONFIG_KEY } from '../models/interfaces'

@Injectable({ providedIn: 'root' })
export class RdpService {
    private lastLaunchAt = new Map<string, number>()

    constructor (
        private hostApp: HostAppService,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private config: ConfigService,
    ) {}

    launch (profile: RDPProfile): void {
        if (this.hostApp.platform !== Platform.Windows) {
            this.notifications.error('RDP is only supported on Windows (mstsc.exe)')
            return
        }

        const opts = this.normalizeOptions(profile.options)
        if (!opts.host) {
            this.notifications.error('Invalid RDP host')
            return
        }

        const key = `${opts.host}:${opts.port}`
        if (this.isRapidRepeatLaunch(key)) {
            return
        }

        const args = this.buildLaunchArgs(opts)
        if (args.length === 0) {
            this.notifications.error('Failed to prepare RDP launch arguments')
            return
        }

        const clientPath = this.getClientPath()
        const { spawn } = require('child_process')
        const proc = spawn(clientPath, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        })

        proc.on('error', () => {
            this.notifications.error(`Failed to launch ${clientPath}`)
        })

        proc.unref()
    }

    isActive (profile: RDPProfile): boolean {
        const opts = this.normalizeOptions(profile.options)
        if (!opts.host) return false
        const key = `${opts.host}:${opts.port}`
        const last = this.lastLaunchAt.get(key)
        if (!last) return false
        return Date.now() - last < 3600000
    }

    private buildLaunchArgs (opts: RDPProfile['options']): string[] {
        const tmpPath = this.writeTempRdpFile(this.buildRdpFileContent(opts))
        this.cleanupTempFileLater(tmpPath)
        return [tmpPath]
    }

    private buildRdpFileContent (opts: RDPProfile['options']): string {
        const size = this.resolveDesktopSize(opts)
        const lines: string[] = [
            `full address:s:${opts.host}:${opts.port || 3389}`,
        ]

        if (opts.username) {
            lines.push(`username:s:${opts.username}`)
        }
        if (opts.domain) {
            lines.push(`domain:s:${opts.domain}`)
        }

        if (opts.fullscreen) {
            lines.push('screen mode id:i:2')
        } else {
            lines.push('screen mode id:i:1')
            // Ask RDP client to send monitor resize updates to the remote session.
            lines.push('dynamic resolution:i:1')
            // Disable client-side scaling so remote resolution update is visible.
            lines.push('smart sizing:i:0')

            // Only lock the starting resolution when user explicitly sets both values.
            if (size.width && size.height) {
                lines.push(`desktopwidth:i:${size.width}`)
                lines.push(`desktopheight:i:${size.height}`)
            }
        }

        if (opts.admin) {
            lines.push('administrative session:i:1')
        }

        return lines.join('\r\n') + '\r\n'
    }

    private resolveDesktopSize (opts: RDPProfile['options']): { width?: number, height?: number } {
        if (opts.fullscreen) {
            return {}
        }

        const width = this.normalizeDimension(opts.width)
        const height = this.normalizeDimension(opts.height)

        if (!width || !height) {
            return {}
        }

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

    private isRapidRepeatLaunch (key: string): boolean {
        const now = Date.now()
        const last = this.lastLaunchAt.get(key) || 0
        this.lastLaunchAt.set(key, now)
        return now - last < 1500
    }

    private normalizeOptions (opts: RDPProfile['options']): RDPProfile['options'] {
        const host = (opts.host || '').replace(/[\r\n]+/g, '').trim()

        const normalized: RDPProfile['options'] = {
            ...opts,
            host,
            port: this.normalizePort(opts.port),
            username: this.sanitizeText(opts.username),
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

    private normalizePort (port?: number): number {
        const value = Number(port || 3389)
        if (!Number.isFinite(value)) return 3389
        const rounded = Math.round(value)
        if (rounded < 1 || rounded > 65535) return 3389
        return rounded
    }

    private normalizeDimension (value?: number): number | undefined {
        if (value === undefined || value === null || value === 0) return undefined
        const num = Number(value)
        if (!Number.isFinite(num)) return undefined
        const rounded = Math.round(num)
        if (rounded < 640 || rounded > 8192) return undefined
        return rounded
    }

    private getClientPath (): string {
        return this.config.store[CONFIG_KEY]?.rdpClientPath || 'mstsc.exe'
    }

    generateRdpFileContent (profile: RDPProfile): string {
        return this.buildRdpFileContent(this.normalizeOptions(profile.options))
    }
}
