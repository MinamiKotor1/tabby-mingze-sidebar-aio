import { Component, OnInit, OnDestroy, HostBinding, Inject, HostListener } from '@angular/core'
import {
    ProfilesService,
    AppService,
    ConfigService,
    TranslateService,
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
    RDPProfile,
} from '../models/interfaces'
import { RdpService } from '../services/rdp.service'

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
                        [class.active]="protocolFilter === 'all'"
                        (click)="setProtocolFilter('all')">All</button>
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
                       [(ngModel)]="filter">
                <button class="btn-add" (click)="openNewRdp()" title="New RDP connection">
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
                                    [description]="getDescription(p)"
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
                        <p>No connections found</p>
                        <small>Create profiles in Tabby settings</small>
                    </div>
                    <div *ngIf="allProfiles.length > 0">
                        <p>No matches found</p>
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

                <!-- Protocol-specific copy commands -->
                <div class="context-menu-item" *ngIf="ctxProfile?.type === 'ssh'" (click)="ctxCopyCommand()">
                    <i class="fas fa-fw fa-terminal"></i><span>Copy SSH Command</span>
                </div>
                <div class="context-menu-item" *ngIf="ctxProfile?.type === 'telnet'" (click)="ctxCopyCommand()">
                    <i class="fas fa-fw fa-terminal"></i><span>Copy Telnet Command</span>
                </div>
                <div class="context-menu-item" *ngIf="ctxProfile?.type === 'rdp'" (click)="ctxCopyCommand()">
                    <i class="fas fa-fw fa-terminal"></i><span>Copy RDP Command</span>
                </div>
                <div class="context-menu-item" *ngIf="ctxProfile?.type === 'rdp'" (click)="ctxExportRdp()">
                    <i class="fas fa-fw fa-file-export"></i><span>Export .rdp File</span>
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
    sortBy: SidebarConfig['sortBy'] = 'name'
    protocolFilter: SidebarConfig['protocolFilter'] = 'all'
    showProtocolBadge = true
    pinnedProfiles: string[] = []
    groupBy: SidebarConfig['groupBy'] = 'group'

    ctxVisible = false
    ctxPos = { x: 0, y: 0 }
    ctxProfile: PartialProfile<Profile> | null = null

    sidebarService: any = null

    private destroy$ = new Subject<void>()
    private configGroups: any[] = []

    constructor (
        private profiles: ProfilesService,
        private app: AppService,
        private config: ConfigService,
        private translate: TranslateService,
        private platform: PlatformService,
        private rdpService: RdpService,
        @Inject(ProfileProvider) private profileProviders: ProfileProvider<Profile>[],
    ) {
        super()
    }

    @HostListener('document:click')
    onDocumentClick (): void { this.ctxVisible = false }

    async ngOnInit (): Promise<void> {
        this.loadConfig()
        this.configGroups = this.config.store.groups || []

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
        this.destroy$.next()
        this.destroy$.complete()
    }

    private loadConfig (): void {
        const cfg = this.config.store[CONFIG_KEY] || {} as Partial<SidebarConfig>
        this.sortBy = cfg.sortBy || 'name'
        this.protocolFilter = cfg.protocolFilter || 'all'
        this.showProtocolBadge = cfg.showProtocolBadge !== false
        this.pinnedProfiles = cfg.pinnedProfiles || []
        this.groupBy = cfg.groupBy || 'group'
    }

    private saveConfigField (key: string, value: any): void {
        if (!this.config.store[CONFIG_KEY]) {
            this.config.store[CONFIG_KEY] = {}
        }
        this.config.store[CONFIG_KEY][key] = value
        this.config.save()
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
        await this.rebuildGroups()
    }

    async rebuildGroups (): Promise<void> {
        await this.sortProfiles()

        let filtered = this.allProfiles
        if (this.protocolFilter !== 'all') {
            filtered = filtered.filter(p => p.type === this.protocolFilter)
        }

        const collapseState = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')

        if (this.groupBy === 'protocol') {
            this.profileGroups = this.buildProtocolGroups(filtered, collapseState)
        } else {
            this.profileGroups = this.buildCustomGroups(filtered, collapseState)
        }
    }

    private buildCustomGroups (profiles: PartialProfile<Profile>[], collapseState: any): ProfileGroup[] {
        const grouped: Record<string, PartialProfile<Profile>[]> = {}
        for (const p of profiles) {
            const gid = p.group || 'ungrouped'
            if (!grouped[gid]) grouped[gid] = []
            grouped[gid].push(p)
        }

        let groups: ProfileGroup[] = Object.entries(grouped).map(([gid, items]) => {
            let name = gid
            if (gid === 'ungrouped') {
                name = 'Ungrouped'
            } else {
                const cg = this.configGroups.find(g => g.id === gid)
                if (cg) name = cg.name
            }
            return { id: gid, name, profiles: items, collapsed: collapseState[gid] ?? false }
        })

        if (this.pinnedProfiles.length > 0) {
            const pinned = profiles.filter(p => p.id && this.pinnedProfiles.includes(p.id))
            if (pinned.length > 0) {
                groups.forEach(g => {
                    g.profiles = g.profiles.filter(p => !p.id || !this.pinnedProfiles.includes(p.id))
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

    private buildProtocolGroups (profiles: PartialProfile<Profile>[], collapseState: any): ProfileGroup[] {
        const grouped: Record<string, PartialProfile<Profile>[]> = {}
        for (const p of profiles) {
            const type = p.type || 'unknown'
            if (!grouped[type]) grouped[type] = []
            grouped[type].push(p)
        }

        let groups: ProfileGroup[] = []
        if (this.pinnedProfiles.length > 0) {
            const pinned = profiles.filter(p => p.id && this.pinnedProfiles.includes(p.id))
            if (pinned.length > 0) {
                for (const key of Object.keys(grouped)) {
                    grouped[key] = grouped[key].filter(p => !p.id || !this.pinnedProfiles.includes(p.id))
                }
                groups.push({
                    id: 'favorites',
                    name: '\u2B50 Favorites',
                    profiles: pinned,
                    collapsed: collapseState['favorites'] ?? false,
                })
            }
        }

        for (const [type, items] of Object.entries(grouped)) {
            if (items.length === 0) continue
            const meta = PROTOCOL_META[type as ProtocolType]
            groups.push({
                id: `proto-${type}`,
                name: meta?.label || type.toUpperCase(),
                profiles: items,
                collapsed: collapseState[`proto-${type}`] ?? false,
            })
        }
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
        if (!this.filter) return true
        return group.profiles.some(p => this.isProfileVisible(p))
    }

    isProfileVisible (profile: PartialProfile<Profile>): boolean {
        if (!this.filter) return true
        const text = (profile.name + '$' + (this.getDescription(profile) ?? '')).toLowerCase()
        return text.includes(this.filter.toLowerCase())
    }

    hasVisibleProfiles (): boolean {
        return this.profileGroups.some(g => this.isGroupVisible(g))
    }

    getGroupVisibleCount (group: ProfileGroup): number {
        if (!this.filter) return group.profiles.length
        return group.profiles.filter(p => this.isProfileVisible(p)).length
    }

    getCountText (): string {
        let profiles = this.allProfiles
        if (this.protocolFilter !== 'all') {
            profiles = profiles.filter(p => p.type === this.protocolFilter)
        }
        const total = profiles.length
        const active = profiles.filter(p => this.isActiveConnection(p)).length
        if (active === 0) return `${total} connection${total !== 1 ? 's' : ''}`
        return `${total} connections (${active} active)`
    }

    // --- Helpers ---

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

    toggleGroupCollapse (group: ProfileGroup): void {
        if (group.profiles.length === 0) return
        group.collapsed = !group.collapsed
        const state = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        state[group.id] = group.collapsed
        window.localStorage.profileGroupCollapsed = JSON.stringify(state)
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

    openNewRdp (): void {
        // Emit event to open RDP edit modal — handled by service
        if (this.sidebarService?.openRdpModal) {
            this.sidebarService.openRdpModal()
        }
    }

    // --- Context Menu ---

    onContextMenu (event: MouseEvent, profile: PartialProfile<Profile>): void {
        event.preventDefault()
        event.stopPropagation()
        this.ctxProfile = profile
        this.ctxPos = { x: event.clientX, y: event.clientY }
        this.ctxVisible = true
    }

    ctxLaunch (): void {
        if (this.ctxProfile) this.launchProfile(this.ctxProfile)
        this.ctxVisible = false
    }

    async ctxEdit (): Promise<void> {
        if (!this.ctxProfile) { this.ctxVisible = false; return }
        const profileName = this.ctxProfile.name
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
        } catch (_) {}
        this.ctxVisible = false
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

    ctxCopyCommand (): void {
        if (!this.ctxProfile) { this.ctxVisible = false; return }
        const p = this.ctxProfile
        let cmd = ''
        if (p.type === 'ssh') {
            const user = p.options?.user || 'root'
            const host = p.options?.host || ''
            const port = p.options?.port || 22
            cmd = `ssh ${user}@${host}${port !== 22 ? ' -p ' + port : ''}`
        } else if (p.type === 'telnet') {
            const host = p.options?.host || ''
            const port = p.options?.port || 23
            cmd = `telnet ${host}${port !== 23 ? ' ' + port : ''}`
        } else if (p.type === 'rdp') {
            const host = p.options?.host || ''
            const port = p.options?.port || 3389
            cmd = `mstsc /v:${host}:${port}`
        }
        if (cmd) this.platform.setClipboard({ text: cmd })
        this.ctxVisible = false
    }

    ctxExportRdp (): void {
        if (!this.ctxProfile || this.ctxProfile.type !== 'rdp') { this.ctxVisible = false; return }
        const content = this.rdpService.generateRdpFileContent(this.ctxProfile as RDPProfile)
        this.platform.setClipboard({ text: content })
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
                p => p.id !== this.ctxProfile!.id,
            )
            await this.config.save()
            await this.refreshProfiles()
        }
        this.ctxVisible = false
    }
}
