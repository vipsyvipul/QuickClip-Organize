import { App, Plugin } from 'obsidian'
import { ClipEntry, PORTENT_TYPES, PortentType } from './types'
import { loadJsonEntries, updateJsonEntry } from './data/ClipsStore'
import { loadFrontmatterEntries, updateFrontmatterEntry } from './data/FrontmatterStore'
import { QuickClipView, VIEW_MAIN } from './views/QuickClipView'

interface PluginSettings {
    showOrganized: boolean
    activeTab: 'all' | 'domain' | 'type'
    visibleColumns: string[]
    columnOrder: string[]
}

const DEFAULT_SETTINGS: PluginSettings = {
    showOrganized: false,
    activeTab: 'all',
    visibleColumns: ['type', 'last_clipped'],
    columnOrder: [],
}

export default class QuickClipPlugin extends Plugin {
    settings: PluginSettings = { ...DEFAULT_SETTINGS }

    async onload() {
        this.settings = Object.assign({ ...DEFAULT_SETTINGS }, await this.loadData())
        await this.bootstrap()

        this.registerView(VIEW_MAIN, (leaf) => new QuickClipView(leaf, this))

        this.addRibbonIcon('list', 'QuickClip Organizer', () => this.activateView())

        this.addCommand({ id: 'open', name: 'Open QuickClip Organizer', callback: () => this.activateView() })
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_MAIN)
    }

    private async bootstrap() {
        const { adapter } = this.app.vault
        if (!await adapter.exists('.quickclip')) await adapter.mkdir('.quickclip')
        if (!await adapter.exists('.quickclip/clipsHistory.json'))
            await adapter.write('.quickclip/clipsHistory.json', '{}')
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    async activateView() {
        const { workspace } = this.app
        const existing = workspace.getLeavesOfType(VIEW_MAIN)[0]
        if (existing) { workspace.revealLeaf(existing); return }

        const leaf = workspace.getLeaf(false)
        await leaf.setViewState({ type: VIEW_MAIN, active: true })
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
        const raw = cache?.frontmatter
        if (!raw) return entry
        const fm = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]))
        if (!PORTENT_TYPES.includes(fm.type as any)) return entry

        return {
            ...entry,
            type: fm.type as PortentType,
            organized: fm.organized ?? entry.organized,
            archived: fm.archived ?? entry.archived,
            belongs_to: fm.belongs_to || entry.belongs_to,
            related_to: fm.related_to || entry.related_to,
            url: fm.url || entry.url,
            domain: fm.domain || entry.domain,
            content_type: fm.content_type || entry.content_type,
            first_clipped: fm.first_clipped || entry.first_clipped,
            last_clipped: fm.last_clipped || entry.last_clipped,
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
