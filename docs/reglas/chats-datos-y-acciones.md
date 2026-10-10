# Chats: fichas, marcas, borrado, etiquetas y acciones

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Chats: la ficha de contacto se LEE y se GUARDA por la misma puerta

«Configurar campos de la ficha» contestaba «No autorizado» —y a veces «No se
pudo guardar»— a administradores de la cuenta principal. `getContactFieldsConfig`
y todas las acciones de la ficha (Sheets, datos externos) pasan por
`laCuentaDeLaAccion`; `saveContactFieldsConfig` llevaba su propia comprobación
(mismo id, el rol de la PERSONA, y `linked_accounts` mirado hacia ARRIBA). Así
el administrador del equipo —rol `user` en su fila— veía la ficha de una
conversación de una cuenta hija y no podía guardarla, y una hija guardaba la de
su madre, que ni podía leer.

> **Guardar va por `laCuentaDeLaAccion`, igual que leer.** Quien lee una ficha
> la guarda, y quien no la lee no la guarda. Una cuenta que no existe se dice
> (`updateMany` + `count`), y el `catch` escribe el error con su código: antes
> era mudo y el «No se pudo guardar» no dejaba rastro.

Lo prueba `scripts/banco-campos-de-la-ficha.sh`, contra Postgres con la familia
de producción; `MODO=roto` empaqueta la acción de `8e41502` y afirma los dos
fallos.

### Y solo Nombre y Teléfono son fijos; el resto es de la cuenta

Arriba del diálogo van **Nombre y Teléfono, fijos** (`CAMPOS_FIJOS`,
`lib/contact-fields.ts`): no se ocultan, no se renombran, no se mueven ni se
borran, porque son el nombre y el número del contacto en toda la plataforma y
se editan donde aparezcan. **Todo lo demás es editable y borrable** igual que un
campo propio, y una cuenta que nunca tocó la ficha arranca **sin campos**
(`DEFAULT_CONTACT_FIELDS` es `[]`): debajo de los dos fijos, solo «Agregar campo».

1. **Se guarda como `{ version: 2, campos }`** (`comoSeGuardaLaFicha`), y la
   versión es lo que separa «ocultado a propósito» de «lista de antes». Una
   lista vacía se guarda vacía; antes se convertía en los 14 de fábrica.
2. **Una lista de antes (un arreglo) se migra al leerla**
   (`migrarLaListaDeAntes`): fuera los de fábrica apagados y el Teléfono de
   fábrica; se quedan los encendidos y todos los creados por la cuenta. La
   acción la deja escrita en v2, condicionada a que siga siendo un arreglo.
3. **Las claves fijas nunca entran en la lista**, se manden como se manden. Los
   datos que hubiera en `ExternalClientData` bajo una clave quitada no se borran.

Lo prueba `scripts/banco-campos-de-la-ficha.sh`: la regla, la migración contra
Postgres y el diálogo real en Chromium (filas fijas alineadas con las demás);
su «antes» es `ANTES_FICHA_REF` y afirma los 14 de fábrica sin papelera.

### Y la anatomía es UNA: los bloqueados se ven igual que los demás

Nombre y Teléfono habían quedado como filas peladas —sin asa, sin
interruptor y con «Fijo» donde va la sección—, y al lado de los demás campos
no se leían como la misma lista. Ahora **toda fila del diálogo tiene la misma
anatomía y las mismas columnas**: asa, interruptor, ícono, etiqueta y su
sección REAL (las clases se escriben una vez: `FILA`, `ASA`, `ICONO`,
`SECCION`, `MANDO_FINAL`). Las bloqueadas llevan el asa y el interruptor
**encendido pero apagados como mando**, y un candado donde va la papelera.

Y la ficha tiene un tercer bloqueado, **Notas** (`CAMPO_NOTAS`): texto libre
en TODA ficha y **siempre el último**, por eso va FUERA de la lista que se
arrastra —dentro, arrastrar otro campo debajo lo desplazaría—. Cuatro cosas:

1. **Nombre y Teléfono van en «Contacto» y Notas en «Libre»**
   (`SECCION_DE_LOS_FIJOS`, `SECCION_DE_LAS_NOTAS`), secciones de verdad.
2. **La ficha abierta sigue el orden del diálogo** (`lasSeccionesDeLaFicha`,
   pura): «Contacto» la primera con Nombre y Teléfono delante, los campos de la
   cuenta, y «Libre» la última con Notas cerrándola. Un campo de la cuenta en
   una de esas dos secciones cae en la misma, nunca en una repetida.
3. **En la ficha, Nombre y Teléfono son el nombre y el número REALES**: Nombre
   se guarda por el mismo camino que el lápiz de la cabecera
   (`updateLeadPushNameAction`) y Teléfono es de solo lectura. Notas abre con
   3 líneas (`LINEAS_DE_LAS_NOTAS`, sin `min-h`: pisaría a `rows`), se desplaza
   por dentro si el texto es más largo, y lleva la manija de la esquina
   (`resize-y`); los demás campos no se estiran.
4. **Su dato sigue en `ExternalClientData.data.notas`**, la clave del Notas de
   fábrica de antes: lo escrito no se pierde, y una lista vieja con esa clave la
   suelta al leerse. Google Sheets la exporta la última
   (`losCamposQueSeExportan`), aunque ya no viva en la lista.

Lo prueba `scripts/banco-ficha-simetrica.sh`: la regla, y el diálogo y la ficha
REALES en Chromium a 1440/1024/390 (mismas columnas y altos en todas las filas,
Notas la última al agregar campos, Notas con 3 líneas y estirable arrastrando la
esquina). `MODO=roto` monta los de `4834a9e` y afirma «Fijo», las filas sin asa
ni interruptor y la ficha sin Nombre, Teléfono ni Notas.

## Chats: la nota interna es la vista previa si es LO ÚLTIMO

Un asesor escribía una nota interna, era lo último que pasaba en la
conversación, y la fila de la lista enseñaba el candado y nada más: la vista
previa seguía diciendo el mensaje de antes. Con una imagen, una nota de voz o
una llamada sí se veía qué era. La causa: las notas viven en `internal_notes`,
la vista previa salía solo de `chat.lastMessage`, y a la lista solo le llegaba
QUÉ conversaciones tenían notas (un conjunto de ids), nunca qué decían.

> **La lista recibe la ÚLTIMA nota de cada conversación —texto y hora—, y
> `laVistaPreviaDeLaFila` (`lib/nota-en-la-vista-previa.ts`, pura) decide: la
> nota manda solo si es ESTRICTAMENTE posterior al último mensaje, y entonces
> la vista previa es «🔒 su texto».** En cuanto llega o sale un mensaje, ese
> mensaje es más reciente y vuelve a ser la vista previa sin que nadie toque
> nada; la nota se queda solo en el candado de la fila de iconitos.

Cinco cosas que hay que mantener:

1. **Las dos horas se comparan en MILISEGUNDOS** (`epochToMs`): el mensaje
   llega en segundos o en milisegundos, la nota es un `Date`. **A igualdad,
   manda el mensaje**: es lo que el cliente ve.
2. **Lo que NO cambia**: el orden de la lista y la hora de la fila siguen
   siendo los del último mensaje (escribir una nota no sube la conversación),
   no cuenta como sin leer, y el candado lo sigue decidiendo `hasNotes`. Con la
   nota en la vista previa se esconden el icono de tipo y la palomita del
   mensaje de debajo, que ya no es el que se lee.
3. **Dos caminos traen la nota, y dicen lo mismo.** Al cargar la bandeja (y a lo
   sumo cada 60 s, `INTERVALO_DE_LAS_NOTAS_MS`), `lasNotasDeLaBandejaAction`
   trae una nota por conversación (`DISTINCT ON`, acotada por
   `lasCuentasQueVeLaBandeja`); al escribir o borrar una nota desde la
   conversación abierta, `laFilaDeLaSesionAction` trae `ultimaNota` y
   `avisarDeLasNotasDeLaFila(sessionId, ultimaNota)` la pinta al momento
   (`conLaUltimaNota`). Borrar la última nota vuelve a la anterior, o al mensaje.
4. **La nota se busca por el `id` de la ficha de la fila**
   (`notasDeLasFilas.get(chatSession.id)`), la misma con la que el candado decide.
5. **Fuera de esto**: la nota de escalado que escribe la IA vive en
   `chat_messages` (`raw.notaInterna`) y ya es un mensaje; no pasa por aquí.

Lo prueba `scripts/banco-nota-en-la-vista-previa.sh`: la regla y un barrido,
las acciones contra Postgres (la madre ve las notas de su hija y no al revés),
y la bandeja SERVIDA en Chromium: al entrar, al escribir una nota, al recargar
y al llegar un mensaje. `MODO=roto` necesita `BUILD_ANTES` (un `.next` de
`2fda6a3`) y afirma el candado sin texto; la vuelta al mensaje pasa en los dos.
Ojo con su semilla: la ficha se empareja con la fila por la llave de SU línea
(`instanceId === instanceName`), así que la nota se cuelga de esa ficha.

## Chats: la ficha de la conversación abierta es la de SU LÍNEA

El mismo contacto escribe a Ventas y a Atención y tiene una ficha en cada
línea. Una nota interna escrita en la conversación de Atención **salía también
en la de Ventas y en la vista previa de su fila**. No se replicaba: se guardaba
en la ficha equivocada.

La fila de la lista ya se quedaba con la ficha de su línea (`linea::numero`),
pero la conversación abierta pedía la suya **solo por el número**
(`getSessionByRemoteJid` sin `instanceId`), y el servidor devolvía la tocada
la última entre TODAS las líneas. La nota, el estado, las etiquetas y el asesor
de la cabecera iban a esa ficha.

> **La conversación abierta pide su ficha con su línea**
> (`laBusquedaDeLaSesionAbierta`, `lib/sesion-de-la-conversacion-abierta.ts`,
> pura). Una línea sin ficha de ese contacto **no hereda la de otra**. Sin
> línea conocida, como siempre. El servidor no cambió.

Cinco cosas que hay que mantener:

1. **Cambiar a la otra línea del mismo número vuelve a pedir**: la línea entra
   en las dependencias del hook y en la llave de la semilla
   (`laLlaveDeLaConversacionAbierta`). `ChatMain` no se remonta entre líneas
   del mismo número.
2. **Una respuesta que llega tarde de la conversación anterior se tira**
   (`llaveActualRef`), también si falla: si no, pinta su ficha encima.
3. **Al cambiar de ficha se sueltan las notas de la anterior** (`setNotes([])`
   antes de la guarda): una conversación sin ficha no enseña las de otra.
4. **Una nota sin ficha en esta línea se DICE**, no se pierde en silencio.
5. **La memoria de la bandeja**: la ficha de esta línea solo entra en la llave
   global si está vacía o ya es esa (`seEscribeEnLaGlobal`), y «no hay ficha en
   esta línea» no borra la del contacto en otra (`sinFichaEnLaLinea`). La fila
   se pone al día por id (`conLaSesionAlDia`).

Lo prueba `scripts/banco-nota-por-linea.sh`: la regla y un barrido, el hook
real montado con `react-test-renderer` (pide su línea, vuelve a pedir al
cambiar, tira la respuesta tardía) y las acciones contra Postgres (la nota se
queda en su conversación, su fila y la bandeja). `MODO=roto` contra `97b6d07`
afirma que desde Atención se resolvía la ficha de Ventas y la nota caía allí.

## Chats: la marca de borrado va bajo TODAS las identidades

Un chat borrado —de uno en uno o en selección múltiple— desaparecía y al rato
**volvía a aparecer**. La marca estaba guardada, se veía en la base; lo que
fallaba es que la pantalla no la encontraba.

`hardDeleteLocalChat` hacía dos cosas seguidas que se contradecían: **borraba**
las marcas de las demás identidades del contacto y luego escribía la nueva bajo
**una sola**. Y la lista trae al contacto por la identidad que Evolution devuelva
esa vuelta, que no tiene por qué ser la misma con la que se borró: uno abierto
por su `@lid` y devuelto después por su número se saltaba la marca entera.

