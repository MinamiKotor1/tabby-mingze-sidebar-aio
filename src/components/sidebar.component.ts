import { Component, OnInit, OnDestroy, HostBinding, Inject, HostListener } from '@angular/core'
import {
    ProfilesService,
    AppService,
    ConfigService,
    TranslateService,
    NotificationsService,
    Profile,
    PartialProfile,
    ProfileProvider,
    BaseComponent,
    PlatformService,
} from 'tabby-core'
import { Subject } from 'rxjs'
import { takeUntil, debounceTime } from 'rxjs/operators'
import deepClone from 'clone-deep'
import {
    CONFIG_KEY,
    PROTOCOL_META,
    SUPPORTED_PROTOCOLS,
    ProtocolType,
    SidebarConfig,
} from '../models/interfaces'

interface ProfileGroup {
    id: string
    name: string
    profiles: PartialProfile<Profile>[]
    collapsed: boolean
}

@Component({
    selector: 'aio-sidebar',
    styles: [require('./sidebar.component.scss')],
    template: `
        <div class="sidebar-container">
            <!-- Header -->
            <div class="sidebar-header">
                <span class="sidebar-title">Connections</span>
                <button class="btn-close-sidebar" (click)="closeSidebar()" title="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Protocol filter tabs -->
            <div class="protocol-tabs">
                <button class="protocol-tab"
                        [class.active]="protocolFilter === 'ssh'"
                        (click)="setProtocolFilter('ssh')">SSH</button>
                <button class="protocol-tab"
                        [class.active]="protocolFilter === 'telnet'"
                        (click)="setProtocolFilter('telnet')">Tel</button>
                <button class="protocol-tab"
                        [class.active]="protocolFilter === 'rdp'"
                        (click)="setProtocolFilter('rdp')">RDP</button>
            </div>

            <!-- Search + Add -->
            <div class="sidebar-search-bar">
                <input class="search-input"
                       type="search"
                       placeholder="Search..."
                       [ngModel]="filter"
                       (ngModelChange)="onFilterChange($event)">
                <button class="btn-add" (click)="openNewConnection()" title="New connection">
                    <i class="fas fa-plus"></i>
                </button>
            </div>

            <!-- Sort bar -->
            <div class="sidebar-sort-bar">
                <span class="sort-label">{{ getCountText() }}</span>
                <div class="sort-options">
                    <button class="sort-btn" [class.active]="sortBy==='name'" (click)="setSortOrder('name')">Name</button>
                    <button class="sort-btn" [class.active]="sortBy==='host'" (click)="setSortOrder('host')">Host</button>
                    <button class="sort-btn" [class.active]="sortBy==='recent'" (click)="setSortOrder('recent')">Recent</button>
                    <button class="sort-btn" [class.active]="sortBy==='type'" (click)="setSortOrder('type')">Type</button>
                </div>
            </div>

            <!-- Profile list -->
            <div class="sidebar-list">
                <ng-container *ngFor="let group of profileGroups">
                    <ng-container *ngIf="isGroupVisible(group)">
                        <div class="group-header" (click)="toggleGroupCollapse(group)">
                            <i class="fas fa-chevron-down group-chevron"
                               [class.collapsed]="group.collapsed"
                               *ngIf="group.profiles.length > 0"></i>
                            <span class="group-name">{{ group.name }}</span>
                            <span class="group-badge">{{ getGroupVisibleCount(group) }}</span>
                        </div>
                        <ng-container *ngIf="!group.collapsed">
                            <ng-container *ngFor="let p of group.profiles">
                                <connection-item
                                    *ngIf="isProfileVisible(p)"
                                    [profile]="p"
                                    [description]="getCachedDescription(p)"
                                    [active]="isActiveConnection(p)"
                                    [showBadge]="showProtocolBadge"
                                    (launch)="launchProfile(p)"
                                    (contextMenu)="onContextMenu($event, p)">
                                </connection-item>
                            </ng-container>
                        </ng-container>
                    </ng-container>
                </ng-container>

                <!-- Empty state -->
                <div *ngIf="!hasVisibleProfiles()" class="sidebar-empty">
                    <div *ngIf="allProfiles.length === 0">
                        <i class="fas fa-server empty-icon"></i>
                        <p>No connections</p>
                        <small>Create profiles in Settings</small>
                    </div>
                    <div *ngIf="allProfiles.length > 0">
                        <i class="fas fa-search empty-icon"></i>
                        <p>No matches</p>
                        <small>Try a different filter</small>
                    </div>
                </div>
            </div>

            <!-- Context menu -->
            <div class="context-menu"
                 *ngIf="ctxVisible"
                 [style.left.px]="ctxPos.x"
                 [style.top.px]="ctxPos.y">

                <div class="context-menu-item" (click)="ctxLaunch()">
                    <i class="fas fa-fw fa-play"></i><span>Launch</span>
                </div>
                <div class="context-menu-item" (click)="ctxEdit()">
                    <i class="fas fa-fw fa-edit"></i><span>Edit</span>
                </div>
                <div class="context-menu-item" (click)="ctxDuplicate()">
                    <i class="fas fa-fw fa-copy"></i><span>Duplicate</span>
                </div>

                <div class="context-menu-divider"></div>

                <div class="context-menu-item"
                     *ngIf="ctxProfile?.id && !isProfilePinned(ctxProfile)"
                     (click)="ctxPin()">
                    <i class="fas fa-fw fa-thumbtack"></i><span>Pin to Favorites</span>
                </div>
                <div class="context-menu-item"
                     *ngIf="ctxProfile?.id && isProfilePinned(ctxProfile)"
                     (click)="ctxUnpin()">
                    <i class="fas fa-fw fa-thumbtack" style="transform:rotate(45deg)"></i><span>Unpin</span>
                </div>

                <div class="context-menu-divider"></div>

                <div class="context-menu-item danger"
                     *ngIf="ctxProfile && !ctxProfile.isBuiltin"
                     (click)="ctxDelete()">
                    <i class="fas fa-fw fa-trash-alt"></i><span>Delete</span>
                </div>
            </div>
        </div>
    `,
})
export class SidebarComponent extends BaseComponent implements OnInit, OnDestroy {
    @HostBinding('class.aio-sidebar') hostClass = true

