const fs=require('node:fs'),path=require('node:path'),M=require('../Resources/model.js');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
function fixture(){
 const s=M.empty();s.settings.retailMarkup=50;s.settings.bulkMarkup=30;
 const item=(id,price,size,unit,kind='ingredient')=>({id,name:id,kind,supplier:'Fixture',price,size,unit,updated:'2026-01-01',history:[]});
 s.ingredients=[item('flour',10,1000,'g'),item('rice',4,1000,'g'),item('bag',2,10,'each','packaging')];
 const recipe=(id,lines)=>({id,name:id,yield:10,unit:'piece',laborHours:1,laborEffort:'easy',otherCost:1,retail:9,bulk:6,bulkMin:5,bulkPackaging:null,bulkLaborHours:null,notes:'',category:'',lines});
 const line=(id,ingredientId,quantity,unit,perPiece=false)=>({id,ingredientId,quantity,unit,perPiece});
 s.recipes=[recipe('Bread',[line('flourline','flour',1000,'g'),line('bagline','bag',1,'each',true)]),recipe('Rice bread',[line('riceline','rice',500,'g')])];return s;
}
const cases={
 baseline(){},
 ingredient_id(s,t){s.recipes[0].lines[0].ingredientId=t.Lines[1][2]='rice'},
 recipe_id(s,t){const l=s.recipes[0].lines.shift();s.recipes[1].lines.push(l);t.Lines[1][1]='Rice bread'},
 package_unit(s,t){s.ingredients[0].unit=t.Ingredients[1][6]='kg'},
 incompatible_units(s,t){s.ingredients[0].unit=t.Ingredients[1][6]='ml'},
 blank_package_price(s,t){s.ingredients[0].price=t.Ingredients[1][4]=null},
 negative_package_price(s,t){s.ingredients[0].price=t.Ingredients[1][4]=-2},
 blank_quantity(s,t){s.recipes[0].lines[0].quantity=t.Lines[1][3]=null},
 negative_quantity(s,t){s.recipes[0].lines[0].quantity=t.Lines[1][3]=-5},
 blank_labor(s,t){s.recipes[0].laborHours=t.Recipes[1][4]=null},
 blank_labor_rate(s,t){s.settings.laborRate=t.Settings[1][1]=null},
 zero_labor_rate(s,t){s.settings.laborRate=t.Settings[1][1]=0},
 blank_other(s,t){s.recipes[0].otherCost=t.Recipes[1][11]=null},
 no_markups(s,t){s.settings.retailMarkup=t.Settings[2][1]=null;s.settings.bulkMarkup=t.Settings[3][1]=null},
 zero_markups(s,t){s.settings.retailMarkup=t.Settings[2][1]=0;s.settings.bulkMarkup=t.Settings[3][1]=0},
 no_selling_prices(s,t){s.recipes[0].retail=t.Recipes[1][6]=null;s.recipes[0].bulk=t.Recipes[1][7]=null},
 zero_selling_prices(s,t){s.recipes[0].retail=t.Recipes[1][6]=0;s.recipes[0].bulk=t.Recipes[1][7]=0},
 bulk_overrides(s,t){s.recipes[0].bulkPackaging=t.Recipes[1][12]=.1;s.recipes[0].bulkLaborHours=t.Recipes[1][13]=.5},
 invalid_bulk(s,t){s.recipes[0].bulkPackaging=t.Recipes[1][12]=-1},
 zero_yield(s,t){s.recipes[0].yield=t.Recipes[1][2]=0},
 reorder_master(s,t){[s.ingredients[0],s.ingredients[1]]=[s.ingredients[1],s.ingredients[0]];for(const col of [0,1,2,3,4,5,6,7,9])[t.Ingredients[1][col],t.Ingredients[2][col]]=[t.Ingredients[2][col],t.Ingredients[1][col]]},
 reorder_settings(s,t){[t.Settings[1],t.Settings[3]]=[t.Settings[3],t.Settings[1]]},
};
const expected={};
for(const [name,change]of Object.entries(cases)){
 const s=fixture(),book=M.workbook(s),tables=Object.fromEntries(book.sheets.map(x=>[x.name,x.rows]));change(s,tables);
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(book));
 expected[name]=s.recipes.map(r=>{const c=M.calculate(s,r);return{name:r.name,values:[c.unit,c.retailSuggested,r.retail,M.margin(c.unit,r.retail)==null?null:M.margin(c.unit,r.retail)/100,c.bulkUnit,c.bulkSuggested,r.bulk,M.margin(c.bulkUnit,r.bulk)==null?null:M.margin(c.bulkUnit,r.bulk)/100]}});
}
fs.writeFileSync(path.join(out,'expected.json'),JSON.stringify(expected));
console.log(Object.keys(cases).length+' Excel edit scenarios prepared.');
