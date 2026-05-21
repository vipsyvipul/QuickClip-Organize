import { WorkspaceLeaf } from 'obsidian'
import QuickClipPlugin, { VIEW_DOMAIN } from '../main'
import { ClipEntry } from '../types'
import { BaseView, cleanDomain } from './BaseView'

export class ByDomainView extends BaseView {
    private collapsed = new Set<string>()

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf, plugin)
    }

    getViewType() { return VIEW_DOMAIN }
    getDisplayText() { return 'QuickClip — By Domain' }
    getIcon() { return 'globe' }

    protected render(container: HTMLElement, entries: ClipEntry[]) {
        this.renderToolbar(container)

        const filtered = entries.filter((e) => !e.archived && (this.showOrganized || !e.organized))
        if (!filtered.length) { this.renderEmptyState(container); return }

        const groups = new Map<string, ClipEntry[]>()
        for (const entry of filtered) {
            const key = entry.domain ? cleanDomain(entry.domain) : '(no domain)'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(entry)
        }

        const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

        for (const [domain, groupEntries] of sorted) {
            this.renderGroup(container, domain, groupEntries)
        }
    }

    private renderGroup(container: HTMLElement, domain: string, entries: ClipEntry[]) {
        const group = container.createDiv('qc-group')
        const header = group.createDiv('qc-group-header')
        const isCollapsed = this.collapsed.has(domain)

        header.createSpan({ cls: 'qc-group-chevron', text: isCollapsed ? '▶' : '▼' })
        header.createSpan({ cls: 'qc-group-label', text: domain })
        header.createSpan({ cls: 'qc-group-count', text: `${entries.length}` })

        const body = group.createDiv('qc-group-body')
        if (isCollapsed) body.addClass('qc-group-body--hidden')

        header.addEventListener('click', () => {
            if (this.collapsed.has(domain)) {
                this.collapsed.delete(domain)
                body.removeClass('qc-group-body--hidden')
                header.querySelector('.qc-group-chevron')!.textContent = '▼'
            } else {
                this.collapsed.add(domain)
                body.addClass('qc-group-body--hidden')
                header.querySelector('.qc-group-chevron')!.textContent = '▶'
            }
        })

        const table = body.createEl('table', { cls: 'qc-table qc-table--nested' })
        const tbody = table.createEl('tbody')
        const sorted = entries.sort((a, b) => b.last_clipped.localeCompare(a.last_clipped))
        for (const entry of sorted) {
            this.renderRow(tbody, entry)
        }
    }
}