    allProfiles: PartialProfile<Profile>[] = []
    profileGroups: ProfileGroup[] = []
    filter = ''
    filterTerm = ''
    sortBy: SidebarConfig['sortBy'] = 'name'
    protocolFilter: SidebarConfig['protocolFilter'] = 'ssh'
    showProtocolBadge = true
    pinnedProfiles: string[] = []
    groupBy: SidebarConfig['groupBy'] = 'group'

    ctxVisible = false
    ctxPos = { x: 0, y: 0 }
    ctxProfile: PartialProfile<Profile> | null = null

    sidebarService: any = null

    private destroy$ = new Subject<void>()
    private filter$ = new Subject<string>()
    private configGroups: any[] = []
    private searchIndex = new Map<string, string>()
    private descriptionCache = new Map<string, string | null>()
    private pendingSave: any = null

    constructor (
        private profiles: ProfilesService,
        private app: AppService,
        private config: ConfigService,
        private translate: TranslateService,
        private platform: PlatformService,
        private notifications: NotificationsService,
        @Inject(ProfileProvider) private profileProviders: ProfileProvider<Profile>[],
    ) {
        super()
    }

    @HostListener('document:click')
    onDocumentClick (): void { this.ctxVisible = false }

    async ngOnInit (): Promise<void> {
        this.loadConfig()
        this.configGroups = this.config.store.groups || []

        this.filter$.pipe(
            takeUntil(this.destroy$),
            debounceTime(150),
        ).subscribe(term => {
            this.filterTerm = term.toLowerCase()
        })

        await this.refreshProfiles()

        this.config.changed$.pipe(
            takeUntil(this.destroy$),
            debounceTime(300),
        ).subscribe(async () => {
            this.loadConfig()
            this.configGroups = this.config.store.groups || []
            await this.refreshProfiles()
        })
    }

