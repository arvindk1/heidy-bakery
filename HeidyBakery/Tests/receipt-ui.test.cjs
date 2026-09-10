// Exercises receipt review through the UI with an isolated, failure-capable storage bridge.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../Resources/model.js'),root=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const work=path.resolve(process.argv[2]||path.join(root,'work/receipt-ui'));fs.mkdirSync(work,{recursive:true});
function fixture(){const s=M.empty();s.imported=true;s.ingredients=[['rice','Rice Flour'],['bread','Bread Flour']].map(([id,name])=>({id,name,kind:'ingredient',price:10,size:1000,unit:'g',supplier:'Costco',updated:'2026-07-01',history:[]}));s.recipes=[{id:'cake',name:'Rice Cake',yield:10,unit:'piece',laborHours:0,laborEffort:'Custom',otherCost:0,retail:4,bulk:3,bulkMin:1,bulkPackaging:null,bulkLaborHours:null,notes:'',category:'',lines:[{id:'line',ingredientId:'rice',quantity:100,unit:'g',perPiece:false}]}];return s;}
function receipt(id,text,date='2026-08-01'){return{id,file:id+'.png',originalName:id+'.png',supplier:'Costco',date,text,status:'Needs review',lines:[],importedAt:'2026-09-01T12:00:00Z'};}
let browser;
(async()=>{
 let saved=fixture(),history=[],failNext=false,inbox='',scanResult={records:[],errors:[],pending:0,duplicates:0};
 saved.receipts=[receipt('first','COSTCO\n123456 RICE FLR 30.00\nTAX 0.00'),receipt('ambiguous','COSTCO\nFLOUR 10.00\nTAX 0.00')];
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{try{let result;switch(action){
 case'load':result={state:clone(saved),seed:fixture(),inbox,appVersion:{version:'0.3.3',build:'6'}};break;
 case'save':if(failNext){failNext=false;throw Error('Test disk full');}M.validate(payload);history.push(clone(saved));saved=clone(payload);result=true;break;
 case'undo':saved=history.pop();result=clone(saved);break;
 case'previewReceipt':result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';break;
 case'chooseInbox':inbox='/test/receipts';result=inbox;break;
 case'scanInbox':result=clone(scanResult);break;
 default:throw Error('Unexpected action '+action);
 }return{id,result};}catch(e){return{id,error:e.message};}});
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 async function load(){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();await page.waitForFunction(()=>['Saved on this Mac','Stored on this Mac'].includes(document.querySelector('#save-status').textContent));}
 async function open(id){await page.evaluate(id=>openReceiptRecord(id),id);await page.locator('#approve-receipt').waitFor();}
 async function submit(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 await load();await open('ambiguous');assert.equal(saved.receipts.find(r=>r.id==='ambiguous').lines[0].ingredientId,'');
 await page.locator('[data-edit-purchase="0"]').click();assert.equal(await page.locator('[data-match]').count(),2);await page.locator('[data-match=rice]').click();assert.equal(await page.locator('[name=ingredientId]').inputValue(),'rice');await page.locator('#dialog-cancel').click();assert.equal(saved.receipts.find(r=>r.id==='ambiguous').lines[0].ingredientId,'','Cancel changed match');
 await open('first');assert.equal(saved.receipts.find(r=>r.id==='first').lines[0].ingredientId,'rice');
 await page.locator('#approve-receipt').click();assert.equal(await page.locator('#dialog').isVisible(),false,'Incomplete receipt reached approval');
 await page.locator('[data-edit-purchase="0"]').click();assert.equal(await page.locator('[name=productCode]').inputValue(),'123456');
 await page.locator('[name=packSize]').fill('1000');await page.locator('[name=packageCount]').fill('2');assert.equal(await page.locator('[name=size]').inputValue(),'2000');
 await page.locator('[name=size]').fill('1000');await page.locator('#dialog-submit').click();assert.match(await page.locator('#dialog-error').innerText(),/Pack size/);await page.locator('[name=size]').fill('2000');await submit();
 assert.equal(await page.locator('.receipt-ready').count(),1);assert.equal(await page.locator('.receipt-ready').getAttribute('open'),null);
 const before=clone(saved);await page.locator('#approve-receipt').click();let preview=await page.locator('#dialog-body').innerText();assert.match(preview,/50.0%/);assert.match(preview,/Rice Cake/);assert.match(preview,/\$0.15/);await page.locator('#dialog-cancel').click();assert.deepEqual(saved,before,'Preview changed state');
 await page.locator('#approve-receipt').click();failNext=true;await page.locator('#dialog-submit').click();await page.locator('#dialog-error').getByText('Test disk full',{exact:true}).waitFor();assert.deepEqual(saved,before,'Failed approval changed records');assert.equal(Object.keys(saved.mappings).length,0);
 await submit();assert.equal(saved.ingredients[0].price,30);assert.equal(saved.mappings['costco|sku:123456'].packSize,1000);assert.equal(saved.recipes[0].retail,4);assert.match(await page.locator('#receipt-result').innerText(),/1 ingredient prices updated/);
 await page.locator('[data-view-ingredient=rice]').click();assert.equal(await page.locator('[name=name]').inputValue(),'Rice Flour');await page.locator('#dialog-cancel').click();
 // Reload proves that learning comes from saved data, and a different pack count changes the total.
 const repeat=receipt('repeat','COSTCO\n3 @ 15.00\n123456 RCE FL 45.00\nTAX 0.00','2026-08-02');saved.receipts.push(repeat);await load();await open('repeat');let line=saved.receipts.find(r=>r.id==='repeat').lines[0];assert.equal(line.size,3000);assert.equal(line.needsReview,false);assert.equal(line.matchReason,'Saved product code');assert.equal(await page.locator('.receipt-ready').count(),1);
 const retailer=page.locator('#receipt-supplier');await retailer.fill('Other shop');await retailer.dispatchEvent('change');await page.waitForFunction(()=>HeidyApp.getState().receipts.find(r=>r.id==='repeat').supplier==='Other shop'&&document.querySelector('#save-status').textContent==='Saved on this Mac');assert.equal(saved.receipts.find(r=>r.id==='repeat').lines[0].size,null,'Saved pack leaked after retailer change');assert.equal(saved.receipts.find(r=>r.id==='repeat').lines[0].needsReview,true);await page.locator('#receipt-supplier').fill('Costco');await page.locator('#receipt-supplier').dispatchEvent('change');await page.locator('.receipt-ready').waitFor();
 await page.locator('.receipt-ready > summary').click();await page.locator('[data-edit-purchase="0"]').click();await page.locator('[name=price]').fill('90');await submit();await page.locator('#approve-receipt').click();assert.match(await page.locator('#dialog-body').innerText(),/100.0%/);await submit();
 // Saved matches still require confirmation for unusually large changes.
 saved.receipts.push(receipt('large','COSTCO\n123456 RCE FL 60.00\nTAX 0.00','2026-08-03'));await load();await open('large');await page.locator('#approve-receipt').click();assert.equal(await page.locator('#dialog').isVisible(),false);assert.match(await page.locator('#receipt-readiness').innerText(),/price change/);await page.locator('[data-confirm-purchase="0"]').click();await page.locator('.receipt-ready').waitFor();await page.locator('#approve-receipt').click();await page.locator('#dialog-cancel').click();
 // A correction is learned only after approval, and undo restores both prices and mappings.
 await page.locator('.receipt-ready > summary').click();await page.locator('[data-edit-purchase="0"]').click();await page.locator('[name=ingredientId]').selectOption('bread');await submit();assert.equal(saved.mappings['costco|sku:123456'].ingredientId,'rice');const beforeCorrection=clone(saved);await page.locator('#approve-receipt').click();await submit();assert.equal(saved.mappings['costco|sku:123456'].ingredientId,'bread');
 await page.locator('[data-tab=settings]').click();await page.locator('#undo').click();await submit();assert.deepEqual(saved,beforeCorrection);
 assert.equal(await page.locator('#app-version').innerText(),'Version 0.3.3 · Build 6');
 // Folder status reports pending names and errors, then clears them after recovery.
 scanResult={records:[],errors:['Cannot read broken.pdf'],pending:1,pendingFiles:['waiting.jpg'],duplicates:0};await page.locator('#choose-inbox').click();await page.getByText('Cannot read broken.pdf',{exact:true}).waitFor();assert.match(await page.locator('[data-pickup-status]').innerText(),/1 file\(s\) waiting/);await page.getByText('Waiting files',{exact:true}).click();await page.getByText('waiting.jpg',{exact:true}).waitFor();
 scanResult={records:[],errors:[],pending:0,pendingFiles:[],duplicates:0};await page.evaluate(()=>importReceipts('scanInbox'));assert.doesNotMatch(await page.locator('[data-pickup-status]').innerText(),/Cannot read|waiting/);assert.doesNotMatch(await page.locator('[data-pickup-status]').innerText(),/Last successful check: Not yet/);
 // Screens at both sizes include expanded review content, not only collapsed rows.
 await open('large');await page.locator('.receipt-ready > summary').click();await page.screenshot({path:path.join(work,'receipt-light.png'),fullPage:true});await page.setViewportSize({width:760,height:800});await page.emulateMedia({colorScheme:'dark'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#approve-receipt').click();await page.screenshot({path:path.join(work,'preview-dark.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.querySelector('#dialog').scrollWidth<=document.querySelector('#dialog').clientWidth));
 // Local parsing provenance survives editing and reloading; repeated scans add no duplicates.
 await page.locator('#dialog-cancel').click();
 saved.receipts.push(receipt('costco-ocr',fs.readFileSync(path.join(__dirname,'fixtures/costco-ocr.txt'),'utf8')));
 await load();await open('costco-ocr');
 assert.equal(saved.receipts.find(r=>r.id==='costco-ocr').lines.length,9);
 await page.getByText('Item number read as 3; check the original receipt.',{exact:true}).waitFor();
 await page.getByText('OCR marks were removed before the item number. Check the original receipt.',{exact:true}).waitFor();
 await page.locator('[data-edit-purchase="0"]').click();
 await page.locator('[name=description]').fill('My milk description');await submit();
 const parsedBefore=clone(saved.receipts.find(r=>r.id==='costco-ocr').lines);
 await page.evaluate(()=>suggestPurchases(state.receipts.find(r=>r.id==='costco-ocr')));
 assert.equal(await page.locator('#dialog').isVisible(),false);assert.deepEqual(saved.receipts.find(r=>r.id==='costco-ocr').lines,parsedBefore);
 await load();await open('costco-ocr');await page.evaluate(()=>suggestPurchases(state.receipts.find(r=>r.id==='costco-ocr')));
 assert.equal(saved.receipts.find(r=>r.id==='costco-ocr').lines.length,9);assert.equal(saved.receipts.find(r=>r.id==='costco-ocr').lines[0].description,'My milk description');
 await page.screenshot({path:path.join(work,'local-parser-review.png'),fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({passed:true,checks:['ambiguous candidates and cancel','descriptive matching and SKU','pack multiplication and conflict','unresolved and ready grouping','unit price and recipe preview','cancel and failed-save rollback/retry','saved learning after reload','different counts','large price confirmation','correction learned on approval','undo price and mapping','ingredient result link','version/build','folder pending/error/recovery','light/dark and narrow layout','local OCR warnings','edited source rows do not duplicate after reload']},null,2));console.log('Receipt UI checks passed.');await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1);});
