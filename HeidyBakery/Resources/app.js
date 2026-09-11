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
  appVersion = null,
  pickupStatus = null,
  checkingFolder = false,
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
    M.normalizeState(state);
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
  if (viewState.receipts) viewState.receipts.fields = {};
  tab('receipts', true);
}
const viewState = {};
const viewLabels = {prices: 'Price list', recipes: 'Recipes', ingredients: 'Ingredients', receipts: 'Receipts', 'margin-watch': 'Margin Watch', settings: 'Settings'};
let returnView = null;
let settingsDraft = null;
function rememberView() {
  const v = viewState[currentTab] ||= {fields: {}};
  $$('#main .filters input, #main .filters select, .recipe-picker input').forEach(el => v.fields[el.id] = el.value);
  v.top = $('.workspace').scrollTop;
  v.scrolls = $$('#main .scroll').map(el => [el.scrollLeft, el.scrollTop]);
}
function restoreFilters() {
  const v = viewState[currentTab];
  if (!v) return;
  for (const [id, value] of Object.entries(v.fields)) if ($('#' + id)) $('#' + id).value = value;
}
function tab(name, linked = false) {
  if (!viewLabels[name]) return;
  rememberView();
  if (linked && viewState[name]) {
    if (name === 'receipts') viewState[name].fields = {};
    if (name === 'recipes') viewState[name].fields['recipe-search'] = '';
  }
  if (linked && name !== currentTab) returnView = currentTab;
  else if (!linked) returnView = null;
  currentTab = name;
  search = '';
  render();
}
function openRecipeRecord(id) {
  selectedRecipe = id;
  if (viewState.recipes) viewState.recipes.fields['recipe-search'] = '';
  tab('recipes', true);
}
$$('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
function render() {
  $$('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === currentTab);
    if (b.dataset.tab === currentTab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.body.dataset.view = currentTab;
  if (!state.imported && state.recipes.length === 0 && currentTab === 'prices') {
    welcome();
    return;
  }
  ({
    prices: pricePage,
    'margin-watch': marginWatchPage,
    recipes: recipePage,
    ingredients: ingredientPage,
    receipts: receiptPage,
    settings: settingsPage
  })[currentTab]();
  const v = viewState[currentTab];
  $('.workspace').scrollTop = v?.top || 0;
  $$('#main .scroll').forEach((el, i) => { el.scrollLeft = v?.scrolls?.[i]?.[0] || 0; el.scrollTop = v?.scrolls?.[i]?.[1] || 0; });
  $('#back-view').hidden = !returnView;
  $('#back-view').textContent = returnView ? '← Back to ' + viewLabels[returnView] : 'Back';
  $('#back-view').onclick = () => { const destination = returnView; tab(destination); $('[data-tab="' + destination + '"]').focus(); };
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
  restoreFilters();
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
    openRecipeRecord(b.dataset.openRecipe);
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
function marginWatchPage() {
  const watch = M.marginWatch(state);
  const ingList = watch.ingredients;
  const recList = watch.recipes;
  const hasData = ingList.length > 0 || recList.length > 0;

  $('#main').innerHTML = `
    <div class="toolbar">
      <div>
        <h1>Margin Watch</h1>
        <p class="sub">See which recipes are affected when purchase costs rise.</p>
      </div>
    </div>
    ${!hasData ? `
      <div class="pane">
        <h3>No cost increases to display</h3>
        <p class="sub">Compare recorded ingredient costs and recipe margins. A clear list does not confirm that every cost is current.</p>
        <p class="small">As you scan and approve new receipts, ingredient purchase history accumulates automatically. When an ingredient's price increases above its baseline, it will appear here ranked by percentage and dollar impact.</p>
      </div>
    ` : `
      <div class="two margin-layout">
        <div class="pane">
          <h3>Ingredients rising fastest (${ingList.length})</h3>
          <p class="small sub">Ranked by percentage cost increase since first recorded purchase.</p>
          ${ingList.length ? `
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th class="num">Old cost</th>
                    <th class="num">Current cost</th>
                    <th class="num">Change (%)</th>
                    <th class="num">Change ($)</th>
                  </tr>
                </thead>
                <tbody>
                  ${ingList.map(item => {
                    const i = item.ingredient;
                    const deltaPct = item.deltaPercent;
                    const isUp = deltaPct > 0;
                    return `
                      <tr>
                        <td>
                          <button class="link" data-review-item="${esc(i.id)}">${esc(i.name)}</button>
                          <div class="small">${esc(i.supplier || 'No supplier')} · per ${esc(i.unit)}</div>
                        </td>
                        <td class="num">${money(item.then)}</td>
                        <td class="num">${money(item.now)}</td>
                        <td class="num ${isUp ? 'bad' : 'good'}">${isUp ? '+' : ''}${deltaPct.toFixed(1)}%</td>
                        <td class="num ${isUp ? 'bad' : 'good'}">${isUp ? '+' : ''}${money(item.deltaDollarsPerUnit)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="small">No ingredients with price changes yet.</p>'}
        </div>

        <div class="pane margin-recipes">
          <h3>Recipes losing margin (${recList.length})</h3>
          <p class="small sub">Ranked by dollar profit lost per piece since last price review.</p>
          ${recList.length ? `
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th class="num">Retail price</th>
                    <th class="num">Margin drift</th>
                    <th class="num">Lost / piece</th>
                  </tr>
                </thead>
                <tbody>
                  ${recList.map(item => {
                    const r = item.recipe;
                    const drop = item.marginDropPoints;
                    const isEroding = drop > 0;
                    return `
                      <tr>
                        <td>
                          <button class="link" data-open-recipe="${esc(r.id)}">${esc(r.name)}</button>
                          <div class="small">Cost: ${money(item.costBaseline)} → ${money(item.costNow)}</div>
                        </td>
                        <td class="num">${money(item.retail)}</td>
                        <td class="num ${isEroding ? 'bad' : 'good'}">
                          ${pct(item.marginBaseline)} → ${pct(item.marginNow)}
                          <div class="small">${isEroding ? '-' : '+'}${Math.abs(drop).toFixed(1)} pts</div>
                        </td>
                        <td class="num ${item.dollarsPerPiece > 0 ? 'bad' : 'good'}">
                          ${item.dollarsPerPiece > 0 ? '-' : '+'}${money(Math.abs(item.dollarsPerPiece))}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="small">No recipes with unreviewed cost increases.</p>'}
        </div>
      </div>
    `}
  `;

  $$('#main [data-review-item]').forEach(b => b.onclick = () => editIngredient(state.ingredients.find(i => i.id === b.dataset.reviewItem)));
  $$('#main [data-open-recipe]').forEach(b => b.onclick = () => {
    openRecipeRecord(b.dataset.openRecipe);
  });
}
function recipePage() {
  if (!selectedRecipe || !state.recipes.some(r => r.id === selectedRecipe)) selectedRecipe = state.recipes[0]?.id;
  $('#main').innerHTML = `<div class="toolbar"><h1>Recipes</h1><div class="actions"><button id="new-recipe" class="primary">New recipe</button><button id="export-recipe">Export this recipe</button><button id="import-recipes">Import from Excel</button></div></div><div class="recipe-layout"><aside class="recipe-picker"><label>Find a recipe<input id="recipe-search" placeholder="Search recipes"></label><label class="recipe-select-label">Select recipe<select id="recipe-select"></select></label><div id="recipe-list" class="recipe-list" aria-label="Recipe selection"></div></aside><div id="recipe-detail"></div></div>`;
  action('#new-recipe', () => editRecipe());
  action('#import-recipes', importExcel);
  action('#export-recipe', () => {
    const r = state.recipes.find(r => r.id === selectedRecipe);
    if (r) exportExcel(r);
  });
  function opts() {
    const term = $('#recipe-search').value.toLowerCase(),
      rs = state.recipes.filter(r => r.name.toLowerCase().includes(term));
    $('#recipe-select').innerHTML = rs.map(r => `<option value="${esc(r.id)}" ${r.id === selectedRecipe ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
    selectedRecipe = $('#recipe-select').value;
    $('#recipe-list').innerHTML = rs.map(r => `<button data-select-recipe="${esc(r.id)}" class="${r.id === selectedRecipe ? 'selected' : ''}" aria-pressed="${r.id === selectedRecipe}">${esc(r.name)}</button>`).join('') || '<p class="small">No matching recipes.</p>';
    $$('[data-select-recipe]').forEach(b => b.onclick = () => { selectedRecipe = b.dataset.selectRecipe; opts(); $('[data-select-recipe="' + selectedRecipe + '"]').focus(); });
    recipeDetail();
  }
  $('#recipe-search').oninput = opts;
  $('#recipe-select').onchange = e => {
    selectedRecipe = e.target.value;
    opts();
  };
  restoreFilters();
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
  restoreFilters();
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
  $('#main').innerHTML = `<div class="toolbar"><div><h1>Receipts</h1><p class="sub">Original receipts stay saved. Purchase prices change only after review.</p></div><div class="actions"><button id="scan-inbox">Check receipt folder</button><button id="add-receipts" class="primary">Add photos / PDFs</button></div></div><div class="pickup-status small" data-pickup-status></div><div class="filters"><label class="wide">Search<input id="receipt-search" placeholder="Retailer, receipt text or item"></label><label>From<input id="receipt-from" type="date"></label><label>To<input id="receipt-to" type="date"></label><label>Retailer<select id="receipt-store"><option value="">All retailers</option>${[...new Set(state.receipts.map(r => r.supplier).filter(Boolean))].sort().map(s => `<option>${esc(s)}</option>`).join('')}</select></label><label>Status<select id="receipt-status"><option value="">All receipts</option><option>Needs review</option><option>Reviewed</option><option>Archived</option></select></label></div><div class="split"><aside><h3 id="receipt-count"></h3><div id="receipt-list"></div><div class="actions"><button id="prev-receipts">Previous</button><button id="next-receipts">Next</button></div></aside><div id="receipt-detail"></div></div>`;
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
  restoreFilters();
  receiptRows(true);
  renderPickupStatus();
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
  const epoch = dataEpoch, scanFolder = inbox;
  if (actionName === 'scanInbox') { checkingFolder = true; renderPickupStatus(); }
  const collect = async () => {
    await saveTail;
    const result = await native(actionName, {
      automatic
    });
    if (!result || epoch !== dataEpoch || actionName === 'scanInbox' && scanFolder !== inbox) return;
    if (actionName === 'scanInbox') {
      pickupStatus = result.inboxStatus || {path:scanFolder,lastChecked:new Date().toISOString(),lastSuccess:result.errors.length ? pickupStatus?.lastSuccess : new Date().toISOString(),errors:result.errors,pending:result.pending || 0,pendingFiles:result.pendingFiles || []};
      renderPickupStatus();
    }
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
      M.prepareReceipt(state, r);
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
    if (actionName === 'scanInbox' && scanFolder === inbox) { pickupStatus = {...pickupStatus,path:scanFolder,lastChecked:new Date().toISOString(),errors:[e.message]}; renderPickupStatus(); }
    if (!automatic || e.message !== lastInboxError) notice('Receipt folder: ' + e.message, true);
    lastInboxError = e.message;
  } finally {
    receiptImportRunning = false;
    if (actionName === 'scanInbox') { checkingFolder = false; renderPickupStatus(); }
  }
}
function renderPickupStatus() {
  const status = pickupStatus?.path === inbox ? pickupStatus : null;
  const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not yet';
  const text = !inbox ? 'No receipt folder selected.' : checkingFolder ? 'Checking receipt folder…' : `Last check: ${date(status?.lastChecked)}. Last successful check: ${date(status?.lastSuccess)}.`;
  $$('[data-pickup-status]').forEach(el => el.innerHTML = `<p>${esc(text)}</p>${status?.pending ? `<p>${status.pending} file(s) waiting for download or a complete write.</p>${status.pendingFiles?.length ? `<details><summary>Waiting files</summary><ul>${status.pendingFiles.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}` : ''}${status?.errors?.length ? `<div class="bad">${status.errors.map(e=>`<p>${esc(e)}</p>`).join('')}</div>` : ''}`);
}
function openIngredientRecord(id) {
  if (viewState.ingredients) viewState.ingredients.fields = {};
  tab('ingredients',true);
  const item = state.ingredients.find(i=>i.id===id);
  if (item) editIngredient(item);
}
function receiptSummary(r) {
  if (!r.approvalSummary || r.status !== 'Reviewed') return '';
  const v = r.approvalSummary;
  return `<div class="note" id="receipt-result"><strong>${v.updated} ingredient prices updated</strong><p>${v.historyOnly} older purchases saved to history · ${v.excluded} excluded</p><div class="actions">${v.ingredientIds.map(id=>`<button data-view-ingredient="${esc(id)}">${esc(state.ingredients.find(i=>i.id===id)?.name || 'Ingredient')}</button>`).join('')}</div></div>`;
}
const unitMoney = value => value === null ? '—' : '$' + value.toFixed(5);
function receiptPurchases(r) {
  const editable = r.status === 'Needs review', issues = M.receiptIssues(state,r);
  const row = (l,index) => {
    const i = state.ingredients.find(i=>i.id===l.ingredientId), change = M.purchaseChange(state,r,l);
    const match = !i ? M.matchIngredient(state,r.supplier,l.description,l.productCode) : null;
    const suggestion = match && match.reason !== 'Confirm the flour type' && match.candidates.length === 1 ? match.candidates[0].name : '';
    const quantity=M.purchaseQuantity(state,r,l);
    const basicReady = i && M.nonnegative(l.price) && quantity && (l.price!==0||l.freeConfirmed) && (!l.packSize||Math.abs(l.packSize*l.packageCount-l.size)<.000001);
    const title=i?.name || (suggestion ? 'Suggested: '+suggestion : l.description || 'Purchase '+(index+1));
    return `<div class="purchase"><div class="toolbar"><strong>${esc(title)}</strong>${editable ? `<div class="actions"><button data-edit-purchase="${index}">${l.needsReview ? 'Review' : 'Edit'}</button>${basicReady && (l.needsReview || change.unusual && !l.priceChangeConfirmed) && !l.excluded ? `<button data-confirm-purchase="${index}">Confirm</button>` : ''}</div>` : ''}</div>
      <div class="small">Receipt: ${esc(l.description)}${l.productCode ? ' · Product '+esc(l.productCode) : ''}</div>
      ${!i ? `<p class="small">${match?.reason === 'Confirm the flour type' ? 'Confirm the flour type from the package.' : suggestion ? 'Confirm this ingredient and its pack size.' : 'Match an ingredient, add a new one, or exclude this purchase.'}</p>` : l.needsReview ? '<div class="small">Suggested match · check against the receipt</div>' : ''}
      ${l.parseNote && l.needsReview ? `<p class="small bad">${esc(l.parseNote)}</p>` : ''}
      <p>${l.excluded ? 'Excluded' : 'Paid '+money(l.price)+(l.size ? ' · Purchased '+l.size+' '+esc(l.unit) : ' · Confirm purchased quantity')}</p>
      ${l.packSize && l.packageCount ? `<div class="small">${l.packSize} ${esc(l.unit)} × ${l.packageCount} packs${l.quantitySource ? ' · '+esc(l.quantitySource) : ''}</div>` : l.packageCount > 1 ? `<div class="small">${l.packageCount} packs · enter their quantity</div>` : ''}
      ${quantity && M.factor(l.unit,i?.unit)===null ? `<p class="small">For recipes: ${quantity.size} ${esc(quantity.unit)}${l.costing ? ' · '+l.costing.packSize+' '+esc(l.costing.unit)+' per pack, confirmed' : ' · confirmed unit conversion'}</p>` : ''}
      ${!l.excluded && change.newCost!==null ? `<div class="small">${unitMoney(change.oldCost)} → ${unitMoney(change.newCost)} / ${esc(change.unit)}${change.percent !== null ? ' · '+(change.percent>0?'+':'')+change.percent.toFixed(1)+'%' : ''}</div>${change.older ? '<p class="small">Older purchase: history only.</p>' : change.unusual ? '<p class="bad small">Check this price change.</p>' : ''}` : ''}</div>`;
  };
  if (!editable) return r.lines.map(row).join('');
  const needs = new Set(issues.filter(x=>x.field==='line').map(x=>x.index));
  const pending=r.lines.map((l,n)=>({l,n})).filter(x=>!x.l.excluded&&needs.has(x.n));
  const ready=r.lines.map((l,n)=>({l,n})).filter(x=>!x.l.excluded&&!needs.has(x.n));
  const excluded=r.lines.map((l,n)=>({l,n})).filter(x=>x.l.excluded);
  return `${pending.map(x=>row(x.l,x.n)).join('')}${ready.length ? `<details class="receipt-ready"><summary>Ready (${ready.length})</summary>${ready.map(x=>row(x.l,x.n)).join('')}</details>` : ''}${excluded.length ? `<details><summary>Excluded (${excluded.length})</summary>${excluded.map(x=>row(x.l,x.n)).join('')}</details>` : ''}`;
}
function receiptPreviewHTML(r) {
  const preview=M.receiptPreview(state,r);
  return `<p>${esc(r.supplier)} · ${esc(r.date)}</p><div class="scroll"><table><thead><tr><th>Ingredient</th><th>Current / unit</th><th>Receipt / unit</th><th>Change</th></tr></thead><tbody>${preview.changes.map(c=>`<tr><td>${esc(c.name)}<div class="small">${esc(c.unit)}</div></td><td>${unitMoney(c.oldCost)}</td><td>${unitMoney(c.newCost)}</td><td>${c.older ? 'History only' : c.percent === null ? 'New cost' : (c.percent>0?'+':'')+c.percent.toFixed(1)+'%'}</td></tr>`).join('')}</tbody></table></div><h3>Affected recipes (${preview.recipes.length})</h3>${preview.recipes.length ? `<div class="scroll"><table><thead><tr><th>Recipe</th><th>Current / piece</th><th>After / piece</th></tr></thead><tbody>${preview.recipes.map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.before)}</td><td>${money(x.after)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No recipe costs change.</p>'}<p class="small">Selling prices stay unchanged. Older purchases enter history only.</p>`;
}
async function receiptDetail() {
  const r = state.receipts.find(r => r.id === selectedReceipt);
  if (!r) {
    $('#receipt-detail').innerHTML = '<div class="empty">Add receipt photos or PDFs, or check your iCloud receipt folder.</div>';
    return;
  }
  const editable = r.status === 'Needs review';
  $('#receipt-detail').innerHTML = `<div class="toolbar"><h2>${esc(r.supplier || 'New receipt')}</h2><span class="pill">${esc(r.status)}</span></div><div class="two"><div class="pane"><div class="toolbar"><h3>Original receipt</h3><button id="open-original">Open original</button></div><div id="receipt-image" class="receipt-original">Loading preview…</div><p class="small">${esc(r.originalName)} · ${r.pages || 1} page(s). Open original for zoom and all pages.</p><details><summary>Recognized text</summary><pre class="ocr">${esc(r.text || 'No text recognized. You can enter purchase details manually.')}</pre>${r.ocrError ? `<p class="bad">Text recognition was incomplete. Enter the purchases from the original: ${esc(r.ocrError)}</p>` : ''}${r.ocrLimited ? '<p class="bad">Text recognition covered the first 10 pages only.</p>' : ''}</details></div><div class="pane"><h3>${editable ? 'Review purchases' : 'Saved review'}</h3><div class="fields two"><label>Retailer<input autocomplete="off" id="receipt-supplier" value="${esc(r.supplier)}" ${editable ? '' : 'disabled'}></label><label>Purchase date<input id="receipt-date" type="date" max="${today()}" value="${esc(r.date)}" ${editable ? '' : 'disabled'}><span id="receipt-date-help" class="small">${!r.date ? 'No purchase date saved. Enter the date on the receipt.' : r.dateFromReceipt ? 'Read from the receipt—check against the original.' : 'Saved purchase date'}</span></label></div><div id="receipt-readiness" aria-live="polite"></div><div id="purchases">${receiptPurchases(r)}</div>${editable ? '<div class="actions spacer"><button id="add-purchase">Add purchase</button><button id="suggest-lines">Find candidate lines</button></div><p class="small">Confirm the paid amount after discounts and the total package quantity. Exclude personal items and refunds. Text recognition can make mistakes.</p><div class="actions"><button id="approve-receipt" class="primary">Approve price updates</button><button id="archive-receipt">Archive without updates</button></div>' : '<p class="small spacer">Original receipt and purchase details retained. Older purchases are recorded in history without replacing newer prices.</p>'}${receiptSummary(r)}${(r.notUpdated || []).map(x => `<p class="note">${esc(x.message)}</p>`).join('')}</div></div>`;
  action('#open-original', () => native('openReceipt', {
    file: r.file
  }));
  if (editable) {
    $('#receipt-supplier').onchange = async e => {
      const receipt = state.receipts.find(x => x.id === r.id);
      const changed = M.retailerKey(receipt.supplier) !== M.retailerKey(e.target.value);
      receipt.supplier = e.target.value;
      if (changed) for (const line of receipt.lines) {
        if (!line.reviewMode || line.priceChangeConfirmed || line.excluded) continue;
        if (line.quantitySource === 'Saved pack size') { line.packSize = null; line.size = null; line.unit = ''; line.quantitySource = ''; }
        M.suggestReceiptLine(state,receipt.supplier,line);
      }
      try {
        await save('Saved', changed);
        updateReceiptReadiness(state.receipts.find(x => x.id === r.id));
      } catch {}
    };
    $('#receipt-date').onchange = async e => {
      state.receipts.find(x => x.id === r.id).date = e.target.value;
      state.receipts.find(x => x.id === r.id).dateFromReceipt = false;
      try {
        await save('Saved', false);
        updateReceiptReadiness(state.receipts.find(x => x.id === r.id));
      } catch {}
    };
    updateReceiptReadiness(r);
    action('#add-purchase', () => editPurchase(r));
    action('#suggest-lines', () => suggestPurchases(r));
    $$('[data-edit-purchase]').forEach(b => b.onclick = () => editPurchase(r, Number(b.dataset.editPurchase)));
    $$('[data-confirm-purchase]').forEach(b => b.onclick = async () => {
      const l = state.receipts.find(x=>x.id===r.id).lines[Number(b.dataset.confirmPurchase)];
      l.needsReview = false; l.priceChangeConfirmed = true;
      try { await save('Purchase checked.'); } catch {}
    });
    action('#approve-receipt', async () => {
      await saveTail;
      const current = state.receipts.find(x => x.id === r.id);
      const missing = M.receiptIssues(state, current);
      if (missing.length) {
        updateReceiptReadiness(current);
        $('#receipt-readiness').scrollIntoView({block:'nearest'});
        $('#receipt-readiness button')?.focus();
        return;
      }
      const approvalSnapshot=JSON.stringify(state);
      modal('Review price updates', receiptPreviewHTML(current), async () => {
        if(JSON.stringify(state)!==approvalSnapshot) throw Error('Records changed. Close this preview and review the price updates again.');
        const candidate = clone(state),
          receipt = candidate.receipts.find(x => x.id === r.id);
        const count = M.approveReceipt(candidate, receipt);
        state = candidate;
        await save(receipt.approvalSummary.updated + ' ingredient prices updated; ' + receipt.approvalSummary.historyOnly + ' older purchases saved to history; '+receipt.approvalSummary.excluded+' excluded.');
      }, 'Approve');
    });
    action('#archive-receipt', () => modal('Archive without price updates?', '<p>The original receipt will remain searchable. No ingredient prices will change.</p>', async () => {
      state.receipts.find(x => x.id === r.id).status = 'Archived';
      await save('Receipt archived.');
    }, 'Archive'));
  }
  $$('[data-view-ingredient]').forEach(b => b.onclick = () => openIngredientRecord(b.dataset.viewIngredient));
  try {
    const image = await native('previewReceipt', {
      file: r.file
    });
    if (currentTab === 'receipts' && selectedReceipt === r.id && $('#receipt-image')) $('#receipt-image').innerHTML = `<img class="receipt-image" src="${image}" alt="Original receipt from ${esc(r.supplier || r.originalName)}">`;
  } catch (e) {
    if (currentTab === 'receipts' && selectedReceipt === r.id && $('#receipt-image')) $('#receipt-image').textContent = e.message;
  }
}
function updateReceiptReadiness(r) {
  const issues = M.receiptIssues(state, r), box = $('#receipt-readiness');
  if (!box) return;
  const choice = $$('[data-receipt]').find(x => x.dataset.receipt === r.id);
  if (choice) {
    choice.querySelector('strong').textContent = r.supplier || 'Retailer not set';
    choice.querySelector('span').textContent = r.date || 'Confirm date';
  }
  $('#receipt-detail h2').textContent = r.supplier || 'New receipt';
  $('#receipt-date-help').textContent = !r.date ? 'No purchase date saved. Enter the date on the receipt.' : r.dateFromReceipt ? 'Read from the receipt—check against the original.' : 'Saved purchase date';
  box.innerHTML = issues.length ? `<div class="note"><strong>Before updating Ingredients</strong><ul>${issues.map((x,n) => `<li><button class="receipt-fix" data-fix-receipt="${n}">${esc(x.message)}</button></li>`).join('')}</ul></div>` : '<p class="small">Ready to approve. Check the original and confirm the update below.</p>';
  const updates=M.receiptRefresh(state,r);
  if (updates.length) {
    box.insertAdjacentHTML('afterbegin',`<p><button id="refresh-receipt">Review updated suggestions (${updates.length})</button></p>`);
    $('#refresh-receipt').onclick=()=>reviewReceiptRefresh(r);
  }
  $('#approve-receipt').textContent = issues.length ? 'Review missing details' : 'Approve price updates';
  $$('[data-fix-receipt]').forEach(button => button.onclick = () => {
    const issue = issues[Number(button.dataset.fixReceipt)];
    if (issue.field === 'date' || issue.field === 'supplier') $('#receipt-' + issue.field).focus();
    else editPurchase(state.receipts.find(x => x.id === r.id), issue.field === 'line' ? issue.index : null);
  });
}
function reviewReceiptRefresh(r) {
  const proposals=M.receiptRefresh(state,r);
  const summary=l=>`${state.ingredients.find(i=>i.id===l.ingredientId)?.name || l.description} · ${l.size ?? 'Quantity missing'} ${l.size ? l.unit : ''}${l.parseNote ? ' · '+l.parseNote : ''}`;
  modal('Review updated suggestions',`<p>Select the changes to apply. Paid totals and confirmed purchases are retained. These remain drafts for review.</p>${proposals.map(p=>`<div class="purchase"><label class="inline"><input type="checkbox" name="refresh" value="${p.index}" checked>${esc(p.before.description)}</label><p class="small">Current: ${esc(summary(p.before))}</p><p>Suggested: ${esc(summary(p.after))}</p></div>`).join('')}`,async fd=>{
    const current=state.receipts.find(x=>x.id===r.id);
    const count=M.applyReceiptRefresh(current,proposals,fd.getAll('refresh').map(Number));
    await save(count+' receipt suggestions updated. Check the purchases before approval.');
  },'Apply selected suggestions');
}
function editPurchase(r, index = null) {
  const l=index===null ? {description:'',ingredientId:'',price:null,size:null,unit:'',excluded:false} : clone(r.lines[index]);
  const receiptSnapshot=JSON.stringify(r);
  let productAction=null,pasteApplied=null;
  l.id=l.id || M.uuid();
  if(l.bridge && !M.receiptBridge(state,r,l)) delete l.bridge;
  if(l.costing) {
    const i=state.ingredients.find(i=>i.id===l.ingredientId),conversion=M.factor(l.costing.unit,i?.unit);
    if(!M.costingApplies(r.supplier,l) || conversion===null) delete l.costing;
    else {l.costing.packSize*=conversion;l.costing.unit=i.unit;}
  }
  const newId=M.uuid();
  const body=[
    l.parseNote && l.needsReview ? '<p class="small bad">'+esc(l.parseNote)+'</p>' : '',
    field('Receipt description','description',l.description),
    l.originalDescription && l.originalDescription!==l.description ? '<p class="small">Original: '+esc(l.originalDescription)+'</p>' : '',
    '<div class="fields two">'+field('Product code (optional)','productCode',l.productCode || '')+'<label>Ingredient / packaging<select name="ingredientId">'+ingredientOptions(null,l.ingredientId)+'<option value="__new__">Add new ingredient…</option></select></label></div>',
    '<div id="match-hints" class="small"></div>',
    '<div id="remembered-product" class="spacer"></div>',
    '<details class="spacer"><summary>Paste product details</summary><p class="small">Read a package description copied from its label or a retailer page. Confirm it belongs to this receipt product.</p><label>Product details<textarea name="productNotes" maxlength="10000" rows="3">'+esc(l.productNotes || l.productDetails || '')+'</textarea></label><button type="button" id="parse-product">Read package details</button><div id="paste-preview" role="status"></div></details>',
    '<div id="new-purchase-ingredient" hidden><div class="fields two">'+field('New ingredient name','newName','')+field('Unit used in recipes','newUnit',l.unit || 'g')+'</div><p class="small">The new ingredient starts without a price. Approving this receipt supplies its first purchase cost.</p></div>',
    '<div id="master-pack-reference" class="small spacer"></div>',
    '<div class="fields three">'+field('Paid total ($)','price',l.price ?? '','number','min="0" step=".01"')+field('Size of one pack','packSize',l.packSize ?? '','number','min="0.000001" step="any"')+field('Number of packs','packageCount',l.packageCount ?? '','number','min="1" step="1"')+'</div>',
    '<div class="fields two">'+field('Total quantity purchased','size',l.size ?? '','number','min="0.000001" step="any"')+field('Purchase unit','unit',l.unit)+'</div>',
    '<p class="small" id="pack-calculation">Enter pack size and count, or the total quantity. Confirm the quantity against the package.</p>',
    '<div id="unit-bridge" class="note" hidden><strong>Convert purchase units</strong><div id="density-bridge" hidden>'+field('Density (g/ml)','receiptDensity',l.bridge?.kind==='density' ? l.bridge.value : state.ingredients.find(i=>i.id===l.ingredientId)?.density ?? '','number','min="0.000001" step="any"')+'<p class="small" id="density-suggestion"></p><label class="inline"><input type="checkbox" name="densityConfirmed" '+(l.bridge?.kind==='density' ? 'checked' : '')+'>I accept this density for this ingredient.</label><p class="small">Density is approximate and varies by product. It stays editable; changing it does not rewrite earlier purchases.</p></div><div id="weight-bridge" hidden><p id="weight-help" class="small"></p>'+field('Measured total weight of the items bought (g)','measuredTotalWeight',l.bridge?.kind==='avgUnitWeight' ? l.bridge.totalWeight : '','number','min="0.000001" step="any"')+'<div id="measured-count" hidden>'+field('Number of items actually bought','measuredItemCount',l.bridge?.kind==='avgUnitWeight' ? l.bridge.measuredCount : '','number','min="1" step="1"')+'</div><label class="inline"><input type="checkbox" name="weightConfirmed" '+(l.bridge?.kind==='avgUnitWeight' ? 'checked' : '')+'>I measured this total weight for these items.</label><p class="small">Use the ingredient amount used in your recipes. No average item weight is supplied automatically.</p></div><p id="bridge-result" class="small" role="status"></p></div>',
    '<div id="recipe-quantity" hidden class="note"><strong>Quantity for recipes</strong><p id="recipe-quantity-help" class="small"></p><label><span id="recipe-pack-label">Usable quantity in one purchased pack</span><input name="costingPack" type="number" min="0.000001" step="any" value="'+(l.costing?.packSize ?? '')+'"></label><label class="inline"><input type="checkbox" name="costingConfirmed" '+(l.costing?.confirmed ? 'checked' : '')+'>I confirmed this quantity from the package or a measured usable amount.</label><p class="small" id="recipe-quantity-total"></p></div>',
    '<label class="inline"><input name="excluded" type="checkbox" '+(l.excluded ? 'checked' : '')+'>Exclude this purchase from Ingredients</label><label class="inline spacer"><input name="freeConfirmed" type="checkbox" '+(l.freeConfirmed ? 'checked' : '')+'>This purchase was free</label>',
    index!==null ? '<label class="inline spacer"><input type="checkbox" name="remove">Remove this purchase line</label>' : '',
    '<p class="small">The product match, pack size and any confirmed recipe quantity are remembered after approval.</p>'
  ].join('');
  modal('Receipt purchase',body,async fd=>{
    r=state.receipts.find(x=>x.id===r.id);
    if(!r) throw Error('This receipt no longer exists.');
    if(JSON.stringify(r)!==receiptSnapshot) throw Error('Receipt changed. Close this editor and reopen the purchase.');
    if(fd.get('remove')) r.lines.splice(index,1);
    else {
      for(const k of ['description','ingredientId','unit','productCode']) l[k]=String(fd.get(k)).trim();
      l.productCode=l.productCode.toUpperCase();
      l.price=num(fd.get('price'));l.size=num(fd.get('size'));l.packSize=num(fd.get('packSize'));l.packageCount=num(fd.get('packageCount'));
      if(l.packSize && l.packageCount) {
        const total=l.packSize*l.packageCount;
        if(l.size!==null && Math.abs(total-l.size)>.000001) throw Error('Pack size × number of packs must equal the total quantity.');
        l.size=total;
      } else if(M.positive(l.size)&&M.positive(l.packageCount)) l.packSize=l.size/l.packageCount;
      l.excluded=!!fd.get('excluded');l.freeConfirmed=!!fd.get('freeConfirmed');
      l.productNotes=String(fd.get('productNotes') || '').trim();
      if(pasteApplied && (l.productNotes!==pasteApplied.text || l.packSize!==pasteApplied.packSize || l.unit!==pasteApplied.unit || l.productCode!==pasteApplied.code || l.ingredientId!==pasteApplied.ingredientId)) pasteApplied=null;
      if(pasteApplied) {l.productDetails=pasteApplied.text;l.quantitySource='Pasted package, confirmed';}
      else if(l.productDetails && (l.packSize!==r.lines[index]?.packSize || l.unit!==r.lines[index]?.unit || l.productCode!==r.lines[index]?.productCode)) {delete l.productDetails;l.quantitySource='Entered package';}
      let newItem=null;
      if(l.ingredientId==='__new__') {
        l.ingredientId='';
        if(!l.excluded) {
          const name=String(fd.get('newName')).trim(),unit=String(fd.get('newUnit')).trim();
          if(!name || !unit) throw Error('Enter a name and recipe unit for the new ingredient.');
          if(state.ingredients.some(i=>M.normalized(i.name)===M.normalized(name))) throw Error('An ingredient with that name already exists. Select it from the list.');
          newItem={id:newId,name,unit,kind:'ingredient',supplier:r.supplier,price:null,size:null,updated:'',history:[],notes:'',freeConfirmed:false};
          l.ingredientId=newId;
        }
      }
      const i=newItem || state.ingredients.find(i=>i.id===l.ingredientId);
      delete l.costing;
      delete l.bridge;
      if(!l.excluded && i && l.unit && M.factor(l.unit,i.unit)===null) {
        const kind=M.bridgeKind(l.unit,i.unit),density=num(fd.get('receiptDensity')),weight=num(fd.get('measuredTotalWeight'));
        if(kind==='density' && density!==null && (fd.get('densityConfirmed') || density!==i.density)) {
          if(!fd.get('densityConfirmed')) throw Error('Confirm the density before using it.');
          l.bridge=M.confirmReceiptBridge(i,r,l,kind,density);
        } else if(kind==='avgUnitWeight' && weight!==null) {
          if(!fd.get('weightConfirmed')) throw Error('Confirm the measured total weight of this purchase.');
          l.bridge=M.confirmReceiptBridge(i,r,l,kind,weight,num(fd.get('measuredItemCount')));
        }
        const pack=num(fd.get('costingPack'));
        if(!l.bridge && pack!==null) {
          if(!M.positive(pack)||!fd.get('costingConfirmed')) throw Error('Confirm the usable quantity for recipes in one purchased pack.');
          if(!M.positive(l.packSize)||!Number.isInteger(l.packageCount)||l.packageCount<1) throw Error('Enter the purchase pack size and number of packs first.');
          l.costing={ingredientId:i.id,retailer:M.retailerKey(r.supplier),productCode:l.productCode,purchasePackSize:l.packSize,purchaseUnit:l.unit,packSize:pack,unit:i.unit,confirmed:true};
        }
      }
      l.needsReview=false;l.priceChangeConfirmed=true;l.reviewMode=true;
      if(M.positive(l.size)&&M.positive(l.packSize)) l.quantityConflict=false;
      if(productAction) {
        if(!fd.get('confirmProductChange')) throw Error('Confirm the remembered-package change, or cancel it.');
        M.changeSavedProduct(state,productAction.id,productAction.revision,productAction.change);
      }
      if(newItem) state.ingredients.push(newItem);
      if(index===null) r.lines.push(l);else r.lines[index]=l;
    }
    await save('Receipt draft saved.');
  });
  const input=name=>$('#dialog [name='+name+']');
  const chosen=()=>input('ingredientId').value==='__new__' ? {name:input('newName').value || 'New ingredient',unit:input('newUnit').value} : state.ingredients.find(i=>i.id===input('ingredientId').value);
  let bridgeContext=null;
  const updateBridge=()=>{
    const i=chosen(),unit=input('unit').value.trim(),kind=i ? M.bridgeKind(unit,i.unit) : '',code=input('productCode').value.trim().toUpperCase();
    const key=(i?.id || input('ingredientId').value)+'|'+code+'|'+kind+'|'+unit;
    if(bridgeContext!==null && bridgeContext!==key) {
      input('receiptDensity').value=i?.density ?? '';input('densityConfirmed').checked=false;
      input('measuredTotalWeight').value='';input('measuredItemCount').value='';input('weightConfirmed').checked=false;
    }
    bridgeContext=key;
    $('#unit-bridge').hidden=!kind || input('excluded').checked;
    $('#density-bridge').hidden=kind!=='density';$('#weight-bridge').hidden=kind!=='avgUnitWeight';
    if(!kind || input('excluded').checked) return;
    const line={...l,bridge:undefined,ingredientId:i.id,productCode:code,unit,size:num(input('size').value),packSize:num(input('packSize').value),packageCount:num(input('packageCount').value)};
    let bridge=M.receiptBridge(state,r,line);
    if(kind==='density') {
      const suggested=M.suggestedDensity(i.name);
      $('#density-suggestion').innerHTML=M.positive(i.density) ? 'Saved density: '+i.density+' g/ml. Confirm any edited value.' : suggested!==null ? 'Suggested approximation: '+suggested+' g/ml. <button type="button" id="use-density-suggestion">Use suggested density</button>' : 'Enter a density appropriate to this product, or confirm a recipe quantity per pack below.';
      if($('#use-density-suggestion')) $('#use-density-suggestion').onclick=()=>{input('receiptDensity').value=suggested;input('densityConfirmed').checked=false;updateBridge();};
      if(input('densityConfirmed').checked && M.positive(num(input('receiptDensity').value))) bridge={density:num(input('receiptDensity').value)};
      else if(num(input('receiptDensity').value)!==i.density) bridge=null;
    } else {
      const reverse=M.unitCategory(unit)==='mass';$('#measured-count').hidden=!reverse;
      $('#weight-help').textContent=bridge?.avgUnitWeight ? 'Remembered measured weight: '+bridge.avgUnitWeight+' g per item for this retailer and product. Enter a new total only if you measured this purchase again.' : reverse ? 'The purchase is weighed. Enter its total weight in grams and the number of items to establish grams per item.' : 'Enter the measured total weight of all the items bought. The app will divide it by the receipt’s item count.';
      if(input('weightConfirmed').checked) {
        const count=reverse ? num(input('measuredItemCount').value) : line.size*(M.factor(unit,'each') || (unit==='pc' ? 1 : 0)),weight=num(input('measuredTotalWeight').value);
        if(M.positive(count)&&M.positive(weight)) bridge={avgUnitWeight:weight/count};
      } else if(num(input('measuredTotalWeight').value)!==null) bridge=null;
    }
    const f=M.factor(unit,i.unit,bridge),total=f===null || !M.positive(line.size) ? null : line.size*f;
    $('#bridge-result').textContent=M.positive(total) ? 'Converted purchase: '+Number(total.toFixed(6))+' '+i.unit+(bridge?.avgUnitWeight ? ' · '+Number(bridge.avgUnitWeight.toFixed(6))+' g per item' : '')+'. Applied to Ingredients only after receipt approval.' : 'This purchase needs review until a conversion or recipe quantity is confirmed.';
  };
  const recipeQuantity=()=>{
    const i=chosen(),unit=input('unit').value.trim(),show=!!i && !!unit && M.factor(unit,i.unit)===null && !input('excluded').checked;
    $('#recipe-quantity').hidden=!show;
    updateBridge();
    if(show) {
      $('#recipe-quantity-help').textContent='The receipt uses '+unit+'. Recipes use '+i.unit+'. Alternatively, confirm the usable recipe quantity in ONE purchased pack. This applies only to this product.';
      $('#recipe-pack-label').textContent='Recipe quantity in one pack ('+i.unit+')';
      const pack=num(input('costingPack').value),count=num(input('packageCount').value);
      $('#recipe-quantity-total').textContent=M.positive(pack)&&M.positive(count) ? 'For recipes: '+pack+' '+i.unit+' × '+count+' packs = '+Number((pack*count).toFixed(8))+' '+i.unit+'.' : M.bridgeKind(unit,i.unit) ? 'Leave this blank when using the conversion above.' : 'Confirm the measured recipe quantity in one purchased pack.';
    }
  };
  const recalc=()=>{
    const size=num(input('packSize').value),count=num(input('packageCount').value);
    if(M.positive(size)&&M.positive(count)) {
      input('size').value=size*count;
      $('#pack-calculation').textContent=size+' × '+count+' = '+Number((size*count).toFixed(8))+' total.';
    }
    recipeQuantity();
  };
  const context=()=>{
    const isNew=input('ingredientId').value==='__new__',i=chosen();
    $('#new-purchase-ingredient').hidden=isNew ? false : true;
    $('#master-pack-reference').innerHTML=!isNew && i && M.positive(i.size) ? '<p>Previous purchase in Ingredients: '+i.size+' '+esc(i.unit)+(i.supplier ? ' · '+esc(i.supplier) : '')+'. Use this only if it represents one pack of this product.</p>'+(!input('unit').value || M.factor(i.unit,input('unit').value)!==null ? '<button type="button" id="use-master-pack">Use this quantity for one pack</button>' : '') : '';
    if($('#use-master-pack')) $('#use-master-pack').onclick=()=>{
      if(!input('unit').value) input('unit').value=i.unit;
      input('packSize').value=Number((i.size*M.factor(i.unit,input('unit').value)).toFixed(8));
      if(!input('packageCount').value) input('packageCount').value='1';
      recalc();
    };
    recipeQuantity();
  };
  input('packSize').oninput=()=>{input('costingConfirmed').checked=false;input('weightConfirmed').checked=false;recalc();};
  input('packageCount').oninput=()=>{input('weightConfirmed').checked=false;recalc();};
  input('size').oninput=()=>{input('weightConfirmed').checked=false;recipeQuantity();};
  input('unit').oninput=()=>{input('costingConfirmed').checked=false;context();};
  input('costingPack').oninput=()=>{input('costingConfirmed').checked=false;recipeQuantity();};
  input('excluded').onchange=recipeQuantity;
  input('newUnit').oninput=context;
  input('receiptDensity').oninput=()=>{input('densityConfirmed').checked=false;updateBridge();};
  input('densityConfirmed').onchange=updateBridge;
  for(const name of ['measuredTotalWeight','measuredItemCount']) input(name).oninput=()=>{input('weightConfirmed').checked=false;updateBridge();};
  input('weightConfirmed').onchange=updateBridge;
  input('ingredientId').onchange=()=>{
    input('costingPack').value='';input('costingConfirmed').checked=false;
    const i=chosen();if(i&&!input('unit').value) input('unit').value=i.unit;
    context();
  };
  const showMatches=()=>{
    const match=M.matchIngredient(state,r.supplier,input('description').value,input('productCode').value.toUpperCase());
    const ids=[...new Set([match.ingredientId,...match.candidates.map(x=>x.ingredientId)].filter(Boolean))];
    $('#match-hints').innerHTML=ids.length ? esc(match.reason)+': '+ids.map(id=>'<button type="button" class="receipt-fix" data-match="'+esc(id)+'">'+esc(state.ingredients.find(i=>i.id===id)?.name)+'</button>').join(' · ') : 'Choose an existing ingredient, add a new one, or exclude this purchase.';
    $$('[data-match]').forEach(b=>b.onclick=()=>{input('ingredientId').value=b.dataset.match;input('ingredientId').dispatchEvent(new Event('change'));});
    showRemembered(match.saved);
  };
  const showRemembered=saved=>{
    productAction=null;
    const area=$('#remembered-product');
    if(!saved) {area.innerHTML='';return;}
    const provenance=saved.provenance || {};
    area.innerHTML='<details><summary>Remembered product details</summary><p>'+esc(provenance.source || 'Earlier saved match')+(provenance.date ? ' · '+esc(provenance.date) : ' · confirmation date unknown')+'</p>'+
      (saved.requiresConfirmation ? '<p class="small">This saved package needs confirmation because its product or package details are uncertain. It will not fill future quantities until confirmed.</p>' : '')+
      (provenance.confirmedAt ? '<p class="small">Confirmed '+esc(new Date(provenance.confirmedAt).toLocaleString())+'</p>' : '')+
      (provenance.receiptId ? '<p class="small">Source receipt: '+esc(state.receipts.find(x=>x.id===provenance.receiptId)?.originalName || provenance.receiptId)+'</p>' : '')+
      (provenance.text ? '<p class="small">'+esc(provenance.text)+'</p>' : '')+
      '<p>Package: '+(saved.packSize ? saved.packSize+' '+esc(saved.unit) : 'Not confirmed')+'</p>'+
      (saved.costing ? '<p>For recipes: '+saved.costing.packSize+' '+esc(saved.costing.unit)+' per pack, confirmed</p>' : '')+
      '<div class="fields two">'+field('Remembered pack size','rememberedPack',saved.packSize || '','number','min="0.000001" step="any"')+field('Remembered purchase unit','rememberedUnit',saved.unit)+'</div>'+
      '<div class="actions"><button type="button" id="review-remembered">Review saved change</button><button type="button" id="forget-product">Forget this match</button></div><div id="remembered-preview" role="status"></div><p class="small">Saved changes affect future suggestions. Current prices and this purchase stay unchanged. Correcting or forgetting a package clears its remembered recipe conversion. Save this purchase to apply; Cancel discards these changes. Settings → Undo can reverse a saved change.</p></details>';
    const stage=forget=>{
      const change=forget ? {forget:true} : {packSize:num(input('rememberedPack').value),unit:input('rememberedUnit').value.trim()};
      productAction={id:saved.id,revision:saved.revision,change};
      $('#remembered-preview').innerHTML='<p>'+(forget ? 'Stop reusing this product match and its package?' : 'Remembered package: '+esc(saved.packSize || 'unknown')+' '+esc(saved.unit)+' → '+esc(change.packSize)+' '+esc(change.unit))+'</p><label class="inline"><input type="checkbox" name="confirmProductChange">Confirm this change when saving</label><button type="button" id="cancel-product-change">Cancel saved change</button>';
      $('#cancel-product-change').onclick=()=>{productAction=null;$('#remembered-preview').innerHTML='';};
    };
    $('#review-remembered').onclick=()=>stage(false);$('#forget-product').onclick=()=>stage(true);
    for(const name of ['rememberedPack','rememberedUnit']) input(name).oninput=()=>{productAction=null;$('#remembered-preview').innerHTML='';};
  };
  $('#parse-product').onclick=()=>{
    const result=M.parseProductDescription(input('productNotes').value),area=$('#paste-preview');
    if(!result.ok) {area.textContent=result.message;return;}
    const code=input('productCode').value.trim().toUpperCase(),ingredientId=input('ingredientId').value;
    area.innerHTML='<p>One purchased package: '+(result.innerCount!==1 ? result.size+' '+esc(result.unit)+' × '+result.innerCount+' inside the package = ' : '')+'<strong>'+result.packSize+' '+esc(result.unit)+'</strong>.</p>'+(result.dimension==='volume' ? '<p class="small">US volume measures. No weight conversion is assumed.</p>' : '')+'<p class="small">Current pack: '+esc(input('packSize').value || 'unknown')+' '+esc(input('unit').value)+'. The receipt’s number of purchased packages stays unchanged.</p><label class="inline"><input type="checkbox" id="confirm-paste">I checked that this product and package match the receipt.</label><button type="button" id="apply-paste">Apply to this draft</button>';
    $('#apply-paste').onclick=()=>{
      if(!$('#confirm-paste').checked) {notice('Confirm the product and package before applying.',true);return;}
      if(input('productNotes').value.trim()!==result.text || input('productCode').value.trim().toUpperCase()!==code || input('ingredientId').value!==ingredientId) {area.textContent='Details changed. Read the package details again.';return;}
      input('packSize').value=result.packSize;input('unit').value=result.unit;
      if(!input('packageCount').value) input('packageCount').value='1';
      input('costingPack').value='';input('costingConfirmed').checked=false;
      pasteApplied={...result,code,ingredientId};recalc();context();
      area.textContent='Applied to this draft. Save the purchase, then approve the receipt to update Ingredients.';
    };
  };
  input('description').oninput=showMatches;
  input('productCode').oninput=()=>{input('costingConfirmed').checked=false;showMatches();updateBridge();};
  showMatches();context();
}
function suggestPurchases(r) {
  const proposals = M.receiptReconciliation(state, r),before=JSON.stringify(r);
  if (!proposals.length) {
    notice('No additional item-and-price lines found. Existing purchases are already included; add any missing item from the original receipt.');
    return;
  }
  modal('Review candidate lines', `<p>Check whether each recognized purchase is new or already included. Linking keeps your entered amounts; different totals need review.</p>${proposals.map(({candidate:l,possible},n)=>`<label>${esc(l.description)} · ${money(l.price)} · ${l.packageCount} pack(s)<select name="reconcile-${n}">${possible.length ? '<option value="">Choose new or already included…</option>' : ''}<option value="add">Add as a new purchase</option>${r.lines.map((old,i)=>`<option value="${i}">Already included: ${i+1}. ${esc(old.description)} · ${money(old.price)}</option>`).join('')}</select></label>`).join('')}`, async fd => {
    r = state.receipts.find(x => x.id === r.id);
    M.applyReconciliation(r,proposals,proposals.map((_,n)=>String(fd.get('reconcile-'+n))),before);
    await save('Candidate lines added. Confirm matches, quantities and prices.');
  }, 'Add draft lines');
}
function settingsPage() {
  $('#main').innerHTML = `<h1>Settings</h1><p class="sub">Shared costing defaults and your local records.</p><div class="two"><div class="pane"><h3>Pricing and cost alerts</h3><form id="settings-form"><div class="fields two">${field('Labour rate ($ / hour)', 'laborRate', state.settings.laborRate, 'number', 'min="0" step=".01" required')}${field('Retail markup (%)', 'retailMarkup', state.settings.retailMarkup ?? '', 'number', 'min="0" step="any"')}${field('Bulk markup (%)', 'bulkMarkup', state.settings.bulkMarkup ?? '', 'number', 'min="0" step="any"')}${field('Cost increase alert (%)', 'alertPercent', state.settings.alertPercent, 'number', 'min="0" step="any" required')}${field('Review purchase prices after (days)', 'staleDays', state.settings.staleDays, 'number', 'min="1" step="1" required')}</div><p class="small">Markup is added to cost: $10 cost + 50% markup = $15 selling price. Margin at $15 is 33.3%.</p><button class="primary">Save settings</button></form></div><div class="pane"><h3>Receipt folder</h3><p class="small">Choose the “All new receipts” folder used by the iPhone shortcut. While the app is open, new receipts are detected every 15 seconds and when you return to the app. Arriving iCloud files are retried after download. Prices still require your approval.</p><p id="inbox-path" class="ocr">${esc(inbox || 'No folder selected')}</p><div class="pickup-status small" data-pickup-status></div><button id="choose-inbox">Choose folder</button><h3 class="settings-section">Backups and undo</h3><div class="actions"><button id="backup">Save full backup</button><button id="restore">Restore backup</button><button id="undo">Undo last saved change</button></div><p class="small spacer">A full backup includes your records and original receipts. Save a copy to iCloud Drive or another safe location. The live database stays on this Mac. Up to 30 saved changes can be undone.</p><button id="show-folder">Show local data folder</button></div></div><div class="pane"><h3>Excel import and export</h3><p>Export an editable workbook with formulas, ingredients, recipes, packaging, labour, pricing settings and your price list. Import supports this app’s Excel template only. Export a workbook first, edit its Ingredients, Recipes and Lines sheets, then import it to review changes. Separate recipe-sheet layouts are not supported.</p><div class="actions"><button id="export-all">Export all to Excel</button><button id="import-excel">Review Excel import</button></div></div><div class="pane"><h3>About this app</h3><p id="app-version">${appVersion ? `Version ${esc(appVersion.version)} · Build ${esc(appVersion.build)}` : 'Version unavailable'}</p><p class="small">Local Mac app · no paid server or AI account · receipt recognition runs on this Mac. Square sales, business-profitability reports and seasonal forecasting are not included in this version. Costing labour is an allowance for pricing, not a business-profit calculation.</p></div>`;
  renderPickupStatus();
  if (settingsDraft) for (const [name, value] of Object.entries(settingsDraft)) $('#settings-form [name="' + name + '"]').value = value;
  $('#settings-form').oninput = () => { settingsDraft = Object.fromEntries(new FormData($('#settings-form'))); };
  $('#settings-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['laborRate', 'retailMarkup', 'bulkMarkup', 'alertPercent', 'staleDays']) state.settings[key] = num(fd.get(key));
    try {
      const draft = settingsDraft;
      settingsDraft = null;
      try { await save('Settings saved. Suggested prices recalculated.'); }
      catch (error) { settingsDraft = draft; if (currentTab === 'settings') settingsPage(); throw error; }
    } catch {}
  };
  action('#choose-inbox', async () => {
    const path = await native('chooseInbox');
    if (path) {
      inbox = path;
      pickupStatus = null;
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
    settingsDraft = null;
    state = M.normalizeState(restored);
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
      state = M.normalizeState(await native('restoreBackup'));
      settingsDraft = null;
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
    if (!Array.isArray(tables[name]) || required.some((h, i) => tables[name][0]?.[i] !== h)) throw Error('Unsupported Excel layout: the ' + name + ' sheet headers do not match the app’s template. Export a fresh template from Settings → Excel import and export. No records were changed.');
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
      settingsDraft = null;
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
$('#nav-toggle').onclick = () => {
  const collapsed = document.body.classList.toggle('nav-collapsed');
  $('#nav-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#nav-toggle').textContent = collapsed ? 'Show navigation' : 'Hide navigation';
};
document.addEventListener('input', e => {
  if (e.target.closest('#main .filters, .recipe-picker')) rememberView();
});
document.addEventListener('change', e => {
  if (e.target.closest('#main .filters, .recipe-picker')) rememberView();
});
$('.workspace').addEventListener('scroll', () => { (viewState[currentTab] ||= {fields:{}}).top = $('.workspace').scrollTop; }, {passive:true});
document.addEventListener('scroll', e => {
  if (e.target.matches?.('#main .scroll')) (viewState[currentTab] ||= {fields:{}}).scrolls = $$('#main .scroll').map(el => [el.scrollLeft, el.scrollTop]);
}, {capture:true, passive:true});
let modalFocus = null;
document.addEventListener('click', e => { if (!$('#dialog').open) modalFocus = e.target.closest('button'); }, true);
$('#dialog').addEventListener('close', () => {
  if (modalFocus?.isConnected) modalFocus.focus();
  else $('[data-tab="' + currentTab + '"]').focus();
});
(async () => {
  try {
    const result = await native('load');
    seed = result.seed;
    inbox = result.inbox;
    appVersion = result.appVersion || null;
    pickupStatus = result.inboxStatus || null;
    let migrated = false;
    if (result.state) {
      const vanilla = result.state.ingredients?.find(i => i.name === 'Vanilla Paste' && i.updated === '2029-08-31');
      if (vanilla) {
        vanilla.updated = '2019-08-31';
        migrated = true;
      }
    }
    state = result.state ? M.normalizeState(result.state) : M.empty();
    lastSaved = result.state ? clone(state) : null;
    let prepared = 0;
    for (const r of state.receipts) if (M.prepareReceipt(state, r)) prepared++;
    $('#save-status').textContent = 'Stored on this Mac';
    if (prepared) { await save('Receipt drafts prepared from recognized text. Review the suggested details.'); migrated = false; }
    if (migrated) await save('Corrected the known Vanilla Paste purchase date typo.');else render();
    startInboxChecks();
  } catch (e) {
    $('#main').innerHTML = `<div class="note bad">${esc(e.message)}</div>`;
    $('#save-status').textContent = 'Could not open records';
  }
})();
