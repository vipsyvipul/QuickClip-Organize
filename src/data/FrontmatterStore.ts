import { App } from 'obsidian'
import { ClipEntry, PortentType, PORTENT_TYPES } from '../types'

export async function loadFrontmatterEntries(app: App): Promise<ClipEntry[]> {
    const entries: ClipEntry[] = []

    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file)
        const fm = cache?.frontmatter
        if (!fm) continue

        const type = fm.type as string
        if (!PORTENT_TYPES.includes(type as any)) continue

        const tags: string[] = []
        const rawTags = fm.tags
        if (Array.isArray(rawTags)) tags.push(...rawTags.map(String))
        else if (typeof rawTags === 'string') tags.push(rawTags)

        entries.push({
            url: '',
            title: fm.title || file.basename,
            domain: '',
            content_type: '',
            type: type as PortentType,
            organized: fm.organized ?? false,
            archived: fm.archived ?? false,
            belongs_to: fm.belongs_to || '',
            related_to: Array.isArray(fm.related_to) ? fm.related_to : [],
            tags,
            first_clipped: fm.date || '',
            last_clipped: fm.date || '',
            clip_count: 0,
            source: 'frontmatter',
            file_path: file.path,
        })
    }

    return entries
}

export async function updateFrontmatterEntry(
    app: App,
    filePath: string,
    fields: Partial<Pick<ClipEntry, 'type' | 'organized' | 'archived' | 'belongs_to' | 'related_to'>>
): Promise<void> {
    const file = app.vault.getAbstractFileByPath(filePath)
    if (!file || !('extension' in file)) return

    await app.fileManager.processFrontMatter(file as any, (fm) => {
        if (fields.type !== undefined) fm.type = fields.type
        if (fields.organized !== undefined) fm.organized = fields.organized
        if (fields.archived !== undefined) fm.archived = fields.archived
        if (fields.belongs_to !== undefined) fm.belongs_to = fields.belongs_to
        if (fields.related_to !== undefined) fm.related_to = fields.related_to
    })
}
