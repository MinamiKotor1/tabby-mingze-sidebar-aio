import { Component, Input, Output, EventEmitter } from '@angular/core'
import { PartialProfile, Profile } from 'tabby-core'
import { PROTOCOL_META, ProtocolType } from '../models/interfaces'

@Component({
    selector: 'connection-item',
    template: `
        <div class="connection-item"
             [class.active]="active"
             (click)="launch.emit()"
             (contextmenu)="contextMenu.emit($event)">
            <i class="conn-indicator fas fa-circle"
               [style.color]="getProtocolColor()"></i>
            <span class="conn-name">{{ profile.name }}</span>
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

    getProtocolColor (): string {
        const type = this.profile?.type as ProtocolType
        return PROTOCOL_META[type]?.color || '#6b7280'
    }
}
