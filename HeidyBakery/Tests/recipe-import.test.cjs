const assert = require('node:assert/strict');
const M = require('../Resources/model.js');
global.HeidyModel = M;
const R = require('../Resources/recipe-import.js');

const master = {id:'flour',name:'Flour',kind:'ingredient',supplier:'Test',price:10,size:1000,unit:'g',updated:'2026-09-01',history:[]};
const state = M.empty();
state.imported = true;
state.ingredients = [master];
const sheet = (name, missing = false) => ({name,rows:[
  [name],[],['Ingredients (Batch)'],['Material','Quantity','Unit'],
  ['Flour',100,'g'],[missing?'Missing':'Flour',25,'g'],['INGREDIENT TOTAL'],[],[],
  ['Packaging (Batch)'],['Material','Quantity','Unit'],
  ['Bag',{formula:true,formulaText:'$B$17',cached:'4'},'each'],['PACKAGING TOTAL'],[],[],
  ['SUMMARY'],['Batch quantity',4],['Labor effort','Low']
]});
const book = {file:'Test.xlsx',sheets:[{name:'Price Summary',rows:[[],[],['Item',null,null,null,null,null,null,'Listed Item Price'],['Buns',null,null,null,null,null,null,5.5]]},sheet('Buns',true)]};
const parsed = R.parse([book]);
assert.equal(parsed.drafts.length,1);
assert.equal(parsed.drafts[0].lines.length,3);
assert.deepEqual(parsed.drafts[0].lines[2],{name:'Bag',kind:'packaging',quantity:1,unit:'each',perPiece:true,row:12});
assert.equal(parsed.drafts[0].laborHours,2);
assert.equal(parsed.drafts[0].retail,5.5);
const review = R.plan(state,parsed.drafts);
assert.deepEqual(review.missing.map(x=>x.name).sort(),['Bag','Missing']);
assert.throws(()=>R.candidate(state,review.drafts),/missing from the master list/);
const next = R.candidate(state,review.drafts,true);
assert.equal(next.recipes.length,1);
assert.equal(next.ingredients.length,3);
assert.equal(next.ingredients.find(x=>x.name==='Missing').price,null);
assert.equal(next.recipes[0].lines.length,3);
assert.equal(next.recipes[0].lines[2].perPiece,true);
assert.equal(state.recipes.length,0);
const repeat = R.plan(next,R.parse([book]).drafts);
assert.ok(repeat.drafts[0].existing);
repeat.drafts[0].retail = 99;
const replaced = R.candidate(next,repeat.drafts,true);
assert.equal(replaced.recipes.length,1);
assert.equal(replaced.recipes[0].retail,5.5);
assert.throws(()=>R.candidate(state,[...review.drafts,...review.drafts],true),/same recipe name/i);
assert.equal(R.parse([{file:'Other.xlsx',sheets:[sheet('Buns')]}]).drafts.length,1);
console.log('Recipe workbook import checks passed.');

