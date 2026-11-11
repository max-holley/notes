import { describe, expect, it } from 'vitest';
import { exportJson, exportMarkdown, importFiles, parseJsonImport, planImport, safeFileName } from './importExport.ts';
import { htmlToMarkdown, markdownToHtml, markdownToNote } from './markdown.ts';
import { emptyDoc, type Note } from './model.ts';

const file = (name: string, text: string) => ({ name, text: async () => text });
const note = (p: Partial<Note>): Note => ({ id: 'n1', title: 'T', body: '', categoryId: null, tags: [], pinned: false, archived: false, createdAt: 1, editedAt: 1, updatedAt: 1, ...p });

describe('markdown', () => {
  it('round-trips the supported blocks', () => {
    const html =
      '<h2>Head</h2><p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://x.y">l</a></p>' +
      '<ul><li><p>one</p><ul><li><p>nested</p></li></ul></li></ul><ol><li><p>first</p></li></ol>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li><li data-type="taskItem" data-checked="false"><p>todo</p></li></ul>' +
      '<blockquote><p>quote</p></blockquote><div data-section="warning"><p>careful</p></div><pre><code>x = 1</code></pre><hr>' +
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('## Head');
    expect(md).toContain('**b** *i* ~~s~~ `c` [l](https://x.y)');
    expect(md).toContain('- one\n  - nested');
    expect(md).toContain('1. first');
    expect(md).toContain('- [x] done\n- [ ] todo');
    expect(md).toContain('> [!WARNING]\n> careful');
    expect(md).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
    const back = markdownToHtml(md);
    expect(htmlToMarkdown(back)).toBe(md);
  });

  it('takes the title from a leading # heading and strips front matter', () => {
    expect(markdownToNote('---\nx: 1\n---\n# My title\n\nbody', 'file')).toEqual({ title: 'My title', body: '<p>body</p>' });
    expect(markdownToNote('just text', 'file').title).toBe('file');
  });

  it('drops unsafe links and images on import', () => {
    const html = markdownToHtml('[x](javascript:alert(1)) ![i](http://ok.png) ![j](javascript:1)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<img src="http://ok.png"');
  });
});

describe('JSON import/export', () => {
  it('exports and re-imports (round trip)', async () => {
    const doc = emptyDoc();
    doc.categories.c = { id: 'c', name: 'Work', color: '#000000', order: 0, archived: false, updatedAt: 1 };
    doc.notes.n1 = note({ categoryId: 'c', body: '<p>hi</p>', tags: ['x'] });
    doc.notes.t = note({ id: 't', trashedAt: 5 });
    const out = exportJson(doc, new Date(0));
    expect(out.notes.map((n) => n.id)).toEqual(['n1']);
    const r = await importFiles([file('notes-export.json', JSON.stringify(out))]);
    expect(r.invalid).toEqual([]);
    expect(r.notes[0]).toMatchObject({ id: 'n1', body: '<p>hi</p>', categoryId: 'c', tags: ['x'] });
    const plan = planImport(doc, r);
    expect(plan.categories).toEqual([]); // matched by id
    expect(plan.notes[0]!.categoryId).toBe('c');
  });

  it('accepts the legacy v2 export shape', () => {
    const r = parseJsonImport(JSON.stringify({ version: 2, exported: 'x', categories: [{ id: 'k', name: 'Ideas', color: '#34c759' }], notes: [{ id: 'a', title: 'Old', body: '<p>x</p>', category: 'k', tags: ['t'], pinned: true, created: 10, updated: 20 }] }));
    expect(r.notes[0]).toMatchObject({ id: 'a', categoryId: 'k', pinned: true, createdAt: 10, updatedAt: 20, tags: ['t'] });
    expect(r.categories[0]!.name).toBe('Ideas');
  });

  it('accepts the Apps Script Drive file shape (id-keyed maps, content field)', () => {
    const r = parseJsonImport(JSON.stringify({ notes: { a: { id: 'a', title: 'AS', content: '<p>y</p>', categoryId: null, updatedAt: '2026-01-01T00:00:00Z' } }, categories: {}, tags: ['z'], prefs: {}, tombstones: {} }));
    expect(r.notes[0]).toMatchObject({ id: 'a', title: 'AS', body: '<p>y</p>' });
    expect(r.notes[0]!.updatedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(r.tags).toContain('z');
  });

  it('sanitises imported HTML and reports invalid files', async () => {
    const r = await importFiles([file('a.json', JSON.stringify({ notes: [{ id: 'x', body: '<img src=x onerror=alert(1)><script>bad()</script><p>ok</p>' }] })), file('b.json', '{nope'), file('c.bin', 'zzz')]);
    expect(r.notes[0]!.body).not.toMatch(/onerror|script/);
    expect(r.invalid).toEqual(['b.json', 'c.bin']);
  });

  it('matches categories by name and keeps new ones', () => {
    const doc = emptyDoc();
    doc.categories.w = { id: 'w', name: 'Work', color: '#000000', order: 0, archived: false, updatedAt: 1 };
    const plan = planImport(doc, { notes: [note({ categoryId: 'other-work' }), note({ id: 'n2', categoryId: 'new' })], categories: [{ id: 'other-work', name: 'work', color: '', order: 0, archived: false, updatedAt: 0 }, { id: 'new', name: 'New', color: '', order: 0, archived: false, updatedAt: 0 }], tags: [], invalid: [] });
    expect(plan.notes.map((n) => n.categoryId)).toEqual(['w', 'new']);
    expect(plan.categories.map((c) => c.name)).toEqual(['New']);
  });

  it('markdown export: one file per note with safe unique names', () => {
    const files = exportMarkdown([note({ title: 'a/b?' }), note({ id: '2', title: 'a/b?' })]);
    expect(files.map((f) => f.name)).toEqual(['a-b-.md', 'a-b- (2).md']);
    expect(files[0]!.text.startsWith('# a/b?\n\n')).toBe(true);
    expect(safeFileName('')).toBe('Untitled');
  });
});
