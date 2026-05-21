import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from 'obsidian'
import QuickClipPlugin, { VIEW_INBOX, VIEW_ALL, VIEW_DOMAIN, VIEW_TYPE } from '../main'
import { ClipEntry, PORTENT_TYPES, PortentType } from '../types'

export abstract class BaseView extends ItemView {
    protected plugin: QuickClipPlugin
    protected entries: ClipEntry[] = []

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf)
        this.plugin = plugin
    }

    abstract getViewType(): string
    abstract getDisplayText(): string
    getIcon() { return 'inbox' }

    async onOpen() {
        this.registerEvent(
            this.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile && file.path === '.quickclip/clipsHistory.json') {
                    this.refresh()
                }
            })
        )
        await this.refresh()
    }

    async onClose() {}

    async refresh() {
        this.entries = await this.plugin.loadEntries()
        const container = this.containerEl.children[1] as HTMLElement
        container.empty()
        container.addClass('qc-container')
        this.render(container, this.entries)
    }

    protected abstract render(container: HTMLElement, entries: ClipEntry[]): void

    protected renderToolbar(container: HTMLElement) {
        const toolbar = container.createDiv('qc-toolbar')
        const views = [
            { type: VIEW_INBOX, label: 'Inbox' },
            { type: VIEW_ALL, label: 'All Clips' },
            { type: VIEW_DOMAIN, label: 'By Domain' },
            { type: VIEW_TYPE, label: 'By Type' },
        ]
        for (const v of views) {
            const btn = toolbar.createEl('button', {
                text: v.label,
                cls: 'qc-tab' + (v.type === this.getViewType() ? ' qc-tab--active' : ''),
            })
            if (v.type !== this.getViewType()) {
                btn.addEventListener('click', () => this.plugin.activateView(v.type))
            }
        }
    }

    protected renderTable(container: HTMLElement, entries: ClipEntry[]) {
        if (!entries.length) {
            this.renderEmptyState(container)
            return
        }

        const table = container.createEl('table', { cls: 'qc-table' })
        const thead = table.createEl('thead')
        const headerRow = thead.createEl('tr')
        for (const h of ['Title', 'Domain', 'Type', 'Tags', 'Saved', 'Organized', 'Belongs To']) {
            headerRow.createEl('th', { text: h })
        }

        const tbody = table.createEl('tbody')
        for (const entry of entries) {
            this.renderRow(tbody, entry)
        }
    }

    protected renderRow(tbody: HTMLElement, entry: ClipEntry) {
        const tr = tbody.createEl('tr', { cls: 'qc-row' })

        // Title
        const titleTd = tr.createEl('td', { cls: 'qc-cell qc-cell--title' })
        const titleLink = titleTd.createEl('a', { cls: 'qc-title-link' })
        titleLink.textContent = entry.title
        titleLink.addEventListener('click', (e) => {
            e.preventDefault()
            this.openEntry(entry)
        })

        // Domain
        const domainTd = tr.createEl('td', { cls: 'qc-cell' })
        if (entry.domain) domainTd.createSpan({ cls: 'qc-domain-chip', text: cleanDomain(entry.domain) })

        // Type
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
            this.onAfterTypeChange(entry)
        })

        // Tags
        const tagsTd = tr.createEl('td', { cls: 'qc-cell qc-cell--tags' })
        for (const tag of entry.tags) {
            tagsTd.createSpan({ cls: 'qc-tag-chip', text: tag })
        }

        // Saved
        const savedTd = tr.createEl('td', { cls: 'qc-cell qc-cell--date' })
        savedTd.textContent = formatDate(entry.last_clipped)

        // Organized
        const organizedTd = tr.createEl('td', { cls: 'qc-cell qc-cell--organized' })
        const organizedCb = organizedTd.createEl('input', { type: 'checkbox' })
        organizedCb.checked = entry.organized
        organizedCb.disabled = true

        // Belongs To
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

    protected onAfterTypeChange(_entry: ClipEntry) {}

    protected renderEmptyState(container: HTMLElement) {
        const empty = container.createDiv('qc-empty-state')
        empty.createEl('p', { text: 'No clips yet.' })
        const upsell = empty.createEl('p', { cls: 'qc-upsell' })
        upsell.appendText('Capture web content with the ')
        upsell.createEl('a', {
            text: 'QuickClip Chrome extension',
            href: 'https://chrome.google.com/webstore',
        })
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
                    eState: match ? { line: match.position.start.line } : undefined
                })
                return
            }
        }
        if (entry.url) {
            this.app.workspace.openLinkText(entry.title, '', false)
        }
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
        const d = new Date(iso)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: undefined })
    } catch {
        return ''
    }
}
