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
| **`index.html`** | El visor. Autocontenido: CSS, JS y **el JSON completo inyectado como `const DATA`**. | Es el producto. |
| **`plan-emi.md`** | El plan completo en prosa (~40 páginas): diagnóstico, por qué cada decisión, alimentación, métricas, progresión, cómo configurar el Apple Watch. | No. Es la referencia humana del *por qué*. |

### Cómo se relacionan hoy (y el problema #1 a resolver)

El `index.html` se generaba con un script de Python que leía `plan-emi.json` y lo inyectaba minificado dentro de un `<script>`. **Ese script no está en el repo**, así que ahora mismo el JSON vive duplicado: el archivo suelto y el blob dentro del HTML.

**Eso hay que arreglarlo antes que nada.** Dos opciones:

- **A) Separar:** `plan.json` como archivo aparte y `fetch('./plan.json')` en el HTML. Limpio, editable, funciona en GitHub Pages. Se pierde la propiedad de "un solo archivo que puedo mandarme por AirDrop".
- **B) Build step:** un script de Node que inyecte el JSON en el HTML (`npm run build`). Conserva el archivo único, agrega una dependencia de build.

Yo me inclino por **A**, y si algún día necesito el archivo único, agrego un service worker que cachee ambos.

---

## 3. Esquema del JSON

```
{
  plan:      { nombre, version, fechaGeneracion, fase, semanas, semanasAdaptacion, objetivo, notaFases, notaVersion }
  dias:      [ { dia, enfoque, horaRecomendada, horaRespaldo, notaMultitudes,
                 duracionTotalMin,
                 bloques: [ { tipo, nombre, duracionMin, ejercicios: [id...] } ],
                 appleWatch: { nota, bloques: [{series, descansoSeg}], bloquesAdaptacion: [...] } } ]
  ejercicios:[ { id, nombre:{es,en}, equipo, tipo, enPlan,
                 series, seriesAdaptacion, repsMin, repsMax, unidadReps,
                 descansoSeg, rir, rirAdaptacion, incrementoSugerido,
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

**34 ejercicios con `enPlan: true`** (están en algún día) y **14 con `false`** (existen solo como alternativas).

### Invariantes que NO se deben romper

1. **Los `id` son slugs estables y son la llave de todo lo que guardo.** Si renombras un `id`, pierdo el historial de pesos de ese aparato. Al ajustar el plan, conserva los `id` que sobrevivan y crea nuevos solo para lo que de verdad cambie.
2. **`alternativas` siempre tiene exactamente 2 elementos**, y ambos existen en `ejercicios`. El visor asume esto para dibujar los 3 chips (prescrito + 2). Hay una verificación en el punto 8.
3. **`unidadReps: 'min'` significa que `repsMin`/`repsMax` son minutos, no repeticiones.** Aplica a cardio, calentamiento y enfriamiento. `'seg'` aplica a la plancha.
4. **`seriesAdaptacion: 0` es una bandera, no un cero.** Significa "este ejercicio no entra en la fase de adaptación, sustitúyelo por `alternativas[0]`". Hoy solo aplica al peso muerto rumano.

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
fase                      → 'adaptacion' | 'principal'
s|{dia}|{slot}|{i}        → 'YYYY-MM-DD'   serie marcada; solo cuenta si === hoy (se limpia sola cada día)
a|{dia}|{slot}            → 'YYYY-MM-DD@ejercicioId'   aparato sustituido, también expira diario
w|{ejercicioId}           → string   peso en kg, o texto libre en cardio. PERMANENTE, es mi historial
o|{dia}|{fase}            → JSON array de slots   orden personalizado del drag & drop. Permanente
sc|{dia}                  → int   posición del scroll
```

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

8. **El toggle de fase es manual.** Podría calcularse desde una fecha de inicio, pero prefiero controlarlo yo: si me enfermo una semana, la fase no debe avanzar sola.

---

## 6. Deuda técnica y cosas que faltan

**Alto (arréglalo pronto)**
- El JSON duplicado (sección 2). Es lo primero.
- Sin service worker: si Safari recarga sin señal, no abre. Para una app que uso en un gym con mala señal, esto importa.
- Sin exportar/respaldar. Si limpio los datos de Safari, pierdo todo mi historial de pesos. Necesito al menos un "descargar mis datos como JSON".
- Todo es un solo archivo con render por `innerHTML`. Funciona, pero para seguir creciendo necesita módulos y no reconstruir el DOM completo en cada acción.

**Medio**
- El historial de pesos solo guarda **el último** valor. No hay serie temporal, así que no puedo ver progresión ni detectar estancamiento — que es justo lo que el plan me pide revisar cada 4 semanas.
- El campo de peso es uno por ejercicio, no uno por serie. En la práctica a veces bajo peso en la última serie.
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

```js
// 1. Todo id referenciado existe
// 2. Toda alternativa existe y son exactamente 2 por ejercicio
// 3. Las series que muestra el visor deben cuadrar con appleWatch.bloques,
//    agrupadas por descansoSeg, en AMBAS fases. Esto es la prueba crítica:
//    si se rompe, mi reloj me marca descansos equivocados.
```

Valores esperados hoy (series por `descansoSeg`):

| Día | Semanas 1–2 | Semana 3+ |
|---|---|---|
| lunes | 90s:4 · 60s:6 | 90s:6 · 60s:7 |
| martes | 90s:8 · 60s:4 | 90s:12 · 60s:4 |
| miercoles | 60s:6 | 60s:8 |
| jueves | 90s:2 · 60s:10 | 90s:6 · 60s:9 |
| viernes | 90s:6 · 60s:6 | 90s:9 · 60s:7 |

---

## 9. Restricciones

- **Objetivo: Safari en iPhone.** Se usa como app agregada a la pantalla de inicio.
- **Se hospeda en GitHub Pages.** Estático, sin backend, sin secretos.
- **Un solo usuario.** No agregues autenticación ni multiusuario.
- **Español**, sistema métrico, nombres de ejercicio en español con el inglés abajo (las máquinas están etiquetadas en inglés).
- **La legibilidad de un vistazo gana sobre la densidad de información.** Si algo requiere que me detenga a leer, va plegado o no va.
