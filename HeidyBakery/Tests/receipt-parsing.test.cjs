const assert=require('node:assert/strict'),M=require('../Resources/model.js');
const now=new Date('2026-09-09T12:00:00Z'),clone=x=>JSON.parse(JSON.stringify(x));
// Item rows transcribed from saved Vision output. No membership or payment details.
const text=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/costco-ocr.txt'),'utf8');
const receipt=t=>({id:'receipt',file:'receipt.jpg',originalName:'receipt.jpg',importedAt:'2026-09-09T10:00:00Z',supplier:'',date:'',status:'Needs review',text:t,lines:[]});
const s=M.empty();s.ingredients=[{id:'cream',name:'Heavy Cream',kind:'ingredient',price:5,size:1000,unit:'g',supplier:'Costco',updated:'2026-07-01',history:[]}];
const before=clone(s),r=receipt(text);M.prepareReceipt(s,r,now);const lines=r.lines;
assert.equal(lines.length,9);assert.equal(lines.reduce((v,l)=>v+l.packageCount,0),12);assert.equal(Math.round(lines.reduce((v,l)=>v+l.price,0)*100),8557);
const sku=code=>lines.find(l=>l.productCode===code);
assert.equal(sku('384962').price,18.98);assert.equal(sku('384962').packageCount,2);assert.equal(sku('384962').size,null,'QTRS must not imply quarts');
assert.equal(sku('673678').price,8.78);assert.equal(sku('673678').size,2);assert.equal(sku('673678').unit,'qt');assert.equal(sku('673678').needsReview,true);assert.match(sku('673678').parseNote,/OCR/);
assert.equal(sku('1025795').price,16.58);assert.equal(sku('1025795').size,120);assert.equal(sku('1025795').unit,'each');
assert.equal(sku('1375333').size,12);assert.equal(sku('1375333').unit,'lb');
assert.equal(lines[0].productCode,'');assert.equal(lines[0].description,'WHOLE MILK');assert.match(lines[0].parseNote,/read as 3/);
assert.equal(new Set(lines.flatMap(l=>l.sourceRows)).size,12,'Every OCR purchase has its own provenance');
assert.equal(r.date,'2026-08-24');assert.equal(r.supplier,'Costco');assert.deepEqual(s,before,'Extraction changed master data');
assert.ok(M.receiptIssues(s,r,now).some(i=>/confirm a density/.test(i.message)),'Quart suggestion must not become a gram quantity without confirmation');
assert.equal(M.prepareReceipt(s,r,now),false);assert.equal(M.receiptCandidates(s,r,now).length,0);
r.lines.forEach(l=>{l.description='User description';l.productCode='';});assert.equal(M.receiptCandidates(s,r,now).length,0,'Edited descriptions re-added OCR rows');
const varied=M.receiptSuggestions(s,receipt('COSTCO\nE 384962 KS U/S QTRS 9.49\nF 384962 BUTTER QTRS 8.49\nTAX 0.00'),now).lines;
assert.equal(varied.length,1);assert.equal(varied[0].productCode,'384962');assert.equal(varied[0].price,17.98,'Repeated lines must sum actual prices');assert.equal(varied[0].packageCount,2);
const conflict=M.receiptSuggestions(s,receipt('COSTCO\n673678 HVY CREAM 1QT 4.39\n673678 HVY CREAM 2QT 7.99\nTAX 0.00'),now).lines[0];
assert.equal(conflict.price,12.38);assert.equal(conflict.packSize,null);assert.equal(conflict.size,null);assert.equal(conflict.needsReview,true);assert.match(conflict.parseNote,/Different pack sizes/);
const refunds=M.receiptSuggestions(s,receipt('COSTCO\n384962 BUTTER 9.49\n384962 BUTTER -9.49\nTAX 0.00'),now).lines;
assert.equal(refunds.length,2);assert.equal(refunds[0].price,9.49);assert.equal(refunds[1].excluded,true);
const generic=M.receiptSuggestions(s,receipt('Local Shop\nE 123 MILK 3.99\nHVY CREAM QT 4.39\nTAX 0.00'),now).lines;
assert.equal(generic[0].description,'E 123 MILK');assert.equal(generic[1].size,null,'Costco rule leaked to unknown retailer');
// A saved pack must not hide new conflicting printed sizes or uncertain OCR.
s.mappings['costco|sku:673678']={ingredientId:'cream',packSize:1000,size:1000,unit:'g'};
const learnedConflict=M.receiptSuggestions(s,receipt('COSTCO\n673678 HVY CREAM 1QT 4.39\n673678 HVY CREAM 2QT 7.99\nTAX 0.00'),now).lines[0];
assert.equal(learnedConflict.size,null);assert.equal(learnedConflict.needsReview,true);
const recheck=M.suggestReceiptLine(s,'Costco',{...learnedConflict});assert.equal(recheck.size,null,'Retailer change reused pack despite conflicting printed sizes');assert.equal(recheck.needsReview,true);
// Exact shape of the previous parser's untouched two cream drafts.
const upgrade=receipt('COSTCO\n673678 HVY CREAM QT 4.39\nmmmmmmmmm! 673678 HVY CREAM QT 4.39\nTAX 0.00\n08/24/2026');
upgrade.preparedVersion=2;upgrade.lines=['673678 HVY CREAM QT','mmmmmmmmm! 673678 HVY CREAM QT'].map((d,n)=>({description:n?d:'HVY CREAM QT',originalDescription:d,productCode:n?'':'673678',ingredientId:'cream',price:4.39,size:null,packSize:null,unit:'g',packageCount:1,quantitySource:'',needsReview:true,reviewMode:true,priceChangeConfirmed:false,excluded:false}));
const untouched=clone(upgrade);M.prepareReceipt(s,upgrade,now);assert.equal(upgrade.lines.length,1);assert.equal(upgrade.lines[0].price,8.78);assert.equal(upgrade.lines[0].size,2);assert.equal(M.prepareReceipt(s,upgrade,now),false);
for(const edits of [{needsReview:false},{priceChangeConfirmed:true},{excluded:true},{description:'My cream'},{price:5},{quantitySource:'Saved pack size'},{size:500},{packSize:500,size:500}]){
 const edited=clone(untouched);Object.assign(edited.lines[0],edits);const old=clone(edited.lines);M.prepareReceipt(s,edited,now);assert.deepEqual(edited.lines,old,'Upgrade changed user edits: '+JSON.stringify(edits));
}
for(const status of ['Reviewed','Archived']){const keep=clone(untouched);keep.status=status;const old=clone(keep);assert.equal(M.prepareReceipt(s,keep,now),false);assert.deepEqual(keep,old);}
const valid=clone(before);valid.receipts=[upgrade];M.validate(valid);valid.receipts[0].lines[0].sourceRows=['bad'];assert.throws(()=>M.validate(valid),/source rows/);
console.log('Local receipt parsing passed: 12 items / $85.57, repeated prices, noisy/tax-prefixed codes, short-code review, QT vs QTRS, unit safety, conflicting packs, refund isolation, provenance, preserved edits and upgrade idempotence.');
