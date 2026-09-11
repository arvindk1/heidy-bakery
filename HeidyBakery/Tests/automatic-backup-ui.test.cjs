const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
let saved=fixture(),status={path:'/test/Automatic Backups',lastSuccess:'',error:''},failBackup=true,browser;
(async()=>{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  await context.setOffline(true);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeBinding('nativeCall',async(_,{id,action,payload})=>{
    let result;
    if(action==='load')result={state:clone(saved),seed:fixture(),inbox:'',automaticBackup:clone(status)};
    else if(action==='save'){
      saved=M.validate(clone(payload));
      if(failBackup)status.error='Automatic backup needs attention: The backup folder is unavailable.';
      result={saved:true,automaticBackup:clone(status)};
    }else if(action==='chooseBackupFolder')result=null;
    else if(action==='retryAutomaticBackup'){
      status.error=failBackup?'Automatic backup needs attention: The backup folder is unavailable.':'';
      if(!failBackup)status.lastSuccess='2026-09-11T16:00:00Z';
      result=clone(status);
    }else if(action==='backup'){
      status.path='/test/Manual backup folder';
      result={path:'/test/Manual backup folder/Full backup.heidybackup',automaticBackup:clone(status)};
    }else throw Error('Unexpected action '+action);
    return{id,result};
  });
  await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage:m=>window.nativeCall(m).then(window.nativeReply)}}};});
  async function load(){await page.goto('file://'+path.resolve(__dirname,'../Resources/index.html'));await page.locator('#new-recipe').waitFor();}
  await load();assert.equal(await page.locator('#automatic-backup-warning').isVisible(),false);
  await page.locator('[data-tab=settings]').click();
  const prior=await page.locator('#automatic-backup-status').innerText();
  await page.locator('#choose-backup-folder').click();assert.equal(await page.locator('#automatic-backup-status').innerText(),prior);
  await page.locator('[name=laborRate]').fill('31');await page.locator('#settings-form button').click();
  await page.getByText('Saved on this Mac',{exact:true}).waitFor();assert.equal(saved.settings.laborRate,31,'Backup failure rolled back a saved edit');
  assert.equal(await page.locator('#automatic-backup-warning').getAttribute('role'),'alert');
  assert.match(await page.locator('#automatic-backup-warning').innerText(),/records remain saved/);
  await page.locator('[data-tab=ingredients]').click();assert.equal(await page.locator('#automatic-backup-warning').isVisible(),true);
  await load();assert.equal(saved.settings.laborRate,31);assert.equal(await page.locator('#automatic-backup-warning').isVisible(),true);
  await page.locator('[data-tab=settings]').click();await page.locator('#retry-auto-backup').click();assert.equal(await page.locator('#automatic-backup-warning').isVisible(),true);
  failBackup=false;await page.locator('#retry-auto-backup').click();await page.locator('#automatic-backup-warning').waitFor({state:'hidden'});
  assert.match(await page.locator('#automatic-backup-status').innerText(),/2026-09-11T16:00:00Z/);
  await page.locator('#backup').click();await page.getByText('Full backup saved.',{exact:true}).waitFor();
  assert.match(await page.locator('#automatic-backup-status').innerText(),/Manual backup folder/);
  assert.deepEqual(errors,[]);
  console.log('Automatic backup UI passed: silent healthy status, cancel, saved edits survive backup failure, persistent warning across navigation/reload, retry failure/recovery and manual backup compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
