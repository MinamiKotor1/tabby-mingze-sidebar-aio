import { Injectable, ComponentFactoryResolver, ApplicationRef, Injector, EmbeddedViewRef, ComponentRef } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { SidebarComponent } from '../components/sidebar.component'
import { RdpEditModalComponent } from '../components/rdpEditModal.component'
import { SshEditModalComponent } from '../components/sshEditModal.component'
import { TelnetEditModalComponent } from '../components/telnetEditModal.component'
import { CONFIG_KEY, SidebarConfig } from '../models/interfaces'

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 600
const LAYOUT_STYLE_ID = 'aio-sidebar-layout-css'
const LAYOUT_HOST_CLASS = 'aio-sidebar-layout'
const LAYOUT_LEFT_CLASS = 'aio-sidebar-layout-left'
const LAYOUT_RIGHT_CLASS = 'aio-sidebar-layout-right'
const SIDEBAR_WIDTH_PROPERTY = '--aio-sidebar-width'

@Injectable({ providedIn: 'root' })
export class SidebarService {
    private componentRef: ComponentRef<SidebarComponent> | null = null
    private wrapperEl: HTMLElement | null = null
    private layoutHostEl: HTMLElement | null = null
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

    private get width (): number {
        const width = Number(this.cfg.width)
        if (!Number.isFinite(width) || width <= 0) return DEFAULT_SIDEBAR_WIDTH
        return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
    }

    private get position (): 'left' | 'right' {
        return this.cfg.position === 'right' ? 'right' : 'left'
    }

    initialize (): void {
        if (this.cfg.enabled !== false && this.cfg.sidebarVisible !== false) {
            this.show()
        }
    }

