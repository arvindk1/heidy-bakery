const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../Resources/model.js'),root=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>{
  const s=M.empty();s.imported=true;
  s.ingredients=[{id:'flour',name:'Flour',kind:'ingredient',supplier:'Test',price:10,size:1000,unit:'g',updated:'2026-09-01',history:[]}];
  return s;
};
const book={file:'Cake.xlsx',sheets:[
  {name:'Price Summary',rows:[[],[],['Item',null,null,null,null,null,null,'Listed Item Price'],['Test Cake',null,null,null,null,null,null,6]]},
  {name:'Test Cake',rows:[
    ['Test Cake'],[],['Ingredients (Batch)'],['Material','Quantity','Unit'],['Flour',100,'g'],['INGREDIENT TOTAL'],[],[],
    ['Packaging (Batch)'],['Material','Quantity','Unit'],['Bag',{formula:true,formulaText:'$B$16',cached:'4'},'each'],['PACKAGING TOTAL'],[],[],
    ['SUMMARY'],['Batch quantity',4],['Labor effort','Low']
  ]}
]};
let browser;
(async()=>{
  let saved=fixture(),saves=0,failSave=false,books=[book];
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
    try {
      let result=null;
      if(action==='load')result={state:clone(saved),seed:clone(saved),inbox:''};
      if(action==='importRecipeWorkbooks')result=books;
      if(action==='save'){
        if(failSave){failSave=false;throw Error('Simulated disk full');}
        saved=M.validate(clone(payload));saves++;result=true;
      }
      return{id,result};
    } catch(e){return{id,error:e.stderr?.toString().trim()||e.message};}
  });
  await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
  await page.goto('file://'+path.join(root,'Resources/index.html'));
  await page.locator('[data-tab=settings]').click();
  assert.equal(await page.locator('#import-recipe-workbooks').count(),1);
  assert.equal(await page.locator('#import-excel').count(),1);
  assert.match(await page.locator('#import-excel').innerText(),/app Excel export/);
  await page.locator('[data-tab=recipes]').click();
  await page.locator('#import-recipes').click();
  await page.locator('#dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#dialog-body').innerText(),/1 recipe sheets found/);
  assert.equal(await page.locator('#dialog-body input[name=use]').isChecked(),false);
  assert.equal(await page.locator('#dialog-submit').isVisible(),true);
  await page.locator('#dialog-cancel').click();
  assert.equal(saves,0);
  await page.locator('#import-recipes').click();
  await page.locator('#dialog-body input[name=use]').check();
  await page.locator('#dialog-submit').click();
  assert.match(await page.locator('#dialog-error').innerText(),/missing from the master list/);
  assert.equal(saves,0);
  await page.locator('#dialog-body input[name=createMissing]').check();
  await page.locator('#dialog-submit').click();
  await page.locator('#dialog').waitFor({state:'hidden'});
  assert.equal(saves,1);assert.equal(saved.recipes.length,1);assert.equal(saved.ingredients.length,2);
  assert.equal(saved.recipes[0].retail,6);assert.equal(saved.recipes[0].lines[1].perPiece,true);
  await page.locator('#import-recipes').click();
  await page.locator('#dialog-body input[name=use]').check();
  const beforeFailedSave=clone(saved);failSave=true;
  await page.locator('#dialog-submit').click();
  await page.locator('#dialog-error').getByText('Simulated disk full',{exact:true}).waitFor();
  assert.deepEqual(saved,beforeFailedSave);assert.equal(saves,1);
  await page.locator('#dialog-submit').click();
  await page.locator('#dialog').waitFor({state:'hidden'});
  assert.equal(saves,2);assert.equal(saved.recipes.length,1);
  await page.locator('#import-recipes').click();
  assert.match(await page.locator('#dialog-body').innerText(),/1 already in the app/);
  assert.equal(await page.locator('#dialog-body input[name=use]').isChecked(),false);
  await page.locator('#dialog-cancel').click();
  assert.equal(saves,2);assert.deepEqual(errors,[]);
  // Durable large-workbook UX reconciliation; synthetic values in all original layouts.
  const layouts=require('./fixtures/recipe-layouts.json');
  for(const count of [3,4]) {
    books=clone(layouts.books.slice(0,count));saved=M.empty();saved.imported=true;
    saved.ingredients=clone(layouts.master);saves=0;
    await page.reload();await page.locator('[data-tab=recipes]').click();
    await page.locator('#import-recipes').click();
    const expected=layouts.expected.filter(e=>books.some(b=>b.file===e.file));
    assert.equal(await page.locator('#dialog-body input[name=use]').count(),expected.length);
    assert.equal(await page.locator('#dialog-body input[name=use]:disabled').count(),0);
    const before=clone(saved);await page.locator('#dialog-cancel').click();assert.deepEqual(saved,before);
    await page.locator('#import-recipes').click();
    for(const choice of await page.locator('#dialog-body input[name=use]').all())await choice.check();
    await page.locator('#dialog-body input[name=createMissing]').check();
    await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(saves,1);assert.equal(saved.recipes.length,expected.length);
    assert.deepEqual(saved.ingredients.slice(0,before.ingredients.length),before.ingredients);
    for(const e of expected) {
      const actual=saved.recipes.find(r=>r.name===e.name);assert.ok(actual,e.name);
      for(const k of ['yield','laborEffort','retail','bulk'])assert.deepEqual(actual[k],e[k],e.name+' '+k);
      assert.deepEqual(actual.lines.map(l=>({name:saved.ingredients.find(i=>i.id===l.ingredientId).name,quantity:l.quantity,unit:l.unit,perPiece:l.perPiece})),e.lines.map(l=>({name:l.name,quantity:l.quantity,unit:l.unit,perPiece:l.perPiece})),e.name+' lines');
    }
    await page.reload();await page.locator('[data-tab=recipes]').click();await page.locator('#import-recipes').click();
    assert.equal(await page.locator('#dialog-body input[name=use]:checked').count(),0);
    await page.locator('#dialog-cancel').click();assert.equal(saves,1);
  }
  assert.deepEqual(errors,[]);
  console.log('Large-workbook UI reconciliation passed: 85 and 96 recipes, every line/yield/channel price, cancellation, unchanged master costs, reload and repeat selection.');
  await browser.close();
  console.log('Recipe import UI passed: distinct actions, clear review, cancel, missing-master confirmation, apply, save rollback/retry, and safe repeat import.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
