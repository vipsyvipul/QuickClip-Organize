import { WorkspaceLeaf } from 'obsidian'
import QuickClipPlugin, { VIEW_TYPE } from '../main'
import { ClipEntry, PortentType } from '../types'
import { BaseView } from './BaseView'

const TYPE_ORDER: (PortentType | 'Untyped')[] = [
    'Project', 'Operation', 'Responsibility', 'Task',
    'Event', 'Note', 'Topic', 'Person',
    'Untyped',
]

export class ByTypeView extends BaseView {
    private collapsed = new Set<string>()

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf, plugin)
    }

    getViewType() { return VIEW_TYPE }
    getDisplayText() { return 'QuickClip — By Type' }
    getIcon() { return 'tag' }

    protected render(container: HTMLElement, entries: ClipEntry[]) {
        this.renderToolbar(container)

        const filtered = entries.filter((e) => !e.archived)
        if (!filtered.length) { this.renderEmptyState(container); return }

        const groups = new Map<string, ClipEntry[]>()
        for (const entry of filtered) {
            const key = entry.type || 'Untyped'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(entry)
        }

        for (const typeKey of TYPE_ORDER) {
            const groupEntries = groups.get(typeKey)
            if (!groupEntries) continue
            this.renderGroup(container, typeKey, groupEntries)
        }
    }

    private renderGroup(container: HTMLElement, typeKey: string, entries: ClipEntry[]) {
        const group = container.createDiv('qc-group')
        const header = group.createDiv('qc-group-header')
        const isCollapsed = this.collapsed.has(typeKey)

        const isPort = ['Project', 'Operation', 'Responsibility', 'Task'].includes(typeKey)
        header.createSpan({ cls: 'qc-group-chevron', text: isCollapsed ? '▶' : '▼' })
        header.createSpan({
            cls: `qc-group-label qc-type-badge qc-type-badge--${isPort ? 'port' : 'entp'}`,
            text: typeKey,
        })
        header.createSpan({ cls: 'qc-group-count', text: `${entries.length}` })

        const body = group.createDiv('qc-group-body')
        if (isCollapsed) body.addClass('qc-group-body--hidden')

        header.addEventListener('click', () => {
            if (this.collapsed.has(typeKey)) {
                this.collapsed.delete(typeKey)
                body.removeClass('qc-group-body--hidden')
                header.querySelector('.qc-group-chevron')!.textContent = '▼'
            } else {
                this.collapsed.add(typeKey)
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
