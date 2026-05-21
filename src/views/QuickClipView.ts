import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from 'obsidian'
import QuickClipPlugin from '../main'
import { ClipEntry, PORTENT_TYPES, PortentType } from '../types'

export const VIEW_MAIN = 'quickclip-organizer'

type SortKey = 'title' | 'domain' | 'type' | 'last_clipped'
type SortDir = 'asc' | 'desc'

export class QuickClipView extends ItemView {
    private plugin: QuickClipPlugin
    private entries: ClipEntry[] = []
    private qcContentEl!: HTMLElement
    private sortKey: SortKey = 'last_clipped'
    private sortDir: SortDir = 'desc'
    private collapsedDomain = new Set<string>()
    private collapsedType = new Set<string>()

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
                const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
                if (fm && PORTENT_TYPES.includes(fm.type)) this.refresh()
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
                this.rerenderContent()
            })
        }

        const toggle = toolbar.createEl('label', { cls: 'qc-toggle' })
        const cb = toggle.createEl('input', { type: 'checkbox' })
        cb.checked = this.plugin.settings.showOrganized
        toggle.appendText(' Show organized')
        cb.addEventListener('change', async () => {
            this.plugin.settings.showOrganized = cb.checked
            await this.plugin.saveSettings()
            this.rerenderContent()
        })
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

    private renderAllClips(entries: ClipEntry[]) {
        const sorted = [...entries].sort((a, b) => this.compareEntries(a, b))
        if (!sorted.length) { this.renderEmptyState(); return }

        const table = this.qcContentEl.createEl('table', { cls: 'qc-table' })
        const thead = table.createEl('thead')
        const headerRow = thead.createEl('tr')

        const cols: { label: string; key?: SortKey }[] = [
            { label: 'Title', key: 'title' },
            { label: 'Domain', key: 'domain' },
            { label: 'Type', key: 'type' },
            { label: 'Tags' },
            { label: 'Saved', key: 'last_clipped' },
            { label: 'Organized' },
            { label: 'Belongs To' },
        ]

        for (const col of cols) {
            const th = headerRow.createEl('th', { text: col.label })
            if (col.key) {
                th.addClass('qc-sortable')
                if (col.key === this.sortKey) {
                    th.addClass('qc-sorted')
                    th.createSpan({ text: this.sortDir === 'asc' ? ' ↑' : ' ↓' })
                }
                th.addEventListener('click', () => {
                    if (this.sortKey === col.key) {
                        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
                    } else {
                        this.sortKey = col.key!
                        this.sortDir = 'desc'
                    }
                    this.rerenderContent()
                })
            }
        }

        const tbody = table.createEl('tbody')
        for (const entry of sorted) {
            this.renderRow(tbody, entry)
        }
    }

    private compareEntries(a: ClipEntry, b: ClipEntry): number {
        const va = (a[this.sortKey] as string) || ''
        const vb = (b[this.sortKey] as string) || ''
        return this.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
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
        for (const [domain, groupEntries] of sorted) {
            this.renderGroup(domain, groupEntries, this.collapsedDomain, null)
        }
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
        for (const typeKey of TYPE_ORDER) {
            const groupEntries = groups.get(typeKey)
            if (!groupEntries) continue
            const isPort = ['Project', 'Operation', 'Responsibility', 'Task'].includes(typeKey)
            this.renderGroup(typeKey, groupEntries, this.collapsedType, isPort)
        }
    }

    private renderGroup(key: string, entries: ClipEntry[], collapsedSet: Set<string>, isPort: boolean | null) {
        const group = this.qcContentEl.createDiv('qc-group')
        const header = group.createDiv('qc-group-header')
        const isCollapsed = collapsedSet.has(key)

        header.createSpan({ cls: 'qc-group-chevron', text: isCollapsed ? '▶' : '▼' })
        header.createSpan({
            cls: isPort !== null
                ? `qc-group-label qc-type-badge qc-type-badge--${isPort ? 'port' : 'entp'}`
                : 'qc-group-label',
            text: key,
        })
        header.createSpan({ cls: 'qc-group-count', text: `${entries.length}` })

        const body = group.createDiv('qc-group-body')
        if (isCollapsed) body.addClass('qc-group-body--hidden')

        header.addEventListener('click', () => {
            if (collapsedSet.has(key)) {
                collapsedSet.delete(key)
                body.removeClass('qc-group-body--hidden')
                header.querySelector('.qc-group-chevron')!.textContent = '▼'
            } else {
                collapsedSet.add(key)
                body.addClass('qc-group-body--hidden')
                header.querySelector('.qc-group-chevron')!.textContent = '▶'
            }
        })

        const table = body.createEl('table', { cls: 'qc-table qc-table--nested' })
        const tbody = table.createEl('tbody')
        const sorted = [...entries].sort((a, b) => b.last_clipped.localeCompare(a.last_clipped))
        for (const entry of sorted) {
            this.renderRow(tbody, entry)
        }
    }

    private renderRow(tbody: HTMLElement, entry: ClipEntry) {
        const tr = tbody.createEl('tr', { cls: 'qc-row' })

        const titleTd = tr.createEl('td', { cls: 'qc-cell qc-cell--title' })
        const titleLink = titleTd.createEl('a', { cls: 'qc-title-link' })
        titleLink.textContent = entry.title
        titleLink.addEventListener('click', (e) => { e.preventDefault(); this.openEntry(entry) })

        const domainTd = tr.createEl('td', { cls: 'qc-cell' })
        if (entry.domain) domainTd.createSpan({ cls: 'qc-domain-chip', text: cleanDomain(entry.domain) })

        const typeTd = tr.createEl('td', { cls: 'qc-cell' })
        const typeSelect = typeTd.createEl('select', { cls: 'qc-type-select' })
        typeSelect.createEl('option', { value: '', text: '— type —' })
        for (const t of PORTENT_TYPES) {
            const opt = typeSelect.createEl('option', { value: t, text: t })
            if (entry.type === t) opt.selected = true
        }
        typeSelect.addEventListener('change', async () => {
            const newType = typeSelect.value as PortentType
            const organized = !!newType
            await this.plugin.updateEntry(entry, { type: newType, organized })
            entry.type = newType
            entry.organized = organized
            organizedCb.checked = organized
            tr.toggleClass('qc-row--organized', organized)
        })

        const tagsTd = tr.createEl('td', { cls: 'qc-cell qc-cell--tags' })
        for (const tag of entry.tags) {
            tagsTd.createSpan({ cls: 'qc-tag-chip', text: tag })
        }

        const savedTd = tr.createEl('td', { cls: 'qc-cell qc-cell--date' })
        savedTd.textContent = formatDate(entry.last_clipped)

        const organizedTd = tr.createEl('td', { cls: 'qc-cell qc-cell--organized' })
        const organizedCb = organizedTd.createEl('input', { type: 'checkbox' })
        organizedCb.checked = entry.organized
        organizedCb.disabled = true

        const belongsTd = tr.createEl('td', { cls: 'qc-cell qc-cell--belongs' })
        const belongsInput = belongsTd.createEl('input', {
            cls: 'qc-belongs-input',
            type: 'text',
            placeholder: '[[note]]',
        })
        belongsInput.value = entry.belongs_to
        let debounce: ReturnType<typeof setTimeout>
        belongsInput.addEventListener('input', () => {
            clearTimeout(debounce)
            debounce = setTimeout(async () => {
                await this.plugin.updateEntry(entry, { belongs_to: belongsInput.value })
                entry.belongs_to = belongsInput.value
            }, 500)
        })

        if (entry.organized) tr.addClass('qc-row--organized')
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
