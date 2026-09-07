# Reglas que no se tocan

## Chats: el reloj responde, el tiempo real solo adelanta

El chat abierto se refresca con **su propio intervalo, fijo y corto**, corra o
no el tiempo real. El aviso instantáneo es un acelerador: si acierta, el mensaje
aparece al momento; si no, el reloj lo trae unos segundos después y nadie se
entera.

**No subir esos intervalos**, y no condicionarlos a que el socket parezca vivo.

Esto costó una noche entera de atención con clientes esperando. Los intervalos
se habían relajado —la lista de 20s a 60s, la conversación a 20s— dando por
hecho que el tiempo real mantendría la frescura. No lo hizo: el aviso llega con
una de las varias identidades del contacto (`remoteJid`, `@lid`, `senderPn`) y
cuando no emparejaba con la conversación abierta, el mensaje salía en la lista y
en la conversación no. Con el reloj relajado, el retraso era de minutos.

Tres cosas concretas que hay que mantener:

1. El ciclo del chat abierto es un `setInterval` montado una sola vez, que lee
   todo por referencia. **No volver a una cadena de `setTimeout`**: si una vuelta
   no llega a programar la siguiente, el ciclo muere en silencio y la
   conversación se congela hasta cambiar de chat.
2. Al pedir mensajes se pasan **todas** las identidades conocidas del contacto,
   incluida la que trae el aviso. Preguntar solo por una devuelve vacío sin
   error.
3. Si Evolution contesta corto, se tira de nuestra propia base, que guarda cada
   mensaje con todas sus identidades.

## Chats: las marcas de tiempo, siempre en segundos

Las marcas llegan en **dos unidades**. Evolution unas veces las da en segundos y
otras en milisegundos, y el aviso de tiempo real reenvía la que le llegó sin
tocarla (`realtimeTs` en `webhook.service.ts` del backend). Lo nuestro trabaja en
segundos: los mensajes propios se sellan con `Date.now() / 1000`.

**Todo lo que entre por el socket se pasa a segundos con `epochToMs(...)/1000`
antes de guardarlo**, tanto el mensaje que se mete en la conversación como el
`lastMessage` de la fila. Y **las comparaciones normalizan las dos partes** con
`epochToMs`, nunca comparan en crudo.

Esto costó una noche entera. Una marca en milisegundos entre otras en segundos es
mil veces mayor que cualquiera, así que:

- `avisarSiLaListaVaPorDelante` se rendía en su primera comparación **siempre**
  para ese chat. La conversación se quedaba minutos atrás y **no salía ni un
  aviso en la consola**, porque el aviso está después de esa comparación. Solo se
  ponía al día cuando entraba el mensaje siguiente por otro camino, y de ahí la
  sensación de ir siempre uno por detrás.
- La fila se quedaba clavada arriba del todo, ordenada por una marca imposible.

Que no haya avisos en la consola **no significa que no haya fallo**: puede
significar que el detector no llega a ejecutarse.

## Chats: nada que detecte un fallo puede ir detrás de algo que falle

`avisarSiLaListaVaPorDelante` —el que se da cuenta de que la lista tiene un
mensaje que la conversación no— estaba **después** de
`await refreshChatSessions(...)`, una consulta que manda los descriptores de
todos los chats de la cuenta. Y el `catch` de esa vuelta estaba **mudo**.

Resultado: si esa consulta fallaba o tardaba, se saltaba al `catch` y el detector
**no llegaba a ejecutarse nunca**. La lista se actualizaba (eso pasa una línea
antes), la conversación se quedaba horas atrás, y en la consola **no salía
absolutamente nada** — ni el aviso, porque no se llegaba a él; ni el error,
porque nadie lo escribía.

Costó dos días de buscar en el sitio equivocado, pidiendo una consola que no
podía decir nada.

Dos reglas:

1. **Lo que detecta un problema va primero**, antes de cualquier `await` que
   pueda fallar. El detector solo compara marcas de tiempo: no necesita esperar
   a nada.
2. **Ningún `catch` vacío** en los ciclos de refresco. Un fallo silencioso ahí no
   se nota como un error: se nota como una App lenta, que es mucho peor de
   diagnosticar.

Y una tercera, que costó otra noche **después** de escribir las dos de arriba:
no basta con que el aviso exista, tiene que poder **salir**. El aviso seguía
detrás de dos `return` mudos —no encuentro la fila, la fila no trae marca— así
que la pantalla iba mal y la consola seguía vacía. Ahora hay un **latido sin
ninguna condición delante** (`[chats] latido del detector`), que sale en cada
vuelta de la lista con un chat abierto. Su ausencia también informa: significa
que el ciclo no corre. **No ponerle condiciones**: es justo lo que lo inutiliza.

## El build borraba los avisos: `removeConsole`

Antes de buscar por que "la consola no dice nada", mirar `next.config.js`.

Estaba asi:

```js
compiler: { removeConsole: { exclude: ["error"] } }
```

En produccion Next **borra todas las llamadas a `console` menos las excluidas**.
Con solo `error` en la lista, cada `console.warn` y cada `console.info` del
proyecto **desaparecia del codigo que corre**. No es que no se vieran: es que no
existian.

Eso costo dos dias. Se anadieron avisos en el detector de la lista, en el
tiempo real, en la pausa de la IA y en el borrado de chats; se pidieron capturas
de la consola una y otra vez; y todas volvian vacias. La conclusion que se
sacaba —"no salta ningun aviso, luego el codigo no llega ahi"— era falsa: el
codigo llegaba, pero el aviso no estaba compilado.

Ahora la lista es `["error", "warn", "info"]`. **No quitar `warn` ni `info`**:
este documento tiene una regla entera sobre que un fallo nunca puede ser mudo, y
sin ellos esa regla no se sostiene. `log` y `debug` siguen fuera, que eso si es
ruido de desarrollo.

Como comprobar que un aviso sobrevive, sin desplegar:

```
npm run build && grep -rl "el texto del aviso" .next/static/chunks/
```

