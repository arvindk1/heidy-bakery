// Runs only with the isolated receipt-product-fixture library.
try {
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(f,label){for(let n=0;n<300;n++){if(f())return;await pause(100);}throw Error(label);}
  function check(value,label){if(!value)throw Error(label);}
  async function submit(){document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'Dialog save');await saveTail;}
  const input=(name,value)=>{const el=document.querySelector('#dialog [name='+name+']');el.value=value;el.dispatchEvent(new Event('input'));};
  await until(()=>state?.receipts.some(r=>r.id==='legacy')&&document.querySelector('#new-recipe'),'Load fixture');
  const loaded=await native('load');check(loaded.appVersion.version==='0.3.6'&&loaded.appVersion.build==='9','Version/build');
  const before=clone(loaded.state);openReceiptRecord('legacy');
  await until(()=>document.querySelector('#refresh-receipt'),'Legacy refresh offered');
  document.querySelector('#refresh-receipt').click();
  check(document.querySelector('#dialog-body').textContent.includes('Heavy Cream · 2 qt'),'New cream quantity absent from comparison');
  document.querySelector('#dialog-cancel').click();
  check(JSON.stringify((await native('load')).state)===JSON.stringify(before),'Cancel changed disk state');
  document.querySelector('#refresh-receipt').click();await submit();
  let receipt=state.receipts.find(r=>r.id==='legacy');
  check(receipt.lines.find(l=>l.ingredientId==='cream').size===2,'Refresh did not reach saved draft');
  check(JSON.stringify(state.ingredients)===JSON.stringify(before.ingredients),'Refresh changed master prices');
  // Isolate the egg purchase inside the test library. Other live receipts are never used.
  receipt.lines=receipt.lines.filter(l=>l.ingredientId==='egg');await save('Isolated test purchase');
  openReceiptRecord('legacy');await until(()=>document.querySelector('[data-edit-purchase="0"]'),'Egg card');
  document.querySelector('[data-edit-purchase="0"]').click();
  input('packSize','60');input('costingPack','3000');
  document.querySelector('#dialog [name=costingConfirmed]').checked=true;
  await submit();receipt=state.receipts.find(r=>r.id==='legacy');
  check(receipt.lines[0].size===120&&receipt.lines[0].unit==='each','Purchase quantity was overwritten');
  const beforeApproval=clone((await native('load')).state);
  document.querySelector('#approve-receipt').click();
  await until(()=>document.querySelector('#dialog').open,'Approval preview');
  check(document.querySelector('#dialog-body').textContent.includes('Egg cake'),'Recipe preview absent');
  await submit();
  const disk=(await native('load')).state,egg=disk.ingredients.find(i=>i.id==='egg');
  check(egg.unit==='g'&&egg.size===6000&&egg.price===16.58,'Native master costing quantity');
  check(disk.receipts[0].lines[0].size===120&&disk.receipts[0].lines[0].unit==='each','Saved receipt lost purchased count');
  check(disk.mappings['costco|sku:1025795'].costing.packSize===3000,'Confirmed product setup not persisted');
  const next=M.suggestReceiptLine(disk,'Costco',{description:'KS 5DZ EGGS',productCode:'1025795',packSize:60,packageCount:3,size:180,unit:'each',price:24.87,excluded:false});
  check(M.purchaseQuantity(disk,{supplier:'Costco'},next).size===9000,'Saved setup does not scale');
  check(M.purchaseQuantity(disk,{supplier:'GFS'},next)===null,'Saved setup crossed retailers');
  const undone=await native('undo');
  check(JSON.stringify(undone)===JSON.stringify(beforeApproval),'Undo did not restore price and mappings');
  return 'PASS: native legacy refresh preview/cancel/apply, separate purchase and recipe quantities, recipe cost preview, SQLite approval/history, learned setup after reload, retailer isolation and undo. Isolated fixture only.';
} catch(e) {return 'FAILED: '+e.message+'\n'+e.stack;}
