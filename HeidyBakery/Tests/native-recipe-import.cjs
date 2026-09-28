// Explicit private workbook paths are passed by the operator; no mirror/live library is used.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'Heidy Bakery.app/Contents/MacOS/HeidyBakery');
const files=process.argv.slice(2);if(files.length!==4)throw Error('Pass the four original recipe workbook paths.');
const books=files.map(file=>JSON.parse(cp.execFileSync(exe,['--read-recipe-fixture',path.resolve(file)],{maxBuffer:30e6})));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'heidy-recipe-native-'));
const common=`const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let n=0;n<600;n++){if(f())return;await pause(50);}throw Error(label);}
function check(v,label){if(!v)throw Error(label);}
function verify(){const s=HeidyApp.getState();check(s.recipes.length===96,'Expected 96 recipes');check(s.recipes.reduce((n,r)=>n+r.lines.length,0)===1407,'Expected 1407 material lines');const cloud=s.recipes.filter(r=>r.source.startsWith('Cloud Chiffon Series.xlsx'));check(cloud.length===11&&cloud.every(r=>r.retail==null&&r.bulk==null),'Cloud prices');const hs=s.recipes.filter(r=>/\\bHS\\b/.test(r.name));check(hs.length>0&&hs.every(r=>r.retail==null&&r.bulk==null),'HS prices');const w=s.recipes.find(r=>r.name==='(W)Biscoff Earlgrey Bun');check(w.bulk===5.75&&w.retail===null,'Wholesale price');check(s.ingredients.every(i=>i.price===null),'Missing materials must be unpriced');return s;}
`;
const phases=[common+`
await until(()=>document.querySelector('#start-empty'),'Welcome missing');document.querySelector('#start-empty').click();await until(()=>document.querySelector('#new-recipe'),'Empty library not saved');
const bridge=native;native=(action,payload)=>action==='importRecipeWorkbooks'?Promise.resolve(${JSON.stringify(books)}):bridge(action,payload);
document.querySelector('[data-tab=recipes]').click();document.querySelector('#import-recipes').click();await until(()=>document.querySelector('#dialog').open,'Review missing');check(document.querySelectorAll('input[name=use]').length===96,'Review count');document.querySelector('#dialog-cancel').click();check(HeidyApp.getState().recipes.length===0,'Cancel mutated state');
document.querySelector('#import-recipes').click();await until(()=>document.querySelector('#dialog').open,'Second review missing');for(const c of document.querySelectorAll('input[name=use]')){check(!c.disabled,'Unexpected blocked recipe');c.checked=true;}document.querySelector('input[name=createMissing]').checked=true;document.querySelector('#dialog-submit').click();await until(()=>!document.querySelector('#dialog').open,'Import did not complete');await until(()=>document.querySelector('#save-status').textContent==='Saved on this Mac','Native save incomplete');verify();return 'PASS: real four-workbook review/cancel/apply, 96 recipes/1407 lines, native SQLite save, Cloud/HS/W prices. File-picker response injected; not manual picker coverage.';
`,common+`
await until(()=>document.querySelector('#new-recipe'),'Persisted library did not open');verify();return 'PASS: separate native process reopened the same SQLite library; all 96 recipes and channel prices persisted.';
`];
try {for(let n=0;n<phases.length;n++){const script=path.join(work,'phase'+n+'.js');fs.writeFileSync(script,phases[n]);cp.execFileSync(exe,['--ui-smoke'],{env:{...process.env,HEIDY_DATA_DIR:path.join(work,'library'),HEIDY_UI_TEST_SCRIPT:script},stdio:'inherit',timeout:90000});}}finally{fs.rmSync(work,{recursive:true,force:true});}
