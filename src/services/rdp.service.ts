import { Injectable } from '@angular/core'
import { HostAppService, Platform, PlatformService, NotificationsService } from 'tabby-core'
import { RDPProfile } from '../models/interfaces'

@Injectable({ providedIn: 'root' })
export class RdpService {
    constructor (
        private hostApp: HostAppService,
        private platform: PlatformService,
        private notifications: NotificationsService,
    ) {}

    launch (profile: RDPProfile): void {
        if (this.hostApp.platform !== Platform.Windows) {
            this.notifications.error('RDP is only supported on Windows (mstsc.exe)')
            return
        }

        const opts = profile.options
        const args: string[] = []

        if (opts.username || opts.domain) {
            const rdpContent = this.buildRdpFileContent(opts)
            const tmpPath = this.writeTempRdpFile(rdpContent)
            args.push(tmpPath)
        } else {
            args.push(`/v:${opts.host}:${opts.port || 3389}`)
        }

        if (opts.fullscreen) {
            args.push('/f')
        }

        if (opts.width && opts.height && !opts.fullscreen) {
            args.push(`/w:${opts.width}`)
            args.push(`/h:${opts.height}`)
        }

        if (opts.admin) {
            args.push('/admin')
        }

        const clientPath = this.getClientPath()
        const { spawn } = require('child_process')
        spawn(clientPath, args, { detached: true, stdio: 'ignore' }).unref()
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
        return 'mstsc.exe'
    }

    generateRdpFileContent (profile: RDPProfile): string {
        return this.buildRdpFileContent(profile.options)
    }
}