    ngOnDestroy (): void {
        if (this.pendingSave) {
            clearTimeout(this.pendingSave)
            this.config.save()
        }
        this.destroy$.next()
        this.destroy$.complete()
    }

    onFilterChange (value: string): void {
        this.filter = value
        this.filter$.next(value)
    }

    private loadConfig (): void {
        const cfg = this.config.store[CONFIG_KEY] || {} as Partial<SidebarConfig>
        this.sortBy = cfg.sortBy || 'name'
        const savedFilter = cfg.protocolFilter
        this.protocolFilter = savedFilter === 'ssh' || savedFilter === 'telnet' || savedFilter === 'rdp'
            ? savedFilter
            : 'ssh'
        this.showProtocolBadge = cfg.showProtocolBadge !== false
        this.pinnedProfiles = cfg.pinnedProfiles || []
        this.groupBy = cfg.groupBy || 'group'
    }

    private saveConfigField (key: string, value: any): void {
        if (!this.config.store[CONFIG_KEY]) {
            this.config.store[CONFIG_KEY] = {}
        }
        this.config.store[CONFIG_KEY][key] = value
        if (this.pendingSave) clearTimeout(this.pendingSave)
        this.pendingSave = setTimeout(() => {
            this.config.save()
            this.pendingSave = null
        }, 200)
    }

    async refreshProfiles (): Promise<void> {
        const all = await this.profiles.getProfiles()
        this.allProfiles = all.filter(p => {
            if (!SUPPORTED_PROTOCOLS.includes(p.type as ProtocolType)) return false
            if (p.isTemplate) return false
            if (p.type === 'ssh' && !p.options?.host) return false
            if (p.type === 'telnet' && !p.options?.host) return false
            if (p.type === 'rdp' && !p.options?.host) return false
            return true
        })
        this.rebuildSearchIndex()
        await this.rebuildGroups()
    }

    private rebuildSearchIndex (): void {
        this.searchIndex.clear()
        this.descriptionCache.clear()
        for (const p of this.allProfiles) {
            const desc = this.getDescription(p)
            const key = p.id || p.name
            this.descriptionCache.set(key, desc)
            this.searchIndex.set(key, (p.name + ' ' + (desc ?? '')).toLowerCase())
        }
    }

    async rebuildGroups (): Promise<void> {
        await this.sortProfiles()

        const filtered = this.allProfiles.filter(p => p.type === this.protocolFilter)

        const collapseState = this.loadCollapseState()

        if (this.groupBy === 'protocol') {
            this.profileGroups = this.buildGroups(filtered, collapseState, p => {
                const type = p.type || 'unknown'
                const meta = PROTOCOL_META[type as ProtocolType]
                return { id: `proto-${type}`, name: meta?.label || type.toUpperCase() }
            })
        } else {
            this.profileGroups = this.buildGroups(filtered, collapseState, p => {
                const gid = p.group || 'ungrouped'
                if (gid === 'ungrouped') return { id: gid, name: 'Ungrouped' }
                const cg = this.configGroups.find(g => g.id === gid)
                return { id: gid, name: cg?.name || gid }
            })
        }
    }

