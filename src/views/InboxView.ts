import { WorkspaceLeaf } from 'obsidian'
import QuickClipPlugin, { VIEW_INBOX } from '../main'
import { ClipEntry } from '../types'
import { BaseView } from './BaseView'

export class InboxView extends BaseView {
    private showOrganized = false

    constructor(leaf: WorkspaceLeaf, plugin: QuickClipPlugin) {
        super(leaf, plugin)
    }

    getViewType() { return VIEW_INBOX }
    getDisplayText() { return 'QuickClip Inbox' }
    getIcon() { return 'inbox' }

    protected render(container: HTMLElement, entries: ClipEntry[]) {
        this.renderInboxToolbar(container)

        const filtered = entries
            .filter((e) => !e.archived && (this.showOrganized || !e.organized))
            .sort((a, b) => b.last_clipped.localeCompare(a.last_clipped))

        const count = entries.filter((e) => !e.archived && !e.organized).length
        const header = container.createDiv('qc-inbox-header')
        header.createEl('span', {
            cls: 'qc-inbox-count',
            text: count === 0 ? 'Inbox clear' : `${count} to organize`,
        })

        this.renderTable(container, filtered)
    }

    private renderInboxToolbar(container: HTMLElement) {
        this.renderToolbar(container)
        const extras = container.querySelector('.qc-toolbar') as HTMLElement
        if (!extras) return

        const toggle = extras.createEl('label', { cls: 'qc-toggle' })
        const cb = toggle.createEl('input', { type: 'checkbox' })
        cb.checked = this.showOrganized
        toggle.appendText(' Show organized')
        cb.addEventListener('change', () => {
            this.showOrganized = cb.checked
            const c = this.containerEl.children[1] as HTMLElement
            c.empty()
            c.addClass('qc-container')
            this.render(c, this.entries)
        })
    }

    protected onAfterTypeChange(entry: ClipEntry) {
        if (entry.organized && !this.showOrganized) {
            this.refresh()
        }
    }
}
