#!/usr/bin/env node
// Verificación de la sección 8 de CONTEXTO.md. Correr con: node verifica.js
// 1. Todo id referenciado existe
// 2. Toda alternativa existe y son exactamente 2 por ejercicio
// 3. Plan v2.0: sin campos de adaptación y todo ejercicio principal con series >= 3
// 4. Las series del visor cuadran con appleWatch.bloques por descansoSeg
const data = require('./plan-emi.json');
const EX = Object.fromEntries(data.ejercicios.map(e => [e.id, e]));
let fallos = 0;
const falla = m => { fallos++; console.error('  ✗ ' + m); };

console.log('1. Ids referenciados');
for (const d of data.dias)
  for (const b of d.bloques || [])
    for (const id of b.ejercicios)
      if (!EX[id]) falla(`${d.dia} / ${b.nombre}: id inexistente "${id}"`);
if (!fallos) console.log('  ✓ todos existen');

console.log('2. Alternativas');
let f2 = fallos;
for (const e of data.ejercicios) {
  if (!Array.isArray(e.alternativas) || e.alternativas.length !== 2)
    falla(`${e.id}: debe tener exactamente 2 alternativas, tiene ${e.alternativas ? e.alternativas.length : 'ninguna'}`);
  else
    for (const a of e.alternativas)
      if (!EX[a]) falla(`${e.id}: alternativa inexistente "${a}"`);
}
if (fallos === f2) console.log('  ✓ exactamente 2 por ejercicio y todas existen');

console.log('3. Fase única y mínimo 3 series');
let f3 = fallos;
for (const e of data.ejercicios) {
  if ('seriesAdaptacion' in e || 'rirAdaptacion' in e) falla(`${e.id}: conserva campos de adaptación (retirados en v2.0)`);
}
for (const d of data.dias) {
  if (d.appleWatch && 'bloquesAdaptacion' in d.appleWatch) falla(`${d.dia}: conserva bloquesAdaptacion`);
  for (const b of d.bloques || []) {
    if (b.tipo !== 'principal') continue;
    for (const id of b.ejercicios)
      if (EX[id] && EX[id].series < 3) falla(`${d.dia}: ${id} tiene ${EX[id].series} series (mínimo 3)`);
  }
}
if (fallos === f3) console.log('  ✓ sin campos de adaptación y todo principal con series ≥ 3');

console.log('4. Series del visor vs bloques del Apple Watch');
// Réplica de la lógica del visor: ns = orig.series, agrupado por descansoSeg
for (const d of data.dias) {
  if (!d.appleWatch) continue;
  const visor = {};
  for (const b of d.bloques) {
    if (b.tipo !== 'principal') continue;
    for (const id of b.ejercicios) {
      const e = EX[id];
      visor[e.descansoSeg] = (visor[e.descansoSeg] || 0) + e.series;
    }
  }
  const reloj = {};
  for (const b of d.appleWatch.bloques || [])
    reloj[b.descansoSeg] = (reloj[b.descansoSeg] || 0) + b.series;
  const fmt = o => Object.keys(o).sort((a, b) => b - a).map(k => `${k}s:${o[k]}`).join(' · ') || '(vacío)';
  if (fmt(visor) === fmt(reloj)) console.log(`  ✓ ${d.dia}: ${fmt(visor)}`);
  else falla(`${d.dia}: visor ${fmt(visor)} ≠ reloj ${fmt(reloj)}`);
}

console.log(fallos ? `\nFALLÓ: ${fallos} problema(s)` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
