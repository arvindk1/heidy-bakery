"""Read-only fixture generator. Retains worksheet layout; replaces private inputs.
Run with bundled Python + openpyxl and a folder holding the four original files.
The generated JSON is self-contained; normal tests need no private workbooks.
"""
import json, re, sys
from pathlib import Path
from openpyxl import load_workbook
folder=Path(sys.argv[1])
files=['Cake.xlsx','Bread.xlsx','Cookie & Others.xlsx','Cloud Chiffon Series.xlsx']
books=[];expected=[];masters={};material_names={};material_id=0
norm=lambda x:' '.join(str(x or '').split()).lower()
for fi,filename in enumerate(files):
    w=load_workbook(folder/filename,read_only=True,data_only=False)
    book={'file':filename,'sheets':[]};prices=[]
    if 'Price Summary' in w.sheetnames:
        raw=list(w['Price Summary'].iter_rows(max_row=150,max_col=8,values_only=True))
        summary=[[],[],['Item',None,None,None,None,None,None,'Listed Item Price']]
        for ri,row in enumerate(raw[3:],4):
            if not row[0]:continue
            p=None
            if isinstance(row[7],(int,float)):
                p=5.75 if str(row[0]).strip()=='(W)Biscoff Earlgrey Bun' else round(3+(ri%15)*.5,2)
            summary.append([row[0],None,None,None,None,None,None,p]);prices.append((norm(row[0]),p))
        book['sheets'].append({'name':'Price Summary','rows':summary})
    for si,s in enumerate(w.worksheets):
        if norm(s.title) in ('price summary','temp'):
            if norm(s.title)=='temp':book['sheets'].append({'name':'temp','rows':[]})
            continue
        raw=list(s.iter_rows(max_row=100,max_col=10,values_only=True))
        labels={norm(r[0]):i for i,r in enumerate(raw) if r[0]}
        ing=labels['ingredients (batch)'];pack=labels['packaging (batch)'];summ=labels['summary'];y=labels['batch quantity'];eff=labels['labor effort'];last=labels['cost per item']
        rows=[[] for _ in range(last+1)]
        rows[0]=['Synthetic heading deliberately unlike worksheet name']
        for n in [ing,pack,summ,y,eff,last]:rows[n]=[raw[n][0]]
        qty=10+(si%5);rows[y]=['Batch quantity',qty];rows[eff]=['Labor effort',raw[eff][1]]
        lines=[]
        for kind,start,end in [('ingredient',ing+2,pack),('packaging',pack+2,summ)]:
            rows[start-1]=['Material','Quantity','Unit']
            for n in range(start,end):
                a,b,u=raw[n][:3]
                if norm(a)==kind+' total':
                    f=raw[n][5]
                    rows[n]=[a,None,None,None,None,{'formula':True,'formulaText':f[1:],'cached':'999999'}] if isinstance(f,str) and f.startswith('=') else [a]
                    break
                if a is None and b is None:continue
                name=None
                if a is not None:
                    original=(kind,str(a).strip())
                    if original not in material_names:material_id+=1;material_names[original]='Test '+kind+' '+str(material_id)
                    name=material_names[original]
                    if original[1] not in ('Bread Flour','Potato'):
                        masters[name]={'id':'test-'+str(list(material_names).index(original)+1),'name':name,'kind':kind,'supplier':'Synthetic supplier','price':10,'size':100,'unit':str(u or 'g'),'updated':'2026-01-01','history':[]}
                per=isinstance(b,str) and b.startswith('=')
                quantity=1 if per else (n%19)+1
                if per:
                    assert re.fullmatch(r'=\$?B\$?'+str(y+1),b,re.I),b
                    inputvalue={'formula':True,'formulaText':b[1:],'cached':'999999'}
                else:inputvalue=quantity
                rows[n]=[name,inputvalue,u]
                lines.append({'name':name or 'Unidentified '+kind+' — '+s.title.strip()+' row '+str(n+1),'kind':kind,'quantity':quantity,'unit':str(u or ''),'perPiece':per,'row':n+1})
        matching=[p for name,p in prices if name==norm(s.title)]
        price=matching[0] if len(matching)==1 else None
        chan='unassigned' if re.search(r'\bHS\b',s.title,re.I) else 'bulk' if re.search(r'^\s*\(\s*W\s*\)|\b(wholesale|ws|wsl)\b',s.title,re.I) else 'retail'
        expected.append({'file':filename,'sheet':s.title,'name':s.title.strip(),'yield':qty,'laborEffort':raw[eff][1],'lines':lines,'retail':price if chan=='retail' else None,'bulk':price if chan=='bulk' else None})
        book['sheets'].append({'name':s.title,'rows':rows})
    books.append(book)
data={'description':'Synthetic inputs in the 96 original worksheet layouts. No source quantities, purchase prices, calculated costs, supplier names, or notes retained. The 5.75 W-price is the explicit user regression case.','books':books,'master':list(masters.values()),'expected':expected}
Path(__file__).with_name('recipe-layouts.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
print('Synthetic layouts:',len(expected),'sheets;',sum(len(r['lines']) for r in expected),'lines')
