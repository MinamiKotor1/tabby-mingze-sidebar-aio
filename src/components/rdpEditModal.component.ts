import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, NotificationsService, PartialProfile } from 'tabby-core'
import { RDPProfile, RDPProfileOptions } from '../models/interfaces'
import { RdpService } from '../services/rdp.service'
import { resolveRdpCredentialOptions } from '../services/credentialStorage.service'
import { createCustomProfileId } from '../utils/profile'

@Component({
    selector: 'rdp-edit-modal',
    template: `
        <div class="rdp-modal-backdrop" (click)="cancel()">
            <div class="rdp-modal" (click)="$event.stopPropagation()">
                <div class="rdp-modal-header">
                    <span>{{ editMode ? 'Edit' : 'New' }} RDP Connection</span>
                    <button class="btn-modal-close" (click)="cancel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="rdp-modal-body">
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
                            <input class="form-control form-control-sm" [(ngModel)]="options.username" placeholder="optional">
                        </div>
                        <div class="form-group flex-grow">
                            <label>Domain</label>
                            <input class="form-control form-control-sm" [(ngModel)]="options.domain" placeholder="optional">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input class="form-control form-control-sm" type="password" [(ngModel)]="options.password" placeholder="optional">
                    </div>
                    <div class="form-group">
                        <label>Group</label>
                        <input class="form-control form-control-sm" [(ngModel)]="group" placeholder="optional">
                    </div>
                    <div class="form-check-row">
                        <label class="form-check">
                            <input type="checkbox" [(ngModel)]="options.fullscreen"> Fullscreen
                        </label>
                        <label class="form-check">
                            <input type="checkbox" [(ngModel)]="options.admin"> Admin mode
                        </label>
                    </div>
                    <div class="form-row" *ngIf="!options.fullscreen">
                        <div class="form-group" style="width:100px">
                            <label>Width</label>
                            <input class="form-control form-control-sm" type="number" min="640" max="8192" [(ngModel)]="options.width" placeholder="1920">
                        </div>
                        <div class="form-group" style="width:100px">
                            <label>Height</label>
                            <input class="form-control form-control-sm" type="number" min="640" max="8192" [(ngModel)]="options.height" placeholder="1080">
                        </div>
                    </div>
                    <small class="form-hint">Fixed resolution mode. Default is 1920 x 1080.</small>
                    <small class="form-hint">Password is stored securely in Tabby Vault or the system credential store.</small>
                    <small class="form-error" *ngIf="errorMessage">{{ errorMessage }}</small>
                </div>
                <div class="rdp-modal-footer">
                    <button class="btn btn-sm btn-secondary" (click)="cancel()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="!options.host || saving">
                        {{ saving ? 'Saving...' : 'Save' }}
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .rdp-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(var(--bs-dark-rgb), 0.55);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .rdp-modal {
            background: var(--theme-bg-more);
            border: 1px solid var(--theme-bg-more-2);
            border-radius: 12px;
            width: 400px;
            box-shadow: 0 16px 48px rgba(var(--bs-dark-rgb), 0.4);
        }
        .rdp-modal-header {
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
            &:hover { background: var(--theme-bg-more-2); color: var(--theme-fg); }
        }
        .rdp-modal-body {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            color: var(--theme-fg);
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            label {
                font-size: 11px;
                font-weight: 600;
                color: var(--theme-fg-more);
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
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
        .flex-grow { flex: 1; }
        .form-check-row {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: var(--theme-fg);
            .form-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        }
        .rdp-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--theme-bg-more-2);
        }
    `],
})
export class RdpEditModalComponent implements OnInit {
    @Input() profileId: string | null = null
    @Input() initialProfile: PartialProfile<RDPProfile> | null = null
    @Output() saved = new EventEmitter<void>()
    @Output() cancelled = new EventEmitter<void>()

    name = ''
    group = ''
    editMode = false
    saving = false
    errorMessage = ''
    private editingIndex: number | null = null
    private sourceOptions: Record<string, any> = {}
    private sourceProfile: PartialProfile<RDPProfile> | null = null
    options: RDPProfileOptions = {
        host: '',
        port: 3389,
        username: '',
        password: '',
        domain: '',
        fullscreen: false,
        width: 1920,
        height: 1080,
        admin: false,
    }

