/** HTML ⇄ Markdown for note export/import. Sections use GitHub-style callouts: `> [!INFO]`. */
const SECTION_TYPES = ['info', 'note', 'success', 'warning', 'error'];

function inline(node: Node): string {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      out += (c.textContent ?? '').replace(/([*_`~[\]\\])/g, '\\$1');
      return;
    }
    if (!(c instanceof HTMLElement)) return;
    const t = c.tagName;
    const inner = inline(c);
    if (t === 'STRONG' || t === 'B') out += inner.trim() ? `**${inner}**` : inner;
    else if (t === 'EM' || t === 'I') out += inner.trim() ? `*${inner}*` : inner;
    else if (t === 'S' || t === 'DEL' || t === 'STRIKE') out += `~~${inner}~~`;
    else if (t === 'CODE') out += '`' + (c.textContent ?? '') + '`';
    else if (t === 'A') out += `[${inner}](${c.getAttribute('href') ?? ''})`;
    else if (t === 'BR') out += '  \n';
    else if (t === 'IMG') out += `![${c.getAttribute('alt') ?? ''}](${(c.getAttribute('src') ?? (c.dataset.driveId ? `drive:${c.dataset.driveId}` : '')).slice(0, 2000)})`;
    else out += inner;
  });
  return out;
}

function blocks(parent: Element, indent = ''): string[] {
  const out: string[] = [];
  for (const el of Array.from(parent.children) as HTMLElement[]) {
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) out.push(`${'#'.repeat(Number(t[1]))} ${inline(el)}`);
    else if (t === 'P') out.push(indent + inline(el));
    else if (t === 'HR') out.push('---');
    else if (t === 'PRE') out.push('```\n' + (el.textContent ?? '').replace(/\n$/, '') + '\n```');
    else if (t === 'BLOCKQUOTE') out.push(blocks(el).join('\n\n').split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'));
    else if (t === 'DIV' && el.dataset.section) {
      const body = blocks(el).join('\n\n');
      out.push([`> [!${el.dataset.section.toUpperCase()}]`, ...body.split('\n').map((l) => `> ${l}`.trimEnd())].join('\n'));
    } else if (t === 'UL' || t === 'OL') out.push(list(el, indent));
    else if (t === 'TABLE') out.push(table(el));
    else if (t === 'IMG') out.push(inline({ childNodes: [el] } as unknown as Node));
    else if (t === 'DIV') out.push(...blocks(el, indent));
  }
  return out.filter((b) => b !== '');
}

function list(el: HTMLElement, indent: string): string {
  const ordered = el.tagName === 'OL';
  const task = el.dataset.type === 'taskList';
  let n = Number(el.getAttribute('start') ?? 1);
  const lines: string[] = [];
  for (const li of Array.from(el.children) as HTMLElement[]) {
    const marker = task ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}] ` : ordered ? `${n++}. ` : '- ';
    const content = li.querySelector(':scope > div') ?? li;
    const parts: string[] = [];
    const nested: string[] = [];
    for (const child of Array.from(content.children) as HTMLElement[]) {
      if (child.tagName === 'UL' || child.tagName === 'OL') nested.push(list(child, indent + '  '));
      else if (child.tagName !== 'LABEL') parts.push(child.tagName === 'P' ? inline(child) : blocks({ children: [child] } as unknown as Element).join(' '));
    }
    if (!content.children.length) parts.push(inline(content));
    lines.push(indent + marker + parts.join(' ').trim());
    lines.push(...nested);
  }
  return lines.join('\n');
}

function table(el: HTMLElement): string {
  const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => inline(c).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()));
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [pad(rows[0]!), `| ${Array(cols).fill('---').join(' | ')} |`, ...rows.slice(1).map(pad)].join('\n');
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return blocks(doc.body).join('\n\n').trim();
}

export function noteToMarkdown(title: string, html: string): string {
  return `# ${title || 'Untitled'}\n\n${htmlToMarkdown(html)}\n`;
}

