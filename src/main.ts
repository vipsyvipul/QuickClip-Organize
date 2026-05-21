import { App, Plugin, WorkspaceLeaf } from 'obsidian'
import { ClipEntry, PORTENT_TYPES, PortentType } from './types'
import { loadJsonEntries, updateJsonEntry } from './data/ClipsStore'
import { loadFrontmatterEntries, updateFrontmatterEntry } from './data/FrontmatterStore'
import { InboxView } from './views/InboxView'
import { AllClipsView } from './views/AllClipsView'
import { ByDomainView } from './views/ByDomainView'
import { ByTypeView } from './views/ByTypeView'

export const VIEW_INBOX = 'quickclip-inbox'
export const VIEW_ALL = 'quickclip-all'
export const VIEW_DOMAIN = 'quickclip-by-domain'
export const VIEW_TYPE = 'quickclip-by-type'

export default class QuickClipPlugin extends Plugin {
    async onload() {
        await this.bootstrap()

        this.registerView(VIEW_INBOX, (leaf) => new InboxView(leaf, this))
        this.registerView(VIEW_ALL, (leaf) => new AllClipsView(leaf, this))
        this.registerView(VIEW_DOMAIN, (leaf) => new ByDomainView(leaf, this))
        this.registerView(VIEW_TYPE, (leaf) => new ByTypeView(leaf, this))

        this.addRibbonIcon('inbox', 'QuickClip Organizer', () => this.activateView(VIEW_INBOX))

        this.addCommand({ id: 'open-inbox', name: 'Open Inbox', callback: () => this.activateView(VIEW_INBOX) })
        this.addCommand({ id: 'open-all', name: 'Open All Clips', callback: () => this.activateView(VIEW_ALL) })
        this.addCommand({ id: 'open-by-domain', name: 'Open By Domain', callback: () => this.activateView(VIEW_DOMAIN) })
        this.addCommand({ id: 'open-by-type', name: 'Open By Type', callback: () => this.activateView(VIEW_TYPE) })
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_INBOX)
        this.app.workspace.detachLeavesOfType(VIEW_ALL)
        this.app.workspace.detachLeavesOfType(VIEW_DOMAIN)
        this.app.workspace.detachLeavesOfType(VIEW_TYPE)
    }

    private async bootstrap() {
        const { adapter } = this.app.vault
        if (!await adapter.exists('.quickclip')) await adapter.mkdir('.quickclip')
        if (!await adapter.exists('.quickclip/clipsHistory.json'))
            await adapter.write('.quickclip/clipsHistory.json', '{}')
    }

    async activateView(viewType: string) {
        const { workspace } = this.app
        const existing = workspace.getLeavesOfType(viewType)[0]
        if (existing) { workspace.revealLeaf(existing); return }

        // Reuse whichever plugin leaf is already open
        const pluginViewTypes = [VIEW_INBOX, VIEW_ALL, VIEW_DOMAIN, VIEW_TYPE]
        let leaf = pluginViewTypes.flatMap(t => workspace.getLeavesOfType(t))[0]
            ?? workspace.getLeaf(false)

        await leaf.setViewState({ type: viewType, active: true })
        workspace.revealLeaf(leaf)
    }

    async loadEntries(): Promise<ClipEntry[]> {
        const [jsonEntries, fmEntries] = await Promise.all([
            loadJsonEntries(this.app),
            loadFrontmatterEntries(this.app),
        ])
        return mergeEntries(jsonEntries, fmEntries, this.app)
    }

    async updateEntry(
        entry: ClipEntry,
        fields: Partial<Pick<ClipEntry, 'type' | 'organized' | 'archived' | 'belongs_to' | 'related_to'>>
    ): Promise<void> {
        if (entry.source === 'frontmatter' && entry.file_path) {
            await updateFrontmatterEntry(this.app, entry.file_path, fields)
        } else if (entry.source === 'both' && entry.file_path) {
            await Promise.all([
                updateJsonEntry(this.app, entry.url, fields),
                updateFrontmatterEntry(this.app, entry.file_path, fields),
            ])
        } else {
            await updateJsonEntry(this.app, entry.url, fields)
        }
    }
}

function mergeEntries(jsonEntries: ClipEntry[], fmEntries: ClipEntry[], app: App): ClipEntry[] {
    const merged = jsonEntries.map((entry) => {
        if (!entry.file_path) return entry

        const cache = app.metadataCache.getFileCache(
            app.vault.getAbstractFileByPath(entry.file_path) as any
        )
        const fm = cache?.frontmatter
        if (!fm || !PORTENT_TYPES.includes(fm.type as any)) return entry

        return {
            ...entry,
            type: fm.type as PortentType,
            organized: fm.organized ?? entry.organized,
            archived: fm.archived ?? entry.archived,
            belongs_to: fm.belongs_to || entry.belongs_to,
            related_to: fm.related_to || entry.related_to,
            source: 'both' as const,
        }
    })

    const coveredPaths = new Set(merged.map((e) => e.file_path).filter(Boolean))

    for (const fmEntry of fmEntries) {
        if (fmEntry.file_path && !coveredPaths.has(fmEntry.file_path)) {
            merged.push(fmEntry)
        }
    }

    return merged
}
