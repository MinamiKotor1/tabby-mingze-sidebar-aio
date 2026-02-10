import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService, PartialProfile } from 'tabby-core'
import { TelnetProfile, TelnetProfileOptions } from '../models/interfaces'

@Component({
    selector: 'telnet-edit-modal',
    template: `
        <div class="telnet-modal-backdrop" (click)="cancel()">
            <div class="telnet-modal" (click)="$event.stopPropagation()">
                <div class="telnet-modal-header">
                    <span>{{ editMode ? 'Edit' : 'New' }} Telnet Connection</span>
                    <button class="btn-modal-close" (click)="cancel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="telnet-modal-body">
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
                            <label>Input mode</label>
                            <select class="form-control form-control-sm" [(ngModel)]="options.inputMode">
                                <option value="readline">Readline</option>
                                <option value="local-echo">Local echo</option>
                            </select>
                        </div>
                        <div class="form-group flex-grow">
                            <label>Output newlines</label>
                            <select class="form-control form-control-sm" [(ngModel)]="options.outputNewlines">
                                <option value="crlf">CRLF</option>
                                <option value="lf">LF</option>
                                <option value="cr">CR</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Group</label>
                        <input class="form-control form-control-sm" [(ngModel)]="group" placeholder="optional">
                    </div>
                </div>
                <div class="telnet-modal-footer">
                    <button class="btn btn-sm btn-secondary" (click)="cancel()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="!options.host">Save</button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .telnet-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(var(--bs-dark-rgb), 0.55);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .telnet-modal {
            background: var(--theme-bg-more);
            border: 1px solid var(--theme-bg-more-2);
            border-radius: 12px;
            width: 400px;
            box-shadow: 0 16px 48px rgba(var(--bs-dark-rgb), 0.4);
        }
        .telnet-modal-header {
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
        .telnet-modal-body {
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
        .flex-grow {
            flex: 1;
        }
        .telnet-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--theme-bg-more-2);
        }
    `],
})
export class TelnetEditModalComponent implements OnInit {
    @Input() profileId: string | null = null
    @Input() initialProfile: PartialProfile<TelnetProfile> | null = null
    @Output() saved = new EventEmitter<void>()
    @Output() cancelled = new EventEmitter<void>()

    name = ''
    group = ''
    editMode = false
    private editingIndex: number | null = null
    private sourceOptions: Record<string, any> = {}

    options: TelnetProfileOptions = {
        host: '',
        port: 23,
        inputMode: 'readline',
        outputMode: null,
        inputNewlines: null,
        outputNewlines: 'crlf',
        scripts: [],
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

        if (this.initialProfile?.type === 'telnet') {
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

        const profileData = {
            type: 'telnet',
            name: this.name || `${options.host}:${options.port}`,
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

        if (this.initialProfile?.type === 'telnet') {
            return this.findProfileIndexBySnapshot(profiles, this.initialProfile)
        }

        return -1
    }

    private findProfileIndexBySnapshot (profiles: any[], snapshot: PartialProfile<TelnetProfile>): number {
        const host = this.cleanHost(snapshot.options?.host)
        const port = this.normalizePort(snapshot.options?.port)
        const name = snapshot.name || ''
        const group = snapshot.group || ''

        return profiles.findIndex(p => (
            p.type === 'telnet' &&
            (p.name || '') === name &&
            (p.group || '') === group &&
            this.cleanHost(p.options?.host) === host &&
            this.normalizePort(p.options?.port) === port
        ))
    }

    private cleanHost (value?: string): string {
        return (value || '').replace(/[\r\n]+/g, '').trim()
    }

    private normalizePort (port?: number): number {
        const value = Number(port || 23)
        if (!Number.isFinite(value)) return 23
        const rounded = Math.round(value)
        if (rounded < 1 || rounded > 65535) return 23
        return rounded
    }

    private normalizeMode (value?: string | null): string | null {
        if (!value) return null
        const mode = value.trim()
        return mode || null
    }

    private normalizeOptions (opts: TelnetProfileOptions): TelnetProfileOptions {
        return {
            ...opts,
            host: this.cleanHost(opts.host),
            port: this.normalizePort(opts.port),
            inputMode: opts.inputMode || 'readline',
            outputMode: this.normalizeMode(opts.outputMode),
            inputNewlines: this.normalizeMode(opts.inputNewlines),
            outputNewlines: opts.outputNewlines || 'crlf',
            scripts: Array.isArray(opts.scripts) ? opts.scripts : [],
        }
    }

    cancel (): void {
        this.cancelled.emit()
    }
}
