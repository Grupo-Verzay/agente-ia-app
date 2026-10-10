# CRM: embudos, agenda, tickets, calidad y equipo

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Un grupo TIENE ficha, y toda consulta de CRM la excluye

Los grupos entran en la bandeja y su barra de arriba —etiquetas, asignar
asesor, tareas, recordatorios, resolver— cuelga entera de `Session`. Sin ficha,
un grupo se abría pelado: solo Mensajes y Notas. Con ficha, se ve como
cualquier conversación.

Pero **un grupo no es un lead**. No se cuenta, no se puntúa, no se exporta y no
recibe campañas.

**La marca es el propio `remoteJid`**, que termina en `@g.us` y eso es imposible
en un 1:1. No hay columna nueva, a propósito: `Session` la toca también el
backend y añadirle columnas desde la App es lo que reventó el #360; y sin
columna, los grupos que ya tenían ficha de antes quedan marcados solos, sin
backfill y sin dos clases de grupo.

**La regla, y es la que hay que no olvidar:**

> **Toda consulta de CRM nueva excluye los grupos.** Se importa de
> `lib/conversaciones-de-grupo.ts` —`SIN_GRUPOS` para un `where` de Prisma,
> `sinGruposSql(alias)` para SQL en crudo— y no se vuelve a escribir la
> condición a mano. Escribirla en veinte sitios es garantizar que el
> veintiuno se olvide, y un grupo colado en el CRM se ve como un lead falso
> que nadie sabe de dónde salió.

Están cubiertas las listas y contadores de `/sessions`, el CRM, el kanban, la
búsqueda global, Analíticas, las métricas del agente, el informe semanal, la
exportación, los segmentos de campaña y la puntuación de leads.

**Chats NO es CRM.** `getSesionesDeLaCuenta` —la que alimenta la bandeja y la
barra del chat abierto— **no** lleva el filtro, y no puede llevarlo: es
justamente la que hace que un grupo se vea completo.

Dos cosas más:

1. **`cleanupJunkSessions` ya no borra grupos.** Esa cláusula (`LIKE '%@g.us'`)
   era la que los consideraba basura, y se fue de ahí. Lo que mantiene a un
   grupo fuera del CRM es que las consultas lo excluyen, **no** que alguien lo
   borre por detrás.
2. **No hay ninguna rutina de limpieza para esto, y no se monta.** Si se sale
   del grupo o el grupo desaparece, su ficha se queda y sus mensajes caducan a
   los 90 días como los demás. Si algún día estorban, se limpian a mano.

Y dos que se quedan fuera a propósito: **Llamar por WhatsApp** —un grupo no
tiene número al que llamar— y **Macros**, porque una macro puede llevar dentro
`ADD_TAG`, `ASSIGN_ADVISOR` o `RESOLVE` y se ejecutaría a medias sin decirlo.

### El id de un mensaje de grupo: PELADO por el webhook, con el participante por la API

Esta sección se ha escrito **tres veces** y las dos primeras estaban mal. La
tercera es la que tiene los dos datos delante, no uno.

**Las dos formas existen, y por eso despistó tanto:**

```
webhook        "id":"3EB0F2EE979A18E76A722E"          ← PELADO
               "participant":"210101696733292@lid"       (aparte, en key)

API de Waha    false_1203634…@g.us_3EB0A1B2_2101016…@lid  ← SERIALIZADO
                                             ^^^^^^^^^^^  quién escribió
```

Así que **el id de WhatsApp es el TERCER trozo, nunca el último**, y quien mire
solo una de las dos fuentes saca una conclusión falsa. Eso pasó dos veces:
primero se supuso la forma serializada sin mirar ninguna, y después se miró
**solo el webhook** y se concluyó que el id venía siempre pelado. Las dos veces
se desplegó un cambio que no arreglaba el síntoma.

Lo que de verdad costaba la conversación era `idDeWhatsapp` en el navegador,
con `/^(?:true|false)_.+_(.+)$/`: ese `.+` es **codicioso**, se come hasta el
último `_`, y en un grupo la llave acaba siendo **quién escribió**. Todos los
mensajes de una misma persona colapsan en uno dentro del mapa de
`mergeMessages`.

Medido en producción, grupo de 9 mensajes y 2 participantes:

```
[chats] abrir: se pintan los mensajes  { trae: 9, habia: 9 }
[chats] mensajes de la conversacion    { enElEstado: 9, sePintan: 9 }
[chats] sondeo del chat abierto        { habia: 2, trajo: 9 }
[chats] mensajes de la conversacion    { enElEstado: 2, sePintan: 2 }
```

**Una unión de 2 y 9 no puede dar 2.** Eso solo pasa si las llaves colapsan, y
9 mensajes de 2 personas colapsan en exactamente 2. La apertura se salvaba
porque `setMessages(openMessages)` guarda el arreglo **tal cual, sin mapa**; el
colapso llegaba en la primera mezcla, a los segundos. De ahí el síntoma: «se ve
entera y a los dos segundos se queda en uno».

Tres reglas:

1. **De un id serializado se coge el TERCER trozo**, cortando por `_`, y no se
   usa una expresión con `.+` en medio. Lo hacen `idDeWhatsapp` (navegador),
   `idCrudoDeMensaje` —que ahora llama a la anterior en vez de tener su propia
   expresión— y el emparejador de acuses del backend.
2. **Una forma de dato se comprueba en TODAS sus fuentes.** El webhook y la API
   del mismo proveedor no entregan lo mismo. Mirar una y generalizar es lo que
   costó las dos vueltas anteriores.
3. **Un número que no puede ser señala el sitio.** `2 + 9 = 2` no es una pista
   ambigua: es una llave que colapsa, y eso acota la búsqueda a la función que
   construye la llave. Los avisos que lo revelaron —`enElEstado` frente a
   `sePintan`, y `habia`/`trajo` en cada ciclo— separan «se pierden en el
   estado» de «no se pintan», que es la pregunta que hay que contestar ANTES de
   tocar nada.

## Escalar a una persona: dos puertas, un solo camino

Una conversación llega a un asesor por dos sitios —una **palabra clave** escrita
a mano en el entrenamiento, o la **decisión del modelo** (`Escalar_A_Asesor`)— y
los dos terminan en `escalarConversacion`, que es quien hace lo que no se puede
hacer a medias: callar a la IA si toca, asignarla a alguien, avisarle y ponerle
el **sello de espera** (`Session.escalated_at`).

Media escalada es peor que ninguna, porque desde fuera parece resuelta.

### El id con el que se escala NO es el de la memoria del chat

Y esto costó que el camino del modelo estuviera roto desde el primer día sin que
se notara. `buildEscalarAAsesorTool` hacía:

```ts
const sessionIdNum = parseInt(sessionId, 10);
```

Pero `sessionId` **no es `Session.id`**: es el de la memoria de la conversación
(`buildChatHistorySessionId`), o sea `"VERZAY_VENTAS-573…@s.whatsapp.net"`.
`parseInt` de eso es **`NaN` siempre**.

Con `sesion = null` no se asigna, no se sella y ni se apaga la IA —todo eso va
detrás de un `if (sessionId)`— **pero el aviso por WhatsApp sí sale**, porque
solo necesita la cuenta y el número. El síntoma exacto: la IA escala, al asesor
le llega el aviso, y el chat no aparece esperando en la bandeja de nadie. La
palabra clave no lo sufría porque pasa `sessionData?.id`, la fila de verdad.

**Dos cosas con nombres parecidos que son cosas distintas**, y por eso van con
nombres que no se puedan confundir: `sessionId` (la memoria) y `sessionDbId` (la
fila). No se parsea ninguno para sacar el otro.

Y era peor de lo que parece: con una línea cuyo nombre empiece por dígitos,
`parseInt("123-57319…")` da `123` y se habría sellado y asignado **la
conversación de otro**.

Lo que lo escondió fue un `return null` mudo en `asignarConversacionEscalada`.
Ahora avisa. Es la regla de siempre: **un fallo nunca puede ser mudo**, y aquí
el síntoma —«el escalado no deja el chat en espera»— no se parece a un error.

### El motivo es un DATO, no una frase

El motivo existía como texto libre que el modelo escribía y que solo se
interpolaba en el aviso de WhatsApp. Sirve para leerlo y para nada más: no se
puede contar, ni filtrar, ni decidir nada con él.

Se guarda en `Session`, y son dos valores:

| | quién decidió que hacía falta una persona |
| --- | --- |
| `cliente_pidio_humano` | lo pidió el cliente. **También la palabra clave**: una palabra clave es el cliente pidiéndolo con la forma que alguien previó. |
| `ia_sin_respuesta` | no lo pidió nadie: la IA no supo resolverlo, o el cliente se quejó de no estar siendo atendido. |

Esa diferencia mide cosas distintas: lo primero es demanda de atención humana;
lo segundo son **huecos del entrenamiento**, que se pueden arreglar.

Tres cosas que hay que mantener:

1. **La lista es cerrada y vive en un solo sitio**, `motivo-del-escalado.ts`,
   puro. **Lo que conteste el modelo no se da por bueno**: lo que no está en la
   lista cae en el valor por defecto. Si el dato estructurado admitiera texto
   libre serían mil valores distintos y no se podría contar ni uno.
2. **El por defecto es el más común a propósito** (`cliente_pidio_humano`).
   Equivocarse hacia `ia_sin_respuesta` inventaría un hueco del entrenamiento
   que no existe, y eso manda a alguien a arreglar lo que no está roto.
3. **El motivo se guarda ANTES que todo lo demás.** Si asignar, avisar o sellar
   tarda o revienta, el dato ya está. Al revés quedaría una conversación
   escalada sin motivo, que es el caso que nadie sabría explicar después.

Y se registra **aunque la cuenta tenga apagado el escalado por IA**. Antes,
apagada, la herramienta ni se le daba al modelo: sin herramienta no hay forma de
que exprese que ahí hacía falta una persona, así que no había nada que
registrar. Una cuenta apagada era un agujero negro. Ahora la herramienta existe
igual y **solo deja constancia**: `escalation_reason` con `escalated_at` en nulo
significa **«aquí hizo falta una persona y no se llamó a ninguna»**, que es justo
lo que dice si a esa cuenta le conviene encenderlo.

Con la cuenta apagada el prompt además le dice al modelo que **no le prometa un
asesor al cliente**. Prometer a alguien que no viene es peor que no escalar.

### Escalar NO apaga la IA

`escalation_disables_ai` nació en `true` porque era lo que se venía haciendo,
pero solo lo hacían las pocas cuentas que escalaban por palabra clave. Al
encender el escalado por intención para todas, ese `true` pasó a decidir el
comportamiento de clientes con **cuatro años de IA respondiendo siempre**, y se
les quedaba muda en cuanto alguien pedía un asesor.

Quien pide un humano casi nunca deja de preguntar: sigue escribiendo cosas que
la IA sí resuelve —horarios, precios, un dato— y con la IA apagada **le habla a
una pared** hasta que llega la persona. Callarla es decisión de cada dueño, y se
enciende en Perfil › Comportamiento.

Apagarla **no** es lo que impide que la IA conteste encima del asesor: de eso se
encarga `Session.status`, que se apaga en cuanto escribe una persona, desde la
App o desde el móvil. Esto solo decide si se calla ANTES, por el mero hecho de
escalar.

### El sello de espera lo quita una PERSONA, venga de donde venga

El sello (`Session.escalated_at`) es lo que pone un chat en la bandeja de espera
del asesor. Lo ponía el escalado y lo quitaba **solo la App**: desde
`pausarIaPorIntervencionHumana` —por donde pasan sus cuatro caminos de envío— y
desde soltar o resolver a mano.

Pero **responder desde el WhatsApp del teléfono no pasa por la App**: entra por
el webhook del backend. Ese camino ya pausaba la IA —eso funcionaba— y no tocaba
el sello en ningún sitio: `stopOrResumeConversation` no lo menciona, y el
backend entero solo lo **escribía** (en `auto-assign`), nunca lo borraba.

Así que un asesor que atiende desde su móvil —que es lo que hace media
plataforma— dejaba la conversación marcada como esperando **para siempre**. La
bandeja de espera llena de chats ya atendidos, sin forma de distinguirlos de los
que sí esperan.

**Lo que cuenta es quién escribió, no por dónde entró.** El sello se quita en la
MISMA rama del webhook que ya pausa la IA.

Y es seguro ahí, que es la parte que hay que entender antes de tocarlo: llegar a
esa rama **ya significa «lo escribió una persona»**, y no es una suposición
nueva —es la misma condición con la que se decide pausar la IA, que es más
consecuente que esto—. En Waha lo garantiza el normalizador, que descarta lo que
sale por la API (la IA, los flujos, la App) y solo deja pasar `source: 'app'`, o
sea el móvil:

```ts
if (esPropio && msg.source !== 'app') { … return []; }
```

Ese filtro existe porque sin él «la IA contestaba, Waha nos devolvía su propio
mensaje como propio y **pausaba a la IA justo después de que hablara**». Si esa
condición se equivocara, hoy la IA se estaría pausando sola tras cada respuesta.

De ahí se sigue lo importante: **un mensaje de la IA nunca saca el chat de la
espera**, porque no llega hasta ahí. Que la IA siga hablando no es atención
humana.

Cuatro cosas del borrado del sello:

1. Se busca por **todas las identidades** del contacto, como el resto de la
   pantalla. Con una sola, la fila guardada bajo otra forma no se encuentra y el
   sello se queda puesto.
2. **No se cruza un `@lid` con su número.** Sus dígitos son un id de privacidad;
   fabricar el JID sacaría de la espera la conversación de otro.
3. **Sin ninguna identidad no se consulta.** Un `UPDATE` sin contacto en el
   `WHERE` sacaría de la espera **todas** las conversaciones de la cuenta.
4. Va **antes** del `await` que pausa, y nunca lanza —el asesor está hablando
   con un cliente y eso manda—, pero tampoco es mudo.

### Un `DEFAULT` no toca a las filas que ya existen

Se aprendió dos veces seguidas, con las dos migraciones del escalado:
`escalation_by_ai_enabled` a `true` y `escalation_disables_ai` a `false`.

`ALTER COLUMN … SET DEFAULT` solo vale para las cuentas **nuevas**. Las que ya
están tienen el valor viejo escrito en su fila, así que sin un `UPDATE` al lado
el cambio **no se activa para ningún cliente actual** — y desde fuera parece que
se desplegó algo que no hace nada.

Son dos cosas y hacen falta las dos. Y la segunda es la que cambia producción de
golpe, así que se decide a sabiendas: qué pasa con las cuentas que ya existen no
es un detalle de la migración, es la decisión.

### Un registro archivado por el embudo también deja la conversación «En espera»

Además de la petición de asesor y la palabra clave, una conversación pasa a
«En espera» cuando queda archivada una **SOLICITUD, un PEDIDO, una RESERVA, un
RECLAMO** o una **CITA**. Vive en el backend (`api-webhook`):
`RegistroService.createRegistro` para los cuatro tipos de `Registro` y
`crear_cita` / `crear_cita_booking` para las citas, las dos por
`marcarEnEsperaPorRegistro` (`webhook/utils/marcar-en-espera.ts`).

**Y lo que hace correcta a `SOLICITUD` no está en esa lista, sino en el
clasificador**: está contado entero en *una SOLICITUD no es pedir información*,
ahí abajo.

> **Es el MISMO estado, no uno parecido**: `Session.escalated_at`, el mismo
> contador de la pastilla, y sale igual —cuando contesta una persona, desde la
> App o desde el teléfono—. Lo que decide qué tipos cuentan es
> `ponenEnEspera` (`webhook/utils/espera-por-registro.ts`, puro).

Cuatro cosas que hay que mantener:

1. **No apaga la IA.** No toca `Session.status`: si la IA calla o sigue lo
   decide la configuración de la cuenta, como siempre.
2. **No asigna, no avisa y no deja `AssignmentLog`.** Sin ese rastro,
   `releaseStaleEscalations` no la confunde con un escalado.
3. **No pisa un sello anterior** (`WHERE escalated_at IS NULL`): si ya esperaba,
   sigue esperando desde entonces. `REPORTE` (la síntesis, que se reescribe con
   cada mensaje), `PAGO` y `PRODUCTO` no cuentan.
4. **Deja escrito su origen, `Session.espera_origen = 'registro'`**, y es la
   pieza que no se puede quitar: el freno de `Escalar_A_Asesor`
   (`decidirSiEscalar`) lee el sello para no escalar dos veces. Sin el origen,
   un pedido guardado haría que la petición de asesor de después se **ignorara**
   —ni asignación ni aviso—. La escalada de verdad sobrescribe el origen a
   `escalado` y conserva la hora; una fila sin origen (de antes) cuenta como
   escalada.

Lo prueba `scripts/banco-en-espera-por-registro.sh` en `api-webhook`, contra
Postgres y con los servicios de verdad; `MODO=roto` lo corre en un árbol del
commit de antes y afirma que el registro se guardaba sin poner la conversación
en espera.

### Y una SOLICITUD no es pedir información: quien archiva es el CLASIFICADOR

Esta sección se ha escrito **dos veces** y la primera se pasó de frenada.
Conviene tener las dos vueltas delante, porque la segunda deshace media
decisión de la primera y el motivo es el que importa.

**La primera vuelta.** Conversaciones marcadas «En espera» en el mensaje de
entrada, sin que el agente lo pidiera, sin palabra clave y sin nadie asignado,
con mensajes tan simples como «Hola, quiero más información». La causa estaba
entera en una frase que esta sección tenía escrita y **era falsa**: «cuando el
agente GUARDA un registro». El agente no guarda ninguno.
`RegistroService.createRegistro` tiene **un solo llamador**:
`LeadFunnelService.processIncomingText`, que corre —sin esperar— en **cada
mensaje entrante** y pasa el texto por un segundo modelo, el clasificador del
CRM. Ahí no hay ninguna decisión del agente: es un lector de fondo archivando
lo que ve. (La CITA sí es del agente, `crear_cita` es una herramienta suya, y
por eso esa nunca estuvo en duda.) Y lo que ese clasificador archivaba en la
entrada era, por su propio prompt, una SOLICITUD:

```
- SOLICITUD: pide información/precio/cotización/catálogo, disponibilidad,
  horarios, ubicación, métodos de pago (pero SIN comprobante)…
```

o sea el primer mensaje de cualquier lead. El arreglo de entonces fue **sacar
SOLICITUD de la lista**.

**La segunda vuelta, y es la que manda.** Eso estaba mal: una solicitud de
verdad —«tres sillas negras para Juan Pérez, entrega en Medellín»— es
exactamente lo que alguien del equipo tiene que atender, así que quitarla dejó
fuera justo lo que la lista existe para marcar.

> **El fallo nunca fue la lista: era que dos cosas distintas se llamaban
> SOLICITUD.**
>
> | | cuándo pasa | qué es |
> | --- | --- | --- |
> | pedir información | al principio, sin nombre y sin producto | conversación: la atiende el agente |
> | una SOLICITUD | después, con los datos tomados | un pedido que alguien tiene que atender |
>
> **`tipo="SOLICITUD"` solo si están los TRES datos concretos —nombre del
> cliente, producto o servicio, y sus detalles—.** Sin los tres es un REPORTE.
> Con eso SOLICITUD vuelve a la lista y las dos mitades dejan de
> contradecirse.

Vive en `lead-funnel/utils/solicitud-con-datos.ts` (`api-webhook`), puro.

#### La prueba para meter un tipo en la lista, y cómo se pasa

> **¿El clasificador se lo pone a la entrada de una conversación normal?** Si
> sí, no entra —da igual lo razonable que suene— **o se arregla el
> clasificador**, que es lo que se hizo con SOLICITUD. Es el motivo por el que
> `REPORTE` quedó fuera («se reescribe con cada mensaje, dejaría toda la
> bandeja en espera»), y la primera vuelta no lo comprobó contra `SOLICITUD`.

Las cuatro que están pasan la prueba: una compra confirmada, una fecha
apartada, una queja y un pedido con los datos tomados. Ninguna es la forma
normal de saludar.

#### Se pide en el prompt Y se comprueba al leer, porque el prompt es EDITABLE

