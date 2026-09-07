// Executed by the real WKWebView against an isolated native Store, without a bridge adapter.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label){for(let n=0;n<500;n++){if(test())return;await pause(100)}throw Error('Timed out: '+label)}
function check(value,label){if(!value)throw Error(label)}
await until(()=>seed&&document.querySelector('#import-seed'),'welcome');
document.querySelector('#import-seed').click();
await until(()=>lastSaved?.imported,'seed saved');
const recipeID=state.recipes[0].id;
const price=document.querySelector('[data-price-kind=retail]');price.value='8.75';price.dispatchEvent(new Event('change',{bubbles:true}));
await until(()=>lastSaved.recipes[0].retail===8.75,'price saved');
const reloaded=await native('load');check(reloaded.state.recipes[0].retail===8.75,'Native reload lost price');
// The same foreground event used in the shipping app triggers pickup; no manual scan button.
window.dispatchEvent(new Event('focus'));
await until(()=>!receiptImportRunning,'first automatic scan');
window.dispatchEvent(new Event('focus'));
await until(()=>!receiptImportRunning&&state.receipts.length>=2,'stable automatic pickup');
check(state.receipts.every(r=>r.status==='Needs review'),'Receipt was approved automatically');
const r=state.receipts[0];openReceiptRecord(r.id);
const supplier=document.querySelector('#receipt-supplier');supplier.value='Native smoke retailer';supplier.dispatchEvent(new Event('change',{bubbles:true}));
await saveTail;
const date=document.querySelector('#receipt-date');date.value=today();date.dispatchEvent(new Event('change',{bubbles:true}));
await saveTail;
document.querySelector('#add-purchase').click();
const i=state.ingredients.find(x=>x.name==='Rice Flour')||state.ingredients[0];
for(const [name,value]of Object.entries({description:'FLOUR',ingredientId:i.id,price:'13.54',size:'1000',unit:'g'}))document.querySelector('#dialog [name='+name+']').value=value;
document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'purchase saved');
document.querySelector('#approve-receipt').click();document.querySelector('#dialog-form').requestSubmit();
await until(()=>!document.querySelector('#dialog').open,'receipt approved');
const disk=await native('load');check(disk.state.receipts.find(x=>x.id===r.id).status==='Reviewed','Native approval missing');
check(disk.state.ingredients.find(x=>x.id===i.id).price===13.54,'Native master update missing');
check(disk.state.recipes.find(x=>x.id===recipeID).retail===8.75,'Selling price changed');
const image=await native('previewReceipt',{file:r.file});check(image.startsWith('data:image/png;base64,'),'Native original preview failed');
state=M.validate(await native('undo'));lastSaved=clone(state);
check(state.receipts.find(x=>x.id===r.id).status==='Needs review','Native undo did not reverse approval');
return 'Native UI passed: real WebKit load, seed import, SQLite persistence/reload, automatic folder pickup, manual receipt approval, original preview, stable selling prices and undo.';
