# QuickClip Organize

A Portent-based dashboard to classify, connect, and track every note through its lifecycle — from raw capture to organized knowledge. Works with any Obsidian note; enhanced with the [QuickClip Chrome extension](#with-the-quickclip-extension).

Read more about Portent [here](https://portent.md/). 

---

## The problem it solves

Capturing is easy. Processing is hard.

Web clips, research notes, and saved articles pile up — unclassified, unconnected, competing for attention indefinitely. **QuickClip Organize** gives you a single dashboard to triage that pile: classify what each thing *is*, connect it to where it *belongs*, and track what's been dealt with versus what still needs attention.

---

## Installation

### From the Community Plugins browser
1. Open Obsidian → Settings → Community plugins
2. Turn off Restricted mode
3. Browse → search **QuickClip Organize** → Install → Enable

### Manual install
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest)
2. Copy them to `.obsidian/plugins/quickclip-organize/` in your vault
3. Settings → Community plugins → enable **QuickClip Organize**

---

## The dashboard

Click the inbox icon in the left ribbon to open the dashboard. It registers as a native Obsidian view — dock it anywhere like Graph view or Backlinks.

### What appears in the dashboard

Any Obsidian note with a `type` frontmatter field set to a Portent type shows up automatically:

```yaml
---
type: Note
belongs_to: "[[My Project]]"
related_to:
  - "[[Research Topic]]"
organized: false
archived: false
---
```

No Dataview, no templates, no configuration required. Add the frontmatter to any note and it appears.

### Tabs

| Tab | What it shows |
|---|---|
| **All Clips** | Every active entry, sortable by title, domain, type, or date |
| **By Domain** | Entries grouped by website domain |
| **By Type** | Entries grouped by Portent type |
| **Archived** | Entries you've archived — hidden from all other views |

### Editable fields

All edits save immediately — no save button.

| Field | How it works |
|---|---|
| **Type** | Dropdown — pick one of the 8 Portent types |
| **Belongs To** | Wikilink chip — search your vault, select a note. Fills the entry's home. |
| **Related To** | Wikilink chips (multi) — lateral connections to related notes |
| **Archive** | Checkbox — hides the entry from active views without deleting it |

### Computed fields (display only)

| Field | What it means |
|---|---|
| **Organized** | Checked when the entry has both a Type and a Belongs To link |
| **Progress** | Three-dot indicator showing Raw → Planning → Organized state |

---

## The Portent type system

Every entry gets classified as one of 8 types, split into two groups:

**PORT — actionable things:**
- **Project** — a bounded outcome with a deadline
- **Operation** — an ongoing process or recurring responsibility
- **Responsibility** — an area you own
- **Task** — a single next action

**ENTP — knowledge records:**
- **Event** — something that happened or will happen
- **Note** — a reference or observation
- **Topic** — a concept, domain, or subject area
- **Person** — someone relevant to your work

Most web captures and research notes are ENTP. Setting a type is the first act of triage — it answers *what kind of thing is this?*

---

## Progress states

Each entry moves through three states, visible as a dot indicator:

| State | Condition | Meaning |
|---|---|---|
| **Raw** ● ○ ○ | No type set, or no connections | Uncategorised — needs triage |
| **Planning** ● ● ○ | Type set + Related To filled, no Belongs To | Connected to known things, not yet placed |
| **Organized** ● ● ● | Type set + Belongs To filled | Placed in its home — feeds active work |

**Organized** (the checkbox) flips automatically when an entry has both a type and a valid Belongs To link. You never set it manually inside the dashboard.

---

## Toolbar controls

- **Show organized** — toggle to include/exclude already-organized entries from active views. Off by default so your view focuses on what still needs attention.
- **Collapse all** — collapse all groups in By Domain and By Type tabs
- **Columns ▾** — show or hide optional columns (Domain, Tags, Clips, Content Type, First Saved, URL, Source, Archive)

---

## Filters

Four filters apply across all tabs:

- **Type** — show only a specific Portent type
- **Progress** — Raw, Planning, or Organized
- **Content** — filter by content type (article, video, tweet, etc.)
- **Date** — Today, Last 7 days, Last 30 days, Last 3 months

Filters are persistent across sessions and combine with AND logic.

---

## Archiving vs. deleting

**Archive** hides an entry from all active views — it moves to the Archived tab. The note and its content are untouched.

Use Archive for: completed research, finished projects, sources you've fully processed, anything you want out of your active views but may want to reference later.

---

## With the QuickClip extension

The [QuickClip Chrome extension](https://chromewebstore.google.com/detail/quickclip/edabdpgppnhbogfpdghjekdalmipflel) adds:

- **Highlight-level captures** — individual highlighted passages from a page, stored with their source heading and position
- **Auto-metadata** — domain, content type, and type are inferred at capture time
- **One entry per URL** — multiple highlights from the same page merge into a single dashboard row
- **Return to source** — title click navigates to the exact heading in your vault where the highlight was saved

Without the extension, the plugin reads only frontmatter — full-page captures and manually tagged notes appear, but highlight-level clips do not.

---

## Standalone usage (no extension)

Tag any note with Portent frontmatter and it appears in the dashboard:

```yaml
---
type: Topic
belongs_to: "[[MOC — PKM]]"
related_to:
  - "[[Zettelkasten]]"
  - "[[Evergreen Notes]]"
---
```

The full classify → connect → track → archive workflow works entirely from frontmatter. The extension is not required.

---

## Tips

- **Filter by Raw + hide organized** — your default working view. Shows only what needs triage.
- **By Type tab** — useful for processing in batches (handle all Notes at once, then all Topics).
- **Belongs To** is the key action. Once filled, the entry is organized and drops out of your default view.
- **Related To** without Belongs To = Planning state. Use it to signal "I know this connects to things, but I haven't placed it yet."
- **Archive aggressively.** If you've processed something and it's no longer competing for attention, archive it. Your active view should only show what matters now.

---

## License

MIT
