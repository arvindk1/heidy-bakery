// Requires HEIDY_RECEIPT_INBOX pointing to isolated receipt.JPG, empty waiting.jpg, and >40 MB oversize.pdf.
try {
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let n=0;n<300;n++){if(f())return;await pause(100)}throw Error(label)}
function check(v,label){if(!v)throw Error(label)}
await until(()=>seed&&document.querySelector('#import-seed'),'Load');
document.querySelector('#import-seed').click();await until(()=>lastSaved?.imported,'Seed saved');
await until(()=>!receiptImportRunning,'Initial scan');
// A first automatic pass waits for files to settle; the next reads the stable image.
await importReceipts('scanInbox',true);await importReceipts('scanInbox',true);await saveTail;
const disk=await native('load');check(disk.state.receipts.length===1,'Stable receipt pickup failed');check(disk.state.receipts[0].status==='Needs review','Automatic approval occurred');
check(pickupStatus.pending===1&&pickupStatus.pendingFiles.includes('waiting.jpg'),'Pending file status missing');check(pickupStatus.errors.some(x=>x.includes('oversize.pdf')&&x.includes('40 MB')),'File error missing');check(pickupStatus.lastChecked,'Last check missing');
const before=JSON.stringify(disk.state.ingredients);await importReceipts('scanInbox',false);check(state.receipts.length===1,'Duplicate created');check(before===JSON.stringify(state.ingredients),'Pickup changed master prices');
tab('settings');check(document.querySelector('[data-pickup-status]').textContent.includes('waiting'),'Pending UI missing');check(document.querySelector('[data-pickup-status]').textContent.includes('oversize.pdf'),'Error UI missing');check(document.querySelector('#inbox-path').textContent===inbox,'Folder path missing');
return 'PASS: native folder scanning, stable-file retry, original copying/OCR, duplicate suppression, pending filenames, per-file errors, timestamp and Settings display. Receipt stays a draft; master prices unchanged. Isolated inbox only.';
} catch(e) { return 'FAILED: '+e.message+'\n'+e.stack; }
