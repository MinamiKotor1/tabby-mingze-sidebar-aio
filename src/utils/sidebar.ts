import { CONFIG_KEY } from '../models/interfaces'
import type { SidebarConfig } from '../models/interfaces'

export interface SidebarLayoutRefreshScheduler {
    requestFrame: (callback: () => void) => unknown
    cancelFrame: (handle: unknown) => void
}

export interface SidebarInitializationScheduler extends SidebarLayoutRefreshScheduler {
    scheduleTask: (callback: () => void) => unknown
    cancelTask: (handle: unknown) => void
}

export interface SidebarDelayedTaskScheduler {
    scheduleTask: (callback: () => void, delay: number) => unknown
    cancelTask: (handle: unknown) => void
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

export interface SidebarTerminalSessionTarget {
    size?: {
        columns: number
        rows: number
    }
    session?: {
        open: boolean
        resize: (columns: number, rows: number) => void
    } | null
}

export interface SidebarTerminalSessionSizeSnapshot {
    terminal: SidebarTerminalSessionTarget
    columns: number
    rows: number
}

function isPositiveInteger (value: unknown): value is number {
    return Number.isInteger(value) && (value as number) > 0
}

export function scheduleSidebarInitialization (
    attempt: () => boolean,
    scheduler: SidebarInitializationScheduler,
    maxFrameRetries = 8,
): () => void {
    let cancelled = false
    let settled = false
    let frameHandle: unknown
    let retriesRemaining = Number.isFinite(maxFrameRetries)
        ? Math.max(0, Math.floor(maxFrameRetries))
        : 0

    const attemptIfActive = () => {
        if (cancelled || settled) return
        if (attempt()) {
            settled = true
            return
        }
        if (retriesRemaining === 0) return
        retriesRemaining--
        frameHandle = scheduler.requestFrame(attemptIfActive)
    }

    const taskHandle = scheduler.scheduleTask(attemptIfActive)

    return () => {
        if (cancelled || settled) return
        cancelled = true
        scheduler.cancelTask(taskHandle)
        if (frameHandle !== undefined) {
            scheduler.cancelFrame(frameHandle)
        }
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

export function scheduleSidebarTerminalSessionSync (
    notify: () => void,
    scheduler: SidebarDelayedTaskScheduler,
    delay: number,
): () => void {
    let cancelled = false
    const handle = scheduler.scheduleTask(() => {
        if (!cancelled) notify()
    }, delay)

    return () => {
        if (cancelled) return
        cancelled = true
        scheduler.cancelTask(handle)
    }
}

export function captureSidebarTerminalSessionSizes (
    terminals: Iterable<SidebarTerminalSessionTarget>,
): SidebarTerminalSessionSizeSnapshot[] {
    const snapshots: SidebarTerminalSessionSizeSnapshot[] = []
    for (const terminal of terminals) {
        const columns = terminal.size?.columns
        const rows = terminal.size?.rows
        if (!isPositiveInteger(columns) || !isPositiveInteger(rows)) continue
        snapshots.push({ terminal, columns, rows })
    }
    return snapshots
}

export function syncSidebarTerminalSessionSizes (
    snapshots: Iterable<SidebarTerminalSessionSizeSnapshot>,
    onError?: (error: unknown) => void,
): void {
    for (const snapshot of snapshots) {
        const { terminal } = snapshot
        const columns = terminal.size?.columns
        const rows = terminal.size?.rows
        const session = terminal.session
        if (!session?.open) continue
        if (!isPositiveInteger(columns) || !isPositiveInteger(rows)) continue
        if (columns === snapshot.columns && rows === snapshot.rows) continue

        try {
            session.resize(columns, rows)
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
