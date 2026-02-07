import { Component, Input, Output, EventEmitter } from '@angular/core'
import { PartialProfile, Profile } from 'tabby-core'

@Component({
    selector: 'connection-item',
    template: `
        <div class="connection-item"
             [class.active]="active"
             (click)="launch.emit()"
             (contextmenu)="contextMenu.emit($event)">
            <span class="conn-name">{{ profile.name }}</span>
            <i class="conn-play fas fa-play"></i>
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