    private buildGroups (
        profiles: PartialProfile<Profile>[],
        collapseState: Record<string, boolean>,
        classifier: (p: PartialProfile<Profile>) => { id: string, name: string },
    ): ProfileGroup[] {
        const grouped: Record<string, { name: string, profiles: PartialProfile<Profile>[] }> = {}
        for (const p of profiles) {
            const { id, name } = classifier(p)
            if (!grouped[id]) grouped[id] = { name, profiles: [] }
            grouped[id].profiles.push(p)
        }

        let groups: ProfileGroup[] = Object.entries(grouped).map(([id, g]) => ({
            id,
            name: g.name,
            profiles: g.profiles,
            collapsed: collapseState[id] ?? false,
        }))

        if (this.pinnedProfiles.length > 0) {
            const pinned = profiles.filter(p => p.id && this.pinnedProfiles.includes(p.id))
            if (pinned.length > 0) {
                const pinnedSet = new Set(this.pinnedProfiles)
                groups.forEach(g => {
                    g.profiles = g.profiles.filter(p => !p.id || !pinnedSet.has(p.id))
                })
                groups.unshift({
                    id: 'favorites',
                    name: '\u2B50 Favorites',
                    profiles: pinned,
                    collapsed: collapseState['favorites'] ?? false,
                })
            }
        }

        groups = groups.filter(g => g.profiles.length > 0)
        groups.sort((a, b) => {
            if (a.id === 'favorites') return -1
            if (b.id === 'favorites') return 1
            if (a.id === 'ungrouped') return 1
            if (b.id === 'ungrouped') return -1
            return a.name.localeCompare(b.name)
        })
        return groups
    }

    async sortProfiles (): Promise<void> {
        if (this.sortBy === 'recent') {
            const recent = await this.profiles.getRecentProfiles()
            const ids = recent.map(p => p.id)
            this.allProfiles.sort((a, b) => {
                const aAct = this.isActiveConnection(a)
                const bAct = this.isActiveConnection(b)
                if (aAct && !bAct) return -1
                if (!aAct && bAct) return 1
                const ai = ids.indexOf(a.id)
                const bi = ids.indexOf(b.id)
                if (ai !== -1 && bi !== -1) return ai - bi
                if (ai !== -1) return -1
                if (bi !== -1) return 1
                return a.name.localeCompare(b.name)
            })
        } else if (this.sortBy === 'type') {
            const order: Record<string, number> = { ssh: 0, telnet: 1, rdp: 2 }
            this.allProfiles.sort((a, b) => {
                const ta = order[a.type] ?? 99
                const tb = order[b.type] ?? 99
                if (ta !== tb) return ta - tb
                return a.name.localeCompare(b.name)
            })
        } else {
            this.allProfiles.sort((a, b) => {
                if (this.sortBy === 'host') {
                    return (a.options?.host || '').localeCompare(b.options?.host || '')
                }
                return a.name.localeCompare(b.name)
            })
        }
    }

    setProtocolFilter (f: SidebarConfig['protocolFilter']): void {
        this.protocolFilter = f
        this.saveConfigField('protocolFilter', f)
        this.rebuildGroups()
    }

    async setSortOrder (s: SidebarConfig['sortBy']): Promise<void> {
        this.sortBy = s
        this.saveConfigField('sortBy', s)
        await this.rebuildGroups()
    }

    isGroupVisible (group: ProfileGroup): boolean {
        if (!this.filterTerm) return true
        return group.profiles.some(p => this.isProfileVisible(p))
    }

    isProfileVisible (profile: PartialProfile<Profile>): boolean {
        if (!this.filterTerm) return true
        const key = profile.id || profile.name
        const text = this.searchIndex.get(key)
        return text ? text.includes(this.filterTerm) : true
    }

    hasVisibleProfiles (): boolean {
        return this.profileGroups.some(g => this.isGroupVisible(g))
    }

    getGroupVisibleCount (group: ProfileGroup): number {
        if (!this.filterTerm) return group.profiles.length
        return group.profiles.filter(p => this.isProfileVisible(p)).length
    }

    getCountText (): string {
        const profiles = this.allProfiles.filter(p => p.type === this.protocolFilter)
        const total = profiles.length
        const active = profiles.filter(p => this.isActiveConnection(p)).length
        if (active === 0) return `${total} connection${total !== 1 ? 's' : ''}`
        return `${total} connections (${active} active)`
    }

