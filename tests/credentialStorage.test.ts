import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    buildRdpKeytarTarget,
    buildRdpVaultKey,
    buildSshKeytarTarget,
    buildSshVaultKey,
    CredentialStorageService,
    hasSameRdpCredentialTarget,
    hasSameSshCredentialTarget,
    resolveSshCredentialOptions,
    VAULT_SECRET_TYPE_RDP_PASSWORD,
    VAULT_SECRET_TYPE_SSH_PASSWORD,
} from '../src/services/credentialStorage.service'

interface RecordedSecret {
    type: string
    key: Record<string, unknown>
    value: string
}

function createVault (addSecret: (secret: RecordedSecret) => Promise<void>): any {
    return {
        isEnabled: () => true,
        addSecret,
        getSecret: async () => null,
        removeSecret: async () => undefined,
    }
}

describe('credential identity helpers', () => {
    it('matches Tabby SSH credential keys after provider defaults are applied', () => {
        const profile = {
            options: {
                host: 'ssh.example',
                port: 2222,
                user: 'alice',
            },
        }

        assert.deepEqual(buildSshVaultKey(profile), {
            user: 'alice',
            host: 'ssh.example',
            port: 2222,
        })
        assert.deepEqual(buildSshKeytarTarget(profile), {
            service: 'ssh@ssh.example:2222',
            account: 'alice',
        })
    })

    it('uses SSH provider defaults for sparse legacy profiles without mutating them', () => {
        const profile = { options: { host: 'legacy.example' } } as any
        const original = structuredClone(profile)

        assert.deepEqual(buildSshVaultKey(profile), {
            user: 'root',
            host: 'legacy.example',
            port: 22,
        })
        assert.deepEqual(buildSshKeytarTarget(profile), {
            service: 'ssh@legacy.example:22',
            account: 'root',
        })
        assert.deepEqual(profile, original)
    })

    it('preserves Tabby\'s null default host without mutating sparse options', () => {
        const options = {}

        assert.deepEqual(resolveSshCredentialOptions(options), {
            host: null,
            user: 'root',
            port: 22,
        })
        assert.deepEqual(options, {})
    })

    it('builds stable RDP Vault and system credential targets', () => {
        assert.deepEqual(buildRdpVaultKey({ host: 'rdp.example', port: 3390, username: 'bob' }), {
            host: 'rdp.example',
            port: 3390,
            user: 'bob',
        })
        assert.deepEqual(buildRdpKeytarTarget({ host: 'rdp.example', port: 3390, username: 'bob' }), {
            service: 'rdp@rdp.example:3390',
            account: 'bob',
        })
        assert.deepEqual(buildRdpKeytarTarget({ host: 'legacy-rdp.example' }), {
            service: 'rdp@legacy-rdp.example:3389',
            account: '<default>',
        })
    })

    it('compares SSH targets according to the active storage backend', () => {
        const numericPort = { options: { host: 'ssh.example', port: 22, user: 'root' } } as any
        const stringPort = { options: { host: 'ssh.example', port: '22', user: 'root' } } as any

        assert.equal(hasSameSshCredentialTarget(numericPort, stringPort, 'vault'), false)
        assert.equal(hasSameSshCredentialTarget(numericPort, stringPort, 'keytar'), true)

        for (const changed of [
            { options: { host: ' ssh.example', port: 22, user: 'root' } },
            { options: { host: 'ssh.example', port: 22, user: 'root ' } },
            { options: { host: 'ssh.example', port: 22, user: '' } },
        ]) {
            assert.equal(hasSameSshCredentialTarget(numericPort, changed as any, 'vault'), false)
            assert.equal(hasSameSshCredentialTarget(numericPort, changed as any, 'keytar'), false)
        }
    })

    it('compares RDP targets after applying launch-time normalization', () => {
        const numericPort = { host: 'rdp.example', port: 3389, username: 'bob' }
        const stringPort = { host: 'rdp.example', port: '3389', username: 'bob' } as any

        assert.equal(hasSameRdpCredentialTarget(numericPort, stringPort, 'vault'), true)
        assert.equal(hasSameRdpCredentialTarget(numericPort, stringPort, 'keytar'), true)

        for (const equivalent of [
            { host: ' rdp.example', port: 3389, username: 'bob' },
            { host: 'rdp.example', port: 3389, username: 'bob ' },
        ]) {
            assert.equal(hasSameRdpCredentialTarget(numericPort, equivalent, 'vault'), true)
            assert.equal(hasSameRdpCredentialTarget(numericPort, equivalent, 'keytar'), true)
        }

        const changedUser = { host: 'rdp.example', port: 3389, username: '' }
        assert.equal(hasSameRdpCredentialTarget(numericPort, changedUser, 'vault'), false)
        assert.equal(hasSameRdpCredentialTarget(numericPort, changedUser, 'keytar'), false)
    })
})

