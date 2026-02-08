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
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--theme-fg-more);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .connection-item:hover {
            background: var(--theme-bg-more);
            color: var(--theme-fg);
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
             (contextmenu)="contextMenu.emit($event)">{{ profile.name }}</div>
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
