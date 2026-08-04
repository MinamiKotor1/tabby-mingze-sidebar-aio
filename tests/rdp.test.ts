import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatRdpAddress, parseRdpQuickConnect } from '../src/utils/rdp'

describe('RDP quick-connect parsing', () => {
    it('parses IPv4 and host names with optional ports', () => {
        assert.deepEqual(parseRdpQuickConnect('192.0.2.10'), {
            host: '192.0.2.10',
            port: 3389,
            username: undefined,
        })
        assert.deepEqual(parseRdpQuickConnect('desktop.example:3390'), {
            host: 'desktop.example',
            port: 3390,
            username: undefined,
        })
    })

    it('parses bracketed IPv6 with a port and preserves bare IPv6', () => {
        assert.deepEqual(parseRdpQuickConnect('[2001:db8::7]:3391'), {
            host: '2001:db8::7',
            port: 3391,
            username: undefined,
        })
        assert.deepEqual(parseRdpQuickConnect('2001:db8::7'), {
            host: '2001:db8::7',
            port: 3389,
            username: undefined,
        })
        assert.equal(formatRdpAddress('2001:db8::7', 3391), '[2001:db8::7]:3391')
    })

    it('extracts and decodes a username', () => {
        assert.deepEqual(parseRdpQuickConnect('rdp://DOMAIN%5Cuser@[2001:db8::8]:3392'), {
            host: '2001:db8::8',
            port: 3392,
            username: 'DOMAIN\\user',
        })
        assert.deepEqual(parseRdpQuickConnect('alice@desktop.example'), {
            host: 'desktop.example',
            port: 3389,
            username: 'alice',
        })
    })

    it('falls back to 3389 for malformed or out-of-range ports', () => {
        for (const query of [
            'desktop.example:',
            'desktop.example:abc',
            'desktop.example:-1',
            'desktop.example:0',
            'desktop.example:65536',
            '[2001:db8::7]:invalid',
            '[2001:db8::7]:65536',
        ]) {
            assert.equal(parseRdpQuickConnect(query).port, 3389, query)
        }

        assert.equal(parseRdpQuickConnect('desktop.example:1').port, 1)
        assert.equal(parseRdpQuickConnect('desktop.example:65535').port, 65535)
    })
})
