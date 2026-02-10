import { NgModule, Injectable } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, {
    ToolbarButtonProvider,
    ToolbarButton,
    ProfileProvider,
    ConfigProvider,
    HotkeyProvider,
    HotkeysService,
    ProfilesService,
    SelectorService,
    ConfigService,
    AppService,
} from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { SidebarComponent } from './components/sidebar.component'
import { ConnectionItemComponent } from './components/connectionItem.component'
import { RdpEditModalComponent } from './components/rdpEditModal.component'
import { SshEditModalComponent } from './components/sshEditModal.component'
import { SettingsTabComponent } from './components/settingsTab.component'
import { RdpTabComponent } from './components/rdpTab.component'

import { SidebarService } from './services/sidebar.service'
import { RdpService } from './services/rdp.service'

import { RDPProfileProvider } from './providers/rdpProfileProvider'
import { AioConfigProvider } from './providers/configProvider'
import { AioHotkeyProvider } from './providers/hotkeyProvider'
import { AioSettingsTabProvider } from './providers/settingsTabProvider'

import { CONFIG_KEY } from './models/interfaces'

@Injectable()
class SidebarToolbarButton extends ToolbarButtonProvider {
    weight = 15

    constructor (
        private sidebarService: SidebarService,
        private config: ConfigService,
        private profiles: ProfilesService,
        private selector: SelectorService,
    ) { super() }

    provide (): ToolbarButton[] {
        const cfg = this.config.store[CONFIG_KEY] || {}
        if (cfg.showInToolbar === false) return []

        return [{
            icon: '<i class="fas fa-globe"></i>',
            title: 'Toggle Connection Sidebar',
            click: () => this.sidebarService.toggle(),
            submenu: async () => [
                {
                    title: this.sidebarService.visible ? 'Hide Sidebar' : 'Show Sidebar',
                    click: () => this.sidebarService.toggle(),
                },
                {
                    title: 'Quick Connect...',
                    click: () => this.showQuickConnect(),
                },
            ],
        }]
    }

    private async showQuickConnect (): Promise<void> {
        const all = await this.profiles.getProfiles()
        const supported = all.filter(p => ['ssh', 'telnet', 'rdp'].includes(p.type))
        if (supported.length === 0) return

        const options = supported.map(p => ({
            name: p.name,
            description: this.profiles.getDescription?.(p) || '',
            result: p,
            icon: 'server',
            weight: 0,
        }))
        options.sort((a, b) => a.name.localeCompare(b.name))

        const selected = await this.selector.show('Select Connection', options)
        if (selected) {
            if (this.profiles.openNewTabForProfile) {
                this.profiles.openNewTabForProfile(selected)
            } else {
                (this.profiles as any).launchProfile(selected)
            }
        }
    }
}

@Injectable()
class SidebarInitializer {
    constructor (
        private sidebarService: SidebarService,
        private app: AppService,
        private hotkeys: HotkeysService,
    ) {
        this.app.ready$.subscribe(() => {
            setTimeout(() => this.sidebarService.initialize(), 1000)
        })
        this.hotkeys.hotkey$.subscribe(key => {
            if (key === 'toggle-connection-sidebar') {
                this.sidebarService.toggle()
            }
        })
    }
}

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
    ],
    declarations: [
        SidebarComponent,
        ConnectionItemComponent,
        RdpEditModalComponent,
        SshEditModalComponent,
        SettingsTabComponent,
        RdpTabComponent,
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: SidebarToolbarButton, multi: true },
        { provide: ProfileProvider, useClass: RDPProfileProvider, multi: true },
        { provide: ConfigProvider, useClass: AioConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: AioHotkeyProvider, multi: true },
        { provide: SettingsTabProvider, useClass: AioSettingsTabProvider, multi: true },
        SidebarService,
        RdpService,
        SidebarInitializer,
    ],
})
export default class MingzeSidebarAioModule {
    constructor (_init: SidebarInitializer) {}
}
