"use strict";

const assert = require('node:assert/strict');
const M = require('../Resources/model.js');
const seed = require('../Resources/seed.json');
const clone = x => JSON.parse(JSON.stringify(x));

console.log('Running Margin Watch tests (T1-T8)...');

// Helper to construct a minimal clean state
function baseState() {
  const s = M.empty();
  s.settings.laborRate = 20;
  return s;
}

// -----------------------------------------------------------------------------
// T1: Ingredient with 2 history entries, price rose
// -----------------------------------------------------------------------------
{
  const s = baseState();
  // Oldest: $10 for 1000g ($0.01/g). Current: $15 for 1000g ($0.015/g).
  s.ingredients = [{
    id: 'flour',
    name: 'Bread Flour',
    kind: 'ingredient',
    supplier: 'Supplier A',
    price: 15,
    size: 1000,
    unit: 'g',
    updated: '2026-03-01',
    history: [
      { date: '2026-01-01', supplier: 'Supplier A', price: 10, size: 1000, unit: 'g' },
      { date: '2026-03-01', supplier: 'Supplier A', price: 15, size: 1000, unit: 'g' }
    ]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.ingredients.length, 1, 'T1: 1 ingredient should be returned');
  const item = res.ingredients[0];
  assert.equal(item.ingredient.id, 'flour');
  assert.ok(item.deltaPercent > 0, 'T1: deltaPercent must be positive');
  assert.ok(item.deltaDollarsPerUnit > 0, 'T1: deltaDollarsPerUnit must be positive');
  // Hand-calculated: then = 0.01, now = 0.015
  // deltaPercent = 100 * (0.015 / 0.01 - 1) = +50%
  // deltaDollarsPerUnit = 0.015 - 0.01 = +0.005 $/g
  assert.ok(Math.abs(item.deltaPercent - 50) < 1e-9, `T1: deltaPercent expected 50, got ${item.deltaPercent}`);
  assert.ok(Math.abs(item.deltaDollarsPerUnit - 0.005) < 1e-9, `T1: deltaDollars expected 0.005, got ${item.deltaDollarsPerUnit}`);
}

// -----------------------------------------------------------------------------
// T2: Ingredient with 2 history entries, price fell
// -----------------------------------------------------------------------------
{
  const s = baseState();
  // Oldest: $20 for 1000g ($0.02/g). Current: $14 for 1000g ($0.014/g).
  s.ingredients = [{
    id: 'sugar',
    name: 'Cane Sugar',
    kind: 'ingredient',
    supplier: 'Supplier B',
    price: 14,
    size: 1000,
    unit: 'g',
    updated: '2026-03-01',
    history: [
      { date: '2026-01-01', supplier: 'Supplier B', price: 20, size: 1000, unit: 'g' },
      { date: '2026-03-01', supplier: 'Supplier B', price: 14, size: 1000, unit: 'g' }
    ]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.ingredients.length, 1, 'T2: 1 ingredient should be returned');
  const item = res.ingredients[0];
  assert.ok(item.deltaPercent < 0, 'T2: deltaPercent must be negative');
  assert.ok(item.deltaDollarsPerUnit < 0, 'T2: deltaDollarsPerUnit must be negative');
  // Hand-calculated: then = 0.02, now = 0.014
  // deltaPercent = 100 * (0.014 / 0.02 - 1) = -30%
  // deltaDollarsPerUnit = 0.014 - 0.02 = -0.006 $/g
  assert.ok(Math.abs(item.deltaPercent - (-30)) < 1e-9, `T2: deltaPercent expected -30, got ${item.deltaPercent}`);
  assert.ok(Math.abs(item.deltaDollarsPerUnit - (-0.006)) < 1e-9, `T2: deltaDollars expected -0.006, got ${item.deltaDollarsPerUnit}`);
}

// -----------------------------------------------------------------------------
// T3: Ingredient with 0 or 1 history entries -> Excluded from ranked list
// -----------------------------------------------------------------------------
{
  const s = baseState();
  s.ingredients = [
    {
      id: 'zero-hist',
      name: 'Item Zero History',
      kind: 'ingredient',
      price: 10,
      size: 1000,
      unit: 'g',
      history: []
    },
    {
      id: 'one-hist',
      name: 'Item One History',
      kind: 'ingredient',
      price: 10,
      size: 1000,
      unit: 'g',
      history: [
        { date: '2026-01-01', price: 10, size: 1000, unit: 'g' }
      ]
    },
    {
      id: 'no-move',
      name: 'Item Price Unchanged',
      kind: 'ingredient',
      price: 10,
      size: 1000,
      unit: 'g',
      history: [
        { date: '2026-01-01', price: 10, size: 1000, unit: 'g' },
        { date: '2026-02-01', price: 10, size: 1000, unit: 'g' }
      ]
    }
  ];

  const res = M.marginWatch(s);
  assert.equal(res.ingredients.length, 0, 'T3: 0, 1 history, or unchanged price must be excluded');
}

// -----------------------------------------------------------------------------
// T4: History entries with different units (e.g. one in g, one in kg)
// -----------------------------------------------------------------------------
{
  const s = baseState();
  // Old purchase: $10 for 1 kg ($10/kg = $0.01/g).
  // Current purchase: $15 for 1000 g ($15/1000g = $0.015/g).
  // Current unit is 'g'.
  s.ingredients = [{
    id: 'butter',
    name: 'Butter',
    kind: 'ingredient',
    supplier: 'Dairy Co',
    price: 15,
    size: 1000,
    unit: 'g',
    updated: '2026-03-01',
    history: [
      { date: '2026-01-01', supplier: 'Dairy Co', price: 10, size: 1, unit: 'kg' },
      { date: '2026-03-01', supplier: 'Dairy Co', price: 15, size: 1000, unit: 'g' }
    ]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.ingredients.length, 1, 'T4: should normalize units');
  const item = res.ingredients[0];
  // Oldest in g basis: ($10 / 1 kg) * (1 kg / 1000 g) = 0.01 $/g.
  // Now: $15 / 1000 g = 0.015 $/g.
  // Rise: +50%, delta: +0.005 $/g.
  assert.ok(Math.abs(item.then - 0.01) < 1e-9, `T4: normalized then cost expected 0.01, got ${item.then}`);
  assert.ok(Math.abs(item.now - 0.015) < 1e-9, `T4: now cost expected 0.015, got ${item.now}`);
  assert.ok(Math.abs(item.deltaPercent - 50) < 1e-9, `T4: deltaPercent expected 50, got ${item.deltaPercent}`);
  assert.ok(Math.abs(item.deltaDollarsPerUnit - 0.005) < 1e-9, `T4: deltaDollars expected 0.005, got ${item.deltaDollarsPerUnit}`);
}

// -----------------------------------------------------------------------------
// T5: Recipe with costBaseline set
// -----------------------------------------------------------------------------
{
  const s = baseState();
  s.ingredients = [{
    id: 'ing1',
    name: 'Flour',
    kind: 'ingredient',
    price: 20,
    size: 1000,
    unit: 'g'
  }];
  // Recipe uses 100g per piece. Yield = 10. Labor = 0, other = 0.
  // Total ingredient per batch = 100g * 10 = 1000g -> $20 batch -> $2.00 / piece.
  // Retail price = $5.00.
  // Cost baseline was set to $1.50 (e.g. when flour was $15).
  s.recipes = [{
    id: 'rec1',
    name: 'Test Roll',
    yield: 10,
    unit: 'piece',
    laborHours: 0,
    otherCost: 0,
    retail: 5,
    costBaseline: 1.5,
    lines: [{
      id: 'l1',
      ingredientId: 'ing1',
      quantity: 100,
      unit: 'g',
      perPiece: true
    }]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.recipes.length, 1, 'T5: recipe with costBaseline should be included');
  const r = res.recipes[0];
  // Hand-calculated:
  // costNow = $2.00
  // costBaseline = $1.50
  // dollarsPerPiece = 2.00 - 1.50 = $0.50
  // marginBaseline = 100 * (5 - 1.5) / 5 = 70%
  // marginNow = 100 * (5 - 2.0) / 5 = 60%
  // marginDropPoints = 70 - 60 = 10 percentage points
  assert.ok(Math.abs(r.costNow - 2.0) < 1e-9, `T5: costNow expected 2.0, got ${r.costNow}`);
  assert.ok(Math.abs(r.dollarsPerPiece - 0.5) < 1e-9, `T5: dollarsPerPiece expected 0.5, got ${r.dollarsPerPiece}`);
  assert.ok(Math.abs(r.marginBaseline - 70) < 1e-9, `T5: marginBaseline expected 70, got ${r.marginBaseline}`);
  assert.ok(Math.abs(r.marginNow - 60) < 1e-9, `T5: marginNow expected 60, got ${r.marginNow}`);
  assert.ok(Math.abs(r.marginDropPoints - 10) < 1e-9, `T5: marginDropPoints expected 10, got ${r.marginDropPoints}`);
}

// -----------------------------------------------------------------------------
// T6: Recipe with no costBaseline -> Excluded
// -----------------------------------------------------------------------------
{
  const s = baseState();
  s.ingredients = [{ id: 'ing1', name: 'Flour', kind: 'ingredient', price: 20, size: 1000, unit: 'g' }];
  s.recipes = [{
    id: 'rec-no-base',
    name: 'No Baseline Recipe',
    yield: 10,
    unit: 'piece',
    laborHours: 0,
    otherCost: 0,
    retail: 5,
    costBaseline: null,
    lines: [{ id: 'l1', ingredientId: 'ing1', quantity: 100, unit: 'g', perPiece: true }]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.recipes.length, 0, 'T6: recipe with null costBaseline must be excluded');
}

// -----------------------------------------------------------------------------
// T7: Recipe with retail unset (null) -> Excluded
// -----------------------------------------------------------------------------
{
  const s = baseState();
  s.ingredients = [{ id: 'ing1', name: 'Flour', kind: 'ingredient', price: 20, size: 1000, unit: 'g' }];
  s.recipes = [{
    id: 'rec-no-retail',
    name: 'No Retail Recipe',
    yield: 10,
    unit: 'piece',
    laborHours: 0,
    otherCost: 0,
    retail: null,
    costBaseline: 1.5,
    lines: [{ id: 'l1', ingredientId: 'ing1', quantity: 100, unit: 'g', perPiece: true }]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.recipes.length, 0, 'T7: recipe with null retail must be excluded');
}

// -----------------------------------------------------------------------------
// T8: Full real seed data -> Runs cleanly without throwing
// -----------------------------------------------------------------------------
{
  const real = Object.assign(M.empty(), clone(seed));
  M.validate(real);
  const res = M.marginWatch(real);
  assert.ok(Array.isArray(res.ingredients), 'T8: res.ingredients is array');
  assert.ok(Array.isArray(res.recipes), 'T8: res.recipes is array');
  
  // Now add synthetic receipt approval to real state and confirm marginWatch reflects it
  const flour = real.ingredients.find(i => i.name === 'Bread Flour');
  if (flour) {
    const originalPrice = flour.price;
    const originalSize = flour.size;
    const testState = clone(real);
    const fl = testState.ingredients.find(i => i.name === 'Bread Flour');
    fl.history.push({
      date: '2024-01-01',
      supplier: 'Old Store',
      price: originalPrice * 0.5,
      size: originalSize,
      unit: fl.unit
    });
    fl.history.push({
      date: '2026-01-01',
      supplier: 'New Store',
      price: originalPrice,
      size: originalSize,
      unit: fl.unit
    });
    const spotCheck = M.marginWatch(testState);
    assert.ok(spotCheck.ingredients.some(x => x.ingredient.name === 'Bread Flour'));
    const flResult = spotCheck.ingredients.find(x => x.ingredient.name === 'Bread Flour');
    assert.ok(Math.abs(flResult.deltaPercent - 100) < 1e-9, 'T8: Spot check doubled flour price = +100%');
  }
}

// -----------------------------------------------------------------------------
// Edge case: Undated history entry coexisting with dated entry
// -----------------------------------------------------------------------------
{
  const s = baseState();
  s.ingredients = [{
    id: 'flour-undated',
    name: 'Flour With Legacy Record',
    price: 20,
    size: 1,
    unit: 'kg',
    history: [
      { date: '', price: 5, size: 1, unit: 'kg', note: 'Legacy unconfirmed row' },
      { date: '2024-01-01', price: 12, size: 1, unit: 'kg' },
      { date: '2026-01-01', price: 20, size: 1, unit: 'kg' }
    ]
  }];

  const res = M.marginWatch(s);
  assert.equal(res.ingredients.length, 1, 'Should include ingredient with dated baseline');
  const item = res.ingredients[0];
  assert.equal(item.then, 12, 'Baseline "then" must be the oldest dated entry (12), not the undated entry (5)');
  assert.equal(item.oldestDate, '2024-01-01', 'Oldest date must match the dated entry');
  assert.ok(Math.abs(item.deltaPercent - (100 * (20 / 12 - 1))) < 1e-9, 'Delta percent calculated against dated baseline');
}

console.log('All Margin Watch tests passed successfully!');
