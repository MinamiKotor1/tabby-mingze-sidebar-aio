import { Injectable } from '@angular/core'
import {
    ProfileProvider,
    NewTabParameters,
    PartialProfile,
    TranslateService,
} from 'tabby-core'
import { RDPProfile, RDPProfileOptions } from '../models/interfaces'
import { RdpTabComponent } from '../components/rdpTab.component'

@Injectable()
export class RDPProfileProvider extends ProfileProvider<RDPProfile> {
    id = 'rdp'
    name = 'RDP'
    supportsQuickConnect = true
    settingsComponent = null

    constructor (
        private translate: TranslateService,
    ) {
        super()
    }

    async getBuiltinProfiles (): Promise<PartialProfile<RDPProfile>[]> {
        return []
    }

    async getNewTabParameters (profile: RDPProfile): Promise<NewTabParameters<RdpTabComponent>> {
        return {
            type: RdpTabComponent,
            inputs: { profile },
        }
    }

    getDescription (profile: PartialProfile<RDPProfile>): string {
        const opts = profile.options as Partial<RDPProfileOptions> | undefined
        if (!opts?.host) {
            return ''
        }
        const user = opts.username || ''
        const host = opts.host
        const port = opts.port || 3389
        const prefix = user ? `${user}@` : ''
        return `${prefix}${host}${port !== 3389 ? ':' + port : ''}`
    }

    quickConnect (query: string): PartialProfile<RDPProfile> {
        let host = query
        let port = 3389
        let username: string | undefined

        if (host.startsWith('rdp://')) {
            host = host.substring(6)
        }

        if (host.includes('@')) {
            const parts = host.split('@')
            username = parts[0]
            host = parts[1]
        }

        if (host.includes(':')) {
            const parts = host.split(':')
            host = parts[0]
            port = parseInt(parts[1], 10) || 3389
        }

        return {
            name: query,
            type: 'rdp',
            options: {
                host,
                port,
                username,
            },
        } as PartialProfile<RDPProfile>
    }

    deleteProfile (_profile: RDPProfile): void {
        // handled by core
    }
}
