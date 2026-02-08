import { Profile } from 'tabby-core'

export interface RDPProfile extends Profile {
    type: 'rdp'
    options: RDPProfileOptions
}

export interface RDPProfileOptions {
    host: string
    port: number
    username?: string
    password?: string
    domain?: string
    fullscreen?: boolean
    width?: number
    height?: number
    admin?: boolean
}

export interface SidebarConfig {
    enabled: boolean
    position: 'left' | 'right'
    width: number
    showInToolbar: boolean
    sidebarVisible: boolean
    pinnedProfiles: string[]
    sortBy: 'name' | 'host' | 'recent' | 'type'
    protocolFilter: 'all' | 'ssh' | 'telnet' | 'rdp'
    showProtocolBadge: boolean
    rdpClientPath: string
    groupBy: 'group' | 'protocol'
}

export const PROTOCOL_META = {
    ssh: { label: 'SSH', color: '#22c55e', icon: 'lock' },
    telnet: { label: 'Telnet', color: '#f59e0b', icon: 'terminal' },
    rdp: { label: 'RDP', color: '#3b82f6', icon: 'desktop' },
} as const

export type ProtocolType = keyof typeof PROTOCOL_META

export const SUPPORTED_PROTOCOLS: ProtocolType[] = ['ssh', 'telnet', 'rdp']

export const CONFIG_KEY = 'mingze-sidebar-aio'
