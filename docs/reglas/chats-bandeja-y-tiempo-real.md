# Chats: bandeja, tiempo real, carga y rendimiento

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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

## Chats: un fallo de segundos no puede costar medio minuto

En la consola de producción salía `POST /chats 502 (Bad Gateway)`: la consulta
de mensajes rebotando en Traefik mientras el contenedor reiniciaba. Pero la
reacción del cliente lo multiplicaba por diez.

> Cuando se escribió esto se dio por hecho que el corte duraba segundos. Medido
> después, eran **unos 100 segundos** por despliegue. Eso ya está cerrado —con
> `start-first` y dos réplicas siempre queda una atendiendo, ver *los 100
> segundos de caída por despliegue* en Cerrados— pero **la regla se queda**: un
> `502` puede volver por otro camino (Traefik, la base, el propio despliegue de
> Evolution), y lo que esta regla evita es que el sondeo le añada medio minuto
> por su cuenta.

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

## Chats: lo que se cambia desde la conversación abierta pinta SU fila al momento

Las etiquetas, el recordatorio, la cita, las notas internas, los seguimientos,
los flujos y lo que hace una macro se veían en la fila de la lista solo al
minuto (reloj de sesiones) o al recargar; la calificación y la etapa sí iban al
momento porque se aplicaban en memoria. Y las etiquetas, además, se aplicaban
bajo la llave GLOBAL del contacto mientras la fila lee la de SU línea.

> **Quien cambia algo de la fila AVISA con el id de la sesión**
> (`avisarQueCambioLaFila`, `lib/fila-de-chats-al-dia.ts`), y Chats vuelve a
> leer ESA fila con la MISMA consulta que la bandeja (`laFilaDeLaSesionAction` →
> `getSesionesDeLaCuenta` con `soloLaSesion`) y la aplica por id en todas sus
> llaves (`aplicarEnLaSesion`). Nada se cuenta en el navegador: el número es el
> que traerá el reloj. **Si se añade otro sitio que cambie un icono de la fila,
> avisa igual.**

El candado de notas va aparte (`EVENTO_NOTAS_DE_LA_FILA`, que lleva la ÚLTIMA
nota, no solo «tiene notas»: ver la sección de abajo), y la lista de las notas
(`lasNotasDeLaBandejaAction`) mira las cuentas que la bandeja enseña
(`lasCuentasQueVeLaBandeja`). Los avisos de la misma sesión se agrupan en una
lectura (`ESPERA_PARA_LEER_LA_FILA_MS`). Lo prueba
`scripts/banco-iconos-de-la-fila.sh` (barrido y la acción contra Postgres);
`MODO=roto` lee `ffe0583` y afirma que nadie avisaba.

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

## Chats: un mensaje entrante deja el chat SIN LEER, y solo lo limpia ABRIRLO

Un contacto escribía y el chat nacía **ya leído**, sin que ningún asesor lo
hubiera abierto ni respondido. Y no era la IA leyéndolo para contestar: pasaba
igual con la IA apagada.

La causa era la pregunta. La fila decidía así:

```ts
const isRead = wasSeenPreviously || lastFromMe || isSelected
            || (!hasUnreadFromServer && !hasLocalPending);   // ← esta
```

O sea: **«si el proveedor no dice que hay no leídos, dalo por leído»**. Y ese
dato, para WhatsApp, casi nunca existe:

- Cuando la lista sale de **nuestra base** —toda línea Waha, y cualquier línea
  cuando Evolution no contesta o se queda corta— `inboxRowToChat` escribe
  `unreadCount: 0` **siempre**, a propósito: lo pone a 1 solo en Telegram y
  Meta. Así que `hasUnreadFromServer` era falso para todo, y todo nacía leído.
- Y cuando la lista sale de Evolution, ese contador es de Baileys y lo limpia
  cualquier cosa que marque el chat como leído en el teléfono o en la propia
  sesión. **Un dato que unas veces está y otras no no puede decidir.**

El otro mecanismo que había —`pendingUnreadJids`, del hook de avisos— tampoco
podía sostenerlo, y conviene saber por qué para no volver a enchufarlo: tenía
una **ventana de cinco minutos**, **descartaba a propósito los chats que
aparecen por primera vez** («un chat que aparece por PRIMERA vez NO debe
notificar», para no soltar cientos de avisos al abrir la App — o sea que **un
contacto nuevo no salía nunca sin leer**), vivía en **estado de React**, así que
una recarga lo vaciaba, y agrupaba por número **sin su línea**.

De ahí que el fallo se viera intermitente, que es lo que más despista: con un
chat ya conocido y la pestaña abierta, ese hook a veces acertaba y el chat salía
en rojo un rato; al recargar se perdía, y con un contacto nuevo no salía nunca.
El banco lo reproduce con esa misma asimetría.

> **La regla, y es una frase: un mensaje entrante deja el chat SIN LEER, y solo
> lo limpia que alguien ABRA el chat.** No lo limpia el proveedor, ni que la IA
> conteste, ni una vuelta del reloj. Lo decide `elChatEstaSinLeer`
> (`lib/no-leido-de-la-fila.ts`, puro) y nadie más.

Lo que sí sabe de verdad quién abrió qué es `seenMessages` —una marca por línea
y chat, con la FECHA de lo último que se vio, en el `localStorage` de este
navegador—, que ya existía y no se toca.

### El CORTE, que es lo que evita la regresión del día uno

Con la regla a secas, una cuenta de 3.900 chats abriría la bandeja con miles en
rojo el día del despliegue: de los históricos no hay marca, porque
`seenMessages` guarda 1.000 entradas y solo de lo que se abrió en ESTE
navegador. Un contador que dice 2.900 es peor que uno que falta — es el mismo
«99+ sobre una cuenta vacía» que ya costó una vuelta.

Así que cada línea tiene **un corte** (`chatsLeidosHasta`, una entrada por
línea): la fecha de lo más reciente que ya estaba en la bandeja la primera vez
que esta pestaña vio esa línea. Todo lo anterior se da por leído; todo lo que
llegue después cuenta.

Cuatro cosas que hay que mantener:

1. **Se siembra UNA vez por línea y NO se mueve nunca.** Si se re-sembrara en
   cada vuelta con lo más reciente, taparía cada mensaje que entre y no saldría
   nada sin leer jamás — el fallo original por la otra puerta. Por eso la
   siembra va detrás de haber leído lo guardado (`cortesLeidos`): sembrar sobre
   el mapa vacío del primer pintado es re-sembrar en cada entrada a Chats.
2. **Se siembra con la fecha del chat MÁS RECIENTE de esa línea, no con
   `now()`.** Con `now()` se abre una ventana: un mensaje que entre entre la
   carga y la siembra se daría por leído. Con la fecha del más reciente no hay
   ventana, porque lo que llegue después tiene una fecha mayor.
