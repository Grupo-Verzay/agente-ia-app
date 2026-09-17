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
3. **Tiene consecuencia, y se acepta a sabiendas**: al entrar a la cuenta de un
   cliente con «Ingresar», el superadministrador ya no la ve *como la ve el
   cliente*, sino entera. Es lo que se pidió; si algún día hace falta el otro
   modo, es una condición aparte, no quitar esta.

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
