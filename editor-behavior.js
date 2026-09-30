/* Structured editing and keyboard navigation shared by desktop and mobile. */
// Native undo cannot track direct DOM edits (checklists, panels, table actions).
// Keep one bounded history for the current document so all editor actions undo together.
let editorHistory=[], historyIndex=-1, restoringHistory=false, historyInput=null, lastHistoryTime=0;
function selectionBookmark() {
  const selection=getSelection();
  if(!selection.rangeCount||!doc.contains(selection.anchorNode)||!doc.contains(selection.focusNode)) return null;
  const path=node=>{const result=[];while(node!==doc){result.unshift([...node.parentNode.childNodes].indexOf(node));node=node.parentNode;}return result;};
  return {anchor:path(selection.anchorNode),anchorOffset:selection.anchorOffset,focus:path(selection.focusNode),focusOffset:selection.focusOffset};
}
function resetEditorHistory() {
  editorHistory=[{html:doc.innerHTML,selection:selectionBookmark()}];historyIndex=0;historyInput=null;lastHistoryTime=0;
}
function rememberCaret() {
  const entry=editorHistory[historyIndex];
  if(entry?.html===doc.innerHTML) entry.selection=selectionBookmark()||entry.selection;
}
function recordEditorHistory() {
  if(restoringHistory||!current) return;
  const html=doc.innerHTML;
  if(editorHistory[historyIndex]?.html===html) return;
  editorHistory.splice(historyIndex+1);
  const now=performance.now();
  const group=historyInput==='insertText'&&now-lastHistoryTime<650&&historyIndex>0&&editorHistory[historyIndex].typing;
  const entry={html,selection:selectionBookmark(),typing:historyInput==='insertText'};
  if(group) editorHistory[historyIndex]=entry;
  else { editorHistory.push(entry);historyIndex++; }
  // Bound retained HTML as well as step count; embedded images can be large.
  while(editorHistory.length>2&&(editorHistory.length>100||editorHistory.reduce((size,item)=>size+item.html.length,0)>8_000_000)) {editorHistory.shift();historyIndex--;}
  lastHistoryTime=now;historyInput=null;
}
function restoreEditorHistory(direction) {
  const next=historyIndex+direction;
  if(next<0||next>=editorHistory.length) return;
  rememberCaret();historyIndex=next;const entry=editorHistory[next];restoringHistory=true;
  doc.innerHTML=entry.html;doc.focus();
  if(entry.selection) {
    const find=path=>path.reduce((node,index)=>node?.childNodes[index],doc);
    const bookmark=entry.selection,anchor=find(bookmark.anchor),focus=find(bookmark.focus);
    if(anchor&&focus) getSelection().setBaseAndExtent(anchor,Math.min(bookmark.anchorOffset,anchor.nodeType===3?anchor.length:anchor.childNodes.length),focus,Math.min(bookmark.focusOffset,focus.nodeType===3?focus.length:focus.childNodes.length));
  } else placeCaret(doc,doc.childNodes.length);
  commitEditorChange();restoringHistory=false;historyInput=null;lastHistoryTime=0;
}
doc.addEventListener('beforeinput',event=>{
  if(event.inputType==='historyUndo'||event.inputType==='historyRedo') {event.preventDefault();restoreEditorHistory(event.inputType==='historyUndo'?-1:1);return;}
  rememberCaret();historyInput=event.inputType;
  // Some virtual keyboards emit beforeinput without a useful Enter keydown.
  if(event.inputType==='insertParagraph'&&!event.isComposing) {
    const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
    if(!doc.dispatchEvent(enter)) event.preventDefault();
  }
});
doc.addEventListener('keydown',event=>{
  rememberCaret();
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault();event.stopImmediatePropagation();restoreEditorHistory(event.key.toLowerCase()==='y'||event.shiftKey?1:-1);
  }
},true);
doc.addEventListener('pointerdown',()=>{lastHistoryTime=0;});
document.addEventListener('selectionchange',rememberCaret);

function isEmptyBlock(node) {
  return !node.textContent.replace(/[\s\u200b\u00a0]/g, '') && !node.querySelector?.('img,table,hr,video,audio');
}
function commitEditorChange() {
  ensureTrailingRow();
  if(current) { current.body=doc.innerHTML; updateStats(); scheduleSave(); }
  syncToolbar();
}
function caretBoundary(range, block, end) {
  const probe=document.createRange(); probe.selectNodeContents(block);
  if(end) probe.setStart(range.endContainer,range.endOffset);
  else probe.setEnd(range.startContainer,range.startOffset);
  return isEmptyBlock(probe.cloneContents());
}
function leaveBlock(block, before=false) {
  let paragraph=before?block.previousElementSibling:block.nextElementSibling;
  if(!paragraph || paragraph.tagName!=='P' || !isEmptyBlock(paragraph)) {
    paragraph=document.createElement('p'); paragraph.innerHTML='<br>';
    if(before) block.before(paragraph); else block.after(paragraph);
  }
  placeCaret(paragraph,0); paragraph.scrollIntoView({block:'nearest'});
  commitEditorChange();
}

