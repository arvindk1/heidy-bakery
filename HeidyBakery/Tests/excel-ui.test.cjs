// Exercises UI routes with real native XLSX read/write and an isolated store adapter.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),M=require('../Resources/model.js'),clone=x=>JSON.parse(JSON.stringify(x));
const work=path.resolve(process.argv[2]||path.join(root,'work/excel-ui'));fs.mkdirSync(work,{recursive:true});
const exe=path.join(root,'Heidy Bakery.app/Contents/MacOS/HeidyBakery');
function fixture(){
 const s=M.empty();s.imported=true;s.settings.retailMarkup=50;s.settings.bulkMarkup=30;
 s.ingredients=[['dummy-flour','DUMMY Flour',10,1000,'g','ingredient'],['dummy-sugar','DUMMY Sugar',6,1000,'g','ingredient'],['dummy-bag','DUMMY Bag',2,10,'each','packaging']].map(([id,name,price,size,unit,kind])=>({id,name,price,size,unit,kind,supplier:'Dummy supplier',updated:'2026-09-01',history:[],freeConfirmed:false}));
 const line=(id,ingredientId,quantity,unit,perPiece=false)=>({id,ingredientId,quantity,unit,perPiece});
 const recipe=(id,name,yieldCount,laborHours,lines)=>({id,name,yield:yieldCount,unit:'piece',laborHours,laborEffort:'Custom',otherCost:0,retail:6,bulk:5,bulkMin:5,bulkPackaging:null,bulkLaborHours:null,notes:'Dummy data for import/export testing only.',category:'Dummy test',lines});
 s.recipes=[recipe('dummy-cake','DUMMY Vanilla Cake',10,1,[line('dummy-line-1','dummy-flour',1000,'g'),line('dummy-line-2','dummy-sugar',500,'g'),line('dummy-line-3','dummy-bag',1,'each',true)]),recipe('dummy-mini','DUMMY Mini Cake',5,.5,[line('dummy-line-4','dummy-flour',200,'g')])];return M.validate(s);
}
function write(book,name){const json=path.join(work,name+'.json'),xlsx=path.join(work,name+'.xlsx');fs.writeFileSync(json,JSON.stringify(book));execFileSync(exe,['--export-fixture',json,xlsx]);return xlsx;}
function read(file){return JSON.parse(execFileSync(exe,['--read-fixture',file],{stdio:['ignore','pipe','pipe']}).toString());}
let browser;
(async()=>{
 let saved=fixture(),exports=[],selectedImport=null,failSave=false,cancelExport=false,saveCalls=0;
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{try{let result=null;switch(action){
 case'load':result={state:clone(saved),seed:clone(fixture()),inbox:''};break;
 case'exportExcel':if(!cancelExport){result=write(payload,'export-'+exports.length);exports.push({file:result,book:payload});}break;
 case'importExcel':result=selectedImport?read(selectedImport):null;break;
 case'save':saveCalls++;if(failSave){failSave=false;throw Error('Simulated disk full');}saved=M.validate(clone(payload));result=true;break;
 default:throw Error('Unexpected action '+action);
 }return{id,result};}catch(e){return{id,error:e.stderr?.toString().trim()||e.message};}});
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
 async function open(){await page.goto('file://'+path.join(root,'Resources/index.html'));await page.locator('#new-recipe').waitFor();}
 async function chooseImport(file){selectedImport=file;await page.locator('[data-tab=recipes]').click();await page.locator('#import-recipes').click();}
 async function apply(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved on this Mac');}
 await open();await page.locator('#excel-prices').click();assert.equal(exports.length,1);assert.equal(read(exports[0].file).Recipes.length,3);
 await page.locator('[data-tab=settings]').click();await page.locator('#export-all').click();assert.equal(exports.length,2);assert.deepEqual(read(exports[0].file),read(exports[1].file));
 await page.locator('[data-tab=recipes]').click();await page.locator('#export-recipe').click();assert.equal(exports.length,3);assert.equal(read(exports[2].file).Recipes.length,2);
 const initial=clone(saved),dummy=exports[0].file;assert.ok(Math.abs(M.calculate(initial,initial.recipes[0]).unit-3.9)<1e-10);
 saved=M.empty();saved.imported=true;await open();await chooseImport(dummy);assert.ok((await page.locator('#dialog-body').innerText()).includes('New recipes'));assert.equal(saved.recipes.length,0);await apply();
 assert.equal(saved.recipes.length,2);assert.equal(saved.ingredients.length,3);assert.equal(saved.recipes[0].retail,6);assert.ok(Math.abs(M.calculate(saved,saved.recipes[0]).unit-3.9)<1e-10);
 const imported=clone(saved);await chooseImport(dummy);await apply();assert.deepEqual(saved,imported);
 const edited=M.workbook(initial),rt=edited.sheets.find(x=>x.name==='Recipes').rows;rt[1][6]=7.5;
 const editedFile=write(edited,'edited');await chooseImport(editedFile);const before=clone(saved);await page.locator('#dialog-cancel').click();assert.deepEqual(saved,before);
 await chooseImport(editedFile);await apply();assert.equal(saved.recipes[0].retail,7.5);
 await chooseImport(exports[2].file);await apply();assert.equal(saved.recipes.length,2);
 const calls=saveCalls;await chooseImport(null);assert.equal(saveCalls,calls);cancelExport=true;await page.locator('#export-recipe').click();assert.equal(exports.length,3);cancelExport=false;
 const stable=clone(saved),invalids=[];
 for(const [name,change] of [
 ['missing-sheet',b=>{b.sheets=b.sheets.filter(s=>s.name!=='Ingredients');}],
 ['bad-header',b=>{b.sheets.find(s=>s.name==='Recipes').rows[0][1]='Wrong header';}],
 ['duplicate-id',b=>{const t=b.sheets.find(s=>s.name==='Recipes').rows;t[2][0]=t[1][0];}],
 ['unknown-ingredient',b=>{b.sheets.find(s=>s.name==='Lines').rows[1][2]='unknown';}],
 ['formula-in-input',b=>{b.sheets.find(s=>s.name==='Recipes').rows[1][2]={formula:'1+1'};}]
 ]){const b=M.workbook(initial);change(b);invalids.push([name,write(b,name)]);}
 const corrupt=path.join(work,'corrupt.xlsx');fs.writeFileSync(corrupt,'not a workbook');invalids.push(['corrupt',corrupt]);
 for(const [name,file] of invalids){await chooseImport(file);assert.equal(await page.locator('#dialog').isVisible(),false,name);assert.deepEqual(saved,stable,name+' mutated state');const msg=await page.locator('#notice').innerText();assert.ok(msg.length>10);if(name==='missing-sheet')assert.ok(msg.includes('unsupported layout')&&msg.includes('No records were changed.'));if(name==='corrupt')assert.ok(msg.includes('could not be read as an Excel workbook'));}
 await chooseImport(editedFile);failSave=true;await page.locator('#dialog-submit').click();await page.locator('#dialog-error').getByText('Simulated disk full',{exact:true}).waitFor();assert.deepEqual(saved,stable);await apply();assert.equal(saved.recipes[0].retail,7.5);
 assert.deepEqual(errors,[]);fs.copyFileSync(dummy,path.join(work,'Dummy Recipe Import.xlsx'));
 fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({passed:true,exportRoutes:3,recipes:2,ingredients:3,expectedFirstRecipeUnitCost:3.9,invalidFiles:invalids.map(x=>x[0]),checks:['empty import','repeat import without duplicates','edit preview/cancel/apply','single recipe preserves other records','picker cancellation','save rollback/retry']},null,2));
 await browser.close();console.log('Excel UI checks passed: 3 export routes, real native XLSX read/write, empty/repeat/edited import, cancellation, single-recipe preservation, 6 invalid files, and save rollback/retry.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
