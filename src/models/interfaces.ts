import { Profile } from 'tabby-core'

export interface SSHProfile extends Profile {
    type: 'ssh'
    options: SSHProfileOptions
}

export interface SSHProfileOptions {
    host: string
    port: number
    user?: string
    password?: string
    auth?: string | null
    privateKeys?: string[]
}

export interface TelnetProfile extends Profile {
    type: 'telnet'
    options: TelnetProfileOptions
}

export interface TelnetProfileOptions {
    host: string
    port: number
    inputMode?: string
    outputMode?: string | null
    inputNewlines?: string | null
    outputNewlines?: string | null
    scripts?: any[]
}

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
    protocolFilter: 'ssh' | 'telnet' | 'rdp'
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


export function isImportedSshConfigGroup (group?: string): boolean {
    const lower = (group || '').trim().toLowerCase()
    if (!lower) return false

    if (lower.includes('.ssh/config') || lower.includes('~/.ssh/config')) {
        return true
    }

    return lower.includes('import') && lower.includes('ssh') && lower.includes('config')
}
