# QuickClip Organizer — Plugin Codebase Reference

Obsidian plugin that serves as the **organize and archive layer** for QuickClip captures. QuickClip (Chrome extension) handles capture — this plugin handles everything after.

---

## Repo Structure

```
DEV/
  notes/                        ← shared dev notes + test vault (see project-portent-plugin.md)
  QuickClip/                    ← Chrome extension (separate git repo)
  QuickClip-Plugin-OBS/         ← this repo
    src/
      main.ts                   ← plugin entry point, bootstrap, mergeEntries, PluginSettings
      types.ts                  ← ClipEntry interface, PORTENT_TYPES, PortentType
      views/
        QuickClipView.ts        ← single ItemView: persistent toolbar + swappable content area
      data/
        ClipsStore.ts           ← reads/writes clipsHistory.json
        FrontmatterStore.ts     ← scans vault for Portent-tagged notes
    styles.css
    manifest.json
    package.json
    tsconfig.json
    esbuild.config.mjs
```

**View type constant:** `'quickclip-organizer'` — single registered view (`VIEW_MAIN` in `QuickClipView.ts`).

**Plugin settings** (persisted via `loadData`/`saveData` into Obsidian's `data.json`):
- `showOrganized: boolean` — shared across all tabs, default `false`
- `activeTab: 'all' | 'domain' | 'type'` — last active tab, default `'all'`
- `visibleColumns: string[]` — optional columns shown; always-visible columns not listed; default `['type', 'last_clipped']`
- `columnOrder: string[]` — ordered list of ColumnKeys after drag reorder; empty = canonical order
- `filterType: string` — active Portent type filter, or `''`
- `filterProgress: string` — `'raw' | 'planning' | 'organized' | ''`
- `filterContentType: string` — content type filter, or `''`
- `filterDate: string` — `'today' | '7d' | '30d' | '3m' | ''`

---

## What This Plugin Does

Registers a native Obsidian `ItemView` (like Graph view or Backlinks — not a `.md` file, not Dataview). Users install, click one ribbon button, dashboard is live. Zero configuration required.

**Core UX principle:** No setup. No Dataview queries. No extra plugins. Everything built into the plugin's own rendered UI.

**Extension-agnostic:** Plugin works standalone — any Obsidian note with Portent frontmatter appears in the dashboard. The QuickClip extension is not required but adds capture-time intelligence (auto-metadata, type inference at capture, return-to-source). Upsell is ambient: shown in empty state and on entries with no source URL. Never a blocker.

**Initialization:** On `onload()`, plugin silently creates `.quickclip/` folder and empty `clipsHistory.json` if either is missing. No user-facing prompt.

**Field boundary with the extension:** The extension popup exposes no Portent classification fields. Tags are the only exception — content labels, not structural classification. The extension infers and sets `type` at capture (from URL/content_type patterns) so entries have a reasonable default ready. All Portent fields (type, organized, archived, belongs_to, related_to) are editable exclusively in this plugin.

---

## The Dashboard

Each row is a saved **page** (URL), not an individual clip. One row per URL, regardless of how many highlights were saved from it.

Default visible columns: Title · Type · Last Saved · Belongs To · Related To · Organized · Progress

### Editable fields (inline, no save button)

| Field | UI element | Writes to |
|---|---|---|
| Type | `<select>` dropdown — 8 Portent types | `clipsHistory.json` or frontmatter |
| Belongs To | Text input, accepts `[[wikilink]]`, debounced 500ms | `clipsHistory.json` or frontmatter |
| Related To | Text input, accepts comma-separated `[[wikilinks]]`, debounced 500ms | `clipsHistory.json` or frontmatter |
| Organized | Checkbox — display only, disabled; auto-computed from type + belongs_to | — |
| Progress | 3-dot indicator (grey/amber/green) — display only, auto-computed | — |
| Tags | Read-only chips (editing in v1.1) | — |

**Title click behaviour:**
- JSON clips with `file_path` → uses metadata cache to find the heading by line number. The extension saves headings as `## [Title](url)`; the cache stores this as `[Title](url)` so matching strips markdown link syntax before comparing against `entry.title`. Falls back to opening file at top if no match.
- Frontmatter entries → opens the file directly (no heading lookup — the file itself is the content)
- No `file_path` → `openLinkText` with the title (fuzzy vault search)

### Tabs

Single view with three tabs in a persistent toolbar:

| Tab | Description |
|---|---|
| All Clips | Full table, sortable by title / domain / type / date |
| By Domain | Rows grouped by cleaned domain name (see `cleanDomain`) |
| By Type | Rows grouped by Portent type (PORT then ENTP order) |

**Toolbar controls** (rendered once in `onOpen`, never re-rendered):
- Tab pills use `--interactive-accent` / `--text-on-accent` Obsidian variables
- **Show organized** toggle — shared across all tabs, persisted via `plugin.settings.showOrganized`
- **Collapse all** checkbox — visible on By Domain and By Type only; auto-syncs with actual collapsed state (checked when all groups are collapsed); resets on tab switch; groups use inline `tr.style.display` toggling within a single table
- **Columns ▾** button — floating panel listing all non-always-visible columns with checkboxes; selection persisted in `visibleColumns`; columns with `alwaysVisible: true` not listed (always shown)

**Filter bar** (rendered once below toolbar, never re-rendered):
- 4 selects: Type (all Portent types), Progress (raw/planning/organized), Content (dynamic from entries), Date (today/7d/30d/3m)
- All filters persisted in settings, AND logic applied before tab grouping
- Active filter select gets accent border class `qc-filter-select--active`
- "✕ Clear" button visible only when any filter is active

**Tab switching** re-renders only the content area — no data reload, no view recreation. Data reloads only when `clipsHistory.json` changes or a Portent-tagged note's frontmatter is saved.

**Frontmatter keys are normalized to lowercase** before any field lookup — `type`, `Type`, `TYPE` all work. Applied in `FrontmatterStore`, `mergeEntries`, and the metadataCache watcher.

---

## Portent Type System

The 8 types split into two groups:

**PORT (actionable):** Project · Operation · Responsibility · Task

**ENTP (knowledge records):** Event · Note · Topic · Person

Most web clips are ENTP. Default type on first clip from any URL: **Note**.

Portent lifecycle states stored per URL:
- `organized: false` — raw capture or in-progress, visible when "Show organized" is off
- `organized: true` — placed (has `belongs_to`), hidden when "Show organized" is off
- `archived: true` — completed/inactive, never shown in the dashboard

**Three-state progress indicator** (UI only, derived at render time — no stored field):

| State | Condition | Display |
|---|---|---|
| Raw | `type` empty OR both `belongs_to` and `related_to` empty | grey dot only |
| Planning | `type` non-empty, `related_to` non-empty, `belongs_to` empty | grey + amber dots |
| Organized | `type` non-empty AND `belongs_to` non-empty | all three dots |

`related_to` is a lateral connection (peer links). Its presence signals active research — the clip connects to known things but hasn't found its home yet. It does not flip `organized`. The dashboard shows both: a disabled `Organized` checkbox (boolean) and a `Progress` dots indicator (3-state).

Type must be explicitly set (non-empty) for any progress above Raw — a clip with `related_to` but no `type` stays Raw.

---

## Data Sources

**Key principle: `clipsHistory.json` is an index, not a content store.** It holds metadata about what was saved and where. The `.md` file in the vault is always the content source of truth. The plugin reads the index to build the dashboard — it never reads clip content from JSON.

**`.quickclip/` is the shared folder for all QuickClip files in the vault.** The extension creates it on first save. The plugin must store any vault-side files it needs here — no new top-level hidden folders. Current and future files under `.quickclip/`:

| File | Owner | Purpose |
|---|---|---|
| `.quickclip/clipsHistory.json` | Extension (write) + Plugin (read/write) | Clip index |
| `.quickclip/plugin-settings.json` | Plugin | Plugin config if needed in future |

### Primary — `clipsHistory.json`

Location: `.quickclip/clipsHistory.json` in the active Obsidian vault. Written by the extension on capture. Read and written by this plugin for classification fields.

```json
{
  "https://example.com/article": {
    "title": "Page Title",
    "content_type": "article",
    "type": "Note",
    "organized": false,
    "archived": false,
    "belongs_to": "",
    "related_to": [],
    "domain": "example.com",
    "first_clipped": "2026-05-21T10:00:00.000Z",
    "last_clipped": "2026-05-21T10:00:00.000Z",
    "clips": [
      {
        "clip_type": "highlight",
        "hash": "djb2hash",
        "text": "highlighted text",
        "savedAt": "2026-05-21T10:00:00.000Z",
        "path": "Daily Notes/2026-05-21.md",
        "tags": ["#pkm"]
      }
    ]
  }
}
```

**`text` is only present on `clip_type: "highlight"` entries.** Full-page, transcript, tweet, PDF, and image clips store no text in the index — content lives in the `.md` file. The plugin never needs to read `text`; it's only used by `content.js` for browser pre-highlighting.

`clip_type` values: `"highlight"` `"full-page"` `"transcript"` `"tweet"` `"pdf-highlight"` `"image"`

**Fields the plugin owns (reads + writes):**
- `type` — Portent type dropdown
- `organized` — auto-computed: flips `true` when `belongs_to` is non-empty; never set manually
- `archived` — explicit user action
- `belongs_to` — wikilink input; filling this flips `organized` true
- `related_to` — wikilink input; signals active research (Planning state in UI) but does not affect `organized`

**Fields the plugin reads only from JSON (extension writes these):**
- `title`, `content_type`, `domain`, `first_clipped`, `last_clipped`, `clips[]`
- `type` is also set by the extension at capture (inferred from URL/content_type) so Inbox has a reasonable default — same field the user edits, no separate field needed.

**All of these fields are also readable from frontmatter** — any `.md` file can set `url`, `domain`, `content_type`, `first_clipped`, `last_clipped` in its frontmatter and the plugin will pick them up. These are not editable in the plugin UI (read-only from frontmatter). All frontmatter keys are normalized to lowercase before lookup.

### `organized` auto-computation

```typescript
// After every type or belongs_to edit — BOTH must be non-empty:
const organized = !!(entry.type && entry.belongs_to)
```

"Organized" means the clip has a type AND a home. Setting only a type is capture. Setting only `belongs_to` with no type is not yet complete.

The **Progress** state is derived at render time only (never stored):
```typescript
function getProgressState(entry: ClipEntry): 'raw' | 'planning' | 'organized' {
    if (entry.type && entry.belongs_to) return 'organized'
    if (entry.type && entry.related_to?.length) return 'planning'
    return 'raw'
}
```

When `organized` flips `true` and the toggle is off, the row disappears from view immediately on the next re-render. `archived: true` entries never appear regardless of toggle.

### Secondary — Vault frontmatter

Plugin scans the entire vault for any `.md` file with `type` frontmatter set to a Portent type and merges them into the same dashboard. This includes:
- v2.0+ full-page clips and YouTube transcripts saved as individual files by the extension
- Any note the user has manually tagged with a Portent type (extension not required)

If a JSON entry has a `path` pointing to a vault file, frontmatter is authoritative for classification fields (merge rule: JSON for metadata, frontmatter for Portent fields when file exists).

---

## Column System

All columns except Title are defined in `ALL_COLUMNS: ColumnDef[]` in `QuickClipView.ts`.

```typescript
type ColumnKey =
    | 'domain' | 'type' | 'tags' | 'last_clipped' | 'clip_count' | 'content_type' | 'first_clipped' | 'url' | 'source'
    | 'belongs_to' | 'related_to' | 'organized' | 'progress'
interface ColumnDef { key: ColumnKey; label: string; sortKey?: SortKey; alwaysVisible?: boolean }
```

| Key | Label | Always visible | Sortable |
|---|---|---|---|
| `domain` | Domain | — | ✓ |
| `type` | Type | — | ✓ |
| `tags` | Tags | — | — |
| `last_clipped` | Last Saved | — | ✓ |
| `clip_count` | Clips | — | ✓ |
| `content_type` | Content Type | — | ✓ |
| `first_clipped` | First Saved | — | ✓ |
| `url` | URL | — | — |
| `source` | Source | — | — |
| `belongs_to` | Belongs To | ✓ | — |
| `related_to` | Related To | ✓ | — |
| `organized` | Organized | ✓ | ✓ |
| `progress` | Progress | ✓ | — |

**Visibility:** `alwaysVisible` columns always render. Others are hidden unless their key is in `settings.visibleColumns`. The Columns picker only shows non-`alwaysVisible` columns.

**Ordering:** `getOrderedColumns()` sorts `ALL_COLUMNS` by `settings.columnOrder` (list of ColumnKeys). Columns not in the order list sort to the end. Title is never in the column order — it's always first.

**Drag-drop reordering:** Every column header (including always-visible ones) is draggable via HTML5 drag API. On drop, left/right insert position determined by mouse vs column midpoint. Left border = `qc-col-drag-before`, right border = `qc-col-drag-after`. New order saved to `settings.columnOrder` on drop.

---

## Key Obsidian API Patterns

```typescript
// Read clipsHistory.json
const raw = await app.vault.adapter.read('.quickclip/clipsHistory.json')
const index = JSON.parse(raw)

// Write clipsHistory.json
await app.vault.adapter.write('.quickclip/clipsHistory.json', JSON.stringify(index, null, 2))

// Update frontmatter (uses Obsidian's built-in YAML patcher — no manual string manipulation)
await app.fileManager.processFrontMatter(file, (fm) => { fm.type = 'Note' })

// Open a file
const file = app.vault.getAbstractFileByPath('path/to/file.md')
if (file instanceof TFile) await app.workspace.getLeaf(false).openFile(file)

// Scan vault for frontmatter
for (const file of app.vault.getMarkdownFiles()) {
  const cache = app.metadataCache.getFileCache(file)
  const type = cache?.frontmatter?.type
}

// Watch clipsHistory.json for realtime updates (register in onOpen)
this.registerEvent(app.vault.on('modify', (file) => {
  if (file instanceof TFile && file.path === '.quickclip/clipsHistory.json') this.refresh()
}))

// Watch frontmatter changes — only refresh if the changed file has a Portent type
this.registerEvent(app.metadataCache.on('changed', (file) => {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter
  if (fm && PORTENT_TYPES.includes(fm.type)) this.refresh()
}))

// Navigate to heading by line number (more reliable than anchor strings)
// heading text from cache for "## [Title](url)" is "[Title](url)" — strip link syntax to match
const cache = app.metadataCache.getFileCache(file)
const match = (cache?.headings ?? []).find((h) => {
  const display = h.heading.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim().toLowerCase()
  return display === entry.title.toLowerCase()
})
await leaf.openFile(file, { eState: match ? { line: match.position.start.line } : undefined })

// Domain display — cleanDomain() in QuickClipView.ts (exported)
// Strips www. and maps known hostnames to brand names (YouTube, GitHub, etc.)
// By Domain tab groups by cleanDomain(entry.domain) so www.foo.com and foo.com merge

// activateView — single view type, reuse existing leaf
async activateView() {
  const existing = workspace.getLeavesOfType(VIEW_MAIN)[0]
  if (existing) { workspace.revealLeaf(existing); return }
  const leaf = workspace.getLeaf(false)
  await leaf.setViewState({ type: VIEW_MAIN, active: true })
  workspace.revealLeaf(leaf)
}
```

---

## Dev Setup

### Prerequisites
- Node.js

### Install & run
```bash
npm install
npm run dev        # esbuild watches, rebuilds main.js on save
npm run build      # production build
```

### Load in Obsidian

Test vault: `DEV/notes/` — already has Portent-tagged notes for testing frontmatter scanning.

Plugin files are symlinked:
```
DEV/notes/.obsidian/plugins/quickclip-organizer/
  main.js    → symlink to DEV/QuickClip-Plugin-OBS/main.js
  styles.css → symlink to DEV/QuickClip-Plugin-OBS/styles.css
  manifest.json  (copied — only needs updating on version bump)
```

Settings → Community plugins → Turn off restricted mode → enable QuickClip Organizer.

Install **Hot Reload** plugin (by pjeby) — auto-reloads on file change. Or reload manually via DevTools console:
```javascript
app.plugins.disablePlugin('quickclip-organizer').then(() => app.plugins.enablePlugin('quickclip-organizer'))
```

### Dev loop
```
1. npm run dev          ← watching
2. Edit src/            ← make change
3. Save                 ← Hot Reload triggers, plugin reloads
4. Cmd+Option+I         ← DevTools console for errors
5. Interact with panel  ← verify
```

---

## Submission

1. Public GitHub repo with `main.js`, `manifest.json`, `styles.css` as release assets tagged with version
2. Fork `obsidianmd/obsidian-releases`, add entry to `community-plugins.json`, open PR
3. Review: 1–4 weeks. Future updates = new GitHub releases only, no re-submission

```json
{
  "id": "quickclip-organizer",
  "name": "QuickClip Organizer",
  "author": "Vipul Bansal",
  "description": "Organize and archive your QuickClip web captures inside Obsidian.",
  "repo": "yourgithub/QuickClip-Plugin-OBS"
}
```
