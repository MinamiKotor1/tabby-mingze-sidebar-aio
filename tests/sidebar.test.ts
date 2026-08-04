import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CONFIG_KEY } from '../src/models/interfaces'
import {
    captureSidebarTerminalSessionSizes,
    findSidebarLayoutTarget,
    getSidebarConfig,
    normalizeSidebarProtocolFilter,
    refreshSidebarTerminalLayouts,
    scheduleSidebarInitialization,
    scheduleSidebarLayoutRefresh,
    scheduleSidebarTerminalSessionSync,
    syncSidebarTerminalSessionSizes,
    updateSidebarConfig,
} from '../src/utils/sidebar'

function createElement (classes: string[], children: Element[] = []): Element {
    const classNames = new Set(classes)
    return {
        children,
        classList: {
            contains: (name: string) => classNames.has(name),
        },
    } as unknown as Element
}

describe('sidebar config compatibility', () => {
    it('updates leaf values without assigning a getter-only config root', () => {
        let protocolFilter = 'all'
        let sidebarVisible = false
        const config: any = { unknownSetting: { preserve: true } }
        Object.defineProperties(config, {
            protocolFilter: {
                enumerable: true,
                configurable: false,
                get: () => protocolFilter,
                set: value => { protocolFilter = value },
            },
            sidebarVisible: {
                enumerable: true,
                configurable: false,
                get: () => sidebarVisible,
                set: value => { sidebarVisible = value },
            },
        })

        const store: any = {}
        Object.defineProperty(store, CONFIG_KEY, {
            enumerable: true,
            configurable: false,
            get: () => config,
        })

        assert.equal(normalizeSidebarProtocolFilter(store), true)
        assert.equal(protocolFilter, 'ssh')
        assert.equal(updateSidebarConfig(store, { sidebarVisible: true }), true)
        assert.equal(sidebarVisible, true)
        assert.deepEqual(config.unknownSetting, { preserve: true })
        assert.equal(getSidebarConfig(store), config)
        assert.equal(Object.getOwnPropertyDescriptor(store, CONFIG_KEY)?.set, undefined)
    })

    it('leaves a valid protocol filter unchanged', () => {
        const config = { protocolFilter: 'rdp' }
        const store: any = {}
        Object.defineProperty(store, CONFIG_KEY, { get: () => config })

        assert.equal(normalizeSidebarProtocolFilter(store), false)
        assert.equal(config.protocolFilter, 'rdp')
    })

    it('does not fabricate a missing structural config root', () => {
        const store: any = {}

        assert.equal(getSidebarConfig(store), null)
        assert.equal(updateSidebarConfig(store, { sidebarVisible: true }), false)
        assert.equal(Object.prototype.hasOwnProperty.call(store, CONFIG_KEY), false)
    })
})

describe('sidebar layout host compatibility', () => {
    it('uses an overlay fallback for the direct content host in older Tabby versions', () => {
        const content = createElement(['content'])
        const appRoot = createElement([], [createElement(['title-bar']), content])

        assert.deepEqual(findSidebarLayoutTarget(appRoot), {
            container: content,
            content,
            mode: 'overlay',
        })
    })

    it('uses Tabby 1.0.235 native flex layout around the main content', () => {
        const content = createElement(['content', 'main'])
        const window = createElement(['window'], [createElement(['profile-tree']), content])
        const appRoot = createElement([], [createElement(['title-bar']), window])

        assert.deepEqual(findSidebarLayoutTarget(appRoot), {
            container: window,
            content,
            mode: 'flex',
        })
    })

    it('returns null when no supported layout host exists', () => {
        const appRoot = createElement([], [createElement(['window'], [createElement(['other'])])])

        assert.equal(findSidebarLayoutTarget(appRoot), null)
    })
})

describe('sidebar terminal layout refresh', () => {
    it('remeasures initialized terminals without changing their zoom', () => {
        const calls: number[] = []
        const terminals = [
            { zoom: 0, frontend: { setZoom: (zoom: number) => calls.push(zoom) } },
            { zoom: 2, frontend: { setZoom: (zoom: number) => calls.push(zoom) } },
            { zoom: -1 },
        ]

        refreshSidebarTerminalLayouts(terminals)

        assert.deepEqual(calls, [0, 2])
        assert.deepEqual(terminals.map(terminal => terminal.zoom), [0, 2, -1])
    })

    it('continues refreshing other terminals after a frontend error', () => {
        const calls: number[] = []
        const errors: unknown[] = []
        const failure = new Error('resize failed')

        refreshSidebarTerminalLayouts([
            { zoom: 0, frontend: { setZoom: () => { throw failure } } },
            { zoom: 3, frontend: { setZoom: (zoom: number) => calls.push(zoom) } },
        ], error => errors.push(error))

        assert.deepEqual(calls, [3])
        assert.deepEqual(errors, [failure])
    })
})