Si no aparece, en produccion no existe.

## Chats: un fallo de segundos no puede costar medio minuto

En la consola de producción salía `POST /chats 502 (Bad Gateway)`: la consulta
de mensajes rebotando en Traefik mientras el contenedor reiniciaba. Pero la
reacción del cliente lo multiplicaba por diez.

> Cuando se escribió esto se dio por hecho que el corte duraba segundos. Medido
> después, son **unos 100 segundos** por despliegue (ver el pendiente 1). El
> corte es más largo de lo que se creía, así que esta regla importa más, no
> menos: encima del minuto y medio del servidor, el sondeo añadía el suyo.

El sondeo dobla su espera en cada fallo —10s, 20s, 40s— y esa espera **solo se
borraba cuando volvía bien una consulta de mensajes**. El ciclo de la lista, que
va al mismo servidor y sí estaba volviendo bien, no se lo decía a nadie. Así que
la conversación seguía parada medio minuto por un problema que ya no existía.

Dos cosas que hay que mantener:

1. **Una vuelta de la lista que va y vuelve borra la espera del sondeo.** Si una
   consulta al mismo sitio contesta, el servidor está en pie: no hay nada que
   esperar. Que cada ciclo lleve su cuenta por separado es lo que causó esto.
2. El techo de la espera es **20s**, el mismo ritmo de la lista. Estaba en 45s y
   eso son minutos de sensación de lentitud por un corte de segundos.

Desde fuera nada de esto parece un error. Parece una App lenta.

## Chats: agotar la espera no es tirar la respuesta

El sondeo del chat abierto corría contra un reloj de 15s hecho con
`Promise.race` contra un `reject`. Pasados los 15s la respuesta que venía en
camino **se perdía**, aunque llegara entera un segundo después. Y al otro lado,
`warmChatMessagesAction` juntaba con `Promise.all` la consulta a Evolution y la
consulta a nuestra base: la nuestra estaba lista en milisegundos —con el mensaje
ya guardado por el webhook— pero **esperaba a Evolution**, cuyo propio corte
también eran 15s. O sea: el plazo del navegador y el de Evolution eran el mismo,
así que cualquier lentitud de Evolution se comía la vuelta entera.

Desde fuera: la persona escribe, el mensaje está guardado, y la conversación se
queda minutos vacía. El sondeo se rendía vuelta tras vuelta y doblaba su espera.

Tres cosas que hay que mantener:

1. **Nuestra base no espera a Evolution.** Se lanzan las dos a la vez, pero se
   contesta con lo guardado en cuanto Evolution pasa de
   `MARGEN_ANTES_DE_TIRAR_DE_LA_BASE` (6s). Evolution sigue de fondo hasta su
   propio corte (`ESPERA_MAXIMA_DE_EVOLUTION`, 9s) y **lo que traiga se persiste
   igual**, así que la vuelta siguiente lo recoge. Es la regla de siempre —cuando
   Evolution se queda corta manda nuestra base— aplicada al **tiempo** y no al
   contenido.
2. Los dos plazos van **escalonados**: el de Evolution por debajo del que espera
   el navegador. Si se igualan, vuelve el fallo.
   Y el atajo de los 6s **solo se corre si hay algo guardado que enseñar**. Sin
   esa condición —así entró al principio— un chat sin historial local, que es el
   caso más común de la bandeja (alguien que acaba de escribir por primera vez),
   se rendía a los 6s y devolvía un fallo **tres segundos antes del plazo de la
   propia Evolution**: la conversación se abría **en blanco** aunque Evolution
   fuera a contestar. Si no hay nada local no hay atajo, se espera a Evolution
   hasta su corte.
3. En el navegador, agotar la espera **solo libera el ciclo**. La respuesta se
   sigue escuchando y, si el chat sigue abierto cuando llega, **se pinta**. Nunca
   volver al `race` contra `reject`: eso tira trabajo ya hecho.

## Chats: resincronizar historial NO es novedad

Cuando un asesor escribe desde la App, la IA se calla: `pausarIaPorIntervencionHumana`
pone `status = false` antes de que el mensaje salga.

Eso se escribía bien. Lo que fallaba es que **lo deshacíamos nosotros mismos**.

El reloj del chat abierto vuelve a pedirle a Evolution los últimos mensajes cada
5 segundos y los persiste (`persistEvolutionMessages` → `persistChatMessage` →
`upsertSessionFromChatMessage`). Y ahí un mensaje entrante **reabre** la
conversación:

```ts
const reabrir = input.fromMe ? undefined : true;
```

Entre los mensajes que trae el sondeo van los del cliente —viejos, ya guardados,
ninguna novedad—, así que cada vuelta del reloj ponía `status = true` otra vez.
**El asesor pausaba y cinco segundos después el sondeo despausaba**, sin que el
cliente hubiera escrito nada.

De ahí venían los síntomas que despistaron durante toda una sesión:

- Desde el móvil "sí funcionaba" y desde la App no. No era la App: es que ese
  reloj **solo corre cuando hay una conversación abierta en la App**.
- Con el mismo contacto unas veces sí y otras no, según cayera la vuelta del
  reloj entre el envío del asesor y el buffer de 10s del backend, que
  re-verifica `session.status` justo en esa ventana.

La regla: **la reapertura es solo para lo que llega EN VIVO**. El camino que
resincroniza historial pasa `puedeReabrir: false`. Si se añade otro camino que
persista mensajes ya conocidos, va igual. Si el cliente escribe de verdad, la
conversación sigue reabriéndose sola.

Y una advertencia de fondo: `status` sirve para dos cosas a la vez —"conversación
resuelta" y "IA pausada por intervención humana"—. Mientras sea así, cualquier
cosa que toque `status` puede apagar la otra sin querer.

## Chats: la pausa busca por TODAS las identidades

