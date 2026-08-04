# Contexto del proyecto — visor de rutina de gym

Documento de traspaso. Léelo antes de tocar código.

---

## 1. Qué es esto

Un visor web de una sola pantalla que uso **en el celular, en el gym, entre series**. No es una app de fitness genérica: es la rutina de una sola persona (yo), en un solo gimnasio (Planet Fitness Plaza Candiles, Querétaro), con el inventario de máquinas de esa sucursal.

Soy principiante absoluto en pesas. El plan es de 5 días (torso/pierna), sesiones de 60 minutos, con dos fases: semanas 1–2 con menos series, y semana 3 en adelante con el volumen completo.

**El caso de uso real:** estoy parado frente a una máquina, con una mano, sudado, y necesito saber en 3 segundos qué ejercicio sigue, cuántas series me faltan y qué peso levanté la última vez. Todo lo demás es secundario a eso.

**Lo que quiero hacer:** seguir iterando sobre el HTML hasta convertirlo en una app de verdad.

---

## 2. Los tres archivos

| Archivo | Qué es | ¿Lo consume el código? |
|---|---|---|
| **`plan-emi.json`** | **La fuente de la verdad.** Todo el plan estructurado: días, bloques, 48 ejercicios con sus cues, alternativas y prescripción. | **Sí. Es de donde sale todo.** |
| **`index.html`** | Estructura del visor. Carga `styles.css` y `app.js`; los datos vienen de `plan-emi.json` vía `fetch`. | Es el producto. |
| **`styles.css`** | Sistema de diseño: tokens, tema claro/oscuro, chrome glass, componentes, motion. | Sí. |
| **`app.js`** | Toda la lógica del visor (estado, render, interacción, hápticos, tema). | Sí. |
| **`plan-emi.md`** | El plan completo en prosa (~40 páginas): diagnóstico, por qué cada decisión, alimentación, métricas, progresión, cómo configurar el Apple Watch. | No. Es la referencia humana del *por qué*. |

### Cómo se relacionan hoy

**Resuelto (2026-07-31) con la opción A:** el HTML ya no lleva el JSON inyectado; hace `fetch('./plan-emi.json')` al cargar. Se conservó el nombre `plan-emi.json` (no se renombró a `plan.json`) para no duplicar ni perder historial de git. Se perdió la propiedad de "un solo archivo por AirDrop"; a cambio, `sw.js` cachea `index.html` y el JSON, así que después de la primera visita la app abre sin señal.

El service worker es cache-primero con actualización en segundo plano: un cambio a `index.html` o `plan-emi.json` aparece en la **siguiente** carga, no en la actual.

---

## 3. Esquema del JSON

```
{
  plan:      { nombre, version, fechaGeneracion, semanas, objetivo, notaVersion }
  dias:      [ { dia, enfoque, horaRecomendada, horaRespaldo, notaMultitudes,
                 duracionTotalMin,
                 bloques: [ { tipo, nombre, duracionMin, ejercicios: [id...] } ],
                 appleWatch: { nota, bloques: [{series, descansoSeg}] } } ]
  ejercicios:[ { id, nombre:{es,en}, equipo, tipo, enPlan,
                 series, repsMin, repsMax, unidadReps,
                 descansoSeg, rir, incrementoSugerido,
                 contencionHoraPico, ajusteMaquina, notaPesoInicial,
                 musculos[], cues[], erroresComunes[], fotoUrl, alternativas[2] } ]
  progresion:{ ... }   // no lo usa el visor todavía
  nutricion: { ... }   // no lo usa el visor todavía
  metricas:  [ ... ]   // no lo usa el visor todavía
}
```

**Valores de enums:**
- `bloques[].tipo`: `calentamiento` · `principal` · `cardio` · `enfriamiento`
- `ejercicios[].tipo`: `compuesto` · `aislamiento` · `core` · `cardio` · `calentamiento` · `enfriamiento`
- `unidadReps`: `reps` · `seg` · `por lado` · `min`
- `contencionHoraPico`: `alta` · `media` · `baja` (qué tan peleado está el aparato en hora pico; el visor todavía no lo usa)

**34 ejercicios con `enPlan: true`** (están en algún día) y **18 con `false`** (existen solo como alternativas; incluyen los 4 que salieron del plan en v2.0 — extensión de piernas, curl de bíceps en máquina, máquina de glúteos y prensa de tríceps — con su historial de pesos intacto).

### Invariantes que NO se deben romper