3. **Es por LÍNEA, no una sola global.** Una línea que se conecta mañana siembra
   la suya; con un corte global, sus chats históricos saldrían todos sin leer. Y
   cabe de sobra: una entrada por línea, **no una por chat** — sembrar los 3.900
   desbordaría el tope de `seenMessages` y podaría justo los más antiguos, que
   son los que hay que dar por leídos.
4. **`sembrarLosCortes` devuelve `null` cuando no hay nada que sembrar**, que es
   el caso de todas las vueltas menos la primera de cada línea. Así no se
   escribe en el navegador ni se repinta la lista por gusto. Es el mismo patrón
   que `desplegarElEspacio`.

### Con el chat delante, la marca AVANZA

Abrir un chat guardaba el mensaje que la fila tenía en ese momento, y hasta ahora
bastaba porque el contador del proveedor tapaba el resto. Ya no: si el contacto
escribe tres veces mientras se le lee y el asesor se va a otro chat sin
contestar, el anterior volvería a salir sin leer — y nadie lo entendería, porque
lo acaba de leer.

**No avanza sobre un chat marcado a mano como no leído**: eso es una decisión de
la persona y gana sobre todo, que es lo que ya hacía `forcedUnreadJids`. Y de
paso esto arregla abrir por enlace (`?jid=`), que no pasa por el clic de la fila
y por tanto no marcaba nada.

### Lo que cuesta, que se dice

1. **Leer el chat desde el móvil ya no limpia la App.** Antes lo hacía a veces,
   cuando Evolution devolvía su contador a cero. Se pierde a propósito: ese dato
   es justo el que no era de fiar, y era la causa del fallo.
2. **En la primerísima vuelta de una línea, un chat que de verdad estuviera sin
   leer se da por leído.** Una vez por navegador y línea.
3. **Si una marca se cae del tope de `seenMessages`** (1.000 chats distintos
   abiertos) ese chat puede volver a salir sin leer. Se limpia abriéndolo.

### Y no queda una segunda fuente

`useAdvisorNotifications` sigue avisando —sonido, notificación del sistema,
insignia de la pestaña— y **deja de devolver `pendingUnreadJids`**: el conjunto
se queda dentro, que es lo que evita re-avisar del mismo chat. Dos formas de
contestar «quién está sin leer» es una que se afina y otra que se queda atrás. Y
`unreadCount` sigue en `ChatData` para lo que ya lo usaba —la campanita, el
merge de la lista—: lo que se quitó es que decida la fila.

### El banco

`scripts/banco-no-leido.sh`, dos mitades:

1. **La regla y el corte, sin navegador** (`no-leido-de-la-fila.test.mjs`), con
   la condición de antes **escrita dentro, literal** —la función de ahora no
   existía, así que no hay un «antes» suyo que sacar de git— y afirmando el
   fallo; más un **barrido del código**, que es lo único que dice si la bandeja
   PASA por la regla: el fallo no estaba en ninguna función, estaba en que la
   pantalla preguntaba otra cosa. El barrido **quita los comentarios antes de
   mirar**, porque el arreglo lleva escrito al lado por qué el contador del
   proveedor ya no decide.
2. **La bandeja de verdad, sobre la página SERVIDA** (`probar-no-leido.mjs`):
   línea `waha` con cuatro conversaciones, un mensaje entrante escrito como lo
   escribe el webhook, y se lee lo que la bandeja dice de sí misma. La regla se
   puede probar en frío; **que la pantalla la use, no**.

Tres cosas del banco que costaron su vuelta:

1. **Se mide por el PUNTO azul de la fila y por la pastilla**, no solo por el
   `data-sin-leer` de ahora: con la marca sola, el modo roto diría «cero sin
   leer» por no encontrar el atributo, que es lo mismo que diría el arreglo
   funcionando. Y se exige que el punto y la marca digan lo mismo.
2. **Se espera a que el mensaje LLEGUE a la fila**, comprobando su texto. «No
   está en rojo» se cumple también mientras el mensaje no ha llegado, así que
   sin eso el caso del chat abierto pasaba **sin ejercer nada** — comprobado:
   quitando el avance de la marca seguía en verde.
3. **El primer `button` de la fila es el AVATAR**, y el último el menú: se pulsa
   el que lleva el nombre. Un `[data-chat-id] button` a secas no abre nada, y el
   banco habría dicho «no se limpia» sin haber abierto el chat. Y la «Guía
   rápida» del copiloto se abre sola con un velo que se come los clics: hay que
   apartarla o el banco se cae por algo que no tiene que ver.

`MODO=roto BUILD_ANTES=<un .next del commit de antes>` reproduce **cuatro
fallos**, y dos son el reporte al pie de la letra: un contacto nuevo nace leído,
y lo que sí salió en rojo se pierde al recargar.

## El número en la PESTAÑA: solo lo que exige respuesta

Con la pestaña de fondo entre otras diez, lo único que se ve de la App es su
icono de 16 píxeles. El contador de la barra lateral y la campanita no existen
ahí: hay que **volver a la pestaña** para saber si pasó algo, que es justo lo
que no se hace cuando se está en otra cosa.

Así que el número se pinta encima del favicon, en un lienzo, y el `<link>` se
sustituye en caliente.

**La regla, y es la misma de siempre contada en otro sitio:**

> **Cuenta lo que exige RESPUESTA: conversaciones de clientes SIN LEER —la
> pastilla «Sin leer» de Chats, ni una más—, más lo que en el chat del equipo
> va dirigido a esta persona: un directo o una mención. Si las tres suman cero,
> no se pinta nada.**

No es una lista de lo que cabía: un icono que sube con todo se aprende a
ignorar, y entonces deja de servir **también para lo que sí había que
contestar**. Es la misma familia que *la campanita es solo para menciones* y que
el sonido del equipo, que no suena con el general a secas. Por eso el número del
equipo **no es `total`** —eso son todos los mensajes sin leer, el general
incluido, que es el canal donde está todo el mundo—.

### Contaba algo que no existe, y por eso decía 99+ sobre una cuenta vacía

Esto es el #838, y son dos fallos con la misma cara. Verificado en producción
con Verzay Ventas: se borraron **todos** los chats y **todos** los leads
—`/chats` decía «No hay chats que coinciden con el filtro», la pastilla «Todos»
sin número, `/sessions` con 0 leads— y el contador seguía en **`99+`**, tanto en
el icono lateral del menú como en el favicon. Y antes del borrado, `99+` con la
campanita vacía y 577 en «Todos», sin nada realmente pendiente.

