const fs=require('node:fs'),path=require('node:path'),M=require('../Resources/model.js');
const now=new Date('2026-09-09T12:00:00Z');
function fixture(){
  const s=M.empty();s.imported=true;
  s.ingredients=[['egg','Egg',3000,'g'],['cream','Heavy Cream',946,'g'],['butter','Butter',1812,'g'],['milk','Milk',3900,'g'],['banana','Banana',700,'g'],['croissant','Croissant',12,'each'],['rice','Rice Flour',1000,'g'],['almond','Almond Flour',1360,'g']].map(([id,name,size,unit])=>({id,name,size,unit,price:10,kind:'ingredient',supplier:'Costco',updated:'2026-07-01',history:[]}));
  s.recipes=[{id:'cake',name:'Egg cake',yield:10,unit:'piece',laborHours:0,laborEffort:'Custom',otherCost:0,retail:4,bulk:3,bulkMin:1,bulkPackaging:null,bulkLaborHours:null,notes:'',category:'',lines:[{id:'eggs',ingredientId:'egg',quantity:200,unit:'g',perPiece:false}]}];
  const r={id:'legacy',file:'legacy.jpg',originalName:'legacy.jpg',supplier:'Costco',date:'2026-08-24',status:'Needs review',text:fs.readFileSync(path.join(__dirname,'fixtures/costco-ocr.txt'),'utf8'),importedAt:'2026-09-01T12:00:00Z',lines:[],preparedVersion:3};
  r.lines=M.receiptSuggestions(s,r,now).lines;
  // Exact legacy shape at the missing upgrade boundary: already version 3,
  // no original source rows or reviewMode, and matched items with absent quantities.
  for(const l of r.lines){delete l.sourceRows;delete l.sourceDescriptions;delete l.reviewMode;delete l.parseNote;delete l.matchCandidates;delete l.matchReason;delete l.packSize;}
  const cream=r.lines.find(l=>l.ingredientId==='cream');cream.size=null;cream.unit='g';cream.quantitySource='';
  const milk=r.lines.find(l=>l.ingredientId==='milk');milk.description='3 WHOLE MILK';milk.originalDescription='3 WHOLE MILK';
  s.receipts=[r];return s;
}
module.exports={fixture,now};