    // --- Helpers ---

    getCachedDescription (profile: PartialProfile<Profile>): string | null {
        const key = profile.id || profile.name
        if (this.descriptionCache.has(key)) {
            return this.descriptionCache.get(key)!
        }
        return this.getDescription(profile)
    }

    getDescription (profile: PartialProfile<Profile>): string | null {
        if (this.profiles.getDescription) {
            return this.profiles.getDescription(profile)
        }
        const opts = profile.options
        if (!opts) return null
        if (profile.type === 'ssh') {
            const u = opts.user || 'root'
            const h = opts.host || ''
            const p = opts.port || 22
            return `${u}@${h}${p !== 22 ? ':' + p : ''}`
        }
        if (profile.type === 'telnet') {
            const h = opts.host || ''
            const p = opts.port || 23
            return `${h}${p !== 23 ? ':' + p : ''}`
        }
        if (profile.type === 'rdp') {
            const u = opts.username || ''
            const h = opts.host || ''
            const p = opts.port || 3389
            const prefix = u ? `${u}@` : ''
            return `${prefix}${h}${p !== 3389 ? ':' + p : ''}`
        }
        return null
    }

    isActiveConnection (profile: PartialProfile<Profile>): boolean {
        return this.app.tabs.some(tab => {
            const tp = (tab as any).profile
            return tp && tp.id === profile.id
        })
    }

    isProfilePinned (profile: PartialProfile<Profile>): boolean {
        return profile.id ? this.pinnedProfiles.includes(profile.id) : false
    }

    private loadCollapseState (): Record<string, boolean> {
        try {
            return JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        } catch {
            return {}
        }
    }

    private saveCollapseState (state: Record<string, boolean>): void {
        try {
            window.localStorage.profileGroupCollapsed = JSON.stringify(state)
        } catch {
            // Storage full or unavailable.
        }
    }

    toggleGroupCollapse (group: ProfileGroup): void {
        if (group.profiles.length === 0) return
        group.collapsed = !group.collapsed
        const state = this.loadCollapseState()
        state[group.id] = group.collapsed
        this.saveCollapseState(state)
    }

    launchProfile (profile: PartialProfile<Profile>): void {
        if (this.profiles.openNewTabForProfile) {
            this.profiles.openNewTabForProfile(profile)
        } else {
            (this.profiles as any).launchProfile(profile)
        }
    }

    closeSidebar (): void {
        if (this.sidebarService) {
            this.sidebarService.hide()
        }
    }

    async openNewConnection (): Promise<void> {
        if (this.protocolFilter === 'rdp') {
            if (this.sidebarService?.openRdpModal) {
                this.sidebarService.openRdpModal()
            }
            return
        }

        if (this.protocolFilter === 'ssh') {
            if (this.sidebarService?.openSshModal) {
                this.sidebarService.openSshModal()
            }
            return
        }

        await this.openProfilesSettings('telnet')
    }

    // --- Context Menu ---

    onContextMenu (event: MouseEvent, profile: PartialProfile<Profile>): void {
        event.preventDefault()
        event.stopPropagation()
        this.ctxProfile = profile
        this.ctxPos = { x: event.clientX, y: event.clientY }
        this.ctxVisible = true

        setTimeout(() => {
            const menu = document.querySelector('.context-menu') as HTMLElement
            if (!menu) return
            const rect = menu.getBoundingClientRect()
            const pad = 4
            let { x, y } = this.ctxPos
            if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - pad
            if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - pad
            if (x < pad) x = pad
            if (y < pad) y = pad
            this.ctxPos = { x, y }
        })
    }

    ctxLaunch (): void {
        if (this.ctxProfile) this.launchProfile(this.ctxProfile)
        this.ctxVisible = false
    }