La causa era **una segunda fuente que no debía existir**. La mitad de chats del
número salía de una consulta del servidor (`contarChatsSinLeer`) que contaba
**las conversaciones cuyo último mensaje es del contacto**. Eso no es «sin
leer»:

1. **En una cuenta de 577 chats atendidos son casi todos**, así que el icono
   decía `99+` aunque no hubiera nada por contestar.
2. **Y esa consulta mira `chat_conversations`**, una tabla que **sobrevive a
   borrar los leads**: el borrado toca `Session`, las conversaciones se quedan.
   Con la cuenta vacía seguía devolviendo un número de tres cifras — un
   contador que cuenta algo que ya no existe.

Peor aún, el arbitraje que decidía entre la bandeja y ese conteo dejaba ganar
al servidor **siempre que la bandeja estuviera vacía**: sin conversaciones que
juzgar, su marca de tiempo era cero, así que cualquier hora del servidor la
superaba. De ahí el `99+` sobre una cuenta sin una sola conversación a la vista.

> **La corrección es quitar la segunda fuente.** Los chats sin leer los cuenta
> **la bandeja y nadie más**, y es exactamente el número de la pastilla «Sin
> leer». `contarChatsSinLeer`, `losChatsQueEsperan` y todo el arbitraje de
> `elNumeroDeChats` **se borraron**.

### Por qué no puede haber un conteo del servidor: lo no leído no vive aquí

Es lo que hay que saber antes de intentar «arreglarlo» devolviendo el conteo
del servidor. **Lo no leído de un WhatsApp no está en nuestra base**, y está
comprobado, no supuesto:

- `chat_conversations` no tiene ninguna columna de «sin leer».
- `persistedRowToChat` pone `unreadCount` a 1 **solo** en Telegram y Meta; para
  WhatsApp escribe **0 siempre** — y por eso ese contador **dejó de decidir
  nada**: daba por leído todo lo que saliera de nuestra base. Está contado en
  *un mensaje entrante deja el chat SIN LEER*.
- Lo que la bandeja llama «sin leer» sale de las marcas del **navegador** —qué
  chats se abrieron y hasta cuándo estaba leída cada línea:
  `hooks/chats/useSeenMessages`, con la regla en `lib/no-leido-de-la-fila`—. Ni
  una está guardada aquí.

Así que el servidor **no puede** contarlo, y no se le deja adivinarlo: *un
número que no se puede calcular no se sustituye por otro*. Cualquier proxy —«el
último mensaje es del contacto», «hay conversación»— cuenta otra cosa, y esa
otra cosa fue justo la que mintió.

Lo que cuesta se dice entero: **hay que haber abierto Chats una vez en esta
pestaña.** Mientras no se abra, la mitad de chats es cero. Abierta una vez, el
número **se queda** al cambiar de pantalla, así que el caso de todos los días
—un asesor que trabaja en Chats y se va a Clientes un rato— está cubierto. Se
prefiere eso a un número grande y falso en todas las pantallas: **un contador
que miente es peor que uno que falta**, porque se mira de reojo y se da por
bueno. Y **no se persiste en `localStorage`**, a propósito: sería «lo último
que supo esta bandeja», que envejece sin avisar —leído el chat desde el móvil,
la pestaña seguiría con el número de ayer, que es este mismo fallo por otra
puerta—.

### `null` no es cero, y los tres sitios van por la misma función

`useChatUnreadStore.sinLeer` arranca en **`null`**, que significa «la bandeja
no ha hablado» — **no** «no hay ninguno». Con un cero de arranque no habría
forma de distinguir «todavía no sé» de «los leí todos», y las dos pintan lo
mismo —nada— pero por motivos distintos: de `null` **no puede** salir un conteo
de otra parte, y de cero sí sale un cero, que tampoco se pinta.

Los **tres** sitios que pintan este número van por `useChatsQueEsperan` —la
pastilla de «Chats» del menú, la campanita y el icono de la pestaña— y ninguno
lee `sinLeer` a pelo: un `null` pintado es un `0` que parece un dato. La regla
de qué es cero vive en `losChatsSinLeer` (`lib/insignia-del-favicon.ts`), pura y
probada, para que los tres digan lo mismo y no haya que afinarla en tres sitios.

### Sin un solo sondeo nuevo, y de dónde sale cada mitad

| | de dónde | con qué ritmo |
| --- | --- | --- |
| chats sin leer | la bandeja (`useChatUnreadStore`, en vivo con el socket) | en vivo |
| del equipo | el reloj del contador, que ya cuelga del layout | 15 s |

El del equipo sale **gratis**: `avisos` ya venía en la respuesta de
`sinLeerDelEquipoAction` —es lo que decide si suena— y hasta ahora se leía y se
tiraba. Un contador aparte habría sido un segundo reloj en **todas** las
pantallas de todo el mundo para contar lo que ya estaba encima de la mesa.

Y de ahí sale dónde vive el componente, que si no parece arbitrario:
**`BotonesDelBorde`**, porque es el único sitio que ya tiene el contador del
equipo. `useSinLeerDelEquipo` **no comparte estado entre llamadas**, así que
llamarlo otra vez desde el layout montaría un segundo `setInterval` de 15 s —o
sea, un sondeo nuevo—. El número del equipo baja por prop; el de chats lo lee el
componente del store; y `InsigniaDelFavicon` no pinta nada (`return null`).

Cuando esto trajo la otra mitad desde el servidor —la que se acaba de quitar—
viajaba en la vuelta del equipo para no montar un tercer reloj. Ese argumento se
queda como aviso: **la mitad de chats NO vuelve por el servidor**, ni siquiera
«gratis» en esa vuelta, porque el problema nunca fue el reloj sino que el
servidor no sabe qué está leído.

### Los dos números se cuentan en la misma unidad

Son **conversaciones, no mensajes**, los dos: los avisos del equipo se agrupan
por canal y los chats se cuentan por chat sin leer. Con uno en mensajes y otro
en chats la suma no significaría nada — sería un número que no se puede explicar
señalando la pantalla.

### El favicon no cambiaba: había OTROS iconos que lo pisaban

Es el tercer fallo del #838, y el que ningún banco de funciones puras podía
cazar: el número salía en el icono de la barra lateral de Edge, pero el favicon
de la pestaña seguía limpio. El PNG se dibujaba bien y se metía en su
`<link rel="icon">`… y no cambiaba nada.

La causa no está en el dibujo, está en cuántos iconos declara el documento. El
layout pone **tres** (`/favicon-48.png`, `/icon-192.png`, `/icon-512.png`) más
el `/favicon.ico` que Next emite por convención de fichero, cada uno con su
`sizes` y su `type`. **Con varios candidatos el navegador elige** —por tamaño y
por tipo, no por orden—, así que añadir el nuestro al final no ganaba nada: en
Edge y en Chrome seguía resolviendo `/favicon.ico`.