describe('sidebar layout refresh scheduling', () => {
    it('notifies once after two layout frames', () => {
        const frames: Array<() => void> = []
        let notifications = 0

        scheduleSidebarLayoutRefresh(
            () => { notifications++ },
            {
                requestFrame: callback => {
                    frames.push(callback)
                    return frames.length
                },
                cancelFrame: () => undefined,
            },
        )

        assert.equal(notifications, 0)
        assert.equal(frames.length, 1)

        frames[0]()
        assert.equal(notifications, 0)
        assert.equal(frames.length, 2)

        frames[1]()
        assert.equal(notifications, 1)
    })

    it('cancels a refresh before the first frame', () => {
        const frames: Array<() => void> = []
        const cancelledFrames: unknown[] = []
        let notifications = 0

        const cancel = scheduleSidebarLayoutRefresh(
            () => { notifications++ },
            {
                requestFrame: callback => {
                    frames.push(callback)
                    return frames.length
                },
                cancelFrame: handle => { cancelledFrames.push(handle) },
            },
        )

        cancel()
        frames[0]()

        assert.equal(notifications, 0)
        assert.deepEqual(cancelledFrames, [1])
        assert.equal(frames.length, 1)
    })

    it('cancels a refresh between the two frames', () => {
        const frames: Array<() => void> = []
        const cancelledFrames: unknown[] = []
        let notifications = 0

        const cancel = scheduleSidebarLayoutRefresh(
            () => { notifications++ },
            {
                requestFrame: callback => {
                    frames.push(callback)
                    return frames.length
                },
                cancelFrame: handle => { cancelledFrames.push(handle) },
            },
        )

        frames[0]()
        cancel()
        frames[1]()

        assert.equal(notifications, 0)
        assert.deepEqual(cancelledFrames, [1, 2])
    })

    it('ignores a superseded refresh sequence', () => {
        const frames: Array<() => void> = []
        let notifications = 0
        const scheduler = {
            requestFrame: (callback: () => void) => {
                frames.push(callback)
                return frames.length
            },
            cancelFrame: () => undefined,
        }

        const cancelFirst = scheduleSidebarLayoutRefresh(
            () => { notifications++ },
            scheduler,
        )
        cancelFirst()
        scheduleSidebarLayoutRefresh(
            () => { notifications++ },
            scheduler,
        )

        frames[0]()
        frames[1]()
        frames[2]()

        assert.equal(notifications, 1)
    })
})

describe('sidebar initialization scheduling', () => {
    it('waits for the next task and retries until the layout host exists', () => {
        const tasks: Array<() => void> = []
        const frames: Array<() => void> = []
        let attempts = 0

        scheduleSidebarInitialization(
            () => ++attempts === 3,
            {
                scheduleTask: callback => {
                    tasks.push(callback)
                    return tasks.length
                },
                cancelTask: () => undefined,
                requestFrame: callback => {
                    frames.push(callback)
                    return frames.length
                },
                cancelFrame: () => undefined,
            },
        )

        assert.equal(attempts, 0)
        tasks[0]()
        assert.equal(attempts, 1)
        frames[0]()
        assert.equal(attempts, 2)
        frames[1]()
        assert.equal(attempts, 3)
        assert.equal(frames.length, 2)
    })

    it('stops a pending initialization before it can run', () => {
        const tasks: Array<() => void> = []
        const cancelledTasks: unknown[] = []
        let attempts = 0

        const cancel = scheduleSidebarInitialization(
            () => {
                attempts++
                return true
            },
            {
                scheduleTask: callback => {
                    tasks.push(callback)
                    return 17
                },
                cancelTask: handle => { cancelledTasks.push(handle) },
                requestFrame: () => 0,
                cancelFrame: () => undefined,
            },
        )

        cancel()
        tasks[0]()

        assert.equal(attempts, 0)
        assert.deepEqual(cancelledTasks, [17])
    })
})

