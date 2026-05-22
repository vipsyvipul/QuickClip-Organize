import { App } from 'obsidian'
import { ClipEntry, PortentType, PORTENT_TYPES } from '../types'

const INDEX_PATH = '.quickclip/clipsHistory.json'

let saveQueue: Promise<void> = Promise.resolve()

async function readIndex(app: App): Promise<Record<string, any>> {
    try {
        const raw = await app.vault.adapter.read(INDEX_PATH)
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return parsed
    } catch {
        return {}
    }
}

export async function loadJsonEntries(app: App): Promise<ClipEntry[]> {
    const index = await readIndex(app)
    return Object.entries(index).map(([url, entry]: [string, any]) => {
        const clips: any[] = entry.clips || []
        const tags = Array.from(new Set(
            clips.flatMap((c: any) => c.tags || [])
        )) as string[]

        const filePath = clips.find((c: any) => c.path)?.path

        return {
            url,
            title: entry.title || url,
            domain: entry.domain || (() => { try { return new URL(url).hostname } catch { return '' } })(),
            content_type: entry.content_type || 'article',
            type: (PORTENT_TYPES.includes(entry.type) ? entry.type : '') as PortentType,
            organized: entry.organized ?? false,
            archived: entry.archived ?? false,
            belongs_to: entry.belongs_to || '',
            related_to: entry.related_to || [],
            tags,
            first_clipped: entry.first_clipped || '',
            last_clipped: entry.last_clipped || '',
            clip_count: clips.length,
            source: 'json' as const,
            file_path: filePath,
        }
    })
}

export function updateJsonEntry(
    app: App,
    url: string,
    fields: Partial<Pick<ClipEntry, 'type' | 'organized' | 'archived' | 'belongs_to' | 'related_to'>>
): Promise<void> {
    const op = saveQueue.catch(() => {}).then(async () => {
        const index = await readIndex(app)
        if (!index[url]) return
        Object.assign(index[url], fields)
        await app.vault.adapter.write(INDEX_PATH, JSON.stringify(index, null, 2))
    })
    saveQueue = op
    return op
}
