export const PORTENT_TYPES = [
    'Note', 'Topic', 'Event', 'Person',
    'Project', 'Operation', 'Responsibility', 'Task',
] as const

export type PortentType = typeof PORTENT_TYPES[number] | ''

export interface ClipEntry {
    url: string
    title: string
    domain: string
    content_type: string
    type: PortentType
    organized: boolean
    archived: boolean
    belongs_to: string
    related_to: string[]
    tags: string[]
    first_clipped: string
    last_clipped: string
    clip_count: number
    source: 'json' | 'frontmatter' | 'both'
    file_path?: string
}
