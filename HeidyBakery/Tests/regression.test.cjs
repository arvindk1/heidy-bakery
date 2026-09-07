"use strict";

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../Resources/model.js');
const clone = x => JSON.parse(JSON.stringify(x));
const fixture = () => {
  const s = M.empty();
  s.imported = true;
  s.ingredients = [{
    id: 'flour',
    name: 'Flour',
    kind: 'ingredient',
    supplier: 'Shop',
    price: 10,
    size: 1000,
    unit: 'g',
    updated: '2026-01-01',
    history: []
  }];
  s.recipes = [{
    id: 'recipe',
    name: 'Bread',
    yield: 10,
    unit: 'piece',
    laborHours: 1,
    laborEffort: 'easy',
    otherCost: 0,
    retail: 8,
    bulk: 6,
    bulkMin: 5,
    bulkPackaging: null,
    bulkLaborHours: null,
    notes: '',
    category: '',
    lines: [{
      id: 'line',
      ingredientId: 'flour',
      quantity: 1000,
      unit: 'g',
      perPiece: false
    }]
  }];
  return s;
};
const receipt = (id = 'receipt', date = '2026-02-01') => ({
  id,
  file: id + '.png',
  originalName: id + '.png',
  text: 'FLOUR 12.00',
  importedAt: '2026-02-01T00:00:00Z',
  status: 'Needs review',
  supplier: 'Shop',
  date,
  lines: [{
    description: 'FLOUR',
    ingredientId: 'flour',
    price: 12,
    size: 1000,
    unit: 'g',
    excluded: false
  }]
});
function app(initial) {
  const elements = new Map(),
    messages = [];
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      hidden: true,
      textContent: '',
      innerHTML: '',
      open: false
    });
    return elements.get(key);
  };
  const context = vm.createContext({
    HeidyModel: M,
    console,
    structuredClone,
    FormData: class {},
    document: {
      querySelector: element,
      querySelectorAll: () => [],
      activeElement: null
    },
    setInterval: () => 1,
    clearInterval: () => {}
  });
  context.window = context;
  context.webkit = {
    messageHandlers: {
      native: {
        postMessage: m => messages.push(clone(m))
      }
    }
  };
  const source = fs.readFileSync(require.resolve('../Resources/app.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('// Start native application.')), context);
  context.initial = clone(initial);
  vm.runInContext('state=initial;lastSaved=JSON.parse(JSON.stringify(initial));render=()=>{};', context);
  return {
    context,
    messages,
    run: code => vm.runInContext(code, context),
    state: () => clone(context.HeidyApp.getState()),
    reply: (m, error = null) => context.nativeReply({
      id: m.id,
      result: true,
      error
    })
  };
}
const tables = s => Object.fromEntries(M.workbook(s).sheets.map(x => [x.name, clone(x.rows)]));
(async () => {
  assert.equal(M.validDate('2026-02-30'), false);
  assert.equal(M.validDate('2024-02-29'), true);
  assert.equal(M.ageInDays('2026-03-08', new Date(2026, 2, 9)), 1, 'calendar days survive spring DST');
  for (const change of [s => s.recipes[0].lines[0].perPiece = 'false', s => s.ingredients[0].updated = '2026-02-30', s => s.recipes[0].bulkMin = .5, s => s.receipts.push({
    id: 'bad'
  }), s => s.mappings.bad = {
    ingredientId: 'ghost',
    size: 1,
    unit: 'g'
  }]) {
    const s = fixture();
    change(s);
    assert.throws(() => M.validate(s));
  }
  const s = fixture(),
    badDate = receipt();
  badDate.date = '2026-02-30';
  assert.throws(() => M.approveReceipt(s, badDate), /date/);
  const archived = receipt();
  archived.status = 'Archived';
  assert.throws(() => M.approveReceipt(s, archived), /archived/);
  const badLast = receipt();
  badLast.lines.push({
    ...badLast.lines[0],
    ingredientId: 'ghost'
  });
  const before = clone(s);
  assert.throws(() => M.approveReceipt(s, badLast));
  assert.deepEqual(s, before, 'approval validates all lines before mutation');
  const current = receipt();
  s.receipts.push(current);
  M.approveReceipt(s, current, new Date('2026-03-01T12:00:00Z'));
  const a = app(s),
    book = tables(s);
  let imported = a.context.HeidyApp.importCandidate(book);
  assert.equal(imported.summary.ingredients, 0);
  assert.equal(imported.summary.recipes, 0);
  assert.equal(imported.candidate.ingredients[0].receiptId, 'receipt');
  book.Ingredients[1][4] = 15;
  imported = a.context.HeidyApp.importCandidate(book);
  assert.equal(imported.candidate.ingredients[0].receiptId, undefined, 'changed Excel master loses obsolete current receipt link');
  assert.equal(imported.candidate.ingredients[0].history.at(-1).receiptId, 'receipt', 'previous receipt remains in history');
  assert.equal(a.state().ingredients[0].price, 12, 'preview is nonmutating');
  const metadata = tables(s);
  metadata.Ingredients[1][1] = 'Renamed flour';
  assert.equal(a.context.HeidyApp.importCandidate(metadata).candidate.ingredients[0].receiptId, 'receipt');
  const free = tables(s);
  free.Ingredients[1][9] = 7;
  assert.throws(() => a.context.HeidyApp.importCandidate(free), /0 or 1/);
  const formula = tables(s);
  formula.Recipes[1][4] = {
    formula: '1+1'
  };
  assert.throws(() => a.context.HeidyApp.importCandidate(formula), /Input formulas/);
  const conversion = tables(s);
  conversion.Lines[1][6] = 1000;
  assert.throws(() => a.context.HeidyApp.importCandidate(conversion), /Conversion factor/);
  const hours = tables(s);
  hours.Recipes[1][4] = 2;
  assert.equal(a.context.HeidyApp.importCandidate(hours).candidate.recipes[0].laborEffort, 'Custom');
  const missingID = tables(s);
  missingID.Lines[1][2] = 'ghost';
  assert.throws(() => a.context.HeidyApp.importCandidate(missingID), /unknown ingredient/);
  const badReceipt = clone(s);
  badReceipt.ingredients[0].receiptId = 'missing';
  assert.throws(() => M.validate(badReceipt), /ingredient details/);
  // Force two saves to overlap. Native must receive them in order, with exact snapshots.
  const q = app(fixture());
  const first = q.run("state.recipes[0].retail=9;save('Saved',false)");
  const second = q.run("state.recipes[0].bulk=7;save('Saved',false)");
  await new Promise(setImmediate);
  assert.equal(q.messages.length, 1);
  assert.equal(q.messages[0].payload.recipes[0].bulk, 6);
  q.reply(q.messages[0]);
  await first;
  await new Promise(setImmediate);
  assert.equal(q.messages.length, 2);
  assert.equal(q.messages[1].payload.recipes[0].retail, 9);
  q.reply(q.messages[1]);
  await second;
  assert.equal(q.run('lastSaved.recipes[0].bulk'), 7);
  await q.run("save('Saved',false)");
  assert.equal(q.messages.length, 2, 'no-op saves avoid native undo');
  // Failed first write cancels dependent queued writes and restores last committed state.
  const f = app(fixture());
  const p1 = f.run("state.recipes[0].retail=99;save('Saved',false)").catch(e => e.message),
    p2 = f.run("state.recipes[0].bulk=88;save('Saved',false)").catch(e => e.message);
  await new Promise(setImmediate);
  f.reply(f.messages[0], 'Disk full');
  await Promise.all([p1, p2]);
  assert.equal(f.messages.length, 1);
  assert.equal(f.state().recipes[0].retail, 8);
  assert.equal(f.state().recipes[0].bulk, 6);
  const fresh = app(M.empty());
  fresh.run('lastSaved=null;state.imported=true');
  const initialSave = fresh.run("save('Saved',false)").catch(e => e.message);
  await new Promise(setImmediate);
  fresh.reply(fresh.messages[0], 'Disk full');
  await initialSave;
  assert.equal(fresh.state().imported, false, 'failed first save returns to welcome');
  // Empty and duplicate automatic checks do not create a save or toast.
  const auto = app(s);
  const scan = auto.run("importReceipts('scanInbox',true)");
  await new Promise(setImmediate);
  auto.context.nativeReply({
    id: auto.messages[0].id,
    result: {
      records: [],
      errors: [],
      duplicates: 1,
      pending: 0
    }
  });
  await scan;
  assert.equal(auto.messages.length, 1);
  console.log('Regression checks passed: malformed data, dates/DST, atomic approvals, import provenance and units, exact save snapshots, write-failure rollback, and unchanged folder checks.');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
