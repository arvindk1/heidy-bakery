const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/saved-products-ui');fs.mkdirSync(work,{recursive:true});
let saved=fixture(),history=[],failNext=false,browser;
saved.receipts[0].lines=saved.receipts[0].lines.filter(l=>l.ingredientId==='butter');
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await context.setOffline(true);
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
  try {let result;
   switch(action){
    case 'load':result={state:clone(saved),seed:fixture(),inbox:'',appVersion:{version:'0.3.5',build:'8'}};break;
    case 'save':if(failNext){failNext=false;throw Error('Test save failed');}M.normalizeState(payload);history.push(clone(saved));saved=clone(payload);result=true;break;
    case 'undo':saved=history.pop();result=clone(saved);break;
    case 'previewReceipt':result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';break;
    default:throw Error('Unexpected action '+action);
   }return{id,result};
  }catch(e){return{id,error:e.message};}
 });
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 async function load(id='legacy'){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();await page.evaluate(id=>openReceiptRecord(id),id);await page.locator('#approve-receipt').waitFor();}
 async function edit(){const button=page.locator('[data-edit-purchase="0"]');if(!await button.isVisible())await page.locator('.receipt-ready > summary').click();await button.click();}
 async function submit(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 async function parse(text){await page.getByText('Paste product details',{exact:true}).click();await page.locator('[name=productNotes]').fill(text);await page.locator('#parse-product').click();}
 await load();const initial=clone(saved);
 await edit();await parse('Butter, 1..2 lb');assert.match(await page.locator('#paste-preview').innerText(),/unclear/);assert.equal(await page.locator('[name=packSize]').inputValue(),'');
 await page.locator('[name=productNotes]').fill('Butter, Unsalted, 1 lb, 4 ct');await page.locator('#parse-product').click();await page.locator('#apply-paste').click();assert.equal(await page.locator('[name=packSize]').inputValue(),'');
 await page.locator('#confirm-paste').check();await page.locator('#apply-paste').click();assert.equal(await page.locator('[name=size]').inputValue(),'8');assert.equal(await page.locator('[name=packageCount]').inputValue(),'2');
 await page.screenshot({path:path.join(work,'paste-preview.png'),fullPage:true});await page.locator('#dialog-cancel').click();assert.deepEqual(saved,initial,'Cancelled paste reached storage');
 await edit();await parse('Butter, Unsalted, 1 lb, 4 ct');await page.locator('#confirm-paste').check();await page.locator('#apply-paste').click();await submit();
 assert.equal(saved.receipts[0].lines[0].unit,'lb');assert.equal(saved.products,undefined,'Draft learned a trusted match');assert.deepEqual(saved.ingredients,initial.ingredients);
 await page.locator('#approve-receipt').click();await page.evaluate(()=>{state.settings.laborRate+=1;});await page.locator('#dialog-submit').click();await page.getByText(/Records changed/).waitFor();assert.equal(saved.products,undefined,'Stale approval changed prices');await page.locator('#dialog-cancel').click();await page.evaluate(()=>{state=clone(lastSaved);render();});
 await page.locator('#approve-receipt').click();await submit();
 const first=M.savedProduct(saved,'Costco','','384962');assert.equal(first.packSize,4);assert.equal(first.provenance.source,'Pasted details, confirmed');
 const repeat={...clone(saved.receipts[0]),id:'repeat',date:'2026-09-09',status:'Needs review',text:'',lines:[M.suggestReceiptLine(saved,'Costco',{description:'KS U/S QTRS',productCode:'384962',size:null,packSize:null,unit:'',packageCount:2,price:18.98,excluded:false})]};saved.receipts.push(repeat);
 await load('repeat');const beforeCorrection=clone(saved);
 await edit();await page.getByText('Remembered product details',{exact:true}).click();await page.locator('[name=rememberedPack]').fill('5');await page.locator('#review-remembered').click();await page.locator('[name=confirmProductChange]').check();
 await page.screenshot({path:path.join(work,'remembered-change.png'),fullPage:true});await page.locator('#dialog-cancel').click();assert.deepEqual(saved,beforeCorrection);
 await edit();await page.getByText('Remembered product details',{exact:true}).click();await page.locator('[name=rememberedPack]').fill('5');await page.locator('#review-remembered').click();await page.locator('[name=confirmProductChange]').check();
 failNext=true;await page.locator('#dialog-submit').click();await page.getByText(/Test save failed/).first().waitFor();assert.equal(M.savedProduct(saved,'Costco','','384962').packSize,4);
 await submit();assert.equal(M.savedProduct(saved,'Costco','','384962').packSize,5);assert.deepEqual(saved.ingredients,beforeCorrection.ingredients);
 await load('repeat');await edit();await page.getByText('Remembered product details',{exact:true}).click();await page.locator('#forget-product').click();await page.locator('[name=confirmProductChange]').check();await submit();assert.equal(M.savedProduct(saved,'Costco','','384962'),null);
 await page.locator('[data-tab=settings]').click();await page.locator('#undo').click();await submit();assert.equal(M.savedProduct(saved,'Costco','','384962').packSize,5);
 // An old manually-entered receipt requires explicit reconciliation, not silent suppression.
 saved=fixture();history=[];await load();await page.locator('#suggest-lines').click();assert.ok(await page.locator('[name^=reconcile]').count()>0);
 await page.locator('#dialog-submit').click();await page.getByText(/Choose whether each purchase/).waitFor();
 const plans=M.receiptReconciliation(saved,saved.receipts[0]);
 for(let n=0;n<plans.length;n++)await page.locator('[name=reconcile-'+n+']').selectOption(String(plans[n].possible[0]));
 await submit();const totals=saved.receipts[0].lines.map(l=>l.price);await page.locator('#suggest-lines').click();assert.equal(await page.locator('#dialog').isVisible(),false);assert.deepEqual(saved.receipts[0].lines.map(l=>l.price),totals);
 await page.setViewportSize({width:760,height:900});await page.emulateMedia({colorScheme:'dark'});await edit();await parse('Cream, 1 qt');await page.screenshot({path:path.join(work,'narrow-dark.png'),fullPage:true});await page.locator('#dialog-cancel').click();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Saved product UI passed offline: paste validation/confirmation/cancel, draft-only changes, approval, remembered correction rollback/retry, reload, forget/undo, explicit reconciliation and narrow dark editor.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
