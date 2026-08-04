import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, NotificationsService, PartialProfile, ProfilesService } from 'tabby-core'
import { SSHProfile, SSHProfileOptions } from '../models/interfaces'
import { CredentialStorageService } from '../services/credentialStorage.service'
import {
    buildSshProfileData,
    cloneSshProfile,
    createSshProfileEditState,
    findSshProfileIndexBySnapshot,
    hasSshConnectionTarget,
    normalizeSshProfileOptions,
    resolveSshEditingIndex,
    SshIdentityOptions,
} from '../utils/sshProfile'

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
    private initialIdentityOptions: SshIdentityOptions = {
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
                : findSshProfileIndexBySnapshot(profiles, this.initialProfile)
            await this.loadStoredPassword()
        }
    }

    async save (): Promise<void> {
        if (this.saving) return
        const normalized = normalizeSshProfileOptions(this.options)
        if (!hasSshConnectionTarget(this.options, this.sourceOptions, this.getSshDefaults())) return

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
        const idx = this.editMode
            ? resolveSshEditingIndex({
                profiles,
                profileId: this.profileId,
                editingIndex: this.editingIndex,
                initialProfile: this.initialProfile,
            })
            : -1
        const existing = idx >= 0 ? profiles[idx] : null
        const oldProfile = cloneSshProfile(existing || this.sourceProfile)
        const { profileData, password, hadPlaintextPassword } = buildSshProfileData({
            sourceProfile: this.sourceProfile,
            sourceOptions: this.sourceOptions,
            initialIdentityOptions: this.initialIdentityOptions,
            initialGroup: this.initialGroup,
            name: this.name,
            group: this.group,
            currentOptions: this.options,
            normalizedOptions: normalized,
            existing,
        })

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

        const original = existing ? cloneSshProfile(existing) : null
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
        const state = createSshProfileEditState(profile, this.getSshDefaults(), this.options)
        this.name = state.name
        this.group = state.group
        this.initialGroup = state.initialGroup
        this.sourceProfile = state.sourceProfile
        this.sourceOptions = state.sourceOptions
        this.options = state.options
        this.initialIdentityOptions = state.initialIdentityOptions
        this.initialPassword = state.initialPassword
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

    private getErrorMessage (error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private getSshDefaults (): Partial<SSHProfileOptions> {
        return this.config.store.profileDefaults?.ssh?.options || {}
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
        return hasSshConnectionTarget(this.options, this.sourceOptions, this.getSshDefaults())
    }

    cancel (): void {
        this.cancelled.emit()
    }
}
