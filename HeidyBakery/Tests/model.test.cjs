"use strict";

const assert = require('node:assert/strict');
const fs = require('fs');
const M = require('../Resources/model.js');
const clone = x => JSON.parse(JSON.stringify(x));
const seed = require('../Resources/seed.json');
const real = Object.assign(M.empty(), clone(seed));
M.validate(real);
const REAL_DATA = !/Synthetic example data/.test((seed.notes || [])[0] || '');
if (REAL_DATA) {
  assert.equal(real.recipes.length, 11);
  assert.equal(real.ingredients.length, 197);
  const golden = {
    'Vanilla': 2.532421872014937,
    'Vanilla (WS)': 2.532421872014937,
    'Matcha & Hojicha': 2.575297036124378,
    'Matcha & Hojicha (WS)': 2.575297036124378,
    'Banana Chocolate': 2.6687716836651507,
    'Banana Chocolate (WS)': 2.6687716836651507,
    'Cheese': 2.376261962026594,
    'Cheese (WS)': 3.876261962026594,
    'Lemon Tea': 4.457383019758672,
    'Peach Tea': 4.881724196229261,
    'Chestnut': null
  };
  for (const [name, expected] of Object.entries(golden)) {
    const actual = M.calculate(real, real.recipes.find(r => r.name === name)).unit;
    if (expected === null) assert.equal(actual, null, name + ' remains blocked');else assert.ok(Math.abs(actual - expected) < 1e-10, name + ' golden cost changed');
  }
  assert.equal(M.calculate(real, real.recipes.find(r => r.name === 'Chestnut')).errors.length, 1, 'Chestnut has exactly one blocking error');
  assert.equal(real.ingredients.find(i => i.name === 'Vanilla Paste').updated, '2019-08-31');
}
const s = M.empty();
s.settings.retailMarkup = 50;
s.settings.bulkMarkup = 25;
s.ingredients = [{
  id: 'flour',
  name: 'Flour',
  kind: 'ingredient',
  supplier: 'Test',
  price: 10,
  size: 1000,
  unit: 'g',
  updated: '2026-01-01',
  history: []
}, {
  id: 'bag',
  name: 'Bag',
  kind: 'packaging',
  supplier: 'Test',
  price: 2,
  size: 10,
  unit: 'each',
  updated: '2026-01-01',
  history: []
}];
s.recipes = [{
  id: 'r',
  name: 'Test recipe',
  yield: 10,
  unit: 'piece',
  laborHours: 1,
  otherCost: 1,
  retail: 9,
  bulk: 6,
  bulkMin: null,
  bulkPackaging: null,
  bulkLaborHours: null,
  lines: [{
    id: 'l1',
    ingredientId: 'flour',
    quantity: 1,
    unit: 'kg',
    perPiece: false
  }, {
    id: 'l2',
    ingredientId: 'bag',
    quantity: 1,
    unit: 'each',
    perPiece: true
  }]
}];
const r = s.recipes[0];
let c = M.calculate(s, r);
assert.equal(c.total, 37);
assert.equal(c.unit, 3.7);
assert.ok(Math.abs(c.retailSuggested - 5.55) < 1e-9);
assert.equal(M.margin(10, 15), 100 / 3);
assert.equal(M.factor('ml', 'g'), null);
assert.equal(M.factor('kg', 'g'), 1000);
r.bulkPackaging = .1;
r.bulkLaborHours = .5;
c = M.calculate(s, r);
assert.equal(c.bulkUnit, 2.4);
assert.equal(c.bulkSuggested, 3);
r.bulkPackaging = null;
r.bulkLaborHours = null;
const bad = clone(s);
bad.ingredients[0].size = null;
assert.equal(M.calculate(bad, bad.recipes[0]).unit, null);
const zero = clone(s);
zero.ingredients[0].price = 0;
let zeroCalc = M.calculate(zero, zero.recipes[0]);
assert.equal(zeroCalc.ing, 0);
assert.ok(zeroCalc.warnings.some(w => w.includes('Flour')));
zero.ingredients[0].freeConfirmed = true;
assert.ok(!M.calculate(zero, zero.recipes[0]).warnings.some(w => w.includes('free')));
bad.ingredients[0].size = 1000;
bad.recipes[0].lines[0].unit = 'ml';
assert.equal(M.calculate(bad, bad.recipes[0]).unit, null);
const older = {
  file: 'older.png',
  originalName: 'older.png',
  text: '',
  importedAt: '2026-01-01T00:00:00Z',
  id: 'receipt-old',
  date: '2025-12-01',
  supplier: 'Old store',
  status: 'Needs review',
  lines: [{
    description: 'FLOUR',
    ingredientId: 'flour',
    price: 5,
    size: 1000,
    unit: 'g',
    excluded: false
  }]
};
s.receipts.push(older);
M.approveReceipt(s, older);
assert.equal(s.ingredients[0].price, 10);
assert.equal(s.ingredients[0].history.length, 2);
assert.equal(older.notUpdated.length, 1);
assert.match(older.notUpdated[0].message, /not changed/);
const newer = {
  file: 'newer.png',
  originalName: 'newer.png',
  text: '',
  importedAt: '2026-01-01T00:00:00Z',
  id: 'receipt-new',
  date: '2026-02-01',
  supplier: 'New store',
  status: 'Needs review',
  lines: [{
    description: 'FLOUR',
    ingredientId: 'flour',
    price: 20,
    size: 1000,
    unit: 'g',
    excluded: false
  }]
};
s.receipts.push(newer);
M.approveReceipt(s, newer);
assert.equal(s.ingredients[0].price, 20);
assert.equal(r.retail, 9);
assert.equal(r.costBaseline, 3.7);
assert.equal(s.mappings['new store|flour'].ingredientId, 'flour');
assert.throws(() => M.approveReceipt(s, newer), /already/);
const invalid = {
  id: 'badreceipt',
  date: '2026-02-02',
  supplier: 'Store',
  status: 'Needs review',
  lines: [{
    description: 'FLOUR',
    ingredientId: 'flour',
    price: 4,
    size: null,
    unit: 'g',
    excluded: false
  }]
};
assert.throws(() => M.approveReceipt(s, invalid), /Confirm/);
assert.equal(s.ingredients[0].price, 20);
const duplicate = clone(newer);
duplicate.status = 'Needs review';
duplicate.lines.push(clone(duplicate.lines[0]));
assert.throws(() => M.approveReceipt(s, duplicate), /Combine/);
const unknown = clone(s);
unknown.recipes[0].yield = 0;
assert.throws(() => M.validate(unknown), /Invalid recipe/);
const ghost = clone(s);
ghost.recipes[0].lines[0].ingredientId = 'ghost';
assert.throws(() => M.validate(ghost), /master list/);
assert.throws(() => M.workbook(ghost), /master list/);
const duplicateLine = clone(s);
duplicateLine.recipes.push({
  ...clone(duplicateLine.recipes[0]),
  id: 'r2',
  name: 'Second',
  lines: [{
    ...clone(duplicateLine.recipes[0].lines[0])
  }]
});
assert.throws(() => M.validate(duplicateLine), /duplicate recipe line/);
const blankUnit = clone(s);
blankUnit.recipes[0].unit = '';
assert.throws(() => M.validate(blankUnit), /Invalid recipe/);
assert.deepEqual(M.laborEfforts, {
  easy: 1,
  Low: 2,
  Medium: 3,
  High: 4,
  Extreme: 5
});
if (REAL_DATA) assert.equal(real.recipes.find(r => r.name === 'Cheese (WS)').laborHours, 2);
assert.equal(M.localDate(new Date(2026, 8, 6, 22, 30)), '2026-09-06');
assert.equal(M.factor('mg', 'g'), .001);
assert.equal(M.factor('gal', 'ml'), 3785.411784);
const book = M.workbook(real),
  recipeSheet = book.sheets.find(x => x.name === 'Recipes');
