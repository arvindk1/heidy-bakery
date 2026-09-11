const assert=require('node:assert/strict'),M=require('../Resources/model.js'),{fixture}=require('./receipt-product-fixture.cjs');
const s=fixture(),costing={ingredientId:'butter',retailer:'costco',productCode:'384962',purchasePackSize:4,purchaseUnit:'lb',packSize:1812,unit:'g',confirmed:true};
const good={description:'KS U/S QTRS',ingredientId:'butter',productCode:'384962',price:20,packSize:4,packageCount:2,size:8,unit:'lb',excluded:false,costing};
assert.equal(M.clearReceiptCosting('Costco',good),false);assert.equal(good.costingNotice,undefined);
for(const [edit,reason] of [[{packSize:5,size:10},/package size/],[{productCode:'OTHER'},/product code/],[{unit:'kg'},/purchase unit/],[{ingredientId:'milk'},/matched ingredient/]]){const l={...good,...edit};assert.equal(M.clearReceiptCosting('Costco',l),true);assert.equal(l.costing,undefined);assert.match(l.costingNotice,/KS U\/S QTRS/);assert.match(l.costingNotice,reason);assert.equal(l.needsReview,true);}
const retailer={...good};M.clearReceiptCosting('GFS',retailer);assert.match(retailer.costingNotice,/retailer changed/);
const changed=M.suggestReceiptLine(s,'Costco',{...good,packSize:5,size:10});assert.equal(changed.costing,undefined);assert.match(changed.costingNotice,/package size/);assert.equal(changed.needsReview,true);
s.receipts[0].lines=[changed];M.validate(s);assert.equal(JSON.parse(JSON.stringify(s)).receipts[0].lines[0].costingNotice,changed.costingNotice);
console.log('Cleared recipe quantity notice passed: named line and reason, retained valid conversions, needs-review routing and persistence.');
