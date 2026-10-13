# Notes

A local-first notes workspace. Open `index.html` or serve this directory with any static web server. Existing notes, categories, appearance preferences, and backup folders use the same storage keys as before.

For a local preview:

```sh
python -m http.server 4173 --bind 127.0.0.1
```

Then visit http://127.0.0.1:4173. Browser data belongs to its original origin; notes on the deployed site will not automatically appear in a localhost preview. Use Export and Import to transfer them.

## Design

`design.css` defines the neutral light/dark palette, aligned three-column workspace, responsive layouts, focus styles, and reduced-motion support. `icon.svg` is the master artwork for the in-app mark, favicon, touch icon, and install icons. The legacy PNG filenames contain the same new artwork.

## Structured editing

- Press Enter on the final empty line to leave a panel or quotation.
- Press Ctrl/Cmd+Enter to move below a panel, quotation, code block, or table.
- Arrow Up/Down at a structured block's start/end moves outside it.
- Enter splits checklist text at the caret; an empty item exits the checklist.
- Tab/Shift+Tab moves between table cells; Tab in the last cell adds a row.
- Backspace at the start of a panel unwraps its contents. At the start of a checklist item it converts that item to a paragraph.
- Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo text and structured edits. Ctrl+Y also redoes.
- Escape dismisses menus, dialogs, and the tablet sidebar.

`editor-behavior.js` handles these interactions and a bounded, in-memory edit history. Saving is separate and continues to use IndexedDB.

## Browser regression checks

Install Playwright in your development environment and make Microsoft Edge available, then run:

```sh
node tests/editor.cjs
```

The suite uses an isolated browser profile and temporary local HTTP server. It checks editing, undo/redo, persistence, data tools, keyboard exits, and desktop/tablet/mobile layouts. Screenshot fixtures are generated in ignored `test-results/`; illustrative notes are confined to the test browser. The backup payload test uses a mock directory handle and does not request access to a real folder. Real device keyboard behaviour and browser-specific file-picker permissions still require device testing.

## Markdown export / import

**Export** asks for a format: JSON (all notes and categories) or Markdown (the open note, or every note if none is open, one `.md` file each). **Import** accepts `.json` and `.md` files together and detects the type per file; each Markdown file becomes a new note (a leading `# Title` becomes the note title). Markdown supports headings, bold/italic/strike, code, links, lists, checklists (`- [ ]`), tables, quotes, and panels (as `> [!INFO]`-style alerts).
