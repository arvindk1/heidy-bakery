"use strict";

(function (global) {
  'use strict';

  const uuid = () => global.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const empty = () => ({
    version: 1,
    ingredients: [],
    recipes: [],
    receipts: [],
    mappings: {},
    settings: {
      laborRate: 24,
      retailMarkup: null,
      bulkMarkup: null,
      alertPercent: 10,
      staleDays: 365
    },
    imported: false
  });
  const finite = n => typeof n === 'number' && Number.isFinite(n),
    positive = n => finite(n) && n > 0,
    nonnegative = n => finite(n) && n >= 0;
  const units = {
    mg: ['mass', .001],
    g: ['mass', 1],
    kg: ['mass', 1000],
    oz: ['mass', 28.349523125],
    lb: ['mass', 453.59237],
    ml: ['volume', 1],
    l: ['volume', 1000],
    tsp: ['volume', 4.92892159375],
    tbsp: ['volume', 14.78676478125],
    'fl oz': ['volume', 29.5735295625],
    cup: ['volume', 236.5882365],
    pt: ['volume', 473.176473],
    qt: ['volume', 946.352946],
    gal: ['volume', 3785.411784],
    each: ['count', 1],
    piece: ['count', 1],
    dozen: ['count', 12]
  };
  const laborEfforts = {
    easy: 1,
    Low: 2,
    Medium: 3,
    High: 4,
    Extreme: 5
  };
  function normalized(s) {
    return String(s || '').trim().toLowerCase().replace(/^wt oz$/, 'oz');
  }
  function factor(from, to) {
    from = normalized(from);
    to = normalized(to);
    if (!from || !to) return null;
    if (from === to) return 1;
    const a = units[from],
      b = units[to];
    return a && b && a[0] === b[0] ? a[1] / b[1] : null;
  }
  function unitCost(i) {
    const n = i && nonnegative(i.price) && positive(i.size) && i.unit?.trim() ? i.price / i.size : null;
    return finite(n) ? n : null;
  }
  function localDate(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function validDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const date = new Date(iso + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso;
  }
  function ageInDays(iso, now) {
    if (!validDate(iso)) return null;
    return Math.floor((Date.parse(localDate(now) + 'T12:00:00Z') - Date.parse(iso + 'T12:00:00Z')) / 86400000);
  }
  function ageLabel(days) {
    if (days >= 730) return Math.floor(days / 365) + ' yrs ago';
    if (days >= 365) return '1 yr ago';
    if (days >= 60) return Math.floor(days / 30) + ' mos ago';
    return days === 1 ? '1 day ago' : days + ' days ago';
  }
  function calculate(state, r, now = new Date()) {
    let ing = 0,
      pack = 0;
    const errors = [],
      warnings = [],
      warningDetails = [],
      details = [],
      index = new Map(state.ingredients.map(i => [i.id, i]));
    if (!positive(r.yield)) errors.push('Enter a positive batch yield');
    for (const l of r.lines) {
      const i = index.get(l.ingredientId),
        u = unitCost(i),
        f = factor(l.unit, i?.unit),
        q = l.quantity * (l.perPiece ? r.yield : 1);
      let cost = null,
        issue = '';
      if (!i) issue = 'Select an ingredient';else if (u === null) issue = 'Missing purchase price, size or unit';else if (f === null) issue = 'Units do not match';else if (!nonnegative(l.quantity)) issue = 'Enter a valid quantity';else {
        cost = q * f * u;
        if (!finite(cost)) {
          cost = null;
          issue = 'Calculated cost is too large';
        }
      }
      if (issue) errors.push((i?.name || 'Unnamed item') + ': ' + issue);
      const warn = (type, message, short) => {
        warnings.push(message);
        warningDetails.push({
          type,
          ingredientId: i.id,
          item: i.name,
          message,
          short
        });
      };
      if (i?.price === 0 && !i.freeConfirmed) warn('zero', i.name + ': confirm this item was free', i.name + ' price is $0');
      if (i?.updated > localDate(now)) warn('future', i.name + ': purchase price has a future date', i.name + ' has a future date');
      const age = ageInDays(i?.updated, now);
      if (age !== null && age > state.settings.staleDays) warn('stale', i.name + ': purchase price needs review (' + ageLabel(age) + ')', i.name + ' priced ' + ageLabel(age));
      if (i && !i.updated) warn('missingDate', i.name + ': purchase price needs review (no date)', i.name + ' has no price date');
      if (cost !== null) {
        if (i.kind === 'packaging') pack += cost;else ing += cost;
      }
      details.push({
        line: l,
        item: i,
        factor: f,
        unitCost: u,
        cost,
        issue
      });
    }
    if (!r.lines.length) errors.push('Add ingredients');
    if (!nonnegative(r.laborHours)) errors.push('Enter labour hours');
    if (!nonnegative(state.settings.laborRate)) errors.push('Enter labour rate');
    if (!nonnegative(r.otherCost)) errors.push('Enter other batch costs');
    const labor = r.laborHours * state.settings.laborRate;
    if (!finite(ing + pack + labor + r.otherCost)) errors.push('Calculated batch cost is too large');
    const total = errors.length ? null : ing + pack + labor + r.otherCost,
      unit = total === null ? null : total / r.yield,
      bulkErrors = [];
    if (r.bulkPackaging != null && !nonnegative(r.bulkPackaging)) bulkErrors.push('Invalid bulk packaging cost');
    if (r.bulkLaborHours != null && !nonnegative(r.bulkLaborHours)) bulkErrors.push('Invalid bulk labour hours');
    const bulkTotal = ing + (r.bulkPackaging == null ? pack : r.bulkPackaging * r.yield) + (r.bulkLaborHours == null ? labor : r.bulkLaborHours * state.settings.laborRate) + r.otherCost;
    if (!finite(bulkTotal)) bulkErrors.push('Calculated bulk cost is too large');
    const bulkUnit = unit === null || bulkErrors.length ? null : bulkTotal / r.yield;
    return {
      ing,
      pack,
      labor,
      total,
      unit,
      bulkUnit,
      errors: [...new Set(errors)],
      bulkErrors,
      warnings: [...new Set(warnings)],
      warningDetails: warningDetails.filter((w, n, a) => a.findIndex(x => x.type === w.type && x.ingredientId === w.ingredientId) === n),
      details,
      retailSuggested: unit !== null && nonnegative(state.settings.retailMarkup) ? unit * (1 + state.settings.retailMarkup / 100) : null,
      bulkSuggested: bulkUnit !== null && nonnegative(state.settings.bulkMarkup) ? bulkUnit * (1 + state.settings.bulkMarkup / 100) : null
    };
  }
  function margin(cost, price) {
    return cost !== null && positive(price) ? 100 * (price - cost) / price : null;
  }
  function validate(s) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const text = v => typeof v === 'string',
      named = v => text(v) && v.trim().length > 0;
    const optionalText = v => v == null || typeof v === 'string';
    const optionalNumber = v => v == null || nonnegative(v);
    const safeFile = v => named(v) && !/[\\/]/.test(v) && !v.includes('..');
    if (!object(s) || s.version !== 1 || !Array.isArray(s.ingredients) || !Array.isArray(s.recipes) || !Array.isArray(s.receipts) || !object(s.settings) || !object(s.mappings)) throw Error('This is not a supported Heidy backup.');
    for (const list of [s.ingredients, s.recipes, s.receipts]) {
      const ids = new Set();
      for (const r of list) {
        if (!object(r) || !named(r.id) || ids.has(r.id)) throw Error('Missing or duplicate record identifier.');
        ids.add(r.id);
      }
    }
    const ingredientIds = new Set(s.ingredients.map(i => i.id)),
      receiptIds = new Set(s.receipts.map(r => r.id));
    const receiptReference = v => v == null || text(v) && receiptIds.has(v);
    for (const i of s.ingredients) {
      if (!named(i.name) || !['ingredient', 'packaging'].includes(i.kind)) throw Error('Invalid ingredient record');
      for (const k of ['price', 'size']) if (i[k] !== null && !nonnegative(i[k])) throw Error('Invalid ' + k + ' for ' + i.name);
      if (!text(i.unit) || !text(i.supplier) || !text(i.updated) || i.updated && !validDate(i.updated) || !Array.isArray(i.history) || 'freeConfirmed' in i && typeof i.freeConfirmed !== 'boolean' || !receiptReference(i.receiptId)) throw Error('Invalid ingredient details for ' + i.name);
      // Historical package details may be absent. An unavailable original must not make old backups unreadable.
      for (const h of i.history) if (!object(h) || !optionalNumber(h.price) || !optionalNumber(h.size) || !optionalText(h.unit) || !optionalText(h.receiptId)) throw Error('Invalid purchase history for ' + i.name);
    }
    const lineIds = new Set();
    for (const r of s.recipes) {
      if (!named(r.name) || !positive(r.yield) || !named(r.unit) || !Array.isArray(r.lines) || !nonnegative(r.laborHours) || !nonnegative(r.otherCost)) throw Error('Invalid recipe: ' + r.name);
      if (r.laborEffort != null && r.laborEffort !== 'Custom' && !Object.prototype.hasOwnProperty.call(laborEfforts, r.laborEffort)) throw Error('Invalid labour effort for ' + r.name);
      for (const k of ['retail', 'bulk', 'bulkPackaging', 'bulkLaborHours', 'costBaseline']) if (!optionalNumber(r[k])) throw Error('Invalid recipe price or bulk setting');
      if (r.bulkMin != null && (!Number.isInteger(r.bulkMin) || r.bulkMin < 1)) throw Error('Bulk minimum must be a positive whole number.');
      for (const l of r.lines) {
        if (!object(l) || !named(l.id) || lineIds.has(l.id)) throw Error('Missing or duplicate recipe line identifier.');
        lineIds.add(l.id);
        if (!ingredientIds.has(l.ingredientId)) throw Error('Recipe ' + r.name + ' has an item that is missing from the master list.');
        if (!nonnegative(l.quantity) || !text(l.unit) || typeof l.perPiece !== 'boolean') throw Error('Invalid recipe ingredient quantity or basis');
      }
    }
    for (const r of s.receipts) {
      if (!safeFile(r.file) || !text(r.originalName) || !text(r.supplier) || !text(r.text) || !text(r.date) || r.date && !validDate(r.date) || !['Needs review', 'Reviewed', 'Archived'].includes(r.status) || !Array.isArray(r.lines) || !text(r.importedAt)) throw Error('Invalid receipt details.');
      for (const l of r.lines) if (!object(l) || !text(l.description) || !text(l.ingredientId) || l.ingredientId && !ingredientIds.has(l.ingredientId) || !optionalNumber(l.price) || !optionalNumber(l.size) || !text(l.unit) || typeof l.excluded !== 'boolean' || 'freeConfirmed' in l && typeof l.freeConfirmed !== 'boolean') throw Error('Invalid receipt purchase.');
      if (r.notUpdated != null && (!Array.isArray(r.notUpdated) || r.notUpdated.some(x => !object(x) || !text(x.message)))) throw Error('Invalid receipt review notes.');
    }
    for (const v of Object.values(s.mappings)) if (!object(v) || !ingredientIds.has(v.ingredientId) || !positive(v.size) || !named(v.unit)) throw Error('Invalid saved receipt match.');
    for (const k of ['laborRate', 'alertPercent']) if (!nonnegative(s.settings[k])) throw Error('Invalid setting: ' + k);
    if (!Number.isInteger(s.settings.staleDays) || s.settings.staleDays < 1) throw Error('Invalid setting: staleDays');
    for (const k of ['retailMarkup', 'bulkMarkup']) if (s.settings[k] !== null && !nonnegative(s.settings[k])) throw Error('Invalid markup');
    return s;
  }
  function approveReceipt(s, r, now = new Date()) {
    if (r.status !== 'Needs review') throw Error('This receipt is already reviewed or archived.');
    if (!validDate(r.date) || r.date > localDate(now)) throw Error('Confirm a valid purchase date.');
    if (!r.supplier.trim()) throw Error('Enter the retailer.');
    const selected = r.lines.filter(l => !l.excluded);
    if (!selected.length) throw Error('Add at least one purchase, or archive this receipt without a price update.');
    const changes = [],
      ids = new Set();
    for (const l of selected) {
      const i = s.ingredients.find(i => i.id === l.ingredientId);
      if (!i) throw Error('Match every included item to an ingredient.');
      if (ids.has(i.id)) throw Error('Combine repeated purchases of ' + i.name + ' before approving.');
      ids.add(i.id);
      if (!nonnegative(l.price) || !positive(l.size) || !String(l.unit || '').trim()) throw Error('Confirm purchase price, total package quantity and unit for ' + i.name + '.');
      if (l.price === 0 && !l.freeConfirmed) throw Error('Confirm a zero-cost purchase for ' + i.name + '.');
      changes.push({
        i,
        l
      });
    }
    const before = new Map(s.recipes.map(recipe => [recipe.id, calculate(s, recipe, now).unit])),
      notUpdated = [];
    for (const {
      i,
      l
    } of changes) {
      if (!i.history.some(h => h.date === i.updated && h.price === i.price && h.size === i.size && h.unit === i.unit)) i.history.push({
        date: i.updated,
        supplier: i.supplier,
        price: i.price,
        size: i.size,
        unit: i.unit,
        receiptId: i.receiptId ?? null,
        note: 'Previous master purchase'
      });
      i.history.push({
        date: r.date,
        supplier: r.supplier,
        price: l.price,
        size: l.size,
        unit: l.unit,
        receiptId: r.id,
        note: 'Receipt approved'
      });
      if (!i.updated || r.date >= i.updated) Object.assign(i, {
        price: l.price,
        size: l.size,
        unit: l.unit,
        supplier: r.supplier,
        updated: r.date,
        receiptId: r.id,
        freeConfirmed: l.price === 0 && !!l.freeConfirmed
      });else notUpdated.push({
        ingredientId: i.id,
        item: i.name,
        receiptDate: r.date,
        masterDate: i.updated,
        message: i.name + ' was recorded in history, but its master price was not changed because the master date ' + i.updated + ' is newer.'
      });
      if (l.description.trim()) s.mappings[normalized(r.supplier) + '|' + normalized(l.description)] = {
        ingredientId: i.id,
        size: l.size,
        unit: l.unit
      };
    }
    r.status = 'Reviewed';
    r.reviewedAt = now.toISOString();
    r.notUpdated = notUpdated;
    for (const recipe of s.recipes) {
      const old = before.get(recipe.id),
        next = calculate(s, recipe, now).unit;
      if (old !== null && next !== null && old > 0 && next > old) recipe.costBaseline = recipe.costBaseline ?? old;
    }
    return changes.length;
  }
  function workbook(s) {
    validate(s);
    const sheets = [],
      cell = formula => ({
        formula
      }),
      blankSafe = ref => `IF(${ref}="","",${ref})`;
    const lookup = (sheet, column, id) => `INDEX('${sheet}'!$${column}:$${column},MATCH(${id},'${sheet}'!$A:$A,0))`;
    const setting = name => lookup('Settings', 'B', `"${name}"`);
    const ingredients = [['ID', 'Name', 'Kind', 'Supplier', 'Package price', 'Package quantity', 'Unit', 'Updated date', 'Cost per unit', 'Free confirmed']];
    s.ingredients.forEach((i, n) => {
      const k = n + 2;
      ingredients.push([i.id, i.name, i.kind, i.supplier, i.price, i.size, i.unit, i.updated, cell(`IFERROR(IF(OR(COUNT(E${k}:F${k})<>2,E${k}<0,F${k}<=0,TRIM(G${k})=""),"",E${k}/F${k}),"")`), i.freeConfirmed ? 1 : 0]);
    });
    sheets.push({
      name: 'Ingredients',
      rows: ingredients
    });
    sheets.push({
      name: 'Settings',
      rows: [['Setting', 'Value'], ...['laborRate', 'retailMarkup', 'bulkMarkup', 'alertPercent', 'staleDays'].map(k => [k, s.settings[k]])]
    });
    const rr = [['ID', 'Name', 'Yield', 'Yield unit', 'Labour hours', 'Labour effort', 'Your retail', 'Your bulk', 'Bulk minimum', 'Notes', 'Category', 'Other batch cost', 'Bulk packaging per piece', 'Bulk labour hours']];
    s.recipes.forEach(r => rr.push([r.id, r.name, r.yield, r.unit, r.laborHours, r.laborEffort || 'Custom', r.retail, r.bulk, r.bulkMin, r.notes, r.category, r.otherCost, r.bulkPackaging, r.bulkLaborHours]));
    sheets.push({
      name: 'Recipes',
      rows: rr
    });
    const rows = [['Line ID', 'Recipe ID', 'Ingredient ID', 'Quantity', 'Unit', 'Per piece', 'Conversion factor', 'Ingredient name', 'Kind', 'Cost per source unit', 'Batch quantity', 'Batch cost']];
    for (const r of s.recipes) for (const l of r.lines) {
      const k = rows.length + 1,
        sourceUnit = `LOWER(TRIM(${lookup('Ingredients', 'G', `C${k}`)}))`,
        lineUnit = `LOWER(TRIM(E${k}))`;
      const group = u => lookup('Units', 'B', u),
        scale = u => lookup('Units', 'C', u),
        yieldRef = lookup('Recipes', 'C', `B${k}`);
      const conversion = `IFERROR(IF(OR(${lineUnit}="",${sourceUnit}=""),"",IF(${lineUnit}=${sourceUnit},1,IF(${group(lineUnit)}=${group(sourceUnit)},${scale(lineUnit)}/${scale(sourceUnit)},""))),"")`;
      rows.push([l.id, r.id, l.ingredientId, l.quantity, l.unit, l.perPiece ? 1 : 0, cell(conversion), cell(`IFERROR(${lookup('Ingredients', 'B', `C${k}`)},"Missing item")`), cell(`IFERROR(${lookup('Ingredients', 'C', `C${k}`)},"")`), cell(`IFERROR(${blankSafe(lookup('Ingredients', 'I', `C${k}`))},"")`), cell(`IFERROR(IF(OR(COUNT(D${k},F${k})<>2,D${k}<0,AND(F${k}<>0,F${k}<>1),COUNTIF(Recipes!A:A,B${k})<>1,NOT(ISNUMBER(${yieldRef})),${yieldRef}<=0),"",D${k}*IF(F${k}=1,${yieldRef},1)),"")`), cell(`IFERROR(IF(OR(COUNT(G${k},J${k},K${k})<>3,G${k}<=0,J${k}<0,K${k}<0,COUNTIF(Ingredients!A:A,C${k})<>1,AND(I${k}<>"ingredient",I${k}<>"packaging")),"",G${k}*J${k}*K${k}),"")`)]);
    }
    sheets.push({
      name: 'Lines',
      rows
    });
    const pricing = [['Recipe', 'Batch yield', 'Ingredients', 'Packaging', 'Labour', 'Other cost', 'Batch total', 'Cost per piece', 'Suggested retail', 'Your retail', 'Retail margin', 'Bulk cost per piece', 'Suggested bulk', 'Your bulk', 'Bulk margin']];
    s.recipes.forEach((r, n) => {
      const k = n + 2,
        id = `Recipes!A${k}`,
        rate = setting('laborRate'),
        retailMarkup = setting('retailMarkup'),
        bulkMarkup = setting('bulkMarkup');
      const missing = `OR(COUNTIF(Lines!B:B,${id})=0,COUNTIFS(Lines!B:B,${id},Lines!L:L,"")>0,COUNT(E${k}:F${k})<>2,E${k}<0,F${k}<0)`;
      const sum = kind => `SUMIFS(Lines!L:L,Lines!B:B,${id},Lines!I:I,"${kind}")`;
      const suggestion = (cost, markup) => `IFERROR(IF(OR(${cost}="",NOT(ISNUMBER(${markup})),${markup}<0),"",${cost}*(1+${markup}/100)),"")`;
      const marginFormula = (cost, price) => `IFERROR(IF(OR(${cost}="",NOT(ISNUMBER(${price})),${price}<=0),"",(${price}-${cost})/${price}),"")`;
      pricing.push([cell(`Recipes!B${k}`), cell(`Recipes!C${k}`), cell(sum('ingredient')), cell(sum('packaging')), cell(`IFERROR(IF(OR(NOT(ISNUMBER(Recipes!E${k})),Recipes!E${k}<0,NOT(ISNUMBER(${rate})),${rate}="",${rate}<0),"",Recipes!E${k}*${rate}),"")`), cell(`IF(OR(NOT(ISNUMBER(Recipes!L${k})),Recipes!L${k}<0),"",Recipes!L${k})`), cell(`IFERROR(IF(${missing},"",SUM(C${k}:F${k})),"")`), cell(`IFERROR(IF(OR(G${k}="",NOT(ISNUMBER(B${k})),B${k}<=0),"",G${k}/B${k}),"")`), cell(suggestion(`H${k}`, retailMarkup)), cell(blankSafe(`Recipes!G${k}`)), cell(marginFormula(`H${k}`, `J${k}`)), cell(`IFERROR(IF(OR(H${k}="",AND(Recipes!M${k}<>"",OR(NOT(ISNUMBER(Recipes!M${k})),Recipes!M${k}<0)),AND(Recipes!N${k}<>"",OR(NOT(ISNUMBER(Recipes!N${k})),Recipes!N${k}<0))),"",(C${k}+IF(Recipes!M${k}="",D${k},Recipes!M${k}*B${k})+IF(Recipes!N${k}="",E${k},Recipes!N${k}*${rate})+F${k})/B${k}),"")`), cell(suggestion(`L${k}`, bulkMarkup)), cell(blankSafe(`Recipes!H${k}`)), cell(marginFormula(`L${k}`, `N${k}`))]);
    });
    sheets.push({
      name: 'Price list',
      rows: pricing
    });
    sheets.push({
      name: 'Units',
      rows: [['Unit', 'Dimension', 'Scale'], ...Object.entries({
        ...units,
        'wt oz': units.oz
      }).map(([name, [dimension, scale]]) => [name, dimension, scale])]
    });
    sheets.push({
      name: 'Read me',
      rows: [['Heidy Bakery — editable Excel fallback'], ['Edit input columns in Ingredients, Recipes, Lines and Settings. Price list recalculates in Excel.'], ['All costs include every recipe line. Blank totals indicate missing or invalid costs.'], ['Line formulas follow ingredient and recipe IDs, including after input rows are reordered. Keep IDs unique.'], ['Conversion factors recalculate from the units. Do not edit the Units reference sheet. Mass and volume are never interchanged.'], ['You may replace a conversion formula with the correct numeric factor. Reimport checks numeric factors against the app’s units.'], ['Reimport reads input values. Input formulas are rejected; calculated columns are recomputed by the app.'], ['New records need unique IDs. When adding Excel rows, fill down calculated columns before using the workbook’s price list.'], ['Receipts and complete audit history are in the full app backup, not this workbook.'], ['Margin columns show percentages at the selling prices you entered.'], ['Labour hours are authoritative. Changing hours without changing effort imports as Custom.'], ['Labour effort: easy 1, Low 2, Medium 3, High 4, Extreme 5. Effort labels alone do not change Excel hours.'], ['Labour is a costing allowance, not a claim about business profit.'], ['Exported on', new Date().toISOString()]]
    });
    return {
      sheets
    };
  }
  global.HeidyModel = {
    validDate,
    ageInDays,
    empty,
    uuid,
    finite,
    positive,
    nonnegative,
    factor,
    unitCost,
    calculate,
    margin,
    validate,
    approveReceipt,
    workbook,
    normalized,
    localDate,
    laborEfforts
  };
  if (typeof module !== 'undefined') module.exports = global.HeidyModel;
})(typeof window !== 'undefined' ? window : globalThis);
