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
  function factor(from, to, bridge = null) {
    from = normalized(from);
    to = normalized(to);
    if (!from || !to) return null;
    if (from === to) return 1;
    const a = units[from],
      b = units[to];
    if(a && b && a[0] === b[0]) return a[1] / b[1];
    // Callers must opt into receipt bridges. Recipe callers keep two arguments.
    if(!bridge) return null;
    const x=a || (from==='pc' ? ['count',1] : null),y=b || (to==='pc' ? ['count',1] : null);
    if(!x || !y || x[0]===y[0] || ![x[0],y[0]].includes('mass')) return null;
    const value=[x[0],y[0]].includes('volume') ? bridge.density : bridge.avgUnitWeight;
    if(!positive(value)) return null;
    const result=x[0]==='mass' ? x[1]/(y[1]*value) : x[1]*value/y[1];
    return positive(result) ? result : null;
  }
  function unitCategory(unit) { return units[normalized(unit)]?.[0] || (normalized(unit)==='pc' ? 'count' : ''); }
  function bridgeKind(from,to) {
    const pair=[unitCategory(from),unitCategory(to)];
    return pair.includes('mass') && pair.includes('volume') ? 'density' : pair.includes('mass') && pair.includes('count') ? 'avgUnitWeight' : '';
  }
  // Approximate, opt-in suggestions. FAO/INFOODS Density Database v2 (2012).
  // https://www.fao.org/4/ap815e/ap815e.pdf — products and temperature vary.
  function suggestedDensity(name) {
    const key=normalized(name);
    if(['milk','whole milk','skim milk'].includes(key)) return 1.03;
    if(key==='water') return 1;
    if(['oil','olive oil','vegetable oil','grape seed oil'].includes(key)) return .92;
    return null;
  }
  function unitCost(i) {
    const n = i && nonnegative(i.price) && positive(i.size) && i.unit?.trim() ? i.price / i.size : null;
    return finite(n) ? n : null;
  }
  function ingredientIssues(s) {
    return s.ingredients.flatMap(i=>{
      const missing=[];
      if(!String(i.unit||'').trim()) missing.push('purchase unit');
      if(!positive(i.size)) missing.push('package quantity');
      if(/^(Unnamed item — source row|Unidentified (ingredient|packaging) —)/.test(i.name)) missing.push('ingredient identity');
      return missing.length ? [{ingredientId:i.id,name:i.name,message:'Confirm '+missing.join(', ')+'.'}] : [];
    });
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
  function marginWatch(state, now = new Date()) {
    const ingredients = [];
    for (const i of state?.ingredients || []) {
      const nowCost = unitCost(i);
      if (nowCost === null || !Array.isArray(i.history) || i.history.length < 2) continue;

      const validHistory = [];
      for (const h of i.history) {
        if (!validDate(h.date)) continue;
        const u = unitCost(h);
        if (u === null) continue;
        const f = factor(i.unit, h.unit);
        if (f === null) continue;
        validHistory.push({
          entry: h,
          cost: u * f
        });
      }
      if (validHistory.length === 0) continue;

      validHistory.sort((a, b) => a.entry.date.localeCompare(b.entry.date));

      const then = validHistory[0].cost;
      if (!positive(then)) continue;

      const deltaPercent = 100 * (nowCost / then - 1);
      const deltaDollarsPerUnit = nowCost - then;

      if (Math.abs(deltaPercent) < 1e-9) continue;

      ingredients.push({
        ingredient: i,
        then,
        now: nowCost,
        deltaPercent,
        deltaDollarsPerUnit,
        oldestDate: validHistory[0].entry.date || null
      });
    }
    ingredients.sort((a, b) => b.deltaPercent - a.deltaPercent);

    const recipes = [];
    for (const r of state?.recipes || []) {
      if (r.costBaseline == null || !positive(r.retail)) continue;
      const calc = calculate(state, r, now);
      const costNow = calc.unit;
      if (costNow === null) continue;

      const marginNow = 100 * (r.retail - costNow) / r.retail;
      const marginBaseline = 100 * (r.retail - r.costBaseline) / r.retail;
      const marginDropPoints = marginBaseline - marginNow;
      const dollarsPerPiece = costNow - r.costBaseline;

      recipes.push({
        recipe: r,
        costBaseline: r.costBaseline,
        costNow,
        retail: r.retail,
        marginBaseline,
        marginNow,
        marginDropPoints,
        dollarsPerPiece
      });
    }
    recipes.sort((a, b) => b.dollarsPerPiece - a.dollarsPerPiece);

    return {
      ingredients,
      recipes
    };
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
      for(const key of ['density','avgUnitWeight']) if(i[key]!=null && !positive(i[key])) throw Error('Invalid '+key+' for '+i.name);
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
        if(l.id!=null && !named(l.id) || l.sourceText!=null && !text(l.sourceText) || l.productDetails!=null && (!text(l.productDetails) || l.productDetails.length>10000) || l.productNotes!=null && (!text(l.productNotes) || l.productNotes.length>10000)) throw Error('Invalid purchase source details.');
        if (!object(l) || !named(l.id) || lineIds.has(l.id)) throw Error('Missing or duplicate recipe line identifier.');
        lineIds.add(l.id);
        if (!ingredientIds.has(l.ingredientId)) throw Error('Recipe ' + r.name + ' has an item that is missing from the master list.');
        if (!nonnegative(l.quantity) || !text(l.unit) || typeof l.perPiece !== 'boolean') throw Error('Invalid recipe ingredient quantity or basis');
      }
    }
    const validCosting = c => object(c) && named(c.ingredientId) && text(c.retailer) && text(c.productCode) &&
      positive(c.purchasePackSize) && named(c.purchaseUnit) && positive(c.packSize) && named(c.unit) && c.confirmed === true;
    const validBridge=b=>object(b) && ['density','avgUnitWeight'].includes(b.kind) && positive(b.value) && b.confirmed===true && named(b.ingredientId) && text(b.retailer) && text(b.productCode) && named(b.fromUnit) &&
      (b.kind==='density' || positive(b.totalWeight) && Number.isSafeInteger(b.measuredCount) && b.measuredCount>0 && Math.abs(b.value-b.totalWeight/b.measuredCount)<1e-9);
    for (const r of s.receipts) {
      if (!safeFile(r.file) || !text(r.originalName) || !text(r.supplier) || !text(r.text) || !text(r.date) || r.date && !validDate(r.date) || !['Needs review', 'Reviewed', 'Archived'].includes(r.status) || !Array.isArray(r.lines) || !text(r.importedAt)) throw Error('Invalid receipt details.');
      for (const l of r.lines) if (!object(l) || !text(l.description) || !text(l.ingredientId) || l.ingredientId && !ingredientIds.has(l.ingredientId) || !optionalNumber(l.price) || !optionalNumber(l.size) || !text(l.unit) || typeof l.excluded !== 'boolean' || 'freeConfirmed' in l && typeof l.freeConfirmed !== 'boolean') throw Error('Invalid receipt purchase.');
      for (const l of r.lines) {
        if(l.bridge!=null && !validBridge(l.bridge)) throw Error('Invalid confirmed receipt conversion.');
        if (l.costing != null && !validCosting(l.costing)) throw Error('Invalid confirmed recipe quantity.');
        if (l.packSize != null && !positive(l.packSize) || l.packageCount != null && (!Number.isInteger(l.packageCount) || l.packageCount < 1)) throw Error('Invalid receipt package size or count.');
        if (l.sourceRows != null && (!Array.isArray(l.sourceRows) || l.sourceRows.some(n=>!Number.isInteger(n) || n<0))) throw Error('Invalid receipt source rows.');
        if (l.sourceDescriptions != null && (!Array.isArray(l.sourceDescriptions) || l.sourceDescriptions.some(d=>!text(d)))) throw Error('Invalid receipt source descriptions.');
        if (l.parseNote != null && !text(l.parseNote)) throw Error('Invalid receipt review note.');
        if(l.costingNotice!=null && !text(l.costingNotice)) throw Error('Invalid receipt quantity notice.');
        if (l.productCode != null && (!text(l.productCode) || l.productCode && !/^[a-z0-9-]{1,40}$/i.test(l.productCode))) throw Error('Invalid receipt product code.');
        if (l.originalDescription != null && !text(l.originalDescription)) throw Error('Invalid original receipt description.');
        for (const key of ['needsReview','reviewMode','priceChangeConfirmed','quantityConflict']) if (key in l && typeof l[key] !== 'boolean') throw Error('Invalid receipt review flag.');
      }
      if (r.notUpdated != null && (!Array.isArray(r.notUpdated) || r.notUpdated.some(x => !object(x) || !text(x.message)))) throw Error('Invalid receipt review notes.');
      if (r.approvalSummary != null) {
        const v = r.approvalSummary;
        if (!object(v) || ['updated','historyOnly','excluded'].some(k => !Number.isInteger(v[k]) || v[k] < 0) ||
            !Array.isArray(v.ingredientIds) || v.ingredientIds.some(id => !named(id))) throw Error('Invalid receipt approval summary.');
      }
    }
    if(s.maintenanceNotices!=null && (!Array.isArray(s.maintenanceNotices) || s.maintenanceNotices.some(n=>!text(n)))) throw Error('Invalid library maintenance notices.');
    // Saved suggestions can outlive an ingredient. They must not block opening
    // the library, but recipe and receipt references above remain strict.
    const removed=new Set(),notices=[];
    const orphan=v=>object(v) && named(v.ingredientId) && !ingredientIds.has(v.ingredientId);
    for(const [key,v] of Object.entries(s.mappings)) if(orphan(v)) {delete s.mappings[key];notices.push('Removed saved match '+key+': its ingredient is missing. Review the match on a future receipt.');}
    if(object(s.products?.records)) for(const [id,v] of Object.entries(s.products.records)) if(orphan(v)) {delete s.products.records[id];removed.add(id);notices.push('Removed saved product '+(v.productCode || id)+': its ingredient is missing. Review the match on a future receipt.');}
    if(removed.size && object(s.products?.aliases)) for(const [key,ids] of Object.entries(s.products.aliases)) if(Array.isArray(ids)) {s.products.aliases[key]=ids.filter(id=>!removed.has(id));if(!s.products.aliases[key].length) delete s.products.aliases[key];}
    if(notices.length) s.maintenanceNotices=[...new Set([...(s.maintenanceNotices || []),...notices])];
    for (const v of Object.values(s.mappings)) if (!object(v) || !ingredientIds.has(v.ingredientId) || !positive(v.size) || !named(v.unit) || v.packSize != null && !positive(v.packSize)) throw Error('Invalid saved receipt match.');
    for (const v of Object.values(s.mappings)) if (v.costing != null && !validCosting(v.costing)) throw Error('Invalid saved recipe quantity.');
    const validPackCount=v=>v.packageCount==null || Number.isSafeInteger(v.packageCount) && v.packageCount>0 && positive(v.packSize) && Math.abs(v.size-v.packSize*v.packageCount)<1e-6;
    for(const v of Object.values(s.mappings)) if(!validPackCount(v)) throw Error('Invalid saved purchase count.');
    for(const v of Object.values(s.mappings)) for(const key of ['density','avgUnitWeight']) if(v[key]!=null && !positive(v[key])) throw Error('Invalid saved receipt conversion.');
    for(const v of Object.values(s.mappings)) if(v.avgUnitWeight!=null && (!validBridge(v.weightMeasurement) || v.weightMeasurement.kind!=='avgUnitWeight' || v.weightMeasurement.value!==v.avgUnitWeight)) throw Error('Invalid saved weight measurement.');
    if (s.products != null) {
      const p=s.products;
      if (!object(p) || p.version!==1 || !object(p.records) || !object(p.aliases)) throw Error('Invalid saved products.');
      const codes=new Set();
      for (const [id,v] of Object.entries(p.records)) {
        if(!validPackCount(v)) throw Error('Invalid saved product purchase count.');
        for(const key of ['density','avgUnitWeight']) if(v[key]!=null && !positive(v[key])) throw Error('Invalid saved product conversion.');
        if(v.avgUnitWeight!=null && (!validBridge(v.weightMeasurement) || v.weightMeasurement.kind!=='avgUnitWeight' || v.weightMeasurement.value!==v.avgUnitWeight || v.weightMeasurement.ingredientId!==v.ingredientId || v.weightMeasurement.retailer!==v.retailer || v.weightMeasurement.productCode!==v.productCode)) throw Error('Invalid saved product weight measurement.');
        if(v.requiresConfirmation!=null && typeof v.requiresConfirmation!=='boolean') throw Error('Invalid product confirmation flag.');
        if (!object(v) || v.id!==id || !named(id) || !named(v.retailer) || v.retailer!==retailerKey(v.retailer) || v.namespace!=='receipt' || !text(v.productCode) || v.productCode && !/^[A-Z0-9-]{1,40}$/.test(v.productCode) || !Number.isInteger(v.revision) || v.revision<1 || typeof v.forgotten!=='boolean' || !ingredientIds.has(v.ingredientId) || !positive(v.size) || !named(v.unit) || v.packSize!=null && !positive(v.packSize)) throw Error('Invalid saved product details.');
        if (v.costing!=null && (!validCosting(v.costing) || v.costing.ingredientId!==v.ingredientId || v.costing.retailer!==v.retailer || v.costing.productCode!==v.productCode || v.costing.purchasePackSize!==v.packSize || normalized(v.costing.purchaseUnit)!==normalized(v.unit))) throw Error('Invalid saved product recipe quantity.');
        if (!object(v.provenance) || !text(v.provenance.source) || !optionalText(v.provenance.receiptId) || !optionalText(v.provenance.text) || !optionalText(v.provenance.confirmedAt) || v.provenance.confirmedAt && !Number.isFinite(Date.parse(v.provenance.confirmedAt)) || !optionalText(v.provenance.date) || v.provenance.date && !validDate(v.provenance.date)) throw Error('Invalid product confirmation source.');
        const code=v.retailer+'|'+v.productCode;
        if (v.productCode && codes.has(code)) throw Error('Duplicate saved product code.');
        if (v.productCode) codes.add(code);
      }
      for (const [key,ids] of Object.entries(p.aliases)) if (!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length || ids.some(id=>!Object.hasOwn(p.records,id) || !key.startsWith(p.records[id].retailer+'|'))) throw Error('Invalid product description link.');
    }
    for (const k of ['laborRate', 'alertPercent']) if (!nonnegative(s.settings[k])) throw Error('Invalid setting: ' + k);
    if (!Number.isInteger(s.settings.staleDays) || s.settings.staleDays < 1) throw Error('Invalid setting: staleDays');
    for (const k of ['retailMarkup', 'bulkMarkup']) if (s.settings[k] !== null && !nonnegative(s.settings[k])) throw Error('Invalid markup');
    return s;
  }
  // Suggestions are drafts, never permission to change master prices.
  function retailerKey(value) {
    const key = normalized(value).replace(/[^a-z0-9]+/g, ' ').trim();
    if (/^(gfs|gordon food service(?: store)?)$/.test(key)) return 'gfs';
    if (/^costco(?: wholesale)?$/.test(key)) return 'costco';
    return key;
  }
  // Product records survive JSON storage; aliases contain IDs, never copies.
  function productStore(s) {
    if (s.products) return s.products;
    const p={version:1,records:{},aliases:{}};
    const add=(key,v,retailer,productCode='')=>{
      const id='legacy:'+key;
      p.records[id]={...JSON.parse(JSON.stringify(v)),id,retailer,productCode,namespace:'receipt',revision:1,forgotten:false,requiresConfirmation:!productCode || productCode.length<3,provenance:{source:'Earlier saved match',date:'',confirmedAt:''}};
      const c=p.records[id].costing;
      if(c && (c.ingredientId!==v.ingredientId || c.retailer!==retailer || c.productCode!==productCode || c.purchasePackSize!==v.packSize || normalized(c.purchaseUnit)!==normalized(v.unit))) delete p.records[id].costing;
      return id;
    };
    const entries=Object.entries(s.mappings).sort(([a],[b])=>a.localeCompare(b));
    for (const [key,v] of entries) {
      const n=key.indexOf('|sku:');
      if(n<0) continue;
      const retailer=retailerKey(key.slice(0,n)),code=key.slice(n+5).toUpperCase();
      // Keep uncertain short OCR codes, but require confirmation before reuse.
      if(!retailer || !/^[A-Z0-9-]{1,40}$/.test(code)) continue;
      const same=Object.values(p.records).find(r=>r.retailer===retailer && r.productCode===code);
      if(!same) add(key,v,retailer,code);
      else if(!sameMapping(same,v)) same.forgotten=true;
    }
    for(const [key,v] of entries) {
      if(key.includes('|sku:')) continue;
      const n=key.indexOf('|'),retailer=retailerKey(key.slice(0,n));
      if(n<1 || !retailer) continue;
      const alias=retailer+'|'+normalized(key.slice(n+1));
      const same=Object.values(p.records).filter(r=>r.retailer===retailer && sameMapping(r,v));
      const id=same.length===1 ? same[0].id : add(key,v,retailer);
      p.aliases[alias]=[...new Set([...(p.aliases[alias]||[]),id])];
    }
    return p;
  }
  function mappingValue(v) {
    return {ingredientId:v.ingredientId,size:v.size,unit:v.unit,...(v.packSize!=null?{packSize:v.packSize}:{}),...(v.packageCount!=null?{packageCount:v.packageCount}:{}),...(v.costing?{costing:JSON.parse(JSON.stringify(v.costing))}:{}),...(v.density!=null?{density:v.density}:{}),...(v.avgUnitWeight!=null?{avgUnitWeight:v.avgUnitWeight,weightMeasurement:JSON.parse(JSON.stringify(v.weightMeasurement))}:{})};
  }
  function sameMapping(a,b) {
    const stable=v=>v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])) : v;
    return JSON.stringify(stable(mappingValue(a)))===JSON.stringify(stable(mappingValue(b)));
  }
  function normalizeState(s) {
    validate(s);
    if(!s.products && Object.keys(s.mappings).length) s.products=productStore(s);
    return validate(s);
  }
  function savedProduct(s, retailer, description, code='') {
    const p=productStore(s),r=retailerKey(retailer),c=String(code||'').trim().toUpperCase();
    const exact=c && Object.values(p.records).find(v=>v.retailer===r && v.productCode===c);
    if(exact) return exact.forgotten ? null : exact;
    const ids=p.aliases[r+'|'+normalized(description)] || [];
    const records=ids.map(id=>p.records[id]).filter(v=>v && !v.forgotten);
    // A different supplied SKU cannot inherit another SKU's package via text.
    return records.length===1 && (!c || !records[0].productCode || records[0].productCode===c) ? records[0] : null;
  }
  function syncMappings(s) {
    const p=s.products,m={};
    for(const v of Object.values(p.records)) if(!v.forgotten && v.productCode) m[v.retailer+'|sku:'+v.productCode]=mappingValue(v);
    for(const [key,ids] of Object.entries(p.aliases)) {
      const active=ids.map(id=>p.records[id]).filter(v=>!v.forgotten);
      if(active.length===1) m[key]=mappingValue(active[0]);
    }
    // Compatibility projection only. New code always reads product records.
    s.mappings=m;
  }
  function rememberProduct(s,r,l,now=new Date()) {
    s.products=productStore(s);
    const p=s.products,retailer=retailerKey(r.supplier),code=String(l.productCode||'').trim().toUpperCase();
    const old=code ? Object.values(p.records).find(v=>v.retailer===retailer && v.productCode===code) : savedProduct(s,retailer,l.description);
    if(old?.provenance.date && r.date<old.provenance.date) return;
    const rememberedCode=code || old?.productCode || '';
    const conflicting=code && r.lines.some(other=>!other.excluded && other!==l && String(other.productCode||'').trim().toUpperCase()===code &&
      (other.ingredientId!==l.ingredientId || !positive(other.packSize) || !positive(l.packSize) || factor(other.unit,l.unit)===null || Math.abs(other.packSize*factor(other.unit,l.unit)-l.packSize)>.000001));
    const id=old?.id || uuid(),v={id,retailer,productCode:rememberedCode,namespace:'receipt',revision:(old?.revision||0)+1,forgotten:false,
      requiresConfirmation:!!conflicting,
      ingredientId:l.ingredientId,size:l.size,unit:l.unit,...(positive(l.packSize)&&positive(l.packageCount)?{packSize:l.packSize,packageCount:l.packageCount}:{}),
      ...(costingApplies(r.supplier,l) && code===rememberedCode ? {costing:{...l.costing}}:{}),
      provenance:{source:l.productDetails ? 'Pasted details, confirmed' : 'Receipt purchase, confirmed',receiptId:r.id,date:r.date,confirmedAt:now.toISOString(),text:l.productDetails || l.originalDescription || l.description}};
    // An explicit per-pack override supersedes a previously learned average.
    const bridge=!costingApplies(r.supplier,l) || l.bridge ? receiptBridge(s,r,l) : null;
    p.records[id]=v;
    if(bridge?.density) v.density=bridge.density;
    if(bridge?.avgUnitWeight && code) {
      v.avgUnitWeight=bridge.avgUnitWeight;
      v.weightMeasurement=JSON.parse(JSON.stringify(bridge.measurement));
    }
    for(const description of [l.description,l.originalDescription?.replace(/^\d{3,}\s+/,'')]) if(description?.trim()) {
      const key=retailer+'|'+normalized(description);
      p.aliases[key]=[...new Set([...(p.aliases[key]||[]),id])];
    }
    syncMappings(s);
  }
  function changeSavedProduct(s,id,revision,change,now=new Date()) {
    const p=productStore(s),old=p.records[id];
    if(!old || old.revision!==revision) throw Error('Saved product changed. Reopen its details and try again.');
    const next=JSON.parse(JSON.stringify(s));next.products=JSON.parse(JSON.stringify(p));
    const v=next.products.records[id];
    if(change.forget) {v.forgotten=true;delete v.costing;delete v.avgUnitWeight;delete v.weightMeasurement;}
    else {
      if(!positive(change.packSize) || factor(change.unit,old.unit)===null) throw Error('Enter a positive package size in a compatible purchase unit.');
      const count=old.packageCount ?? (positive(old.packSize) ? old.size/old.packSize : null);
      if(!Number.isSafeInteger(count) || count<1) throw Error('The saved purchase count is unknown. Confirm this product on a receipt before correcting its pack size.');
      v.packSize=change.packSize;v.packageCount=count;v.size=change.packSize*count;v.unit=normalized(change.unit);delete v.costing;delete v.avgUnitWeight;delete v.weightMeasurement;
      v.requiresConfirmation=false;
      v.provenance={source:'Saved package corrected',date:localDate(now),confirmedAt:now.toISOString()};
    }
    v.revision++;syncMappings(next);validate(next);
    s.products=next.products;s.mappings=next.mappings;
  }
  function parseProductDescription(text) {
    const invalid=message=>({ok:false,message});
    if(typeof text!=='string' || !text.trim() || text.length>10000) return invalid('Paste a product description, up to 10,000 characters.');
    const aliases={lbs:'lb',grams:'g',kilograms:'kg',liters:'l',litres:'l',quarts:'qt',quart:'qt',gallons:'gal',gallon:'gal',ct:'each',count:'each',pk:'each',pack:'each',dz:'dozen'};
    const unitPattern='fl\\s*oz|lbs?|oz|kg|mg|g|ml|l|qt|quarts?|gal|gallons?|each|ct|count|pk|pack|dozen|dz';
    const sizeRe=new RegExp('^(\\d+(?:\\.\\d+)?)\\s*('+unitPattern+')$','i');
    const multiRe=new RegExp('^(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*('+unitPattern+')$','i');
    const canonical=u=>aliases[u.toLowerCase()] || u.toLowerCase().replace(/^fl\s*oz$/,'fl oz');
    let size=null,unit='',innerCount=null,multiplied=false;
    for(const part of text.split(',').map(x=>x.trim())) {
      const multi=part.match(multiRe),single=part.match(sizeRe);
      if(multi) {
        if(size!==null || innerCount!==null) return invalid('More than one package size or count was found. Enter it manually.');
        innerCount=Number(multi[1]);size=Number(multi[2]);unit=canonical(multi[3]);multiplied=true;
      } else if(single) {
        const q=Number(single[1]),u=canonical(single[2]);
        if(units[u][0]==='count') {
          if(innerCount!==null || multiplied) return invalid('More than one package count was found. Enter it manually.');
          innerCount=q*units[u][1];
        } else {
          if(size!==null) return invalid('More than one package size was found. Enter it manually.');
          size=q;unit=u;
        }
      } else if(/\d/.test(part) || new RegExp('\\b('+unitPattern+')\\b','i').test(part)) return invalid('The package quantity is unclear. Enter the size and count manually.');
    }
    if(innerCount!==null && (!Number.isSafeInteger(innerCount) || innerCount<1)) return invalid('Package count must be a positive whole number.');
    if(size===null) {
      if(innerCount===null) return invalid('No explicit package quantity found. Enter it manually.');
      size=innerCount;unit='each';innerCount=1;
    }
    const total=size*(innerCount??1);
    if(!positive(size) || !positive(total) || total>Number.MAX_SAFE_INTEGER) return invalid('Enter a positive, finite package quantity.');
    return {ok:true,text:text.trim(),size,unit,innerCount:innerCount??1,packSize:total,dimension:units[unit][0]};
  }
  function matchIngredient(s, retailer, description, productCode = '') {
    productCode = String(productCode || '').trim().toUpperCase();
    const prefix = retailerKey(retailer) + '|';
    const saved = savedProduct(s,retailer,description,productCode);
    if (saved && s.ingredients.some(i => i.id === saved.ingredientId)) return {
      ingredientId:saved.ingredientId, reason:productCode && saved.productCode===productCode ? 'Saved product code' : 'Saved match', saved, candidates:[]
    };
    const aliases = [[/plugra|plugrá/i, 'European Butter'], [/daisy.*sour cream/i, 'Sour Cream'], [/\bbasil\b/i, 'Basil'], [/\bwhole milk\b/i, 'Milk'], [/org bananas/i, 'Banana'], [/ks u\/s qtrs/i, 'Butter'], [/hvy cream/i, 'Heavy Cream'], [/ks 5dz eggs/i, 'Egg']];
    const alias = aliases.find(([pattern]) => pattern.test(description));
    const exact = s.ingredients.filter(i => normalized(i.name) === normalized(alias?.[1] || description));
    if (exact.length === 1) return {ingredientId:exact[0].id, reason:'Description match', candidates:[]};
    const tokens = value => normalized(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/u\/s/g, 'unsalted')
      .split(/[^a-z]+/).map(x => ({hvy:'heavy',org:'organic',unsalt:'unsalted',choc:'chocolate',pwd:'powder',pdr:'powder',flr:'flour',crm:'cream',bu:'butter',bananas:'banana',eggs:'egg'}[x] || x))
      .filter(x => x.length > 1 && !['ks','qt','lb','oz','kg','ml','dz','ct','pack','the'].includes(x));
    const input = tokens(description), qualifiers = ['salted','unsalted','almond','coconut','rice','bread','cake','sour','heavy','whole','brown','white'];
    if (input.length === 1 && input[0] === 'flour') return {ingredientId:'', reason:'Confirm the flour type', candidates:s.ingredients.filter(i=>/\bflour\b/i.test(i.name)).map(i=>({ingredientId:i.id,name:i.name,score:0})).sort((a,b)=>a.name.localeCompare(b.name))};
    const candidates = s.ingredients.map(i => {
      const words = tokens(i.name);
      if (qualifiers.some(q => input.includes(q) && !words.includes(q)) ||
          input.includes('unsalted') && words.includes('salted') || input.includes('salted') && words.includes('unsalted')) return null;
      const hits = input.filter(t => words.some(w => w === t || t.length >= 3 && w.startsWith(t))).length;
      if (!hits) return null;
      const score = hits / Math.max(input.length, words.length) + (retailerKey(i.supplier) === retailerKey(retailer) ? .08 : 0);
      return {ingredientId:i.id, name:i.name, score};
    }).filter(Boolean).filter(x => x.score >= .35).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,3);
    const best = candidates[0], next = candidates[1];
    const clear = best && best.score >= .65 && (!next || best.score-next.score >= .2);
    return {ingredientId:clear ? best.ingredientId : '', reason:clear ? 'Similar description' : candidates.length ? 'Choose a match' : 'No match', candidates};
  }
  function suggestReceiptLine(s, retailer, line) {
    const match = matchIngredient(s, retailer, line.description, line.productCode);
    const savedPack = match.saved?.requiresConfirmation ? null : match.saved?.packSize, count = line.packageCount || 1;
    const compatible = !line.unit || !match.saved?.unit || factor(line.unit, match.saved.unit) !== null;
    const printedPack = positive(line.packSize) ? line.packSize : null;
    const changedPack = printedPack && positive(savedPack) && (!compatible || Math.abs(printedPack * factor(line.unit, match.saved.unit) - savedPack) > .000001);
    if (!line.quantityConflict && !positive(line.packSize) && positive(savedPack) && !line.size) {
      line.packSize = savedPack; line.unit = match.saved.unit; line.size = savedPack * count;
      line.packageCount = count;
      line.quantitySource = 'Saved pack size';
    }
    line.ingredientId = match.ingredientId;
    if (!line.costing && match.saved?.costing && !match.saved.requiresConfirmation) line.costing = {...match.saved.costing};
    clearReceiptCosting(retailer,line);
    line.matchReason = match.reason;
    line.matchCandidates = match.candidates.map(x=>x.ingredientId);
    line.needsReview = !!line.costingNotice || !(match.saved && !match.saved.requiresConfirmation && positive(line.packSize) && !changedPack && positive(line.size));
    line.reviewMode = true;
    line.priceChangeConfirmed = false;
    if (changedPack) { line.needsReview = true; line.quantitySource = 'Pack size differs from last purchase'; }
    if (line.parseNote || line.quantityConflict) line.needsReview = true;
    if (!line.unit) line.unit = s.ingredients.find(i=>i.id===match.ingredientId)?.unit || '';
    const ingredient=s.ingredients.find(i=>i.id===line.ingredientId);
    if(ingredient && positive(line.size) && factor(line.unit,ingredient.unit)===null && !purchaseQuantity(s,{supplier:retailer},line)) line.needsReview=true;
    return line;
  }
  function costingApplies(retailer, l) {
    const c=l.costing;
    return !!c && c.confirmed === true && c.ingredientId === l.ingredientId && c.retailer === retailerKey(retailer) &&
      c.productCode === String(l.productCode || '').trim().toUpperCase() && positive(c.packSize) && positive(c.purchasePackSize) &&
      normalized(c.purchaseUnit) === normalized(l.unit) && c.purchasePackSize === l.packSize &&
      positive(l.packageCount) && positive(l.size) && Math.abs(l.packSize*l.packageCount-l.size)<.000001;
  }
  function clearReceiptCosting(retailer,line,reason='') {
    const c=line.costing;
    if(!c || !reason && costingApplies(retailer,line)) return false;
    reason=reason || (c.ingredientId!==line.ingredientId ? 'the matched ingredient changed' : c.retailer!==retailerKey(retailer) ? 'the retailer changed' : c.productCode!==String(line.productCode||'').trim().toUpperCase() ? 'the product code changed' : normalized(c.purchaseUnit)!==normalized(line.unit) ? 'the purchase unit changed' : 'the package size or purchased quantity changed');
    line.costingNotice=(line.description || 'This purchase')+': the previous recipe quantity was cleared because '+reason+'. Confirm a new quantity before approval.';
    delete line.costing;line.needsReview=true;return true;
  }
  function purchaseQuantity(s, r, l) {
    const i=s.ingredients.find(i=>i.id===l.ingredientId);
    if (!i || !positive(l.size)) return null;
    const historical=r.status==='Reviewed' && i.history.find(h=>h.receiptId===r.id && h.conversion && positive(h.size) && h.unit);
    if(historical) return {size:historical.size,unit:historical.unit};
    if (factor(l.unit,i.unit)!==null) return {size:l.size,unit:l.unit};
    const bridge=receiptBridge(s,r,l);
    if(l.bridge && !bridge) return null;
    if(bridge && (l.bridge || !costingApplies(r.supplier,l))) {
      const conversion=factor(l.unit,i.unit,bridge),size=conversion===null ? null : l.size*conversion;
      return positive(size) ? {size,unit:i.unit} : null;
    }
    if (costingApplies(r.supplier,l) && factor(l.costing.unit,i.unit)!==null && positive(l.costing.packSize*l.packageCount))
      return {size:l.costing.packSize*l.packageCount,unit:l.costing.unit};
    return null;
  }
  function receiptBridge(s,r,l) {
    const i=s.ingredients.find(i=>i.id===l.ingredientId);
    if(!i || !positive(l.size)) return null;
    const kind=bridgeKind(l.unit,i.unit),b=l.bridge,code=String(l.productCode||'').trim().toUpperCase();
    if(b) {
      if(b.kind!==kind || b.confirmed!==true || !positive(b.value) || b.ingredientId!==i.id || b.retailer!==retailerKey(r.supplier) || b.productCode!==code || normalized(b.fromUnit)!==normalized(l.unit)) return null;
      if(kind==='avgUnitWeight') {
        const count=unitCategory(l.unit)==='count' ? l.size*(units[normalized(l.unit)]?.[1] || 1) : null;
        if(!positive(b.totalWeight) || !positive(b.measuredCount) || count!==null && Math.abs(count-b.measuredCount)>1e-9 || Math.abs(b.value-b.totalWeight/b.measuredCount)>1e-9) return null;
        if(unitCategory(l.unit)==='mass' && Math.abs(b.totalWeight-l.size*factor(l.unit,'g'))>1e-6) return null;
        return {avgUnitWeight:b.value,measurement:b};
      }
      return {density:b.value};
    }
    if(kind==='density' && positive(i.density)) return {density:i.density};
    if(kind==='avgUnitWeight' && code) {
      const saved=savedProduct(s,r.supplier,l.description,code);
      if(saved && !saved.requiresConfirmation && saved.productCode===code && saved.ingredientId===i.id && positive(saved.avgUnitWeight) && saved.weightMeasurement) return {avgUnitWeight:saved.avgUnitWeight,measurement:saved.weightMeasurement};
    }
    return null;
  }
  function confirmReceiptBridge(i,r,l,kind,value,totalCount=null) {
    if(kind!==bridgeKind(l.unit,i.unit) || !positive(value) || !positive(l.size)) throw Error('Enter a positive conversion and purchase quantity.');
    const b={kind,value,ingredientId:i.id,retailer:retailerKey(r.supplier),productCode:String(l.productCode||'').trim().toUpperCase(),fromUnit:l.unit,confirmed:true,receiptId:r.id,measuredDate:r.date};
    if(kind==='avgUnitWeight') {
      const count=unitCategory(l.unit)==='count' ? l.size*(units[normalized(l.unit)]?.[1] || 1) : totalCount;
      if(!Number.isSafeInteger(count) || count<1) throw Error('Enter the whole number of items actually purchased.');
      if(unitCategory(l.unit)==='mass' && Math.abs(value-l.size*factor(l.unit,'g'))>1e-6) throw Error('The measured total must match the purchased weight. Correct the purchase quantity first.');
      b.totalWeight=value;b.measuredCount=count;b.value=value/count;
      if(!positive(b.value)) throw Error('Enter a valid measured total weight.');
    }
    return b;
  }
  function purchaseChange(s, r, l) {
    const i = s.ingredients.find(x=>x.id===l.ingredientId), quantity=purchaseQuantity(s,r,l), conversion = factor(quantity?.unit, i?.unit), oldCost = unitCost(i);
    const newCost = nonnegative(l.price) && quantity && conversion !== null ? l.price / (quantity.size * conversion) : null;
    const percent = oldCost !== null && oldCost > 0 && newCost !== null ? (newCost/oldCost-1)*100 : null;
    const older = !!i?.updated && validDate(r.date) && r.date < i.updated;
    const unusual = !older && newCost !== null && (oldCost === 0 ? newCost > 0 : percent !== null && Math.abs(percent) >= Math.max(10, s.settings.alertPercent));
    return {ingredientId:i?.id, name:i?.name || l.description, unit:i?.unit || l.unit, oldCost, newCost, percent, older, unusual};
  }
  function receiptPreview(s, r, now = new Date()) {
    const copy = JSON.parse(JSON.stringify(s)), changes = [];
    for (const l of r.lines.filter(l=>!l.excluded)) {
      const change = purchaseChange(s,r,l); changes.push(change);
      const i = copy.ingredients.find(i=>i.id===l.ingredientId);
      if (i && !change.older && change.newCost !== null) Object.assign(i,{price:l.price,...purchaseQuantity(s,r,l)});
    }
    const changedIds = new Set(changes.filter(x=>!x.older&&x.newCost!==null&&x.newCost!==x.oldCost).map(x=>x.ingredientId));
    const recipes = s.recipes.filter(r=>r.lines.some(l=>changedIds.has(l.ingredientId))).map(r=>({id:r.id,name:r.name,
      before:calculate(s,r,now).unit, after:calculate(copy,copy.recipes.find(x=>x.id===r.id),now).unit}));
    return {changes,recipes};
  }
  function receiptSuggestions(s, r, now = new Date()) {
    const text = String(r.text || ''), rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const header = rows.slice(0, 12).join(' ');
    const supplier = /costco/i.test(header) ? 'Costco' : /gordon|food service store/i.test(header) ? 'GFS' : /kroger/i.test(header) ? 'Kroger' : '';
    const dates = new Set();
    for (const m of text.matchAll(/\b(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{4}|\d{2})\b/g)) {
      const iso = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      if (validDate(iso) && iso <= localDate(now)) dates.add(iso);
    }
    for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) if (validDate(m[0]) && m[0] <= localDate(now)) dates.add(m[0]);
    const date = dates.size === 1 ? [...dates][0] : '';
    const stop = rows.findIndex(x => /^(?:sub\s*total|tax|\*+\s*(?:total|balance)|balance)\b/i.test(x));
    const items = rows.slice(0, stop < 0 ? rows.length : stop);
    const skip = /total|tax|cash|change|balance|visa|mastercard|payment|saving|discount|coupon|points|approval|phone|member|cashier|\bcard\b|\baid\b/i;
    const amount = /^\$?(-?\d+[.,]\d{2})\s*[A-Za-zг]?$/;
    const candidates = [];
    const add = (description, price, count = 1, code = '', sourceIndex = -1) => {
      const originalDescription = description.trim();
      let productCode = description.match(/^(\d{3,})\s+/)?.[1] || code, parseNote = '';
      if (supplier === 'Costco') {
        const clean = description.match(/^(?:[A-Z]{1,2}\s+)?(\d{1,8})\s+(.+)$/);
        const noisy = !clean && description.match(/^[^0-9]{1,24}[!|]\s*(\d{3,8})\s+(.+)$/);
        const item = clean || noisy;
        if (item) {
          productCode = item[1].length >= 3 ? item[1] : '';
          description = item[2];
          if (!productCode) parseNote = `Item number read as ${item[1]}; check the original receipt.`;
          if (noisy) parseNote = 'OCR marks were removed before the item number. Check the original receipt.';
        }
      }
      description = description.replace(/^\d{3,}\s+/, '').trim();
      if (!description || skip.test(description) || !/[a-z]/i.test(description)) return;
      candidates.push({description, originalDescription, productCode, price, count, parseNote, sourceRows:sourceIndex >= 0 ? [sourceIndex] : []});
    };
    for (let n = 0; n < items.length; n++) {
      const row = items[n], inline = row.match(/^(.+?)\s+\$?(-?\d+[.,]\d{2})\s*[A-Za-zг]?$/);
      if (inline && !/^\d+\s*@/.test(row)) {
        const q = items[n - 1]?.match(/^(\d+)\s*@\s*\d+[.,]\d{2}$/);
        add(inline[1], Number(inline[2].replace(',', '.')), q ? Number(q[1]) : 1, /^\d{4,}$/.test(items[n+1] || '') ? items[n+1] : '', n);
      } else if (/[a-z]/i.test(row) && !skip.test(row) && !amount.test(row) && amount.test(items[n + 1] || '')) {
        add(row, Number(items[n+1].match(amount)[1].replace(',', '.')), 1, '', n); n++;
      }
    }
    // Older Vision output put Costco's description and price columns in separate blocks.
    // Pair them only when the item count and subtotal prove the alignment.
    if (!candidates.length && supplier === 'Costco' && stop >= 0) {
      const descriptions = items.map((text,index)=>({text,index})).filter(x => /^\d+\s+[A-Z][A-Z0-9 /&().-]+$/.test(x.text));
      const after = rows.slice(stop + 1);
      const amounts = after.filter(x => amount.test(x)).map(x => Number(x.match(amount)[1].replace(',', '.')));
      const sold = text.match(/Items Sold:\s*(\d+)/i);
      if (sold && Number(sold[1]) === descriptions.length && amounts.length > descriptions.length &&
          Math.abs(amounts.slice(0, descriptions.length).reduce((a,b)=>a+b,0) - amounts[descriptions.length]) < .011) {
        descriptions.forEach((d,n) => add(d.text, amounts[n], 1, '', d.index));
      }
    }
    // Older GFS OCR separated the total from the product by its SKU and tax heading.
    if (!candidates.length && supplier === 'GFS') {
      const q = text.match(/(?:^|\n)(\d+)\s*@\s*(\d+[.,]\d{2})\s*\n([^\n]+)/);
      if (q) add(q[3], Math.round(Number(q[1]) * Number(q[2].replace(',', '.')) * 100) / 100, Number(q[1]), text.slice(q.index+q[0].length).match(/^\s*\n(\d{4,})\b/)?.[1] || '', rows.indexOf(q[3].trim()));
    }
    const printedSize = description => {
      const q = description.match(/\b(\d+(?:\.\d+)?)\s*(kg|lbs?|oz|ml|qts?|g|l)\b/i);
      const dz = description.match(/\b(\d+)\s*dz\b/i);
      // QT is a printed quart size. QTRS (butter quarters) is not a unit.
      const bareQuart = supplier === 'Costco' && /\b(?:HVY|HEAVY)\s+CREAM\s+QT\b/i.test(description);
      return q ? {packSize:Number(q[1]), unit:q[2].toLowerCase().replace(/^(lb|qt)s$/, '$1')} :
        dz ? {packSize:Number(dz[1])*12, unit:'each'} : bareQuart ? {packSize:1, unit:'qt'} : {packSize:null, unit:''};
    };
    const grouped = new Map();
    for (const c of candidates) {
      Object.assign(c,printedSize(c.description));
      // A retailer's item number identifies the product even when OCR varies its name.
      // Keep refunds separate; never subtract them silently from an ingredient purchase.
      const key = (c.productCode ? 'sku:'+c.productCode : normalized(c.description)) + (c.price < 0 ? '|refund' : '|purchase');
      if (grouped.has(key)) {
        const old = grouped.get(key);
        old.price = Math.round((old.price+c.price)*100)/100; old.count += c.count;
        old.sourceRows.push(...c.sourceRows); old.sourceDescriptions.push(c.originalDescription);
        if (old.packSize !== c.packSize || old.unit !== c.unit) old.sizeConflict = true;
        if (c.parseNote) old.parseNote = c.parseNote;
      } else grouped.set(key, {...c,sourceDescriptions:[c.originalDescription]});
    }
    const lines = [...grouped.values()].map(c => {
      const line = suggestReceiptLine(s,r.supplier || supplier,{description:c.description,originalDescription:c.originalDescription,productCode:c.productCode,
        sourceRows:c.sourceRows,sourceText:r.text,sourceDescriptions:c.sourceDescriptions,parseNote:c.parseNote,
        price:c.price >= 0 ? c.price : null, ingredientId:'', packSize:c.packSize,
        size:c.packSize ? c.packSize*c.count : null, unit:c.unit,
        excluded:c.price < 0, needsReview:true, packageCount:c.count,quantitySource:c.packSize ? 'Printed on receipt' : ''});
      if (c.sizeConflict) {
        line.packSize = null; line.size = null; line.unit = ''; line.quantitySource = ''; line.quantityConflict = true;
        line.parseNote = 'Different pack sizes were read for this item number. Confirm the total quantity.';
      }
      if (line.parseNote) line.needsReview = true;
      return line;
    });
    return {supplier, date, dateAmbiguous:dates.size > 1, lines};
  }
  function receiptCandidates(s, r, now = new Date()) {
    return receiptSuggestions(s,r,now).lines.filter(candidate => !r.lines.some(line => {
      if (line.sourceRows?.length) return candidate.sourceRows.some(n=>line.sourceRows.includes(n));
      return candidate.productCode && line.productCode === candidate.productCode ||
        normalized(line.description) === normalized(candidate.description) ||
        candidate.sourceDescriptions.some(d=>normalized(d)===normalized(line.originalDescription || line.description));
    }));
  }
  function receiptReconciliation(s,r,now=new Date()) {
    return receiptSuggestions(s,r,now).lines.flatMap(candidate=>{
      const covered=new Set(r.lines.filter(l=>l.sourceText===r.text).flatMap(l=>l.sourceRows || []));
      if(candidate.sourceRows.length && candidate.sourceRows.every(n=>covered.has(n))) return [];
      const possible=r.lines.map((l,index)=>({l,index})).filter(({l})=>
        candidate.productCode && l.productCode===candidate.productCode || normalized(candidate.description)===normalized(l.description) ||
        candidate.sourceDescriptions.some(d=>normalized(d)===normalized(l.originalDescription || l.description)) ||
        l.sourceText===r.text && candidate.sourceRows.some(n=>l.sourceRows?.includes(n))).map(({index})=>index);
      return [{candidate,possible}];
    });
  }
  function applyReconciliation(r,proposals,choices,before) {
    if(r.status!=='Needs review' || JSON.stringify(r)!==before) throw Error('Receipt changed. Find candidate lines again.');
    if(choices.length!==proposals.length || choices.some(c=>c!=='add' && (!/^\d+$/.test(c) || !r.lines[Number(c)]))) throw Error('Choose whether each purchase is new or already included.');
    const lines=JSON.parse(JSON.stringify(r.lines));
    proposals.forEach(({candidate:c},n)=>{
      if(choices[n]==='add') lines.push({...c,id:uuid()});
      else {
        const l=lines[Number(choices[n])];
        const changed=l.price!==c.price || (l.packageCount||1)!==c.packageCount;
        l.id=l.id || uuid();
        l.sourceRows=[...new Set([...(l.sourceText===r.text ? l.sourceRows || [] : []),...c.sourceRows])];
        l.sourceText=r.text;
        if(changed) {l.needsReview=true;l.priceChangeConfirmed=false;l.parseNote='Linked to recognized purchases. Check the entered paid total and pack count against the original receipt.';}
      }
    });
    r.lines=lines;
  }
  function canRefreshDraft(r, hints) {
    if (!r.lines.length || !hints.length || !r.lines.every(l=>l.needsReview && l.reviewMode && !l.priceChangeConfirmed && !l.excluded && l.originalDescription)) return false;
    const originalQuantity = l => {
      const q=l.description.match(/\b(\d+(?:\.\d+)?)\s*(kg|lb|oz|ml|qt|g|l)\b/i), dz=l.description.match(/\b(\d+)\s*dz\b/i);
      const pack=q ? Number(q[1]) : dz ? Number(dz[1])*12 : null;
      return pack ? l.packSize===pack && l.size===pack*l.packageCount && l.unit===(q ? q[2].toLowerCase() : 'each') : l.packSize==null && l.size==null;
    };
    const buckets = hints.map(()=>[]);
    for (const line of r.lines) {
      const n = hints.findIndex(h=>h.sourceDescriptions.includes(line.originalDescription));
      if (n < 0) return false;
      buckets[n].push(line);
    }
    // Upgrade only untouched auto-drafts with the same purchases and paid totals.
    return hints.every((h,n)=>buckets[n].length && !h.excluded &&
      Math.abs(buckets[n].reduce((v,l)=>v+l.price,0)-h.price)<.001 &&
      buckets[n].reduce((v,l)=>v+l.packageCount,0)===h.packageCount &&
      buckets[n].every(l=>originalQuantity(l) && l.description===l.originalDescription.replace(/^\d{3,}\s+/, '').trim() &&
        (l.quantitySource === 'Printed on receipt' || !l.quantitySource)));
  }
  function prepareReceipt(s, r, now = new Date()) {
    if (r.status !== 'Needs review' || r.preparedVersion === 3) return false;
    const hints = receiptSuggestions(s, r, now);
    if (!r.supplier && hints.supplier) r.supplier = hints.supplier;
    if (!r.date && hints.date) { r.date = hints.date; r.dateFromReceipt = true; }
    if (!r.lines.length || canRefreshDraft(r,hints.lines)) r.lines = hints.lines.map(l=>({...l,id:uuid()}));
    else for (const line of r.lines) {
      // Preserve reviewed or manually entered lines. Enrich only untouched suggestions.
      if (!line.needsReview) continue;
      const hint = hints.lines.find(x=>normalized(x.description)===normalized(line.description));
      if (!line.productCode && hint?.productCode) line.productCode = hint.productCode;
      if (!line.originalDescription) line.originalDescription = hint?.originalDescription || line.description;
      if (!line.ingredientId) {
        const candidate = suggestReceiptLine(s,r.supplier,{...line});
        Object.assign(line,candidate);
      }
    }
    r.preparedVersion = 3;
    return true;
  }
  function receiptRefresh(s,r,now = new Date()) {
    if (r.status !== 'Needs review') return [];
    const hints=receiptSuggestions(s,r,now).lines, used=new Set();
    return r.lines.flatMap((line,index)=>{
      // Legacy drafts lack provenance. Only offer a preview; never silently replace them.
      if (!line.needsReview || line.priceChangeConfirmed || line.excluded) return [];
      const matches=hints.map((h,n)=>({h,n})).filter(({h})=>
        line.sourceRows?.some(row=>h.sourceRows.includes(row)) ||
        line.productCode && line.productCode===h.productCode ||
        h.sourceDescriptions.some(d=>normalized(d)===normalized(line.originalDescription || line.description)) ||
        normalized(h.description)===normalized(line.description));
      if (matches.length!==1 || used.has(matches[0].n)) return [];
      const {h,n}=matches[0];
      // Combining previously split lines needs a separate explicit purchase edit.
      if (h.price!==line.price || h.packageCount!==(line.packageCount || 1)) return [];
      const next={...line}, fields=[];
      const offer=(key,value)=>{if(JSON.stringify(next[key])!==JSON.stringify(value)){next[key]=value;fields.push(key);}};
      if (!line.ingredientId && h.ingredientId) offer('ingredientId',h.ingredientId);
      if (!line.productCode && h.productCode) offer('productCode',h.productCode);
      if (h.description!==line.description && (!line.originalDescription || line.description===line.originalDescription || normalized(line.description)===normalized(line.originalDescription.replace(/^\d{3,}\s+/,'')))) offer('description',h.description);
      if (!positive(line.size) && !positive(line.packSize) && positive(h.size)) {
        for(const key of ['packSize','size','unit','quantitySource']) offer(key,h[key]);
      }
      if (h.parseNote && h.parseNote!==line.parseNote) offer('parseNote',h.parseNote);
      if (!fields.length) return [];
      used.add(n);
      Object.assign(next,{sourceRows:h.sourceRows,sourceText:r.text,sourceDescriptions:h.sourceDescriptions,originalDescription:line.originalDescription || h.originalDescription,reviewMode:true,needsReview:true,priceChangeConfirmed:false});
      return [{index,before:JSON.parse(JSON.stringify(line)),after:next,fields}];
    });
  }
  function applyReceiptRefresh(r, proposals, selected) {
    if(r.status!=='Needs review') throw Error('Only an unapproved receipt can be refreshed.');
    const changes=proposals.filter(p=>selected.includes(p.index));
    for(const p of changes) if(JSON.stringify(r.lines[p.index])!==JSON.stringify(p.before)) throw Error('This receipt changed. Review the suggestions again.');
    for(const p of changes) r.lines[p.index]=JSON.parse(JSON.stringify(p.after));
    return changes.length;
  }
  function receiptIssues(s, r, now = new Date()) {
    const issues = [], ids = new Set(), selected = r.lines.filter(l => !l.excluded);
    if (!validDate(r.date) || r.date > localDate(now)) issues.push({field:'date',message:'Enter the purchase date printed on the receipt.'});
    if (!r.supplier.trim()) issues.push({field:'supplier',message:'Enter the retailer printed on the receipt.'});
    if (!selected.length) issues.push({field:'lines',message:'Add at least one ingredient purchase, or archive this receipt without updates.'});
    r.lines.forEach((l,index) => {
      if (l.excluded) return;
      const i = s.ingredients.find(i => i.id === l.ingredientId), name = i?.name || l.description || `Purchase ${index+1}`;
      let message = !i ? 'choose the matching ingredient' : !nonnegative(l.price) ? 'confirm the paid total' : !positive(l.size) || !String(l.unit || '').trim() ? 'enter the total quantity and unit' : l.price === 0 && !l.freeConfirmed ? 'confirm this was free' : l.needsReview ? 'review the extracted details' : '';
      if (i && i.unit && l.unit && factor(l.unit, i.unit) === null && !purchaseQuantity(s,r,l)) {
        const kind=bridgeKind(l.unit,i.unit);
        message=kind==='avgUnitWeight' ? 'enter the measured total weight of the items bought (g) to confirm the quantity for recipes; no per-item weight is assumed' : kind==='density' ? 'confirm a density (g/ml), or the quantity for recipes ('+i.unit+') in one purchased pack' : 'confirm the quantity for recipes (' + i.unit + ') in one purchased pack; count, weight and volume cannot be interchanged automatically';
      }
      if (i && ids.has(i.id)) message = 'combine repeated purchases of this ingredient into one total';
      if (!message && l.reviewMode && purchaseChange(s,r,l).unusual && !l.priceChangeConfirmed) message = 'check the price change';
      if (l.packSize != null && (!positive(l.packSize) || !positive(l.packageCount) || Math.abs(l.packSize*l.packageCount-l.size) > .000001)) message = 'check pack size × number of packs against the total quantity';
      if (i) ids.add(i.id);
      if (message) issues.push({field:'line',index,message:name + ': ' + message + '.'});
    });
    return issues;
  }
  function approveReceipt(s, r, now = new Date()) {
    if (r.status !== 'Needs review') throw Error('This receipt is already reviewed or archived.');
    const issues = receiptIssues(s, r, now);
    if (issues.length) throw Error(issues.map(x => x.message).join('\n'));
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
      const quantity=purchaseQuantity(s,r,l);
      const bridge=receiptBridge(s,r,l),usedBridge=bridge && (!costingApplies(r.supplier,l) || l.bridge) && factor(l.unit,i.unit)===null;
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
        size: quantity.size,
        unit: quantity.unit,
        ...(l.costing || usedBridge ? {purchase:{size:l.size,unit:l.unit,packageCount:l.packageCount}} : {}),
        ...(usedBridge ? {conversion:bridge.density ? {density:bridge.density} : {avgUnitWeight:bridge.avgUnitWeight}} : {}),
        receiptId: r.id,
        note: 'Receipt approved'
      });
      if (!i.updated || r.date >= i.updated) Object.assign(i, {
        ...(usedBridge && bridge.density ? {density:bridge.density} : {}),
        ...(usedBridge && bridge.avgUnitWeight ? {avgUnitWeight:bridge.avgUnitWeight} : {}),
        price: l.price,
        size: quantity.size,
        unit: quantity.unit,
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
      rememberProduct(s,r,l,now);
    }
    r.status = 'Reviewed';
    r.reviewedAt = now.toISOString();
    r.notUpdated = notUpdated;
    r.approvalSummary = {updated:changes.length-notUpdated.length, historyOnly:notUpdated.length, excluded:r.lines.filter(l=>l.excluded).length,
      ingredientIds:[...new Set(changes.filter(({i})=>!notUpdated.some(x=>x.ingredientId===i.id)).map(({i})=>i.id))]};
    r.approvalSummary.updated = r.approvalSummary.ingredientIds.length;
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
    unitCategory,
    bridgeKind,
    suggestedDensity,
    receiptBridge,
    confirmReceiptBridge,
    clearReceiptCosting,
    unitCost,
    ingredientIssues,
    calculate,
    margin,
    marginWatch,
    validate,
    normalizeState,
    productStore,
    savedProduct,
    changeSavedProduct,
    parseProductDescription,
    approveReceipt,
    receiptSuggestions,
    receiptCandidates,
    receiptReconciliation,
    applyReconciliation,
    receiptRefresh,
    applyReceiptRefresh,
    purchaseQuantity,
    costingApplies,
    prepareReceipt,
    receiptIssues,
    retailerKey,
    matchIngredient,
    suggestReceiptLine,
    purchaseChange,
    receiptPreview,
    workbook,
    normalized,
    localDate,
    laborEfforts
  };
  if (typeof module !== 'undefined') module.exports = global.HeidyModel;
})(typeof window !== 'undefined' ? window : globalThis);
