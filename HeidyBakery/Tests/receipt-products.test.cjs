const assert=require('node:assert/strict'),M=require('../Resources/model.js'),{fixture,now}=require('./receipt-product-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const s=fixture(),r=s.receipts[0],before=clone(s);
const changes=M.receiptRefresh(s,r,now);
assert.ok(changes.some(p=>p.after.description==='WHOLE MILK'));
const creamChange=changes.find(p=>p.after.ingredientId==='cream');assert.equal(creamChange.after.size,2);assert.equal(creamChange.after.unit,'qt');
assert.deepEqual(s,before,'Preview mutated records');
M.applyReceiptRefresh(r,changes,[creamChange.index]);assert.equal(r.lines[creamChange.index].size,2);assert.equal(r.lines.find(l=>l.ingredientId==='milk').description,'3 WHOLE MILK','Unchecked suggestion applied');
assert.deepEqual(s.ingredients,before.ingredients);assert.deepEqual(s.mappings,before.mappings);
assert.ok(!M.receiptRefresh(s,r,now).some(p=>p.index===creamChange.index));
for(const update of [{needsReview:false},{priceChangeConfirmed:true},{excluded:true},{size:2000},{price:99}]){
  const copy=fixture(),receipt=copy.receipts[0],line=receipt.lines.find(l=>l.ingredientId==='cream');Object.assign(line,update);
  const frozen=clone(line),proposals=M.receiptRefresh(copy,receipt,now);
  M.applyReceiptRefresh(receipt,proposals,proposals.map(p=>p.index));
  assert.equal(line.size,frozen.size);assert.equal(line.price,frozen.price);
  if(update.needsReview===false || update.priceChangeConfirmed || update.excluded)assert.deepEqual(receipt.lines.find(l=>l.ingredientId==='cream'),frozen);
}
const stale=fixture(),plans=M.receiptRefresh(stale,stale.receipts[0],now);stale.receipts[0].lines[plans[0].index].description='Changed meanwhile';
const snapshot=clone(stale);assert.throws(()=>M.applyReceiptRefresh(stale.receipts[0],plans,plans.map(p=>p.index)),/changed/);assert.deepEqual(stale,snapshot);
const reviewed=fixture();reviewed.receipts[0].status='Reviewed';assert.deepEqual(M.receiptRefresh(reviewed,reviewed.receipts[0],now),[]);
const flour=M.matchIngredient(s,'Costco','FLOUR 12LB');assert.equal(flour.ingredientId,'');assert.equal(flour.reason,'Confirm the flour type');assert.ok(flour.candidates.every(c=>c.score===0),'Generic flour should not rank arbitrary types');
const croissant=M.matchIngredient(s,'Costco','BUTER CROISS');assert.equal(croissant.candidates[0].ingredientId,'croissant');
const eggs=fixture(),purchase=eggs.receipts[0];purchase.lines=purchase.lines.filter(l=>l.ingredientId==='egg');const line=purchase.lines[0];
Object.assign(line,{packSize:60,size:120,unit:'each',packageCount:2,needsReview:false,priceChangeConfirmed:true,reviewMode:true});
assert.equal(M.purchaseQuantity(eggs,purchase,line),null);assert.throws(()=>M.approveReceipt(eggs,purchase,now),/quantity for recipes/);
line.costing={ingredientId:'egg',retailer:'costco',productCode:line.productCode,purchasePackSize:60,purchaseUnit:'each',packSize:3000,unit:'g',confirmed:true};
assert.deepEqual(M.purchaseQuantity(eggs,purchase,line),{size:6000,unit:'g'});
assert.equal(M.receiptPreview(eggs,purchase,now).recipes[0].after,16.58/6000*200/10);
const beforeApproval=clone(eggs);M.approveReceipt(eggs,purchase,now);M.validate(eggs);
assert.equal(eggs.ingredients[0].unit,'g');assert.equal(eggs.ingredients[0].size,6000);assert.equal(purchase.lines[0].size,120);assert.equal(purchase.lines[0].unit,'each');
assert.deepEqual(eggs.ingredients[0].history.at(-1).purchase,{size:120,unit:'each',packageCount:2});
assert.equal(eggs.recipes[0].retail,beforeApproval.recipes[0].retail);
const repeat={...clone(purchase),status:'Needs review',date:'2026-08-25',lines:[]};
repeat.lines=[M.suggestReceiptLine(eggs,'Costco',{description:'KS 5DZ EGGS',productCode:line.productCode,packSize:60,size:180,unit:'each',packageCount:3,price:24.87,excluded:false})];
assert.deepEqual(M.purchaseQuantity(eggs,repeat,repeat.lines[0]),{size:9000,unit:'g'});
for(const edit of [{ingredientId:'milk'},{productCode:'999999'},{packSize:30,size:90},{unit:'dozen'}]){
  const l={...clone(repeat.lines[0]),...edit};assert.equal(M.purchaseQuantity(eggs,repeat,l),null,'Conversion leaked across '+JSON.stringify(edit));
}
assert.equal(M.purchaseQuantity(eggs,{...repeat,supplier:'GFS'},repeat.lines[0]),null);
const nonConfirmed=clone(repeat.lines[0]);nonConfirmed.costing.confirmed=false;assert.equal(M.purchaseQuantity(eggs,repeat,nonConfirmed),null);
const malformed=clone(eggs);malformed.mappings['costco|sku:'+line.productCode].costing.packSize=0;assert.throws(()=>M.validate(malformed),/recipe quantity/);
const older=clone(beforeApproval);older.ingredients[0].updated='2026-09-01';const oldSize=older.ingredients[0].size;M.approveReceipt(older,older.receipts[0],now);assert.equal(older.ingredients[0].size,oldSize);assert.equal(older.ingredients[0].history.at(-1).size,6000);
assert.equal(M.factor('each','g'),null);assert.equal(M.factor('qt','g'),null);
console.log('Receipt product checks passed: actual legacy draft shape, selective refresh, stale-preview rejection, edit preservation, name suggestions, explicit purchase/recipe quantities, scoped learning, unchanged recipe units, history, preview and older purchases.');
