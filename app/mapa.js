/* Salf Málaga · mapa por secciones censales (código compartido por todas las localidades)
   Cada carpeta de localidad tiene: index.html (con data-mun y data-nombre), secciones.json y calles.json.
   Los valores se leen de ../datos.xlsx (o ../datos.csv) y se filtran por el código de municipio. */
(async () => {
const NS = 'http://www.w3.org/2000/svg';
const MUN = document.body.dataset.mun;
const NOMBRE = document.body.dataset.nombre || '';
const app = document.getElementById('app');
const $ = id => document.getElementById(id);

const RAMPS = {
  rojoverde:['#c62828','#ef8a4c','#f4d35e','#8cc56a','#2e7d32'],
  mar:   ['#e3f1f0','#a9d8d5','#5fb3b1','#21817f','#0b4f55'],
  sierra:['#fbefd9','#f5c98a','#e8964b','#c25a2a','#7c2f1c'],
  morado:['#efe9f6','#cbbbe3','#9c86c9','#6e54a8','#43307a'],
  verde: ['#eef5dc','#c3e09a','#86c060','#4b8f3c','#24592a'],
  dif:   ['#b2402c','#e79b7a','#f2efe8','#7fb8c4','#1f6e85']
};
const CATS = ['#1f6e85','#e08a3c','#5a9e5a','#b8526b','#8a6bbf','#c9a227','#4fa3a5','#9b6b43','#6c7a89','#d36f9e','#2e5e4e','#a3a948'];
let rampKey = 'rojoverde';

// ---------- esqueleto de la página ----------
app.innerHTML = `
<div class="wrap">
  <header>
    <div>
      <p class="crumb"><a href="../">← Todas las localidades</a></p>
      <h1>${esc(NOMBRE)}, sección a sección</h1>
      <p class="sub" id="sub">Cargando…</p>
    </div>
    <label for="munSel" class="mun-select">Ir a otra localidad<select id="munSel"></select></label>
  </header>
  <div class="grid">
    <section class="mapcard" aria-label="Mapa">
      <div class="maphead">
        <span class="maptitle" id="mapTitle">&nbsp;</span>
        <span class="status" id="status"></span>
      </div>
      <div class="mapbox">
        <div class="zoom">
          <button type="button" id="zin" aria-label="Acercar">+</button>
          <button type="button" id="zout" aria-label="Alejar">−</button>
          <button type="button" id="zreset" class="reset" aria-label="Ver todo el municipio">⤢</button>
        </div>
        <svg id="map" role="img" aria-label="Mapa de secciones censales de ${esc(NOMBRE)}"></svg>
        <p class="loading" id="loading">Cargando mapa…</p>
      </div>
      <div class="legend" id="legend"></div>
      <div class="tip" id="tip" hidden></div>
    </section>
    <aside>
      <div class="panel">
        <h2>Visualizar datos</h2>
        <label for="valCol" id="valWrap" hidden>Dato a pintar
          <select id="valCol"></select></label>
        <label for="mode">Tipo de escala
          <select id="mode">
            <option value="auto">Automático</option>
            <option value="quant">Numérico · 5 tramos (cuantiles)</option>
            <option value="equal">Numérico · 5 tramos iguales</option>
            <option value="breaks">Numérico · cortes propios</option>
            <option value="cat">Categorías</option>
            <option value="hex">Colores del Excel (#RRGGBB)</option>
          </select></label>
        <label for="breaks" id="breaksWrap" hidden>Cortes (separados por ;)
          <input type="text" id="breaks" placeholder="2; 3; 4; 5"></label>
        <div id="rampWrap">
          <p class="hint" style="margin-bottom:6px">Paleta</p>
          <div class="ramps" id="ramps"></div>
        </div>
        <label class="check"><input type="checkbox" id="invert"> Invertir colores</label>
        <label class="check"><input type="checkbox" id="dlines" checked> Marcar límites de distrito</label>
        <label class="check"><input type="checkbox" id="streets" checked> Mostrar calles</label>
        <label class="check"><input type="checkbox" id="names" checked> Mostrar nombres de calles</label>
        <p class="hint">Rueda del ratón o pellizco para hacer zoom; arrastra para moverte.</p>
        <p class="warn" id="msg" hidden></p>
      </div>
    </aside>
  </div>
  <p class="foot">Secciones censales: © <a href="https://www.ine.es/" target="_blank" rel="noopener">INE</a>, cartografía de secciones a 1 de enero de 2026. Calles: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a> (ODbL).</p>
</div>`;

function esc(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

// selector de localidades (lista en ../localidades.json)
fetch('../localidades.json').then(r => r.json()).then(list => {
  const sel = $('munSel');
  sel.innerHTML = list.map(l => `<option value="${l.slug}" ${l.cod === MUN ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('');
  sel.addEventListener('change', () => { location.href = '../' + sel.value + '/'; });
}).catch(() => { $('munSel').closest('label').hidden = true; });

// ---------- carga de datos ----------
let SECC, CALLES;
try {
  [SECC, CALLES] = await Promise.all([
    fetch('secciones.json').then(r => r.json()),
    fetch('calles.json').then(r => r.json()).catch(() => ({}))
  ]);
} catch (e) {
  $('loading').textContent = 'No se ha podido cargar la cartografía (secciones.json).';
  return;
}
$('loading').remove();
const svg = $('map');
const nDist = new Set(SECC.map(s => s.d)).size;
$('sub').textContent = `${SECC.length} secciones censales · ${nDist} distrito${nDist > 1 ? 's' : ''} · código INE ${MUN}`;

// ---------- proyección ----------
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
const walk = (c,f) => typeof c[0] === 'number' ? f(c) : c.forEach(x => walk(x,f));
SECC.forEach(s => walk(s.g.coordinates, ([x,y]) => { minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); }));
const k = Math.cos((minY+maxY)/2*Math.PI/180);
const W = 1000, pad = 10;
const asp = (maxX-minX)*k / (maxY-minY);
const sc = asp >= 1.25 ? (W-2*pad)/((maxX-minX)*k) : (800-2*pad)/(maxY-minY);   // municipios "altos" no se hacen gigantes
const H = Math.round((maxY-minY)*sc + 2*pad);
const offX = (W - (maxX-minX)*k*sc)/2;
const proj = ([x,y]) => [(x-minX)*k*sc + offX, (maxY-y)*sc + pad];
const P = c => { const [a,b] = proj(c); return a.toFixed(1)+','+b.toFixed(1); };
const ringD = r => 'M'+r.map(P).join('L')+'Z';
const geomD = g => g.type === 'Polygon' ? g.coordinates.map(ringD).join('') : g.coordinates.map(p => p.map(ringD).join('')).join('');

const paths = {};
SECC.forEach(s => {
  const p = document.createElementNS(NS,'path');
  p.setAttribute('d', geomD(s.g)); p.setAttribute('class','sec'); p.dataset.id = s.id;
  svg.appendChild(p);
  paths[s.id] = {el:p, d:s.d, s:s.s};
});

// límites de distrito (aristas compartidas entre distritos distintos)
const dg = document.createElementNS(NS,'path'); dg.setAttribute('class','dline');
if (nDist > 1) {
  const seg = new Map();
  SECC.forEach(s => {
    const rings = s.g.type === 'Polygon' ? s.g.coordinates : s.g.coordinates.flat();
    rings.forEach(r => { for (let i=0;i<r.length-1;i++){ const a=r[i].join(), b=r[i+1].join(); const key=a<b?a+'|'+b:b+'|'+a;
      if(!seg.has(key)) seg.set(key,{pts:[r[i],r[i+1]],ds:new Set()}); seg.get(key).ds.add(s.d); }});
  });
  let d=''; seg.forEach(v => { if (v.ds.size>1) d+='M'+P(v.pts[0])+'L'+P(v.pts[1]); });
  dg.setAttribute('d', d);
}

// calles
const stMaj = document.createElementNS(NS,'path'), stMin = document.createElementNS(NS,'path');
stMaj.setAttribute('class','st maj'); stMin.setAttribute('class','st min');
const lineD = arr => (arr||[]).map(l => 'M'+l.map(P).join('L')).join('');
stMin.setAttribute('d', lineD(CALLES.min)); stMaj.setAttribute('d', lineD(CALLES.maj));
svg.append(stMin, stMaj, dg);
if (!CALLES.maj) { $('streets').closest('label').hidden = true; $('names').closest('label').hidden = true; }

// ---------- nombres de calles ----------
const LBL = CALLES.labels || [];
const defs = document.createElementNS(NS,'defs'); svg.appendChild(defs);
const lblG = document.createElementNS(NS,'g'); svg.appendChild(lblG);
const cands = LBL.map(([name,rank,cs],i) => {
  let pts = cs.map(proj);
  if (pts[pts.length-1][0] < pts[0][0]) pts.reverse();
  const cum=[0]; for (let j=1;j<pts.length;j++) cum.push(cum[j-1]+Math.hypot(pts[j][0]-pts[j-1][0], pts[j][1]-pts[j-1][1]));
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const pe=document.createElementNS(NS,'path'); pe.id='lp'+i; pe.setAttribute('d','M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')); defs.appendChild(pe);
  return {name, rank, pts, cum, len:cum[cum.length-1], bb:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)], id:'lp'+i};
}).sort((a,b) => a.rank-b.rank || b.len-a.len);
const at = (c,d) => { let j=1; while (j<c.cum.length-1 && c.cum[j]<d) j++; const t=(d-c.cum[j-1])/((c.cum[j]-c.cum[j-1])||1);
  return [c.pts[j-1][0]+(c.pts[j][0]-c.pts[j-1][0])*t, c.pts[j-1][1]+(c.pts[j][1]-c.pts[j-1][1])*t]; };
const full = {x:0,y:0,w:W,h:H}; let vb = {...full};
let lblTimer;
function updateLabels(){
  clearTimeout(lblTimer);
  lblTimer = setTimeout(() => {
    lblG.textContent = '';
    if (!$('names').checked || !$('streets').checked || !LBL.length) return;
    const rect = svg.getBoundingClientRect(); if (!rect.width) return;
    const u = vb.w/rect.width, zoom = W/vb.w;
    const fs = 11*u, cw = 6.3*u;
    lblG.setAttribute('font-size', fs.toFixed(3)); lblG.setAttribute('stroke-width', (3*u).toFixed(3));
    const placed=[]; let n=0;
    for (const c of cands) {
      if (c.rank===1 && zoom<2.2) continue;
      if (c.bb[2]<vb.x||c.bb[0]>vb.x+vb.w||c.bb[3]<vb.y||c.bb[1]>vb.y+vb.h) continue;
      const tl = c.name.length*cw + 8*u; if (c.len < tl*1.15) continue;
      const a=at(c,(c.len-tl)/2), b=at(c,(c.len+tl)/2);
      const box=[Math.min(a[0],b[0])-fs*.6, Math.min(a[1],b[1])-fs*.7, Math.max(a[0],b[0])+fs*.6, Math.max(a[1],b[1])+fs*.7];
      if (box[0]<vb.x||box[2]>vb.x+vb.w||box[1]<vb.y||box[3]>vb.y+vb.h) continue;
      if (placed.some(q => !(box[2]<q[0]||box[0]>q[2]||box[3]<q[1]||box[1]>q[3]))) continue;
      placed.push(box);
      const tx=document.createElementNS(NS,'text'); tx.setAttribute('class','lbl'+(c.rank===0?' maj':'')); tx.setAttribute('dy',(fs*.35).toFixed(3));
      const tp=document.createElementNS(NS,'textPath'); tp.setAttribute('href','#'+c.id); tp.setAttribute('startOffset','50%'); tp.setAttribute('text-anchor','middle'); tp.textContent=c.name;
      tx.appendChild(tp); lblG.appendChild(tx);
      if (++n >= 260) break;
    }
  }, 90);
}

// ---------- zoom y desplazamiento ----------
const tip = $('tip');
const setVB = () => { svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const z = W/vb.w; stMin.classList.toggle('hidden', !$('streets').checked || z < 2.2); stMaj.classList.toggle('hidden', !$('streets').checked); updateLabels(); };
const toSvg = (cx,cy) => { const r=svg.getBoundingClientRect(); return {x: vb.x+(cx-r.left)/r.width*vb.w, y: vb.y+(cy-r.top)/r.height*vb.h}; };
function clamp(){ vb.x=Math.min(Math.max(vb.x, full.x-vb.w*.4), full.w-vb.w*.6); vb.y=Math.min(Math.max(vb.y, full.y-vb.h*.4), full.h-vb.h*.6); }
function zoomAt(f, px, py){ const nw=Math.min(full.w, Math.max(full.w/80, vb.w/f)), k2=nw/vb.w;
  vb={x:px-(px-vb.x)*k2, y:py-(py-vb.y)*k2, w:nw, h:vb.h*k2}; clamp(); setVB(); }
svg.addEventListener('wheel', e => { e.preventDefault(); const p=toSvg(e.clientX,e.clientY); zoomAt(Math.exp(-e.deltaY*0.0015), p.x, p.y); tip.hidden=true; }, {passive:false});
const ptrs = new Map(); let last=null, pinch=null;
svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); svg.classList.add('drag'); last={x:e.clientX,y:e.clientY};
  if (ptrs.size===2) { const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y)}; } });
svg.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); tip.hidden=true;
  if (ptrs.size===2 && pinch) { const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); const m=toSvg((a.x+b.x)/2,(a.y+b.y)/2); zoomAt(d/pinch.d,m.x,m.y); pinch.d=d; return; }
  const r=svg.getBoundingClientRect(); vb.x-=(e.clientX-last.x)/r.width*vb.w; vb.y-=(e.clientY-last.y)/r.height*vb.h; last={x:e.clientX,y:e.clientY}; clamp(); setVB(); });
const up = e => { ptrs.delete(e.pointerId); if (ptrs.size<2) pinch=null; if (!ptrs.size) svg.classList.remove('drag'); else last=[...ptrs.values()][0]; };
svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
const center = () => ({x:vb.x+vb.w/2, y:vb.y+vb.h/2});
$('zin').onclick = () => { const c=center(); zoomAt(1.6,c.x,c.y); };
$('zout').onclick = () => { const c=center(); zoomAt(1/1.6,c.x,c.y); };
$('zreset').onclick = () => { vb={...full}; setVB(); };
$('streets').addEventListener('change', setVB);
$('names').addEventListener('change', updateLabels);
window.addEventListener('resize', updateLabels);

// ---------- tooltip ----------
let current = {};
svg.addEventListener('mousemove', e => {
  if (ptrs.size) return;
  const t = e.target.closest('path[data-id]'); if (!t) { tip.hidden=true; return; }
  const id=t.dataset.id, info=paths[id], v=current[id];
  tip.innerHTML = `<b>${id}</b><br>Distrito ${info.d} · Sección ${info.s}<br>${esc(current.__label||'Valor')}: <strong>${v===undefined||v===''?'sin dato':esc(fmt(v))}</strong>`;
  const box = svg.closest('.mapcard').getBoundingClientRect();
  let x=e.clientX-box.left+14, y=e.clientY-box.top+14;
  tip.hidden=false;
  if (x+tip.offsetWidth>box.width-6) x=e.clientX-box.left-tip.offsetWidth-14;
  tip.style.left=x+'px'; tip.style.top=y+'px';
});
svg.addEventListener('mouseleave', () => tip.hidden=true);

// ---------- utilidades ----------
function num(v){ if (typeof v==='number') return v; if (v==null) return NaN; let s=String(v).trim().replace('%','');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(',','.');
  return s===''?NaN:Number(s); }
function fmt(v){ const n=num(v); return isNaN(n)?String(v):n.toLocaleString('es-ES',{maximumFractionDigits:2}); }
function normCode(v){ let s=String(v??'').replace(/\D/g,''); if (s.length===9) s='0'+s; return s.length===10?s:null; }
const showMsg = t => { $('msg').hidden=!t; $('msg').textContent=t||''; };

// ---------- datos (../datos.xlsx o ../datos.csv) ----------
let table = null;
function parseText(txt){
  const lines = txt.replace(/\r/g,'').split('\n').filter(l => l.trim());
  if (!lines.length) return null;
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length >= lines[0].split(',').length ? ';' : ',');
  return toTable(lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g,'').replace(/^﻿/,''))));
}
function toTable(rows){
  const cols = rows[0].map((c,i) => String(c||'').trim() || ('Columna '+(i+1)));
  return {cols, rows: rows.slice(1)};
}
async function loadData(){
  try {
    const r = await fetch('../datos.xlsx', {cache:'no-store'});
    if (r.ok && window.XLSX) {
      const wb = XLSX.read(await r.arrayBuffer(), {type:'array'});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''});
      return {t: toTable(rows.filter(x => x.some(c => c!==''))), src:'datos.xlsx'};
    }
  } catch(e) {}
  try {
    const r = await fetch('../datos.csv', {cache:'no-store'});
    if (r.ok) return {t: parseText(await r.text()), src:'datos.csv'};
  } catch(e) {}
  return null;
}
let codeIdx = -1, src = '';
const SKIP = /^(cod|cusec|seccion|sección|distrito|municipio|nombre_distrito|cod_mun)/i;
const loaded = await loadData();
if (loaded && loaded.t) {
  table = loaded.t; src = loaded.src;
  codeIdx = table.cols.findIndex(c => /cod.?secc|cusec/i.test(c));
  if (codeIdx < 0) codeIdx = table.cols.findIndex((_,i) => table.rows.some(r => normCode(r[i])));
  const valIdx = table.cols.map((c,i) => i).filter(i => i!==codeIdx && !SKIP.test(table.cols[i]) && table.rows.some(r => r[i]!=='' && r[i]!=null));
  $('valCol').innerHTML = valIdx.map(i => `<option value="${i}">${esc(table.cols[i])}</option>`).join('');
  $('valWrap').hidden = valIdx.length < 2;
  if (!valIdx.length) table = null;
}

// ---------- dibujo ----------
const ramp = () => { const r=[...RAMPS[rampKey]]; return $('invert').checked ? r.reverse() : r; };
const spread = (r,n) => Array.from({length:n}, (_,i) => r[Math.round(i*(r.length-1)/(n-1||1))]);
function render(){
  let vals={}, label='Distrito', srcTxt='Sin datos: color por distrito', sinPol=[];
  if (table) {
    const vi = +$('valCol').value; label = table.cols[vi];
    let n=0;
    table.rows.forEach(r => { const c=normCode(r[codeIdx]); if (!c || !c.startsWith(MUN)) return;
      if (paths[c]) { if (r[vi]!=='' && r[vi]!=null) { vals[c]=r[vi]; n++; } } else if (r[vi]!=='' && r[vi]!=null) sinPol.push(c); });
    srcTxt = `${src} · ${n} de ${SECC.length} secciones con dato`;
    showMsg(sinPol.length ? `Con dato pero sin polígono en la cartografía 2026: ${sinPol.join(', ')}` : '');
  } else { for (const id in paths) vals[id]=paths[id].d; }
  current = {...vals, __label:label};
  $('mapTitle').textContent = label; $('status').textContent = srcTxt;

  let mode = $('mode').value;
  const present = Object.values(vals).filter(v => v!=='' && v!=null);
  const nums = present.map(num).filter(n => !isNaN(n));
  if (mode==='auto') {
    if (present.length && present.every(v => /^#?[0-9a-f]{6}$/i.test(String(v).trim()))) mode='hex';
    else if (table && present.length && nums.length===present.length && new Set(nums).size>8) mode='quant';
    else mode='cat';
  }
  $('breaksWrap').hidden = $('mode').value!=='breaks';
  $('rampWrap').hidden = mode==='cat' || mode==='hex';
  let colorOf, items=[];
  if (mode==='hex') {
    colorOf = v => { const s=String(v).trim(); return s.startsWith('#')?s:'#'+s; };
    items = [...new Set(present.map(colorOf))].slice(0,12).map(c => [c,c]);
  } else if (mode==='cat') {
    const cats=[...new Set(present.map(v => String(v).trim()))].sort((a,b) => a.localeCompare(b,'es',{numeric:true}));
    const m=new Map(cats.map((c,i) => [c, CATS[i%CATS.length]]));
    colorOf = v => m.get(String(v).trim());
    items = cats.slice(0,14).map(c => [m.get(c), table ? c : 'Distrito '+c]);
    if (cats.length>14) items.push(['transparent', `+${cats.length-14} más`]);
  } else {
    const sorted=[...nums].sort((a,b) => a-b), r=ramp();
    let br;
    if (mode==='equal') { const lo=sorted[0], hi=sorted.at(-1); br=[1,2,3,4].map(i => lo+(hi-lo)*i/5); }
    else if (mode==='breaks') { br=$('breaks').value.split(';').map(num).filter(n => !isNaN(n)).sort((a,b) => a-b).slice(0,r.length-1); }
    else { br=[.2,.4,.6,.8].map(q => sorted[Math.min(sorted.length-1, Math.floor(q*sorted.length))]); }
    br=[...new Set(br)];
    const cols = br.length+1 < r.length ? spread(r, br.length+1) : r;
    colorOf = v => { const n=num(v); if (isNaN(n)) return null; let i=0; while (i<br.length && n>=br[i]) i++; return cols[i]; };
    const edges=[sorted[0], ...br, sorted.at(-1)];
    items = cols.map((c,i) => [c, i===0 ? `< ${fmt(edges[1]??edges[0])}` : i===cols.length-1 ? `≥ ${fmt(edges[i])}` : `${fmt(edges[i])} – ${fmt(edges[i+1])}`]);
  }
  for (const id in paths) { const v=vals[id]; const c=(v===undefined||v==='')?null:colorOf(v); paths[id].el.style.fill = c || 'var(--nodata)'; }
  if (Object.keys(paths).some(id => vals[id]===undefined || vals[id]==='')) items.push(['var(--nodata)','Sin dato']);
  $('legend').innerHTML = `<span class="lt">${esc(label)}</span>` + items.map(([c,t]) => `<span class="sw"><i style="background:${c}"></i>${esc(t)}</span>`).join('');
  dg.style.display = $('dlines').checked ? '' : 'none';
}

$('ramps').innerHTML = Object.entries(RAMPS).map(([k,r]) => `<button class="ramp" type="button" data-k="${k}" aria-label="Paleta ${k}" aria-pressed="${k===rampKey}">${r.map(c => `<span style="background:${c}"></span>`).join('')}</button>`).join('');
$('ramps').addEventListener('click', e => { const b=e.target.closest('.ramp'); if (!b) return; rampKey=b.dataset.k; document.querySelectorAll('.ramp').forEach(x => x.setAttribute('aria-pressed', x===b)); render(); });
['valCol','mode','invert','dlines'].forEach(id => $(id).addEventListener('change', render));
$('breaks').addEventListener('input', render);

setVB();
render();
})();