`pausarIaPorIntervencionHumana` llamaba a `buildWhatsAppJidCandidates(remoteJid)`
con el jid pelado. Y esa función devuelve un `@lid` **solo en su forma literal**,
a propósito: sus dígitos son un id de privacidad, no un teléfono, y fabricar el
número a partir de ellos daría un JID falso que podría casar con otro contacto.
El teléfono real tiene que venir aparte, como `extraValue`.

Con un contacto abierto por su `@lid` —que es como llegan casi todos, los
webhooks vienen con `addressingMode: "lid"`— se buscaba la sesión solo por esa
forma, la sesión estaba guardada bajo el número, y el `updateMany` no tocaba
ninguna fila. Estuvo así desde el 29 de julio (#185).

Si la primera búsqueda no pausa nada, se completa con las identidades que guarda
`chat_messages` y se reintenta. Es la misma regla de siempre: cuando una forma se
queda corta, nuestra base sabe completarla.

## Chats: las sesiones no vuelven al reloj de la lista, y la agenda no se sube

`refreshChatSessions` es, con diferencia, lo más caro de la pantalla, y estaba
pegado al reloj de la lista: **cada 20 segundos, por cada pestaña abierta**.

Cada vuelta: el navegador serializaba la **agenda entera** —más de 3.000
contactos con todos sus alias en las cuentas grandes— y la mandaba por POST; el
servidor los validaba uno por uno con Zod; con ellos armaba ~10.000 identidades
candidatas y buscaba en lotes de 5.000, o sea consultas de 10.000 parámetros
contra Postgres. Y no era una consulta: eran **cuatro** (sesiones con etiquetas,
seguimientos, resueltas y citas).

Con varios asesores conectados eso son decenas de consultas enormes por minuto
para devolver algo que casi nunca cambia. Encaja con lo que se vio: `502`
repetido, el contenedor reiniciando, y al volver la lista incompleta (240 chats
de 3.075, sin sesiones, sin nombres, sin fotos).

Van a **60s** (`INTERVALO_MINIMO_DE_SESIONES`), con `forzar` para el refresco
que se pide a mano. **No devolverlas al ritmo de la lista.**

Y aun a 60s seguía doliendo. Medido en producción con el aviso
`[chats] el refresco de sesiones va caro`, en una cuenta de 3.900 chats:

| chats subidos | peso | tardó |
| --- | --- | --- |
| 3.912 | 500 KB | 1,3 s |
| 3.914 | 500 KB | 13,5 s |
| 3.911 | 499 KB | 25 s |

Y en los ratos de 11-25 s **la consulta de mensajes del chat abierto también se
pasaba de plazo** (`la consulta de mensajes va lenta; se sigue esperando`). Era
la misma cola: la base ocupada con las consultas de 10.000 parámetros y todo lo
demás esperando detrás.

Ahora **no se sube nada**. `getSesionesDeLaCuenta` trae las sesiones por
`userId` —primera columna del índice único `(userId, instanceId, remoteJid)`—
y el navegador las empareja con sus chats en `lib/chat-session-match`, que es
puro: solo compara cadenas. Es el mismo criterio de siempre movido de sitio
(preferida > alterna > pedida > candidata; luego nombre bueno; luego la más
reciente), y la llave `linea::numero` se sigue escribiendo solo cuando hay
sesión en esa línea. El aviso de la consola ahora dice `sesionesRecibidas`,
`tardoMs` (red) y `emparejarMs` (navegador), para comparar antes y después.

**No volver a mandar la agenda al servidor para pedir sesiones.** Si hace
falta otra cosa por chat, se calcula con lo que ya está en el navegador.

Esto **no** contradice la primera regla de este documento. Lo que se espacia
aquí es información de CRM —a quién está asignado un chat, sus etiquetas, su
estado—, **no mensajes**. Los relojes que traen los mensajes siguen igual de
cortos: 5s el chat abierto, 20s la lista. Y lo que hace el propio asesor se
pinta al momento sin pasar por aquí: asignar, etiquetar, renombrar y **borrar**
ya actualizan el estado en local.

Lo de borrar costó una sesión aparte. El quitar la fila estaba **después** del
`await` de la consulta que borra sesiones, conversaciones y mensajes —que no es
corta—, así que se pulsaba "Eliminar chat", el diálogo se cerraba y el chat
seguía ahí unos segundos, con la conversación todavía abierta al lado. Parecía
que no había pasado nada. **La fila se quita y la conversación se cierra antes
de preguntarle al servidor**, y si el servidor dice que no, se devuelve todo tal
cual estaba. Si se añade otra acción del asesor, va igual.

## Chats: la sesión se busca por su id, no por el número

Cambiar el estado de un lead desde la lista —Frío, Tibio, Finalizado— **se
guardaba en la base y no se veía en pantalla**. Parecía que la App no dejaba
cambiarlo; en realidad reaparecía solo, hasta un minuto después, cuando el reloj
de sesiones traía la lista otra vez.

La causa: `chatSessions` guarda la sesión de un contacto bajo **dos** llaves —la
global (el número pelado) y la de su línea (`linea::numero`)—. La fila se queda
con la de **su línea** (`getSessionForChat`), pero al avisar del cambio mandaba
solo el número. Cuando la global no existía —ese contacto solo tiene sesión en
esa línea, o la global está guardada bajo otra de sus identidades— la búsqueda
fallaba y se salía con un `return previous` **mudo**.

Es el mismo fallo que ya se había arreglado en `handleAssignAdvisor`, que sí
calcula su `claveEnMemoria`; a los tres hermanos —estado del lead, tipo de
servicio y estado del cliente— se les había pasado.

Dos reglas:

1. **Lo que actualiza una sesión en memoria la busca por su `id`**, que es el
   mismo en todas sus llaves y no depende de con qué identidad se pregunte.
   `aplicarEnLaSesion` recorre el mapa y toca todas las entradas de esa sesión.
2. Si no encaja ninguna, **se avisa**. Un `return previous` callado aquí se ve
   como un botón que no hace nada.

## Chats: "Cargar mensajes anteriores" también necesita plazo

El botón no tenía ninguno. Si la consulta no volvía —Evolution colgada, un `502`
en mitad de un despliegue— se quedaba en **«Cargando…» para siempre**,
deshabilitado, y la conversación sin su historial. Ni error, ni forma de
reintentar.

Va como el sondeo del chat abierto (ver *agotar la espera no es tirar la
respuesta*): agotar el plazo **solo libera el botón**; la respuesta se sigue
escuchando y, si el chat sigue abierto cuando llega, se pinta. Y el `catch` no
puede faltar: sin él un fallo de red dejaba el botón bien pero sin explicar por
qué no llegó nada.

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
primera línea WAHA (2026-09-06), pero le pasa a cualquier línea con IA.

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

## Una recarga tiene que decir por qué

"La App se refresca sola cada cierto rato" es de lo más difícil de diagnosticar:
cuando pasa, **la recarga se lleva la consola por delante** y no queda ni rastro.
No hay captura que pedir.

Por eso `hardReload(motivo)` **anota el motivo antes de recargar** —en
`sessionStorage`, con la ruta y cuánto llevaba abierta la pestaña— y
`reportarRecargaPrevia()` lo cuenta al arrancar, desde `ChunkRecovery`:

```
[app] esta pagina se recargo sola. Motivo: promesa rechazada: ChunkLoadError
  { donde: "/notas", hace: "2s", laPestanaLlevabaAbierta: "412s" }
```

Dos cosas:

1. **Ningún `hardReload()` sin motivo.** Hay tres sitios que recargan
   —`ChunkRecovery`, el error boundary y la pantalla de error—; los tres pasan
   el suyo.
2. **Su ausencia también informa**: si la página se recarga y esto no sale, la
   recarga **no viene de nuestro código** (el contenedor, el navegador, la red).
   Eso descarta media investigación de un vistazo.

Sale como `console.warn` a propósito: `log` y `debug` los borra el build (ver la
regla de `removeConsole`).

## "Salir" es un viaje, no tres, y se ve que está saliendo

"Le doy a Salir, le doy, le doy, y no sale." El botón encadenaba **tres viajes**
al servidor antes de moverse —una acción de servidor para borrar las cookies de
impersonación, el GET del token CSRF de next-auth y el POST de `signOut`— y
**no enseñaba nada mientras tanto**. Con el contenedor ocupado cada viaje
tardaba segundos, la persona volvía a pulsar y cada pulsación lanzaba la
cadena entera otra vez.

Ahora `handleLogout` **navega** a `/api/logout` y nada más. La pestaña enseña
su indicador de carga al instante, hay un viaje, la ruta no toca la base —la
sesión es JWT: borrar la cookie **es** cerrar la sesión— y contesta con la
redirección al login. El botón pasa a «Saliendo…» y la segunda pulsación no
hace nada.

Dos reglas para cualquier botón que hable con el servidor:

1. **Que se vea que se pulsó**, antes de que el servidor conteste. Un botón que
   no cambia hasta que vuelve la respuesta es un botón que se pulsa cinco veces.
2. **Un viaje.** Si una acción necesita tres, se junta en una ruta o acción que
   haga las tres.

Y para "cambiar de pestaña tarda", hay medida: `NavegacionLenta` anota el
clic en cualquier enlace interno y avisa `[app] cambiar de pagina tardo`
con `desde`, `hacia` y `tardoMs` cuando pasa de 1,5 s. Se pide ese aviso
antes de tocar nada.

## Toda acción y toda ruta comprueban de quién es el dato

Había funciones que un usuario con sesión podía llamar con el id de **otra
cuenta** y contestaban sin preguntar: el CRM entero
(`getSessionsByUserIdToCRM`), las tareas de una conversación ajena
(`getTasksBySessionAction`) y el prompt del agente de otro cliente
(`patchBusinessAndFirma`, que no comprobaba **ni sesión**). Y cinco rutas de
subida a S3 que no pedían nada: cualquiera, con o sin sesión, podía llenar el
bucket o dejar archivos en la carpeta de otra cuenta. Es el H02 de la auditoría
del 2026-09-06.

La regla ya existía, `assertCanAccessTargetUser`, y es la que respeta a todos
los que tienen que pasar: uno mismo, el asesor sobre su dueño, cuentas
vinculadas, admin y super admin sobre todo, el reseller sobre sus clientes. Lo
que faltaba era **aplicarla donde no estaba**.

Tres cosas:

1. **Ninguna acción de servidor que reciba un `userId`, un `sessionId` o un id
   de recurso lo usa sin pasar antes por `assertCanAccessTargetUser` con el
   dueño de ese recurso.** Si el recurso no trae el dueño (una conversación, un
   prompt), se resuelve primero con una consulta pequeña y luego se comprueba.
2. **Ninguna ruta `/api` confía solo en el middleware.** El middleware se pudo
   saltar (ver la regla de Next) y volverá a poder en la próxima CVE. Las rutas
   que son para el navegador comprueban `currentUser()`; las que son para el
   backend llevan su clave (`CRM_FOLLOW_UP_RUNNER_KEY`); las públicas de verdad
   (`/api/health`, formularios públicos, avatar) lo son a propósito y lo dicen
   en un comentario.
3. Cuando un legítimo reciba «No autorizado», **se arregla la pantalla que
   manda el id equivocado, no la regla.** El caso típico: pasar el id del asesor
   donde la regla espera el de su dueño.

## Next: no bajar de 14.2.25, y cómo comprobarlo

La App estuvo en Next `14.2.4` con la CVE-2025-29927: una cabecera
`x-middleware-subrequest` **se salta el middleware**, que es lo único que
protege varias rutas `/api` (subidas, `finance/overview`). Las páginas tienen
segunda barrera (`requireAuth` en el layout); esas rutas no.

**Se demostró antes de arreglarlo**, sobre el build de `14.2.4` arrancado en
local con `AUTH_TRUST_HOST=true` y variables de relleno:

```
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  -H "x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware" \
  http://127.0.0.1:3996/api/finance/overview
```

Sin la cabecera: `307 -> /login`. Con la cabecera en `14.2.4`: **`500`** —el
middleware se saltó y la petición llegó a la ruta, que aquí solo falló por no
tener base—. En producción habría entrado. Con `14.2.35`: `307 -> /login` en
los dos casos.

Dos cosas:

1. **Next a `14.2.25` o superior, siempre**, y `eslint-config-next` a la misma.
   Están fijadas sin `^` a propósito.
2. La línea 14 **ya no recibe parches**: `npm audit` lista una veintena de
   avisos (DoS, cache poisoning) que solo se cierran en 15.5.x. Subir a 15 es
   un proyecto aparte —React 19, `cookies()`/`headers()` asíncronos— y no se
   mezcla con un arreglo. Mientras tanto, las rutas `/api` que hoy solo
   confían en el middleware deberían comprobar sesión por sí mismas (ver H02 de
   la auditoría del 2026-09-06).

El Dockerfile va en `node:22`: la 20 dejó de tener soporte, y el backend ya
estaba en 22.

## Diagramas: si no se puede guardar, no se puede tocar

Un diagrama compartido con otra cuenta era **siempre de solo lectura** —no
existía compartir como editor— pero **el lienzo se dejaba tocar entero**: se
arrastraban nodos, se escribía dentro de ellos, se borraban. Nada de eso se
guardaba (`FlowEditorClient.guardar` salía con un `return` mudo si
`!puedeEditar`) y **tampoco salía ningún aviso**. La persona trabajaba un rato,
recargaba, y el diagrama estaba como al principio. **Trabajo perdido sin un solo
error**, que es la misma familia de fallo que todas las reglas de Chats de
arriba.

Y el despiste que lo provocó: la tarjeta del diagrama tiene una visibilidad
—Privado / Solo lectura / **Editable**— que reparte **dentro del equipo de una
misma cuenta**. Compartir con la cuenta de un cliente es otra cosa, y ponerlo
"Editable" no le daba nada al cliente. Dos ideas distintas con la misma palabra.

Tres cosas que hay que mantener:

1. **El bloqueo es del lienzo, no del guardado.** `FlowCanvas` recibe
   `soloLectura` y con él apaga arrastrar, conectar, seleccionar, la tecla
   Supr, el soltar nodos, el botón "Ordenar" y el "+" de los conectores;
   `FlowNode` no abre su diálogo de edición ni enseña duplicar/borrar. El
   `return` mudo de `guardar` solo es aceptable **porque** ya no se puede llegar
   a él con cambios encima. Si alguna vez se vuelve a dejar tocar el lienzo sin
   permiso, ese `return` tiene que avisar.
2. **El permiso vive en `flow_shares.permiso`** (`lectura` | `edicion`), por
   cuenta, no en `flows.visibility`. Las filas antiguas se quedan en `lectura`,
   que es como se comportaban.
3. **Editar un diagrama recibido escribe sobre el original**, no sobre una
   copia: `saveFlowGraphAction` actualiza por `id` cuando el flujo no es de la
   cuenta pero el permiso es `edicion`. Es lo que se espera de "compartido como
   editor"; quien quiera su propia versión tiene el botón de duplicar.

## Una línea es UNA instancia; el proveedor es un ajuste suyo

WhatsApp Mensajería (WAHA) se construyó como una **segunda línea**: la tarjeta
fabricaba una instancia aparte, `NOMBRE_V2`, con su propia fila en `Instancias`.
Pero un número solo está conectado por un proveedor a la vez —o Evolution o
WAHA—, y todo lo que importa (historial, leads, etiquetas, seguimientos, memoria
de la IA) está guardado por instancia, no por proveedor. Con dos filas el mismo
número quedaba partido: dos tarjetas en Conexiones, dos «Alexis» en Chats, dos
leads en el CRM, y un flujo lanzado sobre la fila vieja salía por Evolution
—apagada— y agotaba el plazo con «Timeout de solicitud».

La regla: **cambiar de proveedor cambia `instanceType` de la MISMA fila**
(`actions/proveedor-de-linea-actions.ts`), conservando `instanceName` (las
conversaciones y los mensajes) e `instanceId` (las sesiones del CRM). El
backend ya decide por `instanceType` en cada envío, así que no hay nada más que
tocar. La sesión de WAHA se llama **igual que la instancia**; `_V2` no existe.
Nunca hay dos encendidos: con Evolution conectada el botón de cambio se apaga.

Si en una cuenta quedaron datos bajo `NOMBRE_V2`, el cambio a WAHA los adopta
(`adoptarRestosDelSufijoV2`) y lo dice en la consola: `[linea] proveedor
cambiado a WhatsApp Mensajería { mensajesMovidos, sesionesMovidas, … }`.

## Chats: `contact.aliases` NO son todas las identidades

Al pedir los mensajes se pasaba solo `contact.aliases`, y ese campo **viene vacío
en la mayoría de los contactos**. Sin `remoteJidAlt`, sin `senderPn` y sin la
identidad con la que llegó el último mensaje, se pregunta por una sola forma del
contacto y la respuesta vuelve correcta y vacía.

Se usa `identidadesParaPedirMensajes(contact, jid)`, que se apoya en
`getChatIdentityCandidates`. En **todos** los caminos que pidan mensajes: abrir,
el reloj del chat abierto, el aviso de tiempo real, la precarga y el refresco de
fondo. Si se añade otro, va con esa función.

## Chats: buscar la fila por TODAS las identidades

El aviso de tiempo real trae **una** de las identidades del contacto
(`remoteJid`, `remoteJidAlt`, `senderPn`, `@lid`) y no tiene por qué ser la misma
con la que está guardada la fila. Donde se busque el chat de un aviso hay que
mirar las cuatro; con solo `remoteJid` y `aliases` el mensaje se perdía sin
error: ni subía la fila, ni se marcaba como no leído, ni se avisaba a la
conversación.

Esto se arregló para la **lista** y se quedó sin arreglar para la
**conversación**, y costó otra tarde: "se ve en la columna de todos los chats y
en la conversación no". `isOpenChat` —el que decide si el aviso es del chat
abierto y por tanto si se pinta al instante— comparaba solo `remoteJid` y
`aliases`, que viene vacío casi siempre. Cuando no reconocía el chat, la
conversación se quedaba esperando al sondeo, y con Evolution lenta eran
minutos. Ahora compara con `identidadesParaPedirMensajes` y
`chatMatchesAnyJid`, las mismas que usa todo lo demás.

Y el aviso, **cuando sí se pintaba, salía vacío**: se metía el texto en
`message.conversation` pero se conservaba el tipo original, y la burbuja lee el
texto **según el tipo**. Un `extendedTextMessage` —cualquier texto con enlace o
con cita— buscaba `extendedTextMessage.text`, no lo encontraba y salía como
«Mensaje eliminado» hasta que el sondeo traía la versión completa. El aviso se
pinta **siempre como `conversation`**; cuando llega el mensaje real, mismo
`key.id`, `mergeMessages` lo reemplaza con su tipo completo.

Y aun con todo eso, **para las líneas de cuentas vinculadas no llegaba ningún
aviso**. El backend emite a la sala `user:{dueño de la línea}`, y el token de
`/api/realtime/token` unía al navegador solo a la propia, la del dueño y la de
sesión. La bandeja, en cambio, enseña también las líneas de las cuentas
vinculadas en los dos sentidos (`allSessionUserIds` en `chats/page.tsx`). Para
esas líneas la lista se movía con su reloj de 20 s y la conversación esperaba
a su sondeo. **El token une a las mismas cuentas que la bandeja enseña.** Si se
añade otra fuente de líneas a la bandeja, va también al token; la respuesta
del token dice `cuentas` para comprobarlo desde la pestaña Network.

Y el socket **tarda en conectar**: en producción el WebSocket contra
`backend.ia-app.com` falla (`WebSocket connection … failed`, varias veces
seguidas) y solo después entra por polling. El cliente iba con `websocket`
primero, así que cada conexión y cada reconexión esperaba a que el WebSocket
agotara su plazo —20 s por intento— antes de probar el otro, y en ese rato no
llegaba ningún aviso. Va con **polling primero** (el orden por defecto de
socket.io) y sube a WebSocket si puede; la consola dice `conectado
{ transporte }` y `subio a websocket`. Si nunca sube, el WebSocket no pasa por
el proxy y hay que mirar Traefik, pero los avisos llegan igual.

Y para saber si un aviso **llegó**, cada uno deja rastro: `[realtime] aviso
{ instancia, tipo }` en el navegador y, en el backend, `chat:changed → user:X
… oyentes=N`. Si el backend dice `oyentes=0` con la App abierta, la App no
está en esa sala; si dice 1 o más y el navegador no dice `aviso`, se perdió
por el camino.

## Conexión: el canal se llama igual; el proveedor solo se nombra al cambiarlo

Una cosa es **cómo se llama la tarjeta** y otra **por dónde se conecta**. El
canal es siempre «Mensajería WhatsApp (QR)». Evolution y **Waha** son
proveedores, y solo se nombran donde se cambia de uno a otro: el aviso del icono
de flechas y su diálogo de confirmación. En ningún otro sitio.

Antes el título cambiaba con el proveedor —«Mensajería WhatsApp (QR)» con
Evolution y «WhatsApp Mensajería (QR)» con Waha—: dos nombres parecidos para lo
mismo, y el cliente no tiene por qué saber que detrás hay dos servidores.

La línea es **una tarjeta** (`TarjetaDeLinea`), la misma en Perfil y en
Conexiones, con **cuatro mandos y ninguno más**:

| Dónde | Control | Qué hace |
| --- | --- | --- |
| Cabecera | Flechas | Cambia de proveedor. Solo el icono, sin etiqueta. |
| Cabecera | Papelera | Cierra sesión, borra en el servidor y borra la fila. |
| Cuerpo | Verde | **Cierra la sesión.** Al posar el cursor se pone rojo y lo dice. |
| Cuerpo | Rojo / azul | El **Robot**: apaga y enciende la IA de esa línea. |

Cuatro cosas que hay que mantener:

1. **Nada de texto suelto ni pie en la tarjeta.** Lo que hace cada botón se lee
   al posarse encima y se explica en su diálogo. El Robot no necesita bloque
   propio: ese botón rojo ya es él.
2. **Cerrar sesión existe en los dos proveedores.** Es la única forma de cambiar
   el número de una línea sin perder su historial. En Evolution la llamada vivía
   dentro de `deleteInstance` —desvincular obligaba a borrar la línea entera—;
   ahora es `cerrarSesionDeLaLinea`. Un fallo del servidor **se dice**: un
   «listo» con la sesión abierta hace creer que ya se puede escanear con otro
   teléfono.
3. **El Robot funciona con los dos.** El backend ya leía la misma marca para
   ambos (los mensajes de Waha pasan por el mismo `processWebhook`), pero la App
   exigía una clave de Evolution y llamaba a su webhook, así que en Waha el
   Robot estaba muerto. Con Waha **no se le pregunta nada a Evolution**.
4. **Perfil no puede tener su propia lógica.** Pinta las mismas tarjetas que
   `/connection`, en el mismo orden. Cuando no conocía el tipo `waha`, la línea
   caía en «Desconocido» y salía «Crear instancia»: pulsarlo creaba una segunda
   línea con el mismo nombre y partía el número en dos.

Y dos de rejilla y tipografía, que se ven a la primera:

- **Ni `auto-rows-fr` ni `h-full` en las tarjetas.** Con las filas iguales, cada
  tarjeta se estira hasta la altura de la más alta y le queda un hueco en blanco
  debajo de los botones. Va `items-start`: cada una mide lo que ocupa.
- **Un solo título** (`TituloDeTarjeta`, 19 px con icono de 21). Convivían dos
  escalas —24 px con iconos de 16 en las tarjetas con línea, 20 px con iconos de
  24 en las de canal por conectar— y una al lado de otra se veían disparejas.
  Si se añade otra tarjeta de canal, usa ese componente y no un tamaño a mano.

## El Robot no es el webhook

El botón **Robot** de cada línea encendía y apagaba el **webhook de Evolution**.
Robot apagado = Evolution no le manda nada al backend = no hay aviso en vivo,
no se guarda historial en nuestra base y la conversación abierta solo vive del
reloj contra Evolution. Las líneas atendidas por personas —justo las que se
apagan— eran las que peor iban en Chats, y se buscó el fallo durante horas en
el socket, en las salas y en las identidades. Se vio en los logs del backend:
en diez minutos entraban webhooks de veinte líneas de otras cuentas y **ni uno
de las de Verzay**; se encendió el robot y llegaron.

Ahora son dos cosas:

1. **El webhook va siempre encendido.** `cambiarRobot` y `leerEstadoDelRobot`
   (`actions/robot-actions.ts`) lo dejan encendido pase lo que pase. Es lo que
   trae los avisos y el historial.
2. **El Robot es la marca `bot_enabled` de la línea** (`Instancias`), que crea
   el backend con su migración. El backend la lee en cada mensaje
   (`isBotEnabled`, con caché de 10 s) y, apagado, **guarda y avisa y se para**:
   sin sesión, sin disparadores, sin IA, sin flujos.

La App lee y escribe esa columna **con SQL en crudo**, no en `schema.prisma`:
la columna la crea el backend y, si la App desplegara antes con la columna
declarada, reventaría cada consulta a `Instancias` (el #360). Sin columna, el
botón vuelve a tocar el webhook como antes y lo dice en la consola.

Y la migración en caliente: una línea con el webhook apagado en Evolution es
una que se apagó con el botón viejo. Al abrir Conexión se toma como robot
apagado, se guarda la marca y se enciende el webhook. Nadie tiene que hacer
nada a mano.

## Chats: la lista es grande, no rehacerla por gusto

Hay cuentas con miles de chats. Rehacer la lista entera cuesta segundos de
navegador bloqueado, y mientras tanto no se dibuja nada ni corren los relojes.

- Lo caro de cada fila (nombre, foto, sesión, marca) se calcula en
  `contactosBase`, que **no** depende de cuál esté abierto. Lo que sí depende de
  la selección se aplica encima, en una pasada barata. No volver a juntarlas: con
  `selectedJid` en las dependencias de lo caro, cada clic reconstruía miles de
  filas.
- Los avisos de tiempo real se aplican **en tanda**, no uno por uno.
- Los contadores de la cabecera (pestañas, filtros, asesores) salen de **una
  sola** pasada, `conteos`. Eran cuatro `useMemo` y cada uno recorría y copiaba
  la lista varias veces: más de quince recorridos de miles de chats por cada
  mensaje que entraba, solo para pintar unos números. No volver a partirlos en
  memos sueltos por comodidad.
- Ningún manejador que se le pase a una fila puede llevar `contacts` ni
  `chatSessions` en sus dependencias. Esos objetos llegan nuevos en cada
  refresco, así que el manejador cambiaba de identidad, y con él cambiaban las
  props de todas las filas: el `React.memo` de la fila dejaba de servir y la
  columna entera se repintaba. Si el manejador solo necesita consultarlos al
  pulsar, se leen por referencia (`contactsRef`, `chatSessionsRef`).

## Chats: la regla de la lista no se recalcula al hacer scroll

La virtualización mide con alturas estimadas. Esas medidas dependen **solo de la
lista**, no de por dónde va el scroll, y por eso viven en `listMetrics` aparte de
`listVirtual`.

Estaban juntas, así que cada evento de `scroll` rehacía dos arrays de miles de
posiciones y volvía a sumar todas las alturas. Arrastrar la columna se sentía
pegajoso y no era por pintar —eso ya iba acotado— sino por rehacer la regla
entera sesenta veces por segundo.

Dos cosas que hay que mantener: la búsqueda de los extremos es **binaria** (con
miles de chats, recorrer el array hasta encontrarlos cuesta lo mismo que no
virtualizar), y el scroll se mide **una vez por fotograma** (`requestAnimationFrame`),
porque el navegador dispara el evento muchas más veces de las que puede pintar.

# Pendientes

Lo que queda abierto en la plataforma. Actualizar aquí cuando se cierre algo.

## 1. Cada despliegue deja la App caída un minuto y medio

El contenedor no reiniciaba solo: **reiniciaba porque lo redesplegábamos**
(ver *por qué reiniciaba el contenedor*, en Cerrados). Lo que sigue abierto no
es el reinicio, es lo que cuesta cada uno.

El servicio va con **una sola réplica** y con `Order: stop-first`: Swarm
**apaga la vieja antes de levantar la nueva**, así que entre las dos no hay
nadie escuchando y Traefik solo puede contestar `502`. Medido en el despliegue
de las 01:05 del 2026-09-02:

| momento | reloj (UTC) |
| --- | --- |
| empieza la actualización | 01:05:53 |
| la tarea vieja termina de morir | 01:06:07 |
| arranca el contenedor nuevo | 01:07:33 |
| Next.js listo | 01:07:34.5 |

**Unos 100 segundos sin App.** Arrancar no es el problema —Next tarda 280 ms—:
el tiempo se va en apagar la vieja y en bajar la imagen, y **las dos cosas
pasan con el sitio caído**. Con 30 despliegues en un día (2026-09-01) eso es
casi una hora de `502` repartida en el día.

De esos 100 segundos, **14 son apagar la vieja, y no hacen falta**. El
contenedor arranca con `CMD ["sh", "-c", "node server.js"]` y ese `sh` **no
ejecuta a Node en su lugar, lo cuelga debajo**: el PID 1 es `sh`
(`SigCgt: 0000000000010002`, o sea que solo atiende `SIGHUP` y `SIGCHLD`).
Docker manda `SIGTERM` **solo al PID 1**, y el núcleo se lo traga porque el
PID 1 no lo atiende. Node ni se entera. Pasados los 10 s de gracia llega el
`SIGKILL`, y de ahí el `exit 137` de todas las tareas: **no es falta de
memoria, es que nadie escucha la orden de apagarse.**

Tres cosas que lo arreglarían, de menos a más:

1. `CMD ["node", "server.js"]` (sin el `sh`). Node pasa a ser el PID 1, recibe
   el `SIGTERM` y sale limpio. Ahorra los 10-14 s y quita el `exit 137`.
2. `Order: start-first` en el stack, para que la nueva esté escuchando **antes**
   de apagar la vieja. Es lo que se lleva el minuto y medio entero.
3. Un `healthcheck` contra `/health` (el backend ya tiene uno). Sin él Traefik
   no sabe si la nueva está lista y manda tráfico a un puerto que aún no
   contesta.

Ojo con dónde se tocan: **el `docker-compose.yml` del repo es una plantilla**
—dominio de ejemplo, límites distintos, un `pgbouncer` que en producción no
existe—. El stack que corre de verdad se edita en Portainer. Lo único de esta
lista que se arregla desde el repo es el `CMD` del `Dockerfile`.

## Cerrados

- **Wompi de punta a punta.** Confirmado con dinero real el 2 de septiembre de
  2026: un cliente pagó y la cuenta se reactivó sola. Era el único pendiente que
  podía costar dinero. Lo que faltaba no era configuración sino código, en tres
  piezas: no existía ninguna ruta que recibiera los avisos de Wompi (ahora
  `/api/payment/wompi`, que verifica la firma del evento); `/api/payment` no
  estaba entre las rutas sin sesión del middleware, así que el aviso recibía una
  redirección al login en vez del webhook; y el enlace del aviso de cobro era
  uno por plan, igual para todos, así que el pago llegaba sin decir de quién era
  y no había a quién renovarle. Ahora cada cliente tiene el suyo, `/p/{codigo}`,
  que calcula el precio al abrirse y respeta el precio pactado de esa cuenta, no
  el de lista del plan.
- **Por qué reiniciaba el contenedor.** No era la memoria: **eran los
  despliegues**. Mirado en Portainer contra el histórico de tareas del servicio
  Swarm (`agente-app_verzay_app`), que es donde está el dato —`RestartCount` del
  contenedor es 0 y siempre lo será, porque Swarm no reinicia contenedores: los
  tira y crea otros—. Las 5 tareas del histórico (el límite es 5,
  `TaskHistoryRetentionLimit`) llevan **cada una una imagen distinta**, y cada
  una cae encima de un merge a `main`:

  | tarea creada (UTC) | commit | merge |
  | --- | --- | --- |
  | 00:24:28 | `48ae80a` | 00:19:00 |
  | 00:40:01 | `e8e8250` | 00:35:28 |
  | 00:47:12 | `08d3dfd` | 00:42:03 |
  | 00:53:17 | `aa289c8` | 00:47:49 |
  | 01:05:53 | `f7e15d3` | 01:00:57 |

  La imagen que corre ahora lleva el tag `f7e15d3d9df0…`, el commit de las
  01:00. Ninguna imagen se repite: **no hay ni un reinicio que no sea un
  despliegue**. Y hubo 30 despliegues el 2026-09-01, 25 el 08-31, 16 el 08-30 —
  cada merge a `main` dispara el webhook de Portainer.

  Lo de la memoria queda descartado con números, no por descarte: el cgroup del
  contenedor lleva `oom 0` y `oom_kill 0` en `memory.events`, `OOMKilled` es
  `false`, y el consumo se mueve entre **480 y 545 MiB de los 1536 MiB** del
  límite (~31 %). El host va a 1,7 GiB de 23,5 GiB y lleva 228 días sin
  reiniciar. El `exit 137` despistaba: aquí no es el `SIGKILL` del gestor de
  memoria, es el de Docker al agotarse los 10 s de gracia (ver el pendiente 1).

  Se deja puesto el latido `[chats] latido del detector`: lo que diagnostica es
  que el ciclo de la lista corre, que es el fallo de la conversación atrasada,
  no este. Quitarlo es decisión aparte.
- **Seguimientos que salen tarde.** Van espaciados 1 a 2 minutos por número para
  no arriesgar la línea. Se deja como está: no se está superando la cola de 300
  donde el espaciado empezaría a doler.
- **Paginar la lista de chats.** No se hace. "No leídos" se calcula en el
  navegador (`localStorage`, clave `seenMessages`), así que con solo 50 chats
  cargados ese contador dejaría de cuadrar. Llevarlo al servidor obligaría a
  mover ese estado a una tabla, y eso haría que leer en el PC marcara como leído
  en el móvil. Se prefiere como está hoy.
- **Chats eliminados que no volvían.** Ahora vuelven si el contacto escribe
  después del borrado (ver `isChatDeletedByPreference`).
- **Flujo tipo chatbot que no se activaba.** El de Bienvenida estaba declarado
  como obligatorio y se había eliminado. Quitada esa declaración, funciona.
- **Lector de Google Sheets con cabeceras repetidas.** Dos columnas con el mismo
  nombre hacen que la segunda pise a la primera y esa columna desaparezca de la
  búsqueda: el asistente responde "no encontrado" sin ningún error. Se decide NO
  arreglarlo en código: dos encabezados iguales son un error de la hoja, y se
  corrigen ahí.
- **Índices de Postgres.** Se miró con datos: los repetidos suman 144 kB y los
  que nadie usa unos 3,5 MB, varios de ellos `_pkey`/`_key` que no se tocan. En
  una base de 1,6 GB no compensa.
- **`audit_logs`.** La nota decía que se escribía y no se leía nunca; se lee, en
  el botón de historial de una nota. Crecía sin freno pero despacio (2,3 MB en
  dos meses). Tiene borrado a los 90 días con el resto de la limpieza nocturna.
- **Archivos huérfanos.** Borrados `components/form-register.tsx` y
  `MisClientesMain.tsx`.
