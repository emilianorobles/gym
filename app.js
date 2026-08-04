// Visor de rutina — toda la lógica. index.html solo trae la estructura;
// los datos viven en plan-emi.json y se cargan aquí.
// Secciones: carga · estado · tema · hápticos · plantillas · render · interacción.

fetch('./plan-emi.json')
  .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(iniciar)
  .catch(err=>{
    document.getElementById('main').innerHTML=
      `<article class="card"><h2 style="margin:0 0 8px;font-size:18px">No pude cargar el plan</h2>
      <p class="eq" style="margin:0 0 12px">Si estás sin señal, la app necesita abrirse una vez con internet para guardarse. Después ya funciona sin conexión. (${err.message})</p>
      <button class="reset" onclick="location.reload()">Reintentar</button></article>`;
  });

if('serviceWorker' in navigator && location.protocol!=='file:')
  addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));

function iniciar(DATA){
// ===== Datos =====
const EX = Object.fromEntries(DATA.ejercicios.map(e=>[e.id,e]));
const DAYS = DATA.dias.filter(d=>d.dia!=='sabado-o-domingo');
const ABBR = {lunes:['LUN','Inferior A'],martes:['MAR','Superior A'],miercoles:['MIÉ','Cardio'],jueves:['JUE','Inferior B'],viernes:['VIE','Superior B']};
const AUX = {calentamiento:'CAL', cardio:'CAR', enfriamiento:'ENF'};
const CHIPS = new Set(['compuesto','aislamiento','core','cardio']);
const today = () => new Date().toLocaleDateString('sv');
const jsDay = ['','lunes','martes','miercoles','jueves','viernes'][new Date().getDay()] || 'lunes';

// ===== Estado: memoria primero; localStorage como mejor esfuerzo. Si escribir
// truena (file://, modo privado, cuota), la UI sigue funcionando en la sesión.
const mem={};
try{ for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); mem[k]=localStorage.getItem(k);} }catch(e){}
const lee=k=> k in mem ? mem[k] : null;
const guarda=(k,v)=>{mem[k]=String(v); try{localStorage.setItem(k,v)}catch(e){}};
const borra=k=>{delete mem[k]; try{localStorage.removeItem(k)}catch(e){}};

// La fase de adaptacion se retiro (plan v2.0). El valor queda fijo porque kOrd
// genera 'o|{dia}|principal' y asi el orden guardado sobrevive sin migracion.
const fase = 'principal';
let unidad = lee('unidad') || 'kg';
let tema = ['auto','claro','oscuro'].includes(lee('tema')) ? lee('tema') : 'auto';
let zonas = null; try{ zonas=JSON.parse(lee('zonas')||'null') }catch(e){}
let dia = jsDay, animar = true;

const LB=2.20462262;
const aKg=lb=>Math.round(lb/LB*100)/100;
const aLb=kg=>Math.round(kg*LB*2)/2;
const muestraPeso=kgStr=>{const n=parseFloat(kgStr); return isNaN(n)?kgStr:String(unidad==='lb'?aLb(n):n)};