Es la parte que no se puede ablandar, y el motivo es concreto: **el prompt del
clasificador ya está guardado, por cuenta, con la definición vieja**. La App
escribe una fila en `agentPrompt` la primera vez que alguien abre CRM › Reglas
(`ensureCrmPrompt`), con el texto que arma `buildLeadFunnelPromptFromConfig`, y
`resolveLeadFunnelPrompt` prefiere esa fila sobre el prompt de la casa. Así que
el prompt vive en DOS sitios y el que manda casi nunca es el del backend:

| | dónde | quién manda |
| --- | --- | --- |
| el de la casa | `api-webhook`, `lead-funnel.prompt.ts` | solo si la cuenta NO tiene fila |
| el de la cuenta | la App lo arma y lo guarda en `agentPrompt` | **en cuanto alguien abre CRM › Reglas**, y su texto de SOLICITUD es editable |

Cambiar solo el prompt de la casa no habría cambiado nada para esas cuentas —y
el suyo dice, literalmente, «Si el lead dice "quiero", "me interesa", "cómo
compro", es REGISTRO tipo SOLICITUD»—. Son dos mitades y hacen falta las dos:

1. **Se pide**: `REGLA_DE_LA_SOLICITUD` se **añade al prompt en el servidor**
   (`conLaReglaDeLaSolicitud`, dentro de `resolveLeadFunnelPrompt`), sea el de
   la casa o el que la cuenta guardó, y dice que manda sobre cualquier
   definición de arriba. Así no hay cuenta que se la salte y **no hace falta
   reescribir ni una fila**.
2. **Y se comprueba**: `comoSeClasifica` degrada a REPORTE toda SOLICITUD que
   llegue sin los datos. Es la forma de siempre de esta casa para lo que una
   regla no puede dar por bueno —se pide al modelo y se quita al leer—, la
   misma que los hashtags de WhatsApp en el copy de un anuncio.

**El fallo de ese guardián es el lado seguro**: ante la duda no es una
solicitud, así que se archiva de menos y **nunca se sella de más**, que es el
fallo del que venimos.

#### Seis cosas que hay que mantener

1. **Los datos se leen SOLO de `datos`, nunca de `meta`.** Los prompts
   guardados piden `"meta": { "cualquier_dato_util": "..." }`, así que un
   «¿tienen sillas?» puede llegar con `meta.producto = "sillas"`: aceptarlo de
   ahí devolvería el fallo por la otra puerta.
2. **Un `producto` que es «información», «precios» o «catálogo» no es un
   producto.** Se compara por palabra y contra el valor entero, no por
   substring: «asesoría contable» es un servicio de verdad y lleva dentro una de
   esas palabras.
3. **El `nombre` de arriba no basta por sí solo**, y por eso no se mira solo él:
   los dos prompts lo rellenan con el `pushName` de WhatsApp, así que está
   siempre. Lo que decide son los tres juntos.
4. **`comoSeClasifica` es el ÚNICO normalizador**, y absorbió el
   `kind=REGISTRO tipo=REPORTE` que estaba escrito a mano en el embudo. Dos
   normalizadores son uno que se afina y otro que se queda atrás.
5. **Va en el EMBUDO, no dentro de `classify()`.** El banco finge el modelo: con
   el guardián dentro del clasificador, el banco lo saltaría y estaría probando
   algo que en producción no corre.
6. **Y no es mudo.** Una corrección se escribe en el registro
   (`[CLASIFICACION] corregida … => REPORTE`): un registro que deja de
   archivarse sin decir por qué se ve como que el CRM perdió filas.

#### El invariante del que vive la lista

> **Toda SOLICITUD archivada trae sus datos tomados.** Por eso `ponenEnEspera`
> puede seguir decidiendo por el TIPO y no hace falta volver a mirar el registro
> al sellar. Una segunda regla —«sella si además trae datos»— serían dos que
> mantener a la par, y el día que discreparan la conversación saldría en la
> pestaña «En espera» sin sello, o sellada sin salir.

Y los datos se guardan **con el registro** (`meta.datos`): son la prueba de que
se tomaron, y lo único con lo que después se puede distinguir una solicitud de
verdad de una pregunta.

#### La simetría, que es lo que de verdad había que cerrar

La plataforma se contradecía a sí misma sobre el MISMO mensaje. La descripción
de `Escalar_A_Asesor` dice:

> «NUNCA la llames si el cliente solo: saluda; pregunta precios, planes o
> costos; **pide información general** (horarios, ubicación, catálogo,
> garantía); dice "me interesa" o **"quiero saber más"**; […] o **todavía no ha
> pedido nada concreto**»

Esa última línea es la que hace que las dos mitades encajen ahora: lo que la
herramienta no escala es «nada concreto», y lo que el clasificador llama
SOLICITUD es justo lo concreto. **El banco las encadena** —lee la descripción
de la herramienta, lee el prompt del clasificador y cruza las dos con
`comoSeClasifica` y `ponenEnEspera`— para que no puedan volver a separarse:
comprobar cada lado por su cuenta no lo habría cazado, porque los dos «estaban
bien».