    show (): void {
        if (this.cfg.enabled === false) return
        if (this.isVisible) return
        if (!this.create()) return
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

    applyConfiguration (): void {
        if (this.cfg.enabled === false) {
            if (this.isVisible) {
                this.destroy()
                this.isVisible = false
            }
            return
        }

        if (this.isVisible) {
            this.applyLayout()
        } else if (this.cfg.sidebarVisible !== false) {
            this.show()
        }
    }

    openSshModal (profileId?: string, initialProfile?: any): void {
        const factory = this.cfr.resolveComponentFactory(SshEditModalComponent)
        const ref = factory.create(this.injector)
        if (profileId) {
            ref.instance.profileId = profileId
        }
        if (initialProfile) {
            ref.instance.initialProfile = initialProfile
        }
        this.appRef.attachView(ref.hostView)
        const dom = (ref.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        document.body.appendChild(dom)

        const destroy = () => {
            this.appRef.detachView(ref.hostView)
            ref.destroy()
        }
        ref.instance.saved.subscribe(destroy)
        ref.instance.cancelled.subscribe(destroy)
    }

    openTelnetModal (profileId?: string, initialProfile?: any): void {
        const factory = this.cfr.resolveComponentFactory(TelnetEditModalComponent)
        const ref = factory.create(this.injector)
        if (profileId) {
            ref.instance.profileId = profileId
        }
        if (initialProfile) {
            ref.instance.initialProfile = initialProfile
        }
        this.appRef.attachView(ref.hostView)
        const dom = (ref.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        document.body.appendChild(dom)

        const destroy = () => {
            this.appRef.detachView(ref.hostView)
            ref.destroy()
        }
        ref.instance.saved.subscribe(destroy)
        ref.instance.cancelled.subscribe(destroy)
    }

    openRdpModal (profileId?: string, initialProfile?: any): void {
        const factory = this.cfr.resolveComponentFactory(RdpEditModalComponent)
        const ref = factory.create(this.injector)
        if (profileId) {
            ref.instance.profileId = profileId
        }
        if (initialProfile) {
            ref.instance.initialProfile = initialProfile
        }
        this.appRef.attachView(ref.hostView)
        const dom = (ref.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        document.body.appendChild(dom)

        const destroy = () => {
            this.appRef.detachView(ref.hostView)
            ref.destroy()
        }
        ref.instance.saved.subscribe(destroy)
        ref.instance.cancelled.subscribe(destroy)
    }

    // --- Internal ---

    private create (): boolean {
        const appRoot = document.querySelector('app-root')
        if (!appRoot) return false

        const layoutHost = this.findLayoutHost(appRoot)
        if (!layoutHost) return false

        const factory = this.cfr.resolveComponentFactory(SidebarComponent)
        this.componentRef = factory.create(this.injector)
        this.appRef.attachView(this.componentRef.hostView)

        const dom = (this.componentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement
        const wrapper = document.createElement('div')
        wrapper.className = 'aio-sidebar-wrapper'
        wrapper.appendChild(dom)

        layoutHost.appendChild(wrapper)

        this.layoutHostEl = layoutHost
        this.wrapperEl = wrapper

        this.injectCSS()
        this.applyLayout()

        this.componentRef.instance.sidebarService = this
        return true
    }

    private destroy (): void {
        if (this.componentRef) {
            this.appRef.detachView(this.componentRef.hostView)
            this.componentRef.destroy()
            this.componentRef = null
        }
        if (this.wrapperEl) {
            this.wrapperEl.remove()
            this.wrapperEl = null
        }

        if (this.layoutHostEl) {
            this.layoutHostEl.classList.remove(
                LAYOUT_HOST_CLASS,
                LAYOUT_LEFT_CLASS,
                LAYOUT_RIGHT_CLASS,
            )
            this.layoutHostEl.style.removeProperty(SIDEBAR_WIDTH_PROPERTY)
            this.layoutHostEl = null
        }

        this.removeCSS()
    }

    private applyLayout (): void {
        if (!this.layoutHostEl) return

        const pos = this.position
        this.layoutHostEl.classList.remove(LAYOUT_LEFT_CLASS, LAYOUT_RIGHT_CLASS)
        this.layoutHostEl.classList.add(
            LAYOUT_HOST_CLASS,
            pos === 'left' ? LAYOUT_LEFT_CLASS : LAYOUT_RIGHT_CLASS,
        )
        this.layoutHostEl.style.setProperty(
            SIDEBAR_WIDTH_PROPERTY,
            `clamp(${MIN_SIDEBAR_WIDTH}px, ${this.width}px, 50vw)`,
        )
    }

    private injectCSS (): void {
        document.getElementById(LAYOUT_STYLE_ID)?.remove()

        const style = document.createElement('style')
        style.id = LAYOUT_STYLE_ID
        style.textContent = `
            app-root > .content.${LAYOUT_HOST_CLASS} {
                position: relative !important;
                box-sizing: border-box !important;
                width: 100% !important;
                min-width: 0 !important;
            }

            app-root > .content.${LAYOUT_HOST_CLASS} > .content {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
            }

            app-root > .content.${LAYOUT_LEFT_CLASS} {
                padding-left: var(${SIDEBAR_WIDTH_PROPERTY}) !important;
            }

            app-root > .content.${LAYOUT_RIGHT_CLASS} {
                padding-right: var(${SIDEBAR_WIDTH_PROPERTY}) !important;
            }

            app-root > .content.${LAYOUT_HOST_CLASS} > .aio-sidebar-wrapper {
                position: absolute;
                top: 0;
                bottom: 0;
                width: var(${SIDEBAR_WIDTH_PROPERTY});
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                background: var(--theme-bg, var(--bs-body-bg, #1e1e1e));
                z-index: 999;
            }

            app-root > .content.${LAYOUT_LEFT_CLASS} > .aio-sidebar-wrapper {
                left: 0;
                border-right: 1px solid var(--theme-bg-more-2, var(--bs-border-color, #333));
            }

            app-root > .content.${LAYOUT_RIGHT_CLASS} > .aio-sidebar-wrapper {
                right: 0;
                border-left: 1px solid var(--theme-bg-more-2, var(--bs-border-color, #333));
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
        document.getElementById(LAYOUT_STYLE_ID)?.remove()
    }

    private findLayoutHost (appRoot: Element): HTMLElement | null {
        for (const child of Array.from(appRoot.children)) {
            if (child instanceof HTMLElement && child.classList.contains('content')) {
                return child
            }
        }
        return null
    }

    private saveField (key: string, value: any): void {
        if (!this.config.store[CONFIG_KEY]) {
            this.config.store[CONFIG_KEY] = {}
        }
        this.config.store[CONFIG_KEY][key] = value
        this.config.save()
    }
}
