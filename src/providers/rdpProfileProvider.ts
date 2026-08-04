import { Injectable } from '@angular/core'
import {
    ProfileProvider,
    NewTabParameters,
    NotificationsService,
    PartialProfile,
    TranslateService,
} from 'tabby-core'
import { RDPProfile, RDPProfileOptions } from '../models/interfaces'
import { RdpTabComponent } from '../components/rdpTab.component'
import { RdpService } from '../services/rdp.service'
import { formatRdpAddress, parseRdpQuickConnect } from '../utils/rdp'

@Injectable()
export class RDPProfileProvider extends ProfileProvider<RDPProfile> {
    id = 'rdp'
    name = 'RDP'
    supportsQuickConnect = true
    settingsComponent = null

    constructor (
        private translate: TranslateService,
        private rdpService: RdpService,
        private notifications: NotificationsService,
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
        const target = port === 3389 ? host : formatRdpAddress(host, port)
        return `${prefix}${target}`
    }

    quickConnect (query: string): PartialProfile<RDPProfile> {
        const { host, port, username } = parseRdpQuickConnect(query)

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

    deleteProfile (profile: RDPProfile): void {
        void this.rdpService.deleteProfileCredentials(profile).catch(error => {
            const message = error instanceof Error ? error.message : String(error)
            this.notifications.error('Could not remove stored RDP credentials', message)
        })
    }
}
