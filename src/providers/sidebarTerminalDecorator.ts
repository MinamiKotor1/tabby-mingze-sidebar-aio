import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal'

import { SidebarService } from '../services/sidebar.service'

@Injectable()
export class SidebarTerminalDecorator extends TerminalDecorator {
    constructor (private sidebar: SidebarService) {
        super()
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        this.sidebar.registerTerminal(terminal)
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        this.sidebar.unregisterTerminal(terminal)
        super.detach(terminal)
    }
}
