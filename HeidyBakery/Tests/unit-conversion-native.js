// Run only with a new, isolated HEIDY_DATA_DIR and a test Receipts/legacy.jpg.
try {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(f,label){for(let n=0;n<300;n++){if(f())return;await pause(100);}throw Error(label);}
 function check(value,label){if(!value)throw Error(label);}
 const input=(name,value)=>{const el=document.querySelector('#dialog [name='+name+']');el.value=value;el.dispatchEvent(new Event('input'));};
 const confirm=name=>{const el=document.querySelector('[name='+name+']');el.checked=true;el.dispatchEvent(new Event('change'));};
 async function submit(){document.querySelector('#dialog-form').requestSubmit();await until(()=>!document.querySelector('#dialog').open,'Dialog save');await saveTail;}
 async function approve(){document.querySelector('#approve-receipt').click();await until(()=>document.querySelector('#dialog').open,'Approval preview');await submit();}
 function edit(){const ready=document.querySelector('.receipt-ready');if(ready)ready.open=true;document.querySelector('[data-edit-purchase="0"]').click();}
 await until(()=>state && appVersion.version,'App load');check(appVersion.version==='0.3.7'&&appVersion.build==='10','Build version');
 const existing=(await native('load')).state;check(!existing || !existing.ingredients.length && !existing.receipts.length,'Refusing to replace a nonempty library');
 state=M.empty();state.imported=true;
 state.ingredients=['milk','banana'].map(id=>({id,name:id==='milk'?'Milk':'Banana',kind:'ingredient',supplier:'Costco',price:10,size:1000,unit:'g',updated:'2026-07-01',history:[]}));
 const receipt=(id,item,unit,size,code)=>({id,file:'legacy.jpg',originalName:'legacy.jpg',supplier:'Costco',date:'2026-08-24',status:'Needs review',text:'',importedAt:'2026-09-01T12:00:00Z',preparedVersion:3,lines:[{description:item,ingredientId:item,productCode:code,price:10,size,unit,packSize:size,packageCount:1,excluded:false,reviewMode:true,needsReview:false,priceChangeConfirmed:true}]});
 state.receipts=[receipt('milk-test','milk','gal',1,'milk-code'),receipt('banana-test','banana','each',6,'2619')];await save('Isolated conversion fixture');
 const ingredients=JSON.stringify((await native('load')).state.ingredients);
 openReceiptRecord('milk-test');edit();check(document.querySelector('[name=receiptDensity]').value==='','Density was prefilled');document.querySelector('#use-density-suggestion').click();check(!document.querySelector('[name=densityConfirmed]').checked,'Suggestion confirmed itself');confirm('densityConfirmed');await submit();check(JSON.stringify((await native('load')).state.ingredients)===ingredients,'Draft changed master');
 await approve();const afterApproval=await native('load');check(afterApproval.automaticBackup.lastSuccess&&!afterApproval.automaticBackup.error,'Automatic backup after approval');let loaded=afterApproval.state;check(loaded.ingredients[0].density===1.03,'Density not in SQLite');check(loaded.ingredients[0].size===3785.411784*1.03,'Gallon conversion');
 openReceiptRecord('banana-test');edit();check(document.querySelector('[name=measuredTotalWeight]').value==='','Item weight defaulted');input('measuredTotalWeight','900');confirm('weightConfirmed');await submit();await approve();
 loaded=(await native('load')).state;check(loaded.ingredients[1].size===900&&loaded.ingredients[1].avgUnitWeight===150,'Measured weight not in master');check(M.savedProduct(loaded,'Costco','','2619').weightMeasurement.totalWeight===900,'Product measurement not persisted');
 const repeat=receipt('repeat','banana','each',12,'2619');repeat.date='2026-09-02';repeat.lines[0].packageCount=2;repeat.lines[0].packSize=6;repeat.lines[0].price=20;state=loaded;state.receipts.push(repeat);await save('Isolated repeated receipt');openReceiptRecord('repeat');edit();check(document.querySelector('[name=measuredTotalWeight]').value==='','Second purchase was assigned an invented measurement');check(document.querySelector('#bridge-result').textContent.includes('1800 g'),'Saved weight not reused');document.querySelector('#dialog-cancel').click();
 await approve();loaded=(await native('load')).state;check(loaded.ingredients[1].size===1800,'Second quantity incorrect');
 document.querySelector('[data-tab=settings]').click();document.querySelector('#undo').click();await submit();loaded=(await native('load')).state;check(loaded.ingredients[1].size===900,'Native undo lost prior quantity');check(M.savedProduct(loaded,'Costco','','2619').avgUnitWeight===150,'Native undo lost saved measurement');
 return 'Native unit conversion passed: explicit density, measured count, draft isolation, approval, SQLite reload, same-product reuse and undo.';
} catch(error) {return 'FAIL: '+error.message;}