> **La única forma de que no lo pise nadie es que no haya ningún otro
> `rel="icon"`.** Al poner la insignia se **apartan** los del documento
> **cambiándoles el `rel`** —el original se guarda en `data-insignia-rel`— y se
> devuelven tal cual al quitarla. **Nunca se sacan del `<head>`** (ver la
> sección de abajo: eso rompía la navegación entera). El `apple-touch-icon` NO
> se aparta: es otro `rel`, lo usa iOS y además es nuestro respaldo para leer el
> icono de base.

Cuatro cosas que hay que mantener:

1. **Se aparta y se DEVUELVE**, no se borra ni se mueve. Sin pendientes vuelven
   los de siempre con su `sizes` intacto y en su sitio.
2. **Un `MutationObserver` vuelve a apartarlos si reaparecen.** Next reinyecta
   sus `<link rel="icon">` al navegar entre rutas, y entonces volvería a ganar
   el suyo sin que nadie lo note. No hay bucle: observa `childList` y apartar
   solo cambia un atributo.
3. **El `<link>` NUESTRO se REHACE en cada número**, no se le cambia el `href`.
   Cambiar el atributo a secas no siempre hace que el navegador vuelva a leer el
   icono; sustituir el nodo sí. Ese sí se puede sacar del `<head>`: es nuestro,
   React no sabe que existe.
4. **`rel~="icon"` es coincidencia por PALABRA.** Coge `shortcut icon` y deja
   fuera `apple-touch-icon` y `mask-icon`, que es justo lo que hace falta para no
   apartar el respaldo.

### Un nodo que pinta React no se saca del DOM desde fuera

/panel se quedaba **pegado**: se pulsaba Proyectos, Tickets, Diagramas… y la
vista no cambiaba, y salía «No se pudo cargar la pantalla» con
**`TypeError: Cannot read properties of null (reading 'removeChild')`**. Y
**volvía al recargar**.

No era /panel ni ninguna de sus pantallas: era la insignia de arriba. La
primera versión apartaba los iconos con `link.remove()`, y **esos `<link>` son
de React**: Next pinta los `icons` del `generateMetadata` del layout como
elementos *hoistables*, y el React que Next lleva dentro (el canario de React
19, `next/dist/compiled/react-dom`) los desmonta así:

```js
function unmountHoistable(instance) { instance.parentNode.removeChild(instance); }
```

Con el nodo fuera del documento `parentNode` es `null`. Cada navegación que
rehacía el `<head>` reventaba en la fase de commit: la transición se abortaba
—la pestaña se quedaba en la pantalla de antes— y saltaba el límite de error.
Volvía al recargar porque en cuanto hay un pendiente la insignia se vuelve a
poner; se veía en /panel porque ahí se salta de pestaña en pestaña y el
superadministrador casi siempre tiene algo pendiente. Quien no tuviera nada
pendiente no lo veía nunca, que es lo que lo hacía parecer aleatorio.

> **La regla: ningún código nuestro saca del DOM un nodo que React pintó** —el
> `<head>` incluido, que parece de nadie y no lo es—. Si hay que neutralizarlo,
> se le cambia un atributo y se le devuelve después. El nodo sigue en su sitio,
> así que cuando React lo desmonta encuentra su padre.

Y la pista para la próxima vez: **`Cannot read properties of null (reading
'removeChild')` es casi siempre alguien de fuera de React tocando un nodo de
React** —código nuestro, o una extensión como el traductor del navegador—, no
un fallo de la pantalla donde salta.

Lo prueba `scripts/banco-insignia.sh`, que monta una App con **ese mismo
React** (esbuild con `--alias` a `next/dist/compiled/react-dom`; el de
`package.json` es el 18 y no tiene `unmountHoistable`), pone la insignia y
navega tres veces. `MODO=roto` carga el `lib/insignia-del-favicon.ts` del #838
**sacado de git en un commit pinchado** y afirma el fallo: el mismo mensaje y
la pantalla que no cambia.

### Tres cosas del dibujo que no se ven mirando

1. **Se dibuja a 64 y lo reduce el navegador.** A 16 el círculo sale con los
   bordes escalonados y el dígito ilegible. Es lo que hace cualquier icono de
   la barra.
2. **`centro + radio + aro` tiene que caber en 1.** El primer intento daba
   **1,04** y la insignia salía **cortada por la esquina**. Lo cazó el banco, y
   lo comprueba como **invariante**, no como un número escrito a mano: si alguien
   mueve el radio, salta. Y `letra` va atada al radio (1,4 veces).
3. **El icono base se prueba en TRES sitios, y el orden importa.** Primero los
   `<link rel="icon">` que sigan en el `<head>`; luego los que la propia función
   **apartó** —sin esta mitad, el segundo número de una sesión no encontraría
   ningún icono de base, porque lo acabamos de quitar—; y de respaldo el
   `apple-touch-icon`, que sirve `/api/brand-icon` y es **del mismo origen
   siempre**. Hace falta porque el favicon de un reseller vive en **otro
   dominio**: sin CORS el navegador lo cargaría y *contaminaría* el lienzo, y
   `toDataURL` lanza. Con `crossOrigin="anonymous"` esa imagen **ni carga** —da
   `error`—, que es lo que se quiere: se detecta antes de dibujar y se pasa al
   respaldo.

Sin pendientes no se pinta un cero: se quita el nuestro y vuelven los del
documento. **Una insignia con un cero dentro sigue llamando la atención para
decir que no pasa nada**, que es lo contrario de para lo que está.

### Los tres casos se prueban, y el favicon en un navegador de verdad

Los dos bancos corren en **dos modos** —con la forma vieja y con la nueva— y el
modo roto reproduce el fallo, para que lo verde del nuevo signifique que se
arregló la causa y no que el caso no se ejercía.

- `lib/__tests__/pendientes-de-la-pestana-db.test.mjs` va contra Postgres y
  lleva **la consulta vieja escrita dentro**, literal. Con la cuenta vacía y la
  bandeja diciendo cero, el modo roto afirma que el servidor contaba 120 y
  ganaba —`99+`—; el nuevo, que da cero y no se pinta. Y con 577 conversaciones
  y tres sin leer: el roto dice `99+`, el nuevo dice `3`. Se levanta con
  `scripts/banco-pendientes.sh`.
- `lib/__tests__/insignia-en-el-documento.test.mjs` monta la página con los
  **mismos** `<link>` que emite el layout, en Chromium, y **decodifica el PNG**
  que acaba en el `<link rel="icon">`: rojo donde antes no había y en su esquina.
  El modo viejo —el `<link>` al final sin apartar a los demás— afirma que quedan
  cuatro iconos y que el documento resuelve `/favicon-48.png`, no el nuestro. El
  nuevo, que queda **uno solo** y es el nuestro. Se levanta con
  `scripts/banco-insignia.sh`.

