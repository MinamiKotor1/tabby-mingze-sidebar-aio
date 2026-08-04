import assert from 'node:assert/strict'
import test from 'node:test'

import { SshEditModalComponent } from '../src/components/sshEditModal.component'
import { CredentialStorageService } from '../src/services/credentialStorage.service'

test('SSH edit round-trip preserves the complete legacy profile schema', async () => {
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
    let saveCount = 0
    const config: any = {
        store: {
            profiles: [legacyProfile],
            profileDefaults: {
                ssh: {
                    options: {
                        host: null,
                        user: 'root',
                        port: 22,
                    },
                },
            },
        },
        save: async () => {
            saveCount++
        },
    }
    const vault: any = {
        isEnabled: () => true,
        getSecret: async () => null,
        addSecret: async () => undefined,
        removeSecret: async () => undefined,
    }
    const notificationCalls: unknown[] = []
    const notifications: any = {
        error: (...args: unknown[]) => notificationCalls.push(['error', ...args]),
        info: (...args: unknown[]) => notificationCalls.push(['info', ...args]),
    }
    const profilesService: any = {
        getProfiles: async () => config.store.profiles,
    }
    const credentials = new CredentialStorageService(vault, config)
    const component = new SshEditModalComponent(config, credentials, notifications, profilesService)
    component.profileId = legacyProfile.id

    await component.ngOnInit()

    assert.equal(component.options.user, 'root')
    assert.equal(component.options.port, 22)
    assert.equal('user' in legacyProfile.options, false)
    assert.equal('port' in legacyProfile.options, false)

    await component.save()

    assert.equal(saveCount, 1)
    assert.deepEqual(notificationCalls, [])
    assert.deepEqual(config.store.profiles, [before])
})

test('SSH edit round-trip retains explicit legacy credential identity values', async () => {
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
    const config: any = {
        store: {
            profiles: [legacyProfile],
            profileDefaults: { ssh: { options: { user: 'root', port: 22 } } },
        },
        save: async () => undefined,
    }
    const vault: any = {
        isEnabled: () => true,
        getSecret: async () => null,
        addSecret: async () => undefined,
        removeSecret: async () => undefined,
    }
    const notifications: any = { error: () => undefined, info: () => undefined }
    const profilesService: any = { getProfiles: async () => config.store.profiles }
    const credentials = new CredentialStorageService(vault, config)
    const component = new SshEditModalComponent(config, credentials, notifications, profilesService)
    component.profileId = legacyProfile.id

    await component.ngOnInit()
    await component.save()

    assert.deepEqual(config.store.profiles, [before])
})

test('editing an imported SSH profile never overwrites a matching custom profile', async () => {
    const storedProfile: any = {
        id: 'ssh:custom:existing:00000000-0000-4000-8000-000000000011',
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
    const config: any = {
        store: {
            profiles: [storedProfile],
            profileDefaults: { ssh: { options: {} } },
        },
        save: async () => undefined,
    }
    const vault: any = {
        isEnabled: () => true,
        getSecret: async () => null,
        addSecret: async () => undefined,
        removeSecret: async () => undefined,
    }
    const notifications: any = {
        error: () => undefined,
        info: () => undefined,
    }
    const profilesService: any = {
        getProfiles: async () => [storedProfile, importedProfile],
    }
    const credentials = new CredentialStorageService(vault, config)
    const component = new SshEditModalComponent(config, credentials, notifications, profilesService)
    component.profileId = importedProfile.id
    component.initialProfile = importedProfile

    await component.ngOnInit()
    await component.save()

    assert.equal(config.store.profiles.length, 2)
    assert.deepEqual(config.store.profiles[0], storedBefore)
    assert.notEqual(config.store.profiles[1].id, importedProfile.id)
    assert.equal(config.store.profiles[1].isBuiltin, false)
    assert.equal(config.store.profiles[1].isTemplate, false)
    assert.deepEqual(config.store.profiles[1].options, importedProfile.options)
    assert.deepEqual(importedProfile, importedBefore)
})

test('SSH no-op edit preserves a proxy-only legacy profile', async () => {
    const legacyProfile: any = {
        id: 'ssh:custom:proxy-only:00000000-0000-4000-8000-000000000013',
        type: 'ssh',
        name: 'Cloud proxy',
        options: {
            proxyCommand: 'cloud-cli connect --stdio',
            auth: 'publicKey',
            unknownProxySetting: { region: 'local' },
        },
    }
    const before = structuredClone(legacyProfile)
    const config: any = {
        store: {
            profiles: [legacyProfile],
            profileDefaults: {
                ssh: { options: { host: null, user: 'root', port: 22 } },
            },
        },
        save: async () => undefined,
    }
    const vault: any = {
        isEnabled: () => true,
        getSecret: async () => null,
        addSecret: async () => undefined,
        removeSecret: async () => undefined,
    }
    const notifications: any = { error: () => undefined, info: () => undefined }
    const profilesService: any = { getProfiles: async () => config.store.profiles }
    const credentials = new CredentialStorageService(vault, config)
    const component = new SshEditModalComponent(config, credentials, notifications, profilesService)
    component.profileId = legacyProfile.id

    await component.ngOnInit()

    assert.equal(component.hasConnectionTarget(), true)
    await component.save()
    assert.deepEqual(legacyProfile, before)
})
