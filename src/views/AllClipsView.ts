import { WorkspaceLeaf } from 'obsidian'
import QuickClipPlugin, { VIEW_ALL } from '../main'
import { ClipEntry } from '../types'
import { BaseView } from './BaseView'

type SortKey = 'title' | 'domain' | 'type' | 'last_clipped'
type SortDir = 'asc' | 'desc'

export class AllClipsView extends BaseView {
    private sortKey: SortKey = 'last_clipped'
    private sortDir: SortDir = 'desc'

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf, plugin)
    }

    getViewType() { return VIEW_ALL }
    getDisplayText() { return 'QuickClip — All Clips' }
    getIcon() { return 'list' }

    protected render(container: HTMLElement, entries: ClipEntry[]) {
        this.renderToolbar(container)

        const filtered = entries
            .filter((e) => !e.archived)
            .sort((a, b) => this.compare(a, b))

        if (!filtered.length) {
            this.renderEmptyState(container)
            return
        }

        const table = container.createEl('table', { cls: 'qc-table' })
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
                    const c = this.containerEl.children[1] as HTMLElement
                    c.empty()
                    c.addClass('qc-container')
                    this.render(c, this.entries)
                })
            }
        }

        const tbody = table.createEl('tbody')
        for (const entry of filtered) {
            this.renderRow(tbody, entry)
        }
    }

    private compare(a: ClipEntry, b: ClipEntry): number {
        let va = (a[this.sortKey] as string) || ''
        let vb = (b[this.sortKey] as string) || ''
        return this.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    }
}