// ------------------------------------------------------------------ Markdown → HTML
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAFE_LINK = /^(https?:|mailto:|#|\/)/i;
const SAFE_IMG = /^(https?:|data:image\/)/i;

export function inlineMd(s: string): string {
  const codes: string[] = [];
  let t = s.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  const escapes: string[] = [];
  t = t.replace(/\\([*_`~[\]\\|#>-])/g, (_, c: string) => `\u0001${escapes.push(c) - 1}\u0001`);
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => (SAFE_IMG.test(src) ? `<img src="${src}" alt="${alt}">` : alt));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt: string, href: string) => (SAFE_LINK.test(href) ? `<a href="${href}">${txt}</a>` : txt));
  t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a?: string, b?: string) => `<strong>${a ?? b}</strong>`);
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  t = t.replace(/ {2}$/g, '<br>');
  // eslint-disable-next-line no-control-regex
  t = t.replace(/\u0001(\d+)\u0001/g, (_, i: string) => esc(escapes[Number(i)]!));
  // eslint-disable-next-line no-control-regex
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]!);
}

interface ListLine { indent: number; marker: 'ul' | 'ol' | 'task'; checked: boolean; text: string }
function parseListLine(l: string): ListLine | null {
  const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
  if (!m) return null;
  const marker = m[3] ? 'task' : /\d/.test(m[2]!) ? 'ol' : 'ul';
  return { indent: m[1]!.replace(/\t/g, '  ').length, marker, checked: /x/i.test(m[3] ?? ''), text: m[4]! };
}

function renderList(items: ListLine[]): string {
  let i = 0;
  const level = (indent: number): string => {
    let html = '';
    while (i < items.length && items[i]!.indent >= indent) {
      const first = items[i]!;
      const kind = first.marker;
      const open = kind === 'ol' ? '<ol>' : kind === 'task' ? '<ul data-type="taskList">' : '<ul>';
      html += open;
      while (i < items.length && items[i]!.indent === first.indent && items[i]!.marker === kind) {
        const it = items[i++]!;
        let nested = '';
        if (i < items.length && items[i]!.indent > it.indent) nested = level(items[i]!.indent);
        html += kind === 'task'
          ? `<li data-type="taskItem" data-checked="${it.checked}"><p>${inlineMd(it.text)}</p>${nested}</li>`
          : `<li><p>${inlineMd(it.text)}</p>${nested}</li>`;
      }
      html += kind === 'ol' ? '</ol>' : '</ul>';
      if (i < items.length && items[i]!.indent < first.indent) break;
    }
    return html;
  };
  return level(items[0]?.indent ?? 0);
}

function splitRow(row: string) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
    para = [];
  };
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { flush(); i++; continue; }
    if (/^```/.test(l)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); out.push(`<h${Math.min(3, h[1]!.length)}>${inlineMd(h[2]!)}</h${Math.min(3, h[1]!.length)}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^>\s?/, ''));
      const callout = q[0]?.match(/^\[!(\w+)\]\s*$/);
      if (callout && SECTION_TYPES.includes(callout[1]!.toLowerCase())) {
        const inner = markdownToHtml(q.slice(1).join('\n')) || '<p></p>';
        out.push(`<div data-section="${callout[1]!.toLowerCase()}">${inner}</div>`);
      } else out.push(`<blockquote>${markdownToHtml(q.join('\n')) || '<p></p>'}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]!)) {
      flush();
      const head = splitRow(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(splitRow(lines[i++]!));
      out.push(`<table><tbody><tr>${head.map((c) => `<th><p>${inlineMd(c)}</p></th>`).join('')}</tr>${rows.map((r) => `<tr>${head.map((_, ci) => `<td><p>${inlineMd(r[ci] ?? '')}</p></td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (parseListLine(l)) {
      flush();
      const items: ListLine[] = [];
      while (i < lines.length && parseListLine(lines[i]!)) items.push(parseListLine(lines[i++]!)!);
      out.push(renderList(items));
      continue;
    }
    para.push(l);
    i++;
  }
  flush();
  return out.join('');
}

/** Split a Markdown file into title (leading `# Title`) + HTML body. Front matter is stripped. */
export function markdownToNote(md: string, fallbackTitle: string): { title: string; body: string } {
  let text = md.replace(/^\s+/, '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  let title = fallbackTitle;
  const m = text.match(/^\s*#\s+(.+)\n?/);
  if (m) {
    title = m[1]!.trim();
    text = text.slice(m[0].length);
  }
  return { title, body: markdownToHtml(text) };
}
