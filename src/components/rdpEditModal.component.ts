import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { RDPProfileOptions } from '../models/interfaces'

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
                            <input class="form-control form-control-sm" type="number" [(ngModel)]="options.port">
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
                            <input class="form-control form-control-sm" type="number" [(ngModel)]="options.width" placeholder="1920">
                        </div>
                        <div class="form-group" style="width:100px">
                            <label>Height</label>
                            <input class="form-control form-control-sm" type="number" [(ngModel)]="options.height" placeholder="1080">
                        </div>
                    </div>
                </div>
                <div class="rdp-modal-footer">
                    <button class="btn btn-sm btn-secondary" (click)="cancel()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save()" [disabled]="!options.host">Save</button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .rdp-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.55);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        }
        .rdp-modal {
            background: var(--bs-body-bg);
            border: 1px solid var(--bs-border-color);
            border-radius: 12px;
            width: 400px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.5);
        }
        .rdp-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            border-bottom: 1px solid var(--bs-border-color);
            font-weight: 600;
            font-size: 14px;
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
            color: var(--bs-secondary-color);
            cursor: pointer;
            transition: all 0.15s;
            &:hover { background: var(--bs-secondary-bg); color: var(--bs-body-color); }
        }
        .rdp-modal-body {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            label {
                font-size: 11px;
                font-weight: 600;
                color: var(--bs-secondary-color);
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
        }
        .form-row {
            display: flex;
            gap: 8px;
        }
        .flex-grow { flex: 1; }
        .form-check-row {
            display: flex;
            gap: 16px;
            font-size: 12px;
            .form-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        }
        .rdp-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--bs-border-color);
        }
    `],
})
export class RdpEditModalComponent implements OnInit {
    @Input() profileId: string | null = null
    @Output() saved = new EventEmitter<void>()
    @Output() cancelled = new EventEmitter<void>()

    name = ''
    group = ''
    editMode = false
    options: RDPProfileOptions = {
        host: '',
        port: 3389,
        username: '',
        domain: '',
        fullscreen: false,
        width: undefined,
        height: undefined,
        admin: false,
    }

    constructor (private config: ConfigService) {}

    ngOnInit (): void {
        if (this.profileId) {
            this.editMode = true
            const existing = (this.config.store.profiles || []).find(p => p.id === this.profileId)
            if (existing) {
                this.name = existing.name || ''
                this.group = existing.group || ''
                this.options = { ...this.options, ...existing.options }
            }
        }
    }

    save (): void {
        if (!this.options.host) return

        const profiles = this.config.store.profiles = this.config.store.profiles || []

        if (this.editMode && this.profileId) {
            const idx = profiles.findIndex(p => p.id === this.profileId)
            if (idx >= 0) {
                profiles[idx].name = this.name || `RDP: ${this.options.host}`
                profiles[idx].group = this.group || undefined
                profiles[idx].options = { ...this.options }
            }
        } else {
            profiles.push({
                type: 'rdp',
                name: this.name || `RDP: ${this.options.host}`,
                group: this.group || undefined,
                options: { ...this.options },
            })
        }

        this.config.save()
        this.saved.emit()
    }

    cancel (): void {
        this.cancelled.emit()
    }
}
