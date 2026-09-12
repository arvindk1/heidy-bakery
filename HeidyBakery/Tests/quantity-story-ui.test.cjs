const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const root=path.resolve(__dirname,'..'),work=path.join(root,'output/playwright/quantity-story');fs.mkdirSync(work,{recursive:true});
function library(count=1){const s=fixture();s.receipts[0].text='';s.receipts[0].lines=[{description:'ORG BANANAS',originalDescription:'2619 ORG BANANAS',productCode:'2619',ingredientId:'banana',price:2.19,size:null,unit:'g',packSize:null,packageCount:count,excluded:false,reviewMode:true,priceChangeConfirmed:true,needsReview:false}];return s;}
let saved=library(),browser,failSave=false;
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];
 await context.setOffline(true);page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{try{
  let result;
  if(action==='load')result={state:clone(saved),seed:fixture(),inbox:''};
  else if(action==='save'){if(failSave){failSave=false;throw Error('Test save failed');}saved=M.validate(clone(payload));result=true;}
  else if(action==='previewReceipt')result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
  else throw Error('Unexpected action '+action);
  return{id,result};
 }catch(e){return{id,error:e.message};}});
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 const input=name=>page.locator('#dialog [name='+name+']');
 async function load(){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();await page.evaluate(()=>openReceiptRecord('legacy'));await page.locator('#approve-receipt').waitFor();}
 async function edit(){const b=page.locator('[data-edit-purchase="0"]');if(!await b.isVisible())await page.locator('.receipt-ready > summary').click();await b.click();}
 async function submit(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 await load();const initial=clone(saved);await edit();
 assert.equal(await page.evaluate(()=>document.activeElement.name),'size');
 assert.equal(await page.locator('#purchase-quantity').evaluate(el=>el.classList.contains('needs-quantity')),true);
 for(const id of ['receipt-details','purchase-packs','purchase-exceptions'])assert.equal(await page.locator('#'+id).getAttribute('open'),null);
 assert.equal(await page.locator('#total-quantity-label').innerText(),'Total weight purchased');
 assert.equal(await page.locator('#use-master-pack').innerText(),'Use 700 g as total');
 await page.screenshot({path:path.join(work,'banana-first-review.png')});
 await page.locator('#use-master-pack').click();assert.equal(await input('size').inputValue(),'700');assert.equal(await input('packSize').inputValue(),'700');assert.equal(await input('packageCount').inputValue(),'1');
 assert.match(await page.locator('#quantity-next').innerText(),/700 g selected as the total/);
 assert.match(await page.locator('#purchase-review-summary').innerText(),/Banana · \$2.19 for 700 g/);
 await input('size').fill('750');assert.equal(await input('packSize').inputValue(),'750');
 await page.locator('#dialog-cancel').click();assert.deepEqual(saved,initial,'Cancel changed the library');
 await edit();await page.locator('#use-master-pack').click();failSave=true;await page.locator('#dialog-submit').click();await page.getByText('Test save failed',{exact:true}).waitFor();assert.deepEqual(saved,initial);await submit();
 assert.equal(saved.receipts[0].lines[0].size,700);assert.deepEqual(saved.ingredients,initial.ingredients);assert.deepEqual(saved.recipes,initial.recipes);
 await page.locator('#approve-receipt').click();await submit();assert.equal(saved.ingredients.find(i=>i.id==='banana').price,2.19);assert.equal(M.unitCost(saved.ingredients.find(i=>i.id==='banana')),2.19/700);
 // Old purchase totals are never multiplied by the current pack count.
 saved=library(2);await load();await edit();assert.notEqual(await page.locator('#purchase-packs').getAttribute('open'),null);
 await page.locator('#use-master-pack').click();assert.equal(await input('size').inputValue(),'700');assert.equal(await input('packSize').inputValue(),'350');assert.equal(await input('packageCount').inputValue(),'2');
 await input('packSize').fill('700');assert.equal(await input('size').inputValue(),'1400');assert.match(await page.locator('#pack-calculation').innerText(),/700 g × 2 packs = 1400 g/);
 await input('size').fill('1600');assert.equal(await input('packSize').inputValue(),'800');
 await input('unit').fill('kg');await page.locator('#use-master-pack').click();assert.equal(await input('size').inputValue(),'0.7');assert.equal(await input('packSize').inputValue(),'0.35');
 await input('unit').fill('each');assert.equal(await page.locator('#use-master-pack').count(),0);assert.equal(await page.locator('#weight-bridge').isVisible(),true);
 await page.locator('#purchase-exceptions > summary').click();await input('excluded').check();assert.equal(await page.locator('#unit-bridge').isVisible(),false);assert.match(await page.locator('#purchase-review-summary').innerText(),/Excluded/);await submit();assert.equal(saved.receipts[0].lines[0].excluded,true);
 // An unresolved purchase stays in review; entering a quantity alone never invents a match.
 saved=library();saved.receipts[0].lines[0].ingredientId='';saved.receipts[0].lines[0].description='Unknown produce';saved.receipts[0].lines[0].productCode='';await load();await edit();assert.match(await page.locator('#quantity-next').innerText(),/choose the ingredient/);
 await input('size').fill('500');await submit();assert.equal(saved.receipts[0].lines[0].ingredientId,'');await page.locator('#approve-receipt').click();assert.equal(await page.locator('#dialog').isVisible(),false);
 // New ingredients, free items, and removal remain reachable through the disclosures.
 await edit();await input('ingredientId').selectOption('__new__');await input('newName').fill('Test produce');await input('newUnit').fill('g');await input('price').fill('0');await page.locator('#purchase-exceptions > summary').click();await input('freeConfirmed').check();await submit();assert.equal(saved.ingredients.find(i=>i.name==='Test produce').price,null);assert.equal(saved.receipts[0].lines[0].freeConfirmed,true);
 await edit();await input('remove').check();assert.match(await page.locator('#purchase-review-summary').innerText(),/will be removed/);await submit();assert.equal(saved.receipts[0].lines.length,0);
 saved=library();await load();await edit();await page.setViewportSize({width:760,height:900});await page.emulateMedia({colorScheme:'dark'});
 assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(work,'banana-dark.png')});
 await page.setViewportSize({width:520,height:800});const shortcut=await page.locator('#use-master-pack').boundingBox(),footer=await page.locator('#dialog .dialog-actions').boundingBox();assert.ok(shortcut.y+shortcut.height<=footer.y,'Previous quantity shortcut is hidden below the fixed actions');assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(work,'banana-narrow.png')});await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('Quantity user story passed: missing-weight focus, previous-total shortcut, edit/cancel/failure/retry, draft isolation, approval, multiple packs without multiplying historical totals, same-category conversion, measured-weight guidance, unmatched review, new ingredient, free/excluded/removed lines and narrow dark layout.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
