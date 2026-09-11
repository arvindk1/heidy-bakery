const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
// Explicit snapshot only: this test never connects to or writes the live database.
const snapshot=process.env.HEIDY_LIBRARY_SNAPSHOT,bytes=snapshot?fs.readFileSync(snapshot):null,source=bytes?JSON.parse(bytes):fixture();
if(!snapshot)source.recipes.push({...clone(source.recipes[0]),id:'milk-cake',name:'Milk cake',lines:[{id:'milk-line',ingredientId:'milk',quantity:250,unit:'g',perPiece:false}]});
const now=new Date('2026-09-11T12:00:00Z'),scales={mg:.001,g:1,kg:1000,oz:28.349523125,lb:453.59237};
let runs=0;
for(const name of ['Milk','Egg']) for(const later of [false,true]) {
 const s=clone(source),i=s.ingredients.find(i=>i.name===name);assert.ok(i,'Missing representative ingredient');
 const r=s.receipts.find(r=>r.lines.some(l=>l.ingredientId===i.id));assert.ok(r,'Missing real receipt line');
 r.status='Needs review';if(later)r.date=M.localDate(now);
 for(const l of r.lines)l.excluded=l.ingredientId!==i.id;
 const l=r.lines.find(l=>!l.excluded);assert.ok(Number.isFinite(l.price),'Receipt has no paid amount');
 // Missing real package details are completed with explicit test-only inputs.
 // These are regression scenarios, not claimed measurements or live data fixes.
 l.unit=name==='Milk'?'gal':'each';l.packSize=name==='Milk'?1:60;l.packageCount=name==='Milk'?1:2;l.size=l.packSize*l.packageCount;l.needsReview=false;l.priceChangeConfirmed=true;l.reviewMode=true;l.quantityConflict=false;delete l.costing;delete l.bridge;
 l.bridge=M.confirmReceiptBridge(i,r,l,name==='Milk'?'density':'avgUnitWeight',name==='Milk'?1.03:6000);
 const expectedGrams=name==='Milk'?3785.411784*1.03:6000;
 assert.equal(i.unit,'g','This representative fixture expects a gram-based master');
 const oldCost=i.price/i.size,newCost=l.price/expectedGrams,older=!!i.updated&&r.date<i.updated;
 const beforeRecipes=clone(s.recipes),beforeIngredients=clone(s.ingredients),costs=s.recipes.map(recipe=>M.calculate(s,recipe,now).unit);
 M.approveReceipt(s,r,now);M.validate(s);
 for(let n=0;n<s.recipes.length;n++) {
  const recipe=s.recipes[n],before=costs[n],after=M.calculate(s,recipe,now).unit,touched=recipe.lines.filter(line=>line.ingredientId===i.id);
  if(!touched.length || older){assert.equal(after,before,'An unrelated/history-only recipe changed');continue;}
  if(before===null){assert.equal(after,null,'An incomplete recipe became falsely costable');continue;}
  const quantity=touched.reduce((sum,line)=>{assert.ok(scales[line.unit],'Uncovered recipe unit in independent oracle');return sum+line.quantity*scales[line.unit]*(line.perPiece?recipe.yield:1);},0);
  const expected=before+quantity*(newCost-oldCost)/recipe.yield;assert.ok(Math.abs(after-expected)<1e-10,'Receipt changed recipe cost by the wrong amount');
 }
 assert.deepEqual(s.recipes,beforeRecipes,'Approval changed recipe quantities or selling prices');
 for(const old of beforeIngredients.filter(x=>x.id!==i.id))assert.deepEqual(s.ingredients.find(x=>x.id===old.id),old,'Approval changed an unrelated ingredient');
 assert.ok(s.recipes.some(recipe=>recipe.lines.some(line=>line.ingredientId===i.id)),'Vacuous affected-recipe check');runs++;
}
if(snapshot)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'),'Snapshot file was modified');
console.log((snapshot?'Live-library snapshot':'Synthetic')+' receipt cost invariant passed: '+runs+' density/count/date scenarios; '+source.recipes.length+' recipes; independent deltas, untouched recipes/ingredients and source preserved. Package weights are explicit test inputs.');
