import { Injectable, ComponentFactoryResolver, ApplicationRef, Injector, EmbeddedViewRef, ComponentRef } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { SidebarComponent } from '../components/sidebar.component'
import { CONFIG_KEY, SidebarConfig } from '../models/interfaces'

@Injectable({ providedIn: 'root' })
export class SidebarService {
    private componentRef: ComponentRef<SidebarComponent> | null = null
    private wrapperEl: HTMLElement | null = null
    private styleEl: HTMLStyleElement | null = null
    private isVisible = false

    constructor (
        private cfr: ComponentFactoryResolver,
        private appRef: ApplicationRef,
        private injector: Injector,
        private config: ConfigService,
    ) {}

    get visible (): boolean { return this.isVisible }

    private get cfg (): Partial<SidebarConfig> {
        return this.config.store[CONFIG_KEY] || {}
    }

    private get width (): number { return this.cfg.width || 280 }
    private get position (): 'left' | 'right' { return this.cfg.position || 'left' }

    initialize (): void {
        if (this.cfg.sidebarVisible !== false) {
            this.show()
        }
    }

    show (): void {
        if (this.isVisible) return
        this.create()
        this.saveField('sidebarVisible', true)
        this.isVisible = true
    }

    hide (): void {
        if (!this.isVisible) return
        this.destroy()
        this.saveField('sidebarVisible', false)
        this.isVisible = false
    }

    toggle (): void {
        this.isVisible ? this.hide() : this.show()
    }

    openRdpModal (): void {
        // TODO: open RDP edit modal
    }

    // --- Internal ---

    private create (): void {
        const appRoot = document.querySelector('app-root')
        if (!appRoot) return

        const factory = this.cfr.resolveComponentFactory(SidebarComponent)
        this.componentRef = factory.create(this.injector)
        this.appRef.attachView(this.componentRef.hostView)

        const dom = (this.componentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        const w = this.width
        const pos = this.position

        const wrapper = document.createElement('div')
        wrapper.className = 'aio-sidebar-wrapper'
        wrapper.style.cssText = `
            width: ${w}px;
            flex: 0 0 ${w}px;
            display: flex;
            flex-direction: column;
            background: var(--bs-body-bg, #1e1e1e);
            border-${pos === 'left' ? 'right' : 'left'}: 1px solid var(--bs-border-color, #333);
            z-index: 999;
            order: ${pos === 'left' ? -1 : 999};
        `
        wrapper.appendChild(dom)

        if (pos === 'left') {
            appRoot.insertBefore(wrapper, appRoot.firstChild)
        } else {
            appRoot.appendChild(wrapper)
        }
        this.wrapperEl = wrapper

        this.injectCSS()
        this.fixContentWidth(appRoot)

        this.componentRef.instance.sidebarService = this
    }

    private destroy (): void {
        const appRoot = document.querySelector('app-root')
        if (appRoot) this.restoreContentWidth(appRoot)
        this.removeCSS()

        if (this.componentRef) {
            this.appRef.detachView(this.componentRef.hostView)
            this.componentRef.destroy()
            this.componentRef = null
        }
        if (this.wrapperEl) {
            this.wrapperEl.remove()
            this.wrapperEl = null
        }
    }

    private injectCSS (): void {
        const style = document.createElement('style')
        style.id = 'aio-sidebar-layout-css'
        style.textContent = `
            app-root {
                display: flex !important;
                flex-direction: row !important;
                width: 100vw !important;
                height: 100vh !important;
                overflow: hidden !important;
            }
            app-root > .content,
            app-root > div.content,
            app-root > .content[class],
            app-root > [class*="content"] {
                flex: 1 1 auto !important;
                width: 0 !important;
                max-width: 100% !important;
                min-width: 0 !important;
            }
        `
        document.head.appendChild(style)
        this.styleEl = style
    }

    private removeCSS (): void {
        if (this.styleEl) {
            this.styleEl.remove()
            this.styleEl = null
        }
    }

    private fixContentWidth (appRoot: Element): void {
        const contentElements = appRoot.querySelectorAll('.content')
        const target = contentElements.length > 1 ? contentElements[1] : contentElements[0]
        if (target) {
            const el = target as HTMLElement
            el.style.width = 'auto'
            el.style.flex = '1 1 auto'
            el.style.minWidth = '0'
        }
    }

    private restoreContentWidth (appRoot: Element): void {
        const contentElements = appRoot.querySelectorAll('.content')
        const target = contentElements.length > 1 ? contentElements[1] : contentElements[0]
        if (target) {
            const el = target as HTMLElement
            el.style.removeProperty('width')
            el.style.removeProperty('flex')
            el.style.removeProperty('min-width')
        }
    }

    private saveField (key: string, value: any): void {
        if (!this.config.store[CONFIG_KEY]) {
            this.config.store[CONFIG_KEY] = {}
        }
        this.config.store[CONFIG_KEY][key] = value
        this.config.save()
    }
}