Y el mismo barrido alcanza a las reglas sueltas que decían lo contrario: la
obligatoria de los dos prompts («si hay intención de … información … =>
REGISTRO») y la instrucción extra de la App («"quiero", "me interesa", "cómo
compro" => SOLICITUD»). Las dos decían REGISTRO donde la herramienta dice «no
escales».

#### Lo que se degrada NO se pierde, y de paso gana

Un «quiero más información» ya no se archiva, así que ahora sí entra en la
**síntesis** —con el resumen que el propio modelo escribió, y de última con el
mensaje—. Antes ese camino salía por el `return` del REGISTRO y se saltaba
entero el estado del lead, los seguimientos del CRM y las automatizaciones de
etapa. Se dice porque es un cambio de comportamiento: esos tres se disparan
ahora en mensajes en los que antes no se disparaban, cada uno con el
interruptor de su cuenta delante.

#### El límite, y se dice

Un modelo que se invente los tres datos sobre un «¿tienen sillas?» pasa. Lo que
el código puede garantizar es que **sin los datos no hay solicitud** y que un
`producto` que es «información» no es un producto. Cerrarlo del todo pide que
la solicitud la declare el **AGENTE con una herramienta suya** —como la CITA,
que por eso sí es de fiar— en vez de un lector de fondo. Es un frente aparte;
lo que no puede pasar es que se dé por cerrado.

#### La migración que ya corrió, y por qué no hay otra

`20260926120000_quitar_espera_por_solicitud` borró los sellos que solo una
SOLICITUD pudo poner. Con la definición vieja eso era lo correcto; con la nueva
significa que **también se llevó los de las solicitudes de verdad**.

**No se deshace, y no se intenta.** El dato que las distingue —`datos`— no
existía cuando se escribieron, así que de una fila vieja no hay forma de saber
si era un pedido con los datos tomados o una pregunta. Volver a sellar «toda
conversación con un registro de SOLICITUD» sería sellar la bandeja entera otra
vez, a propósito. Lo que se pierde es una entrada en la cola: la conversación
sigue en la bandeja con todo lo suyo, y el siguiente mensaje que traiga una
solicitud de verdad la vuelve a sellar.

**Y la migración no se toca**: Prisma guarda su checksum, así que editar una ya
aplicada rompe el `migrate deploy` del despliegue siguiente.

#### Las citas son DOS tablas, y solo una tiene `sessionId`

Hay que saberlo antes de escribir cualquier otra limpieza que dependa de «esta
conversación no tiene cita»:

| herramienta | ruta | tabla | ¿`sessionId`? |
| --- | --- | --- | --- |
| `crear_cita` | `/api/schedule/appointment` | `Appointment` | **sí** |
| `crear_cita_booking` | `/api/bookings/appointment` | `booking_appointments` | **no** — va por `teamId` + `clientPhone` |

Las dos sellan por el mismo `marcarEnEsperaPorRegistro`, así que **desde la
fila de `Session` una reserva de equipos es indistinguible de una SOLICITUD**.
La migración solo miró `Appointment`, y lo que la hizo aceptable es que la
conversación que llega a reservar dice «agendar / reservar / confirmar fecha»
—que el clasificador archiva como **RESERVA**, y RESERVA conserva el sello—.
No es una coincidencia: es la definición del propio prompt, y el banco la lee
de ahí en vez de darla por buena. Si algún día hace falta ser exacto también
con las reservas de equipos, el cruce es por dígitos (`clientPhone` contra
`remoteJid`) y va detrás de un `to_regclass`, porque `booking_appointments` es
una tabla de la App y puede no existir en una base del backend.

#### Los bancos, que son tres y cada uno dice una cosa

| | qué prueba |
| --- | --- |
| `api-webhook`, `banco-solicitud-con-datos.sh` | contra Postgres y con el embudo de verdad: la solicitud CON datos sella y guarda sus datos; pedir información ni se archiva ni sella; y la regla viaja en el prompt **también cuando la cuenta tiene el suyo guardado**. `MODO=roto` afirma el fallo por las DOS puntas |
| `api-webhook`, `banco-la-entrada-no-queda-en-espera.sh` | que la entrada sigue sin sellarse —hoy por otro motivo: ya no es una SOLICITUD— y ejerce el `migration.sql` real sobre las seis clases de fila |
| la App, `banco-solicitud-en-las-reglas.sh` | que CRM › Reglas no promete una SOLICITUD que el servidor no va a archivar: el texto por defecto y el aviso de la pantalla |

Y el de la App tiene su motivo propio: el campo de SOLICITUD de esa pantalla es
**editable**, así que lleva debajo una línea que dice lo que de verdad decide
—los tres datos—. Un campo que promete algo que el código no hace es peor que
no tenerlo.

## Tickets: el WhatsApp sale al PASAR a resuelto, no al estar

Proyectos es el trabajo interno del equipo; un ticket es de un CLIENTE. Van
separados a propósito: el cliente abre el suyo desde un botón flotante y lo
sigue en «Mis tickets», y **nunca entra a Proyectos**. Por dentro se reutiliza
lo que ya había —`BloqueDeAdjuntos` con sus tres vías, el bucket, el envío por
WhatsApp—, pero los datos no se mezclan.

Cinco estados, **los cinco los ve el cliente**: recibido, en proceso, en
revisión, resuelto y descartado. Descartar exige un motivo escrito, que el
cliente lee: un ticket que desaparece sin explicación se lee como que nadie lo
miró, y la persona vuelve a abrirlo.

Y la regla que no se puede ablandar, porque lo que sale de aquí **no se puede
recoger**:

> **Solo se avisa al PASAR a resuelto** (`avisaAlCliente(antes, despues)`, en
> `lib/tickets.ts`, puro y probado). Dos cosas, y las dos importan: solo
> `resuelto` —un ticket que va y viene entre «en proceso» y «en revisión» le
> mandaría cuatro WhatsApps a quien no pidió seguimiento, y eso se aprende a
> ignorar, con lo que el aviso que sí importa se ignora también—; y **pasar**,
> no estar — guardar dos veces el mismo estado no puede mandar otro aviso por
> cada pulsación.

De ahí salen tres piezas que van juntas:

1. **El estado anterior se lee ANTES del `UPDATE`.** Preguntarlo después leería
   el que se acaba de escribir y `avisaAlCliente` diría siempre que no.
2. **El `UPDATE` va condicionado al estado que se creía**
   (`AND "estado" = ${antes}`). Dos administradores resolviendo el mismo ticket
   a la vez tocan uno una fila y el otro cero — comprobado contra Postgres:
   `UPDATE 1` y luego `UPDATE 0` —, y **solo avisa el que tocó fila**. Sin esa
   condición salen dos WhatsApps por un solo cierre.
3. **El aviso nunca lanza y nunca es mudo.** El estado ya está guardado y eso
   manda; pero un aviso que no sale sin decirlo se lee como «al cliente no le
   llega nada», que es de lo más difícil de diagnosticar. Sale `[tickets] aviso
   de resuelto enviado`, y su ausencia con un ticket resuelto señala el sitio.

### Y las tablas son NUESTRAS: `tasks` no se toca

`tickets_de_soporte`, `ticket_attachments` y `tickets_config` las crea la App
con `CREATE TABLE IF NOT EXISTS`, como `flows` y `task_attachments`. **Ni una
columna nueva en `tasks`**: es del backend y añadirle columnas desde aquí es lo
que reventó el #360. Y aunque fuera nuestra, tampoco: un ticket colgado de
`tasks` aparecería en el tablero interno, en el reparto del trabajo y en los
avisos de tarea, que es justo lo contrario del encargo.

El acceso va por `conLasTablas(...)`, que ante un `42P01` olvida el recuerdo de
«ya las creé» —que es **del proceso, no de la base**—, las crea y reintenta
**una** vez. Y mira los dos sitios donde Prisma esconde el código de Postgres:
`meta.code` y el texto, no solo `code`.

### El destino es uno, y sin él no hay botón

A qué cuenta caen los tickets se elige en Panel › Notificaciones, y se **copia
dentro de cada ticket** al crearlo: si mañana cambia el destino, los que ya
estaban abiertos se quedan con quien los estaba atendiendo.

**Sin destino configurado el botón flotante no se pinta.** Un botón que guarda
en la nada es peor que no tener botón: el cliente se queda esperando una
respuesta que nadie va a ver. Y no se inventa uno —mandarlos a la primera cuenta
admin que aparezca sería elegir por alguien que no lo ha pedido—.

### Y quién ve qué se decide por la CUENTA, no por `cuentaQueManda`

El botón es uno y hace dos cosas: para un cliente abre el formulario, para la
cuenta de destino lleva al tablero. La comparación con el destino es con la
**cuenta** (`ownerId ?? id`), que es bajo la que se archiva el ticket, y no con
`cuentaQueManda`: para un `agente` de la cuenta de destino eso devuelve su
propio id, así que le ofrecía abrir un ticket que la acción luego rechaza. Un
botón que al pulsarlo da error es peor que no tenerlo. Ese `agente` no ve
ninguno: ni abre tickets ni los administra.

La puerta del tablero es `laCuentaQueConfigura` **más** que esa cuenta sea la
configurada — la misma puerta que el resto de ajustes de cuenta, más lo suyo. Y
está en la acción, no en la pantalla: la pantalla pinta lo que la consulta le
devuelva.

### Los adjuntos son el componente de Proyectos, no una copia

`BloqueDeAdjuntos` con `taskId={null}`: el ticket no existe cuando se sube el
archivo, así que todo cae «en el aire» —en el bucket, sin colgar de nada— y se
engancha al guardar, que es el camino que ya existía para una tarea sin crear.
De ahí vienen gratis el pegado con Ctrl+V, el arrastrar y el tope.

Lo único que sabía que era «una tarea» eran la carpeta del bucket y las palabras
de los avisos, y van como props (`carpeta`, `queEs`) con el valor de siempre por
defecto. **No se hace una copia del componente**: con dos, el día que se afine
el tope o el pegado se afina en una y la otra se queda atrás, y eso no se ve
como un error sino como «a veces funciona».

Y el cierre del formulario va por **un solo camino** (`cerrar()`), que borra del
bucket lo que quedó en el aire. Con tres salidas basta con olvidarse de una para
que esa deje basura cada vez.

### El enlace PÚBLICO: un código por cuenta, y el código es la única puerta

Los tickets se venden como módulo: la IA manda por WhatsApp un enlace fijo, el
cliente final lo abre **sin cuenta en la plataforma**, llena la ficha y el
ticket entra en la bandeja de esa cuenta. Es el patrón de las salas de vídeo
(#796) aplicado a otra cosa: **tener el enlace deja llamar a la puerta**, y lo
que hay detrás lo resuelve el servidor.

> **Todo lo que decide a dónde va el ticket sale de `laCuentaDelCodigo`, nunca
> de lo que mande el navegador**: la bandeja a la que cae, la carpeta del bucket
> cuyos archivos se admiten y el lead al que se engancha. Un enlace público que
> aceptara cualquiera de esas tres del cuerpo de la petición sería una forma de
> meterle tickets —y un `<img>` apuntando a donde sea— en el tablero de otra
> cuenta.

El código vive en `tickets_enlace_publico` (`cuentaId` como clave primaria),
tabla de la App con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. Son
18 caracteres de `base64url`, como el de una sala: en una URL un `+` o un `/`
se escapan por el camino. Y `tickets_de_soporte` recibe `origen`,
`contactoNombre` y `sessionId` con **`ALTER TABLE … ADD COLUMN IF NOT EXISTS`**,
no reescribiendo el `CREATE`: la tabla ya está en producción y un
`CREATE TABLE IF NOT EXISTS` no toca una que ya existe.

Ocho cosas que hay que mantener:

1. **Se crea al pedirlo, con `ON CONFLICT DO NOTHING`.** Sin eso, tres pestañas
   abriendo el tablero a la vez verían las tres que no existe y escribirían tres
   códigos, de los que dos quedarían repartidos y muertos. Comprobado contra
   Postgres: tres llamadas en paralelo dejan **una** fila.
2. **Apagarlo NO lo regenera.** Ese código ya está pegado en conversaciones de
   WhatsApp que nadie va a volver a leer; cambiarlo sería romperlas todas a la
   vez. Y un enlace apagado **se contesta igual que uno que nunca existió**:
   decir «existe pero está cerrado» ya cuenta algo de una cuenta a quien solo
   tiene una cadena de texto.
3. **El número se vuelve a armar EN EL SERVIDOR**, con la misma función que lo
   armó en la pantalla (`armarElNumero`, `lib/telefono-de-pais.ts`, puro). Lo
   que llega es **lo tecleado**, no el resultado: dar por bueno el número final
   sería dejar que quien manda la petición elija a qué teléfono se le avisa
   después.
4. **Y se recorta por LARGO y por ÁREA, no solo por indicativo.** República
   Dominicana usa 809, 829 y 849 sobre el mismo `+1`, así que elegir «+1809» y
   teclear `8291234567` guarda **`18291234567`**: manda lo escrito. Lo que no
   cuadra con ningún largo conocido **no se recorta**: se rechaza con su motivo.
   Media escalada es peor que ninguna — guardar «12345» como si fuera un
   teléfono deja un ticket con un aviso imposible y nadie se entera.
5. **El número final SE VE antes de enviar.** Una regla que se equivoca en
   silencio es la familia del «999999999 de -1 créditos»; debajo del campo se
   enseña lo que se va a guardar, que es lo único que de verdad protege.
6. **El nombre y el teléfono los recuerda el NAVEGADOR, nunca el servidor.**
   Prellenarlos buscando por número convertiría un enlace público en una forma
   de preguntar «¿de quién es este número?» sobre los contactos de la cuenta. Y
   todo va en `try/catch`: en una ventana privada leer `localStorage` puede
   lanzar, y sin eso la ficha entera se cae justo en los navegadores donde más
   se mira la privacidad.
7. **El ticket entra normal y SIN responsable.** Dejar que el cliente final
   elija quién lo atiende y con qué urgencia es darle mandos sobre el equipo de
   otro. Y `origen: "publico"` es lo único que lo distingue: sin ese filtro en
   `losTicketsDelCliente` la cuenta se vería **a sí misma** pidiéndose soporte,
   porque `clienteId` es ella.
8. **Se sube por una ruta propia** (`/api/tickets-publico/archivo`), porque
   `/api/upload` empieza por `currentUser()`. Ahí la puerta es el código, la
   carpeta es siempre `tickets-publico` y el borrado exige **además** que la
   llave empiece por `<cuenta>/tickets-publico/` — una ruta que borra lo que le
   digan es una ruta para vaciarle el bucket a otro.

**El lead se engancha con todas las identidades**, que es la regla de siempre de
Chats: `remoteJid` primero —por donde entra el índice— y `remoteJidAlt` en su
**propia consulta**, nunca con un `OR` sobre las dos. Si no existe se crea, y
si la cuenta no tiene ninguna línea conectada **el ticket entra igual, solo que
sin lead**: eso no es un fallo del ticket, es una cuenta que todavía no ha
conectado un WhatsApp. `elLeadDelContacto` nunca lanza, pero tampoco es mudo.

**Y los campos son los MISMOS que la ficha privada**: título, texto y adjuntos
salen de `components/tickets/CamposDelTicket.tsx`, que pintan las dos. Con dos
copias, el día que se afine algo se afina en una y la otra se queda atrás — y
eso no se ve como un error: se ve como que «la ficha pública tiene menos cosas».
Lo que cada una pone alrededor sí es suyo.

#### Medido en Chromium, sobre la página de verdad

No sobre una maqueta: el build servido con `next start` contra una base de usar
y tirar. La franja del teléfono **se apila por debajo de `sm`** —el selector de
país pide unas 15 rem para el nombre y al número le quedarían cuatro dígitos— y
pasa a una fila a partir de ahí:

| ventana | tarjeta | selector de país | campo del número | ¿desborda? |
| --- | --- | --- | --- | --- |
| 320×568 | 288 px | 254 px @y=217 | 254 px @y=**265** | no |
| 360×740 | 328 px | 294 px @y=217 | 294 px @y=**265** | no |
| 390×844 | 358 px | 324 px @y=217 | 324 px @y=**265** | no |
| 430×932 | 398 px | 364 px @y=217 | 364 px @y=**265** | no |
| 768×1024 | 480 px | 240 px @y=237 | 190 px @y=**237** | no |
| 1440×900 | 480 px | 240 px @y=237 | 190 px @y=**237** | no |

A 390 la ficha llena mide 915 px de alto —una pantalla y poco, sin desbordar a
lo ancho— y debajo del campo se lee «Te escribiremos al +57 3001234567».

**Y la medida encontró un fallo que no era de esta pantalla.** Los cuatro
botones de archivo de `BloqueDeAdjuntos` iban en `grid-cols-4` fijo:

| ventana | antes | ahora |
| --- | --- | --- |
| 320 | **51 px** → «Im…», «Vi…», «Au…», «Do…» | 110 px, los cuatro enteros |
| 360 | **61 px** → los cuatro cortados | 130 px |
| 390 | **69 px** → tres cortados | 145 px |
| 768 y 1440 | 97 px | **97 px**, igual |

O sea cuatro botones que no dicen qué hacen. Van a **`grid-cols-2
sm:grid-cols-4`**, y eso arregla también los diálogos de tarea y de ticket en un
móvil, que es donde estaba escondido: dentro de un diálogo casi no se miraba, y
en la ficha pública es lo primero que ve el cliente.

### Un ticket que entra SALTA, y es la MISMA ventana de una mención

Un ticket llegaba por el enlace público, entraba en la bandeja… y no se
enteraba nadie hasta que alguien se asomaba al tablero por su cuenta. Con un
cliente esperando al otro lado, eso es exactamente el fallo del que viene toda
esta familia: *un aviso que espera es un aviso que no llega.*

Así que saca **la misma ventana que interrumpe** que una mención del chat del
equipo: la misma tabla (`task_alerts`), la misma campanita y el mismo clic
obligatorio. **No estrena ninguna tubería**, y eso no es comodidad: un aviso
más, en otro sitio y con otra forma de despacharse, se aprende a ignorar — y el
precio no es ese aviso, es que con él se empiezan a despachar los otros.

**Cero tablas y cero columnas nuevas.** `task_alerts.taskId` ya es opcional y
`enlace` ya existe, los dos por las menciones del chat de equipo: un aviso de
ticket es un `tipo` más con `taskId: null` y su `enlace`. Y por eso el `tipo`
entra a la vez en `TIPOS_DE_AVISO` y en `TIPOS_QUE_INTERRUMPEN` —`vence` sigue
fuera, por su propia regla— y en los dos `Record<TipoDeAviso, …>` de la ventana:
sin ellos compila y en pantalla sale un aviso sin icono y sin color, que no se
parece a un error.

**La regla, y es una frase:**

> **Si el ticket tiene responsable, el aviso es suyo; si no, es de todo el que
> alcance el módulo.** Lo decide `aQuienAvisaUnTicket` (`lib/aviso-de-ticket.ts`,
> puro), y lo preguntan los dos caminos por los que entra un ticket.

Un ticket recién llegado no tiene a nadie asignado —lo abre un cliente, y el
cliente no reparte el trabajo del equipo que lo atiende—, así que va a todos. En
cuanto alguien se lo asigna **deja de ser de todos**: seguir avisando al equipo
entero de un ticket que ya tiene dueño es el aviso de más que enseña a
despacharlos sin leer.

#### Y el universo es el MISMO con el que se elige responsable

`laGenteQueAtiende` —la cuenta de destino, su equipo (`owner_id`) y sus cuentas
vinculadas, o sea el mismo universo de `getTeamAdvisorInfos`— la usan ahora las
dos cosas: a quién se le avisa **y** `esDelEquipoQueAtiende`, que es la puerta
que decide si un `responsableId` que llega del navegador se acepta. Escritas por
separado, el día que una se afine se podría asignar un ticket a alguien que
nunca va a recibir su aviso, y eso no se ve como un error: se ve como que «a mí
los tickets no me llegan».

**La cuenta de destino entra**, y no es un detalle: su fila no cuelga de nadie,
así que `owner_id = destino` no la devuelve — es el mismo agujero que ya costó
una vuelta en los directos del chat de equipo, donde al dueño no se le podía
escribir.

#### El filtro de módulo se pregunta a la fila EFECTIVA, y es una RESTRICCIÓN

Encima del universo va el módulo: quien no alcanza `/tickets` no recibe nada,
porque un aviso que lleva a una pantalla que esa persona no puede abrir es peor
que no mandarlo. Se pregunta **por cada persona y no por su cuenta**: alguien
del equipo tiene sus propios `_UserModules`, sus apartados negados y sus
concedidos.

Y la lectura es la que ya costó una vuelta con el botón de grabar: **una fila
sin ninguna entrada en `_UserModules` no es «no tiene ningún módulo», es «sin
tope»** — ve todo lo que su plan permita. Esa lectura vive en
`cuentaAlcanzaLaRuta` y **no se vuelve a escribir**: se sacó a
`quienesAlcanzanLaRuta` (`lib/alcance-de-modulo.server.ts`), que ahora usan los
dos sitios que la necesitaban —el módulo de grabación y esto—. Copiarla habría
sido la segunda oportunidad de leerla al revés.

Al extraerla salió además un fallo que aquella no tenía a la vista: el rol con
el que se abre un módulo «Solo Admin» es el de la CUENTA
(`rolQueAbrePuertas`), no el de la persona — el equipo se crea con `role: user`
y no cambia nunca, así que preguntando por él un administrador se quedaba sin su
propio módulo. No cambia nada de la grabación, que solo se llama con ids de
cuenta.

#### Tres cosas más que hay que mantener

1. **El aviso NO puede tumbar el ticket.** El ticket ya está guardado cuando se
   avisa, así que `avisarDelTicketNuevo` no lanza — la misma regla que
   `crearLosAvisos`. Pero **no es mudo**: escribe cuando nadie de la cuenta
   alcanza el módulo, y escribe también el único caso raro de verdad —que el
   ticket tenga responsable y **ese** no lo alcance—, porque eso no es un fallo
   del aviso: es una cuenta mal configurada y hay que poder verlo.
2. **El clic aterriza en EL TICKET**, no en la lista. `elEnlaceDelTicket` es una
   sola función para los tres sitios que escriben ese enlace —los dos caminos de
   entrada y el runner de vencimientos—, y `aDondeLleva` prefiere el `enlace`
   sobre todo lo demás: sin él, un aviso sin tarea cae en `/chat-equipo`, que es
   el respaldo del chat, y ahí no hay nada que leer.
3. **Por la ficha pública el `actorId` va en NULO**, a propósito: quien escribe
   no tiene fila en `User`, así que no hay persona que descontar de la lista. Su
   nombre se copia en `actorNombre`, que es lo único que lo identifica.

Y **el runner de vencimientos no cambia su reparto**: allí, sin responsable, el
aviso va a **quien creó el ticket** y no a todo el equipo. Es a propósito —un
vencimiento le toca a la misma gente el mismo día a la misma hora, y por eso ni
siquiera saca la ventana—; lo único que comparte con esto es el enlace.

#### El banco ejerce las ACCIONES, no la función de avisar

`scripts/banco-avisos-de-ticket.sh`, y son dos mitades. La decisión va pura y
sin base; lo que solo se ve contra Postgres es que **la lista sale de filas** —el
módulo, sus `_UserModules`, el rol y `linked_accounts`— y no de un parámetro.
Probar `avisarDelTicketNuevo` a solas sería probar justo el lado que no tiene
puerta, así que lo que corre son los **dos caminos por los que entra un ticket**;
lo único que se finge es `currentUser()`, `revalidatePath` y el `cache()` de
React.

Los cuatro casos del encargo están: ticket nuevo sin asignar, ticket ya
asignado, **una persona con el menú recortado a otro módulo que no recibe nada**
—y es una fila de `_UserModules` de verdad, no un id inventado— y que al pulsar
el aviso `aDondeLleva` devuelve `/tickets?ticket=<id>`.

`MODO=roto` corre la forma INGENUA —avisar a todo el equipo sin mirar el módulo
ni el responsable— y **afirma los dos fallos**: que la persona sin acceso recibe
y que un ticket ya asignado sigue despertando al equipo entero. Sin ese modo, lo
verde de al lado no diría si la regla se cumple o si el caso no se llega a
ejercer.

## Actividad del equipo: una fila es un CUBO, no un latido

Mide dónde pasa su jornada cada persona y qué hizo en ella. Lo delicado no es
la pantalla: es que medir tiempo **con una fila por latido** llena la base.

Con 250 personas y jornadas de 8 horas, un latido cada 30 s son **240.000 filas
al día** —87 millones al año— para contar una cosa que cabe en un número.

> **El navegador ACUMULA y manda su total; el servidor guarda un cubo por
> `(persona, día, sección, pestaña)`.** Una jornada entera son **seis filas**,
> una por sección, no novecientas. Medido en el banco: 480 envíos de ocho horas
> dejaron 6 filas, y dos meses de un equipo de diez son **7.200** frente a las
> ~576.000 de un latido cada 30 s.

Y de ahí salen, gratis, las otras dos respuestas.

### Qué pasa si se cierra el navegador de golpe: NO hay fila abierta

Es la pregunta que parece pedir un evento de salida, y la respuesta es que **no
puede haberlo**. Modelado como «entró a las 9, salió a las 18» hace falta que
llegue el cierre, y el día que no llegue —un cierre a lo bruto, un corte de
luz— esa fila se queda abierta y la persona aparece con **catorce horas**.

Un cubo no tiene estado abierto: lo que se pierde es la cola, **como mucho un
envío**. Se intenta no perderlo con `visibilitychange` → `hidden` y `pagehide`
—`beforeunload` no vale, en móvil no se dispara— y con `sendBeacon`, que el
navegador entrega aunque la página ya no exista; un `fetch` en ese momento lo
cancela él mismo. Con un corte de luz no se dispara nada y se pierde ese
minuto: ese es el suelo y no se disimula.

### Reenviar no puede contar dos veces: `GREATEST`, no `+`

Lo que viaja es el **acumulado**, y el servidor guarda
`GREATEST(lo que hay, lo que llega)`. Eso hace dos cosas a la vez:

- Un **reintento** tras un corte de red es inofensivo. Con una suma, cada
  reintento inflaría la jornada y no habría forma de saberlo después.
- Un **envío perdido** lo arregla el siguiente, que ya trae el total. No hay
  nada que reconciliar.

Por eso la llave lleva `pestanaId`: sin él, dos pestañas con totales distintos
se pisarían con `GREATEST` y ganaría la más vieja.

### El tope va sobre el DÍA, no sobre el envío

Esto lo cazó el banco al primer intento y conviene no volver a escribirlo mal.
La primera versión puso un tope de **15 minutos por envío**, razonando que «un
minuto de reloj no trae más de un minuto de trabajo». Pero lo que viaja es el
acumulado, así que ese tope no recortaba un pico: **recortaba la jornada
entera**. Ocho horas repartidas en seis secciones salían como **90 minutos**
—seis topes de 900 s— sin un solo error por ningún lado.

**Un tope mal colocado no se ve como un fallo: se ve como un equipo que no
trabaja.** El tope del servidor es lo que no puede ser cierto de ninguna manera
(16 h por sección y día); lo que protege de un reloj que salta —el portátil que
despierta de suspensión— es `MAXIMO_POR_VUELTA_MS`, **en el navegador**, que es
quien sabe cuánto duraba su propia vuelta. Ahí sí es un incremento y ahí sí va
corto.

### Con dos pestañas cuenta la ÚLTIMA que se tocó

Dos pestañas abiertas —una en Chats y otra en Proyectos, que es lo normal—
acumularían las dos el mismo minuto y el día saldría de dieciséis horas.
`document.visibilityState` **no lo evita**: en dos ventanas lado a lado las dos
están «visible».

La regla es una frase y resuelve los dos problemas de golpe: **manda aquella
donde la persona tocó algo la última vez**. No se cuenta dos veces, y además el
tiempo cae en la sección donde de verdad se está trabajando — un mando por
orden de llegada dejaría contando a la pestaña de Chats mientras se trabaja en
la de Proyectos.

Vive en `localStorage`, que es lo único compartido entre pestañas, y **todo va
en `try/catch`**: en una ventana privada leer puede lanzar, y sin eso el
contador entero se cae en los navegadores donde más se mira la privacidad. Sin
mando no se bloquea a nadie: se cuenta, que es preferible a no contar.

### Tres capas, y solo la tercera crece con el trabajo

| tabla | una fila por | crece con |
| --- | --- | --- |
| `actividad_jornada` | persona · día · sección · pestaña | el calendario |
| `actividad_acciones` | persona · día · tipo | el calendario |
| `actividad_resultados` | acción de verdad | lo que hace la gente |

Las dos primeras **ya vienen sumadas por día**: la forma de escribirlas ES el
resumen, así que no hay ningún trabajo nocturno que agregue nada ni ventana en
la que el resumen esté a medias. Medido con dos meses de un equipo de diez
dentro: **un mes tarda 3 ms**, entrando por `actividad_jornada_cuenta_dia_idx`
y no barriendo la tabla.

**Ninguna consulta de la pantalla toca `chat_messages`, `tasks` ni `cobros`.**
Contar «mensajes del mes pasado» barriendo la tabla grande es exactamente el
problema que describe la regla del BRIN; aquí el contador se escribe cuando
pasa la cosa y leerlo no cuesta nada. Eso es lo que hace que **lo que crece con
el reloj no tenga una fila por evento**, y lo que crece con el trabajo real sí.

### Lo que cuenta cosas DISTINTAS no se cuenta por evento

«Chats atendidos» sumando uno por mensaje diría lo mismo que «mensajes
enviados» con otro nombre, y entonces sobra una de las dos. «Clientes tocados»
por cada edición contaría tres veces al mismo cliente en una tarde.

Se deduplica **sin ninguna tabla nueva** (`anotarUnaVezAlDia`): el id de la
fila de resultado se construye a mano —`tipo:persona:día:cosa`— y decide el
`ON CONFLICT DO NOTHING`. **Quien decide es la base**, por las filas que dice
haber tocado, y no un `SELECT` previo nuestro: dos peticiones a la vez verían
las dos que no existe y sumarían las dos.

### Se apunta cuando SALIÓ, y los tres caminos de envío por igual

Un mensaje se apunta **después** de `persistChatMessage`, no junto a la pausa
de la IA: hasta ahí no se llega si el envío rebotó, y contar un envío fallido
es la misma trampa que anotar un hito de cobro que no salió. Igual en Cobros
—detrás del `return` del fallo— y en Tickets, donde va **detrás del `cambio`**:
si otro administrador se adelantó, esa llamada no tocó ninguna fila y tampoco
es trabajo suyo. Es la misma condición que decide si sale el WhatsApp.

Y los **tres** caminos de envío lo apuntan —el de Evolution, el de Waha y el de
los canales de credenciales—. Con uno fuera, los números serían «a veces
funciona», que es peor que no tenerlos.

### Es de la PERSONA, y por eso reutiliza `quienFirma`

De quién es el tiempo lo decide el servidor con la sesión, **nunca el cuerpo de
la petición**: si el navegador pudiera decir a nombre de quién va, cualquiera le
escribiría la jornada a otro. Y la pregunta —quién es la persona, cuál es su
cuenta— es **exactamente** la del chat de equipo, así que se usa `quienFirma` y
no una fórmula nueva: dentro de una cuenta ajena por «Ingresar» el tiempo es de
quien está sentado delante, no del cliente.

Lo mismo con `apuntarLoQueHizo`: existe para que instrumentar sea **una línea**
en cada sitio. Con la resolución de la persona copiada en cada llamador, el
octavo se equivoca — y aquí equivocarse significa apuntarle el trabajo a otro.

### La CASA y los CLIENTES: se reparte por la cuenta de la PERSONA

El súper administrador veía en la misma tabla a su equipo y a gente de cuentas
cliente, revueltos y sin saber de quién era cada fila. Van en dos bloques: la
casa arriba —lo único visible al entrar— y los clientes detrás de una barra
plegada, con el mismo desplegable del reparto del trabajo de Proyectos (un botón
con su `aria-expanded` y el chevron que gira, y el contenido **sin montar**
mientras está cerrado, que es lo que hace que tenerlo cerrado no cueste nada).

> **El reparto y la columna «Cuenta» salen de la cuenta a la que PERTENECE cada
> persona** —`owner_id ?? id` de su fila en `User`—, **nunca de
> `actividad_jornada.cuentaId`**, que dice contra qué cuenta se guardó el rato.

Los dos valores coinciden casi siempre y se separan justo en el caso que
importa: quien entra en la cuenta de un cliente con **«Ingresar»** escribe su
jornada bajo la cuenta del cliente, porque `quienFirma` resuelve
`ownerId ?? id` de la fila EFECTIVA. Comprobado contra Postgres con las cuentas
reales, y las dos mitades del fallo se ven en la misma tabla:

| | por la cuenta de la actividad | por la cuenta de la persona |
| --- | --- | --- |
| Yair, administrador de una vinculada, que ese día entró a un cliente | **CLIENTES** | ARRIBA |
| Pedro, del cliente | CLIENTES | CLIENTES |

Y la otra mitad, que es la que obliga a listar la casa **desde `User` y no desde
quien registró algo**: una casa que ese mes trabajó dentro de cuentas de
clientes dejaría el bloque de arriba **vacío**. Aquí el cero es el dato —Sofía,
sin nada registrado, sale igual—, y ese bloque no puede quedarse en blanco.

Cuatro cosas que hay que mantener:

1. **La casa es la FAMILIA, no la cuenta sola** (`laFamiliaDeLaCuenta`).
   `ownerId ?? id` **no sube a la madre**, así que sin esto las cuentas
   vinculadas —«Verzay | Atencion», «Verzay Ventas»— saldrían como clientes de
   su propia casa. Es el mismo fallo que ya partió el General del chat de
   equipo en dos, por otra puerta.
2. **Los clientes SÍ se parten de quien ha registrado algo.** `User` entera son
   todas las cuentas de la plataforma, y una tabla con las que nunca han abierto
   la App no dice nada. Las dos listas se arman con criterios distintos **a
   propósito**, y cada uno responde a su pregunta.
3. **El reparto es puro** (`repartirEnDosBloques`), y por eso la acción manda
   `cuentasDeLaFamilia` como dato en vez de partir la lista ella. Lo que decide
   la pantalla se prueba en el banco sin levantar nada.
4. **Para quien no es súper administrador no cambia nada.** Su rama declara
   familia a las cuentas de la gente que ya le devuelve su propia consulta, así
   que todos caen arriba y **la barra ni se pinta** — sin resolver ninguna
   familia, que sería una consulta más para no cambiar nada. Y la barra tampoco
   sale con cero clientes: una barra que se abre y sale vacía se lee como que la
   pantalla está rota.

Y una separación que hizo falta para que el tipo no mintiera: `laJornadaDe` lee
`actividad_jornada` y `actividad_acciones`, que **solo saben de `personaId`**,
así que devuelve `MedidasDeLaJornada` —sin quién es—. Con un solo tipo, esa
consulta tenía que inventarse un `cuentaId` que no está en sus tablas y el único
candidato a mano era justo el dato equivocado. **Quién es cada persona y de qué
cuenta es lo resuelve la acción, contra `User`.**

Medido en Chromium a 1280×900, que es la regla de siempre para una columna
nueva: la barra ocupa el ancho entero (1.248 px, el mismo de las tablas) con su
chevron pegado al borde derecho, y la tabla con la columna «Cuenta» dentro
**no desborda** — 224 px para la persona y 148 para la cuenta.

### La tercera capa se guarda desde el primer día y no se enseña

Cuánto tardó en cerrarse un ticket, si un cobro se pagó. **No se pinta**: sin
meses detrás, un porcentaje contra nada no dice nada. Pero se guarda ya, porque
empezar a guardarlo el día que haga falta es empezar de cero justo entonces. La
pantalla lo dice en su pie, para que no parezca que falta.

Y se cierra **el último tramo abierto** de ese `refId`, no todos: un ticket se
puede reabrir y volver a cerrar, y cerrarlos todos de golpe le pondría a un
tramo de horas la antigüedad del primero.

## Borrar los seguimientos de un número es borrarlos en SU cuenta

Marcar un lead como Descartado —desde la pantalla o con la herramienta
«Marcar_Descartado» del agente— y la frase de despedida del asesor borran los
seguimientos pendientes del número. Los tres lo hacían con el `remoteJid` a
secas, y un seguimiento **no tiene `userId`**: cuelga de su línea
(`instancia`). El mismo número está en muchas cuentas, así que la acción de una
se llevaba los seguimientos de todas las demás de la plataforma, sin error.

> **Se borran los de ese número en las líneas de la cuenta donde ocurrió la
> acción** (`instancia IN` su `instanceName` y su `instanceId`). Sin líneas no
> se borra nada: nunca un `where` sin `instancia`. La regla es
> `lib/seguimientos-de-la-cuenta.ts` aquí y
> `src/modules/seguimientos/seguimientos-de-la-cuenta.ts` en el backend, y
> tienen que decir lo mismo.

La cuenta es la dueña de la conversación: `session.userId` al descartar, la
dueña de la línea (`effectiveOwnerId`) en la despedida y el `userId` del agente
en la herramienta. Lo que ya filtraba cada camino (la herramienta conserva los
recordatorios y las citas) no cambia. **Si se añade otro borrado por número, va
por esa función.** Lo prueba `scripts/banco-seguimientos-de-la-cuenta.sh` en los
dos repositorios, contra Postgres y en dos modos: el roto corre el borrado viejo
y afirma que cruzaba de cuenta.

## Calidad de conversaciones (CRM › Calidad) y exportar conversaciones

**La IA puntúa cada conversación** con una rúbrica de cinco criterios
(saludo 15, primera respuesta 15, resolución 10, tono 25, si resolvió 35) y el
CRM lo reparte por asesor: puntaje medio, tiempo medio de primera respuesta y
de resolución, y las conversaciones por debajo de 60 marcadas como ejemplo de
qué mejorar. La regla es pura en `lib/calidad-de-conversaciones.ts`; guarda
`lib/calidad-db.ts` (tabla de la App `calidad_conversaciones`, UNA fila por
conversación, sin copiar el texto) y corre `lib/calidad-runner.server.ts`.

Seis cosas que hay que mantener:

1. **Los tiempos se MIDEN, no se preguntan.** Primera respuesta y resolución
   salen de las marcas de `chat_messages`; a la IA solo se le pide lo que no se
   puede medir (saludo, tono, si resolvió). Un criterio que no se puede medir se
   saca de la cuenta y el resto se repondera: nunca vale cero.
2. **La primera respuesta es la de una PERSONA** cuando hay asesor; la de la IA
   solo cuenta si la conversación es de la IA. Así «Agente IA» y cada asesor
   tienen su propio número.
3. **El runner NO es una acción**: `server-only`, y corre SOLO por dos
   puertas: «Evaluar ahora», que re-resuelve el alcance, y el corte semanal del
   reporte (ver la sección de abajo). Topes: 25 por cuenta y vuelta, solo lo que
   tiene mensajes nuevos, 3 min por cuenta en el corte.
4. **Paga la cuenta dueña, con la IA de la cuenta** (el mismo proveedor que el
   motor) y solo si tiene créditos; se cobra después de guardar. Sin IA o sin
   créditos no se evalúa y se dice.
5. **Sin grupos, estados ni difusiones** (`sinGruposSql`), y la puerta es la del
   CRM: `lasCuentasQueConsultaElCrm`, hacia abajo, y un `agente` no la ve.
6. **Correo NO entra**: un correo es de la persona que lo conectó y de nadie más
   (ni el dueño, ni un administrador), así que no puede aparecer en un tablero
   del equipo.

**Exportar** saca un `.txt` legible como el de WhatsApp Web («fecha - Quien:
texto»); varias van en un `.zip` (`lib/zip-sencillo.ts`, sin dependencias). En
Chats por UN camino (`useExportarConversaciones` → `exportarConversacionesAction`):
Acciones de la cabecera, el lote y el CRM. Lee con TODAS las identidades del
contacto, deja fuera las notas internas y **lo que no alcanza quien pide se
cuenta como omitido**, nunca se exporta. En Correo, `exportarCorreosAction`, solo
del propio buzón y sin marcarlo como leído.

Lo prueba `scripts/banco-calidad-y-exportacion.sh`: reglas, zip abierto con
Python y un barrido, y las acciones y el runner contra Postgres. `MODO=roto`
afirma la lectura por una sola identidad (la conversación sale a medias) y la
selección ingenua (grupos pagados).

### Exportar: PDF o texto plano, y los dos salen de la MISMA lectura

Exportar una conversación de Chats ofrece dos formatos, en los TRES sitios que
exportan —el submenú «Exportar conversación» de Acciones, la barra en lote y
CRM › Calidad—: **Como PDF** (burbujas tipo WhatsApp, con el logo y el nombre
del negocio en la cabecera) y **Como texto plano** (el `.txt` de siempre, sin
tocar). La lista es una (`lib/formatos-de-exportacion.ts`) y las opciones se
pintan con una pieza (`components/shared/MenuDeExportar.tsx`). Correo sigue
exportando solo texto: su barra no pasa `exportaEnFormatos`.

> **El PDF no tiene filtro propio.** Pasa por `losMensajesQueSeExportan`, la
> misma función del `.txt` (sin notas internas, sin vacíos, por fecha), y firma
> con `nombreDeQuienHabla`. Lo genera `lib/conversacion-en-pdf.ts` con
> `pdf-lib`, en la MISMA acción y con la MISMA puerta que el texto.

Cinco cosas que hay que mantener:

1. **La marca es de la cuenta DUEÑA de la línea**, no de quien exporta
   (`laMarcaDelNegocio`): `brandName`, si no `nombreDeLaCuenta`; el logo es
   `User.image` (el de Perfil). Sin logo, las iniciales.
2. **Solo se descarga lo de NUESTRO almacenamiento** (`seDejaIncrustar`: el
   mismo origen que `S3_PUBLIC_URL`), el logo incluido. La dirección de un
   adjunto la escribió alguien de fuera: pedirla sería mandar al servidor a
   donde diga. Las imágenes se reducen con sharp a JPEG y van en una cola de 4,
   con tope por conversación (60) y por lote (200); lo demás sale como tarjeta.
3. **Nada se esconde**: video, nota de voz (duración y transcripción),
   documento, ubicación, contacto, sticker y llamada van como tarjeta con su
   icono y su enlace pulsable; lo eliminado, en cursiva.
4. **Las fuentes estándar solo saben WinAnsi**: `aTextoImprimible` quita los
   emojis antes de medir, o `pdf-lib` lanza y no sale el PDF. Un mensaje que era
   solo emoji dice «(emoji)».
5. **El PDF viaja en base64** (`formato: "pdf"`) y `descargarExportacion` lo
   baja con sus bytes tal cual: el BOM de texto delante lo rompería.

6. **El contenido fluye seguido entre páginas** (`elCorteDeLaBurbuja`). Un
   mensaje que no cabía al final de la hoja pasaba ENTERO a la siguiente, y
   con uno de treinta líneas eso dejaba media página en blanco, como un salto
   de página forzado. Ahora uno corto (menos de `LINEAS_PARA_PARTIR`, 7) sigue
   pasando entero —el hueco es su propio alto—, y uno largo se parte por sus
   LÍNEAS, nunca por el medio de una, con al menos 3 a cada lado y «continúa»
   donde iría la hora. El separador de día va pegado a su mensaje, todas las
   burbujas llevan el mismo pie y el mismo aire, y el «Página N de M» va a
   `MARGEN` del borde, como el resto de la hoja. Lo prueba
   `scripts/banco-pdf-sin-huecos.sh` leyendo el PDF con pdf.js: ningún hueco
   al final de una hoja pasa del alto de un mensaje corto; `MODO=roto` corre
   el generador de `8b1bdab` y afirma huecos de más de 300 pt.

Lo prueba `scripts/banco-exportar-pdf.sh`: las reglas y el PDF leído con pdf.js
(todos los tipos, lados, enlaces, imágenes, el `.txt` idéntico a `ANTES_REF`),
el PDF renderizado en Chromium con el color de cada burbuja medido en píxeles y
el menú real de la barra, y la acción contra Postgres (la marca de la hija, la
foto incrustada y la dirección de fuera sin pedir). `MODO=roto` afirma que en
`ANTES_REF` no había PDF.

### Cuándo corre: a pedido y en el corte del reporte, nunca solo

Evaluaba cada día, desde el cron de facturación, toda conversación con **dos
horas sin mensajes**. Eso se fue entero: ni barrido diario, ni reposo que
esperar. Corre cuando alguien pulsa «Evaluar ahora» y en el **corte semanal**,
que es el mismo reloj que ya usa Reportes: `runWeeklyReportForAllUsers` evalúa
cada cuenta **justo antes** de mandar su reporte, con su tope de tiempo y en su
propio `try` —un fallo del QA no puede dejar a nadie sin reporte—.

Sin reposo, una conversación evaluada a medias se vuelve a evaluar en el
siguiente corte si entraron mensajes nuevos: la fila se reescribe, no cuenta dos
veces. **Generar el reporte a mano desde Reportes NO evalúa** ni gasta créditos:
lee lo ya evaluado. El botón para eso es «Evaluar ahora».

### Y el reporte semanal lleva la calidad en una o dos líneas

Sección «🎯 CALIDAD DE ATENCIÓN», sin desglose por conversación —eso vive en
CRM › Calidad—. Lo decide `elResumenSemanalDeCalidad` (puro) y lo escribe
`lasLineasDeLaCalidad`, que usan **los dos sitios**: el WhatsApp (con
asteriscos) y la pantalla de Reportes, que la lee de `metrics.calidad` del
reporte guardado. Con dos redacciones una diría otra cosa.

1. **El promedio es de todo lo evaluado de la semana**, IA incluida: es lo que
   se atendió. **El mejor asesor sale solo de las personas** (`asesorId`), y a
   igualdad gana quien atendió más.
2. **Sin equipo** —nadie cuelga de la cuenta por `ownerId`— el dueño atiende
   solo: el reporte dice «Tu calidad de atención» y no nombra a ningún mejor
   asesor.
3. **Sin nada evaluado no hay sección**, nunca un «0/100». Y leer la calidad
   nunca tumba el reporte: si falla, sale sin ella y se dice.

Lo prueba `scripts/banco-calidad-semanal.sh`: la regla y un barrido, y el corte
de verdad contra Postgres con la IA y el WhatsApp fingidos (una cuenta con
equipo, una con el dueño solo y una vacía, y una conversación de hace cinco
minutos). `MODO=roto` corre lo mismo contra `ANTES_REF` y afirma que el cron
diario lanzaba el barrido, que se esperaban dos horas y que el reporte no decía
nada de la calidad.

## Recordatorios: salen a SU hora, en la zona de la CUENTA, y una cita siempre los programa

Cuatro fallos reportados juntos (2026-09-28), y cada uno con su causa:

| lo que se veía | la causa |
| --- | --- |
| el recordatorio de la cita salía tarde, o el de 1 h antes que el de 3 h | el motor de seguimientos (backend) tomaba 25 por vuelta **por antigüedad**, y de noche los ocupaban seguimientos de flujo que esperan horario laboral |
| los manuales y los de tareas salían a la hora de Colombia en cualquier cuenta | se guardaban como reloj de pared («dd/MM/yyyy HH:mm») y el motor los leía con `FOLLOW_UP_TIMEZONE_OFFSET` fijo; y el texto de la cita decía la hora del **país del teléfono** del cliente |
| la acción «Recordatorio» de automatizaciones no mandaba nada y aparecía uno de más ~34 min antes de cada cita | escribía una fila `Reminders` con `isSchedule` y hora ISO; el motor no la mandaba, y las rutas de citas la leían como plantilla con `parseInt("2026-…")` = **2026 segundos** |
| una cita agendada desde el chat no tenía ningún recordatorio | `createAppointment` no programaba nada; solo lo hacían el agente y la página pública, cada uno con su copia |

Seis reglas que hay que mantener:

1. **Los recordatorios con hora van en su PROPIO carril** del motor
   (`prioridad-de-la-vuelta.ts` en el backend): citas, reservas, tareas, los
   manuales, las confirmaciones y los de automatizaciones salen siempre, por
   hora, sin contar contra el cupo y sin esperar horario laboral. Lo que está
   fuera de ventana o esperando turno **no ocupa puesto**.
2. **Todo se lee y se enseña en la zona de la CUENTA** (`User.timezone`, con la
   del dueño si es del equipo; `lib/zona-de-la-cuenta.ts` aquí y
   `src/utils/zona-horaria.util.ts` allí). Lo que la App escribe en
   `seguimientos.time` es un **instante ISO** (`laHoraParaElMotor`); el reloj de
   pared viejo lo sigue entendiendo el motor, ahora en la zona de su cuenta.
   `Reminders.time` sigue siendo el reloj de pared de la pantalla.
3. **Los recordatorios de UNA cita los programa `programarLosRecordatoriosDeLaCita`**
   (`lib/recordatorios-de-la-cita.server.ts`), y la llaman los tres caminos: el
   chat (por `createAppointment`), el agente y la página pública. Es
   idempotente por `idempotencyKey` (`appt-reminder:<cita>:<plantilla>`), así
   que llamarla dos veces no duplica; mover la cita borra los pendientes y los
   vuelve a programar.
4. **Cuánto antes sale una plantilla lo decide `segundosAntesDeLaCita`, y es
   estricta**: solo `unidad-número` (`hours-3`). Una hora ISO o un número
   suelto valen 0 y no programan nada. La usa también la ruta de reservas.
5. **La acción «Recordatorio» escribe un seguimiento `auto-reminder-`**, no una
   plantilla: sin retraso manda al momento. La migración del backend
   `20260928120000_recordatorio_de_automatizacion` rescató los futuros y borró
   las plantillas basura y sus recordatorios de 34 minutos.
6. **El recordatorio de una TAREA sale por la línea por QR de la cuenta**
   (`laLineaDeWhatsappDeLaCuenta` + `lasCredencialesDeLaLinea`). Pedía
   `Instancias.apiKeyId`, que esa tabla no tiene: Prisma lo rechazaba, el
   `catch` lo callaba y **ninguno se llegaba a crear**.

Lo prueban `scripts/banco-recordatorios-de-cita.sh` aquí (reglas y las acciones
contra Postgres; `MODO=roto` contra `626a48c` afirma los fallos) y
`scripts/banco-recordatorios-a-su-hora.sh` en el backend (el motor con 60 flujos
esperando horario, las zonas de México y Madrid, la acción y la migración).

## La Agenda de la familia: las CITAS bajan, la configuración se queda

El tablero de Agenda (Dashboard y Kanban de `/schedule`) enseña las citas de
la cuenta y las de las cuentas que cuelgan de ella, **en una sola lista**, para
que se vean los cruces de horario. Nunca las de la madre ni las de una hermana.

> **No se estrenó ningún mecanismo.** El alcance es la MISMA puerta del CRM
> (`resolverLasCuentasDelCrm` en la página, `lasCuentasQueConsultaElCrm` en las
> tres lecturas): hacia abajo, la URL limpia es «todas», un `agente` ve lo suyo.
> El filtro es el mismo `SelectorDeCuentas` con las mismas props que CRM ›
> Llamadas, y la marca «● Ventas» es la misma `InsigniaDeLinea` con la misma
> regla de color y palabra (`laInsigniaDeLaFila`, en
> `lib/agenda-de-la-familia.ts`, que ahora usa también Llamadas). Sale solo
> cuando se mira más de una cuenta, igual que allí.

Cinco cosas que hay que mantener:

1. **Solo las citas.** Disponibilidad, Servicios, Recordatorios, Formulario,
   Registros y Ajustes siguen siendo de la cuenta propia (`effectiveId`), y el
   filtro **solo se pinta en las pestañas de citas**: en las otras sería un
   filtro que promete lo que la pantalla no hace.
2. **Sin `cuentasPedidas` las lecturas devuelven la cuenta propia**, como
   siempre. Solo el tablero pasa la lista; cualquier otro llamador no cambia.
3. **Desde la madre, una cita de una hija se ve y se le cambia el estado** —es
   la misma fila, así que el cambio se ve en las dos cuentas—, **pero no se
   borra ni se crea**: «Eliminar» no se ofrece en una cita ajena
   (`esCitaDeOtraCuenta`). `updateAppointmentStatus` ya dejaba a la madre y no
   a la hija, por `assertCanAccessTargetUser`.
4. **El aviso al cliente sale de la cuenta DUEÑA de la cita.** El calendario lo
   mandaba desde el navegador con la clave y la primera línea de **quien
   miraba**: desde la madre, el cliente de la hija habría recibido el aviso del
   número de la madre. Ahora lo manda `sendAppointmentStatusNotification`, en
   el servidor, por `laLineaDeLaNotificacionDeCita`: la línea de la
   conversación si es de la dueña, y si no su línea por QR — nunca una línea de
   otra cuenta, y ya no `instancias[0]` a secas, que podía ser un canal de Meta.
   Y deja de ser mudo: devuelve si salió y por qué no.
5. **El teléfono de una cita abre el chat con su línea** (`&instance=`): con el
   mismo contacto en dos líneas, sin ella se abría el de la primera.

Lo prueba `scripts/banco-agenda-de-la-familia.sh`: la decisión y un barrido
(el filtro y la insignia comparados con los de CRM › Llamadas), y las acciones
contra Postgres —una madre con dos hijas, una hija que no ve ni a su madre ni a
su hermana aunque escriba el parámetro, el filtro que reduce, el cambio de
estado visto desde las dos cuentas y el aviso saliendo por la línea y con la
clave de la hija—. `MODO=roto` lee la Agenda de un commit pinchado (`ANTES_REF`)
y lleva la consulta y el aviso viejos escritos dentro, y afirma el fallo.

## Embudos: la conversación va al embudo de SU ASESOR, y eso no se guarda

`/embudos` es el tablero de cada asesor: la cuenta tiene varios embudos, cada
uno con sus etapas, y cada persona del equipo tiene asignado uno. El asesor ve
SU embudo con solo sus conversaciones, y lo único que hace es mover sus
tarjetas de etapa. El dueño y los administradores —**los mismos permisos**—
ven todos los embudos, crean, renombran, borran, editan etapas (nombre, orden
y color), eligen el por defecto y asignan asesores.

Va **fuera de `/crm`** a propósito: el layout del CRM saca a los agentes, y
esta es su pantalla de trabajo. La ruta está en `navigationRoutes` y no se
monta en ningún módulo: se asigna a mano, como `/cobros`.

> **De qué embudo es una conversación se DEDUCE de su asesor**
> (`elEmbudoDeLaConversacion`, `lib/embudos.ts`): el de su asesor, y sin asesor
> —o con uno sin embudo— el embudo **por defecto**. Guardarlo obligaría a cada
> camino que reasigna una conversación (la bandeja, la transferencia, el
> reparto automático, el escalado, el backend) a acordarse de moverla, y el
> que se olvide la deja en un tablero que ya no es el suyo.

Cinco cosas que hay que mantener:

1. **La etapa se guarda por conversación Y embudo** (`embudo_posiciones`,
   clave `(sessionId, embudoId)`). Si pasa a un asesor con otro embudo entra en
   la primera etapa; si vuelve, recupera la que tenía. Una etapa guardada que
   ya no existe cae en la primera: **ninguna tarjeta desaparece por su etapa**.
2. **El filtro del tablero y la regla de la conversación dicen lo mismo**
   (`quienCaeEnElEmbudo` frente a `elEmbudoDeLaConversacion`). El banco las
   encadena para cada asesor posible: si discreparan, una tarjeta saldría en
   un tablero y al moverla diría «cambió de embudo».
3. **Mover no da el embudo por bueno**: `moverTarjetaAction` lo vuelve a
   deducir y exige que la etapa sea de él. Una pestaña con un tablero viejo no
   deja una posición en un embudo que ya no es el suyo, y lo dice.
4. **Sin embudo marcado, el por defecto es el primero** (`elEmbudoPorDefecto`),
   y el primero que se crea nace marcado. Borrar el por defecto no deja
   conversaciones fuera de todos los tableros.
5. **Cuatro tablas de la App, sin columna nueva en `Session`** (es del backend,
   el #360), con `ddl()` para las dos réplicas. Borrar un embudo o una etapa no
   toca ni una conversación.

La tarjeta **es la del Kanban del CRM** (`KanbanCardItem`, exportada con un
hueco `pie` para el asesor): con una copia, el día que se afine una la otra se
queda atrás.

## Embudos: la etapa se cambia DESDE EL CHAT, y es la misma puerta

Una conversación solo cambiaba de etapa arrastrando su tarjeta en `/embudos`, o
sea saliéndose del chat que se está atendiendo. En la cabecera de la
conversación, al lado del buscador de etiquetas, hay un selector que la cambia
sin salir (`SelectorDeEtapaDelEmbudo`).

> **No hay un segundo camino.** Mueve con **`moverTarjetaAction`** —la misma del
> tablero, con su validación y su permiso— y lee con
> **`etapaDeLaConversacionAction`**, que deduce el embudo y la etapa con las
> MISMAS funciones que el tablero (`elEmbudoDeLaConversacion`,
> `laEtapaDeLaConversacion`). Lo que se ve aquí y lo que se ve allí no pueden
> discrepar porque salen del mismo sitio; con la regla copiada, una pantalla
> enseñaría una etapa y la otra otra, y no habría forma de saber cuál miente.

La lectura es la que faltaba: el tablero contesta lo mismo, pero armándolo
entero —el equipo, las asignaciones, hasta 500 conversaciones con sus etiquetas
y sus seguimientos—, que es lo más caro de esa pantalla. Aquí son cuatro
consultas cortas sobre una sola fila.

Y la puerta se pregunta **una vez**: `laConversacion` —la conversación es de la
cuenta, y `puedeMoverLaTarjeta`— la usan los dos caminos. `puedeMover` se
**devuelve** en vez de rechazar, porque leer la etapa no es moverla: un asesor
VE en qué etapa está una conversación que no lleva, de solo lectura y con el
motivo escrito debajo. Un botón apagado no dice por qué, y esconderlo deja sin
ver el dato.

### Se carga al ABRIR el selector, no al abrir la conversación

Es lo que hace su vecino de fila (`ChatAppointmentStatusButton`) y por el mismo
motivo: Chats es la pantalla más cara de la App y una consulta por conversación
abierta se paga todo el día, también en las cuentas que no usan embudos. El
precio se dice: el rótulo pone «Etapa» hasta la primera vez que se abre.

### Y por qué NO lleva `revalidatePath`

El tablero lee `embudo_posiciones` en cada carga, así que en cuanto la acción
escribe el dato ya está ahí. Lo único que puede taparlo es el **caché del
enrutador**: Next 14 guarda una página dinámica 30 s en el navegador, así que ir
a Chats, mover la etapa y volver a Embudos dentro de ese rato pinta la foto de
antes.

> **`revalidatePath` desde una acción de servidor obliga a re-renderizar la ruta
> ACTUAL.** Llamado desde el chat eso es la pantalla de Chats entera en cada
> cambio de etapa; llamado desde el tablero, la consulta de 500 tarjetas en cada
> arrastre. Es justo el coste que este documento evita, y por eso
> `moverTarjetaAction` es la única escritura de su fichero que no revalida.

Se cierra con una marca en `sessionStorage` (`lib/etapa-desde-el-chat.ts`): la
deja quien mueve y la recoge el tablero al montarse, **en la misma pestaña**,
que es el camino de verdad (Chats → Embudos). Tres cosas:

1. **Sin marca no se pide nada.** Abrir el tablero sin haber tocado nada —el
   caso normal— no paga ni una consulta.
2. **Se lee UNA vez**: la marca se borra al leerla. Dejándola puesta, el tablero
   volvería a pedir sus datos en cada montaje por un cambio que ya recogió.
3. **Cada acceso va en su `try`.** En una ventana privada tocar el
   almacenamiento lanza, y ni el chat ni el tablero pueden caerse por eso. Sin
   almacenamiento se vuelve a lo de siempre —el tablero se refresca al
   navegar—, que es el lado seguro: se ve de menos unos segundos, nunca una
   etapa que no es.

Lo prueba `scripts/banco-embudos.sh`: la lectura y el tablero se piden **y se
comparan encadenados** (dos caminos para la misma pregunta), un asesor ve la
etapa de una que no lleva y no la mueve, lo que se cambia desde el chat sale en
el tablero, y una cuenta sin embudos lo dice en vez de reventar. Comprobado que
caza: aflojando `puedeMover` o dejando que la lectura se invente su propia regla,
se pone en rojo.

Y de paso se fue el `import` de `LeadStatusSelect` de `ChatHeader.tsx`, que
estaba puesto y no lo usaba nadie desde que el estado del lead se ve en el
Contexto del lead. Lo pinta la FILA de la lista (`ChatContactItem`), que sí lo
importa.

### Y se ve sin abrir nada: el COLOR en la cabecera, una pastilla en la fila

La etapa solo se sabía abriendo el selector, chat por chat. Y ese selector era
**el único control de su fila con rótulo**: llevaba el nombre de la etapa
escrito al lado (hasta `max-w-[9rem]`) mientras sus siete vecinos —llamar, el
asesor, el recordatorio, la cita, la tarea, los registros, el contexto— son
cuadrados de 28 px. Puesto entre ellos no se leía como uno más.

> **En la cabecera, el color del icono ES el dato**: el botón pasa a ser un
> control de icono como los demás (`CONTROL_DE_ICONO` + `GLIFO_DE_CONTROL`),
> sin texto, con el icono teñido del color de su etapa y el **nombre entero en
> el globo**. **En la fila, la etapa es una pastilla igual a la del estado** —el
> mismo alto, la misma letra, el mismo redondeo y el mismo relleno compacto—.
> Sin embudo no hay pastilla.

De izquierda a derecha la fila se lee «en qué punto del embudo está» → «cómo de
caliente» → «de quién es». **Ese orden cambió**: la etapa nació entre el estado
y «Asignar» y hoy va la primera, para que la fila y el menú de la cabecera no
cuenten lo mismo al revés (ver *ninguna pastilla de la fila es más estrecha que
alta*).

#### El dato viaja con la bandeja, no una consulta por fila

La cabecera pide la etapa de UNA conversación y eso son cuatro consultas
cortas. Repetirlo por cada fila de la lista serían cientos por vuelta, que es
*muchas peticiones pequeñas son turno, no trabajo*. Así que la etapa entra en
`getSesionesDeLaCuenta` como una cosa más de la fila —al lado de las etiquetas,
los seguimientos y las citas— y la resuelve `lib/etapas-de-la-bandeja.server.ts`
para toda la bandeja de una vez: **tres lecturas por cuenta y dos comunes**, en
el mismo `Promise.all` que ya estaba y medidas con el resto (`tiempos.etapas`).

Cuatro cosas que hay que mantener:

1. **La regla no se vuelve a escribir.** De qué embudo es una conversación y en
   qué etapa está lo deciden las MISMAS funciones puras que el tablero y la
   cabecera (`elEmbudoDeLaConversacion`, `laEtapaDeLaConversacion`). Con la
   regla escrita aquí otra vez, la fila diría una etapa y el tablero otra, y no
   habría forma de saber cuál miente.
2. **Los embudos se resuelven por la cuenta de CADA conversación**
   (`sesion.userId`), no por la de quien mira: la bandeja enseña además las
   líneas de las cuentas que cuelgan de ella, y la etapa de una conversación de
   Ventas sale de los embudos de Ventas.
3. **Es best-effort y no es muda.** Va en su propio `catch`, como los
   recordatorios: un fallo suyo no puede dejar la bandeja sin nombres ni
   etiquetas. Pero se escribe, porque una pastilla que deja de salir sin decir
   nada se lee como que los embudos se borraron.
4. **Y el icono de la cabecera sale de ahí, gratis.** La etapa de la
   conversación abierta baja desde la bandeja (`etapaInicial`), así que el color
   está puesto sin abrir nada y sin una consulta más. Lo que se sigue cargando
   al ABRIR el menú es la LISTA de etapas, que es lo caro y lo que casi nunca se
   mira. Una conversación que no estaba en la página cargada de la bandeja sale
   con el icono neutro hasta que se abre, como estaba antes.

#### El color viaja como ÍNDICE, ya resuelto

El color de una etapa sin color elegido es **el de su posición** en el embudo, y
la fila no tiene delante la lista de etapas: solo la suya. Así que el servidor
manda el índice ya resuelto (`elIndiceDelColorDeLaEtapa`, que es de donde tira
ahora también `elColorDeLaEtapa`) y la pastilla lo pinta sin deducir nada.
Deduciéndolo otra vez con una posición que no tiene, la misma etapa saldría de
un color en el tablero y de otro en la fila. El banco encadena las dos
funciones para que no puedan separarse.

Y las clases de los cinco sitios donde una etapa se pinta —la cabecera de la
columna del tablero, el borde de su tarjeta, el punto de la lista, el icono de
la cabecera del chat y la pastilla de la fila— viven **en la paleta**, no en
cada pantalla.

#### 14 caracteres, que son los de «Sin clasificar»

Un nombre de etapa admite hasta 40 (`TOPE_DE_NOMBRE`), y la fila ya va justa.
`elTextoDeLaPastilla` corta a `TOPE_DE_TEXTO_DE_PASTILLA`, que es **lo que mide
«Sin clasificar»**, la pastilla de al lado y el listón que puso el encargo. Tres
cosas:

1. **Los puntos suspensivos van DENTRO de los 14** (13 + «…»). Fuera, un nombre
   de 15 saldría más ancho que la referencia justo en el caso que esto viene a
   acotar.
2. **Y encima hay un tope de ANCHO** (`ANCHO_DE_LA_PASTILLA`): los 14
   caracteres acotan cuántas letras se pintan, no cuánto miden —«WWWWWWW» ocupa
   el doble que «Sin clasificar»—. El número está MEDIDO, no elegido: en esta
   fila «Sin clasificar» mide **89,2 px** y el nombre de 14 caracteres más
   ancho que se ha medido («Esperando res…») **106,4**, así que el tope son
   **6,75 rem (108 px)**: un 21 % más que la referencia, y lo justo para que 14
   caracteres normales no se recorten DOS veces —por caracteres y por ancho—.
   El banco lo mide contra la pastilla de al lado en vez de darlo por bueno.
3. **El `truncate` va en el HIJO, no en la pastilla.** En un contenedor flex el
   texto suelto cae en una caja anónima y ahí `text-overflow` no recorta con
   «…»: se corta a hueso.
4. **Y la pastilla lleva `data-ui="badge"`.** No es decoración: dentro de
   `.app-module-content` un `.text-xs` vale **14 px**, y las reglas de
   `globals.css` solo lo bajan a 12 dentro de un `button`, un `[role="…"]` o un
   `[data-ui="badge"]`. La de estado los tiene porque es el disparador de su
   menú; esta no es pulsable, así que sin la marca salía con la letra **dos
   píxeles más grande que la de al lado**. Lo cazó el banco, no leerlo.

El nombre entero no se pierde: se lee en el globo. Es un `title` y no un
tooltip de Radix **en los dos sitios**, y eso es a propósito: esta pastilla sale
en TODAS las filas y la lista tiene miles, así que un proveedor y dos nodos más
por fila es justo lo que *la lista es grande, no rehacerla por gusto* evita. Los
tooltips de la fila —la espera, los recordatorios— salen en unas pocas.

#### Y cambiar la etapa desde el chat se pinta en la fila al momento

Es la regla de siempre. La acción es la misma del tablero y ya guardó, pero sin
avisar a la lista la pastilla se quedaría con la etapa de antes hasta la vuelta
del reloj de sesiones —hasta 60 s—, y eso se lee como que el cambio no se
guardó. El selector devuelve la etapa ya resuelta y `chats-client` la aplica con
`aplicarEnLaSesion`, que busca por `id` y toca todas las llaves de esa sesión.
El índice del color se resuelve ahí con la MISMA función que el servidor, o la
pastilla cambiaría de color al llegar la vuelta siguiente.

**El `MAX_BADGES` de la fila no se toca.** La etapa entra en el reparto como una
pastilla más y lo que sobre cae en el «+N» con su globo, igual que las demás:
darle un privilegio sería justo lo contrario de la simetría que se venía a
ganar.

Lo prueba `scripts/banco-pastilla-de-etapa.sh`, en tres mitades:

1. **Las reglas y un barrido del código**, sin navegador.
2. **Las consultas contra Postgres**, que es lo que un banco puro no puede
   decir: que las tres lecturas en bloque **corren** —los `::text[]`, los
   `::int[]` y unas tablas que crea la App y no Prisma— y que la conversación
   cae en el embudo de su asesor, que dos cuentas a la vez sacan cada una de
   los suyos, que una posición guardada en OTRO embudo no se cuela y que una
   etapa borrada cae en la primera. Y el encadenado, que es la prueba de oro:
   **la fila y la cabecera dicen la misma etapa**.
3. **La fila y la cabecera reales en Chromium** sobre el CSS del build, a
   1440/1280/1024: que la pastilla mide lo mismo que la de estado en los siete
   campos que la definen, que va **delante** del estado y de «Asignar» medido en
   píxeles (iba entre los dos hasta *ninguna pastilla de la fila es más estrecha
   que alta*),
   que el botón de la cabecera mide lo que sus vecinos y no lleva rótulo, y que
   nada se desborda ni con 40 letras anchas.

`MODO=roto` pinta las dos pantallas con los componentes de `ANTES_REF` y afirma
los dos fallos —ninguna pastilla en la fila y un botón con el nombre escrito que
se come el ancho de sus vecinos—; la mitad de Postgres se salta ahí y lo dice,
porque el «antes» no tenía ninguna de esas consultas que afirmar. Comprobado
además que caza: quitando la pastilla de la fila caen cuatro casos del
navegador, y sacando el embudo de la llave de las posiciones, tres de Postgres.

## Embudos: el tablero de OTRA cuenta, y todos los asesores juntos

Dos ejes sobre el tablero que ya existía, y el primero es el que decide la forma
de todo lo demás.

### La cuenta es UNA, y eso no es una preferencia de diseño

Desde una cuenta se elige cualquiera de las que **cuelgan de ella** y se ve su
tablero. Solo esas: ni la madre, ni las hermanas, ni las cuentas cliente que se
administren sin vínculo —eso se cerró en el #948, y está contado en *el alcance
va HACIA ABAJO*—. Y **nunca se mezclan dos cuentas en un tablero**:

> **Las columnas de un tablero son las etapas de un embudo, y un embudo es de
> una cuenta.** Dos cuentas tienen embudos distintos, con etapas distintas y con
> ids distintos, así que no existe ninguna columna en la que pudieran caer las
> tarjetas de las dos. Un tablero «consolidado» tendría que inventarse las
> columnas —emparejando etapas por su nombre, que es lo único que se parece— y
> entonces mover una tarjeta escribiría una posición en un embudo que no es el
> de su conversación.

Por eso `laCuentaDelTablero` (`lib/embudos-de-la-cuenta.ts`, puro) **devuelve una
cadena y no una lista**: no hay forma de pedir dos, ni desde la URL ni desde una
acción. Es la diferencia entera con las otras dos pantallas que cruzan cuentas, y
conviene tenerla delante antes de «unificar» nada:

| | qué hace su selector |
| --- | --- |
| Finanzas de la familia | marcar varias y **sumarlas** |
| CRM de la familia | quitar de un conjunto que por defecto son **todas** |
| **Embudos** | **elegir una**, y solo una |

Y de ahí que **no se reutilice `components/shared/SelectorDeCuentas.tsx`**: aquel
es de casillas porque su encargo es consolidar, y darle una prop para «una o
varias» sería un componente cuya documentación se contradice a sí misma. Lo que
sí se comparte es lo único que importa —**quién puede elegir qué**—, que sale del
servidor con la misma regla de alcance del CRM.

### El alcance va HACIA ABAJO, y sale de la MISMA función que en Llamadas

Esto fueron tres fuentes y es una, y conviene saber por qué antes de volver a
añadirle ninguna. El selector llegó a **listar todas las cuentas de la
plataforma**: sumaba al alcance `clientesDeLaCuenta` —la cartera—, y para una
cuenta de la casa esa función devuelve **todas las cuentas cliente que
administra**; para un reseller, la suya entera. Cuentas sin un solo vínculo con
la que se estaba mirando.

> **Administrar o facturar a un cliente no lo mete en la estructura de una
> cuenta.** Esa es otra pregunta y la contesta `/panel/clientes`. Lo que hace
> hija a una cuenta es **`linked_accounts`, y nada más**.

Y no se arregló quitándole la fuente a esta copia: **se quitó la copia**.
Llamadas y Finanzas ya resolvían esto, y tener aquí una versión paralela es
exactamente cómo se llega a que una de las tres pantallas ofrezca otra cosa. La
contesta `lasCuentasQueAlcanzaHaciaAbajo` (`lib/cuentas-hacia-abajo.server.ts`),
que usan el CRM y Embudos: la propia y lo que cuelga de ella
(`lasCuentasQueCuelganDe`), **nunca la madre ni las hermanas**, con la familia
entera solo para el superadministrador de verdad —porque toda ella cuelga de
él—. Comparten hasta la entrada del caché, que es la otra mitad de la gracia.

**Si no hay hijas, no se pinta ningún selector**: con una sola cuenta no hay
nada que elegir, y un mando con una opción dentro es un mando que no hace nada.

Cinco cosas que hay que mantener:

1. **La lista solo OFRECE; la puerta es la de siempre.** La cuenta elegida pasa
   además por `assertCanAccessTargetUser`, la puerta de más de sesenta acciones
   —que desde el #898 tampoco sube—. Es a propósito: la lista se construye de
   una fuente que ya va hacia abajo, y si algún día se ensanchara sin querer, la
   puerta lo sigue negando. Y se pregunta **solo cuando la cuenta no es la
   propia**: en la propia no hay nada que preguntar y sería una consulta por
   carga para nada.
2. **Un `agente` alcanza SOLO su cuenta**, y eso es lo que hace airtight a
   `mandaEnLaCuenta`: si a otra cuenta solo se llega administrándola, tener una
   delante ya significa mandar en ella. Con el agente dentro del alcance, esa
   línea le daría mando en la cuenta que nombrara.
3. **La cuenta viaja en CADA acción y se re-resuelve.** Una acción de servidor
   ES un endpoint: las siete del tablero reciben la cuenta y la vuelven a pasar
   por `resolverLaCuentaDelTablero`. Lo que no se alcanza cae en la propia y se
   dice — lo típico no es un ataque, es un `?cuenta=` rancio de un enlace
   guardado.
4. **Las dos que van por una CONVERSACIÓN no reciben cuenta**, a propósito:
   mover una tarjeta y leer su etapa la resuelven de la propia fila
   (`quienMiraEstaConversacion`), así que no dependen de que el navegador mande
   la correcta. Eso arregla de paso un fallo que ya estaba: `laConversacion`
   exigía la cuenta propia, así que en Chats —que **ya** enseña las líneas de las
   hijas— la cabecera decía «esa conversación no es de tu cuenta» sobre una
   conversación perfectamente alcanzable.
5. **Se recuerda unos segundos** (`lib/cache-de-sesion`, 5 s), con la llave de
   los ids que deciden: la cuenta y si es superadministrador. Lo segundo entra
   porque él y el administrador de la misma cuenta no ven lo mismo — con la
   llave compartida, cinco segundos le pasarían a uno el alcance del otro. **El
   rol ya no entra**, y eso es la señal de que la cartera se fue: entraba solo
   porque decidía si se consultaba.

**Se mira, se crea y se mueve en la cuenta elegida, y se avisa**: la barra pone
el nombre en azul y encima del tablero sale «Estás viendo el tablero de X. Lo que
crees o muevas aquí es de esa cuenta». Sin decirlo se edita el embudo de un
cliente creyendo estar en el propio.

### El tablero abre donde se quedó, y la llave es (persona, cuenta propia)

Volvía siempre a la cuenta propia, así que quien trabaja a diario en el tablero
de una hija tenía que elegirla en cada visita. Se guarda en
`embudo_cuenta_recordada`, tabla de la App con `CREATE TABLE IF NOT EXISTS` y
sin clave foránea — ni una columna en `User`, que es del backend (#360).

> **La llave es la PAREJA, no la persona a secas**, y es la regla de siempre:
> *la llave son los datos que deciden la respuesta*. Qué cuentas puede abrir
> alguien depende de **desde dónde entra** —las alcanzables se resuelven contra
> su fila efectiva—, así que con la persona sola, entrar a otra cuenta con
> «Ingresar» y recargar ahí **borraría** lo que eligió en la suya: ahí no hay
> selector, pero una recarga apunta igual. Con la pareja, cada contexto recuerda
> lo suyo y ninguno pisa al otro.

Cinco cosas que hay que mantener:

1. **Manda la URL.** `?cuenta=` gana sobre lo recordado: un enlace guardado o
   compartido apunta a una cuenta concreta y tiene que llevar ahí, o deja de ser
   un enlace.
2. **Y lo recordado no abre ninguna puerta.** Vuelve a pasar por
   `laCuentaDelTablero` como cualquier otro parámetro, así que un id de una
   cuenta que se desvinculó cae en la propia. No es un error que enseñar: es un
   id que ya no existe para quien pregunta.
3. **Se apunta la cuenta ya RESUELTA, y en cada carga del tablero**, no solo al
   elegir. Así una elección que dejó de alcanzarse **se cura sola** en vez de
   arrastrar para siempre un id muerto. Y no cuesta: el `ON CONFLICT` lleva su
   `WHERE ... IS DISTINCT FROM`, así que cuando no cambia nada **Postgres no
   escribe la fila** — la misma forma que la marca de leído del chat del equipo.
4. **Lo apunta `tableroDelEmbudoAction` y nadie más.** Es la acción por la que
   pasa todo lo que cambia lo que se tiene delante, el selector incluido; las
   otras reciben la cuenta para actuar SOBRE ella, no para mirarla. Y la página
   no apunta nada: es una lectura.
   **A quien no elige no se le recuerda nada, y ni se le pregunta**: un agente
   no tiene selector, y Embudos es justamente su pantalla de trabajo — una
   consulta y una escritura por carga para devolverle siempre su propia cuenta
   es lo que se paga todo el día. La condición al leer es `canManageWorkspace`
   y al escribir `quien.manda`, que es falso exactamente para los mismos: a otra
   cuenta solo se llega administrándola.
5. **La dirección se pone al día sola** cuando se abre en otra cuenta por lo
   recordado. Sin eso la URL diría «la propia» mientras se está mirando una
   hija, y copiarla llevaría a otro sitio. Es un `replaceState`, **no un
   `router.replace`**: reescribe la dirección sin volver a pedir la pantalla más
   cara del módulo para no cambiar ni un dato.

### Y el filtro de asesor puede cambiar de embudo, y TIENE que poder

El tablero enseñaba las conversaciones de los asesores que tienen ESE embudo
asignado y no había forma de mirar a uno solo. Ahora el filtro tiene tres
estados —**todos** (el de partida), uno, o las que no tienen asesor— y con
«todos» salen juntas todas las del embudo, que en el caso normal —nadie con
embudo asignado, así que todos caen en el por defecto— son literalmente las de
todo el mundo.

> **Eligiendo a un asesor cuyo embudo es otro, el tablero se va a SU embudo.**
> Es el único donde sus tarjetas tienen posición y donde moverlas vale
> —`moverTarjetaAction` deduce el embudo de la conversación, y esa regla no se
> toca—. Sin eso, filtrar a ese asesor enseñaría sus tarjetas en columnas ajenas
> y al arrastrarlas contestaría «esta conversación cambió de embudo mientras
> tanto»: menú abierto, puerta cerrada.

Y por eso cada nombre del menú lleva al lado el embudo al que llevaría cuando no
es el abierto (`→ Soporte`): sin ese aviso, el tablero cambia de columnas y no
hay forma de entender por qué.

Tres cosas más:

1. **Un id que no es del equipo de ESA cuenta cae en «todos»**, no acota. Si
   acotara, preguntar por el id de alguien de otra cuenta diría si tiene
   conversaciones aquí.
2. **Un asesor no filtra**: ve lo suyo y en su embudo, pida lo que pida, así que
   el mando no se le pinta. Es la misma regla que ya decidía su embudo.
3. **«Todos» es la dirección limpia.** Los tres parámetros (`?cuenta=`,
   `?embudo=`, `?asesor=`) se escriben solo cuando no son el estado de siempre,
   así que la URL sin nada es la que ya funcionaba antes de que esto existiera. Y
   **cambiar de cuenta no arrastra el embudo ni el asesor de la anterior**: son
   ids de otra cuenta, y mandarlos sería pedir algo que no existe.

### El total de una etapa es un COUNT, no un `length`

El número de la cabecera de cada columna era `tarjetas.length`, y el tablero trae
como mucho `TOPE_DE_TARJETAS` (500): **en cuanto una cuenta pasa de ahí, ese
número dice «cuántas de las primeras 500 cayeron aquí»**, que no es un dato que
nadie pueda usar. Es la misma familia que *un contador es un `COUNT`, no un
`length`*.

`losConteosPorEtapa` lo cuenta de verdad —un `GROUP BY` sobre
`embudo_posiciones` unido a `Session`— y `losTotalesPorEtapa` reparte el resto.
Cuatro cosas:

1. **Lo que no tiene posición guardada, y lo que la tiene en una etapa BORRADA,
   cuenta en la PRIMERA etapa** — que es exactamente donde
   `laEtapaDeLaConversacion` lo pinta. Si no, la columna enseñaría una tarjeta
   que su cabecera no cuenta.
2. **Nunca un número negativo.** Entre el `COUNT` y el `GROUP BY` puede entrar
   una conversación, y un negativo en una cabecera no significa nada.
3. **Buscando, el badge dice `los que casan/el total`**, que es lo que hay
   delante. Con dos números distintos sin explicar, uno de los dos se lee como
   un fallo.
4. **Y es UNA consulta por carga**, en el mismo `Promise.all` que ya traía las
   tarjetas y el `COUNT`: entra por `embudo_posiciones_embudo_idx` y de ahí a
   `Session` por su clave primaria. No toca `chat_messages` ni ninguna de las
   tablas grandes.

Y la columna del SQL en crudo es **la de la BASE**: `assigned_advisor_id`, no
`assignedAdvisorId` —en crudo Prisma no traduce los `@map`—, mientras `userId` y
`remoteJid` van tal cual porque no lo llevan. Escribirlas «las tres a juego»
rompe justo las que funcionan, así que el banco las comprueba contra
`information_schema`.

### Una decisión, dos consultas: `AQuienSeMira`

A quién se le miran las conversaciones se decide **una vez** y de ahí salen las
dos consultas —el `where` de Prisma de las tarjetas y el trozo de SQL del conteo,
que va en crudo porque tiene que unir `embudo_posiciones`—. Los dos renderizados
viven uno al lado del otro en `lib/embudos-db.ts` a propósito: separados, el día
que se afine uno las cabeceras dirían un número y las columnas enseñarían otro, y
eso no se ve como un error — se ve como un número que no cuadra con lo que hay
debajo.

**Las listas vacías van con `= ANY(array)` y no con `IN (…)`.** Un `IN ()` es un
error de sintaxis, así que con cero ajenos —una cuenta donde nadie tiene embudo
asignado, que es lo normal— la consulta se caería entera. Con `ANY` de un arreglo
vacío el resultado es falso y su negación cierta, que es justo lo que hace falta:
sin ajenos, entran todos.

### El banco, y su «antes» pinchado

`scripts/banco-embudos.sh` gana dos mitades y
`scripts/banco-embudos-navegador.sh` dos pasos:

- **La decisión**, sin base: que la cuenta pedida solo vale si se alcanza, que
  devuelve una cadena y no una lista, que el filtro de un id de fuera cae en
  «todos», que filtrando a un asesor se abre SU embudo, y el reparto de totales
  con sus casos raros —etapa borrada, conteos negativos, sin etapas—.
- **Las ACCIONES contra Postgres**, con la familia real sembrada: una madre con
  dos hijas, una cuenta ajena y un reseller con su cliente. Probar
  `laCuentaDelTablero` a solas sería probar el lado que **no tiene puerta**; lo
  que hay que demostrar es que las acciones pasan por ella y que el alcance sale
  de FILAS. Incluye el caso que de verdad ejerce el `COUNT`: **520
  conversaciones**, o sea más que el tope, donde `tarjetas.length` es 500 y la
  cabecera sigue diciendo 520.
- **El ALCANCE y la memoria** (`embudos-alcance-db.test.mjs`), con una cuenta de
  la casa —rol `admin`, que es la que tenía la cartera entera dentro— y una
  cuenta cliente **sin ningún vínculo** al lado: el selector ofrece exactamente
  la propia y sus dos hijas, la suelta no se abre ni pidiéndola a mano, un
  reseller no alcanza su cartera, y sin hijas no se pinta selector. Más la
  memoria: abre donde se quedó, la pareja (persona, cuenta) no se pisa, y una
  recordada que ya no se alcanza cae en la propia **y se cura sola**.
- **Y la pantalla servida**: los tres mandos en la barra, filtrar a un asesor,
  «sin asesor», volver a «todos», elegir la cuenta hija —que la madre ve su
  estado vacío, le crea un embudo y aparecen SUS dos conversaciones y ninguna de
  la madre—, que la hija no ve a su madre por ningún lado, **qué ofrece el
  selector** y que al volver con la dirección limpia sigue en la hija, con la
  dirección puesta al día.

  Y para eso la semilla cambió a propósito: el dueño va con rol **`admin`** y hay
  una cuenta cliente suelta. Con el dueño en `user` la cartera no se consultaba
  siquiera, así que **la sonda habría pasado con el fallo puesto**.

> **Cada «antes» va PINCHADO a un commit, nunca a `origin/main`.** En
> cuanto este cambio se fusione, `origin/main` pasa a ser el «después»: el modo
> roto dejaría de reproducir nada y **se pondría verde sin ejercerlo**, que es la
> peor forma de tener un banco. Es la lección de *el «antes» de un banco CADUCA
> el día que su PR se fusiona*, que este repositorio ya pagó una vez.

Son **tres** «antes» y tres commits, porque son tres fallos distintos:
`ANTES_REF` (lo personal), `ANTES_DEL_SELECTOR` (cuando no había selector) y
`ANTES_DEL_ALCANCE` (cuando ofrecía la plataforma entera y no recordaba nada).
Cada modo roto empaqueta los ficheros de SU commit, con los `import` que se
apuntan unos a otros **aliasados** a los viejos —sin eso resolverían a los de
hoy, que ya llevan el arreglo, y el modo roto pasaría sin ejercer nada— y afirma
su fallo: pedir otra cuenta devolvía la propia, el asesor pedido se ignoraba, no
había totales por etapa, **el selector ofrecía una cuenta cliente sin vínculo**
y no se recordaba en qué cuenta se estaba mirando.

Y se comprobó lo único que de verdad dice que un banco mira: **quitándole el
arreglo al modo bueno se pone en rojo**. Con la elección de cuenta rota caen 7
casos, con el reparto de totales 7, con el filtro de asesor 3, **con la cartera
devuelta al alcance 9** y **quitando el apunte de la cuenta recordada 4**.

## Embudos: siete etapas, tres del SISTEMA, y vaciar Perdido SELLA

Una cuenta nueva abría `/embudos` y le salía la pantalla vacía —«esta cuenta no
tiene embudos»— con un botón para crear el primero y escribir sus etapas a mano.
Y las etapas eran tres (`Nuevo`, `En proceso`, `Cerrado`) con **un color de una
lista de seis nombres** (`gris`, `azul`, `verde`…), sin forma de elegir otro.

Ahora toda cuenta nace con **«Embudo de ventas»** y sus siete etapas, en este
orden: **Nuevo** (gris), Contactado (azul), Interesado (morado), Cotizado
(amarillo), Negociación (naranja), **Ganado** (verde) y **Perdido** (rojo). Las
cuatro de en medio son del cliente —se renombran, se recolorean, se mueven, se
borran y se añaden las que quiera—; las tres en negrita son **del sistema**.

### El embudo nace al PRIMER LEER, no al crear la cuenta

`asegurarElEmbudoPorDefecto` se llama desde `elTableroDelEmbudo`, o sea la
primera vez que alguien abre el tablero. Sembrarlo en el alta habría dejado
fuera a **las cuentas que ya existen**, que son todas, y habría hecho falta un
backfill sobre `User` para algo que se resuelve con una consulta al abrir.

Cuatro cosas que hay que mantener:

1. **Va dentro de un `pg_advisory_xact_lock` por cuenta.** Dos pestañas abriendo
   el tablero a la vez verían las dos que no hay embudo y sembrarían dos —cada
   uno con sus siete etapas—, y la cuenta abriría con dos tableros iguales sin
   que nadie sepa de dónde salió el segundo.
2. **Solo siembra si la cuenta no tiene NINGUNO.** Una cuenta que ya organizó
   sus embudos a mano no recibe uno nuevo por abrir la pantalla.
3. **Un embudo viejo se asciende, no se duplica**, y con **dos** condiciones:
   que sus tres etapas se llamen exactamente como las de antes **y** que no
   tenga ni una posición guardada (`embudo_posiciones`). La segunda es la que
   importa: con tarjetas dentro, reescribir las etapas movería conversaciones de
   sitio, y eso no se deshace. Con una sola tarjeta colocada el embudo se queda
   como está.
4. **Sembrar nunca tumba el tablero**, y tampoco es mudo: un fallo ahí se ve
   como una pantalla vacía —el fallo original— y hay que poder distinguirlo.

### La marca de sistema es una COLUMNA, no una posición ni un nombre

Es la decisión de la que cuelga todo lo demás, y las dos alternativas obvias
están mal:

| | por qué no |
| --- | --- |
| **por posición** (la primera y las dos últimas) | añadir una etapa al final la convertiría en «Perdido» sin que nadie lo pida, y el botón de vaciar aparecería en la columna equivocada |
| **por nombre** | **el nombre se puede editar** —es el encargo—, así que renombrar «Perdido» a «Descartado» le quitaría su protección y su botón |

Así que `embudo_etapas` recibe `sistema` (`nuevo` \| `ganado` \| `perdido` \|
`NULL`) con `ADD COLUMN IF NOT EXISTS`, y **la marca la pone quien crea la
etapa, nunca un backfill por nombre.** Un embudo nuevo —sembrado o creado a
mano— nace con sus tres marcadas; el viejo de tres etapas se asciende; y
**cualquier otro embudo que ya existiera se queda SIN etapas de sistema**, o sea
igual de editable que hasta ahora.

Es la decisión incómoda de esta vuelta y va escrita con su motivo: marcar por
nombre las etapas de los embudos que ya están —«el que se llame Perdido, marcado»—
le quitaría de golpe el borrado y el color a etapas que ese cliente organizó, y
se equivocaría con cualquiera que use esos nombres para otra cosa. Mejor un
embudo viejo sin protecciones que un embudo ajeno con protecciones que nadie
pidió.

Cinco cosas que hay que mantener:

1. **El nombre se edita; el color, la posición y el borrado, no.**
   `comoListaDeEtapas` recibe las marcas **de la base** (no del navegador),
   exige que las tres sigan estando y **fuerza su color a nulo**: el de una
   etapa de sistema se deduce de su marca (`ETAPAS_DE_SISTEMA`) y no se guarda,
   así que no hay forma de cambiarlo ni escribiendo la petición a mano.
2. **Y su posición se recoloca al guardar** (`conLasDeSistemaEnSuSitio`):
   `Nuevo` primera, `Ganado` y `Perdido` últimas en ese orden. Con la validación
   sola —rechazar el orden malo— una petición a mano dejaría el embudo con
   `Perdido` en medio; recolocando, lo que llegue mal se endereza.
3. **Las flechas de subir y bajar se QUITAN, no se pintan en gris**, y el
   candado dice por qué. Una flecha apagada invita a preguntar, y la respuesta
   —«esta etapa es del sistema»— no cabe en un botón.
4. **La fila de una etapa de sistema conserva el hueco de las flechas** (`w-4`)
   y el del botón de borrar, con un candado en su sitio. Sin él su nombre
   arrancaría en otra columna que el de las demás y la lista se leería
   descuadrada — es la regla de *un `opacity-0` no libera sitio*, al revés. Y un
   candado con su explicación encima dice por qué no se puede, que es lo que un
   hueco vacío no dice.
5. **La primera etapa del cliente no puede subir por encima de `Nuevo`.**
   `sePuedeSubirLaEtapa` mira la etapa de al lado, no el índice: con el índice,
   la de la posición 1 tendría flecha y al pulsarla no pasaría nada.

### Los colores son hex libre, y los seis rápidos son LITERALMENTE los de Etiquetas

El color era un nombre de una lista de seis y la fila del diálogo llevaba la
palabra «Color» delante, con los círculos descolgados del campo del nombre. La
de Etiquetas ya tenía la forma buena —seis círculos pegados a la izquierda y al
final el cuadrito que abre el selector del navegador, con su rueda y sus
valores—, así que la de Etapas es esa.

> **Los seis colores viven en `lib/colores-rapidos.ts` y los importan las dos
> pantallas.** «Los mismos colores» tiene que ser cierto **por construcción**:
> con la lista copiada en cada sitio, el día que se afine uno el otro se queda
> atrás, y eso no se ve como un error — se ve como dos pantallas de la misma
> plataforma que no se parecen.

Y al extraerla apareció un fallo que llevaba ahí sin reportar: la comparación
era `color === preset` y **los seis están escritos en MAYÚSCULAS mientras el
selector nativo del navegador devuelve minúsculas**. Así que elegir `#3B82F6`
con la rueda dejaba el círculo de ese mismo color **sin marcar**: el mismo color
se leía como dos. Ahora se compara con `mismoColor`, que normaliza las dos
puntas, y **la comparación está escrita una sola vez**.

Cuatro cosas más:

1. **La columna nueva es `colorHex`, no un `ALTER COLUMN ... TYPE`** sobre la
   vieja. Cambiarle el tipo a una columna con datos dentro es una migración que
   no se deshace; una columna al lado, con backfill idempotente desde la paleta
   vieja, deja los embudos que ya existen exactamente como estaban.
2. **La paleta vieja se queda de RESPALDO al leer** (`HEX_DEL_COLOR_VIEJO`), no
   se borra: una fila que el backfill no alcanzara —de un despliegue a medias—
   saldría sin color, y una columna sin color se lee como una columna rota.
3. **Lo que llega del navegador pasa por `comoColorHex`**: solo `#RRGGBB`, y se
   guarda en mayúsculas. Un valor inventado se quedaría escrito y saldría como
   un color que nadie eligió.
4. **Y los círculos arrancan en el mismo píxel que el campo del nombre**
   (`pl-[2.375rem]`, que es el hueco de la flecha más el punto de arrastre y sus
   dos huecos). El banco lo mide en las **dos** pantallas en la misma sesión:
   copiado a mano probaría que coincide con lo que alguien recuerda de Etiquetas.

#### Y con el color libre, Tailwind deja de poder ser la fuente

Una etapa se pinta en **cinco** sitios —la cabecera de su columna, el borde de su
tarjeta, el punto del selector, el icono de la cabecera del chat y la pastilla de
la fila de la bandeja— y con una paleta cerrada cada color podía traer sus clases
escritas (`bg-blue-500`, `border-blue-300 dark:bg-blue-950`…), que es lo que hacía
que los cinco dijeran lo mismo.

> **Con el color libre eso no se puede: Tailwind solo genera lo que ve literal**,
> así que no existe clase para un `#7C3AED` que alguien acaba de elegir con la
> rueda. Se pinta con `style`, y los tonos salen de **una sola función**
> (`losTonosDeLaEtapa`), que es lo que conserva la propiedad que importaba: hay un
> único sitio que decide el color de una etapa.

Dos cosas que hay que mantener:

1. **El alfa hace lo que hacían las variantes `dark:`.** El fondo de la pastilla
   es el mismo tono al 12 % y su borde al 35 %: así se lee sobre fondo claro y
   sobre fondo oscuro con el texto en el tono pleno. Un fondo **pleno** obligaría
   a elegir el color del texto según el tema, que es justo lo que las clases
   resolvían a mano y aquí no se puede.
2. **Lo que no sea un hex no puede dejar una etapa sin color.**
   `losTonosDeLaEtapa` cae en el gris de «sin elegir», nunca en vacío: una
   columna o una pastilla sin color se lee como una pantalla rota.


### Vaciar Perdido no BORRA: SELLA, y el barrido diario borra en firme

La columna de Perdido lleva su botón de vaciar, con confirmación que dice
cuántas se lleva. **No hay borrado de a una tarjeta**, a propósito: lo que se
descarta se descarta en tanda, y una papelera de a una sería un mando más en
cada tarjeta para lo que se hace una vez al mes.

> **Vaciar no borra ni una fila: escribe una marca** en `embudo_vaciadas`
> (`sessionId` como clave, con su etapa y su fecha). Las tarjetas salen del
> tablero, la papelera las enseña con **los días que les quedan**, y a los
> **30 días** el trabajo diario de facturación las borra en firme.

Cinco cosas que hay que mantener:

1. **Quién puede vaciar lo decide `sePuedeVaciarLaColumna`, y lo decide por la
   MARCA** (`sistema === "perdido"`), nunca por el nombre. Con el nombre, un
   cliente que renombre la etapa se quedaría sin su botón, que es la mitad del
   encargo.
2. **Se vacía con el MISMO filtro de asesor que el tablero.** Con el filtro
   puesto en Ana, «vaciar» se lleva lo que hay delante y no las de sus
   compañeros; `elAlcanceDeLaColumna` sale de la misma función que arma la
   consulta del tablero, así que lo que se ve y lo que se lleva no pueden
   discrepar.
3. **Restaurar devuelve la conversación a SU etapa, no a la primera.** La marca
   guarda de dónde salió; sin eso, recuperar treinta conversaciones las metería
   todas en `Nuevo` y el trabajo de colocarlas se perdería igual.
4. **Borrar el embudo olvida sus marcas** (`borrarEmbudo`). Si no, una
   conversación sellada se quedaría fuera de todos los tableros **y sin
   papelera desde la que sacarla**, condenada a que el barrido la borre sin que
   nadie pueda evitarlo.
5. **El borrado en firme desengancha antes dos tablas, y por motivos
   distintos.** `collab_notifications` **no tiene relación de Prisma a
   propósito**, así que su `sessionId` no es clave foránea y no lo pone en nulo
   nadie: sin soltarlo, la campanita se queda con una mención que apunta a una
   ficha que ya no existe. `FinanceTransaction.session` sí se desengancha solo
   —es opcional y sin `onDelete`, o sea `SetNull` por omisión— y se suelta igual,
   porque **lo que hay en producción no tiene que coincidir con el esquema**:
   esta base ya tiene columnas creadas en caliente por el backend, y una
   restricción con otra regla dejaría el barrido fallando cada noche por una
   transacción de hace un año.

**Y el barrido cuelga del cron diario que ya existe** (`/api/cron/billing`), en
su propio `try` como los cobros: un fallo suyo no puede tumbar el cobro de la
plataforma, y su cuenta sale en la respuesta para que se vea si un día deja de
borrar. Va **a trozos** (`POR_VUELTA`, 50): la primera vuelta de una cuenta con
meses de descartes no puede quedarse borrando miles de fichas mientras alguien
espera a que le abra otra cosa.

#### Lo que NO se borra, y se dice en vez de disimularlo

**El historial de WhatsApp de esa conversación se queda**, y por tanto la
conversación **sigue apareciendo en Chats durante esos 30 días** y después. Lo
que se borra en firme es la **ficha** —el lead, sus etiquetas, sus notas, sus
seguimientos—, que es lo que vive en el tablero.

Borrarlo del todo sería llamar a `hardDeleteLocalChat`, que además necesita la
línea y todas las identidades del contacto; es el camino de «Eliminar chat» de
la bandeja y **es irreversible**, así que no cabe detrás de una papelera de 30
días. Queda como frente aparte; lo que no puede pasar es que se dé por hecho
que vaciar borra el chat.

### Y el arrastre tiene que mover los CONTADORES, no solo la tarjeta

Lo cazó el banco, y es el único fallo de producción de esta vuelta: al soltar
una tarjeta en otra columna se movía la tarjeta y **los totales de las
cabeceras se quedaban como estaban**, hasta que alguien recargara. Con el
número de Perdido en 0, su botón de vaciar salía **apagado justo después de
soltarle dos tarjetas dentro** — o sea un botón que no se puede pulsar sobre una
columna que tiene cosas delante.

Los totales son un `COUNT` del servidor (no el largo de la lista cargada, que es
la regla de siempre), así que al mover en local hay que moverlos a mano: **uno
menos en la de origen y uno más en la de destino**, y al revés si el servidor
dice que no. Con `Math.max(0, …)` en la resta: un total que empieza en cero por
una vuelta a medias no puede quedarse en negativo, que en una cabecera no
significa nada.

### El banco, y su TERCER modo roto

`scripts/banco-embudos.sh` (reglas puras y acciones contra Postgres) y
`scripts/banco-embudos-navegador.sh` (la página servida), los dos con lo de
antes **pinchado a un commit** y nunca a `origin/main` — la lección de *el
«antes» de un banco CADUCA el día que su PR se fusiona*, que este repositorio ya
pagó una vez.

Y hay un tercer fichero, `embudos-sin-siete.test.mjs`, que **corre siempre** y
lleva dentro el mundo de antes: la cuenta que abre el tablero sin ningún embudo
y se queda sin ninguno, las tres etapas viejas y el color por nombre. Sin él, lo
verde del banco normal no diría si la siembra funciona o si la cuenta ya tenía
un embudo de otra prueba.

Lo que el banco de navegador mide y no se contesta leyendo: que los seis colores
son los mismos **en las dos pantallas medidas en la misma sesión**, que los
círculos y el cuadrito miden lo mismo, que la fila no lleva la palabra «Color»,
que los círculos arrancan en el píxel del campo del nombre, que una etapa de
sistema se renombra y no se borra ni se mueve ni cambia de color, que **solo una
columna** tiene el botón de vaciar y es la de Perdido, y que restaurar devuelve
cada conversación a su etapa.

Y se comprobó lo único que de verdad dice que un banco mira: **quitándole el
arreglo al modo bueno se pone en rojo** —cinco casos sin la siembra, cuatro sin
las protecciones de las etapas de sistema—.

Una del propio banco de navegador, que salió al correrlo dos veces seguidas: el
`next start` de la vuelta anterior se mataba **después** del `dropdb`, así que su
conexión dejaba el borrado sin efecto, el `createdb` decía «ya existe» y el banco
se caía **antes de ejercer un solo caso** — cero «ok» y cero «MAL», que no se lee
como un fallo: se lee como que no hay nada que probar. Se mata antes, y el
`dropdb` va con `--force`. **Un banco que no se puede volver a correr no es un
banco**, y el modo en que fallaba era el peor: en silencio y en verde.

## Embudos: una columna del tablero es una ETAPA, y nada más

Al final de las columnas había un recuadro punteado, del alto de una columna y
con «+ Nueva etapa» dentro. No era una etapa y se leía como una: con un embudo
al que le habían borrado las etapas del cliente —dos columnas, Ganado y
Perdido— la pantalla enseñaba **tres recuadros del mismo alto**, y el tercero
vacío y sin nombre. Desde fuera eso no se lee como un botón: se lee como una
etapa a medio crear que alguien dejó ahí.

> **La fila de columnas del tablero pinta una etapa por columna y NADA detrás.**
> Lo que no es una etapa no se pinta con la forma de una etapa. Vale para
> cualquier mando que se quiera añadir ahí: si crece con el embudo, va dentro
> de «Etapas del embudo»; si es una acción de la pantalla, va a la barra.

Y por eso no se pierde nada: **las etapas se crean donde se editan**. El panel
«Etapas del embudo» se abre desde el engranaje de CUALQUIER columna y desde el
«⋯» de la barra, y ahí el mismo «+ Nueva etapa» sí es lo que parece —un botón
dentro de una lista de filas—, con el orden, los colores y los candados de las
de sistema delante. Eran dos puertas a lo mismo y la del tablero era la que
mentía.

Con eso, además, el tablero acaba donde acaban sus etapas **igual que los otros
tres de la plataforma**: Proyectos, Tickets y Documentos cierran su fila con el
`map` de sus columnas y no ofrecen ninguna columna de mentira al final. Embudos
era la excepción, y nadie sabía por qué.

Tres cosas que hay que mantener:

1. **Lo que se queda muerto se va con el mando.** El recuadro era el único
   llamador de `abrirEtapasDe(id, conUnaNueva)`, así que ese parámetro —y el
   `conUnaNuevaAlFinal` que colgaba de él— no podían valer más que `false`: se
   fueron. Lo que **no** se toca es `conUnaNuevaEnLaLista`, que es quien añade
   la fila dentro del panel y sigue teniendo su botón.
2. **La fila de columnas se mide desde lo que SE VE**, subiendo desde una
   cabecera de columna hasta su padre, y no por una marca del DOM: así el banco
   mide igual en los dos modos —el «antes» no tendría ninguna marca nueva— y no
   hay forma de que esté mirando otro nodo.
3. **Quitar un mando de una pantalla no se prueba leyendo el código.** Un
   `<button>` con `rounded-xl` y `border-dashed` es indistinguible de cualquier
   otro hasta que se pinta al lado de las columnas; lo que contesta la pregunta
   es contar los hijos de la fila.

Lo prueba `scripts/banco-tablero-de-embudos.sh`, en Chromium y sobre el CSS del
build con el `EmbudosClient` de VERDAD: con **2 etapas y con 7**, a 1440, 1280,
1024 y 390, la fila tiene un hijo por etapa, ninguno punteado, y el último es
una columna con su nombre. `MODO=roto` monta el componente de un commit
**pinchado** en una carpeta hermana de `_components` —así sus `../../crm/kanban/…`
resuelven igual— y **afirma el fallo**: un hijo de más, punteado y con «Nueva
etapa» dentro.

Y se comprobó lo único que de verdad dice que un banco mira: **las afirmaciones
del modo bueno contra el componente de antes se ponen en rojo en las ocho**
—3 hijos para 2 etapas, 8 para 7—, mientras los dos casos de «esto no se puede
haber aflojado» —que un asesor sigue sin ver mandos de etapas, y que el
engranaje abre el panel y su botón añade una fila— pasan **igual en los dos
modos**. La sonda de la página servida (`scripts/probar-embudos.mjs`) lo mira
además con el dueño delante, en la App de verdad.

Una del arnés, que costó una vuelta: la tarjeta del kanban trae `next/link`, que
lee `process.env.__NEXT_*`. En la App eso lo inyecta Next; en un navegador suelto
no hay nada que lo ponga, así que el módulo **revienta al cargarse** y
`window.listo` no llega nunca — el banco se queda esperando y su error habla de
un tiempo agotado, que no se parece en nada a su causa. La página del arnés pone
un `process.env` vacío, que es lo que ve el navegador con la configuración por
defecto.

## Lo que crea un asesor es SUYO: etiquetas y respuestas rápidas

Las etiquetas (`Tag`) y las respuestas rápidas (`rr`) siguen siendo filas de la
CUENTA —así las asigna, lista y comprueba todo lo que ya existía—, y al lado
una marca dice «esta es de esta persona» (`etiquetas_personales`,
`respuestas_personales`, `lib/personales-db.ts`). Ni una columna en `Tag`.

> **Lo que crea quien NO manda (un agente) nace suyo** (`naceSuya`). Lo ven su
> dueña, el dueño y los administradores; los demás asesores no. Lo que crean
> el dueño o un administrador es de la cuenta, como siempre. No hay casilla:
> el asesor las crea en sus pantallas de siempre, Etiquetas y Respuestas
> rápidas. Lo que ya existía se queda de la cuenta — no se sabe quién lo creó.

Cuatro cosas que hay que mantener:

1. **Reemplazar las etiquetas de una conversación CONSERVA las que no se ven.**
   `replaceSessionTagsAction` recibe la lista que quien guarda VE; sin esto, un
   asesor guardando se llevaría por delante la etiqueta personal de su
   compañero sin saber que existía. El banco lo prueba quitando esa línea: se
   pone en rojo.
2. **El slug de una personal lleva a su persona** (`slugPersonal`): `Tag` es
   única por `(cuenta, slug)`, y sin eso dos asesores no podrían tener cada uno
   su «Llamar tarde».
3. **Se filtra en todos los sitios que enseñan etiquetas a un asesor**: las dos
   listas, las de una conversación, la bandeja de Chats
   (`getSesionesDeLaCuenta`) y el Kanban de `/tags`. Quien manda no paga la
   consulta extra.
4. **El grupo lo dice el servidor** (`grupo`: «Mis etiquetas», «De los
   asesores», «De la cuenta») y Chats solo agrupa (`enGrupos`). Sin nada
   personal sale un solo grupo sin título: donde nadie tiene nada propio, la
   lista se ve como antes.

Lo prueban `scripts/banco-embudos.sh` —reglas puras y acciones contra
Postgres; `MODO=roto` corre las acciones de etiquetas y respuestas de
`ANTES_REF` y afirma que el compañero veía, pisaba y borraba lo del otro— y
`scripts/banco-embudos-navegador.sh`, sobre la página servida: el dueño crea y
asigna por la pantalla, la administradora tiene sus mismos mandos, un agente ve
solo su embudo y arrastra, y otro sin embudo ve la pantalla que lo dice.

## Agenda: «Reagendar» mueve la MISMA cita y rehace sus recordatorios

Faltaba cómo mover una cita a otra fecha y hora. Lo único parecido era el lápiz
de la ficha del CRM, que cambiaba la hora **y dejaba vivos los recordatorios de
la hora vieja**: al cliente le llegaba «en 3 horas es tu cita» a la hora que ya
no era.

> **Reagendar es una ACCIÓN, no un estado.** Los estados son un enum de
> `Appointment`, que es del backend (#360), y reagendar no es «en qué punto
> está» sino moverla. Sale al lado de los estados en los **cuatro** sitios donde
> se cambian —el calendario de Agenda y la cabecera del chat (una opción más del
> desplegable, `OPCION_REAGENDAR`), la tarjeta del tablero y la ficha del CRM—,
> y los cuatro abren el MISMO `DialogoDeReagendar`, con el MISMO
> `SelectorDeFechaYHora` que agendar (se sacó de `ChatCreateAppointmentSheet`).

Lo decide `lib/reagendar-cita.ts` (puro); guarda `reagendarCitaAction`; los
recordatorios los rehace `reprogramarLosRecordatoriosDeLaCita`
(`lib/reagendar-cita.server.ts`). Seis cosas que hay que mantener:

1. **La misma fila**: se escriben `startTime`/`endTime` en la cita que existe,
   con su auditoría (`rescheduled`, antes y después). Nada de cancelar y crear
   otra: se perderían su historial y su evento de Calendar.
2. **Conserva la duración**, y los huecos son los de la **cuenta dueña** de la
   cita (`datosParaReagendarAction`), no los de quien mira.
3. **La misma comprobación de solape que al agendar**, con su candado, **sin
   contarse a sí misma**: correrla media hora no choca con su propio hueco.
4. **Pendiente y Confirmada se quedan; cualquier otro estado vuelve a
   Pendiente** (`elEstadoAlReagendar`): reagendar una cancelada o una no
   asistida es volver a ponerla en marcha.
5. **Los recordatorios se borran y se crean en UNA transacción**, y solo los de
   CITA —`appt-reminder-*`, los de `idNodo` vacío de la página pública y los
   antiguos `reminder-*` de agenda—: un flujo o la confirmación no se tocan. El
   número se busca en todas sus formas (la ruta del agente lo guarda en
   dígitos). Salen las plantillas de Agenda › Recordatorios de la cuenta
   (`isSchedule`, sin campañas, con `isCampaign` nulo incluido), **solo las que
   todavía no han pasado**, con el `idNodo` `appt-reminder-{plantilla}`.
6. **Editar la hora por el lápiz del CRM rehace los recordatorios igual**
   (`updateAppointmentDetails` llama a la misma función): dos caminos que mueven
   una cita, una sola reprogramación.

Lo prueba `scripts/banco-reagendar-cita.sh`: la regla y un barrido de los
cuatro sitios, y las acciones contra Postgres. `MODO=roto` lee y corre
`ANTES_REF` y afirma que no había reagendar y que mover la hora dejaba los
recordatorios viejos.

### Y Multiagenda reagenda, avisa y dispara IGUAL que Agenda

Multiagenda (`booking_appointments`) no tenía reagendar, y cambiar el estado de
una reserva no avisaba al cliente ni disparaba las automatizaciones —aunque el
engranaje de cada columna ya dejaba configurarlas—. Ahora es simétrico con
Agenda, **con las mismas piezas, no copias**:

| | Agenda | Multiagenda |
| --- | --- | --- |
| reagendar | `DialogoDeReagendar` | el MISMO, con `de="reserva"` |
| huecos | agenda de la cuenta | los del especialista de la reserva (`pedirHuecos` del mismo selector), sin contar la propia reserva |
| aviso al cliente | `sendAppointmentStatusNotification` | `sendBookingStatusNotification`, mismo mensaje (`buildStatusOwnerMessage`) y misma elección de línea |
| automatizaciones | `dispararLasAutomatizacionesDeCita` | la MISMA (`lib/automatizaciones-de-cita.server.ts`) |
| cancelar | quita recordatorios, con confirmación | igual |

Cinco cosas que hay que mantener:

1. **Una reserva no guarda su conversación**: se busca por el teléfono del
   cliente en la cuenta dueña del equipo, por TODAS sus formas
   (`laConversacionDeLaReserva`, `lib/reagendar-reserva.server.ts`). Sin
   conversación no hay automatizaciones, pero el aviso sí sale.
2. **Los recordatorios de una reserva los decide `losRecordatoriosDeLaReserva`**
   (`lib/recordatorios-de-la-reserva.ts`, pura): los del servicio si tiene, y si
   no las plantillas de agenda. La usan crear (la ruta del agente) y reagendar.
3. **Reagendar y cancelar pasan por `reprogramarLosRecordatoriosDeLaReserva`**:
   borra los `booking-reminder-*`/`booking-svc-reminder-*` de ese número en las
   líneas de la cuenta y, si sigue viva, los rehace desde la hora actual por la
   misma línea y la misma forma del número con que se crearon.
4. **Reagendar sigue la regla de Agenda** (`lib/reagendar-cita.ts`): franja
   futura y distinta, la duración se conserva, Pendiente/Confirmada se quedan y
   lo demás vuelve a Pendiente; el candado y el solape son los del especialista.
5. **La página pública no cambia**: `getAvailableBookingSlots` sigue contando
   todas las reservas; solo el diálogo excluye la propia.

Lo prueba `scripts/banco-reagendar-reserva.sh`: la regla y un barrido, y las
acciones contra Postgres. `MODO=roto` corre las acciones de `ANTES_REF` y afirma
que no había reagendar, ni aviso, ni automatizaciones, y que cancelar dejaba los
recordatorios.

### Dos PR verdes por separado pueden tumbar el despliegue juntos

#998 (Reagendar) y #999 (recordatorios a su hora) se fusionaron con minutos de
diferencia, cada uno con su banco en verde. Juntos, `next build` no compilaba:
Reagendar importaba `losRecordatoriosDeLaCita` de `lib/cita-publica`, y #999 la
había movido a `lib/recordatorios-de-la-cita`. El despliegue de #999 **y el de
#1000 detrás** fallaron, así que producción se quedó en #998 sin que nada lo
dijera fuera de la pestaña Actions.

Y debajo del error de compilación había dos más, del mismo choque: al editar la
hora de una cita corrían **dos** reprogramaciones (la de Reagendar, sin llave, y
la de #999, con llave), así que al cliente le llegaba cada recordatorio dos
veces; y agendar dejaba fuera las plantillas viejas con `isCampaign` nulo, que
Reagendar sí contaba.

Tres cosas que hay que mantener:

1. **Reagendar calcula con `losRecordatoriosDeLaCita` de
   `lib/recordatorios-de-la-cita.ts`** —la zona de la cuenta y la hora
   estricta— y escribe **con la misma llave** (`appt-reminder:<cita>:<plantilla>`).
   Es la única reprogramación: editar la hora ya no lleva una segunda.
2. **Las plantillas de agenda se leen con `isCampaign` falso O nulo**, en los
   dos sitios.
3. **Después de fusionar, se mira que el despliegue salió.** Un banco que
   empaqueta con esbuild no comprueba tipos: `scripts/comprobar-tipos-de-reagendar.sh`
   pasa `tsc` por esos ficheros, y su `MODO=roto` (contra `0583de4`) afirma el
   error exacto que tumbó el build. Lo corre `banco-reagendar-cita.sh`.

## La encuesta de satisfacción (NPS): se cuelga de RESOLVER, y la respuesta se va a BUSCAR

Al resolver una conversación —si la cuenta la tiene encendida en Perfil ›
Comportamiento › **Encuesta de satisfacción**, apagada por defecto— el cliente
recibe UNA pregunta: del 1 al 10, qué tan probable es que recomiende el
negocio. Lo que conteste queda en su ficha de contacto y en Analíticas del CRM
como NPS (promotores 9-10, pasivos 7-8, detractores 1-6), total y por asesor.

Cinco cosas que hay que mantener:

1. **Se engancha en `resolveSession` y en ningún otro sitio.** Es la única
   puerta de «resolver» —botón, fila, lote y macro `RESOLVE` pasan por ella—.
   Va en una **cola del proceso** (`encolarLaEncuestaDeSatisfaccion`): no hace
   esperar a quien resuelve y un lote de cuarenta no manda cuarenta a la vez
   por la misma línea. El asesor que cuenta es el que tenía la conversación AL
   resolverla (`assignedAdvisorId`); sin asesor es «Sin asesor (IA)», que es
   una fila más y no se esconde.
2. **El interruptor es de la cuenta DUEÑA de la conversación**, no de quien
   resuelve, y sale por la línea de la conversación (su fila de `Instancias`,
   con la clave del servidor de su dueña). Solo WhatsApp (QR o Meta); nunca a
   un grupo ni a una difusión. Una conversación no recibe otra en
   `DIAS_ENTRE_ENCUESTAS` (candado por conversación en una transacción); una
   `fallida` no cuenta y deja su motivo.
3. **La App no recibe los webhooks**, así que la respuesta no llega: se va a
   buscar en `chat_messages` (`recogerLasRespuestas`), por las TRES identidades
   en tres ramas con `UNION ALL`. Se recoge al leer —el NPS del CRM y la
   ficha— y en el barrido diario de `/api/cron/billing`, que cierra como
   `sin_respuesta` lo que pasó de `DIAS_PARA_RESPONDER` o de los
   `MENSAJES_QUE_SE_MIRAN` primeros mensajes sin una puntuación.
4. **Qué es una puntuación lo decide `laPuntuacionDelTexto`, y es estricta**:
   un solo número del 1 al 10 en un mensaje corto («8», «le doy un 9»,
   «10/10»); en letra solo si es lo único que dice. Equivocarse hacia «no es»
   cuesta una respuesta; hacia el otro lado mete un número falso en el NPS de
   un asesor. Sin respuestas el NPS es `null`, nunca 0.
5. **Dos tablas de la App** (`encuesta_satisfaccion_ajustes`,
   `encuestas_satisfaccion`), sin clave foránea y ni una columna en `User` ni
   en `Session` (#360). Las reglas viven en `lib/encuesta-de-satisfaccion.ts`
   (pura) y las usan el envío, la ficha y el CRM: el color y la categoría son
   los mismos en los dos sitios porque salen de ahí.

Lo que se sabe y no se toca desde aquí: el «8» del cliente es un mensaje
entrante como cualquier otro, así que reabre la conversación como cualquier
mensaje en vivo, y si la IA está encendida puede contestarle (tiene la pregunta
en su historial). Evitarlo es del backend.

Lo prueba `scripts/banco-encuesta-de-satisfaccion.sh`: las reglas y un barrido,
y las acciones de verdad contra Postgres con la red a Evolution fingida.
`MODO=roto` corre el `resolveSession` de `ANTES_REF` con la encuesta encendida y
afirma que resolver no preguntaba nada.

## Notas internas: una hija puede mencionar a los administradores de su MADRE, solo para avisar

En la nota interna de una conversación, la `@` de una cuenta HIJA ofrece,
detrás de la gente de su propia cuenta, a los **administradores de su cuenta
madre** —el dueño de la madre y quien tiene papel de `administrador` en ella—
por su **nombre real**. Mencionar a uno le saca **la misma ventana que
interrumpe** de una mención del chat de equipo (`task_alerts`, tipo `mencion`)
con **la nota entera** dentro (en esa ventana una mención ya no se recorta a
tres líneas).

> **Solo avisa.** No hay acceso por mención, ni campanita de colaboración, ni
> participante, ni ningún alcance nuevo: los vínculos siguen yendo solo de
> madre a hija. Por eso van en una lista APARTE de `elEquipoDeLaCuenta` —ahí
> serían asignables y participantes—.

Cuatro cosas que hay que mantener:

1. **Quién es la madre lo decide `lasMadresDe`** (`lib/menciones-de-la-madre.ts`,
   pura): la que vinculó a la hija (`de → a`); la raíz de la familia no tiene
   madre, y una pareja recíproca entre hermanas no es madre e hija (salvo que
   una sea la raíz: la malla de producción tiene enlaces de vuelta hacia la
   madre). Solo la madre DIRECTA.
2. **La lista la lee `losAdministradoresDeLaMadre`** (`.server.ts`) y se pide al
   ABRIR el selector (`mencionablesDeLaMadreAction`), no al cargar Chats. Un
   `agente` de la madre no entra.
3. **El servidor re-resuelve la lista**: `separarLasMenciones` reparte lo que
   llega en equipo (camino de siempre), madre (solo el aviso) y descartados.
   El navegador no decide a quién se avisa.
4. **La pantalla usa la MISMA fila y el MISMO filtro** para los dos
   (`losMencionables`).

Lo prueba `scripts/banco-mencion-a-la-madre.sh`: la regla, un barrido y las
acciones contra Postgres con la malla real (madre, dos hijas, enlace de vuelta).
`MODO=roto` corre `createInternalNoteAction` de `f3f296c` y afirma que la
mención a la madre se descartaba y no saltaba nada.

## Equipo: la auto-asignación tiene TRES modos, y «Por porcentaje» es un contador continuo

En la barra de Auto-asignación la cuenta elige UNO de tres modos, excluyentes:
**Máx. chats** (tope por asesor), **Ilimitado** y **Por porcentaje**. Los dos
primeros son los de siempre y no cambian: salen de `auto_assign_max_chats`
(0 = ilimitado) y reparten 1-1-1. El tercero pone un campo de porcentaje junto a
cada asesor de la tabla, y los **disponibles** tienen que sumar 100.

> **Cada chat nuevo va al asesor que esté más lejos de su proporción ideal
> ACUMULADA desde que se activó el modo** (`elegirPorPorcentaje`,
> `lib/reparto-por-porcentaje.ts`). Ni lotería ni bloques de 10 o 100: un
> contador por asesor que no se reinicia mientras el modo siga activo. La
> desviación de cada asesor nunca pasa de un chat, y a la larga el reparto es
> exactamente el configurado.

Seis cosas que hay que mantener:

1. **La regla está copiada byte a byte en el backend**
   (`src/modules/webhook/services/auto-assign/reparto-por-porcentaje.ts`), que
   es quien reparte los chats que ENTRAN (`tryAssign`); la App la usa al guardar
   y en «Asignar sin atender». Los dos bancos comparan los ficheros.
2. **El modo vive en tablas de la App** (`reparto_porcentaje`,
   `reparto_porcentaje_asesor`, `lib/reparto-por-porcentaje-db.ts`), sin clave
   foránea y ni una columna en `User` (#360). Sin fila —o sin tabla, 42P01— es
   lo de siempre. Activarlo NO toca `auto_assign_max_chats`: es el tope que
   vuelve al cambiar de modo.
3. **Activar el modo pone los contadores a cero** («desde que se activó»);
   cambiar un porcentaje con el modo activo NO. Apagarlo conserva los
   porcentajes para la próxima vez.
4. **Un asesor NO disponible se salta y conserva su contador**: los disponibles
   se reparten entre ellos en su proporción, y al volver se pone al día.
5. **Elegir, asignar y sumar el contador van en UNA transacción con
   `pg_advisory_xact_lock('reparto-porcentaje:<cuenta>')`**, el mismo texto en
   los dos repositorios: sin él, dos chats a la vez caen en el mismo asesor.
6. **La gente del reparto es la del backend**: el equipo con papel y las
   vinculadas marcadas `agente` (`entraEnElReparto` en `getTeamAdvisors`). Una
   vinculada administradora no recibe porcentaje, y «Asignar sin atender» de la
   App dejó de repartirle chats (el backend ya no lo hacía).

Lo prueban `scripts/banco-reparto-por-porcentaje.sh` aquí (regla, barrido y las
acciones contra Postgres) y el del mismo nombre en `api-webhook` (el servicio
contra Postgres: 50/30/20 exacto, 40 chats a la vez, asesor desactivado, y
Máx. chats e Ilimitado iguales). Los dos con `MODO=roto` contra un commit
pinchado, que afirma que no había tercer modo.

## Equipo: los interruptores «Sesión» y «Agente» de cada asesor

En `/equipo` cada asesor tiene dos interruptores, encendidos por defecto. «Sesión»
apagado pausa (`Session.status = false`) las conversaciones que tiene asignadas, y
un mensaje entrante no las reabre; «Agente» apagado pone `agentDisabled = true,
aiOptIn = false`. Lo que se le asigna mientras está apagado entra apagado.

> **Al encender se devuelve SOLO lo que apagó el interruptor.** Cada conversación
> tocada lleva su marca (`asesor_ia_marcas`: `apagoSesion`, `apagoAgente`,
> `aiOptInAntes`); lo pausado a mano no la tiene y no se toca. Pausar o apagar la
> IA a mano (`updateSessionStatus`, `toggleAgentDisabled`) olvida la marca.

La regla es pura (`lib/ia-del-asesor.ts`) y está **copiada byte a byte** en
`api-webhook` (`auto-assign/ia-del-asesor.ts`), que es quien asigna los chats que
entran. Los ajustes viven en `asesor_ia_ajustes` (tabla de la App, sin columna en
`User`). Mueve los interruptores quien configura la cuenta (`laCuentaQueConfigura`);
un agente no. Lo prueba `scripts/banco-ia-del-asesor.sh` (aquí, contra Postgres con
las acciones de verdad) y el del mismo nombre en `api-webhook`; `MODO=roto` contra
`7d3709d` afirma que no existían.

## Equipo: los interruptores NUNCA le quitan los chats al asesor

Carlos lo vio así: apagar «Sesión» o «Agente» de un asesor y que sus chats
parezcan sin asignar. El diagnóstico (cinco traspasos, #1201-#1206, unificados en
uno) dio dos causas, y ninguna es que el interruptor toque `assigned_advisor_id`
—el banco lo comprueba apagando y encendiendo las dos partes—:

1. **Pantalla (App).** «Sesión» apagado pone `status = false`, que también
   significa «cerrada». La tabla y las métricas de Equipo contaban activas con
   `status = true`, así que el asesor caía a 0 activas al apagarlo. Ahora
   `lasPausadasPorElInterruptor` suma las que pausó el interruptor (marca
   `apagoSesion`) a sus activas, y las resta de cerradas.
2. **Pérdida real (backend, `releaseStaleEscalations`).** Es lo ÚNICO automático
   que pone `assigned_advisor_id = NULL` (con `auto_released` en
   `AssignmentLog`). Con «Sesión» apagado el barrido no mira la conversación, pero
   el reloj del escalado sigue: al encender, todas las escaladas viejas salían
   vencidas a la vez y se le quitaban. Ahora (a) las que tienen marca de un
   interruptor no se sueltan (api-webhook#204) y (b) el plazo cuenta desde la
   última vez que el asesor tocó sus interruptores (`asesor_ia_ajustes.actualizadoEn`).

> **Apagar la IA es una decisión de atención, no un abandono.** Nada que lea
> `status = false` puede tomarlo por «sin dueño» ni por «cerrada» sin mirar antes
> `asesor_ia_marcas`.

Lo prueban `scripts/banco-chats-del-asesor.sh` (aquí; `MODO=roto` contra
`121a813` afirma la caída a 0) y `scripts/banco-ia-del-asesor.sh` de
`api-webhook` (`MODO=roto` afirma la liberación de golpe). Las que el barrido ya
soltó dejaron `auto_released` en `AssignmentLog` y se pueden revisar ahí; no se
devolvieron solas porque el barrido también suelta, con razón, lo que nadie
atendió.

## Equipo: el interruptor «Ver número» deja a UN agente ver el número completo

Un `agente` ve los números de los clientes con los cuatro últimos dígitos
tapados (`lib/telefono-visible.ts`). En `/equipo` cada agente tiene un
interruptor «Ver número», **apagado por defecto**: encendido, ESE agente ve el
número completo en Chats (lista, conversación y «Nueva conversación»). Los
administradores y el dueño lo ven siempre, y su interruptor sale encendido y
fijo.

1. **Es un permiso aparte, no un rol**: `asesor_ver_numero` (tabla de la App,
   `lib/ver-numero-completo-db.ts`, una fila por cuenta y asesor, sin columna
   en `User`). Sin fila = tapado.
2. **Lo mueve quien configura la cuenta** (`toggleAdvisorVerNumero`, por
   `requireOwner`); un agente no se lo da a sí mismo, y solo a asesores de esa
   cuenta.
3. **Leerlo nunca lanza**: si falla, el número va tapado (el lado seguro) y se
   dice en la consola.

Lo prueba `scripts/banco-ver-numero-completo.sh` (la regla, un barrido y las
acciones contra Postgres); `MODO=roto` contra `4c84c02` afirma que no existía.

## Agenda: el ciclo automático de la cita pone SOLO los estados objetivos

Agenda › Ajustes › **Flujo automático de la cita** (un interruptor por
cuenta, `cita_ciclo_ajustes`; sin fila = apagado y todo como antes). Las
reglas son puras en `lib/ciclo-de-la-cita.ts`; lo que lee la base y manda, en
`lib/ciclo-de-la-cita.server.ts`; la historia de cada cita, en `cita_ciclo`
(`lib/ciclo-de-la-cita-db.ts`). En el backend, `src/modules/ciclo-de-la-cita/`.

**Quién pone cada estado (no se toca la definición):**

| estado | quién |
| --- | --- |
| Pendiente | al agendar |
| Confirmada | una PERSONA (candidato calificado). El «Sí» del recordatorio NO lo es |
| Atendida | el sistema, cuando el PROSPECTO entra a la videollamada |
| No asistida | el sistema, al agotarse la espera (minuto 10 o su prórroga), o si en la llamada dice que no puede, aunque diga «cancelar» |
| Cancelada | una PERSONA. Nunca por lo que diga el chat |
| Finalizado | una PERSONA (el pago se valida en otra cuenta) |
| Descartado | el sistema, solo con un rechazo LITERAL («no me interesa», «no es lo que buscaba»), sin preguntas ni negaciones |

Lo que hay que mantener:

1. **Los cuatro recordatorios sustituyen a las plantillas** (3 h, 1 h con
   «Sí»/«No», 30 min, y el enlace a la hora). Llevan la llave
   `appt-reminder:<cita>:ciclo-<clave>` y el `idNodo` `appt-reminder-ciclo-*`:
   así reagendar y cancelar los borran con lo de siempre, y el motor los manda a
   su hora. El de 1 h va con `tipo: 'botones'`: el backend pinta botones en
   WAHA (o lista) y en Meta, y texto en Evolution; el texto ya pide «Sí» o «No».
2. **La espera solo corre en modo «Videollamada con IA»**: es el único en el
   que se SABE si entró. La entrada la apunta la sala al unirse
   (`cita_ciclo.clienteEntroEn`, `PUT /api/videollamada/sala`); un asesor que
   entra lleva `quien=asesor` y NO cuenta. Con un enlace fijo solo hay
   recordatorios: un «No asistida» a ciegas sería inventarse un dato.
3. **Un automático nunca pisa a una persona**: el cambio va con `desde`
   (`updateMany` sobre Pendiente/Confirmada) en `cambiarElEstadoDeLaCita`
   (`lib/estado-de-la-cita.server.ts`), que es la MISMA función que usa la
   acción del tablero. Lo hecho por el sistema queda en `audit_logs` con
   `actor_id` nulo.
4. **El reloj lo da el backend cada minuto** (`CicloDeLaCitaSchedulerService`
   → `POST /api/ciclo-de-citas/tic`, clave interna; se apaga con
   `CICLO_DE_CITAS_ENABLED=false`). Minuto 5 sin entrar → la App pide la
   llamada (`POST <backend>/citas/llamada-de-espera`); el backend apunta el
   teléfono y `/voicebot/resolve` de ESA llamada lleva el encargo y la
   herramienta `responder_espera_de_cita`, cuya respuesta va a
   `/api/ciclo-de-citas/llamada`. «Más tiempo» extiende la espera (tope 30 min).
   Una llamada que no sale se apunta en `llamadaResultado` y la espera sigue.
   El reloj no toca citas de hace más de 2 h (un reloj parado no marca las de
   ayer al volver).
5. **Lo que escribe un contacto con cita** va a `/api/ciclo-de-citas/mensaje`
   ANTES de los cortes de la IA. `{manejado:true}` (era el «Sí»/«No» del
   recordatorio, ya contestado) corta el turno; el rechazo literal descarta y
   deja contestar al agente. Un «No» quita los avisos de 30 min y del enlace,
   ofrece reagendar, avisa a la cuenta y NO cancela.
6. **Avisos**: No asistida → el mensaje de siempre al cliente (con el enlace
   para reagendar) y uno a la cuenta (`notificationNumber` y contactos de
   notificación) con el motivo. Atendida no avisa al cliente: está dentro de
   la reunión. Todos disparan las automatizaciones del estado (mueven la tarjeta).

Esto deja sin efecto el punto 3 de «Agenda: la videollamada con IA (Tavus)»
(`videollamadas-y-reuniones.md`): aquel reloj de ausencia del backend nunca
existió en `api-webhook`; este es el que hay.

Lo prueban `scripts/banco-ciclo-de-la-cita.sh` aquí (las reglas y, contra
Postgres, recordatorios, reloj, entrada, «Sí»/«No», Descartado y las rutas) y
`scripts/banco-ciclo-de-la-cita.sh` en `api-webhook` (botones, la llamada de
espera de punta a punta en `resolve` y la herramienta). Es una función nueva:
no hay `MODO=roto` que afirmar.