Es la misma regla que ya rige en el resto de Chats —buscar la fila, pedir los
mensajes, pausar la IA—, aplicada también al **escribir**: la marca se pone bajo
`remoteJid`, `remoteJidAlt`, `senderPn` y el `@lid`, todas. La que se pidió va
primero, porque es la que se le devuelve a la pantalla.

Y el borrado múltiple salía **sin `instanceName`**: solo agrupaba por cuenta. Con
la línea vacía no acota a ninguna —no borra sesiones ni mensajes de ninguna— y la
marca queda como "de todas". El de uno en uno ya pasaba su línea desde la fila
(#486); a este se le había pasado. Ahora agrupa por **cuenta y línea**.

Y aun con eso volvía, por dos cosas más que costaron otra vuelta:

- **`buildWhatsAppJidCandidates` no cruza el puente `@lid` ↔ número** —a
  propósito, ver la regla de la pausa—. Borrar por el `@lid` dejaba la marca sin
  el número, y al revés. Ahora, **antes de la transacción que borra los
  mensajes**, las identidades se completan con lo que guarda `chat_messages`,
  igual que hace `pausarIaPorIntervencionHumana`. La consola lo dice:
  `completadasDesdeLaBase` en `[chats] marca de borrado guardada`.
- **Un mensaje saliente lo resucitaba.** `isChatDeletedByPreference` miraba la
  marca del último mensaje sin mirar de quién era: un seguimiento automático, la
  IA contestando o una campaña, posteriores al borrado, lo traían de vuelta sin
  que el contacto hubiera dicho nada. La regla escrita siempre fue «vuelve si el
  cliente escribe»; ahora el código la cumple: **solo un mensaje del contacto
  (`fromMe === false`) posterior a la marca lo revive**.

Y una tercera vuelta, que costó otra tarde: **con la IA activa, esa regla se
rompía sola.** El navegador decidía con el ÚLTIMO mensaje de la fila. El
mensaje del contacto la hacía visible... y la respuesta de la IA, unos segundos
después, la volvía a esconder, porque el último ya no era del contacto. Desde
fuera: "la conversación entra y a los segundos ya no se muestra". Se vio con la
primera línea Waha (2026-09-06), pero le pasa a cualquier línea con IA.

La marca ya no se evalúa: **se levanta**. En cuanto hay un mensaje del contacto
posterior a la marca, la marca sobra y se quita, en dos sitios:

- En el servidor, al cargar las preferencias (`levantarMarcasSiElContactoEscribio`),
  mirando `chat_messages`, que guarda cada mensaje con `fromMe` y con todas sus
  identidades. Tres `EXISTS` separados, uno por columna, para que cada uno use
  su índice: un `OR` sobre las tres columnas en un solo `JOIN` recorría la
  tabla entera.
- En el navegador, en memoria, en cuanto una fila con marca trae un mensaje del
  contacto posterior a ella: se quita de TODAS sus llaves antes de que llegue
  la respuesta de la IA. Sale `[chats] marca de borrado levantada`.

`isChatDeletedByPreference` se queda como red de seguridad, pero **la regla
viva es levantar la marca, no evaluarla en cada pintado**.

### Y leerla también: gana la de SU línea, no la primera que aparezca

Marcar bajo todas las identidades no bastó. El chat volvía **diez veces
seguidas**, anclado, después de eliminarlo.

Leer la marca era un `.find(Boolean)` sobre la lista de llaves: **ganaba la
primera que apareciera**, y ese orden lo pone la identidad, no la fecha. Un
contacto tiene hasta dos filas por cada una de sus cuatro identidades —la de su
línea y la **antigua**, sin línea, de cuando la tabla no guardaba la columna—.
Así que:

- Quedaba una fila antigua con `pinnedAt` puesto, de cuando anclar no mandaba la
  línea.
- Se eliminaba el chat: eso escribe filas nuevas, **de su línea**, con
  `deletedAt`.
- La lista lo devolvía por otra identidad, y por esa la primera fila que aparecía
  era la antigua: la que dice «anclado» y **no** dice «borrado». La marca nueva
  no se llegaba a mirar.

Se elige con `elegirPreferenciaDelChat` (`lib/chat-preference-key.ts`), y son
tres reglas:

1. **Si hay alguna fila de SU línea, mandan esas**, aunque exista una antigua.
2. **Entre varias, la que se tocó la última.** Nunca se mezclan campos de dos
   filas: se elige una entera, o el chat sale anclado por una y borrado por otra.
3. La antigua sigue valiendo **cuando en esta línea no hay ninguna**, para no
   resucitar lo que alguien borró antes de que existiera la columna.

Y del lado de escribir faltaba una pieza: **quien sabe cruzar un `@lid` con su
número es `chat_messages`… que el propio borrado deja vacío**. Del segundo
borrado en adelante el servidor solo conocía la forma con la que se le pidió. La
pantalla sí las tiene todas —vienen dentro del chat—, así que ahora las manda
(`identidades` en las tres acciones). **Solo se usan para marcar**: los `DELETE`
siguen yendo con las que resuelve el servidor, porque una lista que llega de
fuera no puede decidir qué historial se borra.

Archivar seguía escribiendo bajo una sola identidad; va por el mismo camino que
anclar y borrar.

### Y la CUENTA también sale de la línea de la fila

Con lo anterior puesto, el chat seguía volviendo. Faltaba la otra mitad de la
llave: la marca se guarda bajo `cuenta::línea::número`, y la **cuenta** se
sacaba buscando el número en la lista (`ownerForJid`).

El mismo contacto tiene conversación en dos líneas —le escribe a Ventas y a
Atención, es lo normal—, así que esa búsqueda devolvía **la primera fila que
apareciera**, no la que se pulsó. Si esas dos líneas son de cuentas distintas,
la marca se guardaba **bajo la otra cuenta**; la pantalla la busca bajo la dueña
de SU línea y no la encontraba nunca.

**Si se sabe de qué línea es la fila, de ahí sale todo**: la línea y la cuenta
(`cuentaDeLaLinea`). Y la línea la manda **la fila**, no una búsqueda por
número: `lineaDelJid` se rinde a propósito cuando hay dos, así que anclar y
archivar —que no la pasaban— caían en la llave global y no se notaban. Borrar ya
la pasaba desde #486; a los otros dos se les había pasado.

### Borrar pide lo mismo que anclar, y una cosa más

`assertCanDeleteChats` llevaba su propia lista de casos y no coincidía con la de
`assertAuthorized`, que es la que usan anclar y archivar. El mismo chat se podía
anclar y no se podía borrar: salía **«Solo el dueño o un administrador puede
eliminar chats»** en una cuenta donde se trabajaba todo el día.

Dos casos se caían: el **administrador de una cuenta** sobre una línea de otra
cuenta asociada —la bandeja las enseña juntas, pero la condición pedía que fuera
de SU cuenta exactamente—, y el **dueño cuya fila trae `ownerId` puesto**, que
es lo que pasa al entrar por una cuenta vinculada.

La puerta es **la misma** —las cuentas asociadas, calculadas en el servidor— y
encima una condición propia, porque borrar no es anclar: **un `agente` no
borra**. Si se añade otra acción destructiva en Chats, va igual: la misma puerta
que las demás, más lo suyo.

## Chats: archivada y resuelta vuelven solo cuando escribe el CONTACTO

Dos fallos que eran el mismo al revés: una conversación **resuelta se reabría
sola** a los tres o cuatro días —la regla la devolvía con cualquier mensaje
posterior a `resolved_at`, también un SALIENTE: un seguimiento, un
recordatorio, la IA—, y una **archivada no salía nunca** aunque el cliente
escribiera —nada quitaba `archivedAt` salvo el botón—.

> **Solo un mensaje DEL CONTACTO (`fromMe === false`) posterior a la marca la
> levanta**, y se LEVANTA (se borra la marca), no se evalúa al pintar: si no,
> la respuesta de la IA segundos después la volvería a esconder. Es la regla de
> la marca de borrado. La decide `laMarcaSeLevanta`
> (`lib/reapertura-por-el-contacto.ts`, pura).

Cuatro cosas que hay que mantener:

1. **`estaResuelta` recibe de quién es el último mensaje**: uno propio deja la
   conversación resuelta; si no se sabe, cuenta como del contacto (enseñar de
   más es el lado seguro al pintar).
2. **El servidor barre** al cargar las preferencias
   (`levantarArchivosYResueltas`, `lib/reapertura-por-el-contacto.server.ts`,
   cada 5 min por juego de cuentas): quita `archivedAt` (su línea o la marca
   antigua `''`) y `resolved_at`, con tres `EXISTS`, uno por identidad.
3. **La pantalla levanta en memoria al momento** y avisa una vez por llave
   (`reabrirPorElContactoAction`), que vuelve a comprobar en la base que hay un
   mensaje del contacto posterior.
4. **Para LEVANTAR hace falta la prueba**: `fromMe` desconocido no levanta.

Lo prueba `scripts/banco-reapertura.sh`, contra Postgres con el barrido de
producción; `MODO=roto` lleva la regla de `9c0e76d` y afirma los dos fallos.

## Chats: «Bloqueados» y «Silenciados» son marcas del CONTACTO, y bloquear no se levanta solo

En el menú de la flecha de las pastillas, entre «Resueltos» y «Eliminar por
fecha…» (que sigue siendo la última), va un grupo propio separado por rayas:
**Bloqueados** y **Silenciados**. Se ponen y se quitan desde el «⋯» de la fila.

| | bloqueada | silenciada |
| --- | --- | --- |
| en «Todos», sus contadores y «Sin leer» | **no sale**, aunque escriba el cliente | sale como siempre |
| avisos (sonido, sistema, pestaña) | — | **ninguno** (`callado` en `useAdvisorNotifications`) |
| se ve en | solo «Bloqueados» | también «Silenciados» |
| vuelve | **solo si alguien la desbloquea** | al quitarle el silencio |

> **Un mensaje del cliente NO levanta el bloqueo**, al revés que la marca de
> borrado. Nada fuera de `setChatBlockedAction` escribe `bloqueadoEn = NULL`.

Cinco cosas que hay que mantener:

1. **La marca vive en `chat_bloqueo_silencio`, tabla de la App**
   (`lib/bloqueo-y-silencio-db.ts`, `ddl()`, sin clave foránea), una fila por
   cuenta, línea e identidad. Ni una columna en `chat_conversation_preferences`
   ni en `Session`.
2. **Se escribe bajo TODAS las identidades** del contacto, y se lee con
   `elEstadoDelChat` (`lib/bloqueo-y-silencio.ts`, pura) por la misma regla que
   la marca de borrado (`elegirPreferenciaDelChat`: manda la de SU línea).
3. **Bloquear y silenciar son dos columnas y no se pisan**: `escribirLaMarca`
   toca solo la que se le nombra (`elCambio`).
4. **El número de «Todos» también la descuenta**: `lasFilasDeLaLista` recibe
   `bloqueada`, en el navegador y en `lib/conteo-de-todos.server.ts`.
5. **Se pinta al momento** y vuelve tal cual si el servidor dice que no; la
   puerta es `assertAuthorized` (hacia abajo, nunca hacia arriba).

Lo prueba `scripts/banco-bloqueo-y-silencio.sh`: las reglas, un barrido (orden
y grupos del menú, Todos, avisos) y la tabla contra Postgres. `MODO=roto` lee
`9c0e76d` y afirma que no existía nada de esto.

## Chats: borrar en bloque es MARCAR ya y purgar de fondo

«Al intentar eliminar en bloque sale un error de API, y además hay un tope que no
deja borrar más allá de cierta cantidad de conversaciones.» Son dos cosas, y
**ninguna de las dos era un número escrito en el código**.

### El error de API tiene nombre, y es el de Prisma

`bulkDeleteChatsAction` hacía `Promise.all` sobre `hardDeleteLocalChat`, y cada
uno de esos es **una transacción interactiva**: tres consultas de identidades,
una del tipo de línea, una decena de sentencias dentro de la transacción y hasta
ocho upserts. El pool es de **diez conexiones por proceso** y el `maxWait` de una
transacción de Prisma son **dos segundos**: pasado ese plazo sin conseguir
conexión, se rinde con

```
Transaction API error: Unable to start a transaction in the given time.
```

que es, literalmente, el «error de API» de la pantalla. Reproducido en el banco
contra Postgres: con mil conversaciones la acción devuelve ese mensaje.

**Y lo peor no es el error.** `Promise.all` se rinde con el PRIMER rechazo, así
que la pantalla recibía «no se pudieron eliminar» y **no quitaba ni una fila**…
habiendo borrado de verdad varios cientos. Medido: de mil, se borraron 398 y la
lista siguió enseñándolas todas.

De ahí sale también la sensación de tope: el umbral es **cuántas transacciones
caben a la vez**, así que baja con lo cargada que esté la base. En el banco, con
Postgres local, hacen falta unas mil; en producción, con la base compartida y
`chat_messages` de millones de filas, son unas pocas decenas. Buscar el número en
el código es perder la tarde: no hay ninguno.

### El otro tope: el diálogo contaba lo CARGADO

«Eliminar por fecha» y «seleccionar todas» trabajaban sobre `contacts`, o sea
sobre las filas que el navegador tenía cargadas, y la bandeja carga acotada
(`TOPE_DE_LA_BANDEJA`, 300; las siguientes páginas llegan al bajar). Lo que no se
había cargado **no existía para el diálogo**, así que no había forma de pedir
«bórralas todas».

> **El universo del borrado sale del SERVIDOR, de `leerLaBandejaEntera` —la MISMA
> consulta que la lista, sin la ventana ni el tope de la página—**, se deduplica
> con `dedupeAndSortChats` igual que la lista y se filtra con `entraEnElBorrado`,
> que son las tres condiciones que el diálogo aplicaba a mano (ni anclada, ni ya
> borrada, y dentro del rango si hay rango). De ahí sale gratis lo que importa:
> **el número que el diálogo promete es el que la lista enseñaría bajando hasta el
> final**, ni uno más. Es la regla de siempre —un filtro que vive un paso después
> del servidor no es un filtro— y la misma fuente que ya alimenta el contador de
> «Todos».

Y **las dos fechas vacías significan TODAS**. Eso es lo que hacía falta para poder
limpiar la base entera.

### Las dos fases, que son las del borrado de una cuenta de cliente

Es el patrón que ya funciona en esta casa (`deleteUser` → `purgarCuentaEliminada`):

1. **Fase 1, aquí y ahora: la marca.** Es lo que saca la conversación de la
   bandeja y lo único que la pantalla necesita para contestar. Es barata: un
   `INSERT … ON CONFLICT` con `unnest` por cada `MARCAS_POR_SENTENCIA` (500)
   filas —cuatro parámetros pase lo que pase, y Postgres topa en 65.535 por
   sentencia— sin ninguna transacción interactiva.
2. **Fase 2, de fondo: el historial.** Sesiones, conversaciones, mensajes y el
   rastro del contacto, **de a uno y en serie**, por `hardDeleteLocalChat` —la
   MISMA función de siempre, sin una segunda copia—. Nadie la espera.
3. **Y un barrido diario** que retoma lo que un despliegue se lleve a medias.

**La cola de la fase 2 no es una tabla nueva: es la propia marca.** La columna
`purgedAt` ya significa «no queda rastro que borrar» —lo dice el esquema— así que
`deletedAt` puesto y `purgedAt` en nulo **ES** la conversación eliminada cuyo
historial sigue ahí, y su índice `(userId, purgedAt)` ya existe. Una tabla aparte
sería un segundo sitio donde apuntar lo mismo, y el día que uno de los dos se
olvide, la cola miente.

Y de ahí sale que esto sea **reanudable**, que es de lo que vive: esta App se
despliega decenas de veces al día y corre con dos réplicas, así que una promesa de
fondo se pierde a mitad sin dejar rastro. La marca no: se queda escrita.

Ocho cosas que hay que mantener:

1. **En serie, nunca en paralelo.** El pool son diez conexiones y son las mismas
   que atienden la bandeja y el chat abierto, que es lo que la gente está mirando.
   Nadie espera esta purga, así que no hay prisa que justifique robarle turnos a
   los mensajes. Es la misma razón por la que `borrarUnaAUna` va en serie.
2. **Un solo obrero por proceso.** Sin el candado, cinco pulsaciones seguidas
   arrancan cinco recorridos a la vez —o sea cinco transacciones simultáneas—, que
   es el fallo del que venimos por la puerta de al lado. El que ya corre recoge lo
   que llegue después, porque la cola se relee en cada vuelta.
3. **La cola se lee lo MÁS RECIENTE primero.** Al revés, la cabeza serían las
   marcas de antes de que existiera `purgedAt`: filas cuyo historial ya se borró
   en su día, así que purgarlas no hace nada, y a cincuenta por vuelta tardarían
   años en drenar mientras lo que alguien acaba de borrar espera detrás.
4. **La marca ANTIGUA sin línea no entra en la cola.** `hardDeleteLocalChat` se
   niega a borrar sin saber de qué línea es —y hace bien: sin línea el `DELETE` se
   llevaría el historial del contacto en TODAS—, así que meterla sería un fallo
   garantizado en cada vuelta.
5. **Antes de purgar se comprueba que la fila siga pendiente.** Una conversación
   deja varias marcas —una por identidad— así que la cola trae varias filas del
   MISMO chat y purgar una cubre a sus hermanas. Preguntarlo cuesta una consulta
   por el índice único y ahorra repetir la transacción cuatro veces.
6. **El `revalidatePath("/chats")` salió de `hardDeleteLocalChat` y lo hace la
   acción.** No es estilo: el obrero de fondo y el barrido corren **fuera de una
   petición de Next**, y ahí `revalidatePath` revienta. Y llamarlo una vez por
   chat era N veces lo mismo.
7. **Va a trozos y DICE cuántas quedan** (`TOPE_POR_VUELTA`). Marcar es barato
   pero no infinito: una cuenta de decenas de miles tardaría minutos en una sola
   petición y volvería el corte del proxy, que es el fallo del que venimos. El
   diálogo repite mientras queden, con el contador a la vista, y cada vuelta es
   una petición corta.
8. **Su número ES la alarma.** El barrido devuelve `pendientes`; muy por encima de
   lo que se acaba de borrar significa que la purga de fondo no está llegando. Es
   la misma idea que «una línea muerta no tiene filas»: el cero es el dato.

### Y `hardDeleteLocalChat` se mudó a `lib/*.server.ts`

Era una función privada de un fichero `'use server'`, y eso la dejaba fuera del
alcance de cualquier cron: ahí **todo lo exportado es un POST** al que se llega
desde el navegador con los parámetros que uno quiera, y esto borra historial de
clientes sin preguntarle a nadie quién llama —porque quien la llama es un barrido,
donde no hay sesión que preguntar—. `server-only` conserva lo único que
`'use server'` aportaba de verdad —que no se empaquete hacia el navegador, y que
el build se caiga en el sitio si alguien lo importa desde un componente de
cliente— y quita el endpoint.

**El código se movió tal cual.** Lo prueba el banco que ya existía
(`scripts/banco-borrado-chats.sh`, sus tres casos en verde): era el frente que
`lib/papelera-de-embudos-runner.server.ts` dejó escrito como «cirugía en el camino
de borrado de la pantalla más delicada del repositorio», y lo que lo hace seguro
es que su banco estaba puesto antes de tocarlo.

### Archivar y anclar en lote tenían el MISMO defecto, y uno más

`bulkArchiveChatsAction` y `bulkPinChatsAction` hacían `Promise.all` de un upsert
por chat —y el de anclar, de `upsertPreferenceEnTodasLasIdentidades`, que son tres
consultas y N upserts **cada uno**, más un `revalidatePath` por chat—. Con una
selección de verdad eso son miles de idas y vueltas para escribir una columna.

Y archivar tenía además el fallo de siempre en esta familia: **escribía bajo UNA
sola identidad** (`upsertPreference`). Es justo lo que la regla de «la marca va
bajo TODAS las identidades» arregló para el archivado de uno en uno, y a esta
hermana se le había pasado, así que un chat archivado en lote volvía por su otra
identidad.

Los tres van ya por `marcarEnBloque`, que **solo toca las columnas que se le
nombran**: anclar no puede llevarse por delante el archivado ni el borrado.

### Llevarse la base ENTERA se teclea

Con un rango de fechas no se pide nada: escribir las dos fechas ya es el gesto
deliberado. **Sin ninguna fecha —o sea, todas— hay que teclear `LIMPIAR`**, que es
la palabra que esta plataforma ya usa para un borrado masivo en el chat de equipo,
que a su vez sigue el «VACIAR» de Finanzas. Una tercera palabra sería una que el
día que se afine una de las otras dos se queda atrás, así que se importa
`confirmaLaLimpieza` y no se copia.

Y el botón **no cierra el diálogo**: el borrado va por tandas y el contador tiene
que poder verse. Lo impide un `preventDefault` en su `onSelect`; sin eso, el
diálogo se va con la primera tanda y las demás corren sin que nadie las vea.

### Lo que NO cambia, y conviene saberlo

- **La selección múltiple sigue marcando lo que se VE.** Esa regla no se toca —que
  marcar «todos» con un filtro puesto se lleve lo escondido es la peor sorpresa
  posible— y ahora tiene al lado un camino para «todas» que sí resuelve el
  servidor.
- **`hardDeleteLocalChat` no cambió una línea** salvo el `revalidatePath` que se
  fue a la acción. La fase 2 llama a la función de siempre.
- **El historial de WhatsApp sigue siendo lo que se borra**; lo que se reparte en
  dos fases es CUÁNDO.

Lo prueba `scripts/banco-borrado-masivo.sh`, contra Postgres y con las acciones de
verdad: mil conversaciones en bloque, la fase 1 que marca y no purga, la cola que
sale de la propia marca, el barrido que retoma, el universo más allá de una página
de bandeja, «toda la base» a trozos con su contador, y archivar y anclar bajo
todas las identidades. `MODO=roto` apunta el borrado a un commit **pinchado** —no a
`origin/main`, que deja de servir en cuanto esto se fusione— y **afirma el fallo**:
el «Transaction API error» y la pantalla mintiendo con varios cientos ya borrados.

## Chats: eliminar deja una LÁPIDA, y nada reescribe lo eliminado

Se eliminaba un chat o un lead y al rato volvía a salir, sin que nadie lo
tocara. No era el borrado: el borrado quitaba las filas bien. Era que **varios
sitios las volvían a escribir solos**, y ninguno preguntaba si ese contacto se
había eliminado:

| quién lo reescribía | qué volvía |
| --- | --- |
| `crearFichasQueFaltan`, cada 5 min al abrir la bandeja | el **lead**: veía «una conversación sin ficha» y la creaba |
| el sondeo del chat abierto, la precarga y el refresco | la conversación entera, con los mensajes que Evolution sigue teniendo |
| el relleno de historial de Waha | la línea vacía parecía «recién escaneada» y se rellenaba |
| el eco de un seguimiento, la IA o una campaña que salió después | la conversación, por un mensaje que nadie escribió |
| el motor (`persistMessage`, `registerSession`) | lo mismo, por un eco o un reintento del proveedor que llega tarde |
| `hardDeleteLocalChat` | borraba solo bajo una cuenta; la copia de la conversación guardada bajo la cuenta de quien miraba sobrevivía |

> **Eliminar deja una lápida** (`chats_eliminados`, tabla de la App, una fila
> por línea e identidad del contacto, todas con el mismo `grupo`), y **todo lo
> que escribe un mensaje, una conversación o una ficha la mira antes**. Lo
> decide `queHacerConElMensaje` (`lib/chats-eliminados.ts`, pura), **copiada
> byte a byte en el motor** (`api-webhook/src/modules/webhook/utils/chats-eliminados.ts`):
> los dos escriben las mismas tablas y tienen que decidir lo mismo. Si se toca
> una, se copia a la otra; los dos bancos las comparan.

La regla, con las dos clases de lápida:

| llega… | chat eliminado (`alcance: chat`) | solo el lead (`alcance: ficha`) |
| --- | --- | --- |
| algo de ANTES de eliminar (eco, reintento, historial) | no se escribe nada | el mensaje sí; la ficha no se crea |
| un envío automático después (IA, seguimiento) | el mensaje se guarda; ni conversación ni ficha | se guarda; la ficha no |
| una persona escribe desde el panel o el teléfono | vuelve la **conversación**, el lead no | igual |
| **el contacto escribe después** | **revive**: vuelve todo | revive |

Siete cosas que hay que mantener:

1. **Solo el CONTACTO devuelve lo eliminado.** Es la regla que ya tenía la
   marca de borrado de la bandeja (*solo un mensaje del contacto posterior a la
   marca lo revive*), ahora en todo lo que escribe.
2. **El historial que se borró con el chat no vuelve nunca** (`historialHasta`),
   ni después de revivir. Y un mensaje de historial sin hora se trata como
   viejo: es el lado seguro.
3. **Una fila por cada identidad** (`remoteJid`, `remoteJidAlt`, `senderPn`,
   el `@lid` y las de la pantalla): el proveedor devuelve al contacto por la
   que quiera. Se pregunta por todas, y revivir levanta el grupo entero —y las
   marcas de borrado de la bandeja—.
4. **Si la lápida no se puede leer, se guarda como siempre**, y se dice.
   Perder un mensaje de verdad es peor que dejar pasar uno de más. Sin la
   tabla (nadie eliminó nunca nada) no es un error.
5. **Lo que ya estaba en camino se barre**: una vuelta del sondeo que leyó la
   lápida un instante antes del borrado escribe igual. Cinco segundos después
   (`ESPERA_DEL_BARRIDO_MS`) `barrerLoQueSeColo` lo quita, mirando la lápida
   otra vez: si el contacto escribió mientras tanto, no toca nada.
6. **El borrado se ensancha a las copias de otra cuenta solo si la línea es de
   esa cuenta y de nadie más** (`laLineaEsSoloDe`): un mismo nombre de línea
   en dos cuentas no puede dejar que una borre el historial de la otra.
7. **Todos los caminos que eliminan dejan su lápida con LA hora de la
   eliminación**: uno a uno, en bloque (la fase 1 la pone y la purga de fondo
   la repite con la hora de la marca), eliminar un lead (`deleteSession`,
   «eliminar todos») y la papelera de Embudos. Y se llevan los recordatorios
   pendientes de ese contacto en esa línea: uno que sale después escribe a
   alguien que ya no está.

**Si se añade otro sitio que escriba mensajes, conversaciones o fichas, va por
la lápida.** Uno que no pregunte es por donde el chat vuelve, y desde fuera eso
no se parece a un fallo: se parece a que eliminar no funciona.

Lo prueban `scripts/banco-chats-eliminados.sh` aquí —eliminar uno a uno, en
bloque y un lead contra Postgres, con el sondeo, el historial, los envíos
automáticos y la reposición de fichas reescribiendo después— y el del mismo
nombre en `api-webhook` —`persistMessage`, `registerSession` y la orquestación
de verdad—. Los dos con `MODO=roto` pinchado a un commit (`4af691d` aquí,
`4358bfa` allí) que AFIRMA que el chat y el lead volvían.

## Chats: las etiquetas de una conversación son las de SU línea

Una etiqueta (`Tag`) cuelga de una **cuenta**, y cada línea es de una cuenta:
Atención y Ventas son cuentas distintas de la familia. La conversación guarda la
cuenta de su línea en `Session.userId`, y el servidor exige que coincidan
(`assignTagToSessionAction`: `tag.userId === session.userId`).

Chats pedía las etiquetas de la cuenta de **quien mira** (`listTagsAction` con
`effectiveOwnerId`) y se las ofrecía a cualquier conversación. Desde la madre,
una conversación de Atención enseñaba las etiquetas de la madre, y al pulsar una
el servidor contestaba «Tag no encontrado o no pertenece a este usuario»:
menú abierto, puerta cerrada.

> **A cada conversación se le ofrecen las etiquetas de la cuenta de su línea, y
> ninguna más** (`lib/etiquetas-de-la-linea.ts`, puro). Si esa línea no tiene
> etiquetas, el selector sale **vacío** y lo dice —nunca cae a las de otra—.

Cuatro cosas que hay que mantener:

1. **La bandeja trae las etiquetas de TODAS sus cuentas, cada una con su dueña**
   (`listTagsDeLasCuentasAction`, una consulta). Cada cuenta pasa por
   `laCuentaDeLaAccion`, la misma puerta con la que después se asigna: un
   asesor solo alcanza las de su cuenta y una ajena no se cuela.
2. **Los tres sitios que etiquetan filtran igual**: la cabecera, el menú de la
   fila y el lote. El menú de la fila buscaba la sesión por la llave GLOBAL, así
   que con el mismo cliente en dos líneas etiquetaba la conversación de la otra;
   ahora va con `linea::numero`.
3. **El lote solo ofrece etiquetas si todo lo marcado es de la misma cuenta**, y
   asigna con la cuenta de cada conversación. Mezclando líneas no hay ninguna
   etiqueta que valga para todas.
4. **El filtro de la lista**, con una línea elegida en Canales, ofrece las de su
   cuenta; sin línea y con varias cuentas, primero se elige la cuenta (ver *el
   panel de filtros ofrece etiquetas y embudos de UNA cuenta*). Nunca todas.

Dos líneas de la **misma** cuenta comparten etiquetas: `Tag` no tiene columna de
línea, y añadírsela es otro frente (la tabla la toca el backend, ver el #360).

Lo prueba `scripts/banco-etiquetas-de-la-linea.sh`, contra Postgres y con las
acciones de verdad, en dos modos: el roto corre el camino viejo y afirma que la
conversación de Atención ofrecía las de la madre y el servidor las rechazaba.

## Chats: el panel de filtros ofrece etiquetas y embudos de UNA cuenta

El embudo del panel de la columna tenía rango de fechas y etiquetas, y sin una
línea elegida en «Canales» las etiquetas salían de TODAS las cuentas de la
bandeja mezcladas —dos «Interesado», de Ventas y de Atención, sin forma de
saber cuál era cuál—. Y no había filtro de embudos.

> **Etiquetas y Embudos son dos secciones del mismo panel y leen la MISMA
> cuenta** (`laCuentaDelFiltro`, `lib/filtro-de-chats-por-cuenta.ts`, puro): la
> de la línea elegida en «Canales»; si no, con una sola cuenta en la bandeja,
> esa; y con varias, **se elige primero la cuenta** y solo entonces salen sus
> etiquetas y sus embudos. Nunca mezcladas.

Cinco cosas que hay que mantener:

1. **Las cuentas salen de las líneas de la bandeja** (`lasCuentasDeLasLineas`,
   la propia delante), no de una consulta: una cuenta sin líneas no tiene
   chats que filtrar.
2. **Con varios embudos se elige el embudo y luego la etapa**; con uno, sus
   etapas directas. La etapa se elige **igual que una etiqueta**
   (`alternarUnaSola`: pulsar deja solo esa, pulsar otra vez la quita) y filtra
   EXACTA por `chatSession.etapa.id`, que es la que ya pinta la pastilla de la
   fila. Etiqueta y etapa a la vez se suman (las dos tienen que cumplirse).
3. **Cambiar de cuenta suelta lo elegido de la otra**: una etiqueta o una etapa
   de Ventas dejaría la lista de Atención vacía.
4. **Los embudos se piden al ABRIR el panel** (`embudosDelFiltroDeChatsAction`,
   `actions/filtro-de-chats-actions.ts`), no en cada carga de Chats, y cada
   cuenta pasa por `laCuentaDeLaAccion`: hacia abajo, nunca la madre desde una
   hija ni una ajena. Solo lee: no siembra embudos. El color de cada etapa sale
   de `elColorDeLaEtapa`, la misma función que la fila.
5. **Las filas de etiqueta y de etapa son la MISMA** (`OpcionDelPanel`), y los
   rótulos de las tres secciones también (`SeccionDelPanel`).

Lo prueba `scripts/banco-filtro-de-chats.sh`: la regla, la acción contra
Postgres (la etapa del panel es la misma que la fila pinta, y filtra exacto) y
la página servida con una madre y dos hijas (`probar-filtro-de-chats.mjs`).
`MODO=roto` afirma que antes las etiquetas salían mezcladas y no había embudos.

### Etiquetas y Embudos se PLIEGAN, y elegir cierra el panel

Con las dos listas desplegadas a la vez el panel tapaba la lista de chats
entera, y después de elegir se quedaba encima hasta pulsar fuera. Ahora
(`lib/secciones-del-filtro.ts`, puro):

1. **Las dos secciones nacen plegadas cada vez que se abre el panel**, cada una
   con su flecha; **desplegar una pliega la otra**. Plegada, la sección lleva
   el número de lo elegido dentro: es lo único que dice que filtra.
2. **Elegir o quitar una etiqueta o una etapa cierra el panel entero** y el
   filtro ya queda aplicado (`cierraElPanel`). Elegir la cuenta o el embudo NO
   lo cierra: son pasos. El rango de fechas tampoco: se escribe en dos campos.
3. Por eso el `Popover` es **controlado** (`open`).

Lo prueba `scripts/banco-panel-filtros.sh` (la regla y el panel real en
Chromium; `MODO=roto` monta el de `a041144` y afirma las dos listas a la vez y
el panel abierto tras elegir) y la sonda de la página servida de arriba.

## Chats: los Atajos de una conversación son los de SU línea

El panel de Atajos de la barra de escribir —pestañas **Rápidas** y
**Workflows**— ofrecía los de **todas** las cuentas de la bandeja: la madre y
sus hijas revueltas. Es el mismo fallo de alcance que las etiquetas, pero aquí
**no es solo visual**: lanzar el workflow de Ventas desde un chat de Atención le
manda al cliente los mensajes de otra empresa.

> **A cada conversación se le ofrecen los atajos de la cuenta dueña de su
> línea, y ninguno más** (`lib/atajos-de-la-linea.ts`, puro). Si esa cuenta no
> tiene, la pestaña sale **vacía y lo dice** —«La cuenta de la línea X no tiene
> workflows creados»— y nunca cae a los de la madre ni a los de una hermana.

Cuatro cosas que hay que mantener:

1. **Cada opción trae su `cuentaId`**, y es la CUENTA (`ownerId ?? id` de quien
   la creó), no la fila: un workflow creado por un asesor cuelga de su persona y
   es de la cuenta para la que trabaja. Lo resuelve el bootstrap en una consulta.
2. **La cuenta de la conversación sale de `instanceOwners[linea]`, no de
   `ownerForChat`**, que cae a la cuenta de quien mira si no conoce la línea. Una
   línea que no se sabe de quién es da vacío.
3. **El servidor manda, y en los TRES caminos**: `sendManualWorkflowAction` /
   `sendManualQuickReplyAction` (Evolution y Waha), `sendWahaQuickReplyAction` y
   `sendChannelQuickReplyAction` pasan por `esAtajoDeLaLinea`
   (`lib/atajos-de-la-linea.server.ts`), que resuelve las dos puntas en el
   servidor. Antes aceptaban cualquiera de la familia, y los dos últimos **no
   comprobaban nada**: con el id de cualquier respuesta rápida de la plataforma
   se mandaba su texto. Y `getWorkFlowByUserIds` no pedía ni sesión.
4. **«Nueva conversación» filtra igual**, por la línea elegida
   (`cuentasDeLasLineas`). Si se añade otro sitio que ofrezca atajos, va por
   `atajosDeLaConversacion`.

Lo prueba `scripts/banco-atajos-de-la-linea.sh`, contra Postgres y con
`currentUser()` de verdad, en dos modos: el roto empaqueta las mismas pruebas
contra un commit pinchado y afirma que Ventas ofrecía lo de Atención y que la
respuesta rápida de la madre salía por la línea de Atención.

## Chats: quitar un mando de la fila NO quita su dato

Cada fila de la lista llevaba dos selectores con icono y flechita —el **estado
del cliente** (Cliente Activo / Cliente Inactivo / Sin clasificar) y el **tipo
de asistencia** (Asistencia IA / Asistencia Humana / Sin asignar)— y el menú
«⌄» de la barra ofrecía sus cuatro filtros. Se fueron los seis.

**Y eso fue solo de pantalla.** `Session.client_status` y `Session.service_type`
siguen en el esquema, con sus valores intactos, y `getSesionesDeLaCuenta` los
sigue devolviendo: el CRM los lee, `billing-actions` los sigue escribiendo solo
—marca `ACTIVO` al confirmar un pago e `INACTIVO` al suspender— y el día que
vuelvan a hacer falta el dato está.

> **Un mando que se quita de una pantalla no se lleva por delante su columna.**
> Ni migración, ni backfill, ni `DROP COLUMN`. Lo que deja de existir es la
> forma de cambiarlo **desde esa pantalla**, y eso es todo.

### Lo que se cae detrás, y por eso el diff es grande

Quitar los seis mandos deja muerto todo lo que colgaba de ellos, y dejarlo
puesto es lo que convierte una pantalla en un museo:

| qué se fue | por qué |
| --- | --- |
| `ClientStatusSelect` y `ServiceTypeSelect` | los pintaba **solo** la fila de Chats |
| `updateSessionServiceType` y `updateSessionClientStatus` | las llamaban **solo** esos dos selectores. Una acción de servidor ES un endpoint: dejarlas publicadas sin nadie que las abra es una puerta que ya no vigila ninguna pantalla |
| `clientValidationEnabled` | ese booleano existía **solo** para decidir si se pintaban |
| **dos consultas a `externalDataToolConfig`** | las hacía ese booleano: una en el `Promise.all` de `chats/page.tsx` y otra en el bootstrap. Son **una consulta menos por carga de Chats** y otra menos por arranque |
| cuatro contadores dentro de `conteos` | se calculaban en la pasada caliente que recorre miles de chats por cada mensaje que entra |

La segunda fila es la que se olvida: **si se quita el único sitio que llama a
una acción, la acción se va con él.** Lo que no puede pasar es lo contrario —
borrar la acción y dejar el botón—, que es un botón que al pulsarlo da error.

### Ni franja en blanco ni fila descuadrada, y eso es de construcción

Los badges de la fila viven en un array (`badgeItems`) que se pinta en un
contenedor `mt-1 flex flex-wrap items-center gap-1` detrás de un
`visibleBadges.length > 0`. Las dos cosas importan:

1. **`gap`, no márgenes.** Lo que se quita no deja su hueco detrás.
2. **El contenedor va detrás de la condición**, así que con cero pastillas no
   se pinta — no queda un `<div>` vacío de 24 px, que es exactamente la franja
   en blanco que se venía a comprobar.

Y el `MAX_BADGES = 6` **no se toca**. Cabían justos con los dos selectores
dentro; sin ellos sobra sitio, y bajarlo ahora sería esconder una pastilla que
hoy se ve.

### El banco: dos mitades, porque el cambio vive en dos capas

`scripts/banco-fila-de-chats.sh`, y cada mitad contesta una pregunta que la
otra no puede:

- **Contra Postgres** (`estado-y-servicio-db.test.mjs`), con el esquema real:
  los tres casos —`ACTIVO`/`IA`, `INACTIVO`/`HUMANO` y los dos en nulo— se
  guardan y se leen tal cual, la consulta de la bandeja los sigue trayendo, y
  **abrir Chats no los toca** (se comparan las filas antes y después de dos
  vueltas de `getSesionesDeLaCuenta`). Y las dos columnas se comprueban contra
  `information_schema` con **su nombre de la base** —`client_status` y
  `service_type`—, que es la regla de siempre: un `@map` no se deduce.
- **En Chromium** (`fila-de-chats.test.mjs`), sobre el CSS del build y con los
  componentes **reales**: la fila no pinta los dos mandos, mide **lo mismo** con
  los valores guardados y sin ellos, no deja ninguna caja vacía con alto, no
  desborda a 1440/1280/1024/390, y el menú no ofrece los cuatro filtros ni queda
  con una raya suelta.

**El «antes» sale de `origin/main` con `git show`, no de una copia escrita en el
banco.** Los cuatro ficheros viejos se dejan en un directorio HERMANO de
`_components` —así sus `../../sessions/...` y sus `@/...` resuelven igual— y lo
único que se reescribe son los `./` de los vecinos que sobreviven. Copiado a
mano, el modo roto mediría lo que alguien recuerda del componente viejo.

### Y el selector NO se busca por su texto: es un icono

Costó una vuelta y es lo que habría dejado el modo roto en verde sin ejercer
nada. El disparador de los dos selectores era **solo el icono con su flechita**;
su rótulo —«Cliente Activo», «Asistencia IA»— vive en un **tooltip**, o sea en
un portal que solo existe con el cursor encima. Buscarlos por texto daba vacío
**también en `origin/main`**.

Se buscan por su `aria-label` (`Cambiar estado del cliente`, `Cambiar tipo de
servicio`), que es lo único que está en el DOM sin interactuar. Y por eso
«Sin clasificar» y «Sin asignar» quedan **fuera** de la lista de rótulos: son
también los del estado del lead y los del asesor, que siguen en la fila.

En el menú sí son texto, y ahí la comprobación es directa: cuatro opciones que
el modo roto encuentra y el bueno no.

## Chats: el idioma del cliente se DETECTA, y la traducción va sola

El cliente escribe en inglés (o portugués, francés…) y la plataforma lo nota
sola, sin ningún botón:

| quién lleva la conversación | qué pasa |
| --- | --- |
| **la IA** | contesta en el idioma del cliente. No se traduce nada ni se gasta un crédito de más |
| **una persona** (IA pausada o esperando asesor) | cada mensaje del cliente lleva debajo su traducción al español, y lo que escribe el asesor en español **sale traducido** al idioma del cliente |
| **el cliente escribe en español** | todo sigue igual que hoy: ni traducciones, ni una línea de más en el prompt |

> **El idioma lo decide UNA función, copiada byte a byte en los dos
> repositorios**: `lib/idioma-del-cliente.ts` aquí y
> `src/modules/ai-agent/idioma-del-cliente.ts` en el backend. La App decide con
> ella si traduce y el motor si la IA cambia de idioma; si discreparan, la IA
> contestaría en inglés a quien la pantalla no le traduce nada. Los dos bancos
> las comparan. **Si se toca una, se copia a la otra.**

Seis cosas que hay que mantener:

1. **Se decide con los PRIMEROS mensajes del cliente**, juntos
   (`MENSAJES_PARA_DECIDIR`), y **con dudas no se decide**: «Hola», «ok» o un
   emoji no dicen nada. Heurística de palabras y alfabetos, sin IA: decidir el
   idioma no cuesta un crédito. Se lee por las TRES identidades, en tres ramas
   con su `LIMIT`.
2. **La burbuja enseña lo que viajó por WhatsApp y DEBAJO el español**, en las
   dos direcciones (`MessageBubble`, `data-traduccion`): del cliente, la
   traducción; del asesor, lo que escribió antes de salir traducido. Una sola
   forma: `raw.traduccion = { espanol, idioma, como, en }`, en `raw` y no en una
   columna (#360). El historial guarda así las dos versiones de cada mensaje.
3. **«La lleva una persona» es `Session.status = false` o `escalated_at`**
   (`laLlevaUnaPersona`), no «tiene asesor asignado»: el reparto asigna todas y
   la IA sigue contestando.
4. **Cada traducción es un uso de IA de la cuenta DUEÑA de la línea**
   (`usarLaIaCobrando`). Sin créditos, lo del cliente no se traduce (aviso una
   vez) y lo del asesor **sale en español y se dice**: un mensaje que no llega
   por no poder traducirlo es peor que uno sin traducir.
5. **El sondeo no borra la traducción**: el `ON CONFLICT` de
   `persistChatMessage` la conserva cuando la fila nueva no la trae. Y los TRES
   caminos de envío (Evolution, Waha y canales) la guardan con
   `laTraduccionDelEnvio`, la misma línea.
6. **«Traducir» en el menú «⋯» de cada mensaje es el respaldo manual**, en los
   dos lados, solo donde `seOfreceTraducir` deja (texto, sin traducir, no en
   español). No se traducen: respuestas rápidas, flujos, reenviados ni notas.

La IA recibe al FINAL del prompt el bloque «IDIOMA DEL CLIENTE» (respuesta
normal y los dos seguimientos, `elBloqueDelIdioma` en el backend).

Lo prueban `scripts/banco-traduccion-de-chats.sh` aquí (reglas, barrido y las
acciones contra Postgres con la IA fingida) y
`scripts/banco-idioma-del-cliente.sh` en el backend, los dos con `MODO=roto`
contra un commit pinchado que afirma que no existía nada de esto.

## Chats: la reacción del CLIENTE se cuelga de su mensaje, como la nuestra

El cliente reaccionaba con un emoji desde WhatsApp y en el panel no se veía;
al revés sí. Cada lado creía que la guardaba el otro: el backend la descartaba
(`AVISOS_QUE_NO_SON_CONVERSACION`, «de eso se encarga la App») y la App también
(`persistEvolutionMessages` filtraba las reacciones). Waha ni pedía el evento.

> **Una reacción va en `raw.reaccion` del mensaje al que reaccionaron**, venga
> de donde venga: la plataforma (`guardarReaccion`), el webhook de Evolution y
> el `message.reaction` de Waha (`chatStore.guardarReaccion` en el backend) y
> el sondeo de Evolution (`persistEvolutionMessages`). Ni fila ni columna nueva.

Cuatro cosas que hay que mantener:

1. **El backend la busca por el id de WhatsApp en sus dos formas** (`elIdPelado`:
   el TERCER trozo), dentro de la cuenta y la línea: el `<chat>` de la reacción
   no tiene por qué ser el del mensaje (`@lid` frente al número).
2. **Solo escribe si el emoji cambia**, y avisa en tiempo real solo a los chats
   que tocó. Un emoji vacío la quita. Del sondeo vale la ÚLTIMA por hora
   (`lasReaccionesQueTrae`, `lib/reacciones-del-chat.ts`).
3. **El chat abierto la repinta** porque `areListsDifferent` pregunta
   `cambioAlgunaReaccion`: una reacción no cambia ni el largo ni el último
   mensaje, y sin eso la lista nueva se tiraba por «igual».
4. **`message.reaction` está en `EVENTOS_DEL_WEBHOOK`** (Waha) y en
   `EVENTOS_ATENDIDOS` del backend; las líneas se ponen al día solas.

Lo prueban `scripts/banco-reaccion-entrante.sh` aquí (regla, barrido y el
sondeo contra Postgres) y el del mismo nombre en `api-webhook` (Evolution y
Waha contra Postgres). Los dos con `MODO=roto` contra un commit pinchado que
afirma que la reacción no quedaba.

## Chats: reenviar un mensaje es el MISMO envío, a otra conversación

Cada mensaje (texto, foto, vídeo, documento o nota de voz) lleva **Reenviar**:
al pasar el ratón, justo después de Responder y con su misma forma, en las dos
caras de la burbuja; y en el «⋯» del mensaje, que es por donde se llega en un
táctil. Abre un `PanelLateral` (`PANEL_DE_REENVIAR`, como «Enviar al equipo»)
con las conversaciones de la bandeja, buscador (nombre sin acentos, número por
dígitos) y hasta **5** a la vez (`TOPE_DE_DESTINOS`, el de WhatsApp).

> **Reenviar NO es un camino de envío nuevo.** Cada destino sale por el
> `sendText` del juego de acciones de SU línea —el de la barra de escribir—, así
> que pasa por la misma puerta, pausa la IA igual y se guarda igual. Qué se
> reenvía lo decide `lib/reenviar-mensaje.ts` (pura); lo envía `reenviarA` en
> `chats-client`, en serie.

Cuatro cosas que hay que mantener:

1. **Nunca por la línea de la conversación de origen**: el destino es otra
   conversación y sale por la suya. Un destino sin juego de su línea no se
   ofrece.
2. **«Tal cual» es sin firma y sin cita** (`reenviado: true`): los dos envíos
   que firman —Evolution y Waha— se la saltan. La cita apuntaría a un id de
   otra conversación.
3. **La dirección de WhatsApp va cifrada** (`mmg.whatsapp.net`, `.enc`) y no se
   manda: el archivo se le pide a la línea de ORIGEN (`mediaDeUnMensajeAction`)
   y sale en base64, como un adjunto. Sin archivo que sirva no se envía y se
   dice.
4. **Lo que no es un mensaje no se ofrece**: llamadas, reacciones, stickers,
   notas internas y lo que el cliente borró (`sePuedeReenviar`). Y el resumen
   nombra lo que no salió; con fallos el panel se queda abierto.

Lo prueba `scripts/banco-reenviar-mensaje.sh`: la regla y un barrido sin
navegador, y la burbuja y el panel reales en Chromium a 1440/1024/390.
`MODO=roto` lee y monta la burbuja de `ANTES_REF` y afirma que no había forma
de reenviar.

## Chats: una ubicación compartida es una TARJETA con mapa, como un documento

El cliente compartía su ubicación y la conversación no enseñaba nada útil. Eran
tres fallos, uno por proveedor:

| | qué pasaba |
| --- | --- |
| **Evolution** | se guardaba bien (`locationMessage` con `degreesLatitude`/`degreesLongitude`) y la burbuja pintaba «[Mensaje locationMessage]» |
| **Waha, Meta, Telegram** | el normalizador del backend solo sabía de texto y adjuntos: la ubicación se tiraba y **no llegaba ni a la base** |
| **el guardado temprano del backend** | no tenía etiqueta de ubicación, así que en Evolution solo aparecía cuando la App sincronizaba |

> **La forma común es la de Evolution** (`locationMessage` / `liveLocationMessage`,
> sin la miniatura). La decide `lib/ubicacion-de-whatsapp.ts`, **copiado byte a
> byte** en `api-webhook/src/modules/webhook/utils/ubicacion-de-whatsapp.ts`: el
> backend traduce con él lo de Waha, Meta y Telegram, y la App lo lee. Si se toca
> uno, se copia al otro; los dos bancos los comparan.

Cinco cosas que hay que mantener:

1. **La tarjeta (`TarjetaDeUbicacion`) es la anatomía de un documento**: el mismo
   marco (`MARCO_DE_UN_ADJUNTO`), el mismo ancho (`ANCHO_DE_LA_NOTA`), 150 px de
   vista previa y debajo icono, nombre y dirección (o coordenadas).
2. **El mapa son teselas de OpenStreetMap** (`lib/mapa-de-la-ubicacion.ts`, puro):
   sin clave, sin `iframe`, `loading="lazy"`, colocadas respecto al CENTRO para
   que el pin siga en medio si la caja se estrecha. Sin red queda el fondo con el
   pin y el texto.
3. **El enlace se ARMA con las coordenadas** (`elEnlaceDelMapa`), nunca con el
   `url` que trae el mensaje: ese lo escribió alguien de fuera.
4. **Reenviar y copiar la mandan como TEXTO con el enlace** (`laUbicacionEnTexto`),
   y la exportación la nombra como un documento con ese enlace. Mandar una
   ubicación nativa pide un envío por proveedor que no existe.
5. **La IA sigue sin leerla** (`[UNKNOWN_MESSAGE_TYPE]` en el backend), a
   propósito: esto es de la pantalla.

Lo prueban `scripts/banco-ubicacion-compartida.sh` aquí (las reglas, un barrido
que compara las dos copias si el backend está al lado, y las burbujas reales en
Chromium a 1440/1024/390; `MODO=roto` contra `4a5502b` afirma el tipo crudo y
ningún mapa) y el del mismo nombre en `api-webhook` (los tres normalizadores y el
guardado contra Postgres; su `MODO=roto` afirma que se tiraban).

## Chats: el formato es de WhatsApp, no markdown

WhatsApp no manda formato: manda **marcas dentro del texto plano** —`*negrilla*`,
`_cursiva_`, `~tachado~`, ```` ```mono``` ````— y cada cliente las pinta. Enviar,
por tanto, ya funcionaba solo. Lo que faltaba era de nuestro lado: la burbuja
sacaba el texto tal cual, así que el asesor leía `*confirmado*` mientras su
cliente veía la palabra en negrilla.

**La trampa está en copiar la barra de otras bandejas.** Chatwoot y compañía
escriben markdown —`**negrilla**`, con dos asteriscos— y en WhatsApp eso deja un
asterisco a la vista en el teléfono del cliente. Los botones escriben marcas de
WhatsApp, y solo esas cuatro: **nada de listas, encabezados ni enlaces con
texto**, que WhatsApp no tiene. Un botón que produce algo que el cliente ve roto
es peor que no tenerlo.

Tres cosas que hay que mantener:

1. **Quien entiende las marcas es uno solo**, `lib/formato-whatsapp.ts`, y es
   puro: entra una cadena y salen nodos. Lo pinta `TextoConFormato.tsx` y lo
   escribe `FormatoDeTexto.tsx`, los dos apoyados en él. Si se añade otro sitio
   que enseñe texto de WhatsApp, va por ahí.
2. **Ni justo antes ni justo después de una marca puede haber letra o número.**
   Es la condición que evita que `nombre_de_variable` salga en cursiva y `2*3*4`
   en negrilla, y es el fallo clásico de los lectores caseros de markdown. Con
   los espacios, al revés: pegados por dentro no valen (`* hola *` en WhatsApp se
   ve con sus asteriscos), y por eso al envolver una selección los espacios de
   los bordes se quedan **fuera** de la marca.
3. **Los atajos envuelven al manejador de siempre, no lo sustituyen.**
   `onKeyPress` es el que manda con Enter y el que mueve las sugerencias de `/` y
   de `@`; `manejarTeclas` solo atiende Ctrl+B, Ctrl+I y Ctrl+Shift+X y **deja
   pasar todo lo demás tal cual**.

Y lo que no case con una marca completa se enseña tal cual. La burbuja recorta a
250 caracteres hasta que se pulsa «Ver más», así que un mensaje puede quedar
partido con una marca sin cerrar: entonces se ve el asterisco, que es
exactamente lo que hace WhatsApp.

## Chats: el editor de la foto es un paso opcional, no el camino

Antes de enviar una imagen se puede recortarla, ponerle flechas y cuadros,
dibujar encima y escribir (`EditorDeImagen.tsx`). Se llega por el **lápiz** de la
previsualización del adjunto.

Cuatro cosas que hay que mantener:

1. **Es opcional y va por encima de lo que ya había.** Adjuntar coge el fichero,
   lo pasa a `dataUrl` y lo manda; el editor solo sustituye esa `dataUrl` por
   otra. Si el editor fallara, adjuntar y enviar siguen funcionando exactamente
   igual. Para el envío, el backend, Evolution y WhatsApp es una foto normal:
   **no se toca nada del camino de envío**.
2. **Se dibuja en coordenadas de la IMAGEN, no de la pantalla.** El lienzo se ve
   escalado para que quepa; guardando coordenadas de pantalla, la flecha saldría
   movida en la foto final y de distinto tamaño según la ventana. `aLaImagen`
   hace esa conversión y es la única que la hace. El grosor y el tamaño de letra
   también se miden en la imagen: en una foto de 4.000 px un trazo de 3 px no se
   ve.
3. **Los trazos se guardan, no se queman.** Se repinta todo en cada cambio a
   partir de la lista, así que «Deshacer» es quitar el último y ya, y **el
   recorte es un trazo más**: no destruye nada y se puede deshacer. Si se añade
   otra herramienta, va como un trazo más en esa lista.
4. **Por encima de 2.400 px de lado se trabaja con una copia reducida**
   (`LADO_MAXIMO`). Volver a codificar una foto de cámara entera puede pasarse de
   los 8 MB del adjunto y ahoga la memoria de un móvil mientras se dibuja;
   WhatsApp la recomprime de todas formas. Solo afecta a la foto **si se edita**.

Y el formato de salida es el mismo que el de entrada, con una excepción a
propósito: todo lo que no sea PNG sale como JPEG. Un PNG de una foto pesa
muchísimo más y el tope del adjunto son 8 MB.

## Chats: «Compromiso detectado» se quitó; «Promesa del cliente» NO

Eran dos detectores en el mismo fichero y se confunden con solo mirar el
nombre. **Se retiró uno y se quedó el otro**, así que conviene saber cuál es
cuál antes de tocar nada de esto:

| | qué miraba | qué hacía |
| --- | --- | --- |
| **Compromiso detectado** — *retirado* | lo que escribía el **asesor**, al enviar | abría una **ventana encima** para que confirmara una tarea, una cita o un recordatorio |
| **Promesa del cliente** — *sigue* | un mensaje **entrante** del cliente | crea el seguimiento solo y lo dice con un aviso. Ninguna ventana. |

El primero se fue entero: `lib/commitment-detection.ts`,
`CommitmentTaskDialog.tsx`, `predictAdvisorCommitmentAction` —que además
llamaba a OpenAI en cada envío de texto— y `createDetectedAppointmentAction`.
El segundo vive ahora en **`lib/promesa-del-cliente.ts`**, solo. Compartir
fichero era justo el riesgo: quitar uno se llevaba el otro por delante.

Tres cosas que hay que mantener:

1. **No se borró ni una fila.** No había tabla ni columna suyas: lo que el
   asesor confirmaba en aquella ventana se escribía en `tasks` y en
   `Appointment`, que son tareas y citas de verdad y siguen ahí. Un detector
   que se retira no se lleva por delante lo que la gente ya confirmó.
2. **Por eso el `title: startsWith "Compromiso:"` de la campanita se queda**
   (`notification-center-actions.ts`). Ya nadie escribe tareas con ese título,
   pero las que hay siguen pendientes; quitar esa línea no borraría ninguna,
   las sacaría del grupo «Seguimientos» y las mandaría a «Vencidas». Un filtro
   sobre datos viejos **no es código muerto**.
3. **Sin fecha no hay promesa.** `mencionaUnaPromesa` es el filtro barato del
   navegador —solo mira si el texto suena— y `detectClientPromise` es quien
   decide, ya en el servidor, y se rinde si no hay día. Un seguimiento sin
   fecha es una tarea que nadie hace. Comprobado además que el filtro barato
   nunca descarta nada que el servidor sí agendaría: si se equivocara por ese
   lado, la tarea no se crearía jamás y no habría error que mirar.

## Chats: la campanita, la barrita de formato y resolver en lote

Tres cosas que entraron con la unificación de los paneles y que no son de
colocación.

### La campanita: fuera «Tareas», y «marcar leídas» es del CHIP

Convivían dos chips que se leen igual —«Tareas», las del CRM que vencen, y «Mis
tareas», las que alguien te asignó—. Dos rótulos casi iguales uno al lado del
otro no son dos filtros: son una pregunta sobre cuál es cuál cada vez que se
abre la campanita. Se fue «Tareas».

> **Quitar el chip NO esconde sus avisos.** Los de clase `task` siguen en la
> lista —salen sin filtro— y siguen contando en la insignia roja del botón, que
> suma las siete clases y no estas seis. Lo único que se va es la forma de
> mirarlos por separado. Y de paso la rejilla sale exacta: seis son dos filas
> de tres, sin última fila a medias.

Y hay «marcar leídas», al lado del botón de actualizar. **Marca SOLO lo del chip
puesto** (`lasQueSeMarcan`, en `lib/campana.ts`, puro): con la lista entera,
pulsarlo desde «Menciones» se llevaría por delante los chats y las citas que ni
se estaban mirando — y un aviso que desaparece sin haberlo visto no vuelve. Sin
chip (`"all"`, que es como abre) marca lo que se está viendo, que es todo: eso
es lo que hace el botón predecible.

**Un aviso de conexión no se marca**, ni siquiera desde su propio chip. Es la
regla que ya tenía el clic de uno en uno: describe algo que **sigue roto** —una
cuenta sin instancia, sin clave— y esconderlo para siempre la dejaría sin enviar
mensajes sin que nadie lo recuerde.

### La barrita de formato: va DEBAJO de la selección

Se quitó el botón de la «T» de la barra de escribir y en su sitio sale una
barrita flotante al seleccionar texto, con negrilla, cursiva y tachado —las
marcas de WhatsApp, `*_~`, nunca las de markdown: con `**` WhatsApp deja un
asterisco a la vista en el teléfono del cliente—.

> **Va DEBAJO, y encima solo cuando debajo no cabe.** En un móvil, iOS y Android
> pintan su propio menú de selección **encima** de lo seleccionado, y ese menú
> **no es DOM**: no se puede medir, ni mover, ni saber cuánto ocupa. Encima se
> pelean por el mismo sitio y gana el del sistema, que la tapa entera. Y cuando
> debajo no cabe —la última línea, pegada al borde— es justo el caso en que el
> sistema se lleva el suyo abajo, así que siguen sin coincidir.

**Una sola regla, no dos.** Con una en escritorio y otra en móvil habría dos
comportamientos que mantener a la par, y el que no se prueba es el que se rompe.

Cuatro cosas de la barrita que no se ven leyendo:

1. **La selección de un `<textarea>` se mide con un espejo.** Un `<textarea>`
   no expone el rectángulo de su selección y `window.getSelection()` no entra en
   los controles de formulario. Se clona su tipografía en un `<div>` fuera de
   pantalla, se parte el texto en tres y se lee el rectángulo del trozo de en
   medio. El espejo se crea y se quita en la misma pasada.
2. **Se recuerda el último rango no vacío.** Tocar la barrita en un móvil quita
   el foco de la caja y **colapsa la selección**: sin esa memoria, el botón
   aplicaría el formato sobre nada.
3. **`onPointerDown` con `preventDefault`**, nunca `onClick` a secas: el `blur`
   llega antes que el clic y el botón desaparecería justo antes de que su
   pulsación llegue. Es el mismo fallo que ya costó una vuelta en el selector de
   menciones del chat de equipo.
4. **Y el ancho manda sobre el sitio.** La barrita se acota a la ventana antes
   de colocarse; sin eso, seleccionar una palabra al final de una línea larga la
   saca por el borde derecho — que es exactamente el fallo que este cambio
   entero viene a quitar de los paneles.

### Resolver en lote, y por qué no hay «destacar»

En la barra de acciones en lote entra **Resolver**, justo al lado de marcar como
leído: son las dos cosas que se hacen sobre una tanda de conversaciones ya
atendidas.

**No entra «destacar», y no es un olvido**: destacar es «esta me importa a mí», y
marcar cuarenta de golpe es lo contrario de lo que significa. Se queda de a una,
en el menú de la fila.

Cuatro cosas que hay que mantener:

1. **Es UNA acción de servidor con todos los ids dentro**
   (`resolverSesionesAction`), no N llamadas. Next serializa las acciones de una
   misma página, así que cuarenta borrados desde el navegador son cuarenta idas
   y vueltas **en fila india**. Es la regla que ya está escrita para el borrado
   en bloque, aplicada aquí.
2. **La sesión se busca por la llave de SU línea**, igual que `getSessionForChat`:
   `linea::numero` cuando se conoce la línea, y **sin caer de vuelta a la llave
   global**. Un contacto sin sesión en esta línea no puede resolver en silencio
   la conversación que tiene con otra.
3. **Los ids se sanean como NÚMEROS** (`comoListaDeIdsNumericos`): una sesión
   del CRM se identifica con un entero, no con un `cuid`. Se **descarta** lo que
   no sea un entero positivo en vez de convertirlo — `Number("")` es 0 y
   `Number(null)` también, así que un saneado indulgente convierte basura en el
   id 0 y lo mete en el `IN`.
4. **Lo que no se pudo resolver se CUENTA y se dice**, incluidas las filas sin
   sesión CRM. Un «listo» sobre veinte de las que se fueron dieciocho es peor
   que un error, porque nadie vuelve a mirar.

Y la puerta no es nueva: la acción llama a `resolveSession` una a una por dentro,
que es la que ya comprueba quién puede resolver. Reescribir su comprobación sería
un segundo permiso que el día que se afine el de al lado se queda atrás.

### El banco

`scripts/banco-paneles-flotantes.sh`, dos mitades y las dos en dos modos:

- **La decisión**, pura y sin navegador: dónde nace cada panel, qué marca
  «marcar leídas», qué ids acepta resolver en lote y dónde va la barrita. Su
  `MODO=roto` **no escribe el «antes» a mano**: lo saca de git con `git show` y
  afirma el desorden —cuatro colocaciones distintas para la misma pregunta y ni
  un solo panel colocado contra su contenedor—.
- **Los paneles PINTADOS por Radix**, sobre el CSS del build, en las cuatro
  anchuras y en móvil. Es lo único que puede decir si Radix hace con esos
  números lo que se espera. Su `MODO=roto` pinta los mismos paneles con las
  props de `origin/main`, leídas de ahí igual, y afirma los fallos medidos en la
  tabla de arriba.

Y una del propio `MODO=roto`, que costó una vuelta: **el bloque de un panel se
corta con `(?:[^>]|=>)`, no en el primer `>`.** Esos tags llevan dentro un
`onClick={(e) => …}`, así que cortando en el primer `>` el bloque se queda a
medias — y el que se caía era justo `AdvisorAssignBadge`, el único que abría
hacia arriba, que es el caso que más había que afirmar.

#### Y el «antes» de un banco CADUCA el día que su PR se fusiona

Este banco se puso en verde solo, sin que nadie lo tocara. `MODO=roto` leía los
paneles de `origin/main`… y la unificación ya estaba fusionada ahí, así que lo
que encontraba eran **los paneles ya unificados**: cuatro colocaciones pasaron a
ser una y el modo roto dejó de reproducir nada. No falló: **pasó**, que es lo
peor que puede hacer un modo roto.

> **El «antes» es el estado anterior al SUYO, no `origin/main`.** Mientras el PR
> está abierto los dos coinciden; el día que se fusiona, `origin/main` pasa a ser
> el «después». El commit va escrito en
> `lib/__tests__/el-antes-de-los-paneles.json` —una vez, porque lo leen el banco
> puro y el arnés del de navegador— con el motivo al lado.

Y eso **no** convierte `origin/main` en mala referencia para todo: el banco de la
simetría de la cabecera (abajo) sí la usa, y es lo correcto, porque ese cambio
todavía no está fusionado. Lo que hay que mirar antes de escribir un modo roto
es si el «antes» que se quiere afirmar sigue estando donde se le va a pedir.

Y la señal de que ha caducado es la de siempre: **un modo roto que pasa no está
en verde, está muerto.** Se comprueba quitándole el arreglo al modo bueno y
viendo que se pone en rojo — aquí se hizo con la exclusión de los paneles
laterales, y cayó por el caso que tenía que caer.

## Chats: el contexto del lead, el recordatorio y la tarea son barra lateral

Los tres se abrían como **modal centrado con velo**, y el velo es justo lo que
no deja leer la conversación mientras se rellenan — que es para lo que se
abren: se mira lo que dijo el cliente y se escribe el recordatorio. Ahora se
comportan como la ficha de contacto, el copiloto y el chat de equipo: **una
franja a la derecha que empuja la conversación**, sin fondo oscuro.

### `PanelLateral`: compartir las CLASES no es compartir el componente

El copiloto y el chat del equipo ya compartían `lib/panel-lateral.ts` y **cada
uno escribía su propio marco**: la franja, la hoja, el `translate-x-full` que la
desliza y la cabecera con su equis. Con tres más eso serían cinco copias, y el
día que se afine el deslizamiento se afina en una y las otras cuatro se quedan
atrás — es la lección que ya costó una vuelta entera en la barra de escribir.

`components/shared/PanelLateral.tsx` lo escribe una vez. Cuatro cosas:

1. **La hoja se monta SIEMPRE y lo que cambia es su `translate-x`**: es lo que
   da la animación de entrada **y la de salida**.
2. **Lo de dentro es perezoso** (`useSigueDentro`): no existe hasta la primera
   apertura, así que tener cinco paneles montados en todas las pantallas no
   cuesta nada — ni consultas, ni relojes. Es el `activo` del chat del equipo
   aplicado a los cinco.
3. **Y al cerrar se conserva lo que dura el deslizamiento.** Desmontando al
   instante, lo que se ve irse es una hoja en blanco. Que se desmonte al acabar
   es lo que hace que reabrir empiece de cero: un formulario a medias de OTRO
   chat sería peor que uno vacío.
4. **Es una sola hoja, no dos.** El chat del equipo pinta la suya dos veces
   —`hidden sm:block` y `sm:hidden`— y eso con un formulario dentro sería **el
   mismo formulario montado dos veces, con dos estados**. `FRANJA_DEL_PANEL` y
   `HOJA_DEL_PANEL` son la versión de un solo nodo, con el móvil de base.

**No tiene hueco de pie, a propósito**: el desplazamiento lo pone él. El pie de
un diálogo convertido va DENTRO del contenido, con sus dos botones como hijos
directos de la fila — que es lo que hace que `justify-between` los reparta
(metidos en un `<div>` ve un solo hijo y los manda juntos a un extremo, medido
en este repositorio: +198 px).

### Y `/tareas` también lo hereda, que se dice en vez de esconderlo

`TaskFormDialog` no es solo de Chats: «+ Nueva» de `/tareas` es **el mismo
componente**. Así que ahí también se abre como barra lateral. Fuera de Chats no
hay `[data-chat-view]`, así que no empuja nada: se abre encima, que es
exactamente lo que ya hacen el copiloto y el chat del equipo en el resto de la
plataforma.

Se deja **una sola forma** a propósito. Un parámetro para elegir entre modal y
panel serían dos comportamientos que mantener a la par, y el que no se prueba
es el que se rompe — que es la regla de siempre de esta casa.

### El registro es un CONJUNTO, no un booleano

Es la pieza que no se puede simplificar. Los cinco paneles reservan la misma
franja escribiendo `data-panel-lateral="abierto"` en la raíz, y **abrir uno
cierra el otro**: así que el orden normal es *se abre el segundo, se cierra el
primero*. Con un booleano ese cierre **borraría el sitio que el segundo acaba de
reservar** y la conversación se destaparía sola, a mitad de gesto y sin que
nadie sepa por qué.

`avisarDelPanelLateral` guarda los abiertos en un `Set` y la marca existe
mientras quede alguno. Comprobado en Chromium relevando dos paneles: la marca no
se cae y **la conversación no da ningún salto**.

#### Y lo que entra en el registro es la INSTANCIA, no el panel

Esto no se ve leyendo, y lo destapó barrer **quién monta cada uno**: el mismo
panel está montado más de una vez. La cabecera de Chats pinta el recordatorio
**dos veces** —una en la fila del móvil y otra en la de escritorio— y la tarea
sale de **tres** sitios (la cabecera, el copiloto de `chat-main` y `/tareas`).

Con el registro llevado por el id del PANEL, la instancia cerrada borra lo que
acaba de apuntar la abierta: la marca se cae con el panel abierto y la
conversación se destapa sola. **Es el mismo fallo que el registro vino a evitar,
entrando por la otra puerta.**

Así que lo que se registra es la instancia (`useId`) y lo que se compara en la
exclusión es el panel. De ahí salen bien las dos puntas: dos instancias del
MISMO panel no se cierran entre ellas —son el mismo panel— y cualquier otro sí.

Y por lo mismo la hoja lleva **`data-panel` y no `id`**: dos nodos con el mismo
`id` no son HTML válido, y `getElementById` devolvería siempre el primero.

> **Antes de darle una llave a algo, se cuenta cuántas veces está montado.** La
> pregunta no es cuántos paneles hay: es cuántas instancias, y aquí son ocho
> para cinco paneles.

### Un `fixed` NO es fijo dentro de un `backdrop-filter`: el panel va en un PORTAL

El #888 convirtió los tres en barra lateral y en producción salieron mal los
tres, sin un solo error: el recordatorio se abría **dentro de la
conversación**, y «Nueva tarea» salía en blanco a la derecha con una equis que
no cerraba nada.

Una sola causa. La cabecera de Chats lleva `backdrop-blur-sm`, y un ancestro
con `filter`, `backdrop-filter`, `transform`, `perspective`, `contain` o
`will-change` pasa a ser el **bloque contenedor** de todo `position: fixed` que
cuelgue de él. El panel se montaba dentro de esa cabecera, así que se colocaba
contra ella y no contra la ventana. Y lo de «Nueva tarea» era peor: lo que se
veía era una instancia **CERRADA** —hay tres montadas—, que con su
`translate-x-full` contado desde la cabecera caía justo en la franja de la
derecha, en blanco porque lo de dentro es perezoso, y con una equis que llamaba
a cerrar algo que ya estaba cerrado.

> **`PanelLateral` se pinta en un portal al `<body>`.** Dónde se monte el
> componente deja de decidir dónde se ve — es lo que hace Radix con todos sus
> diálogos y menús, por el mismo motivo. Y una vez fuera, la hoja lleva
> `invisible`: un panel cerrado que asoma se lee como un panel roto.

Por qué no lo cazó el banco del #888: su arnés montaba los paneles **colgando
del layout**, que es donde cuelgan el copiloto y el chat del equipo, y no dentro
de la cabecera, que es donde cuelgan estos tres. **Un arnés que no reproduce
DÓNDE se monta algo no prueba cómo se coloca.** Ahora monta la cabecera con sus
mismas clases, y su `MODO=roto` —con el `PanelLateral` de antes, pinchado a un
commit— reproduce las capturas al píxel: el panel en 672→1056 a 1440 y la
instancia cerrada asomando.

Y hay un segundo banco, `scripts/banco-paneles-en-chats.sh`, sobre la página
**servida** con sesión y una conversación abierta: los tres paneles de la
cabecera nacen en el filo derecho de la ventana y bajo la barra, empujan la
conversación, cargan su contenido, cierran con la equis y ninguna instancia
cerrada asoma; y Canales, Filtrar por asesor y el embudo miden **los tres 288
px**, menos que la columna, en 1440, 1366 y 1024. La semilla lleva **dos
líneas** a propósito: con una, el selector de Canales no se pinta y la
comparación de anchos se haría sobre dos de los tres.

### Y la exclusión se decide en UN sitio

La pareja de botones del borde la tenía escrita a mano, y solo para sus dos.
Ahora la pone `usePanelLateral`, que es por donde pasan los cinco. Con la
condición escrita también en la pareja habría **dos reglas que mantener a la
par**, y el día que se afine una la otra se queda atrás: dos paneles abiertos a
la vez de vez en cuando, que es el fallo más difícil de reproducir de esta
familia.

Dos cosas del hook:

1. **`cerrar` se lee por REFERENCIA.** Un manejador nuevo en cada pintado haría
   que el oyente se quitara y se volviera a poner, y en esa ventana el panel no
   está escuchando — que es exactamente el hueco por el que se cuelan dos
   abiertos a la vez.
2. **Al desmontar se suelta el sitio pase lo que pase.** Un panel que se va del
   árbol sin soltarlo deja la conversación encogida para siempre.

### Los bancos

`scripts/banco-paneles-flotantes.sh` gana una tercera mitad —la simetría de la
cabecera, en Chromium, con las clases **leídas del componente** y el «antes»
sacado de `origin/main`— y `scripts/banco-panel-lateral.sh` es nuevo, con dos:

- **Un barrido sin navegador**: que las tres ya no monten un modal, que los
  cinco pasen por `usePanelLateral` y que la pareja de botones no haya vuelto a
  cerrar el otro por su cuenta. Su `MODO=roto` lee las tres de `origin/main` y
  **afirma que eran modales**.
- **Los paneles de verdad en Chromium**, con el `PanelLateral` real montado dos
  veces: que abrir uno cierre el otro, que la franja no se pierda al relevarse y
  que lo de dentro no exista antes de la primera apertura.

Esa segunda mitad **no tiene modo roto, y se dice en vez de disimularlo**:
reproducir el «antes» ahí serían dos builds, uno por versión del código. Lo que
sí se hizo es lo que de verdad prueba que un banco mira: **quitarle el arreglo
al modo bueno y ver que se pone en rojo** — se rompió la exclusión de
`usePanelLateral` y cayó por el caso que tenía que caer.

## Chats: mencionar a un compañero le ABRE esa conversación, y resolver se la cierra

Una nota interna con `@Nombre` ya avisaba (campanita, «Menciones»), pero no
daba nada más: un **agente** —que solo ve lo suyo— no tenía cómo entrar. Ahora
mencionar hace tres cosas, y ninguna más:

1. **Avisa** (la misma notificación de siempre), y el clic lleva a ESA
   conversación: `enlaceDeLaMencion` (`lib/acceso-por-mencion.ts`) —
   `/chats?jid=…&mencion=<id>`—, y la página saca la línea de la conversación
   (`collab_notifications` no la guarda y es del backend). Las dos campanitas
   usan la misma función.
2. **Abre esa conversación al agente mencionado**: puede entrar y leerla con
   una franja que dice por qué, **sin cambiar su dueño y sin salir en su
   lista**. A quien no es agente no se le abre nada: ya la ve.
3. **Dura mientras siga abierta**: la quita a mano el dueño (la asesora
   asignada), quien administra la cuenta, quien la dio o el propio invitado,
   desde la ficha (Participantes › «Por mención»); y **resolver la quita sola**.

Es independiente de transferir, asignar y agregar participante: ninguno cambia.

Cinco cosas que hay que mantener:

1. **Es una tabla de la App, `acceso_por_mencion`, y NO `session_participants`.**
   Un participante no caduca; esto se va al resolver. Mezclarlas haría que
   resolver se llevara a los participantes de siempre.
2. **La vigencia se mira AL LEER** (`laMencionSigueVigente`: vale si la
   mención es posterior a `resolved_at`), además de borrarse en
   `resolveSession`. La marca de resuelta la escriben otros caminos, y una
   conversación cerrada no puede seguir abierta porque uno olvidó limpiar.
   Mencionar en una ya resuelta sí abre: la mención es posterior.
3. **La lista de gente manda, no el navegador.** Los mencionados se filtran
   contra `elEquipoDeLaCuenta` —la MISMA lista con la que se agrega un
   participante—; lo de fuera se ignora y se dice en la consola.
4. **Una mención no cierra ninguna puerta que ya estuviera abierta.** Las
   conversaciones de un agente se filtran en el navegador y muchos enlaces
   (tareas, notas, búsqueda) lo llevan a chats ajenos: eso sigue igual. Lo único
   que se cierra es lo que abrió una mención cuando ya no vale
   (`laVistaDelInvitado`: «sin acceso» solo si entró por el aviso o ya la veía
   como invitado). Un fallo de red al preguntar nunca cierra nada.
5. **La `@` sale también escribiendo al cliente**, y elegir a alguien pasa el
   compositor a **nota interna**, con aviso: un «@Nombre» no puede irse por
   WhatsApp.

Lo prueba `scripts/banco-mencion-en-chats.sh`: la regla y un barrido, y las
acciones de verdad contra Postgres (aviso, acceso solo a ESA conversación, el
dueño lo quita y otro agente no, resolver lo quita y no toca participantes).
`MODO=roto` corre las acciones de `ANTES_REF` y afirma que mencionar no abría
nada y se avisaba a gente de fuera del equipo.

## Chats: lanzar un flujo A MANO también marca la fila

La pastilla de «flujo ejecutado» de la fila lee `Session.flujos`, y solo la
escribía el motor (`registerWorkflow`) al ejecutar un flujo él. Lanzar el mismo
flujo a mano desde la conversación (`sendManualWorkflowAction`, por Evolution o
Waha) lo enviaba y no dejaba la marca.

> **Después de enviar, `apuntarElFlujoEjecutado`
> (`lib/flujos-ejecutados.server.ts`) lo añade a la ficha de esa línea**, por
> todas las identidades del contacto y con la MISMA forma que el motor
> (`[{id,name}]`, o los nombres por comas de antes: `lib/flujos-ejecutados.ts`,
> pura). No repite un flujo, no borra lo que puso el motor, y nunca tumba el
> envío (se dice en la consola). La fila se pone al día con el aviso de siempre.

Lo prueba `scripts/banco-flujo-manual-en-la-fila.sh`, contra Postgres y con la
acción de verdad; `MODO=roto` contra `f0ad78b` afirma que la marca no aparecía.

## Chats: una nota interna puede llevar archivos, y se ven al abrirla

Al dejar una nota interna o mencionar a un asesor se puede adjuntar imagen,
video, audio o documento (hasta 4), igual que en «Crear recordatorio». El
archivo queda guardado CON la nota y, al abrirla después, sale en la burbuja
con su visor y su descarga. Antes la nota era solo texto: el clip de la caja
dejaba elegir un archivo y la nota lo ignoraba.

> **El archivo sube ANTES al bucket (`/api/upload`, carpeta `notas-internas`) y
> la acción recibe solo su dirección.** `lib/subir-adjuntos-de-la-nota.ts` sube
> de uno en uno, dice qué falló y suelta del bucket lo ya subido si algo falla
> (un archivo sin nota es espacio que nadie sabe de dónde salió).

Cinco cosas que hay que mantener:

1. **La dirección se vuelve a comprobar en el servidor**
   (`comoSeGuardanLosAdjuntosDeLaNota`, pura): de NUESTRO bucket, con la forma
   exacta que escribe `/api/upload`, en la carpeta `notas-internas`, y de una
   cuenta que se alcanza (`laCuentaDeLaAccion`). Si no, la burbuja pintaría un
   `<img>` o un `<video>` apuntando a donde dijera quien escribe. **Un archivo
   que no vale rechaza la nota entera**: guardarla sin él se leería como
   «adjunté y no está». Pasarse de 4 también es rechazo, no recorte.
2. **Los archivos viven en `adjuntos_de_notas`, tabla NUESTRA sin clave
   foránea**, como `acceso_por_mencion`: `internal_notes` es del BACKEND y el
   esquema lo migra él. Se crea al guardar el primero, por `asegurarTabla`
   (`lib/ddl-sin-bloquear.ts`: catálogo primero, plazo de candado), y **leer las
   notas NO la crea** (una cuenta que nunca adjuntó no hace DDL al abrir un
   chat; sin la tabla, `42P01` = «ninguna nota tiene archivo»).
3. **Nota y archivos van en UNA transacción**; borrar la nota borra sus filas en
   la misma y luego suelta los archivos del bucket (si el bucket falla, se dice
   y la nota se borra igual). Sin clave foránea, una fila huérfana —nota borrada
   por cascada al borrar el chat— no se ve nunca: se lee por id de nota.
4. **Una nota puede ser SOLO un archivo.** El texto vacío está permitido solo con
   archivo; la fila de la bandeja dice «🔒 📎 Archivo adjunto» y el aviso de
   mención dice qué archivo es (`elTextoDeLaNotaParaElAviso`), nunca llega en
   blanco. En la caja, adjuntar NO borra lo escrito (al cliente sí: es el pie).
5. **Dentro de una nota, nada sale al cliente.** «Video» solo se ofrece en modo
   nota (al cliente seguía apagado y se queda así; al dejar la nota se quita de
   la caja y se dice), y una grabación se ADJUNTA a la nota (botón ámbar), no se
   manda por WhatsApp. La burbuja usa el mismo visor que un mensaje
   (`MediaRenderer`) y, debajo de cada archivo, su nombre, peso y enlace de
   descarga a la vista.

Lo prueba `scripts/banco-adjuntos-en-notas.sh`: la regla, la subida y un barrido;
las acciones contra Postgres (guardar, abrir después, rechazos, transacción,
puerta entre cuentas, borrar); y la burbuja y la caja REALES en Chromium sobre
el CSS del build. `MODO=roto` corre el código de `fb40429` y afirma que la nota
ignoraba los archivos, que sin texto se rechazaba, que la burbuja no los
enseñaba y que la caja no ofrecía video ni adjuntaba la grabación.
