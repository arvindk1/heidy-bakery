const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=k=>cp.execFileSync('/usr/libexec/PlistBuddy',['-c','Print :'+k,path.join(root,'Info.plist')],{encoding:'utf8'}).trim();
const expectedVersion='Version '+read('CFBundleShortVersionString')+' · Build '+read('CFBundleVersion');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'heidy-native-smoke-'));
try {
 const script=path.join(work,'smoke.js');
 fs.writeFileSync(script,'const expectedVersion='+JSON.stringify(expectedVersion)+';\n'+fs.readFileSync(path.join(__dirname,'native-launch-smoke.js'),'utf8'));
 cp.execFileSync(path.join(root,'Heidy Bakery.app/Contents/MacOS/HeidyBakery'),['--ui-smoke'],{env:{...process.env,HEIDY_DATA_DIR:path.join(work,'library'),HEIDY_UI_TEST_SCRIPT:script},stdio:'inherit',timeout:90000});
} finally { fs.rmSync(work,{recursive:true,force:true}); }
