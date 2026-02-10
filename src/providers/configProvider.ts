import { ConfigProvider } from 'tabby-core'

export class AioConfigProvider extends ConfigProvider {
    defaults = {
        'mingze-sidebar-aio': {
            enabled: true,
            position: 'left',
            width: 280,
            showInToolbar: true,
            sidebarVisible: true,
            pinnedProfiles: [],
            sortBy: 'name',
            protocolFilter: 'ssh',
            showProtocolBadge: true,
            rdpClientPath: 'mstsc.exe',
            groupBy: 'group',
        },
        hotkeys: {
            'toggle-connection-sidebar': [],
        },
    }
}
