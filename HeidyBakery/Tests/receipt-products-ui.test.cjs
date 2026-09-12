const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const root=path.resolve(__dirname,'..'),work=path.resolve(process.argv[2] || path.join(root,'work/receipt-products-ui'));
fs.mkdirSync(work,{recursive:true});let browser,page,saved=fixture(),history=[],failNext=false;
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1200,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
  try{let result;
   switch(action){
    case 'load':result={state:clone(saved),seed:fixture(),inbox:'',appVersion:{version:'0.3.4',build:'7'}};break;
    case 'save':if(failNext){failNext=false;throw Error('Test save failed');}M.validate(payload);history.push(clone(saved));saved=clone(payload);result=true;break;
    case 'undo':saved=history.pop();result=clone(saved);break;
    case 'previewReceipt':result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';break;
    default:throw Error('Unexpected action '+action);
   }return{id,result};
  }catch(e){return{id,error:e.message};}
 });
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 async function load(id='legacy'){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();await page.evaluate(id=>openReceiptRecord(id),id);await page.locator('#approve-receipt').waitFor();}
 async function submit(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 async function edit(n){await page.locator('[data-edit-purchase="'+n+'"]').click();await page.locator('#purchase-packs').evaluate(el=>el.open=true);}
 await load();
 await page.locator('.purchase strong').getByText('Butter',{exact:true}).waitFor();
 await page.locator('.purchase strong').getByText('Suggested: Croissant',{exact:true}).waitFor();
 const original=clone(saved);
 await page.locator('#refresh-receipt').click();await page.getByText('Suggested: Heavy Cream · 2 qt',{exact:false}).waitFor();await page.locator('#dialog-cancel').click();assert.deepEqual(saved,original);
 await page.locator('#refresh-receipt').click();await page.locator('[name=refresh][value="0"]').uncheck();await submit();
 assert.equal(saved.receipts[0].lines.find(l=>l.ingredientId==='cream').unit,'qt');assert.equal(saved.receipts[0].lines[0].description,'3 WHOLE MILK');
 assert.deepEqual(saved.ingredients,original.ingredients);assert.equal(Object.keys(saved.mappings).length,0);
 const butterIndex=saved.receipts[0].lines.findIndex(l=>l.ingredientId==='butter');
 await edit(butterIndex);assert.equal(await page.locator('[name=packSize]').inputValue(),'');await page.locator('#use-master-pack').click();assert.equal(await page.locator('[name=packSize]').inputValue(),'906');assert.equal(await page.locator('[name=size]').inputValue(),'1812');await page.locator('#dialog-cancel').click();assert.equal(saved.receipts[0].lines[butterIndex].size,null,'Reference was applied on cancel');
 const croissantIndex=saved.receipts[0].lines.findIndex(l=>l.productCode==='1199652');
 await edit(croissantIndex);await page.locator('[data-match=croissant]').click();await page.locator('#use-master-pack').click();await submit();assert.equal(saved.receipts[0].lines[croissantIndex].ingredientId,'croissant');assert.equal(saved.receipts[0].lines[croissantIndex].size,12);assert.equal(saved.ingredients.find(i=>i.id==='croissant').price,10);
 // Create a missing master item explicitly; its receipt is still unapproved.
 const chickenIndex=saved.receipts[0].lines.findIndex(l=>l.productCode==='37719');
 await edit(chickenIndex);await page.locator('[name=ingredientId]').selectOption('__new__');await page.locator('[name=newName]').fill('Chicken salad');await page.locator('[name=newUnit]').fill('g');await page.locator('[name=unit]').fill('g');await page.locator('[name=packSize]').fill('500');await page.locator('[name=packageCount]').fill('1');await submit();
 assert.equal(saved.ingredients.find(i=>i.name==='Chicken salad').price,null);assert.equal(Object.keys(saved.mappings).length,0);
 // Focus the approval fixture on eggs, keeping the actual master recipe in grams.
 saved.receipts[0].lines=[clone(saved.receipts[0].lines.find(l=>l.ingredientId==='egg'))];await load();
 await edit(0);await page.locator('[name=packSize]').fill('60');await page.locator('#recipe-quantity').waitFor();assert.equal(await page.locator('[name=costingPack]').inputValue(),'');
 await page.locator('[name=costingPack]').fill('3000');await page.locator('#dialog-submit').click();assert.match(await page.locator('#dialog-error').innerText(),/Confirm the usable quantity/);
 await page.locator('[name=costingConfirmed]').check();await page.setViewportSize({width:760,height:850});await page.emulateMedia({colorScheme:'dark'});
 assert.ok(await page.evaluate(()=>document.querySelector('#dialog').scrollWidth<=document.querySelector('#dialog').clientWidth));
 await page.locator('#recipe-quantity').screenshot({path:path.join(work,'confirmed-recipe-quantity.png')});await submit();
 await page.locator('.receipt-ready > summary').click();await page.locator('#purchases .purchase').screenshot({path:path.join(work,'egg-purchase.png')});
 assert.match(await page.locator('#purchases').innerText(),/Purchased 120 each/);assert.match(await page.locator('#purchases').innerText(),/For recipes: 6000 g/);
 const beforeApproval=clone(saved);await page.locator('#approve-receipt').click();assert.match(await page.locator('#dialog-body').innerText(),/Egg cake/);
 failNext=true;await page.locator('#dialog-submit').click();await page.locator('#dialog-error').getByText('Test save failed',{exact:true}).waitFor();assert.deepEqual(saved,beforeApproval);await submit();
 assert.equal(saved.ingredients.find(i=>i.id==='egg').size,6000);assert.equal(saved.ingredients.find(i=>i.id==='egg').unit,'g');assert.equal(saved.receipts[0].lines[0].unit,'each');
 assert.equal(saved.mappings['costco|sku:1025795'].costing.packSize,3000);
 const repeat={...clone(saved.receipts[0]),id:'repeat',file:'repeat.jpg',status:'Needs review',date:'2026-08-25',lines:[],text:'COSTCO\n3 @ 8.29\n1025795 KS 5DZ EGGS 24.87\nTAX 0.00'};
 delete repeat.preparedVersion;delete repeat.approvalSummary;delete repeat.reviewedAt;saved.receipts.push(repeat);
 await load('repeat');const learned=saved.receipts.find(r=>r.id==='repeat').lines[0];assert.equal(learned.size,180);assert.equal(learned.costing.packSize,3000);await page.locator('.receipt-ready').waitFor();
 const retailer=page.locator('#receipt-supplier');await retailer.fill('GFS');await retailer.dispatchEvent('change');await page.locator('#receipt-readiness').getByText(/quantity for recipes/).waitFor();
 await edit(0);assert.equal(await page.locator('[name=costingPack]').inputValue(),'');assert.equal(await page.locator('[name=costingConfirmed]').isChecked(),false);await page.locator('#dialog-cancel').click();
 // Verify approved cost/learned setup can still be undone as a single native save.
 saved=clone(beforeApproval);history=[];await load();await page.locator('#approve-receipt').click();await submit();
 await page.locator('[data-tab=settings]').click();await page.locator('#undo').click();await submit();assert.deepEqual(saved,beforeApproval);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({passed:true,checks:['legacy refresh/cancel/selection','ingredient-first headings','pack reference requires action','Croissant confirmation','new ingredient without premature pricing','explicit costing confirmation','separate egg purchase and recipe quantity','approval rollback/retry','saved conversion after reload','retailer isolation','undo','narrow dark layout']},null,2));
 console.log('Receipt product UI checks passed.');await browser.close();
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(work,'failure.png')}).catch(()=>{});if(browser)await browser.close();process.exit(1);});
