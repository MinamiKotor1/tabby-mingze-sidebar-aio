import { Injectable } from '@angular/core'
import { HostAppService, Platform, PlatformService, NotificationsService, ConfigService } from 'tabby-core'
import { RDPProfile, CONFIG_KEY } from '../models/interfaces'

@Injectable({ providedIn: 'root' })
export class RdpService {
    private activeProcesses = new Map<string, { proc: any, tmpPath: string }>()

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

        const key = `${profile.options.host}:${profile.options.port || 3389}`
        const existing = this.activeProcesses.get(key)
        if (existing) {
            try {
                existing.proc.kill(0)
                return
            } catch {
                this.cleanupEntry(key)
            }
        }

        const rdpContent = this.buildRdpFileContent(profile.options)
        const tmpPath = this.writeTempRdpFile(rdpContent)

        const clientPath = this.getClientPath()
        const { spawn } = require('child_process')
        const proc = spawn(clientPath, [tmpPath], { detached: true, stdio: 'ignore' })

        this.activeProcesses.set(key, { proc, tmpPath })

        proc.on('exit', () => this.cleanupEntry(key))
        proc.on('error', () => this.cleanupEntry(key))
        proc.unref()
    }

    isActive (profile: RDPProfile): boolean {
        const key = `${profile.options.host}:${profile.options.port || 3389}`
        const entry = this.activeProcesses.get(key)
        if (!entry) return false
        try {
            entry.proc.kill(0)
            return true
        } catch {
            this.cleanupEntry(key)
            return false
        }
    }

    private cleanupEntry (key: string): void {
        const entry = this.activeProcesses.get(key)
        if (!entry) return
        this.activeProcesses.delete(key)
        try {
            const fs = require('fs')
            fs.unlinkSync(entry.tmpPath)
        } catch {}
    }

    private buildRdpFileContent (opts: RDPProfile['options']): string {
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
            lines.push('smart sizing:i:1')
        }
        if (opts.width) {
            lines.push(`desktopwidth:i:${opts.width}`)
        }
        if (opts.height) {
            lines.push(`desktopheight:i:${opts.height}`)
        }
        if (opts.admin) {
            lines.push('administrative session:i:1')
        }
        return lines.join('\r\n') + '\r\n'
    }

    private writeTempRdpFile (content: string): string {
        const os = require('os')
        const path = require('path')
        const fs = require('fs')
        const tmpDir = os.tmpdir()
        const tmpFile = path.join(tmpDir, `tabby-rdp-${Date.now()}.rdp`)
        fs.writeFileSync(tmpFile, content, 'utf-8')
        return tmpFile
    }

    private getClientPath (): string {
        return this.config.store[CONFIG_KEY]?.rdpClientPath || 'mstsc.exe'
    }

    generateRdpFileContent (profile: RDPProfile): string {
        return this.buildRdpFileContent(profile.options)
    }
}
