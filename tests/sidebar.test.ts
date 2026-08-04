import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CONFIG_KEY } from '../src/models/interfaces'
import {
    findSidebarLayoutHost,
    getSidebarConfig,
    normalizeSidebarProtocolFilter,
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
    it('finds the direct content host used by older Tabby versions', () => {
        const content = createElement(['content'])
        const appRoot = createElement([], [createElement(['title-bar']), content])

        assert.equal(findSidebarLayoutHost(appRoot), content)
    })

    it('finds the nested main content host used by Tabby 1.0.235', () => {
        const content = createElement(['content', 'main'])
        const window = createElement(['window'], [createElement(['profile-tree']), content])
        const appRoot = createElement([], [createElement(['title-bar']), window])

        assert.equal(findSidebarLayoutHost(appRoot), content)
    })

    it('returns null when no supported layout host exists', () => {
        const appRoot = createElement([], [createElement(['window'], [createElement(['other'])])])

        assert.equal(findSidebarLayoutHost(appRoot), null)
    })
})
