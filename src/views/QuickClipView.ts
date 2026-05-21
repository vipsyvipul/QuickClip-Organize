import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from 'obsidian'
import QuickClipPlugin from '../main'
import { ClipEntry, PORTENT_TYPES, PortentType } from '../types'

export const VIEW_MAIN = 'quickclip-organizer'

type SortKey = 'title' | 'domain' | 'type' | 'last_clipped' | 'organized' | 'clip_count' | 'content_type' | 'first_clipped'
type SortDir = 'asc' | 'desc'

type ColumnKey =
    | 'domain' | 'type' | 'tags' | 'last_clipped' | 'clip_count' | 'content_type' | 'first_clipped' | 'url' | 'source'
    | 'belongs_to' | 'related_to' | 'organized' | 'progress'
interface ColumnDef { key: ColumnKey; label: string; sortKey?: SortKey; alwaysVisible?: boolean }

const ALL_COLUMNS: ColumnDef[] = [
    { key: 'domain',        label: 'Domain',        sortKey: 'domain' },
    { key: 'type',          label: 'Type',           sortKey: 'type' },
    { key: 'tags',          label: 'Tags' },
    { key: 'last_clipped',  label: 'Last Saved',    sortKey: 'last_clipped' },
    { key: 'clip_count',    label: 'Clips',          sortKey: 'clip_count' },
    { key: 'content_type',  label: 'Content Type',   sortKey: 'content_type' },
    { key: 'first_clipped', label: 'First Saved',    sortKey: 'first_clipped' },
    { key: 'url',           label: 'URL' },
    { key: 'source',        label: 'Source' },
    { key: 'belongs_to',    label: 'Belongs To',     alwaysVisible: true },
    { key: 'related_to',    label: 'Related To',     alwaysVisible: true },
    { key: 'organized',     label: 'Organized',      sortKey: 'organized', alwaysVisible: true },
    { key: 'progress',      label: 'Progress',       alwaysVisible: true },
]

