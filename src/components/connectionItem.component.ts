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
            <div class="protocol-stripe"
                 [style.background]="getProtocolColor()">
            </div>
            <profile-icon class="conn-icon"
                          [icon]="profile.icon"
                          [color]="profile.color">
            </profile-icon>
            <div class="conn-info">
                <div class="conn-name">{{ profile.name }}</div>
                <div class="conn-desc" *ngIf="description">{{ description }}</div>
            </div>
            <span class="protocol-badge"
                  *ngIf="showBadge"
                  [style.background]="getProtocolColor()">
                {{ getProtocolLabel() }}
            </span>
            <div class="hover-actions">
                <button class="btn-launch"
                        (click)="$event.stopPropagation(); launch.emit()"
                        title="Launch">
                    <i class="fas fa-play"></i>
                </button>
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

    getProtocolColor (): string {
        const type = this.profile?.type as ProtocolType
        return PROTOCOL_META[type]?.color || '#6b7280'
    }

    getProtocolLabel (): string {
        const type = this.profile?.type as ProtocolType
        return PROTOCOL_META[type]?.label || type?.toUpperCase() || ''
    }
}
