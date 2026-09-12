// Receipt modal presentation only. All writes go to this in-memory test library.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const root=path.resolve(__dirname,'..'),work=path.join(root,'output/playwright/receipt-modal');
fs.mkdirSync(work,{recursive:true});
let saved=fixture(),browser;
saved.receipts[0].text='';
saved.receipts[0].lines=[{description:'Butter',originalDescription:'384962 BUTTER',ingredientId:'butter',productCode:'384962',price:20,size:2000,packSize:1000,packageCount:2,unit:'g',excluded:false,reviewMode:true,needsReview:false,priceChangeConfirmed:true}];
(async()=>{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];
  await context.setOffline(true);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
    let result;
    if(action==='load')result={state:clone(saved),seed:fixture(),inbox:''};
    else if(action==='save'){saved=M.validate(clone(payload));result=true;}
    else if(action==='previewReceipt')result='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
    else throw Error('Unexpected action '+action);
    return {id,result};
  });
  await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
  const input=n=>page.locator('#dialog [name='+n+']'),active=()=>page.evaluate(()=>document.activeElement.name);
  async function edit(){
    const b=page.locator('[data-edit-purchase="0"]');
    if(!await b.isVisible())await page.locator('.receipt-ready > summary').click();
    await b.click();
  }
  async function tabTo(name){
    for(let n=0;n<20;n++){
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.querySelector('#dialog').contains(document.activeElement)),true,'Focus escaped the dialog');
      if(await active()===name)return;
    }
    assert.fail('Could not reach '+name+' by Tab');
  }
  await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();
  await page.evaluate(()=>openReceiptRecord('legacy'));await page.locator('#approve-receipt').waitFor();
  const initial=clone(saved);await edit();
  assert.equal(await input('ingredientId').inputValue(),'butter');
  assert.equal(await page.locator('#match-hints').isVisible(),false);
  assert.equal(await page.locator('[data-match]').count(),0,'Redundant suggestion still rendered');
  // A different selection must keep the single useful suggestion. Selecting it hides it again.
  await input('ingredientId').selectOption('milk');
  assert.deepEqual(await page.locator('[data-match]').evaluateAll(bs=>bs.map(b=>b.dataset.match)),['butter']);
  await page.locator('[data-match=butter]').click();assert.equal(await page.locator('#match-hints').isVisible(),false);
  assert.equal(await active(),'ingredientId','Choosing a disappearing hint lost keyboard focus');
  await page.locator('#receipt-details > summary').click();await input('productCode').fill('');await input('description').fill('FLOUR');
  assert.deepEqual((await page.locator('[data-match]').evaluateAll(bs=>bs.map(b=>b.dataset.match))).sort(),['almond','rice']);
  await page.locator('[data-match=rice]').click();
  assert.equal(await active(),'ingredientId');
  assert.deepEqual((await page.locator('[data-match]').evaluateAll(bs=>bs.map(b=>b.dataset.match))).sort(),['almond','rice'],'Ambiguous options disappeared after selection');
  await input('description').fill('No matching ingredient xyz');assert.match(await page.locator('#match-hints').innerText(),/Choose an existing ingredient/);
  await page.locator('#dialog-cancel').click();assert.deepEqual(saved,initial);
  await edit();
  for(const name of ['packSize','packageCount','size']){
    assert.ok((await input(name).getAttribute('aria-describedby')).includes('pack-calculation'));
    assert.equal(await input(name).evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('[name=productNotes]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,name+' is below the paste disclosure');
  }
  for(const id of ['density-suggestion','weight-help','recipe-quantity-help','recipe-quantity-total'])assert.equal(await page.locator('#'+id).getAttribute('role'),'status');
  assert.equal(await page.locator('[name=productNotes]').getAttribute('rows'),'3');
  assert.equal(await page.locator('[name=productNotes]').isVisible(),false);
  assert.ok(await page.locator('#master-pack-reference p').evaluate(el=>el.classList.contains('muted')));
  assert.ok(await page.locator('#pack-calculation').evaluate(el=>el.classList.contains('muted')));
  await page.locator('#receipt-details > summary').click();
  assert.ok(await page.getByText('Original: 384962 BUTTER',{exact:true}).evaluate(el=>el.classList.contains('muted')));
  await input('packSize').fill('500');await input('packageCount').fill('3');assert.equal(await input('size').inputValue(),'1500');
  await page.locator('#use-master-pack').click();assert.equal(await input('size').inputValue(),'1812');
  for(const scheme of ['light','dark']){
    await page.emulateMedia({colorScheme:scheme});await page.setViewportSize({width:scheme==='light'?1100:760,height:900});
    await page.locator('#dialog').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(work,scheme+'-collapsed.png')});
    await page.getByText('Paste product details',{exact:true}).click();
    for(const id of ['parse-product']){
      const style=await page.locator('#'+id).evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor,minHeight:getComputedStyle(el).minHeight}));
      assert.equal(style.border,'rgba(0, 0, 0, 0)');assert.ok(parseFloat(style.minHeight)>=36);
    }
    await input('productNotes').fill('Butter, 1 lb, 4 ct');await page.locator('#parse-product').click();
    assert.match(await page.locator('#paste-preview').innerText(),/4 lb/);
    assert.ok(await page.locator('#paste-preview p').filter({hasText:'Current pack:'}).evaluate(el=>el.classList.contains('muted')));
    assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.locator('#parse-product').focus();await page.screenshot({path:path.join(work,scheme+'-expanded.png')});
    await page.getByText('Paste product details',{exact:true}).click();
  }
  // Revealing guidance retains the user's editing focus, and Tab reaches each new field.
  await input('ingredientId').selectOption('milk');await input('unit').fill('gal');
  assert.equal(await active(),'unit');assert.equal(await page.locator('#unit-bridge').isVisible(),true);
  assert.equal(await page.locator('#recipe-quantity').isVisible(),true);await tabTo('receiptDensity');
  await input('unit').fill('g');assert.equal(await active(),'unit');assert.equal(await page.locator('#unit-bridge').isVisible(),false);
  await input('ingredientId').selectOption('banana');await input('unit').fill('each');
  assert.equal(await active(),'unit');await tabTo('measuredTotalWeight');
  await input('unit').fill('box');assert.equal(await active(),'unit');
  assert.equal(await page.locator('#unit-bridge').isVisible(),false);assert.equal(await page.locator('#recipe-quantity').isVisible(),true);await tabTo('costingPack');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').isVisible(),false);assert.deepEqual(saved,initial);
  // The reordered fields still save a draft without changing ingredients or recipes.
  await edit();await input('packSize').fill('500');await input('packageCount').fill('3');await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
  assert.equal(saved.receipts[0].lines[0].size,1500);assert.deepEqual(saved.ingredients,initial.ingredients);assert.deepEqual(saved.recipes,initial.recipes);
  assert.deepEqual(errors,[]);
  console.log('Receipt modal UI passed: single/multi/no-match hints, live selection updates, field order, muted helpers, secondary actions, ARIA links/status, light/dark layouts, reveal focus and keyboard access, Escape isolation and draft save.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
