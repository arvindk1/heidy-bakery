// Runs inside the shipping WKWebView and SQLite store, against copied receipts only.
try {
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let n=0;n<300;n++){if(f())return;await pause(100)}throw Error(label)}
function check(v,label){if(!v)throw Error(label)}
await until(()=>lastSaved?.receipts.some(r=>r.supplier==='GFS')&&document.querySelector('#new-recipe'),'Draft preparation');
const loaded=await native('load'),before=clone(loaded.state);
check(loaded.appVersion.version==='0.3.4'&&loaded.appVersion.build==='7','Bundle version unavailable');
const costco=state.receipts.find(r=>r.supplier==='Costco');
check(costco.lines.length===9 && costco.lines.reduce((n,l)=>n+l.packageCount,0)===12,'Costco item accounting');
check(Math.round(costco.lines.reduce((n,l)=>n+l.price,0)*100)===8557,'Costco subtotal');
const cream=costco.lines.find(l=>l.productCode==='673678');check(cream.size===2&&cream.unit==='qt'&&cream.price===8.78,'Combined cream quantity/price');
check(M.receiptCandidates(state,costco).length===0,'Repeated candidate search');
check((await native('load')).state.receipts.find(r=>r.id===costco.id).lines.every(l=>l.sourceRows.length),'OCR provenance not saved');
const r=state.receipts.find(r=>r.supplier==='GFS'),i=state.ingredients.find(i=>i.name==='European Butter');
check(r.date==='2026-08-29'&&r.lines.length===1&&r.lines[0].price===39.9&&r.lines[0].packageCount===10,'Actual GFS receipt extraction');
check(r.lines[0].productCode,'Product code was not retained from the receipt');
openReceiptRecord(r.id);await until(()=>document.querySelector('#receipt-image img'),'Original preview');
check(document.querySelector('#receipt-supplier').value==='GFS','Retailer missing');
document.querySelector('#approve-receipt').click();await pause(200);check(!document.querySelector('#dialog').open,'Missing size reached approval');
document.querySelector('[data-edit-purchase="0"]').click();
// 227 g is synthetic test input. No quantity is guessed or approved in the live library.
const pack=document.querySelector('#dialog [name=packSize]');pack.value='227';pack.dispatchEvent(new Event('input'));
check(document.querySelector('#dialog [name=size]').value==='2270','Pack multiplication');
document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'Draft save');await saveTail;
const date=document.querySelector('#receipt-date');date.value='';date.dispatchEvent(new Event('change'));await saveTail;
document.querySelector('#approve-receipt').click();await pause(200);check(!document.querySelector('#dialog').open,'Missing date reached approval');
date.value='2026-08-29';date.dispatchEvent(new Event('change'));document.querySelector('#approve-receipt').click();
await until(()=>document.querySelector('#dialog').open,'Approval preview');check(document.querySelector('#dialog-body').textContent.includes('Current / unit'),'Price preview missing');
document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'Approve');await saveTail;
const disk=(await native('load')).state,changed=disk.ingredients.find(x=>x.id===i.id),reviewed=disk.receipts.find(x=>x.id===r.id);
check(changed.price===39.9&&changed.size===2270&&changed.receiptId===r.id,'Master save failed');
check(changed.history.some(h=>h.receiptId===r.id),'History missing');check(reviewed.approvalSummary.updated===1,'Result missing');
check(disk.mappings['gfs|sku:'+r.lines[0].productCode].packSize===227,'Pack learning not persisted');
check(disk.recipes.every(x=>{const old=before.recipes.find(y=>y.id===x.id);return x.retail===old.retail&&x.bulk===old.bulk}),'Selling prices changed');
const repeat=M.suggestReceiptLine(disk,'Gordon Food Service Store',{description:'Short receipt name',productCode:r.lines[0].productCode,packageCount:3,price:11.97,size:null,unit:'',excluded:false});
check(repeat.ingredientId===i.id&&repeat.size===681&&repeat.needsReview===false,'Remembered match or count failed after native reload');
document.querySelector('[data-view-ingredient="'+i.id+'"]').click();check(document.querySelector('#dialog [name=name]').value===i.name,'Ingredient link failed');document.querySelector('#dialog-cancel').click();
state=M.validate(await native('undo'));lastSaved=clone(state);check(state.ingredients.find(x=>x.id===i.id).price===i.price,'Undo failed');check(!state.mappings['gfs|sku:'+r.lines[0].productCode],'Undo left learned mapping');
return 'PASS: native WebKit, actual receipt retailer/date/product extraction, original preview, pack multiplication, date/quantity gates, price preview, SQLite approval/history/summary, learned mapping reload, different pack counts, ingredient link, unchanged selling prices, version/build, and undo. Isolated data only.';
} catch(e) { return 'FAILED: '+e.message+'\n'+e.stack; }
