// DELIVERY.md is the only message source. Never hand-edit the generated message.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'DELIVERY.md'),'utf8');
function section(pattern){const match=source.match(pattern);if(!match)throw Error('Required DELIVERY.md section missing');return match[1].trim();}
const steps=section(/## Install steps \(send exactly this\)\r?\n([\s\S]*?)(?=\r?\n## |$)/);
// Locked to the seven canonical steps agreed with the user. A change needs an explicit user request.
if(crypto.createHash('sha256').update(steps).digest('hex')!=='8f0ed80cd9291587b897eebbccc3301d1fcf4b28b42ef954cc5e25fe9e67e425')throw Error('Canonical install steps changed. Restore the agreed text.');
const news=section(/## (What's new[^\n]*\r?\n[\s\S]*?)(?=\r?\n## |$)/);
const message="Hi Heidy! Here's the Heidy Bakery Installer.pkg update.\n\nTo install:\n"+steps+'\n\n'+news+'\n';
const args=process.argv.slice(2);
let output=path.join(root,'WHATSAPP-MESSAGE.txt');
if(args[0]==='--output'&&args.length===2)output=path.resolve(args[1]);
else if(args.length&&!(args.length===1&&args[0]==='--check'))throw Error('Usage: node Scripts/generate-delivery.cjs [--check | --output path]');
if(args[0]==='--check'){
 if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==message)throw Error('WHATSAPP-MESSAGE.txt is stale. Run node Scripts/generate-delivery.cjs and include the result with the release changes.');
 console.log('Delivery message matches DELIVERY.md; all seven canonical install steps unchanged.');
}else fs.writeFileSync(output,message);
