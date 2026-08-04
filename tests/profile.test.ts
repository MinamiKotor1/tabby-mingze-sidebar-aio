import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    backfillMissingCustomProfileIds,
    createCustomProfileId,
    createProfileDeletionPlan,
    getProfileHotkeyName,
} from '../src/utils/profile'

const CUSTOM_ID_PATTERN = /^ssh:custom:production-db:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

interface TestProfile {
    id?: string
    type: string
    name: string
    options: Record<string, unknown>
    [key: string]: unknown
}

function withRandomUuid<T> (uuid: string, callback: () => T): T {
    const crypto = globalThis.crypto as Crypto & { randomUUID: () => string }
    const ownDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
    Object.defineProperty(crypto, 'randomUUID', {
        configurable: true,
        value: () => uuid,
    })

    try {
        return callback()
    } finally {
        if (ownDescriptor) {
            Object.defineProperty(crypto, 'randomUUID', ownDescriptor)
        } else {
            delete (crypto as any).randomUUID
        }
    }
}

describe('custom profile IDs', () => {
    it('uses the Tabby custom-profile ID shape', () => {
        assert.match(createCustomProfileId('ssh', 'Production DB'), CUSTOM_ID_PATTERN)
    })

    it('backfills a legacy SSH profile without changing any existing field', () => {
        const legacyProfile: TestProfile = {
            type: 'ssh',
            name: 'Production DB',
            group: 'Imported from ~/.ssh/config',
            color: '#123456',
            icon: 'server',
            disableDynamicTitle: true,
            unknownTopLevelSetting: {
                enabled: true,
                labels: ['critical', 'database'],
            },
            options: {
                host: 'db.internal.example',
                port: 2202,
                user: 'deploy',
                auth: 'publicKey',
                privateKeys: ['/keys/deploy'],
                password: 'legacy-plaintext',
                proxyCommand: 'ssh -W %h:%p bastion',
                jumpHost: 'bastion-profile-id',
                forwardedPorts: [{ type: 'local', localPort: 5432, remotePort: 5432 }],
                scripts: [{ event: 'connect', script: 'echo connected' }],
                unknownNestedSetting: { retries: 3 },
            },
        }
        const original = structuredClone(legacyProfile)
        const profiles = [legacyProfile]

        assert.equal(backfillMissingCustomProfileIds(profiles), 1)
        assert.match(legacyProfile.id, CUSTOM_ID_PATTERN)

        const { id, ...preservedFields } = legacyProfile
        assert.ok(id)
        assert.deepEqual(preservedFields, original)

        const afterFirstBackfill = structuredClone(legacyProfile)
        assert.equal(backfillMissingCustomProfileIds(profiles), 0)
        assert.deepEqual(legacyProfile, afterFirstBackfill)
    })

    it('leaves existing IDs and unsupported profile types untouched', () => {
        const profiles = [
            { id: 'ssh:custom:existing:id', type: 'ssh', name: 'Existing', options: { host: 'ssh.example' } },
            { type: 'serial', name: 'Serial', options: { device: 'COM1' } },
            null,
            'invalid',
        ]
        const original = structuredClone(profiles)

        assert.equal(backfillMissingCustomProfileIds(profiles), 0)
        assert.deepEqual(profiles, original)
    })

    it('backfills a malformed legacy name without blocking startup', () => {
        const profile = {
            type: 'ssh',
            name: 42,
            options: { host: 'legacy.example' },
        } as any

        assert.equal(backfillMissingCustomProfileIds([profile]), 1)
        assert.match(profile.id, /^ssh:custom:ssh:/)
        assert.equal(profile.name, 42)
    })

    it('copies a legacy name-keyed hotkey to the new ID and retains the old key', () => {
        const profile: TestProfile = { type: 'ssh', name: 'Prod.DB', options: { host: 'db.example' } }
        const legacyBinding = ['Ctrl-Shift-1']
        const hotkeys: Record<string, unknown> = {
            'Prod-DB': legacyBinding,
            unrelated: ['Ctrl-Shift-2'],
        }
        const expectedId = 'ssh:custom:prod-db:00000000-0000-4000-8000-000000000001'

        withRandomUuid('00000000-0000-4000-8000-000000000001', () => {
            assert.equal(backfillMissingCustomProfileIds([profile], hotkeys), 1)
        })

        assert.equal(profile.id, expectedId)
        assert.deepEqual(hotkeys[expectedId], legacyBinding)
        assert.notEqual(hotkeys[expectedId], legacyBinding)
        assert.equal(hotkeys['Prod-DB'], legacyBinding)
        assert.deepEqual(hotkeys.unrelated, ['Ctrl-Shift-2'])

        const afterFirstBackfill = structuredClone(hotkeys)
        assert.equal(backfillMissingCustomProfileIds([profile], hotkeys), 0)
        assert.deepEqual(hotkeys, afterFirstBackfill)
    })

    it('does not overwrite an existing new-ID hotkey binding', () => {
        const profile: TestProfile = { type: 'ssh', name: 'Prod.DB', options: { host: 'db.example' } }
        const expectedId = 'ssh:custom:prod-db:00000000-0000-4000-8000-000000000002'
        const existingBinding = ['Alt-2']
        const hotkeys: Record<string, unknown> = {
            'Prod-DB': ['Ctrl-Shift-1'],
            [expectedId]: existingBinding,
        }

        withRandomUuid('00000000-0000-4000-8000-000000000002', () => {
            assert.equal(backfillMissingCustomProfileIds([profile], hotkeys), 1)
        })

        assert.equal(profile.id, expectedId)
        assert.equal(hotkeys[expectedId], existingBinding)
        assert.deepEqual(hotkeys['Prod-DB'], ['Ctrl-Shift-1'])
    })
})