    private initialPassword = ''
    private passwordLoadFailed = false

    constructor (
        private config: ConfigService,
        private rdpService: RdpService,
        private notifications: NotificationsService,
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

        if (this.initialProfile?.type === 'rdp') {
            this.loadFromProfile(this.initialProfile)
            this.editMode = true
            this.editingIndex = this.findProfileIndexBySnapshot(profiles, this.initialProfile)
            await this.loadStoredPassword()
        }
    }

    private async loadStoredPassword (): Promise<void> {
        if (!this.sourceProfile || this.initialPassword) {
            this.options.password = this.initialPassword
            return
        }

        try {
            const password = await this.rdpService.loadPassword(this.sourceProfile.options || {})
            this.initialPassword = password || ''
            this.options.password = this.initialPassword
        } catch (error) {
            this.passwordLoadFailed = true
            console.error('Could not load saved RDP password', error)
        }
    }

    async save (): Promise<void> {
        if (this.saving) return
        const options = this.normalizeOptions(this.options)
        if (!options.host) return

        this.saving = true
        this.errorMessage = ''

        try {
            await this.saveProfile(options)
            this.saved.emit()
        } catch (error) {
            this.errorMessage = this.getErrorMessage(error)
            this.notifications.error('Could not save RDP connection', this.errorMessage)
        } finally {
            this.saving = false
        }
    }

    private async saveProfile (options: RDPProfileOptions): Promise<void> {
        const profiles = this.config.store.profiles = this.config.store.profiles || []
        const idx = this.editMode ? this.resolveEditingIndex(profiles) : -1
        const existing = idx >= 0 ? profiles[idx] : null
        const oldProfile = this.cloneProfile(existing || this.sourceProfile)

        const password = this.cleanPassword(options.password) || ''
        const hadPlaintextPassword = !!this.cleanPassword(this.sourceOptions.password)
        const savedOptions: Record<string, any> = {
            ...this.sourceOptions,
            ...options,
        }
        const sourceEffectiveOptions = resolveRdpCredentialOptions(this.sourceOptions, this.getRdpDefaults())
        if (
            this.sourceOptions.host === undefined &&
            options.host === this.cleanHost(sourceEffectiveOptions.host)
        ) {
            delete savedOptions.host
        }
        if (
            this.sourceOptions.port === undefined &&
            options.port === this.normalizePort(sourceEffectiveOptions.port)
        ) {
            delete savedOptions.port
        }
        if (
            this.sourceOptions.username === undefined &&
            options.username === this.cleanText(sourceEffectiveOptions.username)
        ) {
            delete savedOptions.username
        }
        delete savedOptions.password

        const profileData = {
            ...(this.sourceProfile || {}),
            id: existing?.id || createCustomProfileId('rdp', this.name || options.host),
            type: 'rdp',
            name: this.name || `RDP: ${options.host}`,
            group: this.group || undefined,
            options: savedOptions,
        } as RDPProfile

        if (!existing) {
            profileData.isBuiltin = false
            profileData.isTemplate = false
        }

        const identityChanged = !!oldProfile && !this.rdpService.hasSameCredentialIdentity(
            oldProfile.options || {},
            profileData.options,
        )
        const passwordChanged = password !== this.initialPassword
        if (identityChanged && this.passwordLoadFailed && !passwordChanged && !hadPlaintextPassword) {
            throw new Error('The saved password could not be loaded. Unlock Vault and try again before changing host, port, or username.')
        }

        if (password && (!this.editMode || passwordChanged || identityChanged || hadPlaintextPassword)) {
            await this.rdpService.savePassword(options, password)
        }

        const original = existing ? this.cloneProfile(existing) : null
        if (existing) {
            existing.name = profileData.name
            existing.group = profileData.group
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
            if (existing && oldProfile && identityChanged) {
                const currentProfile = existing || profileData
                if (!this.isCredentialShared(profiles, currentProfile, oldProfile.options || {}, false)) {
                    await this.rdpService.deletePassword(oldProfile.options || {})
                }
                if (!this.isWindowsCredentialShared(profiles, currentProfile, oldProfile.options || {})) {
                    await this.rdpService.deleteSavedWindowsCredentials(oldProfile.options || {})
                }
            } else if (existing && !password && this.initialPassword) {
                const currentProfile = existing || profileData
                if (!this.isCredentialShared(profiles, currentProfile, profileData.options, true)) {
                    await this.rdpService.deletePasswordEverywhere(profileData.options)
                }
                if (!this.isWindowsCredentialShared(profiles, currentProfile, profileData.options)) {
                    await this.rdpService.deleteSavedWindowsCredentials(profileData.options)
                }
            } else if (existing && passwordChanged) {
                if (!this.isWindowsCredentialShared(profiles, existing || profileData, profileData.options)) {
                    await this.rdpService.deleteSavedWindowsCredentials(profileData.options)
                }
            }
        } catch (error) {
            this.notifications.info('RDP connection saved, but an old stored credential could not be removed', this.getErrorMessage(error))
        }
    }

