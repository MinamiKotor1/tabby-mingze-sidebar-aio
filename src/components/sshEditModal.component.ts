import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, PartialProfile } from 'tabby-core'
import { SSHProfile, SSHProfileOptions } from '../models/interfaces'

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
                    <small class="form-hint">Password is stored in config when you save it here.</small>
                </div>
                <div class="ssh-modal-footer">
                    <button class="btn btn-sm btn-secondary" (click)="cancel()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="!options.host">Save</button>
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
    private editingIndex: number | null = null
    private sourceOptions: Record<string, any> = {}

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
    ) {}

    async ngOnInit (): Promise<void> {
        const profiles = this.config.store.profiles || []

        if (this.profileId) {
            const idx = profiles.findIndex(p => p.id === this.profileId)
            if (idx >= 0) {
                this.loadFromProfile(profiles[idx])
                this.editMode = true
                this.editingIndex = idx
                return
            }
        }

        if (this.initialProfile?.type === 'ssh') {
            this.loadFromProfile(this.initialProfile)
            this.editMode = true
            this.editingIndex = this.findProfileIndexBySnapshot(profiles, this.initialProfile)
        }
    }

    async save (): Promise<void> {
        const normalized = this.normalizeOptions(this.options)
        if (!normalized.host) return

        const options = {
            ...this.sourceOptions,
            ...normalized,
        }

        if (!normalized.password) {
            delete options.password
        }

        const profileData = {
            type: 'ssh',
            name: this.name || `${options.user || 'root'}@${options.host}:${options.port}`,
            group: this.group || undefined,
            options,
        }

        const profiles = this.config.store.profiles = this.config.store.profiles || []
        if (this.editMode) {
            const idx = this.resolveEditingIndex(profiles)
            if (idx >= 0) {
                profiles[idx].name = profileData.name
                profiles[idx].group = profileData.group
                profiles[idx].options = profileData.options
            } else {
                profiles.push(profileData)
            }
        } else {
            profiles.push(profileData)
        }

        await this.config.save()
        this.saved.emit()
    }

    private loadFromProfile (profile: any): void {
        this.name = profile?.name || ''
        this.group = profile?.group || ''
        this.sourceOptions = { ...(profile?.options || {}) }
        this.options = { ...this.options, ...(profile?.options || {}) }
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

        if (this.initialProfile?.type === 'ssh') {
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

    cancel (): void {
        this.cancelled.emit()
    }
}