// Capture before the legacy handlers: never let two handlers edit the same keystroke.
doc.addEventListener('keydown',event=>{
  if(event.isComposing || event.defaultPrevented) return;
  const selection=getSelection();
  if(!selection.rangeCount || (!selection.isCollapsed && event.key!=='Tab')) return;
  const range=selection.getRangeAt(0);
  const element=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
  if(!doc.contains(element)) return;
  const block=element.closest('.cpanel,blockquote,pre,table');
  const plain=!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
  const handle=()=>{event.preventDefault();event.stopImmediatePropagation();};
  if(block && ((event.key==='Enter'&&(event.ctrlKey||event.metaKey)) || (event.key==='ArrowDown'&&plain&&caretBoundary(range,block,true)))) {
    handle(); leaveBlock(block); return;
  }
  if(block && event.key==='ArrowUp'&&plain&&caretBoundary(range,block,false)) {
    handle(); leaveBlock(block,true); return;
  }
  if(event.key==='Tab' && !event.ctrlKey&&!event.metaKey&&!event.altKey) {
    const cell=element.closest('td,th');
    if(cell) {
      handle();
      const table=cell.closest('table');
      const cells=[...table.querySelectorAll('td,th')].filter(c=>c.closest('table')===table);
      const next=cells[cells.indexOf(cell)+(event.shiftKey?-1:1)];
      if(next) { placeCaret(next,0); next.scrollIntoView({block:'nearest'}); }
      else if(event.shiftKey) leaveBlock(table,true);
      else {
        const row=table.insertRow();
        const last=cell.parentElement;
        for(const source of last.cells) { const target=row.insertCell(); target.colSpan=source.colSpan; target.innerHTML='<br>'; }
        placeCaret(row.cells[0],0); commitEditorChange();
      }
      return;
    }
    if(element.closest('li')) { handle(); exec(event.shiftKey?'outdent':'indent'); return; }
  }
  if(event.key==='Enter' && plain && block && block.tagName!=='TABLE' && !element.closest('li')) {
    const line=element.closest('p,div');
    const emptyLastLine=line&&line!==block&&block.contains(line)&&isEmptyBlock(line)&&caretBoundary(range,block,true);
    const preExit=block.tagName==='PRE' && caretBoundary(range,block,true) && block.textContent.endsWith('\n');
    if(emptyLastLine || isEmptyBlock(block) || preExit) {
      handle();
      if(emptyLastLine) line.remove();
      if(preExit) block.textContent=block.textContent.replace(/\n$/,'');
      leaveBlock(block); return;
    }
  }
  if(event.key==='Enter' && plain && !block) {
    const heading=element.closest('h1,h2,h3,h4,h5,h6');
    if(heading&&caretBoundary(range,heading,true)) { handle(); leaveBlock(heading); return; }
  }
  if(event.key==='Backspace'&&plain) {
    const item=element.closest('ul.checklist > li');
    if(item&&caretBoundary(range,item,false)) { handle(); checklistItemToParagraph(item); commitEditorChange(); }
  }
},true);

// Keep menus operable on touch and with a keyboard, including Escape dismissal.
const settingsButton=document.getElementById('settingsBtn');
settingsButton.setAttribute('aria-expanded','false');
settingsButton.addEventListener('click',()=>{
  const open=document.getElementById('settingsMenu').classList.toggle('open');
  settingsButton.setAttribute('aria-expanded',String(open));
});
document.addEventListener('click',event=>{
  if(!event.target.closest('#settingsMenu')) {
    document.getElementById('settingsMenu').classList.remove('open');
    settingsButton.setAttribute('aria-expanded','false');
  }
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape') return;
  const open=document.querySelector('.dd.open .dd-toggle');
  closeDropdowns(); closeDrawer();
  document.getElementById('settingsMenu').classList.remove('open');
  settingsButton.setAttribute('aria-expanded','false');
  const modal=document.querySelector('.modal-back.show');
  if(modal) { modal.classList.remove('show'); doc.focus(); restoreSel(); }
  if(open) open.focus();
});
document.querySelectorAll('[data-tip]').forEach(button=>button.setAttribute('aria-label',button.dataset.tip));
document.querySelectorAll('[data-theme-val]').forEach(button=>button.setAttribute('aria-label',button.dataset.themeVal+' appearance'));
document.getElementById('toolbar').setAttribute('aria-label','Text formatting');

// Rendered navigation remains keyboard reachable after filters, edits, and saves.
function labelNavigation() {
  document.querySelectorAll('.nav-item,.note-card').forEach(item=>{
    item.tabIndex=0; item.setAttribute('role','button');
    item.setAttribute('aria-pressed',String(item.classList.contains('active')));
    item.onkeydown=event=>{ if(event.target===item&&(event.key==='Enter'||event.key===' ')){event.preventDefault();item.click();} };
  });
}
new MutationObserver(labelNavigation).observe(document.getElementById('catNav'),{childList:true});
new MutationObserver(labelNavigation).observe(document.getElementById('noteList'),{childList:true});
labelNavigation();