1. **Los `id` son slugs estables y son la llave de todo lo que guardo.** Si renombras un `id`, pierdo el historial de pesos de ese aparato. Al ajustar el plan, conserva los `id` que sobrevivan y crea nuevos solo para lo que de verdad cambie.
2. **`alternativas` siempre tiene exactamente 2 elementos**, y ambos existen en `ejercicios`. El visor asume esto para dibujar los 3 chips (prescrito + 2). Hay una verificación en el punto 8.
3. **`unidadReps: 'min'` significa que `repsMin`/`repsMax` son minutos, no repeticiones.** Aplica a cardio, calentamiento y enfriamiento. `'seg'` aplica a la plancha.
4. ~~`seriesAdaptacion: 0` es una bandera~~ **Histórico (retirado en v2.0, 2026-08-04):** la fase de adaptación ya no existe; `seriesAdaptacion`, `rirAdaptacion` y `bloquesAdaptacion` se eliminaron del esquema. `verifica.js` falla si reaparecen.

---

## 4. Cómo funciona el visor

### Render
Itera `dia.bloques` **en el orden del JSON** (no agrupado por tipo — eso era un bug ya corregido; el cardio del miércoles va en segundo lugar, no al final) y emite una tarjeta por ejercicio.

Dos tipos de tarjeta:
- **Fuerza** (`bloque.tipo === 'principal'`): insignia numérica `01`–`06`, pastillas de series, campo de kg, agarre para arrastrar.
- **Auxiliar** (calentamiento / cardio / enfriamiento): insignia de texto `CAL` / `CAR` / `ENF` en cyan, un botón ancho de *Marcar hecho*, la rutina en texto. Las de cardio traen campo de texto para `vel · inclinación · nivel`.

### El concepto de "slot"

`slot` = contador 1-based sobre **todos** los ejercicios del día, en orden del JSON, incluidos los auxiliares.
`badge` = contador 1-based **solo** de los de tipo `principal`.

Son distintos a propósito. El slot es identidad; el badge es presentación.

### Reparto de identidad — esto es la decisión de diseño central

| Dato | Pertenece a | Por qué |
|---|---|---|
| Series, descanso, RIR | **el slot** (la prescripción) | Para que los bloques del Apple Watch sigan cuadrando aunque sustituya el aparato |
| Reps, nombre, cues, ajuste, errores | **el ejercicio activo** | Cada movimiento tiene su propio rango y su propia técnica |
| Palomitas de series | **el slot** | Si llevo 1 de 2 series y la máquina se ocupa, cambio de aparato sin perder la serie |
| Peso levantado | **el ejercicio** (`id`) | Otra máquina, otro peso. La prensa y la sentadilla no se mezclan |

### localStorage — NO cambies estas llaves sin migración

```
fase                      → RETIRADA (v2.0). Puede existir con valor viejo; la app la ignora.
                            OJO: kOrd sigue generando 'o|{dia}|principal' A PROPÓSITO (sin migración)
unidad                    → 'kg' | 'lb'   solo presentación; w| SIEMPRE guarda kg canónicos
tema                      → 'auto' | 'claro' | 'oscuro'   auto sigue prefers-color-scheme
zonas                     → JSON {"z2min":125,"z2max":140}   zona 2 real del Apple Watch
s|{dia}|{slot}|{i}        → 'YYYY-MM-DD'   serie marcada; solo cuenta si === hoy (se limpia sola cada día)
a|{dia}|{slot}            → 'YYYY-MM-DD@ejercicioId'   aparato sustituido, también expira diario
w|{ejercicioId}           → string   peso en kg (fuerza) o "vel · incl · nivel" (cardio; '–' = vacío,
                            los valores viejos de texto libre se muestran pero no parsean). PERMANENTE
o|{dia}|{fase}            → JSON array de slots   orden personalizado del drag & drop. Permanente
sc|{dia}                  → int   posición del scroll
```

