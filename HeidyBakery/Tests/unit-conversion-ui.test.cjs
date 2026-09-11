const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/unit-conversion-ui');fs.mkdirSync(work,{recursive:true});
function library(id,unit,size,code){const s=fixture();s.receipts[0].lines=[{description:id,ingredientId:id,productCode:code,price:10,size,unit,packSize:size,packageCount:1,excluded:false,needsReview:false,priceChangeConfirmed:true,reviewMode:true}];return s;}
let saved=library('milk','gal',1,'milk-code'),history=[],failNext=false,browser;
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});await context.setOffline(true);
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{try{let result;
  if(action==='load')result={state:clone(saved),seed:fixture(),inbox:'',appVersion:{version:'0.3.6',build:'9'}};
  else if(action==='save'){if(failNext){failNext=false;throw Error('Test save failed');}M.normalizeState(payload);history.push(clone(saved));saved=clone(payload);result=true;}
  else if(action==='undo'){saved=history.pop();result=clone(saved);}
  else if(action==='previewReceipt')result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
  else throw Error('Unexpected action '+action);return{id,result};
 }catch(e){return{id,error:e.message};}});
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 const input=name=>page.locator('[name='+name+']');
 async function load(id='legacy'){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();await page.evaluate(id=>openReceiptRecord(id),id);await page.locator('#approve-receipt').waitFor();}
 async function edit(){const b=page.locator('[data-edit-purchase="0"]');if(!await b.isVisible())await page.locator('.receipt-ready > summary').click();await b.click();}
 async function submit(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 async function approve(){await page.locator('#approve-receipt').click();await submit();}
 await load();const initial=clone(saved);await edit();assert.equal(await input('receiptDensity').inputValue(),'');assert.match(await page.locator('#bridge-result').innerText(),/needs review/);
 await page.locator('#use-density-suggestion').click();assert.equal(await input('receiptDensity').inputValue(),'1.03');assert.equal(await input('densityConfirmed').isChecked(),false);
 await page.locator('#dialog-submit').click();await page.getByText('Confirm the density before using it.',{exact:true}).waitFor();assert.deepEqual(saved,initial);
 await input('densityConfirmed').check();assert.match(await page.locator('#bridge-result').innerText(),/3898\.974138 g/);
 await page.screenshot({path:path.join(work,'density-confirmation.png'),fullPage:true});await page.locator('#dialog-cancel').click();assert.deepEqual(saved,initial);
 await edit();await page.locator('#use-density-suggestion').click();await input('densityConfirmed').check();await submit();assert.deepEqual(saved.ingredients,initial.ingredients);
 await load();await edit();assert.equal(await input('densityConfirmed').isChecked(),true);await page.locator('#dialog-cancel').click();await approve();assert.equal(saved.ingredients.find(i=>i.id==='milk').density,1.03);
 const milkCost=M.unitCost(saved.ingredients.find(i=>i.id==='milk'));assert.equal(milkCost,10/(3785.411784*1.03));
 saved.receipts.push({...clone(saved.receipts[0]),id:'milk-repeat',date:'2026-09-02',status:'Needs review',lines:[{...clone(initial.receipts[0].lines[0]),price:10}]});
 await load('milk-repeat');await edit();assert.equal(await input('receiptDensity').inputValue(),'1.03');assert.equal(await input('densityConfirmed').isChecked(),false);assert.match(await page.locator('#bridge-result').innerText(),/3898\.974138/);
 await input('receiptDensity').fill('1.04');await page.locator('#dialog-submit').click();await page.getByText('Confirm the density before using it.',{exact:true}).waitFor();await input('densityConfirmed').check();await submit();assert.equal(M.unitCost(saved.ingredients.find(i=>i.id==='milk')),milkCost,'Draft changed master price');await approve();assert.equal(saved.ingredients.find(i=>i.id==='milk').density,1.04);
 assert.equal(M.purchaseQuantity(saved,saved.receipts[0],saved.receipts[0].lines[0]).size,3785.411784*1.03);
 saved=library('banana','each',6,'2619');history=[];await load();const before=clone(saved);await edit();assert.equal(await input('measuredTotalWeight').inputValue(),'');assert.match(await page.locator('#weight-help').innerText(),/measured total weight/);assert.match(await page.locator('#bridge-result').innerText(),/needs review/);
 await input('measuredTotalWeight').fill('900');await page.locator('#dialog-submit').click();await page.getByText('Confirm the measured total weight of this purchase.',{exact:true}).waitFor();await input('weightConfirmed').check();assert.match(await page.locator('#bridge-result').innerText(),/900 g · 150 g per item/);
 await input('packageCount').fill('2');assert.equal(await input('weightConfirmed').isChecked(),false);await input('packageCount').fill('1');await input('weightConfirmed').check();
 failNext=true;await page.locator('#dialog-submit').click();await page.getByText('Test save failed',{exact:true}).waitFor();assert.deepEqual(saved,before);await submit();assert.deepEqual(saved.ingredients,before.ingredients);assert.equal(saved.products,undefined);
 await load();await edit();assert.equal(await input('measuredTotalWeight').inputValue(),'900');assert.equal(await input('weightConfirmed').isChecked(),true);await page.screenshot({path:path.join(work,'measured-weight.png'),fullPage:true});await page.locator('#dialog-cancel').click();await approve();
 assert.equal(M.savedProduct(saved,'Costco','','2619').avgUnitWeight,150);assert.equal(saved.ingredients.find(i=>i.id==='banana').avgUnitWeight,150);
 const approved=clone(saved);saved.receipts.push({...clone(before.receipts[0]),id:'banana-repeat',date:'2026-09-02',lines:[M.suggestReceiptLine(saved,'Costco',{description:'ORG BANANAS',productCode:'2619',price:20,size:12,packSize:6,packageCount:2,unit:'each',excluded:false})]});
 await load('banana-repeat');await edit();assert.equal(await input('measuredTotalWeight').inputValue(),'');assert.match(await page.locator('#weight-help').innerText(),/Remembered measured weight: 150/);assert.match(await page.locator('#bridge-result').innerText(),/1800 g/);
 await input('productCode').fill('different');assert.match(await page.locator('#bridge-result').innerText(),/needs review/);assert.equal(await input('measuredTotalWeight').inputValue(),'');await page.locator('#dialog-cancel').click();
 await edit();await submit();await approve();assert.equal(saved.ingredients.find(i=>i.id==='banana').size,1800);assert.equal(M.savedProduct(saved,'Costco','','2619').avgUnitWeight,150);
 await page.locator('[data-tab=settings]').click();await page.locator('#undo').click();await submit();assert.equal(saved.ingredients.find(i=>i.id==='banana').size,approved.ingredients.find(i=>i.id==='banana').size);
 await page.setViewportSize({width:760,height:900});await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>openReceiptRecord('banana-repeat'));await edit();await page.screenshot({path:path.join(work,'narrow-dark.png'),fullPage:true});await page.locator('#dialog-cancel').click();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Unit conversion UI passed offline: opt-in density, measured-only count, cancel/save failure/retry, draft isolation, approval, reload/reuse, SKU isolation, undo, history and narrow dark editor.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
