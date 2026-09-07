'use strict';

const M = HeidyModel,
  $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)],
  esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]),
  money = v => v == null ? '—' : '$' + Number(v).toFixed(2),
  pct = v => v == null ? '—' : Number(v).toFixed(1) + '%',
  today = () => M.localDate(),
  num = v => v === '' || v == null ? null : Number(v),
  clone = s => JSON.parse(JSON.stringify(s));
let state = M.empty(),
  seed = null,
  currentTab = 'prices',
  selectedRecipe = null,
  selectedReceipt = null,
  inbox = '',
  lastSaved = null,
  search = '',
  pending = {},
  messageId = 0;
window.nativeReply = message => {
  const p = pending[message.id];
  if (!p) return;
  delete pending[message.id];
  if (message.error) p.reject(Error(message.error));else p.resolve(message.result);
};
function native(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++messageId);
    pending[id] = {
      resolve,
      reject
    };
    if (!window.webkit?.messageHandlers?.native) {
      delete pending[id];
      reject(Error('Open this app using Heidy Bakery.app.'));
      return;
    }
    window.webkit.messageHandlers.native.postMessage({
      id,
      action,
      payload
    });
  });
}
function notice(message, error = false) {
  $('#notice').hidden = false;
  $('#notice').innerHTML = `<span class="${error ? 'bad' : ''}">${esc(message)}</span><button id="dismiss-notice" aria-label="Dismiss">×</button>`;
  $('#dismiss-notice').onclick = () => $('#notice').hidden = true;
}
async function busy(label, fn) {
  uiBusy++;
  const b = document.createElement('div');
  b.id = 'busy';
  b.setAttribute('role', 'status');
  b.textContent = label;
  document.body.appendChild(b);
  try {
    return await fn();
  } catch (e) {
    notice(e.message, true);
    return null;
  } finally {
    uiBusy--;
    b.remove();
  }
}
let saveTail = Promise.resolve(),
  queuedState = null,
  saveGeneration = 0,
  saveCount = 0,
  saveVersion = 0;