    async ctxEdit (): Promise<void> {
        if (!this.ctxProfile) { this.ctxVisible = false; return }

        if (this.ctxProfile.type === 'rdp') {
            if (this.sidebarService?.openRdpModal) {
                this.sidebarService.openRdpModal(this.ctxProfile.id, this.ctxProfile)
            }
            this.ctxVisible = false
            return
        }

        if (this.ctxProfile.type === 'ssh') {
            if (this.sidebarService?.openSshModal) {
                this.sidebarService.openSshModal(this.ctxProfile.id, this.ctxProfile)
            }
            this.ctxVisible = false
            return
        }

        const profileName = this.ctxProfile.name
        if (!await this.openProfilesSettings()) {
            this.ctxVisible = false
            return
        }

        await new Promise(r => setTimeout(r, 500))
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 200))
            const elements = document.querySelectorAll('.list-group-item.ps-5')
            for (const el of Array.from(elements)) {
                const nameEl = el.querySelector('.no-wrap')
                if (nameEl?.textContent?.trim() === profileName) {
                    (nameEl as HTMLElement).click()
                    this.ctxVisible = false
                    return
                }
            }
        }
        this.ctxVisible = false
    }

    private async openProfilesSettings (protocol?: 'telnet'): Promise<boolean> {
        try {
            const { SettingsTabComponent } = window['nodeRequire']('tabby-settings')
            const existing = this.app.tabs.find(tab => tab instanceof SettingsTabComponent)
            if (existing) {
                this.app.selectTab(existing)
                const sc = existing as any
                if (sc.activeTab !== 'profiles') sc.activeTab = 'profiles'
            } else {
                this.app.openNewTabRaw({ type: SettingsTabComponent, inputs: { activeTab: 'profiles' } })
            }

            if (protocol) {
                const label = PROTOCOL_META[protocol].label
                this.notifications.info(`Use Settings > Profiles > New profile to create a ${label} connection.`)
            }
            return true
        } catch (err) {
            this.notifications.error(`Failed to open profile editor: ${err}`)
            return false
        }
    }

    async ctxDuplicate (): Promise<void> {
        if (!this.ctxProfile) { this.ctxVisible = false; return }
        const clone: PartialProfile<Profile> = deepClone(this.ctxProfile)
        delete clone.id
        clone.name = this.translate.instant('{name} copy', this.ctxProfile)
        clone.isBuiltin = false
        clone.isTemplate = false
        this.config.store.profiles = this.config.store.profiles || []
        this.config.store.profiles.push(clone)
        await this.config.save()
        await this.refreshProfiles()
        this.ctxVisible = false
    }

    async ctxPin (): Promise<void> {
        if (!this.ctxProfile?.id) { this.ctxVisible = false; return }
        if (!this.pinnedProfiles.includes(this.ctxProfile.id)) {
            this.pinnedProfiles.push(this.ctxProfile.id)
            this.saveConfigField('pinnedProfiles', this.pinnedProfiles)
            await this.rebuildGroups()
        }
        this.ctxVisible = false
    }

    async ctxUnpin (): Promise<void> {
        if (!this.ctxProfile?.id) { this.ctxVisible = false; return }
        this.pinnedProfiles = this.pinnedProfiles.filter(id => id !== this.ctxProfile!.id)
        this.saveConfigField('pinnedProfiles', this.pinnedProfiles)
        await this.rebuildGroups()
        this.ctxVisible = false
    }

    async ctxDelete (): Promise<void> {
        if (!this.ctxProfile || this.ctxProfile.isBuiltin) { this.ctxVisible = false; return }
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: this.translate.instant('Delete "{name}"?', this.ctxProfile),
            buttons: [this.translate.instant('Delete'), this.translate.instant('Cancel')],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response === 0) {
            this.config.store.profiles = this.config.store.profiles.filter(
                (p: any) => p.id !== this.ctxProfile!.id,
            )
            await this.config.save()
            await this.refreshProfiles()
        }
        this.ctxVisible = false
    }
}