describe('plaintext credential migration', () => {
    it('removes plaintext only after secure writes succeed', async () => {
        const recorded: RecordedSecret[] = []
        const service = new CredentialStorageService(createVault(async secret => {
            recorded.push(secret)
        }))
        const profiles: any[] = [
            {
                type: 'ssh',
                name: 'Legacy SSH',
                group: 'Production',
                options: {
                    host: 'ssh.example',
                    password: 'ssh-secret',
                    proxyCommand: 'ssh -W %h:%p bastion',
                },
                unknownTopLevelSetting: true,
            },
            {
                type: 'rdp',
                name: 'Legacy RDP',
                options: {
                    host: 'rdp.example',
                    username: 'bob',
                    password: 'rdp-secret',
                    width: 1600,
                },
            },
            {
                type: 'telnet',
                options: { host: 'telnet.example', password: 'leave-this-alone' },
            },
        ]

        assert.equal(await service.migratePlaintextPasswords(profiles), true)
        assert.equal('password' in profiles[0].options, false)
        assert.equal('password' in profiles[1].options, false)
        assert.equal(profiles[2].options.password, 'leave-this-alone')
        assert.equal(profiles[0].options.proxyCommand, 'ssh -W %h:%p bastion')
        assert.equal(profiles[0].unknownTopLevelSetting, true)
        assert.deepEqual(recorded, [
            {
                type: VAULT_SECRET_TYPE_SSH_PASSWORD,
                key: { user: 'root', host: 'ssh.example', port: 22 },
                value: 'ssh-secret',
            },
            {
                type: VAULT_SECRET_TYPE_RDP_PASSWORD,
                key: { host: 'rdp.example', port: 3389, user: 'bob' },
                value: 'rdp-secret',
            },
        ])
    })

    it('retains plaintext when the secure write fails and continues other profiles', async () => {
        const service = new CredentialStorageService(createVault(async secret => {
            if (secret.key.host === 'fail.example') {
                throw new Error('Vault locked')
            }
        }))
        const profiles: any[] = [
            {
                type: 'ssh',
                name: 'Must survive',
                options: { host: 'fail.example', password: 'keep-me', extra: 'unchanged' },
            },
            {
                type: 'rdp',
                name: 'Can migrate',
                options: { host: 'ok.example', password: 'remove-me' },
            },
        ]
        const originalFailedProfile = structuredClone(profiles[0])
        const originalConsoleError = console.error
        console.error = () => undefined

        try {
            assert.equal(await service.migratePlaintextPasswords(profiles), true)
        } finally {
            console.error = originalConsoleError
        }

        assert.deepEqual(profiles[0], originalFailedProfile)
        assert.equal('password' in profiles[1].options, false)
    })

    it('reports no config change when every secure write fails', async () => {
        const service = new CredentialStorageService(createVault(async () => {
            throw new Error('Vault locked')
        }))
        const profiles: any[] = [
            { type: 'ssh', options: { host: 'ssh.example', password: 'keep-ssh' } },
            { type: 'rdp', options: { host: 'rdp.example', password: 'keep-rdp' } },
        ]
        const original = structuredClone(profiles)
        const originalConsoleError = console.error
        console.error = () => undefined

        try {
            assert.equal(await service.migratePlaintextPasswords(profiles), false)
        } finally {
            console.error = originalConsoleError
        }

        assert.deepEqual(profiles, original)
    })

    it('uses configured SSH profile defaults when migrating a sparse profile', async () => {
        const recorded: RecordedSecret[] = []
        const config = {
            store: {
                profileDefaults: {
                    ssh: {
                        options: {
                            user: 'operator',
                            port: 2022,
                        },
                    },
                },
            },
        }
        const service = new CredentialStorageService(createVault(async secret => {
            recorded.push(secret)
        }), config as any)
        const profiles: any[] = [
            { type: 'ssh', options: { host: 'custom-defaults.example', password: 'migrate-me' } },
        ]

        assert.equal(await service.migratePlaintextPasswords(profiles), true)
        assert.equal('password' in profiles[0].options, false)
        assert.deepEqual(recorded, [{
            type: VAULT_SECRET_TYPE_SSH_PASSWORD,
            key: { user: 'operator', host: 'custom-defaults.example', port: 2022 },
            value: 'migrate-me',
        }])
    })

    it('uses normalized RDP profile defaults without materializing them', async () => {
        const recorded: RecordedSecret[] = []
        const config = {
            store: {
                profileDefaults: {
                    rdp: {
                        options: {
                            host: ' desktop.example ',
                            port: '3390',
                            username: ' operator ',
                        },
                    },
                },
            },
        }
        const service = new CredentialStorageService(createVault(async secret => {
            recorded.push(secret)
        }), config as any)
        const profiles: any[] = [
            { type: 'rdp', options: { password: 'migrate-rdp' } },
        ]

        assert.equal(await service.migratePlaintextPasswords(profiles), true)
        assert.deepEqual(profiles[0].options, {})
        assert.deepEqual(recorded, [{
            type: VAULT_SECRET_TYPE_RDP_PASSWORD,
            key: { host: 'desktop.example', port: 3390, user: 'operator' },
            value: 'migrate-rdp',
        }])
    })

    it('migrates a proxy-command profile without materializing default SSH fields', async () => {
        const recorded: RecordedSecret[] = []
        const service = new CredentialStorageService(createVault(async secret => {
            recorded.push(secret)
        }))
        const profile: any = {
            type: 'ssh',
            name: 'Proxy-only SSH',
            options: {
                proxyCommand: 'cloud-cli connect --stdio',
                password: 'migrate-me',
            },
        }

        assert.equal(await service.migratePlaintextPasswords([profile]), true)
        assert.deepEqual(profile, {
            type: 'ssh',
            name: 'Proxy-only SSH',
            options: {
                proxyCommand: 'cloud-cli connect --stdio',
            },
        })
        assert.deepEqual(recorded, [{
            type: VAULT_SECRET_TYPE_SSH_PASSWORD,
            key: { user: 'root', host: null, port: 22 },
            value: 'migrate-me',
        }])
    })
})