Y verificado además contra el **documento servido de verdad** (`next start`
sobre el build): de partida el `<head>` declara cuatro iconos y resuelve
`/favicon.ico`; tras poner la insignia queda un solo `<link>`, es el nuestro, el
`apple-touch-icon` sigue intacto, y al quitarla vuelven los cuatro.

### Y la receta de `removeConsole` FALLA con acentos

Comprobando que los avisos sobreviven al build salió esto, y vale para toda la
regla de *el build borraba los avisos*: el minificador escapa los acentos, así
que buscar el texto tal cual **no lo encuentra aunque esté**:

```
grep -rl "no se pudo dibujar el numero sobre el icono" .next/static/chunks/   # segun como se escriba
```

En el paquete los acentos salen como `\xNN`. **Se busca por un trozo sin
acentos**, o un cero se lee como «el aviso no existe en producción» cuando lo
que no existe es esa forma de escribirlo.

## Chats: `contact.aliases` NO son todas las identidades

Al pedir los mensajes se pasaba solo `contact.aliases`, y ese campo **viene vacío
en la mayoría de los contactos**. Sin `remoteJidAlt`, sin `senderPn` y sin la
identidad con la que llegó el último mensaje, se pregunta por una sola forma del
contacto y la respuesta vuelve correcta y vacía.

Se usa `identidadesParaPedirMensajes(contact, jid)`, que se apoya en
`getChatIdentityCandidates`. En **todos** los caminos que pidan mensajes: abrir,
el reloj del chat abierto, el aviso de tiempo real, la precarga y el refresco de
fondo. Si se añade otro, va con esa función.

## Chats: de qué chat viene lo dice `remoteJid`, no el primer teléfono que aparezca

Un contacto subía un **estado** de WhatsApp y el vídeo salía **dentro de su
conversación**, con la IA contestándole («Veo que compartiste tu cuenta de
TikTok…»).

El aviso trae varios campos con identidades (`remoteJid`, `remoteJidAlt`,
`senderPn`, `senderLid`) y para decidir a qué chat pertenece el mensaje se
cogía **el primer teléfono que apareciera en cualquiera de ellos**
(`pickExplicitWhatsAppPhoneJid`). En un estado ese teléfono es el de **quien lo
publicó**, y viaja en `senderPn`. Así que `status@broadcast` se caía a
«alterno», el estado entraba como un mensaje 1:1 de esa persona, se guardaba en
su chat, tocaba su lead y despertaba a la IA.

Ya existía un filtro de estados (`isRegisterableContactJid`), y **llegaba
tarde**: cuando le tocaba mirar, el `status@broadcast` ya no era el jid
principal. Un filtro correcto detrás de un cálculo que ya se equivocó no filtra
nada, que es la misma familia de fallo que «nada que detecte un fallo puede ir
detrás de algo que falle».

Se vio en los registros de producción, y así es como se reconoce:

```
[WEBHOOK] I=… ; rJid status@broadcast rJidAlt …@lid
[UID=…][R=57319…@s.whatsapp.net] [SESSION] Usuario ya registrado con JID alternativo: status@broadcast
```

Ese `R=` es el número del autor del estado. Si `rJid` y `R=` no son el mismo
chat, algo está mal.

Dos reglas:

1. **El chat lo manda `key.remoteJid`.** Cuando ese jid es un grupo, un estado,
   una difusión o un canal, es el definitivo: ningún teléfono sacado de otro
   campo lo pisa. Esto también valía para los **grupos**, donde el mismo
   `senderPn` los colaba como chat privado y además dejaba sin efecto los
   `isGroupChat` de más abajo.
2. **Un estado, una difusión o un canal se descartan antes de todo**: antes de
   guardar el mensaje, de registrar el lead y de despertar a la IA. Va **después**
   de aprender el par `@lid` → número de los grupos, que eso sí interesa.

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

## Chats: el buscador también busca DENTRO de los mensajes, y por fecha

El buscador de la columna filtraba solo por nombre y número. Ahora, debajo de
las conversaciones que casan por nombre, sale «En los mensajes»: las
conversaciones con un mensaje que contiene lo escrito (sin tildes, por
prefijo: «cotiz» encuentra «cotización»; «FAC-8841» encuentra la factura) o
de la fecha escrita («15/09/2026», «2026-09-15», «15 de septiembre», «hoy»,
«ayer»), con el extracto y la hora. Pulsar uno abre esa conversación.

> **Lo pide `ResultadosEnMensajes` a `POST /api/chats/buscar`**, y las reglas
> son puras en `lib/busqueda-en-mensajes.ts` (la consulta de texto, la fecha,
> el extracto, qué ve un agente). La consulta vive en
> `lib/busqueda-en-mensajes.server.ts`.

Cinco cosas que hay que mantener:

1. **La ruta pone la puerta**: las cuentas son las de la bandeja
   (`lasCuentasQueVeLaBandeja`, hacia abajo) y cada línea pedida se comprueba
   con `resolveInstanceOwner` contra ellas. Una línea de otra cuenta se ignora.
2. **Un agente ve lo suyo y lo sin dueño (si puede tomarlo)**, filtrado en el
   SERVIDOR (`loQueVeUnAgente`), buscando su ficha por todas las identidades
   del resultado: filtrarlo en el navegador sería mandarle el texto ajeno.
3. **Dos ramas, cada una con su `LIMIT` dentro** (texto por el GIN, fecha por
   el índice de `messageTimestamp`), y después una fila por conversación con
   su mensaje más reciente. Nunca un `OR` entre las dos.
4. **El GIN (`chat_messages_busqueda_gin_idx`) se crea `CONCURRENTLY` y de
   fondo**, una vez por proceso; si quedó inválido se rehace, salvo que otro lo
   esté construyendo. Sin él la búsqueda funciona, más lenta.
5. **Lo borrado y los estados (`status@broadcast`) no salen**, y la fecha se
   lee en la zona del navegador (`desfase`). Solo se busca con 3 letras o una
   fecha.

Lo prueba `scripts/banco-busqueda-en-mensajes.sh`: la regla, un barrido y la
ruta de verdad contra Postgres (palabra, prefijo, fecha, borrado, línea ajena,
agente por su `@lid` e índice válido). `MODO=roto` lee `bf1a4af` y afirma que
no había ni ruta ni resultados.

## Chats: el filtro de canales tiene que sumar

En el desplegable de canales, «Todos» decía **614** y las filas de abajo sumaban
**469**. No es un redondeo: son 145 chats que **ninguna fila podía filtrar**.