    private loadFromProfile (profile: any): void {
        this.name = profile?.name || ''
        this.group = profile?.group || ''
        this.sourceProfile = this.cloneProfile(profile)
        this.sourceOptions = { ...(profile?.options || {}) }
        this.options = {
            ...this.options,
            ...resolveRdpCredentialOptions(this.sourceOptions, this.getRdpDefaults()),
        }
        this.initialPassword = this.cleanPassword(profile?.options?.password) || ''
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

        if (this.initialProfile?.type === 'rdp') {
            return this.findProfileIndexBySnapshot(profiles, this.initialProfile)
        }

        return -1
    }

    private findProfileIndexBySnapshot (profiles: any[], snapshot: PartialProfile<RDPProfile>): number {
        const host = this.cleanHost(snapshot.options?.host)
        const port = this.normalizePort(snapshot.options?.port)
        const name = snapshot.name || ''
        const group = snapshot.group || ''

        return profiles.findIndex(p => (
            p.type === 'rdp' &&
            (p.name || '') === name &&
            (p.group || '') === group &&
            this.cleanHost(p.options?.host) === host &&
            this.normalizePort(p.options?.port) === port
        ))
    }

    private cleanHost (value?: string): string {
        return (value || '').replace(/[\r\n]+/g, '').trim()
    }

    private normalizeOptions (opts: RDPProfileOptions): RDPProfileOptions {
        const host = this.cleanHost(opts.host)
        const width = this.normalizeDimension(opts.width)
        const height = this.normalizeDimension(opts.height)

        return {
            ...opts,
            host,
            port: this.normalizePort(opts.port),
            username: this.cleanText(opts.username),
            password: this.cleanPassword(opts.password),
            domain: this.cleanText(opts.domain),
            width: opts.fullscreen ? undefined : (width || 1920),
            height: opts.fullscreen ? undefined : (height || 1080),
        }
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
        const value = Number(port || 3389)
        if (!Number.isFinite(value)) return 3389
        const rounded = Math.round(value)
        if (rounded < 1 || rounded > 65535) return 3389
        return rounded
    }

    private normalizeDimension (value?: number): number | undefined {
        if (value === undefined || value === null || value === 0) return undefined
        const num = Number(value)
        if (!Number.isFinite(num)) return undefined
        const rounded = Math.round(num)
        if (rounded < 640 || rounded > 8192) return undefined
        return rounded
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

    private getRdpDefaults (): Partial<RDPProfileOptions> {
        return this.config.store.profileDefaults?.rdp?.options || {}
    }

    private isCredentialShared (
        profiles: any[],
        currentProfile: any,
        target: Partial<RDPProfileOptions>,
        includeAllBackends: boolean,
    ): boolean {
        return profiles.some(profile => {
            if (profile === currentProfile || profile?.type !== 'rdp') return false
            return includeAllBackends
                ? this.rdpService.hasSameCredentialIdentityAnywhere(profile.options || {}, target)
                : this.rdpService.hasSameCredentialIdentity(profile.options || {}, target)
        })
    }

    private isWindowsCredentialShared (
        profiles: any[],
        currentProfile: any,
        target: Partial<RDPProfileOptions>,
    ): boolean {
        return profiles.some(profile => (
            profile !== currentProfile &&
            profile?.type === 'rdp' &&
            this.rdpService.hasOverlappingWindowsCredentialTargets(profile.options || {}, target)
        ))
    }

    cancel (): void {
        this.cancelled.emit()
    }
}
