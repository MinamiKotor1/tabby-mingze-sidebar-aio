import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { CONFIG_KEY } from '../models/interfaces'

@Component({
    selector: 'aio-settings-tab',
    template: `
        <div class="aio-settings">
            <h3>Connection Sidebar Settings</h3>

            <!-- Appearance -->
            <h5>Appearance</h5>
            <div class="form-group">
                <label>Sidebar position</label>
                <select class="form-control form-control-sm" [(ngModel)]="config.store[configKey].position" (ngModelChange)="config.save()">
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                </select>
            </div>
            <div class="form-group">
                <label>Sidebar width (px)</label>
                <input class="form-control form-control-sm" type="number" [(ngModel)]="config.store[configKey].width" (ngModelChange)="config.save()">
            </div>
            <div class="form-group">
                <div class="form-check">
                    <input type="checkbox" class="form-check-input" [(ngModel)]="config.store[configKey].showProtocolBadge" (ngModelChange)="config.save()">
                    <label class="form-check-label">Show protocol badge</label>
                </div>
            </div>
            <div class="form-group">
                <label>Group by</label>
                <select class="form-control form-control-sm" [(ngModel)]="config.store[configKey].groupBy" (ngModelChange)="config.save()">
                    <option value="group">Custom group</option>
                    <option value="protocol">Protocol type</option>
                </select>
            </div>

            <!-- Behavior -->
            <h5>Behavior</h5>
            <div class="form-group">
                <label>Default sort</label>
                <select class="form-control form-control-sm" [(ngModel)]="config.store[configKey].sortBy" (ngModelChange)="config.save()">
                    <option value="name">Name</option>
                    <option value="host">Host</option>
                    <option value="recent">Recent</option>
                    <option value="type">Type</option>
                </select>
            </div>
            <div class="form-group">
                <label>Default protocol filter</label>
                <select class="form-control form-control-sm" [(ngModel)]="config.store[configKey].protocolFilter" (ngModelChange)="config.save()">
                    <option value="all">All</option>
                    <option value="ssh">SSH</option>
                    <option value="telnet">Telnet</option>
                    <option value="rdp">RDP</option>
                </select>
            </div>
            <div class="form-group">
                <div class="form-check">
                    <input type="checkbox" class="form-check-input" [(ngModel)]="config.store[configKey].showInToolbar" (ngModelChange)="config.save()">
                    <label class="form-check-label">Show toolbar button</label>
                </div>
            </div>

            <!-- RDP -->
            <h5>RDP</h5>
            <div class="form-group">
                <label>RDP client path</label>
                <input class="form-control form-control-sm" [(ngModel)]="config.store[configKey].rdpClientPath" (ngModelChange)="config.save()" placeholder="mstsc.exe">
            </div>
        </div>
    `,
    styles: [`
        .aio-settings {
            padding: 20px;
            max-width: 600px;
        }
        h3 { margin-bottom: 20px; }
        h5 {
            margin-top: 20px;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--bs-border-color);
            font-size: 14px;
            font-weight: 600;
        }
        .form-group {
            margin-bottom: 12px;
            label {
                font-size: 12px;
                margin-bottom: 4px;
                display: block;
            }
        }
        .form-control-sm { max-width: 300px; }
    `],
})
export class SettingsTabComponent {
    configKey = CONFIG_KEY

    constructor (public config: ConfigService) {}
}
