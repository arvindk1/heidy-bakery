'use strict';

// Reads input values, not cached Excel costs. Parsing and planning never mutate a library.
(function (global) {
  const value = v => v && typeof v === 'object' && v.formula ? null : v;
  const text = v => String(value(v) ?? '').trim();
  const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const key = s => text(s).toLowerCase().replace(/\s+/g, ' ');
  const at = (row, n) => row?.[n] ?? null;
  const formula = v => String(v?.formulaText || '').replace(/^=\+?/, '').trim();
  const channel = s => /\bHS\b/i.test(s) ? 'unassigned' : /^\s*\(\s*W\s*\)/i.test(s) || /\b(wholesale|ws|wsl)\b/i.test(s) ? 'bulk' : 'retail';
  const group = (list, getKey) => { const out = new Map(); for (const item of list) { const k=getKey(item); if(!out.has(k)) out.set(k,[]); out.get(k).push(item); } return out; };
  const itemKey = i => i.kind + '|' + key(i.name);
  const category = file => file.replace(/\.xlsx$/i, '').replace(/\s+/g, ' ').trim();

  function parseSheet(file, sheet, prices) {
    const M=global.HeidyModel, rows=sheet.rows || [];
    const label = s => rows.findIndex(r => key(at(r, 0)) === s);
    const ing=label('ingredients (batch)'), pack=label('packaging (batch)'), sum=label('summary'),
      yieldRow=label('batch quantity'), effortRow=label('labor effort');
    if (ing < 0 || pack <= ing || sum <= pack || yieldRow <= sum || effortRow <= yieldRow)
      return {file,sheet:sheet.name,error:'Recipe sections or batch details were not found.'};
    const count=number(at(rows[yieldRow],1)), effort=text(at(rows[effortRow],1));
    if (!(count > 0)) return {file,sheet:sheet.name,error:'Batch quantity is missing or invalid.'};
    const lines=[], issues=[], blockingIssues=[], notes=[], costNotes=[];
    for (const [kind,start,end] of [['ingredient',ing+2,pack],['packaging',pack+2,sum]]) {
      const total=rows.findIndex((r,n)=>n>=start && n<end && key(at(r,0))===kind+' total');
      if(total<0) return {file,sheet:sheet.name,error:'Missing '+kind+' total section boundary.'};
      for(let n=start;n<total;n++) {
        const row=rows[n];
        if(!text(at(row,0)) && at(row,1)==null) continue; // Empty template slots may still contain a unit.
        const name=text(at(row,0)) || 'Unidentified '+kind+' — '+sheet.name.trim()+' row '+(n+1);
        if(!text(at(row,0))) issues.push('Row '+(n+1)+': material name is missing; preserved as '+name);
        let quantity=number(at(row,1)), perPiece=false;
        if(quantity===null && kind==='packaging' && at(row,1)?.formula &&
          new RegExp('^\\$?B\\$?'+(yieldRow+1)+'$','i').test(formula(at(row,1)))) { quantity=1;perPiece=true; }
        if(quantity===null) blockingIssues.push(name+': enter a valid quantity in the workbook; unsupported formulas are not imported as zero');
        const unit=text(at(row,2));
        if(!unit) issues.push(name+': unit needs review; cost will remain incomplete');
        lines.push({name,kind,quantity,unit,perPiece,row:n+1});
      }
      const range=/^SUM\(\$?F\$?(\d+):\$?F\$?(\d+)\)$/i.exec(formula(at(rows[total],5)));
      if(range && lines.some(l=>l.kind===kind && (l.row<+range[1] || l.row>+range[2])))
        costNotes.push('The spreadsheet '+kind+' total omits some rows. The app includes every '+kind+' line, so its cost may be higher.');
    }
    if(!lines.length) return {file,sheet:sheet.name,error:'No material lines were found.'};
    const matches=prices.filter(p=>key(p.name)===key(sheet.name));
    const listed=matches.length===1 ? number(matches[0].price) : null;
    if(matches.length>1) issues.push('More than one listed price matches this sheet; selling price left blank');
    if(matches.length===1 && matches[0].price!=null && listed===null) issues.push('Listed price is not a valid input number; selling price left blank');
    const priceChannel=channel(sheet.name);
    if(priceChannel==='unassigned') issues.push('HS sales channel is unconfirmed'+(listed==null ? '' : '; listed price $'+listed.toFixed(2))+'; retail and bulk prices left blank');
    if(!Object.prototype.hasOwnProperty.call(M.laborEfforts,effort)) blockingIssues.push('Labour effort is not recognized; correct it in the workbook');
    const last=label('cost per item');
    if(last>=0) for(const row of rows.slice(last+1)) {
      const note=row.map(text).filter(Boolean).join(' · '); if(note) notes.push(note);
    }
    return {file,sheet:sheet.name,name:sheet.name.trim(),yield:count,unit:'piece',category:category(file),
      laborEffort:effort,laborHours:M.laborEfforts[effort] ?? null,listedPrice:listed,priceChannel,
      retail:priceChannel==='retail'?listed:null,bulk:priceChannel==='bulk'?listed:null,
      lines,issues,blockingIssues,costNotes,notes:notes.join('\n')};
  }

  function parse(workbooks) {
    const drafts=[],skipped=[],notices=[];
    for(const book of workbooks) {
      const summary=book.sheets.find(s=>key(s.name)==='price summary');
      const header=summary?.rows.findIndex(r=>key(at(r,0))==='item' && key(at(r,7))==='listed item price');
      let prices=[];
      if(summary && header>=0) prices=summary.rows.slice(header+1).map(r=>({name:text(at(r,0)),price:at(r,7)})).filter(p=>p.name);
      else notices.push(book.file+': '+(summary?'Listed-price columns were not recognized':'No Price Summary sheet')+'. Recipes can still be imported; selling prices stay blank.');
      let found=0;
      for(const sheet of book.sheets) {
        if(['price summary','temp'].includes(key(sheet.name))) continue;
        const parsed=parseSheet(book.file,sheet,prices);
        if(parsed.error) skipped.push(parsed); else {drafts.push(parsed);found++;}
      }
      if(!found) throw Error(book.file+': no supported recipe sheets were found. No records were changed.');
    }
    return {drafts,skipped,notices};
  }

  function plan(state,drafts) {
    const master=group(state.ingredients,itemKey), names=group(state.recipes,r=>key(r.name)),
      sources=group(drafts,r=>key(r.name)), missing=new Map();
    const planned=drafts.map(raw=>{
      const d={...raw,existing:null,matchIssues:[],missingNames:[],blockingIssues:[...raw.blockingIssues]};
      const existing=names.get(key(d.name)) || [];
      if(existing.length===1) d.existing=existing[0];
      if(existing.length>1) d.blockingIssues.push('Multiple saved recipes have this name. Rename them before importing.');
      if(sources.get(key(d.name)).length>1) d.matchIssues.push('Multiple selected sheets have this name. Select only one.');
      for(const l of d.lines) {
        const matches=master.get(itemKey(l)) || [];
        if(!matches.length) {missing.set(itemKey(l),{name:l.name,kind:l.kind,unit:l.unit});d.missingNames.push(l.name);}
        else if(matches.length>1) d.blockingIssues.push(l.name+': multiple master items match; resolve the duplicate names first');
        else if(global.HeidyModel.unitCost(matches[0])===null) d.matchIssues.push(l.name+': master purchase cost is incomplete');
        else if(l.unit && matches[0].unit && global.HeidyModel.factor(l.unit,matches[0].unit)===null)
          d.matchIssues.push(l.name+': '+l.unit+' does not match master '+matches[0].unit);
      }
      return d;
    });
    return {drafts:planned,missing:[...missing.values()],withoutPrice:planned.filter(d=>d.retail==null&&d.bulk==null).length};
  }

  function candidate(state,chosen,createMissing=false) {
    const M=global.HeidyModel,next=JSON.parse(JSON.stringify(state));
    const master=group(next.ingredients,itemKey),chosenNames=new Set();
    for(const d of chosen) {
      if(d.blockingIssues?.length) throw Error(d.name+': '+d.blockingIssues.join('; '));
      if(chosenNames.has(key(d.name))) throw Error('Two selected sheets have the same recipe name: '+d.name+'. Select only one.');
      chosenNames.add(key(d.name));
      for(const l of d.lines) {
        if(number(l.quantity)===null) throw Error(d.name+': '+l.name+' needs a valid quantity.');
        const k=itemKey(l);
        if(!master.has(k) && createMissing) {
          const item={id:M.uuid(),name:l.name,kind:l.kind,supplier:'',price:null,size:null,unit:l.unit,updated:'',history:[]};
          next.ingredients.push(item);master.set(k,[item]);
        }
        if(!master.has(k)) throw Error(l.name+' is missing from the master list. Choose the review option to create unpriced items.');
        if(master.get(k).length!==1) throw Error(l.name+': multiple master items match.');
      }
      const previousMatches=next.recipes.filter(r=>key(r.name)===key(d.name));
      if(previousMatches.length>1) throw Error(d.name+': multiple saved recipes match.');
      const previous=previousMatches[0], noteParts=[previous?.notes || '',d.notes || '',
        d.priceChannel==='unassigned' ? d.issues.find(x=>x.startsWith('HS sales channel')) : ''].filter(Boolean);
      const recipe={id:previous?.id || M.uuid(),name:d.name,yield:d.yield,unit:d.unit || 'piece',
        laborHours:d.laborHours,laborEffort:d.laborEffort,otherCost:previous?.otherCost || 0,
        retail:previous?previous.retail:d.retail,bulk:previous?previous.bulk:d.bulk,
        bulkMin:previous?.bulkMin ?? null,bulkPackaging:previous?.bulkPackaging ?? null,
        bulkLaborHours:previous?.bulkLaborHours ?? null,notes:[...new Set(noteParts)].join('\n'),
        category:previous?.category || category(d.file),source:d.file+' · '+d.sheet,costBaseline:previous?.costBaseline ?? null,
        lines:d.lines.map(l=>({id:M.uuid(),ingredientId:master.get(itemKey(l))[0].id,quantity:l.quantity,unit:l.unit,perPiece:l.perPiece}))};
      const index=next.recipes.findIndex(r=>r.id===recipe.id);
      if(index<0)next.recipes.push(recipe);else next.recipes[index]=recipe;
    }
    next.imported=true;
    M.validate(next);return next;
  }
  const api={parse,plan,candidate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  global.HeidyRecipeImport=api;
})(typeof window==='undefined'?globalThis:window);