assert.equal(recipeSheet.rows[0][5], 'Labour effort');
assert.equal(recipeSheet.rows[1][5], real.recipes[0].laborEffort || 'Custom');
const emptyRecipe = clone(s);
emptyRecipe.recipes[0].lines = [];
const emptyBook = M.workbook(emptyRecipe);
const formulas = JSON.stringify(emptyBook);
assert.ok(!formulas.includes('L2:L1'), 'zero-line export has no inverted range');
const output = process.argv[2];
if (output) {
  real.settings.retailMarkup = 50;
  real.settings.bulkMarkup = 30;
  fs.writeFileSync(output, JSON.stringify(M.workbook(real)));
}
console.log('Model checks passed: ' + (REAL_DATA ? '11 golden costs' : 'synthetic seed') + ', integrity, local dates, labour effort, zero-price warning, safe Excel formulas, receipts, markup and margins.');

// A historical row without a package unit must not break validation.
const h = M.empty();
h.ingredients = [{
  id: 'i1',
  name: 'X',
  kind: 'ingredient',
  supplier: 'S',
  price: 1,
  size: 100,
  unit: 'g',
  updated: '2026-01-01',
  history: [{
    supplier: 'S',
    price: 5.29,
    date: '',
    note: 'no size recorded'
  }]
}];
M.validate(h);
h.ingredients[0].history[0].receiptId = 'receipt-no-longer-present';
M.validate(h);
assert.equal(h.ingredients[0].history[0].price, 5.29);
assert.equal(h.ingredients[0].history[0].note, 'no size recorded');
console.log('Legacy history checks passed: absent unit and unavailable receipt keep their purchase records.');