let uiBusy = 0,
  receiptImportRunning = false,
  inboxTimer = null,
  lastInboxError = '',
  dataEpoch = 0;
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function save(message = 'Saved', rerender = true) {
  const previous = queuedState || lastSaved || M.empty();
  let snapshot;
  try {
    M.validate(state);
    for (const r of state.recipes) {
      const old = previous.recipes.find(x => x.id === r.id);
      if (old) {
        const before = M.calculate(previous, old).unit,
          next = M.calculate(state, r).unit;
        if (before !== null && next !== null && before > 0 && next > before) r.costBaseline = r.costBaseline ?? before;
      }
    }
    snapshot = clone(state);
  } catch (e) {
    state = clone(previous);
    render();
    notice('Could not save: ' + e.message, true);
    throw e;
  }
  const generation = saveGeneration,
    version = ++saveVersion;
  queuedState = snapshot;
  saveCount++;
  $('#save-status').textContent = 'Saving…';
  const job = saveTail.then(async () => {
    if (generation !== saveGeneration) throw Error('An earlier save failed. Please enter this change again.');
    try {
      if (!same(snapshot, lastSaved)) await native('save', snapshot);
      // This is the exact snapshot acknowledged by the native store.
      lastSaved = clone(snapshot);
      if (message !== 'Saved') notice(message);
      if (rerender && version === saveVersion) render();
      return true;
    } catch (e) {
      saveGeneration++;
      state = clone(lastSaved || M.empty());
      queuedState = null;
      render();
      notice('Could not save: ' + e.message, true);
      throw e;
    }
  });
  saveTail = job.catch(() => {});
  try {
    return await job;
  } finally {
    saveCount--;
    if (!saveCount) {
      queuedState = null;
      $('#save-status').textContent = generation === saveGeneration ? 'Saved on this Mac' : 'Not saved — change rolled back';
    }
  }
}
function openReceiptRecord(id) {
  if (!state.receipts.some(r => r.id === id)) {
    notice('That receipt is not present in these records.', true);
    return;
  }
  selectedReceipt = id;
  tab('receipts');
}
function tab(name) {
  currentTab = name;
  search = '';
  render();
}
$$('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
function render() {
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
  if (!state.imported && state.recipes.length === 0 && currentTab === 'prices') {
    welcome();
    return;
  }
  ({
    prices: pricePage,
    recipes: recipePage,
    ingredients: ingredientPage,
    receipts: receiptPage,
    settings: settingsPage
  })[currentTab]();
}
const action = (id, fn) => {
  const b = $(id);
  if (b) b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      notice(e.message, true);
    } finally {
      b.disabled = false;
    }
  };
};
function modal(title, body, onSave, label = 'Save') {
  const d = $('#dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = body;
  $('#dialog-error').textContent = '';
  $('#dialog-submit').textContent = label;
  $('#dialog-submit').disabled = false;
  $('#dialog-form').onsubmit = async e => {
    e.preventDefault();
    $('#dialog-submit').disabled = true;
    $('#dialog-cancel').disabled = $('#dialog-close').disabled = true;
    try {
      await onSave(new FormData(e.target));
      d.close();
    } catch (e) {
      $('#dialog-error').textContent = e.message;
    } finally {
      $('#dialog-submit').disabled = false;
      $('#dialog-cancel').disabled = $('#dialog-close').disabled = false;
    }
  };
  $('#dialog-close').onclick = $('#dialog-cancel').onclick = () => d.close();
  d.oncancel = e => {
    if ($('#dialog-submit').disabled) e.preventDefault();
  };
  d.showModal();
}
function field(label, name, value = '', type = 'text', extra = '') {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function selectField(label, name, options, value) {
  return `<label>${label}<select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function ingredientOptions(kind = null, selected = '') {
  return '<option value="">Choose an item</option>' + state.ingredients.filter(i => !kind || i.kind === kind).sort((a, b) => a.name.localeCompare(b.name)).map(i => `<option value="${esc(i.id)}" ${i.id === selected ? 'selected' : ''}>${esc(i.name)} · ${esc(i.unit || 'unit missing')}</option>`).join('');
}
function welcome() {
  $('#main').innerHTML = `<div class="onboarding"><h1>Welcome to your bakery</h1><p class="sub">Start with the two spreadsheets you provided, or create your own recipe library.</p><div class="pane"><h3>Ready to import</h3><div class="line"><span>Recipes, including the separate WS sheets</span><strong>${seed.recipes.length}</strong></div><div class="line"><span>Ingredients and packaging records</span><strong>${seed.ingredients.length}</strong></div><details open><summary>Import checks</summary><ul class="help-list">${seed.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details><p>These are working copies. Your original Excel files will not change.</p><div class="actions"><button id="import-seed" class="primary">Import reviewed spreadsheet data</button><button id="start-empty">Start with an empty bakery</button></div></div></div>`;
  action('#import-seed', async () => {
    Object.assign(state, clone(seed), {
      imported: true
    });
    delete state.notes;
    await save('Imported recipes and master records. Choose markup percentages in Settings.');
  });
  action('#start-empty', async () => {
    state.imported = true;
    await save();
  });
}
function needsReview(r, c) {
  const rise = r.costBaseline && c.unit !== null ? 100 * (c.unit / r.costBaseline - 1) : 0;
  return c.errors.length > 0 || c.bulkErrors.length > 0 || c.warnings.length > 0 || rise > 0 && rise >= state.settings.alertPercent;
}
function reviewCell(r, c) {
  const rise = r.costBaseline && c.unit !== null ? 100 * (c.unit / r.costBaseline - 1) : 0;
  if (c.errors.length) return '<span class="bad" title="One or more recipe costs are incomplete. Open the recipe to fix them.">Missing costs</span>';
  if (c.bulkErrors.length) return '<span class="bad">Missing bulk costs</span>';
  if (rise > 0 && rise >= state.settings.alertPercent) return `<span class="bad" title="The recipe cost increased by ${rise.toFixed(1)}% since it was last reviewed.">Cost up ${rise.toFixed(1)}%</span>`;
  if (c.warningDetails.length) {
    const w = c.warningDetails.find(x => x.item === 'Salt') || c.warningDetails[0];
    return `<button class="link" data-review-item="${esc(w.ingredientId)}" title="${esc(w.message)}">${esc(w.short)}</button>`;
  }
  return '<span title="Recipe costs and purchase prices are ready.">Ready</span>';
}
function pricePage() {
  $('#main').innerHTML = `<div class="toolbar"><div><h1>Price list</h1><p class="sub">Your selling prices stay unchanged when costs change.</p></div><div class="actions"><button id="excel-prices">Export Excel</button><button id="new-recipe" class="primary">New recipe</button></div></div>${state.settings.retailMarkup == null || state.settings.bulkMarkup == null ? '<div class="note">Choose your retail and bulk markup percentages in Settings to see suggested prices. You can enter your selling prices now. <button id="go-markup">Open Settings</button></div>' : ''}<div class="filters"><label class="wide">Find a recipe<input id="price-search" placeholder="Recipe name or category"></label><label>Show<select id="price-filter"><option value="all">All recipes</option><option value="review">Needs review</option><option value="missing">Missing selling prices</option></select></label></div><div id="price-table" class="scroll"></div>`;
  action('#new-recipe', () => editRecipe());
  action('#excel-prices', () => exportExcel());
  action('#go-markup', () => tab('settings'));
  $('#price-search').oninput = $('#price-filter').onchange = priceRows;
  priceRows();
}
function priceRows() {
  const term = $('#price-search').value.toLowerCase(),
    filter = $('#price-filter').value;
  const rs = state.recipes.filter(r => (r.name + ' ' + r.category).toLowerCase().includes(term)).filter(r => filter === 'all' || filter === 'missing' && (r.retail == null || r.bulk == null) || filter === 'review' && needsReview(r, M.calculate(state, r)));
  $('#price-table').innerHTML = rs.length ? `<table><thead><tr><th>Recipe / unit</th><th>Batch yield</th><th class="num">Cost / piece</th><th class="num">Retail suggested</th><th>Your retail</th><th class="num">Retail margin</th><th class="num">Bulk suggested</th><th>Your bulk</th><th class="num">Bulk margin</th><th>Review</th></tr></thead><tbody>${rs.map(r => {
    const c = M.calculate(state, r);
    return `<tr><td class="recipe-name"><button class="link" data-open-recipe="${esc(r.id)}">${esc(r.name)}</button><div class="small">Per ${esc(r.unit)}${r.bulkMin ? ' · bulk min ' + r.bulkMin : ''}</div></td><td>${r.yield}</td><td class="num">${money(c.unit)}</td><td class="num">${money(c.retailSuggested)}</td><td><input class="price" aria-label="${esc(r.name)} retail price" data-price-id="${esc(r.id)}" data-price-kind="retail" type="number" min="0" step=".01" value="${r.retail ?? ''}"></td><td class="num ${M.margin(c.unit, r.retail) < 0 ? 'bad' : ''}">${pct(M.margin(c.unit, r.retail))}</td><td class="num">${money(c.bulkSuggested)}</td><td><input class="price" aria-label="${esc(r.name)} bulk price" data-price-id="${esc(r.id)}" data-price-kind="bulk" type="number" min="0" step=".01" value="${r.bulk ?? ''}"></td><td class="num ${M.margin(c.bulkUnit, r.bulk) < 0 ? 'bad' : ''}">${pct(M.margin(c.bulkUnit, r.bulk))}</td><td>${reviewCell(r, c)}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty">No matching recipes. Create a recipe to begin.</div>';
  $$('[data-open-recipe]').forEach(b => b.onclick = () => {
    selectedRecipe = b.dataset.openRecipe;
    tab('recipes');
  });
  $$('[data-review-item]').forEach(b => b.onclick = () => editIngredient(state.ingredients.find(i => i.id === b.dataset.reviewItem)));
  $$('[data-price-id]').forEach(i => i.onchange = async () => {
    if (!i.reportValidity()) return;
    const r = state.recipes.find(r => r.id === i.dataset.priceId);
    r[i.dataset.priceKind] = num(i.value);
    try {
      await save('Saved', false);
      if (currentTab === 'prices' && i.isConnected) {
        const c = M.calculate(state, r),
          value = M.margin(i.dataset.priceKind === 'retail' ? c.unit : c.bulkUnit, r[i.dataset.priceKind]),
          cell = i.closest('tr').cells[i.dataset.priceKind === 'retail' ? 5 : 8];
        cell.textContent = pct(value);
        cell.classList.toggle('bad', value < 0);
      }
    } catch {}
  });
}
function recipePage() {
  if (!selectedRecipe || !state.recipes.some(r => r.id === selectedRecipe)) selectedRecipe = state.recipes[0]?.id;
  $('#main').innerHTML = `<div class="toolbar"><h1>Recipes</h1><div class="actions"><button id="new-recipe" class="primary">New recipe</button><button id="export-recipe">Export this recipe</button></div></div><div class="filters"><label class="wide">Find a recipe<input id="recipe-search" placeholder="Search recipes"></label><label class="wide">Select recipe<select id="recipe-select"></select></label></div><div id="recipe-detail"></div>`;
  action('#new-recipe', () => editRecipe());
  action('#export-recipe', () => {
    const r = state.recipes.find(r => r.id === selectedRecipe);
    if (r) exportExcel(r);
  });
  function opts() {
    const term = $('#recipe-search').value.toLowerCase(),
      rs = state.recipes.filter(r => r.name.toLowerCase().includes(term));
    $('#recipe-select').innerHTML = rs.map(r => `<option value="${esc(r.id)}" ${r.id === selectedRecipe ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
    selectedRecipe = $('#recipe-select').value;
    recipeDetail();
  }
  $('#recipe-search').oninput = opts;
  $('#recipe-select').onchange = e => {
    selectedRecipe = e.target.value;
    recipeDetail();
  };
  opts();
}
function lineRow(d, r) {
  return `<tr><td><button class="link" data-edit-item="${esc(d.item?.id || '')}">${esc(d.item?.name || 'Missing item')}</button>${d.issue ? `<div class="bad small">${esc(d.issue)}</div>` : ''}</td><td>${d.line.quantity}</td><td>${esc(d.line.unit)}</td><td>${d.line.perPiece ? 'Per piece × ' + r.yield : 'Per batch'}</td><td class="num">${d.unitCost == null ? '—' : '$' + d.unitCost.toFixed(5)} / ${esc(d.item?.unit)}</td><td class="num">${money(d.cost)}</td><td><button data-edit-line="${esc(d.line.id)}">Edit</button></td></tr>`;
}
function lineSection(label, items, subtotal, r) {
  return items.length ? `<tr class="item-section"><th colspan="5">${esc(label)}</th><th class="num">${money(subtotal)}</th><th></th></tr>${items.map(d => lineRow(d, r)).join('')}` : '';
}
function recipeDetail() {
  const r = state.recipes.find(r => r.id === selectedRecipe);
  if (!r) {
    $('#recipe-detail').innerHTML = '<div class="empty">No matching recipes.</div>';
    return;
  }
  const c = M.calculate(state, r),
    ingredients = c.details.filter(d => d.item?.kind !== 'packaging'),
    packaging = c.details.filter(d => d.item?.kind === 'packaging'),
    n = c.warnings.length,
    share = v => c.total ? pct(100 * v / c.total) : '—';
  $('#recipe-detail').innerHTML = `<div class="toolbar"><h2>${esc(r.name)}</h2><div class="actions"><button id="edit-recipe">Edit recipe details</button><button id="copy-recipe">Make a copy</button><button id="delete-recipe" class="danger">Delete</button></div></div>
 <div class="fields"><div class="pane"><span>Batch yield</span><h3>${r.yield} ${esc(r.unit)}${r.yield === 1 ? '' : 's'}</h3></div><div class="pane"><span>Labour</span><h3>${r.laborHours} ${r.laborHours === 1 ? 'hour' : 'hours'} × ${money(state.settings.laborRate)}</h3><small>${esc(r.laborEffort || 'Custom')} effort</small></div><div class="pane"><span>Other batch costs</span><h3>${money(r.otherCost)}</h3></div><div class="pane"><span>Cost per ${esc(r.unit)}</span><h3>${money(c.unit)}</h3></div></div>
 ${c.errors.length || c.bulkErrors.length ? `<div class="note"><strong>Complete these costs before using suggested prices:</strong><ul>${[...c.errors, ...c.bulkErrors].map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
 <div class="toolbar"><h3>Recipe items per batch</h3><button id="add-line">Add ingredient or packaging</button></div><div class="scroll"><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th><th>Basis</th><th class="num">Cost / source unit</th><th class="num">Batch cost</th><th></th></tr></thead><tbody>${lineSection('Ingredients', ingredients, c.ing, r)}${lineSection('Packaging', packaging, c.pack, r)}</tbody></table></div>
 <div class="two spacer"><div class="pane"><h3>Batch calculation</h3>${[['Ingredients', c.ing], ['Packaging', c.pack], ['Labour', c.labor], ['Other batch costs', r.otherCost]].map(([l, v]) => `<div class="line"><span>${esc(l)} <small>· ${share(v)}</small></span><strong>${money(v)}</strong></div>`).join('')}<div class="line"><span>Total batch cost</span><strong>${money(c.total)}</strong></div><div class="line"><span>Cost per ${esc(r.unit)} · ÷ ${r.yield}</span><strong>${money(c.unit)}</strong></div>${c.errors.length ? '<small>Ingredient and packaging subtotals include known costs only.</small>' : ''}</div>
 <div class="pane"><h3>Retail and bulk pricing</h3><div class="line"><span>Retail suggested · ${state.settings.retailMarkup == null ? 'markup not set' : state.settings.retailMarkup + '% markup'}</span><strong>${money(c.retailSuggested)}</strong></div><div class="line"><span>Your retail / ${esc(r.unit)}</span><strong>${money(r.retail)}</strong></div><div class="line"><span>Retail margin at your price</span><strong>${pct(M.margin(c.unit, r.retail))}</strong></div><div class="line"><span>Bulk cost / ${esc(r.unit)}</span><strong>${money(c.bulkUnit)}</strong></div><div class="line"><span>Bulk suggested · ${state.settings.bulkMarkup == null ? 'markup not set' : state.settings.bulkMarkup + '% markup'}</span><strong>${money(c.bulkSuggested)}</strong></div><div class="line"><span>Your bulk / ${esc(r.unit)}</span><strong>${money(r.bulk)}</strong></div><div class="line"><span>Bulk margin at your price</span><strong>${pct(M.margin(c.bulkUnit, r.bulk))}</strong></div><div class="line"><span>Bulk minimum</span><strong>${r.bulkMin ?? 'Not set'}</strong></div></div></div>
 ${r.notes ? `<div class="pane"><h3>Instructions and notes</h3><p class="ocr">${esc(r.notes)}</p></div>` : ''}<details><summary>Purchase price checks and source details (${n} ${n === 1 ? 'notice' : 'notices'})</summary><div class="scroll"><table class="checks"><thead><tr><th>Item</th><th>Price available</th><th>Units match</th><th>Last update</th><th>Source</th></tr></thead><tbody>${c.details.map(d => `<tr><td>${esc(d.item?.name)}</td><td>${d.unitCost === null ? 'No' : 'Yes'}</td><td>${d.factor === null ? 'No' : 'Yes'}</td><td>${esc(d.item?.updated || 'Not set')}</td><td>${esc(d.item?.supplier)}</td></tr>`).join('')}</tbody></table></div>${c.warningDetails.map(w => `<p class="small"><button class="link" data-review-item="${esc(w.ingredientId)}">${esc(w.message)}</button></p>`).join('')}<p class="small">${esc(r.source || 'Created in Heidy Bakery')}</p></details>${r.costBaseline && c.unit !== null ? '<button id="review-cost">Mark cost change as reviewed</button>' : ''}`;
  action('#review-cost', async () => {
    r.costBaseline = c.unit;
    await save('Cost change reviewed. Your selling prices have not changed.');
  });
  action('#edit-recipe', () => editRecipe(r));
  action('#copy-recipe', () => editRecipe(r, true));
  action('#delete-recipe', () => modal('Delete recipe?', `<p>Delete ${esc(r.name)}? You can undo this from Settings.</p>`, async () => {
    state.recipes = state.recipes.filter(x => x.id !== r.id);
    await save('Recipe deleted.');
  }, 'Delete recipe'));
  action('#add-line', () => editLine(r));
  $$('[data-edit-line]').forEach(b => b.onclick = () => editLine(r, r.lines.find(l => l.id === b.dataset.editLine)));
  $$('[data-edit-item],[data-review-item]').forEach(b => b.onclick = () => editIngredient(state.ingredients.find(i => i.id === (b.dataset.editItem || b.dataset.reviewItem))));
}
function editRecipe(original = null, copy = false) {
  const r = original ? clone(original) : {
    id: M.uuid(),
    name: '',
    yield: 1,
    unit: 'piece',
    laborHours: 1,
    laborEffort: 'easy',
    otherCost: 0,
    retail: null,
    bulk: null,
    bulkMin: null,
    bulkPackaging: null,
    bulkLaborHours: null,
    notes: '',
    category: '',
    lines: []
  };
  if (copy) {
    r.id = M.uuid();
    r.name += ' — copy';
    r.lines.forEach(l => l.id = M.uuid());
    r.retail = null;
    r.bulk = null;
    delete r.costBaseline;
  }
  const effort = M.laborEfforts[r.laborEffort] === r.laborHours ? r.laborEffort : 'Custom';
  modal(copy ? 'Copy recipe' : original ? 'Edit recipe' : 'New recipe', `<div class="fields two">${field('Recipe name', 'name', r.name, 'text', 'required')}${field('Category', 'category', r.category)}${field('Pieces per batch', 'yield', r.yield, 'number', 'min="0.001" step="any" required')}${field('Selling unit', 'unit', r.unit, 'text', 'required')}${selectField('Labour effort', 'laborEffort', [...Object.keys(M.laborEfforts).map(x => [x, x + ' · ' + M.laborEfforts[x] + ' h']), ['Custom', 'Custom hours']], effort)}${field('Labour hours per batch', 'laborHours', r.laborHours, 'number', 'min="0" step="any" required')}${field('Other cost per batch ($)', 'otherCost', r.otherCost, 'number', 'min="0" step=".01" required')}${field('Your retail price per unit ($)', 'retail', r.retail ?? '', 'number', 'min="0" step=".01"')}${field('Your bulk price per unit ($)', 'bulk', r.bulk ?? '', 'number', 'min="0" step=".01"')}${field('Bulk minimum pieces', 'bulkMin', r.bulkMin ?? '', 'number', 'min="1" step="1"')}</div><details><summary>Different bulk costs (optional)</summary><p class="small">Leave blank to use the recipe’s standard packaging and labour. Entering a value replaces that part of the bulk cost.</p><div class="fields two">${field('Bulk packaging cost per piece ($)', 'bulkPackaging', r.bulkPackaging ?? '', 'number', 'min="0" step=".01"')}${field('Bulk labour hours per batch', 'bulkLaborHours', r.bulkLaborHours ?? '', 'number', 'min="0" step="any"')}</div></details><p class="small">Effort matches the spreadsheet: easy 1 h, Low 2 h, Medium 3 h, High 4 h, Extreme 5 h. Choose Custom to type hours. Changing yield divides the existing batch cost across a different number of pieces; ingredient quantities stay unchanged.</p><label>Instructions and notes<textarea name="notes">${esc(r.notes)}</textarea></label>`, async fd => {
    for (const k of ['name', 'category', 'unit', 'notes']) r[k] = String(fd.get(k)).trim();
    r.laborEffort = String(fd.get('laborEffort'));
    for (const k of ['yield', 'laborHours', 'otherCost', 'retail', 'bulk', 'bulkMin', 'bulkPackaging', 'bulkLaborHours']) r[k] = num(fd.get(k));
    if (!r.name || !r.unit) throw Error('Enter a name and selling unit.');
    const at = state.recipes.findIndex(x => x.id === r.id);
    if (at < 0) state.recipes.push(r);else state.recipes[at] = r;
    selectedRecipe = r.id;
    currentTab = 'recipes';
    await save(copy ? 'Recipe copied. Enter its selling prices.' : 'Recipe saved.');
  });
  const e = $('#dialog [name=laborEffort]'),
    h = $('#dialog [name=laborHours]'),
    sync = () => {
      const v = M.laborEfforts[e.value];
      h.readOnly = v != null;
      if (v != null) h.value = v;
    };
  e.onchange = sync;
  sync();
}
function editLine(recipe, original = null) {
  const l = original ? clone(original) : {
    id: M.uuid(),
    ingredientId: '',
    quantity: 1,
    unit: 'g',
    perPiece: false
  };
  modal(original ? 'Edit recipe item' : 'Add recipe item', `<label>Ingredient or packaging<select name="ingredientId" required>${ingredientOptions(null, l.ingredientId)}</select></label><div class="fields three">${field('Quantity', 'quantity', l.quantity, 'number', 'min="0" step="any" required')}${field('Unit (g, ml, each…)', 'unit', l.unit, 'text', 'required')}${selectField('Quantity applies', 'basis', [['batch', 'Per batch'], ['piece', 'Per piece']], l.perPiece ? 'piece' : 'batch')}</div>${original ? '<label class="inline"><input type="checkbox" name="remove">Remove this line from the recipe</label>' : ''}<p class="small">Mass and volume cannot be interchanged automatically. Use the ingredient’s unit, or a compatible unit such as kg to g.</p>`, async fd => {
    recipe = state.recipes.find(x => x.id === recipe.id);
    if (!recipe) throw Error('This recipe no longer exists.');
    if (fd.get('remove')) recipe.lines = recipe.lines.filter(x => x.id !== l.id);else {
      l.ingredientId = String(fd.get('ingredientId'));
      l.quantity = num(fd.get('quantity'));
      l.unit = String(fd.get('unit')).trim();
      l.perPiece = fd.get('basis') === 'piece';
      if (!l.ingredientId) throw Error('Select an item.');
      const index = recipe.lines.findIndex(x => x.id === l.id);
      if (index < 0) recipe.lines.push(l);else recipe.lines[index] = l;
    }
    await save('Recipe item saved.');
  });
  $('#dialog [name=ingredientId]').onchange = e => {
    const i = state.ingredients.find(i => i.id === e.target.value);
    if (i) $('#dialog [name=unit]').value = i.unit;
  };
}
function ingredientPage() {
  $('#main').innerHTML = `<div class="toolbar"><div><h1>Ingredients</h1><p class="sub">Purchase prices, package sizes and history shared by your recipes.</p></div><button id="new-ingredient" class="primary">New ingredient / packaging</button></div><div class="filters"><label class="wide">Search<input id="ingredient-search" placeholder="Ingredient or supplier"></label><label>Show<select id="ingredient-filter"><option value="all">All items</option><option value="ingredient">Ingredients</option><option value="packaging">Packaging</option><option value="missing">Missing costs</option></select></label></div><div id="ingredient-table" class="scroll"></div>`;
  action('#new-ingredient', () => editIngredient());
  $('#ingredient-search').oninput = $('#ingredient-filter').onchange = ingredientRows;
  ingredientRows();
}
function ingredientRows() {
  const term = $('#ingredient-search').value.toLowerCase(),
    filter = $('#ingredient-filter').value,
    list = state.ingredients.filter(i => (i.name + ' ' + i.supplier).toLowerCase().includes(term) && (filter === 'all' || i.kind === filter || filter === 'missing' && M.unitCost(i) === null));
  $('#ingredient-table').innerHTML = `<p class="small">${list.length} items</p><table><thead><tr><th>Item</th><th>Supplier</th><th class="num">Package price</th><th>Package size</th><th class="num">Cost / unit</th><th>Updated</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td>${esc(i.name)}<div class="small">${esc(i.kind)}</div></td><td>${esc(i.supplier)}</td><td class="num">${money(i.price)}</td><td>${i.size ?? '—'} ${esc(i.unit)}</td><td class="num">${M.unitCost(i) === null ? '<span class="bad">Missing cost</span>' : '$' + M.unitCost(i).toFixed(5)}</td><td>${esc(i.updated || 'Not set')}${i.updated > today() ? '<div class="bad small">Future date</div>' : ''}</td><td><button data-ingredient="${esc(i.id)}">Edit / history</button></td></tr>`).join('')}</tbody></table>`;
  $$('[data-ingredient]').forEach(b => b.onclick = () => editIngredient(state.ingredients.find(i => i.id === b.dataset.ingredient)));
}
function editIngredient(original = null) {
  const i = original ? clone(original) : {
    id: M.uuid(),
    name: '',
    kind: 'ingredient',
    supplier: '',
    price: null,
    size: null,
    unit: 'g',
    updated: '',
    history: [],
    notes: '',
    freeConfirmed: false
  };
  modal(original ? 'Ingredient details' : 'New ingredient', `<div class="fields two">${field('Item name', 'name', i.name, 'text', 'required')}${selectField('Type', 'kind', [['ingredient', 'Ingredient'], ['packaging', 'Packaging']], i.kind)}${field('Supplier', 'supplier', i.supplier)}${field('Purchase date', 'updated', i.updated, 'date', `max="${today()}"`)}${field('Package price ($)', 'price', i.price ?? '', 'number', 'min="0" step=".01"')}${field('Total quantity in package', 'size', i.size ?? '', 'number', 'min="0.000001" step="any"')}${field('Quantity unit (g, ml, each…)', 'unit', i.unit)}</div><label class="inline"><input name="freeConfirmed" type="checkbox" ${i.freeConfirmed ? 'checked' : ''}>I confirm this item was free (only for a $0 price)</label><label>Notes<textarea name="notes">${esc(i.notes)}</textarea></label><p class="small">A blank price is flagged; a $0 price remains visible for review until you confirm it was free.</p>${i.receiptId ? `<p><button type="button" data-history-receipt="${esc(i.receiptId)}">Current purchase receipt</button></p>` : ''}${original ? `<details><summary>Purchase history (${i.history.length})</summary>${i.history.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Supplier</th><th>Price</th><th>Size</th><th>Record</th></tr></thead><tbody>${[...i.history].reverse().map(h => `<tr><td>${esc(h.date)}</td><td>${esc(h.supplier)}</td><td>${money(h.price)}</td><td>${h.size ?? '—'} ${esc(h.unit)}</td><td>${esc(h.note || '')}${h.receiptId && state.receipts.some(r => r.id === h.receiptId) ? `<button type="button" data-history-receipt="${esc(h.receiptId)}">Receipt</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p>No additional history yet.</p>'}<p class="small">${esc(i.source || 'Created in app')}</p></details>` : ''}`, async fd => {
    for (const k of ['name', 'kind', 'supplier', 'unit', 'updated', 'notes']) i[k] = String(fd.get(k)).trim();
    i.price = num(fd.get('price'));
    i.size = num(fd.get('size'));
    i.freeConfirmed = i.price === 0 && !!fd.get('freeConfirmed');
    if (!i.name) throw Error('Enter a name.');
    i.history = clone(state.ingredients.find(x => x.id === i.id)?.history || []);
    if (original && ['price', 'size', 'unit', 'supplier', 'updated'].some(k => i[k] !== original[k])) {
      i.history.push({
        date: original.updated,
        supplier: original.supplier,
        price: original.price,
        size: original.size,
        unit: original.unit,
        receiptId: original.receiptId ?? null,
        note: 'Previous purchase before manual edit'
      });
      delete i.receiptId;
    }
    const at = state.ingredients.findIndex(x => x.id === i.id);
    if (at < 0) state.ingredients.push(i);else state.ingredients[at] = i;
    await save('Ingredient saved. Recipe costs recalculated.');
  });
  $$('[data-history-receipt]').forEach(b => b.onclick = () => {
    $('#dialog').close();
    openReceiptRecord(b.dataset.historyReceipt);
  });
}
function receiptPage() {
  $('#main').innerHTML = `<div class="toolbar"><div><h1>Receipts</h1><p class="sub">Original receipts stay saved. Purchase prices change only after review.</p></div><div class="actions"><button id="scan-inbox">Check receipt folder</button><button id="add-receipts" class="primary">Add photos / PDFs</button></div></div><div class="filters"><label class="wide">Search<input id="receipt-search" placeholder="Retailer, receipt text or item"></label><label>From<input id="receipt-from" type="date"></label><label>To<input id="receipt-to" type="date"></label><label>Retailer<select id="receipt-store"><option value="">All retailers</option>${[...new Set(state.receipts.map(r => r.supplier).filter(Boolean))].sort().map(s => `<option>${esc(s)}</option>`).join('')}</select></label><label>Status<select id="receipt-status"><option value="">All receipts</option><option>Needs review</option><option>Reviewed</option><option>Archived</option></select></label></div><div class="split"><aside><h3 id="receipt-count"></h3><div id="receipt-list"></div><div class="actions"><button id="prev-receipts">Previous</button><button id="next-receipts">Next</button></div></aside><div id="receipt-detail"></div></div>`;
  let page = 0;
  window.receiptPaging = {
    get: () => page,
    set: v => page = v
  };
  for (const id of ['receipt-search', 'receipt-from', 'receipt-to', 'receipt-store', 'receipt-status']) $('#' + id).oninput = () => {
    page = 0;
    receiptRows();
  };
  action('#prev-receipts', () => {
    page = Math.max(0, page - 1);
    receiptRows();
  });
  action('#next-receipts', () => {
    page++;
    receiptRows();
  });
  action('#add-receipts', () => importReceipts('importReceipts'));
  action('#scan-inbox', () => importReceipts('scanInbox'));
  receiptRows(true);
}
function receiptRows(reveal = false) {
  const term = $('#receipt-search').value.toLowerCase(),
    from = $('#receipt-from').value,
    to = $('#receipt-to').value,
    store = $('#receipt-store').value,
    status = $('#receipt-status').value;
  const all = state.receipts.filter(r => (r.supplier + ' ' + r.originalName + ' ' + r.text + ' ' + r.lines.map(l => l.description + ' ' + (state.ingredients.find(i => i.id === l.ingredientId)?.name || '')).join(' ')).toLowerCase().includes(term) && (!from || r.date >= from) && (!to || !!r.date && r.date <= to) && (!store || r.supplier === store) && (!status || r.status === status)).sort((a, b) => (b.date || b.importedAt).localeCompare(a.date || a.importedAt));
  const selectedIndex = reveal ? all.findIndex(r => r.id === selectedReceipt) : -1;
  let page = Math.min(selectedIndex >= 0 ? Math.floor(selectedIndex / 12) : receiptPaging.get(), Math.max(0, Math.ceil(all.length / 12) - 1));
  receiptPaging.set(page);
  const list = all.slice(page * 12, page * 12 + 12);
  if (!list.some(r => r.id === selectedReceipt)) selectedReceipt = list[0]?.id;
  $('#receipt-count').textContent = all.length + ' receipts';
  $('#prev-receipts').disabled = page === 0;
  $('#next-receipts').disabled = (page + 1) * 12 >= all.length;
  $('#receipt-list').innerHTML = list.map(r => `<button class="receipt-choice ${r.id === selectedReceipt ? 'selected' : ''}" data-receipt="${esc(r.id)}"><strong>${esc(r.supplier || 'Retailer not set')}</strong><span>${esc(r.date || 'Confirm date')}</span><small>${esc(r.status)} · ${esc(r.originalName)}</small></button>`).join('');
  $$('[data-receipt]').forEach(b => b.onclick = () => {
    selectedReceipt = b.dataset.receipt;
    receiptRows();
  });
  receiptDetail();
}
function editing() {
  return $('#dialog').open || !!document.activeElement?.closest('input,textarea,select');
}
async function checkInboxAutomatically() {
  if (!inbox || !state.imported || uiBusy || saveCount || receiptImportRunning || editing()) return;
  await importReceipts('scanInbox', true);
}
function startInboxChecks() {
  if (inboxTimer) clearInterval(inboxTimer);
  inboxTimer = setInterval(checkInboxAutomatically, 15000);
  window.addEventListener('focus', checkInboxAutomatically);
  checkInboxAutomatically();
}
async function importReceipts(actionName, automatic = false) {
  if (receiptImportRunning) return;
  receiptImportRunning = true;
  const epoch = dataEpoch;
  const collect = async () => {
    await saveTail;
    const result = await native(actionName, {
      automatic
    });
    if (!result || epoch !== dataEpoch) return;
    // A modal may have opened while OCR was running. Retry once it is closed.
    if (automatic && editing()) return;
    let added = 0,
      duplicates = result.duplicates || 0;
    for (const r of result.records) {
      if (state.receipts.some(x => x.id === r.id)) {
        duplicates++;
        continue;
      }
      if (!r.file) continue;
      state.receipts.push(r);
      if (!automatic) selectedReceipt = r.id;
      added++;
    }
    const errorText = result.errors.join('; '),
      message = `${added} receipts added; ${duplicates} duplicates skipped.${result.pending ? ' ' + result.pending + ' files are still arriving.' : ''}${errorText ? ' Some files could not be read: ' + errorText : ''}`;
    if (added) await save(message, !automatic || currentTab === 'receipts');else if (!automatic || errorText && errorText !== lastInboxError) notice(message, !!errorText);
    lastInboxError = errorText;
  };
  try {
    if (automatic) await collect();else await busy('Reading receipts on this Mac…', collect);
  } catch (e) {
    if (!automatic || e.message !== lastInboxError) notice('Receipt folder: ' + e.message, true);
    lastInboxError = e.message;
  } finally {
    receiptImportRunning = false;
  }
}
async function receiptDetail() {
  const r = state.receipts.find(r => r.id === selectedReceipt);
  if (!r) {
    $('#receipt-detail').innerHTML = '<div class="empty">Add receipt photos or PDFs, or check your iCloud receipt folder.</div>';
    return;
  }
  const editable = r.status === 'Needs review';
  $('#receipt-detail').innerHTML = `<div class="toolbar"><h2>${esc(r.supplier || 'New receipt')}</h2><span class="pill">${esc(r.status)}</span></div><div class="two"><div class="pane"><div class="toolbar"><h3>Original receipt</h3><button id="open-original">Open original</button></div><div id="receipt-image" class="receipt-original">Loading preview…</div><p class="small">${esc(r.originalName)} · ${r.pages || 1} page(s). Open original for zoom and all pages.</p><details><summary>Recognized text</summary><pre class="ocr">${esc(r.text || 'No text recognized. You can enter purchase details manually.')}</pre>${r.ocrError ? `<p class="bad">Text recognition was incomplete. Enter the purchases from the original: ${esc(r.ocrError)}</p>` : ''}${r.ocrLimited ? '<p class="bad">Text recognition covered the first 10 pages only.</p>' : ''}</details></div><div class="pane"><h3>${editable ? 'Review purchases' : 'Saved review'}</h3><div class="fields two"><label>Retailer<input id="receipt-supplier" value="${esc(r.supplier)}" ${editable ? '' : 'disabled'}></label><label>Purchase date<input id="receipt-date" type="date" max="${today()}" value="${esc(r.date)}" ${editable ? '' : 'disabled'}></label></div><div id="purchases">${r.lines.map((l, index) => {
    const i = state.ingredients.find(i => i.id === l.ingredientId),
      old = M.unitCost(i);
    return `<div class="purchase"><div class="toolbar"><strong>${esc(l.description || i?.name || 'Purchase ' + (index + 1))}</strong>${editable ? `<button data-edit-purchase="${index}">Edit</button>` : ''}</div><div>${esc(i?.name || 'Not matched')}</div><div class="small">${l.excluded ? 'Excluded from price updates' : money(l.price) + ' / ' + (l.size ?? '—') + ' ' + esc(l.unit)}</div>${!l.excluded ? `<div class="small">Current: ${old == null ? '—' : '$' + old.toFixed(5) + ' / ' + esc(i.unit)} · Purchase: ${M.positive(l.size) && l.price != null ? '$' + (l.price / l.size).toFixed(5) + ' / ' + esc(l.unit) : 'Confirm size'}</div>` : ''}</div>`;
  }).join('')}</div>${editable ? '<div class="actions spacer"><button id="add-purchase">Add purchase</button><button id="suggest-lines">Find candidate lines</button></div><p class="small">Confirm the paid amount after discounts and the total package quantity. Exclude personal items and refunds. Text recognition can make mistakes.</p><div class="actions"><button id="approve-receipt" class="primary">Approve price updates</button><button id="archive-receipt">Archive without updates</button></div>' : '<p class="small spacer">Original receipt and purchase details retained. Older purchases are recorded in history without replacing newer prices.</p>'}${(r.notUpdated || []).map(x => `<p class="note">${esc(x.message)}</p>`).join('')}</div></div>`;
  action('#open-original', () => native('openReceipt', {
    file: r.file
  }));
  if (editable) {
    $('#receipt-supplier').onchange = async e => {
      state.receipts.find(x => x.id === r.id).supplier = e.target.value;
      try {
        await save('Saved', false);
      } catch {}
    };
    $('#receipt-date').onchange = async e => {
      if (!e.target.reportValidity()) return;
      state.receipts.find(x => x.id === r.id).date = e.target.value;
      try {
        await save('Saved', false);
      } catch {}
    };
    action('#add-purchase', () => editPurchase(r));
    action('#suggest-lines', () => suggestPurchases(r));
    $$('[data-edit-purchase]').forEach(b => b.onclick = () => editPurchase(r, Number(b.dataset.editPurchase)));
    action('#approve-receipt', () => {
      modal('Approve these purchases?', `<p>Update matched ingredient prices from ${esc(r.supplier || 'this retailer')} on ${esc(r.date || 'the confirmed date')}?</p><p>Your selling prices will stay unchanged. Older purchases will be kept in history.</p>`, async () => {
        const candidate = clone(state),
          receipt = candidate.receipts.find(x => x.id === r.id);
        const count = M.approveReceipt(candidate, receipt);
        state = candidate;
        await save(count + ' purchase prices reviewed.' + (receipt.notUpdated.length ? ' ' + receipt.notUpdated.map(x => x.message).join(' ') : ''));
      }, 'Approve');
    });
    action('#archive-receipt', () => modal('Archive without price updates?', '<p>The original receipt will remain searchable. No ingredient prices will change.</p>', async () => {
      state.receipts.find(x => x.id === r.id).status = 'Archived';
      await save('Receipt archived.');
    }, 'Archive'));
  }
  try {
    const image = await native('previewReceipt', {
      file: r.file
    });
    if (currentTab === 'receipts' && selectedReceipt === r.id && $('#receipt-image')) $('#receipt-image').innerHTML = `<img class="receipt-image" src="${image}" alt="Original receipt from ${esc(r.supplier || r.originalName)}">`;
  } catch (e) {
    if (currentTab === 'receipts' && selectedReceipt === r.id && $('#receipt-image')) $('#receipt-image').textContent = e.message;
  }
}
function editPurchase(r, index = null) {
  const l = index === null ? {
    description: '',
    ingredientId: '',
    price: null,
    size: null,
    unit: '',
    excluded: false
  } : clone(r.lines[index]);
  modal('Receipt purchase', `<label>Receipt description<input name="description" value="${esc(l.description)}"></label><label class="spacer">Match to ingredient / packaging<select name="ingredientId">${ingredientOptions(null, l.ingredientId)}</select></label><div class="fields three">${field('Paid package total ($)', 'price', l.price ?? '', 'number', 'min="0" step=".01"')}${field('Total quantity purchased', 'size', l.size ?? '', 'number', 'min="0.000001" step="any"')}${field('Quantity unit', 'unit', l.unit)}</div><label class="inline"><input name="excluded" type="checkbox" ${l.excluded ? 'checked' : ''}>Exclude personal item, refund or non-ingredient expense</label><label class="inline spacer"><input name="freeConfirmed" type="checkbox" ${l.freeConfirmed ? 'checked' : ''}>I confirm this purchase was free (only for a $0 price)</label>${index !== null ? '<label class="inline spacer"><input type="checkbox" name="remove">Remove this purchase line</label>' : ''}<p class="small">A 60-egg package uses quantity 60 and unit “each”. Two 1 kg bags use total quantity 2,000 and unit “g”.</p>`, async fd => {
    r = state.receipts.find(x => x.id === r.id);
    if (!r) throw Error('This receipt no longer exists.');
    if (fd.get('remove')) r.lines.splice(index, 1);else {
      for (const k of ['description', 'ingredientId', 'unit']) l[k] = String(fd.get(k)).trim();
      l.price = num(fd.get('price'));
      l.size = num(fd.get('size'));
      l.excluded = !!fd.get('excluded');
      l.freeConfirmed = !!fd.get('freeConfirmed');
      if (index === null) r.lines.push(l);else r.lines[index] = l;
    }
    await save('Receipt draft saved.');
  });
  $('#dialog [name=ingredientId]').onchange = e => {
    const i = state.ingredients.find(i => i.id === e.target.value);
    if (i) {
      $('#dialog [name=unit]').value = i.unit;
      $('#dialog [name=size]').value = i.size ?? '';
    }
  };
}
function suggestPurchases(r) {
  const candidates = [];
  for (const line of r.text.split('\n')) {
    const match = line.match(/^(.+?)\s+\$?(-?\d+[.,]\d{2})\s*[A-Z]?$/);
    if (!match || /total|tax|cash|change|balance|visa|mastercard|payment|saving|discount|coupon/i.test(match[1])) continue;
    const description = match[1].trim(),
      price = Number(match[2].replace(',', '.'));
    if (r.lines.some(l => l.description === description) || candidates.some(l => l.description === description)) continue;
    const mapped = state.mappings[M.normalized(r.supplier) + '|' + M.normalized(description)];
    candidates.push({
      description,
      price: price >= 0 ? price : null,
      ingredientId: mapped?.ingredientId || '',
      size: mapped?.size ?? null,
      unit: mapped?.unit || '',
      excluded: price < 0
    });
  }
  if (!candidates.length) {
    notice('No clear item-and-price lines found. Add purchases manually using the original receipt.');
    return;
  }
  modal('Review candidate lines', `<p>These ${candidates.length} lines were read from the receipt. They are unapproved drafts; check each against the original.</p><ul>${candidates.map(l => `<li>${esc(l.description)} · ${money(l.price)}${l.ingredientId ? ' · saved match' : ''}</li>`).join('')}</ul>`, async () => {
    r = state.receipts.find(x => x.id === r.id);
    r.lines.push(...candidates);
    await save('Candidate lines added. Confirm matches, quantities and prices.');
  }, 'Add draft lines');
}
function settingsPage() {
  $('#main').innerHTML = `<h1>Settings</h1><p class="sub">Shared costing defaults and your local records.</p><div class="two"><div class="pane"><h3>Pricing and cost alerts</h3><form id="settings-form"><div class="fields two">${field('Labour rate ($ / hour)', 'laborRate', state.settings.laborRate, 'number', 'min="0" step=".01" required')}${field('Retail markup (%)', 'retailMarkup', state.settings.retailMarkup ?? '', 'number', 'min="0" step="any"')}${field('Bulk markup (%)', 'bulkMarkup', state.settings.bulkMarkup ?? '', 'number', 'min="0" step="any"')}${field('Cost increase alert (%)', 'alertPercent', state.settings.alertPercent, 'number', 'min="0" step="any" required')}${field('Review purchase prices after (days)', 'staleDays', state.settings.staleDays, 'number', 'min="1" step="1" required')}</div><p class="small">Markup is added to cost: $10 cost + 50% markup = $15 selling price. Margin at $15 is 33.3%.</p><button class="primary">Save settings</button></form></div><div class="pane"><h3>Receipt folder</h3><p class="small">Choose the “All new receipts” folder used by the iPhone shortcut. While the app is open, new receipts are detected every 15 seconds and when you return to the app. Arriving iCloud files are retried after download. Prices still require your approval.</p><p id="inbox-path" class="ocr">${esc(inbox || 'No folder selected')}</p><button id="choose-inbox">Choose folder</button><h3 class="spacer">Backups and undo</h3><div class="actions"><button id="backup">Save full backup</button><button id="restore">Restore backup</button><button id="undo">Undo last saved change</button></div><p class="small spacer">A full backup includes your records and original receipts. Save a copy to iCloud Drive or another safe location. The live database stays on this Mac. Up to 30 saved changes can be undone.</p><button id="show-folder">Show local data folder</button></div></div><div class="pane"><h3>Excel fallback</h3><p>Export an editable workbook with formulas, ingredients, recipes, packaging, labour, pricing settings and your price list. Reimport a workbook exported by this app to review input changes before applying them.</p><div class="actions"><button id="export-all">Export all to Excel</button><button id="import-excel">Review Excel import</button></div></div><div class="pane"><h3>About this first version</h3><p class="small">Local Mac app · no paid server or AI account · receipt recognition runs on this Mac. Square sales, business-profitability reports and seasonal forecasting are not included in this version. Costing labour is an allowance for pricing, not a business-profit calculation.</p></div>`;
  $('#settings-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['laborRate', 'retailMarkup', 'bulkMarkup', 'alertPercent', 'staleDays']) state.settings[key] = num(fd.get(key));
    try {
      await save('Settings saved. Suggested prices recalculated.');
    } catch {}
  };
  action('#choose-inbox', async () => {
    const path = await native('chooseInbox');
    if (path) {
      inbox = path;
      settingsPage();
      checkInboxAutomatically();
    }
  });
  action('#backup', () => busy('Saving complete backup…', async () => {
    await saveTail;
    const p = await native('backup');
    if (p) notice('Full backup saved.');
  }));
  action('#restore', restoreBackup);
  action('#undo', () => modal('Undo the last saved change?', '<p>Restore the records from before the most recent save. Original receipt files will remain safely stored.</p>', async () => {
    await saveTail;
    dataEpoch++;
    const restored = await native('undo');
    state = M.validate(restored);
    lastSaved = clone(state);
    render();
    notice('Last saved change undone.');
  }, 'Undo change'));
  action('#show-folder', () => native('showDataFolder'));
  action('#export-all', () => exportExcel());
  action('#import-excel', importExcel);
}
async function exportExcel(recipe = null) {
  const s = clone(state);
  if (recipe) {
    s.recipes = [clone(recipe)];
    const ids = new Set(recipe.lines.map(l => l.ingredientId));
    s.ingredients = s.ingredients.filter(i => ids.has(i.id));
  }
  await busy('Creating editable workbook…', async () => {
    const p = await native('exportExcel', M.workbook(s));
    if (p) notice('Excel workbook saved. Open it in Excel to calculate formulas.');
  });
}
async function restoreBackup() {
  await busy('Reading backup…', async () => {
    const restored = await native('readBackup');
    if (!restored) return;
    M.validate(restored);
    modal('Restore this bakery backup?', `<p>Replace current records with ${restored.recipes.length} recipes, ${restored.ingredients.length} master items and ${restored.receipts.length} receipts from this backup.</p><p>Save a full backup of your current bakery first if you want to retain it separately. This restore can also be undone.</p>`, async () => {
      await saveTail;
      dataEpoch++;
      state = M.validate(await native('restoreBackup'));
      lastSaved = clone(state);
      render();
      notice('Backup restored.');
    }, 'Restore backup');
  });
}
function importCandidate(tables) {
  const candidate = clone(state),
    summary = {
      ingredients: 0,
      recipes: 0,
      newIngredients: 0,
      newRecipes: 0,
      settings: 0
    };
  const headers = {
    Ingredients: ['ID', 'Name', 'Kind', 'Supplier', 'Package price', 'Package quantity', 'Unit', 'Updated date', 'Cost per unit', 'Free confirmed'],
    Recipes: ['ID', 'Name', 'Yield', 'Yield unit', 'Labour hours', 'Labour effort', 'Your retail', 'Your bulk', 'Bulk minimum', 'Notes', 'Category', 'Other batch cost', 'Bulk packaging per piece', 'Bulk labour hours'],
    Lines: ['Line ID', 'Recipe ID', 'Ingredient ID', 'Quantity', 'Unit', 'Per piece'],
    Settings: ['Setting', 'Value']
  };
  for (const [name, required] of Object.entries(headers)) {
    if (!Array.isArray(tables[name]) || required.some((h, i) => tables[name][0]?.[i] !== h)) throw Error('The ' + name + ' sheet does not match this version of the app’s export template.');
    const inputs = name === 'Ingredients' ? [0, 1, 2, 3, 4, 5, 6, 7, 9] : required.map((_, i) => i);
    for (const row of tables[name].slice(1)) for (const i of inputs) if (row[i] && typeof row[i] === 'object') throw Error('Input formulas are not supported for reimport: ' + name + '. Replace input formulas with values.');
  }
  const str = v => String(v ?? '').trim(),
    value = v => v == null || v === '' ? null : Number(v),
    seen = new Set();
  for (const row of tables.Ingredients.slice(1)) {
    if (row.every(x => x == null || x === '')) continue;
    const id = str(row[0]);
    if (!id || seen.has(id)) throw Error('Missing or duplicate ingredient ID.');
    seen.add(id);
    const updated = str(row[7]);
    if (updated && !M.validDate(updated)) throw Error('Ingredient dates must be YYYY-MM-DD text.');
    if (![0, 1].includes(value(row[9]))) throw Error('Free confirmed must be 0 or 1.');
    const old = candidate.ingredients.find(i => i.id === id),
      i = {
        ...(old || {
          id,
          history: [],
          notes: ''
        }),
        name: str(row[1]),
        kind: str(row[2]),
        supplier: str(row[3]),
        price: value(row[4]),
        size: value(row[5]),
        unit: str(row[6]),
        updated,
        freeConfirmed: value(row[9]) === 1
      };
    if (old) {
      if (['name', 'kind', 'supplier', 'price', 'size', 'unit', 'updated'].some(k => old[k] !== i[k]) || !!old.freeConfirmed !== i.freeConfirmed) {
        i.history.push({
          date: old.updated,
          price: old.price,
          size: old.size,
          unit: old.unit,
          supplier: old.supplier,
          receiptId: old.receiptId ?? null,
          note: 'Before Excel import'
        });
        if (['supplier', 'price', 'size', 'unit', 'updated'].some(k => old[k] !== i[k])) delete i.receiptId;
        candidate.ingredients[candidate.ingredients.indexOf(old)] = i;
        summary.ingredients++;
      }
    } else {
      candidate.ingredients.push(i);
      summary.newIngredients++;
    }
  }
  const recipes = new Set(),
    originalRecipes = new Map(candidate.recipes.map(r => [r.id, clone(r)]));
  for (const row of tables.Recipes.slice(1)) {
    if (row.every(x => x == null || x === '')) continue;
    const id = str(row[0]);
    if (!id || recipes.has(id)) throw Error('Missing or duplicate recipe ID.');
    recipes.add(id);
    const old = candidate.recipes.find(r => r.id === id),
      r = {
        ...(old || {
          id
        }),
        name: str(row[1]),
        yield: value(row[2]),
        unit: str(row[3]),
        laborHours: value(row[4]),
        laborEffort: str(row[5]) || 'Custom',
        retail: value(row[6]),
        bulk: value(row[7]),
        bulkMin: value(row[8]),
        notes: str(row[9]),
        category: str(row[10]),
        otherCost: value(row[11]),
        bulkPackaging: value(row[12]),
        bulkLaborHours: value(row[13]),
        lines: []
      };
    if (old) candidate.recipes[candidate.recipes.indexOf(old)] = r;else {
      candidate.recipes.push(r);
      summary.newRecipes++;
    }
  }
  const lineIDs = new Set();
  for (const row of tables.Lines.slice(1)) {
    if (row.every(x => x == null || x === '')) continue;
    const id = str(row[0]),
      recipeID = str(row[1]),
      ingredientId = str(row[2]);
    if (!id || lineIDs.has(id)) throw Error('Missing or duplicate recipe line ID.');
    lineIDs.add(id);
    if (!recipes.has(recipeID)) throw Error('Line refers to a recipe missing from the Recipes sheet.');
    if (!candidate.ingredients.some(i => i.id === ingredientId)) throw Error('Line refers to an unknown ingredient.');
    if (![0, 1].includes(value(row[5]))) throw Error('Per piece must be 0 or 1.');
    candidate.recipes.find(r => r.id === recipeID).lines.push({
      id,
      ingredientId,
      quantity: value(row[3]),
      unit: str(row[4]),
      perPiece: value(row[5]) === 1
    });
  }
  for (const r of candidate.recipes.filter(r => recipes.has(r.id))) if (r.laborEffort !== 'Custom' && M.laborEfforts[r.laborEffort] !== r.laborHours) r.laborEffort = 'Custom';
  const recipeInput = r => ({
    name: r.name,
    yield: r.yield,
    unit: r.unit,
    laborHours: r.laborHours,
    laborEffort: r.laborEffort || 'Custom',
    retail: r.retail,
    bulk: r.bulk,
    bulkMin: r.bulkMin,
    notes: r.notes,
    category: r.category,
    otherCost: r.otherCost,
    bulkPackaging: r.bulkPackaging,
    bulkLaborHours: r.bulkLaborHours,
    lines: r.lines
  });
  for (const id of recipes) {
    const old = originalRecipes.get(id),
      next = candidate.recipes.find(r => r.id === id);
    if (old && JSON.stringify(recipeInput(old)) !== JSON.stringify(recipeInput(next))) summary.recipes++;
  }
  const settingNames = new Set();
  for (const row of tables.Settings.slice(1)) {
    if (row.every(x => x == null || x === '')) continue;
    const key = str(row[0]);
    if (!Object.keys(candidate.settings).includes(key) || settingNames.has(key)) throw Error('Unknown or duplicate setting.');
    settingNames.add(key);
    const v = value(row[1]);
    if (candidate.settings[key] !== v) summary.settings++;
    candidate.settings[key] = v;
  }
  for (const row of tables.Lines.slice(1)) {
    if (!row[0] || row[6] == null || typeof row[6] === 'object') continue;
    const i = candidate.ingredients.find(i => i.id === str(row[2])),
      expected = M.factor(str(row[4]), i.unit);
    if (expected === null || !M.finite(value(row[6])) || Math.abs(value(row[6]) - expected) > 1e-9 * Math.max(1, expected)) throw Error('Conversion factor does not match the units for line ' + str(row[0]) + '. Correct the workbook units and conversion before importing.');
  }
  M.validate(candidate);
  candidate.imported = true;
  return {
    candidate,
    summary
  };
}
async function importExcel() {
  await busy('Reading Excel input values…', async () => {
    const tables = await native('importExcel');
    if (!tables) return;
    const {
      candidate,
      summary: s
    } = importCandidate(tables);
    const errors = candidate.recipes.flatMap(r => M.calculate(candidate, r).errors.map(e => r.name + ': ' + e));
    modal('Review Excel import', `<div class="line"><span>Changed master items</span><strong>${s.ingredients}</strong></div><div class="line"><span>New master items</span><strong>${s.newIngredients}</strong></div><div class="line"><span>Existing recipes to replace from workbook</span><strong>${s.recipes}</strong></div><div class="line"><span>New recipes</span><strong>${s.newRecipes}</strong></div><div class="line"><span>Changed settings</span><strong>${s.settings}</strong></div><p class="small spacer">Records absent from the workbook stay in the app. Imported recipe lines replace that recipe’s current lines. Receipt history is retained.</p>${errors.length ? `<div class="note">${errors.length} incomplete cost checks remain.<ul>${errors.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`, async () => {
      state = candidate;
      await save('Excel input changes imported.');
    }, 'Apply reviewed import');
  });
}
window.HeidyApp = {
  getState: () => clone(state),
  getToday: today,
  importCandidate
};
// Start native application.
(async () => {
  try {
    const result = await native('load');
    seed = result.seed;
    inbox = result.inbox;
    let migrated = false;
    if (result.state) {
      const vanilla = result.state.ingredients?.find(i => i.name === 'Vanilla Paste' && i.updated === '2029-08-31');
      if (vanilla) {
        vanilla.updated = '2019-08-31';
        migrated = true;
      }
    }
    state = result.state ? M.validate(result.state) : M.empty();
    lastSaved = result.state ? clone(state) : null;
    $('#save-status').textContent = 'Stored on this Mac';
    if (migrated) await save('Corrected the known Vanilla Paste purchase date typo.');else render();
    startInboxChecks();
  } catch (e) {
    $('#main').innerHTML = `<div class="note bad">${esc(e.message)}</div>`;
    $('#save-status').textContent = 'Could not open records';
  }
})();
