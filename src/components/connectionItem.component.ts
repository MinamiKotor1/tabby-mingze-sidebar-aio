import { Component, Input, Output, EventEmitter } from '@angular/core'
import { PartialProfile, Profile } from 'tabby-core'

@Component({
    selector: 'connection-item',
    styles: [`
        :host { display: block; }
        .connection-item {
            padding: 4px 12px 4px 24px;
            cursor: pointer;
            border-left: 2px solid transparent;
            transition: all 0.1s ease;
            color: var(--theme-fg-more);
            overflow: hidden;
        }
        .connection-item:hover {
            background: var(--theme-bg-more);
            color: var(--theme-fg);
        }
        .connection-title-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        .connection-name {
            min-width: 0;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0;
        }
        .protocol-badge {
            flex: none;
            padding: 1px 4px;
            border: 1px solid var(--theme-bg-more-2);
            border-radius: 3px;
            color: var(--theme-fg-more);
            font-size: 8px;
            font-weight: 700;
            line-height: 1.2;
            text-transform: uppercase;
            letter-spacing: 0;
        }
        .connection-description {
            margin-top: 1px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--theme-fg-more);
            font-size: 10px;
            font-weight: 400;
            line-height: 1.25;
            letter-spacing: 0;
        }
        .connection-item.active {
            background: rgba(var(--bs-primary-rgb), 0.08);
            border-left-color: var(--theme-primary);
            color: var(--theme-fg);
        }
    `],
    template: `
        <div class="connection-item"
             [class.active]="active"
             (click)="launch.emit()"
             (contextmenu)="contextMenu.emit($event)">
            <div class="connection-title-row">
                <span class="connection-name" [title]="profile.name">{{ profile.name }}</span>
                <span class="protocol-badge" *ngIf="showBadge">{{ profile.type | uppercase }}</span>
            </div>
            <div class="connection-description" *ngIf="description" [title]="description">
                {{ description }}
            </div>
        </div>
    `,
})
export class ConnectionItemComponent {
    @Input() profile: PartialProfile<Profile>
    @Input() description: string | null = null
    @Input() active = false
    @Input() showBadge = true
    @Output() launch = new EventEmitter<void>()
    @Output() contextMenu = new EventEmitter<MouseEvent>()
}
