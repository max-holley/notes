// Run: node tests/editor.cjs (requires Playwright and Microsoft Edge).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;} res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  let passed=0;
  async function test(name,run){await run();passed++;console.log('PASS '+name);}
  async function setDoc(html,selector,offset=0){
    await page.evaluate(({html,selector,offset})=>{
      doc.innerHTML=html;doc.focus();const target=doc.querySelector(selector);
      placeCaret(target.firstChild?.nodeType===3?target.firstChild:target,offset);
      commitEditorChange();resetEditorHistory();
    },{html,selector,offset});
  }
  async function inBlock(selector){return page.evaluate(selector=>{
    let node=getSelection().anchorNode; if(node.nodeType===3)node=node.parentElement;
    return !!node.closest(selector);
  },selector);}
  try {
    await page.goto(url);await page.waitForFunction(()=>categories.length===3);
    await test('Create and title a note',async()=>{await page.getByRole('button',{name:'Create a note',exact:true}).click();await page.locator('#titleInput').fill('Editor regression');});
    await test('Panel insertion places caret inside',async()=>{
      await setDoc('<p><br></p>','p');
      await page.locator('#panelDD .dd-toggle').click();await page.locator('[data-panel="info"]').click();
      assert(await inBlock('.cpanel'));await page.keyboard.type('Panel text');
      assert.equal(await page.locator('.cpanel').innerText(),'Panel text');
    });
    await test('Enter on empty final panel line exits',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Keep me</p><p><br></p></div>','.cpanel p:last-child');
      await page.keyboard.press('Enter');assert(!await inBlock('.cpanel'));
      assert.equal(await page.locator('.cpanel').innerText(),'Keep me');
    });
    await test('Ctrl+Enter exits a populated panel',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p></div>','.cpanel p',2);
      await page.keyboard.press('Control+Enter');assert(!await inBlock('.cpanel'));assert.equal(await page.locator('.cpanel').innerText(),'Text');
    });
    await test('ArrowDown exits last panel boundary',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p></div>','.cpanel p',4);
      await page.keyboard.press('ArrowDown');assert(!await inBlock('.cpanel'));
    });
    await test('ArrowUp exits first panel boundary',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p></div>','.cpanel p');
      await page.keyboard.press('ArrowUp');assert(!await inBlock('.cpanel'));
      assert.equal(await page.locator('#doc > :first-child').evaluate(el=>el.tagName),'P');
    });
    await test('Backspace unwraps populated panel without losing text',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p></div>','.cpanel p');await page.keyboard.press('Backspace');
      assert.equal(await page.locator('.cpanel').count(),0);assert.equal((await page.locator('#doc').innerText()).trim(),'Text');
    });
    await test('Backspace preserves image-only panel content',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p><img src="icon.svg"></p></div>','.cpanel p');await page.keyboard.press('Backspace');
      assert.equal(await page.locator('#doc img').count(),1);
    });
    await test('Quote exit',async()=>{await setDoc('<blockquote><p>Quote</p><p><br></p></blockquote>','blockquote p:last-child');await page.keyboard.press('Enter');assert(!await inBlock('blockquote'));});
    await test('Heading Enter returns to body style',async()=>{await setDoc('<h2>Heading</h2>','h2',7);await page.keyboard.press('Enter');assert(!await inBlock('h2'));});
    await test('Checklist splits text at the caret',async()=>{
      await setDoc('<ul class="checklist"><li class="ck-item checked">Hello world</li></ul>','li',5);await page.keyboard.press('Enter');
      assert.deepEqual(await page.locator('#doc li').allTextContents(),['Hello',' world']);assert(!await page.locator('#doc li:last-child').evaluate(el=>el.classList.contains('checked')));
    });
    await test('Empty checklist item exits, preserving following items',async()=>{
      await setDoc('<ul class="checklist"><li>Before</li><li><br></li><li>After</li></ul>','li:nth-child(2)');await page.keyboard.press('Enter');
      assert(!await inBlock('li'));assert.deepEqual(await page.locator('#doc li').allTextContents(),['Before','After']);assert.equal(await page.locator('#doc ul').count(),2);
    });
    await test('Checklist Backspace converts item to paragraph',async()=>{await setDoc('<ul class="checklist"><li>Text</li></ul>','li');await page.keyboard.press('Backspace');assert(!await inBlock('li'));assert.equal((await page.locator('#doc').innerText()).trim(),'Text');});
    await test('Undo and redo custom checklist edits',async()=>{
      await setDoc('<ul class="checklist"><li>Hello world</li></ul>','li',5);await page.keyboard.press('Enter');
      await page.keyboard.press('Control+z');assert.deepEqual(await page.locator('#doc li').allTextContents(),['Hello world']);
      await page.keyboard.press('Control+Shift+z');assert.deepEqual(await page.locator('#doc li').allTextContents(),['Hello',' world']);
    });
    await test('Undo panel removal restores content and structure',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p></div>','.cpanel p');await page.keyboard.press('Backspace');await page.keyboard.press('Control+z');assert.equal(await page.locator('.cpanel').innerText(),'Text');
    });
    await test('Undo and redo ordinary typing',async()=>{
      await setDoc('<p><br></p>','p');await page.keyboard.type('Hello');await page.keyboard.press('Control+z');assert.equal((await page.locator('#doc').innerText()).trim(),'');await page.keyboard.press('Control+y');assert.equal((await page.locator('#doc').innerText()).trim(),'Hello');
    });
    await test('Empty bullet exits a regular list',async()=>{await setDoc('<ul><li>First</li><li><br></li></ul>','li:last-child');await page.keyboard.press('Enter');assert(!await inBlock('li'));});
    await test('Table Tab navigates cells and adds a final row',async()=>{
      await setDoc('<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>','td');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>getSelection().anchorNode.textContent),'B');
      await page.keyboard.press('Tab');assert.equal(await page.locator('#doc tr').count(),2);assert(await inBlock('td'));
    });
    await test('Table Shift+Tab exits before first cell',async()=>{await setDoc('<table><tbody><tr><td>A</td></tr></tbody></table>','td');await page.keyboard.press('Shift+Tab');assert(!await inBlock('table'));});
    await test('Ctrl+Enter exits table',async()=>{await setDoc('<table><tbody><tr><td>A</td></tr></tbody></table>','td');await page.keyboard.press('Control+Enter');assert(!await inBlock('table'));});
    await test('Inline code ArrowRight exits code',async()=>{await setDoc('<p><code>code</code></p>','code',4);await page.keyboard.press('ArrowRight');await page.keyboard.type(' normal');assert.equal(await page.locator('#doc code').innerText(),'code');});
    await test('Bold formatting retains selection',async()=>{
      await setDoc('<p>Bold text</p>','p');await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.up('Shift');
      await page.locator('[data-cmd="bold"]').click();assert.equal(await page.locator('#doc b,#doc strong').innerText(),'Bold text');
    });
    await test('Italic, underline, strikethrough and alignment',async()=>{
      await setDoc('<p>Styled text</p>','p');await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.up('Shift');
      await page.keyboard.press('Control+i');await page.keyboard.press('Control+u');
      await page.evaluate(()=>{exec('strikeThrough');exec('justifyCenter');});
      assert.equal(await page.locator('#doc i').innerText(),'Styled text');assert.equal(await page.locator('#doc u').innerText(),'Styled text');assert.equal(await page.locator('#doc strike').innerText(),'Styled text');
      assert.equal(await page.locator('#doc > :first-child').evaluate(el=>getComputedStyle(el).textAlign),'center');
    });
    await test('Link creation retains selected text',async()=>{
      await setDoc('<p>Read this</p>','p');await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.up('Shift');
      await page.keyboard.press('Control+k');await page.locator('#linkInput').fill('https://example.com');await page.locator('#linkInput').press('Enter');
      assert.equal(await page.locator('#doc a').getAttribute('href'),'https://example.com');assert.equal(await page.locator('#doc a').innerText(),'Read this');
    });
    await test('Image insertion keeps the document editable',async()=>{
      await setDoc('<p><br></p>','p');await page.evaluate(()=>fileToImg(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'],'test.svg',{type:'image/svg+xml'})));
      await page.waitForSelector('#doc img');assert.match(await page.locator('#doc img').getAttribute('src'),/^data:image/);
    });
    await test('Table insertion and context row action',async()=>{
      await setDoc('<p><br></p>','p');await page.evaluate(()=>{saveSel();doTableInsert(2,2);});
      assert.equal(await page.locator('#doc tr').count(),2);assert.equal(await page.locator('#doc th').count(),2);
      await page.locator('#doc td').first().click({button:'right'});assert(await page.locator('#tblCtx').isVisible());await page.keyboard.press('Escape');
    });
    await test('Virtual keyboard Enter exits a panel',async()=>{
      await setDoc('<div class="cpanel cpanel-info"><p>Text</p><p><br></p></div>','.cpanel p:last-child');
      await page.evaluate(()=>doc.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true})));assert(!await inBlock('.cpanel'));
    });
    await test('Create category and assign to note',async()=>{
      await page.locator('#addCatBtn').click();await page.locator('#catNameInput').fill('Research');await page.locator('#catSave').click();await page.waitForFunction(()=>categories.some(c=>c.name==='Research'));
      await page.locator('#catPickToggle').click();await page.locator('#catPickMenu button').filter({hasText:'Research'}).click();assert.equal(await page.locator('#catPickLabel').innerText(),'Research');
    });
    await test('Add and remove a note tag',async()=>{
      await page.locator('#addTagBtn').click();await page.locator('#tagSearch').fill('regression');await page.locator('#tagSearch').press('Enter');await page.locator('#tagDone').click();assert(await page.locator('#tagPills').innerText().then(t=>t.includes('regression')));
      await page.locator('#tagPills button').click();assert.equal(await page.locator('#tagPills .pill').count(),0);
    });
    await test('Pin and unpin a note',async()=>{await page.locator('#headPin').click();assert(await page.evaluate(()=>current.pinned));await page.locator('#headPin').click();assert(!await page.evaluate(()=>current.pinned));});
    await test('Export downloads valid note data',async()=>{
      await page.locator('#settingsBtn').click();const downloadPromise=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await downloadPromise;
      const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert(data.notes.length>0);assert(data.categories.some(c=>c.name==='Research'));await page.keyboard.press('Escape');
    });
    await test('Automatic backup writes the complete export payload',async()=>{
      const payload=await page.evaluate(async()=>{
        let written='';backupHandle={queryPermission:async()=> 'granted',getFileHandle:async()=>({createWritable:async()=>({write:async text=>{written=text;},close:async()=>{}})})};backupActive=true;
        await writeBackup();backupActive=false;backupHandle=null;clearTimeout(backupTimer);setBackupUI(false,'Auto-backup off');return JSON.parse(written);
      });
      assert(payload.notes.length>0);assert(payload.categories.some(c=>c.name==='Research'));
    });
    await test('Import preserves note title and formatted body',async()=>{
      await page.locator('#importFile').setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({notes:[{id:'import-test',title:'Imported note',body:'<p><b>Imported content</b></p>',tags:[],created:Date.now(),updated:Date.now()}]}))});
      await page.waitForFunction(()=>notes.some(n=>n.id==='import-test'));await page.locator('.note-card[data-id="import-test"]').click();assert.equal(await page.locator('#doc b').innerText(),'Imported content');
    });
    await test('Delete confirmation can cancel or delete',async()=>{
      await page.locator('#delBtn').click();await page.locator('#confirmCancel').click();assert(await page.evaluate(()=>notes.some(n=>n.id==='import-test')));
      await page.locator('#delBtn').click();await page.locator('#confirmOk').click();assert(!await page.evaluate(()=>notes.some(n=>n.id==='import-test')));
      await page.locator('.note-card').first().click();
    });
    await test('Escape closes dropdown',async()=>{await page.locator('#panelDD .dd-toggle').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.dd.open').count(),0);});
    await test('Settings opens by click and dismisses',async()=>{await page.locator('#settingsBtn').click();assert(await page.locator('.settings-pop').isVisible());await page.keyboard.press('Escape');assert(!await page.locator('.settings-pop').isVisible());});
    await test('Quick note switching saves the previous note',async()=>{
      await setDoc('<p>Do not lose this</p>','p',4);const id=await page.evaluate(()=>current.id);
      await page.locator('#newNoteBtn').click();
      assert.equal(await page.evaluate(async id=>(await DB.all('notes')).find(n=>n.id===id).body,id),'<p>Do not lose this</p>');
    });
    await test('Note changes survive reload',async()=>{await page.locator('#titleInput').fill('Persistence check');await setDoc('<p>Persistent content</p>','p');await page.evaluate(()=>flushSave());await page.reload();await page.getByRole('button',{name:/Persistence check/}).click();assert.equal((await page.locator('#doc').innerText()).trim(),'Persistent content');});
    await test('Search filters notes',async()=>{await page.locator('#search').fill('Persistence check');await page.waitForFunction(()=>searchQ==='Persistence check');assert.equal(await page.locator('.note-card').count(),1);await page.locator('#search').fill('');await page.waitForFunction(()=>searchQ==='');});
    // A separate, illustrative fixture for visual checks; never touches the user's database.
    await page.evaluate(async()=>{
      const work=categories.find(c=>c.name==='Work'),personal=categories.find(c=>c.name==='Personal');
      notes=[{id:'design',title:'A little room to think',category:work.id,tags:['design','ideas'],pinned:true,created:Date.now(),updated:Date.now(),body:'<p>Good ideas need a little space. A place to collect the details, connect the dots, and make something worth keeping.</p><h2>Less noise. More clarity.</h2><p>A few principles for the next chapter of our workspace.</p><ul class="checklist"><li class="ck-item checked">Make room for what matters</li><li class="ck-item">Keep the everyday things effortless</li><li class="ck-item">Bring a little care to every detail</li></ul><div class="cpanel cpanel-info"><p>The best tools feel familiar from the very first moment.</p></div><h2>On the horizon</h2><p>Small improvements, thoughtfully made. Start with the essentials and let the rest follow.</p>'},
      {id:'weekend',title:'A slow weekend',body:'Coffee, the bookshop, and a long walk home. No particular order.',category:personal.id,tags:['life'],pinned:false,created:Date.now(),updated:Date.now()-3600000},
      {id:'meeting',title:'Monday, a fresh start',body:'A few notes from our weekly catch-up. Make the first version simple.',category:work.id,tags:['work'],pinned:false,created:Date.now(),updated:Date.now()-7200000},
      {id:'ideas',title:'Things worth exploring',body:'A running list of sparks, questions, and unfinished thoughts.',category:null,tags:['ideas'],pinned:false,created:Date.now(),updated:Date.now()-86400000}];
      renderAll();openNote('design');document.documentElement.dataset.theme='light';
    });
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await page.locator('#search').blur();
    await page.screenshot({path:path.join(root,'test-results/desktop-light.png'),animations:'disabled'});
    await test('Desktop columns align without overflow',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth)));
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:path.join(root,'test-results/desktop-dark.png'),animations:'disabled'});
    await page.evaluate(()=>document.documentElement.dataset.theme='light');
    await page.setViewportSize({width:820,height:1000});
    await test('Tablet drawer backdrop closes sidebar',async()=>{await page.locator('#sidebarToggle').click();await page.locator('#scrim').click({position:{x:600,y:400}});assert(!await page.locator('.app').evaluate(el=>el.classList.contains('drawer-open')));});
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>setMobileView('editor'));
    await page.screenshot({path:path.join(root,'test-results/mobile.png'),animations:'disabled'});
    await test('Mobile toolbar dropdown escapes scrolling toolbar',async()=>{
      await page.locator('#blockDD .dd-toggle').click();const box=await page.locator('#blockDD .dd-menu').boundingBox();assert(box.y>=0&&box.x>=0&&box.x+box.width<=390);await page.locator('[data-block="h2"]').click();assert.equal(await page.locator('.dd.open').count(),0);
    });
    await test('Mobile navigation and settings remain visible',async()=>{await page.locator('#mBack').click();assert(await page.locator('#noteList').isVisible());await page.locator('[data-mtab="settings"]').click();assert(await page.locator('.settings-pop').isVisible());});
    await test('No uncaught browser errors',async()=>assert.deepEqual(errors,[]));
    console.log(`\n${passed} checks passed.`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


