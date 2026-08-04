import assert from 'node:assert/strict'
import test from 'node:test'

import type { SSHProfileOptions } from '../src/models/interfaces'
import {
    buildSshProfileData,
    createSshProfileEditState,
    hasSshConnectionTarget,
    normalizeSshProfileOptions,
    resolveSshEditingIndex,
} from '../src/utils/sshProfile'

function createBaseOptions (): SSHProfileOptions {
    return {
        host: '',
        port: 22,
        user: 'root',
        password: '',
        auth: null,
        privateKeys: [],
    }
}

function roundTripProfile (
    profile: any,
    defaults: Partial<SSHProfileOptions> = {},
): ReturnType<typeof buildSshProfileData> & {
    state: ReturnType<typeof createSshProfileEditState>,
} {
    const state = createSshProfileEditState(profile, defaults, createBaseOptions())
    const built = buildSshProfileData({
        sourceProfile: state.sourceProfile,
        sourceOptions: state.sourceOptions,
        initialIdentityOptions: state.initialIdentityOptions,
        initialGroup: state.initialGroup,
        name: state.name,
        group: state.group,
        currentOptions: state.options,
        normalizedOptions: normalizeSshProfileOptions(state.options),
        existing: profile,
    })
    return { state, ...built }
}

test('SSH edit round-trip preserves the complete legacy profile schema', () => {
    const legacyProfile: any = {
        id: 'ssh:custom:legacy-profile:00000000-0000-4000-8000-000000000010',
        type: 'ssh',
        name: 'Legacy profile',
        group: 'Imported from ~/.ssh/config',
        color: '#123456',
        icon: 'server',
        disableDynamicTitle: true,
        isBuiltin: false,
        isTemplate: false,
        unknownTopLevelSetting: {
            labels: ['critical', 'legacy'],
            enabled: true,
        },
        options: {
            host: 'legacy.internal.example',
            auth: 'publicKey',
            privateKeys: ['/keys/legacy'],
            proxyCommand: 'ssh -W %h:%p bastion',
            jumpHost: 'bastion-profile-id',
            forwardedPorts: [{ type: 'local', localPort: 5432, remotePort: 5432 }],
            algorithms: {
                kex: ['curve25519-sha256'],
                cipher: ['aes256-gcm@openssh.com'],
            },
            scripts: [{ event: 'connect', script: 'echo connected' }],
            unknownNestedSetting: {
                retries: 3,
                preserveExactly: true,
            },
        },
    }
    const before = structuredClone(legacyProfile)
    const { state, profileData } = roundTripProfile(legacyProfile, {
        host: null,
        user: 'root',
        port: 22,
    })

    assert.equal(state.options.user, 'root')
    assert.equal(state.options.port, 22)
    assert.equal('user' in legacyProfile.options, false)
    assert.equal('port' in legacyProfile.options, false)
    assert.deepEqual(profileData, before)
    assert.deepEqual(legacyProfile, before)
})

test('SSH edit round-trip retains explicit legacy credential identity values', () => {
    const legacyProfile: any = {
        id: 'ssh:custom:explicit-values:00000000-0000-4000-8000-000000000011',
        type: 'ssh',
        name: 'Explicit values',
        options: {
            host: 'legacy.internal.example',
            user: '',
            port: 0,
            unknownNestedSetting: true,
        },
    }
    const before = structuredClone(legacyProfile)
    const { profileData } = roundTripProfile(legacyProfile, { user: 'root', port: 22 })

    assert.deepEqual(profileData, before)
    assert.deepEqual(legacyProfile, before)
})

test('SSH edit round-trip preserves field presence and scalar representations', () => {
    const profiles: any[] = [
        {
            id: 'ssh:custom:null-values:00000000-0000-4000-8000-000000000012',
            type: 'ssh',
            name: 'Null values',
            group: null,
            options: { host: null, user: '', port: 0 },
        },
        {
            id: 'ssh:custom:undefined-values:00000000-0000-4000-8000-000000000013',
            type: 'ssh',
            name: 'Undefined values',
            group: '',
            options: { host: undefined, user: undefined, port: '22' },
        },
        {
            id: 'ssh:custom:sparse-values:00000000-0000-4000-8000-000000000014',
            type: 'ssh',
            name: 'Sparse values',
            options: { proxyCommand: 'cloud-cli connect --stdio' },
        },
    ]

    for (const profile of profiles) {
        const before = structuredClone(profile)
        const { profileData } = roundTripProfile(profile, {
            host: 'default.example',
            user: 'root',
            port: 22,
        })
        assert.deepEqual(profileData, before)
        assert.deepEqual(profile, before)
    }
})