export class QuickClipView extends ItemView {
    private plugin: QuickClipPlugin
    private entries: ClipEntry[] = []
    private qcContentEl!: HTMLElement
    private sortKey: SortKey = 'last_clipped'
    private sortDir: SortDir = 'desc'
    private collapsedDomain = new Set<string>()
    private collapsedType = new Set<string>()
    private currentGroupKeys: string[] = []
    private collapseAllLabel!: HTMLLabelElement
    private collapseAllCb!: HTMLInputElement

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf)
        this.plugin = plugin
    }

    getViewType() { return VIEW_MAIN }
    getDisplayText() { return 'QuickClip Organizer' }
    getIcon() { return 'list' }

    async onOpen() {
        const root = this.containerEl.children[1] as HTMLElement
        root.empty()
        root.addClass('qc-container')
        this.renderToolbar(root)
        this.qcContentEl = root.createDiv('qc-content')
        this.registerEvent(
            this.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile && file.path === '.quickclip/clipsHistory.json')
                    this.refresh()
            })
        )
        this.registerEvent(
            this.app.metadataCache.on('changed', (file: TFile) => {
                const isTracked = this.entries.some(e => e.file_path === file.path)
                const raw = this.app.metadataCache.getFileCache(file)?.frontmatter
                const fm = raw ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v])) : {}
                if (isTracked || PORTENT_TYPES.includes(fm.type)) this.refresh()
            })
        )
        await this.refresh()
    }

    async onClose() {}

    async refresh() {
        this.entries = await this.plugin.loadEntries()
        this.rerenderContent()
    }

    private renderToolbar(container: HTMLElement) {
        const toolbar = container.createDiv('qc-toolbar')
        const tabs = [
            { key: 'all' as const, label: 'All Clips' },
            { key: 'domain' as const, label: 'By Domain' },
            { key: 'type' as const, label: 'By Type' },
        ]
        const btns: HTMLButtonElement[] = []
        for (const tab of tabs) {
            const btn = toolbar.createEl('button', {
                text: tab.label,
                cls: 'qc-tab' + (this.plugin.settings.activeTab === tab.key ? ' qc-tab--active' : ''),
            })
            btns.push(btn)
            btn.addEventListener('click', async () => {
                if (this.plugin.settings.activeTab === tab.key) return
                this.plugin.settings.activeTab = tab.key
                await this.plugin.saveSettings()
                btns.forEach((b, i) => b.toggleClass('qc-tab--active', tabs[i].key === tab.key))
                this.collapseAllLabel.style.display = tab.key === 'all' ? 'none' : ''
                this.collapseAllCb.checked = false
                this.rerenderContent()
            })
        }

        const toggleGroup = toolbar.createDiv('qc-toggle-group')

        const toggle = toggleGroup.createEl('label', { cls: 'qc-toggle' })
        const cb = toggle.createEl('input', { type: 'checkbox' })
        cb.checked = this.plugin.settings.showOrganized
        toggle.appendText(' Show organized')
        cb.addEventListener('change', async () => {
            this.plugin.settings.showOrganized = cb.checked
            await this.plugin.saveSettings()
            this.rerenderContent()
        })

        this.collapseAllLabel = toggleGroup.createEl('label', { cls: 'qc-toggle' })
        this.collapseAllLabel.style.display = this.plugin.settings.activeTab === 'all' ? 'none' : ''
        this.collapseAllCb = this.collapseAllLabel.createEl('input', { type: 'checkbox' })
        this.collapseAllLabel.appendText(' Collapse all')
        this.collapseAllCb.addEventListener('change', () => {
            const collapsedSet = this.plugin.settings.activeTab === 'domain' ? this.collapsedDomain : this.collapsedType
            if (this.collapseAllCb.checked) {
                this.currentGroupKeys.forEach(k => collapsedSet.add(k))
            } else {
                collapsedSet.clear()
            }
            this.rerenderContent()
        })

        this.renderColumnPicker(toggleGroup)
    }

    private renderColumnPicker(container: HTMLElement) {
        const wrapper = container.createDiv({ cls: 'qc-col-picker-wrapper' })
        const btn = wrapper.createEl('button', { cls: 'qc-col-picker-btn', text: 'Columns ▾' })
        const panel = wrapper.createDiv({ cls: 'qc-col-picker-panel' })
        panel.style.display = 'none'

        for (const col of ALL_COLUMNS.filter(c => !c.alwaysVisible)) {
            const item = panel.createEl('label', { cls: 'qc-col-picker-item' })
            const cb = item.createEl('input', { type: 'checkbox' })
            cb.checked = this.plugin.settings.visibleColumns.includes(col.key)
            item.appendText(' ' + col.label)
            cb.addEventListener('change', async () => {
                if (cb.checked) {
                    if (!this.plugin.settings.visibleColumns.includes(col.key))
                        this.plugin.settings.visibleColumns.push(col.key)
                } else {
                    this.plugin.settings.visibleColumns = this.plugin.settings.visibleColumns.filter(k => k !== col.key)
                }
                await this.plugin.saveSettings()
                this.rerenderContent()
            })
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const isOpen = panel.style.display !== 'none'
            panel.style.display = isOpen ? 'none' : ''
            if (!isOpen) {
                const close = () => { panel.style.display = 'none'; document.removeEventListener('click', close) }
                document.addEventListener('click', close)
            }
        })
        panel.addEventListener('click', (e) => e.stopPropagation())
    }

    private rerenderContent() {
        this.qcContentEl.empty()
        const filtered = this.entries.filter(
            (e) => !e.archived && (this.plugin.settings.showOrganized || !e.organized)
        )
        switch (this.plugin.settings.activeTab) {
            case 'all': this.renderAllClips(filtered); break
            case 'domain': this.renderByDomain(filtered); break
            case 'type': this.renderByType(filtered); break
        }
    }

    private getOrderedColumns(): ColumnDef[] {
        const order = this.plugin.settings.columnOrder
        if (!order.length) return ALL_COLUMNS
        return [...ALL_COLUMNS].sort((a, b) => {
            const ai = order.indexOf(a.key)
            const bi = order.indexOf(b.key)
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
    }

    private isColVisible(col: ColumnDef): boolean {
        return !!(col.alwaysVisible || this.plugin.settings.visibleColumns.includes(col.key))
    }

    private addSortableHeader(row: HTMLElement, label: string, key: SortKey): HTMLElement {
        const th = row.createEl('th', { text: label, cls: 'qc-sortable' })
        if (key === this.sortKey) {
            th.addClass('qc-sorted')
            th.createSpan({ text: this.sortDir === 'asc' ? ' ↑' : ' ↓' })
        }
        th.addEventListener('click', () => {
            if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
            else { this.sortKey = key; this.sortDir = 'desc' }
            this.rerenderContent()
        })
        return th
    }

    private addDraggableHeader(row: HTMLElement, col: ColumnDef): HTMLElement {
        const th = col.sortKey
            ? this.addSortableHeader(row, col.label, col.sortKey)
            : row.createEl('th', { text: col.label })
        th.draggable = true
        th.addClass('qc-col-draggable')
        th.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('text/plain', col.key)
            e.dataTransfer!.effectAllowed = 'move'
            th.addClass('qc-col-dragging')
        })
        const clearDragClasses = () => {
            th.removeClass('qc-col-drag-before')
            th.removeClass('qc-col-drag-after')
            th.removeClass('qc-col-dragging')
        }
        th.addEventListener('dragend', clearDragClasses)
        th.addEventListener('dragover', (e) => {
            e.preventDefault()
            const mid = th.getBoundingClientRect().left + th.offsetWidth / 2
            th.removeClass('qc-col-drag-before')
            th.removeClass('qc-col-drag-after')
            th.addClass(e.clientX < mid ? 'qc-col-drag-before' : 'qc-col-drag-after')
        })
        th.addEventListener('dragleave', () => {
            th.removeClass('qc-col-drag-before')
            th.removeClass('qc-col-drag-after')
        })
        th.addEventListener('drop', async (e) => {
            e.preventDefault()
            const insertBefore = th.hasClass('qc-col-drag-before')
            clearDragClasses()
            const fromKey = e.dataTransfer!.getData('text/plain') as ColumnKey
            if (!fromKey || fromKey === col.key) return
            const keys = this.getOrderedColumns().map(c => c.key)
            const fromIdx = keys.indexOf(fromKey)
            if (fromIdx === -1) return
            keys.splice(fromIdx, 1)
            const toIdx = keys.indexOf(col.key)
            if (toIdx === -1) return
            keys.splice(insertBefore ? toIdx : toIdx + 1, 0, fromKey)
            this.plugin.settings.columnOrder = keys
            await this.plugin.saveSettings()
            this.rerenderContent()
        })
        return th
    }

    private renderAllClips(entries: ClipEntry[]) {
        const sorted = [...entries].sort((a, b) => this.compareEntries(a, b))
        if (!sorted.length) { this.renderEmptyState(); return }

        const orderedCols = this.getOrderedColumns()
        const table = this.qcContentEl.createEl('table', { cls: 'qc-table' })
        const thead = table.createEl('thead')
        const headerRow = thead.createEl('tr')

        this.addSortableHeader(headerRow, 'Title', 'title')
        for (const col of orderedCols) {
            if (!this.isColVisible(col)) continue
            this.addDraggableHeader(headerRow, col)
        }

        const tbody = table.createEl('tbody')
        for (const entry of sorted) this.renderRow(tbody, entry, orderedCols)
    }

    private compareEntries(a: ClipEntry, b: ClipEntry): number {
        const va = a[this.sortKey]
        const vb = b[this.sortKey]
        if (typeof va === 'boolean' && typeof vb === 'boolean') {
            const n = Number(va) - Number(vb)
            return this.sortDir === 'asc' ? n : -n
        }
        if (typeof va === 'number' && typeof vb === 'number') {
            return this.sortDir === 'asc' ? va - vb : vb - va
        }
        const sa = (va as string) || ''
        const sb = (vb as string) || ''
        return this.sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    }

    private renderByDomain(entries: ClipEntry[]) {
        if (!entries.length) { this.renderEmptyState(); return }
        const groups = new Map<string, ClipEntry[]>()
        for (const entry of entries) {
            const key = entry.domain ? cleanDomain(entry.domain) : '(no domain)'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(entry)
        }
        const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
        this.renderGroupedTable(
            sorted.map(([key, grpEntries]) => ({ key, entries: grpEntries, isPort: null })),
            this.collapsedDomain
        )
    }

    private renderByType(entries: ClipEntry[]) {
        if (!entries.length) { this.renderEmptyState(); return }
        const TYPE_ORDER = ['Project', 'Operation', 'Responsibility', 'Task', 'Event', 'Note', 'Topic', 'Person', 'Untyped']
        const groups = new Map<string, ClipEntry[]>()
        for (const entry of entries) {
            const key = entry.type || 'Untyped'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(entry)
        }
        const ordered = TYPE_ORDER
            .filter(k => groups.has(k))
            .map(k => ({
                key: k,
                entries: groups.get(k)!,
                isPort: ['Project', 'Operation', 'Responsibility', 'Task'].includes(k),
            }))
        this.renderGroupedTable(ordered, this.collapsedType)
    }

    private renderGroupedTable(
        groups: Array<{ key: string; entries: ClipEntry[]; isPort: boolean | null }>,
        collapsedSet: Set<string>
    ) {
        const orderedCols = this.getOrderedColumns()
        const colCount = 1 + orderedCols.filter(c => this.isColVisible(c)).length

        this.currentGroupKeys = groups.map(g => g.key)
        this.collapseAllCb.checked = this.currentGroupKeys.length > 0 &&
            this.currentGroupKeys.every(k => collapsedSet.has(k))
        const table = this.qcContentEl.createEl('table', { cls: 'qc-table' })
        const thead = table.createEl('thead')
        const headerRow = thead.createEl('tr')
        headerRow.createEl('th', { text: 'Title' })
        for (const col of orderedCols) {
            if (!this.isColVisible(col)) continue
            this.addDraggableHeader(headerRow, col)
        }
        const tbody = table.createEl('tbody')

        for (const { key, entries, isPort } of groups) {
            const isCollapsed = collapsedSet.has(key)

            const groupTr = tbody.createEl('tr', { cls: 'qc-group-row' })
            const groupTd = groupTr.createEl('td', { attr: { colspan: String(colCount) }, cls: 'qc-group-cell' })
            const chevron = groupTd.createSpan({ cls: 'qc-group-chevron', text: isCollapsed ? '▶' : '▼' })
            groupTd.createSpan({
                cls: isPort !== null
                    ? `qc-group-label qc-type-badge qc-type-badge--${isPort ? 'port' : 'entp'}`
                    : 'qc-group-label',
                text: key,
            })
            groupTd.createSpan({ cls: 'qc-group-count', text: `${entries.length}` })

            const sorted = [...entries].sort((a, b) => b.last_clipped.localeCompare(a.last_clipped))
            const dataRows = sorted.map(entry => {
                const tr = this.renderRow(tbody, entry, orderedCols)
                if (isCollapsed) tr.style.display = 'none'
                return tr
            })

            groupTr.addEventListener('click', () => {
                if (collapsedSet.has(key)) {
                    collapsedSet.delete(key)
                    chevron.textContent = '▼'
                    dataRows.forEach(r => r.style.display = '')
                } else {
                    collapsedSet.add(key)
                    chevron.textContent = '▶'
                    dataRows.forEach(r => r.style.display = 'none')
                }
            })
        }
    }

    private renderRow(tbody: HTMLElement, entry: ClipEntry, orderedCols: ColumnDef[]): HTMLElement {
        const tr = tbody.createEl('tr', { cls: 'qc-row' })

        // Title — always first, never in orderedCols loop
        const titleTd = tr.createEl('td', { cls: 'qc-cell qc-cell--title' })
        const titleLink = titleTd.createEl('a', { cls: 'qc-title-link' })
        titleLink.textContent = entry.title
        titleLink.addEventListener('click', (e) => { e.preventDefault(); this.openEntry(entry) })

        // Interactive element handles — assigned inside switch, used in event handlers below
        let typeSelect: HTMLSelectElement | null = null
        let belongsInput: HTMLInputElement | null = null
        let relatedInput: HTMLInputElement | null = null
        let organizedCb: HTMLInputElement | null = null
        let progressDots: HTMLElement | null = null

        for (const col of orderedCols) {
            if (!this.isColVisible(col)) continue
            const td = tr.createEl('td', { cls: 'qc-cell' })
            switch (col.key) {
                case 'domain':
                    if (entry.domain) td.createSpan({ cls: 'qc-domain-chip', text: cleanDomain(entry.domain) })
                    break
                case 'type':
                    typeSelect = td.createEl('select', { cls: 'qc-type-select' })
                    typeSelect.createEl('option', { value: '', text: '— type —' })
                    for (const t of PORTENT_TYPES) {
                        const opt = typeSelect.createEl('option', { value: t, text: t })
                        if (entry.type === t) opt.selected = true
                    }
                    break
                case 'tags':
                    td.addClass('qc-cell--tags')
                    for (const tag of entry.tags) td.createSpan({ cls: 'qc-tag-chip', text: tag })
                    break
                case 'last_clipped':
                    td.addClass('qc-cell--date')
                    td.textContent = formatDate(entry.last_clipped)
                    break
                case 'clip_count':
                    td.textContent = String(entry.clip_count ?? 0)
                    break
                case 'content_type':
                    if (entry.content_type) td.createSpan({ cls: 'qc-domain-chip', text: entry.content_type })
                    break
                case 'first_clipped':
                    td.addClass('qc-cell--date')
                    td.textContent = formatDate(entry.first_clipped)
                    break
                case 'url':
                    if (entry.url) {
                        const link = td.createEl('a', { cls: 'qc-url-link', text: '↗' })
                        link.addEventListener('click', (e) => { e.preventDefault(); window.open(entry.url, '_blank') })
                    }
                    break
                case 'source':
                    td.createSpan({ cls: 'qc-domain-chip', text: entry.source })
                    break
                case 'belongs_to':
                    td.addClass('qc-cell--belongs')
                    belongsInput = td.createEl('input', { cls: 'qc-belongs-input', type: 'text', placeholder: '[[note]]' })
                    belongsInput.value = entry.belongs_to
                    break
                case 'related_to':
                    td.addClass('qc-cell--related')
                    relatedInput = td.createEl('input', { cls: 'qc-related-input', type: 'text', placeholder: '[[note]], [[note]]' })
                    relatedInput.value = (entry.related_to ?? []).join(', ')
                    break
                case 'organized':
                    td.addClass('qc-cell--organized')
                    organizedCb = td.createEl('input', { type: 'checkbox' })
                    organizedCb.checked = entry.organized
                    organizedCb.disabled = true
                    break
                case 'progress':
                    td.addClass('qc-cell--progress')
                    progressDots = td.createSpan({ cls: `qc-progress-dots qc-progress-dots--${getProgressState(entry)}` })
                    progressDots.createSpan({ cls: 'qc-progress-dot qc-progress-dot--grey' })
                    progressDots.createSpan({ cls: 'qc-progress-dot qc-progress-dot--amber' })
                    progressDots.createSpan({ cls: 'qc-progress-dot qc-progress-dot--green' })
                    break
            }
        }

        typeSelect?.addEventListener('change', async () => {
            const newType = typeSelect!.value as PortentType
            const organized = !!(newType && entry.belongs_to)
            await this.plugin.updateEntry(entry, { type: newType, organized })
            entry.type = newType
            entry.organized = organized
            if (organizedCb) organizedCb.checked = organized
            if (progressDots) setProgressDots(progressDots, entry)
        })

        if (belongsInput) {
            let belongsDebounce: ReturnType<typeof setTimeout>
            belongsInput.addEventListener('input', () => {
                clearTimeout(belongsDebounce)
                belongsDebounce = setTimeout(async () => {
                    const organized = !!(entry.type && belongsInput!.value)
                    await this.plugin.updateEntry(entry, { belongs_to: belongsInput!.value, organized })
                    entry.belongs_to = belongsInput!.value
                    entry.organized = organized
                    if (organizedCb) organizedCb.checked = organized
                    if (progressDots) setProgressDots(progressDots, entry)
                }, 500)
            })
        }

        if (relatedInput) {
            let relatedDebounce: ReturnType<typeof setTimeout>
            relatedInput.addEventListener('input', () => {
                clearTimeout(relatedDebounce)
                relatedDebounce = setTimeout(async () => {
                    const values = relatedInput!.value.split(',').map(s => s.trim()).filter(Boolean)
                    await this.plugin.updateEntry(entry, { related_to: values })
                    entry.related_to = values
                    if (progressDots) setProgressDots(progressDots, entry)
                }, 500)
            })
        }

        return tr
    }

    private renderEmptyState() {
        const empty = this.qcContentEl.createDiv('qc-empty-state')
        empty.createEl('p', { text: 'No clips yet.' })
        const upsell = empty.createEl('p', { cls: 'qc-upsell' })
        upsell.appendText('Capture web content with the ')
        upsell.createEl('a', { text: 'QuickClip Chrome extension', href: 'https://chrome.google.com/webstore' })
        upsell.appendText(', or add ')
        upsell.createEl('code', { text: 'type:' })
        upsell.appendText(' frontmatter to any note.')
    }

    private async openEntry(entry: ClipEntry) {
        if (entry.file_path) {
            const file = this.app.vault.getAbstractFileByPath(entry.file_path)
            if (file instanceof TFile) {
                if (entry.source === 'frontmatter') {
                    await this.app.workspace.getLeaf(false).openFile(file)
                    return
                }
                const cache = this.app.metadataCache.getFileCache(file)
                const titleClean = entry.title.toLowerCase()
                const match = (cache?.headings ?? []).find((h) => {
                    const display = h.heading.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim().toLowerCase()
                    return display === titleClean
                })
                await this.app.workspace.getLeaf(false).openFile(file, {
                    eState: match ? { line: match.position.start.line } : undefined,
                })
                return
            }
        }
        if (entry.url) this.app.workspace.openLinkText(entry.title, '', false)
    }
}

function getProgressState(entry: ClipEntry): 'raw' | 'planning' | 'organized' {
    if (entry.type && entry.belongs_to) return 'organized'
    if (entry.type && entry.related_to?.length) return 'planning'
    return 'raw'
}

function setProgressDots(dots: HTMLElement, entry: ClipEntry) {
    dots.className = `qc-progress-dots qc-progress-dots--${getProgressState(entry)}`
}

export const DOMAIN_LABELS: Record<string, string> = {
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'twitter.com': 'Twitter',
    'x.com': 'X',
    'github.com': 'GitHub',
    'reddit.com': 'Reddit',
    'medium.com': 'Medium',
    'arxiv.org': 'arXiv',
    'news.ycombinator.com': 'Hacker News',
    'linkedin.com': 'LinkedIn',
    'substack.com': 'Substack',
    'wikipedia.org': 'Wikipedia',
}

export function cleanDomain(domain: string): string {
    const stripped = domain.replace(/^www\./, '')
    return DOMAIN_LABELS[stripped] ?? stripped
}

function formatDate(iso: string): string {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: undefined })
    } catch {
        return ''
    }
}
