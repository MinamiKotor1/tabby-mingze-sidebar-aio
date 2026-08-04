import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, NotificationsService, PartialProfile, ProfilesService } from 'tabby-core'
import { SSHProfile, SSHProfileOptions } from '../models/interfaces'
import {
    CredentialStorageService,
    resolveSshCredentialOptions,
} from '../services/credentialStorage.service'
import { createCustomProfileId } from '../utils/profile'

@Component({
    selector: 'ssh-edit-modal',
    template: `
        <div class="ssh-modal-backdrop" (click)="cancel()">
            <div class="ssh-modal" (click)="$event.stopPropagation()">
                <div class="ssh-modal-header">
                    <span>{{ editMode ? 'Edit' : 'New' }} SSH Connection</span>
                    <button class="btn-modal-close" (click)="cancel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="ssh-modal-body">
                    <div class="form-group">
                        <label>Name</label>
                        <input class="form-control form-control-sm" [(ngModel)]="name" placeholder="Connection name">
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-grow">
                            <label>Host</label>
                            <input class="form-control form-control-sm" [(ngModel)]="options.host" placeholder="hostname or IP">
                        </div>
                        <div class="form-group" style="width:80px">
                            <label>Port</label>
                            <input class="form-control form-control-sm" type="number" min="1" max="65535" [(ngModel)]="options.port">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-grow">
                            <label>Username</label>
                            <input class="form-control form-control-sm" [(ngModel)]="options.user" placeholder="root">
                        </div>
                        <div class="form-group flex-grow">
                            <label>Password</label>
                            <input class="form-control form-control-sm" type="password" [(ngModel)]="options.password" placeholder="optional">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Group</label>
                        <input class="form-control form-control-sm" [(ngModel)]="group" placeholder="optional">
                    </div>
                    <small class="form-hint">Password is stored securely in Tabby Vault or the system credential store.</small>
                    <small class="form-error" *ngIf="errorMessage">{{ errorMessage }}</small>
                </div>
                <div class="ssh-modal-footer">
                    <button class="btn btn-sm btn-secondary" (click)="cancel()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="!hasConnectionTarget() || saving">
                        {{ saving ? 'Saving...' : 'Save' }}
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .ssh-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(var(--bs-dark-rgb), 0.55);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .ssh-modal {
            background: var(--theme-bg-more);
            border: 1px solid var(--theme-bg-more-2);
            border-radius: 12px;
            width: 400px;
            box-shadow: 0 16px 48px rgba(var(--bs-dark-rgb), 0.4);
        }
        .ssh-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            border-bottom: 1px solid var(--theme-bg-more-2);
            font-weight: 600;
            font-size: 14px;
            color: var(--theme-fg);
        }
        .btn-modal-close {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0;
            background: none;
            border: none;
            border-radius: 4px;
            color: var(--theme-fg-more);
            cursor: pointer;
            transition: all 0.15s;
        }
        .btn-modal-close:hover {
            background: var(--theme-bg-more-2);
            color: var(--theme-fg);
        }
        .ssh-modal-body {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .form-group label {
            font-size: 11px;
            font-weight: 600;
            color: var(--theme-fg-more);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .form-row {
            display: flex;
            gap: 8px;
        }
        .form-hint {
            font-size: 11px;
            color: var(--theme-fg-more);
        }
        .form-error {
            font-size: 11px;
            color: var(--bs-danger);
        }
        .flex-grow {
            flex: 1;
        }
        .ssh-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--theme-bg-more-2);
        }
    `],
})
export class SshEditModalComponent implements OnInit {
    @Input() profileId: string | null = null
    @Input() initialProfile: PartialProfile<SSHProfile> | null = null
    @Output() saved = new EventEmitter<void>()
    @Output() cancelled = new EventEmitter<void>()

    name = ''
    group = ''
    editMode = false
    saving = false
    errorMessage = ''
    private editingIndex: number | null = null
    private sourceOptions: Record<string, any> = {}
    private sourceProfile: PartialProfile<SSHProfile> | null = null
    private initialIdentityOptions: Record<'host' | 'port' | 'user', unknown> = {
        host: undefined,
        port: undefined,
        user: undefined,
    }
    private initialGroup = ''
    private initialPassword = ''
    private passwordLoadFailed = false

    options: SSHProfileOptions = {
        host: '',
        port: 22,
        user: 'root',
        password: '',
        auth: null,
        privateKeys: [],
    }

    constructor (
        private config: ConfigService,
        private credentials: CredentialStorageService,
        private notifications: NotificationsService,
        private profilesService: ProfilesService,
    ) {}

