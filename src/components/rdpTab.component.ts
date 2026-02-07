import { Component, OnInit, Input, Injector } from '@angular/core'
import { BaseTabComponent, PartialProfile } from 'tabby-core'
import { RDPProfile } from '../models/interfaces'
import { RdpService } from '../services/rdp.service'

@Component({
    selector: 'rdp-tab',
    template: `
        <div class="rdp-tab-container">
            <div class="rdp-tab-header">
                <i class="fas fa-desktop"></i>
                <span>RDP Connection</span>
            </div>
            <div class="rdp-tab-info">
                <p>RDP session launched to <strong>{{ getHost() }}</strong></p>
                <div class="rdp-tab-details" *ngIf="profile?.options">
                    <div *ngIf="profile.options.username">User: {{ profile.options.username }}</div>
                    <div>Port: {{ profile.options.port || 3389 }}</div>
                    <div *ngIf="profile.options.domain">Domain: {{ profile.options.domain }}</div>
                    <div *ngIf="profile.options.fullscreen">Mode: Fullscreen</div>
                    <div *ngIf="profile.options.admin">Admin session</div>
                </div>
            </div>
            <div class="rdp-tab-actions">
                <button class="btn btn-primary" (click)="reconnect()">
                    <i class="fas fa-redo"></i> Reconnect
                </button>
            </div>
            <div class="rdp-tab-status" *ngIf="statusMessage">
                {{ statusMessage }}
            </div>
        </div>
    `,
    styles: [`
        .rdp-tab-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 24px;
            color: var(--bs-body-color);
        }
        .rdp-tab-header {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 22px;
            font-weight: 600;
        }
        .rdp-tab-header i {
            color: #3b82f6;
            font-size: 28px;
            opacity: 0.8;
        }
        .rdp-tab-info {
            text-align: center;
            line-height: 1.6;
        }
        .rdp-tab-details {
            margin-top: 12px;
            font-size: 12.5px;
            color: var(--bs-secondary-color);
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .rdp-tab-status {
            font-size: 11px;
            color: var(--bs-secondary-color);
            padding: 6px 14px;
            background: var(--bs-tertiary-bg);
            border-radius: 6px;
        }
    `],
})
export class RdpTabComponent extends BaseTabComponent implements OnInit {
    @Input() profile: PartialProfile<RDPProfile>
    statusMessage = ''

    constructor (injector: Injector, private rdpService: RdpService) {
        super(injector)
        this.setTitle('RDP')
    }

    ngOnInit (): void {
        this.setTitle(`RDP: ${this.getHost()}`)
        this.launchRdp()
    }

    getHost (): string {
        return this.profile?.options?.host || 'unknown'
    }

    reconnect (): void {
        this.launchRdp()
    }

    private launchRdp (): void {
        this.statusMessage = 'Launching mstsc.exe...'
        try {
            this.rdpService.launch(this.profile as RDPProfile)
            this.statusMessage = 'External RDP client launched'
        } catch (err) {
            this.statusMessage = `Failed: ${err}`
        }
    }
}
