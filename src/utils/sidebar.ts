import { CONFIG_KEY } from '../models/interfaces'
import type { SidebarConfig } from '../models/interfaces'

export interface SidebarLayoutRefreshScheduler {
    requestFrame: (callback: () => void) => unknown
    cancelFrame: (handle: unknown) => void
}

export interface SidebarLayoutTarget {
    container: HTMLElement
    content: HTMLElement
    mode: 'flex' | 'overlay'
}

export interface SidebarTerminalLayoutTarget {
    zoom: number
    frontend?: {
        setZoom: (zoom: number) => void
    }
}

export function scheduleSidebarLayoutRefresh (
    notify: () => void,
    scheduler: SidebarLayoutRefreshScheduler,
): () => void {
    let cancelled = false
    let secondFrameHandle: unknown

    const notifyIfActive = () => {
        if (!cancelled) notify()
    }

    const firstFrameHandle = scheduler.requestFrame(() => {
        if (cancelled) return
        secondFrameHandle = scheduler.requestFrame(notifyIfActive)
    })

    return () => {
        if (cancelled) return
        cancelled = true
        scheduler.cancelFrame(firstFrameHandle)
        if (secondFrameHandle !== undefined) {
            scheduler.cancelFrame(secondFrameHandle)
        }
    }
}

export function refreshSidebarTerminalLayouts (
    terminals: Iterable<SidebarTerminalLayoutTarget>,
    onError?: (error: unknown) => void,
): void {
    for (const terminal of terminals) {
        try {
            terminal.frontend?.setZoom(terminal.zoom)
        } catch (error) {
            onError?.(error)
        }
    }
}

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

export function findSidebarLayoutTarget (appRoot: Element): SidebarLayoutTarget | null {
    for (const child of Array.from(appRoot.children)) {
        if (child.classList.contains('content')) {
            const content = child as HTMLElement
            return { container: content, content, mode: 'overlay' }
        }

        if (!child.classList.contains('window')) continue
        for (const nestedChild of Array.from(child.children)) {
            if (nestedChild.classList.contains('content')) {
                return {
                    container: child as HTMLElement,
                    content: nestedChild as HTMLElement,
                    mode: 'flex',
                }
            }
        }
    }

    return null
}