    async ngOnInit (): Promise<void> {
        const profiles = this.config.store.profiles || []

        if (this.profileId) {
            const idx = profiles.findIndex(p => p.id === this.profileId)
            if (idx >= 0) {
                this.loadFromProfile(profiles[idx])
                this.editMode = true
                this.editingIndex = idx
                await this.loadStoredPassword()
                return
            }
        }

        if (this.initialProfile?.type === 'ssh') {
            this.loadFromProfile(this.initialProfile)
            this.editMode = true
            this.editingIndex = this.initialProfile.isBuiltin
                ? -1
                : this.findProfileIndexBySnapshot(profiles, this.initialProfile)
            await this.loadStoredPassword()
        }
    }

    async save (): Promise<void> {
        if (this.saving) return
        const normalized = this.normalizeOptions(this.options)
        if (!normalized.host && !this.hasProxyCommandTarget()) return

        this.saving = true
        this.errorMessage = ''

        try {
            await this.saveProfile(normalized)
            this.saved.emit()
        } catch (error) {
            this.errorMessage = this.getErrorMessage(error)
            this.notifications.error('Could not save SSH connection', this.errorMessage)
        } finally {
            this.saving = false
        }
    }

    private async saveProfile (normalized: SSHProfileOptions): Promise<void> {
        const profiles = this.config.store.profiles = this.config.store.profiles || []
        const idx = this.editMode ? this.resolveEditingIndex(profiles) : -1
        const existing = idx >= 0 ? profiles[idx] : null
        const oldProfile = this.cloneProfile(existing || this.sourceProfile)

        const options: Record<string, any> = {
            ...this.sourceOptions,
            host: normalized.host,
            port: normalized.port,
            user: normalized.user,
        }

        this.restoreUnchangedIdentityOption(options, 'host', this.options.host)
        this.restoreUnchangedIdentityOption(options, 'user', this.options.user)
        this.restoreUnchangedIdentityOption(options, 'port', this.options.port)

        const password = this.cleanPassword(normalized.password) || ''
        const hadPlaintextPassword = !!this.cleanPassword(this.sourceOptions.password)

        delete options.password

        const profileData = {
            ...(this.sourceProfile || {}),
            id: existing?.id || createCustomProfileId('ssh', this.name || normalized.host),
            type: 'ssh',
            name: this.name || `${normalized.user || 'root'}@${normalized.host}:${normalized.port}`,
            group: this.group || undefined,
            options,
        } as SSHProfile

        if (this.sourceProfile && Object.is(this.group, this.initialGroup)) {
            if (Object.prototype.hasOwnProperty.call(this.sourceProfile, 'group')) {
                profileData.group = this.sourceProfile.group
            } else {
                delete profileData.group
            }
        } else if (!profileData.group) {
            delete profileData.group
        }

        if (!existing) {
            profileData.isBuiltin = false
            profileData.isTemplate = false
        }

        const identityChanged = !!oldProfile && !this.credentials.hasSameSshCredentialIdentity(
            oldProfile as SSHProfile,
            profileData,
        )
        const passwordChanged = password !== this.initialPassword
        if (identityChanged && this.passwordLoadFailed && !passwordChanged && !hadPlaintextPassword) {
            throw new Error('The saved password could not be loaded. Unlock Vault and try again before changing host, port, or username.')
        }

        if (password && (!this.editMode || passwordChanged || identityChanged || hadPlaintextPassword)) {
            await this.credentials.saveSshPassword(profileData, password)
        }

        const original = existing ? this.cloneProfile(existing) : null
        if (existing) {
            existing.name = profileData.name
            if (Object.prototype.hasOwnProperty.call(profileData, 'group')) {
                existing.group = profileData.group
            } else {
                delete existing.group
            }
            existing.options = profileData.options
        } else {
            profiles.push(profileData)
        }

        try {
            await this.config.save()
        } catch (error) {
            if (existing && original) {
                profiles[idx] = original
            } else {
                const addedIndex = profiles.indexOf(profileData)
                if (addedIndex >= 0) profiles.splice(addedIndex, 1)
            }
            throw error
        }

        try {
            const allProfiles = await this.profilesService.getProfiles()
            if (existing && oldProfile && identityChanged) {
                if (!this.isCredentialShared(allProfiles, existing, oldProfile as SSHProfile, false)) {
                    await this.credentials.deleteSshPassword(oldProfile as SSHProfile)
                }
            } else if (existing && !password && this.initialPassword) {
                if (!this.isCredentialShared(allProfiles, existing, profileData, true)) {
                    await this.credentials.deleteSshPasswordEverywhere(profileData)
                }
            }
        } catch (error) {
            this.notifications.info('SSH connection saved, but an old stored password could not be removed', this.getErrorMessage(error))
        }
    }

    private loadFromProfile (profile: any): void {
        this.name = profile?.name || ''
        this.group = profile?.group || ''
        this.initialGroup = this.group
        this.sourceProfile = this.cloneProfile(profile)
        this.sourceOptions = { ...(profile?.options || {}) }
        this.options = {
            ...this.options,
            ...resolveSshCredentialOptions(this.sourceOptions, this.getSshDefaults()),
        }
        this.initialIdentityOptions = {
            host: this.options.host,
            port: this.options.port,
            user: this.options.user,
        }
        this.initialPassword = this.cleanPassword(profile?.options?.password) || ''
    }