test('editing one SSH identity field preserves other legacy values', () => {
    const legacyProfile: any = {
        id: 'ssh:custom:edited-host:00000000-0000-4000-8000-000000000015',
        type: 'ssh',
        name: 'Edited host',
        options: {
            host: 'old.example',
            user: '',
            port: '2222',
            password: 'legacy-secret',
            unknownNestedSetting: { retain: true },
        },
    }
    const before = structuredClone(legacyProfile)
    const state = createSshProfileEditState(legacyProfile, {}, createBaseOptions())
    state.options.host = 'new.example'
    const { profileData, password, hadPlaintextPassword } = buildSshProfileData({
        sourceProfile: state.sourceProfile,
        sourceOptions: state.sourceOptions,
        initialIdentityOptions: state.initialIdentityOptions,
        initialGroup: state.initialGroup,
        name: state.name,
        group: state.group,
        currentOptions: state.options,
        normalizedOptions: normalizeSshProfileOptions(state.options),
        existing: legacyProfile,
    })
    const savedOptions = profileData.options as any

    assert.equal(savedOptions.host, 'new.example')
    assert.equal(savedOptions.user, '')
    assert.equal(savedOptions.port, '2222')
    assert.deepEqual(savedOptions.unknownNestedSetting, { retain: true })
    assert.equal(Object.prototype.hasOwnProperty.call(savedOptions, 'password'), false)
    assert.equal(password, 'legacy-secret')
    assert.equal(hadPlaintextPassword, true)
    assert.deepEqual(legacyProfile, before)
})

test('editing an imported SSH profile never overwrites a matching custom profile', () => {
    const storedProfile: any = {
        id: 'ssh:custom:existing:00000000-0000-4000-8000-000000000016',
        type: 'ssh',
        name: 'Imported host',
        group: 'Imported from ~/.ssh/config',
        options: {
            host: 'imported.example',
            port: 22,
            user: 'operator',
            proxyCommand: 'ssh -W %h:%p gateway',
        },
        customOnly: true,
    }
    const importedProfile: any = {
        id: 'ssh:config:imported-host',
        type: 'ssh',
        name: storedProfile.name,
        group: storedProfile.group,
        options: structuredClone(storedProfile.options),
        isBuiltin: true,
        importerMetadata: { source: '~/.ssh/config' },
    }
    const storedBefore = structuredClone(storedProfile)
    const importedBefore = structuredClone(importedProfile)
    const state = createSshProfileEditState(importedProfile, {}, createBaseOptions())
    const editingIndex = resolveSshEditingIndex({
        profiles: [storedProfile],
        profileId: importedProfile.id,
        editingIndex: -1,
        initialProfile: importedProfile,
    })
    const { profileData } = buildSshProfileData({
        sourceProfile: state.sourceProfile,
        sourceOptions: state.sourceOptions,
        initialIdentityOptions: state.initialIdentityOptions,
        initialGroup: state.initialGroup,
        name: state.name,
        group: state.group,
        currentOptions: state.options,
        normalizedOptions: normalizeSshProfileOptions(state.options),
        existing: null,
    })

    assert.equal(editingIndex, -1)
    assert.match(profileData.id, /^ssh:custom:imported-host:/)
    assert.notEqual(profileData.id, importedProfile.id)
    assert.equal(profileData.isBuiltin, false)
    assert.equal(profileData.isTemplate, false)
    assert.deepEqual(profileData.options, importedProfile.options)
    assert.deepEqual((profileData as any).importerMetadata, importedProfile.importerMetadata)
    assert.deepEqual(storedProfile, storedBefore)
    assert.deepEqual(importedProfile, importedBefore)
})

test('SSH no-op edit preserves a proxy-only legacy profile', () => {
    const legacyProfile: any = {
        id: 'ssh:custom:proxy-only:00000000-0000-4000-8000-000000000017',
        type: 'ssh',
        name: 'Cloud proxy',
        options: {
            proxyCommand: 'cloud-cli connect --stdio',
            auth: 'publicKey',
            unknownProxySetting: { region: 'local' },
        },
    }
    const before = structuredClone(legacyProfile)
    const defaults = { host: null, user: 'root', port: 22 }
    const { state, profileData } = roundTripProfile(legacyProfile, defaults)

    assert.equal(hasSshConnectionTarget(state.options, state.sourceOptions, defaults), true)
    assert.deepEqual(profileData, before)
    assert.deepEqual(legacyProfile, before)
})
