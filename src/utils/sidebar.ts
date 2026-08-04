import { CONFIG_KEY } from '../models/interfaces'
import type { SidebarConfig } from '../models/interfaces'

export function getSidebarConfig (store: any): Partial<SidebarConfig> | null {
    const config = store?.[CONFIG_KEY]
    return config && typeof config === 'object' ? config : null
}

export function updateSidebarConfig (
    store: any,
    changes: Partial<SidebarConfig>,
): boolean {
    const config = getSidebarConfig(store)
    if (!config) return false

    Object.assign(config, changes)
    return true
}

export function normalizeSidebarProtocolFilter (store: any): boolean {
    const config = getSidebarConfig(store)
    if (!config) return false

    const filter = config.protocolFilter as string | undefined
    if (filter === 'ssh' || filter === 'telnet' || filter === 'rdp') return false

    config.protocolFilter = 'ssh'
    return true
}

export function findSidebarLayoutHost (appRoot: Element): HTMLElement | null {
    for (const child of Array.from(appRoot.children)) {
        if (child.classList.contains('content')) {
            return child as HTMLElement
        }

        if (!child.classList.contains('window')) continue
        for (const nestedChild of Array.from(child.children)) {
            if (nestedChild.classList.contains('content')) {
                return nestedChild as HTMLElement
            }
        }
    }

    return null
}
