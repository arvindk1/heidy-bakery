const assert=require('node:assert/strict'),M=require('../Resources/model.js'),{fixture,now}=require('./receipt-product-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function purchase(s,{code='384962',description='KS U/S QTRS',pack=1812,date='2026-08-24',id=M.uuid()}={}) {
 const r={...clone(s.receipts[0]),id,date,status:'Needs review',lines:[{description,ingredientId:'butter',productCode:code,price:18.98,packSize:pack,packageCount:2,size:pack*2,unit:'g',excluded:false,needsReview:false,priceChangeConfirmed:true,reviewMode:true}]};
 s.receipts.push(r);M.approveReceipt(s,r,now);M.validate(s);return r;
}
const s=fixture();purchase(s);const original=clone(s.ingredients),originalRecipes=clone(s.recipes);
purchase(s,{description:'BUTTER UNSALTED',pack:2000,date:'2026-08-25'});
const reopened=clone(s);assert.equal(M.savedProduct(reopened,'Costco','KS U/S QTRS').packSize,2000);
assert.equal(M.savedProduct(reopened,'Costco','','384962').packSize,2000);
assert.equal(M.savedProduct(reopened,'GFS','','384962'),null);
assert.equal(M.savedProduct(reopened,'Costco','KS U/S QTRS','888888'),null);
purchase(reopened,{pack:999,date:'2026-08-01'});assert.equal(M.savedProduct(reopened,'Costco','','384962').packSize,2000);
purchase(reopened,{code:'',description:'BUTTER UNSALTED',pack:2100,date:'2026-08-26'});
assert.equal(M.savedProduct(clone(reopened),'Costco','','384962').packSize,2100,'Description-only correction lost the SKU');
purchase(reopened,{code:'999999',description:'KS U/S QTRS',pack:4000,date:'2026-08-27'});
assert.equal(M.savedProduct(reopened,'Costco','KS U/S QTRS'),null,'Ambiguous alias reused a package');
const saved=M.savedProduct(reopened,'Costco','','384962'),before=clone(reopened);
M.changeSavedProduct(reopened,saved.id,saved.revision,{packSize:2200,unit:'g'},now);
assert.deepEqual(reopened.ingredients,before.ingredients);assert.deepEqual(reopened.receipts,before.receipts);assert.deepEqual(reopened.recipes,before.recipes);
assert.equal(M.savedProduct(clone(reopened),'Costco','','384962').packSize,2200);
const stale=clone(reopened);assert.throws(()=>M.changeSavedProduct(reopened,saved.id,saved.revision,{forget:true}),/changed/);assert.deepEqual(reopened,stale);
const current=M.savedProduct(reopened,'Costco','','384962');M.changeSavedProduct(reopened,current.id,current.revision,{forget:true});
assert.equal(M.savedProduct(clone(reopened),'Costco','','384962'),null);
assert.equal(reopened.mappings['costco|sku:384962'],undefined);
const forgotten=M.suggestReceiptLine(reopened,'Costco',{description:'BUTTER UNSALTED',productCode:'384962',size:null,packSize:null,unit:'',price:10,excluded:false});
assert.equal(forgotten.size,null);assert.equal(forgotten.costing,undefined);
assert.equal(M.savedProduct(before,'Costco','','384962').packSize,2100,'Undo snapshot was mutated');
for(const change of [{packSize:0,unit:'g'},{packSize:1,unit:'qt'},{packSize:Infinity,unit:'g'}])assert.throws(()=>M.changeSavedProduct(before,saved.id,saved.revision,change),/positive/);
// Legacy dictionaries can have arbitrary JSON property ordering.
const legacy=fixture(),v={unit:'g',packSize:1812,size:3624,ingredientId:'butter'};
legacy.mappings={'costco|sku:384962':clone(v),'costco wholesale|butter':{ingredientId:'butter',size:3624,packSize:1812,unit:'g'}};
const unchanged=clone(legacy);M.normalizeState(legacy);const normalized=clone(legacy);M.normalizeState(legacy);assert.deepEqual(legacy,normalized);
assert.deepEqual(legacy.ingredients,unchanged.ingredients);assert.deepEqual(legacy.receipts,unchanged.receipts);assert.deepEqual(legacy.recipes,unchanged.recipes);
assert.equal(Object.keys(legacy.products.records).length,1);
const uncertain=fixture();uncertain.mappings={'costco|butter':{ingredientId:'butter',size:2000,packSize:2000,unit:'g'},'costco|sku:384962':{ingredientId:'butter',size:1800,packSize:1800,unit:'g'}};
const uncertainLine=M.suggestReceiptLine(uncertain,'Costco',{description:'butter',price:10,size:null,unit:'',excluded:false});
assert.equal(uncertainLine.size,null,'Unproven legacy description supplied a stale pack');assert.equal(uncertainLine.needsReview,true);
const mixed=fixture(),mixedReceipt=purchase(mixed);mixedReceipt.status='Needs review';mixedReceipt.date='2026-08-29';mixedReceipt.lines.push({...clone(mixedReceipt.lines[0]),ingredientId:'cream',packSize:1000,size:2000});M.approveReceipt(mixed,mixedReceipt,now);
assert.equal(M.savedProduct(mixed,'Costco','','384962').requiresConfirmation,true,'Conflicting packs were learned as one trusted package');
const legacyRecord=M.savedProduct(legacy,'Costco','butter');M.changeSavedProduct(legacy,legacyRecord.id,legacyRecord.revision,{packSize:1900,unit:'g'});
assert.equal(M.savedProduct(clone(legacy),'Costco','','384962').packSize,1900);
for(const corrupt of [p=>p.aliases['costco|bad']=['absent'],p=>Object.values(p.records)[0].packSize=0,p=>Object.values(p.records)[0].provenance.date='not-a-date']) {
 const invalid=clone(legacy);corrupt(invalid.products);assert.throws(()=>M.validate(invalid),/product/);
}
const parse=M.parseProductDescription;
assert.equal(parse('Kirkland Signature Butter, Unsalted, Sticks, 1 lb, 4 ct').packSize,4);
assert.equal(parse('Cream, 1 qt').dimension,'volume');assert.equal(parse('Cream, 1 qt').grams,undefined);
assert.equal(parse('Cream, 2 x 16 fl oz').packSize,32);assert.equal(parse('Eggs, 5 dz').packSize,60);
assert.equal(parse('Eggs, 60 ct').unit,'each');assert.equal(parse('Butter, 1 lb, 30 ct').innerCount,30);
for(const value of [null,'Butter','Butter, 1..2 lb','Butter, 0 lb','Butter, 1 lb, 0 ct','Butter, 1 lb, 2 lb','Butter, 2 ct, 3 ct','Butter, 1 lb, 2.5 ct','Butter, 2 x 1 lb, 4 ct','Cream QT','Milk, 1 imperial qt','1e309 g','-2 lb','1 lb, 99999999999999999999999999999 ct'])assert.equal(parse(value).ok,false,String(value));
// Occurrences survive repeated extraction; manual and changed-OCR lines reconcile explicitly.
const f=fixture(),r=f.receipts[0];r.lines=[];
let plans=M.receiptReconciliation(f,r,now);assert.equal(plans.length,9);
M.applyReconciliation(r,plans,plans.map(()=>'add'),JSON.stringify(r));
assert.equal(r.lines.reduce((sum,l)=>sum+l.packageCount,0),12);assert.equal(Math.round(r.lines.reduce((sum,l)=>sum+l.price,0)*100),8557);
assert.equal(M.receiptReconciliation(f,clone(r),now).length,0);
const manual=clone(r);for(const l of manual.lines){delete l.sourceRows;delete l.sourceText;}
plans=M.receiptReconciliation(f,manual,now);assert.equal(plans.length,9);assert.ok(plans.every(p=>p.possible.length===1));
const amounts=manual.lines.map(l=>[l.price,l.size]);
M.applyReconciliation(manual,plans,plans.map(p=>String(p.possible[0])),JSON.stringify(manual));assert.equal(M.receiptReconciliation(f,manual,now).length,0);assert.deepEqual(manual.lines.map(l=>[l.price,l.size]),amounts);
manual.text='NEW HEADER\n'+manual.text;plans=M.receiptReconciliation(f,manual,now);assert.ok(plans.length>0,'Changed OCR reused old row positions');
const snap=clone(manual);assert.throws(()=>M.applyReconciliation(manual,plans,plans.map(()=>''),JSON.stringify(manual)),/Choose/);assert.deepEqual(manual,snap);
assert.throws(()=>M.applyReconciliation(manual,plans,plans.map(()=>'add'),'stale'),/changed/);
assert.deepEqual(s.recipes,originalRecipes);assert.equal(M.factor('qt','g'),null);assert.equal(M.factor('each','g'),null);
console.log('Saved product checks passed: alias persistence, migration, ambiguity, SKU/retailer isolation, old dates, corrections/forget, stale edits, validation, strict package parsing, repeated occurrences and manual reconciliation.');