**Blindaje (2026-07-31):** el JS nunca toca `localStorage` directo; todo pasa por `lee/guarda/borra`,
que operan sobre un objeto en memoria y persisten como mejor esfuerzo (try/catch). Si escribir truena
(file://, modo privado, cuota), la UI sigue funcionando en la sesión. Ese era el bug de "los chips de
alternativas no responden" en la copia AirDrop: `setAlt` era la primera línea del handler y su
excepción mataba el tap.

`{dia}` es la llave en minúsculas y sin acento: `lunes` · `martes` · `miercoles` · `jueves` · `viernes`.

**`w|` es el único dato irreemplazable.** Si vas a cambiar el esquema, escribe la migración primero.

### Fragilidad conocida del esquema
El `slot` depende de la posición dentro de `dia.bloques`. **Si cambia la estructura de un día, los slots se recorren y las palomitas del día se desalinean.** No es catastrófico (expiran diario) pero es feo. Vale la pena migrar a una llave compuesta tipo `{dia}|{idOriginalDelEjercicio}`.

---

## 5. Decisiones deliberadas — no las "arregles"

Cada una tiene una razón. Si vas a cambiarlas, cámbialas a propósito.

1. **No hay temporizador de descanso, y es a propósito.** Lo maneja mi Apple Watch con entrenamientos personalizados nativos. El reloj corre bloques de `Ejercicio Libre + Recuperación por tiempo`, vibra al terminar, y me muestra "4 de 6" — que además es mi contador de series. Meter un timer al visor duplicaría eso.

2. **Los descansos son solo 90 s y 60 s.** Antes eran 90/75/60/45. Se colapsaron porque (a) la diferencia entre 75 y 90 s es ruido para un principiante y (b) así **cada día cabe en exactamente dos bloques repetidos del Apple Watch**. Los ejercicios están ordenados con todos los de 90 s primero. Esa segunda razón es la importante: si vuelves a introducir valores intermedios, rompes la configuración del reloj.

3. **El drag & drop no cambia el número de la tarjeta.** Arrastrar el `03` arriba lo deja siendo `03`. Así la tarjeta sigue coincidiendo con las tablas del MD.

4. **Las tarjetas auxiliares no se arrastran.** Mover el enfriamiento al inicio no sirve de nada.

5. **Hay un aviso ámbar cuando el reorden mezcla los grupos de 90 s y 60 s.** Es la consecuencia real de reordenar: el reloj corre los bloques en orden y no sabe que cambié el orden. Reordenar *dentro* del mismo grupo no rompe nada, y ahí cae casi todo el caso real.

6. **Solo fuentes del sistema, cero peticiones de red.** El gym tiene señal mala. Nada de Google Fonts, nada de CDN. Toda la personalidad sale de peso, tamaño y tracking.

7. **`localStorage` sin backend.** Un usuario, un dispositivo. No hay cuentas ni sincronización, y por ahora no las necesito.

8. ~~El toggle de fase es manual~~ **Retirado (2026-08-04):** el usuario terminó la adaptación en la semana 2 por decisión propia y el plan pasó a fase única (v2.0). El segmentado desapareció del header.

8b. **En la máquina asistida (dominadas/fondos) el peso guardado en `w|` es la AYUDA, no la carga.** Más placa = más fácil; progresar = bajar placas. Está documentado en los cues del ejercicio; no lo "corrijas" al ver que el número baja con el tiempo.

9. **Los pesos se guardan en kg canónicos aunque el toggle esté en lb.** La conversión es solo de pantalla (entrada en lb → kg redondeado a 2 decimales; salida → lb redondeada a 0.5). Así el historial `w|` nunca se contamina de unidades mezcladas.

10. **Sin IA por ahora (decidido 2026-07-31).** La progresión doble es una regla determinista y no necesita un modelo; un chat/informe de IA solo tendrá algo que analizar cuando exista el historial por sesión (rumbo #2). Cuando llegue, la vía barata es un botón "informe para IA" que copia plan+datos al portapapeles para pegarse en cualquier app de IA — cero API, cero costo. No integrar APIs de pago ni keys en el repo (es público).

11. **Las zonas de FC vienen del reloj, no de fórmulas.** El Apple Watch calcula zonas con % de reserva de FC (Karvonen con FC en reposo real); la fórmula por edad (113–132) quedaba abajo y por eso no cuadraba. El usuario copia su zona 2 una vez en "Zona 2 de tu reloj ⚙" (tarjeta Apple Watch) y las tarjetas de cardio muestran ese rango.

12. **La celebración de día completo no tiene sonido a propósito** y solo dispara en la transición a completo dentro de la sesión (nunca al cargar). Con `prefers-reduced-motion` solo sale el toast, sin fuegos.

13. **El chrome (header y tab bar) es oscuro en AMBOS temas, a propósito.** En PWA standalone la barra de estado de iOS (`black-translucent`) usa texto blanco; si el header fuera claro, la hora y la batería serían ilegibles. Además conserva la identidad neón. Solo el contenido cambia de tema.

14. **La tab bar de días va abajo (cápsula flotante)** porque el caso de uso es una mano entre series: la zona del pulgar está abajo. Patrón de iOS 26. Lleva `env(safe-area-inset-bottom)` para el home indicator.

15. **Hápticos:** `vibra()` en app.js usa `navigator.vibrate` (solo Android) y, en iOS, el click programático a un label de `<input type="checkbox" switch>` que dispara el Taptic Engine. Funciona en iOS 17.4–26.4; **Apple lo parchó en iOS 26.5** — ahí queda en silencio sin romper nada. No hay forma oficial de vibrar desde web en iOS.

16. **El motion usa el stack de Safari 26** — View Transitions same-document al cambiar de día/tema, `@starting-style`-style entrada con stagger (clase `.anima`, solo en carga y cambio de día, no en re-renders por interacción), `interpolate-size`/`::details-content` para animar los plegados. Todo con fallback silencioso y apagado bajo `prefers-reduced-motion`.

---

## 6. Deuda técnica y cosas que faltan

**Alto (arréglalo pronto)**
- ~~El JSON duplicado~~ ✓ Resuelto 2026-07-31: `fetch('./plan-emi.json')`, ver sección 2.
- ~~Sin service worker~~ ✓ Resuelto 2026-07-31: `sw.js`, cache-primero con actualización en segundo plano.
- ~~Sin exportar/respaldar~~ ✓ Resuelto 2026-07-31: botón "Exportar mis datos" en el footer descarga todo el localStorage como JSON (`{app, esquema, planVersion, exportadoEl, datos}`).
- ~~Todo es un solo archivo~~ ✓ Resuelto 2026-07-31: `index.html` + `styles.css` + `app.js` (sin build). El render sigue siendo `innerHTML` completo por acción — aceptable a esta escala; si crece, migrar a render por tarjeta.

**Medio**
- El historial de pesos solo guarda **el último** valor. No hay serie temporal, así que no puedo ver progresión ni detectar estancamiento — que es justo lo que el plan me pide revisar cada 4 semanas.
- El campo de peso es uno por ejercicio, no uno por serie. En la práctica a veces bajo peso en la última serie.
- El respaldo se exporta pero no hay importación: restaurar un respaldo es manual (volcar `datos` a localStorage llave por llave).
- `contencionHoraPico` está en el JSON y no se usa. Podría marcar qué aparatos se atoran a esa hora.
- `fotoUrl` está en todos los ejercicios y siempre es `null`. La idea era una foto de la máquina real de Candiles.
- Los bloques `nutricion`, `metricas` y `progresion` del JSON no se usan. Son pantallas futuras.
- Sin registro de las métricas corporales (peso, cintura) que el plan pide semanalmente.

**Bajo**
- Sin accesibilidad revisada (foco, lectores de pantalla).
- Sin tests.
- El drag no auto-scrollea al llegar al borde de la pantalla.

---

## 7. Rumbo que quiero

En orden:

1. **Estabilizar la base:** separar el JSON, service worker, exportar datos.
2. **Historial de verdad:** `{ejercicioId, fecha, serie, peso, reps}` como registro atómico en vez de "último peso". De ahí salen gráficas y detección de estancamiento.
3. **Progresión automática:** el plan usa doble progresión (cuando completo todas las series en el tope del rango con el RIR objetivo, subo peso la siguiente sesión). El visor tiene los datos para sugerírmelo solo.
4. **Registro corporal:** peso, cintura, % de grasa, con la revisión de cada 4 semanas.
5. **Módulo de nutrición** desde el bloque `nutricion` del JSON (macros y plantillas de comidas intercambiables).
6. Eventualmente esto vive como módulo de una app iOS propia (SwiftUI) que ya tengo para ayuno y conteo de calorías. **No diseñes para eso todavía**, pero mantén el modelo de datos portable.

---

## 8. Verificación que debe seguir pasando

Vive en `verifica.js` (sin dependencias): `node verifica.js`. Replica la lógica del visor (`base()` y el cálculo de series de `tarjeta()`).

```js
// 1. Todo id referenciado existe
// 2. Toda alternativa existe y son exactamente 2 por ejercicio
// 3. v2.0: sin campos de adaptación, y todo ejercicio principal con series >= 3
// 4. Las series que muestra el visor deben cuadrar con appleWatch.bloques,
//    agrupadas por descansoSeg. Esto es la prueba crítica: si se rompe,
//    mi reloj me marca descansos equivocados.
```

Valores esperados hoy (series por `descansoSeg`, plan v2.0 de fase única):

| Día | Bloques |
|---|---|
| lunes | 90s:9 · 60s:6 |
| martes | 90s:15 · 60s:3 |
| miercoles | 60s:9 |
| jueves | 90s:9 · 60s:9 |
| viernes | 90s:12 · 60s:6 |

---

## 9. Restricciones

- **Objetivo: Safari en iPhone.** Se usa como app agregada a la pantalla de inicio.
- **Se hospeda en GitHub Pages:** `https://emilianorobles.github.io/gym/`. Estático, sin backend, sin secretos. (Ojo: si el repo se vuelve privado, Pages se desactiva y NO se reactiva solo al volverlo público — pasó en julio 2026.) La vía "un archivo por AirDrop" quedó retirada: con el JSON separado, `fetch` no funciona en `file://`.
- **Un solo usuario.** No agregues autenticación ni multiusuario.
- **Español**, sistema métrico, nombres de ejercicio en español con el inglés abajo (las máquinas están etiquetadas en inglés).
- **La legibilidad de un vistazo gana sobre la densidad de información.** Si algo requiere que me detenga a leer, va plegado o no va.
