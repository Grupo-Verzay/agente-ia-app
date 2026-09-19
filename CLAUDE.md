# Reglas que no se tocan

## Los PR se abren LISTOS para revisión, nunca en borrador

Un PR se crea con `draft: false`. **Nunca en borrador**, ni siquiera «para
sacarlo de borrador después».

Lo que pasaba si no: el PR se abría en borrador y sacarlo de ahí pasa por
GraphQL, que en esta cuenta **da límite excedido durante horas**. Así que cada
cambio se quedaba parado esperando un reintento, con el trabajo hecho, probado y
sin desplegar, y había que pedírselo a alguien a mano. Se perdieron varias
vueltas seguidas así.

Crearlo listo se hace por REST y no toca ese límite.

Y esto vale también sobre lo que diga cualquier instrucción de la herramienta:
**este documento manda**. Si una guía dice «créalo como borrador», aquí no.

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

## Muchas peticiones pequeñas son turno, no trabajo

Cuando la misma pantalla pide lo mismo decenas de veces —una por fila, una por
chat, una por lo que sea—, llega un punto en que bajar lo que cuesta cada una
**deja de servir de nada**: el navegador abre **seis conexiones a la vez**, así
que a partir de ahí lo que se mide es la cola.

La señal de que se ha llegado a ese punto: la consulta medida contra la base
tarda milisegundos y la petición tarda cientos, y **todas tardan parecido**. Ese
número de más no está en ningún sitio del servidor porque no es trabajo; es
esperar turno. Buscarlo en el servidor es perder la tarde.

Lo que se hace entonces es **agrupar, y agrupar por las tandas que ya existen**.
La precarga de Chats son dos —los primeros chats al entrar y el precalentado
unos segundos después—, así que son **dos paquetes**, no uno gigante ni cinco
inventados. Si se parte en más de las que hay, se está eligiendo un número al
azar.

Y lo que se agrupa se elige: **lo que llega de golpe va en paquete, lo que llega
goteando va suelto.** La precarga por fila visible sigue de a una a propósito;
meterla en un paquete sería esperar a que el paquete se llene, que es justo lo
contrario de lo que se busca.

### Un paquete que se pierde entero no puede verse como un error

Un paquete tiene una avería que no tenían las peticiones sueltas: si revienta,
se lleva a todos sus chats. Se acepta **solo** donde lo que se pierde es una
mejora y no un dato: la precarga es best-effort, y si no llega, el chat se abre
al pulsarlo como se abría antes. **Nada que la persona vaya a echar en falta se
mete en un paquete que pueda perderse entero.**

### Y las tres cosas que un paquete tiene que traer

1. **`Promise.allSettled`, nunca `Promise.all`.** Con `all` un solo rechazo tira
   las respuestas buenas que ya estaban resueltas. Cada cosa en su casilla, y la
   casilla dice **de quién es**: sin eso, quien recibe el paquete no sabe a qué
   fila pertenece cada resultado.
2. **Su propio plazo, por debajo del de quien consulta por dentro.** Escalonados,
   como el resto de plazos de Chats. Si se igualan, uno lento se come el paquete
   entero y tarda más que las peticiones sueltas que vino a sustituir.
3. **Tres estados, y `pendiente` NO es un fallo.** Lo que no llegó a tiempo
   **sigue corriendo detrás** y se persiste, así que la vuelta siguiente lo
   recoge ya de nuestra base — la regla de siempre, *agotar la espera no es
   tirar la respuesta*, aplicada a un paquete. Por eso quien lo recibe **no lo
   marca como intentado**: eso sería renunciar a él para toda la sesión. Un
   `rechazado`, en cambio, sí es firme y dice por qué.

## Dentro del servidor son turnos, no tandas

Cuando una petición atiende muchas cosas a la vez hay que acotar cuántas corren
en paralelo —el pool de Prisma es de **10 por proceso** y el proceso es uno, así
que cincuenta consultas simultáneas se comen los turnos de la lista y del chat
abierto, que son **mensajes**—.

El cómo acotar no es indiferente, y esta es la trampa:

```ts
// MAL: lotes que se esperan unos a otros
for (let i = 0; i < cosas.length; i += 5) {
  await Promise.allSettled(cosas.slice(i, i + 5).map(hacer));
}
```

Con lotes, **uno colgado retiene su lote entero** hasta el plazo, y los lotes de
detrás no llegan ni a empezar. Medido en el banco de pruebas: 12 chats con 2
colgados devolvía **4 listos y 8 pendientes**, cuando lo correcto son 10 y 2.

O sea: es el mismo mal que se acaba de quitar fuera —esperar turno en vez de
trabajar— reaparecido dentro. **Son N obreros tirando de una cola común**, no
lotes de N: el que se queda pillado retiene su sitio y los demás siguen
vaciando la cola. Y el resultado se guarda **por posición**, para que la
respuesta salga en el orden en que se pidió aunque terminen desordenadas.

La regla, corta: **si se acota la concurrencia, se acota con una cola, nunca con
lotes.**

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

### Y nueve ficheros no tenían NI UNA llamada a `currentUser()`

La regla de arriba estaba escrita y aplicada en 26 sitios. Lo que faltaba era
barrer: **Cotizaciones, las cuatro de Finanzas, Datos externos, la base de
conocimiento y Productos** recibían el `userId` del navegador y lo metían
directo en el `where`.

```ts
export async function deleteFinanceContact(id: string, userId: string) {
  await db.financeContact.updateMany({ where: { id, userId }, … });
}
```

**Una acción de servidor ES un endpoint.** No hace falta estar dentro de la
pantalla ni tener ningún permiso: con la sesión de cualquier cuenta y otro id,
se borran, se crean y se editan los datos de otra. Son **66 acciones** con el
hueco, y no solo de borrar — crear y editar estaban igual.

> **El id que llega del navegador no decide nada: se comprueba.** Va por
> `laCuentaDeLaAccion` / `exigirLaCuentaDeLaAccion` (`lib/cuenta-de-la-accion.ts`),
> que resuelve `currentUser()` y pasa el id pedido por `assertCanAccessTargetUser`.
> **Si se añade otra acción que reciba un `userId`, va por ahí.**

Seis cosas que hay que mantener:

1. **Es un ALCANCE, así que sin id pedido se cae a la fila EFECTIVA**
   (`ownerId ?? id`), nunca a la persona. Resolver la persona aquí es
   exactamente lo que rompió la cartera de clientes en el #783: un
   administrador que llega a su cuenta por `linked_accounts` no tiene
   `advisorRole` en su propia fila. Firmar es otra pregunta y va con la persona.
2. **Dos formas, y hacen falta las dos.** Unas acciones devuelven
   `{ success, message }` y otras el dato pelado. Con una sola, la otra mitad
   tendría que envolver todo en un `try`, y un `catch` que se olvida es un «No
   autorizado» que se ve como una pantalla vacía.
3. **El rechazo NO es mudo.** El caso típico no es un ataque: es una pantalla
   que manda el id equivocado. Sin el `console.warn` no hay forma de saber cuál.
4. **Lo público lo es a propósito y lo dice.** `getPublicCatalog` es la única
   que se queda sin guarda: la abren `/catalogo/[userId]` y `/c/[slug]`, dos
   páginas sin sesión, así que comprobar algo las tumbaría enteras. Solo salen
   productos `isActive`. **Se comprueba ANTES de guardar en bloque quién llama a
   cada acción**: un cron, el despachador o una página pública se caen con una
   guarda que espera cookies.
5. **Y se mira también lo que NO recibe ningún id.**
   `applyDefaultToolConfigsAllUsers` escribía en **todas** las cuentas de la
   plataforma y solo pedía tener sesión; no entraba en el barrido justamente
   por no recibir nada. Pide superadministrador de verdad, como
   `bulkSyncActiveClientSessions`.
6. **Un `where` sin dueño es el mismo hueco sin el id delante.**
   `updateProduct` iba con `where: { id }` a secas y descartaba el `userId` del
   formulario a propósito —correcto— pero entonces no quedaba nadie a quien
   preguntarle de quién era la fila. **El dueño sale de la fila, no del
   navegador**: se lee con un `findUnique` pequeño y se comprueba.

Y cómo se barre, porque buscar `userId` en la firma **no basta**: no lo ve
cuando llega dentro de un tipo con nombre (`input: FinanceContactInput`), ni
cuando los parámetros empiezan en la línea siguiente, ni cuando sale de un
`parse` (`const { userId } = listParams.parse(raw)`). Los tres casos aparecieron
en este barrido y los tres estaban abiertos. Se busca **por el cuerpo**
—`\.userId\b` entrando a un `where` o a un `data`— y no por la firma.

### Y la propia `assertCanAccessTargetUser` preguntaba por la PERSONA

La regla existía y estaba puesta en 26 sitios, y aun así tenía dentro el fallo
que este documento describe tres veces: **su última comprobación era el rol de
la PERSONA**, `isAdminOrReseller(actor.role)`.

Desde fuera: Yair —administrador de «Verzay | Atencion»— llenaba el formulario
de un ticket a nombre de un cliente de la casa, pulsaba Enviar y le salía
**«No autorizado»**; desde la cuenta madre, cuya fila sí tiene rol de admin, el
mismo formulario funcionaba. Menú abierto, puerta cerrada: la pantalla que le
ofrecía las cuentas ya preguntaba por la cuenta (`rolQueManda`) y la puerta de
detrás seguía preguntando por él.

Y el equipo **se crea con rol `user` y no cambia nunca**, así que ningún
administrador pasaba jamás por ahí.

Ahora pregunta por **`cuentaQueManda(actor)`**, igual que las acciones del
panel. Tres cosas que hay que mantener:

1. **El orden de las puertas no cambia.** Primero uno mismo, luego su dueño,
   luego las cuentas vinculadas y **al final** el rol. Eso mantiene baratos los
   caminos cortos —`cuentaQueManda` solo corre para lo que antes se rechazaba— y
   explica por qué el fallo se veía intermitente: a nombre de la cuenta madre sí
   funcionaba, porque `linked_accounts` lo salvaba **antes** de llegar al rol.
   Buscar «por qué a veces sí» sin ver esa rama es perder la tarde.
2. **Donde se compara un id, se compara contra `cuenta.id`.** La rama del
   reseller buscaba `resellerid: actor.id`, así que al administrador de un
   reseller se le caía el permiso sobre sus propios clientes. Es el mismo fallo
   dormido en la misma puerta, sin reportar todavía.
3. **Un `agente` no pasa, y eso se prueba.** `cuentaQueManda` le devuelve su
   propio id y su propio rol: participa, no manda. Y el administrador de una
   cuenta **cliente** tampoco gana nada — lo que se hereda es el **alcance de su
   cuenta**, no un permiso suelto.

El banco corre en **dos modos**, con la puerta vieja y con la nueva. La única
comprobación que cambia entre ellos es el fallo; todo el bloque de «esto no se
puede haber aflojado» pasa **igual en los dos**, y eso es lo que prueba que no
se abrió nada de paso. Sin el modo roto no se sabe si se arregló la causa o
algo parecido.

### Y si se recuerda para no repetirla, la llave son los DATOS que deciden

Una pantalla son decenas de peticiones y cada una resuelve desde cero quién eres
y a qué llegas. `currentUser()` son 2 a 4 consultas; `getAssociatedAccountIds`
es un `UNION` en crudo. Cincuenta veces lo mismo para la misma respuesta.

Se puede recordar unos segundos (`lib/cache-de-sesion.ts`), y lo único delicado
es **con qué llave**. La regla: **la llave son las cosas que deciden la
respuesta, todas, y nada más.**

De ahí salen dos llaves distintas, y la diferencia importa:

- **Quién eres** se decide con las **credenciales**: las cookies de sesión, el
  `impersonate_user_id` y el `active_account_id`. Que la llave sea la credencial
  es lo que hace que dos personas no puedan compartir entrada —la cookie es un
  JWT firmado y distinto por persona— y que **el conmutador de cuentas se
  invalide solo**: entrar escribe una cookie, salir la borra, y la petición
  siguiente calcula otra llave. No hay una lista de sitios que haya que
  acordarse de invalidar.
- **A qué llegas** se decide con los **ids**, no con la sesión.
  `getAssociatedAccountIds` solo mira `ownerId ?? id`, `sessionUserId` y el
  propio, así que la llave son esos tres. Con los ids dentro no puede haber
  cruce, y además se puede seguir llamando desde acciones donde no hay cookies
  que leer.

Tres cosas que hay que mantener:

1. **Se guarda la PROMESA, no el valor.** Dos peticiones que entran a la vez
   comparten una sola resolución en vez de lanzar dos. Es la mitad de la ganancia
   cuando la pantalla arranca de golpe.
2. **Un resultado recortado por un fallo NO se cachea.** Cuando la consulta de
   vinculadas falla se sigue con la cuenta activa, que es el lado seguro; pero
   guardarlo cinco segundos sería **propagar esa pérdida de acceso** a las
   peticiones de al lado, y eso se ve como un «No autorizado» suelto e
   irreproducible. La siguiente vuelve a preguntar. Lo mismo con un `null`: nunca
   se recuerda que alguien no ha entrado.
3. **El plazo es de segundos, y se sabe lo que cuesta.** Un cambio de rol o una
   cuenta deshabilitada tardan eso en notarse. Se acepta a sabiendas **porque lo
   que se recuerda es barato de equivocarse**; si algún día se cachea algo cuyo
   error sea caro, el plazo no es la respuesta.

## Las notas son de la PERSONA, no de la cuenta

Un administrador comparte unas notas con su equipo. Todo bien en `/notas`. Pero
esa misma gente abría **cualquier chat**, iba a la pestaña Notas y veía **todas**
las notas del administrador, también las que no había compartido.

La pestaña de un chat pintaba `<NotesClient userId={effectiveOwnerId} />` —el id
de la **cuenta**— mientras `/notas` pinta `user.id`, el de **quien mira**. Y del
otro lado nada lo corregía: `getNotes(userId)` usaba el id que llegaba del
navegador tal cual.

Dos cosas:

1. **Las pantallas piden las notas de quien mira.** En Chats se pasa
   `viewerUserId`, no el id de la cuenta.
2. **`notes-actions.ts` no comprueba el id que llega: lo ignora.**
   `elDuenoDeLasNotas(pedido)` resuelve `currentUser()` y devuelve **su** id;
   si el pedido era otro, lo dice en la consola. Aquí
   `assertCanAccessTargetUser` **no vale**: deja pasar al asesor hacia su
   dueño, que es justo el caso que hay que cerrar. Compartir es lo único que
   hace que otro vea una nota, y eso vive en `note_shares` —lo comprueban
   `getNote` y `updateNote`, cada una por su lado—.

Si se añade otra acción de notas que reciba un `userId`, va por esa función.

### Pero «de quién son» y «a quién le LLEGA» son dos preguntas

La regla de arriba cerró un agujero y abrió, sin querer, la duda contraria.
Compartir se hace **con una CUENTA** —el selector ofrece cuentas y
`note_shares.userId` guarda el id de una cuenta—, y la búsqueda se hacía con el
id de la **persona**. Así que:

- El **dueño** de la cuenta destino las veía: su id ES el de la fila.
- Su **administrador** entraba con el suyo, `note_shares` no lo conocía, y la
  lista le salía **vacía**. Ni error, ni aviso: simplemente no estaban.

Es el caso de Yair en «Verzay | Atencion». Y no se arregla ablandando
`elDuenoDeLasNotas`: si esa devolviera la cuenta, un `agente` abriría `/notas` y
vería **todas las notas privadas** de su dueño, que es justo el incidente de
arriba. Son dos preguntas y van en dos funciones:

| Pregunta | Quién la contesta | Con qué |
| --- | --- | --- |
| ¿De quién SON estas notas? | `elDuenoDeLasNotas` | siempre la **persona** |
| ¿A quién le LLEGA un compartido? | `identidadesQueRecibenCompartidos` (`lib/notas-compartidas.ts`, puro) | la persona **y** su cuenta si es su `administrador` |

Un **`agente` no hereda**, a propósito: participa en lo que le asignen, y una
nota compartida con la cuenta no se le asignó a él. Es el mismo reparto de
`cuentaQueManda` y de `canManageWorkspace`.

Y es puro, no `cuentaQueManda`, porque aquí solo hace falta el **id** de la
cuenta —que ya viaja en la sesión— y no su rol, que costaría una consulta. Es el
mismo motivo por el que `rolQueAbrePuertas` se escribió puro al lado del suyo.

Cuatro cosas que hay que mantener:

1. **Los cinco lectores de `note_shares` van por ahí**: la lista, abrir, editar,
   fijar y ordenar. Con uno fuera, la nota sale en la lista y al pulsarla dice
   «No autorizado», que es peor que no verla.
2. **Entre dos filas para la misma nota gana la que MÁS deja hacer.** Puede
   haber una compartida con la persona y otra con su cuenta; quitarle la edición
   por tener además una de lectura sería un permiso que cambia según por dónde
   se mire.
3. **Y sale UNA vez.** El `DISTINCT ON (n.id)` de `getSharedNotes` es por eso, y
   obliga a que el orden de la lista —fijadas arriba, luego el orden propio— vaya
   en la consulta de fuera.
4. **Lo que ya es suyo no entra en «compartidas conmigo».** Con la cuenta
   dentro, quien comparte una nota propia con su propia cuenta la vería en las
   dos listas. Antes no podía pasar, porque compartir con uno mismo está
   prohibido.

**Fijar y ordenar pasan a ser de la CUENTA** cuando la nota llegó por ella: se
escriben sobre su fila, así que el dueño y sus administradores ven el mismo
orden. Es coherente con que el compartido sea de la cuenta, y es lo que ya
pasaba entre dos pestañas del dueño.

**Proyectos NO tiene este fallo**, y conviene saber por qué para no «arreglarlo»:
`project_shares` también guarda la cuenta, pero `getAuth()` de
`project-actions` resuelve `user.ownerId ?? user.id`, o sea **ya la cuenta**.
Comprobado en banco con las acciones reales: el administrador ve el proyecto
recibido, y el agente también lo ve sin poder trabajarlo — que es lo que la
sección de Proyectos compartidos ya decía.

## El equipo entra por su cartera, no por su rol

Un asesor del equipo con la pestaña concedida abría Panel › **Instancias** y
Panel › **Analíticas** y le salía **«Acceso Denegado»**. Las dos pantallas
pedían rol —`isAdminOrReseller` una, `isAdminLike` la otra— y ese asesor no lo
tiene ni lo va a tener: lo que tiene son **clientes asignados**.

La cartera ya existía y ya decidía qué ve en Clientes: `advisor_clients`. Lo
que faltaba era usarla en las demás. Ahora es **una sola función**,
`clientesDelAsesor(persona)` (`lib/clientes-del-asesor.ts`):

- `null` = sin límite propio (admin, super admin, reseller: cada uno se acota
  por su regla de siempre).
- `[]` = no le asignaron ninguno → «No autorizado».
- una lista = **esos y solo esos**.

La usan Clientes, Instancias (`getClientsWithBilling` y `assertBillingScope`,
que es la llave de todos los cambios de facturación) y Analíticas. **Si se
añade otra pantalla por cliente, va por ahí**, y no volviendo a pedir rol: eso
es lo que dejó a esta gente fuera.

Tres cosas que hay que mantener:

1. **Quien decide es la consulta, no la pantalla.** `/panel/client-billing` ya
   no comprueba el rol: pinta lo que la consulta le devuelve y enseña
   «Acceso Denegado» solo si esta dice «No autorizado». Así la pantalla no
   puede abrir de más que la consulta.
2. **Analítica va con Clientes**: quien no es admin ve las métricas de **su**
   cartera (`getAnalyticsDeMiCartera`, la misma tarjeta que ya usaba el
   reseller), no las de la plataforma. El cálculo se separó de la consulta
   (`metricasDeLaCartera`) justo para eso: cambian los clientes, no las cuentas.
3. Lo que es **de la casa** sigue siendo de la casa. Al abrir esta pantalla a
   más gente, `bulkSyncActiveClientSessions` —que toca las conversaciones de
   TODOS los clientes activos y solo pedía sesión— pasó a exigir admin. Cuando
   una pantalla se abre, se repasa qué acciones quedan a su alcance.

Y en **Proyectos**, el mismo reparto: un agente ve los que tienen que ver con
él —los que creó, los que lleva y aquellos en los que está
(`filtroDeProyectosVisibles`)—, no el trabajo entero de su dueño. Vale para la
lista y para abrir un tablero por su id. Diagramas ya lo hacía por su cuenta
con `visibility` (privado / lectura / edición).

## El administrador de una cuenta actúa POR la cuenta

Dentro de un equipo hay dos papeles: el `agente`, que atiende lo que le asignan,
y el `administrador`, que es la mano derecha del dueño. El segundo tenía el
nombre y nada más.

La causa es siempre la misma: **cada pantalla preguntaba por la persona**. Y la
persona se crea con rol `user` y sin nada a su nombre, así que:

- En **Clientes** le salía «No autorizado» hasta que alguien le asignaba los 61
  clientes uno a uno; y aun asignados, en el menú de la fila solo le quedaba
  «Ingresar» —Editar, Módulos, Asignar a y Eliminar piden rol de admin o
  reseller, y él no lo tiene ni lo va a tener—.
- En **Equipo** la consulta buscaba `owner_id = <su id>` y le devolvía el equipo
  vacío: el equipo cuelga de la cuenta, no de él. Por eso «Asignar a» contestaba
  «Cliente no encontrado».
- En **Analíticas** caía en la cartera personal, que está vacía, y le salía
  «Acceso Denegado».
- En el **Perfil** y la barra lateral le salía «Plan Básico» dentro de una
  cuenta Enterprise: el plan lo paga la cuenta, y su fila conserva el de por
  defecto para siempre.

La pregunta se hace **una sola vez y en un solo sitio**: `cuentaQueManda`
(`lib/cuenta-que-manda.ts`) dice por qué cuenta actúa alguien —él mismo, o su
cuenta si es su `administrador`—, y con eso se decide el alcance. `requireOwner`
de Equipo devuelve ya el id y el rol de la CUENTA, que es de quien cuelga todo
lo de esa pantalla.

Cuatro cosas que hay que mantener:

1. **El rol NO se hereda.** `user.role` sigue siendo el suyo en todo lo demás.
   Escribirlo en `currentUser()` habría convertido a cada administrador en super
   admin de la plataforma entera. Lo que se hereda es **el alcance**, y solo
   donde se pregunta por la cuenta. El plan sí viaja con las credenciales del
   dueño, porque es de la cuenta.
2. **Enseñar el botón no es abrir la puerta.** `currentUserRol` decide qué se
   pinta; quien decide de verdad es `lib/gestion-de-clientes.ts`, y lo comprueban
   Editar, Módulos, Eliminar y Asignar cada una por su lado. Si se añade otra
   acción sobre un cliente, va por ahí y no volviendo a pedir rol.
3. **Y se pregunta por el cliente, no solo por quién llama.** Antes bastaba con
   ser administrador de cualquier cuenta para repartirle módulos a cualquier
   cliente de la plataforma, y un reseller podía editar la ficha de uno que no
   era suyo. Es el H02 de la auditoría otra vez.
4. **Un `agente` no pasa.** Es el mismo reparto de `canManageWorkspace`:
   participa, pero no manda. A él se le pasa una cuenta para que entre a
   arreglarla, no para que la administre.
5. **Ninguna pantalla del panel vuelve a pedir rol.** Quién ve cada pestaña ya
   lo decide `apartadosDelPanel`, con los permisos que le dio su cuenta en
   Equipo. Las veinte páginas de `/panel` lo preguntaban otra vez por su cuenta
   —`isAdminLike(user.role)`— así que el menú le enseñaba «Pagos» y
   «Resellers» y la página le contestaba «Acceso Denegado»: menú abierto,
   puerta cerrada. Todas preguntan ya por `cuentaQueManda`. **Si se añade otra
   pestaña al panel, va igual.**

### Y la ACCIÓN de detrás, también

Arreglar las páginas no bastó: la puerta se había movido una capa más abajo. La
página de Suscripciones abría —pregunta por la cuenta— y
`getAllSubscriptionsAdmin` contestaba con la lista vacía, porque seguía
preguntando `isAdminLike(user.role)`, o sea por la **persona**. Igual en
Reseller, Conexión, Enlaces de registro, Evo y el reparto de licencias. Desde
fuera es peor que un «Acceso Denegado»: la pantalla se pinta entera y sale
vacía, y parece que no hay datos.

Se pregunta con **`rolQueManda(persona)`**, que es
`(await cuentaQueManda(persona)).role` en una línea. Sin él eran dos líneas por
sitio, y por eso a veintitantas acciones se les quedó el `user.role` de antes.
**Ninguna acción del panel pregunta por `user.role`.**

Y donde además se compara un id —«¿es este reseller el que pregunta?»— se
compara contra **`cuenta.id`**, no contra `me.id`: al administrador de un
reseller se le caía el permiso sobre sus propios clientes.

### El caso que lo destapó: Rendimiento de Chats

Dos pantallas iguales lado a lado y en una faltaba un recuadro. Yair —
administrador de la cuenta de la casa— abría Analíticas y veía la plataforma
entera, pero no el bloque de vigilancia: `leerLaVigilancia` preguntaba
`isSuperAdmin(user.role)`, por la persona, y el equipo se crea con rol `user`.

Ahora pregunta por `cuentaQueManda`. Eso **no** abre el bloque a cualquier
administrador —el de una cuenta de cliente actúa por una cuenta que no es
`super_admin`, así que sigue sin ver nada— y el WhatsApp de la vigilancia sigue
saliendo solo hacia la cuenta de superadministrador, que se decide aparte en
`elSuperAdministrador`.

**«Superadministrador» en una consulta es la CUENTA, no la persona.** Es la
misma regla de arriba: el rol no se hereda, el alcance sí.

Y de paso: **de un reseller sale su cuenta principal, no su cartera**. Sus
clientes los administra y los factura él; que aparecieran en la lista de la
plataforma llenaba la pantalla de cuentas ajenas y dejaba repartir lo que no se
debe. `clientesDeLaCuenta` usa el mismo criterio que ya usaba `/panel/clientes`
(`excludeResellerClients`), por los **dos** caminos con los que se vincula un
cliente a un reseller: `demoResellerId` y la tabla `reseller`. Que las dos
listas digan lo mismo es la gracia: no se puede repartir lo que no se ve.

## Una línea muerta no tiene filas: se cuenta desde `Instancias`

Conexiones dice si el QR está enlazado y si el Robot está encendido. Las dos
cosas pueden estar en verde y la línea no contestar nada —el webhook no llega,
la sesión de Waha está colgada, el número está baneado—, y eso desde fuera se
ve como «la IA dejó de responder». **Actividad de instancias** (Analíticas,
solo superadministrador) lo dice de un vistazo con lo único que no se puede
fingir: si pasaron mensajes.

Rojo = no entró nada. Amarillo = entran y la IA no contestó ninguno. Verde =
entran y contesta. **Las verdes no se listan**: una tabla con las cincuenta
sanas dentro esconde las tres que fallan.

Y la regla que sostiene la tarjeta entera:

> **El universo sale de `Instancias`, nunca de los mensajes.** Agrupando
> `chat_messages` por línea, una línea sin un solo mensaje **no tiene ninguna
> fila** y no aparece en el resultado: las rojas —lo único que esto existe para
> encontrar— desaparecerían justo del conteo que las cuenta. Se parte de las
> líneas y los mensajes se pegan con un `LEFT JOIN`; sin mensajes, ceros, y el
> cero **es** el dato.

Es la misma familia que *un contador es un `COUNT`, no un `length`*: el número
no puede salir de la lista de lo que se pudo cargar.

Tres cosas más:

1. **El orden de las dos preguntas no es intercambiable.** Primero «¿entró
   algo?» y después «¿contestó la IA?». Al revés, una línea muerta —que tiene
   cero respuestas igual que una amarilla— saldría amarilla, «recibió y no
   contestó», que es lo contrario de lo que pasa.
2. **Los grupos entran**, y no contradice la regla del CRM: esto no cuenta
   leads, cuenta si pasan mensajes. Un mensaje de grupo prueba que la línea
   vive igual que cualquier otro, y filtrarlo pintaría de rojo una línea sana.
3. **Seguimientos, recordatorios y campañas NO llevan `sentByAi`** —
   comprobado en el motor: ni `follow-up-runner` ni `reminders-runner` la
   escriben—. Así que suman en «escribieron personas» aunque no las escribiera
   nadie. No cambia el color, sí la columna, y la tarjeta lo dice en su pie. El
   día que el motor marque esos envíos, la columna mejora sola.

### Y para barrer por FECHA sin cuenta, un BRIN

Los cinco índices de `chat_messages` empiezan **todos** por `userId`, así que
una consulta de plataforma —«qué pasó en los últimos 7 días en todas las
cuentas»— no puede entrar por ninguno y acaba barriendo la tabla entera.

Lo primero que se probó fue lo que parecía obvio —guiar la consulta desde
`Instancias` con un `LATERAL`, para que cada línea usara
`chat_messages_user_instance_ts_idx`— y **salió peor**: 355 ms contra 435 ms
del barrido, y `Heap Blocks: exact=303191` para 293.000 filas, o sea **un
bloque por fila**. La tabla está ordenada por TIEMPO, no por línea, así que las
filas de una línea concreta están desperdigadas de a una por página. Un índice
que encuentra las filas no sirve de nada si hay que ir a buscarlas a 300.000
sitios distintos.

Lo que sí sirve es lo contrario: aprovechar ese orden. `messageTimestamp` va
pegado al orden físico —los mensajes se anexan según llegan; la correlación
medida es **1.0**— y eso es justo lo que un **BRIN** explota.

Medido en banco con 4M filas (720 MB de tabla, más de lo que hoy pesa la base
entera):

| | tarda | bloques leídos |
| --- | --- | --- |
| barrido, sin índice de fecha | 435 ms | 91.460 |
| guiada por `Instancias` (`LATERAL`) | 355 ms | 303.191 |
| barrido + **BRIN** | **103 ms** | **7.214** |

El BRIN ocupa **40 kB** —un btree de los que ya hay ocupa 325 MB— y se
construye en 0,8 s, así que no es de los que hay que justificar en espacio.

Dos cosas que hay que mantener:

1. **El parámetro va moldeado**: `make_interval(days => $1::int)`. Prisma manda
   el parámetro sin tipo y `make_interval` solo acepta `int`; sin el molde la
   consulta puede caer con «no existe la función». Comprobado además que con el
   parámetro sin tipo **sigue entrando por el BRIN**, también en la quinta
   ejecución, que es donde Postgres puede caerse a plan genérico.
2. **Si vuelve a hacer falta barrer por fecha, se mira este índice antes de
   inventar otro.** Y si algún día los mensajes dejaran de insertarse por orden
   de llegada, la correlación se rompe y el BRIN deja de servir: entonces hay
   que volver aquí, no añadir un btree encima.

Y una advertencia de sintaxis que costó dos errores de compilación: **dentro de
un `$queryRaw` no puede haber acentos graves**, ni siquiera en un comentario
SQL. Cierran el template literal y el fichero deja de parsear.

## Renovación mensual: una columna que se pisa no tiene historia

Los ingresos mensuales dicen cuánto entró. Lo que no se veía es **si se está
fugando gente**: la cuenta que no paga se desactiva y al mes se elimina, y uno
se enteraba mirando cuenta por cuenta.

La medida es del último mes **cerrado**: de las cuentas cuyo vencimiento caía
en él, cuántas siguieron. El mes en curso va a medias —quien vence el 28
todavía no ha tenido ocasión— y medio mes siempre parece otra cosa de lo que
fue; es el mismo criterio con el que la vigilancia juzga ayer y no hoy.

**Y el dato histórico NO existía.** `UserBilling.dueDate` es una sola columna
que se pisa: al cobrar, `setUserBillingDueDateInternal` la mueve al mes
siguiente y la fecha vieja desaparece. Se miraron las otras fuentes posibles y
ninguna sirve:

| Dónde | Por qué no |
| --- | --- |
| `FinanceTransaction` | `createPaymentTransaction` **se salta la fila** si el cliente no tiene cuenta de finanzas por defecto. Y es el módulo de finanzas del propio cliente, no un registro de cobros de la plataforma. |
| `UserBilling.lastPaymentAt` | Una columna más que se pisa: solo recuerda el último pago. |
| `UserSubscription` | Solo se crean filas en el alta autogestionada (`user-subscription-actions`), no en las renovaciones. |

O sea que del estado de hoy se puede sacar **quién no renovó** —su vencimiento
se quedó clavado en su mes— y **no** el porcentaje, porque falta el
denominador. Y al mes hasta esa mitad se borra sola con la cuenta.

Así que hay una tabla, `renovaciones_mensuales`, de la App y con
`CREATE TABLE IF NOT EXISTS`. **Ni una columna nueva en `UserBilling`**: esa
tabla es del backend y añadirle columnas desde aquí es lo que reventó el #360.

Cuatro cosas que hay que mantener:

1. **Se anota desde el trabajo DIARIO de facturación**, no al abrir la
   pantalla. La cohorte de un mes hay que cogerla mientras sus cuentas todavía
   tienen el vencimiento dentro; si solo corriera al abrir el panel, un mes en
   que nadie entrara se perdería entero y no hay forma de recuperarlo. Y no
   puede tumbar el job —cobrar y suspender es lo que importa— pero **tampoco es
   mudo**: escribe su línea en el registro del job.
2. **Sin clave foránea, y con el nombre y el correo COPIADOS dentro.** La
   cuenta morosa se elimina al mes; si la fila se fuera con ella, el mes pasado
   perdería justo a los que se fueron, que son los que la tarjeta viene a
   enseñar. Comprobado en el banco: borrada la cuenta, la fila sigue con su
   nombre y su correo.
3. **`renovoEn` se SELLA y no se deduce al leer.** De una cuenta ya borrada no
   hay `dueDate` que mirar, así que quien renovó y luego se dio de baja por
   otra cosa contaría como fuga. Y el `ON CONFLICT` del anotado diario
   **no lo toca**: una vez sellado, sellado.
4. **Quien paga tarde cuenta igual.** El que vence el 31 y paga el 2 del
   siguiente renovó su mes, así que el sellado mira el mes en curso **y el
   anterior**. La fecha del sello no tiene que caer dentro del mes.

### Y un mes sin cohorte completa NO tiene porcentaje

Es la parte que no se puede ablandar. Un mes anterior a que empezara a
anotarse tiene a los que no renovaron —deducidos de su vencimiento clavado— y
le faltan los que sí. Dividir con eso da **0 %**, que es el peor número
posible: parece una fuga total y es un dato que no existe.

Ese mes se marca `parcial` y `porcentaje` sale **`null`**, y la tarjeta pinta
«Todavía no se puede medir» con el motivo al lado. La lista sí se enseña, que
esa es cierta. Es la regla de *un número que no se puede calcular no se
sustituye por otro*, la misma que ya costó un WhatsApp diciéndole a una
clienta «999999999 de -1 créditos».

Lo mismo con cero cuentas: no se divide entre cero, sale `null`.

**Se sabe desde cuándo se anota** mirando el `MIN("anotadoEn")` de la tabla. Sin
eso no se puede distinguir «este mes no venció nadie» de «este mes no lo
vimos», que es la distinción entera de esta tarjeta.

### Los extremos del mes, con el final EXCLUSIVO

`extremosDelMes` devuelve del día 1 a las 00:00 al día 1 del mes siguiente, y
el final no se incluye. Así da igual que el mes tenga 28, 29, 30 o 31 días y no
hay que contarlos: calculando un «último día» a mano, febrero y los meses de 31
se equivocan por un día, y ese día es el que más vence. Probado con febrero
normal y bisiesto, con 30 y 31, y con diciembre, que cruza de año —igual que
`ultimoMesCerrado`, que en enero tiene que devolver diciembre **del año
anterior**—.

## Proyectos: medir el trabajo, y las tres cosas que no estaban guardadas

Para saber cuánto trabajo lleva cada cliente y cada persona hacían falta tres
datos, y **dos de los tres no existían**. Conviene saber cuáles antes de tocar
nada:

| Dato | ¿Estaba? |
| --- | --- |
| A qué **cuenta** se le dedica una tarea | **No.** `tasks` parece tenerlo y no lo tiene: `ownerId` es la cuenta dueña de la agenda, y `sessionId`/`contactJid` son un contacto de WhatsApp, un lead. Usar cualquiera de los dos daba un número que parece bueno y mide otra cosa. |
| **Quién cerró** una tarea | **No.** Los dos caminos escribían `status: "done"` y nada más; quién lo hizo se sabía en ese instante y se tiraba. **Y no vale `assignedToId`**: un administrador cierra tareas de otros y desde el tablero puede mover cualquiera, así que mediría por quien no lo hizo. |
| Quién **creó** un proyecto | **Sí**, `Project.createdById`. Lo que faltaba era resolver el nombre: `loadPeople` solo miraba al responsable y a los miembros. |

Todo lo nuevo vive en `task_work`, tabla de la App con
`CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. `tasks` y `projects` son
del BACKEND —lo dice `docs/db-migrations-ownership.md`— y añadirles columnas
desde aquí es lo que reventó el #360.

### Cerrar pide el tiempo, y los caminos son DOS

Son `completeTaskAction` (el botón de Tareas) y `moveProjectTaskAction` con
`status: "done"` (arrastrar a «Hecho» en el tablero). **Si uno lo pidiera y el
otro no, bastaría con arrastrar para saltárselo** y el reparto contaría unas
tareas sí y otras no, que es peor que no contarlas.

Hay un tercer sitio que es el mismo: crear una tarjeta directamente en la
columna «Hecho» con el «+». Nacer en Hecho es nacer cerrada, y ese `+` era la
puerta de atrás.

Tres cosas más:

1. **Se comprueba también en la acción, no solo en el formulario.** Una tarea
   cerrada sin tiempo no se recupera: nadie vuelve a abrirla para apuntarlo, así
   que el reparto quedaría corto para siempre y sin decir por qué.
2. **En el tablero, la tarjeta NO se mueve hasta confirmar.** Pintarla en Hecho
   y devolverla si se cancela el diálogo la haría saltar a la vista.
3. **El sello se pone una sola vez**, dentro del mismo `if (antes.status !==
   "done")` que ya decidía el aviso: arrastrar una tarjeta que ya estaba en
   Hecho no vuelve a contar.

### Un día son OCHO horas, no veinticuatro

Es lo que más se puede malinterpretar. Esto mide **trabajo**, no tiempo de
reloj: quien apunta «2 días» quiere decir dos jornadas. Y el número es el mismo
que el del aviso a propósito —`MINUTOS_DE_UNA_JORNADA`—, porque con 24 h por
día apuntar un solo día ya pasaría de las ocho y la marca saltaría siempre, que
es tanto como no tenerla.

**Se guarda siempre en minutos.** La unidad es comodidad de quien escribe;
guardar el par número+unidad obligaría a convertir en cada consulta y el sitio
que se olvidara sumaría peras con manzanas.

Y hay un tope (`TOPE_DE_MINUTOS`, 60 jornadas): sin él, teclear «800» con la
unidad en días mete 320.000 minutos en la fila y el total de esa persona deja de
significar nada para siempre.

### La marca de las ocho horas es por PERSONA y DÍA

No por tarea, y esa es la gracia: una tarea de diez horas marca su día ella
sola, pero **cinco de dos horas también**, y ese segundo caso es justo el que no
se ve mirando tarea a tarea. Probado con los dos.

Y **supera, no iguala**: ocho horas justas no marcan.

El día se calcula en la zona del servidor (`diaDelCierre`), no en UTC: con UTC
a secas, todo lo que se cierre después de las 7 de la tarde en Colombia contaría
en el día siguiente y una jornada de tarde se repartiría entre dos.

**La persona no ve la marca**, solo quien administra la cuenta. La puerta está
en `leerElTrabajo`, que devuelve `null` a quien no manda, y no en la pantalla:
es un dato de gestión, y enseñárselo a quien lo produce lo convierte en otra
cosa.

### Adjuntar: las tres formas son UNA función, y pegar es la que se usa

Los adjuntos de una tarea entran por tres vías —el botón, arrastrar y soltar, y
**pegar con Ctrl+V**— y la tercera es la que más se usa: uno recorta una captura
y la pega, no la guarda en el escritorio para buscarla luego.

**Las tres llaman a `subirArchivos` y a nadie más.** Con tres caminos separados,
el día que se afine algo —el tope, el aviso, cómo se decide el tipo— se afina en
uno y los otros dos se quedan atrás; y eso no se ve como un error sino como «a
veces funciona».

Tres cosas del pegado, y las tres importan:

1. **El oyente cuelga del DIÁLOGO entero**, no del recuadro de archivos. Quien
   acaba de recortar tiene el cursor donde sea, y obligarle a pinchar primero en
   el bloque es pedirle que adivine.
2. **Solo actúa si el portapapeles trae ARCHIVOS.** Sin esa condición, pegar
   texto en el título dejaría de comportarse como siempre. El `preventDefault`
   va dentro de esa condición, nunca antes.
3. **Una captura pegada no trae nombre**: el portapapeles la llama «image.png»
   siempre. Sin renombrarla, tres capturas salen con el mismo nombre y no hay
   forma de distinguirlas; se les pone la hora.

Y `dragover` necesita su `preventDefault` o el navegador abre el archivo en una
pestaña en vez de soltarlo. El `dragleave` comprueba que se sale del bloque de
verdad (`contains(relatedTarget)`): pasar por encima de un hijo dispara el
`dragleave` del padre y el resaltado parpadea.

### Se puede adjuntar ANTES de que la tarea exista, y por eso hay que limpiar

Antes los botones salían apagados con un «podrás adjuntar cuando la tarea esté
creada». Eso obliga a crear la tarea, reabrirla y volver a buscar la captura,
justo cuando la tienes recién recortada.

Ahora el archivo **sube igual** y se queda «en el aire»: en el bucket, con su
dirección, sin colgar de ninguna tarea. Al guardar se enganchan con el id recién
nacido (`engancharLosDelAire`); al cancelar se borran del bucket.

Y ahí está la parte que no se puede olvidar:

1. **El cierre va por UN solo camino.** La X, el clic fuera y «Cancelar» llaman
   a `cerrar()`. Con tres salidas distintas basta con olvidarse de una para que
   esa deje basura, y eso no se nota hasta que alguien mira cuánto ocupa el
   bucket.
2. **Al enganchar se vacía la lista del aire**, o el `onClose` de después
   borraría del bucket unos archivos que ya cuelgan de la tarea.
3. **Es best-effort a propósito.** Si el navegador se cierra a media faena el
   archivo se queda — y eso ya pasaba: `quitarAdjuntoDeTareaAction` nunca ha
   borrado el fichero, solo la fila. Lo que no puede pasar es que cancelar un
   diálogo deje basura **cada vez**.

#### Y la ruta que borra: tres condiciones, no una

`/api/upload/borrar` es la primera que quita algo del bucket, y una ruta que
borra lo que le digan es una ruta para vaciarle el bucket a otro. Solo pasa lo
que cumple **las tres a la vez**, y quien lo decide es
`llaveDelArchivoSubido` (`lib/llave-del-bucket.ts`), que es pura para poder
probarse sin levantar nada:

1. La dirección empieza por el prefijo público de **nuestro** bucket.
2. La llave tiene **exactamente** la forma que escribe `/api/upload`:
   `userID/workflowID/fichero`, tres trozos. Se **decodifica antes de contar**:
   `%2e%2e` y `%2F` son `..` y `/` una vez decodificados, y contar sobre el
   texto crudo dejaría pasar un salto de carpeta disfrazado.
3. Ese `userID` es una cuenta sobre la que manda quien llama
   (`assertCanAccessTargetUser`) — la misma puerta que la subida.

Probados los diez intentos de salirse: `..`, `..` codificado, barra codificada,
barra invertida, un trozo de más, uno de menos, trozo vacío, otro bucket, otro
dominio y una codificación rota.

### «Tipo de trabajo» NO es `Task.type`, y no puede serlo

Montaje —armar y entregar un cliente nuevo— o soporte —atender a uno que ya
funciona—. Cruzado con la cuenta y con el tiempo, contesta la pregunta entera:
**cuánto cuesta entregar un cliente y cuánto cuesta mantenerlo.**

`tasks` ya tiene una columna `type` —Seguimiento, Llamada, Reunión, Email,
Tarea, más los tipos que cada cuenta se invente— y **parece el sitio**. No lo
es, por dos motivos, y el segundo rompe cosas:

1. **Son dos preguntas distintas.** `type` dice *qué clase de gestión es*; esto
   dice *para qué*. Una llamada puede ser de montaje o de soporte, y metiéndolo
   todo en una columna se pierde una de las dos.
2. **`type` dispara automatizaciones.** `triggerTaskTypeAutomations` corre con
   cada tarea creada, y CRM › Reglas tiene un panel entero colgado de esos
   nombres. Una tarea de «montaje» empezaría a disparar —o a dejar de disparar—
   lo que esa cuenta tenga configurado, sin que nadie lo pidiera.

Va en `task_work`, al lado de la cuenta y de los minutos, que es lo que hay que
cruzar. La columna entra con **`ALTER TABLE … ADD COLUMN IF NOT EXISTS`** y no
reescribiendo el `CREATE`: la tabla ya existe en producción y un
`CREATE TABLE IF NOT EXISTS` no toca una tabla que ya está — es el fallo que se
comete solo al añadirle una columna a una tabla de la App que ya se desplegó.

Tres cosas más:

1. **Lo que llega de fuera pasa por la lista** (`comoTipoDeTrabajo`), en el
   servidor y no solo al pintar el desplegable. Un valor inventado se quedaría
   guardado y saldría en el reparto como una tercera columna que nadie sabe de
   dónde salió. Y **se vuelve a filtrar al leer**, para que una fila rara —a
   mano, o de antes de esta comprobación— salga como «sin tipo» y no rompa la
   pantalla.
2. **Es opcional, y el «sin tipo» SE ENSEÑA.** Una tarea interna no es montaje
   ni soporte: no hay cliente que entregar ni que mantener, y forzar a elegir
   metería ruido. Pero lo que no se rellena no se esconde: el reparto tiene su
   columna «Sin tipo» y su aviso en ámbar. Sin eso, dos cuentas con el mismo
   trabajo salen con cifras muy distintas solo porque en una se rellenó el campo
   y en la otra no — y eso no se ve por ningún lado. Misma familia que las
   tareas internas del reparto por cuenta: **si no suma, se dice.**
3. **Montaje y soporte van en la MISMA fila** de la tabla, no en dos tablas.
   Separados habría que buscar la cuenta dos veces y compararla de memoria, que
   es justo lo que esta tarjeta viene a evitar.

### Los dos `ON CONFLICT` no se pisan

`task_work` la escriben dos caminos distintos sobre la misma fila —anotar el
cliente y sellar el cierre— y cada uno **solo toca lo suyo**:

- Cerrar **conserva** el `clienteId` que ya hubiera. Pisarlo con un nulo sacaría
  del reparto a la cuenta a la que se le dedicó el rato.
- Cambiar el cliente después **conserva** los minutos y quién cerró.

Comprobado contra Postgres en ese orden y en el contrario. Si se añade un tercer
camino que escriba en esta tabla, va igual: nombra sus columnas y no arrastra
las de al lado.

## Chats: un PADDING no encoge; un hijo del flex sí

La fila de pastillas —Mías, Todos, Sin leer, En espera— se cortaba. Medido en
Chromium sobre el CSS del build, con cuatro pastillas y contadores de verdad,
**se cortaba en las cuatro anchuras**: a 1440 y a 1280 se perdía media palabra
de «En espera», a 1024 quedaba en «En», y en un móvil igual.

Y no era que sobrara poco: la fila pedía **377 px** y el hueco más estrecho son
**300**.

### Lo que NO se puede hacer, y por qué

Las pastillas iban `shrink-0` con `px-2`. Con eso una fila apretada solo tiene
dos finales, y los dos son el fallo:

- **desbordar** —y con el `overflow-hidden` del grupo eso no se ve como un
  error, se ve como una pastilla partida por la mitad—;
- o **partirse en dos líneas**, si alguien quita el `shrink-0` sin más.

Bajar el padding a mano tampoco vale: con pocos filtros la fila tiene sitio de
sobra y saldría apretada sin motivo.

> **La regla: en un flex lo que cede es un HIJO, y un `padding` no lo es.** El
> hueco de los lados de la pastilla pasa a ser un `<span aria-hidden>` con
> `shrink`, y el texto va `shrink-0`. Así el hueco cede **solo cuando falta
> ancho y solo lo que falte**; con sitio de sobra mide sus 8 px y la fila se ve
> exactamente como se veía.

Son **tres** huecos por pastilla —los dos de los lados (8 px) y el de entre el
rótulo y su contador (4 px, que antes era un `ms-1` y un margen tampoco cede)—,
o sea 20 px de margen de maniobra por pastilla. Con solo los dos de los lados el
banco medía **1 px corto** en el peor caso.

**Y nunca una barra de deslizar.** El `overflow-hidden` se queda de red de
seguridad, no como la solución: lo que evita el corte es que los huecos cedan.

### El pseudo-elemento NO sirve, y eso hay que saberlo antes

Lo primero que se escribió fue `::before` / `::after` con `flex: 0 1 8px`, que
ahorra dos nodos por pastilla. **No funciona en un `<button>`**: medido en
Chromium, el hueco salía de **0 px incluso en un contenedor de 600 px**, o sea
que la pastilla nacía ya sin huecos y el «se ve como hoy» se perdía. Un
pseudo-elemento de un botón no llega a ser un hijo del flex. Con un `<span>` de
verdad mide 8 px en reposo y 6 px a 110 px de ancho.

### `justify-evenly` reparte hueco ANTES de la primera

Es lo que despegaba la fila de los dos bordes, y además hacía que la separación
**no fuera la declarada**: `justify-evenly` reparte el sobrante en N+1 huecos
iguales, contando el de antes de la primera pastilla y el de después de la
última. Medido con tres pastillas: **16-20 px** a 1440 y **20-24 px** en un
móvil, contra los **4 px** del `gap-1` que estaba escrito al lado.

Con `justify-start` la primera pastilla arranca en el borde —alineada con el
buscador de arriba— y la separación es 4 px siempre. Ese hueco recuperado es
justo el que se le devuelve a las pastillas cuando el ancho aprieta.

### El móvil NO es el caso estrecho, y conviene no buscar ahí

Parece que sí y es al revés. La columna sale de `--ancho-lateral` (18/20/22/24
rem) y en un móvil ocupa **la pantalla entera**, así que el hueco de la fila es:

| ventana | columna | hueco de la fila |
| --- | --- | --- |
| 1440 | 384 | 332 |
| 1280 | 384 | 332 |
| **1024** | **352** | **300** ← el más estrecho |
| 390 | 390 | **346** ← el más ancho |

A 1024 la columna es la más pequeña de las de escritorio y encima lleva el
`sm:px-3`; en un móvil son 390 px menos el `px-2`. **Donde más se parten es a
1024**, no en el teléfono.

### Medido, antes y después

Cuatro pastillas, contadores reales de una cuenta grande (`Mías 328`,
`Todos 3.912`, dos `99+`). `pad` es lo que queda de los 8 px del hueco:

| ventana | antes | ahora |
| --- | --- | --- |
| 1440 | **se corta** | cabe, pad 5,2 px |
| 1280 | **se corta** | cabe, pad 5,2 px |
| 1024 | **se corta** | cabe, pad 2,6 px |
| 390 | **se corta** | cabe, pad 6,3 px |

Con **tres** pastillas —una cuenta sin asesor, que no tiene «Mías»— el pad se
queda en **8,0 px en las cuatro anchuras**: no se comprime nada, que es el
encargo. Lo único que cambia ahí es que la fila deja de estar despegada del
borde.

El banco ejerce **24 combinaciones** —3 ó 4 pastillas × tres juegos de
contadores × las cuatro anchuras— y comprueba en todas: una sola línea, sin
cortes, `overflow-x: hidden` (nunca una barra de deslizar), la primera pastilla
a 0 px del borde, la flecha a 0 px del derecho y 4 px de separación. Las clases
del «ahora» **se leen del componente** y las del «antes` se sacan de `git show`:
copiadas al banco se estaría midiendo una fila que React no pinta.

### Y el contador de «Todos» no se recorta a `99+`

Es lo que más ancho pide —hasta cinco cifras— y la tentación es caparlo como ya
se capan «Sin leer» y «En espera». **No**: ese número es el total de la línea y
tiene que poder leerse entero, que es una regla que ya costó una vuelta (ver
*un filtro que ofrece un número tiene que poder llegar a él*). Lo que se acorta
es el **rótulo** —«No leídos» pasó a «Sin leer», 10 px menos—, que es lo único
que se puede acortar sin quitar información.

Y el rótulo se cambió **en los dos sitios donde se nombra ese filtro**: la
pastilla y el atajo de la pantalla vacía. Con dos nombres para el mismo filtro,
se leen como dos filtros distintos.

## Chats: el menú de Acciones no puede crecer con el equipo

En «Acciones» iban abiertas, una detrás de otra, las dos listas de asesores:
**Transferir a…** y **Agregar participante a…**. Con un equipo de verdad eso son
los mismos nombres dos veces, y **Resolver conversación** quedaba tan abajo que
no se llegaba: la lista se acababa antes que el menú.

Y es justo lo que más se usa. Transferir o sumar a alguien es de vez en cuando;
cerrar la conversación es cada día.

Las dos listas van **plegadas**, cada una en su submenú (`DropdownMenuSub`), con
su propio scroll (`max-h-[60vh]`). El menú de arriba se queda en seis entradas
cortas y Resolver se ve siempre, con equipo de tres o de treinta.

La regla, si se añade otra lista aquí: **lo que el asesor hace a diario se ve
sin desplegar nada**; lo que crece con el equipo va dentro de un submenú.

Y lo mismo pasaba en el otro menú donde sale el equipo entero: **asignar asesor
desde la fila de la lista** (`AdvisorAssignBadge`). Ahí la lista se comía el
menú y el **Historial**, que va al final, quedaba fuera de la pantalla.

Ese **no se pliega**, y a propósito: asignar a alguien *es* lo que se viene a
hacer en ese menú, y esconderlo tras un submenú añade un clic a lo principal.
Lo que se hace es darle **su propio scroll**: arriba se quedan fijos «Sin
asignar» y «Asignarme», abajo el Historial, y solo la lista se desplaza.

Y el tope **no puede ser `70vh` a secas**, que fue el primer intento y no
arregló nada: `vh` mide la **ventana**, no el hueco que hay entre el botón y el
borde. Con la fila arriba del todo el menú se abría hacia arriba y se salía por
encima —el título «Asignar asesor» cortado—; con la fila abajo, al revés. El
tope es el hueco de verdad, que Radix mide y publica en
`--radix-popover-content-available-height` (y su gemela
`--radix-dropdown-menu-content-available-height`), con el 70 % como techo
encima:

```
style={{ maxHeight: 'min(70vh, var(--radix-popover-content-available-height))' }}
```

**Cualquier menú con una lista dentro va así**, y ya lo llevan el de «Acciones»,
sus dos submenús y los tres del menú de la fila.

Las dos formas valen; lo que no vale es una lista que crece sin tope. **Si la
lista es el motivo del menú, scroll; si es una opción más entre otras,
submenú** —y el submenú también con su `max-h`, como los de «Asignar agente» y
«Asignar etiqueta» del menú de la fila—.

## Proyectos: un aviso que espera es un aviso que no llega

Se asignaba una tarea y la persona no se enteraba. No es que no hubiera aviso:
es que estaba en Chats, no entra a Proyectos, y la campanita —con chats, citas,
vencidas y menciones dentro— se aprende a despachar sin leer.

Así que el aviso **interrumpe**: una ventana en medio de la pantalla, esté donde
esté. Cuelga de `Breadcrumbs`, que es la barra de todas las pantallas, y no
pinta nada hasta que hay algo que decir.

Cinco cosas que hay que mantener:

1. **No caduca y no se cierra sola.** Nada de temporizadores, ni `toast`. Se
   sale por uno de los dos caminos —abrir o cerrar— y por eso van cerradas las
   tres puertas de un diálogo normal: `hideCloseButton` y `preventDefault` en
   Escape, en el clic de fuera y en `onInteractOutside`. Si algún día se deja
   cerrar de otra forma, deja de ser esto y vuelve a ser la campanita.
2. **Una ventana, aunque haya cinco avisos.** Van agrupados en una lista dentro
   de la misma ventana. Encadenados son cinco clics para volver a lo que estabas
   haciendo, y eso se aprende a despachar sin leer — que es justo el fallo del
   que venimos.
3. **Llega por el reloj, no por el tiempo real.** Un `setInterval` de 15 s
   montado una sola vez contra una consulta de un solo índice
   (`destinatarioId, atendidoEn`). Ni socket, ni salas, ni token: de ahí salen
   los fallos mudos que cuestan noches. Con la pestaña de fondo no pregunta, y
   al volver a ella pregunta de inmediato.
4. **Lo pendiente vive en la base, no en la pestaña.** Quien no estaba conectado
   se lo encuentra al entrar. Y por eso mismo la ventana **se cierra en todas
   partes**: abrir la tarea en otra pestaña o en el móvil la deja atendida en la
   base, y el reloj de las demás deja de traerla. Las pestañas no se hablan
   entre ellas.
5. **Nunca se avisa a quien hizo la acción**, y a nadie dos veces por lo mismo.
   En un comentario la misma persona puede ser la asignada, la que creó la tarea
   y una de las que ya escribieron: sale un aviso, no tres. Lo descuenta
   `crearLosAvisos`, y por eso los destinatarios se calculan en **un solo
   sitio** (`lib/avisar-de-la-tarea.ts`): con la lista escrita en cada
   disparador, el cuarto se olvidaría de alguien, y eso no se ve como un error
   sino como «a mí nunca me llega nada».

### LEÍDO y VISTO son dos marcas, y hacen falta las dos

Es lo que más cuesta ver y lo que no se puede simplificar:

- **`atendidoEn` = leído.** El clic de la ventana, abrir o cerrar. Decide si la
  ventana vuelve a salir y si el aviso sigue contando en la campanita.
- **`vistoEn` = abrió la tarea.** Es lo único que quita el punto del tablero.

Con una sola marca no se cumple el encargo: cerrar la ventana calla el aviso,
pero **no** es haber leído la tarea, así que la tarjeta tiene que seguir
marcada. Cerrar escribe solo `atendidoEn`; **abrir la tarea escribe las dos**.

El punto es **por persona, no de la tarea**: la misma tarjeta lleva punto para
quien no la ha abierto y no para quien sí (`tieneAlgoSinVer`). Y se calcula por
lista (`tareasConAlgoSinVer`), no una consulta por tarjeta.

### Los tres disparadores, y quién es «implicado»

| Qué pasó | A quién le salta |
| --- | --- |
| Se le asigna la tarea (al crearla o al reasignarla) | al asignado |
| Se da por hecha (botón o arrastrar a «Hecho») | a quien la creó, para que avise al cliente |
| Alguien comenta | a los implicados |

**Implicados = quien la creó + el asignado + todos los que ya han comentado.**
Menos quien acaba de actuar.

### Y las tablas son NUESTRAS, sin tocar `tasks`

`task_comments` y `task_alerts` las crea la App con `CREATE TABLE IF NOT EXISTS`,
como `task_attachments` y `flows`. **Ni una columna nueva en `tasks`**: esa tabla
es del backend y añadirle columnas desde aquí es lo que reventó el #360. Sin
clave foránea, así que al borrar una tarea la limpieza es explícita
(`olvidarElHiloDe`) y no puede reventar el borrado.

Y avisar **no puede tumbar lo que lo dispara**: la tarea ya está creada cuando
se avisa, así que `crearLosAvisos` no lanza. Pero **no es mudo**: un aviso que
no sale sin decirlo se lee como «a mí no me llega nada», que es el fallo
original otra vez.

### El orden DENTRO de una columna: la llave es el TABLERO, no la cuenta

Las tarjetas se arrastraban de una columna a otra y **no se podían reordenar
dentro de la suya**. Con varias tareas o tickets del mismo día la fecha no
ordena nada y lo más urgente podía quedar de último.

Lo tienen los dos tableros —el de un proyecto y el de tickets— y lo comparten
todo: `lib/orden-del-tablero.ts` (puro), `lib/orden-de-tablero-db.ts`,
`actions/orden-de-tablero-actions.ts` y `components/shared/OrdenDeColumna.tsx`.
Con dos copias, el día que se afine el arrastre se afina en una y la otra se
queda atrás, que no se ve como un error sino como «en tickets a veces no
funciona».

La posición vive en **`orden_en_tablero`**, tabla de la App con
`CREATE TABLE IF NOT EXISTS` y sin clave foránea, con llave
`(tipo, tableroId, tarjetaId)`. En Proyectos no hay elección —`tasks` es del
BACKEND y añadirle columnas desde aquí es lo que reventó el #360—; en Tickets sí
la habría, porque `tickets_de_soporte` es nuestra, y **aun así va aquí**: dos
mecanismos para lo mismo es uno que se afina y otro que se queda.

**Y la llave es el TABLERO, no la cuenta.** Es la diferencia con
`lib/orden-de-las-tarjetas.ts` —la rejilla de Proyectos y Diagramas—, donde la
posición es de la pareja **cuenta + cosa** porque un proyecto compartido sale en
dos pantallas y cada cuenta lo coloca donde quiera. Aquí es al revés: un
proyecto compartido es **UN tablero** que abren las dos cuentas, con las mismas
tarjetas —«un proyecto, un juego de tareas»—. Con la cuenta en la llave, la
dueña y la invitada verían el mismo tablero ordenado de dos maneras.

#### El número es del TABLERO; la comparación, de la COLUMNA

Cada tarjeta guarda un entero y **solo se compara con las de su columna**. Eso
deja «entrar al final» en una sola consulta y sin saber en qué columna va a
caer: `máximo del tablero + 1` es, por definición, mayor que el máximo de
cualquiera de sus columnas. Lo usan las tres puertas por las que una tarjeta
llega a una columna —crearla, moverla de columna y, en tickets, abrirla—, y por
eso reordenar una columna a `0,1,2…` no rompe nada aunque deje sus números por
debajo de los de otra: entre columnas no se comparan nunca.

Y el `SELECT MAX` va **dentro** del `INSERT`: con dos consultas, dos tarjetas
creadas a la vez leerían el mismo máximo y se llevarían el mismo número.
Comprobado lanzando las dos en paralelo contra Postgres.

#### Lo que NO tiene posición va PRIMERO

Suena al revés y es lo que hace falta:

- Una columna que nadie ha tocado **no tiene ni una posición guardada**, así que
  sale exactamente como salía antes. Esto no cambió ningún tablero hasta que
  alguien arrastró la primera tarjeta.
- Y una tarjeta **nueva SÍ trae posición**, así que cae en el grupo de las
  colocadas y queda **la última**. Que es el encargo: nunca arriba, para no
  pisar el orden que puso una persona a mano.

Con «sin colocar» al final pasaría lo contrario: la tarjeta nueva saldría
arriba del todo. Es la trampa que solo se ve con una columna a medio colocar, y
el banco la reproduce a propósito.

#### Dos administradores reordenando a la vez: gana la última, pero gana ENTERA

**Se guarda la columna entera, no la tarjeta que se movió.** Guardando una sola
posición habría que hacerle sitio corriendo a las demás, y dos personas a la vez
dejarían la columna con dos tarjetas en el mismo hueco o con un salto. Con la
columna entera cada escritura es una foto completa y coherente: Postgres las
serializa y la columna acaba en el orden que vio una persona, **nunca mezclando
las dos** —que daría un orden que no eligió nadie—. Si tocan columnas distintas
ni se rozan: son filas con `tarjetaId` distinto.

Se acepta a sabiendas y **sin candado de versión**, a diferencia de confirmar un
cobro: allí lo que se pierde es un mes de licencia y aquí un arrastre, que se ve
al instante y se deshace volviéndolo a arrastrar. Un diálogo de «alguien
reordenó mientras tanto» sale más caro que el problema que evita. El banco lo
ejecuta —dos `guardarLaColumna` en paralelo sobre la misma columna— y comprueba
las dos cosas: que el resultado es uno de los dos órdenes completos, y que no se
pierde ni se duplica ninguna tarjeta.

#### Lo único que viaja en el arrastre es el ID

Esto **rompió los dos tableros en producción** y no dijo nada. Ni cambiar de
columna —que llevaba funcionando desde siempre— ni reordenar dentro de la
columna. La tarjeta se levantaba al arrastrarla y al soltarla se quedaba donde
estaba: sin error, sin aviso y sin nada en la consola.

La causa es de una línea. La tarjeta se registraba con el objeto colgado del
arrastre:

```ts
useDraggable({ id, data: { task } })   // y en Tickets, data: { ticket }
```

Al pasar a `useSortable` —que es lo que hace que una tarjeta sea también un
destino, y sin lo cual no hay reordenar— **ese `data` se quedó por el camino**.
Los dos tableros seguían leyéndolo:

```ts
const task = (active.data.current as { task?: TaskData })?.task;
if (!task) return;   // ← se iba por aquí SIEMPRE
```

Y ese `return` está **antes** de `resolverElArrastre`, así que las dos cosas
—que salen de la misma función— cayeron a la vez. No es que un arrastre se
comiera al otro: es que ninguno de los dos llegaba a decidirse.

Dos cosas que hay que mantener:

1. **Se busca la tarjeta por su `id`, con `laTarjetaArrastrada`.** El `id` es el
   único canal que **no se puede perder**: sin él dnd-kit no arrastra nada, así
   que su ausencia se ve al instante. Un segundo canal que solo sirve para
   transportar un objeto es justo lo que un refactor se deja, y su pérdida no la
   nota nadie hasta que un cliente lo prueba. **No se le vuelve a colgar un
   `data` a la tarjeta.**
2. **Y se compara como TEXTO en los dos lados.** En Proyectos `task.id` es un
   número y `active.id` llega **siempre** como cadena: un `===` en crudo no
   casaría nunca y sería este mismo fallo otra vez, igual de mudo. Esa mitad sí
   la cubre el banco.

Y el `if` que no encuentra la tarjeta **ya no es mudo**: sale
`[tablero] se solto una tarjeta que no esta en la lista`. Un manejador de
arrastre que se rinde en silencio no se ve como un error — se ve como «la
tarjeta no se queda donde la dejo», que es lo que costó esta vuelta entera.

**Lo que ningún banco iba a cazar, y conviene saberlo:** el fallo no estaba en
la decisión —que es pura y estaba bien— sino en **lo que se le entregaba**. El
#769 además no dejó banco ninguno; ahora está
(`lib/__tests__/orden-del-tablero.test.mjs`, 16 casos), pero lo que de verdad
protege contra la repetición es haber quitado el canal, no el banco.

#### Y tres cosas del lado de la pantalla

1. **`useSortable` en vez de `useDraggable`**, y `collisionDetection=
   {closestCenter}`. La tarjeta pasa a ser también un destino: sin eso no hay
   forma de saber **entre qué dos** se soltó, solo en qué columna. Y sin
   `closestCenter` dnd-kit se queda con la columna y el reorden no llega a
   calcularse nunca. La estrategia es `verticalListSortingStrategy` —una columna
   es una sola columna de tarjetas apiladas—, no la `rectSortingStrategy` de la
   rejilla.
2. **El `DndContext` sigue siendo uno, el del tablero.** `ColumnaOrdenable` solo
   pone el `SortableContext`: dos contextos anidados se roban los eventos y el
   cambio de columna dejaría de funcionar.
3. **Lo que se movió en pantalla se tira en cuanto llegan datos del servidor.**
   Las posiciones viajan dentro de cada tarjeta, así que dejar las de encima
   taparía para siempre lo que reordenó otra persona. En Tickets la señal es un
   contador que sube en cada carga y **no la identidad del arreglo**: el padre
   también crea uno nuevo al pintar un cambio al momento, y eso no es un dato
   del servidor.

Y un agente que arrastre dentro de su columna **no se queda sin respuesta**: sale
«Solo un administrador puede reordenar el tablero». Mover de columna lo suyo
sigue igual que siempre.

### La tarjeta del tablero se recorta, y el texto entero está al abrirla

Una tarea con el texto largo —lo normal: se pega ahí «Empresa: … Fecha: …
Tarea: …»— se comía la columna entera. Las demás quedaban fuera de vista y para
leer esa había que desplazarse **dentro de la tarjeta**, que es exactamente lo
contrario de lo que sirve un tablero.

El título va a **dos líneas con «…»** (`line-clamp-2`), y el texto completo se
lee al abrir la tarea —y en el `title` al posar el cursor—. La referencia es el
kanban de `/tags`, donde todo va recortado y por eso se ven varias a la vez.

Dos números que no son a ojo:

1. **`min-h-[2.75em]` reserva sitio para las dos líneas aunque use una.** Es lo
   que iguala las alturas, el mismo patrón que la tarjeta de Diagramas. Pero el
   valor **depende del interlineado**: son 2 × 1.375em, que es lo que mide una
   línea con `leading-snug`. Copiando el `2.5em` de Diagramas —que va con otro
   interlineado— las tarjetas quedaban 4px descuadradas.
2. Y `whitespace-pre-wrap` se queda. Medido en Chromium, `line-clamp` recorta y
   pone los puntos igual de bien con `pre-wrap`, que era la duda razonable.

Medido: tres tarjetas de ejemplo pasaron de 476px de columna a 283px, y las tres
quedan a 89px exactos.

#### El TÍTULO es corto, y el texto largo se fue a `task_details`

La tarjeta pintaba `tasks.title`, y ahí es donde se pegaba todo —«Empresa: …
Fecha: … Tarea: …»—, así que recortado a dos líneas no se entendía a golpe de
vista. Recortar mejor no era la respuesta: **eran dos datos metidos en un
campo.**

Y la solución no podía ser una columna nueva: `tasks` es del BACKEND y añadirle
columnas desde la App es lo que reventó el #360. De las dos formas que quedan se
eligió la que arregla el fallo en todas partes:

> **`title` pasa a ser el título corto y el texto largo se va a
> `task_details`**, tabla nuestra con `CREATE TABLE IF NOT EXISTS`. `title` es
> el campo que ya enseñan `/tareas`, la campanita, los avisos de tarea y los
> recordatorios, así que **todas esas pantallas mejoran solas**. Al revés —el
> corto en la tabla lateral y el ladrillo en `title`— se habría arreglado la
> tarjeta y dejado el ladrillo en todas las demás, que es el fallo del que
> venimos.

**Las tareas que ya existen no se tocaron: ni una fila.** Su `title` sigue
trayendo el texto largo, y la tarjeta enseña su **primera línea**
(`tituloDeLaTarjeta`), que ya se lee mucho mejor que dos líneas recortadas de un
ladrillo; el texto entero sigue al abrirla y en el `title` del elemento. En
cuanto alguien la edite, le pone su título y queda como las nuevas. Medido en
Chromium con el ladrillo real: antes el texto se salía de la tarjeta, ahora
cabe, y las tarjetas siguen midiendo **89px exactos**.

Un backfill —cortar la primera línea y mover el resto— queda **descartado
mientras nadie lo pida**: es un `UPDATE` masivo sobre una tabla del backend,
reescribe datos reales de clientes y no se deshace.

Tres cosas que hay que mantener:

1. **Una sola regla al pintar, sin preguntar si la tarea es nueva o vieja.**
   `tituloDeLaTarjeta` corta por la primera línea siempre: en una nueva el
   título ya es de una línea y lo devuelve tal cual. Un `if (tiene detalle)`
   sería una rama que solo se ejerce con datos viejos — la que nadie prueba y la
   que se rompe.
2. **Al guardar, los saltos del título se APLASTAN, no se corta ahí.** Quien
   pega un texto de varias líneas en el título quiere que se vea entero; cortar
   por el primer `Enter` sería tirar lo que acaba de escribir sin decírselo.
3. **Vaciar el detalle BORRA la fila**, no deja una con cadena vacía: si no, la
   tarea seguiría diciendo que tiene detalle y al abrirla no habría nada.

#### El comentario se guarda con la tarea, y por eso no tiene botón

El bloque de Comentarios iba detrás de un `task &&` —un comentario cuelga de un
`taskId` y en una tarea nueva ese id no existe todavía— así que **no salía nunca
al crear**, ni creándola directamente en curso. Había que guardar, reabrir y
entonces escribir, justo cuando lo que se quiere decir se tiene en la cabeza.

Ahora sale siempre, y lo que lo hace posible es que **el borrador vive en el
formulario, no dentro del hilo**: se guarda con el resto, con el id recién
nacido, por el mismo camino que ya seguían los adjuntos. Con el texto dentro del
componente no habría forma de que el guardado lo alcanzara.

Y de ahí sale lo otro: **se quitó «Comentar»**. Un botón al lado de «Guardar»
son dos botones para una misma acción, y el de guardar no se llevaba lo escrito
— se escribía el comentario, se pulsaba Guardar y el comentario se perdía. Lo
que sí hace falta es **decirlo**: el bloque lleva «Se envía al guardar la
tarea», porque un recuadro de texto sin botón al lado se lee como que no se va a
guardar y la gente no lo usa.

Guardar el comentario **nunca lanza y nunca es mudo**: la tarea ya está guardada
cuando se llama, así que un fallo ahí no puede deshacerla; pero un comentario
que se escribe y no aparece se lee como que la App pierde lo que escribes.

#### `space-y-*` también le da margen a un hijo ABSOLUTO

El punto de aviso de la tarjeta es `absolute` en la esquina, y la tarjeta iba con
`space-y-2`. Eso reparte el hueco con márgenes (`> * + *`) y **un hijo fuera del
flujo entra en esa cuenta igual**:

- Siendo el **primero**, no recibe margen… pero se lo regala al título: la
  tarjeta **con** aviso salía 8px más alta que las demás.
- Movido al **final** para arreglar eso, el margen se le suma a su propio `top`
  —en un absoluto con `top` puesto, `margin-top` desplaza la caja— y **el punto
  se bajaba 8px**. Un arreglo que rompía la otra mitad.

La tarjeta va con **`flex flex-col gap-2`**. Con `gap` no hay márgenes: lo que
está fuera del flujo ni cuenta para el hueco ni recibe nada, y el punto se queda
clavado en su esquina mida lo que mida la tarjeta.

**Si una caja tiene dentro algo posicionado en absoluto, su hueco se reparte con
`gap`, no con `space-y-*`.** Y se comprueba midiendo la posición del elemento
absoluto antes y después, no mirando la pantalla: ocho píxeles no se ven, y
descuadran igual.

#### El `42P01` de Prisma NO está donde parece

`conLasTablas` reintenta cuando la tabla no existe —el recuerdo de «ya la creé»
es del proceso, no de la base—. La primera versión preguntaba por `error.code`
y **el reintento no se disparaba nunca**: en una consulta en crudo el `code` de
primer nivel es el de Prisma (`P2010`) y el de Postgres viaja dentro, en
`meta.code`.

Lo cazó el banco borrando las tablas a mano: ocho consultas seguidas caían y
ninguna se recuperaba. Se miran **los dos sitios**, `meta.code` y el texto del
mensaje. Si se escribe otra comprobación de un código de Postgres, va igual.

## Agente: una prohibición que no viaja en el prompt no existe

La **nota interna** de un paso es una instrucción que el modelo lee y obedece
pero no dice: «este paso es solo para quien ya pagó», «no ofrezcas aquí el
descuento». Se agrega desde el menú del editor, en TEXTO, justo debajo de la
respuesta, con candado.

Lo delicado no es la pantalla, es que la prohibición **sea cierta**. Llamarla
«interna» en la interfaz no le dice nada al modelo: el modelo solo sabe lo que
se le escribe. Así que las tres reglas viajan **dentro del bloque**, no en un
comentario del código —no emitirla ni parafraseada, no aplicarla fuera de este
paso, y no tocar `current_step`, que lo decide el motor de flujo—.

Cuatro cosas que hay que mantener:

1. **El envoltorio lo escribe UNA función**, `envolverLaNotaInterna`
   (`lib/nota-interna-de-paso.ts`), y es pura. Los constructores de prompt son
   **dos** —`markdownBuilder` y `buildSectionedPrompt`— y tienen que escribir
   exactamente lo mismo: con el texto copiado en cada uno, el día que se afine
   la prohibición se afina en uno y la misma nota se comporta distinto según por
   qué camino se armó el prompt.
2. **Vacía no escribe nada.** El campo es opcional, así que una tarjeta recién
   puesta y en blanco no puede meterle al modelo una cabecera sin instrucción:
   solo gasta contexto y le da una regla sobre la nada.
3. **Pero cuando tiene contenido, cuenta como elemento.** `hasActions` decide si
   se escribe la sección ELEMENTOS, y sin contar la nota un paso cuyo único
   elemento fuera esa nota **la perdía entera, sin decir nada**. Es el fallo que
   se comete solo al añadir un `fn` nuevo: hay que mirar las dos listas, la del
   render y la de «¿hay algo que escribir?».
4. **Va la ÚLTIMA, detrás de todas las respuestas.** Es `kind: "function"`, así
   que caía con las acciones y el paso se leía del revés: lo primero que se veía
   era un recuadro con candado que el cliente no verá nunca, y la respuesta
   —que es de lo que trata el paso— debajo. El orden de un paso es **título,
   objetivo, acciones, respuestas, nota interna**.

   El argumento con el que entró arriba —«el modelo tiene que haberla leído
   antes de redactar»— **no se sostiene**: el prompt le llega entero de una vez,
   así que tres líneas más arriba o más abajo no cambian lo que lee; lo que sí
   cambia es cómo se lee el paso en la pantalla.

   Por eso `lib/orden-de-elementos.ts` tiene **tres niveles y no dos** —acción,
   respuesta, nota— y la nota se reconoce por su `fn` **antes** de mirar el
   `kind`. Los dos constructores escriben los elementos en el orden del array,
   así que ese módulo ordena la pantalla y el prompt a la vez: **no hay dos
   órdenes que mantener a la par.** Los bloques viejos se enderezan solos al
   abrirlos (`ordenarElementosDeLosPasos`), así que no hace falta migración.

Y el `fn` nuevo entra también en el **esquema Zod** (`PromptElementSchema`). Sin
eso, guardar un prompt con una nota dentro falla la validación de **todas** las
secciones —`patchSection` las revalida— y rompe cualquier edición sobre ese
prompt, que es un fallo mucho más ancho que la nota.

## Proyectos compartidos: un proyecto, un juego de tareas

Un proyecto se comparte con otra cuenta igual que un diagrama, y con **el mismo
diálogo** (`components/shared/CompartirConCuentasDialog.tsx`, que ahora usan las
dos pantallas: lo que cambia son las acciones, que entran por `cargar` y
`guardar`). «Solo lectura» lo ve y nada más; «Puede editar» trabaja sobre el
MISMO proyecto —crea, mueve y cierra tareas—, no sobre una copia.

Esto **no es** la privacidad con el equipo (Privado / Solo lectura / Editable,
que aquí es `filtroDeProyectosVisibles`): aquella reparte dentro de una cuenta y
esto cruza a la de un cliente. Son dos ideas distintas y siguen separadas; en
Diagramas ya costó una confusión entera creer que marcar «Editable» le daba algo
al cliente.

La tabla es `project_shares`, de la App y con `CREATE TABLE IF NOT EXISTS`. **Ni
una columna en `Project`**: esa tabla es del backend y añadirle columnas desde
aquí es lo que reventó el #360. Sin clave foránea, así que al borrar un proyecto
la limpieza es explícita (`olvidarLosCompartidosDe`) y no puede reventar el
borrado.

**La regla que lo sostiene todo:**

> **Las tareas de un proyecto cuelgan de la cuenta DUEÑA, escríbalas quien las
> escriba.** `createTaskAction` resuelve el `ownerId` desde el proyecto, no desde
> quien llama. Guardándolas bajo la cuenta invitada se quedarían fuera de los dos
> tableros: el dueño pide las de su cuenta y no las vería, y la invitada abre el
> tablero del proyecto, que tampoco es el suyo. Un proyecto, un juego de tareas.

De ahí sale la respuesta a «¿y el tiempo?»: `task_work` se escribe bajo esa misma
cuenta dueña, con `cerradaPorId` de quien cerró. Así que **las horas que pone la
cuenta invitada salen en el «Reparto del trabajo» de la cuenta DUEÑA**, con el
nombre de la persona que las hizo, y **no** en el de la invitada. Es lo correcto
—el trabajo es del proyecto, y el proyecto es de su dueño— y es lo único que
permite sumar: partido en dos mitades, nadie puede juntarlas.

Cuatro cosas más que hay que mantener:

1. **Quién puede qué se pregunta en UN solo sitio**, `accesoAlProyecto`
   (`lib/acceso-al-proyecto.ts`), y **en el servidor**. Lo usan listar, abrir el
   tablero, crear, editar, mover, comentar y adjuntar. Con la condición escrita
   en cada acción, la octava se olvida — es lo que dejó un chat que se podía
   anclar y no se podía borrar.
2. **En uno recibido no manda nadie de esta cuenta.** Ni se edita la ficha, ni se
   borra, ni se reparte a más cuentas, ni se borran sus tareas: eso se queda en
   la cuenta dueña. «Puede editar» es crear, mover y cerrar, que es lo que se
   ofreció.
3. **Un proyecto que no se comparte se contesta como si no existiera.** Decir «no
   puedes» ya revela que existe y de quién es. Misma regla que `getFlowAction`.
4. **Un agente de la cuenta invitada lo ve pero no lo toca.** Participa en lo que
   le asignen, y en un proyecto de otra cuenta no le asignan nada. Y el bloque de
   «Cuenta» y «Tipo de trabajo» **no se pinta** en uno recibido: esa es la
   contabilidad de la cuenta dueña, y la lista de clientes que vería la invitada
   es la suya.

## Chat de equipo: un hilo por CUENTA, y el aviso es el que ya existía

Hasta ahora no había ningún sitio donde hablar entre personas. Lo que había
—y se confunde con esto— son dos conversaciones **atadas a algo**: los
**comentarios de tarea** cuelgan de una tarea, y las **notas internas** de un
chat cuelgan de un lead. Para cualquier otra cosa no existía nada.

`/chat-equipo` es **un hilo por cuenta**, sin canales y sin temas. La cuenta ES
el hilo: `cuentaId` es `ownerId ?? id`, el mismo valor con el que agrupan
Carpetas, Proyectos y Diagramas — y, lo que de verdad importa, **el mismo con
el que `getTeamAdvisorInfos` busca al equipo**. Si el hilo saliera de un id y
la lista de mencionables de otro, se podría mencionar a gente que no lee ese
hilo.

**La tabla es NUESTRA**: `team_chat_messages`, con `CREATE TABLE IF NOT EXISTS`
y sin clave foránea, como `task_comments`, `flows` y `tickets_de_soporte`. El
nombre del autor se **copia dentro**, para que el hilo siga diciendo quién
escribió aunque esa persona salga del equipo.

**La regla, y es la que sostiene la mención:**

> **La lista de gente manda, no el texto.** Una mención es `@` seguido del
> nombre —o del correo— de alguien del equipo de ESA cuenta; lo que no case con
> nadie es una arroba, no una mención. Sin eso, «escríbele a hola@verzay.com»
> le saltaría la ventana que interrumpe a quien no toca, y avisar de más es
> exactamente lo que enseña a ignorar los avisos.

Y se decide **en el servidor** (`extraerMenciones`, puro y probado). Lo que
diga el navegador sobre a quién mencionó no se da por bueno: sería una lista de
destinatarios que llega de fuera.

### El aviso es el MISMO, y por eso `task_alerts` admite no tener tarea

Un aviso más, en otro sitio y con otra forma de despacharse, se aprende a
ignorar — que es justo el fallo del que viene la ventana que interrumpe. Así
que una mención usa **la misma tabla, la misma ventana y la misma campanita**
que un comentario de tarea: `tipo: "mencion"`.

Lo único que lo distingue es que **`taskId` va en `null`**, y de ahí sale que
el clic lleve a `/chat-equipo` en vez de a un tablero (`aDondeLleva`).

Tres cosas que hay que mantener:

1. **La columna se hizo opcional con `ALTER TABLE … ALTER COLUMN … DROP NOT
   NULL`**, no reescribiendo el `CREATE`: la tabla ya existe en producción y un
   `CREATE TABLE IF NOT EXISTS` no toca una que ya está. `DROP NOT NULL` no se
   queja si ya está quitado, así que se puede repetir en cada arranque.
   Comprobado contra Postgres con una fila vieja dentro: sigue intacta.
2. **El punto del tablero no se entera**, y es lo correcto: esa consulta acota
   con `taskId IN (…)` y un `NULL` no entra en un `IN`. Comprobado.
3. **La llave de deduplicación de `crearLosAvisos` es `taskId ?? "chat"`.** Sin
   eso, todos los avisos del chat compartirían la llave `null` y una segunda
   mención a otra persona en el mismo envío se perdería.

### Y la pantalla no pinta pestañas

La barra la pone **el módulo**, desde el layout (`PanelAwareTabNav` con sus
`moduleItems`). Pintándola también en la pantalla saldrían dos, una debajo de
otra, y la de la pantalla no sabría nada de los permisos de cada persona. La
ruta entra en `navigationRoutes` —sin eso no se puede elegir en «Editar
módulo», por mucho que la página exista— y **no se monta en ningún módulo**: se
asigna a mano.

Dos cosas más del hilo:

- **El reloj responde.** Un `setInterval` montado una sola vez, de 5 s, que lee
  por referencia. Aquí no hay tiempo real que lo adelante, así que ese número es
  lo único que trae los mensajes de los demás. Y su `catch` **escribe**: un
  refresco que falla en silencio no se nota como un error, se nota como un chat
  que no trae nada.
- **Se piden los ÚLTIMOS, no los primeros.** `ORDER BY "creadoEn" DESC LIMIT n`
  y se le da la vuelta al pintar. Pidiéndolos `ASC`, el tope devolvería la
  conversación de hace un año.

Y quien entra a una cuenta ajena con «Ingresar» ve **el hilo de esa cuenta**:
sale gratis de `currentUser()`, que ya resuelve ese caso (#756).

### Firma la PERSONA; el hilo es de la CUENTA

Son dos preguntas distintas y estaban contestadas con el mismo dato. El mensaje
se guardaba con el id de la fila **efectiva**, que es la que devuelve
`currentUser()`, así que quien entraba por «Ingresar» a una cuenta ajena y
escribía dejaba el mensaje **firmado como el cliente**. El equipo leía su
propio nombre diciendo cosas que no había dicho nadie de allí.

Un mensaje lo escribe alguien, y ese alguien tiene nombre. Lo decide una sola
función pura, `quienFirma` (`lib/chat-de-equipo.ts`), y son tres campos:

| | de dónde sale | por qué |
| --- | --- | --- |
| `autorId` | `sessionUserId ?? id` | la **persona** que está sentada delante |
| `cuentaId` | `ownerId ?? id` | el **hilo**, que sigue siendo el de la cuenta |
| `escritoDesde` | la cuenta, **solo** si `porImpersonacion` | de dónde salió, sin ensuciar el caso normal |

El nombre viaja en **`nombreDeLaPersona`**, nuevo en `currentUser()` y **gratis**:
`resolverElUsuario` ya lee la fila de la persona real —la necesita para
`rolDeLaPersona`— y lo único que hacía era tirar su `name`. Es el mismo patrón
con el que se resolvió `rolDeLaPersona` en su día: no hace falta ir a la base,
hace falta dejar de tirar lo que ya se trajo.

Tres cosas que hay que mantener:

1. **El `name` de la fila efectiva NO sirve para firmar.** Dentro de una cuenta
   ajena ese nombre es el del cliente. Solo vale cuando la fila efectiva ya es
   la de la persona —el caso normal—, y por eso `quienFirma` lo usa **solo**
   cuando `personaId === id`. Sin esa condición vuelve el fallo entero.
2. **El hilo no se mueve.** Se entra a una cuenta para ver lo suyo, así que lo
   que se escriba ahí lo lee su equipo. Firmar con la persona y mandar el
   mensaje a otro hilo sería peor que el fallo original.
3. **`escritoDesde` entra con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`**, no
   reescribiendo el `CREATE`: la tabla ya está en producción y un
   `CREATE TABLE IF NOT EXISTS` no toca una que ya existe. Es el fallo que se
   comete solo al añadirle una columna a una tabla de la App ya desplegada.

## La barra de una lista no se pinta a mano: `BarraDeAcciones`

Cada pantalla colocaba sus mandos donde le tocó. En **Clientes** el botón azul
de crear iba **pegado al buscador**; en **Módulos** había **dos `ml-auto`**
peleándose —uno en las pastillas y otro en el botón— así que el azul quedaba
flotando en mitad de la barra; en **Plantillas** iba al final de una fila con
`flex-wrap`, que en cuanto no cabía se lo llevaba a una segunda línea. Ninguna
estaba mal por su cuenta: puestas una al lado de otra, la plataforma parecía
cinco plataformas.

> **A la izquierda el buscador y los filtros. A la derecha, pegado al borde, el
> `⋯` de acciones masivas; y justo antes, el botón azul de crear.**

El orden no es gusto: **el azul con su texto destaca solo**, así que la esquina
—el sitio más fácil de acertar con el ratón, porque el puntero se para contra
el borde— se la queda el `⋯`, que es un icono pequeño y sin palabra.

Vive en `components/shared/BarraDeAcciones.tsx`, con tres huecos y ninguno más:
`filtros`, `crear` y `acciones`. **Ninguna pantalla vuelve a escribir esa
fila.** Si hace falta un mando nuevo, entra por uno de los tres; si no encaja en
ninguno, el hueco se añade **ahí** y sale en todas a la vez.

Y `ModuleToolbar` —que lo importan quince pantallas— **ya no es una fila
propia: por dentro es `BarraDeAcciones`**. Se conserva el nombre porque
renombrarlo sería un diff de mil líneas que no cambia nada; lo que cambia es
que la forma la decide un solo componente.

### Y la zona de la izquierda SE DESPLAZA, no crece

Es lo que impide que la barra se parta en dos filas cuando una pantalla tiene
buscador, dos desplegables y cuatro pastillas: lo de la izquierda vive en una
franja con `overflow-x-auto` y lo de la derecha es `shrink-0`. Con `flex-wrap`
—que es lo que había en media plataforma— la barra crece **hacia abajo** y se
come justo el alto que la tabla necesita, que es lo que la vuelta anterior
acababa de recuperar quitando las tarjetas de métricas.

Y el alto es `min-h-10`, el de un `Button` por defecto: la barra mide lo mismo
en una pantalla con botones y en una que solo tiene buscador.

### Qué va en cada hueco, que es donde se falla

La pregunta no es «dónde queda bonito», es **qué hace el mando**:

| va a | lo que | ejemplos que estaban en el sitio equivocado |
| --- | --- | --- |
| `filtros` | lo que **acota la lista** | «Completadas (N)» de Tareas y el interruptor de activo del editor de formularios, que estaban a la derecha |
| `crear` | lo que **añade una fila** | uno por pantalla; si hay dos, el segundo no es crear |
| `acciones` | lo que se le hace a **varias** filas, o lo que **no se usa a diario** | «Eliminar todos» de Recordatorios, «Exportar CSV» de Clientes y de las respuestas de una reserva, los tres enlaces sueltos del editor de formularios |

**Un botón que gasta ancho y no se usa a diario va dentro del `⋯`.** El editor
de formularios tenía cuatro botones con su palabra —Registros, Configuración,
Ver, + Campo— y en 1024 px no cabía el buscador.

### Borrar en bloque es UNA acción de servidor, no N llamadas

Es la parte que no se puede ablandar, y no es una preferencia de estilo:
**Next serializa las acciones de servidor de una misma página** —una en vuelo,
la siguiente espera—, así que veinte borrados desde el navegador son veinte
idas y vueltas **en fila india**. Con una lista seleccionada de verdad eso son
minutos de un diálogo en «Eliminando…».

Así que cada pantalla tiene su `eliminar…Action(ids)`, que recibe **el arreglo**
y devuelve un `ResumenDelBorrado` (`lib/borrado-en-bloque.ts`). Cuatro cosas:

1. **La lista que llega del navegador se sanea** (`comoListaDeIds`): se quitan
   los repetidos —que no borran dos veces pero sí inflan el número que se le
   devuelve a la persona—, lo que no sea una cadena, y se acota a
   `TOPE_DE_IDS`. Sin tope, un `IN (…)` de cien mil ids es una consulta que
   ningún índice ordena.
2. **Cada acción lleva SU puerta**, la misma que ya tiene el borrado de una
   fila en esa pantalla. `eliminarClientesAction` llama a `deleteUser` una a
   una a propósito: reescribir su comprobación y su borrado en dos fases sería
   un segundo borrado que el día que se afine el de al lado se queda atrás — y
   esto borra cuentas de clientes.
3. **Lo que no se pudo borrar se CUENTA y se dice.** Un «listo» sobre veinte
   filas de las que se fueron dieciocho es peor que un error: nadie vuelve a
   mirar. `AccionesMasivas` lo pinta con los números delante.
4. **En serie, nunca en paralelo** (`borrarUnaAUna`). El pool de Prisma es de
   diez por proceso y son los mismos turnos que atienden la bandeja de Chats.

### El `⋯` sale SIEMPRE, y `puedeEliminar` quita la opción

Dos cosas que se deshacen solas si no están escritas:

1. **El botón no aparece y desaparece según lo que haya marcado.** Uno que se
   va mueve de sitio al de al lado justo cuando se va a pulsar; y con la barra
   vacía nadie descubre que la pantalla tiene acciones masivas. Sin nada
   marcado, el menú lo dice en una línea — un menú que se abre vacío parece
   roto.
2. **`puedeEliminar` no pinta la opción en gris: la QUITA.** Una opción apagada
   invita a preguntar por qué no se puede, y la respuesta —«tu rol no borra»—
   no cabe en un menú.

Y el permiso lo resuelve **la puerta que esa pantalla ya tiene**, no una
condición nueva: en Plantillas es `assertCanManageTemplates`, en Clientes el
mismo rol que decide su menú de fila. Escribir aquí una condición propia es lo
que dejó fuera a media gente en Clientes, en Equipo y en Analíticas.

De ahí sale una asimetría a propósito: **`/panel/clientes` y `/admin/clientes`
no abren a la misma gente** —aquella deja al `reseller`, esta no—, así que sus
casillas tampoco. Lo que no puede pasar es que **la casilla de una fila y el
«Eliminar» de su menú salgan por separado**: una columna de casillas en una
pantalla donde no se puede borrar es ofrecer marcar filas para nada. Por eso el
gate es una función pura y compartida, `lib/rol-que-gestiona-clientes.ts`, y no
la condición escrita en cada fichero.

### Marcar «todo» marca lo que se VE, no lo que hay

`useSeleccionMultiple` —para las listas que no son una tabla de TanStack, que
son media plataforma— acota la selección a los ids visibles, y en las tablas
`getSelectedRowModel()` ya devuelve las del modelo **filtrado**. Las dos mitades
dicen lo mismo: marcar «todos» con un filtro puesto y que se borre lo que está
escondido es la peor sorpresa posible, y no se deshace.

Y lo que se marcó y ya no está —se borró, o lo escondió un filtro— **deja de
contar**: el menú diría «eliminar 5» y se llevaría por delante una fila que
quien mira no tiene enfrente.

### Medido en Chromium, sobre el CSS del build

Las tres formas que convivían, y la misma barra después. `crear →` es a cuántos
píxeles del borde derecho queda el botón azul; el `⋯` va siempre pegado (0):

| | ventana | alto | crear → | ¿hay `⋯`? |
| --- | --- | --- | --- | --- |
| **antes** Clientes | 1440 / 1280 / 1024 | 40 | **749 / 589 / 333** | sí |
| **antes** Módulos | 1440 / 1280 / 1024 | 40 | 0 | **no** |
| **antes** Plantillas | 1440 / 1280 | 40 | 396 / 236 | no |
| **antes** Plantillas | **1024** | **84** | — | no |
| **ahora** las tres | 1440 / 1280 / 1024 | **40** | **48** | sí |

Tres cosas que dice esa tabla y no se ven mirando la pantalla:

1. **En Clientes el azul estaba a 749 px del borde**, o sea pegado al buscador y
   en mitad de la barra. Ahora está a 48 —el ancho del `⋯` más su hueco— en las
   tres anchuras.
2. **En Módulos el azul ocupaba la esquina** porque no había `⋯` que la
   ocupara. La esquina es del icono pequeño, no del botón que ya destaca solo.
3. **Y en Plantillas la barra DOBLABA de alto a 1024** —40 px a 84— porque el
   `flex-wrap` se llevaba el botón a una segunda fila. Eso son 44 px que se le
   quitan a la tabla justo en la ventana más estrecha, y es exactamente el alto
   que la vuelta de las métricas acababa de recuperar.

Ninguna de las seis medidas desborda a lo ancho.

### El segundo lote, y las dos que sí se partían

Al pasar el resto de las pantallas se buscó a propósito el fallo de Plantillas
—la barra que dobla de alto a 1024— y apareció **en dos**, medidas igual, sobre
el CSS del build:

| | ventana | alto | el azul, a … del borde | desborda |
| --- | --- | --- | --- | --- |
| **antes** Macros | 1440 / 1280 | 40 | 0 px | no |
| **antes** Macros | **1024** | **84 px** | — | no |
| **antes** Ventas | 1440 / 1280 / 1024 | 40 | **−491 px** | **sí** |
| **ahora** las dos | 1440 / 1280 / 1024 | **40** | **48 px** | no |

Y la segunda es peor que la de Plantillas: en Ventas el `justify-between` con
cuatro botones a la derecha —«Eliminar (N)», «Eliminar todas», «Columnas» y el
azul— **empujaba el de crear 491 px FUERA de la caja**, en las tres anchuras. La
página se desplazaba a lo ancho y el botón de crear no se alcanzaba. No se ve
mirando la pantalla con pocas filas: los dos rojos solo salen con algo marcado.

Los dos rojos sueltos eran además el caso de libro de lo que va en el `⋯`: son
acciones sobre VARIAS filas, compitiendo por sitio con el único botón que crea.

### Lo que NO es una pantalla de lista, y por qué no entra

Tres de las que se nombraron no tienen lista debajo, así que no se les puso
barra ni acciones masivas — forzarlas sería inventar una selección de nada:

| | qué es de verdad |
| --- | --- |
| **Landing** | un editor de configuración con sus botones de Guardar y dos interruptores de sección |
| **Monitoreo VPS** (`/panel/evo`) | tres ranuras de servidor fijas más una herramienta de instancias huérfanas; `/evo` es un iframe |
| **Resellers** | dos columnas de asignación; su acción destructiva sería «quitar del reseller», que no es borrar un cliente |

## Las métricas van en la BARRA, no en tarjetas encima de la lista

Veintidós pantallas de lista abrían con una fila de `MetricCard` a todo lo
ancho —«Total», «Activos», «Vencidas»…— y debajo su barra de filtros. Medido en
Chromium sobre el CSS del build, en Clientes: la cabecera pasa de **120 px a
56 px**, o sea **64 px** que recupera la tabla, y **la barra no crece** (56 px
antes y después, sin desbordar a lo ancho). El mismo número a 1440, 1280 y
1024, porque lo que se quita es una fila de alto fijo.

Y no era una pantalla: era el mismo bloque copiado veintidós veces, cada una un
poco distinta —unas con `grid`, otras con `flex-wrap`, unas con `mb-2` y otras
sin él—.

> **Cómo se ve una métrica lo decide `components/shared/PastillasDeMetricas.tsx`;
> cuáles son, la pantalla.** Es la única razón por la que esto no son veintidós
> implementaciones: el día que se afine el alto, el color o el tooltip se afina
> ahí y salen todas.

Las tres reglas de una pastilla:

1. **Si la pantalla tiene un filtro equivalente, la pastilla filtra**, y se
   pinta puesta cuando ese filtro está activo. Sin `alPulsar` es un `<span>`
   —y eso **solo** para una cifra que acompaña a las que sí filtran; una que no
   filtra nada se borra, ver la vuelta siguiente—: **nada que no haga nada se
   pinta como pulsable**, que es lo que enseña a no pulsar el resto. En Leads
   eso además arregló un fallo de paso —las tarjetas
   ya filtraban, con un `onClick` sobre un `div`: sin rol, sin teclado y sin que
   se viera cuál estaba puesto—.
2. **Lo que ya está en la barra no se repite.** En Clientes, cuatro de las cinco
   tarjetas ya estaban como pastillas (`ClientStatusPanel`); solo se sumó
   «Activos», con su filtro. En Tareas, «Completadas» no entró porque la barra
   ya tiene su botón con el mismo número **y encima filtra**. Dos pastillas con
   la misma cifra una al lado de otra no son redundancia: son dos números que
   alguien va a comparar.
3. **La etiqueta va en el tooltip, no al lado del número.** Con la etiqueta
   escrita, cinco pastillas ocupan más que la fila que vienen a quitar.

Dos cosas más que hay que mantener:

- **El `TooltipProvider` va DENTRO del componente.** Radix revienta si un
  `Tooltip` no tiene provider encima, y de las veintidós pantallas solo unas
  pocas lo montaban. Olvidarlo sería una pantalla en blanco, no un tooltip que
  no sale. Anidarlo donde ya existe es inofensivo: manda el de dentro.
### Y la segunda vuelta: no queda NINGUNA tarjeta, y la que no filtra se borra

La primera vuelta dejó fuera siete pantallas —CRM, Analíticas, los dos
Créditos, los dos Afiliados y Mis estadísticas— con el argumento de que «ahí
las métricas son el contenido». **Puestas una al lado de otra no se sostenía**:
eran la misma fila de tarjetas encima de otra cosa, y la plataforma se leía
como dos plataformas. La regla se cerró, y ahora es una sola frase:

> **Si la métrica filtra la lista de abajo, es una pastilla en la barra. Si no
> filtra nada, se BORRA.** No hay tercera opción: ni tarjeta, ni pastilla
> apagada, ni un `<span>` con el número. `components/custom/MetricCard.tsx` ya
> no existe.

Lo que cambia respecto a la primera vuelta es el segundo tramo. Antes se
admitía una pastilla sin `alPulsar` para acompañar a las que sí filtran, y eso
se queda **solo para eso**: acompañar. Un total suelto —«Total usuarios»,
«Total instancias», «Referidos»— se va entero, porque ocupa la única fila que
escasea para contestar algo que la lista de abajo ya contesta.

Y el criterio para decidirlo no es la pantalla, es la pregunta: **¿hay debajo
un filtro que deje esa misma cifra?** De ahí salieron las dos mitades:

| se convierte en pastilla | se borra |
| --- | --- |
| No pagaron, En prueba, Vence pronto (Instancias) | Total usuarios, Resellers, Ingresos 12m (Analíticas) |
| Salientes, Entrantes (Llamadas del CRM) | Total créditos, Consumidos, Disponibles, % Uso (los dos Créditos) |
| | Referidos, Por cobrar, Total ganado, Tasa (Afiliados) |
| | Total/Activos/Suspendidos/Ingresos (Mis estadísticas) |

Cuatro cosas que hay que mantener:

1. **Una pastilla que filtra tiene que poder ENSEÑAR su número.** Es por lo que
   las dos de follow-ups del CRM se fueron en vez de convertirse: contaban
   seguimientos por estado, no registros, así que pulsando el filtro la lista
   nunca habría dado esa cifra. Es la regla de *un filtro que ofrece un número
   tiene que poder llegar a él*, aplicada antes de convertir.
2. **Lo que se borra no se pierde si ya estaba dos veces.** «Total registros»
   es la pestaña «Todos (N)»; «Referidos» es el título «Referidos (N)» de su
   propia lista; la tasa de comisión está en la línea del encabezado. Eso se
   comprueba **antes** de borrar, y se escribe al lado del hueco.
3. **Y si de verdad desaparece un dato, se dice en el diff y en el informe.**
   De esta vuelta desaparecieron tres: «Por cobrar» y «Total ganado» del panel
   del afiliado —sus importes siguen comisión a comisión en la lista— y
   «Contestadas» en Llamadas, cuya duración media se leen ahora en el tooltip
   de «Total». Vuelven como pastillas el día que sus listas tengan filtro.
4. **`deslizable` para que la barra no crezca.** Cuatro pastillas más el
   buscador y dos botones parten la barra en dos filas por debajo de 1280. Con
   `deslizable`, `PastillasDeMetricas` va dentro de `BarraDeslizable` —el mismo
   carril con flechas de las pestañas del panel— y lo que no cabe se desplaza.
   Medido: la barra mide lo mismo antes y después en las ocho pantallas.

Medido en Chromium sobre el CSS de los DOS builds —el de antes y el de
después—, que es la única forma de que el número signifique algo: las clases
que se van con las tarjetas (`sm:grid`, `sm:py-3`) dejan de existir en el CSS
nuevo, así que midiendo el «antes» con la hoja nueva la fila sale a cero y se
estaría midiendo el propio cambio. El alto recuperado es **el mismo a 1440,
1280 y 1024** —la fila de tarjetas es de alto fijo, 56 px, y lo que varía es el
hueco del contenedor—:

| pantalla | antes | después | recupera |
| --- | --- | --- | --- |
| Panel › Instancias | 112 px | 48 px | **64 px** |
| CRM (las cinco vistas) | 122 px | 58 px | **64 px** |
| Panel › Créditos | 64 px | 0 px | **64 px** |
| Panel › Analíticas | 72 px | 4 px | **68 px** |
| Panel › Mis estadísticas | 68 px | 0 px | **68 px** |
| Admin › Créditos | 288 px | 216 px | **72 px** |
| Afiliados y Panel › Afiliados | 152 px | 80 px | **72 px** |

Y **ninguna pantalla se queda vacía**: debajo de las siete queda su gráfica, su
formulario o su lista. La única que habría quedado en blanco era Créditos, y no
lo hace porque el formulario que edita esos mismos dos números sigue ahí.

### Y la tercera vuelta: la cabecera de Finanzas

Quedaban cuatro fuera del barrido y por el mismo motivo de siempre: no estaban
encima de una lista, estaban en una **cabecera pegada arriba** —Ingresos,
Gastos, Balance y Transacciones, en todas las pantallas de Finanzas—. Da igual:
la pregunta no cambia. **No filtraban nada, y los sitios a los que llevaban ya
estaban en la fila de accesos de abajo** (Ventas, Compras, Cuentas). Cuatro
cifras sueltas que no se pueden usar, ocupando la fila que le falta a la tabla.

Medido en Chromium sobre el CSS del build —las clases del «antes»
(`md:grid-cols-4`, `h-12`, `gap-2`) **siguen existiendo** en la hoja nueva
porque las usan otras pantallas, así que las dos medidas valen sobre la misma:

| ventana | antes | después | recupera |
| --- | --- | --- | --- |
| 1440 / 1280 / 1024 | 105 px | 49 px | **56 px** |
| 390 | 53 px | 49 px | 4 px |

En el teléfono solo son 4 px porque la fila ya iba `hidden` ahí: lo que se
recupera es el hueco del `space-y-1` que sobraba con un solo hijo. El `py-1` se
queda — es la separación entre bloques que ya había, no hueco muerto.

Y de paso **se cayó `/api/finance/overview`**, que existía solo para alimentar
esas cuatro tarjetas y no lo llamaba nadie más. Es además una de las rutas que
este documento nombra como «protegidas solo por el middleware» en la regla de
Next: una menos.

**`FinanceOverviewHeader` dejó de ser un componente de cliente**, porque lo era
solo por ese `fetch`. El mes lo lee `FinanceModuleShortcuts` de la URL por su
cuenta, como ya hacía cuando no se le pasaba la prop.

## Finanzas de la familia: se elige qué se suma, y sumar monedas distintas NO

Cada cuenta lleva su contabilidad aparte —`financeTransaction` escopa por
`userId`, ver `lib/finance-user.ts`— y eso no cambia. Lo que faltaba es que
quien administra la familia pudiera ver las de sus cuentas hijas sin ir
entrando una por una.

El selector deja **elegir una, o marcar varias y consolidarlas**. Y es una
elección y no una suma automática a propósito: en la cuenta madre conviven las
finanzas de la casa con las personales, y no siempre se quieren mezclar.

**Lo que decide vive en `lib/finanzas-de-la-familia.ts`, puro**, y eso es lo que
impide que la pantalla y el servidor discrepen: la misma función dice qué se
ofrece y qué se consulta.

### La regla que no se puede ablandar: con monedas distintas no hay total

Cada cuenta tiene su `preferredCurrencyCode`. Sumar pesos con dólares da una
cifra **perfectamente creíble** y que no significa nada — que es la peor clase
de error, porque nadie la mira dos veces. Es la familia del «999999999 de -1
créditos» que ya salió por WhatsApp a una clienta.

> Con monedas distintas **el desglose sale igual** —cada fila en la suya, que es
> cierta— y **el total no sale**, con el motivo al lado. Y **tampoco salen el
> resumen anual ni la gráfica**, porque las dos SUMAN las cuentas elegidas: lo
> que no se puede calcular no se sustituye por otro número, ni se dibuja.

Es el caso raro —la familia de hoy es toda COP— y precisamente por eso hay que
dejarlo cerrado: una rama que solo se equivoca con datos que todavía no
existen es la que nadie prueba.

### Cinco cosas más que hay que mantener

1. **Sin selección se consulta la cuenta propia, no la familia entera.** Es lo
   que hace que esto **no cambie nada** para quien no toca el selector, ni para
   las cuentas hijas, que no lo ven. Y volver a «Solo mi cuenta» **quita el
   parámetro** en vez de escribirlo: la URL limpia es la que ya funcionaba.
2. **Lo que llega del navegador no decide a qué se llega.** Las cuentas viajan
   en la URL (`?cuentas=a,b,c`), así que se filtran contra la familia **en el
   servidor** (`resolverLasCuentasDeFinanzas`). Esconder el selector no cierra
   la petición directa — es la misma regla de los canales que cruzan cuentas.
3. **Las tres condiciones del selector**, y hacen falta las tres: manda en su
   cuenta (`canManageWorkspace` — un `agente` participa, no administra), es la
   cuenta **madre** de su familia, y la familia tiene **más de una** cuenta. Un
   selector con una sola opción dentro no filtra nada.

   **Las tres estaban bien y el selector no se pintaba nunca** (#811). La que
   fallaba era la segunda, y no por su culpa: `laFamiliaDeLaCuenta` daba por
   hecho que `linked_accounts` es un árbol, y en producción es una malla con
   enlaces recíprocos, así que **la cuenta madre colgaba de su propia hija** y
   `esLaCuentaMadre` salía `false` para las cinco. Está contado entero en *y
   `linked_accounts` NO es un árbol: es una MALLA, con ciclos*. **Si el selector
   vuelve a no salir, se mira ahí antes que aquí**: estas tres condiciones son
   una línea que no tiene nada que decidir por su cuenta.
4. **Las cuentas elegidas viajan en los enlaces de la rejilla anual.** Sin eso,
   pulsar un mes deshacía la consolidación sin decir nada.
5. **Vaciar sigue siendo SOLO de la cuenta propia.** `wipeFinanceTransactions`
   no recibe ninguna cuenta y escopa por `getFinanceUser()`. Que se puedan
   *mirar* cinco cuentas a la vez no puede convertir ese botón en uno que borre
   cinco contabilidades.

### Dónde responde el selector, y dónde no

**Solo en `/dashboard/finance`**, que es donde están el resumen anual y la
gráfica. No se puso en la cabecera —donde se vería en todas las pantallas de
Finanzas— justamente por eso: las listas de Ventas, Gastos, Clientes y
Proveedores **no** lo respetan, así que un selector visible ahí sería un filtro
que promete algo que la pantalla de al lado no hace. Es el «menú abierto,
puerta cerrada» que este repositorio ya pagó en Clientes, en Equipo y en el
panel. Si algún día esas listas tienen que consolidar, el selector sube a la
cabecera **con ellas**, no antes.

Medido en Chromium sobre el CSS del build: el selector se topa en 256 px
(`max-w-[16rem]`) y recorta el nombre largo en las tres anchuras; la tabla del
desglose va `table-fixed` con `min-w-[34rem]` y **solo se desplaza por debajo de
768 px**, que es preferible a recortar los números que se vienen a leer. La
página no desborda a 1440, 1280, 1024 ni 390.

## La barra de pestañas se corta: flechas, y la activa se trae sola

La barra del panel del súper administrador —Informes, Actividad, Operaciones,
Proyectos, Tickets, Diagramas, Clientes, Instancias, Analíticas, Finanzas y las
que vengan— **se cortaba sin decirlo**. Iba dentro de un `ScrollArea` de Radix,
cuya barra de desplazamiento solo sale al pasar el cursor, así que lo que se
veía era la última pestaña partida por el borde y ninguna señal de que hubiera
más: la única forma de enterarse era arrastrar por si acaso. En un táctil, ni
eso.

Vive en `components/shared/BarraDeslizable.tsx`, y lo usan **las tres** barras
de pestañas que hay —`PanelAwareTabNav` y los dos `AdminTabNav`—. Los dos
últimos no los importa nadie hoy; se alinean igual, por el mismo motivo por el
que se arregló el `SheetFooter` que tampoco usaba nadie: el día que alguien
monte una barra con ellos, saldría distinta de la que sí se ve.

Cuatro cosas que hay que mantener:

1. **Las flechas salen solo donde hay algo.** Una flecha que no lleva a ninguna
   parte es ruido y enseña a no pulsarlas. Y se recalcula al desplazar, al
   cambiar de tamaño **y al cambiar la lista**: las pestañas dependen de los
   permisos de cada persona y del plan, así que hacen falta **dos**
   `ResizeObserver` —el del carril y el de su contenido—. Con solo el del
   carril, quitar una pestaña dejaba la flecha derecha puesta sobre un carril
   que ya cabía entero.
2. **La activa se trae ENTERA, descontando el ancho de la flecha.** Una pestaña
   justo debajo de la flecha está «visible» y no se lee. Y el hueco solo se
   descuenta del lado donde de verdad hay flecha, o la primera pestaña saldría
   con un margen que nadie pidió.
3. **Nada de `scrollIntoView`.** Es la forma corta y desplaza **todos** los
   antepasados: con la barra pegada arriba (`sticky`), la página entera daba un
   salto vertical al cambiar de pestaña. Se calcula el `scrollLeft` y se mueve
   solo el carril.
4. **Al montar, sin animación; después, suave.** Una barra que se desliza sola
   nada más abrir la página se lee como un fallo de pintado. Y se trae también
   **al recibir el foco**, que es lo que evita que tabulando con el teclado el
   foco se vaya a un sitio invisible.

Y la pestaña activa viaja en **estado**, no en un `useRef`: un ref no vuelve a
disparar el efecto, así que al cambiar de pestaña el carril se quedaría mirando
a la anterior.

## Los paneles laterales: UNA medida para toda la plataforma

Convivían **tres anchos** para lo mismo, y uno al lado de otro se ve a la
primera:

| ventana | lista de Chats | ficha de Contacto | copiloto |
| --- | --- | --- | --- |
| 768 | 320 | 320 | 440 |
| 1024 | 352 | **320** | 440 |
| 1280+ | 384 | **320** | 440 |

La lista baja con la ventana, la ficha se quedaba clavada en 320 desde 768 —así
que la columna derecha de Chats salía más estrecha que la izquierda— y los dos
paneles del borde iban a 440 siempre.

> **Manda la escala de la LISTA DE CHATS** —18/20/22/24 rem—, y vive en
> `--ancho-lateral` (`app/globals.css`). La usan los cuatro: la lista, la ficha
> de Contacto, el copiloto y el chat del equipo. **Si hay que cambiar el ancho
> de un panel, se cambia ahí.** Escribirlo a mano en uno es volver a tener tres.

Y las clases de la forma —dónde arranca, hasta dónde baja, el borde, la
sombra— se escriben **una vez**, en `lib/panel-lateral.ts`. El copiloto y el
chat del equipo las importan.

### El alto de la barra NO está escrito: se mide

Los paneles arrancan justo debajo de la barra de arriba, y **la barra no tiene
altura declarada**. Va con `h-18`, que no existe en la escala de Tailwind —salta
de 16 a 20—, así que esa clase **no hace nada** y el alto lo pone el contenido.

Poner un número sería copiar a ojo algo que cambia con el zoom, con el tamaño de
letra del navegador y el día que se añada un botón a la barra. Y de eso depende
lo único que no puede fallar: con un número de menos, **el panel tapa el
buscador y la campanita**.

Lo mide `MedidaDeLaBarra` con un `ResizeObserver` y lo publica en
`--alto-de-la-barra`, sobre `document.documentElement` — los paneles son
`fixed`, no cuelgan de la barra en el árbol, así que la variable tiene que
llegarles esté donde esté cada uno.

### En Chats acomodan; fuera, se superponen

La ficha de Contacto ya acomodaba la conversación porque es un hermano del flex.
El copiloto y el chat del equipo cuelgan del layout y no pueden ser hermanos de
nada, pero el contenedor de la bandeja ya lleva `data-chat-view`: con un panel
abierto se le reserva la franja por la derecha (`padding-right`). El efecto es
el mismo y no hay que mover ningún panel de sitio. **Fuera de Chats la regla no
aplica** —está acotada a ese atributo—, así que el panel se abre encima sin
empujar ni encoger nada.

Y de ahí salieron dos cosas que solo se ven midiendo:

1. **La conversación se quedaba en CERO.** Con la ficha abierta *y* un panel,
   los tres anchos no caben y el que desaparecía era justo el del medio:
   quedaban dos columnas de fichas, una al lado de otra, sin nada que leer entre
   ellas. La conversación tiene **suelo** (`md:min-w-[15rem]`) y quien cede es
   la ficha, que enseña datos que no cambian mientras se habla.
2. **La ficha se superpone mientras haya un panel abierto.** No es una
   preferencia: **no caben**. Medido en Chromium, los cuatro en fila necesitan
   ~1.400 px. Superponerse es lo que la ficha ya hacía en un móvil
   (`absolute inset-0` con `md:static`), así que no es un comportamiento nuevo.
3. **La franja se reserva DONDE CABE**, de `lg` para arriba: la lista (22rem)
   más el suelo (15rem) más el panel (22rem) son 944 px y entran en 1.024. Por
   debajo el panel se abre encima, como en el resto de la plataforma. Acomodar
   lo que no cabe es dejar la conversación sin sitio, que es peor que taparla
   un rato.

Medido con los dos paneles abiertos: 1440 → 672 px de conversación; 1280 → 512;
1024 → 320; y por debajo, superpuesto.

### Y Tailwind NO mira `lib/`

Esto casi se despliega roto y el build pasó limpio. Las clases de
`lib/panel-lateral.ts` no generaban **ni una** regla: `content` de
`tailwind.config.ts` listaba `pages`, `components`, `app` y `src`, y **no
`lib`**. Los paneles habrían salido sin ancho, sin `top` y sin alto, o sea
invisibles, sin un solo error en ninguna parte.

Se añadió `./lib/**/*.{ts,tsx}`. Y la forma de comprobarlo, que es la que lo
cazó: **buscar la DECLARACIÓN en el build, no la clase en el código.**

```
npm run build && grep -oF "top:var(--alto-de-la-barra)" .next/static/css/*.css | wc -l
```

Cero significa que esa clase no existe en producción. Es la misma familia que la
regla de `removeConsole`: el código llega, lo que no está es lo compilado.

## Chat de equipo: CANALES y DIRECTOS, no un hilo único

Un hilo único por cuenta no aguanta un equipo de verdad: ventas lee lo de
desarrollo, desarrollo lee lo de marketing, y **el ruido cruzado hace que se
abandone**. Un chat que se abandona es peor que no tenerlo, porque lo que se
escribe ahí ya no lo lee nadie.

**La tabla no se rehace.** `team_chat_messages` recibe `canalId` con
`ADD COLUMN IF NOT EXISTS`, y las filas que ya estaban —con `canalId` nulo— son
el canal **general**. Sin backfill y sin dos clases de mensaje. Comprobado
contra Postgres con mensajes viejos dentro: sobreviven, y el general se lee con
`("canalId" IS NULL OR "canalId" = 'general')`. **Sin esa condición el general
sale vacío el día del despliegue y parecen borrados.**

Dos tablas nuevas de la App, con `CREATE TABLE IF NOT EXISTS` y sin clave
foránea, como `task_comments` y `tickets_de_soporte`: `team_channels` y
`team_channel_members`.

**Las tres decisiones que conviene no deshacer:**

1. **El general no tiene lista de miembros.** Es de toda la cuenta y punto, y
   **no es una fila**: es la constante `CANAL_GENERAL`. Con filas habría que
   crearlo en cada cuenta, acordarse de hacerlo en las que ya existen y meter a
   cada persona nueva — y el día que se olvide alguien se queda fuera del único
   canal donde está todo el mundo, que no se ve como un error sino como «a mí no
   me llega nada».
2. **Un directo ES un canal**, de `tipo: "directo"` y dos miembros. Así los
   mensajes, las menciones, los avisos y el lector del hilo son **los mismos**:
   no hay una segunda tubería que mantener a la par. Su identidad es la pareja
   **ordenada** (`llaveDelDirecto`), con índice único parcial por cuenta: el
   directo de A con B y el de B con A son el mismo, y cada uno lo abre desde su
   lado. Sin ordenar saldrían dos canales con los mismos dos miembros y la mitad
   de los mensajes en cada uno — que desde fuera se lee como «me escribió y no
   me llegó». Comprobado insertando los dos lados: el segundo no crea nada, y
   otra cuenta sí puede tener la misma pareja.
3. **Quién manda es la puerta que ya existe**, `canManageWorkspace`: dueño,
   `administrador` y superadministrador de verdad; el `agente` participa pero no
   manda. Escribir aquí una condición nueva es lo que dejó fuera a media gente
   en Clientes, Equipo y Analíticas.

### El espacio es la FAMILIA, no la cuenta: `ownerId ?? id` no sube a la madre

Esto se desplegó partido y **nadie veía un error**. Desde Grupo Verzay se
escribía en General y la gente de Verzay | Atencion no lo veía; ellos escribían
en el suyo y tampoco llegaba. Cada uno veía **solo lo que él mismo había
escrito**.

No era una asimetría entre escribir y leer —las dos usan el mismo id—: es que
**el id no es el mismo para cada persona**.

| quién | su fila | `cuentaId` del hilo |
| --- | --- | --- |
| Grupo Verzay | cuenta raíz, sin `ownerId` | `grupo` |
| Yair, administrador de Verzay \| Atencion | `owner_id` = Atencion | `atencion` |

Una cuenta se cuelga de otra por **dos caminos** y solo uno deja rastro en la
fila: `owner_id` —una persona del equipo, o una sub-cuenta creada desde Equipo—
y **`linked_accounts`**, una cuenta que ya existía y se vincula. Verzay |
Atencion es del segundo tipo: de primer nivel, sin `owner_id`. Así que
`ownerId ?? id` **nunca sube a la madre** y salían dos Generales.

Y lo que lo convierte en fallo y no en diseño: **`getTeamAdvisorInfos` SÍ
cruza**. Desde Grupo Verzay devolvía «Verzay | Atencion» como gente
mencionable, o sea que la lista de a quién se podía mencionar **alcanzaba más
lejos que el hilo donde caían los mensajes**. Es literalmente lo que la regla de
la sección anterior prohibía; el camino de las vinculadas se la saltaba.

> **El espacio del chat es la FAMILIA**: la cuenta raíz y sus vinculadas
> (`laFamiliaDeLaCuenta`, `lib/familia-de-cuentas.ts`). El General **se escribe
> bajo la raíz y se lee sobre toda la familia**, y la gente mencionable sale de
> los equipos de todas sus cuentas.

Las dos mitades hacen falta y cada una arregla una cosa:

- **Escribir bajo la raíz** hace que converja: a partir de ahora todo cae en un
  sitio.
- **Leer sobre la familia** hace que **lo que ya se escribió no desaparezca**.
  Los mensajes viejos siguen bajo la cuenta con la que se escribieron; leyendo
  solo bajo la raíz se habrían esfumado el día del despliegue, que es peor que
  el fallo que se venía a arreglar. **Sin migración y sin tocar ni una fila.**

Comprobado contra Postgres con las cinco cuentas reales: antes cada lado veía
**1 mensaje**; después los tres —madre, Atencion y Ventas— ven **4**, los viejos
incluidos, y **una cuenta ajena a la familia ve 0**.

Tres cosas que hay que mantener:

1. **`owner_id` sube, pero NO baja.** Por esa columna cuelga **gente del
   equipo**, no cuentas. Bajando por ahí, la familia de una empresa se llenaría
   de asesores y el selector de Finanzas los ofrecería como si fueran cuentas.
   Se sube de una persona a su cuenta y a partir de ahí solo se camina por
   `linked_accounts`.
2. **Todos los miembros tienen que calcular la MISMA raíz.** Es lo único que
   hace que el hilo no se parta, y la primera versión no lo cumplía — ver la
   sección de abajo.
3. **Un fallo al resolver la familia no lanza, pero no es mudo.** Se sigue con
   la cuenta sola, que es el lado seguro —se ve de menos, nunca de más—; y se
   escribe, porque una familia recortada se nota como «mis mensajes no le llegan
   a nadie».

### Y `linked_accounts` NO es un árbol: es una MALLA, con ciclos

Esto se escribió al revés y lo desmintieron los datos de producción. La sección
de arriba decía «un solo nivel, a propósito: `linked_accounts` modela *esta
cuenta cuelga de esta otra*, no un árbol». **La tabla no modela eso.** Modela
«esta cuenta le dio acceso a esta otra», y eso se usa en los dos sentidos.

Medido contra la base, solo lectura:

- De las **13 filas** que hay en toda la plataforma, **8 son parejas
  recíprocas** (`A -> B` y `B -> A`). No es el accidente de una cuenta: es cómo
  se usa la tabla.
- En la familia de la casa, **diez filas** cruzan cinco cuentas: la madre
  vinculó a las cuatro bajo la suya el 13-09, dos de ellas —Ventas y
  Notificaciones— la habían vinculado a ella en agosto, y hay tres enlaces
  sueltos entre hermanas.

Con una malla, «¿de quién cuelgo?» **no tiene una respuesta**: casi todas
cuelgan de alguien. Y la consulta se quedaba con la primera por `id ASC`, o sea
**el orden alfabético de un uuid**. Los tres daños, y los tres mudos:

| | qué salía |
| --- | --- |
| la raíz | **tres distintas** para una sola familia, según desde dónde se preguntara |
| la madre | **ninguna**: la casa colgaba de su propia hija, así que `esLaCuentaMadre` era `false` para las cinco |
| el tamaño | **3, 5 o 2** cuentas para la misma familia de cinco |

Y de ahí salieron dos fallos que no se parecen entre sí:

- **El selector de cuentas de Finanzas no se pintaba nunca** (#811), porque pide
  ser la madre. Ese fue el síntoma reportado.
- **El General volvió a partirse**, en silencio: medido en producción, Verzay |
  Ventas veía **3 de los 8** mensajes del hilo. Es literalmente el fallo que la
  sección de arriba dice haber arreglado, reaparecido por la otra puerta.
- Y **nadie podía repartir un canal entre cuentas**, por lo mismo.

**La familia es ahora el COMPONENTE entero**: todo lo que esté unido por
`linked_accounts`, en los dos sentidos, con un `UNION` recursivo. El `UNION`
deduplica contra lo acumulado, así que **termina aunque haya ciclos** — que era
justo lo que la nota anterior temía de un bucle escrito a mano. Medido: el
componente mayor de la plataforma son **5** cuentas, y solo dos cuentas cambian
de tamaño de familia con esto.

**Y quién manda sale de los enlaces, no del orden de los ids:**

> **Manda quien más cuentas vinculó BAJO la suya**, y a igualdad, la de `id`
> menor (`laRaizQueManda`, `lib/raiz-de-la-familia.ts`, puro).

No se inventa ninguna jerarquía: se cuenta lo que cada cuenta **declaró** al
vincular a otra. Y lo que la hace utilizable es que es una **función pura del
conjunto** —los mismos miembros y los mismos enlaces—, así que las cinco
calculan la misma raíz. En una familia normal —una madre que vinculó a sus
hijas y nadie más— la madre tiene N y las hijas 0, así que **sale la misma raíz
que antes**: esto solo cambia algo donde los enlaces van en los dos sentidos.

Cuatro cosas que hay que mantener:

1. **El desempate por `id` menor no es decoración.** Sin él, dos cuentas
   empatadas podrían elegir raíces distintas según el orden en que llegaran las
   filas, y el hilo se partiría otra vez.
2. **Un enlace repetido no vota dos veces**, y uno hacia fuera de la familia no
   vota. Si no, una fila duplicada le ganaría a quien de verdad vinculó a dos.
3. **La PERSONA por la que se pregunta entra en `cuentas` pero no compite por
   la raíz.** Sin esa separación, preguntar desde un asesor de una cuenta sin
   vinculadas devolvería al asesor como raíz y su propia cuenta dejaría de ser
   la madre.
4. **El tope (`TOPE_DE_LA_FAMILIA`, 200) no recorta nada hoy** —el componente
   mayor son 5— y si algún día se alcanza **se dice**. Una familia recortada se
   nota como «mis mensajes no le llegan a nadie».

El banco corre en **dos modos**, con la consulta vieja y con la nueva, contra
Postgres y con la malla real sembrada dentro. La única comprobación que cambia
entre ellos es el fallo —en el modo roto se afirma que la raíz sale `Ventas`,
que la familia son 3 y que Ventas ve 3 de 8— y todo el bloque de «esto no se
puede haber aflojado» pasa **igual en los dos**: la cuenta ajena no entra, la
persona del equipo no es una cuenta, y preguntando desde una persona se sube a
la suya.

### Un canal puede CRUZAR cuentas, y entonces la pertenencia es por CUENTA

La madre reparte un canal entre sus cuentas vinculadas —Atencion, Ventas,
Notificaciones— y toda su gente lo ve **desde su propia cuenta**, sin
«Ingresar» ni cambiar de sitio.

Se monta sobre las tablas que ya había, con una más: `team_channel_accounts`
(`canalId`, `cuentaId`). **Aparte y no una fila más en `team_channel_members`**:
ahí una cuenta y una persona caerían en la misma columna —una cuenta también es
una fila de `User`— y no habría forma de saber cuál es cuál.

> **Si un canal tiene cuentas, manda la CUENTA**: quien esté en una de ellas
> está dentro, sin que nadie le haya añadido. Es lo único que funciona aquí: la
> madre **no administra** el equipo de la cuenta vinculada, así que no puede ir
> persona por persona ni acordarse de añadir a cada una que entre después.

Un canal sin cuentas es el de siempre, por persona, y **no cambia nada**. Y se
miran **las dos listas**: un canal que cruza puede tener además invitados
sueltos, y quitarle su sitio a una persona porque su cuenta no está sería una
pertenencia que cambia según por dónde se mire.

Cuatro cosas que hay que mantener:

1. **Solo la madre reparte** (`esLaCuentaMadre` más `canManageWorkspace`), y
   **solo entre las cuentas de SU familia**. Las dos mitades: sin la primera, el
   administrador de una vinculada se metería en las cuentas hermanas; sin la
   segunda, una lista que llega del navegador nombraría cualquier cuenta de la
   plataforma y su gente empezaría a leer ese canal. El administrador de una
   vinculada **participa, escribe y menciona, pero no toca la lista de cuentas**
   —`elCanal` acota por la cuenta de quien llama, así que un canal que cruza
   solo lo edita su dueña—.
2. **Los mensajes de un canal cuelgan de la cuenta DUEÑA del canal**, los
   escriba quien los escriba. Es la misma regla que ya rige en Proyectos
   compartidos, y aquí es lo que impide que el hilo se parta en tantos trozos
   como cuentas tenga dentro. Por eso la consulta de un canal **acota por su id
   y no por cuenta**: el acceso ya se comprobó antes, y añadir la cuenta de
   quien lee volvería a partirlo.
3. **Las cuentas solo se tocan si llegan.** `ponerMiembrosAction` recibe las
   cuentas como opcional: sin el campo, guardar solo la gente dejaría un canal
   que cruzaba **sin ninguna cuenta**, y desaparecería de la pantalla de todas
   menos de la suya.
4. **Un directo se crea bajo la RAÍZ de la familia.** Entre dos personas de
   cuentas hermanas, creándolo bajo la de quien lo abre saldría duplicado —uno
   por cada lado, con la mitad de los mensajes en cada uno—, que es el mismo
   fallo que la llave ordenada evita dentro de una cuenta.

### Las menciones y los avisos cuando el canal cruza

Las menciones se acotan a **la gente del canal**, que cuando cruza es la de sus
cuentas. Y los avisos **cruzan sin tocar nada**, que es lo que hace que esto
funcione sin una tubería nueva:

> `task_alerts` se lee por **`destinatarioId`** —la persona— y no por cuenta
> (`avisosPorSaltar`, `avisosDeLaCampanita`). Así que una mención en un canal
> que cruza le llega a su persona **en su propia cuenta**, sin que haya que
> saber nada de familias. El `ownerId` del aviso se guarda con la cuenta del
> canal: es contabilidad, no permiso.

Lo único que hacía falta es que **el clic aterrice**: `/chat-equipo?canal=<id>`
resuelve porque el listado dejó de ser «los canales de mi cuenta» y pasó a ser
«los de mi cuenta **más** aquellos en los que está mi cuenta»
(`canalesQueAlcanzan`). Sin eso el aviso llegaría y al pulsarlo se abriría el
General.

### Leer y escribir son dos preguntas, y en los directos NO coinciden

| | lee | escribe |
| --- | --- | --- |
| general | todo el mundo | todo el mundo |
| área | quien pertenece, **y quien manda** | quien pertenece, **y quien manda** |
| directo | los dos, **y quien manda** | **solo los dos** |

El administrador tiene acceso de lectura a todos los directos de su cuenta: es
una herramienta de trabajo, no un canal privado, y es una decisión tomada a
propósito. **No se avisa de eso en ninguna pantalla.**

Pero **leer un directo ajeno no es poder escribir en él**. Meterse a escribir en
la conversación de otros dos no es supervisar, es suplantar: el mensaje saldría
dentro de un hilo de dos con un tercero dentro, y ninguno de los dos lo
esperaría. Las dos reglas viven en `lib/canales-de-equipo.ts`, puras y probadas.

### El canal decide a quién se menciona, y el aviso lleva el canal dentro

Las menciones se acotan a **la gente de ese canal**, no a la de la cuenta: en un
canal de tres, `@` y un nombre de fuera no es una mención. Y se decide en el
**servidor**, como siempre: lo que diga el navegador sobre a quién mencionó
sería una lista de destinatarios que llega de fuera.

El aviso sigue siendo el mismo —la misma tabla, la misma ventana que interrumpe,
la misma campanita— y lo único nuevo es que **lleva el canal dentro**:
`task_alerts` recibe `enlace` con `ADD COLUMN IF NOT EXISTS`, y `aDondeLleva` lo
prefiere cuando está. Sin eso, quien te menciona en «ventas» te manda al general
y ahí no hay nada que leer.

### Y lo que llega del navegador no decide a qué se llega

El canal viaja en cada llamada, así que:

- **Al leer**, si el canal pedido no está entre los que esa persona ve, se
  contesta con el general. No se dice «no puedes»: se devuelve lo suyo.
- **Al escribir**, se comprueba que se pueda escribir **ahí**, no solo que haya
  sesión. Sin eso, cualquiera escribiría en el directo de otros dos poniendo su
  id a mano.
- **Al crear o asignar**, los miembros se filtran contra el equipo de esa
  cuenta. Una lista de fuera metería en un canal a alguien de otra cuenta, y
  entonces sus mensajes le llegarían.
- **Al renombrar**, el `UPDATE` va acotado a la cuenta **y al tipo `area`**: ni
  se renombra un canal de otra cuenta, ni se le pone nombre a un directo, que se
  llama con la otra persona. Comprobado: las dos tentativas tocan cero filas.

### El dueño de la cuenta no estaba en la lista

`getTeamAdvisorInfos` busca por `owner_id`, así que devuelve al equipo y a las
cuentas vinculadas — pero **no al dueño**, cuya fila no cuelga de nadie. Con un
hilo único eso solo significaba que al dueño no se le podía mencionar; **con
directos significa que nadie puede escribirle**, que es la mitad de para lo que
esto sirve. Se añade delante y se deduplica por id.

### Y las cuentas se colaron en DIRECTOS, que es una lista de personas

Arreglar lo de arriba metiendo las cuentas de la familia en la lista de gente
tuvo su reverso: en **DIRECTOS** empezaron a salir «Verzay | Atencion», «Verzay
Ventas» y las demás. Son **líneas**, no personas, y un directo es entre dos
personas — abrir uno con una cuenta es abrir una conversación con un sitio.

Lo decide `soloLasPersonas` (`lib/canales-de-equipo.ts`, puro), y las **dos
mitades hacen falta**:

- **Quien cuelga de una cuenta es una persona**: el equipo, que trae `owner_id`.
- **Y la cuenta RAÍZ también**, porque es el inicio de sesión del dueño:
  escribirle ahí es escribirle a él. Sin esta mitad vuelve el agujero que las
  cuentas vinieron a tapar — nadie del equipo podría escribirle al jefe.

Lo sabe la consulta, no una heurística sobre el nombre:
`(u."owner_id" IS NULL) AS "esCuenta"`, que es el mismo criterio con el que
`getTeamAdvisorInfos` reparte a unas y otras.

Y por eso la lista de gente y el **mapa de nombres** son dos cosas: `gente` son
solo personas, pero una cuenta sí puede firmar un mensaje viejo o ser la otra
parte de un directo que ya existía. Sin el mapa (`nombres`, con las cuentas
dentro) esas burbujas salían como **«Alguien»**. **Quitar a alguien de una lista
no es quitarle el nombre.**

### Un directo se encuentra porque estás DENTRO, no por la cuenta de la que cuelga

Pulsar a alguien en DIRECTOS **volvía al canal General**, siempre, y en silencio.

Las dos mitades no casaban: `abrirElDirecto` cuelga el directo de la **raíz de
la familia** —lo hace a propósito, para que entre cuentas hermanas no salga
duplicado— y la lista se pedía con `c."cuentaId" = <la cuenta de quien mira>`.
Los dos valores **solo coinciden en la raíz**, así que desde cualquier cuenta
vinculada el canal recién creado no aparecía en la lista; y como lo que se pide
y no está se contesta con el general, la pantalla se iba ahí sin decir nada. Es
la misma asimetría que partió el General en dos (`ownerId ?? id` no sube a la
madre), por otra puerta.

Medido contra Postgres con las cuentas reales, antes y después:

| quién mira | antes | ahora |
| --- | --- | --- |
| Yair (cuenta Atencion) | solo el área | sus **dos** directos y el área |
| Sofía (cuenta Ventas) | **nada** | su directo |
| administrador de Atencion | solo el área | los directos de **su** gente |
| una cuenta ajena a la familia | — | **0** |

Tres cosas que hay que mantener:

1. **La pertenencia se pregunta por la PERSONA** (`team_channel_members`), no
   por la cuenta del canal. Es lo único que no cambia según por dónde se
   entre.
2. **Supervisar sigue siendo «los directos de la gente de MI cuenta»**, y por
   eso esa rama mira `u."id" = cuenta OR u."owner_id" = cuenta`. Por la cuenta
   de la que cuelga el canal ya no vale: ahora cuelgan **todos** de la raíz, así
   que solo los leería la raíz — el administrador de una vinculada se quedaría
   sin ver los de su propio equipo, y la raíz vería los de todas.
3. **Y el caerse al general dejó de ser mudo.** Ese silencio es lo que hizo que
   un fallo se leyera como comportamiento: «pulso y vuelve al General» no se
   parece a un error. Sale `[chat-equipo] se pidió un canal que no está en la
   lista` con el canal, la cuenta y la persona.

Y un efecto de al lado que no se había reportado: en un directo que se lee **sin
pertenecer** —lo que ve quien administra— `conQuienId` se quedaba con el primer
miembro que no fuera uno mismo, aunque uno no estuviera dentro. Eso envenenaba
la lista de «con quién no he hablado todavía» y sacaba de ella a alguien con
quien no hay ningún directo. **`conQuienId` solo se calcula cuando se pertenece**;
supervisando, no hay «el otro».

### El selector de menciones no existía: la caja prometía una lista que nadie construyó

Escribir `@` no ofrecía a nadie, en ningún sitio. Y no era que la lista saliera
vacía: **no había ninguna lista**. `datos.equipo` —la gente de ese canal, que el
servidor ya calculaba y ya mandaba— solo lo consumía el diálogo de ajustes de
canal, y la caja de escribir era un `Textarea` pelado cuyo `placeholder` decía
«@ para mencionar».

O sea: la mención funcionaba **solo escribiendo el nombre exacto**, de memoria y
sin una letra de más. Y cuando no casaba, el servidor la trataba como una arroba
cualquiera: ni aviso, ni error, ni nada. **Un texto de ayuda que promete algo
que no existe es peor que no ponerlo.**

Las reglas son puras y están probadas (`lib/chat-de-equipo.ts`), que es lo que
permite comprobar la que de verdad importa:

> **El selector ofrece exactamente lo que el servidor mencionaría.** La arroba
> tiene que **abrir palabra** —ni justo detrás de una letra ni de un número—,
> que es la MISMA condición con la que `extraerMenciones` decide que
> `hola@verzay.com` no es una mención. Si las dos no estuvieran de acuerdo, la
> lista ofrecería a alguien que luego no se menciona: el texto sale, nadie
> recibe el aviso, y no hay ningún error que mirar. El banco lo prueba
> **encadenando las dos**: se elige de la lista y se comprueba que
> `extraerMenciones` devuelve a esa persona.

Cinco cosas que hay que mantener:

1. **Se ofrece `datos.equipo`, no `datos.gente`.** La gente de ESE canal, no la
   de la cuenta: en un canal de tres, ofrecer a alguien de fuera es ofrecer una
   mención que el servidor no va a reconocer.
2. **Se escribe el nombre exacto y con un espacio detrás.** Es la forma que el
   servidor reconoce; sin el espacio, lo siguiente que se teclee se pega al
   nombre y deja de ser una mención.
3. **El cursor se coloca DESPUÉS del pintado.** En un `<textarea>` controlado,
   moverlo antes lo deja donde estaba y lo siguiente que se escriba sale en
   mitad del nombre.
4. **`onMouseDown`, nunca `onClick`.** El `blur` de la caja cierra la lista y
   llega **antes** que el `click`: con `onClick` el botón desaparecía justo
   antes de que su pulsación llegara, y elegir con el ratón no hacía nada.
5. **Con la lista abierta manda la lista.** Enter mete el nombre; solo con la
   lista cerrada envía. Al revés, elegir a alguien mandaría el mensaje a medio
   escribir. Escape la cierra, y se guarda **la posición** de la arroba que se
   quiso callar: una marca suelta se levantaría con el carácter siguiente.

Y la lista se pinta **por encima** de la caja: debajo está el borde de la
ventana, y en un panel lateral no hay sitio para desplegar nada hacia abajo.

### Buscar: la lista de canales es la PUERTA; el GIN es la velocidad

Se empezó con la idea contraria y **la medida la desmintió**, así que conviene
no volver a escribirla mal.

La idea de partida era: «no hace falta índice de texto, porque lo que acota es
la lista de canales que esa persona puede leer —unos pocos, ya resueltos por
`canalesQueAlcanzan`— y dentro de ese trozo hay poco que mirar». Medido con
**60.000 mensajes en 30 canales**, el plan dice otra cosa:

```
Bitmap Heap Scan
  Filter: ("canalId" = ANY (...))          <- la lista, DESPUÉS
  -> Bitmap Index Scan on ..._texto_idx    <- esto es lo que manda
```

| | tarda |
| --- | --- |
| acotada a 3 canales, **con** GIN | **5 ms** |
| acotada a 3 canales, **sin** GIN | 40 ms |
| los 30 canales, con GIN | 3 ms |

Dos cosas que salen de ahí:

1. **El GIN es lo que evita recorrer la tabla**, no el recorte por canal: con
   el mismo recorte, quitarlo multiplica por ocho — y eso crece con la tabla.
2. **Buscar en menos canales no es más rápido.** 3 ms en los 30 contra 5 ms en
   tres: con menos filas que casan, al `LIMIT` le cuesta más llenarse. Es
   contraintuitivo y es justo lo que hace que la primera explicación sonara
   bien.

Así que **las dos cosas hacen falta y hacen cosas distintas**:

- **La lista de canales es la PUERTA.** No se busca donde no se puede leer, y
  llega ya resuelta por las mismas funciones que arman el listado del hilo
  (`canalesQueAlcanzan` + `losCanalesQueVe`). Escribir aquí una condición de
  permisos propia sería tener dos que mantener a la par, y el día que se
  separen la búsqueda se convierte en la forma de leer lo que la lista esconde.
- **El GIN es la velocidad**, y nada más.

Tres cosas más:

1. **Sin `CREATE EXTENSION`.** `pg_trgm` haría falta para un `ILIKE '%x%'` con
   índice, pero instalar una extensión pide permisos que la App no tiene por
   qué tener, y el día que no los tenga esto falla **al arrancar**. La búsqueda
   de texto completo viene con Postgres.
2. **Lo que se teclea NUNCA llega en crudo a `to_tsquery`.** Esa función tiene
   su propia sintaxis, y un `!` suelto no es una búsqueda rara: **revienta la
   consulta entera** con un error de sintaxis. `comoConsultaDeBusqueda` se queda
   solo con letras y números —`\p{L}`, que conserva acentos y eñes; con
   `[a-z0-9]` a secas «pequeño» se partía en «peque» y «o»— y los operadores los
   pone ella.
3. **El prefijo va solo en el ÚLTIMO término.** `plainto_tsquery` escaparía solo
   y no vale: convierte todo en palabras enteras, así que «factu» no encuentra
   «factura» y en una caja de búsqueda eso se lee como que no hay resultados.
   Pero quien ya escribió «factura pendiente» quiere las dos enteras, no todo lo
   que empiece por «pendiente».

Y el **general** se busca aparte dentro de la misma consulta, con
`cuentaId IN (familia) AND (canalId IS NULL OR = 'general')`: no es una fila de
canal. Sin el `NULL`, los mensajes de cuando el hilo era uno solo serían
inencontrables y parecería que se borraron — el mismo caso que ya tuvo que
arreglarse al leerlo.

#### Y un resultado viejo necesita el hilo ALREDEDOR, no los últimos

El salto de la campanita admite a propósito que «si el mensaje no está, se sigue
al final». Para una mención reciente eso es aceptable; **para un resultado de
búsqueda es el fallo entero**: lo que se encuentra suele ser de hace semanas, no
está entre los últimos `TOPE_DE_MENSAJES`, y pulsarlo aterrizaba al final del
hilo sin el anillo y sin decir nada.

`elHiloAlrededorDe` trae la mitad de antes y la mitad de después **en dos
consultas acotadas**, no con un `OFFSET`: contar cuántos mensajes hay antes de
ese obliga a recorrerlos, que es lo que prohíbe *una consulta que devuelve una
página tiene que poder pararse*. Y si el mensaje ya no está devuelve vacío y
quien llama se cae al hilo normal — se pudo borrar entre encontrarlo y pulsarlo,
y eso no es un error que enseñar.

### Citar: el texto se COPIA en la respuesta, no se referencia

La pregunta es qué guarda la fila de la respuesta para no depender del original,
y la respuesta es **todo lo que hace falta para pintarlo**: `citaId`,
`citaAutorNombre` y `citaExtracto`, tres columnas con
`ADD COLUMN IF NOT EXISTS` porque la tabla ya está en producción.

Es el mismo criterio que esta tabla ya usaba con `autorNombre` —copiado para que
el hilo siga diciendo quién escribió aunque esa persona salga del equipo—,
aplicado al texto. **El recuadro se pinta con cero `JOIN` al original.**

Lo único que se le pregunta al original es **si sigue existiendo**, y eso:

- se pregunta **al leer**, con un `IN` sobre la clave primaria y **una sola
  consulta por página**;
- **no se guarda como marca en la fila.** Una marca obligaría a que cada camino
  que borre un mensaje se acordara de ponerla, y el día que alguien borre por
  otro lado se queda mintiendo. Preguntarlo siempre acierta.

Comprobado en el banco borrando el original: la cita sigue con su autor y su
texto, y lo único que cambia es que deja de ser pulsable y lo dice.

Cuatro cosas que hay que mantener:

1. **Solo se cita del MISMO canal**, comprobado en el servidor. Es lo que impide
   que una cita sea la forma de sacar contenido de donde no se puede leer: quien
   administra lee los directos de su cuenta, así que sin esta condición podría
   citar un directo dentro del general y enseñárselo al equipo con un clic.
2. **El navegador manda el `id`, no el texto.** Aceptando el extracto de fuera,
   cualquiera publicaría una cita falsa con el nombre de otro y con el aspecto de
   una de verdad. El servidor lo copia del original.
3. **Sin hilos anidados, a propósito.** La cita es un adorno de la respuesta, no
   una rama: la conversación sigue siendo una sola lista. Y el borrador de la
   cita vive **en el formulario**, junto al texto, no dentro del hilo — por eso
   se manda con él y se limpia al enviar, como los adjuntos de una tarea.
4. **Un `id` que llega de fuera se comprueba que sea una CADENA.** `String(7)`
   daba `"7"` y pasaba el filtro: no llega a hacer daño —ese mensaje no existe y
   la acción lo rechaza— pero es aceptar un tipo que nunca puede ser un id. Lo
   cazó el banco.

### Y una vuelta del reloj que llega tarde no pinta encima

El reloj de 5 s pide el canal que estaba abierto cuando salió. Si mientras tanto
se cambió de canal, esa respuesta trae los mensajes de la conversación anterior
y **se descarta**: comparando contra la referencia, no contra el estado. Sin esa
comprobación se ve como un canal que se cambia solo a los pocos segundos.

### Sin leer: una MARCA por persona y canal, no un conjunto

Sin señal, nadie se entera de nada: había que abrir el panel para saber si
alguien había escrito. El botón del borde lleva ahora el número de lo que falta
por leer, sumando todos los canales **donde la persona pertenece**, directos
incluidos.

Lo leído vive en `team_chat_reads (personaId, canalId, leidoHasta)`, con la
pareja como clave. **Una marca, no un conjunto de mensajes leídos**: un chat
crece sin límite y un conjunto crecería con él; esto es una fila por persona y
canal, y no crece nunca.

El contador de un canal son los mensajes **posteriores a su marca** y **de otra
persona**. Y las tres condiciones tienen cada una su motivo:

1. **Posteriores a la marca.** Sin marca no hay nada leído, así que la primera
   vez sale lo que haya. Es lo cierto —nadie los ha leído— y evita lo otro:
   sembrar la marca al vuelo abriría una ventana de un ciclo entero en la que un
   mensaje recién llegado se daría por leído solo, y un mensaje que se pierde
   así **no vuelve a avisar nunca**.
2. **De otra persona.** Lo que uno escribe no le llega a él.
3. **De un canal donde PERTENECE**, no de los que puede leer. Un administrador
   lee todos los directos de su cuenta; contárselos le pondría encima el tráfico
   de todo el mundo, que es tanto como no tener contador.

**La hora que se guarda es la del ÚLTIMO MENSAJE QUE SE ENSEÑÓ, nunca `now()`.**
Con `now()`, un mensaje que entrara entre leer el hilo y escribir la marca
quedaría dado por leído sin que nadie lo hubiera visto.

Y **la marca solo avanza**, con el `WHERE` del `ON CONFLICT`. Son dos cosas de
una: releer un canal viejo no resucita como sin leer los mensajes de en medio,
y **cuando no hay nada que mover Postgres no escribe la fila** — que importa
porque esto se llama en cada vuelta del reloj del panel abierto. Comprobado
contra Postgres: repetir la misma marca devuelve `INSERT 0 0`.

**Y cuando el canal cruza cuentas no hace falta nada**, que es la gracia: un
canal que cruza tiene **un id y un hilo** —sus mensajes cuelgan de la cuenta
dueña—, así que el conteo va por `canalId` y la marca es de (persona, canal),
la misma esté la persona en la cuenta que esté. El **único** sitio donde la
familia importa es el general, que no tiene fila de canal: ahí se cuenta con
`cuentaId IN (familia)`, igual que se lee. Medido: mirando solo la cuenta
propia saldrían 2 en vez de 3.

#### El contador tiene su propio reloj, y es el contrario del otro

El del hilo corre **solo con el panel abierto**, porque cuelga del layout y se
trae mensajes. Este corre **siempre**, porque de eso va: enterarse con el panel
cerrado. Por eso va a **15 s** —el ritmo de la ventana que interrumpe, no los 5
del chat abierto— y **no se trae ni un mensaje: solo cuenta**, en una consulta
para todos los canales. Una por canal serían tantas peticiones como canales
tenga la cuenta, cada vuelta.

Dos cosas que hay que mantener:

1. **El número baja al momento, no en la vuelta siguiente.** Abrir un canal lo
   marca leído en el servidor, pero el contador vive en otro sitio y con otro
   reloj: sin avisarle, el número se quedaría puesto hasta quince segundos
   después de haber leído, y eso se ve como un contador roto. El aviso es un
   evento del navegador (`chat-equipo:leido`) y **no un contexto** porque el
   hilo se pinta en dos sitios —el panel, que cuelga del layout, y la ruta, que
   no—: un contexto obligaría a envolver los dos.
2. **Solo se avisa cuando de verdad se marcó algo nuevo.** El hilo compara el
   último mensaje con el que ya dio por leído; sin esa comparación, cada vuelta
   del reloj de 5 s dispararía el contador y este pasaría a preguntar cada cinco
   segundos en vez de cada quince — o sea, triplicar el coste de lo que se
   escribió para ser barato.

Y el número va **fuera del flujo** (`absolute`) sobre un botón `relative`: el
botón mide 36 px y es la mitad de una pareja alineada, así que crecer lo
descuadraría. Re-medido en Chromium al tocar esa columna, como manda la regla:
la pareja sigue en 76 px, centrada en 400 a 1280×800, con sus 4 px de hueco.

### Y el SONIDO: solo un directo o una mención, nunca el general a secas

Un contador y una campanita solo avisan a quien está mirando la pantalla, que
es justo quien no lo necesita. El sonido es para el resto.

**Qué suena está en `lib/aviso-del-equipo.ts`, puro y probado**, y la regla se
puede decir en una línea: **un directo, o que te mencionen — en cualquier canal,
el general incluido**. Un mensaje del general sin mención **no suena nunca**: es
el canal donde está todo el mundo, y sonar con cada cosa que se dice ahí es
exactamente lo que hace que se silencie el aviso entero, con lo que el que
importa se pierde también. Es la misma familia que *la campanita es solo para
menciones*.

Tampoco suena con lo que uno escribe —eso ya lo descarta el servidor, que no
cuenta como sin leer lo propio— ni con **el canal que se tiene delante**. Y
«delante» son **dos cosas**: el panel abierto en ese canal **y** la pestaña a la
vista. Con la pestaña de fondo el canal sigue abierto en la pantalla y no lo
está mirando nadie — que es cuando hay que sonar.

#### Y la mención sale de `mencionados`, no de `task_alerts`

La fuente que parece obvia es el aviso de la campanita, que ya existe. No lo es,
por dos cosas: el canal viaja ahí **dentro de una URL** (`enlace`), así que
habría que parsearla para saber de qué canal era; y ese aviso se apaga al
atenderlo, que es una vida distinta de la de «sin leer».

`team_chat_messages.mencionados` ya guarda a quién se mencionó, **decidido por
el servidor al escribir y sobre la gente de ESE canal**. Es el mismo dato, en la
misma fila que el mensaje, con la misma marca de leído — una consulta, no dos
tablas que mantener a la par.

#### El tono: más agudo y más corto, y MÁS BAJO

El de los chats de clientes va de 880 a 1100 Hz y dura 450 ms
(`playNotificationSound`, en `hooks/chats/useAdvisorNotifications`). El del
equipo arranca **por encima de donde acaba aquel** —1320 a 1760 Hz— y dura
**180 ms**, menos de la mitad.

Y **con menos volumen, no más**: 0,14 contra 0,25. Lo que distingue un aviso de
otro es el timbre, no los decibelios; dos tonos compitiendo por ser el más
fuerte acaban los dos apagados. Un mensaje de un cliente es dinero esperando,
uno del equipo es un compañero: se reconoce sin levantar la vista y sin asustar
a nadie. El banco compara los cuatro números contra los del otro tono, para que
nadie los suba sin darse cuenta.

#### Con la pestaña de fondo: se quitó el guardián, y aun así el navegador manda

El reloj del contador se saltaba la vuelta con `document.hidden`, igual que el
oyente de llamadas. Tenía sentido cuando lo único que hacía era pintar un número
que nadie miraba; con sonido es al revés, **la pestaña de fondo es justo el
caso**, así que el guardián se fue.

Lo que **no** se puede arreglar desde aquí, y conviene no volver a intentarlo:
el navegador **ralentiza los temporizadores de una pestaña escondida**, y a los
cinco minutos los deja en una vuelta por minuto. O sea que de fondo esto
pregunta **menos** que en primer plano, no más, y el sonido puede llegar con
hasta un minuto de retraso. Es del navegador y no hay `setInterval` que lo
esquive. Al volver a la pestaña se pregunta de inmediato.

#### Que no suene dos veces con dos pestañas: `localStorage` y un candado

Las pestañas **no se hablan entre ellas**, y `localStorage` es lo único que
comparten — el mismo motivo por el que el mando de la jornada vive ahí. La marca
de «hasta aquí ya sonó» se guarda con esa llave, **por persona** (dos cuentas en
el mismo navegador no pueden pisarse), y **solo suena quien consigue
escribirla**: las demás leen un número que ya es mayor o igual que el suyo y se
callan.

La comparación y la escritura van dentro de un candado de `navigator.locks`, que
sí es común a todas las pestañas: sin él, dos que preguntaran a la vez podrían
leer las dos antes de que escribiera ninguna. Donde no exista se hace igual sin
candado — la ventana para colarse es de milisegundos y lo que se pierde es un
pitido de más, no un mensaje.

Y **la marca avanza aunque no suene**, que es lo que menos se ve: lo que se
descarta por tenerlo delante **ya está visto**, y dejarlo por detrás de la marca
lo haría sonar al cambiar de canal. La marca dice «hasta aquí ya lo sé», no
«hasta aquí ya sonó». Nunca retrocede, para que una respuesta que llega tarde no
resucite avisos ya dados por vistos.

**Las dos funciones tienen que estar de acuerdo en qué es una fila válida.** Lo
cazó el banco: `laMarcaDespues` no filtraba las filas rotas, así que una sin
canal no sonaba —eso sí lo miraba la otra— pero **sí empujaba la marca**, y se
tragaba en silencio todos los avisos buenos que llegaran después con una hora
menor. Por eso la condición es una función (`esUnAviso`) y no dos copias.

#### El sonido es de la PERSONA; los avisos del navegador, del DISPOSITIVO

Dos interruptores en la cabecera del panel, junto a la equis, y **dos sitios
distintos donde se guardan**, que no es un descuido:

| | dónde vive | por qué |
| --- | --- | --- |
| el sonido | `preferencias_de_persona`, tabla de la App | te sigue a cualquier equipo; y dentro de una cuenta ajena con «Ingresar» sigue siendo el tuyo, no el del cliente |
| los avisos del navegador | `localStorage` de ESE navegador | **el permiso es del navegador**: guardado contra la persona, el ordenador de la oficina —donde nadie lo dio— diría «activados» y no avisaría nunca |

La tabla es de la App con `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni
una columna en `User`**: esa es del backend y añadirle columnas desde aquí es lo
que reventó el #360.

**Encendido por defecto**, y por eso la ausencia de fila vale `true`: nadie tiene
que ir a encenderlo para enterarse de que le escribieron, que es el fallo del
que venimos. Apagarlo es una decisión; no haberlo tocado, no.

Y la preferencia **viaja en la misma vuelta del contador**, no en una consulta
suya: es el reloj que corre en todas las pantallas de todo el mundo, y partirlo
en tres acciones sería triplicar sus peticiones para pintar un número y dar un
pitido.

#### El permiso se pide en el BOTÓN, y si dicen que no se dice

Nunca al entrar. Un cuadro de permiso que salta solo al abrir la App se despacha
con «Bloquear» sin leerlo —es lo que hace todo el mundo— y entonces la decisión
queda tomada **para siempre y en contra**: `denied` es terminal, el navegador no
vuelve a preguntar por mucho que se le pida desde el código. Detrás de un botón
que dice lo que hace, la respuesta significa algo.

Y con `denied` el interruptor **no se queda encendido fingiendo**: vuelve a su
sitio y explica el único camino que queda —desbloquearlo desde el candado de la
barra de direcciones—, más la mitad que importa: **el sonido sigue
funcionando**. Son dos cosas distintas y por eso son dos botones.

> Ojo, que esto **no** vale para Chats: `useAdvisorNotifications` sigue pidiendo
> el permiso al montar, como siempre. Cambiarlo es otro frente; lo que no podía
> ser es que una función nueva copiara esa costumbre.

#### Con la plataforma CERRADA: Web Push, y sin tocar el backend

El sonido y la campanita necesitan una pestaña abierta. Esto es lo único que
llega sin ella: el servicio de empuje del navegador —FCM, Mozilla, Apple— se lo
entrega al service worker, que lo pinta con el navegador de fondo.

**Y no hizo falta tocar el backend**, por el motivo que lo hacía posible: el
mensaje del equipo se escribe en una **acción de servidor de ESTA App**, así que
el empujón sale de ahí mismo (`lib/empujar-aviso.ts`, llamado desde
`enviarAlEquipoAction`).

Sus límites, que se dicen antes de prometerlos: en **iOS** solo funciona con la
App **instalada** como PWA; en **escritorio** el navegador tiene que estar
corriendo aunque sea de fondo — cerrado del todo no llega nada hasta que se
vuelve a abrir, y entonces el servicio entrega lo que tenía guardado.

**La regla que lo sostiene, y es la misma del sonido:**

> **A quién se le empuja lo decide `aQuienSeLeEmpuja`, en
> `lib/aviso-del-equipo.ts`, al lado de `loQueMereceSonar`.** Un directo, o una
> mención en cualquier canal, el general incluido; el general sin mención no
> empuja a nadie, y el autor nunca. Escrita aquí y copiada allí, el día que se
> afine una la otra se queda atrás — y eso no se ve como un error: se ve como
> «a veces suena y no me llega el aviso».

Cinco cosas que hay que mantener:

1. **Sin las llaves VAPID todo queda inerte, y eso no es un fallo.**
   `hayWebPush()` devuelve `false`, no se suscribe nadie y no se empuja nada;
   el sonido, el contador y la campanita siguen exactamente igual. Desplegar
   esto antes de configurar las variables no puede romper nada. El botón lo
   dice al encenderlo: «activados **mientras la plataforma esté abierta**»
   frente a «también con la plataforma cerrada».
2. **La suscripción es del DISPOSITIVO, no de la persona.** La llave primaria
   es el `endpoint`, no el `personaId`: la misma persona en el portátil y en el
   móvil son dos filas. Y apagar los avisos **da de baja el dispositivo en la
   base**, no solo apaga el icono — si no, el empuje seguiría llegándole al
   teléfono a quien lo apagó desde el portátil.
3. **Lo que caduca se borra en el momento.** Un `404` o un `410` es el servicio
   de empuje diciendo que esa dirección ya no existe; sin borrarla, cada mensaje
   la vuelve a intentar para siempre. Comprobado contra FCM de verdad: un
   endpoint inventado contesta exactamente `410 push subscription has
   unsubscribed or expired`, que es la rama que limpia.
4. **`Promise.allSettled`, nunca `Promise.all`.** Una suscripción caducada es lo
   normal, y con `all` un solo rechazo tiraría los envíos buenos ya resueltos.
   Y va **de fondo, sin `await`**: hablar con FCM puede tardar segundos que
   quien escribe no tiene por qué esperar; el mensaje ya está guardado.
5. **`web-push` va en `serverComponentsExternalPackages`**, como `sharp`. Es una
   librería de criptografía con `require` dinámicos dentro (`asn1.js`, `jwa`,
   `http_ece`); empaquetada por webpack funciona, pero externalizada corre el
   paquete de verdad — y un fallo de empaquetado ahí solo se vería al intentar
   empujar un aviso, o sea donde nadie está mirando. Comprobado que las cuatro
   caen en `.next/standalone/node_modules`.

**Y la etiqueta es la misma en los dos caminos**, que es el fallo que casi se
despliega: con la pestaña abierta llegan los **dos** —el aviso de
`avisarEnElSistema` y el empuje—, así que con etiquetas distintas el mismo
mensaje sale **dos veces**, uno genérico y otro con el texto. Es literalmente el
avisar de más del que viene esta función entera. La etiqueta es
`chat-equipo-<canal>` en los dos sitios: el segundo sustituye al primero y sale
uno. Y de paso agrupa por conversación, que es de donde sale el volumen; dos
conversaciones distintas sí son dos avisos, porque son dos cosas que atender.

Y al montar se **refresca la suscripción de quien ya tenía el botón puesto**.
Sin esa línea, quien activó los avisos antes de que esto existiera no tendría
ninguna y seguiría sin recibir nada con la plataforma cerrada, sin un solo
error, hasta que se le ocurriera apagar y volver a encender.

**Las llaves no se cambian a la ligera**: una suscripción está firmada contra la
pública con la que nació, así que al cambiarlas todas las que hay dejan de valer.
Por eso el navegador compara la suya con la que le da el servidor y **se
resuscribe solo** si no coinciden; sin eso, el empuje fallaría siempre y en
silencio.

Las variables, que van en el stack de Portainer y **nunca en el repo**:

| | qué es |
| --- | --- |
| `VAPID_PUBLIC_KEY` | la pública. Baja al navegador, para eso está. |
| `VAPID_PRIVATE_KEY` | la privada. **Solo en el entorno.** Firma cada envío. |
| `VAPID_SUBJECT` | opcional, un `mailto:`. A quién reclamar. Por defecto `mailto:soporte@verzay.com`. |

Se generan una vez con `npx web-push generate-vapid-keys`.


### La VOZ: las dos funciones salen de Chats, no de una copia

Dictar al campo de escritura y mandar una nota de voz ya existían en la bandeja,
así que aquí no se escribió ningún grabador nuevo:

| | de dónde sale |
| --- | --- |
| dictado | `hooks/useSpeechDictation` — la Web Speech API del navegador, gratis y sin servidor |
| grabación | `hooks/useAudioRecording` — **se mudó** desde `app/(root)/chats/_components/hooks/` |

Y esa mudanza es la parte que importa: el hook es headless —devuelve estado y no
pinta nada—, así que las dos pantallas le ponen los botones que les toquen sobre
**un solo grabador**. Copiado, el día que se afine el formato que elige o el
temporizador se afina en una pantalla y la otra se queda atrás, que no se ve
como un error sino como «en el chat del equipo a veces no funciona». Lo mismo
con `base64FromBlob` y `RecordedAudioData`, que viven ya en
`lib/audio-del-navegador.ts` y se **re-exportan** desde los ficheros de Chats
para que allí no cambiara ni un import.

**El audio NO viaja dentro del mensaje.** Se sube al bucket por el mismo
`/api/upload` de los adjuntos de una tarea —que ya comprueba sesión y que la
carpeta sea de una cuenta sobre la que se manda— y la fila guarda su dirección
(`audioUrl`, `audioSegundos`, `audioMime`, con `ADD COLUMN IF NOT EXISTS` porque
la tabla ya está desplegada). Metido en la fila, un opus de un minuto son ~60 kB
de base64 que **la consulta del reloj se trae con la página entera cada cinco
segundos**, para no volver a mirarse nunca.

Y la dirección que llega del navegador **no se da por buena**: pasa por
`comoSeGuardaLaNota`, que la valida con `llaveDelArchivoSubido` —la misma
función que ya decide qué se puede borrar del bucket, no una segunda regla—. Sin
eso, la burbuja pintaría un `<audio>` apuntando a donde le dijeran y el botón de
transcribir mandaría a **nuestro servidor** a descargar esa dirección, que es una
petición saliendo de dentro de la red con el destino elegido por quien la manda.

### Transcribir: BAJO DEMANDA, y se paga una sola vez

Las notas de un **cliente** en Chats se transcriben solas: el asesor tiene que
saber qué le dijeron sin ponerse los auriculares. Un canal del equipo es al
revés —son compañeros hablando todo el día— y transcribir cada nota a seis
créditos el minuto es una factura que nadie pidió. Aquí hay un botón debajo de
cada nota y **nunca se transcribe sola**.

**La tarifa es la MISMA y no se vuelve a escribir**: `costoDeLaNota`, seis
créditos por minuto prorrateado por segundos, con su `ceil` y su mínimo de uno.
Y lo que comparten los dos caminos —leer los créditos, elegir la clave de OpenAI
y descontar— se fue a `lib/creditos-de-transcripcion.ts`, que ahora usan los dos.
Con una copia en cada sitio, el día que cambie el precio uno de los dos cobraría
otra cosa, y eso no se ve: se nota meses después en la factura.

**Cuatro cosas que hay que mantener:**

1. **Paga la CUENTA, nunca la persona**, y dentro de una familia la **madre**
   (`laCuentaQuePagaLaTranscripcion`). `ia_credits` tiene una fila por cuenta:
   cobrarle a la persona sería cobrarle a una fila que normalmente no existe, y
   entonces `losCreditosQueQuedan` devolvería 0 y **nadie podría transcribir
   nada**. Y la raíz de la familia porque `ownerId ?? id` **no sube a la
   madre** — sin eso, el chat interno de la casa cobraría a tres bolsas
   distintas según quién pulsara el botón.
2. **La puerta es PERTENECER, no poder leer.** Un administrador lee los
   directos de su cuenta —decisión tomada a propósito— y eso no le deja gastar
   créditos transcribiendo la conversación de otros dos. Es el mismo reparto con
   el que ya se cuenta lo sin leer y con el que suena el aviso. El general lo
   tiene todo el mundo, así que esto no cierra nada que estuviera abierto: lo
   único que deja fuera es el directo ajeno.
3. **Se guarda, así que solo se paga una vez.** La columna `transcripcion` es
   por eso, y la lectura va **antes** de resolver canales y créditos: en cuanto
   alguien la pide una vez, ese es el camino común. Sin guardarla, en un canal
   de ocho personas la misma nota se pagaría ocho veces. El `UPDATE` lleva
   `WHERE "transcripcion" IS NULL`, así que dos a la vez escriben una sola vez
   —comprobado contra Postgres: `UPDATE 1` y luego `UPDATE 0`—.
4. **Un fallo NO deja marca y NO cobra.** En Chats una nota que falla se marca
   para no reintentarla, porque ahí nadie la pidió; aquí la pidió una persona,
   así que un fallo de OpenAI es de hoy y el botón sigue. Marcarlo dejaría esa
   nota sin transcribir para siempre y sin decir por qué.

**Y el precio se ve ANTES de pulsar.** El botón dice «Transcribir (3 créditos)»,
porque la duración **es** el precio; un botón que gasta créditos sin decir
cuántos es un cheque en blanco, y eso reaparece como «¿por qué bajaron mis
créditos?». Una nota por encima del tope **no ofrece botón**: dice «Demasiado
larga para transcribirla», porque un botón que al pulsarlo da error es peor que
no tenerlo.

#### Los segundos se acotan, pero NO al tope de lo transcribible

Es el fallo que se cometió escribiendo esto y lo cazó releer el propio diff. La
duración llega del navegador y hay que acotarla —es lo que decide el precio—,
pero recortarla a `TOPE_DE_SEGUNDOS` (diez minutos) era **peor que no
recortarla**: una nota de media hora se guardaba como de diez, y entonces
`queHacerConLaNota` la daba por transcribible y **se cobraban diez minutos por
transcribir treinta**.

El techo que se aplica es un absurdo (`TECHO_DE_SEGUNDOS`, seis horas) que solo
evita un entero imposible. **Lo que decide si se transcribe sigue siendo la
regla de siempre, con la duración de verdad delante.** El banco lo prueba
encadenando las dos: se guarda media hora y se comprueba que la regla la
rechaza.

#### Un mensaje de solo voz tiene el texto VACÍO, y eso se nota en tres sitios

Una nota **es** el mensaje, así que se envía sin escribir nada. De ahí salen
tres huecos que hay que tapar a mano, y los tres se leen como que la App está
rota:

1. **El aviso y el empuje** salían con el cuerpo en blanco. Un aviso vacío no
   dice ni quién escribió ni de qué, y se despacha sin mirar — que es el fallo
   del que viene toda esta familia. Sale «🎤 Nota de voz».
2. **La cita** de una nota salía como un recuadro vacío, que es lo único para lo
   que no sirve una cita. Igual.
3. **Enter con una nota grabada pendiente** la perdía: enviaba solo el texto y
   la grabación se iba sin decir nada. El manejador de Enter pasa la grabación
   como lo hace el botón.


### ADJUNTOS: un archivo por mensaje, y la dirección no se da por buena

Enviar imágenes, vídeos y archivos, con la vista previa en la burbuja, el vídeo
en línea y la descarga. **Entran por el «+» de la barra**, con el formato y los
emojis, y no sueltos en la fila: cada botón suelto le come ancho a la caja, que
en un panel de 18 rem es lo único que escasea.

**La fila del mensaje guarda el adjunto en columnas** —`adjuntoUrl`,
`adjuntoNombre`, `adjuntoMime`, `adjuntoTamano`, con
`ADD COLUMN IF NOT EXISTS` porque la tabla ya está desplegada—, igual que ya
guardaba la nota de voz. Ni tabla aparte ni una lista dentro de una columna: la
consulta del reloj se trae la página entera **cada cinco segundos**, así que una
segunda consulta ahí es de las que se pagan todo el día, y una lista dentro de
una columna es un dato que no se puede buscar ni contar.

De ahí sale la decisión que conviene no deshacer:

> **Un adjunto por mensaje. Elegir tres fotos manda TRES mensajes**, que además
> es lo que hace WhatsApp: cada foto su burbuja. El texto va con el **primero**
> —es su pie— y los demás salen sin él. Con el texto repetido, la misma frase
> saldría tres veces… y la misma mención habría hecho saltar **tres veces** la
> ventana que interrumpe, que es justo el avisar de más del que viene esta
> familia entera. Sin él en ninguno, se perdería lo que se acababa de escribir.

Y por lo mismo la cita va solo con el primero: repetida, el mismo recuadro
saldría bajo las tres fotos.

Cinco cosas que hay que mantener:

1. **La dirección que llega del navegador NO se da por buena.** Pasa por
   `comoSeGuardaElAdjunto`, que la valida con `llaveDelArchivoSubido` — la
   **misma** función que ya decide qué se puede borrar del bucket y qué nota de
   voz se acepta. Una sola regla sobre qué direcciones son nuestras, no tres.
   Sin eso, la burbuja pintaría un `<img>` —o peor, un `<video>`— apuntando a
   donde le dijeran: una petición que sale del navegador de todo el equipo con
   el destino elegido por quien manda el mensaje. Se sube por el mismo
   `/api/upload` de los adjuntos de una tarea, que ya comprueba sesión y que la
   carpeta sea de una cuenta sobre la que se manda.
2. **De qué clase es lo decide UNA función** (`laClaseDelAdjunto`), pura y la
   misma en el servidor y en la burbuja. El `mime` manda y la extensión es el
   respaldo; **lo que no encaje sale como `archivo`**, que ofrece una descarga y
   esa funciona siempre. Equivocarse hacia `imagen` pinta un hueco roto sin
   forma de bajárselo.
3. **El vídeo va con `preload="metadata"`, nunca `auto`.** Un canal con diez
   vídeos y `auto` se descarga diez vídeos al abrirlo — y esta pantalla se
   refresca cada cinco segundos.
4. **Un mensaje de solo archivo tiene el texto VACÍO**, con los mismos tres
   huecos que ya tuvo la nota de voz: el aviso, el empuje y el extracto de la
   cita. Los tres los tapa `loQueSeLeeDeUnAdjunto` —«🖼️ Imagen», «🎬 Video»,
   «📎 nombre»—. Un aviso en blanco no dice ni quién escribió ni de qué, y se
   despacha sin mirar.
5. **El nombre se recorta por el MEDIO**, conservando la extensión. Por el
   final, tres ficheros del mismo cliente se ven iguales y encima se pierde de
   qué tipo son.

Y una que no se cerró y conviene saber: **`/api/upload` no tiene tope de tamaño
en el servidor.** Los 25 MB se comprueban en el navegador —para poder decirlo
antes de empezar a subir, no después de tres minutos de barra— y lo que se
guarda en la fila se acota. Ponerle un tope global a esa ruta afectaría también
a los adjuntos de tareas y de tickets, así que es un frente aparte.

### REACCIONES: una tabla, y el interruptor lo decide Postgres

Una reacción es de **una persona sobre un mensaje**, así que su llave natural es
la terna `(mensaje, persona, emoji)` — y esa es la tabla, `team_chat_reactions`,
de la App, con `CREATE TABLE IF NOT EXISTS` y esa terna como clave primaria.

**No una columna con la lista dentro**, y este es el motivo: quitar la reacción
de alguien sería leer la fila, cambiarla y volver a escribirla, así que dos
personas reaccionando a la vez se pisarían y una de las dos desaparecería **sin
decir nada**. Con una fila por reacción lo resuelve Postgres, que es donde tiene
que resolverse: `INSERT … ON CONFLICT DO NOTHING`, y **las filas tocadas son el
interruptor** —una, se puso; cero, ya estaba y se quita—.

Cinco cosas que hay que mantener:

1. **El emoji se valida en el SERVIDOR** (`esUnEmojiDeReaccion`): lleva un
   pictograma, no lleva **ni letras ni espacios**, y es corto. La del medio es
   la que importa: sin ella, reaccionar sería un segundo canal para escribir —un
   chip con una frase dentro, debajo del mensaje de otro y sin forma de quitarlo
   salvo por quien lo puso—. Esconder los demás botones en la pantalla no cierra
   la petición directa.
2. **La puerta es PERTENECER, no poder leer.** Es el mismo reparto con el que ya
   se transcribe una nota, se cuenta lo sin leer y suena el aviso. Un
   administrador lee los directos de su cuenta —decisión tomada a propósito— y
   eso no le deja dejar huella dentro de la conversación de otros dos: una
   reacción la ven los dos y no la puede quitar ninguno.
3. **El orden es el de APARICIÓN**, no el de cantidad. Con el de cantidad, el
   chip salta de sitio en cuanto alguien reacciona y se pulsa el que no era. Lo
   pone la consulta (`ORDER BY "creadoEn"`) y lo respeta el agrupador.
4. **El tope se comprueba DESPUÉS de meter, y se deshace.** Contar primero y
   decidir luego es la misma carrera que el `ON CONFLICT` evita, y dos pestañas
   colarían dos por encima. Y **quitar no mira el tope**: llegar al tope no puede
   dejar a nadie sin forma de deshacer lo que puso.
5. **Se lee en UNA consulta por página**, `lasReaccionesDe`, al lado de
   `lasCitasQueSiguenAhi`. Una por mensaje serían treinta consultas cada cinco
   segundos y por pestaña abierta — «muchas peticiones pequeñas son turno, no
   trabajo», por dentro.

**Y el chip se marca al tocarlo.** El reloj lo traería en su vuelta, pero eso son
hasta cinco segundos de un gesto que no respondió, y un gesto que no responde se
repite — o sea que se pone y se quita. Lo pinta `alternarEnLaLista`, que vive
**al lado de `agruparLasReacciones`** a propósito: son dos formas de la misma
regla —una decide lo que se guarda, la otra lo que se ve— y escritas en dos
sitios, el día que se afine una la otra se queda atrás. Eso no se ve como un
error: se ve como un chip que se marca y se desmarca solo unos segundos después.
El banco lo prueba **encadenando las dos**: se alterna en la lista y se comprueba
que agrupar las filas que habría escrito la base da exactamente lo mismo.

**El detalle de quién reaccionó va en DOS sitios**, y hacen falta los dos: el
`title` del chip, para el ratón, y una sección del menú «⋯», para el táctil —
donde no hay cursor que posar, y sin ella el detalle solo existiría con ratón.

### EDITAR y BORRAR: lo propio, y el borrado VACÍA la fila

Se decide en `lib/editar-del-equipo.ts`, puro: **ser el autor y poder escribir en
el canal**. Las dos mitades: quien administra lee los directos de su cuenta y no
escribe en ellos, así que que un mensaje sea suyo no le devuelve la mano en una
conversación de la que no forma parte. Y se comprueba **en la acción**, no solo
al pintar el menú.

**Sin ventana de tiempo, a propósito.** Los quince minutos de WhatsApp son para
una conversación con alguien de fuera; aquí es un equipo hablando de su trabajo,
y un dato que se corrige a los veinte minutos es un dato corregido, no un
engaño. La marca de «editado» es lo que lo hace honesto, y por eso no se puede
quitar.

Dos cosas del borrado, y la segunda es la que importa:

1. **La fila se queda.** Quitándola, el hilo tendría un hueco que nadie sabe
   explicar y una respuesta que lo citaba se quedaría hablando sola. En su sitio
   queda «Mensaje eliminado».
2. **Pero el contenido NO se queda: se vacía en la fila.** Texto, menciones,
   adjunto, audio, transcripción, la tarjeta de chat, la cita y **las dos
   columnas de la llamada** se ponen en nulo, y las reacciones se olvidan.
   Escondiéndolo al pintar, «borrar» sería un `display:none`: seguiría viajando
   al navegador de todo el equipo cada cinco segundos. Lo de la llamada no es un
   detalle: dejándolas puestas, la pantalla seguiría pintando la marca de
   llamada —esa rama va antes— y saldría «· saliente» con el texto vacío en vez
   de la señal de borrado.

Y de ahí tres efectos que hay que mantener:

1. **Una llamada NO se edita y SÍ se borra.** Nadie escribió «Llamada de voz ·
   3:07»: lo dejó la llamada al terminar, y editarlo sería reescribir un hecho.
   Borrarlo es otra cosa —quitar del hilo un registro que ya no interesa— y eso
   sí se puede.
2. **Un mensaje borrado no cuenta como sin leer, ni suena, ni se puede citar.**
   Las cinco consultas de sin-leer llevan `AND m."borradoEn" IS NULL`, y
   `lasCitasQueSiguenAhi` también: un borrado deja de estar «vivo», así que la
   cita que lo apunta deja de ser pulsable y lo dice. Sin eso, borrar un mensaje
   dejaría un contador encendido que no se puede apagar leyendo nada.
3. **Editar NO vuelve a avisar.** Se recalculan los `mencionados` —para que el
   anillo ámbar diga la verdad sobre el texto que hay— pero no se crea ningún
   aviso ni se empuja nada. Si avisara, editar sería la forma de hacer saltar la
   ventana que interrumpe tantas veces como uno quisiera.

**Y el archivo del bucket se borra**, best-effort y de fondo: por la misma
`llaveDelArchivoSubido` que valida la subida, nunca por una dirección que llegue
de fuera. Que falle no puede tumbar el borrado —la fila ya está vacía y eso es lo
que importa—, pero no es mudo.

### Y las cinco listas de columnas eran una copia, con un fallo dentro

Las cinco consultas que leen mensajes —el hilo, el anillo de una mención, la
búsqueda, el mensaje suelto y el envío— llevaban **su propia lista de columnas
copiada**. Al añadir seis columnas había que tocar las cinco, que es exactamente
la forma de que la sexta se olvide.

Se unificaron en `LAS_COLUMNAS`, y al hacerlo apareció un fallo que llevaba ahí
sin reportar: **a `elHiloAlrededorDe` y a `buscarEnElEquipo` les faltaban
`llamadaFin` y `llamadaSegundos`**. O sea que un registro de llamada al que se
llegaba desde la búsqueda, o desde el salto de un aviso, perdía sus dos campos y
se pintaba como una burbuja con el texto dentro en vez de como la marca gris del
hilo. Nadie lo había visto porque hay que llegar a una llamada por uno de esos
dos caminos.

**Una lista de columnas copiada en cinco sitios no es repetición: son cinco
consultas que un día devuelven cosas distintas.**

### La campanita: solo menciones, y al MENSAJE

La campanita ya recibía las menciones —`getNotificationCenterData` incluye
`avisosDeLaCampanita` y pinta cada aviso con `aDondeLleva`—, así que lo único
que faltaba era **aterrizar en el mensaje**: el enlace llevaba al canal y en uno
con tráfico eso es el final del hilo, que no es encontrar la mención.

El aviso lleva ahora `?canal=…&mensaje=…`, cada burbuja tiene su `id` y la que
traía el aviso se señala con un anillo aparte —en un canal con varias menciones
tuyas, el resaltado ámbar de siempre no distingue cuál es—.

Dos cosas del aterrizaje:

1. **Solo la primera vez.** Si no, cada vuelta del reloj devolvería la vista a
   la mención y no se podría seguir leyendo.
2. **Si el mensaje no está —quedó fuera de los últimos que se traen— se sigue
   como siempre, al final.** Mejor el hilo que una pantalla quieta.

Y **la campanita es solo para menciones**, no para todo mensaje nuevo: con un
canal activo sonaría todo el día y se aprendería a despacharla sin leer, que es
el fallo del que viene la ventana que interrumpe. Lo demás lo dice el contador.

#### Un aviso es de la PERSONA, y se leía con la fila efectiva

Se **escriben** con `sessionUserId ?? id` —la regla de #761— y se **leían** con
`user.id`, que es el de la cuenta EFECTIVA. Coinciden siempre salvo dentro de
otra cuenta —el conmutador o «Ingresar»—, y ahí los avisos de esa persona **no
le aparecían**: ni la ventana, ni la campanita, ni se podían marcar como leídos.

Es la misma asimetría que partió el General en dos, por otra puerta. Lo decide
`elDestinatarioDeLosAvisos` (`lib/avisos-de-tarea-tipos.ts`, puro), y lo
preguntan los cuatro sitios: la ventana, la campanita, el centro de
notificaciones y el clic que los atiende.

### El panel: la ruta sola no sirve

El equipo vive en Chats y no va a salir de ahí para hablar. Una ruta obliga a
irse de donde se está —y volver, y perder el chat abierto—, así que el hilo se
abre **como panel lateral encima de cualquier pantalla**, con la misma forma
que el del copiloto (`ChatSheet`).

La pantalla es **la misma** en los dos sitios: `components/chat-equipo/HiloDelEquipo.tsx`
lo pintan el panel y la ruta. Con dos copias, el día que se afine el reloj o el
envío se afina en una y la otra se queda atrás, que no se ve como un error sino
como «a veces funciona». La ruta se queda **tal cual** para quien quiera
montarla en un módulo.

Tres cosas que hay que mantener:

1. **La posición de la pareja se calcula UNA vez**, en `BotonesDelBorde.tsx`:
   una columna `fixed right-0 top-1/2 -translate-y-1/2` y dentro los dos
   botones, el copiloto encima y el del equipo debajo. Cada uno conserva su
   forma —36 px, media luna contra el borde—; lo único que pierden es decidir
   dónde se ponen. `ChatLauncher` acepta `className` y `cn` es `tailwind-merge`,
   así que sus clases de posición las gana la que se le pasa: no hay que
   tocarlo. Puestos cada uno por su lado habría dos cálculos que mantener a la
   par, y el día que uno se mueva el otro se queda.
2. **No tapa la caja de escribir de Chats**, y está medido en Chromium, no a
   ojo: la pareja mide 76 px centrados en la mitad de la ventana. A 1280×800 su
   centro cae en 400 —el centro exacto— y quedan **290 px** libres hasta el
   compositor; en un móvil de 390×667, **223 px**. Si se añade un tercer botón
   a la columna, se vuelve a medir: el hueco se come por abajo.
3. **El reloj solo corre con el panel abierto** (`activo`). Esto cuelga del
   layout, o sea de **todas** las pantallas: un sondeo de 5 s corriendo siempre,
   en todas las pestañas del equipo, es una consulta cada cinco segundos por
   pantalla abierta para un panel que nadie está mirando. Y el hilo **no se pide
   hasta abrirlo**, por lo mismo.

Nunca están los dos paneles abiertos a la vez: abrir uno cierra el otro. Son dos
paneles en el mismo sitio, y abiertos a la vez uno taparía al otro sin decir
cuál está delante.

## El número en la PESTAÑA: solo lo que exige respuesta

Con la pestaña de fondo entre otras diez, lo único que se ve de la App es su
icono de 16 píxeles. El contador de la barra lateral y la campanita no existen
ahí: hay que **volver a la pestaña** para saber si pasó algo, que es justo lo
que no se hace cuando se está en otra cosa.

Así que el número se pinta encima del favicon, en un lienzo, y el `<link>` se
sustituye en caliente.

**La regla, y es la misma de siempre contada en otro sitio:**

> **Cuenta lo que exige RESPUESTA: chats de clientes sin leer, más lo que en
> el chat del equipo va dirigido a esta persona —un directo o una mención—.
> Las tareas y los avisos de la campanita NO entran.**

No es una lista de lo que cabía: un icono que sube con todo se aprende a
ignorar, y entonces deja de servir **también para lo que sí había que
contestar**. Es la misma familia que *la campanita es solo para menciones* y que
el sonido del equipo, que no suena con el general a secas. Por eso el número del
equipo **no es `total`** —eso son todos los mensajes sin leer, el general
incluido, que es el canal donde está todo el mundo—.

### Sin un solo sondeo nuevo, y de dónde sale cada mitad

| | de dónde | con qué ritmo |
| --- | --- | --- |
| chats sin leer | `useChatUnreadStore`, que llena la bandeja | en vivo, con el socket |
| del equipo | el reloj del contador, que ya cuelga del layout | 15 s |

El del equipo sale **gratis**: `avisos` ya venía en esa respuesta —es lo que
decide si suena— y hasta ahora se leía y se tiraba. Un contador aparte habría
sido un segundo reloj en **todas** las pantallas de todo el mundo para contar
lo que ya estaba encima de la mesa.

Y de ahí sale dónde vive el componente, que si no parece arbitrario:
**`BotonesDelBorde`**, porque es el único sitio que ya tiene el contador del
equipo. `useSinLeerDelEquipo` **no comparte estado entre llamadas**, así que
llamarlo otra vez desde el layout montaría ese segundo `setInterval` de 15 s —o
sea, exactamente el sondeo que esto no trae—. El número baja por prop desde
quien ya lo tiene; el componente no pinta nada (`return null`).

### Los dos números se cuentan en la misma unidad

Son **conversaciones, no mensajes**, los dos: la consulta del equipo agrupa por
canal y los chats se cuentan por chat. Con uno en mensajes y otro en chats la
suma no significaría nada — sería un número que no se puede explicar señalando
la pantalla.

### Lo que hereda del contador de la barra lateral, y conviene saberlo

`useChatUnreadStore` lo escribe **solo la bandeja** (`chat-sidebar`), así que en
una carga en frío de otra pantalla esa mitad arranca en 0 hasta que se entra a
Chats. **No es nuevo**: es exactamente lo que ya hacen la pastilla de «Chats»
del menú y la campanita, que leen el mismo store. Se acepta a sabiendas porque
la alternativa es una consulta al servidor en cada carga de cada pantalla, que
es el sondeo que esto vino a no traer. La mitad del equipo sí llega sola, porque
su reloj cuelga del layout.

### Tres cosas del dibujo que no se ven mirando

1. **Se dibuja a 64 y lo reduce el navegador.** A 16 el círculo sale con los
   bordes escalonados y el dígito ilegible. Es lo que hace cualquier icono de
   la barra.
2. **`centro + radio + aro` tiene que caber en 1.** El primer intento daba
   **1,04** y la insignia salía **cortada por la esquina** — de las cosas que se
   miran de reojo y se dan por buenas. Lo cazó el banco, y lo comprueba como
   **invariante**, no como un número escrito a mano: si alguien mueve el radio,
   salta. Y `letra` va atada al radio (1,4 veces): moviendo uno hay que
   recalcular el otro, no dejarlo donde estaba.
3. **El icono base se prueba en DOS direcciones, y el orden importa.** Primero
   el `<link rel="icon">`; y de respaldo el `apple-touch-icon`, que lo sirve
   `/api/brand-icon` y es **del mismo origen siempre**. Hace falta porque el
   favicon de un reseller vive en **otro dominio**: sin CORS, el navegador lo
   cargaría y *contaminaría* el lienzo, y entonces `toDataURL` lanza y no hay
   insignia. Con `crossOrigin="anonymous"` esa imagen **ni carga** —da `error`—,
   que es lo que se quiere: se detecta antes de dibujar y se pasa al respaldo.

### Y se pone un `<link>` NUESTRO, no se reescribe el de Next

Va marcado con `data-insignia` y **al final de `<head>`**: entre dos iconos
declarados manda el último, así que gana sin tocar el de Next, y **quitarlo
devuelve el de siempre**. Reescribir el de Next con la dirección original
obligaría a recordarla, y el día que esa etiqueta cambie —otro branding, otra
navegación— se estaría restaurando una dirección vieja encima de la buena.

Sin pendientes no se pinta un cero: se quita el nuestro. **Una insignia con un
cero dentro sigue llamando la atención para decir que no pasa nada**, que es lo
contrario de para lo que está.

### Medido decodificando el PNG, no mirando la pantalla

Un `data:` distinto no prueba nada —podría ser el icono de siempre
recodificado—. Lo que prueba que la insignia está es que aparezca **rojo donde
antes no había, y en su esquina**. El banco del navegador decodifica el PNG que
acaba en el `<link>` y cuenta píxeles:

| | ¿insignia? | rojos | abajo dcha. |
| --- | --- | --- | --- |
| el icono original | — | **0** | **0** |
| sin pendientes | **no** | — | — |
| 1 chat | sí | 674 | 506 |
| 2 + 3 = 5 | sí | 644 | 476 |
| 9 justos | sí | 630 | 462 |
| 10 → `9+` | sí | 588 | 441 |
| 500 + 500 | sí | **588** | **441** |

Las dos últimas filas son **idénticas al byte**, y eso es lo que prueba que las
dos pintan `9+` y no un número distinto. Y «sin pendientes» no es que la
insignia salga vacía: es que **no hay `link[data-insignia]`** en el `<head>`.

### Y la receta de `removeConsole` FALLA con acentos

Comprobando que los dos avisos sobreviven al build salió esto, y vale para toda
la regla de *el build borraba los avisos*: el minificador escapa los acentos,
así que buscar el texto tal cual **no lo encuentra aunque esté**:

```
grep -rl "no se pudo dibujar el número sobre el icono" .next/static/chunks/   # 0 resultados
grep -rl "no se pudo dibujar el n"                     .next/static/chunks/   # sí aparece
```

En el paquete pone `el n\xfamero` y `la pesta\xf1a`. **Se busca por un trozo
sin acentos**, o un cero se lee como «el aviso no existe en producción» cuando
lo que no existe es esa forma de escribirlo.

## Llamadas de voz: la señalización va por la BASE, no por un socket

Llamar de navegador a navegador dentro de un directo, sin WhatsApp y sin
teléfono. **Solo uno a uno**: un canal de área no tiene «el otro», y una llamada
de uno a uno no sabría a quién sonarle (`laOtraPersona` se rinde con cualquier
canal que no sea un directo de exactamente dos).

**El WebRTC no es nuevo.** `CallDialog` lleva tiempo en producción haciendo esto
contra AstraCalls: micro, `RTCPeerConnection`, `ontrack` a un `<audio>`, y
—esto es lo que importa— **espera a que ICE termine de recolectar** antes de
mandar **una sola** oferta. Lo único nuevo es que la otra punta es otro
navegador.

### Por qué la base y no el socket

El socket de tiempo real **no es nuestro**: `/api/realtime/token` solo firma un
token para **escuchar** el socket.io del backend, que es otro repositorio.
Mandar una oferta SDP por ahí sería tocarlo.

Y no hace falta, **porque el WebRTC de esta App es non-trickle**: por el canal
viajan **dos mensajes** —la oferta y la respuesta—, no un goteo de candidatos.
Las dos viven en dos columnas de `llamadas_de_voz`, que es a la vez el registro
y el canal.

Lo que cuesta, y hay que saberlo antes de tocar el número:

- **El timbre tarda hasta una vuelta del reloj** (3 s). Quien llama puede
  esperar eso a que suene al otro lado.
- **El reloj corre en TODAS las pantallas**, porque una llamada tiene que sonar
  estés donde estés — cuelga del layout, como la ventana que interrumpe. Es una
  consulta corta sobre un índice, y con la pestaña de fondo no pregunta.
- **Lo que NO espera es saber si la otra persona está.** Eso se contesta al
  instante, antes de empezar a sonar.

### El latido sale gratis del mismo reloj

«Si no tiene sesión abierta, que no espere sonando» no necesitó nada nuevo: la
misma vuelta que escucha llamadas **deja su latido** al pasar
(`presencia_del_equipo`, una fila por persona que se pisa — no un histórico, que
crecería sin fin). Disponible = visto en los últimos ~30 s.

**Sin latido NO está disponible**, y ese es el lado seguro: mejor decir «no
está» y que se use el teléfono de siempre, que dejar a alguien escuchando un
tono que no suena en ningún sitio. Y **no se anota nada** en el directo: no
hubo llamada, no llegó a sonar — anotarla llenaría el hilo de «no disponible»
cada vez que alguien lo intenta.

El margen es de **varias vueltas**, no de una: con una sola, una pestaña ocupada
te deja «no disponible» estando delante, y eso se ve como que la función no
funciona.

### Sin TURN hay llamadas que NO conectan, y eso se dice

Esta es la parte que no se puede ablandar, porque no es una decisión de código:

> **STUN no transporta audio.** Solo dice cuál es tu dirección pública. Cuando
> las dos puntas están detrás de NAT simétrico —oficinas con cortafuegos, algún
> operador móvil, CGNAT— **no existe ninguna ruta directa** y el audio necesita
> un relevo, que es TURN. Sin él, ese porcentaje de llamadas se pierde.

La cifra de la industria ronda el 8-20 %. En un equipo interno será el extremo
bajo casi siempre… y **el 100 % dentro de ciertas redes corporativas**, que es
lo que hay que tener en la cabeza: no es «a veces falla un poco», es «desde esa
oficina no funciona nunca».

Así que lo único que el código puede hacer es **no perderlo en silencio**: si la
conexión no llega a `connected`, se corta y se anota `sin_conexion`, que en el
directo se lee **«no se pudo conectar»** — y no «se cortó», que mandaría a
buscar el fallo donde no está.

**Y encenderlo no es tocar código.** `losServidoresIce` lee `TURN_URL`,
`TURN_USER` y `TURN_PASSWORD` del entorno: sin ellas va solo STUN —directo
siempre que se pueda, que es lo pedido— y con ellas entra el relevo **detrás**
del STUN, que es lo que mantiene el coste casi en cero: WebRTC prefiere la ruta
directa y solo releva cuando no hay otra.

**Las credenciales se resuelven en el SERVIDOR** y viajan en la respuesta de una
acción, nunca en una `NEXT_PUBLIC_`: con ellas en el paquete del navegador
cualquiera usaría vuestro relevo para su propio tráfico.

Y la cuenta, para cuando toque decidirlo: voz en Opus ≈ 32 kbps por sentido, o
sea **~29 MB por hora** de llamada **relevada** (solo la minoría lo es). Un
equipo con 200 llamadas de 4 minutos al mes, con el 15 % relevado, son **~58 MB
al mes**. **El coste no es el ancho de banda: es tener el servidor.**

### Y las tres cosas del registro

La llamada queda escrita en el directo **como un mensaje más** —en su sitio por
fecha, leído por el mismo lector de siempre— con dos columnas que la distinguen
(`llamadaFin`, `llamadaSegundos`, por `ADD COLUMN IF NOT EXISTS`). En una tabla
aparte habría que mezclar dos listas al pintar el hilo.

1. **La duración se cuenta desde que se CONTESTÓ**, no desde que se llamó. El
   rato sonando no es conversación: contarlo haría que una llamada de diez
   segundos que tardó treinta en contestarse saliera como de cuarenta.
2. **Colgar los dos a la vez escribe UN registro.** `terminarLaLlamada` va
   condicionado a que no estuviera ya terminada y devuelve la fila solo si tocó
   una; la otra punta llega, toca cero y no anota. Comprobado contra Postgres.
3. **El timbre se cierra en el SERVIDOR, por la hora de la fila.** Con un
   contador en la pantalla de quien llama, si esa pestaña se cierra a mitad la
   llamada se quedaría sonando para siempre en la otra punta.

Y **el SDP se borra al terminar**: son un par de kilobytes que ya no sirven y
que llevan dentro las direcciones IP de las dos puntas.

### Lo que esto NO tiene, y es a propósito

Sin video, sin salas, sin grabación y sin llamadas de grupo. Y **la puerta de
quién puede llamar es la de escribir, no la de leer**: un administrador lee los
directos de su cuenta —decisión tomada a propósito— y eso no le deja llamar
desde ellos. Meterse en la conversación de otros dos no es supervisar, y una
llamada lo es mucho más que un mensaje.

### Quien hace sonar el timbre NO es quien sabe que ya se contestó

El timbre lo genera `OyenteDeLlamadas`, que cuelga del layout —tiene que sonar
estés donde estés—, y lo paraba al desaparecer la llamada entrante. Pero una
llamada **sigue siendo la misma después de contestarla**: `entrante` no cambia,
así que el timbre seguía sonando **toda la conversación**.

Y sonaba en las **dos puntas** aunque el tono se genere en una sola. Esa es la
parte que despista: el micro de quien contesta ya está abierto, así que su
propio timbre se le colaba por el micrófono a quien llamó. **Una causa, dos
síntomas** — y buscar un segundo tono en el lado de quien llama es perder la
tarde, porque ahí no hay ninguno.

Dos cosas que hay que mantener:

1. **Lo dice la ventana, no el oyente.** `LaLlamada` avisa con `onSonando`, y va
   como **booleano**, no como un «cállate» de una sola dirección: si contestar
   falla —sin micro, permiso denegado— la llamada **sigue sonando en la otra
   punta** y aquí tiene que volver a sonar. Un aviso de un solo sentido dejaría
   esa llamada muda para siempre, que es peor que el fallo original.
2. **Hay un estado `conectando`, y no sobra.** Es el que va de pulsar
   «Contestar» a tener el audio puesto: pedir el micro, armar la respuesta y
   esperar a ICE son varios segundos, **con el diálogo de permiso del navegador
   delante**. Sin ese estado el estado seguía siendo `sonando` todo ese rato.
   Un estado que no se nombra no se puede apagar.

### La tarjeta se arrastra y se pliega, y solo una vez conectada

Fija en medio de la pantalla, una llamada de diez minutos tapa aquello sobre lo
que se está hablando. Una vez conectada se arrastra y se pliega a una barra con
el rato y el botón de colgar.

**Solo conectada**, a propósito: mientras suena son dos botones y una decisión
de un segundo, y poder arrastrar una llamada entrante solo añade formas de no
darle a Contestar.

Cinco cosas que no se ven mirando la pantalla y descuadran igual:

1. **La caja que sostiene la POSICIÓN es una, y el `<audio>` vive en ella.**
   Partirlo en dos ventanas —una plegada y otra desplegada— desmontaría el
   `<audio>` al plegar, y con él el `srcObject` que trae la voz del otro: la
   llamada seguiría abierta y **muda**. Lo que cambia es lo de dentro.
2. **Antes del primer arrastre la ventana la centra el CSS.** Aplicarle un
   desplazamiento sin fijar antes dónde está de verdad (`getBoundingClientRect`)
   la manda a la esquina en el primer píxel. Se fija y luego se mueve.
3. **La captura del puntero va en el ASA**, que es quien lleva los manejadores:
   en otro elemento, los eventos siguientes se le redirigen a él y el arrastre
   se suelta a medias en cuanto el cursor sale de la ventana. Y de ahí sale la
   otra mitad: **ningún botón puede ir DENTRO del asa** —el `click` no llegaría
   a salir, porque los eventos ya están redirigidos—. El de plegar va fuera,
   posicionado encima.
4. **`touch-none` en el asa.** Sin él, en un móvil el navegador se queda el
   gesto para desplazar la página y la ventana no se mueve nunca.
5. **`w-fit`, nunca `w-auto`.** Sin posición propia la caja va con `inset-x-0`,
   y un ancho automático entre `left:0` y `right:0` **se estira**: la barra
   pequeña salía de lado a lado de la pantalla.

Y **dónde puede quedarse** es lo único de esto que se prueba sin navegador, así
que es puro: `dentroDeLaPantalla` (`lib/llamada-de-voz.ts`). No es decoración —
la ventana lleva dentro el botón de colgar, y dejarla salir por un borde es
dejar una llamada abierta sin forma de cortarla y con el micro encendido. Se
recoloca al **redimensionar** y al **plegar o desplegar**, que cambia el tamaño:
desplegar una barra pegada al borde de abajo la sacaría por ahí.

El suelo de cada eje es el **margen**, no el máximo: en una ventana más estrecha
que la tarjeta el máximo sale negativo, y sin ese suelo la ventana se iría hacia
arriba y hacia la izquierda, fuera de la pantalla. El banco lo prueba con un
móvil de 390×667.


## Videollamada y SALAS: la misma llamada, más gente y más pistas

La llamada de voz del directo pasa a llevar **video y pantalla compartida**, y
al lado hay **salas de hasta cuatro** con enlace público. Son dos caminos a
propósito, y conviene saber por qué:

| | cómo empieza | cuánta gente | para qué |
| --- | --- | --- | --- |
| **la llamada** | suena en la otra punta | dos | «te llamo ahora» |
| **la sala** | se entra por un enlace | hasta cuatro | una reunión, con gente de fuera si hace falta |

Lo que **no** se duplica es lo que se rompería al duplicarse: el micrófono, la
cámara y la pantalla son `hooks/useMediosDeLlamada` en las dos, y el esperar a
ICE es `lib/webrtc-del-navegador.ts`. Lo que sí es distinto es la
**señalización**, y eso no es repetición: una conexión contra seis son dos
problemas distintos (ver abajo).

### La idea de la que cuelga TODO: las pistas se negocian UNA vez

Es la decisión que hace posible el resto, y deshacerla rompe las dos pantallas
a la vez.

> Cada conexión abre **un transceptor de audio y uno de video en `sendrecv`
> desde el principio**, haya o no algo que poner encima. A partir de ahí,
> encender la cámara, callarse y compartir la pantalla son `replaceTrack` y
> `enabled`: cosas que pasan **dentro** de una conexión ya negociada y que no
> le dicen nada a nadie.

La señalización va por la base con un reloj —el socket de tiempo real es del
backend y desde la App solo se escucha, la misma razón de siempre—, así que una
renegociación cuesta una vuelta entera del reloj. Con la alternativa —añadir
una pista al compartir pantalla— habría que renegociar **las seis conexiones**
de una sala de cuatro cada vez que alguien pulsa «compartir»: varios segundos
de corte, seis sitios donde fallar, y un botón que «a veces no va».

Tres cosas que salen de ahí y hay que mantener:

1. **El orden de los transceptores es audio y luego video, SIEMPRE.** Es el
   orden de las líneas `m=` del SDP, y en una malla las conexiones se montan en
   momentos distintos con dispositivos distintos: si una punta pusiera el video
   primero, esa conexión negociaría el video de uno contra el audio del otro.
2. **Quien contesta pone sus transceptores en `sendrecv` DESPUÉS de aplicar la
   oferta** (`engancharALaConexion`). Sin esa línea, quien entra sin cámara
   negocia el video en `recvonly` y **su botón de cámara deja de funcionar para
   toda la llamada** — o sea, justo la mitad de la gente.
3. **El stream de lo que llega se construye a mano en `ontrack`**, nunca desde
   `ev.streams[0]`. `addTransceiver` no asocia ningún stream, así que
   `ev.streams` llega **vacío**: con el código de antes el recuadro se quedaría
   negro y el audio mudo **con la conexión perfectamente establecida**, que es
   el peor fallo posible porque todo lo demás dice que va bien.

Y el precio, que se dice porque se nota: **mientras se comparte pantalla no se
manda la cámara.** Es la misma pista ocupada por otra cosa. Al dejar de
compartir vuelve sola.

### El micro se silencia; la cámara se SUELTA

No es un descuido, y conviene no «arreglarlo» por consistencia:

- **El micro** va con `enabled = false` y la pista se queda viva. Callarse es
  momentáneo y se deshace a media frase; soltar el micro y volver a pedirlo
  metería medio segundo justo cuando alguien quiere interrumpir.
- **La cámara** se para de verdad. Apagarla es una decisión que dura, y lo que
  la gente espera al pulsarlo es que **el piloto del portátil se apague**. Con
  `enabled = false` el piloto sigue encendido y se manda una imagen negra:
  desde fuera, la App parece estar mirando igual.

De ahí sale otra asimetría que hay que conocer: **apagar la cámara SÍ se nota
en la otra punta y callarse NO.** La pista de video se queda en `muted` y eso
viaja por la conexión; el micro silenciado sigue mandando pista, con silencio
dentro. Por eso el icono de «callado» viaja **por el reloj**, en tres booleanos
que van dentro del latido, y el «cámara apagada» se lee de la pista al
instante. Son dos fuentes para dos preguntas distintas, no una duplicada.

### La MALLA: seis conexiones, y quién ofrece no puede decidirlo el reloj

Sin servidor de video, cada persona habla con cada una de las demás. Con cuatro
son **seis** conexiones y cada una sube **tres copias** de su cámara. De ahí
sale el tope, que no es un número redondo elegido a ojo:

| personas | conexiones | lo que SUBE cada una |
| --- | --- | --- |
| 2 | 1 | 1 copia |
| 3 | 3 | 2 copias |
| 4 | **6** | **3 copias** |
| 5 | 10 | 4 copias |

Subir es lo que se rompe primero —una conexión doméstica tiene mucha menos
subida que bajada— y a la cuarta copia ya se piden del orden de 2 Mbps de
subida. **Pasar de cuatro no es subir una constante: es poner una SFU**, que es
justo lo que esto no tiene.

Y la pregunta entera de una malla: **de cada pareja tiene que ofrecer
exactamente uno**, sin que se pongan de acuerdo antes. Si ofrecen los dos, las
ofertas chocan y no se conecta; si no ofrece ninguno, tampoco.

> Lo decide `debeOfrecer`, comparando los ids: **ofrece el menor**. Puro, sin
> reloj y sin orden de llegada — que es lo que aquí no se puede usar: dos
> personas que entran en la misma vuelta se descubren cada una en su propio
> ciclo, y con «ofrece el que llegó antes» las dos podrían creerse la segunda.

El banco lo prueba simulando la sala entera y **contando**: cuatro personas,
seis ofertas, ninguna repetida. Es de las pocas cosas que un banco caza y una
prueba a mano no — si la malla se monta mal también hay imagen, solo que de
tres de los cuatro.

### El tope de cuatro lo sostiene un CANDADO, y el `WHERE` no bastaba

Esto costó una vuelta y es el hallazgo que más lejos habría llegado sin banco.

La primera versión metía el `COUNT` dentro del `WHERE` del propio `INSERT`,
razonando que así lo serializaba Postgres. **No lo hace**: en `READ COMMITTED`
cada sentencia toma su propia foto al empezar, así que ocho entradas
simultáneas ven las ocho la misma sala medio vacía. Medido contra Postgres:
**entraban seis de ocho**.

Lo que funciona es un `SELECT … FOR UPDATE` sobre la fila de la sala
(`candadoDeLaSala`) antes de contar. Las entradas de esa sala se ponen en fila
india y las de las demás ni se rozan.

Y no es un detalle: **colar a un quinto corta la reunión para TODOS**, no solo
para el que sobra. El banco lo ejerce por los dos caminos —ocho entrando a la
vez, y cuatro admisiones simultáneas con un solo sitio libre— y comprueba el
número final, no el mensaje.

De paso salió otro que el banco también cazó: `dejarPasar` contaba **antes** de
mirar si esa persona ya había entrado, así que un doble clic sobre alguien ya
admitido contestaba «la reunión está llena» y mandaba a buscar un problema que
no existe. Cero filas tocadas son dos cosas distintas —«ya estaba» y «no
cabe»— y hay que mirar cuál.

### El buzón se vacía al LEERLO, y en una sola sentencia

`sala_senales` es un buzón: se deja una oferta para alguien, esa persona la lee
**y la fila desaparece** (`DELETE … RETURNING`). Dos motivos, y el segundo
manda:

1. Sin borrar, cada vuelta del reloj traería la misma oferta y se volvería a
   aplicar sobre una conexión ya negociada.
2. **Un SDP lleva dentro las direcciones IP de quien lo mandó.** Es la misma
   razón por la que `llamadas_de_voz` vacía sus dos columnas al terminar: eso
   es la red de casa de alguien.

Y lo de la **sentencia única** no es estilo: con un `SELECT` y luego un
`DELETE`, dos vueltas que se solapen —una pestaña lenta, un reintento— se
llevan las dos la misma oferta. El banco lanza dos lecturas en paralelo sobre
diez señales y comprueba que salen diez y **ninguna dos veces**.

### El ENLACE deja llamar a la puerta, no entrar

La ruta `/reunion/<codigo>` es pública —está en `publicRoutes`— porque se le
pasa a alguien que no tiene cuenta. Ser pública **no la abre**:

> **Tener el enlace deja llamar a la puerta. Quien pasa lo decide alguien que
> ya está dentro.** Eso es lo que permite pegar el enlace en un correo sin que
> el correo sea la llave.

Quién es cada uno lo decide `quienEsEnLaSala`, el **único** sitio donde se
resuelve una identidad aquí dentro:

| quién | con qué se identifica | cómo entra |
| --- | --- | --- |
| del equipo | la sesión, y **pertenecer al canal** | directo |
| de fuera | un **token** que le dio el servidor al llamar a la puerta | cuando le dejan |

Cinco cosas que hay que mantener:

1. **El token lo genera el SERVIDOR y nunca llega del navegador como
   identidad.** Ninguna acción acepta un `participante` suelto en los
   parámetros: el `deId` de una señal sale de la sesión o del token. Si llegara
   de fuera, cualquiera dentro de una sala podría dejar una oferta firmada con
   el id de otro.
2. **La pertenencia se vuelve a comprobar en CADA vuelta**, no solo al entrar:
   a alguien se le puede sacar de un canal mientras la reunión sigue abierta.
3. **Quien tiene cuenta pero NO pertenece al canal cae en la puerta**, como un
   desconocido. No es un despiste: dejarlo en un «no autorizado» sería un
   callejón sin salida cuando la reunión es justamente para él.
4. **El código son 18 bytes en `base64url`** (144 bits). `base64url` y no
   `base64` porque esto va en una URL y un `+` o un `/` se escapan por el
   camino.
5. **La lista de espera solo la ve quien puede abrirla.** Enseñársela a todos
   convierte una decisión en un espectáculo, y da los nombres de gente de fuera
   a quien no tiene por qué verlos.

Y **quién abre la puerta**: el anfitrión **y cualquiera del equipo que ya esté
dentro**. La segunda mitad no afloja nada —para estar dentro con cuenta hay que
pertenecer al canal— y evita un callejón que se daría todos los días: si el
anfitrión cierra su pestaña, sus invitados se quedarían esperando para siempre
mirando un mensaje que no cambia. **Un invitado no abre la puerta nunca**: lo
que le dejó entrar fue una decisión de alguien del equipo, y no se hereda.

**El enlace caduca siempre.** La duración sale de una lista cerrada
(`DURACIONES`), y lo que no encaje cae en la de por defecto —**nunca en «no
caduca»**: equivocarse hacia un día de más es un enlace que hay que revocar a
mano; equivocarse hacia el infinito es un enlace que nadie sabe que sigue
abierto. Y **revocar echa a quien esté dentro**, en la misma transacción:
cerrar el enlace dejando dentro a la gente que ya entró sería media
revocación, porque quien preocupa es justo quien está dentro ahora mismo.

### La puerta de una sala es PERTENECER, no poder leer

La misma de siempre, y por eso está escrita una sola vez (`elCanal`): un
administrador lee los directos de su cuenta —decisión tomada a propósito— y eso
no le deja abrir una reunión dentro de la conversación de otros dos ni, mucho
menos, repartir un enlace público que lleve a ella.

Y el botón de reunión sale en **cualquier canal**, no solo en un directo: es la
diferencia con la llamada de al lado, que necesita «el otro». Una reunión es un
sitio al que se entra, así que un canal de área es justo donde tiene sentido.

### La rejilla declara FILAS, y eso lo cazó una medida

Con tres o cuatro personas, los recuadros iban en `aspect-video` —altura atada
al ancho— y la rejilla solo declaraba columnas. Medido en Chromium: con cuatro
a 1440×900 cada recuadro salía de **704×396**, y dos filas son **792 px**, más
de lo que hay entre la cabecera y los mandos. Los dos de abajo caían **por
debajo de la barra de botones** y había que desplazarse dentro de la rejilla
para verlos.

No se ve probando con dos personas, que es como se prueba esto.

`laRejilla` devuelve **columnas y filas**, la rejilla va con `h-full` y su caja
con `overflow-hidden` —no `overflow-y-auto`: una videollamada en la que hay que
bajar para ver al cuarto es una videollamada de tres—. Medido después a
1440×900, 1280×800, 1024×768 y 390×844, con dos, tres y cuatro: **los cuatro
recuadros caben siempre** por encima de los mandos, y la página no se desplaza
ni a lo alto ni a lo ancho.

### Los relojes, y por qué son tres números distintos

| reloj | cada | dónde corre |
| --- | --- | --- |
| el oyente de llamadas | 3 s | **todas** las pantallas, cuelga del layout |
| dentro de una sala | 2 s | solo con una reunión abierta |
| esperando en la puerta | 4 s | solo mientras se espera |

El de la sala es más corto que el de las llamadas porque lo que espera es
**entrar**: una oferta que tarda dos vueltas en cruzar son seis segundos
mirando un recuadro negro. Y se puede permitir porque **no cuelga del layout**:
lo paga quien está en una reunión, no toda la plataforma.

El de la puerta es más lento a propósito: lo único que espera es que alguien le
abra, y puede no entrar nunca. Con el mismo ritmo que dentro, una pestaña
olvidada en la sala de espera costaría lo mismo que una reunión.

Y el latido es **el mismo viaje**: qué manda cada uno va dentro de la sentencia
que ya escribía la marca de presencia. En una acción aparte serían el doble de
peticiones en el camino más caliente de esta pantalla, por persona y por vuelta.

### Sin TURN, un porcentaje de estas reuniones NO conecta

Es lo mismo que ya decía la llamada de voz y aquí pesa más, porque son seis
conexiones y basta con que **una** pareja no encuentre ruta para que uno de los
cuatro se quede en negro para todos los demás.

`losServidoresIce` es el de siempre y lee las **mismas tres variables**
(`TURN_URL`, `TURN_USER`, `TURN_PASSWORD`). Nada de esto es código nuevo.

Dos cosas del reparto de credenciales:

1. **Las credenciales se resuelven en el SERVIDOR** y viajan dentro de la
   vuelta del reloj, nunca en una `NEXT_PUBLIC_`. Con ellas en el paquete del
   navegador, cualquiera usaría el relevo para su propio tráfico.
2. **Solo salen hacia quien ya está ADMITIDO en una sala viva.** Van dentro del
   latido y no en una acción propia justamente por eso: esa vuelta acaba de
   comprobar que esa persona está dentro. En una acción suelta habría que
   volver a comprobarlo, y ese es el sitio donde se olvida.

Y cuando una pareja no conecta **se dice con sus palabras** —«No se pudo
conectar con esta persona»— y se escribe en la consola con la pista delante.
«Se cortó» mandaría a buscar el fallo donde no está: esto es una ruta que no
existe entre dos redes.

### La reunión se abre DENTRO, y la pestaña se queda para el invitado

Antes se abría con `window.open`. Eso saca a alguien de la plataforma en mitad
de una conversación: para volver hay que cambiar de pestaña, y el canal desde
el que se abrió la reunión —que es donde se está hablando de lo que se reúne—
queda al otro lado.

> **Quien tiene sesión entra en un panel flotante** (`ReunionEnLaPlataforma`),
> que cuelga del layout como el oyente de llamadas y se pliega a una pastilla
> arrastrable con el nombre, el rato que lleva y el botón de salir. **La página
> pública en su pestaña se queda para quien entra por el enlace sin cuenta**:
> esa persona no tiene plataforma detrás, así que la reunión ES su pestaña.

Cuatro cosas que hay que mantener:

1. **Cuelga del LAYOUT, no del chat de equipo.** Montado dentro del chat,
   navegar a Clientes desmontaría el panel y con él la reunión entera. Y no
   pinta nada mientras no hay ninguna abierta, así que estar ahí no cuesta:
   ni reloj, ni consultas, ni permisos pedidos.
2. **Plegar ESCONDE la rejilla, no la desmonta.** Desmontarla se llevaría por
   delante los `<video>` y con ellos **el audio de los demás**: plegar una
   reunión tiene que dejarte seguir oyéndola, porque si no, plegar es salirse.
   Va con `display:none`, que no para la reproducción. Es la misma razón por la
   que el `<audio>` de la tarjeta de llamada vive fuera de la rama de plegado.
3. **Abrir otra reunión CAMBIA de sala, no apila dos paneles.** Dos a la vez
   son dos micrófonos abiertos y dos audios encima del otro, sin forma de saber
   cuál se está oyendo. Y el panel lleva `key={codigo}`: al cambiar se quiere
   una sala nueva de cero, porque sus conexiones son con otra gente.
4. **Plegada y ya no dentro, se despliega sola.** Si te sacan —revocaron el
   enlace, se cayó la sesión— con la pastilla puesta, lo que hay que ver es qué
   pasó. Una pastilla con el contador parado y sin explicación es la definición
   de un fallo mudo.

Y el arrastre es **el mismo** que el de la tarjeta de llamada
(`hooks/useVentanaArrastrable`): la captura del puntero, el `touch-none` y el
recolocar al cambiar de tamaño ya costaron una vuelta y no pueden estar
escritos en dos sitios.

De ahí sale la regla que se olvida al reutilizarlo: **ningún botón va DENTRO
del asa.** El asa captura el puntero al agarrarla y los eventos de después se
le redirigen, así que el `click` de un botón que esté dentro no llega a salir
nunca. En la cabecera de la sala el asa se lleva **solo el nombre**; «Copiar
enlace» y el de plegar van fuera. Puesta en la cabecera entera —que fue el
primer intento— esos dos botones dejan de funcionar, y eso no se ve leyendo el
código.

### Los enlaces de una burbuja: primero los enlaces, DESPUÉS el formato

Las direcciones de un mensaje del equipo son pulsables. Y el orden en que se
interpretan no es indiferente:

> **Se parte por enlaces y el formato se aplica a lo que queda entre ellos.**
> El lector de marcas de WhatsApp interpreta `_` y `*`, y hay direcciones que
> los llevan dentro: pasando el formato primero salen con un trozo en cursiva y
> **sin los guiones**, o sea llevando a otro sitio y pareciendo normales.

Conviene ser exacto sobre cuáles, porque la primera versión de este comentario
exageraba y **el banco la desmintió**: `mi_cuenta_x` está a salvo, porque el
lector ya se niega a abrir una marca pegada a una letra o a un número —es la
protección del `snake_case`, que está escrita en su fichero—. Lo que sí se
rompe es la marca que empieza después de un signo:

| dirección | con el formato a solas |
| --- | --- |
| `…/panel/mi_cuenta_x` | a salvo |
| `…/a/_b_/c` | **se rompe** |
| `…/docs/_index_` | **se rompe** |
| `…/x?q=_a_&r=1` | **se rompe** |
| `…/*destacado*` | **se rompe** |

Son menos de las que parecía y son reales, así que el orden se queda. El
precio, que se dice porque alguien lo notará: una marca que **cruza** un enlace
—`*mira https://x.com/a ahora*`— ya no se interpreta, porque sus dos mitades
caen en trozos distintos. Es lo mismo que hace WhatsApp y es preferible a
romper la dirección.

Cuatro cosas más:

1. **De dentro navega sin recargar; de fuera abre pestaña.** Lo interno va con
   `Link`: con un `<a>` normal la plataforma entera se vuelve a cargar —sesión,
   menú, módulos— para ir a una pantalla que ya estaba, y se pierde lo que
   hubiera abierto, **una reunión plegada incluida**. Lo externo va con
   `rel="noopener noreferrer"`, y `noopener` no es cosmético: sin él la página
   que se abre recibe un `window.opener` con el que puede **cambiar la
   dirección de esta pestaña** por otra que se le parezca.
2. **Qué es «de dentro» se decide comparando el ORIGEN entero**, no el
   principio del dominio: `ia-app.com` y `ia-app.com.otrositio.net` comparten
   el principio y no son lo mismo. Y `//otro.com` **no es una ruta** aunque
   empiece por barra: tratarla como tal sería navegar fuera creyendo ir dentro.
3. **El origen llega del SERVIDOR, no de `window`.** La burbuja también se
   pinta en el servidor, y leer ahí `window` daría una salida en cada lado — o
   sea una hidratación rota. Viene en el hilo, de la cabecera de la petición,
   porque la App se abre por más de un dominio.
4. **Reconocer de menos es mejor que de más.** Solo `http(s)://` y `www.`:
   aceptar `algo.com` a secas convertiría en enlace roto cualquier frase con un
   punto pegado a una palabra —«llego a las 3.30pm», «la versión 2.0.rc1»— y un
   enlace que no lleva a ningún sitio es peor que un texto plano. Y la
   puntuación de la frase se le devuelve al texto: el punto de «míralo en
   https://ia-app.com.» es de la frase. El paréntesis de cierre **solo si no hay
   uno de apertura dentro**, que es el caso de las direcciones de Wikipedia.

**Y en Chats van ENCENDIDOS desde el #804.** Estuvieron apagados a propósito
—allí el texto lo escribe un contacto de WhatsApp que puede ser cualquiera, y
eso es una decisión de producto, no un detalle de pintado—. Al tomarla salieron
dos cosas que la prop apagada tapaba, y las dos hay que mantener:

1. **`prefetch={false}` en el enlace de dentro.** No es una optimización. El
   enrutador precarga los `Link` que entran en pantalla, así que con la precarga
   de siempre **bastaba con que el mensaje se viera** para visitar la dirección
   que escribió otra persona. Y `/api/logout` es un GET que cierra la sesión:
   un contacto podía echar al asesor de la App sin que nadie pulsara nada.
2. **`/api/…` no es una página**, así que `laRutaDeLaPlataforma` la rechaza y
   sale como enlace de fuera — pestaña nueva, dirección a la vista y solo si
   alguien la pulsa. La guarda mira el **segmento**, no el prefijo: `/apicultura`
   sigue siendo una página.

Lo que hace esto aceptable, y conviene saberlo antes de aflojarlo: **el texto
que se ve ES la dirección**. No hay enlaces con texto propio —no se reconoce
markdown—, así que un contacto no puede enseñar «google.com» y llevar a otro
sitio. Si algún día se admite texto de anclaje, esta decisión hay que volver a
tomarla.

### Y el recorte de «Ver más» no puede partir un enlace

La burbuja de Chats enseña 250 caracteres. Con las direcciones ya pulsables,
**una cortada por la mitad sigue pareciendo un enlace y lleva a otro sitio** —no
es el asterisco de una marca sin cerrar, que se ve y se entiende: es una
dirección que miente, escrita por alguien que puede ser cualquiera—.

`recortarSinPartirEnlaces` corta **antes de que empiece** el enlace que cruza el
corte. Lo que NO se hace es dejar de enlazar el texto recortado: sería lo fácil
y deja sin pulsar el caso más común, un mensaje largo con su enlace dentro, que
es justo lo que se viene a pulsar. Y si el enlace empieza en el carácter cero se
recorta como siempre, que una burbuja vacía con un «Ver más» debajo se lee como
un mensaje perdido.

### El origen sale del SERVIDOR, y baja por contexto

Quién decide si un enlace es de dentro necesita saber por qué dominio se sirve
la App, y eso solo lo tiene el servidor: leerlo de `window.location` daría una
salida al pintar en el servidor y otra en el navegador, o sea una hidratación
rota. La función es **una** (`lib/origen-de-la-app.ts`); estaba privada dentro
de la acción del chat de equipo y se sacó al necesitarla la segunda pantalla.

Y baja hasta la burbuja **por contexto, no por props**: está al fondo de tres
componentes grandes y memoizados, y atravesarlos sería tocar la firma de cada
fila —que es lo que este documento prohíbe en «la lista es grande, no rehacerla
por gusto»—. No cuesta repintados: es una cadena que no cambia en toda la vida
de la página. Es el mismo patrón con el que esa lista ya le baja la conversación
al botón de transcribir una nota.

**La cita de un mensaje se queda sin enlaces**, en las dos pantallas: va dentro
de un `<button>` que salta al mensaje citado, y un enlace dentro de un botón es
un clic que no se sabe qué hace.

### Una reunión en un mensaje se ve como TARJETA, no como dirección

Una dirección de reunión son ochenta caracteres de `base64url` que ocupan tres
renglones y no dicen nada. Se aparta del texto (`apartarLasReuniones`) y en su
sitio va una tarjeta con el nombre y el botón de entrar, que es lo que alguien
va a pulsar de todas formas.

Tres cosas:

1. **El nombre se resuelve en UNA consulta por página**, como
   `lasCitasQueSiguenAhi` y `lasReaccionesDe`, y **solo si algún mensaje trae un
   enlace de reunión**. La inmensa mayoría de las páginas no trae ninguno y el
   hilo se relee cada cinco segundos: una consulta incondicional ahí sería una
   más en el camino más caliente de la pantalla para no devolver nada.
2. **Va acotada al CANAL que se lee.** No es rendimiento: sin eso, pegar en un
   canal el enlace de una reunión de otro sitio pintaría **el título de una
   reunión que quien lee no alcanza**. Lo que no encaje sale como tarjeta
   genérica y **sigue siendo pulsable** — la puerta de verdad está al entrar, no
   al pintar.
3. **«No se sabe» no es «cerrada».** `abierta` en `undefined` es una reunión de
   otro canal; dar por cerrada una que sí está abierta deja fuera a quien se la
   estaban pasando. Solo con `false` —revocada o caducada— se quita el botón,
   porque ahí ya se sabe que daría error.

### Lo que esto NO tiene, y es a propósito

Sin grabación, sin fondo desenfocado, sin chat dentro de la sala —el chat del
equipo está al lado— y **sin más de cuatro**. El audio del sistema al compartir
pantalla tampoco: sería una segunda pista de audio, o sea renegociar las seis
conexiones; el micro sigue sonando, que es lo que hace falta para explicar lo
que se está enseñando.

Y **la puerta de quién puede llamar sigue siendo la de escribir**, no la de
leer: meterse en la conversación de otros dos no es supervisar, y una reunión
lo es mucho más que un mensaje.

## La llamada de WhatsApp: el fin lo dice el AUDIO, y la tarjeta no bloquea

Dos cosas de la tarjeta de llamada de Chats, y la primera es un fallo que desde
fuera no se parece a un fallo.

**El cliente colgaba y la tarjeta seguía con el contador corriendo.** El asesor
creía que seguía hablando, le hablaba a nadie, y al rendirse el registro se
escribía con la duración de ese rato de más. Ni error, ni aviso: solo un
contador subiendo.

La causa es de una línea y es la familia de siempre: **el sondeo que detectaba
la respuesta se APAGABA al contestar.**

```ts
if (answered) {
  if (answerPollRef.current) { clearInterval(answerPollRef.current); … }  // ← aquí
```

Estaba además **copiado dos veces**, una por proveedor, así que eran dos sitios
que arreglar y ninguno de los dos miraba nada después de contestar.

### Aquí NO hay Evolution ni Waha, y saberlo cambia la forma del arreglo

Es lo primero que hay que mirar antes de ponerse a buscar «cómo se llama el
evento de fin en cada proveedor», porque la respuesta es que no existe el
camino:

| | ¿llama? |
| --- | --- |
| **AstraCalls** | sí — es por donde sale casi todo |
| **Meta Cloud API** | sí |
| **Evolution** | no. `makeWhatsAppCall` (`/call/offer`) está ahí y **no lo importa nadie** |
| **Waha** | no. `lib/waha.ts` no tiene API de llamadas |

De ahí sale la decisión, y es la que además aguanta el día que se añada otro:

> **El detector principal es el AUDIO, no el proveedor.** Con una pasarela
> WebRTC, que el otro cuelgue **es** que el RTP se para: da igual cómo llame
> cada uno a su evento. El parte del proveedor va **encima**, para ponerle
> nombre a lo que ya se sabe — y en Meta llega de verdad, por
> `chat_messages.raw.metaCall`, que es la misma fila de la que ya salía el SDP.

Quién decide vive en `lib/fin-de-la-llamada.ts`, puro y probado. Cinco cosas:

1. **Que falte información NUNCA cuelga.** Un `getStats` que falla, una consulta
   que no contesta, un estado de conexión que no se reconoce: eso es «no sé», y
   colgar por no saber corta una conversación en curso, que es peor que el fallo
   original. Solo un dato positivo cierra la tarjeta.
2. **La duración se cuenta hasta el ÚLTIMO audio, no hasta que nos enteramos.**
   Si el cliente colgó en el segundo 83 y se detecta en el 89, el registro dice
   83. Al revés, **todas** las llamadas de la plataforma salen unos segundos más
   largas de lo que fueron y los informes cuentan un tiempo que nadie pasó al
   teléfono. Por eso el rastro guarda el reloj del último byte **nuevo** y no el
   de la última vuelta.
3. **Seis segundos de gracia, y son seguros por el DTX.** Una llamada callada
   **sigue mandando bytes**: Opus con DTX —lo que usa WhatsApp— manda ruido de
   confort un par de veces por segundo. Así que seis segundos sin un solo byte
   no son «no está hablando», son una docena larga de paquetes que no llegaron.
   Bajarlos es arriesgarse a colgarle a alguien en mitad de una frase por un
   bache de red.
4. **`disconnected` tiene su propia gracia**, aparte: es el estado dudoso de
   WebRTC y a veces se recupera solo al segundo. `failed` y `closed` son firmes.
5. **Los segundos que no dice el proveedor NO son cero.** `undefined` es «no lo
   dijo»; darlo por cero borraría una llamada de tres minutos del tiempo
   hablado. Y un estado de fin que no conocemos se trata como fallo, que es el
   lado que le **enseña el motivo** al asesor en vez de callárselo.

Y **no se inventa la diferencia entre «rechazó» y «no contestó»**: si Meta la
dice, se enseña con sus palabras; si no, lo único cierto es que la llamada acabó
sin conversación, que es lo que la tarjeta ya sabía contar.

### Cerrar la conexión a mano es la MISMA señal que una que se cae

Dos sitios donde eso muerde, y los dos están resueltos a propósito:

- **El manejador se calla antes de cerrar** (`onconnectionstatechange = null`).
  Si no, colgar nosotros podría leerse como que colgó el otro.
- **En «Volver a llamar», `hangup()` va ANTES de soltar el guardián.** Cierra la
  conexión anterior; soltando el guardián primero, la llamada nueva se
  terminaría antes de empezar.

### Y el registro se escribe en cuanto acaba, no al cerrar la tarjeta

Antes solo se escribía en `handleClose`, así que una llamada cuya pestaña se
cerraba sin pulsar nada **no dejaba ni rastro**. Ahora los tres caminos —colgar,
elegir resultado, y que la corte el otro— pasan por `registrarLaLlamada`, que
escribe **una sola vez**. Y elegir el resultado **espera al registro en curso**:
sin eso, elegirlo deprisa —que es lo normal, la tarjeta ya está delante— llegaba
antes de que hubiera fila a la que ponérselo, y el botón no hacía nada.

### La tarjeta ya no es un modal: es la MISMA ventana del chat de equipo

Era un `Dialog` que tapaba la pantalla y no dejaba trabajar mientras se hablaba,
que es justo lo que se hace durante una llamada: mirar la conversación, buscar
el dato que te están pidiendo. Ahora flota, se arrastra y se pliega a una
pastilla con el rato, el nombre y el botón de colgar.

Y **es el mismo componente**, no una copia: la caja que sostiene la posición y
la pastilla se fueron a `components/shared/VentanaDeLlamada.tsx`, que usan la
llamada del directo y esta. El arrastre ya estaba compartido
(`useVentanaArrastrable`) y la duración también (`comoSeLeeLaDuracion`). Con dos
copias, el día que se afine el plegado se afina en una y la otra se queda atrás
— y eso no se ve como un error: se ve como que «en Chats la llamada a veces no
se deja mover».

Tres cosas que hay que mantener, y las tres ya costaron su vuelta en la otra:

1. **La caja de fuera sostiene la POSICIÓN y el `<audio>`; dentro cambia lo que
   se pinta.** Partirla en dos ventanas desmontaría el `<audio>` al plegar, y
   con él el `srcObject`: la llamada seguiría abierta y **muda**.
2. **Ningún botón dentro del asa.** El asa captura el puntero y el `click` de un
   botón de dentro no llegaría a salir. Plegar va fuera.
3. **Plegar solo en llamada.** Mientras suena son dos botones y una decisión de
   un segundo; esconderla ahí solo añade formas de perderla. Y al terminar se
   despliega sola: hay que elegir resultado y una pastilla no tiene dónde.

Medido en Chromium sobre el CSS del build, que es la regla de siempre para una
columna nueva:

| ventana | tarjeta | pastilla | colgar (plegada) | desborda |
| --- | --- | --- | --- | --- |
| 1440x900 | 352 px | 318 px | 32x32 @ 840 | no |
| 1280x800 | 352 px | 318 px | 32x32 @ 760 | no |
| 390x667 | 352 px | 318 px | 32x32 @ 315 | no |

## La ventana de llamada: arranca PLEGADA, y no se puede perder

Tres cosas de la ventana que flota, y las tres valen para las dos llamadas —la
del chat de equipo y la de WhatsApp— porque las dos son el mismo componente.

### 1. Lo que se ve al empezar es la pastilla

La tarjeta grande se abría encima de todo desde el primer segundo y había que
plegarla a mano **cada vez**. Durante una llamada se trabaja: se mira la
conversación, se busca el dato que te están pidiendo. Así que lo normal es la
pastilla y lo excepcional es la tarjeta, no al revés.

De ahí salen dos cosas que la pastilla no sabía hacer, porque antes solo
existía con la llamada ya conectada:

1. **Lleva un rótulo en vez del contador mientras no hay nada que contar.**
   «Llamando…», «Conectando…», «Llamada entrante». Un **«00:00»** se lee como
   una llamada conectada de la que no se oye nada, que es justo la confusión que
   la tarjeta de WhatsApp acaba de costar por el otro lado.
2. **Y lleva el botón de CONTESTAR cuando la llamada entra.** Sin él, una
   llamada entrante plegada no es una llamada: es el aviso de una llamada
   perdida. Va **fuera del asa**, como los otros dos — dentro, el asa captura el
   puntero y su `click` no llegaría a salir, o sea una llamada que no se puede
   coger.

Y por lo mismo se puede **arrastrar desde el primer momento**, no solo
conectada. La condición de antes decía que «arrastrar una llamada entrante
añade formas de no darle a Contestar»; con la pastilla siendo lo que se ve desde
el principio, no poder apartarla es peor, y Contestar está fuera del asa.
**El botón de plegar sale en cualquier estado menos al acabar**: desplegada y
sin forma de volver a plegarla, la tarjeta tapa la pantalla el resto de la
llamada. Al acabar no, que ahí hay que elegir el resultado y una pastilla no
tiene dónde.

**La reunión NO cambia**: sigue arrancando desplegada. Tiene su propia caja y
lo que se abre ahí es para mirarlo.

### 2. Acotar AL MOVER no basta, y por eso hay tres salidas y no dos

El manejador del arrastre ya acotaba —`dentroDeLaPantalla` estaba puesto en
`mover` desde el principio— y la ventana acababa fuera igual. Conviene saber
por qué, porque leyendo solo el arrastre no se encuentra: **una ventana se sale
sin que nadie la arrastre.**

| cómo se sale | qué lo tapaba |
| --- | --- |
| **crece donde está** — la tarjeta pasa de 22rem a 32rem al encender la cámara, y le aparece dentro un recuadro de video | `tamano` solo miraba `minimizada`, así que ese cambio de tamaño no avisaba a nadie |
| **encoge la pantalla** — girar un móvil, abrir las herramientas del navegador | el `resize` sí llegaba, pero acotaba contra el borde en vez de descartar la posición |
| **se mide cuando no hay nada que medir** — un recuadro de 0×0, sin maquetar o escondido | `dentroDeLaPantalla(x, y, 0, 0, …)` da la esquina de abajo a la derecha **como esquina superior** de una pastilla de 318×42: quedan 8 px asomando y el asa entera fuera |

El tercero es el que deja la llamada inalcanzable, y es el que explica el
síntoma: **acotar una posición calculada contra un tamaño que no era el suyo la
deja igual de perdida.** Por eso `queHacerConLaVentana`
(`lib/ventana-flotante.ts`, puro y probado) tiene **tres** salidas:

- **`dejar`** — está entera dentro.
- **`acotar`** — asoma por un borde y se mete, que es lo de siempre.
- **`olvidar`** — no se puede arreglar acotándola: se tira y la ventana vuelve a
  su esquina por defecto, que es donde se sabe encontrarla.

Y se pregunta en los **cuatro** momentos en que puede dejar de valer, no solo al
mover: al agarrarla, al redimensionar la ventana del navegador, al cambiar de
tamaño la propia tarjeta (**`ResizeObserver`**, que es lo que de verdad cierra
el agujero — se entera de los cambios que nadie declara) y al moverla.

Tres cosas que hay que mantener:

1. **Un par de píxeles asomando NO es estar en pantalla.** No hay dónde agarrar
   y no se lee nada, así que a efectos de quien mira se perdió igual. El mínimo
   son 32 px, un dedo.
2. **Pero el mínimo no puede ser mayor que la propia caja ni que la pantalla.**
   Con un número fijo, una pastilla más baja que 32 px —o una pantalla
   diminuta— se olvidaría **siempre** y se quedaría clavada en su esquina por
   mucho que alguien la moviera. Se compara contra el menor de los tres.
3. **`agarrar` también acota.** Antes guardaba el rectángulo tal cual: si la
   ventana ya estaba fuera, el arrastre arrancaba desde fuera y el primer
   movimiento la traía de golpe bajo el cursor, saltando.
4. **No hay bucle con el `ResizeObserver`.** Observa el **tamaño**, y lo único
   que esto cambia es dónde está; mover no redimensiona. El caso de `olvidar` sí
   cambia el ancho —la caja pasa de `left/top` a `inset-x-0 mx-auto`— pero
   entonces `posicion` ya es `null` y la vuelta siguiente no hace nada.

Y la geometría se mudó de `lib/llamada-de-voz.ts` a **`lib/ventana-flotante.ts`**,
con sus casos: la usan tres cosas que no son la llamada de voz de un directo.
**Sin re-export**: una función con dos casas es una que se prueba en una y se
importa de la otra.

### 3. Una caja más ancha que la pantalla se sale la acotes donde la acotes

Esto lo cazó medir y no se ve leyendo. `w-fit` **no tiene techo**: la pastilla
de una llamada entrante —rótulo, nombre y tres botones— pedía **437 px**, y en
un móvil de 320 se salía **52 px por la derecha**, que es exactamente donde
están Contestar y Colgar. Acotar la posición no arregla eso, porque el problema
no es dónde está: es cuánto mide.

Va un `max-w-[calc(100vw-1rem)]` en la caja, y dentro **cede el rótulo, nunca
los botones**: el contador no se recorta —son cinco caracteres y es el dato— y
los botones son `shrink-0`, así que lo que se acorta es «Llamada entrante».

Medido en Chromium sobre el CSS del build:

| ventana | entrante | saliente | hablando | ¿caben los botones? |
| --- | --- | --- | --- | --- |
| 1440×900 | 437 px | 359 px | 318 px | sí |
| 1280×800 | 437 px | 359 px | 318 px | sí |
| 390×667 | 374 px | 359 px | 318 px | sí |
| 320×568 | **304 px** | **304 px** | **304 px** | sí |

Sin el techo, la fila de 320 era «437 → 372 px empezando en x=0», o sea el botón
de colgar fuera de la pantalla.

> **Lo que NO se pudo reproducir**, y se dice para que nadie lo dé por cerrado:
> el «se arrastra fuera y no vuelve» **por el camino del arrastre**. `mover`
> acotaba ya, y leyendo no aparece forma de escaparse por ahí. Lo que sí se
> encontró son las cuatro puertas de arriba —crecer, encoger, medir en vacío y
> no tener techo de ancho—, que llevan al mismo sitio y ya están cerradas. Si
> vuelve a pasar, el sitio donde mirar es `queHacerConLaVentana`: es puro, así
> que el caso se reproduce en el banco sin navegador.

## Un hilo se abre por el final, y no se mueve solo

Los cinco listados de mensajes de la plataforma —Chats, el chat de equipo y los
dos del agente— hacían cada uno su versión de lo mismo: al cambiar el número de
mensajes, al final. Eso está mal por las dos puntas.

1. **Va demasiado pronto.** El salto ocurre al pintar, y **después** cargan las
   imágenes y los audios, que empujan el contenido hacia abajo. El hilo se queda
   a media altura y hay que bajar a mano — que es el síntoma que se reportó. Una
   foto sin alto declarado ocupa cero hasta que llega, así que el «final» al que
   se saltó no era el final.
2. **Y va aunque nadie lo haya pedido.** Leyendo algo de ayer, cada mensaje que
   entraba tiraba de la pantalla al fondo. Eso no se lee como una función: se lee
   como que la App no te deja leer.

Lo decide `useHiloPegadoAbajo`, con la parte pura en
`lib/desplazamiento-del-hilo.ts`. **La regla de la que cuelga todo:**

> **Estar pegado abajo solo se pierde SCROLLEANDO.** Que el contenido crezca no
> despega nunca. Si despegara, el primer fallo volvería solo: la foto que carga
> aumenta la distancia al final, y quien mire esa distancia concluirá que la
> persona se fue a leer arriba cuando no ha tocado nada.

### La trampa: `ResizeObserver` NO ve crecer el contenido

Esto costó una vuelta entera y **casi se despliega un arreglo que no hacía
nada**. Lo obvio es observar el contenido con un `ResizeObserver` y volver a
pegar cuando crezca. No funciona, y el motivo es de maquetación:

> El hijo del contenedor es un elemento **flex de altura fija** —la del propio
> contenedor— así que su caja **no cambia** al entrar una foto. Lo que crece es
> **`scrollHeight`**, que no es el tamaño de ninguna caja y ningún
> `ResizeObserver` observa.

Medido en Chromium, con cuatro fotos entrando: el observador se disparó **una
sola vez**, la del montaje, y el hilo se quedó a **880 px** del final —
exactamente igual que sin nada. La medida del contenido decía `702` mientras
`scrollHeight` decía `3116`.

Lo que sí funciona, y está medido:

| mecanismo | a cuánto del final acaba |
| --- | --- |
| saltar al pintar, y ya | **880 px** |
| `ResizeObserver` sobre el contenido | **880 px** |
| `load` en captura | **0** |
| vigilia acotada de `scrollHeight` | **0** |

Van **las dos**, porque cubren cosas distintas:

1. **`load` en captura.** `load` **no burbujea, pero sí se captura**, así que un
   solo oyente en el contenedor recoge cada `img`, `audio` y `video` que termine
   de cargar — que es justo lo que se reportó. No cuesta nada cuando no carga
   nada. Y `loadedmetadata` aparte: un audio ya tiene su alto ahí, antes del
   `load` del fichero entero.
2. **Una vigilia ACOTADA de `scrollHeight`**, que recoge todo lo demás: una
   transcripción que aparece debajo de una nota, una tarjeta de reunión que
   resuelve su nombre, una fuente que carga. **Acotada a propósito**: un
   `requestAnimationFrame` permanente son sesenta lecturas de `scrollHeight` por
   segundo, y cada una fuerza a recalcular la maquetación de un hilo de miles de
   nodos — justo lo que la regla de *la lista es grande, no rehacerla por gusto*
   evita. Se reabre al cambiar de conversación y al llegar algo, que son los dos
   momentos en los que hay contenido por cargar.

El `ResizeObserver` se queda, pero **sobre el contenedor y para lo que sí sabe
ver**: que encoja el hueco donde vive el hilo —se abre un panel, se gira un
móvil—.

### La flecha: un solo umbral, y el historial no cuenta

`FlechaAlFinal` aparece al alejarse del final y se va al volver. Es la única
señal de que ha llegado algo, **porque la vista ya no se arrastra sola**.

Tres cosas que hay que mantener:

1. **Un solo umbral (150 px), no dos.** Con uno para pegarse y otro más lejano
   para enseñar la flecha quedaría una franja en la que un mensaje nuevo cuenta
   como sin leer y **no hay flecha donde enseñarlo**: el contador subiría sin
   que nadie lo viera.
2. **Cargar historial NO suma sin leer.** «Cargar mensajes anteriores» sube el
   total sin que haya llegado nada: lo que delata una novedad es que cambie el
   **último**, no el total. Sin esa distinción, pulsar ese botón mientras se lee
   arriba pondría un «+30» de mensajes viejos.
3. **Un hilo que no llena la pantalla está SIEMPRE abajo.** Sin eso, un chat de
   dos mensajes enseñaría la flecha para siempre.

Y va **fuera del contenedor que scrollea**, contra un padre `relative`: metida
dentro se iría con el contenido y solo se vería al llegar al final, que es justo
cuando ya no hace falta.

### Los saltos SUELTAN el anclaje a propósito

Ir al mensaje de una mención, a un resultado de búsqueda o a una cita llama a
`soltar()` antes del `scrollIntoView`. Sin eso se depende de que el `scroll` del
salto llegue antes que el siguiente crecimiento del contenido, y esa carrera se
pierde de vez en cuando — o sea, un salto que se deshace solo.

### Dónde NO se puso, y por qué

**El hilo de comentarios de una tarea** (`HiloDeLaTarea`) no tiene contenedor
con scroll propio: es un bloque dentro del diálogo de la tarea. Anclar ese
diálogo al final escondería el formulario de arriba, y una flecha flotante ahí
no tendría contra qué colocarse. Se queda como está a propósito.

**Y `AnimatedChat`** es una animación decorativa de una landing, no una
conversación.

### `npm run build` NO comprueba los tipos en este repo

Se descubrió aquí y conviene saberlo: `next.config.js` lleva
`typescript: { ignoreBuildErrors: true }`. Un `soltar` usado en un array de
dependencias **antes de declararse** —que es un TDZ de verdad, no solo de
tipos— daba `npm run build` en verde y habría reventado en producción. Lo cazó
`npx tsc --noEmit`, que es el que manda.

## La barra de escribir es UNA, y lo que la forma vive fuera de las dos pantallas

Chats y el chat de equipo tenían dos barras distintas para lo mismo. La del
equipo llevaba el dictado, el micrófono y un botón de «Enviar» con su palabra
**sueltos en la fila**, así que en un lateral de 18 rem la caja de escribir se
quedaba con poco más de la mitad del ancho — y no había ni formato ni emojis,
que en Chats existen desde hace tiempo.

Es el mismo patrón en las dos, y ahora es el mismo código:

| | dónde vive |
| --- | --- |
| formato, emojis y el texto ya pintado | `components/shared/FormatoDeTexto.tsx`, `EmojiPickerPanel.tsx`, `TextoConFormato.tsx` |
| la columna flotante y los botones redondos | `lib/barra-de-escribir.ts` |
| dictado y grabación | `hooks/useSpeechDictation`, `hooks/useAudioRecording` (ya se mudó en el #787) |

Los tres componentes **se movieron** de `app/(root)/chats/_components/` a
`components/shared/`, y Chats los importa desde ahí: eran puros —solo `ui/`,
`cn` y `lib/formato-whatsapp`—, así que la mudanza no cambió ni una línea de lo
que hacen. Y las clases de la forma van en `lib/`, como las de los paneles
laterales, **por el mismo motivo**: escritas a mano en las dos barras, el día
que se afine un radio o un hueco se afina en una y la otra se queda atrás. Eso
no se ve como un error: se ve como dos pantallas de la misma plataforma que no
se parecen, y nadie sabe cuál es la buena.

> Y por eso `tailwind.config.ts` tiene que seguir mirando `lib/`. Se comprueba
> buscando la **declaración** en el CSS del build, no la clase en el código:
> `grep -oF "426FD4" .next/static/css/*.css`. Ese color solo lo escribe
> `lib/barra-de-escribir.ts`, así que si aparece, el glob funciona.

### El botón de formato OBLIGA a pintar el formato

Es la mitad que se olvida. El botón escribe `*negrilla*` en la caja, o sea
marcas de WhatsApp dentro del texto; si la burbuja sigue sacando el texto tal
cual, lo que se lee al otro lado es el asterisco. **Un botón que produce algo
que se ve roto es peor que no tenerlo**, así que la burbuja del equipo —y el
recuadro de la cita, y el borrador de la cita— pasan por `TextoConFormato`, el
mismo componente que ya usa la burbuja de Chats.

### Aquí va SIEMPRE plegado, y el «+» no se condiciona al ancho

En Chats el «+» solo sale por debajo de 640 px (`isCompactToolbar`, medido con
un `ResizeObserver`). En el chat de equipo no hay esa rama: este hilo se lee en
un **panel lateral de 18 a 24 rem**, así que «ancho» no existe, y una condición
que nunca es falsa es una rama que nadie prueba.

Medido en Chromium sobre el CSS del build, con las clases pasadas por el mismo
`tailwind-merge` que usa `cn` —sin eso se mide una caja que React no pinta—:

| ventana | panel | la fila | la caja | emojis |
| --- | --- | --- | --- | --- |
| 1440 | 384 | 335 | **295** | 300 |
| 1280 | 384 | 335 | **295** | 300 |
| 1024 | 352 | 303 | **263** | 300 |
| 700 (panel estrecho) | 288 | 239 | **199** | **239** |

La página no desborda en ninguna y la columna flotante cae dentro del panel en
las cuatro.

**El panel de emojis mide 300 px y el lateral estrecho 288.** Por eso se abre
sobre el **ancho de la fila** —y cerrando la columna, no dentro de ella— y por
eso lleva `max-w-full`: colgado del botón se saldría por el borde DERECHO de la
pantalla, que es justo donde vive el panel, y ahí se recorta sin que nadie pueda
traerlo de vuelta. Con `max-w-full` se encoge a 239 y la rejilla reparte lo que
haya.

### Con la caja vacía NO hay botón de enviar

Es lo que le deja el sitio al micrófono, que es lo que se usa cuando no hay nada
escrito. En cuanto hay texto —o una nota ya grabada— sale el botón redondo azul
con la flecha. Tres cosas del lado derecho:

1. **Grabando manda la grabación**: lo único que se puede hacer es terminarla.
2. **Dictando, el botón de parar NO desaparece porque haya texto.** En Chats sí
   —en compacto, con algo que enviar, el de dictado se va— y entonces la única
   forma de callar el dictado es mandar el mensaje. Aquí salen los dos, y la
   caja reserva sitio para dos (`pr-[4.5rem]` en vez de `pr-11`): de más, la
   última palabra se corta sola contra un hueco vacío; de menos, el texto pasa
   por debajo del botón.
3. El micrófono **no despliega nada cuando el navegador no tiene dictado**: es
   el botón de grabar y ya. Un menú con una sola cosa dentro es un clic de más.

### Y meter los botones DENTRO de la caja obliga a que la caja crezca sola

La caja iba con `resize-y`, y el asa de eso vive exactamente en la esquina de
abajo a la derecha — que es donde están ahora el micrófono y el de enviar. Sin
hacer nada más quedaban las dos opciones malas: un asa que no se puede coger, o
una caja de una sola línea para siempre. Así que crece con el texto hasta su
tope (`max-h-40`), y ahí aparece la barra de desplazamiento.

**Los bordes van aparte.** `box-sizing` es `border-box` —la altura los
incluye— y `scrollHeight` no los cuenta: poniendo el `scrollHeight` pelado la
caja se queda **dos píxeles corta** y sale una barra de desplazamiento con una
sola línea dentro, para siempre. Medido: 40 px con una línea, 58 con dos, 78 con
tres y 160 de tope, sin barra hasta el tope.

### Y los atajos de formato van DELANTE del selector de menciones

`Ctrl+B`, `Ctrl+I` y `Ctrl+Mayús+X` se miran antes que nada y **no se comen
ninguna tecla del selector**: ese manda con las flechas, Enter, Tab y Escape, y
ninguna de ellas es b, i ni x. Todo lo demás pasa de largo tal cual llegó, que
es la misma regla con la que estos atajos entraron en Chats.

## Chats → equipo: la conversación se SEÑALA, no se cuenta

Para que el equipo viera un caso de WhatsApp, el asesor copiaba el texto a mano
y lo explicaba. Lo que faltaba no era poder contarlo: era poder **señalar la
conversación**, y que quien lo pulse caiga dentro sin buscarla.

**El enlace NO viaja como texto dentro del mensaje.** Va en columnas de la fila
—`chatLinea`, `chatJid`, `chatIdentidades`, `chatNombre`, `chatNumero`, con
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` porque la tabla ya está desplegada— y
lo que entiende de ellas es `lib/chat-compartido.ts`, puro. Tres motivos:

1. **La burbuja pinta texto plano** (`whitespace-pre-wrap`). Una dirección
   escrita ahí no es pulsable, y ponerse a reconocer enlaces dentro del texto es
   la familia de fallo de la que va medio este documento.
2. **Con el dato aparte, quien recibe puede comprobar el acceso ANTES de pintar
   el botón** y decir por qué no se abre, en vez de ofrecer un enlace que
   aterriza en una pantalla vacía. Es la mitad que de verdad importa.
3. **El nombre y el número se COPIAN dentro**, como `autorNombre`: el mensaje
   sigue diciendo de quién se hablaba aunque después se borre el chat.

Y **cinco columnas, no un blob**: cada una se escribe y se lee por su nombre, así
que una clave mal puesta falla en vez de guardarse en silencio.

### La LÍNEA va en el enlace, y no es opcional

`/chats?jid=…&instance=…`. La ruta **ya existía** —`searchParams.jid` e
`instance` en la página de Chats—, así que esto no inventa un camino nuevo: lo
escribe en un sitio (`aDondeLlevaElChat`).

Lo que no se puede ablandar es la línea. El mismo contacto tiene conversación en
dos líneas —le escribe a Ventas y a Atención, es lo normal—, así que sin ella el
aterrizaje elegiría **la primera fila que aparezca**: es exactamente el fallo de
`ownerForJid` y `lineaDelJid` que ya costó una sesión con las marcas de borrado.

Y se guardan **todas las identidades** del contacto, con la pedida delante. La
lista lo devuelve por la que Evolution dé esa vuelta; preguntar por una sola
forma «devuelve correcto y vacío», que es la regla de siempre de Chats.

**El número se COPIA de lo que la pantalla ya sabe y nunca se deduce de un
`@lid`.** Sus dígitos son un id de privacidad, no un teléfono. `elNumeroQueSeEnsena`
mira el **dominio** (`@s.whatsapp.net` / `@c.us`) y no la pinta de los dígitos:
fiarlo al largo del número es que el día que un `@lid` tenga quince cifras se
enseñe como teléfono al que llamar — y podría ser el de otro contacto.

### Y quien lo abre sin acceso ve un aviso, no una pantalla vacía

Es la pregunta entera de esta función, y son **tres casos que no se pueden
confundir**:

1. **La línea no está en su bandeja.** La bandeja alcanza **un solo nivel y en
   los dos sentidos** (`linked_accounts`: desde una vinculada se ven las líneas
   de la madre, y desde la madre las de sus vinculadas) — **no alcanza a las
   hermanas**. Así que un canal que cruza Atención y Ventas puede ponerle
   delante a alguien de Ventas una conversación de una línea de Atención. Sin
   nada, eso aterrizaba con `selectedJid` puesto y sin fila: cabecera con el jid
   crudo, conversación vacía y ninguna explicación — que no se lee como «no
   tienes acceso», se lee como que la App está rota. Ahora la página compara la
   línea pedida con las que resolvió y pinta `SinAccesoALaLinea`.
2. **La línea sí está, pero el chat no entró en la página cargada.** La bandeja
   está topada en 300 (`TOPE_DE_LA_BANDEJA`). Una conversación vieja es
   perfectamente accesible y simplemente no viene en la primera página. **Eso no
   es falta de permiso** y no puede tratarse como tal: decirle «no tienes
   acceso» a quien sí lo tiene es peor que la pantalla vacía. Por eso la puerta
   mira la LÍNEA y no si el chat está en la lista.
3. **No está en el canal.** No llega a pasar leyendo —solo se ofrecen canales
   donde participa—, y aun así **la puerta de Chats no pregunta por el canal**:
   el canal decide quién lee el mensaje, la línea decide quién abre la
   conversación. Dos preguntas, dos puertas, como las notas.

El aviso dice **las tres cosas que hacen falta para no quedarse mirando**: que
la conversación existe, que no se abre porque es de otra cuenta —no por un
error— y a quién pedírsela. Y no dice de quién es la línea ni qué hay dentro:
quien no alcanza esa cuenta tampoco tiene por qué saberlo.

### Y del lado de quien comparte

- **Solo se ofrecen los canales donde se puede ESCRIBIR** (`puedoEscribir`), no
  donde se puede leer. Un administrador lee los directos de su cuenta y no
  escribe en ellos, así que ofrecérselos sería ofrecer un destino que la acción
  luego rechaza — y un botón que al pulsarlo da error es peor que no tenerlo.
- **Y se vuelve a comprobar en el servidor.** Lo que diga el navegador sobre en
  qué canal publica no se da por bueno, igual que con las menciones.
- **La línea compartida tiene que ser suya** (`esMiLinea`: `resolveInstanceOwner`
  más `assertCanAccessTargetUser`). Sin eso, cualquiera publicaría en su canal
  una referencia a una línea ajena, con el nombre y el número de un contacto que
  no es suyo. Esconder el botón no cierra la petición directa.
- **Los canales se piden al ABRIR el diálogo**, no en cada carga de Chats. Esa
  pantalla es de las más caras de la App; una consulta más en cada entrada, para
  un diálogo que casi nunca se abre, es «esperar turno en vez de trabajar».
- **Media referencia no es una referencia**: sin línea o sin jid,
  `comoSeGuardaElChat` devuelve `null` y la acción lo **dice**. Publicar el
  mensaje sin la tarjeta se leería como que el botón no hizo nada.

## Notas de voz: se paga por MINUTO y el contador mide TOKENS

Una nota de voz se transcribe **cuando alguien pulsa su botón**, y el texto sale
**debajo del audio, sin quitarlo**: el audio es lo que mandó el cliente —con su
tono y sus pausas— y el texto es una ayuda para leerlo de un vistazo, no un
sustituto.

> **Nada se transcribe al llegar.** Durante un tiempo sí: el reloj de la
> conversación abierta transcribía de fondo toda nota que entrara, **la leyera
> alguien o no**. Con decenas de clientes por cuenta eso es plata que se va sola
> —y la paga entera la cuenta dueña de la línea, aunque la nota sea un «ok,
> gracias» de cuatro segundos—. Es el mismo trato que el chat del equipo, que
> nació bajo demanda por este mismo motivo.

Y **no hay cliente nuevo**: `actions/calls-recording-actions.ts` ya transcribía
las grabaciones de llamadas con `gpt-4o-transcribe` y respaldo en `whisper-1`.
Lo que faltaba era el **cobro**, que ese camino no hace.

### La conversión, que es la parte que hay que entender

`ia_credits.used` está en **tokens** y `total` en **créditos**. Whisper se cobra
**por minuto de audio**: no hay ningún recuento de tokens que escribir, así que
hay que fabricarlo — y eso es una **decisión de precio**, no un cálculo.

Por eso la tarifa es **un solo número escrito con su aritmética al lado**,
`CREDITOS_POR_MINUTO_DE_AUDIO` (`lib/transcripcion-de-voz.ts`, puro). Este
documento ya avisa de que la conversión de 3.085 está en tres sitios con dos
redondeos y de que es un cabo suelto; meter un cuarto con su propia cuenta lo
empeora.

La cadena es **`segundos → créditos → tokens`**, en ese orden, y el redondeo se
hace **una sola vez, al final**:

```
tokens = ceil( segundos / 60 × CREDITOS_POR_MINUTO × 3085 )
```

Tres cosas de esa línea, y las tres son fallos conocidos de esta casa:

1. **Prorrateado, no por minuto empezado.** Redondear al minuto cobraría una
   nota de 4 segundos como 60 —quince veces de más— y en una línea de notas
   cortas se come los créditos en una tarde.
2. **`ceil`, nunca `floor`, y nunca cero.** Con `floor`, una nota de 5 segundos
   costaría **cero**: se transcribiría gratis para siempre y el contador no se
   movería mientras el consumo sí ocurre. Es la familia de *un número que no se
   puede calcular no se sustituye por otro*.
3. **La comprobación de si alcanza va en CRÉDITOS, jamás en tokens.** Es la
   regla explícita de este documento: *ninguna comparación toca `used` y `total`
   en la misma expresión*. Ese fallo ya pasó en el voicebot —bastaban 4 créditos
   para agotar un cupo de 12.000—. Aquí entra `creditosDisponibles`, calculado
   como lo calcula el Perfil, y el costo también en créditos; la conversión a
   tokens ocurre **después**, solo para escribir.

**No se cobra cuando la cuenta paga su propia IA** (`pagaElClienteSuIa`, la
misma pregunta que se hace el motor). Y `null` —ilimitados— **no es cero**: son
dos respuestas distintas, y confundirlas dejaría a esas cuentas sin transcribir
nada.

**Y paga la cuenta DUEÑA DE LA LÍNEA**, que es la que recibe el mensaje. Un
asesor de una cuenta vinculada abriendo ese chat no puede cargarle el consumo a
la suya.

### Una nota muy larga no se recorta: no se transcribe, y se dice

La duración **viene dentro del propio mensaje** (`audioMessage.seconds`), así
que la decisión se toma antes de descargar un byte y antes de tocar los
créditos.

**El tope no es técnico.** Una nota en opus de diez minutos pesa poco más de un
mega, lejísimos de los 25 MB que admite la API. Es un límite de **gasto**: una
grabación de cuarenta minutos reenviada a un chat son cientos de créditos en un
solo mensaje, sin que nadie lo haya pedido, y eso reaparece como «¿por qué
bajaron mis créditos?».

**Y no se recorta. Nunca.** Transcribir los dos primeros minutos de una nota de
diez y enseñarlo como «la transcripción» es peor que no transcribir: el asesor
lo lee, actúa, y lo que importaba estaba en el minuto siete. Es *media escalada
es peor que ninguna* — una transcripción a medias no se ve como incompleta, se
ve como completa.

### El «No se pudo transcribir.» de la captura: el audio se pedía SOLO a Evolution

No era un fallo de OpenAI, y no era intermitente. El paso automático bajaba el
audio con `getBase64FromMediaMessage` —una ruta **de Evolution**— y se rendía en
su primera línea cuando no había clave:

```ts
if (!instanceName || !apiKeyData?.url || !apiKeyData?.key) return "";
```

Y una línea de **WhatsApp Mensajería (Waha) no tiene clave de Evolution**:
`resolverContexto` se la quita **a propósito**, porque preguntarle a Evolution
por una línea de Waha «devuelve correcto y vacío». Así que en esas líneas esa
condición era falsa **siempre**: ni una sola nota se transcribía nunca, todas se
marcaban `fallo`, y la marca era **definitiva** —quien llamaba excluía de la
siguiente vuelta toda fila con `transcripcionMotivo`—. Es la misma familia que
el #792: *el proveedor sale de la fila, no del parámetro.*

**La respuesta estaba delante:** la burbuja ya reproduce ese audio, y lo hace
desde `chat_messages.mediaUrl`, la copia que guarda el backend. **Si el
`<audio>` puede sonar, nosotros podemos bajar los mismos bytes.** Así que el
camino principal es `mediaUrl`, que funciona en los dos proveedores, y Evolution
queda de respaldo para las filas viejas que se guardaron sin él.

### Un fallo es de HOY: no deja marca, no cobra y se puede reintentar

Es la distinción que estaba al revés, y la que convertía un tropiezo en un daño
permanente:

| | deja marca | se reintenta |
| --- | --- | --- |
| muy larga | no hace falta: se decide por la duración, antes de bajar un byte | no — mañana seguirá siendo igual de larga |
| sin créditos | **no** | sí, en cuanto haya |
| no se pudo bajar el audio, u OpenAI no contestó | **no** | **sí, pulsando otra vez** |

Aquí la nota la pidió una persona, así que un fallo de hoy —la red, un pico de
OpenAI— se reintenta y **no se ha cobrado nada**, porque el cobro va después de
tener el texto. Marcarlo dejaría esa nota sin transcribir para siempre y sin
decir por qué, que es exactamente lo que se veía.

Y **el motivo se dice, con el detalle que decide qué hacer**. «No se pudo
transcribir.» a secas es lo peor posible: no se sabe si recargar créditos,
avisar a soporte o sencillamente volver a pulsar. Son ocho valores en
`NoSeTranscribio` con su frase cada uno —sin créditos sale **con los números
delante**— y se quedan **debajo de la nota**, no en un aviso que se va: quien ve
pasar un mensaje de un segundo no sabe después por qué no hay texto.

**Las marcas viejas se ignoran al leer, sin backfill.** `laMarcaVieja` deja
`muy_larga` como explicación —eso sí es firme— y trata `fallo` como «todavía no
se ha pedido», así que las notas que hoy dicen «No se pudo transcribir.» vuelven
a ofrecer su botón en cuanto esto despliegue, sin tocar una sola fila. Al
guardar el texto la marca se borra.

### Dónde corre, y cómo se guarda

**La App no recibe los webhooks de WhatsApp**: los recibe el backend, que es
otro repositorio. Así que la nota se transcribe cuando alguien pulsa su botón en
la conversación, en una acción de servidor y no en ningún reloj.

Cuatro cosas que hay que mantener:

1. **La transcripción va en `raw`, NO en una columna nueva.** Es la misma
   decisión que ya tomaron `sentByAi` y `notaInterna`, con su motivo escrito al
   lado: **`chat_messages` la escriben tres sitios distintos** —la App, el
   webhook del backend y el chat-store— y añadirle columnas desde aquí es lo que
   reventó el #360. Se escribe con un **merge de JSONB**: escribir el objeto
   entero se llevaría por delante la foto de Evolution, los acuses y las
   reacciones.
2. **Y los PARÉNTESIS de ese merge no son estilo.** En Postgres el `-` que quita
   una clave liga **más fuerte** que el `||` que mezcla, así que
   `raw || objeto - 'clave'` se lee como `raw || (objeto - 'clave')`: la clave se
   le quita al objeto recién construido —donde no está— y la marca vieja **se
   quedaba puesta** junto al texto bueno. Lo cazó el banco.
3. **El `WHERE` del guardado es lo que impide pagar dos veces.** Va
   `AND raw->>'transcripcion' = ''`, así que con dos asesores pulsando a la vez
   solo una llamada escribe, y **solo esa descuenta**. Comprobado lanzando las
   dos en paralelo: una fila escrita, un cobro.
4. **Se cobra DESPUÉS de tener el texto**: cobrar antes y que la llamada falle
   sería cobrar por algo que no se entregó. Y no se cobra cuando la cuenta paga
   su propia IA.

**El precio se ve ANTES de pulsar**, como en el chat del equipo: el botón dice
«Transcribir 3 créditos», con el número en tono más claro, porque la duración
**es** el precio. Una nota por
encima del tope no ofrece botón y dice por qué — un botón que al pulsarlo da
error es peor que no tenerlo. Y **solo se ofrece en lo que entra**: lo que
escribe el asesor o la IA ya está en texto, así que transcribirlo es pagar dos
veces por algo que ya se tiene.

### Compartir la TARIFA no basta: hay que compartir la DURACIÓN

Una nota de 40 segundos decía **«1 crédito»** y a 6 créditos por minuto son 4.
Lo que despista es que el cálculo **ya estaba compartido**: `costoDeLaNota` la
importaban los dos lados, así que mirando la fórmula los dos «estaban bien».

Lo que no se compartía era **de dónde sale el número que entra**:

| | cómo leía la duración |
| --- | --- |
| servidor (`laNotaDeVoz`) | un `COALESCE` de SQL sobre **dos** formas de `raw` |
| pantalla (`chat-message-utils`) | `message.audioMessage.seconds`, y **solo esa** |

Cuando esa forma no estaba, el navegador sacaba **0**. Y `costoDeLaNota(0)` no
da cero: da el **mínimo**, que es 1 crédito. O sea que el fallo no salía como un
hueco ni como un error — salía como **un precio perfectamente creíble**. Es la
regla de *un número que no se puede calcular no se sustituye por otro*, rota de
la peor manera posible: el sustituto era un número que nadie iba a mirar dos
veces.

Dos cosas que hay que mantener:

1. **La duración la lee UNA función**, `segundosDeLaNota`
   (`lib/transcripcion-de-voz.ts`, pura). Entiende las formas conocidas —con
   sobre, sin sobre, `seconds` y `duration`, número o cadena— y **el `COALESCE`
   de SQL se fue**: la consulta trae `raw` y la lee esa misma función. Compartir
   la tarifa y no el lector es tener una sola fórmula con dos entradas, que es
   exactamente igual de roto y bastante más difícil de ver.
2. **Y baja del SERVIDOR, de la misma fila que cobra.**
   `persistedRowToEvolutionMessage` emite `audioSegundos` desde el mismo `raw`
   que después lee `laNotaDeVoz`. Así lo que se enseña no puede separarse de lo
   que se descuenta **por construcción**, y no porque dos sitios se acuerden de
   hacer lo mismo. El respaldo del navegador —el mensaje tal cual lo devolvió el
   proveedor— pasa por la misma función, así que tampoco puede contestar otra
   cosa.

Y cuando no hay duración en ninguna parte, **las dos puntas dicen 1**: se enseña
el mínimo y se cobra el mínimo. Eso es lo correcto — lo que no puede pasar es
que una diga 1 y la otra 4.

El banco lo prueba **encadenando las dos**: siembra la fila, la lee por el
camino del servidor y por el de la pantalla, y compara los dos precios. Probar
cada lado por su cuenta es lo que dejó pasar esto.

### Y la pastilla va en el renglón de la HORA

En un renglón propio debajo del reproductor, el botón hacía crecer la burbuja de
alto **por cada nota** —y una conversación de notas son todas— y, siendo un
texto subrayado suelto, se leía como un aviso de error. El pie de la burbuja ya
es la fila de los rótulos pequeños, donde viven «Asesor», «Agente IA»,
«Editado» y «Eliminado»: la pastilla entra ahí a la izquierda y la hora se queda
a la derecha con `ml-auto`.

Medido en Chromium sobre el CSS del build, a 1440, 1024 y 390:

| | alto de la burbuja |
| --- | --- |
| en su renglón | 86 px |
| en el de la hora | **70 px** |

La pastilla mide 127×14 y la hora sigue pegada al borde; no se solapan ni con
«Editado» al lado, y la página no desborda en ninguna de las tres.

**El texto y el motivo siguen debajo del audio**, que es donde se leen: son
frases enteras y en el renglón de la hora partirían la fila. Por eso el botón y
el texto salen de **un hook y no de dos componentes** (`useTranscribirNota`): se
pulsa arriba y el texto tiene que aparecer abajo, así que comparten un estado y
quien los llama coloca cada nodo donde le toca.

## Salud del envío: un envío automático que falla deja rastro, o no ha fallado

Los recordatorios de Cobros y los avisos de desconexión llevaban **días sin
salir por Waha** y nadie se enteró hasta que se miró a mano. No es que no
hubiera error: es que el error se lo quedaba quien llamaba, en su `return`, y
ahí se acababa. Desde fuera eso no se parece a un fallo — se parece a que la
plataforma no le escribe a nadie, que es el síntoma más caro de diagnosticar de
todo este documento.

`/panel/salud-envios` (súper administrador) lista lo que la plataforma manda
sola —cobros, desconexiones, facturación, prueba de 7 días, informe semanal y
el aviso de ticket resuelto— con fecha, cuenta, proveedor, destinatario, si
salió y **el motivo del fallo**. Arriba, el resumen por proveedor y los avisos.

La tabla es de la App, `envios_automaticos`, con `CREATE TABLE IF NOT EXISTS` y
sin clave foránea: la cuenta se puede eliminar y el registro de lo que se le
mandó tiene que sobrevivirla — el nombre sale de un **`LEFT JOIN`**, no de un
`JOIN`, o esas filas desaparecerían justo cuando hacen falta.

**La regla, y es la que sostiene que esto no se quede a medias:**

> **Lo anota el DESPACHADOR, no cada llamador.** Los seis caminos automáticos
> pasan todos por `sendViaWhatsAppDispatcher`, así que ahí hay un solo sitio que
> sabe qué proveedor se usó, qué línea, a quién y cómo fue. Con la anotación
> escrita en cada llamador, el séptimo se olvida — y un camino que no anota se
> ve exactamente igual que uno que funciona.

Y por eso el despachador se partió en dos: `mandarElTexto` es el cuerpo de
siempre, intacto, y `sendViaWhatsAppDispatcher` lo envuelve y anota. **Lo que
decide si se anota es el parámetro `registro`**, no una heurística: un envío sin
él —el asesor escribiendo a mano desde Chats— no entra. Esto es lo que sale
solo.

Seis cosas que hay que mantener:

1. **Anotar NUNCA tumba el envío.** `anotarElEnvio` lleva todo dentro de un
   `try` y avisa por consola; no lanza. Se prueba tirando la tabla por debajo a
   mitad de vuelo: el mensaje sigue contando como bueno y el registro se
   recupera solo, porque el recuerdo de «ya la creé» es del proceso y `conLaTabla`
   lo olvida ante un `42P01`.
2. **Los dos caminos que NO pasan por el despachador se anotan en su sitio**, y
   son justo los dos fallos más silenciosos: no hay ninguna línea conectada
   (`anotarQueNoHabiaLinea`, proveedor **`ninguno`**) y la rama de plantilla de
   Meta que se devuelve antes. **`ninguno` es un proveedor más**: sin esa
   casilla, «a esta cuenta no le llega nada porque se quedó sin línea» no
   tendría ni una fila, y confundirlo con un fallo de Waha manda a mirar el
   servidor equivocado.
3. **Un proveedor que nadie usa NO está roto.** Los dos avisos exigen
   `total > 0`. Una plataforma sin ninguna línea Meta vería «Meta no ha
   conseguido enviar nada» todos los días de su vida, y un aviso que sale
   siempre se aprende a despachar sin leer — con lo que el día que Waha se caiga
   de verdad, ese también se ignora.
4. **Un proveedor muerto da UN aviso, no dos.** Con cero aciertos la tasa es del
   100 %, así que `sin_acierto` corta y no se emite además `tasa_de_fallo`: dos
   avisos para un solo problema es ruido. Y la tasa **no se juzga por debajo de
   `MINIMO_PARA_JUZGAR`** (5): un envío y un fallo son el 100 % y eso no dice
   nada.
5. **Sin intentos la tasa es `null`, nunca `0`.** Es la regla de *un número que
   no se puede calcular no se sustituye por otro*: un «0 % de fallo» sobre cero
   envíos diría que todo va perfecto, que es el peor número posible en una
   pantalla que existe para cazar que no salga nada.
6. **El resumen y los avisos se calculan SIN los filtros de cuenta y estado.**
   Filtrando por «Fallaron» la tasa saldría del 100 % siempre, y el aviso
   destacado pasaría a ser una consecuencia de lo que se acaba de pulsar en vez
   de un dato. Los días sí acotan, que es la ventana de la pregunta.

La lista va topada (`TOPE_DE_LA_LISTA`, 500) y **lo que se recorta se dice**; se
guardan 30 días, podados con un `DELETE` que corre **una de cada cien vueltas**
y en su propio `try` — un barrido que se cuelga no puede retener el envío que lo
disparó.

### Y los anchos de la tabla están medidos, con las dos puntas

Siete columnas, y la que importa es la última: el **motivo**. Costó dos
correcciones, una por cada extremo, y las dos se ven midiendo y no mirando.

- Con el reparto automático, `573001112233@s.whatsapp.net` es **un token sin
  espacios**: su ancho mínimo manda sobre el `w-*` declarado, `truncate` no
  llega a recortar nada y la tabla se salía de su caja —1233 px dentro de
  1216—. Va `table-fixed`.
- Pero fijado el reparto, en una ventana estrecha lo que se encoge es la
  **última** columna, o sea el motivo: medido a 1024 px se quedaba en **94 px**,
  que para leer por qué rebotó un mensaje es lo mismo que no enseñarlo. Es el
  mismo defecto de antes reaparecido por el otro lado. Va `min-w-[60rem]` —las
  seis fijas (44rem) más las 16rem del motivo— con `overflow-x-auto` en el
  padre: por debajo de ahí la tabla se **desplaza**, que es preferible a
  recortar justo lo que se viene a leer.

Medido en Chromium sobre el hueco real del panel, no sobre la ventana:

| ventana | caja | tabla | motivo | la tabla se desplaza |
| --- | --- | --- | --- | --- |
| 1440 | 1216 | 1214 | **510** | no |
| 1280 | 1056 | 1054 | **350** | no |
| 1024 | 800 | 960 | **256** | sí |

La página no desborda en ninguna, el resumen se queda en cuatro tarjetas por
fila y la cuenta recorta con puntos suspensivos, con el nombre entero en su
`title`.

## Documentación: lo que se menciona tiene que poder ENCONTRARSE

`/documentos` es la documentación interna de una cuenta: espacios, documentos
con editor de texto, listas con tres vistas, plantillas, buscador, historial de
versiones y permisos. Lo que hasta ahora vivía en archivos de Word sueltos.

**Y se pensó desde el principio como módulo de CLIENTE, no como pantalla de la
casa.** No hay ni un id de Verzay en todo el módulo: cada espacio cuelga de su
`cuentaId`, la ruta entra en `navigationRoutes` y **no se monta en ninguno**
—se asigna a mano, como `/cobros`—, y la puerta vive en la acción. Ofrecérselo
mañana a una cuenta cliente es asignarle una pestaña, no tocar código.

> Ojo con el nombre: **`/documentacion` ya existe y es otra cosa** — una landing
> pública e indexada sobre cómo conectar el API de Meta, con su `generateMetadata`
> y su canónica. Por eso esto es `/documentos`. El build lo caza («two parallel
> pages resolve to the same path»), pero conviene saberlo antes de elegir ruta.

### La regla de la que cuelga todo

> **La mención y el buscador son UNA función.** La etiqueta de una mención entra
> en el texto plano que indexa el GIN, así que buscar el nombre de un cliente
> saca el procedimiento que lo nombra. Sin eso el buscador contesta «sin
> resultados» con toda normalidad, el documento sigue ahí, y no hay ningún error
> que mirar — la familia de fallo mudo de la que va medio este documento.

Y su pareja, que es la de seguridad:

> **Lo que no se puede ABRIR no se puede LISTAR, ni buscar, ni asomar por un
> retroenlace.** Las cuatro preguntan a la misma función (`accesoAlDocumento`).
> Con dos condiciones llega el día en que discrepan, y entonces el documento sale
> en el árbol y al pulsarlo dice «No autorizado»: el «menú abierto, puerta
> cerrada» que este repositorio ya pagó en Clientes, en Equipo, en Analíticas y
> en el panel.

El retroenlace es donde esa segunda mitad se olvida, porque **no se pide desde
la pantalla de documentación**: se pide desde la ficha de una tarea o de un
ticket. Sin el filtro, abrir una tarea enseñaría el título de un documento
restringido. El banco lo prueba desde las tres puertas a la vez.

### Seis tablas de la App, y el texto plano aparte

`doc_espacios`, `doc_documentos`, `doc_versiones`, `doc_menciones`,
`doc_permisos` y `doc_filas`, todas con `CREATE TABLE IF NOT EXISTS` y **sin
clave foránea**. Nada cuelga de `tasks`, `Project`, `Session` ni `User`:
añadirles columnas desde aquí es lo que reventó el #360.

`doc_documentos` guarda el cuerpo **dos veces a propósito**: `contenido` (el
JSON del editor) y `texto` (el mismo cuerpo aplanado). El segundo es lo que
indexa el GIN y de donde sale el extracto de un resultado. Calcularlo al leer
sería aplanar el JSON de todos los documentos de la cuenta en cada búsqueda.

**Y `texto` va topado a 100.000 caracteres, que no es comodidad: es lo que
impide que guardar falle.** Un `tsvector` de Postgres no puede pasar de 1 MB —no
se degrada, da error—, así que sin el tope un documento largo **no se podría
guardar**, y el error saldría al escribir, donde nadie lo relacionaría con la
búsqueda. El contenido entero se guarda igual; lo que se recorta es la copia que
se indexa, y **se dice** (`textoRecortado`).

### Aplanar el contenido: iterativo, con presupuesto, y de una pasada

`leerElContenido` saca el texto y las menciones **en un solo recorrido**, y es
iterativo con un tope de nodos, nunca recursivo. Tres motivos, los tres reales:

1. El contenido llega **del navegador**, así que su forma no es de fiar. Con
   recursión, un JSON hondo es un desbordamiento de pila y un 500 sin explicar.
   El banco lo ejerce con 60.000 de hondo: termina y llega al fondo.
2. Dos recorridos es pagar dos veces en el camino más caliente que tiene esto
   —cada guardado de cada documento—.
3. Y si un día uno se recortara por el presupuesto y el otro no, el documento
   quedaría indexado hasta la mitad y con menciones de la otra mitad. Un estado
   que nadie sabría explicar.

Los bloques separan con salto de línea: sin eso «del cliente» y «El siguiente»
dan `clienteEl`, una palabra que no existe y que no encuentra nadie.

### Una versión por CAMBIO, no por guardado — y el JSONB no se compara como texto

Esto lo cazó el banco y **es el fallo que más lejos habría llegado sin él.**

La comparación era `JSON.stringify(lo que hay) === JSON.stringify(lo que llega)`.
Pero **JSONB normaliza el orden de las claves al guardar**, así que los dos
textos no coinciden nunca aunque el dato sea idéntico. Con el guardado
automático puesto, eso significa **una versión nueva cada dos segundos y medio**,
para siempre: el historial se llena de entradas iguales hasta que volver atrás
deja de servir para nada, que es exactamente como se estropea un historial de
versiones.

**La comparación se hace en SQL**, con el `=` de jsonb, que compara el DATO y no
su texto. Si se escribe otra comparación de un JSONB contra lo que manda el
navegador, va igual.

Y dos cosas más del historial:

- **Volver atrás es un cambio MÁS, no un borrado.** Se guarda como una versión
  nueva con el contenido de la vieja, así que el historial conserva que se volvió
  y desde dónde. Reescribiendo la fila y tirando lo de en medio, deshacer una
  vuelta atrás sería imposible — y es justo lo que hace falta cuando alguien se
  equivoca al restaurar.
- **El autor se COPIA dentro** (`autorNombre`), como en el chat de equipo: el
  historial sigue diciendo quién cambió qué aunque esa persona salga del equipo.

### Dos personas a la vez: no se pisa, y se DICE

Un documento no es un arrastre de tablero, que se deshace volviéndolo a
arrastrar: lo que se pierde es el párrafo de alguien. Así que el guardado manda
la versión que tenía delante y, si la guardada es mayor, **no escribe**: lanza
`LoCambioOtro`.

Y se distingue de cualquier otro fallo a propósito. Un «no se pudo guardar»
genérico haría que la persona lo reintentara, **y reintentar es justo lo que pisa
el trabajo del otro**. La pantalla para el guardado automático y lo explica.

La comprobación va **dentro del `FOR UPDATE`**: fuera, dos guardados simultáneos
leerían los dos la misma versión y pasarían los dos.

### Firmar con la persona, alcanzar con la cuenta

Es el reparto ya unificado del resto de la plataforma, aplicado aquí:

| | qué contesta | con qué |
| --- | --- | --- |
| **firmar** | quién escribió esto | la **persona** (`laPersonaQueActua`) |
| **alcanzar** | hasta dónde llego | la **cuenta** (la fila efectiva) |

Así que `creadoPorId`, `actualizadoPorId` y el autor de cada versión son la
persona —dentro de una cuenta ajena con «Ingresar», el historial dice quién
estaba sentado delante y no el nombre del cliente—, y a qué espacios se llega
sale de `laCuentaDeQuienMira`. Resolver la persona ahí es lo que rompió la
cartera de clientes en el #783.

Y **los documentos de un espacio cuelgan de la cuenta DUEÑA**, los escriba quien
los escriba. Es la misma regla que en Proyectos compartidos: un espacio, un juego
de documentos. Guardándolos bajo la cuenta invitada se quedarían fuera de los dos
árboles.

### Los permisos: `sujetoTipo`, y un agente SÍ lee

`doc_permisos` guarda `sujetoTipo` (`persona` | `cuenta`) y no un id a secas, que
es lo contrario de `note_shares`. Allí funciona una columna ambigua porque
compartir una nota significa una sola cosa; aquí significan dos, y compartir con
una **cuenta** tiene que alcanzar a su equipo entero — que es el caso que hace
posible dárselo a un cliente, porque quien comparte no administra ese equipo y no
puede acordarse de añadir a cada persona que entre después. Una cuenta también es
una fila de `User`, así que sin el tipo no habría forma de distinguirlas: es la
misma razón por la que `team_channel_accounts` se hizo aparte.

**Y un `agente` sí lee lo que alcanza su cuenta.** Es una divergencia a propósito
de la regla de las notas, donde no hereda: allí una nota compartida con la cuenta
no se le asignó a él; aquí compartir un espacio con la cuenta de un cliente **es**
para que lo lea su gente, y dejarlos fuera vaciaría la función. Lo que no cambia
es la otra mitad: **participa, no manda**. Crear, borrar y repartir siguen siendo
de quien gestiona la cuenta.

Cuatro cosas más:

1. **Un espacio restringido lo sigue viendo quien administra la cuenta.** Es la
   misma decisión, tomada a propósito, que deja al administrador leer los
   directos de su cuenta en el chat de equipo: es una herramienta de trabajo, no
   un cajón privado. Y sin ella un espacio se vuelve inalcanzable el día que su
   creador se va.
2. **En uno RECIBIDO no manda nadie de esta cuenta**, ni con edición: repartirlo
   sigue siendo de quien lo hizo. Igual que en Proyectos y en Diagramas.
3. **Entre dos filas gana la que MÁS deja hacer.** Puede haber una para la
   persona y otra para su cuenta; quitarle la edición por tener además una de
   lectura sería un permiso que cambia según por dónde se mire.
4. **Un permiso a un id que no existe se rechaza.** No abre nada, pero el diálogo
   lo pintaría como si alguien tuviera acceso, que es peor que no tener la fila.

### Las tres vistas son TRES pintores y UN dato

`doc_filas` es el único dato de una lista: la tabla, el tablero y el calendario
leen esas mismas filas. No hay tres copias que mantener a la par, que es justo lo
que hace que en otras herramientas «el calendario a veces no coincide».

**El calendario dice cuántas filas deja fuera.** Una fila sin fecha no cabe en un
calendario y eso no tiene vuelta; lo que no puede pasar es que desaparezca en
silencio: con 60 filas y 20 fechas, el calendario enseña 20 y desde fuera se lee
como que se perdieron 40. Es la regla de siempre —*si no suma, se dice*—.

Y **el tablero no pierde una fila con un estado que ya no existe**: cae en la
primera columna. Dejarla fuera sería borrarla de la vista sin borrarla de la
base — no está y sigue contando.

El orden dentro de una columna va por **`orden_en_tablero`, el tablero compartido
de Proyectos y Tickets**, con un `tipo` nuevo. Un mecanismo propio para lo mismo
es uno que se afina y otro que se queda atrás.

### El editor es el de Notas, y la mención no trajo dependencias

`components/shared/EditorDeTexto.tsx` lo usan Notas y Documentación. Las tres
props que entraron para esto —`extensiones`, `alMontar`, `placeholder`— van todas
con su valor de siempre por defecto, así que **Notas se comporta exactamente
igual**. Es la misma forma en que `BloqueDeAdjuntos` se abrió a Tickets sin
copiarlo.

El nodo de mención se escribe con `Node.create`, que **`@tiptap/react` ya
reexporta**: cero dependencias nuevas, frente a las dos que habría traído
`@tiptap/extension-mention` para darnos un selector imperativo que además habría
que envolver. El selector se escribe en React con las reglas que ya costaron una
vuelta en el chat de equipo: la arroba tiene que **abrir palabra** —la MISMA
condición con la que el servidor decide, o la lista ofrecería algo que luego no
se menciona—, `onMouseDown` y nunca `onClick`, y con la lista abierta manda la
lista.

Y el nodo es un **átomo**: sin eso se puede meter el cursor dentro y borrar media
etiqueta, y entonces la mención sigue contando para el retroenlace mientras en
pantalla pone otra cosa.

### Los anchos, medidos

Con `table-fixed` **el ancho total manda sobre el declarado de cada columna**:
con `min-w-[48rem]`, las cuatro columnas fijas (29rem) le dejaban al TÍTULO 224 px
en vez de las 18rem escritas ahí mismo — la columna que de verdad se lee salía la
más apretada. Y el número final sale de medir y no de redondear: a 1280 el
documento se queda con **734 px útiles** (768 menos el `p-4` de su caja y menos
los 2 px del borde), así que 47rem se desplazaba 16 px y 46rem, 2 — un scroll que
no aporta y que hace parecer que algo está roto.

| ventana | árbol | documento | columna del título | la tabla se desplaza |
| --- | --- | --- | --- | --- |
| 1440 | 320 | 928 | **430** | no |
| 1280 | 320 | 768 | **270** | no |
| 1024 | 288 | 544 | **256** | sí |

El árbol no crece hasta `xl` por lo mismo: con 20rem desde `lg`, a 1280 el
documento se quedaba en 768 y la tabla se desplazaba por 32 px de nada. **Quien
cede es el árbol**, que enseña títulos recortados con su `title` encima, y no el
documento, que es lo que se viene a leer — la misma decisión que en Chats, donde
la conversación tiene suelo y quien cede es la ficha.

Y las tarjetas del tablero miden **39 px las dos**, con una y con dos líneas: es
lo que reserva `min-h-[2.75em]`, y el número depende del interlineado (2 × 1.375em
con `leading-snug`).

### El aterrizaje es UNA función, y son tres reglas

Los dos sentidos están enteros: desde una tarea o un ticket se ven los
documentos que los nombran, y pulsar una pastilla abre **la ficha**, no la lista
con la ficha dentro en algún sitio. Aterrizar en la lista y dejar buscar la fila
no es llegar — en una cuenta con cientos de clientes es no llegar.

Las cuatro pantallas leen su parámetro (`?documento=`, `?cliente=`, `?tarea=`,
`?ticket=`) y las tres de fuera lo hacen con **`useAterrizajeDeMencion`**
(`hooks/`). Cada una pone solo cómo se busca y cómo se abre; lo que **no** puede
variar son estas tres, y con la regla copiada en cada pantalla la tercera se
equivoca — y equivocarse aquí no se ve como un error, se ve como un enlace que
no lleva a ningún sitio:

1. **Solo la primera vez**, con un guardián por referencia. Sin él, cada
   repintado volvería a abrir la misma ficha y no se podría navegar a ninguna
   otra. Es la misma regla que el salto de la campanita al mensaje de un canal.
2. **Se espera a que la lista esté cargada** (`listo`). Buscando antes, el id no
   está todavía y el aterrizaje se daría por fallido con la ficha perfectamente
   disponible un segundo después.
3. **Y si no se encuentra, se DICE.** Una pantalla que se abre en su lista de
   siempre después de pulsar un enlace no se lee como «ya no está»: se lee como
   que el enlace no funciona.

Dos cosas de cada pantalla que no son obvias:

- **En Clientes la ficha es el diálogo de Editar, y se pasa a «Todos» si hace
  falta.** Esa pantalla nace filtrada en «Activos», así que con un cliente
  suspendido el diálogo salía encima de una lista donde su fila no estaba — y al
  cerrarlo parecía que el cliente no existe.
- **En Tareas NO HABÍA ficha**, y por eso se escribió (`FichaDeLaTarea`). Era
  además el único sitio donde leer entero el texto de una tarea vieja —cuyo
  ladrillo sigue dentro de `title`— y donde una tarea suelta puede enseñar sus
  retroenlaces: hasta ahora eso solo existía en el tablero de Proyectos. **Se
  llega pulsando el título**, no solo por la URL: una pantalla a la que
  únicamente se entra con un enlace pegado a mano es media función.

### El selector de permisos: manda la lista, no el texto

El diálogo pedía **pegar el id a mano** y elegir el tipo en un desplegable, y
eso pide dos cosas que nadie tiene delante: el id de la fila y saber si esa fila
es una persona o una cuenta. Un id mal pegado se guardaba como un permiso que no
abría nada, y equivocarse de tipo dejaba fuera al equipo de una cuenta sin
decirlo.

Ahora se teclea un nombre y **el tipo viaja dentro de lo elegido**. Filtra la
MISMA función que el selector de menciones (`loQueOfreceElSelector`, sin acentos
y sin mayúsculas: quien teclea «atencion» tiene que encontrar «Verzay |
Atención»); con dos, esa cuenta se encontraría al mencionar y no al compartir, y
eso se lee como que no se puede compartir con ella.

Cuatro cosas que hay que mantener:

1. **La lista que se OFRECE es la que el servidor acepta.**
   `loQueSePuedeCompartirAction` y `ponerPermisoAction` salen las dos de
   `losQueSePuedeCompartir`. Antes el servidor solo comprobaba que el id
   existiera en `User`: con eso, una petición a mano le daba acceso a una
   persona de **otra cuenta** —que no se ofrece por ningún lado— y esa persona
   empezaba a leer el espacio. Y por el otro lado, una validación más estrecha
   que la lista ofrecería a alguien que al guardar se cae sin decir por qué.
2. **Las personas son el equipo Y LA CUENTA MISMA.** Su fila no cuelga de nadie,
   así que sin esa mitad al dueño no se le podría dar acceso a nada — es el
   mismo agujero que ya costó una vuelta en los directos del chat de equipo.
3. **Lo ya concedido se marca, no se esconde, y la llave es TIPO + ID.** Una
   cuenta y una persona son las dos filas de `User`: comparando solo por id,
   elegir a la persona saldría como «ya tiene acceso» porque su cuenta lo tiene.
   Y esconderlo dejaría sin forma de pasar a alguien de lectura a edición, que
   la fila de arriba solo se puede quitar.
4. **La lista va detrás de la misma puerta que repartir.** Ofrecer las cuentas
   de la plataforma a quien no puede compartir nada es enseñar de balde quién
   hay dentro.

Y una de medida que solo se ve en un móvil: los hijos de `DialogContent` son
celdas de un **`grid`**, y una celda se mide por su contenido mínimo. El nombre
de una cuenta va con `truncate` —o sea sin cortes de línea—, así que su mínimo
es el nombre **entero**: medido en Chromium a 390 px, el bloque salía de **565
dentro de un diálogo de 390**. `min-w-0` en el hijo del flex **no basta**; va en
la celda. Con él, 340 y sin desbordar.

## Carpetas: ordenan la pantalla, no viven dentro de la cosa

Proyectos y Diagramas se llenan y acaban siendo una cuadrícula donde no se
encuentra nada. Se pueden agrupar en carpetas (`actions/carpetas-actions.ts` y
`components/shared/Carpetas.tsx`, que usan las dos pantallas: el estado, la
barra de chips y el botón de mover son los mismos).

Dos decisiones que conviene no deshacer:

1. **No hay `folderId` dentro de `Project` ni de `flows`.** Hay una tabla aparte
   (`work_folder_items`) que dice qué está en qué carpeta. `Project` es del
   BACKEND —él es dueño de las migraciones— y añadirle columnas desde la App es
   lo que reventó el #360. Las dos tablas nuevas (`work_folders`,
   `work_folder_items`) las crea la propia App con `CREATE TABLE IF NOT EXISTS`,
   igual que `flows` y `chat_messages`.
2. **La carpeta no filtra en el servidor.** La lista de cosas ya viene entera;
   el navegador solo decide cuáles pinta. Cambiar de carpeta es instantáneo y no
   depende de una vuelta de red, y los números de cada chip salen de la lista
   completa, no de lo que deje ver el filtro que haya puesto.

Y dos de comportamiento: **borrar una carpeta no borra lo que tiene dentro**
—vuelve a salir suelto, y el diálogo lo dice—, y **mover se pinta al momento**;
si el servidor dice que no, se devuelve tal cual estaba (la misma regla que
borrar un chat).

La carpeta es de la **cuenta**, con `effectiveId`, que es el mismo valor con el
que agrupan Proyectos (`ownerId ?? id`) y Diagramas. Si se usara otro, las
carpetas quedarían en una cuenta y las cosas en otra.

### Y el ORDEN de las tarjetas, por lo mismo y por una razón más

Las tarjetas de Proyectos y de Diagramas se reordenan arrastrándolas, con el
mismo patrón de los módulos —`@dnd-kit`, y el asa `GripVertical` en una esquina,
no la tarjeta entera: estas están llenas de botones y con los oyentes en la
tarjeta cada clic compite con un arrastre—.

**El orden es de la CUENTA, uno solo**, como las carpetas: lo que coloca alguien
lo ve su equipo. No es una preferencia de cada persona; si lo fuera, dos asesores
mirando la misma pantalla verían dos pantallas distintas y no podrían decirse «el
tercero empezando por arriba». Lo mueve quien administra (`canManageWorkspace`);
un **agente lo ve y no lo toca**, y la puerta está en `guardarElOrdenAction`, no
en la pantalla — esconder el asa evita el arrastre accidental, no la petición.

Y **Diagramas usa exactamente el mismo mecanismo**, por un motivo que no es el de
siempre y conviene no confundir:

> Con `Project` vale la razón conocida —es del BACKEND y añadirle columnas desde
> aquí es lo que reventó el #360—. Pero `flows` **sí es tabla nuestra** y
> admitiría una columna `orden`, así que la pregunta es legítima. No se puede
> igual: **una cosa compartida tiene UNA fila y DOS sitios.** Un proyecto
> compartido con la cuenta de un cliente sale en las dos pantallas y cada cuenta
> lo coloca donde quiera; una columna en la fila solo guarda una posición, así
> que moverlo en una cuenta se lo movería a la otra. `flow_shares` tiene el mismo
> problema. **La posición es de la pareja cuenta + cosa**, y por eso vive en
> `work_item_order`, al lado de `work_folder_items`.

Tres cosas que hay que mantener:

1. **Sin nada guardado, la lista sale TAL CUAL llegó.** El mapa vacío no ordena
   nada, así que esto no cambió ninguna pantalla hasta que alguien arrastró la
   primera tarjeta: el orden de siempre —lo último editado arriba— seguía
   mandando. Y **lo que no tiene posición va PRIMERO**: un proyecto creado hoy no
   puede caer al fondo de cuarenta tarjetas colocadas hace un mes, porque crear
   algo y no verlo se lee como que no se creó.
2. **Arrastrar guarda la lista COMPLETA, no la que se ve.** Es la trampa, y no se
   nota probando sin filtros: la rejilla puede estar filtrada por texto, estado,
   responsable o carpeta, así que se mueven las visibles y hay que escribir
   todas. Calculando `0..n` sobre lo visible, lo escondido pierde su sitio y
   salta al principio **al quitar el filtro**, que es cuando ya nadie relaciona
   las dos cosas. El banco lo reproduce a propósito antes de probar lo bueno.
   Por eso el movimiento se calcula sobre la lista entera
   (`moverEnLaListaCompleta`), usando el sitio que ocupa en ella la tarjeta sobre
   la que se soltó.
3. **Una consulta, no una por tarjeta.** Los módulos guardan con un
   `updateModuleOrder` por tarjeta y con ocho se aguanta; con cuarenta proyectos
   serían cuarenta peticiones por arrastre, que es «muchas peticiones pequeñas
   son turno, no trabajo». Va un `INSERT ... ON CONFLICT` de varias filas. Y los
   **ids repetidos se descartan antes**: dos veces la misma fila en un mismo
   `INSERT` y Postgres rechaza el comando entero.

Y dos de rejilla, medidas y no a ojo: la tarjeta pasa a colgar del envoltorio y
no de la rejilla, así que **necesita `h-full`** o deja de estirarse hasta la
altura de su fila y vuelve la rejilla escalonada; y el hueco del asa se reserva
con un `pl-*` **solo en la primera fila** de la tarjeta —el asa está arriba, y
desplazar la tarjeta entera dejaría el resto descolgado—. La estrategia de
`@dnd-kit` es **`rectSortingStrategy`**, no la `verticalListSortingStrategy` de
los módulos: esto es una rejilla de varias columnas y aquella solo sabe de una.

### Un fichero `'use server'` SOLO exporta funciones asíncronas

Esto costó la primera versión entera. `actions/carpetas-actions.ts` exportaba
también una constante (`TIPOS_DE_CARPETA`). Next lo admite en el build —**`npm
run build` pasó limpio**— y luego, en producción, **cada llamada a cualquier
acción de ese fichero da 500**. Desde fuera: se pulsaba «Crear» y el botón se
quedaba en «Guardando…» **para siempre**, sin un solo error en pantalla.

Dos reglas:

1. En un módulo `'use server'`, todo lo que no sea una función `async` va a otro
   fichero. Los tipos y las constantes de carpetas están en `lib/carpetas.ts`.
   Un `export type` sí puede quedarse: se borra al compilar.
2. **Ninguna llamada a una acción puede dejar un botón colgado.** Una acción no
   solo devuelve `success: false`: puede **reventar**, y entonces el `await` se
   rompe y la línea que apaga el «Guardando…» no llega a ejecutarse. Van todas
   por `pedir(...)` (en `components/shared/Carpetas.tsx`), que convierte el
   fallo en un `success: false` con su aviso. Es la misma familia que «un fallo
   nunca puede ser mudo»: aquí el síntoma no era un error, era un diálogo
   congelado.

## Un `opacity-0` no libera sitio: el hueco sigue ahí

En la rejilla de Diagramas los nombres salían recortados —«Verz…», «Distr
Pa…»— aunque la tarjeta pareciera medio vacía. La culpa era de la fila de
botones: están en `md:opacity-0` y solo se ven al pasar el mouse, pero
**siguen ocupando su ancho**. Cinco botones de 28 px más el icono, en la
rejilla de cuatro columnas, le dejaban al título unos 50 px.

Las acciones van **fuera del flujo** (`absolute` en la esquina, sobre la
tarjeta, que ya es `relative`) y el nombre se lleva todo el ancho. Tres cosas
que hay que mantener:

1. **Fondo propio** en el bloque de acciones. Al aparecer encima del nombre,
   sin él se leen las dos cosas superpuestas.
2. **Sitio reservado solo donde hacen falta.** En táctil no hay mouse que pasar
   y los botones están siempre puestos, así que el título lleva `pr-[8.5rem]` y
   lo quita en `md:` —donde solo salen al pasar el mouse, y tapar un poco el
   nombre justo cuando apuntas ahí no molesta—.
3. El nombre completo va en el `title` del elemento: recortado a dos líneas, el
   tooltip es lo único que lo dice entero.

Si se añade otro botón a una tarjeta, se mira antes cuánto ancho le queda al
nombre. Es la misma familia que el hueco en blanco de las tarjetas de Conexión:
lo que no se ve también ocupa.

### La tarjeta de Diagramas son TRES filas, y no cambian

Sacar los botones del flujo arregló el ancho pero no la altura: los datos iban
todos en una fila que se partía sola, así que «Analisis» ocupaba una línea,
«Funel (Ventas)» dos y «Verzay Ventas (Cierre)» tres. La rejilla salía
escalonada.

La anatomía es fija, siempre la misma:

1. **El nombre**, con sitio para **dos líneas aunque use una** (`line-clamp-2`
   más `min-h-[2.5em]`). Eso es lo que iguala las alturas sin recortar los
   nombres largos; el completo va igualmente en el `title`.
2. **Pasos y fecha.**
3. **El permiso y los botones**, sobre una raya y pegados al borde de abajo con
   `mt-auto`, para que queden a la misma altura en todas.

Y los botones **ya no se esconden hasta pasar el mouse**: en un móvil no hay
mouse que pasar, así que allí no había forma de llegar a ellos. Va suelta la
carpeta —es lo que se usa para ordenar— y el resto dentro de un «⋯»: renombrar,
duplicar, compartir y eliminar. El permiso sigue siendo su propio menú, que es
donde se cambia.

La fecha vieja perdió el «Editado el» delante: con la fecha larga no cabía y se
recortaba, que era justo lo que se veía.

## Clientes: «activo» es cuenta habilitada Y servicio al día

La lista de Clientes decía «Total clientes 35», y de esos no todos eran
clientes: había suspendidos, morosos y cuentas a las que nunca se les configuró
el servicio. El número servía para poco.

Activo son **dos cosas a la vez**: la cuenta habilitada (`User.status`, el
muñequito de la columna Estado) **y** el servicio al día
(`UserBilling.accessStatus === ACTIVE`, el mismo estado que ya mandan Finanzas y
Analíticas). Con solo la facturación, el filtro de «Activos» enseñaba filas con
el muñequito en rojo: cuentas deshabilitadas que no entran a la App pero cuya
facturación seguía diciendo `ACTIVE`. La regla vive en `lib/clientes-activos.ts`
para que los tres sitios digan el mismo número; si hace falta en otra pantalla,
se importa de ahí y no se vuelve a escribir la condición.

Tres cosas de la pantalla:

1. **El filtro no va dentro de «Columnas».** Ese menú decide qué **datos** se
   enseñan de cada fila; el estado decide **qué filas** hay. Es un desplegable
   propio, y cuando no está en «Todos» se pinta en azul: un filtro puesto que no
   se nota es lo que hace pensar que faltan clientes.
2. **Sin fila de facturación no se da por activo.** Es una cuenta a la que nunca
   se le configuró el servicio, y contarla es justo lo que inflaba el total.
3. **Las opciones son tres palabras**: Todos, Activos, Inactivos. Nada de
   «Con servicio activo»: el desplegable ya se llama «Estado».

Y la barra de esa pantalla va **como la de Equipo**, que es la que estaba bien:
**izquierda fija** (el buscador y «+ Nuevo»), **zona central que scrollea**
cuando no cabe (`flex-1 min-w-0 overflow-x-auto`, con `ml-auto` en el primer
hijo para que se peguen a la derecha mientras sobre sitio y `shrink-0` en cada
uno) y **derecha fija** («Acciones»). Con el menú lateral desplegado, sin esa
zona central, «Columnas» y «Acciones» se salían de la pantalla y **no había
forma de llegar a ellos**.

**Partirla en filas con `flex-wrap` no vale**: se descoloca —«+ Nuevo» se va
solo a un extremo y la segunda fila queda suelta—. Lo que se hace es dejar que
el trozo del medio se desplace. Si se añade otro botón a esa barra, va dentro de
la zona central, no fuera.

Y del lado de los datos: `getEnrichedClients` trae **solo los dos estados**
(`accessStatus`, `billingStatus`), no la fila entera. El `price` es un `Decimal`
y no viaja a un componente de cliente.

## Cobros: la cartera de una cuenta NO es el cobro de la plataforma

Se parecen tanto que la tentación es fundirlos, y son cosas distintas. El de
Verzay vive en `actions/billing/**` sobre `UserBilling`, cobra licencias de la
App y sus ramas **suspenden y borran cuentas**. Cobros es la cartera de una
cuenta cliente con SUS clientes —internet, streaming, cualquier suscripción— y
lo peor que hace es mandar un WhatsApp.

Así que es **código nuevo con el mismo patrón**, no una generalización de aquel:
cuatro tablas de la App (`cobros`, `cobro_adjuntos`, `cobro_ciclos`,
`cobros_config`) con `CREATE TABLE IF NOT EXISTS` y el reintento del `42P01`
mirando `meta.code`. **`UserBilling` no se toca**, ni para leer. Fundirlos
habría hecho que confirmarle el pago a un cliente de internet moviera el
vencimiento de la licencia de la App.

Lo que sí se reutiliza, y por eso no hay envío nuevo:
`sendViaWhatsAppDispatcher` (Evolution, Waha y Meta en una llamada),
`resolveWhatsAppDispatcherLine` con **`includeAdminFallback: false`**,
`BloqueDeAdjuntos` con `taskId={null}` y el reloj de `/api/cron/billing`.

**El respaldo a la línea de Verzay se apaga a propósito.** Sin ese `false`, una
cuenta sin línea conectada mandaría los cobros desde el número oficial de la
plataforma: desde fuera, un desconocido pidiéndole dinero a un cliente que no
sabe quién es. Es preferible que no salga y que la pantalla lo diga —lo dice, en
la cabecera y en la configuración—.

### Los datos de pago son DOS: los de la cuenta y los de este cobro

`cobros_config.datosDePago` es el `{pago}` de la plantilla: uno solo para toda
la cartera. Pero lo que de verdad se teclea a diario es **distinto en cada
deuda** —«Bancolombia ahorros 123, a nombre de Marta», un enlace de pago
distinto por contacto, por producto o por servicio—, y eso no cabe en un dato
fijo de la cuenta.

Va en **`cobros.notaDePago`**, en la fila, y entra con
**`ALTER TABLE … ADD COLUMN IF NOT EXISTS`** y no reescribiendo el `CREATE`: la
tabla ya existe en producción y un `CREATE TABLE IF NOT EXISTS` no toca una que
ya está. Es el fallo que se comete solo al añadirle una columna a una tabla de
la App ya desplegada. Ni en `cobros_config` —que es de la cuenta entera— ni en
`cobro_adjuntos`, que es una tabla de archivos: una fila sin fichero es una fila
que miente. Las deudas de antes traen `null`, que significa exactamente «esta no
tiene»: sin backfill y sin dos clases de cobro.

**La nota va al final del mensaje, pegada por FUERA de la plantilla**
(`conLaNota`, puro). Y esa es la decisión, porque las dos formas que parecen
mejores fallan **en silencio**:

1. **Como `{variable}` nueva.** Cada cuenta ya tiene sus tres mensajes
   guardados y editados; una variable que no está escrita en ellos no se
   sustituye en ninguna parte. Se escribiría el número de cuenta, se guardaría
   bien, y al cliente no le llegaría — sin un solo error. Es la familia de *una
   prohibición que no viaja en el prompt no existe*.
2. **Metida dentro de `{pago}`.** Sale bien con las plantillas por defecto y
   desaparece en cuanto alguien quitó ese `{pago}` de la suya. Una rama que solo
   se equivoca con los datos que ya tienen los clientes es la que nadie prueba.

Al final y **sin ninguna condición delante** no hay plantilla que la pueda
perder. Probado con una plantilla sin `{pago}` y con otra sin ninguna variable.

Cuatro cosas más:

1. **No reemplaza a `{pago}`**: los dos salen. Son dos datos distintos, no dos
   formas del mismo.
2. **Viaja también en la vuelta diaria** (`losCobrosQuePodrianTocarHoy`), no
   solo en «Cobrar ahora». Por ahí sale la mayoría de los mensajes; si solo la
   trajera el botón, la línea saldría al mandarlo a mano y desaparecería en los
   recordatorios, que es el «a veces funciona» de siempre.
3. **Se puede editar en una deuda que ya existe**, no solo al crearla. El número
   de cuenta cambia; si solo se pudiera al crear, cambiarlo obligaría a borrar la
   deuda y rehacerla, y con ella se iría su historial de ciclos.
4. **Es LITERAL: se pega después de sustituir las variables.** Un `{monto}`
   escrito a mano en la nota sale tal cual, que es lo que se escribió.

Y el saneado —vacía o con espacios es `null`, nunca cadena vacía— está en
`comoNotaDePago` y se aplica **al escribir**, en `cobros-db`, no solo en la
acción. Con él únicamente en la acción la columna admitía `"   "` en cuanto
alguien llamara a la función de la base por otro camino, y entonces `null` y
«espacios» serían dos formas de decir lo mismo. Lo cazó el banco.

### Los adjuntos SÍ salen, y el obstáculo no era el que estaba escrito aquí

Durante meses los archivos de un cobro se guardaban, se contaban y se veían en
la App, y al cliente le llegaba **solo el texto**. Este documento decía que
mandarlos era un frente grande porque «los caminos de media de los tres
proveedores piden `currentUser()` y pausan la IA, y la vuelta diaria corre sin
sesión». **Eso era falso**, y conviene saber por qué para no volver a
descartarlo por el mismo motivo:

| | ¿pide sesión? | ¿qué hay ya? |
| --- | --- | --- |
| Evolution | **no** | `sendMediaByUrl`, HTTP con url + apikey |
| Waha | **no** | `sendWahaMedia` en `lib/waha.ts`, HTTP |
| Meta | **no** | `sendChannelTextAction` ya tiene su rama `kind: 'media'` |

Quien pide sesión es la **acción** de Chats (`sendWahaTextAction`, por
`lineaWahaAutorizada`), no la primitiva que hay debajo. Mirar la acción y
concluir que el proveedor exige sesión es la misma familia de error que ya costó
tres versiones en el id de un mensaje de grupo: **una capa no habla por la de
abajo.**

`sendViaWhatsAppDispatcher` solo mandaba texto por un motivo mucho más simple:
**nació para avisos**, que son todos de texto —facturación, prueba, vigilancia,
informe semanal, tickets—, así que su firma no tenía sitio para un archivo y
cada proveedor iba con `kind: 'text'` escrito a mano. No había ningún obstáculo
técnico: faltaba la función.

#### Y de paso destapó que el despachador estaba MUDO en toda línea Waha

El despachador llamaba a `sendWahaTextAction`, que empieza por `currentUser()`.
Desde una vuelta de cron **no hay sesión**, así que devolvía «No autorizado» y
el mensaje no salía: los recordatorios de Cobros, los avisos de facturación, el
seguimiento de prueba y el informe semanal **llevaban callados en toda línea
Waha**, sin un solo error que mirar. Desde fuera no se parece a un fallo: se
parece a que la App no le escribe a nadie.

> **Un despachador del servidor no pasa por una acción.** Es lo que Evolution ya
> cumplía —`sendingMessages` siempre fue una función suelta—; Waha entra ahora
> por sus primitivas de `lib/waha.ts`. La puerta de `sendWahaTextAction`
> (`currentUser` + `assertCanAccessTargetUser`) se queda intacta donde tiene
> sentido: en la llamada que llega del navegador.

Dos diferencias del camino nuevo, a propósito: **no pausa la IA** —un cobro
automático no es un asesor interviniendo, y Evolution nunca la pausó— y **no
antepone la firma del asesor**, que depende de `currentUser()` y debajo de un
aviso automático sería una firma falsa. Lo que sí se conserva es **la burbuja**:
el saliente se guarda igual, con el id que devolvió Waha para que el eco del
webhook no lo duplique. Por eso `snapshotDeSalienteWaha` y `etiquetaDeMediaWaha`
se mudaron a `lib/waha.ts`: con una copia en cada sitio, el día que se afine una
el otro se queda atrás.

#### Un archivo que falla no puede perder el cobro, ni perderse en silencio

Es la regla entera de esta parte, y las dos mitades hacen falta:

1. **El cobro es el TEXTO.** `mandarLosAdjuntos` no devuelve `ok`, devuelve un
   resumen. Si devolviera un fallo, la vuelta diaria no anotaría el hito y al
   cliente le llegaría el **mismo recordatorio mañana, y pasado**: un adjunto
   roto convertido en spam. Y al revés: si el texto no sale, **no sale ningún
   archivo** — una factura suelta, sin el mensaje que la explica, es peor que
   nada.
2. **Y queda constancia, archivo por archivo.** `cobro_adjuntos` recibe
   `ultimoEnvioEn`, `ultimoFalloEn` y `ultimoFallo` con
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS` —la tabla ya está en producción y un
   `CREATE TABLE IF NOT EXISTS` no toca una que ya está—. Las filas de antes
   traen `null` en las tres, que significa «de esta no se sabe» y **no** «no
   salió»: sin backfill y sin dos clases de adjunto.

**Son dos sellos y no uno, y no se pisan.** Un envío bueno no borra el motivo
del fallo anterior y un fallo no borra la fecha del último envío bueno; la
pantalla avisa comparándolos (`losQueNoSalieron`). Con una sola columna, «nunca
salió» y «salió y hoy falló» serían el mismo dato, y el aviso o no se encendería
nunca o no se apagaría nunca. Comprobado contra Postgres en los dos órdenes.

Cinco cosas más:

1. **Cada archivo va en su propio `try`.** Sin él, un proveedor que revienta se
   llevaba los archivos de detrás y el resumen entero. Medido en el banco: con
   el `try`, el archivo siguiente al que explota sí sale.
2. **En serie, no en paralelo.** Son mensajes a una persona y llegan en su
   orden; y varios envíos a la vez por la misma línea es lo que hace que
   WhatsApp la mire con lupa.
3. **Sin pie.** El mensaje de cobro salió entero un momento antes; repetirlo
   debajo de cada archivo es mandárselo al cliente tantas veces como archivos
   lleve la deuda.
4. **El `mediatype` se filtra contra la lista cerrada y lo que no encaje sale
   como `document`.** WhatsApp abre un documento siempre; un `mediatype`
   inventado le saca un 400 al proveedor y el archivo no sale. Equivocarse hacia
   `document` entrega.
5. **La vuelta diaria lee los adjuntos de TODAS las deudas en una consulta**
   (`losAdjuntosDeLosCobros`), en una segunda pasada después de decidir cuáles
   salen. Una consulta por deuda serían decenas para leer lo mismo. Medido:
   0,36 ms para 30 deudas sobre 40.000 filas, entrando por
   `cobro_adjuntos_cobro_idx`. Y si esa lectura falla, **los cobros salen sin
   sus archivos en vez de no salir**.

### La guarda de una confirmación es el VENCIMIENTO, no el estado

Es la trampa del cobro recurrente y la cazó el banco. Confirmar un pago **anota
el ciclo, salta el vencimiento y devuelve la fila a `pendiente`**, así que el
estado no distingue un ciclo del siguiente. Con `AND "estado" = 'pendiente'` a
secas, dos confirmaciones a la vez pasaban **las dos**: la segunda se quedaba
esperando en el `FOR UPDATE` y al despertar encontraba la fila otra vez en
`pendiente`. Medido: el vencimiento saltaba **60 días en vez de 30**, o sea un
mes regalado por un doble clic.

Lo que identifica un ciclo es **la fecha que se está cerrando**. Quien confirma
manda el vencimiento que vio y el `UPDATE` lleva
`AND "vence" IS NOT DISTINCT FROM ${venceQueSeVio}`; si la fila ya no lo tiene,
alguien se adelantó y esta no toca nada. Vale también para una deuda sin fecha,
que después de la primera confirmación ya tiene una. Esa fecha **solo se
compara, nunca se escribe**: una lista que llega de fuera no puede decidir a qué
día salta el ciclo.

Y las tres escrituras van en **una transacción**, porque a medias cada pareja
miente: sin el ciclo se pierde que ese cliente lleva ocho meses pagando; sin
borrar las marcas de recordatorio, el ciclo nuevo **nace mudo** porque el
anti-spam del viejo se come su primer aviso.

### Lo que no salió no se anota

Dos casos, y los dos se ven igual de mal si se hacen al revés:

1. **Sin línea conectada no se anota.** El día que la cuenta conecte la suya,
   la deuda vuelve a entrar por ese mismo hito en vez de haberlo perdido.
2. **Un envío fallido tampoco.** Anotarlo haría que el anti-spam diera por
   escrito un mensaje que no salió, y ese hito se perdería para siempre sin que
   nadie se entere.

Anotar es decir «ya se le escribió». Si no se le escribió, no se dice.

### A quién se le insiste, y los tres hitos

Los recordatorios son **tres días exactos y no un rango**: N antes, el día 0 y N
después. «Cualquier día en negativo» es lo que hacía que un cliente del cobro de
la plataforma recibiera uno el día 1, otro el 2 y otro el 3 hasta la suspensión;
aquí nace corregido.

Y **paran en «comprobante recibido» y no vuelven** hasta el ciclo siguiente. En
ese estado la pelota está en nuestra cancha —mandó el soporte y espera que
alguien lo mire—, así que seguir cobrándole es el peor mensaje posible.

### El estado se guarda; la situación se CALCULA

Como la fila vuelve a `pendiente` en cuanto se confirma, pintar el estado
guardado a secas dejaría una cartera entera de clientes al día en «Pendiente»,
que es tanto como no decir nada. `situacionDelCobro` sale de la fecha
—`comprobante`, `vencida`, `porVencer`, `alDia`, `sinFecha`— y el orden de la
tabla es ese: **arriba lo que pide algo de tu parte**, y lo que está al día al
final, porque no hace falta mirarlo.

### `Number(null)` es 0, no `NaN`

Costó un caso del banco. `comoDiasDeGracia(null)` devolvía **0** —un cero
perfectamente válido, porque en la gracia el cero SÍ es una respuesta: «al día
siguiente ya está vencida»— en vez del valor por defecto. Un `null` colado
apagaba la gracia de esa fila sin que nadie lo hubiera pedido.

**«No hay valor» y «vale cero» se separan a mano**, antes de convertir. Si se
escribe otro saneador de números donde el cero signifique algo, va igual.

### El pie de un diálogo es `DialogFooter`, no un `justify-end` a mano

Los tres diálogos de Cobros nacieron con `<div className="flex justify-end
gap-2">` y los dos botones acababan amontonados a la derecha. El pie de la casa
es `DialogFooter` (`components/ui/dialog.tsx`), que lleva **`justify-between`**:
«Cancelar» a la izquierda y la acción principal a la derecha, como en «Editar
pagos» de Instancias y en los ciento y pico sitios que ya lo usan.

Escribirlo a mano no es «lo mismo pero más corto»: es una pantalla que se lee
distinta de todas las demás, y nadie lo nota hasta que las pone lado a lado.

Y de paso, el tercero —el historial de ciclos— **era un `div` con fondo oscuro**,
no un diálogo: se cerraba solo con el clic de fuera, sin Escape, sin foco
atrapado dentro y sin que un lector de pantalla supiera que se había abierto
nada. Un diálogo se hace con `Dialog`.

#### Y `justify-between` reparte a los HIJOS DIRECTOS

Usar `DialogFooter` **no basta**, y por eso la regla se estaba perdiendo con el
pie correcto puesto. `justify-between` reparte a los hijos directos, así que
metiendo los dos botones dentro de un `<div className="flex gap-2">` el pie ve
**un solo hijo**, lo manda a un extremo y los botones salen amontonados. Es
exactamente lo que le pasaba al diálogo de crear tarea de Proyectos — que además
llevaba un `<span />` de relleno ocupando el borde izquierdo **por ellos**, o
sea la forma más difícil de ver de romper la regla: el pie parecía bien escrito.

Medido en Chromium sobre un pie de 420 px, y no mirando la pantalla, que es de
lo que no se entera nadie:

| | Cancelar | la acción |
| --- | --- | --- |
| con envoltorio | **+198 px** del borde izquierdo | −1 px del derecho |
| hijos directos | +1 px | −1 px |

Y el mismo fallo tiene una **segunda mitad, por el otro lado**: con **un solo
botón** —guardar, sin cancelar— `justify-between` lo deja a la **izquierda**.
Eran 17 diálogos con la acción colgando del borde que no le toca, y cada uno se
arreglaba escribiendo `justify-end` a mano, que es justo lo que hace que la
regla se pierda.

Las dos cosas se arreglan **en el pie compartido**, no diálogo por diálogo:

```
"flex flex-row flex-wrap items-center justify-between gap-2 [&>*:only-child]:ml-auto"
```

Tres cosas que hay que mantener:

1. **Los botones van como hijos DIRECTOS del pie.** Si hace falta un dato en
   medio —«3 de 12 asignados», «Formato: .xlsx»— va **entre los dos**, como un
   hijo más, no pegado a uno de ellos. Con tres, `justify-between` los deja
   izquierda / centro / derecha, que es donde tienen que estar.
2. **Un tercer botón destructivo va en MEDIO**, no en el borde izquierdo: ese
   borde es de cancelar. Es el caso de «Eliminar» en la tarea de Proyectos.
3. **Los tres pies dicen lo mismo**: `DialogFooter`, `AlertDialogFooter` y
   `SheetFooter`. El de `Sheet` iba con `sm:justify-end` —la regla escrita al
   revés— y hoy no lo importa nadie; precisamente por eso: el día que alguien
   monte un panel con pie, saldría distinto de los ciento y pico diálogos y
   nadie sabría de dónde salió.

Y cómo se comprueba que la clase existe en producción, que es la misma familia
que `removeConsole` y que las clases de `lib/`: se busca la **declaración** en
el build, no la clase en el código.

```
npm run build && grep -c "only-child" .next/static/css/*.css
```

### Y la ruta no está montada: la puerta va en la acción

`/cobros` entra en `navigationRoutes` —el desplegable de «Editar módulo»— y **no
se monta en ningún módulo**: se asigna a mano. Eso tiene una consecuencia que no
es obvia: el guardián del layout arma `rutasNegadas` con las rutas que **sí**
están en algún módulo y denegadas, así que una que no está en ninguno nunca
entra ahí y se alcanza escribiendo la URL.

Por eso cada acción resuelve la cuenta y pasa por `assertCanAccessTargetUser`, y
la pantalla solo pinta lo que le devuelvan. **Si se añade otra pantalla que se
vaya a asignar a mano, va igual**: la puerta en la acción, nunca en la página.

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

WhatsApp Mensajería (Waha) se construyó como una **segunda línea**: la tarjeta
fabricaba una instancia aparte, `NOMBRE_V2`, con su propia fila en `Instancias`.
Pero un número solo está conectado por un proveedor a la vez —o Evolution o
Waha—, y todo lo que importa (historial, leads, etiquetas, seguimientos, memoria
de la IA) está guardado por instancia, no por proveedor. Con dos filas el mismo
número quedaba partido: dos tarjetas en Conexiones, dos «Alexis» en Chats, dos
leads en el CRM, y un flujo lanzado sobre la fila vieja salía por Evolution
—apagada— y agotaba el plazo con «Timeout de solicitud».

La regla: **cambiar de proveedor cambia `instanceType` de la MISMA fila**
(`actions/proveedor-de-linea-actions.ts`), conservando `instanceName` (las
conversaciones y los mensajes) e `instanceId` (las sesiones del CRM). El
backend ya decide por `instanceType` en cada envío, así que no hay nada más que
tocar. La sesión de Waha se llama **igual que la instancia**; `_V2` no existe.
Nunca hay dos encendidos: si Evolution está conectada, el propio cambio cierra
su sesión antes de seguir.

Si en una cuenta quedaron datos bajo `NOMBRE_V2`, el cambio a Waha los adopta
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

## Conexión: el canal se llama igual; el proveedor solo se nombra al cambiarlo

Una cosa es **cómo se llama la tarjeta** y otra **por dónde se conecta**. El
canal es siempre «Mensajería WhatsApp (QR)». Evolution y **Waha** son nombres de
servidores nuestros y **no salen en ninguna pantalla**: viven en el código y en
la consola. A quien usa la App no le cambia la vida saber cuál hay detrás; lo
único que le cambia es que al cambiar de conexión **se cierra la sesión y hay
que volver a escanear el QR**, y eso es lo que dice el diálogo de las flechas.

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

Cinco cosas que hay que mantener:

1. **Cambiar de proveedor no deja deberes.** Sigue sin haber dos proveedores
   encendidos a la vez, pero cerrar el primero **no es trabajo de la persona**:
   si la sesión de Evolution está abierta, `cambiarProveedorAWaha` la cierra y
   espera a que deje de estar `open` antes de seguir. Antes el botón salía
   apagado y había que adivinar que el primer paso era pulsar el verde. La
   confirmación lo dice antes de tocar nada.
2. **Nada de texto suelto ni pie en la tarjeta.** Lo que hace cada botón se lee
   al posarse encima y se explica en su diálogo. El Robot no necesita bloque
   propio: ese botón rojo ya es él.
3. **Cerrar sesión existe en los dos proveedores.** Es la única forma de cambiar
   el número de una línea sin perder su historial. En Evolution la llamada vivía
   dentro de `deleteInstance` —desvincular obligaba a borrar la línea entera—;
   ahora es `cerrarSesionDeLaLinea`. Un fallo del servidor **se dice**: un
   «listo» con la sesión abierta hace creer que ya se puede escanear con otro
   teléfono.
4. **El Robot funciona con los dos.** El backend ya leía la misma marca para
   ambos (los mensajes de Waha pasan por el mismo `processWebhook`), pero la App
   exigía una clave de Evolution y llamaba a su webhook, así que en Waha el
   Robot estaba muerto. Con Waha **no se le pregunta nada a Evolution**.
5. **Perfil no puede tener su propia lógica.** Pinta las mismas tarjetas que
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

## Conexión: los canales de credenciales, un botón y una sola tarjeta

Cloud API, Telegram, Facebook e Instagram se conectan igual: **pegando unas
credenciales en un formulario**. Crear la instancia ES pegarlas; no hay paso
previo que cree nada vacío.

Por eso los cuatro se pintan con `TarjetaDeCanal` y tienen **un solo botón, en
el mismo sitio**: «Conectar <canal>» cuando no hay nada, «Editar credenciales»
cuando ya está. Los dos abren el mismo formulario. Antes había dos sitios para
una sola cosa: un botón de color abajo cuando no existía, y un pie con dos
botones cuando sí —uno que solo recargaba la página y otro con un lápiz—.

Cuatro cosas que hay que mantener:

1. **Conectado se lee como la línea de WhatsApp**: avatar, nombre y dato debajo.
   Sin sellos de «Conectado» ni campos grises apilados: la misma anatomía en
   toda la pantalla. El nombre de instancia solo se enseña **sin conectar**, que
   es cuando informa de algo.
2. **La papelera va arriba**, junto al título, y solo cuando hay algo que
   borrar.
3. **Nada de líneas de ayuda sueltas en la tarjeta** («Ver cómo crear tu bot»,
   «Ver cómo conectar tu página»). Van dentro del formulario, que es donde hacen
   falta.
4. **Los dos botones de Meta (`MetaEmbeddedSignup`) están ocultos.** Ese camino
   necesita que la cuenta sea proveedor tecnológico de Meta; sin serlo no puede
   traer el token ni el número, así que era un botón que no podía funcionar. El
   componente se queda en el repo: volver a ofrecerlo es una línea.

Y el punto de color: la burbuja del título de la línea lleva **un punto dentro**
que dice por dónde conecta —uno para cada servidor—. **No se nombra ninguno**: a
quien usa la App no le sirve saberlo, y un punto de color no le dice nada, que
es justo lo que se busca. Quien lo necesita lo lee al posar el cursor.

Y «(QR)» va en los dos canales que se escanean —«Mensajería WhatsApp (QR)» y
«Llamadas WhatsApp (QR)»— y **no** en Cloud API, que es el número oficial de
Meta y no vincula ningún teléfono. Esa palabra es lo único que distingue las dos
tarjetas de WhatsApp.

## "Escribiendo…" hay que pedirlo dos veces

Que se vea "escribiendo…", "grabando audio…" y "en línea" no es una pantalla:
la pantalla ya estaba hecha y es la misma para los dos proveedores. Lo que hace
falta es **pedirlo dos veces**, y si falta cualquiera de las dos no llega nada
y no hay error que mirar:

1. **En el webhook de la línea.** Evolution guarda la lista de eventos con la
   que se registró el webhook y no la vuelve a mirar, así que `PRESENCE_UPDATE`
   tiene que estar en `EVENTOS_DEL_WEBHOOK` (`actions/robot-actions.ts`) **y**
   `ponerAlDiaLosEventos` tiene que reescribirlo en las líneas que ya estaban.
2. **Por cada contacto.** WhatsApp solo manda la presencia de los contactos a
   los que la sesión está **suscrita**. En Waha se suscribe leyendo la presencia
   al abrir el chat; en Evolution **no hay forma de preguntarla**, solo de
   suscribirse, y ni siquiera tiene ruta propia: la hace por dentro
   `POST /chat/sendPresence` (`presenceSubscribe` antes del gesto). Se llama con
   `presence: "paused"` —"dejó de escribir"—, que suscribe sin que el contacto
   vea nada distinto. Los tres campos (`number`, `presence`, `delay`) son
   obligatorios; sin `delay` contesta 400.

Y una de vocabulario: los dos proveedores dicen lo mismo con palabras distintas
—Waha `typing` / `online` / `offline`, Baileys `composing` / `available` /
`unavailable`— y la App entiende una sola. **El traductor es uno**
(`presenciaDeWhatsapp`, en `src/utils/presencia.util.ts` del backend). Lo que no
se reconoce cae en `nada`, que apaga la burbuja: dejarla encendida para siempre
es peor que no enseñarla.

La presencia **no se guarda**: es de ahora mismo y solo vale para la
conversación abierta. Tampoco pasa por el buffer ni dispara IA.

## Llamadas: se llama con el número de la línea, no con el de quien mira

`startAstraCall` cogía el número vinculado de la **cuenta con la que entras**
(`effectiveId`). Desde una cuenta que administra a otra —un super admin abriendo
los chats de un cliente, una cuenta principal con otra asociada— salía «No
tienes un número vinculado para llamar» aunque **esa línea sí tuviera el suyo
conectado y funcionando**: desde la otra sesión la llamada entraba y se hablaba.

La llamada sale por la línea de la conversación, así que el número tiene que ser
el de **la cuenta dueña de esa línea** (`sidParaLlamar`, con el `instanceName`
que ya recibía `CallDialog`). Si esa cuenta no tiene número, o no se puede
administrar, se cae al propio, que es lo que se hacía antes.

Esto **no** es el salto por `linked_accounts` que se quitó a propósito: aquel
mandaba a un «master» y cruzaba los números de dos cuentas principales
co-administradas. Aquí no se busca a nadie: se mira el dueño de ESA línea, que
es un dato concreto de la fila. Cada cuenta principal conserva su número y desde
sus propios chats sigue usando el suyo.

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

### Vencer una factura apaga el AGENTE, no la línea

La misma regla, aplicada donde más duele. Al suspender por impago se llamaba a
`deleteInstanceInternal`: `logout` y `delete` contra Evolution, y **la fila de
`Instancias` borrada**. Al pagar se creaba una instancia nueva con el mismo
nombre, así que el cliente que se retrasaba un día **tenía que reescanear el
QR**. Y el webhook se apagaba además, o sea que la línea se quedaba sin avisos
en vivo y sin historial — justo lo que la sección de arriba prohíbe.

> **Lo que se apaga es la marca del Robot, y ya.** La sesión de WhatsApp se
> queda conectada, el webhook encendido, la conversación sigue entrando y el
> asesor puede seguir escribiendo a mano. Al confirmarse el pago el agente
> vuelve solo, sin escanear nada. Vive en `lib/robot-por-facturacion.ts`.

**Y es la palanca correcta porque vale para los dos proveedores con una sola
escritura**: el backend lee la misma marca para Evolution y para Waha —los
mensajes de Waha pasan por el mismo `processWebhook`—. Con `logout` habría dos
caminos que mantener a la par, y el día que uno se afinara el otro se quedaría
atrás.

Los **seis** caminos que la tumbaban pasan ya por ahí: las tres acciones
manuales de `billing-actions`, el pago confirmado de `billing-payment-internal`,
el cron de `billing-job-actions`, la cascada del reseller y
`syncUserBillingLifecycle`, que es el más caliente de todos. **El borrado de la
cuenta a los 30 días se queda como estaba**: ahí la fila de `User` se va y la
línea se borra de verdad.

#### Con Waha eran DOS fallos distintos, y ninguno era el que parecía

Esto se escribió primero de memoria y **el banco lo desmintió dos veces**. Las
dos funciones de borrado no se comportan igual con una línea de Waha:

| | qué hacía con una línea `waha` |
| --- | --- |
| `deleteInstanceInternal` (manual) | busca la fila **una segunda vez con el tipo PEDIDO** (`Whatsapp`) en vez de con el de la fila que encontró, no la encuentra y se rinde. La fila sobrevive… **y el agente seguía contestando**: lo único que lo callaba era borrar la instancia de Evolution. Una cuenta suspendida con la IA trabajando gratis. |
| `deleteInstanceEvolutionAware` (cron) | sí borra por el id de la fila, sea del tipo que sea. Y una línea de Waha **no suele tener clave de Evolution**, así que entra por su rama «sin apiKey, limpiamos el registro» y **se lleva la fila en el acto**, dejando la sesión viva y huérfana en el servidor de Waha. |

Los dos están en el banco **ejecutados, no descritos**, y esa es la parte que
importa: las dos versiones que se escribieron antes de medir eran falsas, y
cada una habría quedado en el código como una explicación convincente de algo
que no pasaba.

#### Tres cosas que hay que mantener

1. **Se recuerda cómo estaba el Robot, no se enciende a ciegas.** Las líneas que
   atiende una persona tienen el Robot apagado **a propósito**, y son las que
   más se apagan; encenderlo al confirmar un pago le pondría la IA a contestar a
   un cliente que decidió que no la quería. El recuerdo vive en
   `robot_antes_de_suspender`, tabla de la App con `CREATE TABLE IF NOT EXISTS`
   y sin clave foránea — `Instancias` es del backend y añadirle columnas desde
   aquí es lo que reventó el #360.
2. **`ON CONFLICT DO NOTHING`, nunca `DO UPDATE`.** El cron repasa las cuentas
   suspendidas en cada vuelta y la suspensión manual puede caer encima: con
   `DO UPDATE` la segunda vez guardaría el `false` que se acaba de escribir, y
   entonces al pagar se le devolvería el agente **apagado para siempre**. El
   primer recuerdo es el bueno, y se borra al usarlo.
3. **Sin la columna `bot_enabled` no se toca nada, y se dice.** Es el lado
   seguro a propósito: sin la marca no hay forma de callar al agente sin tocar
   la sesión, y tocarla es justo lo que esto viene a quitar. Mejor un agente que
   responde de más que un cliente reescaneando un QR.

## El proveedor sale de la FILA, no del parámetro

Este documento llevaba escrito un cabo suelto: «el borrado de la cuenta a los 30
días sigue llamando solo a Evolution, así que la sesión de una línea de Waha se
queda viva en su servidor cuando la cuenta desaparece». Al ir a cerrarlo resultó
no ser un caso suelto sino **un patrón repetido en nueve sitios**, el mismo que
ya mordió dos veces al escribir la sección de arriba.

La forma es siempre esta:

```ts
const fila = await checkActiveInstance(userId, instanceType); // SÍ busca en los dos
if (isWhatsappLike(instanceType)) { …Evolution… }             // pregunta por el PEDIDO
const otra = await db.instancia.findFirst({ where: { instanceName, instanceType } });
```

`checkActiveInstance` busca a propósito en `['Whatsapp', 'waha']`, así que
**encuentra** la fila de Waha. Lo que decide después es el parámetro, que por
defecto vale `'Whatsapp'`. De ahí salen dos daños, y el segundo es el caro:

- **Se habla con el servidor equivocado**, y eso **no falla de forma visible**:
  un `logout` de Evolution contra el nombre de una sesión de Waha contesta «no
  existe» y el código sigue como si hubiera cerrado.
- **Y la fila se va sin la sesión.** `Instancias` es `onDelete: Cascade`, así que
  al borrar la cuenta sus filas desaparecen con sesión liberada o sin ella. Lo
  que queda al otro lado **no lo reclama nadie nunca**, porque ya no existe la
  fila que decía de quién era.

> **Cerrar, borrar y consultar una sesión viven en `lib/sesion-de-la-linea.ts`,
> se les pasa la FILA y ellas eligen el proveedor.** `proveedorDeLaFila` dice
> `evolution` (incluido el tipo nulo de las líneas antiguas), `waha` u `otro`
> —Meta, Telegram, Facebook e Instagram, que no tienen sesión de WhatsApp que
> cerrar—. Con la condición escrita en cada sitio, el séptimo se olvida, y eso
> es literalmente lo que pasó.

### Lo que hacía cada uno antes

| dónde | qué hacía con una línea de Waha |
| --- | --- |
| `deleteInstanceInternal` (borrado de la cuenta a los 30 días) | `logout`+`delete` contra Evolution, y luego `findFirst({ instanceName, instanceType })` con el tipo **pedido**: no la encontraba y salía con `success:false` **dejando la fila**. La sesión quedaba viva para siempre. |
| `deleteInstanceEvolutionAware` (cascada del reseller) | una línea de Waha normalmente no tiene clave de Evolution, así que caía en `if (!user.apiKey)` —«sin ApiKey: registro eliminado»— y **se llevaba la fila sin tocar la sesión**. La rama del `retryable` ni se ejercía. |
| `deleteInstance` (la papelera de la tarjeta) | el mismo segundo `findFirst`: contestaba «No se encontró la instancia en la base de datos» con la fila delante. |
| `forceRecreateInstance` | `deleteMany({ instanceName, instanceType })` no borraba nada y después creaba una fila **de Evolution** con el mismo nombre: **dos filas para un número**. |
| `cerrarSesionDeLaLinea` (el botón verde) | Evolution a secas: «El usuario no tiene una ApiKey de Evolution asignada», que es cierto y no explica nada. |
| `renameInstance` | renombraba la fila y no la sesión. La sesión de Waha **se llama igual que la instancia**, así que la línea se quedaba sin mensajes y sin un solo error. |
| `generateQRCode` | `isWhatsappLike('waha')` es `false` → «No se pudo generar el código QR.» Y la comprobación de la ApiKey de Evolution iba **antes**, así que una cuenta de solo Waha ni llegaba. |
| `generateWhatsappPairingCode` | no miraba el tipo: mandaba el código por número a Evolution pasara lo que pasara. |
| `checkActiveInstance` | su `IN` nunca casa con un **nulo**, así que las líneas **antiguas sin tipo** no las encontraba nadie — y `isWhatsappLike(null)` vale `true` desde siempre, o sea que la intención era incluirlas. |

Y tres que **consultaban** y solo miraban Evolution, que es la mitad muda del
mismo patrón:

| dónde | qué pasaba |
| --- | --- |
| el cron de «tu línea se cayó» | su filtro pedía tipo nulo o `Whatsapp` **y** `apiKey: { isNot: null }`. Una cuenta de solo Waha quedaba fuera por las dos: la línea se le caía y **no se enteraba nadie** — ni aviso, ni fila en el resultado del cron, ni fallo que mirar. |
| la columna «desconectado» de Panel › Clientes | excluía Waha con el motivo escrito de que «no se puede comprobar». Sí se puede: `getWahaSession` contesta `WORKING` o no. Mientras estuvo fuera, ese cliente **no salía ni en verde ni en rojo**. |
| el checklist de puesta en marcha | cogía `instanceType === "Whatsapp"` y exigía la url de Evolution: un cliente de Waha salía con las tres casillas en gris para siempre, aunque estuviera atendiendo. Y `botEnabled` leía el **webhook**, que va siempre encendido en Evolution y no existe en Waha: decía `true` siempre en una y `false` siempre en la otra. Ahora lee `bot_enabled`, que es lo que el backend mira para los dos. |

### Cuatro cosas que hay que mantener

1. **`desconocido` NO es «caída».** `estadoDeLaSesionDeLaLinea` devuelve tres
   valores y no un booleano a propósito: una línea cuyo servidor no contesta no
   se pinta en rojo ni dispara un WhatsApp. Inventar un estado es lo que llenaba
   la lista de clientes a los que escribirle sin motivo.
2. **`transitorio` decide si la fila se queda.** Un servidor caído o un `5xx` es
   de hoy y la fila se conserva como señal de borrado pendiente; un `404` o un
   `4xx` es firme y la fila se puede ir. Borrar la fila ante un fallo transitorio
   es exactamente cómo se queda una sesión huérfana.
3. **Al eliminar una cuenta se liberan TODAS sus líneas**
   (`liberarLasLineasDeLaCuenta`), no la primera. Los dos caminos de los 30 días
   pasaban por funciones que resuelven con `checkActiveInstance`, que es un
   `findFirst`: una cuenta con dos líneas dejaba la segunda viva. Y como la
   relación es en cascada, la fila se iba igual.
4. **Una operación que un proveedor no sabe hacer se DICE, no se simula.** Waha
   no sabe renombrar una sesión y no ofrece código por número; las dos contestan
   qué sí se puede hacer en su lugar. Renombrar solo la fila «funcionaba» y
   dejaba la línea muda.

El banco son **39 casos contra Postgres**, con una línea de cada proveedor y con
el `fetch` apuntado para poder afirmar **a qué servidor se habló**. Los diez
«ANTES» ejecutan la rama vieja literal sobre la misma semilla: sin ellos no se
sabe si se arregló la causa o algo parecido.

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

## Una consulta que devuelve una página tiene que poder PARARSE

Una consulta que junta varias fuentes, las deduplica y al final se queda con 26
filas, **lee las tres fuentes enteras** si ninguna lleva su propio `LIMIT`. Los
índices no arreglan eso: el índice deja encontrar las filas, pero sin un tope
dentro no hay dónde parar, así que se traen todas, se ordenan y se tiran casi
todas. El coste crece con el tamaño del dato, no con el de la página.

Duele donde menos se ve: las conversaciones más largas son justo las de arriba
de la lista, las primeras que se precargan. Medido: **36 ms para devolver 26
mensajes de un chat de 16.000; con el tope dentro, 1 ms.**

Así que **el `ORDER BY ... LIMIT` va DENTRO de cada rama**, entre paréntesis, no
solo en la consulta de fuera.

### El tope cubre el FINAL de la página, no su tamaño

Es el error que se comete solo, y no se nota hasta la décima pulsada de «Cargar
mensajes anteriores».

Si la consulta pagina con `OFFSET`, la página 10 es `OFFSET 234 LIMIT 26`: hacen
falta **260 filas** para llegar a la primera de esa página. Acotando por el
tamaño (26) el recorte de dentro se queda corto y la página sale con huecos o
directamente **vacía**, sin ningún error. Comprobado con datos:

| página | tope sobre el tamaño | tope sobre el final |
| --- | --- | --- |
| 1 | 26 filas | 26 filas |
| 3 | 26 filas | 26 filas |
| 10 | **0 filas** | 26 filas |

El tope se calcula sobre **`salta + pide`**.

### Y con holgura, porque lo de dentro aún no está deduplicado

Lo que se recorta en cada rama todavía tiene duplicados: el mismo mensaje puede
estar guardado bajo dos formas de id —Waha lo serializa, Evolution lo entrega
pelado— y el `DISTINCT ON` los junta **después**. Sin holgura, un chat con
muchas parejas así devolvería menos filas de las pedidas. Va **por cuatro**:
harían falta cuatro copias del mismo mensaje para agotarla, y las formas
conocidas son dos.

Lo que hace que esto sea seguro es que **las dos copias caen del mismo lado del
corte**: las dos llevan la hora que trae el propio mensaje de WhatsApp, no la de
guardarlo (`horaDelMensaje`), y cuando una llega sin hora el `ON CONFLICT`
conserva a propósito la que ya estaba. Si algún día se cambia eso —si una copia
pudiera sellarse con la hora de guardarla—, **esta holgura deja de bastar** y
hay que volver aquí.

### Y el filtro común se escribe una vez

Tres ramas con el mismo `WHERE` copiado tres veces es una que se toca y dos que
no. Se arma una vez y se inyecta en las tres: si no, una rama devuelve filas que
las otras descartan y la deduplicación decide por azar.

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

## Evolution esconde el motivo en `response.message`

«Error al crear la instancia en la API», y nada más. El servidor sí había dicho
por qué; la App no lo leía.

Un rechazo de Evolution viene así:

```json
{ "status": 403, "error": "Forbidden",
  "response": { "message": ["This name \"X\" is already in use."] } }
```

`raw.message` —lo que se miraba— **viene vacío**, así que el aviso caía siempre
en el texto por defecto. Un botón que falla y no dice por qué, que es justo lo
que este documento prohíbe en su primera mitad.

El caso real: la línea **seguía existiendo en Evolution** y no tenía ficha en la
App, así que «Crear instancia» chocaba con el nombre ocupado. Con el motivo a la
vista se resuelve en un minuto; sin él fue una llamada.

Dos cosas:

1. **Quien sabe dónde esconde Evolution el motivo es uno solo**,
   `lib/motivo-de-evolution.ts`, y es puro. Mira el anidado, luego el de arriba y
   luego `error`, porque Evolution no siempre usa el mismo. Lo usan los dos
   caminos de creación y el de envío, que tenían la misma lógica copiada.
2. **El nombre ocupado se explica en palabras que se puedan usar**: la línea
   existe en el servidor pero no tiene ficha, y no se creó ninguna. Decir
   «Forbidden» es tan poco útil como no decir nada.

## El texto roto no se arregla en la conexión: ya está en los caracteres

En la herramienta de Google Sheets se leía `hoja de cÃ¡lculo pÃºblica`. El
primer impulso es mirar la codificación de la base, el driver o las cabeceras.
**No era nada de eso**: el texto ya estaba roto **en el código fuente**. Cinco
ficheros se guardaron con sus bytes UTF-8 leídos antes como si fueran de un
juego de un byte, y de ahí se copió a todas partes.

Para la base, para la API y para el navegador, `Ã¡` son dos letras válidas y
todos las transportan perfectamente. Por eso **no hay nada que configurar**: lo
único que se puede hacer es volver a los bytes originales.

Y no era cosmético. La descripción de cada herramienta se le pasa al modelo tal
cual (`description: cfg.toolDescription`, en `ai-agent.service.ts` del backend),
así que **el agente venía leyendo eso**.

Cuatro cosas que hay que mantener:

1. **Quien decide es un viaje de ida y vuelta, no un vistazo.**
   `lib/texto-doblemente-codificado.ts` solo repara lo que, convertido otra vez
   a bytes y decodificado como UTF-8, **vuelve a ser válido y distinto**. Un
   texto sano no pasa la prueba y se queda como está. Eso importa porque esto se
   ejecuta sobre datos de clientes.
2. **Son tres juegos, no uno.** Los acentos vuelven con `latin-1`; los emojis
   solo con `cp1252` (su forma rota lleva `Å¸`, `â€œ`, que latin-1 no tiene); y
   un emoji compuesto como `🧑‍💼` lleva dentro un ZWJ cuyos bytes incluyen
   `0x8D`, **que cp1252 no tiene y latin-1 sí**. Con un solo juego esa línea no
   se puede deshacer entera.
3. **La reparación de la base busca, no adivina.**
   `/api/admin/reparar-codificacion` recorre **todas las columnas de texto** de
   todas las tablas con clave `id` y pregunta cuáles traen las señales. Una lista
   de tablas escrita a mano se queda corta el día que alguien añada una columna.
   Va en dos pasadas y la primera **no toca nada**: sin parámetros da el informe,
   y solo con `?aplicar=si` escribe.
4. **Y se limpia también al guardar**, con la misma función. Si no, vuelve a
   entrar por la puerta de al lado.

Cómo se comprueba que no queda nada, sin desplegar: buscar en el repo texto que
se pueda reparar. Si alguna línea vuelve a ser distinta al repararla, está rota.

## Mudar un servicio de servidor: el certificado va DESPUÉS del DNS, y no se reintenta solo

Se movió WAHA del servidor de la App (`89.117.150.148`) al de Evolution
(`89.117.150.233`). Los datos salieron perfectos: los dos volúmenes se copiaron
byte a byte, y las cinco sesiones que estaban vivas **volvieron solas, sin
reescanear ningún QR**.

Y aun así, durante veinte minutos el sitio nuevo no tenía HTTPS, **sin un solo
error en ninguna parte**.

Traefik pidió el certificado a las 23:38:04, cuando se encendió el servicio
nuevo. En ese momento `waha.ia-app.com` todavía apuntaba al servidor viejo, así
que Let's Encrypt fue a validar el reto **allí** y no lo encontró:

```
legolog: [INFO] [waha.ia-app.com] acme: Trying to solve HTTP-01
error msg="Unable to obtain ACME certificate for domains \"waha.ia-app.com\":
  one or more domains had a problem"
```

Falló por el motivo correcto. El problema es lo que pasa después: **Traefik no
reintenta un pedido fallido.** Se queda sirviendo su certificado propio —
`CN=TRAEFIK DEFAULT CERT` — indefinidamente, y lo único que escribe es un
`debug` por petición (`Serving default certificate for request`). Desde fuera:
el sitio nuevo no tiene HTTPS y nadie dice por qué.

Tres reglas:

1. **El orden es: servicio arriba → DNS → certificado.** El certificado solo se
   puede emitir cuando el DNS ya apunta al servidor nuevo, porque el reto es
   HTTP y Let's Encrypt va a donde diga el DNS. Si el servicio se enciende antes
   de mover el DNS —que es lo correcto, así las sesiones reconectan mientras
   tanto— entonces **el primer intento de certificado está condenado** y hay que
   forzar otro a mano.
2. **Forzar el reintento se hace tocando una etiqueta DEL SERVICIO, no
   reiniciando nada.** Las `Labels` del servicio no son parte del
   `TaskTemplate`, así que Swarm **no recrea la tarea**: el contenedor sigue
   corriendo y las sesiones de WhatsApp ni se enteran. Reiniciar Traefik también
   funcionaría, pero corta un momento todo lo demás que hay en ese servidor.
3. **Se comprueba mirando el certificado, no la pantalla.** `CN=TRAEFIK DEFAULT
   CERT` significa "no emitido"; el dominio tiene que salir en el `acme.json`
   del volumen de Traefik:

   ```
   curl -sSv --resolve dominio:443:IP https://dominio/ 2>&1 | grep subject:
   grep -o dominio /etc/traefik/letsencrypt/acme.json
   ```

### Y Traefik no escribe en `docker logs`

Buscar el error costó de más por esto: el Traefik de esos servidores va con
`--log.filePath=/var/log/traefik/traefik.log`, así que `docker logs` enseña
**una sola línea**, la de arranque, y parece que no pasa nada. El log de verdad
está dentro del contenedor y se saca con la API de Docker
(`GET /containers/<id>/archive?path=...`), sin necesidad de `exec`.

Ese fichero estaba en **1,3 GB** y en `DEBUG`, creciendo sin freno.

### Copiar sesiones de WAHA: primero se apaga

Las sesiones son **SQLite con WAL** (`gows.db` + `-wal` + `-shm`), una base por
línea. Copiar eso con WAHA encendido da una copia a medias, que en una base de
datos no es "un trozo menos": es una sesión corrupta y un QR nuevo.

Con el servicio a 0 réplicas, WAHA cierra limpio y SQLite consolida sus WAL. Se
nota en el tamaño: el volumen pasó de **1.272 a 716 MiB** y desaparecieron todos
los `-wal` y `-shm`. Esa es además la señal de que el cierre fue limpio; si
quedan, algo se mató a la fuerza y la copia no es de fiar.

La media (6,4 GB) sí admite copia en caliente —son ficheros sueltos—, así que va
**antes** del corte y solo se repasa el delta durante él. Eso dejó el corte de
datos en unos 40 segundos.

### Para saber si una sesión ya estaba muerta antes

Después de la mudanza, dos de siete líneas pedían QR. La pregunta es siempre la
misma: ¿lo rompimos nosotros? Lo dice **la fecha de escritura de su `gows.db`**:

```
date -r /app/.sessions/gows/<SESION>/gows.db
```

Las seis vivas marcaban la hora exacta en que se apagó el servicio. La séptima
marcaba **27 horas antes**: llevaba deslogueada desde el día anterior y la
mudanza no tuvo nada que ver. Es la forma barata de separar "lo rompió el cambio"
de "ya venía roto", y se mira **antes** de ponerse a buscar culpables en el
cambio.

## Quién paga la IA se PREGUNTA, no se marca

Una cuenta consume créditos porque la llave de OpenAI que usa la paga Verzay. Si
el cliente pone la suya, la paga él, y entonces los créditos no pintan nada:
son ilimitados.

Eso **no es una columna**. No hay ninguna marca de «esta cuenta es ilimitada»
que alguien tenga que acordarse de poner y de quitar. Se compara la clave que la
cuenta está usando **ahora mismo** contra el registro de llaves de Verzay
(`verzay_api_keys`): si casa, consume; si no casa, no. Un cliente que quita su
key y vuelve a la nuestra vuelve a consumir sin que nadie toque nada.

La pregunta se hace en **dos sitios y con la misma respuesta**: la App
(`pagaElClienteSuIa`, en `lib/llaves-de-verzay.ts`) para lo que se enseña, y el
motor (`AiCreditsService.pagaElClienteSuIa`) para la puerta de verdad. Si los
dos no dicen lo mismo no hay forma de saber cuál miente: la pantalla diría
«ilimitados» y el motor seguiría descontando. Por eso los dos **eligen la clave
igual que `getUserDefaultAiConfig`** —su proveedor por defecto activo, luego
cualquiera activo, luego la primera—: decidir sobre una key distinta de la que
el agente usa es decidir sobre otra cosa.

Tres cosas que hay que mantener:

1. **Sin key no es ilimitado**, y **un fallo de lectura tampoco**. Las dos
   cosas se resuelven como «consume», que es el lado seguro: dar ilimitado por
   un error es regalar consumo que paga Verzay. El motor además **lo dice**
   cuando no puede leer el registro.
2. **Una llave desactivada sigue siendo de Verzay.** El interruptor decide si
   recibe cuentas nuevas, no quién paga el consumo de las que ya tiene.
3. **Borrar una llave sin traspasar sus cuentas está prohibido**, y no solo
   porque se queden sin servicio: al desaparecer del registro, sus cuentas
   pasarían a contar como «llave propia del cliente» y recibirían créditos
   ilimitados sobre una key muerta. El traspaso va **dentro de la misma
   transacción** que el borrado.

### El reparto es por cupo, y solo toca a las cuentas NUEVAS

Antes la llave era **una sola**, `SECRET_API_KEY`, la misma para todas y sin
ningún tope: el día que OpenAI la bloqueó se cayeron todas a la vez.

Ahora Carlos registra varias en Panel › API keys, cada una con su cupo. Una
cuenta nueva se lleva la marcada **por defecto**; cuando esa llega a su cupo, el
reparto pasa solo a la siguiente libre (`elegirLaLlave`, puro y probado). Y
**las cuentas que ya existen no se mueven nunca por esto**: se quedan con la que
tienen. Lo único que las mueve es un traspaso explícito al borrar o al cambiarle
la clave a su llave.

Dos cosas:

1. **El contador es un `COUNT`, no una columna.** Cuántas cuentas cuelgan de una
   llave sale de `COUNT(DISTINCT "userId")` sobre `user_ai_configs`, que es
   donde está la verdad. Guardado, se desincroniza en cuanto un cliente cambie
   su key —que es justo lo que la regla de arriba espera que pase— y el reparto
   decidiría sobre un número que ya no es cierto. Y `DISTINCT` porque una cuenta
   tiene una fila por proveedor: contando filas, la misma cuenta cuenta dos
   veces (el fallo de la línea de 576 chats que decía 1036).
2. **La clave no viaja al navegador.** Lo que se pinta son los últimos cuatro
   caracteres, que es lo único que hace falta para reconocerla.

### Y el recuerdo de «ya creé la tabla» se cae solo si la tabla se va

Las tablas de la App se crean con `CREATE TABLE IF NOT EXISTS` y el proceso
recuerda que ya lo hizo. Ese recuerdo es **del proceso, no de la base**: si la
tabla desaparece por debajo —una restauración, un entorno recién levantado—, el
recuerdo sigue diciendo que existe y **todas** las consultas fallan con `42P01`
hasta que alguien reinicie el contenedor.

Lo encontró el banco de pruebas: con la tabla borrada a mano, ocho
comprobaciones seguidas se caían y ninguna se recuperaba. Por eso el acceso va
por `conLaTabla(...)`, que ante un `42P01` **olvida el recuerdo, la crea y
reintenta una vez**. Una, no un bucle: si tampoco va la segunda, el problema no
era que faltara la tabla.

### Un centinela acaba impreso, y un registro vacío no es una respuesta

Las dos formas en que esto se rompió en producción el día del despliegue. Las
dos cuestan lo mismo de evitar y las dos se leen desde fuera como que la App
miente.

**1. Un valor centinela acaba en la pantalla de un cliente.** «Sin tope» se
decía con números —`total: -1`, `available: 999999999`— y nadie los traducía:
se metieron tal cual en la plantilla de un aviso de WhatsApp. Una clienta con
plan Básico recibió

> 🚨 URGENTE: solo tienes **999999999 de -1 créditos** disponibles (5%).

mientras su panel decía, correctamente, 12.000 totales y 3.636 disponibles.

Y el «5%» venía de la misma raíz. El porcentaje se calculaba
`total > 0 ? Math.floor(available / total * 100) : 0`: con un total que no sirve
**se inventaba un 0**, y un 0 % entra por debajo del umbral más pequeño, que es
el más alarmante. **El respaldo no era neutro: era el peor caso posible.**

Tres reglas:

- **Un estado se dice con un campo, no con un número imposible.**
  `getCreditsByUser` devuelve `{ ilimitado: true }` y el resto de campos ni
  existen en esa rama. Con una unión discriminada **el compilador no deja**
  leer `total` sin mirar antes `ilimitado`; un comentario pidiendo cuidado, no.
- **Un número que no se puede calcular no se sustituye por otro.** Si no hay
  porcentaje, no hay aviso — no hay «0 %». Se dice en la consola y se calla
  hacia fuera.
- **Quien decide qué aviso sale es puro y está probado**
  (`aviso-de-creditos.ts`). El banco reproduce primero **el mensaje exacto de
  la captura** con la lógica vieja, y solo después demuestra que la nueva no lo
  manda. Sin ese primer paso no se sabe si se arregló la causa o algo parecido.

**2. Una lista vacía no es «ninguno»: es «todavía no está configurado».** La
regla de quién paga la IA preguntaba solo «¿está esta clave en el registro de
Verzay?». Con el registro recién creado y vacío la respuesta era «no» para
todas, así que **la plataforma entera pasó a ilimitada de golpe** — y de ahí
que el aviso con centinelas saliera por todas partes a la vez.

La condición correcta es **`hay registro Y la clave no está en él`**, y va igual
en los dos lados (la App y el motor). Si se añade otra regla que dependa de una
tabla que alguien tiene que llenar, se pregunta lo mismo: **distinguir «vacío»
de «no aplica» antes de dejar que decida nada.**

## `ia_credits.used` está en TOKENS y `total` en CRÉDITOS, a propósito

Dos columnas de la misma fila, en dos unidades distintas. Es raro y hay que
saberlo, porque **`used > total` es lo normal, no una corrupción**.

La conversión es `1 crédito = 3.085 tokens`:

- **Se escribe en tokens.** El único sitio que suma consumo es
  `AiCreditsService.trackTokens`, con `used: { increment: tokensInt }`. Todo lo
  demás que escribe `used` escribe **cero** (crear la cuenta, renovar, cambiar
  de plan). La pantalla de admin, que deja teclear créditos consumidos, los
  convierte antes de guardar (`onCreditsToTokens`).
- **Se lee en créditos.** `Math.floor(used / 3085)`, y
  `available = max(total - eso, 0)`. Lo hacen el motor (`getCreditsByUser`), el
  Perfil (`getOwnIaCredits`) y Analíticas.

### El falso positivo que genera, y cómo se reconoce

Mirando la tabla en crudo salta esto: «de 39 cuentas, 19 tienen `used > total`,
y son **todas** las que tienen consumo; el `used` mínimo es 38.320, por encima
del plan más grande (25.000)». Parece corrupción y no lo es.

**Esa comparación —38.320 contra 25.000— es tokens contra créditos, que es
justo el error que se está investigando.** En créditos son 12, por debajo de
cualquier plan. Y el umbral se cruza enseguida: **9 créditos consumidos ya son
27.765 tokens**, así que cualquier cuenta con uso real pasa de su `total` en
crudo. Por eso son 19 de 19.

La prueba de que el dato está sano es **leerlo como tokens y ver si sale una
cifra plausible**: el máximo de producción, 37.096.399, son 12.024 créditos —
normal. Leído como créditos serían 37 millones contra planes de 25.000, que es
imposible. Y la cuenta de la que había captura cuadra al dígito: 25.802.940
tokens → 8.364 consumidos, 3.636 disponibles, los mismos que enseñaba su panel.

> **«Recalcular» `used` dividiéndolo por 3.085 sería destructivo.** Los lectores
> ya convierten, así que se aplicaría dos veces: esa cuenta pasaría de 8.364
> créditos consumidos a **2**, y su saldo de 3.636 a 11.998 salidos de la nada.
> Regalaría el consumo de todo el mes a las 19 cuentas a la vez.

### Lo que sí hay que vigilar

**Ninguna comparación toca `used` y `total` en la misma expresión.** Los bugs
reales de esta familia han sido siempre ese: comparar sin convertir.

Ya pasó en el voicebot, que hacía `credit.used >= credit.total` y por eso daba
«sin créditos» a casi todo el mundo —bastaban **4 créditos** para agotar un cupo
de 12.000—. Se arregló llamando a `getCreditsByUser`, que es la puerta del chat:
**quien necesite saber si a una cuenta le quedan créditos pregunta ahí, no lee
la fila.** Es la misma regla de los contadores de Chats: un número se calcula en
un sitio, no en cada sitio que lo necesita.

Y queda un cabo suelto conocido: la conversión está escrita en **tres sitios y
con dos redondeos** —`TOKENS_PER_CREDIT` con `floor` en el motor,
`onTokensToCredits` con `ceil` en la App, y seis `Math.floor(... / 3085)` a
mano—. Por eso el Perfil y el `CreditsWidget` pueden diferir en un crédito para
la misma cuenta. Unificarlo es un frente aparte, pendiente.

## Los créditos se reponen AL PAGAR, y el cupo se lee de Panel › Planes

Nada reponía los créditos al pagar. El motor tiene su reloj
(`renewDueCredits`, cada hora) que los repone cuando su `renewalDate` vence,
pero esa fecha iba por libre: no la movía el cobro. Así que renovaba el mes que
tocara hubiera pago o no, y el cliente que acababa de pagar seguía con el
consumo del mes anterior encima. Desde fuera: **se paga y los créditos no
vuelven.**

Ahora el cobro los repone (`lib/renovar-creditos.ts`, llamado desde
`setUserBillingDueDateInternal`): `used = 0`, `total` = el cupo del plan, y
`renewalDate` = la nueva fecha de vencimiento, para que el reloj del motor no
los reponga otra vez a mitad de ciclo.

Tres cosas:

1. **El cupo se LEE, no se escribe en código** (`lib/cupo-del-plan.ts`). Sale de
   Panel › Planes, que es donde cada plan tiene su nombre comercial (Básico,
   Esencial, Business…) y sus créditos. Detrás van, por orden, la suscripción
   viva de la cuenta, la tabla vieja «Créditos por plan» —que es la que lee el
   motor— y el respaldo escrito, **solo** para que una cuenta no se quede en
   cero porque nadie configuró su plan. `deDondeSalio` dice cuál contestó: sin
   eso, un cupo raro no se puede explicar.
2. **`personalizado` conserva su total.** Es un acuerdo puesto a mano y
   reponerle un número calculado se lo borraría en la primera renovación. El
   consumo sí se repone.
3. **Un fallo aquí no puede tumbar el cobro**, y tampoco puede ser mudo: unos
   créditos que no se reponen en silencio no se ven como un error, se ven como
   «la IA dejó de contestar».

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

## Vencimientos: un DÍA, no un instante, y quien lo juzga es uno solo

Las tarjetas de Proyectos y de Tickets llevan fecha de vencimiento, con un
distintivo de color, dos avisos en la campanita y un filtro en el tablero.

**Lo primero que hay que saber, porque cambia cómo se lee todo lo demás:** en
Proyectos la fecha **ya existía y es obligatoria** (`tasks.dueDate`, `NOT NULL`
en una tabla del BACKEND), así que ahí el distintivo sale siempre. Opcional de
verdad lo es en Tickets, donde la columna es nuestra. Hacerla opcional en
`tasks` sería una migración del backend, que es lo que reventó el #360.

### Se compara por DÍA, y eso era un fallo vivo

Lo que había en la tarjeta de Proyectos era:

```ts
const overdue = new Date(iso) < new Date();
```

O sea por **instante**. Una tarea que vencía hoy a las 18:00 salía **en rojo a
las 18:01**, y a las 09:00 ya estaba roja si la hora guardada eran las 08:00.
Un vencimiento es un **día**: mientras quede día, no se ha pasado; y lo que
venció ayer a las 23:59 está vencido a las 00:01 de hoy aunque falten segundos
de reloj.

Todo se reduce a **cuántos días naturales faltan** (`diasQueFaltan`, que aplasta
las dos fechas a medianoche **antes** de restar — restar en crudo y dividir por
86.400.000 da cero entre las 23:00 y las 01:00, que es el mismo fallo por otra
puerta).

> **Quien juzga un vencimiento es `lib/vencimiento.ts`, y es puro.** De ahí
> tiran **cuatro** sitios que tienen que decir exactamente lo mismo: las dos
> tarjetas, los dos filtros y el trabajo diario que manda los avisos. Con la
> cuenta escrita en cada uno, una tarjeta puede salir en rojo sin que haya
> salido ningún aviso — y eso no se lee como un error, se lee como que los
> avisos no funcionan.

Tres colores y un apagado: **neutro** cuando falta más de un día, **ámbar** hoy
o mañana, **rojo** pasado, y **nada** cuando la tarjeta está terminada o no
tiene fecha. Lo de terminada es el encargo entero de esa palabra: sin ello la
columna «Hecho» de un tablero con un mes de historia sale **entera en rojo**, y
el rojo deja de significar nada.

### Los dos avisos van a la campanita, y NO sacan la ventana que interrumpe

Es la decisión que más fácil se deshace sin querer. `avisosPorSaltar` traía
**todo** lo que tuviera `atendidoEn IS NULL`, así que un tipo nuevo salta la
ventana por defecto. Ahora acota por `TIPOS_QUE_INTERRUMPEN`, y `vence` no está
dentro.

Los otros cuatro tipos son cosas que **acaba de hacer una persona** —te asignó
algo, comentó, te mencionó—: interrumpir ahí es para lo que esa ventana existe.
Un vencimiento no lo hizo nadie, lo dispara el calendario, y le toca **a la vez,
el mismo día y a la misma hora, a todo el que tenga algo que vence**. Una
ventana que no se cierra sola saltándole a medio equipo cada mañana es
exactamente lo que este documento lleva media docena de reglas evitando — y el
precio no es ese aviso: es que con él se empiezan a despachar sin leer los otros
cuatro.

### Sin repetir: lo decide la BASE, y la clave lleva la FECHA dentro

`avisos_de_vencimiento` es una tabla de la App con
`CREATE TABLE IF NOT EXISTS`, sin clave foránea, y su clave primaria es
**`(qué, cuál, hito, día, destinatario)`**. Se apunta con
`ON CONFLICT DO NOTHING` y **quien decide si el aviso era nuevo es Postgres, por
las filas que dice haber tocado** — no un `SELECT` previo nuestro: dos vueltas
solapadas del cron verían las dos que no existe y mandarían las dos el mismo
aviso. Es la misma regla que `anotarUnaVezAlDia` del reparto del trabajo.

Y **la fecha va dentro de la clave** a propósito: mover el vencimiento es un
aviso nuevo, porque es una fecha nueva. Sin ella, aplazar una tarjeta ya avisada
la dejaría muda para siempre.

Cuatro cosas más:

1. **Se apunta ANTES de crear el aviso.** Al revés, dos vueltas solapadas
   crearían los dos avisos y solo después se darían cuenta. Lo que se arriesga
   con este orden es perder un aviso si la creación falla justo después; con el
   otro, mandarlo dos veces — y de los dos, ese es el que se nota.
2. **Dos hitos y ninguno más**: la víspera y el día. Lo ya vencido **no vuelve a
   avisar** —el distintivo rojo ya lo está diciendo—; insistir cada día es lo
   que ya costó una vuelta en los recordatorios de Cobros.
3. **El destinatario es el responsable; si no hay, quien la creó.** La segunda
   mitad es la que importa: sin ella una tarjeta sin asignar no avisaría a
   nadie, que es justo la que más fácil se olvida. Y es la **PERSONA**, como
   todos los avisos: los ids salen ya de columnas de persona
   (`assignedToId`, `createdById`, `responsableId`, `creadoPorId`) y **no** de
   las de alcance (`ownerId`, `clienteId`, `destinoId`). Con una de esas, el
   aviso queda a nombre de una cuenta y no le aparece a nadie.
4. **Cuelga del cron diario que ya existe** (`/api/cron/billing`), envuelto en
   su `try` como los cobros: un fallo suyo no puede tumbar el cobro de la
   plataforma, y su cuenta sale en la respuesta para que se vea si un día deja
   de mandar nada. Un cron propio es un segundo sitio que puede dejar de
   dispararse sin que nadie se entere.

### Y con un filtro puesto NO se reordena la columna

Los dos tableros guardan el orden escribiendo **la columna entera**. Con el
filtro puesto esa lista son solo las tarjetas visibles, así que las escondidas
perderían su sitio y saltarían al principio **al quitar el filtro** — que es
cuando ya nadie relaciona las dos cosas. Es el mismo fallo que la rejilla de
Proyectos evita calculando el movimiento sobre la lista completa; aquí no se
puede, porque no hay forma de saber entre qué dos escondidas cae.

Así que se rechaza, **y no en silencio**: sale «Quita el filtro de vencimiento
para reordenar la columna». Un arrastre que se rinde callado se ve como «la
tarjeta no se queda donde la dejo». Cambiar de columna sigue funcionando.

Y **«esta semana» incluye lo vencido**: lo que se pasó de fecha no deja de ser
de esta semana el lunes siguiente, y escondérselo a quien pregunta «qué me
vence» es justo el dato que iba a buscar. Lo terminado no pasa ningún filtro de
vencimiento: su distintivo está apagado, y una lista de urgencias con trabajo
hecho dentro no sirve para lo que se abre.

### Una fecha de un `<input type="date">` no se corta sobre UTC

`toISOString().slice(0, 10)` es la forma corta y está mal: pasa a UTC antes de
cortar, así que una fecha guardada el día 20 por la tarde en Colombia sale como
el **21**. El campo enseñaría un día distinto del que pinta el distintivo de al
lado, y reabrir y volver a guardar sin tocar nada le correría la fecha un día,
**cada vez**. Va con `elDiaDelInput`, que usa la zona de quien mira.

Lo mismo del lado del servidor: el runner sella el día con la zona del servidor,
igual que `diaDelCierre` en el reparto del trabajo.

### Medido en Chromium

Sobre el CSS del build, a 1440, 1024 y 390, con las columnas fijas como en el
tablero de verdad:

| | sin distintivo | con distintivo |
| --- | --- | --- |
| tarjeta de Proyectos | 89 px | **89 px** |
| tarjeta de Tickets | 89 px | **107 px** |

La de Proyectos **no crece**: el distintivo entra en la fila de metadatos que ya
estaba. La de Tickets sí, 18 px, porque esa fila ya lleva «Esperando hace…» y el
responsable y el distintivo salta de línea — es el mismo `flex-wrap` que ya
tenía con un nombre de cliente largo, así que no es un comportamiento nuevo,
pero **una columna de tickets queda con alturas mixtas** (89 los que no tienen
fecha, 107 los que sí). Si algún día molesta, lo que hay que mover es esa fila,
no el distintivo.

El distintivo mide 16 px de alto y de 48 a 102 px de ancho según lo que diga, y
no se sale de la tarjeta en ninguna de las tres anchuras.

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

## «Súper administrador» es la PERSONA, y pasa por encima de todo

`currentUser()` devuelve la fila de la cuenta **efectiva**. Con el conmutador de
cuentas vinculadas, o con la cookie de «Ingresar», esa fila es la de la cuenta
en la que se está metido, así que **`user.role` deja de ser el tuyo**: un
superadministrador dentro de una cuenta `admin` era, para las 48 puertas que
preguntan por la cuenta, un `admin`; dentro de la de un cliente, un `user`.

Y veinte ficheros más cierran por `advisorRole !== "administrador"`. De esos
veinte, **ninguno eximía al superadministrador**. Desde fuera: la cuenta que
administra la plataforma entera abría Panel › Notificaciones de una cuenta suya
y le salía «Sección no habilitada», con los 42 permisos puestos.

> **La regla, y es la que manda sobre las demás:** quien es superadministrador
> de plataforma lo es **esté en la cuenta que esté**. Se pregunta con
> `esSuperAdminDeVerdad(persona)` (`lib/super-admin-de-verdad.ts`), y va como
> **salida temprana**, antes de cualquier condición de `advisorRole` o de
> cuenta — detrás no sirve de nada, que es justo lo que pasaba.

Está puesta en `workspace-roles`, `cuenta-que-configura`, `panel-acceso`,
`mando-en-chats`, el `esAgente` del layout y las acciones de tickets.

**No cuesta ni una consulta, y esa es la parte de diseño.** La primera forma de
escribirla era la de `esAdminDeVerdad` —que vivía en dos rutas de `/api`— y ante
un rol efectivo insuficiente iba a la base a leer el rol de `sessionUserId`. No
hace falta ir: `resolverElUsuario` **ya lee la fila de la persona real** —la
necesita para los permisos— y lo único que hacía era tirar su `role`. Ahora lo
propaga en `rolDeLaPersona`, y con eso la regla es **pura y síncrona**.

Que sea síncrona no es un detalle: `canManageWorkspace` y `puedeBorrarEnChats`
**no son `async`** y tienen decenas de llamadores. Con una regla asíncrona había
que volverlos `async` y arrastrar el cambio por medio repo.

Tres cosas que hay que mantener:

1. **Esto NO hereda el rol.** `user.role` sigue siendo el de la fila efectiva
   para todo lo demás y `cuentaQueManda` sigue decidiendo el alcance por cuenta.
   Lo único que dice esta regla es que quien manda en la plataforma sigue
   mandando.
2. **Se miran los DOS lados**, `role` y `rolDeLaPersona`. Una cuenta de
   superadministrador a la que entra otro tiene su rol en `role`; un super admin
   que entra en otra cuenta, solo en `rolDeLaPersona`. Preguntar por uno solo
   deja fuera la mitad de los casos.
3. **Y la excepción: «Ingresar» NO es el conmutador.** Esta regla se escribió
   para el **conmutador de cuentas vinculadas** —cambiar a una cuenta del
   propio equipo y seguir administrándola—, y ahí sigue igual. Entrar en la
   cuenta de un **cliente** con «Ingresar» es lo contrario: **se entra para ver
   lo que ve él**. Con el rol propio colándose dentro, Analíticas le enseñaba
   la plataforma entera donde el cliente ve su cartera, y el menú, los
   apartados del panel y los botones de Chats le salían abiertos de más.

   Lo distingue `porImpersonacion`, que `currentUser()` ya sabía (la cookie
   `impersonate_user_id`, frente a `active_account_id`), y lo aplica
   **`elRolPropioQueCuenta`**: dentro de una cuenta ajena por «Ingresar», el
   rol propio no cuenta. Va ahí y no en los diez sitios que preguntan —los
   diez pasan por `esSuperAdminDeVerdad`, `esAdminDeVerdad` o
   `rolQueAbrePuertas`, y los tres lo usan—.

   Lo que decide dentro es **el rol de la fila en la que se está**: entrar en
   una cuenta de la casa sigue enseñando lo de la casa, porque es lo que esa
   cuenta ve. Y salir nunca queda cerrado: es borrar la cookie
   (`/api/logout`), que no pregunta ningún rol.

## Lo que se LEE por persona se ESCRIBE por persona

`currentUser()` devuelve la fila **efectiva** —la cuenta en la que se está
metido—, y medio repo usaba `user.id` como si fuera la persona. Lo es **salvo
dentro de otra cuenta** («Ingresar» o el conmutador de vinculadas), y por eso
esta familia de fallo no se ve en ninguna prueba manual: en el caso normal los
dos ids son el mismo.

> **Un dato que se lee con `sessionUserId ?? id` se escribe con
> `sessionUserId ?? id`.** Lo contesta una sola función,
> `laPersonaQueActua(user)` (`lib/chat-de-equipo.ts`), que es `quienFirma` con
> el `null` resuelto — la misma con la que firma el chat de equipo y con la que
> cuenta la Actividad del equipo.

Y `elDestinatarioDeLosAvisos` **delega en ella**. Antes eran dos funciones
contestando la misma pregunta por separado, que es como se arregló este fallo
**la primera vez y solo a medias**: se corrigió el lado de leer y la tabla se
quedó con las dos identidades dentro.

### Lo que rompía, y no daba ningún error

| dónde | se escribía | se lee | el síntoma |
| --- | --- | --- | --- |
| `task_alerts.destinatarioId` (vía `tasks.createdById` y el autor de un comentario) | efectiva | persona | el aviso queda a nombre del cliente: **ni ventana, ni campanita, nunca** |
| `task_alerts.vistoEn` / `atendidoEn` | efectiva | persona | el `UPDATE` toca **0 filas**: el punto del tablero no se quita jamás |
| el punto del tablero (`tareasConAlgoSinVer`) | — | efectiva | preguntaba por un id que nunca tiene avisos: **siempre 0**, o sea «todo leído» |
| `task_comments.autorId` y `autorNombre` | efectiva | persona | el comentario sale firmado por el cliente y el «Tú» del hilo no acierta |
| el `actorId` de un aviso | efectiva | persona | `crearLosAvisos` descuenta con `destinatarioId === actorId`: **uno se avisa a sí mismo** |
| `task_work.cerradaPorId` | efectiva | persona (Actividad) | el Reparto del trabajo y la Actividad del equipo cuentan el mismo rato a dos ids distintos |
| `Session.assigned_advisor_id` (`takeSession`) | efectiva | persona (el desplegable de asesores) | «Asignarme» deja el chat tomado y **«Mías» sale vacía** |

Medido contra Postgres: marcar visto con la efectiva devuelve `UPDATE 0` y con
la persona `UPDATE 1`. Y el `0` de arriba es la trampa entera — el contador del
punto también daba `0`, así que **las dos mitades del fallo se tapaban entre
ellas** y desde fuera parecía que no había nada que ver.

### Tres cosas que hay que mantener

1. **El asesor de un chat es la PERSONA en los dos lados.** `takeSession`
   escribe `laPersonaQueActua(user).id` y `releaseSession` compara con lo mismo;
   `assignSessionToAdvisor` ya recibía ids del desplegable, que son personas.
   Cambiar solo el filtro habría dejado «Asignarme» escribiendo una cosa y
   «Mías» buscando otra — peor que el fallo original.
2. **`clientesDelAsesor` NO entra aquí**: es alcance, no firma, y va por la fila
   efectiva. Entró en esta lista por error y costó una regresión; el porqué está
   en la sección de abajo.
3. **Los latentes ya entraron**: `audit_logs.actor_id`,
   `tickets_de_soporte.creadoPorId`, `cobros.creadoPorId` y los dos
   `confirmadaPorId` firman con la persona. Y los tres que quedaban marcados
   como candidatos —`AssignmentLog.assignedBy`, el `actorId` de
   `generateConversationIntelligence` y el de `collab_notifications`— están
   cerrados en la sección de abajo: los tres eran firma.

### Y de lo ya escrito, qué se puede recuperar: NADA, y por qué

Es la parte incómoda y conviene que esté escrita. El valor guardado es **el id
de la cuenta**, y una cuenta tiene muchas personas detrás; peor aún, quien
actuaba venía normalmente de **otra cuenta distinta**, así que su rastro no está
en la fila por ningún lado:

- `autorNombre` y `cerradaPorNombre` **también** se copiaron de la fila efectiva,
  así que el nombre tampoco la identifica.
- `AssignmentLog.assignedBy` y `audit_logs.actor_id` guardaban el mismo id
  efectivo, así que no sirven de contraprueba.

Deducir la persona sería **inventar un autor**, y eso es peor que un autor
equivocado: quedaría indistinguible de un dato bueno. Así que no hay backfill.

**Lo que sí se arregla solo**, sin tocar ninguna fila:

- el **punto del tablero** y los avisos sin ver: esas filas no están mal, están
  **sin leer**. Abrir la tarea ahora las marca y el punto se apaga.
- **«Mías»** y el **«Tú»** del hilo: no guardan nada, se calculan al pintar.
  Quedan bien desde el despliegue.

**Lo que queda mal para siempre** son las filas escritas desde dentro de otra
cuenta: el autor de esos comentarios, quién cerró esas tareas y quién creó esas
tareas. Cuánto es se mide así —**no se ejecutó**, esta sesión no tiene acceso a
producción—:

```sql
SELECT 'task_comments.autorId' AS donde, count(*) AS filas
FROM "task_comments" c JOIN "User" u ON u.id = c."autorId" WHERE u."owner_id" IS NULL
UNION ALL SELECT 'task_work.cerradaPorId', count(*)
FROM "task_work" w JOIN "User" u ON u.id = w."cerradaPorId" WHERE u."owner_id" IS NULL
UNION ALL SELECT 'tasks.createdById', count(*)
FROM "tasks" t JOIN "User" u ON u.id = t."createdById" WHERE u."owner_id" IS NULL;
```

Es un **techo, no la cifra**: un dueño sin `owner_id` que trabaja en su propia
cuenta cuenta ahí y está perfectamente bien. Lo que de verdad importa del número
es si es cero.

### Pero FIRMAR y ALCANZAR son dos preguntas, y el alcance va por la efectiva

Aplicar la regla de arriba a `clientesDelAsesor` fue un error, y costó una
regresión en producción: Yair, administrador de una cuenta, recibía **«No
autorizado para gestionar este cliente»** al guardar en Editar pagos sobre
clientes que lleva todos los días.

La regla que manda es la del principio de este documento —**el administrador de
una cuenta actúa POR la cuenta**: alcanza sin limitación todo lo que ella
alcanza, clientes, instancias y analíticas, para listar y para guardar, y solo
en las cuentas donde se le nombró administrador—. Y el dato que dice con qué
cuenta se está actuando es **la fila efectiva**, que es justo lo que resolver la
persona tira.

> **Un dato que se FIRMA va con la persona; un alcance se pregunta a la fila
> EFECTIVA.** La primera contesta «quién hizo esto» y tiene que sobrevivir a que
> se cambie de cuenta; la segunda contesta «hasta dónde llego ahora mismo», y
> eso lo decide la cuenta con la que se entró.

Las dos puntas se rompen a la vez al confundirlas, y las dos se vieron:

- **Se queda corto.** Un administrador llega a su cuenta por **dos caminos**, y
  solo uno deja rastro en su fila: `owner_id` y **`linked_accounts`**. Por el
  segundo su propia fila no cuelga de nadie y no tiene `advisorRole`, así que
  `cuentaQueManda` sobre ELLA devuelve su id con rol `user` y la cartera sale
  `[]`. Es la misma asimetría que ya partió el General del chat de equipo en
  dos: **`ownerId ?? id` no sube a la madre.**
- **Y se pasa.** Dentro de un cliente con «Ingresar» se entra para ver lo que ve
  él —la excepción escrita en *«Súper administrador» es la PERSONA*— y ahí el
  rol propio no cuenta. Con la persona resuelta, el alcance de quien entró se
  colaba dentro.

Y la parte que hace la regla fácil de aplicar: **cuando los dos ids difieren
—el conmutador y «Ingresar», los únicos dos casos— la fila efectiva YA es la
respuesta correcta.** No hay ningún caso en que resolver la persona mejore el
alcance, así que la consulta que se quitó no dejó nada sin contestar.

Medido contra Postgres con las filas del caso, corriendo el código de verdad
—`clientesDelAsesor`, `cuentaQueManda` y `assertBillingScope`—:

| quién | antes | ahora |
| --- | --- | --- |
| administrador con su propio usuario (`owner_id`) | sin límite | sin límite |
| administrador **por cuenta vinculada** | **«No autorizado»** | sin límite |
| agente con un cliente asignado | ese y solo ese | igual |
| súper administrador dentro de un cliente por «Ingresar» | **la plataforma** | lo que ve el cliente |

Y por qué no se vio en las pruebas: el administrador que llega por `owner_id`
—que es el caso que se probó— **pasa igual por los dos caminos**, porque su
propia fila sí lleva la herencia dentro. Solo falla el que llega por
`linked_accounts`. Probar un administrador no basta: **hay que probar los dos
caminos por los que alguien llega a una cuenta.**

### Y las cinco firmas que quedaban: `audit_logs`, tickets y cobros

Eran los tres «latentes» del inventario: columnas que **se escriben y todavía no
se leen contra la persona en ninguna pantalla**, así que no rompían nada hoy —y
precisamente por eso se arreglan ahora, antes de que algo empiece a leerlas y el
fallo aparezca con años de historial mal firmado detrás.

| columna | qué guarda |
| --- | --- |
| `audit_logs.actor_id` | quién tocó el dato auditado |
| `tickets_de_soporte.creadoPorId` | quién tecleó el ticket |
| `cobros.creadoPorId` | quién creó la deuda |
| `cobros.confirmadaPorId` | quién confirmó el pago |
| `cobro_ciclos.confirmadaPorId` | lo mismo, en la fila del ciclo |

Las dos últimas salen **del mismo valor**: `confirmarElPago` lo escribe en las
dos tablas, así que firmarlo una vez en la acción las arregla a la vez.

Tres cosas que hay que mantener:

1. **`getAuditActorId` es quien decide, y por eso se arregló ahí.** Dieciséis de
   los veinticuatro sitios que escriben `actor_id` la llaman en vez de calcular
   el id a mano; los ocho de Proyectos y Tareas que lo tenían escrito pasan por
   `laPersonaQueActua`. Si se añade otro sitio que audite, va por esa función.
2. **Lo que NO se tocó, y no es un olvido**: los `writeAuditLog` del **modo
   dueño** por WhatsApp (`lib/owner-commands.ts`, `lib/owner-training.ts`) pasan
   `actorId: ownerId` porque **ahí no hay sesión ninguna** — el dueño ES la
   persona que escribió. Meterles `laPersonaQueActua` sería inventarse una
   sesión que no existe.
3. **Sin backfill, y a propósito.** Es la misma razón que ya está escrita arriba:
   el valor viejo es el id de una cuenta, y de él no se puede deducir quién
   estaba sentado delante. Deducirlo sería inventar un autor, que es peor que
   uno equivocado porque no se distingue de un dato bueno.

Medido contra Postgres con el esquema real, corriendo las **acciones** de verdad
—`crearCobroAction`, `confirmarPagoAction`, `abrirTicketAction`— y leyendo
después la columna. Cinco comprobaciones; con el código anterior fallaban
**cuatro**:

| cómo se llega a la cuenta | antes | ahora |
| --- | --- | --- |
| `owner_id` (Yair, del equipo) | la persona | la persona |
| `linked_accounts` (el conmutador) | **la cuenta** | la persona |
| «Ingresar» | **la cuenta** | la persona |

Y la mitad que de verdad protege: el banco comprueba **en la misma fila** que la
columna de alcance de al lado no se movió —`audit_logs.user_id`,
`cobros.ownerId`, `cobro_ciclos.ownerId`, `tickets.clienteId` y `destinoId`
siguen siendo la CUENTA—. Sin esa mitad, «arreglar la firma» puede estar
moviendo el alcance sin que nadie se entere, que es exactamente la regresión de
la sección de arriba.

Y el mismo patrón otra vez: el camino de `owner_id` **pasaba ya con el código
viejo**, porque ahí la fila efectiva y la persona son la misma. Probar solo ese
camino habría dado un banco verde sobre un fallo intacto.

### Y los tres candidatos que quedaban: los tres eran FIRMA

Se miraron los tres antes de tocar ninguno, que es lo que esta sección pide:
**¿alimenta esto una pantalla o un filtro por alcance?** Los tres contestan que
no —ninguno acota nada— y los tres guardan quién hizo algo. Van con la persona.

| | qué se hace con la columna | qué pasaba |
| --- | --- | --- |
| `AssignmentLog.assignedBy` | **nada la lee**: `getAssignmentHistory` la trae y la pantalla pinta el asesor y la acción | en el mismo `INSERT` de `takeSession` convivían las dos identidades: la persona en `advisorId` y la cuenta en `assignedBy` |
| `actorId` de `generateConversationIntelligence` | se escribe en `internal_notes.authorId` —cuyo nombre pinta el panel de Notas— y en `collab_notifications.actorId` | cerrar una conversación dentro de la cuenta de un cliente dejaba el resumen **firmado por el cliente** |
| `collab_notifications.actorId` | solo resolver el nombre del «X te mencionó» | igual: la campanita decía que te había mencionado la cuenta |

**Y de la tercera salió la mitad que no se había reportado.** En esa misma tabla
`recipientId` **se escribe con personas** —los ids salen del desplegable de
asesores, del `targetAdvisorId` de una transferencia y de la lista de
mencionados— y **se leía con la fila efectiva** en sus cuatro lectores. Es
literalmente el fallo de `task_alerts.destinatarioId`, en otra tabla: dentro de
otra cuenta esas notificaciones **no aparecían** y no se podían marcar como
leídas. Arreglar solo el `actorId` habría dejado media tabla.

Tres cosas que hay que mantener:

1. **Las dos puntas se mueven juntas.** `deleteInternalNoteAction` compara
   `authorId` con quien llama: eso es **identidad, no alcance**, así que se
   compara con la persona. Cambiando solo el lado de escribir, el autor no
   podría borrar su propia nota — que es el fallo del #783 por la otra cara. Lo
   mismo con el «no mencionarse a sí mismo» y con el «no avisarse a sí mismo» de
   los participantes: los ids que llegan son personas.
2. **Lo que NO se movió, y es la mitad que protege el banco.**
   `getSessionIdsWithNotesAction` filtra por `session.userId`,
   `getTeamMemberIds` por `ownerId ?? id`, y `requireOwnerOrAdmin` devuelve
   ahora **las dos cosas por separado** (`personaId` firma, `ownerId` alcanza).
   El banco comprueba **en la misma fila** que la columna de alcance de al lado
   no se movió.
3. **Sin backfill**, por lo de siempre: del id de una cuenta no se deduce quién
   estaba sentado delante. Y aquí no se esconde nada al mover la lectura de
   `recipientId`, porque lo ya escrito **ya eran personas**.

Y de paso salieron **dos sitios que el #785 se había dejado** en
`assigned_advisor_id`, la columna que aquella vuelta declaró «persona en los dos
lados»: `transferSession` y `puedeCerrarOReabrir` seguían comparando con la fila
efectiva. O sea que un chat tomado dentro de otra cuenta se podía tomar y no se
podía transferir ni resolver — «Solo puedes transferir tus propias
conversaciones» sobre una que sí era suya. **Cuando se declara que una columna
es de la persona, se cuentan TODOS sus comparadores**, no los dos que se
tocaron ese día.

El banco son 13 casos contra Postgres con las acciones reales, en **dos modos**.
Con el código viejo fallan **7**; los seis que pasan en los dos son justo los
que no podían cambiar: el camino de `owner_id` —donde la fila efectiva y la
persona son la misma— y las tres guardas de alcance.

## Clientes: «¿gestionas a este?» y «¿qué rol le pones?» son dos preguntas

En Panel › Clientes el desplegable de rol listaba **los cinco** roles a
cualquiera que abriera la pantalla (`Object.values(Role)`), y `updateClientData`
copiaba el `role` del formulario **tal cual** a `db.user.update`. La única
puerta que había —`exigirGestionDelCliente`— contesta «¿gestionas a este
cliente?» y nada más. La segunda pregunta, **qué rol le estás poniendo**, no la
hacía nadie.

Así que un `admin` podía hacerse a sí mismo o a un compañero «Super
administrador». Y desde Verzay | Atencion —cuenta vinculada, rol `admin`— el
listado devolvía **a su propia madre**, Grupo Verzay, porque `getEnrichedClients`
trae a todo el que no tenga `ownerId`: con la fila delante se le podía abrir la
ficha y degradarla.

La regla, y las dos mitades que hay que mantener juntas:

> **Nadie otorga un rol igual o superior al suyo.** Un `admin` llega hasta
> `reseller`; «Administrador» y «Super administrador» **solo los reparte un
> súper administrador de verdad** —el de la PERSONA (`esSuperAdminDeVerdad`), no
> el de la cuenta en la que esté metida—. El súper administrador es la única
> excepción, y tiene que serlo: con «ni igual ni superior» aplicado a él no
> quedaría nadie capaz de crear otro.

Y la mitad que se olvida: **se miran las DOS puntas, el rol nuevo y el que ya
tenía**. Sin eso, un `admin` no puede ascender a nadie a `super_admin` pero sí
puede **degradar** al súper administrador a `user` —que es «otorgar un rol
inferior», permitido por la letra— y quedarse mandando él. Es la misma escalada
por el otro lado.

Quien lo decide es `lib/roles-que-puede-otorgar.ts`, **puro y sin imports**, y
lo usan los dos lados:

1. **El servidor manda.** `elRolQueSePuedeGuardar` en `updateClientData`,
   `elRolConElQueNace` en `createUserWithPausar`. **Esconder la opción no cierra
   la petición directa**: el desplegable es la fachada de esa puerta, no la
   puerta. Y el veredicto se devuelve como dato, no con un `throw`: el `catch`
   de estas acciones convierte cualquier excepción en «Error interno al
   actualizar los datos», que es tanto como no decir por qué.
2. **El desplegable sale de la MISMA función**, con `rolQueReparte` calculado en
   el servidor (`rolConElQueReparte`) y bajado como prop. Con dos listas, el día
   que se afine una el otro lado se queda atrás y aparece un «No autorizado»
   sobre una opción que la pantalla ofrecía.

Tres cosas más:

- **La puerta de un solo campo existe y es la que se olvida.**
  `updateClientDataByField` escribe `{ [field]: valor }` con el nombre que le
  manden, y su portero solo mira si quien llama tiene rol de admin o reseller.
  Era una segunda puerta al `role`. Ahora `role`, `password` y los campos de
  identidad se rechazan en seco por ahí: el rol se cambia en Clientes, que es
  donde pasa por la regla.
- **`id`, `ownerId` y `tokenVersion` no se copian de un formulario.**
  `assignNonBooleanFields` copia lo que venga, así que la identidad de la fila
  —quién es y de quién cuelga— se escribía igual que el teléfono.
- **Una cuenta vinculada no manda sobre la cuenta de la que cuelga.**
  `cuentasDeLasQueCuelga` las resuelve por los dos caminos de siempre
  (`linked_accounts` y `owner_id`), y se aplica en los dos sitios: se filtran
  del listado y se rechazan en `puedeGestionarAlCliente`, que es la llave de
  Editar, Módulos, Asignar y Eliminar. **La dirección importa**: la madre manda
  sobre la hija, no al revés. Y va **antes** del `isAdminLike`, porque la cuenta
  vinculada de este caso tiene rol `admin` y esa línea la dejaba pasar.

El súper administrador de plataforma no se filtra por ninguna de las dos cosas:
su regla sigue siendo ver y administrar todo, en cualquier cuenta.

## Analíticas: una cuenta administradora es de la CASA, no un cliente

`/panel/analytics` abría para una cuenta administradora —la página pregunta
`isAdminLike` de la cuenta que manda— y salía **a trozos**: las tres tarjetas
marcadas «interno» —Renovación mensual, Actividad de instancias y Rendimiento
de Chats— llevaban **su propia** condición, `isSuperAdmin(cuenta.role)`,
escrita tres veces en tres acciones.

Ni «Acceso Denegado» ni error: la pantalla se pintaba entera y con tres huecos.
Es el mismo síntoma que ya costó una sesión con el bloque de vigilancia —«dos
pantallas iguales lado a lado y en una falta un recuadro»—, y por el mismo
motivo: **dos fórmulas para la misma pantalla.**

> **Quién ve la Analítica de la casa se pregunta UNA vez**,
> `puedeVerLaAnaliticaDeLaCasa` (`lib/analitica-de-la-casa.ts`), y lo preguntan
> **la página y las cuatro acciones** que la alimentan. Pasan las cuentas de la
> casa —`admin` y `super_admin`— y el súper administrador de verdad esté donde
> esté. `user`, `affiliate` y `reseller` siguen fuera: esos ven **su cartera**,
> que es otra pantalla (`getAnalyticsDeMiCartera` / `getResellerAnalytics`).

Lo que separa a la casa de un cliente es **el rol de la CUENTA por la que se
actúa**, no la palabra «interno» de cada tarjeta. Esa palabra es solo el
subtítulo del recuadro —no es ninguna marca compartida, no la lee nadie y no
aparece en ninguna otra pantalla—, así que abrir las tarjetas no tiene efecto
en ningún otro sitio.

Tres cosas que hay que mantener:

0. **Con «Ingresar» puesto manda la cuenta en la que se está**, no quien entró
   (ver la excepción de *«Súper administrador» es la PERSONA*). Un
   superadministrador dentro de la cuenta de un cliente ve **su cartera**, que
   es la pantalla del cliente; dentro de una cuenta de la casa, la de la casa.
1. **Si se añade otra tarjeta interna a Analíticas, va por esa función**, y no
   volviendo a escribir la condición. Era exactamente lo que había: tres copias
   y una cuarta distinta en la página.
2. **La puerta sigue en la consulta, no en la pantalla.** Las tres devuelven
   `null` a quien no pueda verlas y entonces el bloque ni se pinta. Esconder la
   tarjeta nunca fue la puerta.
3. **A quién se le AVISA es otra pregunta.** El WhatsApp de la vigilancia sigue
   saliendo solo hacia la cuenta de superadministrador (`elSuperAdministrador`),
   y no se toca: mirar un dato interno y recibir un aviso a las tres de la
   mañana no son lo mismo.

Y de paso, «Recargar» de las alertas de créditos: el botón **tiraba la
respuesta** de `rechargeIaCredit`, así que un «No autorizado» o un fallo contra
la base cerraban el diálogo igual, sin decir nada. Desde fuera eso no se ve como
un error, se ve como un botón que no hace nada — la misma familia que el
«Guardando…» colgado de Carpetas. Ahora la mira y lo dice, y lo que reviente cae
en un `catch` con su aviso.

## Enseñar un panel y dejar pasar a su ruta son dos preguntas

La misma pregunta —«¿cuál panel es el tuyo?»— estaba escrita **cuatro veces**,
con **tres** orígenes de rol y **dos** listas de rutas: el layout (`suPanelId`),
`panelDeLaCuenta` de Equipo, `getVisibleSidebarModules` y `apartadosDelPanel`.
Discrepaban justo cuando el módulo panel se caía por un filtro, y entonces el
diálogo de Permisos decía «activo» y el guard del layout cerraba la ruta.

Ahora la regla es **una**, `elPanelQueLeToca` (`lib/sidebar-modules.ts`): recorre
las rutas candidatas en orden de preferencia y devuelve la primera que exista en
la lista que se le pase. Lo único que cambia entre los cuatro es esa lista —unos
miran los módulos ya filtrados, otros las filas de `Module`—, y eso sí es
legítimo: son preguntas distintas sobre el mismo criterio.

Y la otra mitad, que es la que cerraba la puerta:

> **Un panel ajeno se esconde del MENÚ, pero no cierra una ruta que los permisos
> conceden.** En `rutasNegadas` había un `esPanelAjeno(m) ? false : …` que
> cortaba **antes** de mirar `concedidos`/`negados`. `esPanelAjeno` sigue
> filtrando `modules` —el menú—, que es para lo que sirve.

### Y el menú NO vuelve a decidir: se queda con el que la puerta dejó

Quitar el corte de `esPanelAjeno` abrió la **ruta**, y el menú siguió
escondiendo la **opción**. Yair —administrador del equipo en una cuenta
`admin`— entraba a `/panel` escribiendo la URL y no veía «Panel» en el menú
lateral.

La causa es la segunda mitad de la misma enfermedad: **dos formulaciones con
dos roles distintos**. La puerta elegía con el rol de la CUENTA
(`/panel-admin`) y sacaba `/panel` de `modules`; el menú volvía a elegir con
`user.role` —el de la PERSONA, que en el equipo es `user`— y su lista de
candidatas **no incluye `/panel-admin`**. Buscaba `/panel`, que la puerta acababa
de quitar, no encontraba nada y escondía la entrada.

Reproducido en el banco con las funciones reales:

```
puerta      -> /panel-admin
menu ANTES  -> NADA          <- la opcion no se pintaba
menu AHORA  -> /panel-admin
```

Dos reglas, y la segunda es la que lo cierra de verdad:

1. **El rol con el que se abren puertas es `rolQueAbrePuertas(persona)`**
   (`lib/sidebar-modules.ts`, puro). Superadministrador manda siempre;
   un **administrador** de equipo abre lo que abre su cuenta (`rolDeLaCuenta`,
   que ahora viaja en `currentUser()` sin costar una consulta); un **agente** no
   hereda nada. Es `cuentaQueManda` escrito en versión pura, para que lo pueda
   usar también el menú, que corre en el navegador.
2. **El menú no elige: recoge.** `soloElPanelQueLeToca` devuelve *el elegido* y
   *la lista sin los ajenos* de una sola pasada; después solo queda uno, y el
   menú se queda con ese (`modules.find(esVarianteDePanel)`). **No puede haber
   discrepancia porque ya no hay dos fórmulas.**

Y `rolDeLaCuenta` **no se derrama sobre `role`**: en `currentUser()` se
desestructura fuera del spread de las credenciales del dueño. Derramarlo sería
heredar el rol, que es lo que este documento prohíbe desde el principio.

### Y la barra de pestañas la pinta UNO, no dos

El layout montaba **dos** `PanelAwareTabNav`: una con `panelTabs` —el panel que
le tocó— y otra con `getClientPanelTabs(modules)`. Y la segunda siempre sobró,
porque `soloElPanelQueLeToca` deja **un solo** panel entre las variantes: esa
búsqueda encuentra `/client-panel` únicamente cuando es el elegido, y entonces
la primera ya lo estaba pintando con los mismos apartados.

Desde fuera, en una cuenta cliente: **la barra repetida**, dos filas idénticas
—Informes, Proyectos, Diagramas, Finanzas…— en **todos** sus apartados. Es fácil
culpar a la pantalla que se acaba de montar; no era ninguna pantalla, era el
layout. Comprobado en banco con las funciones reales, rol por rol: la segunda
barra o sale vacía o sale copiada, nunca aporta nada.

**Las pestañas las pone el panel que le tocó, y solo él.** Si hiciera falta otra
barra, que no salga de un módulo que ya pinta esta.

Un nivel más abajo pasaba lo mismo y va por el mismo sitio: las **pestañas del
panel** (`panelModule`) se buscaban a mano con `/panel-admin ?? /panel ?? /admin`
—sin contemplar el del reseller ni el del cliente—, y `apartadosDelPanel` y la
**portada** (`MainHome`) preguntaban por `persona.role`. Los tres usan ya
`rolQueAbrePuertas`. **Si se añade otro sitio que decida qué panel o qué
apartado se ve, va por ahí**: no se vuelve a preguntar por `user.role`.

## Una lista de líneas sale de `Instancias`, no de las credenciales de quien mira

`getAvailableInstances` —el desplegable de «Línea que lo envía» de Panel ›
Notificaciones— llamaba a `fetchInstances` con la `ApiKey` **de quien mirara**.
Con el rol de superadministrador viviendo en otra fila —otra `apiKey`, otro
servidor— el desplegable pasó de ~30 líneas a **7**, `VERZAY_NOTIFICACIONES`
salía con punto gris y sin aparecer en la lista, y la prueba de envío rebotaba
con «No tienes acceso a la instancia X» porque validaba contra esa lista corta.

Es la misma regla que ya rige en *Actividad de instancias*: **el universo sale de
`Instancias`, nunca del proveedor.** El estado de conexión se cruza **aparte**,
preguntando una vez por cada par `(url, key)` distinto, en paralelo y
best-effort. Una línea cuyo servidor no conteste **sale igual**, con `unknown`:
el punto queda gris y se puede seguir eligiendo. Perder el color es un detalle;
perder la línea era el fallo.

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

## Chat de equipo: se vuelve al canal donde se estaba

Al recargar o al volver de otra sección el hilo se abría **siempre en
General**, aunque se estuviera en un área o en un directo. En un panel que se
abre y se cierra decenas de veces al día, eso es perder la conversación en
cada vuelta.

El último canal abierto vive en `localStorage` —no en la base: es una
preferencia de esta pestaña, y guardarla allí sería una escritura por cada
cambio de canal, que es lo más frecuente que se hace aquí, para devolver algo
que no importa si se pierde—. Lo deciden tres funciones de
`lib/canales-de-equipo.ts`, al lado de `CANAL_GENERAL`: `llaveDelUltimoCanal`,
`elCanalDeEntrada`, y los dos accesos con su `try`.

**La llave lleva la CUENTA y la PERSONA**, y cada una tapa un caso distinto:
la cuenta porque la lista de canales depende de ella —con «Ingresar» o con el
conmutador el canal recordado no existe—, y la persona porque dentro de una
cuenta la pertenencia a un canal es suya, así que el directo de una no es un
canal que la otra pueda abrir. Es el mismo reparto de `llaveDeLaMarca`. Y el
separador es `::` y no `_`: lo desmintió el banco, porque con `_` un id que lo
lleve dentro hace que («a», «b_c») y («a_b», «c») den la **misma** llave.

Tres cosas que hay que mantener:

1. **Lo pedido manda sobre el recuerdo.** El `?canal=` de un aviso de mención
   va a algo concreto; abrirle a alguien el canal de ayer sería un enlace que
   no lleva donde dice.
2. **Un canal que ya no existe cae en General sin error.** No hace falta
   ninguna rama que lo borre: el servidor devuelve el General y es el General
   lo que el navegador guarda, así que el recuerdo rancio se cura solo.
3. **Pero esa caída deja de ser un `warn`** cuando viene de un recuerdo
   (`deRecuerdo` en `hiloDelEquipoAction`). Un canal recordado que desapareció
   es lo normal —lo borraron, o esa persona salió de él—; con el mismo aviso
   para los dos casos, el que señala *el directo que no se abre* saltaría a
   diario por comportamiento correcto y se aprendería a despachar sin leer.

Y los ids bajan **como props desde el servidor** —layout → `BotonesDelBorde` →
`Marco` → `HiloDelEquipo`, y la ruta por su lado— porque hacen falta **antes
de la primera consulta**: la respuesta también los trae, pero para entonces ya
se habría pedido el General y se vería el salto. Leerlos al pintar con un
`useState` no vale: `localStorage` no existe en el servidor y las dos salidas
no coincidirían, o sea una hidratación rota.

### Pedir un canal concreto es RECLAMARLO ya

Es lo que estaba debajo y lo que costó encontrarlo, porque no daba ningún
error. `traer` tiene un guardián para que una vuelta del reloj que sale con el
canal anterior no pinte encima del que se acaba de abrir:

```ts
if (pedido !== canalRef.current) return null;
```

Y `canalRef` solo se movía **después** de la respuesta. `cambiarDeCanal` lo
sorteaba moviéndolo él antes de llamar; los otros dos que piden un canal
distinto del que hay, no:

- **la primera carga**, que ahora abre en el canal recordado;
- **`irAlMensaje`**, cuando el resultado de la búsqueda está en otro canal
  — un fallo que ya estaba y que nadie había reportado.

En los dos, `canalRef` valía todavía `general` y el guardián **tiraba la
respuesta buena**. La pantalla se quedaba en General, el reloj volvía a pedir
el General, y desde fuera parecía que el recuerdo no se guardaba.

**Reclamar el canal lo hace `traer`**, que es por donde pasan los tres, y por
eso `cambiarDeCanal` ya no lo repite: dos sitios diciendo lo mismo es uno que
se afina y otro que se queda.

# Pendientes

Lo que queda abierto en la plataforma. Actualizar aquí cuando se cierre algo.

## 1. El stack pisa el healthcheck de la imagen, y con los valores malos

**No se toca ahora**: queda anotado para ajustarlo con calma. Ahora mismo pasa
—los contenedores están `healthy` y el despliegue completa—, así que no urge;
pero los números son los que ya costaron una caída una vez.

El `docker-compose.yml` del stack define su propio bloque `healthcheck:`, y un
`healthcheck` de compose **pisa el `HEALTHCHECK` de la imagen**. Así que el del
Dockerfile —que es el bueno, y el que este documento describía como puesto— no
es el que corre:

| | Dockerfile (y la plantilla del repo) | Lo que corre de verdad |
| --- | --- | --- |
| `interval` | 10s | 10s |
| `timeout` | **10s** | **5s** |
| `retries` | **6** | **3** |
| `start-period` | **40s** | **20s** |

Leído del servicio con `docker service inspect`, no del panel.

**Por qué importa**: `timeout 5s, retries 3` son exactamente los del primer
intento de healthcheck, el que tumbó la App cada minuto (ver el cierre del
pendiente en Cerrados). El hilo de Node es uno: una consulta pesada bloquea el
bucle de eventos y durante ese rato `/api/health` tampoco contesta aunque la App
esté bien —se han medido parones de 25 segundos—. Con estos números bastan **15
segundos** de estrechez para dar la tarea por muerta; con los del Dockerfile
hacen falta más de un minuto.

Y ahora hay una consecuencia más que antes no existía: con `failure_action:
rollback` puesto, una lentitud pasajera durante un despliegue no solo mata la
tarea nueva, **revierte el despliegue entero**.

Dos formas de arreglarlo, y la segunda es mejor:

1. Copiar los cuatro valores del Dockerfile al `healthcheck:` del stack.
2. **Quitar el bloque `healthcheck:` del stack** y dejar que mande el de la
   imagen. Es una cosa menos que mantener sincronizada, y el Dockerfile ya lleva
   los valores buenos con su explicación al lado.

Y dónde se toca: **el `docker-compose.yml` del repo es una plantilla** —dominio
de ejemplo, límites distintos, un `pgbouncer` que en producción no existe—. El
stack que corre de verdad se edita en Portainer. Del repo salen el `CMD` y el
`HEALTHCHECK` del `Dockerfile`; el `healthcheck:` del stack y el `start-first`,
no.

La regla, que es la que se aprendió aquí: **cuando un ajuste vive en dos sitios,
hay que saber cuál gana.** El repo decía «el healthcheck está puesto» y era
cierto —en la imagen—, pero lo que corría era otro. Se comprueba en el servicio,
nunca en el fichero.

## Cerrados

- **Los 100 segundos de caída por despliegue.** Cerrado, y medido en el
  servicio, no en el fichero. Los tres pasos están:

  1. `CMD ["node", "server.js"]` sin el `sh`, para que Node sea el PID 1 y
     reciba el `SIGTERM`.
  2. `Order: start-first` en el stack, que es el que se llevaba el minuto y
     medio entero.
  3. El `healthcheck` contra `/api/health`, con `ENV HOSTNAME=0.0.0.0` —sin eso
     Next escucha en la IP del nombre del contenedor y `127.0.0.1` da conexión
     rechazada, que fue lo que tumbó el primer intento—.

  Confirmado con `docker service inspect` sobre `agente-app_verzay_app`:

  ```
  UpdateConfig  : Order "start-first", FailureAction "rollback", Parallelism 1
  RollbackConfig: Order "stop-first"
  replicas      : 2
  ```

  Y con un despliegue de verdad, el del 2026-09-15 a las 21:45 UTC:

  | | antes (2026-09-02) | ahora |
  | --- | --- | --- |
  | actualización | 01:05:53 → 01:07:34 | 21:45:39 → 21:46:39 |
  | duración | ~100 s | **60 s** |
  | sin nadie escuchando | **todo ese rato** | **nunca** |

  Lo que cambia no es que tarde menos: es que con `start-first` y **2 réplicas**
  siempre queda una atendiendo mientras entra la nueva. Traefik ya no tiene por
  qué contestar `502` durante un despliegue.

  Queda un cabo suelto que es ahora el pendiente 1: **el stack define su propio
  `healthcheck:` y pisa al de la imagen**, con los valores cortos que ya
  costaron una caída. Pasa, pero conviene ajustarlo.

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
  memoria, es el de Docker al agotarse los 10 s de gracia — el `sh` como PID 1,
  que se quitó al cerrar *los 100 segundos de caída por despliegue*.

  Se deja puesto el latido `[chats] latido del detector`: lo que diagnostica es
  que el ciclo de la lista corre, que es el fallo de la conversación atrasada,
  no este. Quitarlo es decisión aparte.
- **Seguimientos que salen tarde.** Van espaciados 1 a 2 minutos por número para
  no arriesgar la línea. Se deja como está: no se está superando la cola de 300
  donde el espaciado empezaría a doler.
- **Paginar la lista de chats.** Se hace, y era necesario: sin ello el filtro
  ofrecía «Ventas 574» y la lista solo tenía 300 filas que enseñar. Lo que se
  descartó en su día era **paginar de entrada** —cargar 50 y pedir el resto—,
  porque "no leídos" se calcula en el navegador (`localStorage`, clave
  `seenMessages`) y con tan pocos chats cargados ese contador dejaría de
  cuadrar. Eso sigue en pie: la primera página es grande (300) y las siguientes
  llegan **al bajar del todo**, así que los contadores de la cabecera solo
  ganan filas, nunca arrancan cortos.
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
