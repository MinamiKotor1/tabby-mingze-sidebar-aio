import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { SettingsTabComponent } from '../components/settingsTab.component'

@Injectable()
export class AioSettingsTabProvider extends SettingsTabProvider {
    id = 'mingze-sidebar-aio'
    icon = 'globe'
    title = 'Connection Sidebar'

    getComponentType (): any {
        return SettingsTabComponent
    }
}