Las dos cifras se calculan de sitios distintos. `channelCounts` cuenta por
`chat.instanceName`, o sea **todas** las líneas que aparezcan en los chats, y
«Todos» es su suma. Las filas, en cambio, salen de `channels` —las `Instancias`
de la cuenta y las de las cuentas vinculadas—. Si un chat llega con una línea
que no está en esa lista, entra en la suma y no tiene fila: se ve en «Todos» y
no se puede aislar.

Dos cosas:

1. **Toda línea que traiga chats tiene su fila.** `lineasSinFila` compara las
   dos listas y pinta las que faltan con su nombre crudo y el rótulo «Línea sin
   ficha». Así la suma cuadra siempre y no queda nada inalcanzable.
2. **Y lo dice la consola**: `[chats] hay chats de lineas que no estan en el
   filtro de canales`, con la línea, cuántos chats trae y las líneas que sí
   están en el filtro. Su presencia significa que a la cuenta le falta esa
   `Instancia` (borrada, un resto de `_V2`, una cuenta vinculada que ya no se
   trae), y es lo que hay que arreglar en los datos.

El desplegable lleva además su propio scroll acotado al hueco real
(`--radix-dropdown-menu-content-available-height`), que es la regla de siempre
para un menú con una lista dentro: la lista crece con las líneas de la cuenta.

Y en cuanto salieron esas filas se vio de dónde venían: `llamadas`, `AIZEN-BOT`,
`GRUPO_VERZAY_V2`, `VERZAY_ATENCION_wh`… o sea líneas borradas, restos con
sufijo `_V2` y los canales `_wh` / `_tg` / `_fb` / `_ig`. Las metía
**`refetchChatsManualAction`**: esa acción se ata **por línea**, pero su
respaldo llamaba a `getPersistedInboxChats({ userIds })` **sin
`instanceNames`**, así que devolvía la bandeja **entera de la cuenta** —todo lo
que esa cuenta tenga guardado desde siempre— en vez de los chats de su línea. Y
se cae ahí en **cada vuelta** del refresco de una línea Waha o Baileys, que a
propósito se quedan sin clave de Evolution (`resolverContexto`).

**Un respaldo devuelve lo mismo que devolvería el camino bueno, ni más.** Si la
acción es de una línea, el respaldo va acotado a esa línea. Los demás usos de
`getPersistedInboxChats` ya pasaban `instanceNames`; a este se le había pasado.

## Chats: la bandeja estaba topada en 300, y no lo decía

Una cuenta con **576 leads en una sola línea** abría Chats y su línea contaba
**290**. No faltaban por borrados ni por archivados: el `LIMIT` de
`getPersistedInboxChats` era **300**, y 290 es 300 menos los que sí estaban
borrados o archivados. Faltaba la mitad de las conversaciones **y nada lo
decía** — ni error, ni hueco, ni aviso.

Duele sobre todo donde la lista **solo** puede salir de nuestra base: las líneas
Waha y Baileys, los canales de credenciales, y cualquier línea cuando Evolution
no contesta. Con Evolution respondiendo el tope se disimulaba, porque los chats
venían de allí.

Dos cosas:

1. El tope es `TOPE_DE_LA_BANDEJA`, con nombre y motivo, no un número suelto
   dentro del SQL. **Vale 300**: es cuánto se LEE, y responde a una sola
   pregunta —cuántas conversaciones recorre de verdad una persona antes de
   buscar—. Estuvo en 1500 un rato, mientras el contador todavía salía de contar
   estas filas; en cuanto el número se sacó aparte, subirlo dejó de tener
   sentido. Cada fila de más es JSON que se descomprime, viaja y se convierte a
   objetos, y eso se paga en **todas** las cargas de Chats. Si 300 se queda
   corto para desplazarse, lo que toca es traer la página siguiente, no subir
   esto.
2. **Lo que se recorta, se dice**: `[chats] la lista viene al tope: N de M`. Va
   como `console.info` y no como `warn` a propósito, porque en una cuenta grande
   es lo esperado, no un fallo. Sirve para separar «esta cuenta es grande» de
   «faltan chats», que es la distinción que costó una sesión entera.

Y de paso, la forma de comprobarlo desde fuera: `/sessions` tiene un desplegable
**«Línea»** con los leads de cada una (`getLeadsPorLinea`). Ese número al lado
del de Chats es lo que delata un recorte.

### El número y la lista son dos cosas

Subir el tope no era la respuesta de fondo. **Nadie baja más allá de los
primeros chats**, así que la lista puede seguir acotada; lo que no puede estar
recortado es el **número**. Eran lo mismo porque el contador de cada canal se
sacaba contando las filas cargadas.

Ahora el número viene aparte, de `contarChatsPorLinea`: **un** `COUNT` sobre
`Session`, **sin tocar `chat_conversations` ni el JSON de `lastMessageRaw`**,
que es lo que obligaba a poner tope. Leer un número no cuesta lo que leer la
bandeja.

Cuatro cosas que hay que mantener:

1. **`COUNT(DISTINCT remoteJid)`, no `COUNT(*)`.** La bandeja mira las líneas de
   VARIAS cuentas a la vez (`allSessionUserIds`), y una misma línea puede tener
   la ficha del mismo contacto bajo más de un `userId` —pasa con las
   conversaciones viejas guardadas bajo el dueño anterior de la línea—. Contando
   filas, esa línea de 576 pasó a decir **1036**: el mismo contacto dos veces.
   Primero se quedaba corta, después larga; el número correcto es el de
   contactos distintos.
2. **Se restan las borradas y las archivadas**, o vuelve el fallo que ya se
   arregló una vez: limpiar cientos de chats y ver el número igual de alto.
3. **Se descuentan dentro de la consulta, con un `NOT EXISTS`.** Restar marcas
   por fuera no vale: una conversación borrada deja marca bajo todas sus
   identidades (`remoteJid`, `remoteJidAlt`, `senderPn`, el `@lid`), así que
   restaría hasta cuatro veces de más.
4. **El del servidor manda, pero nunca por debajo de lo cargado**
   (`Math.max`): puede haber conversaciones que WhatsApp devuelve y que todavía
   no tienen ficha. Y el navegador sigue descontando lo que el asesor acaba de
   borrar o archivar, para que el número baje al momento y no dentro de un
   minuto.

Y la forma de saber si un contador miente: **ponerlo al lado del de otra
pantalla que cuente lo mismo por otro camino.** El desplegable «Línea» de
`/sessions` es eso para Chats; que digan cifras distintas es lo que destapó
los dos fallos.

Si hace falta otro contador por línea, va por ahí: **un contador es un `COUNT`,
no un `length` de lo que se haya podido cargar.**

Y **un contador no puede costar**. Lo que hace esta consulta barata:

- Toca **solo `Session`**, por `userId` —primera columna de su índice único—,
  y acotada además por `instanceId`. Ni `chat_conversations`, ni el JSON de
  `lastMessageRaw`, que es lo caro de la bandeja.
- Las marcas de borrado se sacan **una vez, en un `WITH`**, y se cruzan con dos
  `LEFT JOIN` (hash). El primer intento fue
  `NOT EXISTS (… p.remoteJid = s.remoteJid OR p.remoteJid = s.remoteJidAlt)`,
  o sea **la misma trampa** que ya costó caro en
  `levantarMarcasSiElContactoEscribio`: un `OR` sobre dos columnas dentro de un
  correlacionado no usa índice y se ejecuta **una vez por sesión** — con 15.000
  leads, 15.000 búsquedas.
- Corre **una vez por carga de la pantalla**, dentro del `Promise.all` que ya
  estaba, así que no añade ni una vuelta de red.
- Y se mide: `[PERF] contarChatsPorLinea` sale si pasa de 300 ms.

### Un filtro que ofrece un número tiene que poder llegar a él

Con el número ya correcto quedaba lo peor de los dos mundos: el desplegable
ofrecía **«Ventas 574»**, se elegía, y la cabecera decía **290** — que es lo que
la lista tenía para enseñar. El número era cierto y la lista también; lo que no
podía ser es que no hubiera forma de llegar del uno a la otra.

**La respuesta no es tocar el número, es traer las páginas siguientes.**
`traerMasChatsDeLaLinea` las pide cuando la persona baja a menos de dos
pantallas del final (`onCargarMas`, colgado del mismo `requestAnimationFrame`
que ya medía el scroll). La primera carga sigue costando lo mismo.

Tres cosas que hay que mantener:

1. **El cursor es una FECHA, no una posición.** Con `OFFSET` se saltaban filas:
   la primera página se pide para **todas las líneas juntas** con un solo
   `LIMIT`, así que de una línea concreta pueden haber entrado 250 y no 300, y
   saltar 300 de esa línea se comía 50 conversaciones. Se pide «las anteriores a
   la más antigua que ya tengo de esta línea», que además aguanta que entren
   mensajes nuevos entre una página y la siguiente.
2. **El tamaño de página vive en `lib/bandeja.ts`**, no duplicado a cada lado.
   Lo usan la consulta (su `LIMIT`) y el navegador (para saber cuándo ya no
   queda nada: una página incompleta). Con dos números distintos se saltarían
   filas.
3. **La acción comprueba de quién es la línea** (`assertCanAccessTargetUser`
   sobre el dueño que resuelve `resolveInstanceOwner`), como cualquier otra que
   reciba un id. Y si una página falla **lo dice**: sin eso se ve como «la lista
   no sigue bajando», que no parece un error.

### Un contador cuenta lo mismo que enseña su filtro

Dos secuelas de sacar el número aparte, las dos del mismo despiste: **contar por
un lado y listar por otro.**

1. **El `COUNT` va acotado a las MISMAS líneas que la lista.** Sin pasarle
   `instanceNames`, contaba todas las que aparecen en `Session` —las borradas,
   los restos `_V2`, los canales `_wh`— y devolvió al desplegable las filas
   «Línea sin ficha» que se acababan de quitar del lado de los chats. Con
   número, eso sí: se elegía `VERZAY_ATENCION_wh`, prometía 18 y la lista salía
   con «No hay chats que coincidan con el filtro». **Un filtro que ofrece un
   número tiene que poder enseñar esas filas.**
2. **Dos «Todos» con números distintos, uno al lado del otro.** El del
   desplegable era la suma de las líneas (766) y el chip azul de la cabecera
   contaba las filas cargadas (462). Los dos ciertos, y por eso despistaba
   tanto.

   Se arregló en dos pasos, y el primero **no bastaba**: quitarle el número a la
   fila «Todos» del desplegable dejó el caso peor —el desplegable ofrecía
   «Ventas 574», se elegía, y el chip decía **290**—. Explicar que uno es el
   total de la línea y el otro lo cargado es tener razón y no arreglar nada:
   **son dos números para lo mismo, pegados en la pantalla.**

   Ahora el chip «Todos» dice **el total de la línea**, el mismo del
   desplegable; las filas que falten llegan al bajar. Las demás pestañas siguen
   contando lo cargado, y ahí sí es correcto: son estados de lo que hay delante
   (mías, archivadas, resueltas), no el tamaño de la línea.

   Y con los dos diciendo lo mismo, **la fila «Todos» del desplegable recupera
   su número**: los dos salen de `channelCounts`. Quitarlo fue el parche de
   mientras, no el destino. **Si vuelven a separarse se arregla la fuente, no se
   esconde el número**: un hueco donde antes había una cifra no explica nada, y
   el número es justo lo que se viene a mirar.

### Y «Todos» cuenta lo que la lista ENSEÑA: sin resueltas

Al resolver una conversación salía de «Todos» y el número no bajaba, ni
recargando (lo reportó un cliente). Las dos fuentes del número contaban las
resueltas: el `COUNT` de `contarChatsPorLinea` no miraba `resolved_at`, y el
navegador hacía `max(servidor, cargadas)` con las resueltas dentro — así que
aunque una fuente bajara, la otra lo tapaba.

> **«Todos» son las ACTIVAS: ni borradas, ni archivadas, ni resueltas.** La
> regla de resuelta es UNA, `estaResuelta` (`lib/total-de-todos.ts`): la usa la
> lista para esconder la fila y el número para no contarla, y el servidor la
> repite en SQL (marca y ningún mensaje posterior). Si se toca una, se toca la
> otra.

Tres cosas que hay que mantener:

1. **El número se corrige EN VIVO sin volver a preguntar** (`totalesDeTodos`):
   se recuerda si cada fila estaba activa la primera vez que se la vio **con su
   sesión puesta** —eso es lo que el `COUNT` dio por hecho— y cada cambio
   posterior suma o resta uno. Resolver baja, reabrir sube, archivar baja.
2. **La primera vez CON SESIÓN, no la primera a secas.** Las sesiones llegan
   segundos después que la lista; apuntar antes haría que una resuelta se
   restara dos veces.
3. **Los grupos van en un `UNION` con `COUNT DISTINCT`**, no en dos ramas
   sumadas: desde que un grupo tiene ficha, las dos ramas lo contaban.

Lo prueba `scripts/banco-total-de-todos.sh` contra Postgres con las funciones
de producción; `MODO=roto` corre la consulta y la cuenta de antes y afirma que
el número no baja.

### Y la pantalla tiene que ENTERARSE: resolver se pinta en memoria, por id

