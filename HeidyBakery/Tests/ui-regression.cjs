// UI regression tests use an isolated native bridge adapter. Native functions are tested separately.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),M=require('../Resources/model.js'),clone=x=>JSON.parse(JSON.stringify(x));
const work=path.resolve(process.argv[2]||path.join(root,'work/ui-regression'));fs.mkdirSync(work,{recursive:true});
let testBrowser;
(async()=>{
 let saved=Object.assign(M.empty(),clone(require('../Resources/seed.json')),{imported:true});delete saved.notes;
 saved.settings.retailMarkup=50;saved.settings.bulkMarkup=30;
 const ingredient=saved.ingredients.find(i=>i.name==='Rice Flour')||saved.ingredients[0],recipe=saved.recipes[0];recipe.costBaseline=1;
 const makeReceipt=(id,date='2026-09-01',status='Needs review')=>({id,file:id+'.png',originalName:id+'.png',supplier:'Test shop',date,status,text:'',importedAt:'2026-09-07T00:00:00Z',lines:[{description:'Hand-entered rice purchase',ingredientId:ingredient.id,price:10,size:1000,unit:'g',excluded:false}]});
 saved.receipts=Array.from({length:15},(_,n)=>makeReceipt('receipt-'+n,'2026-08-'+String(n+1).padStart(2,'0')));
 saved.receipts[0].status='Reviewed';saved.receipts[0].notUpdated=[{message:'UNRELATED OLD REVIEW'}];
 const historyTarget=saved.receipts[1].id;
 ingredient.history.push({supplier:'S',price:5.29,date:'',note:'no size recorded',receiptId:'missing-receipt'});
 ingredient.history.push({supplier:'Test shop',price:4,date:'2026-08-02',note:'Original',receiptId:historyTarget});
 const recent=makeReceipt('recent','2026-09-07');saved.receipts.push(recent);M.validate(saved);
 let history=[],failNext=false,folderRecords=[],scans=0,opened='',chosenFolder='/isolated/test-receipts';
 const browser=testBrowser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
  try{let result=null;switch(action){
   case'load':result={state:clone(saved),seed:require('../Resources/seed.json'),inbox:''};break;
   case'save':await new Promise(r=>setTimeout(r,20));if(failNext){failNext=false;throw Error('Simulated disk full')}M.validate(payload);history.push(clone(saved));saved=clone(payload);result=true;break;
   case'undo':if(!history.length)throw Error('Nothing to undo');saved=history.pop();result=clone(saved);break;
   case'chooseInbox':if(chosenFolder instanceof Error)throw chosenFolder;result=chosenFolder;break;
   case'scanInbox':scans++;result={records:clone(folderRecords),errors:[],duplicates:0,pending:0};break;
   case'importReceipts':result={records:[clone(saved.receipts[0])],errors:[],duplicates:0,pending:0};break;
   case'previewReceipt':result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';break;
   case'openReceipt':opened=payload.file;result=true;break;
   default:throw Error('Unexpected native call '+action)
  }return{id,result,error:null}}catch(e){return{id,result:null,error:e.message}}
 });
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(r=>window.nativeReply(r))}}}});
 await page.goto('file://'+path.join(root,'Resources/index.html'));
 await page.locator('[data-open-recipe]').first().click();
 await page.locator('#edit-recipe').click();
 assert.equal(await page.locator('[name=laborEffort]').count(),1);
 await page.locator('[name=bulkMin]').fill('12');
 await page.getByText('Different bulk costs (optional)',{exact:true}).click();
 await page.locator('[name=bulkPackaging]').fill('0.12');await page.locator('[name=bulkLaborHours]').fill('0.5');
 await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal(saved.recipes[0].bulkMin,12);assert.equal(saved.recipes[0].bulkPackaging,.12);assert.equal(saved.recipes[0].bulkLaborHours,.5);
 await page.locator('#review-cost').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved on this Mac');assert.ok(Math.abs(saved.recipes[0].costBaseline-M.calculate(saved,saved.recipes[0]).unit)<1e-10);
 // Purchase history remains visible with the newer free-price control; missing originals have no dead link.
 await page.locator('[data-tab=ingredients]').click();await page.locator('#ingredient-search').fill(ingredient.name);
 await page.locator('[data-ingredient="'+ingredient.id+'"]').click();
 assert.equal(await page.locator('[name=freeConfirmed]').count(),1);
 await page.getByText(/^Purchase history \(/).click();
 assert.ok((await page.locator('#dialog-body').textContent()).includes('no size recorded'));
 assert.equal(await page.locator('[data-history-receipt="missing-receipt"]').count(),0);
 await page.locator('[data-history-receipt="'+historyTarget+'"]').click();
 assert.equal(await page.locator('.receipt-choice.selected').getAttribute('data-receipt'),historyTarget);
 assert.equal(await page.locator('#prev-receipts').isEnabled(),true,'history link reveals the correct older page');
 await page.locator('#open-original').click();assert.equal(opened,historyTarget+'.png');
 await page.locator('#receipt-search').fill('Hand-entered rice purchase');assert.equal(await page.locator('#receipt-count').textContent(),'16 receipts');
 await page.locator('#receipt-search').fill('recent.png');
 await page.locator('#approve-receipt').click();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal(saved.receipts.find(r=>r.id==='recent').status,'Reviewed');
 assert.ok(!(await page.locator('#notice').textContent()).includes('UNRELATED OLD REVIEW'));
 await page.evaluate(id=>openReceiptRecord(id),historyTarget);
 await page.locator('#approve-receipt').click();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.ok((await page.locator('#notice').textContent()).includes('older purchases saved to history'));
 assert.ok(!(await page.locator('#notice').textContent()).includes('UNRELATED OLD REVIEW'));
 const undoBefore=history.length;await page.locator('#add-receipts').click();assert.equal(history.length,undoBefore,'duplicate receipt checks preserve undo');
 // Failed line editing can be retried without losing the edited recipe reference.
 await page.locator('[data-tab=recipes]').click();await page.locator('[data-edit-line]').first().click();
 const quantity=Number(await page.locator('[name=quantity]').inputValue());await page.locator('[name=quantity]').fill(String(quantity+1));failNext=true;
 await page.locator('#dialog-submit').click();await page.getByText('Simulated disk full',{exact:true}).waitFor();
 await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal(saved.recipes[0].lines[0].quantity,quantity+1);
 // Automatic pickup starts from choosing a folder and adds drafts without approving prices.
 await page.locator('[data-tab=settings]').click();folderRecords=[makeReceipt('automatic')];const masterPrice=saved.ingredients.find(i=>i.id===ingredient.id).price;
 await page.locator('#choose-inbox').click();await page.waitForFunction(()=>HeidyApp.getState().receipts.some(r=>r.id==='automatic')&&document.querySelector('#save-status').textContent==='Saved on this Mac');
 assert.equal(saved.receipts.find(r=>r.id==='automatic').status,'Needs review');assert.equal(saved.ingredients.find(i=>i.id===ingredient.id).price,masterPrice);
 // Folder selection cancellation/failure must preserve the current folder and data.
 const previousFolder=await page.locator('#inbox-path').innerText(),beforeCancel=clone(saved);
 chosenFolder=null;await page.locator('#choose-inbox').click();
 assert.equal(await page.locator('#inbox-path').innerText(),previousFolder);assert.deepEqual(saved,beforeCancel);
 chosenFolder=Error('Folder access unavailable');await page.locator('#choose-inbox').click();
 assert.equal(await page.locator('#inbox-path').innerText(),previousFolder);assert.deepEqual(saved,beforeCancel);
 // Switching while Settings has an unsaved draft keeps that draft and picks up the new source.
 await page.locator('[name=laborRate]').fill('31');
 chosenFolder='/isolated/second-receipts';folderRecords=[makeReceipt('second-folder')];
 await page.locator('#choose-inbox').click();
 await page.waitForFunction(()=>HeidyApp.getState().receipts.some(r=>r.id==='second-folder')&&document.querySelector('#save-status').textContent==='Saved on this Mac');
 assert.equal(await page.locator('#inbox-path').innerText(),chosenFolder);
 assert.equal(await page.locator('[name=laborRate]').inputValue(),'31');
 assert.ok(saved.receipts.some(r=>r.id==='automatic'));assert.equal(saved.ingredients.find(i=>i.id===ingredient.id).price,masterPrice);
 console.log('Folder UI checks passed: cancel/error preserve selection; A to B changes path and imports drafts; existing receipts, master prices and unsaved settings retained.');
 const savesBefore=history.length;await page.evaluate(()=>checkInboxAutomatically());assert.equal(history.length,savesBefore);
 const scansBefore=scans;await page.locator('[name=laborRate]').focus();await page.evaluate(()=>checkInboxAutomatically());assert.equal(scans,scansBefore,'automatic checks pause while editing');
 await page.locator('[data-tab=recipes]').click();
 await page.screenshot({path:path.join(work,'recipe-light.png'),fullPage:true});
 await page.setViewportSize({width:760,height:700});await page.emulateMedia({colorScheme:'dark'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(work,'recipe-dark-narrow.png'),fullPage:true});
 await page.locator('[data-tab=ingredients]').click();await page.locator('#ingredient-search').fill(ingredient.name);await page.locator('[data-ingredient="'+ingredient.id+'"]').click();
 await page.getByText(/^Purchase history \(/).click();await page.screenshot({path:path.join(work,'history-dark.png'),fullPage:true});

 await page.locator('#dialog-cancel').click();
 // Navigation restoration and unsaved settings must survive screen changes.
 await page.locator('[data-tab=prices]').click();
 await page.locator('#price-search').fill(saved.recipes[0].name);
 await page.locator('[data-open-recipe]').first().click();
 await page.locator('#back-view').click();
 assert.equal(await page.locator('#price-search').inputValue(),saved.recipes[0].name);
 await page.locator('[data-tab=settings]').click();
 await page.locator('[name=laborRate]').fill('31.25');
 await page.locator('[data-tab=ingredients]').click();
 await page.locator('[data-tab=settings]').click();
 assert.equal(await page.locator('[name=laborRate]').inputValue(),'31.25');
 assert.notEqual(saved.settings.laborRate,31.25,'draft must not silently persist');
 await page.locator('#settings-form button').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved on this Mac');
 assert.equal(saved.settings.laborRate,31.25);
 // Both selling prices remain editable across navigation and actual save acknowledgements.
 await page.locator('[data-tab=prices]').click();await page.locator('#price-search').fill('');
 for(const [kind,value] of [['retail','9.75'],['bulk','7.25']]) {
   await page.locator('[data-price-kind='+kind+']').first().fill(value);
   await page.locator('[data-tab=ingredients]').click();
   await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved on this Mac');
   assert.equal(saved.recipes[0][kind],Number(value));
   await page.locator('[data-tab=prices]').click();
 }
 // Copy and delete keep existing dialogs and persistence contracts.
 await page.locator('[data-open-recipe]').first().click();
 const originalCount=saved.recipes.length;
 await page.locator('#copy-recipe').click();
 await page.locator('[name=name]').fill('Refresh verification copy');
 await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
 assert.equal(saved.recipes.length,originalCount+1);
 await page.locator('#delete-recipe').click();await page.locator('#dialog-submit').click();
 await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(saved.recipes.length,originalCount);
 const expectedTabs=['prices','recipes','ingredients','receipts','margin-watch','settings'];
 assert.deepEqual(await page.locator('[data-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),expectedTabs);
 for(const mode of ['light','dark']) {
   await page.emulateMedia({colorScheme:mode});
   for(const width of [760,1100,1440]) {
     await page.setViewportSize({width,height:900});
     for(const destination of expectedTabs) {
       await page.locator('[data-tab="'+destination+'"]').click();
       assert.equal(await page.locator('[aria-current=page]').getAttribute('data-tab'),destination);
       assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.querySelector('.workspace').scrollWidth<=document.querySelector('.workspace').clientWidth),'no window overflow: '+destination+' '+width);
       await page.screenshot({path:path.join(work,destination+'-'+mode+'-'+width+'.png')});
     }
   }
 }
 await page.locator('#nav-toggle').click();assert.equal(await page.locator('#app-nav').isVisible(),false);
 await page.locator('#nav-toggle').click();assert.equal(await page.locator('#app-nav').isVisible(),true);
 console.log('Refresh checks passed: back navigation, filter retention, settings drafts, retail/bulk persistence, copy/delete, all six screens at 760/1100/1440px in both appearances.');
 assert.deepEqual(errors,[]);await browser.close();
 console.log('UI regressions passed: bulk/labour/cost-review controls, legacy history, correct receipt paging/search/toasts, save retry, duplicate undo, automatic draft pickup, and narrow dark layout.');
})().catch(async e=>{console.error(e);if(testBrowser)await testBrowser.close();process.exitCode=1});