describe('sidebar terminal session synchronization', () => {
    it('reads the current terminal size when the delayed synchronization runs', () => {
        const callbacks: Array<() => void> = []
        const calls: Array<[number, number]> = []
        const terminal = {
            size: { columns: 160, rows: 40 },
            session: {
                open: true,
                resize: (columns: number, rows: number) => calls.push([columns, rows]),
            },
        }
        const snapshots = captureSidebarTerminalSessionSizes([terminal])

        scheduleSidebarTerminalSessionSync(
            () => syncSidebarTerminalSessionSizes(snapshots),
            {
                scheduleTask: (callback, delay) => {
                    assert.equal(delay, 1250)
                    callbacks.push(callback)
                    return 1
                },
                cancelTask: () => undefined,
            },
            1250,
        )

        terminal.size = { columns: 120, rows: 40 }
        callbacks[0]()

        assert.deepEqual(calls, [[120, 40]])
    })

    it('only synchronizes terminals that changed and have an open session', () => {
        const calls: string[] = []
        const active = {
            size: { columns: 160, rows: 40 },
            session: { open: true, resize: () => { calls.push('active') } },
        }
        const inactive = {
            size: { columns: 160, rows: 40 },
            session: { open: true, resize: () => { calls.push('inactive') } },
        }
        const replaced = {
            size: { columns: 160, rows: 40 },
            session: { open: true, resize: () => { calls.push('old-session') } },
        }
        const snapshots = captureSidebarTerminalSessionSizes([active, inactive, replaced])

        active.size = { columns: 120, rows: 40 }
        replaced.size = { columns: 120, rows: 40 }
        replaced.session = { open: true, resize: () => { calls.push('new-session') } }
        syncSidebarTerminalSessionSizes(snapshots)

        assert.deepEqual(calls, ['active', 'new-session'])
    })

    it('synchronizes a session that opened after the layout snapshot', () => {
        const calls: Array<[number, number]> = []
        const terminal: {
            size: { columns: number, rows: number }
            session: null | {
                open: boolean
                resize: (columns: number, rows: number) => void
            }
        } = {
            size: { columns: 160, rows: 40 },
            session: null,
        }
        const snapshots = captureSidebarTerminalSessionSizes([terminal])

        terminal.size = { columns: 120, rows: 40 }
        terminal.session = {
            open: true,
            resize: (columns: number, rows: number) => calls.push([columns, rows]),
        }
        syncSidebarTerminalSessionSizes(snapshots)

        assert.deepEqual(calls, [[120, 40]])
    })

    it('skips unusable sessions and continues after a resize error', () => {
        const calls: Array<[number, number]> = []
        const errors: unknown[] = []
        const failure = new Error('resize failed')
        const closed = { size: { columns: 100, rows: 30 }, session: { open: true, resize: () => undefined } }
        const invalid = { size: { columns: 100, rows: 30 }, session: { open: true, resize: () => undefined } }
        const broken = { size: { columns: 100, rows: 30 }, session: { open: true, resize: () => { throw failure } } }
        const valid = {
            size: { columns: 100, rows: 30 },
            session: {
                open: true,
                resize: (columns: number, rows: number) => calls.push([columns, rows]),
            },
        }
        const snapshots = captureSidebarTerminalSessionSizes([closed, invalid, broken, valid])

        closed.session.open = false
        invalid.size = { columns: 0, rows: 30 }
        broken.size = { columns: 90, rows: 30 }
        valid.size = { columns: 90, rows: 25 }
        syncSidebarTerminalSessionSizes(snapshots, error => errors.push(error))

        assert.deepEqual(calls, [[90, 25]])
        assert.deepEqual(errors, [failure])
    })

    it('cancels a stale delayed session synchronization', () => {
        const callbacks: Array<() => void> = []
        const cancelledTasks: unknown[] = []
        let notifications = 0

        const cancel = scheduleSidebarTerminalSessionSync(
            () => { notifications++ },
            {
                scheduleTask: callback => {
                    callbacks.push(callback)
                    return 23
                },
                cancelTask: handle => { cancelledTasks.push(handle) },
            },
            1250,
        )

        cancel()
        callbacks[0]()

        assert.equal(notifications, 0)
        assert.deepEqual(cancelledTasks, [23])
    })
})