describe('profile deletion compatibility', () => {
    it('uses the stable profile hotkey name across Tabby versions', () => {
        assert.equal(getProfileHotkeyName({
            id: 'ssh.custom.production',
            name: 'Ignored.Name',
        }), 'ssh-custom-production')
        assert.equal(getProfileHotkeyName({ name: 'Legacy.Profile' }), 'Legacy-Profile')
    })

    it('removes only the stored target and its active hotkey binding', () => {
        const target: TestProfile = {
            id: 'ssh:custom:target',
            type: 'ssh',
            name: 'Target',
            options: {
                host: 'target.example',
                unknownNestedSetting: { preserve: true },
            },
        }
        const untouched: TestProfile = {
            id: 'ssh:custom:untouched',
            type: 'ssh',
            name: 'Untouched',
            options: { host: 'untouched.example' },
        }
        const profiles = [target, untouched]
        const hotkeys = {
            [target.id!]: ['Ctrl-Shift-1'],
            [untouched.id!]: ['Ctrl-Shift-2'],
            unknownBinding: ['Alt-9'],
        }
        const originalTarget = structuredClone(target)
        const originalHotkeys = structuredClone(hotkeys)

        const plan = createProfileDeletionPlan(profiles, { ...target }, hotkeys)

        assert.ok(plan)
        assert.equal(plan.profileIndex, 0)
        assert.equal(plan.storedProfile, target)
        assert.deepEqual(plan.profiles, [untouched])
        assert.equal(plan.profiles[0], untouched)
        assert.equal(Object.prototype.hasOwnProperty.call(plan.profileHotkeys, target.id!), false)
        assert.deepEqual(plan.profileHotkeys?.[untouched.id!], ['Ctrl-Shift-2'])
        assert.deepEqual(plan.profileHotkeys?.unknownBinding, ['Alt-9'])
        assert.deepEqual(profiles, [target, untouched])
        assert.deepEqual(target, originalTarget)
        assert.deepEqual(hotkeys, originalHotkeys)
    })

    it('does not plan side effects for a stale context-menu target', () => {
        const stored: TestProfile = {
            id: 'ssh:custom:stored',
            type: 'ssh',
            name: 'Stored',
            options: { host: 'stored.example' },
        }
        const profiles = [stored]
        const hotkeys = { [stored.id!]: ['Ctrl-Shift-1'] }
        const originalProfiles = structuredClone(profiles)
        const originalHotkeys = structuredClone(hotkeys)

        assert.equal(createProfileDeletionPlan(profiles, {
            id: 'ssh:custom:missing',
            type: 'ssh',
            name: 'Missing',
        }, hotkeys), null)
        assert.deepEqual(profiles, originalProfiles)
        assert.deepEqual(hotkeys, originalHotkeys)
    })

    it('still removes the profile when it has no hotkey binding', () => {
        const target: TestProfile = {
            id: 'ssh:custom:no-hotkey',
            type: 'ssh',
            name: 'No hotkey',
            options: { host: 'no-hotkey.example' },
        }
        const hotkeys = { unrelated: ['Alt-1'] }

        const plan = createProfileDeletionPlan([target], target, hotkeys)

        assert.ok(plan)
        assert.deepEqual(plan.profiles, [])
        assert.equal(plan.hotkeysChanged, false)
        assert.equal(plan.profileHotkeys, hotkeys)
    })
})
