// Verify functional token pairings directly from the shipped stylesheet.
const fs = require('node:fs'), assert = require('node:assert/strict');
const css = fs.readFileSync(require.resolve('../Resources/style.css'), 'utf8');
const palettes = [...css.matchAll(/:root\{([^}]+)\}/g)].map(m => Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(x=>[x[1],x[2]]))).filter(p=>p.control);
assert.equal(palettes.length,2);
function luminance(hex) {
  return hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
}
function ratio(a,b) { const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (hi+.05)/(lo+.05); }
let count=0;
for(const [index,p] of palettes.entries()) {
 for(const background of ['paper','wash','note']) {
  for(const foreground of ['ink','muted','brand','bad','green','control','focus']) {
   const minimum=['control','focus'].includes(foreground)?3:4.5;
   assert.ok(ratio(p[foreground],p[background])>=minimum,`${index}: ${foreground}/${background} below ${minimum}`);count++;
  }
 }
 assert.ok(ratio(p['on-brand'],p.brand)>=4.5);count++;
}
console.log(`Refresh contrast passed: ${count} light/dark functional pairings; normal text >=4.5:1, controls/focus >=3:1.`);