const kSet=(d,n,i)=>`s|${d}|${n}|${i}`, kAlt=(d,n)=>`a|${d}|${n}`, kWt=id=>`w|${id}`;
const kOrd=d=>`o|${d}|${fase}`, kScr=d=>`sc|${d}`;
const getSet=(d,n,i)=>lee(kSet(d,n,i))===today();
const setSet=(d,n,i,on)=>on?guarda(kSet(d,n,i),today()):borra(kSet(d,n,i));
function getAlt(d,n){const v=lee(kAlt(d,n));if(!v)return null;const[f,id]=v.split('@');return f===today()?id:null}
const setAlt=(d,n,id)=>id?guarda(kAlt(d,n),today()+'@'+id):borra(kAlt(d,n));
const menosMovimiento=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== Tema: auto sigue al sistema; claro/oscuro lo fuerzan con data-tema =====
function aplicaTema(){
  if(tema==='auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema=tema;
  btnTema.textContent={auto:'◐',claro:'☀︎',oscuro:'☾'}[tema];
  btnTema.setAttribute('aria-label','Tema: '+tema);
}
btnTema.onclick=()=>{
  tema = tema==='auto'?'claro':tema==='claro'?'oscuro':'auto';
  guarda('tema',tema); vibra(6);
  (document.startViewTransition && !menosMovimiento())
    ? document.startViewTransition(aplicaTema) : aplicaTema();
};

// ===== Hápticos: navigator.vibrate solo existe en Android. En iOS, el click
// programático a un label de <input switch> dispara el Taptic Engine
// (17.4–26.4; Apple lo parchó en 26.5 → ahí queda en silencio, sin romper).
let haptEl=null;
function vibra(p){
  if(navigator.vibrate){ navigator.vibrate(p); return; }
  try{
    if(!haptEl){
      const sw=document.createElement('input'); sw.type='checkbox'; sw.setAttribute('switch','');
      haptEl=document.createElement('label'); haptEl.appendChild(sw);
      haptEl.setAttribute('aria-hidden','true');
      haptEl.style.cssText='position:fixed;top:-99px;left:-99px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(haptEl);
    }
    haptEl.click();
  }catch(e){}
}

// ===== Plantillas =====
// Cardio: tres steppers que componen el mismo formato de texto de siempre
// ("6.5 · 10 · 5") bajo w|{id}. Texto libre viejo no parsea: campos vacíos
// y el valor anterior visible en "última vez".
function tri(id,wt){
  const p=(wt||'').split('·').map(s=>parseFloat(s));
  const v=[0,1,2].map(i=>isNaN(p[i])?'':p[i]);
  const et=[['vel','km/h'],['incl','%'],['nivel','']], pasos=[0.5,1,1];
  return `<div class="tri" data-w3="${id}">
    ${et.map(([t,u],i)=>`<div class="fila"><span class="lbl">${t}${u?` <u>${u}</u>`:''}</span>
      <button class="stp" data-stp="-1" aria-label="Bajar ${t}">−</button>
      <input type="number" inputmode="decimal" step="${pasos[i]}" min="0" data-paso="${pasos[i]}" value="${v[i]}">
      <button class="stp" data-stp="1" aria-label="Subir ${t}">+</button></div>`).join('')}
    <span class="ultima">${wt?'última vez: '+wt:'primera vez'}</span></div>`;
}

function tarjeta(orig, slot, esFuerza, badge, ix){
  const altId=getAlt(dia,slot), e=altId?EX[altId]:orig;
  const ns = esFuerza ? orig.series : 1;
  const hechas=[...Array(ns)].filter((_,i)=>getSet(dia,slot,i)).length;
  const rango = e.repsMin===e.repsMax ? e.repsMin : e.repsMin+'–'+e.repsMax;
  const uni = e.unidadReps||'reps', rir = orig.rir;
  const wt = lee(kWt(e.id));
  const esCardio = e.tipo==='cardio' || e.id==='calentamiento-cardio-suave';
  const conChips = CHIPS.has(e.tipo) || e.id==='calentamiento-cardio-suave';
  const opciones=[orig.id,...orig.alternativas], et=['Prescrito','Si está ocupado','Otra opción'];
  const big = esFuerza ? `${ns}<i> × </i>${rango}${uni!=='reps'?` <u>${uni}</u>`:''}` : `${rango} <u>${uni}</u>`;
  const zTxt = zonas ? `zona 2 · FC <b>${zonas.z2min}–${zonas.z2max}</b> lpm<br>según tu reloj`
    : 'zona 2 · hablas en frases<br>completas pero no cantas';
  const side = esFuerza ? `series × ${uni==='reps'?'reps':uni}<br>descanso <b>${orig.descansoSeg}s</b> · RIR <b>${rir}</b>`
    : (esCardio ? zTxt : 'sostenido, sin rebotes');

  return `<article class="card ${hechas===ns?'done':''} ${altId?'swapped':''} ${esFuerza?'':'aux'}"
      style="--i:${ix}" data-n="${slot}" data-ns="${ns}" data-desc="${orig.descansoSeg}" ${esFuerza?'data-drag="1"':''}>
    <div class="top"><div class="idx ${esFuerza?'':'aux'}">${badge}</div>
      <div class="nm">${altId?'<span class="tag">Sustituto</span>':''}
        <h2>${e.nombre.es}</h2><em>${e.nombre.en}</em></div>
      ${esFuerza?'<button class="grip" aria-label="Mover ejercicio"><i></i></button>':''}</div>
    <p class="eq">${e.equipo}</p>
    <div class="spec"><div class="big">${big}</div><div class="side">${side}</div></div>
    ${esFuerza?'':`<p class="rut">${e.notaPesoInicial}</p>`}
    ${conChips?`<div class="swap"><span class="lbl">Aparato</span><div class="chips">
      ${opciones.map((id,k)=>`<button class="chip" data-swap="${id}" aria-pressed="${id===e.id}"><u>${et[k]}</u>${EX[id].nombre.es}</button>`).join('')}
    </div></div>`:''}
    <div class="sets">${esFuerza
      ? [...Array(ns)].map((_,i)=>`<button class="set" data-i="${i}" aria-pressed="${getSet(dia,slot,i)}">${i+1}</button>`).join('')
      : `<button class="set wide" data-i="0" aria-pressed="${getSet(dia,slot,0)}">${hechas?'Hecho':'Marcar hecho'}</button>`}</div>
    ${esFuerza?`<div class="wt">
      <button class="stp" data-stp="-1" aria-label="Bajar peso">−</button>
      <div class="valor"><input type="number" inputmode="decimal" step="0.5" min="0"
        placeholder="hoy" value="${wt!=null?muestraPeso(wt):''}" data-w="${e.id}"><span class="suf">${unidad}</span></div>
      <button class="stp" data-stp="1" aria-label="Subir peso">+</button>
      <span class="ultima">${wt!=null?'última vez: '+muestraPeso(wt)+' '+unidad:'primera vez'}</span></div>`
    : esCardio?tri(e.id,wt):''}
    <details><summary>Técnica y errores</summary><div class="det">
      ${esFuerza?`<div class="first"><strong>Peso inicial:</strong> ${e.notaPesoInicial}</div>`:''}
      <h4>Cómo se hace</h4><ul>${e.cues.map(c=>`<li>${c}</li>`).join('')}</ul>
      <h4>Ajuste</h4><p style="margin:0">${e.ajusteMaquina}</p>
      <h4>Errores comunes</h4><ul>${e.erroresComunes.map(c=>`<li>${c}</li>`).join('')}</ul>
    </div></details></article>`;
}

// ===== Render =====
function render(restaurar){
  days.innerHTML = DAYS.map(d=>{const[a,b]=ABBR[d.dia];
    return `<button class="day" role="tab" data-d="${d.dia}" aria-selected="${d.dia===dia}"><b>${a}</b><s>${b}</s></button>`}).join('');
  uKg.setAttribute('aria-pressed',unidad==='kg'); uLb.setAttribute('aria-pressed',unidad==='lb');
  const d = DAYS.find(x=>x.dia===dia);
  ttl.textContent=d.enfoque;
  sub.textContent=`${d.horaRecomendada}  ·  respaldo ${d.horaRespaldo||'—'}  ·  ${d.duracionTotalMin} min`;
  const aw=d.appleWatch?d.appleWatch.bloques:[];
  watch.innerHTML = aw.length
    ? aw.map((b,i)=>`<div class="blk"><div class="lbl">Bloque ${i+1}</div><div class="n">⟳ ${b.series} <span>· ${b.descansoSeg}s</span></div></div>`).join('')
    : '<div class="blk"><div class="n" style="font-size:14px">Sin bloques</div></div>';

  // construir items en orden natural, luego aplicar el orden guardado a los de fuerza
  let slot=0, num=0, items=[];
  d.bloques.forEach(b=>b.ejercicios.forEach(rawId=>{
    slot++; const esFuerza=b.tipo==='principal'; const orig=EX[rawId];
    items.push({slot, esFuerza, orig, badge: esFuerza?String(++num).padStart(2,'0'):AUX[b.tipo]});
  }));
  const guardado = JSON.parse(lee(kOrd(dia))||'null');
  if(guardado){
    const fuerza = items.filter(i=>i.esFuerza);
    const ord = guardado.filter(s=>fuerza.some(i=>i.slot===s))
              .concat(fuerza.filter(i=>!guardado.includes(i.slot)).map(i=>i.slot));
    let k=0; items = items.map(i=> i.esFuerza ? fuerza.find(f=>f.slot===ord[k++]) : i);
  }
  main.classList.toggle('anima', animar && !menosMovimiento()); animar=false;
  main.innerHTML = items.map((it,ix)=>tarjeta(it.orig,it.slot,it.esFuerza,it.badge,ix)).join('');
  marca(); progreso(); avisoOrden();
  if(restaurar){ const y=+lee(kScr(dia))||0; requestAnimationFrame(()=>scrollTo(0,y)); }
}
function cambiaDia(nuevo){
  const go=()=>{ dia=nuevo; animar=true; render(false); scrollTo(0,0); };
  (document.startViewTransition && !menosMovimiento()) ? document.startViewTransition(go) : go();
}
function marca(){const c=[...main.querySelectorAll('.card')];c.forEach(x=>x.classList.remove('now'));
  (c.find(x=>!x.classList.contains('done'))||{classList:{add(){}}}).classList.add('now')}
function progreso(){
  const tot=[...main.querySelectorAll('.set')], hechos=tot.filter(x=>x.getAttribute('aria-pressed')==='true').length;
  fill.style.width = tot.length ? (hechos/tot.length*100)+'%' : '0%';
  fill.classList.toggle('lleno', tot.length>0 && hechos===tot.length);
  pct.textContent = `${hechos}/${tot.length}`;
}
function avisoOrden(){
  const d=[...main.querySelectorAll('.card[data-drag]')].map(c=>+c.dataset.desc);
  let roto=false; for(let i=1;i<d.length;i++) if(d[i]>d[i-1]) roto=true;
  aviso.innerHTML = roto
    ? `<div class="warn"><b>Ojo:</b> mezclaste ejercicios de 90 s y de 60 s. Los bloques de tu Apple Watch van en orden (primero todos los de 90 s), así que el descanso que te marque ya no va a coincidir. Reordena dentro del mismo grupo, o guíate por el descanso que dice cada tarjeta.</div>` : '';
}

// ===== Drag & drop (solo tarjetas de fuerza) =====
let drag=null;
main.addEventListener('pointerdown', ev=>{
  const g=ev.target.closest('.grip'); if(!g) return;
  ev.preventDefault();
  const card=g.closest('.card');
  drag={card, y:ev.clientY};
  card.classList.add('grab');
  g.setPointerCapture(ev.pointerId);
  vibra(10);
},{passive:false});
main.addEventListener('pointermove', ev=>{
  if(!drag) return; ev.preventDefault();
  const dy=ev.clientY-drag.y;
  drag.card.style.transform=`translateY(${dy}px)`;
  const r=drag.card.getBoundingClientRect(), mid=r.top+r.height/2;
  for(const s of main.querySelectorAll('.card[data-drag]')){
    if(s===drag.card) continue;
    const q=s.getBoundingClientRect();
    if(mid>q.top && mid<q.bottom){
      const abajo = drag.card.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING;
      s.parentNode.insertBefore(drag.card, abajo ? s.nextSibling : s);
      drag.y=ev.clientY; drag.card.style.transform='';
      vibra(6);
      break;
    }
  }
},{passive:false});
function soltar(){
  if(!drag) return;
  drag.card.classList.remove('grab'); drag.card.style.transform='';
  guarda(kOrd(dia), JSON.stringify([...main.querySelectorAll('.card[data-drag]')].map(c=>+c.dataset.n)));
  drag=null; marca(); avisoOrden();
}
addEventListener('pointerup',soltar); addEventListener('pointercancel',soltar);

// ===== Captura de peso / cardio =====
function pintaUltima(cont,txt){ const s=cont.querySelector('.ultima'); if(s) s.textContent=txt; }
function guardaPesoFuerza(inp){
  const v=inp.value.trim(), id=inp.dataset.w;
  if(!v){ borra(kWt(id)); pintaUltima(inp.closest('.wt'),'primera vez'); return; }
  const n=parseFloat(v); if(isNaN(n)) return;
  const kg = unidad==='lb' ? aKg(n) : Math.round(n*100)/100;
  guarda(kWt(id), kg);
  pintaUltima(inp.closest('.wt'),'última vez: '+muestraPeso(String(kg))+' '+unidad);
}
function guardaCardio(cont){
  const id=cont.dataset.w3, vals=[...cont.querySelectorAll('input')].map(i=>i.value.trim());
  if(vals.every(v=>!v)){ borra(kWt(id)); pintaUltima(cont,'primera vez'); return; }
  const txt=vals.map(v=>v||'–').join(' · ');
  guarda(kWt(id), txt);
  pintaUltima(cont,'última vez: '+txt);
}

// ===== Interacción principal =====
main.addEventListener('click', ev=>{
  const st=ev.target.closest('.stp');
  if(st){
    const inp=st.parentElement.querySelector('input');
    const paso = inp.dataset.w ? (unidad==='lb'?5:2.5) : (+inp.dataset.paso||1);
    inp.value=Math.max(0, Math.round(((parseFloat(inp.value)||0)+(+st.dataset.stp)*paso)*4)/4);
    inp.dataset.w ? guardaPesoFuerza(inp) : guardaCardio(inp.closest('.tri'));
    vibra(6);
    return;
  }
  const chip=ev.target.closest('.chip');
  if(chip){
    const card=chip.closest('.card'), n=+card.dataset.n;
    const orig=chip.parentElement.firstElementChild.dataset.swap;
    setAlt(dia,n, chip.dataset.swap===orig?null:chip.dataset.swap);
    vibra(12);
    const y=card.getBoundingClientRect().top; render(false);
    const nc=main.querySelector(`.card[data-n="${n}"]`);
    if(nc) scrollBy(0, nc.getBoundingClientRect().top-y);
    return;
  }
  const b=ev.target.closest('.set'); if(!b) return;
  const card=b.closest('.card'), n=+card.dataset.n, i=+b.dataset.i, ns=+card.dataset.ns;
  const on=b.getAttribute('aria-pressed')!=='true';
  b.setAttribute('aria-pressed',on); setSet(dia,n,i,on);
  if(b.classList.contains('wide')) b.textContent = on?'Hecho':'Marcar hecho';
  const hechas=[...card.querySelectorAll('.set')].filter(x=>x.getAttribute('aria-pressed')==='true').length;
  card.classList.toggle('done', hechas===ns);
  marca(); progreso();
  vibra(on?18:8);
  if(on){ const t=[...main.querySelectorAll('.set')];
    if(t.length && t.every(x=>x.getAttribute('aria-pressed')==='true')) celebra(); }
});
main.addEventListener('change', ev=>{
  const inp=ev.target; if(inp.tagName!=='INPUT') return;
  if(inp.dataset.w) guardaPesoFuerza(inp);
  else if(inp.closest('.tri')) guardaCardio(inp.closest('.tri'));
});

// ===== Celebración: sin sonido a propósito; solo en la transición a día
// completo (nunca al cargar). Con reduced-motion queda solo el toast.
function celebra(){
  const toast=document.createElement('div'); toast.className='toast'; toast.textContent='¡Día completo! 💪';
  document.body.appendChild(toast); setTimeout(()=>toast.remove(),2600);
  vibra([30,60,30]);
  if(menosMovimiento()) return;
  const cv=document.createElement('canvas'); cv.className='fx'; document.body.appendChild(cv);
  const dpr=devicePixelRatio||1, W=innerWidth, H=innerHeight;
  cv.width=W*dpr; cv.height=H*dpr;
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  const cols=['#E4F14E','#A855C4','#4ED8E0','#F2A03D','#F4EFF7'], p=[];
  for(let b=0;b<3;b++){
    const cx=W*(0.25+0.25*b), cy=H*(0.2+0.12*(b%2)), t0=b*260;
    for(let i=0;i<26;i++){
      const a=Math.PI*2*i/26+Math.random()*.25, v=2.2+Math.random()*2.4;
      p.push({cx,cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t0,c:cols[(Math.random()*cols.length)|0],r:1.6+Math.random()*1.7});
    }
  }
  let ini;
  requestAnimationFrame(function paso(ts){
    if(ini===undefined) ini=ts; const t=ts-ini;
    ctx.clearRect(0,0,W,H);
    for(const q of p){
      const lt=t-q.t0; if(lt<0||lt>1500) continue;
      const s=lt/16.7;
      ctx.globalAlpha=1-lt/1500; ctx.fillStyle=q.c;
      ctx.beginPath(); ctx.arc(q.cx+q.vx*s, q.cy+q.vy*s+0.045*s*s, q.r, 0, 7); ctx.fill();
    }
    t<2100 ? requestAnimationFrame(paso) : cv.remove();
  });
}

// ===== Controles globales =====
let t=0;
addEventListener('scroll',()=>{ if(drag) return; clearTimeout(t);
  t=setTimeout(()=>guarda(kScr(dia), Math.round(scrollY)),160)},{passive:true});
days.addEventListener('click',ev=>{const b=ev.target.closest('.day');
  if(b && b.dataset.d!==dia){ vibra(6); cambiaDia(b.dataset.d); }});
uKg.onclick=()=>{ if(unidad!=='kg'){unidad='kg';guarda('unidad',unidad);render(false)} };
uLb.onclick=()=>{ if(unidad!=='lb'){unidad='lb';guarda('unidad',unidad);render(false)} };
reset.onclick=()=>{
  if(!confirm('¿Borrar lo marcado y los aparatos sustituidos de hoy? Los pesos se conservan.')) return;
  Object.keys(mem).filter(k=>k.startsWith('s|'+dia+'|')||k.startsWith('a|'+dia+'|')).forEach(borra);
  render(false);
};
orden.onclick=()=>{ borra(kOrd(dia)); render(false); };
exportar.onclick=()=>{
  const datos={...mem};
  const payload={app:'rutina-gym',esquema:1,planVersion:DATA.plan.version,exportadoEl:new Date().toISOString(),datos};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`rutina-respaldo-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// ===== Zona 2 real del Apple Watch (el reloj usa % de reserva de FC) =====
function pintaZonas(){ z2min.value=zonas?zonas.z2min:''; z2max.value=zonas?zonas.z2max:''; }
function guardaZonas(){
  const a=parseInt(z2min.value), b=parseInt(z2max.value);
  if(a>0&&b>0){ zonas={z2min:a,z2max:b}; guarda('zonas',JSON.stringify(zonas)); }
  else if(!z2min.value&&!z2max.value){ zonas=null; borra('zonas'); }
  render(false);
}
zdet.addEventListener('click',ev=>{
  const st=ev.target.closest('.stp'); if(!st) return;
  const inp=document.getElementById(st.dataset.zf);
  const semilla=st.dataset.zf==='z2min'?125:140;
  inp.value=Math.max(0,(parseInt(inp.value)||semilla)+(+st.dataset.stp));
  vibra(6); guardaZonas();
});
zdet.addEventListener('change',ev=>{ if(ev.target.tagName==='INPUT') guardaZonas(); });

// ===== Arranque =====
aplicaTema(); pintaZonas();
render(true);
}