    private async loadStoredPassword (): Promise<void> {
        if (!this.sourceProfile || this.initialPassword) {
            this.options.password = this.initialPassword
            return
        }

        try {
            const password = await this.credentials.loadSshPassword(this.sourceProfile as SSHProfile)
            this.initialPassword = password || ''
            this.options.password = this.initialPassword
        } catch (error) {
            this.passwordLoadFailed = true
            console.error('Could not load saved SSH password', error)
        }
    }

    private resolveEditingIndex (profiles: any[]): number {
        if (this.profileId) {
            const byId = profiles.findIndex(p => p.id === this.profileId)
            if (byId >= 0) {
                return byId
            }
        }

        if (this.editingIndex !== null && this.editingIndex >= 0 && this.editingIndex < profiles.length) {
            return this.editingIndex
        }

        if (this.initialProfile?.type === 'ssh' && !this.initialProfile.isBuiltin) {
            return this.findProfileIndexBySnapshot(profiles, this.initialProfile)
        }

        return -1
    }

    private findProfileIndexBySnapshot (profiles: any[], snapshot: PartialProfile<SSHProfile>): number {
        const host = this.cleanHost(snapshot.options?.host)
        const port = this.normalizePort(snapshot.options?.port)
        const user = this.cleanText(snapshot.options?.user) || 'root'
        const name = snapshot.name || ''
        const group = snapshot.group || ''

        return profiles.findIndex(p => (
            p.type === 'ssh' &&
            (p.name || '') === name &&
            (p.group || '') === group &&
            this.cleanHost(p.options?.host) === host &&
            this.normalizePort(p.options?.port) === port &&
            (this.cleanText(p.options?.user) || 'root') === user
        ))
    }

    private cleanHost (value?: string): string {
        return (value || '').replace(/[\r\n]+/g, '').trim()
    }

    private cleanText (value?: string): string | undefined {
        if (!value) return undefined
        const cleaned = value.replace(/[\r\n]+/g, '').trim()
        return cleaned || undefined
    }

    private cleanPassword (value?: string): string | undefined {
        if (value === undefined || value === null) return undefined
        const cleaned = String(value).replace(/[\r\n]+/g, '')
        return cleaned ? cleaned : undefined
    }

    private normalizePort (port?: number): number {
        const value = Number(port || 22)
        if (!Number.isFinite(value)) return 22
        const rounded = Math.round(value)
        if (rounded < 1 || rounded > 65535) return 22
        return rounded
    }

    private normalizeOptions (opts: SSHProfileOptions): SSHProfileOptions {
        return {
            ...opts,
            host: this.cleanHost(opts.host),
            port: this.normalizePort(opts.port),
            user: this.cleanText(opts.user) || 'root',
            password: this.cleanPassword(opts.password),
            auth: opts.auth ?? null,
            privateKeys: Array.isArray(opts.privateKeys) ? opts.privateKeys.filter(Boolean) : [],
        }
    }

    private cloneProfile<T> (profile: T): T {
        if (!profile) return profile
        return {
            ...(profile as any),
            options: { ...((profile as any).options || {}) },
        }
    }

    private getErrorMessage (error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private getSshDefaults (): Partial<SSHProfileOptions> {
        return this.config.store.profileDefaults?.ssh?.options || {}
    }

    private restoreUnchangedIdentityOption (
        options: Record<string, any>,
        key: 'host' | 'port' | 'user',
        currentValue: unknown,
    ): void {
        if (!this.sourceProfile || !Object.is(currentValue, this.initialIdentityOptions[key])) return

        if (Object.prototype.hasOwnProperty.call(this.sourceOptions, key)) {
            options[key] = this.sourceOptions[key]
        } else {
            delete options[key]
        }
    }

    private isCredentialShared (
        profiles: any[],
        currentProfile: any,
        target: SSHProfile,
        includeAllBackends: boolean,
    ): boolean {
        return profiles.some(profile => {
            if (profile === currentProfile || profile?.type !== 'ssh') return false
            return includeAllBackends
                ? this.credentials.hasSameSshCredentialIdentityAnywhere(profile as SSHProfile, target)
                : this.credentials.hasSameSshCredentialIdentity(profile as SSHProfile, target)
        })
    }

    hasConnectionTarget (): boolean {
        return !!this.cleanHost(this.options.host) || this.hasProxyCommandTarget()
    }

    private hasProxyCommandTarget (): boolean {
        const proxyCommand = this.sourceOptions.proxyCommand !== undefined
            ? this.sourceOptions.proxyCommand
            : this.getSshDefaults().proxyCommand
        return !!proxyCommand
    }

    cancel (): void {
        this.cancelled.emit()
    }
}