Con lo de arriba en producción, el número seguía sin bajar al resolver: el
`COUNT` y la cuenta eran buenos, pero **ninguna de las tres formas de resolver
—«Acciones», el menú de la fila y el lote— escribía la marca en la pantalla**,
así que fila y número esperaban al reloj de sesiones (60 s). Y reabrir limpiaba
solo la llave GLOBAL del contacto, mientras la lista lee la de su línea
(`linea::numero`): la reabierta no volvía. Desde fuera: «solo cambia al
recargar».

> **Resolver y reabrir llaman a `marcarResolucion(ids, resuelta)`**
> (`conLaResolucion`, `lib/total-de-todos.ts`), que toca TODAS las llaves de la
> sesión por su `id`. `resolverSesionesAction` devuelve `resueltos` para marcar
> solo las que salieron bien. **Si se añade otra forma de resolver o reabrir, va
> por ahí.** Y el menú de la fila resuelve la sesión de SU línea, no la global.

El banco puro no lo cazaba porque releía las marcas de la base: **probar la
cuenta no prueba que la pantalla se entere.** Lo cubre
`scripts/banco-todos-en-chats.sh`, sobre la página servida: resolver desde
«Acciones», recargar, reabrir y resolver desde la fila, exigiendo número = filas
en 8 s. `MODO=roto` con un `.next` de `5288fa2` reproduce 6 fallos.

### Y el número sale de LAS FILAS DE LA LISTA, no de las fichas

Después de #926 y #928 seguía sin cuadrar, y en todas partes: Rca «Todos 32» y
al seleccionar todas salían 16; Zoo Shop 26 y 24; un cliente con 14 conversaciones
veía 34; Multigama sin número. Y fallaba en la cuenta que acababa de **importar
historial**.

La causa era de fondo, no un filtro de más: el número era un `COUNT` sobre
`Session` —los **leads** de la línea— y la lista enseña **conversaciones**
pasadas por los filtros del navegador. Un historial importado deja las dos a
medias, y cada hueco caía en esa grieta: la conversación guardada por el `@lid`
con la ficha por el número y el archivado puesto bajo el `@lid` (el `COUNT` no
lo veía archivado), fichas cuya conversación es solo una reacción (la lista no
las enseña), el mismo contacto con el sufijo de dispositivo (dos fichas, una
fila), conversaciones sin ficha (la lista sí, el `COUNT` no), y lo que un
**agente** no ve (el número lo contaba igual). Medido en el banco con el código
de antes: «Todos 12» sobre **9 filas**; a un agente, 27 sobre 17.

> **Qué sale bajo «Todos» lo decide UNA función,
> `lasFilasDeLaLista` (`app/(root)/chats/_components/lo-que-ve-todos.ts`,
> pura)**: los repetidos, el orden, la marca elegida por línea, borradas,
> archivadas, resueltas y lo que ve un agente. La usan el número del navegador
> (`channelCounts`, sobre `contacts`, que ya lleva el recorte del agente), la
> barra lateral (`ordenDeLaLista`, `claveEnLaLista`) y **el servidor**
> (`lib/conteo-de-todos.server.ts`), que pasa por ella la bandeja ENTERA —la
> misma consulta de la lista sin ventana ni tope, `leerLaBandejaEntera`—.

Y el reparto (`totalesDeTodos`): **si la línea está ENTERA en la pantalla
—tiene al menos tantas filas como dice el servidor— manda lo cargado, sin
discusión**; si le faltan páginas, el del servidor corregido con lo que cambió
después. Antes de que lleguen las sesiones manda el servidor: sin ellas no se
sabe qué está resuelto.

Tres cosas más que salieron por el camino y hay que mantener:

1. **La lista no pasaba de la primera página.** El cursor viajaba en SEGUNDOS y
   `traerMasChatsDeLaLinea` hace `new Date(anteriorA)`: caía en 1970, la
   página salía vacía y la línea se daba por terminada. Va en milisegundos
   (`epochToMs`), pide con las **mismas cuentas** que la primera página, la
   ventana de candidatos se recorta **desde el cursor** (sin eso lo que quedaba
   fuera de la ventana no llegaba nunca) y solo una página **vacía** dice que
   no queda nada — una corta no, porque se descarta lo borrado después de
   escoger candidatos.
2. **«Seleccionar todas» marca lo CARGADO**, no el total: es `filtered`. Con la
   línea entera coinciden; con una línea a medias hay que bajar para que entren
   las filas que faltan.
3. **Toda línea del menu de canales tiene número, aunque sea 0.** Una línea sin
   número no dice si está vacía o si falta contarla.

Lo prueban `scripts/banco-total-de-todos.sh` (contra Postgres: tres líneas con
historial importado, resueltas, archivadas, borradas revividas, un contacto en
dos líneas, más de una página y un agente; exige número = total real de la
lista paginada hasta el final) y `scripts/banco-todos-como-la-lista.sh` (la
página servida: pastilla, «seleccionar todas», el menú y cada línea elegida).
Los dos en dos modos; el roto afirma el `COUNT` de leads y el cursor de antes.

## Chats: la bandeja NO espera a crear las fichas que faltan

Chats se quedaba en «Cargando conversaciones» varios minutos, y cada día más.
La página espera en su `Promise.all` a las preferencias de la bandeja
(`getChatConversationPreferencesForAssociatedAccounts`), y estas esperaban a
`crearFichasQueFaltan`: la consulta que crea la ficha (`Session`) de cada
conversación que no la tiene. Medido en producción: **183 a 290 segundos** en
las cuentas grandes, creciendo con `chat_conversations`.

> **La revisión de fichas corre DE FONDO** (`lanzarLaRevisionDeFichas`): la
> bandeja contesta sin esperarla, y las fichas que falten salen en la vuelta
> siguiente de sesiones. Una sola revisión a la vez por juego de cuentas, con el
> mismo freno de 5 min, y si tarda más de 5 s o falla, se dice en la consola.

Y la consulta se reescribió: las conversaciones sin ficha se calculan con CTEs
`MATERIALIZED` y un anti-join por hash sobre `(jid, cuenta, línea)` en vez de un
`NOT EXISTS` correlacionado con `regexp_replace` por fila. Medido en las cuentas
más grandes: de ~98 s a ~0,5 s. Sigue respetando la lápida de chats eliminados.

**Nada que la pantalla necesite para pintarse espera a una tarea de
mantenimiento.** Si se añade otra reparación al abrir la bandeja, va de fondo.

Lo prueba `scripts/banco-carga-de-chats.sh`, contra Postgres: con
`chats_eliminados` cogida desde otra conexión (como una consulta lenta), la
bandeja contesta al momento y las fichas se crean al soltarla, sin repetidas y
sin revivir un lead eliminado. `MODO=roto` empaqueta `50adf03` y afirma que la
bandeja se quedaba esperando.

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
