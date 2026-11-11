# Legacy behaviour spec (summary of the pre-rebuild vanilla JS app)

Kept as the behavioural reference for the rebuild after `legacy/` is deleted.

## Data
- Note `{id, title, body(html), category|null, tags[], pinned, created, updated, archived?}`; ids `Date.now().toString(36)+random`.
- Category `{id, name(<=30), color, order, archived?}`. Defaults: Personal `#5b6cff`, Work `#ff9f0a`, Ideas `#34c759`.
- Tags are not entities: union of every note's tags.
- JSON export `{version:2, exported:ISO, categories:[...], notes:[...]}`, file `notes-file.json`.
- Accents: Indigo `#5b6cff`, Blue `#007aff` (default), Purple `#af52de`, Pink `#e91e8c`, Teal `#00c7be`, Green `#34c759`, Orange `#ff9f0a`, Red `#ff453a`.
- Category colours: `#5b6cff #ff5b95 #34c759 #ff9f0a #af52de #00c7be #ff453a #8e8e93`.

## Features
- Sidebar: All Notes, categories (colour dot + count, drag reorder, context menu Edit/Archive/Delete), "Other" (uncategorised, only when >0), tag cloud (AND filter), settings.
- List: search (title/body text/tags, 200 ms debounce), "Show archived notes" toggle, New note (Ctrl+N), Pinned section first, card = title/"Untitled note", 120-char preview/"No content", category label, "Archived" label, up to 3 tags, date. Empty: "No notes here yet. Hit + New to start." Pin does not change `updated`.
- Editor empty state: "A little space for your thoughts." / "Select a note, or start with a fresh page. Your ideas, all in one place." / "Create a note".
- Editor: title "Untitled note", category picker (+ "Other"), tag pills, pin, body placeholder "Start writing…", footer "N words · M chars", Archive/Delete.
- Archive category with active notes → "Archive this category?" (notes archived too). Unarchive category with archived notes → "Unarchive this category?" with **Restore notes / Keep notes archived / Delete notes permanently / Cancel**.
- Delete category → its notes move to Other.
- Tags dialog: search-or-create, "+ Create #q", toggle, Enter creates/toggles.
- Toolbar: block style (Body/Title/Heading/Subheading/Quote), B/I/U, lists (bullet/numbered/checklist), sections, overflow (strike, inline code, highlight, indent/outdent, table, link, image, divider, text colour), alignment.
- Sections: info `#3b82f6`, note `#a855f7`, success `#22c55e`, warning `#f59e0b`, error `#ef4444`.
- Tables: 10×8 grid picker; context menu insert row above/below, column left/right, delete row/column; Tab/Shift+Tab nav, Tab in last cell adds row.
- Links: Ctrl+K popover, click chip Edit/Remove, Ctrl+click opens.
- Keyboard: Ctrl+B/I/U, Ctrl+Alt+0-4 block styles, Ctrl+Shift+7/8/9 lists, Ctrl+K, Ctrl+N, Ctrl+S, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+Enter / Arrow at edges exit blocks, Enter on empty last line exits section/quote, empty checklist item exits, Backspace at section start unwraps, Escape closes menus.
- Markdown: `# Title`, `**b**`, `*i*`, `~~s~~`, `` `c` ``, links, images, lists, `- [ ]`/`- [x]`, fenced code, `---`, `> quote`, GFM tables, sections `> [!INFO]` (type upper-cased). Import accepts multiple `.json/.md/.markdown/.txt`; front-matter stripped; links only http(s)/mailto/#//; images http(s)/data:image.

## Legacy e2e scenarios (`legacy/tests/editor.cjs`)
Create and title a note · Checklist converts each selected paragraph to its own item · Panel insertion places caret inside · Enter on empty final panel line exits · Ctrl+Enter exits a populated panel · ArrowDown exits last panel boundary · ArrowUp exits first panel boundary · Backspace unwraps populated panel without losing text · Backspace preserves image-only panel content · Quote exit · Heading Enter returns to body style · Checklist splits text at the caret · Empty checklist item exits, preserving following items · Checklist Backspace converts item to paragraph · Undo and redo custom checklist edits · Undo panel removal restores content and structure · Undo and redo ordinary typing · Empty bullet exits a regular list · Table Tab navigates cells and adds a final row · Table Shift+Tab exits before first cell · Ctrl+Enter exits table · Inline code ArrowRight exits code · Bold formatting retains selection · Italic, underline, strikethrough and alignment · Link creation retains selected text · Image insertion keeps the document editable · Table insertion and context row action · Virtual keyboard Enter exits a panel · Create category and assign to note · Add and remove a note tag · Pin and unpin a note · Export downloads valid note data · Automatic backup writes the complete export payload (→ now: Drive sync writes the file) · Import preserves note title and formatted body · Delete confirmation can cancel or delete · Escape closes dropdown · Settings opens by click and dismisses · Quick note switching saves the previous note · Note changes survive reload · Search filters notes · Desktop columns align without overflow · Tablet drawer backdrop closes sidebar · Mobile toolbar dropdown escapes scrolling toolbar · Mobile navigation and settings remain visible · No uncaught browser errors.
