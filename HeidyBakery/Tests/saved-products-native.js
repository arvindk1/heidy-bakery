// Run with an isolated fixture library containing only the butter purchase.
try {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f,label){for(let n=0;n<300;n++){if(f())return;await pause(100);}throw Error(label);}
 function check(value,label){if(!value)throw Error(label);}
 const input=(name,value)=>{const el=document.querySelector('#dialog [name='+name+']');el.value=value;el.dispatchEvent(new Event('input'));};
 async function submit(){document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'Dialog save');await saveTail;}
 function edit(){const ready=document.querySelector('.receipt-ready');if(ready)ready.open=true;document.querySelector('[data-edit-purchase="0"]').click();}
 function paste(){document.querySelector('#parse-product').closest('details').open=true;input('productNotes','Butter, Unsalted, 1 lb, 4 ct');document.querySelector('#parse-product').click();document.querySelector('#confirm-paste').checked=true;document.querySelector('#apply-paste').click();}
 await until(()=>state?.receipts.some(r=>r.id==='legacy')&&document.querySelector('#new-recipe'),'Fixture load');
 check(appVersion.version==='0.3.5'&&appVersion.build==='8','Build version');
 const original=JSON.stringify((await native('load')).state);
 openReceiptRecord('legacy');await until(()=>document.querySelector('[data-edit-purchase="0"]'),'Receipt card');edit();paste();
 check(document.querySelector('[name=size]').value==='8','Inner package count confused with purchased count');
 document.querySelector('#dialog-cancel').click();check(JSON.stringify((await native('load')).state)===original,'Cancel changed SQLite');
 edit();paste();await submit();check(!state.products,'Paste prematurely learned match');
 document.querySelector('#approve-receipt').click();await until(()=>document.querySelector('#dialog').open,'Approval preview');await submit();
 let loaded=(await native('load')).state,product=M.savedProduct(loaded,'Costco','','384962');
 check(product.packSize===4&&product.unit==='lb','Approved package missing from SQLite');
 check(product.provenance.source==='Pasted details, confirmed','Confirmation source missing');
 const ingredients=JSON.stringify(loaded.ingredients);
 const repeat={...clone(state.receipts[0]),id:'repeat',date:'2026-09-09',status:'Needs review',text:'',lines:[M.suggestReceiptLine(state,'Costco',{description:'KS U/S QTRS',productCode:'384962',price:18.98,packSize:null,size:null,unit:'',packageCount:2,excluded:false})]};
 state.receipts.push(repeat);await save('Test repeat');openReceiptRecord('repeat');edit();
 document.querySelector('#remembered-product details').open=true;input('rememberedPack','5');document.querySelector('#review-remembered').click();document.querySelector('[name=confirmProductChange]').checked=true;await submit();
 loaded=(await native('load')).state;check(M.savedProduct(loaded,'Costco','','384962').packSize===5,'Saved correction lost on reload');check(JSON.stringify(loaded.ingredients)===ingredients,'Saved correction changed current prices');
 edit();document.querySelector('#remembered-product details').open=true;document.querySelector('#forget-product').click();document.querySelector('[name=confirmProductChange]').checked=true;await submit();
 check(!M.savedProduct((await native('load')).state,'Costco','','384962'),'Forgotten match persisted');
 document.querySelector('[data-tab=settings]').click();document.querySelector('#undo').click();await submit();
 check(M.savedProduct((await native('load')).state,'Costco','','384962').packSize===5,'Native undo lost product records');
 return 'Native saved products passed: paste/cancel, approval, SQLite persistence, source provenance, corrected package, unchanged master prices, forget and undo.';
} catch(error) {return 'FAIL: '+error.message;}
