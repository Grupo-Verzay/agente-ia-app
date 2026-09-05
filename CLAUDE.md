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

## Chats: las sesiones no vuelven al reloj de la lista

`refreshChatSessions` es, con diferencia, lo más caro de la pantalla, y estaba
pegado al reloj de la lista: **cada 20 segundos, por cada pestaña abierta**.

Cada vuelta: el navegador serializa la **agenda entera** —más de 3.000 contactos
con todos sus alias en las cuentas grandes— y la manda por POST; el servidor los
valida uno por uno con Zod; con ellos arma ~10.000 identidades candidatas y
busca en lotes de 5.000, o sea consultas de 10.000 parámetros contra Postgres. Y
no es una consulta: son **cuatro** (sesiones con etiquetas, seguimientos,
resueltas y citas).

Con varios asesores conectados eso son decenas de consultas enormes por minuto
para devolver algo que casi nunca cambia. Encaja con lo que se vio: `502`
repetido, el contenedor reiniciando, y al volver la lista incompleta (240 chats
de 3.075, sin sesiones, sin nombres, sin fotos).

Van a **60s** (`INTERVALO_MINIMO_DE_SESIONES`), con `forzar` para el refresco
que se pide a mano. **No devolverlas al ritmo de la lista.**

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