const clone=x=>JSON.parse(JSON.stringify(x));
const layouts=require('./fixtures/recipe-layouts.json');
for(const count of [3,4]) {
  const books=layouts.books.slice(0,count), expected=layouts.expected.filter(r=>books.some(b=>b.file===r.file));
  const parsed=R.parse(books);assert.equal(parsed.skipped.length,0);
  assert.equal(parsed.drafts.length,count===3?85:96);
  assert.equal(parsed.drafts.reduce((n,d)=>n+d.lines.length,0),count===3?1283:1407);
  for(const e of expected) {
    const d=parsed.drafts.find(d=>d.file===e.file&&d.sheet===e.sheet);assert.ok(d,e.sheet);
    for(const k of ['name','yield','laborEffort','retail','bulk','lines'])assert.deepEqual(d[k],e[k],e.sheet+' '+k);
  }
  const initial=M.empty();initial.ingredients=clone(layouts.master);initial.imported=true;
  const p=R.plan(initial,parsed.drafts),before=clone(initial), candidate=R.candidate(initial,p.drafts,true);
  assert.deepEqual(initial,before);assert.equal(candidate.recipes.length,expected.length);
  assert.deepEqual(candidate.ingredients.slice(0,initial.ingredients.length),initial.ingredients);
  const repeated=R.plan(candidate,R.parse(books).drafts);
  assert.ok(repeated.drafts.every(d=>d.existing));
  const w=candidate.recipes.find(r=>r.name==='(W)Biscoff Earlgrey Bun');assert.equal(w.bulk,5.75);assert.equal(w.retail,null);
  const hs=candidate.recipes.find(r=>r.name==='Yuzu Tart (HS)');assert.equal(hs.bulk,null);assert.equal(hs.retail,null);assert.match(hs.notes,/HS sales channel/);
  assert.equal(candidate.recipes.find(r=>r.category.includes('Cookie')).category,'Cookie & Others');
  if(count===4) {
    const chestnut=candidate.recipes.find(r=>r.name==='Chestnut');
    assert.equal(chestnut.lines.length,11);assert.ok(chestnut.lines.some(l=>candidate.ingredients.find(i=>i.id===l.ingredientId).name==='Unidentified ingredient — Chestnut row 11'));
    assert.equal(M.calculate(candidate,chestnut).unit,null);
    assert.ok(parsed.notices.some(n=>n.includes('Cloud Chiffon Series.xlsx')));
  }
}
// Unsupported inputs must not silently acquire zero quantities or labour costs.
const invalid=clone(book);invalid.sheets[1].rows[4][1]={formula:true,formulaText:'SUM(B8:B9)',cached:'100'};
let d=R.parse([invalid]).drafts[0];assert.equal(d.lines[0].quantity,null);assert.ok(d.blockingIssues.length);
assert.throws(()=>R.candidate(state,[d],true),/quantity/);
const labor=clone(book);labor.sheets[1].rows[17][1]='Unknown';d=R.parse([labor]).drafts[0];assert.equal(d.laborHours,null);assert.throws(()=>R.candidate(state,[d],true),/Labour effort/);
// Blank material names are retained, price conflicts are not guessed, and category whitespace is normalized.
const blank=clone(book);blank.sheets[1].rows[4][0]=null;d=R.parse([blank]).drafts[0];assert.equal(d.lines.length,3);assert.match(d.lines[0].name,/Unidentified ingredient/);
const duplicate=clone(book);duplicate.sheets[0].rows.push(['Buns']);d=R.parse([duplicate]).drafts[0];assert.equal(d.retail,null);
const dupMaster=clone(state);dupMaster.ingredients.push({...clone(master),id:'flour-2'});
const amb=R.plan(dupMaster,R.parse([book]).drafts);assert.ok(amb.drafts[0].blockingIssues.length);assert.throws(()=>R.candidate(dupMaster,amb.drafts,true),/multiple master/);
for(const expression of ['$B$17','B17','=B$17','=$B17']) {const b=clone(book);b.sheets[1].rows[11][1].formulaText=expression;assert.equal(R.parse([b]).drafts[0].lines[2].perPiece,true);}
// Unnamed packaging rows become placeholders that the Ingredients quality check must flag, like unnamed ingredients.
const blankPack=clone(book);blankPack.sheets[1].rows[11][0]=null;d=R.parse([blankPack]).drafts[0];
assert.match(d.lines[2].name,/^Unidentified packaging — /);
const withPack=R.candidate(state,R.plan(state,[d]).drafts,true);
const packPlaceholder=withPack.ingredients.find(i=>i.name===d.lines[2].name);
assert.equal(packPlaceholder.kind,'packaging');
assert.match(M.ingredientIssues(withPack).find(q=>q.ingredientId===packPlaceholder.id).message,/identity/);
console.log('Saved reconciliation passed: 85 sheets / 1,281 named + 2 unnamed lines and four books / 96 sheets / 1,407 lines; wholesale 5.75, HS unassigned, unnamed rows, duplicate matches, invalid quantities/labour, categories and totals notes.');
