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

## El sufijo de dispositivo: en SQL en crudo la columna es la de la BASE

El mismo cliente salía dos veces en Chats: una ficha con el número limpio y
otra con `573233246305:39@s.whatsapp.net`. Ese `:39` es el **aparato** desde el
que se escribió —el teléfono o WhatsApp Web— y no es parte del número.

Había una limpieza para eso desde el #549. **No quitó ni una ficha en su vida**,
y el motivo es de una línea:

```
Raw query failed. Code: `42703`. Message: `column mala.assignedAdvisorId does not exist`
```

En SQL en crudo **Prisma no traduce los `@map`**: el campo es
`assignedAdvisorId` y la columna es `assigned_advisor_id`. Igual `customName` /
`custom_name`. Así que la consulta se caía entera en cada vuelta, el `catch`
escribía un `console.warn` que nadie lee, y la bandeja seguía como si nada. Un
fallo que solo se ve en la consola de un servidor **no se ve**.

**Y la trampa está en el arreglo, no en el fallo:** de las tres columnas de la
condición, `leadStatus` **no lleva `@map`** y estaba bien. Escribirlas «las tres
a juego» rompe justo la que funcionaba — lo hice, y lo cazó el banco al
segundo intento.

> **Una columna en SQL en crudo no se deduce del campo de Prisma: se
> comprueba.** El banco lo hace contra `information_schema.columns`, con la
> lista de columnas que el módulo nombra. Esa comprobación encontró además
> `crm_follow_ups.ruleKey` (es `rule_key`) y `chat_conversations.profilePicUrl`,
> que existe en producción por un `ALTER TABLE` en caliente y **no** en el
> esquema de Prisma.

### La causa del duplicado: el sufijo se PEGABA al número

Quitar la ficha era limpiar el síntoma. El duplicado nacía antes, y por dos
sitios:

1. `normalizeStoredRemoteJid` devolvía el jid tal cual —termina en
   `@s.whatsapp.net`, así que lo daba por bueno—, y con él se escribían la
   conversación, los mensajes y la ficha.
2. Peor: `extractWhatsAppDigits` solo se queda con los dígitos, y el `:` no es
   uno. `573233246305:39` salía como **`57323324630539`**, y con eso
   `buildWhatsAppJidCandidates` fabricaba `57323324630539@s.whatsapp.net` y su
   `@lid`: identidades de un número que no existe. Es el mismo daño que el
   comentario de esa función describe para los `@lid`.

**La regla va en `cleanValue`**, por donde entra todo valor de
`lib/whatsapp-jid.ts`, así que una sola función decide qué es el número y no hay
dos que discrepen. Lo comprueba el banco: los dos formatos dan **las mismas**
identidades.

Y `fmtPhone` **no pasa por ahí** —hace su propio `replace`—, así que llevaba su
propia copia del fallo: la ficha del contacto enseñaba **`+57 323324630539`**.
Lleva la misma función. Si se escribe otro sitio que saque el número de un jid,
va por ella.

### Unificar es MOVER, no borrar

La versión vieja era un `DELETE`, protegido por cuatro condiciones: tiene
sufijo, existe la ficha buena en la misma línea, nadie la ha tocado —sin asesor,
sin nombre a mano, sin estado de lead— y no se ha vuelto a guardar. Esas cuatro
dicen «recién creada y sin estrenar», y **no bastan**: media docena de las
tablas que cuelgan de `Session` van en cascada, así que una nota interna, una
cita o una etiqueta puestas sobre la copia se habrían ido con ella sin decir
nada. Poner una etiqueta no toca `Session.updatedAt`.

Así que `lib/sufijo-de-dispositivo-db.ts` **mueve antes de borrar**, en una
transacción:

- **Los mensajes** de la conversación con sufijo pasan a la limpia, y los que
  chocan —mismo `messageId` y mismo `fromMe` ya guardados bajo el jid limpio—
  son el MISMO mensaje y se quitan. Los mensajes de las dos quedan en la
  conversación que sobrevive.
- **Lo que cuelga de la ficha** —etiquetas, notas, tareas, citas, seguimientos,
  participantes— pasa a la ficha buena. Donde hay llave única con la sesión
  dentro (la misma etiqueta, el mismo disparador) la fila que chocaría es una
  copia de algo que la buena ya tiene: se quita.
- **Y solo entonces** se borra la ficha con sufijo, volviendo a mirar las cuatro
  condiciones: entre el `SELECT` y el borrado alguien pudo asignársela.

Cuatro cosas más:

1. **Sin gemela limpia la conversación NO se borra**: se le quita el sufijo y se
   queda. Borrarla sería tirar el historial del único sitio donde está.
2. **Se parte de `chat_conversations`, no de `chat_messages`.** Buscar el patrón
   sobre la tabla de mensajes es recorrerla entera, y esto corre al abrir la
   bandeja; con la conversación delante, los mensajes se mueven por su llave
   exacta, que sí entra por índice.
3. **Va a trozos** (`TOPE_POR_VUELTA`). La primera vuelta de una cuenta con
   meses de duplicados no puede quedarse reescribiendo miles de filas mientras
   alguien espera a que le abra Chats.
4. **El aviso dice el código de Postgres** (`meta.code`), que es lo que separa
   «no se pudo» de «esa columna no existe». Con `String(error)` a secas, el
   42703 llevaba un año escrito en la consola sin que nadie lo leyera.

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

### Y el segundo lote: veinticuatro ficheros más, y el CUBO que nadie nombró

El barrido anterior cerró ocho ficheros. Quedaban **veinticuatro** con el mismo
patrón: `evo-url`, `tools`, `tag`, `rr`, `prompt`, `reminders`, `appointments`,
`bookings`, `intent-trigger`, `userAvailability`, `seguimientos`,
`user-nav-preference`, `n8n-chat-historial`, `crm-follow-up-media`, `manual`,
`service`, `catalog-config`, `contact-fields`, `google-calendar`,
`booking-form`, `booking-questions`, `finance-contact-fields`,
`ai-suggested-reply` y `userAiconfig`. **129 acciones** pasan ya por
`lib/cuenta-de-la-accion.ts`.

Los cuatro que más duelen, para que se vea qué clase de agujero era:

| dónde | qué se abría con solo cambiar un id |
| --- | --- |
| `getReminderFormDeps` | devolvía **la clave de Evolution** de la cuenta nombrada, su servidor y sus leads. No es leer de más: es entregar unas credenciales. |
| `userAiconfig-actions` | su `ensureUser` **solo comprobaba que la fila existiera**. Nueve acciones leyendo, cambiando y borrando **claves de API** de otra cuenta. |
| `clearAllHistory` | un `deleteMany` sobre la **memoria entera del agente** de la cuenta que se nombrara. |
| `deleteAgentPromptsByUserId` | lo mismo con **todos** sus prompts y revisiones. |

#### El tercer cubo: lo que abre una página SIN sesión

La consigna de este lote era «todo lo que no llame un cron, un webhook ni el
despachador». Barriendo aparece **una clase más que esa frase no nombra**: las
acciones que abre una página o una ruta pública. Ponerles la guarda no las
protege — **las apaga**, porque ahí no hay nadie a quien preguntarle.

> **Antes de guardar una acción se mira si la abre algo sin sesión.** Lo dice
> `middleware.ts`: `/schedule/`, `/r/`, `/plan/`, `/p/`, `/reunion/`, `/t/` y
> los prefijos de `/api` que pasan de largo. Es lo que este documento ya decía
> de `getPublicCatalog`, y son **siete** más: `createAppointment`,
> `getRemindersByUserId`, `getPublicTeamData`, `getAvailableBookingSlots`,
> `createBookingAppointment`, `sendBookingNotifications` y las dos de preguntas
> activas del formulario de reservas.

`getRemindersByUserId` es el caso que no se puede ablandar: **lo llama la UI y
lo llama la página pública** (`/schedule/[userId]`, de donde salen los
recordatorios `isSchedule` del formulario). Guardarla cierra la pantalla que le
da de comer a la función. Se queda fuera y **se dice**, que es lo contrario de
que se quede fuera sin que nadie lo sepa.

#### Y un barrido automático se equivoca por los DOS lados

Esto costó una vuelta y conviene no repetirlo. El detector que busca «acciones
sin guarda» falla en las dos direcciones, y las dos veces en silencio:

- **De más.** Marcó abiertas a `registro-action` (usa `assertUserCanUseApp`,
  que por dentro **es** `assertCanAccessTargetUser` más el candado de pago), a
  Cobros (`laCuenta()`), a los follow-ups del CRM (`ensureAuthorizedUser`), a
  `actions-ia-credits` (`puedeVerLosCreditos`), a Contactos de operador y a
  Notificaciones (`assertCanManage`), y a `toggleWebhook`. **Siete ficheros que
  llevaban años cerrados.**
- **De menos.** No vio `updateTagAction` ni `getSessionTagsAction` —dos huecos
  reales al lado de seis hermanas guardadas—, ni `getCatalogConfig`, ni
  `deleteUserAiConfig`, ni las cuatro de `service-action`.

**Así que se lee cuerpo por cuerpo.** El barrido sirve para ordenar la cola, no
para decidir.

#### El banco mira que la guarda ESTÉ, no lo que hace

`lib/__tests__/guardas-de-las-acciones.test.mjs`. Lo que la guarda hace ya lo
prueba el banco de `cuenta-de-la-accion`; el fallo de esta familia es otro:
**a una hermana se le pasa**. Ha pasado así media docena de veces en este
repositorio —`updateTagAction`, `getCatalogConfig`, `assignSessionToAdvisor`,
los tres hermanos del estado del lead, «anclar» y «archivar»—.

El banco recorre los veinticuatro ficheros y exige que cada acción exportada
llame a una puerta conocida **o esté en la lista de exclusiones con su motivo
escrito al lado** — y falla si el motivo está vacío, para que una exclusión no
se pueda colar sin explicación. Encontró **treinta** acciones que este mismo
lote se había dejado: las dos del orden de etiquetas, `deleteUserAiConfig`, las
cuatro de servicios, tres de respuestas de formulario y cinco de seguimientos.

Dos cosas que hay que mantener:

1. **El trozo de cada acción va de su `export` al `export` siguiente**, y no
   contando llaves. Contar llaves parece lo correcto y aquí falla: el `{` que
   viene detrás de los parámetros suele ser el de la anotación de retorno
   —`Promise<{ success: boolean; … }>`—, así que el «cuerpo» salía siendo el
   tipo. El banco marcó treinta acciones que tenían la guarda dos líneas más
   abajo: **un número que no puede ser señala el sitio.**
2. **`assertUserCanUseApp` cuenta como puerta.** Dejarla fuera de la lista es
   lo que produjo el primer falso positivo, y en un banco un falso positivo se
   arregla ablandando la comprobación — que es como se pierde.

#### Y un seguimiento no tiene `userId`: cuelga de su LÍNEA

`seguimiento` no guarda cuenta, guarda `instancia`. Así que de quién es se
resuelve con `resolveInstanceOwner` y se comprueba como cualquier otra.

De ahí sale el fallo que estaba debajo: las tres acciones que van por
`remoteJid` no acotaban por línea, y **el mismo número está en dos cuentas**
—le escribe a Ventas y a Atención, que es lo normal—. Así que se leían y se
**borraban** los seguimientos de la otra. No se rechaza la petición entera: se
**filtra**, que es lo que le devuelve lo suyo a quien pregunta.

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

### Y un RUNNER de sistema no puede ser una acción: la guarda no lo cierra, lo APAGA

El barrido de arriba dejó un lote fuera a propósito: las funciones que llama un
**cron**, un **webhook** o el **despachador de avisos**. Ese lote no se cierra
en bloque, y el motivo es que **ponerle la guarda de siempre las rompe**: desde
un cron no hay sesión, `currentUser()` devuelve vacío, y lo que sale de ahí no
es un «No autorizado» en pantalla — es que el aviso deja de salir y nadie se
entera. Es exactamente lo que dejó los **avisos de Waha callados durante días**.

Y aun así había que cerrarlas, porque la premisa no cambia:

> **Una acción ES un endpoint.** Todo `export async function` de un fichero
> `'use server'` es un POST al que se llega desde el navegador con los
> parámetros que uno quiera, **lo llame quien lo llame por dentro**. Que una
> función solo tenga sentido desde un cron no la hace alcanzable solo desde un
> cron.

Lo que estaba publicado con eso, y no es poco: `runResellerBillingForAll`
—recorre la cartera de cada reseller, suspende cuentas y **borra** las que
llevan 30 días vencidas—, `runBillingDailyJobSystem` —el cobro de la plataforma
entera, con su `requireAuth: false` puesto a propósito—, `confirmPaymentInternal`
y `setUserBillingDueDateInternal` —o sea **darse por pagado**—, las diez del
despachador —«manda este texto, a este número, por la línea de esta cuenta»—,
`generateWeeklyReportForUser(userId)` y `processCallRecordingForUser` —que
gastan los **créditos de IA de otra cuenta**— y `sendQrDisconnectedNotification`,
que manda un WhatsApp a cualquier número por la línea de la casa.

**La salida no es una guarda, son dos formas de dejar de ser un endpoint**, y
cuál toca lo decide una sola pregunta: *¿lo importa algún componente de cliente?*

| | qué se hace |
| --- | --- |
| el fichero **no** lo importa ningún componente de cliente | el fichero entero deja de ser de acciones: `'use server'` → **`import "server-only"`** |
| el fichero **sí** tiene pantalla detrás | el fichero se queda como está y **el runner se va a `lib/*.server.ts`** |

`server-only` no es una etiqueta más floja: conserva lo único que `'use server'`
aportaba de verdad —que eso no se empaquete nunca hacia el navegador, y que el
build **se caiga en el sitio** si alguien lo importa desde un componente de
cliente— y quita el endpoint. Y la segunda fila no inventa nada: es lo que ya
hacían `lib/cobros-runner.ts` y `lib/avisos-de-vencimiento-runner.ts`, o sea la
regla que este documento ya tenía escrita —**un despachador del servidor no pasa
por una acción**— aplicada a los seis sitios donde faltaba.

Cinco cosas que hay que mantener:

1. **Se mira el FICHERO, no la función.** `'use server'` publica todo lo que el
   fichero exporte, así que dejar una sola función de sistema dentro publica esa
   función. Por eso `runResellerBillingForAll` se fue entera en vez de quedarse
   con un `if`: el `requireAuth: false` de `billing-job-actions` **era** el
   agujero, no el arreglo.
2. **Lo que se mueve conserva sus dos llamadores.** El cron sigue llamándolo, y
   el llamador interno que ya tenía sesión también: `generateQRCode` sigue
   avisando de la desconexión, y `generateMyWeeklyReport` sigue generando el
   informe de quien lo pide. Lo que cambia es que ese id ya no llega del
   navegador — lo pone quien acaba de comprobar quién llama.
3. **Lo que se queda abierto se dice EN EL FICHERO, no en una lista aparte.**
   Son tres, y las tres lo son porque la página que las abre no tiene sesión:
   `getAvailableSlots`, `sendMessageWithHistoryAction` y `sendBookingNotifications`.
   Las dos últimas llevan escrito además **lo que sí abren** —mandar un WhatsApp
   por la línea de cualquier cuenta— y **qué las cerraría de verdad**: que la
   confirmación de la reserva se arme en el servidor a partir del id de la cita,
   en vez de recibirla hecha. Eso toca las dos pantallas públicas de reservas,
   así que va aparte; lo que no puede pasar es que se dé por revisado.
4. **Un filtro que vive un paso después del servidor no es un filtro.**
   `/schedule/[userId]` pedía `getRemindersByUserId` —la biblioteca entera de la
   cuenta, con el texto de cada recordatorio— y filtraba `isSchedule` **al
   pintar**, así que lo que viajaba era la lista completa. Ahora hay
   `getScheduleRemindersByUserId`, que filtra en la consulta, y su hermana
   lleva la guarda. Es una función aparte y no un parámetro **porque el filtro
   es la puerta**.
5. **Y lo comprueba un banco que mira por dónde entra el sistema**, no función
   por función: `lib/__tests__/acciones-de-sistema.test.mjs` lee del propio
   `middleware.ts` los prefijos que pasan sin sesión, recorre esas rutas y falla
   si alguna importa un fichero `'use server'`. Corre en **dos modos**: con la
   forma vieja de `billing-job-actions` puesta se pone en rojo por los dos
   sitios, y con la nueva pasa. Sin el modo roto no se sabe si se arregló la
   causa o algo parecido.

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

Se cambió a `justify-start`, y eso arregló los bordes y dejó el otro medio
fallo dentro. Está contado entero en la sección de abajo.

### Y `justify-start` amontona TODO el sobrante en el último hueco

El #815 dejó la fila con los dos bordes a 0 px —medido, y era cierto— y aun así
se leía descuadrada: la flecha del final parecía no llegar al borde y los
huecos entre pastillas no eran iguales. **Las dos cosas son el mismo fallo.**

La fila eran **dos cajas**: un grupo `flex-1` con las pastillas dentro, y la
flecha fuera. Ese grupo se lleva todo el ancho sobrante, y con `justify-start`
sus pastillas se apilan a la izquierda: **el sobrante entero cae en un solo
sitio**, el hueco que queda entre la última pastilla y la flecha. Medido sobre
la página servida, con el menú lateral abierto y cerrado:

| variante | ventana | huecos de la fila |
| --- | --- | --- |
| 4 pastillas, cuenta grande | 1440 | 4/4/4/**4** |
| 4 pastillas, conteos normales | 390 | 4/4/4/**24** |
| 3 pastillas (sin «Mías») | 1440 | 4/4/**76,7** |
| 3 pastillas (sin «Mías») | 390 | 4/4/**91,7** |
| 4 pastillas, sin insignias | 1440 | 4/4/4/**85** |
| 4 pastillas, sin insignias | 390 | 4/4/4/**100** |

De dieciséis combinaciones —cuatro juegos de contadores por cuatro anchuras—
**catorce tenían los huecos desiguales**. Y solo se ve con la fila holgada: con
la cuenta más grande no sobra nada, los cuatro huecos salen a 4 px y parece que
está bien. **Probar con la cuenta llena es justo el caso que no lo reproduce.**

> **La regla: la flecha es una MÁS de la fila, y el sobrante se reparte con
> `justify-between`.** Una sola caja, la flecha como hermana de las pastillas.
> Así el hueco que la separa de la última pastilla es el mismo que hay entre dos
> pastillas, y el `gap-1` pasa a ser el **mínimo**: cuando no sobra nada son 4
> px, y cuando sobra se reparte por igual.

Y **no es volver a `justify-evenly`**, que es lo que el #815 quitó y lo que
cuenta la sección de arriba: aquel pone hueco **antes de la primera y después
de la última**, así que despega la fila de los bordes. `justify-between` no
pone nada en los extremos. La diferencia entre los dos es exactamente esa, y es
la única razón por la que uno vale aquí y el otro no.

Medido después, las mismas dieciseis combinaciones: **los huecos son iguales en
las dieciséis**, los dos bordes siguen a 0 px, ninguna pastilla se corta y
**las dos filas de la cabecera** —la del buscador con sus iconos y la de las
pastillas— empiezan y acaban en el mismo píxel a 1440, 1280, 1024 y 390.

Lo que **no** se toca es la reserva del #815: con la cuenta grande a 1024 las
pastillas siguen cediendo su relleno de forma desigual (`4+4 3+3 3+3 2+2`). Eso
es a propósito y es lo que evita el corte —`flex-shrink` reparte el faltante en
proporción al tamaño de cada una, así que la grande cede más—; solo entra en
juego cuando la fila va de verdad llena, y la alternativa es una pastilla
partida.

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

## Chats: la barra de la lista se QUEDA; el ancho sale de las pastillas

«La fila de pastillas no llega al filo derecho y las etiquetas se caen a otra
línea con sitio». Medido en Chromium **con barras de verdad**: la fila sí
llegaba al borde de su tarjeta; lo que se comía el ancho era la barra de
desplazamiento de la lista, que con barras clásicas (Windows, Linux) ocupa
10 px aunque su pista sea transparente. Con ella, a 1024 la fila tiene 314 px y
«Descartado» + «Asignar» + tres contadores + etiquetas pedía ~326.

El #915 lo arregló **escondiendo la barra**, y se deshizo: la lista de Chats
enseña su barra como todas las listas de la plataforma, **no es la excepción**.
`LISTA_DE_CHATS` (`lib/lista-de-chats.ts`) vuelve a ser
`flex-1 overflow-y-auto p-1`.

> **El ancho se recupera en las pastillas: cada una pierde 2 px de relleno por
> lado, la MISMA cantidad todas** (`lib/pastillas-de-la-fila.ts`): `px-2` →
> `px-1.5`, `px-1.5` → `px-1`, `px-1` → `px-0.5`. Estado, «Asignar» (con su
> palabra y su icono), los contadores, las notas, la cita, la espera y las
> etiquetas. Ni el texto, ni el alto, ni los colores, ni el orden cambian.

Tres cosas que hay que mantener:

1. **Parejo, no a ojo.** Quitarle más a una que a otra deja una pastilla más
   apretada al lado de otra holgada, y la fila pierde la simetría que se vino
   a ganar.
2. **Solo en la fila de Chats.** `LeadStatusBadge`, `FlowListOrder` y
   `SeguimientoBadge` se pintan también en el CRM y en `/sessions`: llegan con
   `compacta` y fuera de aquí conservan su relleno. `AdvisorAssignBadge` con
   `size="sm"` solo lo usa esta fila.
3. **Hasta dónde llega**: con contadores de una cifra cabe en una línea a
   1440, 1280 y 1024, con la ficha abierta y cerrada. Con **tres contadores de
   dos cifras a 1024** pide ~325 px y hay 314: no cabe ni con esto, y el banco
   solo comprueba que esa caída es honrada. Meterlo exigiría quitar otro px por
   lado (y «Asignar» quedaría con 1 px) o tocar tamaños.

Lo prueba `scripts/banco-pastillas-de-la-fila.sh`, en Chromium **sin
`--hide-scrollbars`** (Playwright esconde las barras por defecto y entonces
este caso no existe), a 1440/1280/1024 × ficha abierta y cerrada × una y dos
cifras. Mide el relleno, el alto y la letra de cada pastilla contra una tabla.
`MODO=roto` pinta la MISMA lista con las pastillas de `ANTES_REF` —un árbol de
git aparte— y afirma la tabla de antes y la caída de las etiquetas a 1024.

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
   cuenta; sin línea, todas.

Dos líneas de la **misma** cuenta comparten etiquetas: `Tag` no tiene columna de
línea, y añadírsela es otro frente (la tabla la toca el backend, ver el #360).

Lo prueba `scripts/banco-etiquetas-de-la-linea.sh`, contra Postgres y con las
acciones de verdad, en dos modos: el roto corre el camino viejo y afirma que la
conversación de Atención ofrecía las de la madre y el servidor las rechazaba.

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

### Y desplazarse NO basta: lo de dentro tampoco puede ENCOGER

Con `overflow-x-auto` a secas la barra seguía partiéndose, y esto se ve
midiendo. En `/proyectos`, con el menú lateral abierto, pasaba de **40 px a
62 px** en cinco de las ocho combinaciones de ancho:

| ventana | menú | antes | ahora |
| --- | --- | --- | --- |
| 1440 | abierto | 40 | 40 |
| 1280 | abierto | **62** | **40** |
| 1024 | abierto | **62** | **40** |
| 390 | abierto | **62** | **40** |
| 1440 | cerrado | 40 | 40 |
| 1280 | cerrado | 40 | 40 |
| 1024 | cerrado | **62** | **40** |
| 390 | cerrado | **62** | **40** |

El motivo es que **un carril que se desplaza no impide que lo de dentro se
comprima**: sus hijos siguen siendo hijos de un flex con el ancho del carril,
así que primero encogen —y lo que lleve un `flex-wrap` dentro se parte en dos
líneas— y solo después desbordan. Por eso hacen falta **las dos** cosas:

1. **La fila de dentro no encoge**, con `min-w-max`. Y es `min-w-max` y **no
   `w-max`**: con `w-max` la fila mediría siempre su contenido, y entonces un
   `ml-auto` —el que usa Conexión para empujar sus pastillas a la derecha—
   dejaría de tener hueco que repartir. Con `min-w-max` la fila se sigue
   estirando hasta el carril cuando sobra sitio, y solo deja de encoger cuando
   falta.
2. **Y si no cabe, se desplaza con FLECHAS**, las mismas de la barra de
   pestañas (`BarraDeslizable`, que ahora lo usan las dos). Antes el carril iba
   con `scrollbar-hide`, así que lo que sobraba —32 px en `/proyectos` a 1024,
   **566 px** en `/equipo` a 390— **no tenía ni barra ni flecha**: no había
   forma de enterarse de que había más. Es literalmente el fallo que ya costó
   una vuelta en las pestañas del panel, repetido una capa más abajo.

Las flechas dicen **qué** hay dentro (`queHay`): «Ver más filtros» en esta
barra y «Ver más pestañas» en la otra. Una etiqueta que habla de pestañas sobre
un buscador es una etiqueta que miente.

**Esto NO se aplica a la fila de pastillas de Chats**, que va aparte y con su
propia regla —ahí lo que cede son los huecos de la pastilla— y no pasa por esta
barra.

#### Y entonces `w-full` y `flex-1` dejan de valer dentro de la barra

Es la consecuencia que hay que conocer antes de tocar una de estas pantallas:
en una fila que ya no encoge, **el ancho de la fila lo decide su contenido**,
así que un hijo que pide el 100 % pide el 100 % de una fila que puede ser mucho
más ancha que la pantalla. Medido en `/proyectos` a 390: el buscador
`relative w-full sm:w-72` se quedaba con **647 px de los 1006** de la fila, el
grupo de desplegables se comprimía a 159 y **se partía en dos líneas**, y la
tira de carpetas —`min-w-0 flex-1`— se quedaba en **0 px**: las carpetas
desaparecían enteras.

Dos reglas, y las dos se comprueban midiendo un ancho de teléfono:

1. **El buscador lleva un ancho fijo** (`w-56 sm:w-72`), no `w-full`. Son las
   trece pantallas que lo tenían; las dos que escriben su fila a mano —Llamadas
   del CRM y el catálogo público— se quedan como estaban, que no pasan por
   aquí.
2. **Nada `flex-1` dentro de la barra.** No hay hueco que repartir, así que
   `flex-1` con `min-w-0` se queda en cero y lo que hubiera dentro desaparece
   sin decir nada. Y ya no hace falta: lo que crece —las carpetas— lo recoge el
   carril de la propia barra.

### El buscador es un hueco APARTE: la flecha mueve las pastillas, no la fila

El buscador vivía dentro de `filtros`, o sea **dentro del carril que se
desplaza**. Así que la flecha corría la fila **de punta a punta**: en una cuenta
grande, empujar para ver la última pastilla se llevaba el buscador fuera de la
pantalla. Y el buscador no es un mando más de la fila — es el que se usa en cada
visita, así que no puede irse de sitio.

> **La barra son TRES zonas y solo la del medio se mueve**: el buscador fijo a
> la izquierda (`buscador`), las pastillas en el carril (`filtros`), y el azul
> con el `⋯` fijos a la derecha. Es lo que los dos extremos de la derecha ya
> hacían, aplicado también al de la izquierda.

Medido en Chromium sobre el CSS del build, en `/panel/clientes` con seis
pastillas y contadores de una cuenta grande. «Carril» es lo que se desplaza:

| ventana | menú | antes | ahora |
| --- | --- | --- | --- |
| 1440 | abierto | **106 px, con el buscador dentro** | 0 |
| 1280 | abierto | **266 px, con el buscador dentro** | 0 |
| 1024 | abierto | **522 px, con el buscador dentro** | **143 px, solo pastillas** |
| 1024 | plegado | 314 px | 0 |
| 390 | — | 147 px | 0 |

El alto sigue siendo **40 px en las siete combinaciones**, antes y después: esto
no le quita ni le añade una fila a la tabla, solo cambia qué se mueve.

### Y son CINCO huecos: `children` no coloca nada, así que el orden lo decidía el JSX

En `/sessions` la barra abría con **las cuatro pastillas de conteo delante del
buscador** —cuatro ceros y el buscador escondido detrás de ellos— y con
«Exportar CSV» **suelto en medio**, entre el buscador y el azul.

La ley estaba escrita y el componente la cumplía. Lo que fallaba es de una
línea: la pantalla lo metía todo por `children`, y **`children` y `left` caen
ENTEROS en el carril del medio**. Ahí dentro manda el orden en que esté escrito
el JSX, no la regla. Los dos síntomas salen de ahí:

| lo que se veía | qué era |
| --- | --- |
| las pastillas antes del buscador | se escribieron antes en el JSX |
| «Exportar CSV» en mitad de la fila | no es un filtro y no tenía hueco propio |

> **La barra son CINCO huecos y el orden en que se pintan ES la regla:**
>
> ```
> [buscador] [·· filtros ··················] [secundarias] [+ Nuevo] [⋯]
>             ^ lo único que se desplaza
> ```
>
> Y en qué hueco va cada cosa lo decide **lo que HACE el mando**, no dónde
> quedaría bonito: `filtros` es lo que acota la lista, `secundarias` lo que se
> hace sobre la lista entera sin acotarla —exportar, columnas, refrescar—,
> `crear` el único botón que añade una fila.

`secundarias` es el hueco que faltaba. Sin él, «Exportar CSV» solo tenía dos
sitios malos: el carril —donde queda suelto en medio— o dentro de `crear`,
metido en un `<div>` con el azul, que es lo que hacían otras cuatro pantallas.

Y **`ModuleToolbar` reenvía los cinco**: mientras no lo hiciera, una pantalla
que lo usara no podía sacar su buscador del carril por mucho que la ley lo
dijera.

#### Y el buscador es el único fijo que CEDE

Esto lo cazó medir, no leer. Con los cuatro huecos fijos en `shrink-0`, a 390 px
el buscador (224) más «Exportar CSV» (119), el azul (40) y el `⋯` (40) con sus
huecos suman **447 px en una caja de 358**: la página pasaba a desplazarse a lo
ancho. Antes no pasaba porque todo eso vivía en el carril.

Dos cosas, y hacen falta las dos:

1. **El hueco del buscador va `min-w-0` y no `shrink-0`.** Así se estrecha antes
   que desbordar — y con sitio de sobra no cede nada, porque el carril se lleva
   el hueco primero: medido, mantiene sus **288 px a 1440, 1280 y 1024**.
2. **Y una acción secundaria con palabra se queda solo con su icono en el
   teléfono**, como ya hace `BotonDeCrear` con su «+». Son 80 px, y el ancho es
   lo único que escasea ahí.

#### Medido en Chromium, sobre el CSS del build

Los mandos de `/sessions` con los contadores de una cuenta grande, con el menú
lateral abierto. `@` es a cuántos píxeles del borde izquierdo de la barra:

| ventana | | alto | buscador @ | Exportar @ | + Nuevo @ | `⋯` @ | ¿el buscador se desplaza? | desborda |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | antes | 40 | **475** | 969 | 1002 | 1112 | **sí** | no |
| 1440 | ahora | 40 | **0** | 856 | 1002 | 1112 | no | no |
| 1280 | antes | 40 | **475** | 969 | 842 | 952 | **sí** | no |
| 1280 | ahora | 40 | **0** | 696 | 842 | 952 | no | no |
| 1024 | antes | 40 | **475** | 969 | 586 | 696 | **sí** | no |
| 1024 | ahora | 40 | **0** | 440 | 586 | 696 | no | no |
| 390 | antes | 40 | **475** | 905 | 270 | 318 | **sí** | no |
| 390 | ahora | 40 | **0** | 224 | 270 | 318 | no | no |

El alto es **40 px en las ocho**, el `⋯` queda pegado al borde derecho y
«Exportar» cae siempre justo antes del azul. Las dos columnas que contestan el
encargo son la del buscador —de 475 px metido entre las pastillas a 0 px y
fijo— y la última, que es la que estuvo a punto de romperse al arreglarlo.

#### Y lo mismo pasaba en otras once pantallas

No era `/sessions`: era el patrón. Barridas las treinta y seis que usan la
barra, el buscador estaba **dentro del carril** en `/crm`, Respuestas rápidas,
los dos Datos externos, los dos Plantillas, los dos Módulos y Clientes del
admin —donde además iba **detrás de la casilla de «todos»**—; y había una
acción secundaria suelta en el carril en las tres tablas de Finanzas, en los dos
Datos externos y en Clientes del admin («Columnas», en todas).

Cuatro pantallas más llevaban una secundaria **dentro de `crear`**, metida en un
`<div>` con el azul: el refrescar de Tareas y el de las dos de formularios de
reserva, la ventana de seguimiento de Flujos y el contador de plan más «Ver
catálogo» de Productos. Se ven bien —el orden dentro de ese `<div>` era el
correcto— pero entonces `crear` deja de ser «el único botón que añade una fila»
y la regla se lee mal la próxima vez.

> **Lo comprueba `lib/__tests__/barra-de-acciones.test.mjs`, y son dos mitades:**
> que el componente pinte los cinco huecos en orden —leyendo los `data-zona` del
> marcado, no el comentario de arriba— y un **barrido de las treinta y seis
> pantallas** que falla si alguna mete en el carril un buscador, una acción
> secundaria o un `flex-1`. La primera mitad sola no habría cazado nada de esto:
> el componente estaba bien.

El barrido **quita los comentarios antes de mirar**, que es el detalle que lo
hacía fallar al escribirlo: casi todas esas pantallas llevan escrito al lado por
qué el buscador ya no está ahí, y buscarlo sobre el texto crudo hace que la
explicación del arreglo tumbe al banco que lo protege.

### Lo que casi nadie toca va al `⋯`, y el `⋯` acepta un `menu`

`/panel/clientes` llevaba en la barra tres mandos que entre los tres se comían
unos 300 px: el **campo del buscador** (empresa / nombre / correo / marca), el
**estado del servicio** y **«Columnas»**. La regla de esta barra ya decía dónde
van —*un botón que gasta ancho y no se usa a diario va dentro del `⋯`*—; lo que
faltaba era el hueco donde meterlos, y por eso `AccionesMasivas` tiene ahora un
`menu`.

La barra se queda en **cuatro cosas y ninguna más**: buscador, pastillas, el
azul y el `⋯`.

Cuatro cosas que hay que mantener:

1. **El campo elegido se lee en el `placeholder`.** Mover el campo a un menú
   escondido sin eso sería un buscador que a veces no encuentra lo que tienes
   delante y no dice por qué. Y por el mismo motivo el campo por defecto pasa a
   ser **nombre**: era `company`, y encima su selector iba `hidden sm:flex`, así
   que en un teléfono **no existía** y la pantalla buscaba por empresa sin
   decirlo.
2. **Cambiar de campo CONSERVA lo escrito.** Antes lo vaciaba, y cambiar de
   campo casi siempre es «esto que ya tecleé, búscalo por lo otro».
3. **Cada mando trae su propio submenú.** «Columnas» es una lista que crece con
   la tabla: suelta dentro del menú de arriba empuja fuera de la pantalla lo que
   va al final, que es justo el fallo que ya costó una vuelta en el menú de
   Acciones de Chats.
4. **Y las casillas de «Columnas» no cierran el menú** (`preventDefault` en su
   `onSelect`): enseñar tres columnas serían tres viajes al `⋯`.

El **estado del servicio** sigue naciendo en «Activos» —eso no cambia— y lo que
se fue al `⋯` es la forma de ver todos o los inactivos. La pastilla «Activos»
se queda en la barra, que es una pastilla de filtro y enseña su número.

### Finanzas: el resumen también pasa por la barra

`/dashboard/finance` se había escapado del barrido, y tenía sus tres mandos en
tres sitios distintos: el **botón azul** metido en la esquina de la fila de
pestañas, el **selector de cuentas** suelto en su propia línea, y **«Vaciar
contabilidad»** como un enlace gris al final de la página. Ningún buscador.

Ahora es la fila de siempre, medida en las siete combinaciones: **40 px**, el
buscador a 0 px del borde izquierdo, el azul a 48 y el `⋯` pegado a 0.

Dos cosas que hay que mantener:

1. **Arriba van SOLO las pestañas.** El azul salió de `FinanceModuleShortcuts`,
   que es la fila de accesos del módulo. Las pantallas de Ventas y Gastos no se
   quedan sin él: cada una ya tenía el suyo en su propia barra.
2. **Y el buscador NAVEGA, a propósito.** Esta pantalla no tiene una lista
   debajo —tiene el resumen anual y la gráfica—, así que un buscador que
   filtrara «lo de abajo» no tendría qué filtrar, y **un mando que no hace nada
   es peor que no tenerlo**. Lo que sí se busca desde aquí es un movimiento, así
   que lleva a Ventas con el texto ya puesto en su buscador (`?q=`): aterriza
   **filtrado**, no en la lista entera. Y sobre **todas** las ventas, no sobre
   el mes que se estaba mirando —Ventas abre en su pestaña «todas»—, porque
   acotarlo al mes daría «sin resultados» sobre algo que sí existe.

Y `WipeFinanceButton` pasó a ser `VaciarContabilidad`, **solo el diálogo**: el
botón lo pone el `⋯`, como el resto de los borrados en bloque. El diálogo vive
**fuera** del menú porque Radix desmonta el contenido de un `DropdownMenu` al
cerrarse, así que dentro se iría con él antes de que nadie pudiera escribir
«VACIAR».

### El botón azul dice «Nuevo», y nada más

Llevaba el nombre de la entidad repetido —«+ Nuevo proyecto» estando ya en
Proyectos, «+ Nueva plantilla» estando ya en Plantillas—. Son hasta diez
caracteres que no informan de nada, **porque la pantalla ya dice de qué**, y se
los quitan a la única fila que escasea, que es justo donde los filtros pelean
por sitio.

**«Nuevo» en las veintiocho pantallas, sin excepciones.** El `title` y el
`aria-label` salen del mismo `children`, así que no se pueden separar del texto
que se ve. Si algún día una pantalla necesitara un segundo botón que también
crea algo, ese no es «el botón de crear» de esa pantalla y no va en este hueco.

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

### Y la cuarta: `/equipo`, que se escapó del barrido

Abría con cuatro pastillas —conversaciones activas, nuevas esta semana,
escaladas, tasa de conversión— **encima** de la barra, y ninguna de las cuatro
filtraba nada. Lo decía su propio código: `// Sin filtro equivalente en esta
pantalla: no son pulsables`. Se fueron por la misma regla con la que se fueron
las otras siete; la cifra no se pierde, porque debajo sigue el rendimiento
**por asesor**, con su exportación.

Y con eso la regla se puede decir en una frase, que es como se queda:

> **Ninguna tarjeta ni fila de métricas va en la parte de arriba de una
> pantalla. Nunca.** Si una cifra filtra la lista de abajo, entra en la barra
> como pastilla —que ahí ya no es una métrica: es el filtro, enseñando su
> número—. Si no filtra nada, **se borra**. Y si algún día hace falta enseñar
> una cifra que no filtra, va **debajo** del contenido, nunca en la cabecera.

La parte que no se puede ablandar es la última. La cabecera es la franja que le
falta a la tabla, y una cifra que solo se lee no compite por ella: se lee igual
de bien al final de la pantalla, y ahí no le quita una fila a lo que la persona
vino a mirar.

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

> Esta sección decía «**solo en `/dashboard/finance`**», y esa era la mitad
> honesta de un pendiente: se dejó fuera de las listas a propósito, con la
> condición escrita de que el día que consolidaran, el selector iría **con
> ellas**. Ya está: Ventas, Gastos, Clientes y Proveedores lo llevan, contado
> en *las cuatro listas también consolidan*. Lo que sigue explica por qué no se
> puso en la CABECERA, que es otra pregunta y sigue igual de vigente.

**El selector va en la barra de CADA lista, no en la cabecera de Finanzas.**
Puesto en la cabecera se vería en todas las pantallas del módulo, incluidas las
que no lo respetan —Cuentas, Categorías, Monedas—, y eso es un filtro que
promete algo que la pantalla de al lado no hace: el «menú abierto, puerta
cerrada» que este repositorio ya pagó en Clientes, en Equipo y en el panel. Una
pantalla que consolida lo enseña; una que no, no lo enseña.

Medido en Chromium sobre el CSS del build: el selector se topa en 256 px
(`max-w-[16rem]`) y recorta el nombre largo en las tres anchuras; la tabla del
desglose va `table-fixed` con `min-w-[34rem]` y **solo se desplaza por debajo de
768 px**, que es preferible a recortar los números que se vienen a leer. La
página no desborda a 1440, 1280, 1024 ni 390.

### Y las cuatro listas también consolidan

Ventas, Gastos, Clientes y Proveedores llevan **el mismo selector**, movido a
`components/shared/SelectorDeCuentas.tsx`. No es una copia: con cinco, el día
que se afine dónde vive la selección o cómo se lee el rótulo se afina en una y
las otras cuatro se quedan atrás — y eso no se ve como un error, se ve como que
«en Gastos el selector a veces no hace lo mismo».

Y va **dentro de `BarraDeAcciones`**, en el hueco `filtros`, no en una fila
suelta encima. Una fila propia son 40 px que se le quitan a la tabla en cuatro
pantallas, que es justo lo que la vuelta de las métricas acababa de recuperar.

> **La puerta no cambia, y por eso esto no abre nada.** Las cuatro consultas
> pasan por `lasCuentasQueSeConsultan`, que **re-resuelve** la lista que llega
> del navegador con la misma regla que pinta el selector —manda en su cuenta,
> es la MADRE de su familia, y la familia tiene más de una cuenta—. Una acción
> de servidor ES un endpoint: `getAllSales(propia, ids)` se puede llamar a mano
> con los ids que uno quiera, y lo que no alcanza se cae ahí.

De ahí salen las dos mitades que se comprobaron contra Postgres, con la malla
real dentro: **la hija ve lo suyo y nada más** —aunque escriba a mano el
parámetro con su madre y su hermana dentro— y **la madre consolida**, solo lo
de su familia. Un id de fuera se cae y no arrastra a los buenos.

**Y el camino de siempre no paga ni una consulta.** Sin parámetro
`lasCuentasQueSeConsultan` devuelve la cuenta propia sin preguntar nada, que es
la inmensa mayoría de las cargas: toda cuenta hija, todo agente y cualquiera
que no toque el selector. El banco lo prueba haciendo que preguntar quién mira
**reviente**: si alguien lo pregunta, ese caso se pone en rojo.

#### Consolidar es para MIRAR, no para editar

Es la parte que había que resolver antes de enseñar una sola fila ajena. Las
acciones de escritura de Finanzas acotan por la cuenta con la que se llaman
—`where: { id, userId }`—, así que el lápiz o la papelera sobre una fila de una
cuenta hermana contestarían **«no encontrada»**: menú abierto, puerta cerrada.

Así que una fila de otra cuenta **se ve y no se toca**, y eso son cuatro sitios
y no uno —con tres, el cuarto es por donde se cuela—:

1. La columna de acciones enseña «—» en vez del lápiz y la papelera.
2. **No se puede marcar**: `enableRowSelection` pasa a ser un predicado y la
   casilla se pinta detrás de `row.getCanSelect()`. Sin esto, «eliminar 12» se
   llevaría ocho y diría que doce.
3. El **diálogo de detalle** de Ventas y Gastos lleva dentro sus propios
   «Editar» y «Eliminar»: el grupo entero no se pinta.
4. En Contactos, la fila **abre el editor al pulsarla**, así que ese clic se
   gatea también. Un diálogo que se abre y falla al guardar es peor que uno que
   no se abre.

Y «Eliminar todas» **desaparece mientras se consolida**: esa acción acota por
la cuenta propia, así que debajo de una lista de tres cuentas prometería lo que
no hace.

Quién decide es `esDeOtraCuenta(dueñoDeLaFila, propia)`, puro, y **sin dueño no
es ajena**: se pintaría un «—» donde hay una fila perfectamente editable, y el
lápiz desaparecería sin decir por qué.

#### La columna «Cuenta» solo existe consolidando, y va la PRIMERA

Sin ella una lista consolidada es un revoltijo: veinte ventas de tres empresas
seguidas, ordenadas por fecha y sin decir de quién es cada una. Está escrita
una vez (`components/shared/ColumnaDeCuenta.tsx`) y lleva **`accessorFn`** y no
solo `cell`: sin él el buscador de la tabla no mira esa columna, y buscar por
el nombre de una cuenta es justo lo que se hace en una lista consolidada.

Va la primera porque es lo que agrupa la lectura; al final habría que recorrer
la fila entera para saber de dónde sale.

#### Las MONEDAS: la regla es la misma función, no una copia

`laMonedaDeLaSeleccion` decide, y la usan **las dos**: `consolidar` —que es
quien decide si el resumen pinta su total— y el selector. Con dos copias, una
diría que sí se puede sumar y la otra que no.

Aquí no hay ningún total que esconder: **una lista enseña cada fila en su
moneda, que es cierta**, y Ventas y Gastos no pintan ninguna suma —lo que hubo
se fue con las métricas—. Así que lo que se hace es **decirlo donde se elige**:
con monedas mezcladas el selector se pone en ámbar, con su triángulo, y explica
por qué esas cifras no se van a sumar en ninguna parte. Y el motivo **nombra
las dos monedas**: «no se puede» a secas manda a buscar un fallo que no existe.

Los contactos —Clientes y Proveedores— no llevan dinero encima, así que ahí la
regla no muerde y se dice en la acción, para que nadie la busque.

#### El tope de la lista CRECE con las cuentas

`topeDeLaLista(n)` son 200 por cuenta con techo de 1000. Sin eso, consolidar
tres cuentas enseñaría un tercio de cada una y parecería que faltan filas; y
sin el techo, una familia grande se trae miles de filas que viajan **enteras**
al navegador. Nunca cero: una lista con `take: 0` sale vacía y se lee como que
no hay nada.

#### Y el buscador salió del carril

Las tres tablas de Finanzas metían su `<Input>` **dentro de `filtros`**, o sea
dentro del carril que se desplaza. Con el selector al lado eso es exactamente
el fallo que `BarraDeAcciones` ya arregló una vez: la flecha corre la fila de
punta a punta y el buscador se va de la pantalla. Medido a 390 px con la barra
de antes, el carril sobraba 140 px **con el buscador dentro**; ahora va en su
hueco `buscador` y sobra 0.

#### Un fallo latente que salió al escribir el banco

`comoListaDeCuentas` cogía **solo `raw[0]`** de un arreglo. `searchParams.cuentas`
llega como arreglo cuando el parámetro se repite (`?cuentas=a&cuentas=b`), así
que por ese camino consolidar enseñaba **una** cuenta y parecía que el selector
no hacía nada. Ahora se juntan todos.

#### Medido en Chromium, sobre el CSS del build

42 combinaciones: seis variantes de barra —Ventas antes, con una cuenta, con
tres, con un nombre largo, y Proveedores con y sin selector— por cuatro
anchuras, con el menú lateral abierto y plegado.

| | alto | buscador | azul → | `⋯` → | ¿se va el buscador? | desborda |
| --- | --- | --- | --- | --- | --- | --- |
| **antes**, 390 | 40 px | dentro del carril | 48 | 0 | **SÍ** | no |
| **ahora**, las 42 | **40 px** | x=0, fijo | 48 | 0 | **no** | no |

La barra mide 40 px en las cuarenta y dos, el azul queda a 48 px del borde —el
ancho del `⋯` más su hueco— y el `⋯` pegado a 0. Con el nombre de cuenta más
largo a 1024 el carril sobra 218 px y **se desplaza con flechas**, que es lo
que hace esta barra desde el #815; lo que no pasa en ninguna es que la barra
crezca de alto ni que el buscador se pierda.

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
  WhatsApp escribe **0 siempre**.
- Lo que la bandeja llama «sin leer» sale de cruzar el `unreadCount` del
  proveedor con las marcas de `seenMessages`, que son del **navegador**
  (`localStorage`, `hooks/chats/useSeenMessages`). Ni una está guardada aquí.

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


## La llamada del directo nace en VOZ o en VIDEO, y se SUBE solo si el otro acepta

Dos fallos de la misma ventana, reportados juntos:

| lo que se veía | lo que era |
| --- | --- |
| al ampliar, el botón de plegar «desaparecía» y la tarjeta quedaba grande | iba `absolute` en la esquina de la tarjeta, y con imagen esa esquina es el **video**: un botón fantasma de icono oscuro encima de un recuadro casi negro |
| compartir pantalla en una llamada de voz | los mandos eran una lista fija, sin modo |

> **Qué mandos tiene una llamada lo decide `losMandosDeLaLlamada`
> (`lib/modo-de-la-llamada.ts`, puro), no la pantalla.** En voz: micro, *subir
> a video* y colgar. En video: micro, cámara, pantalla y colgar. Compartir
> pantalla **no se pinta en voz, ni apagado**.

Cinco cosas que hay que mantener:

1. **El modo es de la LLAMADA y lo manda el servidor**: `llamadas_de_voz.modo`
   y `videoPedidoPor`, con `ADD COLUMN IF NOT EXISTS` (la tabla ya está en
   producción). Las filas de antes quedan en `voz`, que es lo que eran.
2. **Subir a video es PEDIR.** Nadie enciende la cámara hasta que el otro
   acepta, y **quien pidió no puede aceptárselo a sí mismo**: lo impide el
   `WHERE "videoPedidoPor" <> quien contesta`, no la pantalla. Una petición
   del otro **despliega la ventana** —plegada, la pregunta no se vería— y un
   rechazo **se dice** a quien pidió («prefiere seguir solo con voz»).
3. **Subir no corta nada**: audio y video se negocian en `sendrecv` desde la
   primera oferta, así que pasar a video es encender la cámara dentro de la
   MISMA conexión. Ni otra oferta, ni otra fila, ni un segundo de silencio.
4. **Una videollamada arranca con la cámara encendida** (`arrancar(true)`) y
   suena como «Videollamada entrante». Se elige en el menú del teléfono de la
   cabecera del directo (Llamada de voz / Videollamada): un menú, no un segundo
   botón, como el de Chats. El directo la anota como «Videollamada · 3:07».
5. **Plegar va en su fila, no flotando**: el extremo derecho de la fila de
   arriba, **en el mismo píxel** que el de ampliar en la pastilla (7 px del
   borde derecho, 5 del de arriba). Plegar y ampliar son un gesto de ida y
   vuelta, así que el botón no cambia de sitio. Por eso la pastilla —que usa
   también la llamada de WhatsApp— lleva ampliar **el último**.

Lo prueba `scripts/banco-llamada-de-equipo.sh`: la regla sin navegador, y
**dos Chromium** con cámara y micro falsos, WebRTC de verdad entre los dos y las
acciones de verdad contra Postgres —cada página con su sesión, por
`AsyncLocalStorage`, porque las dos se cruzan—. `MODO=roto` monta la ventana,
la pastilla y el oyente de `ANTES_REF` y afirma los dos fallos.

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

**El enlace de una sala de CANAL caduca siempre.** La duración sale de una
lista cerrada (`DURACIONES`), y lo que no encaje cae en la de por defecto
—**nunca en «no caduca»**: equivocarse hacia un día de más es un enlace que hay
que revocar a mano; equivocarse hacia el infinito es un enlace que nadie sabe
que sigue abierto.

> Lo de «siempre» dejó de ser literal, y conviene saber **dónde exactamente**:
> una reunión de la CUENTA sí puede no caducar, y solo si la abre quien la
> administra. El porqué —y por qué el diálogo de un canal sigue sin ofrecerlo—
> está en *«No caduca» es para un enlace fijo, y solo lo pone quien administra*.

Y **revocar echa a quien esté dentro**, en la misma transacción:
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

## Reuniones: un módulo de la CUENTA, y la sala se soltó del canal

Una sala nacía **siempre dentro de un canal** del chat de equipo:
`salas_de_video.canalId` era obligatorio y crear una exigía pertenecer a ese
canal. Eso ata Reuniones a que la cuenta tenga el chat de equipo montado y deja
fuera el caso más normal —«ábreme una sala para el cliente de las tres»—, que
no es de ningún canal.

Ahora `canalId` es **opcional** y hay dos clases de sala, con **dos
pertenencias distintas**. Esa es la pieza que hace que esto no afloje nada de
lo que ya había:

| la sala | de quién es | quién entra directo |
| --- | --- | --- |
| **con canal** | del canal | quien pertenece al canal — *exactamente como antes* |
| **sin canal** | de una cuenta | quien alcanza esa cuenta por su **familia** |

> **Y la lista enseña SOLO las salas sin canal** (`canalId IS NULL` en la
> consulta, no en el navegador). Si trajera también las que nacieron en un
> canal, alguien que no está en ese canal las vería —y con ellas su enlace— sin
> haber pertenecido nunca a él. Sería ensanchar la puerta del chat de equipo
> desde una pantalla que no habla de canales, y en silencio. Vale igual para el
> histórico.

Lo pregunta **una sola función**, `perteneceALaSala`, que ramifica por
`sala.canalId`: una sala de canal va por `elCanal` (igual que antes), y una sala
sin canal por `esDeMiCuenta` **o `esDeMiFamilia`**. Lo preguntan tres sitios
—abrir el enlace, cada vuelta del reloj de la sala y la puerta—, y con la
condición copiada en los tres, el día que una de las dos ramas se afine los
otros dos se quedan atrás. Aquí eso no se ve como un error: se ve como alguien
que entra a una reunión a la que no debía, o como alguien que no entra a la
suya.

### La columna se hizo opcional con `DROP NOT NULL`

`ALTER TABLE … ALTER COLUMN "canalId" DROP NOT NULL`, **no** reescribiendo el
`CREATE`: la tabla ya está en producción y un `CREATE TABLE IF NOT EXISTS` no
toca una que ya existe. Es el mismo camino por el que `task_alerts.taskId` se
hizo opcional para las menciones del chat de equipo, y `DROP NOT NULL` no se
queja si ya está quitado, así que se repite en cada arranque sin ruido.

Comprobado contra Postgres **sobre el esquema de hoy** —`canalId` obligatorio y
una sala de canal dentro—: la fila vieja sobrevive intacta y sigue saliendo en
su canal. Sembrar el esquema nuevo habría probado el `CREATE`, no la migración.

### Quién puede abrir una reunión: PARTICIPAR BASTA, también un `agente`

Es la decisión de esta etapa y conviene que esté escrita con su motivo, porque
lo cómodo era pedir `canManageWorkspace` y está mal por tres cosas:

1. **Sería quitarles algo que ya tienen.** Hoy cualquiera que pertenezca a un
   canal —agentes incluidos— abre reuniones ahí. Un módulo que «existe por sí
   solo» no puede ser un recorte de lo que ya se podía hacer.
2. **Abrir una sala no gasta ni destruye nada.** Lo peor que produce es un
   enlace que deja **llamar a la puerta**; entrar lo decide alguien que ya está
   dentro. No es la clase de acción que este documento reserva a quien manda
   —repartir módulos, borrar cuentas, tocar la facturación—.
3. **Es el mismo reparto de siempre**: *un `agente` participa, no manda*. Abrir
   su propia reunión es participar.

Lo que sí es de quien manda es **tocar la sala de otro**: revocar el enlace o
moverle la caducidad lo pueden el **anfitrión y quien administra la cuenta**
(`puedeAdministrarLaSala`). Esa segunda mitad es nueva y hace falta: sin ella,
una sala abierta por alguien que ya no está en el equipo **no la cierra nadie
nunca** y su enlace sigue dejando llamar a la puerta hasta que caduque solo. Es
la misma decisión, tomada a propósito, que deja al administrador leer los
directos de su cuenta: una herramienta de trabajo, no un cajón privado.

**Y el alcance se pregunta a la fila EFECTIVA, nunca a la persona.** A una
cuenta se llega por **dos caminos** y solo uno deja rastro en la fila:

| cómo se llega | qué trae la fila efectiva |
| --- | --- |
| `owner_id` —alguien del equipo— | `ownerId` puesto: la cuenta es esa |
| `linked_accounts` —una cuenta vinculada— | **sin `ownerId`**: la cuenta es ella misma |

Resolver aquí la persona es exactamente lo que rompió la cartera de clientes en
el #783: por el segundo camino la fila de quien entra no cuelga de nadie y no
tiene `advisorRole`, así que preguntar por la persona devolvía su propio id con
rol `user` y el alcance salía vacío. `canManageWorkspace` ya cubre los dos —sin
`ownerId` es dueño de su cuenta; con él, mira su `advisorRole`—.

### La lista cruza la FAMILIA, y cada sala dice de quién es

`/reuniones` empezó leyendo por `cuentaId` pelado —cada cuenta veía solo lo
suyo—. El problema real es de todos los días: el superadministrador y los
administradores trabajan sobre **varias cuentas vinculadas** (la madre Carlos
Arcos, con Verzay Ventas y Verzay Atencion colgando), y para entrar a la sala de
una hija había que **cambiarse de cuenta primero**. Incómodo y constante.

> **Ahora lista las salas de TODA la familia alcanzable por la fila efectiva de
> quien mira.** Se resuelve con `laFamiliaDeLaCuenta` —la malla del #812, en los
> dos sentidos y con ciclos— y se acota con `= ANY(familia.cuentas)`. La madre
> ve las de las tres cuentas; una hija, las que su familia alcanza; **alguien de
> fuera de la familia, ninguna** —el `= ANY` no deja pasar más por más ids que
> se manden—. Vale igual para el histórico.

Esto **no contradice** que Reuniones sea un módulo de cliente: una cuenta
cliente **sin vinculadas** tiene una familia de una sola cuenta, así que ve solo
lo suyo, exactamente como antes. Lo que cambia es que una familia de verdad deja
de estar partida en pantallas separadas.

Cuatro cosas que hay que mantener:

1. **Firmar sigue yendo con la PERSONA, alcanzar con la familia de la fila
   efectiva.** Entrar a la sala de una hija te mete con TU nombre (Carlos Arcos,
   Yair Silvera), no con el de la cuenta: `entrarConCuenta` firma con
   `yo.personaId`. La familia solo decide el ALCANCE —quién ve y quién entra—,
   que es la regla de siempre.
2. **Cada sala baja a qué cuenta pertenece** (`cuentaNombre`, con
   `nombreDeLaCuenta` y no `company` a secas, que nace «Empresa Demo»). La
   pantalla pinta la insignia **solo cuando la familia tiene varias cuentas**
   (`variasCuentas`): en una cuenta sola sería repetir su nombre en cada fila.
3. **Moderar y grabar una sala de OTRA cuenta lo puede solo la MADRE.** Es la
   parte que no se afloja: `puedeAdministrarLaSala` da la sala propia a quien
   administra su cuenta, pero una sala de una hermana **solo** a la raíz de la
   familia (`familia.raiz === yo.cuentaId`). Un administrador de una hija
   participa en la reunión de otra, pero no la corta ni la graba: su rol es en su
   cuenta, no en la de al lado. Es el mismo reparto que Finanzas de la familia
   —*manda la cuenta MADRE*—. Y el módulo de grabación es de la cuenta **dueña**
   de la sala, no de la de quien mira.
4. **La familia se resuelve una vez por vuelta y se reparte.** El reloj de la
   sala (`quienEsEnLaSala`) la resuelve **solo cuando la sala no es de mi propia
   cuenta** —el camino común no paga nada— y la pasa a `perteneceALaSala` y a
   `puedeAdministrarLaSala`, en vez de volver a pedirla en cada botón cada 2 s.

**El enlace público para invitados sin sesión no cambia**: sigue cayendo en la
puerta y entrando cuando alguien de dentro abre. La familia solo toca a quien
tiene sesión.

### Y la ruta no se monta: la puerta va en la acción

`/reuniones` entra en `navigationRoutes` y **no se monta en ningún módulo**: se
asigna a mano, como `/cobros`, `/chat-equipo` y `/documentos`. El guardián del
layout solo cierra rutas que sí están en algún módulo y denegadas, así que una
que no está en ninguno se alcanza escribiendo la URL. Por eso cada acción
resuelve la cuenta y la página solo pinta lo que le devuelvan.

El panel de la reunión **no se monta en esta pantalla**: `ReunionEnLaPlataforma`
cuelga del layout, así que entrar desde Reuniones y luego irse a Clientes no
corta la reunión. Desde aquí solo se le dice qué sala abrir.

### La caducidad: una semana por defecto, y se puede mover después

El valor por defecto era **un día**, y eso parecía lo prudente y era la trampa:
la reunión que se agenda se agenda **para mañana**, así que un enlace creado
esta mañana con 24 horas llega caducado a la reunión de mañana por la tarde.
Desde fuera no se lee como «elegí mal la duración»: se lee como que los enlaces
de reuniones no funcionan, y quien lo sufre es el invitado de fuera, que no
tiene forma de arreglarlo.

Pasa a **7 días**, y el techo de las que llevan fecha sube a 30 —una reunión
semanal recurrente vive más de siete—. Y **la de por defecto nunca es «No
caduca»**, aunque ahora exista: caer en un enlace permanente por no reconocer un
valor es exactamente el enlace que nadie sabe que sigue abierto.

Y ahora **se mueve sin abrir otra sala**, que es lo que de verdad arregla el
caso: la reunión se pasa al jueves y antes había que crear otra y repartir otro
enlace, con el viejo dando vueltas por los correos de la gente.

Tres cosas de mover la caducidad:

1. **Se mide DESDE AHORA**, no desde que se creó la sala. Medido desde la
   creación, alargar a «7 días» una sala abierta hace seis no daría casi nada y
   quien lo pulsa vería el enlace caducar al día siguiente sin entender por qué.
2. **Una sala CADUCADA sí se alarga** —es el caso de todos los días—, pero **una
   REVOCADA no**: alargarla sería deshacer por la puerta de atrás una decisión
   que alguien tomó, con la gente que se echó fuera ya echada. Se dice con esas
   palabras y se ofrece abrir una nueva.
3. **Lo que llega del navegador pasa por la lista** (`laDuracionQueSePuede`).
   `cuandoCaduca` ya cae en la de por defecto ante cualquier cosa, así que esto
   no protege la fecha: protege el **aviso**. Sin él, una duración que no existe
   guardaría siete días en silencio y quien lo hizo creería haber puesto otra.

### «No caduca» es para un enlace fijo, y solo lo pone quien administra

La sección de arriba decía que «No caduca» no existía, y la lista de razones era
buena: un enlace al que nadie le pone fecha es un enlace que nadie sabe que
sigue abierto. Lo que faltaba en esa cuenta es el caso que lo pedía: **un enlace
fijo de atención**, siempre el mismo, que se pega en una firma o en un mensaje
automático y que con cualquier caducidad hay que renovar y repartir otra vez
cada semana — con lo que el enlace que la gente tiene guardado deja de valer.

Existe, y lo que lo hace aceptable es **lo que había cambiado desde entonces**:

> Un enlace permanente se puede tener porque **se VE y se puede cerrar**. Sale
> en la lista de Reuniones de su cuenta, con su «Revocar» y su «Regenerar» al
> lado. El miedo de la regla vieja no era el infinito: era **no tener dónde
> mirarlo**, y esa pantalla es justo lo que la etapa uno acababa de traer.

Cinco cosas que hay que mantener:

1. **Solo quien ADMINISTRA la cuenta** (`canManageWorkspace`: dueño,
   `administrador` y superadministrador de verdad; un `agente` participa y no
   manda). Es la puerta de siempre, no una condición nueva.
2. **Y se comprueba en el SERVIDOR, en los tres caminos que reciben una
   duración** —abrir una reunión de la cuenta, abrir una en un canal y mover la
   caducidad de una que ya existe— con una sola función,
   `laDuracionQueSePuede`. Escondiendo la opción en la pantalla no se cierra la
   petición directa, y con la condición escrita en uno solo de los tres, el
   cuarto la olvida: entonces «solo quien administra» deja de ser cierto por esa
   puerta y nadie se entera.
3. **El diálogo de un CANAL sigue sin ofrecerla**, y pasa `false` a propósito
   aunque quien lo abra administre la cuenta. No es un olvido: el enlace de una
   sala de canal vive en el hilo del canal y **no sale en ninguna lista** desde
   la que revocarlo de un vistazo. Lo que hace aceptable un enlace permanente es
   poder verlo, y eso solo lo da Reuniones.
4. **`NULL` es «no caduca», no «no se sabe».** `expiraEn` se hizo opcional con
   `ALTER COLUMN … DROP NOT NULL` —la tabla ya está en producción y un
   `CREATE TABLE IF NOT EXISTS` no toca una que ya existe—, y **no** se guarda
   una fecha a cien años. Una fecha inventada es un centinela, y un centinela
   acaba impreso: es la familia del «999999999 de -1 créditos», aplicada a una
   caducidad. Comprobado contra Postgres **sobre el esquema de hoy**, con
   `expiraEn NOT NULL` y filas dentro: las que ya estaban conservan su fecha y
   la migración se repite sin quejarse.
5. **La consulta de las vivas pregunta `IS NULL OR > NOW()`**, y esa primera
   mitad no es de adorno. Medido con las dos: sin ella el enlace permanente
   **desaparece de su propia lista** —que es la pantalla desde la que se
   revoca—, y con ella salen los dos. En el histórico es al revés y sale gratis:
   en SQL `NULL <= NOW()` no es cierto, es desconocido, así que una sala
   permanente no aparece a la vez en las vivas y en las pasadas. Revocarla sí la
   mueve de una lista a la otra, así que nunca se queda sin sitio donde mirarla.

Y **regenerar** es la otra mitad, no un adorno: el día que un enlace fijo se
filtra, revocarlo deja a la cuenta sin su enlace de atención hasta que alguien
abra otro y lo reparta. `regenerarLaSalaAction` cierra el viejo y abre el nuevo
en el mismo gesto, **copiando el nombre y la caducidad tal cual estaban** — por
eso no vuelve a pedir `manda`: no se elige nada que no estuviera ya elegido, y
lo que hace es *reducir* la exposición. Primero revoca y después crea: al revés,
un fallo a mitad dejaría los dos enlaces abiertos a la vez, que es justo lo que
esto viene a evitar.

### La pantalla no se presenta a sí misma, y la lista es UNA

La primera versión abría con un `h1` que decía «Reuniones» y un párrafo
explicando qué es una sala de video; debajo, un recuadro con el nombre, **una
fila de fichas sueltas** con las duraciones y una nota al pie; y debajo de todo
eso, dos bloques apilados —«Abiertas» y «Pasadas»— cada uno con su título.

Medido en Chromium sobre el CSS del build, eso es lo que había **por encima de
la primera fila**:

| ventana | antes | ahora | recupera |
| --- | --- | --- | --- |
| 1440 | 228 px | **40 px** | 188 px |
| 1280 | 248 px | **40 px** | 208 px |
| 1024 | 248 px | **40 px** | 208 px |
| 390 | **336 px** | **40 px** | **296 px** |

En un teléfono la cabecera se llevaba **una pantalla entera** antes de la
primera reunión. Cuatro reglas, y las cuatro ya estaban escritas en este
documento para otras pantallas:

1. **Ni título ni párrafo.** Quien abre la pantalla ya sabe dónde está —lo pone
   la pestaña del módulo— y lo que hace una reunión se descubre abriendo una.
   Lo mismo con el «Se puede cambiar después…»: era una nota al pie que
   describía dos botones que están ahí al lado.
2. **La barra es `BarraDeAcciones`**, con su reparto de siempre: a la izquierda
   lo que acota la lista, a la derecha el botón azul. Y dice **«+ Nueva»**, como
   el resto de pantallas de lista, no «Abrir reunión».
3. **Las duraciones van en un desplegable pegado al botón de crear.** Eran una
   fila entera de alto para un ajuste que casi nunca se toca, y encima siempre
   visible. Dentro va también el nombre de la reunión, que es el otro ajuste de
   lo mismo; el disparador enseña la duración elegida, así que no hay que
   abrirlo para saber cuál está puesta.
4. **«Abiertas» y «Pasadas» son dos pastillas de filtro sobre UNA lista**, como
   en Cobros, en Tareas y en Clientes. Apiladas, lo que se viene a ver quedaba
   arriba y el histórico empujaba; y con veinte pasadas, las dos abiertas se
   perdían.

Y dos cosas que solo se ven midiendo:

- **Las pastillas NO son `PastillasDeMetricas`.** Aquellas van `hidden sm:flex`
  a propósito —son cifras que la lista de abajo ya contesta—, y estas dos son
  **la única forma de llegar al histórico**. Escondidas en un teléfono, las
  reuniones pasadas no existirían. Se escriben como las de Cobros, visibles en
  todas las anchuras.
- **Y a 390 el desplegable se queda solo con su icono.** Con el rótulo puesto,
  la pareja de pastillas pedía 213 px y solo tenía 184: «Pasadas» se cortaba y
  quedaba detrás de un desplazamiento horizontal que no se ve. Sin él sobran
  49 px y las dos caben enteras. Es la misma decisión que `BotonDeCrear` con su
  «+», y por el mismo motivo: en un teléfono el ancho es lo único que escasea.

Medido con el **sidebar abierto (16 rem) y plegado (3 rem)**, que es lo que de
verdad decide el ancho: la barra mide 40 px en las siete combinaciones, el botón
azul queda pegado al borde derecho (0 px) y **nada desborda a lo ancho**.

Y el desplegable es un `Popover`, no un `DropdownMenu`, por una razón que no es
de gusto: un `DropdownMenu` es modal, así que con él abierto la primera
pulsación sobre «+ Nueva» **solo lo cerraría** y habría que pulsar dos veces. Es
el mismo `onMouseDown`/`onClick` del selector de menciones, por otra puerta.

### El histórico no es una tabla nueva: son las filas que ya se llenaban solas

`sala_participantes` lleva desde el primer día guardando `entradoEn`, `salidoEn`
y `vistoEn` de cada persona, y `salas_de_video` guarda cada sala con su título y
su anfitrión. **El histórico ya estaba escrito; lo que no había era quien lo
leyera.** Por eso esto no añade ni una columna: son exactamente las filas que se
acumulaban sin que nadie las mirara, puestas delante.

> **Y el fin de una reunión NO es su `salidoEn`.** Esa columna la escriben dos
> caminos: el botón de salir y el barrido de quien deja de latir. El segundo
> **lo corre quien sigue dentro**, así que cuando la reunión acaba de la forma
> más normal —todos cierran la pestaña a la vez— no queda nadie que lo escriba y
> las últimas filas se quedan en `dentro` con su `salidoEn` en nulo **para
> siempre**. Un histórico que midiera por ahí daría esas reuniones por abiertas
> y sin duración.

Lo que sí es de fiar es **el último latido** (`vistoEn`), que se escribe en cada
vuelta del reloj pase lo que pase. Así que el fin es `max(salidoEn, vistoEn)` de
todos los participantes: el `salidoEn` cuando lo hubo —es más exacto— y el
latido cuando no.

Cuatro cosas más:

1. **Se cuenta desde que entró el PRIMERO**, no desde que se creó la sala. Entre
   crear el enlace y que alguien entre pueden pasar días, y contarlo diría que
   una reunión de diez minutos duró tres jornadas. Es lo mismo que ya hace la
   llamada de voz, que cuenta desde que se contestó.
2. **Una sala en la que no entró nadie no dura cero: no tiene duración.** `null`
   y `0` son dos respuestas distintas —«no se usó» y «se usó un instante»— y
   confundirlas es la familia de *un número que no se puede calcular no se
   sustituye por otro*. En la pantalla sale «Nadie entró · enlace caducado», que
   además explica de dónde salen las salas que se acumulan sin usar.
3. **Solo entran los que ENTRARON.** Quien se quedó en la puerta y nunca pasó no
   es un asistente: contarlo daría una reunión de cinco a la que entraron dos.
4. **Las vivas no salen en el histórico**, y las pasadas no salen arriba. Dos
   sitios para lo mismo es peor que uno.

Y la cuenta se hace **en TypeScript, no en el `GROUP BY`**: cuándo terminó y
cuánto duró son decisiones, no sumas, y viven en `lib/reuniones-de-la-cuenta.ts`,
que es puro y está probado. Escritas dentro del SQL no las prueba nadie. Son dos
consultas —las salas, y sus participantes con un `salaId = ANY(...)` una sola
vez por página—, como `lasCitasQueSiguenAhi`; una por sala serían cien.

El parámetro de días va **moldeado**: `make_interval(days => $2::int)`. Prisma
lo manda sin tipo y `make_interval` solo acepta `int`; sin el molde la consulta
cae con «no existe la función». Comprobado además cinco vueltas seguidas, que es
donde Postgres puede caerse a plan genérico.

### Y la poda: NO hace falta ninguna, con el número delante

La pregunta queda contestada, que es lo que se pedía:

- **`sala_senales` ya se poda sola** —dos minutos, una de cada veinte vueltas—
  y no cambia. Ahí sí urge: un SDP lleva dentro las IP de las dos puntas.
- **`salas_de_video` y `sala_participantes` dejan de ser basura**: son el
  histórico. Podarlas sería borrar justo lo que esta etapa viene a enseñar.

Lo que queda fuera de la ventana de 90 días **se conserva**, y el tope es de
**lectura, no de borrado**. El orden de magnitud, para que la decisión se pueda
revisar sin volver a medir: una reunión son **1 fila de sala y hasta 4 de
participante**, unos 600 bytes en total. Una cuenta con diez reuniones al día
deja ~3.650 salas y ~15.000 participantes al año, o sea del orden de **2 MB por
cuenta y año** — contra los 1,6 GB que ya pesa la base.

**Se poda el día que eso deje de ser cierto**, no antes. Y si se poda, dos
reglas: se borran **sala y participantes juntos** —media reunión en el histórico
es peor que ninguna— y **nunca dentro de la ventana que se está enseñando**.

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

## La conexión viva cuelga del LAYOUT, no de la ruta ni de la conversación

Una llamada de WhatsApp se cortaba al **cambiar de conversación** o **navegar a
otra pantalla**. No la colgaba nadie: la tarjeta `CallDialog` —que sostiene el
`RTCPeerConnection`, el micrófono, el `<audio>` y los relojes que la vigilan— se
montaba DENTRO del chat, en cuatro sitios: la cabecera (`ChatHeader`), una
burbuja (`MessageBubble`) y dos del CRM (la fila de un registro y el marcador de
Llamadas). Cambiar de conversación rehace la cabecera y navegar se lleva el árbol
de la ruta entero; en los dos casos la tarjeta se desmontaba y su `cleanup` de
desmontaje cerraba la conexión. Desde fuera: la llamada se cortaba a media frase.

> **Lo que sostiene una conexión viva cuelga del layout, y se abre por un
> evento.** `AnfitrionDeLlamada` (`components/chats/AnfitrionDeLlamada.tsx`)
> monta `CallDialog` desde `app/(root)/layout.tsx`, y los cuatro sitios que antes
> la montaban ahora **disparan `abrirLlamadaAqui(...)`**. Es exactamente lo que
> ya hacían el timbre del equipo (`OyenteDeLlamadas`) y el panel de video
> (`ReunionEnLaPlataforma`, #797), y por el mismo motivo: **un layout no se
> remonta al navegar entre pantallas del mismo grupo**, así que lo que cuelga de
> él sobrevive. La reunión de video ya estaba bien por esto mismo; la llamada se
> le había quedado en la ruta.

Cuatro cosas que hay que mantener:

1. **Se abre por un evento del navegador, no por un contexto.** Quien llama
   —una cabecera, el menú de una fila, una burbuja, el marcador— puede estar en
   cualquier pantalla; con un contexto habría que envolver media App para que un
   botón de una tabla le hablara a un panel del layout. Es el mismo patrón que
   `abrirLaReunionAqui`.
2. **Una `key` que sube en cada apertura** (`nonce`). Llamar otra vez —al mismo
   número o a otro— tiene que empezar de cero, y eso se consigue remontando la
   tarjeta: la anterior se desmonta —su `cleanup` cierra esa conexión— y la nueva
   arranca. Una llamada a la vez, como la reunión cambia de sala en vez de apilar
   dos. Sin la `key`, una segunda llamada al mismo número no re-dispara `startCall`
   (su efecto depende de `open`, que ya era `true`) y el botón no haría nada.
3. **No pinta nada mientras no hay llamada.** Estar en el layout no cuesta: ni
   `getStats`, ni micrófono pedido, ni `<audio>`. Igual que los otros dos hosts.
4. **`CallbackDialog` NO es `CallDialog`.** El marcador de Llamadas tiene los
   dos; solo la llamada de verdad se movió al layout. El de rellamada con IA se
   queda como estaba.

Y lo comprueba `lib/__tests__/llamada-sobrevive-navegacion.test.mjs`, en dos
mitades. La primera es RUNTIME con `react-test-renderer` (sin navegador): monta
una llamada y una reunión ACTIVAS, ejercita el cambio de ruta varias veces, y
comprueba que la conexión es la misma y no se cerró; el **modo roto** —el host
dentro de la ruta— reproduce el corte, que es lo que prueba que el banco cazaría
la regresión. La segunda lee el código real: que los cuatro sitios dejaron de
montar `<CallDialog>` y disparan `abrirLlamadaAqui`, que el layout monta los tres
hosts, y que la reunión sigue colgando solo del layout.

Esto **no** cubre recargar con F5: una recarga tira el árbol entero, layout
incluido, y una llamada no sobrevive a eso —ni tiene por qué—. Lo que cubre es la
navegación interna, que es donde se cortaba.

## Reuniones: TRES tamaños, y la pantalla completa se pide DENTRO del clic

De los cuatro estados de la ventana de una reunión, **dos no llegaban a donde
decían**: «maximizar» se quedaba en el panel mediano flotante, y «pantalla
completa» dejaba a la vista la barra superior y la lateral. Son dos fallos
distintos con la misma pinta —«el botón no llega más lejos»— y cada uno tenía
su causa.

### 1. El panel mediano no era un tamaño: era un escalón de más

La escala iba `pastilla → panel → maximizada → completa`, y «ampliar» avanza
**uno**. Así que desde la pastilla la primera pulsación caía en `panel` —una
ventana flotando encima del trabajo— y desde fuera eso se lee como que el botón
de maximizar no funciona.

Y ese tamaño no servía para lo que prometía: durante una reunión o se mira la
reunión o se mira otra cosa, y para lo segundo ya está la pastilla, que ocupa
una barra en vez de media pantalla.

> **Quedan tres, y cada pulsación cambia algo que se nota**: `pastilla` →
> `maximizada` → `completa`.

Y **con el panel se fue la memoria del último estado**, que es la consecuencia
que no se ve hasta contarla: de los tres, `completa` la niega el navegador sin
un gesto y `pastilla` abre una reunión que no se ve empezar, así que el
recuerdo **solo podía devolver `maximizada`** — que ya es el valor por defecto.
Una preferencia que no puede decir nada distinto de la constante de al lado no
es una preferencia: es una escritura en `localStorage` por cada gesto para
nada.

### 2. Y `requestFullscreen` fallaba por el SITIO DESDE EL QUE SE LLAMABA

Se descartaron primero las dos sospechas naturales, **midiendo**:

| se sospechaba | qué salió |
| --- | --- |
| el elemento equivocado | las cuatro combinaciones —la caja de fuera y el nodo de dentro— entran bien |
| el contenedor lo impide | un elemento en la capa superior **no lo recorta** un `overflow:hidden` ni un ancestro `fixed` |
| la cabecera `Permissions-Policy` | nombra `microphone` y `screen-wake-lock`; `fullscreen` se queda con su lista por defecto |

Lo que quedaba —y encaja con el síntoma exacto— es **desde dónde se pedía**:

```ts
// MAL: una tarea DESPUÉS del gesto
useEffect(() => {
    if (quiereLaPantallaCompleta(ventana)) void nodo.requestFullscreen?.()…
}, [ventana]);
```

Un efecto **ya no es el manejador del clic**. El navegador solo concede
pantalla completa desde un manejador de un evento de la persona, y esto
dependía de que la *activación transitoria* sobreviviera al salto de tarea.
Chromium la conserva unos segundos —medido: la petición salía **2 ms** después
del clic con `navigator.userActivation.isActive === true`— y por eso allí
«funcionaba»; donde no, la promesa se rechaza, el `catch` caía a
`alSalirDePantallaCompleta()` y la reunión se quedaba **maximizada**, que es
literalmente «no entra en pantalla completa: deja visibles la barra superior y
la lateral».

> **La regla: pantalla completa se pide DENTRO del manejador del clic, y el
> estado se mueve solo si el navegador dijo que sí.** Primero el estado y
> después la petición es lo que dejaba la ventana pintada como completa dentro
> de una página que no lo está.

Y **el `?.` era el segundo fallo, mudo del todo**: `nodo.requestFullscreen?.()`
donde el método no existe —iOS Safari no lo tiene en un elemento cualquiera—
devuelve `undefined` y no pasa absolutamente nada: ni error, ni aviso, ni
cambio. Ahora el botón **no se ofrece** cuando no la hay (`fullscreenEnabled`,
que contesta además el caso del iframe sin permiso), porque un botón que al
pulsarlo da error es peor que no tenerlo.

**Salir sí puede vivir en un efecto**, y hace falta que viva ahí: salir no pide
ningún gesto, y a `completa` se deja de querer por caminos que no pasan por el
botón —el panel se despliega solo cuando te sacan de la reunión—. Más el
desmontaje: sin eso, cerrar el panel estando a pantalla completa deja el
navegador en ese modo con la reunión ya cerrada, o sea una pantalla en negro
sin nada que la explique.

### 3. Y el `<main>` que hay que medir es el de FUERA — justo al revés que #824

`maximizada` ocupa un hueco **medido** y no restado de variables, porque el
menú tiene tres anchos y además se anima al plegarse. El #824 ya avisó de que
hay **dos `<main>`** y que `querySelector` devuelve el primero del documento;
lo que aquel arregló fue coger el de **dentro**, porque entonces maximizada
tenía que dejar ver la barra de arriba. Ahora el encargo es el contrario —tapar
la barra superior y las migas y dejar solo la barra de iconos— así que hay que
coger el de **fuera**. Medido a 1440×900 con el menú plegado:

| | top | left | alto |
| --- | --- | --- | --- |
| el de fuera (`SidebarInset`) | **0** | 48 | 900 |
| el de dentro (el contenido) | 53 | 48 | 847 |

> **La regla no es «el de dentro» ni «el de fuera»: es el que EMPIEZA donde
> tiene que empezar la caja.** Escrita como «el de dentro» —que es como se leía
> el #824— este cambio la habría cumplido y habría seguido tapando lo que no
> toca. Por eso el hook se llama `useHuecoJuntoAlMenu` y no
> `useHuecoDelContenido`: el nombre dice contra qué se mide.

Y su respaldo, cuando no hay ningún `<main>`, es **la ventana entera**: ya no
resta `--alto-de-la-barra`, porque maximizada viene precisamente a taparla.

### 4. Ni franja muerta ni raya doble, y eso se lee en los PÍXELES

La caja maximizada llevaba `border-l`. Recortando un píxel de alto de la
captura y decodificando el PNG, la costura a 1440 salía así:

| x | antes | ahora |
| --- | --- | --- |
| 46 | 236 · barra de iconos | 236 |
| 47 | 210 · **su** borde | 210 |
| 48 | **226 · nuestro `border-l`** | 9 · la reunión |
| 49 | 9 · la reunión | 9 |

O sea **dos rayas claras seguidas** contra el fondo oscuro de la sala: la barra
ya dibuja la suya, así que la nuestra sobraba. No era una franja muerta —no
había ningún hueco— pero se leía como una.

**Esto se mira decodificando el PNG, no con `getBoundingClientRect`.** Las
cajas decían `franja: 1 px` y esa cifra no distingue «un hueco de fondo» de «un
borde de alguien»; los píxeles sí.

### Medido, los tres estados y todas sus transiciones

Chromium sobre el build servido, con sesión de verdad y cámara falsa, a 1440,
1280, 1024 y 390 (este último como móvil, sin barra lateral):

| | caja a 1440 | pantalla completa |
| --- | --- | --- |
| `maximizada` al entrar | `0, 48 · 1392×900` | no |
| `completa` | `0, 0 · 1440×900` | **sí**, y el nodo es el de la sala |
| tras soltar el modo (lo que hace Escape) | `0, 48 · 1392×900` | no |
| `pastilla` | `842, 609 · 222×42` | no |
| de vuelta | `0, 48 · 1392×900` | no |

En las cuatro anchuras y en los siete pasos: **la página no se desplaza** ni a
lo alto ni a lo ancho, **no hay ninguna segunda barra de desplazamiento**, la
cabecera de la sala vuelve **entera** (49 px y sus cinco mandos) y la barra
superior de la plataforma sigue igual antes y después (53 px, el mismo texto).
Los `<video>` **siguen en el DOM con la pastilla puesta** —plegar esconde, no
desmonta—, que es lo que deja seguir oyendo la reunión.

Y una del banco: **Escape no se puede probar con `keyboard.press`**. Esa tecla
la atiende el navegador, no la página, así que en Playwright no sale del modo y
el resto de la prueba se ejecuta sobre un estado que no es el que se cree. Lo
que sí prueba lo nuestro es `document.exitFullscreen()`, que dispara el mismo
`fullscreenchange` que quien pulsa Escape — y ese oyente **es** el código bajo
prueba.

## Reuniones: volver después de un corte, y grabar lo que se dijo

Dos frentes que no se parecen en nada salvo en dónde viven.

### 1. La reunión no volvía, y eran DOS fallos con dos ventanas distintas

«Se me cayó internet un momento y no volvió» tenía dos causas, y cada una
manda en un tramo del reloj:

| cuánto duró el corte | qué pasaba |
| --- | --- |
| **menos de 21 s** (`MARGEN_EN_LA_SALA_MS`) | el servidor no te saca y el reloj vuelve solo… y **las conexiones no**: una `RTCPeerConnection` en `failed` se quedaba en el mapa, y `comoQuedaLaMalla` la cuenta como **montada**, así que nadie la volvía a abrir nunca. La sala se recuperaba y los recuadros seguían en negro. |
| **más de 21 s** | el barrido te pone en `fuera`, la vuelta siguiente contesta «Ya no estás en esta reunión», y la malla cerraba todo y se rendía. Había que pulsar «Volver a entrar» — **y un invitado no tiene ese botón**. |

Así que hacen falta **las dos mitades**: sanar las conexiones muertas y
reanudar la fila. Con una sola, el corte corto se arregla y el largo no, o al
revés — y las dos se ven igual desde fuera.

#### Volver NO es pasar otra vez por la puerta

Es la parte que no se puede ablandar. La regla de esta suite sigue igual
—«tener el enlace deja llamar a la puerta, y quien pasa lo decide alguien de
dentro»—: al volver **no se crea ninguna fila**, se reanuda la que ya había.

> **Y por eso `sala_participantes` tiene `motivoDeSalida`.** Los tres caminos
> que sacan a alguien escribían `estado = 'fuera'` y nada más, así que eran
> **indistinguibles** — y significan cosas opuestas a la hora de volver.
> `sePuedeReanudar` deja pasar **solo `silencio`**, que es el barrido, o sea
> exactamente el corte de red.

Sin esa columna, la pestaña de alguien a quien acaban de echar **se reanudaría
sola dos segundos después**, que es lo contrario de moderar. El banco lo
ejerce: en modo roto se afirma que vuelve a entrar.

Y lo que no se reconoce —una fila de antes de la columna, con `NULL`— tampoco
se reanuda: se ve de menos, nunca de más, y el botón de volver a entrar a mano
sigue donde estaba.

#### Sanar una conexión muerta NO es renegociar

Conviene decirlo porque suena a lo que este documento prohíbe. La regla de
*las pistas se negocian UNA vez* es sobre **cambiar lo que viaja** por una
conexión viva —encender la cámara, compartir pantalla— y eso sigue sin tocar
nada. Aquí lo que se hace es **tirar una conexión que ya está muerta** y montar
otra, que es lo mismo que ya pasa cuando alguien entra.

Dos reglas de cuándo está muerta:

1. **`failed` y `closed` son firmes**; de ahí no se vuelve.
2. **`disconnected` tiene gracia** (`GRACIA_DE_DISCONNECTED_MS`, 6 s). Es el
   estado dudoso de WebRTC y se recupera solo al segundo siguiente: tirarla ahí
   sería rehacer media reunión cada vez que alguien pasa por debajo de un
   puente. Es el mismo reparto de `fin-de-la-llamada` en Chats.

#### Y la tercera pieza: `desde`, que es lo que hace SIMÉTRICA la reconexión

En una malla solo ofrece uno de los dos (`debeOfrecer`). Así que cuando a
alguien se le cae la red y vuelve, **el que NO ofrece podría quedarse con una
conexión que a él todavía le parece viva**, esperando una oferta que el otro no
cree tener que mandar.

`QuienEstaEnLaSala` lleva ahora `desde` —cuándo entró **esta vez**— y la regla
se escribe sola: **una conexión montada antes de que esa persona entrara es de
una sesión suya anterior**, y se tira. Sin ella se converge igual, pero por el
camino lento: WebRTC tarda de quince a treinta segundos en dar por muerta una
conexión cuya otra punta simplemente dejó de contestar, y medio minuto de
recuadro negro después de que la reunión ya volvió no se lee como «está
volviendo».

#### Se insiste un minuto, se dice mientras, y se para

`TOPE_PARA_RECONECTAR_MS` es 60 s, y el número tiene motivo: el barrido saca a
los 21, así que un minuto deja sitio a **dos** intentos completos de reanudar.
Menos que eso y un corte de móvil al cambiar de antena se rendiría justo antes
de poder volver.

Cuatro cosas que hay que mantener:

1. **Mientras se intenta no se cierra nada.** Ni las conexiones ni la cámara:
   si el corte fue corto, lo que sigue vivo vale. Medido: con la red cortada
   los `<video>` siguen montados.
2. **Se ve en la tarjeta**, con los segundos que quedan, y también en la
   pastilla —que plegada es lo único que se ve de la reunión—. Y en el recuadro
   de cada persona: `reconectando` es una bandera **distinta** de `fallo`,
   porque `fallo` es una ruta que no existe entre dos redes y no se va a
   arreglar sola, y esto es un corte que se está resolviendo. Con una sola,
   un bache de tres segundos diría «no se pudo conectar con esta persona» y
   quien lo lea cuelga.
3. **Un «no» firme se acata al momento**, sin agotar el minuto: a quien echaron
   insistirle sesenta segundos es mentirle. Lo decide `esUnNoDefinitivo` por el
   texto del mensaje —`Respuesta` es `{success, message}` y meterle un código
   obligaría a tocar quince acciones—, y **la duda cae del lado de seguir
   intentando**, que como mucho tarda un minuto de más en decir lo mismo.
4. **Y hay un final.** Una pestaña que reintenta para siempre es un micrófono
   abierto mandando a nadie. Al rendirse se suelta todo y **se dice**.

#### Medido, con la red cortada de verdad

Chromium, dos sesiones reales, cortando la red con el navegador y leyendo la
fila en Postgres entre paso y paso:

| | la fila | la pantalla |
| --- | --- | --- |
| dentro | `dentro` | la reunión |
| red cortada, 8 s | `dentro` | «Reconectando… (55s)», los `<video>` siguen montados |
| el barrido le saca | `fuera \| silencio` | sigue intentando |
| vuelve la red | **`dentro`**, misma fila, sin motivo | la reunión, sin ningún cartel |
| le sacan | `fuera \| sacado` | «Ya no estás», y **no vuelve a entrar** |

Las dos últimas filas son el par que importa: la misma pantalla, el mismo
código, y lo único que cambia es por qué se salió.

### 2. Grabar: en el NAVEGADOR, porque no hay otro sitio

El servidor **nunca ve un fotograma** —esto es una malla directa sin servidor
de video y lo único que pasa por la base son ofertas SDP—, así que graba la
pestaña de quien pulsa: mezcla el audio de todos y, si se pidió video, dibuja
la rejilla en un lienzo.

De ahí sale lo que hay que saber antes de tocar nada: **si esa pestaña se
cierra, la grabación se acaba**. Lo subido se conserva; lo que estuviera en el
buffer, no.

#### El audio se graba SIEMPRE, aunque se pida video

Es la decisión de la que cuelga que transcribir sea un botón y no un proyecto:

- Whisper no admite **más de 25 MB** y una hora de video es del orden de **un
  giga**. Mandarle el video es imposible.
- Sacarle el audio en el servidor pediría `ffmpeg`, que este contenedor no
  tiene.
- Una hora de audio a `AUDIO_BPS` (32 kbps) son **13,7 MB**: cabe.

Así que una grabación en video produce **dos** ficheros y el pequeño es el que
se transcribe. Cuesta un 2 % más de bucket. Y el bitrate no es un gusto: a
64 kbps una hora son 29 MB y **la transcripción de una reunión normal dejaría
de caber**, que es tanto como no tenerla. El banco lo comprueba como
invariante, no como número escrito a mano.

#### Los dos fallos que solo se vieron MIDIENDO

La primera versión grababa **cero bytes** y el botón decía que todo fue bien,
que es el peor final posible. Eran dos cosas y ninguna se ve leyendo:

1. **`medios.local` excluye el audio propio a propósito** —para que nadie se
   oiga a sí mismo con retardo si algún día se le quita el `muted` al recuadro—,
   así que **quien graba no entraba en su propia grabación**. Con una sola
   persona en la sala, eso es un fichero vacío. Ahora el micrófono viaja en
   `miAudio`, un stream aparte que nadie pinta.
2. **Un `MediaStreamAudioDestinationNode` sin nada conectado no hace rodar el
   grafo**, así que `MediaRecorder` no emite ni un `dataavailable`. Pasa de
   verdad: los segundos antes de que entre el primero, o una reunión donde todo
   el mundo está callado. Se conecta un `ConstantSourceNode` con `offset = 0`
   —silencio exacto— que mantiene el grafo rodando.

Medido antes: **nueve segundos grabando, cero trozos, blob final de 0 B**.
Medido después: trozos de 4-8 KB cada dos segundos y una parte de 29 KB al
cerrar.

#### Y el tercero, que era de una línea: el id se borraba antes de vaciar

`terminar` ponía `idRef.current = null` al entrar, y `mandarLaParte` se rinde
sin id. O sea que **la última parte no subía nunca** — y en una grabación corta
esa es la única, así que se perdía entera. Lo que impide entrar dos veces es
ahora un cerrojo aparte, que además es lo que hace falta de verdad: a
`terminar` se llega desde el botón, desde el tope de tiempo y desde una parte
que falla, y las tres pueden coincidir.

#### Las partes: 8 MiB, y el suelo no es negociable

Se suben por trozos y se juntan en el servidor con `composeObject`, que por
debajo es un multipart de S3 — y ahí **toda parte menos la última tiene que
pasar de 5 MiB**. Una parte corta no falla al subirla: falla **al juntar**, con
la reunión ya grabada y la persona esperando su fichero.

Y **el número va rellenado a cinco cifras**, porque un listado de S3 ordena
como texto: sin el relleno la parte 10 iría antes que la 2 y el webm saldría
con los trozos cambiados de sitio, que no da error — solo se ve mal.

Van por **nuestra ruta** (`/api/reuniones/parte`) y no con una URL prefirmada,
que es lo que parecería más barato. Una prefirmada apunta a `S3_ENDPOINT`, que
es como el **servidor** ve el bucket, y no hay garantía de que sea como lo ve el
navegador de quien graba: si no coincidieran, la subida fallaría **solo en
producción y solo al grabar**, o sea donde nadie está mirando. El camino de
`/api/upload` es el que se sabe que funciona.

#### El aviso de que se está grabando lo pinta el SERVIDOR

No la pestaña que graba. Grabar la voz y la cara de los demás sin que se note
no es una función, es otra cosa: ocupa una franja entera en rojo, con el nombre
de quien graba, y sale de `salas_de_video.grabandoDesde` — que ya viene cargada
en la vuelta del reloj, así que no cuesta ni una consulta más.

Y son **dos marcas, no un booleano**: `grabandoVistoEn` lo refresca el reloj de
quien graba, y es lo que hace que el aviso **se apague solo** cuando esa pestaña
se cierra. Con un booleano, una reunión diría «grabando» para siempre después
de que a quien grababa se le cerrara el portátil. Es la misma forma que la mano
levantada.

El nombre va **copiado** en la sala (`grabandoPor`), como `autorNombre` en un
mensaje: sacarlo de la fila de la grabación sería una consulta más por persona
y por vuelta para enseñar un nombre.

#### Quién graba: la puerta de MODERAR, más el módulo

Grabar deja un fichero con la voz de todos los que están dentro, así que no es
participar: es mandar. Se pregunta con la **misma** función que silencia y saca
a alguien (`puedeAdministrarLaSala`), no con una condición nueva.

Encima va el módulo, que es de la **CUENTA**: la grabación se vende aparte.
`laCuentaPuedeGrabar` mira `_UserModules` contra la ruta
`/reuniones/grabaciones`, que es como esta plataforma activa cosas por cuenta
—Panel › Módulos— y no un interruptor nuevo. **Reuniones no pasa por ahí**: su
ruta se asigna a mano y no cuesta aparte; lo único que este módulo abre es
grabar y transcribir.

Esa ruta **no tiene pantalla**, y es a propósito: lo grabado vive en la ficha de
su reunión. Es solo la llave.

Comprobado en Chromium con dos sesiones: la administradora con el módulo ve el
botón, el agente de la misma cuenta **no**, y sin el módulo asignado **tampoco
lo ve ella** — la primera vuelta de la prueba falló justo por eso.

#### Transcribir: bajo demanda, nunca sola, y la tarifa es la de siempre

Es la diferencia con las notas de voz de Chats, que se transcriben al pedirlas
porque el asesor tiene que saber qué le dijeron. Aquí son compañeros hablando
una hora: transcribir cada reunión a seis créditos el minuto es una factura que
nadie pidió.

La tarifa **no se vuelve a escribir**: `costoDeLaNota`, los mismos seis créditos
por minuto prorrateados que cobran las otras dos pantallas. Y quién paga lo
decide `laCuentaQuePagaLaTranscripcion`: **la cuenta, nunca la persona**, y
dentro de una familia **la madre** — `ownerId ?? id` no sube a la madre, así que
sin eso el chat de la casa cobraría a tres bolsas distintas.

Cinco cosas:

1. **El tope va sobre BYTES, no sobre minutos.** Es un límite de OpenAI y los
   bytes son el dato que va a viajar; los minutos son una estimación.
2. **El precio se ve ANTES de pulsar**, como en el chat del equipo. Y lo que no
   se puede no se ofrece: se dice por qué, porque un botón que al pulsarlo da
   error es peor que no tenerlo.
3. **Se guarda, así que se paga una vez.** El `UPDATE` lleva
   `WHERE "transcripcion" IS NULL`: dos peticiones a la vez escriben una sola
   vez —comprobado contra Postgres— y solo esa cobra.
4. **Un fallo no cobra y no deja marca.** Lo pidió una persona, así que un
   tropiezo de OpenAI es de hoy y el botón sigue.
5. **El resumen no se cobra aparte y no puede tumbar el texto.** Es un precio y
   dos entregas: el resumen de una hora son unos miles de tokens de un modelo
   de texto, calderilla al lado de la transcripción. Si falla, **se guarda la
   transcripción igual** y se dice — media entrega es mejor que ninguna cuando
   la mitad que sale ya está pagada.

Y el prompt pide **puntos tratados**, no un párrafo: de una reunión se vuelve a
buscar «qué se dijo de X», y una lista se recorre con los ojos. Si hay que
recortar, se recorta por el **principio**: lo que se pierde es el saludo y no
los acuerdos.

#### El cupo y los 180 días

Veinte gibibytes por cuenta, que son unas veinte horas de video o mil
cuatrocientas de audio. Se mira **antes de empezar** y **en cada parte**: el
tope es de la cuenta y entre el principio y el final de una reunión de una hora
puede entrar otra grabación por otro lado. Al llenarse, la pestaña **para y
guarda lo que lleve** — que es lo contrario de tirar media hora de reunión por
no caber la última parte.

El aviso sale al 80 %, y **solo entonces**: una barra permanente diciendo «0,4
GB de 20» es un dato que nadie va a usar ocupando la fila que le falta a la
lista.

A los 180 días se borra el fichero del bucket y los bytes vuelven al cupo,
**pero la fila se queda** con su transcripción y su resumen: son texto, ocupan
nada, y son justo lo que alguien va a buscar de una reunión de hace medio año.
Tirarlos con el audio sería perder lo barato por culpa de lo caro. Y el fichero
se borra **antes** que la fila: al revés, un fallo a mitad dejaría el giga en el
bucket sin ninguna fila que dijera de quién era.

El barrido cuelga del cron diario que ya existe, en su propio `try` como los
demás, y hace **dos** cosas: las caducadas, y las que se quedaron en `grabando`
porque la pestaña murió. Estas segundas **se juntan**, no se dan por perdidas:
alguien grabó cuarenta minutos y se le cayó el navegador, y lo que ya subió es
suyo. Sin ese barrido esa reunión no podría volver a grabarse **nunca**, porque
empezar exige que no haya ninguna en curso.

#### Lo que NO se pudo ejercer aquí, y se dice

**La subida al bucket y la unión de las partes.** No hay MinIO alcanzable desde
el banco, así que la ruta contesta `502` en el último paso. Lo que sí está
probado es todo lo demás por el camino: la mezcla produce audio de verdad, el
`MediaRecorder` emite, la parte sale con sus 29 KB y sus parámetros correctos,
el cliente trata el `502` como toca —avisa y cierra— y **la base queda
coherente**: la grabación en `fallida` y la sala liberada, o sea que se puede
volver a grabar.

`composeObject` y `presignedPutObject` existen en el cliente de MinIO 8.0.5 que
ya está instalado; lo que no se ha visto correr es la unión contra un bucket de
verdad. Si algo falla en producción, **ese es el sitio donde mirar primero**.

## Reuniones: las grabaciones son su PROPIA pestaña, con miniatura

Las grabaciones se pintaban dentro de la fila de su reunión, y esa fila es un
`flex` en línea (título, Entrar, copiar, «⋯»): el bloque caía como un hijo más
y el `<video className="w-full">` se quedaba con todo el ancho que sobraba. Una
sola grabación empujaba las demás reuniones fuera de la vista.

> **Reuniones es a cuál entrar; Grabaciones es qué ver de lo que ya pasó.**
> Van separadas: «Grabaciones» es la tercera pestaña, junto a Abiertas y
> Pasadas, con su contador, y **solo sale con el módulo de grabación**
> (`puedeGrabar`, del servidor). Ninguna fila de reunión lleva un medio dentro.

Cuatro cosas que hay que mantener:

1. **Cada grabación es una fila con una miniatura de tamaño FIJO**
   (`MINIATURA`, 128×72 como mucho, en `components/reuniones/ListaDeGrabaciones.tsx`)
   y su botón de ampliar. La fila conserva la hora, el peso, quién la grabó,
   Descargar y Transcribir con sus créditos. Lo que no se puede reproducir
   —grabando, fallida, borrada— ocupa el mismo hueco con su icono.
2. **Ampliar abre el video grande en un diálogo**, y el video vive DENTRO del
   diálogo: cerrar lo desmonta y para la reproducción. La miniatura va con
   `preload="metadata"` y `#t=0.1`, nunca `auto`.
3. **La lista es plana y la más reciente arriba** (`lasGrabacionesEnLista`,
   `lib/grabaciones-de-la-pantalla.ts`, puro), con el título de su reunión
   dentro. Una grabación cuya reunión no está en la pantalla sale igual.
4. **El alcance es hacia abajo**: la lista y `transcribirLaReunionAction`
   filtran con `lasQueAlcanza` sobre `lasCuentasQueConsultaElCrm` —lo propio y
   lo que cuelga de ella; un `agente`, su cuenta—. Antes era solo la cuenta
   propia, así que la madre no veía las grabaciones de sus hijas. Y transcribir
   una de una hija cobra a la familia de esa grabación, no a la de quien pulsa.

**Lo que NO se tocó**: la lista de salas (Abiertas y Pasadas) sigue
alcanzando por `laFamiliaDeLaCuenta`, o sea la familia entera, hacia arriba
también. Queda abierto.

Lo prueba `scripts/banco-grabaciones-de-reuniones.sh`: la decisión pura, las
acciones contra Postgres (madre, hija, hermana, agente y una ajena) y la
pantalla pintada en Chromium sobre el CSS del build a 1440/1280/1024/390.
`MODO=roto` pinta el `ReunionesClient` de `ANTES_REF` y lleva el filtro viejo
dentro, y afirma los fallos.

## Reuniones: el video llena la CAJA, y los mandos flotan y se apartan

La sala tenía dos franjas propias —la cabecera arriba y la barra de mandos
abajo— y el video se quedaba con lo que sobraba. Medido en Chromium sobre el
CSS de **los dos builds**, que es la única forma de que el número signifique
algo: las clases que se van con las franjas (`border-t border-zinc-800`,
`py-2.5 sm:py-3`) siguen existiendo en la hoja nueva porque las usan otras
pantallas, así que las dos medidas valen; lo que no vale es medir el «antes»
con el DOM nuevo, que ya no tiene esas franjas.

| ventana | el video, antes | ahora | gana |
| --- | --- | --- | --- |
| 1440×900 | 752 px | **900** | +148 |
| 1280×800 | 652 px | **800** | +148 |
| 1024×768 | 620 px | **768** | +148 |
| 390×844 | 716 px | **844** | +128 |

Ciento cuarenta y ocho píxeles de alto en **todas** las anchuras —49 de la
cabecera, 73 de los mandos y 26 del relleno que separaba los recuadros del
borde—, y en un móvil una octava parte de la pantalla. La referencia es
`meet.jit.si`, que hace exactamente esto.

> **La cabecera y los mandos no tienen franja: flotan encima del video y se
> apartan solos a los 3,5 s sin actividad.** Vuelven con cualquier señal —mover
> el ratón, tocar la pantalla, una tecla, recibir el foco—. Vale en los tres
> tamaños de ventana; en la pastilla no hay mandos que esconder, así que ahí ni
> se engancha ningún oyente ni corre ningún temporizador.

### Lo que NO se esconde, que es la mitad que importa

Los **avisos** siguen en el flujo, sin temporizador ninguno: el de «se está
grabando» —que ocupa una franja entera en rojo a propósito, porque grabar la
voz y la cara de los demás sin que se note no es una función, es otra cosa—, el
de reconexión y la sala de espera, que además lleva botones que hay que poder
pulsar.

Un aviso no es una barra de mandos. Es raro, dura poco y lo que cuesta son
30 px de video mientras pasa algo que hay que mirar. Uno que se aparta a los
tres segundos es uno que no se ve, y entonces la regla de arriba deja de ser
cierta.

### Tres cosas de esconderlos, y las tres son fallos si faltan

1. **Escondidos NO se pueden pulsar.** `pointer-events-none` en la pastilla, no
   solo `opacity-0`. Unos mandos invisibles que siguen respondiendo al clic son
   un botón de colgar que se pulsa sin verlo. Lo que sí se conserva es el foco
   por teclado: `keydown` los devuelve antes de que nadie llegue a pulsar nada,
   y por eso **no** se les pone `aria-hidden` —quien navega con lector de
   pantalla no mueve ningún ratón—.
2. **Esconderlos no mueve ni encoge el video.** Son capas sobre una caja que ya
   ocupa el alto entero, así que lo que hay debajo ya estaba pintado. Medido en
   las cuatro anchuras, con una persona y con dos: la caja y cada recuadro miden
   **exactamente lo mismo** con los mandos puestos y quitados. Si alguna vez se
   los devuelve al flujo, el video daría un salto de 148 px cada tres segundos,
   que es peor que la franja que esto viene a quitar.
3. **Un menú abierto los FIJA.** El de grabar y el del fondo avisan con
   `onOpenChange`. Sin eso la barra se aparta a los 3,5 s y el menú se queda
   flotando solo sobre el video, anclado a un botón que ya no se ve. Lo mismo
   con el puntero encima de la barra: quien tiene el ratón ahí los está mirando
   aunque no lo mueva.

Los motivos para quedarse puestos son un **conjunto con nombre**, no un
contador. Un contador se desequilibra en cuanto un `onMouseLeave` no llega —y no
llega cuando el elemento se desmonta con el puntero encima, que aquí pasa cada
vez que se abre un menú— y a partir de ahí los mandos se quedan puestos para
siempre o no vuelven nunca.

### El freno de las señales se apaga cuando están escondidos

`mousemove` llega decenas de veces por segundo y cada una reprograma el
temporizador, en la pantalla que además está pintando video. Así que se frena…
**salvo con los mandos escondidos**, donde la señal es justo lo único que los
devuelve y tragársela 250 ms se nota como un ratón que no responde.

Y de ahí el invariante que junta las dos mitades, que es lo que el banco ejerce
con un ratón moviéndose cada 16 ms durante diez segundos: **el freno nunca puede
ser el motivo de que se aparten.** Si algún día se igualaran los dos números,
los mandos se esconderían con alguien moviendo el ratón encima de ellos.

### Una pastilla centrada, no una barra de punta a punta

Los mandos van en una pastilla redondeada de unos **364 px** centrada abajo
(288 en un móvil), no en una barra que cruza la pantalla. Con una persona —y con
la vista de orador, donde el grande ocupa casi todo— eso deja el pie del
recuadro, que lleva el nombre pegado a la izquierda, legible con los mandos
puestos. En cuadrícula de cuatro sí tapa el nombre de los de abajo, y **eso es
justo lo que arregla que se aparten solos**: a los 3,5 s vuelve a leerse sin que
nadie haga nada.

Y el degradado de detrás va `pointer-events-none`, con el `auto` en la pastilla:
el degradado ocupa 120 px de alto de punta a punta, y con él capturando el
puntero no se podría pulsar nada de lo que hay debajo en esa franja — o sea, la
franja muerta otra vez, esta vez invisible.

### El panel de Chat y Gente se PLIEGA, y se recuerda

Con una flecha (`PanelRightClose`) y no una equis: lo que hace es plegarlo
—devolverle el ancho al video— y no cerrar nada. Con la equis se lee como
«descartar» y nadie la pulsa por miedo a perder lo escrito en el chat.

Se recuerda en `localStorage`, con **tres valores y no un booleano aparte**:
`chat`, `gente` o `plegado`. Con «abierto» por un lado y «qué pestaña» por otro,
el día que uno de los dos no se escriba el panel vuelve abierto por la pestaña
de otra reunión, y eso se lee como que la App eligió sola. Y lo escribe **una
sola función** (`cambiarElPanel`): con la escritura en cada manejador, al tercero
se le olvida y entonces se recuerda unas veces sí y otras no.

Lo que no se entienda —un valor de otra versión, algo a medio escribir— cae en
plegado: se ve de menos, nunca de más, que un panel abriéndose solo tapa el
video de quien no pidió nada. Y sin nada guardado también es plegado: una
reunión se abre para ver a la gente, no para leer un chat todavía vacío.

Con el panel abierto **las dos barras se quedan en el ancho del video**
(`sm:right-64 md:right-72`, medido: acaban en el píxel exacto donde empieza el
panel). Encima taparían sus pestañas, que están justo ahí arriba, y su caja de
escribir, que está justo abajo. Y en un **móvil**, donde el panel se superpone a
pantalla completa, las dos se esconden del todo: unos mandos flotando sobre el
chat taparían la caja de escribir, que es para lo que se abrió.

### Y con una sola persona el recuadro va SIN marco

Sin relleno exterior el recuadro **es** la caja, así que un marco redondeado a
sangre deja cuatro muescas del fondo en las esquinas y se lee como que el video
no llega al borde. El anillo ámbar de la mano levantada se pinta igual, con
marco o sin él: es lo único que dice que alguien pidió la palabra, y con una
sola persona en la sala esa persona es la que la pidió.

### Medido, y lo que el banco no puede cazar

El banco de `lib/mandos-de-la-reunion.ts` prueba la decisión —el plazo, los
motivos, el freno y el invariante que los cruza— sin navegador. Lo que hizo
falta medir en Chromium, con sesión de verdad y cámara falsa, a 1440, 1280, 1024
y 390, con una persona y con dos, y en los tres tamaños de ventana:

- el video llega a los **cuatro bordes** de la caja (los recuadros, no la caja
  vacía: con dos personas se comprueba el mínimo y el máximo de la lista);
- se apartan solos, **dos veces seguidas** —que no sea un «vuelven una vez y
  ya»— y vuelven al mover el ratón y al **tocar** la pantalla en un móvil;
- escondidos, la pastilla está en `pointer-events: none`;
- la caja y cada recuadro miden lo mismo antes y después de esconderlos;
- los `<video>` siguen montados en todos los pasos, la pastilla plegada incluida
  —plegar esconde, no desmonta, o se va el audio con ellos—;
- con un menú abierto no se apartan aunque el ratón esté lejos, y al cerrarlo
  vuelven a hacerlo;
- a pantalla completa el video ocupa 1440×900 exactos y las barras siguen
  flotando y apartándose;
- y la **pastilla** de la reunión plegada no se esconde nunca: ahí no hay mandos
  que apartar, y dejarla escondida sería una reunión sin forma de colgar.

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

### El build SÍ comprueba los tipos, pero no sirve para contarlos

`next.config.js` llevaba `typescript: { ignoreBuildErrors: true }`. Un `soltar`
usado en un array de dependencias **antes de declararse** —que es un TDZ de
verdad, no solo de tipos— daba `npm run build` en verde y habría reventado en
producción. Lo cazó `npx tsc --noEmit`, que era el único que miraba.

**El interruptor ya no está**, y **no se vuelve a poner** — lo comprueba
`lib/__tests__/tipos-en-el-build.test.mjs`, que corre en los dos modos. Existe
por una razón concreta: volver a ponerlo es lo que se hace cuando un build se
cae y hay prisa, y a partir de ahí no lo quita nadie.

Tres cosas que hay que saber antes de tocar esto:

1. **El comprobador de Next se PARA en el primer error.** Así que el build
   sirve para que no entre ninguno y **nunca para contar cuántos hay**: enseña
   uno, se arregla, y aparece el siguiente. Para el recuento sigue mandando
   `npx tsc --noEmit`, y esa diferencia no es un detalle — «hay 1 error» y «hay
   40» son dos tareas distintas.
2. **`tsc` ya cubre las rutas generadas.** `tsconfig.json` incluye
   `.next/types/**/*.ts`, que son 233 ficheros que escribe el propio Next. No
   hace falta compilar para comprobarlos, pero sí haber compilado **alguna vez**
   para que existan.
3. **`eslint: { ignoreDuringBuilds: true }` se queda**, y es otra cosa: el lint
   no cambia lo que corre.

Los tres errores que estaban tapados eran el mismo, en
`actions/chat-manual-actions.ts`: `context.apiKeyData` —que el tipo declara
opcional— pasado a `sendTextMessage`, `sendMediaByUrl` y `resolveWhatsAppJid`,
que piden la clave sin nulos. Ninguno era un fallo vivo —las tres puertas de
arriba ya impedían llegar ahí sin clave— pero **la forma de arreglarlos importa**:

- **No con un `as`.** Los dos helpers pasan a pedir `ReadyChatActionContext`,
  que es el tipo que la casa ya tenía para decir «este contexto trae clave», y
  el `context as Exclude<ChatActionContext, null>` del envío de flujos **se
  fue**: `listo` es exactamente ese contexto y se puede pasar tal cual.
- **Y donde no se puede estrechar el tipo, se comprueba de verdad.**
  `sendOutgoingPayload` sí puede recibir una línea sin clave —una de Waha, que
  no la necesita—, así que después de la rama de Waha lleva su
  `if (!hasReadyContext(context))` con aviso y fallo suave. No es decoración:
  `sendTextMessage` y `sendMediaByUrl` **desestructuran `apiKeyData` antes de su
  propia comprobación**, así que un `undefined` de verdad no devuelve el fallo
  que prometen — revienta con un `TypeError`.

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

### El #790 sacó las CLASES, no la barra, y la copia se quedó atrás

Conviene tenerlo delante antes de creerse que algo «ya está compartido». Lo que
aquel cambio movió a `components/shared/` fueron **tres componentes de pintar**
—`FormatoDeTexto`, `EmojiPickerPanel`, `TextoConFormato`— y a `lib/` un puñado
de **clases de CSS**. La barra en sí siguió siendo **dos**: `ChatInputBar.tsx`
y un compositor escrito dentro de `HiloDelEquipo.tsx`. Se comprueba en una
línea —quién importa esas constantes son exactamente esos dos ficheros—, y por
eso la sección de arriba podía decir «es el mismo código» sin que lo fuera.

Y dos implementaciones no divergen en lo grande: las dos mandan mensajes. Se
separan en lo pequeño, que es lo que se reporta como «no deja pegar capturas» y
«el icono del dictado sale como una T». Esto es lo que había, con su causa:

| | Chats | chat de equipo | por qué |
| --- | --- | --- | --- |
| la barra | `ChatInputBar.tsx` | escrita dentro de `HiloDelEquipo.tsx` | el #790 sacó las clases, no la barra |
| **pegar una captura** | `onPaste`, imagen, 8 MB, máx 4 | **no existía**: ningún `onPaste` | nunca se escribió aquí |
| **adjuntar** | `AttachmentMenu`, en fila con sitio | un `<input type=file>` detrás del «+» **siempre plegado** | dos widgets distintos |
| **icono del dictado** | `AudioLines` | **`Type`** — una T | copiado a ojo |
| el «+» | solo por debajo de 640 px | **siempre** | la condición, escrita a mano |
| **acciones del mensaje** | el `group` es la burbuja | el `group` era la línea del nombre y la hora, de ~12 px | el hover no se alcanzaba |
| alto de la caja | `altoDeLaCaja`, tope en LÍNEAS | `max-h-40`, tope en PÍXELES | el fallo que este documento da por arreglado, vivo en la copia |

Las dos últimas filas son las que enseñan lo que cuesta una copia. **Editar y
borrar SÍ estaban escritos** en el chat de equipo —con su puerta, su acción y
su menú— y no se podían usar: el `group` del que colgaba el `⋯` era la fila del
nombre y la hora, así que había que acertar con el cursor dentro de doce
píxeles. Desde fuera eso no se lee como «el hover está mal puesto», se lee como
**«no deja editar mensajes»**, que es como se reportó. Igual adjuntar: el
`<input>` existía y vivía detrás de un «+» que no se abría nunca en la ruta.

> **La lección, que es la de siempre y aquí se pagó entera: sacar las clases no
> es compartir el componente.** Lo que hay que mirar para saber si dos
> pantallas están unificadas no es si importan el mismo CSS — es si la
> **decisión** sale del mismo sitio. Por eso lo que se movió ahora son las dos
> cosas que deciden (`losBotonesDeLaDerecha` y `rellenoDeLaCaja`, puras en
> `lib/`) y el armazón que las pinta (`components/shared/BarraDeEscribir.tsx`),
> no otro puñado de clases.

Y **lo que depende de WhatsApp se queda en Chats**, que por eso el armazón
tiene huecos y no una lista fija: la firma del asesor, el interruptor de estado,
las plantillas de Meta, las respuestas rápidas, los flujos, la nota interna y la
sugerencia de la IA entran por `fijo` y por `children`. El chat del equipo mete
por los mismos huecos lo suyo —formato, emojis y el clip— y ninguno de los dos
sabe nada del otro.

#### Lo que se comprobó, en Chromium y sobre la página servida

`scripts/probar-barra.mjs`: el build con `next start` contra una base de usar y
tirar, sesión de verdad, y las dos pantallas abiertas a 1440, 1280, 1024 y 390.
No una maqueta — una maqueta habría dado por buenas las dos barras, porque el
fallo no estaba en cómo se pintan sino en qué ofrecen.

| ventana | pantalla | ancho de la barra | relleno | botones de la derecha | «+» |
| --- | --- | --- | --- | --- | --- |
| 1440 | chat de equipo | 1382 | 112 px | dictado · nota · enviar | no |
| 1440 | Chats | 996 | 112 px | dictado · nota · enviar | no |
| 1280 | chat de equipo | 1222 | 112 px | dictado · nota · enviar | no |
| 1280 | Chats | 836 | 112 px | dictado · nota · enviar | no |
| 1024 | chat de equipo | 966 | 112 px | dictado · nota · enviar | no |
| 1024 | **Chats** | **612** | 48 px | voz | **sí** |
| 390 | chat de equipo | 390 | 48 px | voz | sí |
| 390 | Chats | 390 | 48 px | voz | sí |

**Pegar una captura adjunta en las dos, en las ocho filas** — y en el chat de
equipo eso es nuevo, porque antes no hacía nada. La fila de 1024 es la que hay
que leer con cuidado: las dos barras dicen cosas distintas y **las dos
aciertan**, porque sus anchos son distintos. El banco lo comprueba así, barra
por barra contra su propio ancho medido, y **lee `ANCHO_COMPACTO` del módulo**
en vez de escribir 640 a mano: copiado, probaría que las dos coinciden con el
banco y no con la regla que corre en producción.

Y se comprueba además lo que se reportó como «no deja editar mensajes»: se
manda un mensaje, **se posa el cursor sobre su TEXTO** —no sobre la línea del
nombre y la hora— y se mira la opacidad de la fila de acciones, que pasa de
**0 a 1**, y que el `⋯` ofrece **Responder · Editar · Eliminar**. La opacidad
se lee en la FILA y no en el botón: el botón vale 1 siempre, así que midiéndolo
el banco salía verde sin haber ejercido nada — costó una vuelta.

#### Lo que solo apareció midiendo: un `useEffect` sobre un `ref` se rinde una vez

Es el hallazgo que ningún banco puro iba a dar, y el que enseña por qué esto se
mide en un navegador. `useBarraCompacta` empezó siendo un `useEffect` con
`[ref]` de dependencia. A 390 px la barra de Chats se plegaba y **la del chat
de equipo no**: seguía con sus tres botones y su `pr-28` encima de una caja de
390 px de ancho.

La causa no está en la regla —que es la misma— sino en **cuándo se lee el
nodo**: el hilo del equipo pinta antes su estado de carga, así que en el
montaje `ref.current` es `null`, el efecto se rinde y con `[ref]` de
dependencia **no vuelve a correr nunca**. En Chats la barra sí está en el
primer render, o sea que aquello funcionaba **por suerte, no por diseño**.

> **Lo que tiene que enterarse de que un nodo APARECE es un ref de callback,
> no un efecto sobre un `useRef`.** React lo llama cuando el nodo se monta, que
> es exactamente el caso que fallaba. Un efecto solo vuelve a mirar si alguna
> de sus dependencias cambia, y un objeto de `useRef` no cambia nunca.

#### Y el banco son dos scripts, con lo que cada uno puede probar

- `scripts/banco-barra.sh` — **la decisión**, sin navegador y en dos modos. El
  roto es la barra del chat de equipo tal como estaba —plegada siempre, y
  `archivosDelPortapapeles` devolviendo vacío— y **afirma el fallo**.
- `scripts/banco-barra-navegador.sh` — **las dos barras de verdad**: levanta su
  Postgres, siembra con `scripts/sembrar-barra.mjs`, arranca el build y corre
  `scripts/probar-barra.mjs`.

**El segundo no tiene modo roto, y se dice en vez de disimularlo**: reproducir
el «antes» ahí serían dos builds, uno por cada versión del código. Lo que sí
hace es fallar cuando una de las dos barras **no llega a pintarse** —antes
devolvía guiones y decía que todo iba bien habiendo medido una sola—, y su
semilla añade a mano `chat_conversations.profilePicUrl`, que existe en
producción por un `ALTER TABLE` en caliente y **no** en el esquema de Prisma:
sin esa columna la bandeja se cae con un `42703`, `/chats` abre en
mantenimiento y la mitad de la comparación no se ejerce.

Y para poder medirlo, las dos barras llevan `data-barra="escribir"`. Es la
única marca que el banco necesita del DOM; sin ella tendría que adivinar qué
elemento es «la barra» y acabaría midiendo la ventana, que es justo el error
que esta sección cuenta.

### El botón de formato OBLIGA a pintar el formato

Es la mitad que se olvida. El botón escribe `*negrilla*` en la caja, o sea
marcas de WhatsApp dentro del texto; si la burbuja sigue sacando el texto tal
cual, lo que se lee al otro lado es el asterisco. **Un botón que produce algo
que se ve roto es peor que no tenerlo**, así que la burbuja del equipo —y el
recuadro de la cita, y el borrador de la cita— pasan por `TextoConFormato`, el
mismo componente que ya usa la burbuja de Chats.

### El «+» sale por el ancho de la BARRA, no por el de la pantalla

Esto estaba escrito al revés —«aquí va SIEMPRE plegado, y el «+» no se
condiciona al ancho»— con el argumento de que este hilo se lee en un panel
lateral de 18 a 24 rem, así que «ancho» no existe. **Se olvidaba la mitad**:
`/chat-equipo` es también una RUTA, a todo lo ancho, con tanto sitio como
Chats. Ahí el «+» plegado no protege de nada — esconde el formato, los emojis
y el clip detrás de un clic que sobra, y es literalmente lo que se reportó
como «el desplegable abre distinto que en Chats».

> **El corte es uno, `ANCHO_COMPACTO` (640 px), y lo mide `useBarraCompacta`
> sobre la barra —no sobre la ventana—.** Es una MEDIDA, no una pantalla: las
> dos barras aplican la misma regla y se pliegan en momentos distintos porque
> viven en huecos distintos. Medido sobre la página servida a 1024: la del
> equipo mide **976 px** y va en fila; la de Chats **588**, porque comparte la
> ventana con la lista de la bandeja, y va plegada. **Comparar las dos por el
> ancho de la VENTANA es comparar dos barras que no miden lo mismo** — el
> primer banco lo hacía y cantó tres fallos que no existían.

Y el hueco que la caja le deja a los botones sale de **la misma lista** que los
pinta (`rellenoDeLaCaja` sobre `losBotonesDeLaDerecha`): tres botones son
`pr-28` y uno `pr-12`. Con dos cuentas separadas, de más la última palabra se
corta contra un hueco vacío y de menos el texto pasa por debajo del botón.

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

### Y en Chats el tope estaba en PÍXELES, que no es un tope en líneas

La caja de Chats crecía hasta **160 px** y ahí se paraba
(`Math.min(el.scrollHeight, 160)`), y desde fuera eso se veía como una caja de
cinco renglones comiéndose media conversación. Un tope en píxeles **no es un
tope en renglones**: el mismo número da un número distinto en cada pantalla,
porque el interlineado no es el mismo. Medido en Chromium sobre el CSS del
build, con las clases del propio componente
(`text-base sm:text-sm leading-relaxed`):

| | interlineado | lo que cabía en 160 px |
| --- | --- | --- |
| escritorio (`text-sm`) | 20 px | **7,1 renglones** |
| móvil (`text-base`) | 26 px | **5,5 renglones** |

> **El tope se cuenta en LÍNEAS y se traduce a píxeles con el interlineado que
> de verdad tiene esa caja**, más su relleno y sus bordes. Así son tres
> renglones en un teléfono y tres en un monitor, digan lo que digan las clases
> de tipografía. Lo decide `lib/alto-de-la-caja-de-escribir.ts`, que es puro:
> el navegador solo aporta las cuatro medidas que únicamente él sabe.

Y debajo estaba **el fallo de los bordes de la sección de arriba, vivo en
Chats**: el `scrollHeight` iba pelado, así que la caja medía siempre dos
píxeles menos de lo que hacía falta. En un teléfono eso es **una barra de
deslizar con una sola línea dentro** —42 px medidos donde hacían falta 44—; en
escritorio lo tapaba el `min-h-10` del CSS con una línea y salía a las tres, y
por eso nadie lo reportó como tal.

Medido en Chromium sobre el CSS del build, con las clases leídas del componente
y pasadas por el mismo `tailwind-merge` que usa `cn` —copiadas a mano se estaría
midiendo una caja que React no pinta—:

| ventana | | 1 renglón | 3 renglones | 12 renglones |
| --- | --- | --- | --- | --- |
| 1440 / 1280 | antes | 40 px | 76 px, **con barra** | 160 px = **7,1 renglones** |
| 1440 / 1280 | ahora | 40 px | **78 px, sin barra** | **78 px = 3** |
| 390 | antes | 42 px, **con barra** | 94 px, con barra | 160 px = **5,5 renglones** |
| 390 | ahora | **44 px, sin barra** | **96 px, sin barra** | **96 px = 3** |

Vacía vuelve a su línea en las tres anchuras, igual que antes: la altura en
línea **se quita** y manda el CSS (`min-h-10`). Escribir un número ahí dejaría
la caja alta con el borrador de otro chat dentro.

Tres cosas que hay que mantener:

1. **Sin interlineado usable NO se queda sin tope.** `line-height: normal` da
   `NaN` al parsear, y un tope `NaN` **deja pasar cualquier alto** en
   `Math.min`: volvería el fallo entero y sin un solo error. El respaldo es el
   de siempre para un texto, una vez y media la fuente. Equivocarse ahí cuesta
   unos píxeles; no tener tope cuesta la conversación.
2. **Se vuelve a medir cuando cambia el ANCHO**, con un `ResizeObserver` que
   mira **solo el ancho** —lo que esto mismo cambia es el alto, así que no hay
   bucle—. Al abrirse la ficha de contacto o al girar un móvil el texto se
   reparte en otro número de renglones y la altura escrita antes se queda
   mintiendo.
3. **Y el enganche también es UNO**, `useAltoDeLaCaja`
   (`components/shared/BarraDeEscribir.tsx`). Esto decía antes «Chats y el chat
   de equipo siguen siendo dos efectos, no uno», con el argumento de que cada
   pantalla sabe cuándo volver a medir. **Era falso**: lo único propio de cada
   una es *con qué* se reinicia —el chat abierto en Chats, el canal en el
   equipo— y eso cabe en un parámetro (`reiniciarCon`). El precio de tenerlo
   escrito dos veces se vio entero: el equipo se quedó con un `max-h-40`, o sea
   **el tope en PÍXELES que esta misma sección da por arreglado**, y los
   `scrollHeight` sin bordes volvieron con él. Un arreglo que se hace en una
   copia no es un arreglo: es una diferencia. Y **la sala de reuniones no entra
   aquí**: su chat tiene su propia caja.

Lo comprueba `scripts/banco-caja.sh`, en dos mitades: la decisión sin navegador
—en dos modos, y el roto **afirma** los 7,1 y los 5,5 renglones— y la caja de
verdad en Chromium, que falla si en alguna de las tres anchuras no se ven
exactamente tres.

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

### Lo que sale del editor NO es JSON plano, y por eso no cruza

`/documentos` **no guardaba nada**. En producción los dos documentos que había
seguían en la versión 1 con el texto vacío, el servidor no escribía **ni una
línea** en su registro, y lo que veía la persona era

> No se pudo completar. Revisa la conexión.

que es el mensaje de `pedir(...)` cuando la acción **revienta**, y manda a
mirar la red. La red no tenía nada que ver. Reproducido sobre el build
servido, con sesión de verdad:

```
[documentacion] la accion no llego al servidor
Error: Only plain objects, and a few built-ins, can be passed to Server
Actions. Classes or null prototypes are not supported.
    at JSON.stringify ... at t.encodeReply
```

**`encodeReply` corre en el NAVEGADOR: la petición no llega a salir.** De ahí
las dos cosas que despistaron a la vez —el servidor mudo *y* el documento en
la versión 1—: no es que el guardado fallara, es que nunca se pidió.

La causa es de `prosemirror-model`: `computeAttrs` construye los `attrs` con
`Object.create(null)` y `Node.toJSON()` los asigna **por referencia**. Con
`TextAlign` configurado —lo está— **cada párrafo y cada encabezado** llevan
atributos, así que pasa siempre.

> **Se convierte en el EDITOR** (`comoJsonPlano`, en `lib/json-plano.ts`,
> llamado desde el `onUpdate` de `EditorDeTexto`), que es el único sitio que
> produce el problema. **No en cada pantalla.**

Y esa última frase es la lección, porque el arreglo **ya existía**: Notas
llevaba un `JSON.parse(JSON.stringify(content))` suelto en su `handleSave`
**sin un comentario que dijera por qué**. Documentación reutilizó el mismo
editor y no lo copió — nadie sabía que hacía falta. *Un arreglo sin su motivo
escrito al lado es un arreglo que la siguiente pantalla no copia.*

Lo que cuesta, medido: 0,21 ms con 27 kB, **2,2 ms con 268 kB** y 17,6 ms con
2,7 MB. Se paga en cada tecla y se acepta: `getJSON()` ya recorre el árbol
entero en cada tecla, así que esto multiplica una constante y no el orden — y
un documento de 2,7 MB pasa de largo el tope de indexado.

### Un permiso de DOCUMENTO tiene que traer su espacio

El diálogo de permisos se abre desde un espacio **y desde un documento
abierto**, y en el segundo caso escribe una fila de `objetoTipo: 'documento'`.
En producción **la única fila que había era esa**. Y `losEspaciosCandidatos`
solo miraba las de `'espacio'`, así que:

- `abrirDocumentoAction` contestaba `success: true` con `puedeEditar: true`…
- …y el árbol de esa persona salía **vacío**.

O sea **una puerta abierta sin ningún menú que llevara a ella**, que es el
«menú abierto, puerta cerrada» de este repositorio del revés y se lee igual de
mal: «me lo compartieron y no veo nada».

**Y el espacio entra como CONTENEDOR, no como alcanzado.** Es la parte que no
se puede ablandar: `losEspaciosQueAlcanza` lo devuelve en `contenedores`, con
un acceso de solo mirar, y el mapa con el que `accesoAlDocumento` decide lleva
**solo los espacios de verdad**. Metiéndolo ahí, el espacio decidiría por
todos sus documentos y compartir una hoja regalaría la carpeta entera. El
banco lo comprueba con un vecino dentro: sale el compartido y **no** el de al
lado.

De ahí salen dos mapas y no uno: **el de decidir** (espacios alcanzados) y
**el de pintar el nombre** (los dos juntos). Sin el segundo, un resultado de
búsqueda salía sin decir en qué espacio vive.

### Y en un documento recibido, un `agente` tampoco escribe

Lo destapó el banco al cerrar lo de arriba. `accesoAlEspacio` ya tenía en su
rama de recibido `dado === "edicion" && canManageWorkspace(user)`; a
`accesoAlDocumento` **se le había quedado fuera**, así que un documento
compartido con una CUENTA dejaba escribir a su equipo entero, agentes
incluidos. Participa, no manda — el mismo reparto de siempre.

Lo que **no** cambia es una fila para la **persona**: eso se lo dieron a ella a
propósito, sea agente o no. Son dos cosas distintas y por eso hay dos
lectores (`loQueLeDan` y `loQueLeDanAElla`), igual que
`team_channel_accounts` está aparte de `team_channel_members`. Y dentro de la
cuenta propia manda lo de siempre, que es lo que permite abrir un espacio
restringido a alguien del equipo.

### El selector ofrece a la gente de la FAMILIA, y «Empresa Demo» no es un nombre

Dos cosas que hacían inservible el diálogo de permisos:

1. La gente salía de `ownerId = <mi cuenta>`, o sea **solo mi equipo**. A un
   administrador de una cuenta asociada no se le podía dar acceso a nada a su
   nombre. Ahora sale de `laFamiliaDeLaCuenta` —el componente entero de
   `linked_accounts`, la misma función del chat de equipo— y **el detalle dice
   de qué cuenta es**: «Yair Silvera» a secas no distingue al de tu equipo del
   de la cuenta asociada, y elegir al que no era escribe un permiso que no abre
   nada.
2. Las cuentas se pintaban con `c.company`, que **nace con «Empresa Demo»**: el
   selector ofrecía tres filas idénticas. Lo decide
   `nombreDeLaCuenta` (`lib/nombre-de-la-cuenta.ts`, puro): la empresa si de
   verdad se rellenó, luego el nombre, luego el correo. **Si se añade otro
   sitio que enseñe el nombre de una cuenta, va por ahí** — esa condición está
   escrita a mano en media docena de pantallas, y el diálogo compartido de
   Proyectos y Diagramas tenía el mismo fallo.

Las **demás** cuentas de la familia no entran como personas: ya están en la
mitad de abajo, y ofrecerlas dos veces es pedirle a alguien que adivine la
diferencia. La cuenta **propia** sí, porque es el inicio de sesión del dueño y
sin ella al jefe no se le podría dar acceso a nada.

### Borrar un espacio es SUAVE, y el sello no basta: hay que cerrarle los CUATRO lectores

Un espacio no se podía ni renombrar ni eliminar: una vez creado quedaba fijo
para siempre. `editarEspacio` y `borrarEspacio` **ya existían en la base y sus
dos acciones también**; lo que faltaba era el menú que las abriera. Conviene
saberlo antes de ponerse a escribir una capa de datos que ya está.

Y `borrarEspacio` era un `DELETE` en cascada —documentos, versiones, menciones,
filas y permisos—. Eso no se deshace: un espacio con seis meses de
procedimientos dentro se iba con un clic. Ahora se sella `borradoEn`
(`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, que es como entra una columna en una
tabla de la App **ya desplegada**) y **no desaparece ni una fila**.

> **Pero esconder el espacio no esconde sus documentos.** Y ahí estaba el hueco
> real: `accesoAlDocumento` deja pasar a **quien escribió** un documento aunque
> su espacio no se alcance, así que su autor lo habría abierto con una URL
> guardada y lo habría visto salir como retroenlace desde una tarea. Se cierra
> por los dos sitios: **el espacio** desaparece de `elEspacio` y de
> `losEspaciosCandidatos` —las dos puertas que llevan a uno—, y **sus
> documentos** de las cuatro consultas que los traen (el árbol, abrir, la
> búsqueda y los retroenlaces), con `sinEspacioBorrado(alias)` escrito **una
> vez** y no cuatro. Es el mismo patrón que `sinGruposSql(alias)`, y por el
> mismo motivo: escribir la condición a mano en cuatro sitios es garantizar que
> la quinta se olvide.

**No hay pantalla para deshacerlo, y eso se dice en vez de disimularlo**: se
recupera con `UPDATE "doc_espacios" SET "borradoEn" = NULL WHERE "id" = …`. Lo
que esto compra es que el dato siga ahí para poder hacerlo.

Y **el número de la confirmación es un `COUNT`, no el largo de la lista del
árbol**: el árbol enseña lo que quien mira alcanza —sin los restringidos de
otra gente— y el borrado se lleva el espacio entero. Un «se van a borrar 3» que
se lleva 11 es peor que no decir ninguno. Mientras se cuenta **no se pinta un
cero**: un cero mientras carga se lee como «este espacio está vacío», que es lo
contrario de lo que la confirmación existe para avisar.

### Y quién manda sobre el espacio es una pregunta APARTE de `puedeGestionar`

La tentación es ensanchar `Acceso.puedeGestionar` para que incluya al creador.
No: esa decide además **crear documentos dentro y repartir permisos**, así que
metiendo ahí al creador se le estarían dando de paso dos cosas que nadie pidió.

`puedeMandarEnElEspacio` (`lib/documentacion-permisos.ts`, puro) son tres
condiciones y cada una tapa un caso:

1. **Nunca en uno recibido.** En un espacio de otra cuenta no manda nadie de
   esta, ni con edición. Mismo reparto que Proyectos compartidos y Diagramas.
2. **Nunca un `agente`** — ni siquiera sobre uno que creó él. Participa, no
   manda, y borrar un espacio se lleva por delante la documentación de sus
   compañeros.
3. Pasan **quien lo creó** y **quien administra la cuenta**. La primera mitad
   no es de adorno: `canManageWorkspace` **no cubre** a un miembro del equipo
   cuyo `advisorRole` no es ni `administrador` ni `agente`, y esa gente crea
   espacios hoy —`puedeCrearEspacio` va en `true` sin condición—, así que sin
   ella se quedaría con un espacio suyo que no puede ni renombrar.

El creador se compara con la **PERSONA** (`user.id`), que es con la que se firmó
`creadoPorId`. Con la cuenta efectiva, un espacio creado por el dueño se lo
daría de golpe a todo su equipo.

### El orden del árbol: por `creadoEn`, y encima el que se puso a mano

`losDocumentosDe` iba `ORDER BY "actualizadoEn" DESC`, y eso es lo que hacía que
el árbol se leyera **del revés**: cada documento nuevo entraba arriba del todo,
y encima cualquier retoque en uno viejo lo subía. Va por `creadoEn` ascendente,
que es como se lee una documentación, y **no hace falta ningún backfill**: la
columna ya estaba en todas las filas.

Encima de eso manda el orden puesto a mano, y **no estrena mecanismo**: entra en
`orden_en_tablero` con un `tipo` nuevo, `espacio`, y `tableroId` = el id del
espacio. Dos formas de guardar la misma posición son una que se afina y otra que
se queda atrás. Y su llave **ya es el tablero**, que es literalmente lo pedido
—«el mismo para todos los que ven ese espacio, no por persona»—; por eso no va
por `lib/orden-de-las-tarjetas.ts`, que guarda por pareja cuenta + cosa.

De ahí salen gratis las dos mitades del encargo, sin escribir ninguna rama:

- **Un espacio que nadie ha arrastrado no tiene ni una fila**, así que sale
  exactamente como lo devuelve la base. Esto no cambió ningún árbol hasta el
  primer arrastre.
- **Un documento nuevo SÍ trae posición** (`alFinalDelTablero`), así que cae en
  el grupo de los colocados y queda **el último**. Que es lo pedido: nunca
  arriba, para no pisar el orden que puso una persona.

La puerta de ordenar es **la misma con la que se crea un documento dentro**
—`accesoAEsteEspacio().puedeEditar`—, y no una condición propia. Y una lista que
llega de fuera no decide qué se ordena: se cruza contra los documentos que de
verdad están en ese espacio.

### La fila del árbol sigue siendo un `<button>`, y por eso no usa `TarjetaDelTablero`

`TarjetaDelTablero` —la pieza compartida— pinta un `div` con el `onClick`
encima, que es lo correcto para una tarjeta de tablero. En el árbol la fila es
**la navegación de la pantalla**: con un `div` se pierde el foco por teclado, o
sea la única forma de recorrerlo sin ratón. Así que el `<button>` lleva su
propio `useSortable` —diez líneas— y **todo lo demás es el de siempre**:
`useOrdenDeColumna`, `ColumnaOrdenable`, `ordenarLaColumna` y el guardado. Lo
que se copia es el nodo que se pinta, nunca la lógica del orden.

Y el `DndContext` va **uno por espacio**. Son hermanos, no anidados —lo que
roba los eventos es anidarlos—, y así un arrastre no puede cruzar de un espacio
a otro, que no se pidió.

Medido en Chromium sobre el CSS del build, con el nombre largo de una cuenta
real. El `⋯` le quita 28 px al nombre y **la fila no cambia de alto**:

| ventana | columna | nombre antes | nombre ahora | alto de la fila | desborda |
| --- | --- | --- | --- | --- | --- |
| 1440 | 320 | 241 | **213** | 32 px | no |
| 1280 | 320 | 241 | **213** | 32 px | no |
| 1024 | 288 | 209 | **181** | 32 px | no |
| 390 | 288 | 209 | **181** | 32 px | no |

El nombre recorta con «…» y va entero en el `title`. Y la combinación «menú +
insignia de *De otra cuenta*» **no se mide porque no puede darse**:
`puedeMandarEnElEspacio` es falso en un espacio recibido, así que los dos son
excluyentes — medirla sería medir una pantalla que React no pinta.

### Plegar un espacio: se guarda lo PLEGADO, no lo desplegado

El árbol enseñaba siempre todos los documentos de todos los espacios, así que
con varios espacios llenos era una lista larguísima sin forma de contraerla.
Cada espacio se pliega pulsando su nombre.

Lo delicado no es el pliegue: es **qué se guarda**, y la respuesta es el
conjunto de los **plegados**, en `lib/plegado-de-espacios.ts`. De ahí salen las
dos mitades del encargo sin escribir ninguna rama:

- **Un espacio que nunca se ha tocado nace desplegado**, porque no está en el
  conjunto. No hay que sembrar nada la primera vez ni acordarse de añadir los
  espacios nuevos, que es justo donde se olvidaría uno.
- **Y lo guardado no crece con el árbol.** Guardando lo desplegado, una cuenta
  con cuarenta espacios escribiría cuarenta ids para decir que no ha tocado
  nada.

Vive en `localStorage` y no en la base —es una preferencia de vista de esta
persona y este equipo, no un dato compartido—, con la **misma forma que
`llaveDelUltimoCanal`**: la llave lleva la cuenta y la persona, el separador es
`::` y no `_` (un id con un guion bajo dentro hace que («a», «b\_c») y («a\_b»,
«c») den la misma llave), y **cada acceso va en su `try`**, porque en una
ventana privada tocar `localStorage` tira una excepción y sin él el árbol entero
se queda sin pintar.

Y los dos ids **bajan como props desde el servidor** (`quienFirma`, que es puro
y ya reparte las dos preguntas de siempre). Leerlos al pintar no vale:
`localStorage` no existe en el servidor y las dos salidas no coincidirían, o sea
una hidratación rota.

Cinco cosas que hay que mantener:

1. **Lo guardado NO se escribe desde un efecto sobre el conjunto.** Ese efecto
   correría también en el montaje, con el conjunto vacío del arranque, y
   **borraría la preferencia** antes de que la hidratación llegara a leerla —el
   guardado con un conjunto vacío borra la entrada, a propósito—. Se escribe
   solo donde de verdad cambia algo: al alternar y al desplegar el del documento
   abierto.
2. **El espacio del documento abierto se despliega SOLO, y es un cambio de
   estado de verdad**, no una expansión forzada al pintar. Forzándola, mientras
   ese documento estuviera abierto el clic en la cabecera no haría nada visible
   y no habría forma de plegar ese espacio: un callejón sin salida. Y el efecto
   depende **solo** del espacio abierto — con el conjunto en sus dependencias,
   plegarlo a mano lo volvería a desplegar en el acto.
3. **`desplegarElEspacio` devuelve `null` cuando no había nada que desplegar.**
   Se llama en cada cambio de documento abierto y casi siempre su espacio ya
   está desplegado; devolviendo un conjunto nuevo igual al anterior se
   escribiría en `localStorage` y se repintaría el árbol entero en cada clic del
   árbol, para no cambiar nada.
4. **El estado vive en `DocumentacionClient`, no en cada espacio.** El conjunto
   entero se guarda bajo **una** llave, así que con el estado dentro de cada
   espacio varios escribiendo esa misma llave a la vez se pisarían y la
   preferencia se perdería sin que nadie se entere.
5. **Lo que no se entienda cae en «nada plegado».** Un valor rancio, de otra
   forma o de otra versión no puede esconder espacios: se ve de más, nunca de
   menos. Un árbol que esconde un espacio por un dato viejo se lee como que ese
   espacio desapareció.

**Un espacio vacío no enseña flecha y no se pliega** —no hay nada que esconder,
y una flecha ahí es un mando que no hace nada—, así que `desplegado` no es
`!plegado` a secas: un espacio del que se borraron todos sus documentos podría
tener su pliegue guardado de antes y se quedaría con una flecha muerta. Sí
conserva **el hueco** de la flecha, o su icono saldría 18 px a la izquierda del
de al lado y se leería como otro nivel del árbol (es el caso en que un espacio
en blanco SÍ se quiere: la regla de *un `opacity-0` no libera sitio* al revés).

Y **el «+» y el «⋯» son hermanos del nombre, no hijos**, así que pulsarlos no
dispara el plegado y no hace falta cortar ninguna propagación. El día que uno de
los dos se meta dentro del botón, volvería a hacer falta.

Plegado **se desmonta, no se esconde**: aquí no hay nada vivo que preservar —ni
un `<audio>` sonando, como en la reunión— y un árbol con veinte espacios
cerrados no tiene por qué seguir pintando sus filas ni montando su `DndContext`.

Medido en Chromium sobre el CSS del build, las 24 combinaciones —cuatro
anchuras por seis variantes—. La flecha le quita **18 px** al nombre (sus 14 más
el hueco de 4) y **la cabecera no cambia de alto**:

| ventana | columna | nombre antes | nombre ahora | alto | ¿se corta? |
| --- | --- | --- | --- | --- | --- |
| 1440 | 320 | 213 | **195** | 32 px | no |
| 1280 | 320 | 213 | **195** | 32 px | no |
| 1024 | 288 | 181 | **163** | 32 px | sí, ya antes |
| 390 | 288 | 181 | **163** | 32 px | sí, ya antes |

Un espacio vacío mide **lo mismo** que uno con flecha —163 y 195—, que es para
lo que está el hueco; la flecha sale a 90° desplegada y a 0° plegada; plegado no
hay lista en el DOM; y nada desborda en ninguna de las 24.

### Y el banco corre en dos modos, con las consultas VIEJAS al lado

`lib/__tests__/documentacion-db.test.mjs`, contra Postgres de verdad. Lo que no
se puede probar en memoria es justo lo que importa: que no desaparece ni una
fila, y que el documento de un espacio borrado **ya no se cuela**. Ese segundo
caso lleva dentro las consultas tal cual estaban antes del cambio y **afirma que
con ellas la fuga se reproduce** —la búsqueda lo encuentra y el retroenlace lo
enseña—. Sin ese modo no se sabría si lo verde de al lado es que se arregló la
causa o que el caso no llegaba a ejercerla. Comprobado: con el arreglo quitado,
el banco se pone rojo por los dos sitios.

Y una del propio banco, que costó una vuelta: **la base se reutiliza entre
ejecuciones**, así que un `refId` fijo hace que la segunda vuelta encuentre
también los de la primera y el modo roto falle por acumulación en vez de por lo
que viene a probar. Los ids que se comparan a lo ancho de la tabla llevan
sufijo de la vuelta.

## Compartir: hay TRES implementaciones, y esto no añadió la cuarta

Documentación tenía permisos por espacio y le faltaba todo lo demás. Al ir a
añadirlo apareció lo que hay que decir antes que nada, porque es lo que decide
cómo se hace todo lo de abajo:

> **En este repositorio hay tres formas de compartir, con tres tablas, tres
> listas de candidatos y tres diálogos.** No son una que se copió mal: cada una
> contesta una pregunta distinta, y fundirlas sería un frente aparte.

| | tabla | con quién | quién decide | diálogo |
| --- | --- | --- | --- | --- |
| **Notas** | `note_shares` (`noteId`, `userId`, `canEdit`, `isPinned`, `order`) | cuentas del EQUIPO (`getTeamIds`) | `elDuenoDeLasNotas` + `identidadesQueRecibenCompartidos` | `ShareNoteDialog`, tres niveles |
| **Proyectos y Diagramas** | `project_shares` / `flow_shares` (`permiso`) | otras CUENTAS (`cuentasParaCompartir`) | `accesoAlProyecto` / `flow-visibility` | `CompartirConCuentasDialog` |
| **Documentación** | `doc_permisos` (`objetoTipo`, `objetoId`, `sujetoTipo`, `sujetoId`, `permiso`) | personas **y** cuentas de la familia | `accesoAEsteEspacio` / `accesoAEsteDocumento` | los dos de arriba, ahora |

Y la diferencia que importa no es la tabla: **es la puerta**. Las treinta
acciones de Documentación **no pasan por `lib/cuenta-de-la-accion.ts`**, que es
por donde van las 129 del resto de la App. La suya pregunta una cosa más —«¿y
este espacio?», «¿y este documento?»— y además reparte tres respuestas
(`puedeEditar`, `puedeGestionar`, `puedeMandar`) donde aquella da una.

> **De ahí sale la regla de esta vuelta: lo que se comparta se escribe en
> `doc_permisos` y en ninguna otra tabla.** Un compartir guardado en
> `project_shares`, o en una tabla propia del diálogo, sería un acceso que
> `accesoAlDocumento` **no mira**: el documento se abriría sin que la puerta
> hubiera dicho que sí. Por eso lo que se reutiliza son los **componentes**, no
> los almacenes.

### Qué se reutilizó, y qué se sacó de donde estaba

Nada de esto se copió. Lo que estaba dentro de una pantalla salió a un sitio
común y la pantalla de origen lo importa —o sea que si se rompe, se rompe en
las dos y se nota—:

| qué | de dónde salió | quién lo usa ahora |
| --- | --- | --- |
| los tres niveles (Sin acceso / Solo lectura / Puede editar) | `ShareNoteDialog` | `components/shared/NivelesDeAcceso.tsx` + `lib/niveles-de-acceso.ts` |
| el walker de tiptap a markdown | `NotesEditor.extractMarkdown` | `lib/exportar-documento.ts` |
| el diálogo de compartir con cuentas | ya era compartido | `CompartirConCuentas` le pone `cargar`/`guardar` |
| el orden por arrastre | `orden_en_tablero` | un `tipo` más, `arbol` |

**Los rótulos de Notas NO se renombraron en la base.** `note_shares` guarda
`none`/`read`/`edit` desde el primer día, y cambiar esa columna sería una
migración de una tabla viva para no cambiar nada; se traduce **en el borde**,
con dos mapas al entrar y al salir del componente.

### Personas aquí, cuentas allá: dos diálogos, no una lista mezclada

El de Documentación mezclaba personas y cuentas en la misma lista, y eso es
pedirle a quien reparte que adivine la diferencia: **con una cuenta entra su
equipo ENTERO** —lo que hace falta para dárselo a un cliente, porque quien
comparte no administra ese equipo y no puede acordarse de añadir a cada uno que
entre después— y **con una persona, solo ella**.

Ahora son dos puertas con dos públicos, y las dos escriben en `doc_permisos`:

- **«Compartir con el equipo»** — personas, con los tres niveles.
- **«Compartir con otra cuenta»** — el diálogo de Proyectos y Diagramas.

Y de ahí sale un cambio que **deshace media regla anterior, a propósito**: el
buscador ya **no** ofrece a quien ya tiene acceso. La razón por la que antes sí
lo ofrecía —marcado con «Ya tiene acceso»— está escrita en
`loQueSeOfreceParaCompartir` y era que *la lista de arriba solo sabía quitar*,
así que esconderlo dejaba sin forma de pasar de lectura a edición. Con los tres
niveles en cada fila esa razón desapareció. **Si algún día la fila de arriba
vuelve a ser solo una papelera, hay que volver a ofrecerlos.**

Tres cosas más de este lado:

1. **Guardar las CUENTAS no toca las filas de PERSONA.** `reemplazarLasCuentas`
   manda la lista entera —«estas y solo estas», que es lo que ese diálogo
   envía— y su `DELETE` lleva `sujetoTipo = 'cuenta'`. Sin esa condición,
   guardar «con qué cuentas» le quitaría el acceso a la gente a la que se lo
   dieron por su nombre, y nadie relacionaría las dos cosas.
2. **Va en una transacción.** Con el `DELETE` y el `INSERT` sueltos, un fallo
   entre los dos deja el objeto sin compartir con nadie: una pérdida de acceso
   silenciosa.
3. **Una cuenta que no se ofrece se filtra y se dice, no tira la petición.** Un
   id rancio del navegador no puede llevarse por delante el guardado bueno de
   al lado; es lo que ya se hace con los seguimientos de otra línea.

### Fijar y archivar: dos columnas, y DOS puertas distintas

`doc_documentos` recibe `fijado` y `archivadoEn` con
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` —la tabla ya está en producción y un
`CREATE TABLE IF NOT EXISTS` no toca una que ya existe—. `archivadoEn` es una
**fecha** y no un booleano, como `borradoEn` del espacio: un booleano dice que
está archivado y no dice desde cuándo, que es justo lo que se pregunta al
mirar una lista de archivados.

Y las puertas no son la misma, que es lo que más fácil se iguala sin pensar:

| | puerta | por qué |
| --- | --- | --- |
| **fijar** | `puedeEditar` | fijar es colocar, y colocar es lo que ya deja hacer arrastrar dentro del espacio. Con `puedeGestionar`, quien tiene edición podría mover y no fijar: no se lee como un permiso, se lee como un botón que a veces no va. |
| **archivar** | `puedeGestionar` | lo esconde para **todo el equipo**, no solo para quien pulsa. Con la puerta de editar, cualquiera con escritura haría desaparecer del árbol la documentación de sus compañeros, y desde fuera eso no se distingue de un borrado. |

Cuatro cosas más:

1. **No entran por `guardarDocumento`.** Aquel lleva su candado de versión
   porque lo que se pisa allí es el párrafo de otro; aquí se cambia dónde vive
   el documento, no su cuerpo. Metiéndolo en el guardado, fijar desde el árbol
   fallaría con «alguien lo cambió mientras tanto» cada vez que hubiera una
   pestaña con ese documento abierta.
2. **Y no escriben una versión.** El historial es de lo que *dice* el
   documento; una entrada «v12 — se archivó» ensucia justo lo que se mira para
   volver atrás.
3. **Un archivado sale de la BÚSQUEDA, no solo del árbol.** Si la búsqueda lo
   siguiera devolviendo, archivar no serviría para nada — y quien lo encontrara
   no sabría por qué no está en el árbol. Se llega a él con el interruptor
   «Ver archivados», que **pide el árbol otra vez al servidor**: un filtro que
   vive un paso después del servidor no es un filtro, lo que viaja es la lista
   entera.
4. **Los fijados van por ENCIMA del orden puesto a mano**
   (`conLosFijadosArriba`, después de `ordenarLaColumna`). Fijar no es una
   posición, es una banda: metiéndolo dentro del orden habría que reescribir
   las posiciones del espacio entero cada vez que alguien fija algo, y entonces
   desfijar dejaría el documento donde lo puso la chincheta y no donde estaba.

### El orden del árbol es de la CUENTA, y por eso no va en `doc_espacios.orden`

La columna existe y sigue ahí —da el orden de partida, por creación—, pero **no
puede ser la que manda**: un espacio compartido sale en el árbol de dos cuentas
y una sola columna solo guarda una posición, así que moverlo en una se lo
movería a la otra. Es exactamente lo que ya explica
`lib/orden-de-las-tarjetas.ts` para la rejilla de Proyectos y Diagramas: **una
cosa compartida tiene UNA fila y DOS sitios.**

Va en `orden_en_tablero` con un `tipo` nuevo, **`arbol`**, y `tableroId` = la
cuenta de quien mira. Es el único de los cinco tipos cuya llave es una cuenta y
no una cosa, y está escrito al lado de la lista para que no se lea como un
descuido. Y entra ahí y no en `work_item_order` —que es la tabla «por pareja
cuenta + cosa»— porque aquella se discrimina con `TipoDeCarpeta`, y ensancharlo
metería un tipo de tarjeta en las Carpetas, que no tienen espacios. Con esto,
Documentación usa **un solo mecanismo** para sus dos órdenes.

Cuatro cosas que hay que mantener:

1. **Se arrastra por un ASA, no por la fila.** La cabecera de un espacio es un
   botón que pliega, con el «+» y el «⋯» al lado: sin asa, cada pulsación
   competiría con un arrastre.
2. **Y hay Subir y Bajar en el menú, que no son un adorno.** En un táctil,
   arrastrar una fila de un árbol que además se desplaza es justo lo que no se
   puede hacer con el dedo. El primero no sube y el último no baja, y la opción
   **se quita**, no se pinta en gris.
3. **Los dos guardan la lista ENTERA**, no un intercambio de dos posiciones:
   cada escritura es una foto coherente, que es lo que hace que dos personas
   reordenando a la vez acaben en un orden que vio alguien.
4. **Un `agente` no ordena** —participa, no manda— y **no se pide
   `canManageWorkspace`**, que es más estrecho: un miembro del equipo cuyo
   `advisorRole` no es ni `administrador` ni `agente` crea espacios hoy, y con
   aquella condición se quedaría con un árbol que no puede colocar. Es la misma
   mitad que `puedeMandarEnElEspacio` ya tenía escrita.

#### Medido en Chromium, sobre el CSS del build

El asa y las dos marcas nuevas le quitan ancho al nombre, que es lo que hay que
mirar en una columna que ya iba justa. Ninguna de las dos **cambia el alto**, y
eso es lo que importa: una fila más alta en un árbol de cuarenta documentos son
cuarenta filas menos a la vista.

| | 1440 / 1280 (aside 320) | 1024 / 390 (aside 288) |
| --- | --- | --- |
| nombre del espacio, antes | 195 px | 163 px |
| nombre del espacio, con el asa | **177 px** | **145 px** |
| alto de la cabecera | 24 px, antes y después | 24 px |

Y en la fila de un documento, cada marca cuesta **20 px** del título —12 del
icono más su hueco—, con el alto clavado en **32 px** en los cuatro casos:

| marcas | 1440 / 1280 | 1024 / 390 |
| --- | --- | --- |
| ninguna | 257 px | 225 px |
| escudo (restringido) | 237 px | 205 px |
| + chincheta | 217 px | 185 px |
| + archivado | 197 px | 165 px |

El nombre recorta con «…» y va entero en el `title`, y **nada desborda a lo
ancho** en ninguna de las ocho combinaciones. Lo que no se mide aquí es un
espacio con el asa *y* la insignia «De otra cuenta»: en uno recibido
`puedeOrdenarElArbol` decide el asa y la insignia decide lo otro, así que la
combinación existe — y cabe, porque el asa son los mismos 18 px que ya se
descontaron arriba.

#### Dos `DndContext` anidados, y por qué aquí SÍ se puede

La regla de los tableros dice que dos contextos anidados se roban los eventos,
y aquí hay dos: el del árbol, que monta la pantalla, y el de los documentos de
cada espacio. No se pisan porque **ningún nodo pertenece a los dos**: la
cabecera del espacio está fuera del contexto de dentro, que solo envuelve la
lista de documentos. Lo que aquella regla prohíbe es un nodo compartido.

### Exportar: en el NAVEGADOR, y sin ninguna acción nueva

El cuerpo y las filas ya están cargados —es lo que se está leyendo—, así que
una acción de servidor para esto sería un viaje para devolver lo que el
navegador ya tiene, y encima una puerta más que mantener. Y **sale siempre**,
también en uno recibido de solo lectura: bajarse una copia de lo que ya se está
leyendo no cambia nada de nadie.

Lo que el walker de Notas no sabía hacer, y son los dos casos que el banco
protege:

1. **La MENCIÓN.** Es un átomo, así que `node.content` está vacío: sin su rama
   desaparecía del fichero, y un `.md` que dice menos que el documento del que
   salió es peor que uno feo.
2. **Las LISTAS.** Un documento de tipo `lista` no tiene cuerpo: tiene filas en
   `doc_filas`. Exportar su `contenido` daba un fichero en blanco. Salen como
   tabla de markdown, con las barras y los saltos escapados —una barra dentro
   de una celda parte la tabla en columnas que nadie pidió—.

**Y el recorrido es ITERATIVO, nunca recursivo.** Lo cazó el banco con 20.000
niveles: la primera versión era recursiva y reventaba con «Maximum call stack
size exceeded», o sea la pestaña de quien pulsa «Exportar» caída sin ninguna
explicación. Es la misma decisión y el mismo motivo que `leerElContenido`, que
lee este mismo árbol para indexarlo — el contenido llega del navegador y su
hondura no es de fiar.

Y una asimetría del texto plano que no es un descuido: se pierden las
almohadillas de un encabezado y las comillas de una cita —eso es marcado, y el
título se lee igual— pero **se conservan los guiones de una lista**, porque sin
ellos cinco puntos seguidos se leen como un párrafo.

### Lo que NO se hizo, y por qué

- **«Compartir con contactos» no existe aquí, y no es un olvido.** En Notas un
  «contacto» no es alguien con quien se comparta: es un **vínculo** a un lead de
  WhatsApp (`contactJid`), y esa persona no tiene sesión en la plataforma, así
  que no hay nada que abrirle. Documentación ya tiene ese vínculo, y mejor: las
  **menciones** (`@cliente`, `@tarea`, `@ticket`) con su retroenlace desde la
  ficha. Montar además un `contactJid` sería un segundo mecanismo para lo mismo.
- **Las tres implementaciones de compartir no se fundieron.** Unificarlas es
  mover `note_shares` y `project_shares` a un modelo con `sujetoTipo`, migrar
  las filas de dos tablas vivas y volver a pasar por las puertas de tres
  módulos. Es un frente aparte y se dice aquí para que no se dé por revisado.

### El banco ejerce las ACCIONES, no las consultas

`lib/__tests__/documentacion-compartir.test.mjs`, contra Postgres y con la
malla de `linked_accounts` dentro. Probando `lib/documentacion-db.ts` a secas
se estaría probando justo el lado que **no tiene puerta**; lo que hay que
demostrar es que lo nuevo pasa por `accesoAEsteEspacio`. Lo único que se finge
son `currentUser()`, `revalidatePath` y el `cache()` de React —los tres piden
una petición de Next y ninguno decide nada—.

Los tres puntos de vista que se piden, y lo que cada uno destapó:

| quién | qué se comprueba |
| --- | --- |
| la **madre** | comparte, ordena su árbol y manda en lo suyo |
| la **hija** —y su administrador con SU id— | lo ve recibido, escribe con edición, y **no reparte** |
| **sin permiso** en el espacio | no lo ve, y fijar, archivar, compartir y leer las cuentas le contestan que no — y **no se escribió ninguna fila** |

Y dos casos que valen por el resto: **con edición se fija pero no se archiva**
—las dos puertas distintas, ejercidas— y **cada cuenta coloca su árbol sin
mover el de la otra**, que es la decisión de la llave puesta a prueba.

Una del propio banco, que ya costó una vuelta en el del sufijo de dispositivo y
volvió a costarla aquí: **la base se reutiliza entre ejecuciones**, así que los
ids llevan el sello de la vuelta y **no se afirma sobre la lista completa** de
un árbol —lleva dentro lo que compartieron los casos de arriba—. Se compara el
orden **relativo** de lo que ese caso creó; lo contrario es afirmar sobre el
orden en que corre el banco.

## Documentación: las CARPETAS, y por qué la pertenencia no es una columna

Los espacios eran la capa de más arriba y no se podían agrupar, así que la
barra lateral se llenaba de espacios sueltos que en realidad son un mismo
bloque. Encima de ellos hay ahora una capa de carpetas: una carpeta contiene
espacios, y un espacio sigue conteniendo documentos como hasta ahora.

**Una sola capa**, y no es una limitación temporal: dos niveles ya ordenan una
barra de veinte espacios, y anidar carpetas trae consigo moverlas unas dentro
de otras, los ciclos, el «¿hasta dónde pliego?» y un sangrado que a la tercera
capa no cabe en 18 rem.

### La pertenencia es de la pareja CUENTA + ESPACIO

Lo obvio es una columna `carpetaId` en `doc_espacios`. **No vale**, y es la
misma razón que ya obligó a sacar de ahí el orden del árbol:

> **Una cosa compartida tiene UNA fila y DOS sitios.** Un espacio compartido
> sale en el árbol de la cuenta dueña y en el de la invitada, y cada una lo
> archiva donde le sirve. Con una columna en la fila solo cabe una carpeta, así
> que moverlo en una cuenta se lo movería a la otra — **a una carpeta que en la
> otra cuenta ni existe**, o sea un espacio desaparecido sin que nadie lo haya
> borrado.

Así que son **dos tablas de la App** con `CREATE TABLE IF NOT EXISTS` y sin
clave foránea: `doc_carpetas` —que sí lleva su `cuentaId` dentro, porque una
carpeta es de una cuenta y solo la ve ella— y `doc_espacio_en_carpeta`, cuya
clave primaria es `(cuentaId, espacioId)`. Esa clave es además por donde se lee
el mapa entero y por donde se borra una carpeta, así que no hace falta ningún
índice más.

Lo comprueba el banco con el caso real: la cuenta hija archiva un espacio que
le compartieron y **la madre no ve nada cambiar**.

### Y una carpeta que no está deja su espacio SUELTO, nunca escondido

Es el invariante del que cuelga todo lo demás, y tiene su propio modo roto:

> **Ningún espacio puede desaparecer del árbol por culpa de su carpeta.**

Un `carpetaId` puede apuntar a algo que no está por dos caminos perfectamente
normales: la carpeta se borró —y borrarla **no** borra sus espacios, que es el
encargo— o es de otra cuenta. En los dos, el espacio sale **suelto y a la
vista**. Lo decide `agruparElArbol` (`lib/carpetas-de-documentacion.ts`, puro).

La forma ingenua —un `Map` por carpeta y meter dentro lo que le toca— se
escribe sola y **pierde justo esos espacios, en silencio**. Está en el banco
como `MODO=roto`, afirmando la desaparición: sin ese modo no se sabría si lo
verde de al lado es que la regla se cumple o que el caso no llega a ejercerse.

Y de ahí sale que `laColumnaDelEspacio` sea una función y no un
`enCarpeta[id] ?? SUELTOS` escrito a mano: **tiene que decir lo mismo que
`agruparElArbol`**. Si discreparan, el arrastre creería que un espacio vive en
una columna que no se pinta en ninguna parte y se rendiría sin decir nada — o
sea «el espacio no se queda donde lo dejo». El banco las encadena.

### Borrar la carpeta no toca `doc_espacios`, y eso se comprueba en la base

`borrarCarpeta` borra su fila y las de pertenencia, en una transacción, y **no
escribe en `doc_espacios` por ningún lado**, ni siquiera su `borradoEn`. El
banco lo afirma leyendo las filas después: los espacios siguen enteros y con
`borradoEn` en nulo. Eso es lo que un banco de funciones puras no podría decir.

El orden de dentro de la transacción no es indiferente, porque puede fallar a
medias: **primero la pertenencia y después la carpeta**. Cayéndose en medio
queda una carpeta vacía, que se ve y se vuelve a borrar; al revés quedarían
filas apuntando a una carpeta que ya no está — inofensivas también, porque el
reparto las trata como sueltas, pero invisibles.

Y el diálogo **dice lo que hace**: «no se borra ningún espacio ni ningún
documento», con el número de los que van a quedar sueltos delante. «¿Se van a
borrar mis documentos?» es exactamente lo que se pregunta quien pulsa eso, y un
diálogo que no lo contesta se cancela.

### La puerta es la del ÁRBOL, no la del espacio

`puedeMandarEnElArbol` —dueño, administrador y cualquiera del equipo que no sea
un `agente`— y es **una sola función** con cuatro llamadores: crear, renombrar
y borrar una carpeta, mover un espacio, y las dos guardas del orden
(`arbol` y `carpetas`). Con la condición copiada en cada una, a la quinta se le
pasa; es cómo se acabó teniendo un chat que se podía anclar y no se podía
borrar.

**Y no es `puedeMandarEnElEspacio`**, que es la de renombrar o borrar UN
espacio. Aquella vale `false` en uno recibido a propósito —el reparto sigue
siendo de quien lo hizo— y con ella no se podría archivar un espacio
compartido, que es justo el caso que llena la barra lateral. Archivar es
ordenar la vista de ESTA cuenta, no tocar el espacio de nadie.

Lo que sí se comprueba al mover es que **la carpeta sea de esta cuenta** y que
**el espacio se alcance de verdad**, con la misma función que pinta el árbol.
Sin lo primero, una petición a mano metería el espacio en una carpeta que su
dueña no pinta.

### El orden: un tipo más en `orden_en_tablero`, no un mecanismo nuevo

Las carpetas se colocan con `tipo: "carpetas"` y `tableroId` = la cuenta, al
lado del `arbol` que ya colocaba los espacios. Dos formas de guardar la misma
posición son una que se afina y otra que se queda atrás.

Son **dos tipos y no uno** porque son dos listas distintas: las carpetas se
ordenan entre ellas y los espacios entre los de su grupo. Mezclando los ids en
una sola columna, mover una carpeta tendría que saber cuántos espacios hay
debajo de cada una.

Y de ahí sale que **no hiciera falta migrar nada**: el orden de los espacios
sigue siendo el mismo número de siempre, solo que ahora se compara **dentro de
su grupo**. Es la regla de los dos tableros —*el número es del tablero; la
comparación, de la columna*— aplicada aquí, y es lo que hace que crear la
primera carpeta no cambie el orden de nada.

### El arrastre reutiliza `resolverElArrastre`: carpetas = columnas

Los espacios se arrastran entre carpetas y fuera, y la decisión no se vuelve a
escribir: aquí las carpetas son **columnas** y los espacios **tarjetas**, con
un centinela `SUELTOS` para los que no están en ninguna. Es el mismo resolvedor
de Proyectos y Tickets.

Un solo `DndContext` con varios `SortableContext` dentro —uno por carpeta y
otro para los sueltos—, que es como funciona cualquier tablero de esta casa.
Los documentos de cada espacio siguen en el suyo y no se pisan: ningún nodo
pertenece a los dos.

Cuatro cosas que hay que mantener:

1. **Una carpeta NO se arrastra: se sube y se baja.** En un solo contexto su id
   sería a la vez una columna donde se suelta y una tarjeta que se mueve, y
   soltar un espacio «sobre» una carpeta que a su vez se está arrastrando no
   tiene respuesta correcta. Subir y Bajar no es el premio de consolación: es lo
   que este árbol ya usa para los espacios y **lo único que funciona en un
   táctil**.
2. **Los sueltos son una columna con su propio sitio donde soltar**, con alto
   mínimo cuando hay carpetas. Sin ella un espacio se podría meter en una
   carpeta y **no sacar**, que es la mitad del encargo que se olvida.
3. **Al cambiar de carpeta, el espacio va al final de la nueva**
   (`ponerAlFinal`), como una tarjeta que cambia de columna. Sin eso se queda
   con el número de la columna anterior y aparece en mitad de la nueva.
4. **Subir y Bajar mueven dentro de SU grupo**, no del árbol entero: Subir en
   el primero de una carpeta no tiene a dónde ir.

### Plegar: un solo módulo para las dos capas, y la llave de los espacios NO cambió

`lib/plegado-de-espacios.ts` pasó a ser `lib/plegado-del-arbol.ts`, con un
discriminante (`espacios` | `carpetas`). No son dos módulos copiados a
propósito: la parte delicada —el `try` de cada acceso, el borrado de la entrada
al quedarse vacía, el `null` cuando no había nada que desplegar— es idéntica, y
con dos copias el día que se afine una la otra se queda atrás.

Lo que **no se pudo tocar** es la llave de los espacios: sigue siendo
`documentacion_espacios_plegados_<cuenta>::<persona>`, carácter por carácter. Si
hubiera cambiado, todo el mundo habría perdido de golpe lo que tenía plegado el
día del despliegue —sin error y sin forma de relacionarlo con el cambio—. El
banco compara la cadena entera.

Son **dos conjuntos y dos llaves**: plegar la carpeta «Operaciones» no puede
plegar el espacio que se llame igual. Y **la carpeta del documento abierto se
despliega sola**, además del espacio: sin esa mitad, abrir un documento de un
espacio que vive en una carpeta plegada desplegaría el espacio dentro de una
carpeta que sigue cerrada, o sea nada visible.

### Y un `CREATE … IF NOT EXISTS` no basta con DOS réplicas

Esto lo destapó el banco al empezar a correr dos ficheros contra la misma base,
y **es un fallo de producción, no del banco**: `IF NOT EXISTS` mira el catálogo
al empezar, así que dos sesiones que lo ejecuten a la vez pasan las dos esa
comprobación y la segunda revienta al escribir en `pg_class` o en `pg_type`
—`23505`, «Key (relname, relnamespace)=(…) already exists»—.

No es una condición de laboratorio: esta plataforma corre con **dos réplicas** y
el despliegue es `start-first`, así que dos procesos pueden pedirle a
Documentación su primera consulta en el mismo segundo. Lo que se vería es lo de
siempre en esta familia: «No se pudo crear la carpeta» en la pantalla y un error
de clave duplicada en la consola que no se parece en nada a lo que se hizo.

Cada DDL va por `ddl(...)`, que **solo se traga «ya existe»** —23505, 42P07 y
42710, que significan lo mismo— y deja subir cualquier otro error. Si se escribe
otro módulo con sus propias tablas, va igual.

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

## La salida es la línea de la CONVERSACIÓN, y se resuelve AL ENVIAR

Un cliente escribe por **Verzay | Atención**, el asesor contesta desde la
plataforma… y el mensaje sale por otra línea. Igual la llamada. Desde fuera no
hay ningún error: el mensaje se envía, el cliente lo recibe **de un número que
no conoce**, y la burbuja de la llamada aparece en otra conversación.

**El servidor nunca tuvo la culpa.** `resolverContexto` resuelve la clave de la
cuenta dueña de `context.instanceName` y `sendOutgoingPayload` y
`persistOutgoingHistory` van todos por ahí: lo que le llegue, eso respeta. El
que se equivocaba era el navegador, al decirle **por cuál**.

### Lo que decidía: un `useRef` escrito en UN SOLO camino

```ts
result = await (activeActionSetRef.current?.sendText ?? sendAnyAction)(sendJid, payload);
```

`activeActionSetRef` se escribe **solo** dentro de `handleSelectFromSidebar`. Y
`sendAnyAction` está atado en la página a `pickWhatsappOrNull(instancias)`, o
sea **la primera línea de la cuenta de quien mira**. Así que cualquier forma de
abrir una conversación que no sea pulsarla en la bandeja dejaba el ref en `null`
y la respuesta salía por la línea equivocada:

| cómo se abre | qué pasaba |
| --- | --- |
| enlace `?jid=` —el que escribe *Chats → equipo*, y el aterrizaje de un aviso— | el estado se siembra directo y el efecto que llamaría a `handleSelectFromSidebar` sale por `if (selectedJid)`: **nadie escribe la línea** |
| un contacto que no entró en la página cargada de la bandeja (tope de 300) | `selectedContact` es `undefined` y `effectiveInstanceName` cae en la línea de la página, que además se escribe en `info` |
| el reloj reabriendo el chat (`selectFromSidebarRef.current?.(jid)`) | iba **sin línea**, así que buscaba el contacto solo por número y podía quedarse con el de la otra línea |

Y esa `info.instanceName` equivocada **se propagaba**: la cabecera la usa para
el botón de llamar y el caché de mensajes se escribe con ella.

> **La línea de salida es la de la CONVERSACIÓN, y se resuelve AL ENVIAR, no al
> seleccionar.** Lo decide `lib/linea-de-la-conversacion.ts`, que es puro:
> `laLineaDeLaConversacion` mira, por ese orden, **el contacto abierto, la línea
> seleccionada y `info`** —tres formas de la misma cosa, y con tres el día que
> una se quede sin escribir las otras contestan—, y `porDondeSaleLaRespuesta`
> busca su juego de acciones. Los tres envíos y la plantilla de Meta pasan por
> ahí.

Y lo que no se puede ablandar:

> **Cuando la línea se conoce y no hay con qué enviar por ella, NO se envía: se
> dice.** Mandarlo por otra es escribirle al cliente desde un número que no es
> el suyo, y eso no produce ningún error en ninguna capa. Solo el caso de
> verdad desconocido —`sin-linea`— cae en el respaldo de siempre, y entonces
> sale un `console.warn`.

### Y el estado nace sembrado, que es la causa raíz

Resolver al enviar arregla el envío; lo que arregla **todo lo demás que cuelga
de la línea** —leer el historial, la presencia, el caché, el botón de llamar de
la cabecera— es que `selectedInstanceName`, `info.instanceName` y el propio
`activeActionSetRef` **nazcan con la línea de `initialSelectedChat`** en vez de
en `null` y con la línea de la página. Y que el reloj reabra el chat **con su
línea**.

### Las llamadas: tres agujeros, y ninguno era `sidParaLlamar`

`sidParaLlamar` ya estaba bien desde *se llama con el número de la línea, no con
el de quien mira*. Lo que fallaba estaba antes y después:

1. **`CallDialog` resolvía la línea y después la tiraba.** Calculaba `effName`
   —de la prop, o de la cuenta gestionada cuando quien llama no la pasa— y
   luego hacía `startAstraCall(\`+${phone}\`, instanceName)`, **con la prop en
   crudo**. Desde una burbuja o desde el CRM eso es `undefined`, así que se
   llamaba con el número propio. Va `effName`.
2. **«Devolver llamada» de una burbuja no pasaba línea ninguna.** Baja por
   **contexto** (`useConversacionDeLaNota`, el mismo que ya le lleva la
   conversación al botón de transcribir una nota) y no por props: `MessageBubble`
   está al fondo de tres componentes memoizados, y atravesarlos sería tocar la
   firma de cada fila — lo que prohíbe *la lista es grande, no rehacerla por
   gusto*. El contexto gana un campo, `instanceType`.
3. **`logOutgoingCallAction` no recibía la línea.** Escribía la burbuja con
   `userId = getCallAccountUserId()` y la línea por QR **de esa** cuenta, así
   que llamando desde una conversación de otra línea el registro caía en **otra
   conversación**: se escribía perfectamente y en la que se tenía delante no
   aparecía nada. Ahora recibe la línea, resuelve su dueña y comprueba el
   permiso con `assertCanAccessTargetUser` —la misma puerta que `sidParaLlamar`—;
   sin permiso, o sin línea, se cae a lo de antes. **Perder el registro sería
   peor que escribirlo donde ya se escribía.**

### El banco, en dos modos

`scripts/banco-linea-de-la-conversacion.sh`, y son **tres mitades** porque el
fallo vive en tres capas:

- **La decisión**, pura y sin base, con el resolvedor viejo escrito al lado: un
  ref que solo se escribe al pulsar en la lista, y que abriendo por enlace
  devuelve la línea de la cuenta.
- **El código de verdad**, leído del fichero: que los tres envíos ya no
  consultan `activeActionSetRef`, que el estado nace sembrado, que `CallDialog`
  llama con `effName` y registra con su línea, y que la burbuja pasa la suya.
  En `MODO=roto` **los mismos ficheros se leen de `origin/main`** —no de
  `HEAD`, que en cuanto esto se comitee sería ya la versión nueva— y se afirma
  que el fallo está ahí.
- **Las acciones contra Postgres**, con la malla de `linked_accounts` dentro y
  el `fetch` apuntado para poder afirmar **a qué sesión de llamadas se habló**:
  con la línea ajena se llama con el número de su cuenta y la burbuja se anota
  bajo ella; sin línea, con el propio y bajo la propia.

Lo que **no** se puede ejercer aquí, y se dice: `sendManualChatPayloadAction`
necesita hablar con Evolution o con Waha, así que el envío de verdad no se
prueba contra un proveedor. Lo que sí se prueba es lo único que estaba mal —qué
contexto se elige— y que el servidor respeta el que le llegue ya estaba cubierto
por la forma de `resolverContexto`.

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

### Y la pregunta de ANTES: no «¿qué proveedor?», sino «¿la tiene?»

El mismo patrón, una capa más arriba y con un síntoma peor. El diálogo
**«Asistente de voz IA»** de Perfil → Conexión guardaba la voz y el número de
transferencia y contestaba

> No tienes una cuenta de WhatsApp vinculada.

con la línea de esa misma cuenta **ahí arriba, en la misma pantalla, diciendo
Conectado** — y con el proveedor de llamadas reportándola conectada también.
Desvincular y volver a vincular no lo arreglaba, y **no podía**: ese botón toca
la sesión de llamadas (`User.astra_calls_sid`), que no es lo que esa acción
estaba mirando.

Lo que miraba era esto:

```ts
db.instancia.findFirst({ where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp'] } } })
```

Y la línea por QR se guarda con **tres formas de la MISMA cosa**: `Whatsapp` si
nació en Evolution, `waha` si nació en WhatsApp Mensajería —**que es como nacen
hoy las nuevas**— o se pasó a ella, y `NULL` en las antiguas, de cuando la
columna no se escribía. `checkActiveInstance` ya cubría las tres, a propósito y
con su comentario al lado; a esta se le había pasado.

Medido en producción, solo lectura:

| | cuentas |
| --- | --- |
| con línea por QR | **31** |
| que ese filtro veía | 21 |
| **invisibles para el voicebot** | **10** |

Y cruzado con quien además tiene número de llamadas vinculado —que es quien
puede llegar a abrir ese diálogo— son **5 de 8**: Carlos \| Arcos,
Verzay \| Notificaciones, Verzay \| Atencion, Horeca Soluciones y
Verzay \| Ventas.

**Y una de ellas ya tenía la configuración guardada sobre su fila de `waha`.**
Verzay \| Ventas la escribió cuando esa línea era de Evolution; al cambiar de
proveedor —que cambia el `instanceType` de la MISMA fila y conserva todo lo
demás— dejó de encontrarse. Desde entonces leerla devuelve los valores por
defecto y guardarla falla. Es exactamente el reporte: funcionaba, dejó de
funcionar, y no hay forma de arreglarlo desde la pantalla.

> **Cuál es la línea por QR de una cuenta lo contesta `lib/linea-de-whatsapp.ts`
> y nadie más.**

#### Se filtra en TypeScript, no con un `in` de casings

El `in` de Prisma distingue mayúsculas, así que una lista de tipos es una lista
de **cómo se escribieron**: basta con que un camino guarde `WhatsApp` para que
se caiga sin decirlo. Se traen las instancias de la cuenta —una o dos, tres en
la que más— y las filtra `esLineaDeWhatsappQr`, que es pura. Así **la consulta y
la regla no pueden discrepar, porque son la misma**.

Y de paso sale gratis lo otro que hacía falta: con la lista delante se puede
decir **qué sí tiene** la cuenta.

#### El aviso NOMBRA lo que falta

Un «No tienes una cuenta de WhatsApp vinculada» a secas es el peor aviso posible
aquí, porque **la cuenta sí tiene WhatsApp conectado** —lo dice la tarjeta de al
lado— y manda a desvincular y volver a vincular, que es justo lo que el reporte
cuenta que se probó. `porQueNoHayLineaQr` distingue los dos casos en que el
aviso **sí** es correcto:

| lo que tiene la cuenta | qué dice |
| --- | --- |
| nada conectado | «no tiene ninguna línea de WhatsApp conectada… conéctala en Conexión → Mensajería WhatsApp (QR)» |
| solo canales que no son QR | «tiene **WhatsApp API oficial (Meta)**, pero el asistente de voz va sobre la línea por QR y esa no está conectada» |

Ese segundo caso es real y es correcto: un canal de Meta Cloud API no es un
número conectado por QR, y las llamadas van por ahí.

#### Y a las hermanas se les había pasado lo mismo

Es la familia de siempre —*a una hermana se le pasa*— y son cuatro sitios más,
los cuatro de Llamadas:

| dónde | qué se veía |
| --- | --- |
| `setCallContactNameAction` | **«No hay instancia de WhatsApp para guardar el nombre»** al nombrar un contacto en CRM → Llamadas |
| `setCallLeadStatusAction` | lo mismo al marcarle un estado al lead |
| `linkMyCallSession` (×2) | la sesión de llamadas nacía sin el nombre de la línea |
| `logOutgoingCallAction` | su lista dejaba fuera `waha`, así que caía en el respaldo «cualquier instancia» y con un canal de Meta al lado podía asociar la llamada al canal equivocado |
| `enviarRespuestaDeLlamadaPerdida` | su lista nombraba `meta` y **no** `waha`: en esas cuentas prefería el canal de Meta, y sin él acababa en la rama de Evolution pidiendo unas credenciales que una línea de Waha no tiene. Desde fuera, la respuesta no salía y decía «Sin credenciales de WhatsApp» |

El último llevaba además media función sin escribir: ahora tiene su rama de
Waha, con `sendWahaText` y su `persistChatMessage`, como el resto de la
plataforma.

#### Y el alcance se pregunta a la fila EFECTIVA, igual que la tarjeta de al lado

El voicebot resolvía la cuenta con `ownerId ?? id` y la tarjeta de llamadas de
esa misma pantalla con `effectiveId`. **Hoy dan lo mismo en las tres ramas de
`currentUser()`** —se comprobó— pero son dos formas de preguntar la misma cosa,
y dos formas es una que se afina y otra que se queda atrás. Va `effectiveId`,
que es lo que `getCallAccountUserId` ya usaba.

Y ahí al lado había uno que **no** daba lo mismo: `startBotCallAction` leía el
`astraCallsSid` de **`me.id`**, la persona. Un asesor —cuya fila no tiene ese
campo y nunca lo va a tener— recibía «No tienes un número de llamadas vinculado»
con el número de su cuenta perfectamente conectado.

#### El banco ejerce las ACCIONES, y el modo roto lleva la consulta vieja dentro

`lib/__tests__/linea-de-whatsapp.test.mjs`, 15 casos contra Postgres
(`scripts/banco-llamadas.sh`). Probar `laLineaDeWhatsappDeLaCuenta` a secas sería
probar el lado que se acaba de escribir; lo que hay que demostrar es que las
acciones pasan por ella, así que se finge **solo `currentUser()`**.

Cubre los tres puntos de vista del encargo —cuenta con sesión conectada (en los
tres tipos), cuenta sin línea, y cuenta **hija** de una familia más su
administrador entrando con su propio id— y lleva dentro la consulta vieja
literal. **Ejercido contra el código de antes se pone en rojo en 9 de los 15**;
los 6 que pasan en los dos modos son justo los que no podían cambiar: la regla
pura, la afirmación del propio modo roto y el caso de Evolution, que siempre
funcionó. Sin ese modo no se sabe si se arregló la causa o algo parecido.

#### Y el BACKEND se quedó con la mitad vieja: «Llamar con IA»

El #841 arregló el lado de la App —`lib/linea-de-whatsapp.ts`, el diálogo del
asistente de voz y sus cuatro hermanas de Llamadas— y **el backend siguió
preguntando por los dos casings**. Un arreglo aplicado en una mitad de un dato
compartido no es un arreglo: es un **desacuerdo**, y este tardó semanas en
reportarse porque el síntoma nombraba la condición contraria.

Desde fuera: en CRM → Llamadas, «Llamar con IA» contestaba

> Activa "Asistente de voz IA" en Conexión → Llamadas primero.

con el interruptor **encendido en la pantalla**, su voz y su número de
transferencia guardados y la línea diciendo Conectado. Y no era el botón: las
llamadas automáticas del flujo (`AI_CALL` al cambiar de etiqueta) tampoco
salían. Los dos caminos terminan en `POST /api/sessions/{sid}/calls/bot` →
wacalls → `VoicebotService.resolve`, así que la comprobación que fallaba era
**una sola y común a los dos** — que es justo lo que el reporte ya intuía.

Lo que había en `resolve`:

```sql
WHERE "userId" = $1 AND ("instanceType" = 'Whatsapp' OR "instanceType" = 'whatsapp')
```

Y la línea por QR se guarda con **tres formas de la misma cosa**: `Whatsapp` /
`evolution` (nació en Evolution), **`waha`** —que es como nacen hoy las nuevas,
y a lo que se pasa al cambiar de proveedor— y `NULL` en las antiguas. De ahí el
«funcionaba y dejó de funcionar»: **cambiar de proveedor no crea una línea
nueva, cambia el `instanceType` de la MISMA fila**, así que la configuración se
quedó donde estaba y este filtro dejó de verla el día del cambio, sin un solo
error en ninguna parte. Es literalmente lo que la sección de arriba mide en
producción: **10 de 31 cuentas con línea por QR** eran invisibles para ese
filtro, y de las que además tienen número de llamadas, **5 de 8**.

Y un segundo desacuerdo, más callado: con dos casings el backend podía
encontrar **otra** fila. Una cuenta con su línea en `waha` (id 5, donde la App
escribió) y un resto de Evolution (id 9) daba id 5 en la App y id 9 aquí:
configuración a un lado, lectura al otro, y el asistente «apagado» sin que
nadie lo hubiera apagado.

> **La regla es la MISMA que la de la App, y es una función pura**
> (`src/modules/voicebot/linea-del-asistente.ts` en el backend, copia exacta de
> `esLineaDeWhatsappQr`): no «¿qué proveedor tiene?», sino «¿la tiene?». Se
> traen las filas de la cuenta y manda la **primera por QR ordenada por `id`**,
> que es exactamente la que elige `laLineaDeWhatsappDeLaCuenta` del otro lado.
> Y se filtra **en TypeScript, no con una lista de casings en SQL**: una lista
> de tipos en el `WHERE` es una lista de cómo se escribieron.

El orden por `id` **no se toca**: es el que ya usaban las dos mitades, así que
las cuentas a las que hoy les funciona siguen leyendo la misma fila. Cambiarlo
movería su configuración a otra línea sin decirlo.

##### La FAMILIA se mira, y solo cuando no hay línea propia

Era la hipótesis del reporte y **no era la causa de este caso** —la cuenta que
lo sufría tiene su propia línea— pero es un hueco real de la misma familia: a
una cuenta se llega por dos caminos y solo uno deja rastro en la fila, así que
la cuenta dueña de la sesión de llamadas puede no ser la que tiene la línea. Se
cierra con la misma malla de `linked_accounts` del #812 (recursiva, en los dos
sentidos, con su tope), y el respaldo es **estrictamente aditivo**:

1. **Si la cuenta tiene alguna línea por QR, manda la suya**, encendida o
   apagada. Un «apagado» explícito **nunca** lo pisa una cuenta hermana: eso
   sería el fallo contrario y peor —el asistente llamando a clientes desde una
   cuenta donde alguien lo apagó a mano—.
2. Solo cuando **no tiene ninguna** se busca en la familia una encendida.

Así esto no puede cambiar el comportamiento de ninguna cuenta a la que hoy le
funcione: únicamente convierte en llamada lo que hoy es un aviso. Y **la
familia solo se consulta en ese caso**: el camino común no paga ni una consulta
de más.

##### El aviso era un cajón de sastre, y por eso se buscó en la pantalla equivocada

`disabled` lo decían **seis** condiciones distintas: la línea no se encontraba,
el asistente estaba apagado, el secreto no coincidía, la URL venía sin `sid`,
el backend no contestaba y la respuesta llegaba sin clave de OpenAI. Las seis
mandaban a encender un interruptor que ya estaba encendido.

- El backend distingue `no_line` de `disabled`, y contesta `bad_secret` y
  `no_sid` donde antes devolvía `{ enabled: false }` a secas —y sin `reason`
  wacalls cae en su valor por defecto, que era `disabled`—.
- wacalls **ya no inventa `disabled`**: sus dos respaldos son `sin_respuesta`
  (no se pudo preguntar) y `no_openai_key`, y escribe el motivo en su registro.
- Y la App les da a los siete sus palabras. **Un aviso que nombra una condición
  que se cumple es peor que no decir nada**: manda a tocar lo que ya estaba
  bien, que es exactamente lo que costó este.

De paso, el interruptor de la tarjeta **deja de mentir**: se pintaba al momento
y no se devolvía si el guardado fallaba, así que la tarjeta decía «activo» y la
llamada decía «actívalo». Ahora vuelve a su sitio con su aviso, igual que al
eliminar un chat.

##### El banco: `scripts/banco-voicebot.sh`, y son dos mitades

- **La decisión**, pura y sin base (`linea-del-asistente.spec.ts`, en
  `npm test`): las tres formas del tipo, la fila que gana con un resto de
  Evolution al lado, y las dos mitades del respaldo de familia.
- **Los dos caminos de verdad**, contra Postgres
  (`__banco__/llamar-con-ia.banco.ts`): `VoicebotService.resolve` y
  `StageAutomationService.doAiCall` **reales**, con `Instancias`, `User` y
  `linked_accounts` sembradas. Cubre los cuatro casos del encargo —desde la
  madre con el asistente en la hija, desde la propia hija, el disparo
  automático por cambio de etiqueta, y el aviso legítimo cuando de verdad está
  apagado o no hay línea por QR—. Del automático se afirma **a qué sesión de
  llamadas se habló**: el mismo `sid` y el mismo endpoint que el botón, que es
  lo que prueba que la puerta es una.

Los dos corren en **dos modos**, y el roto lleva **la consulta vieja escrita
dentro**: sobre esas mismas filas no encuentra nada, que es el aviso que se
reportó. Sin ese modo no se sabría si el verde del otro es que se arregló la
causa o que el caso no se llega a ejercer.

Y el banco de base **apaga las comprobaciones de tipos de ts-jest**, a
propósito y dicho en su cabecera: `npm test` tiene hoy seis suites en rojo por
errores de tipo **preexistentes** en `ai-agent.service.ts`, y `VoicebotService`
lo arrastra por la cadena de dependencias. Sin apagarlas, este banco se pondría
rojo por algo que no tiene nada que ver con lo que prueba. (`uuid` 14 es ESM
puro y jest corre en CJS: por eso el banco lo mapea a un CJS de una página —es
lo mismo que tumba esas seis suites, y aquí solo hace falta que el módulo
cargue.)

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

## Mudar a una persona de cuenta: su id NO cambia, y por eso se mueve poquísimo

Alguien del equipo pasa de una cuenta a otra de la misma familia. La forma de
hacerlo que se escribe sola —arrastrarle los datos— es la equivocada, y saber
por qué es lo que hace que esto sea de cuatro escrituras y no de cuarenta:

> **Lo que se firma se guarda con el id de la PERSONA, y su id no cambia.** Sus
> notas, sus chats tomados, sus comentarios, su historial de actividad, sus
> permisos de documentos, sus menciones, sus suscripciones de aviso y todo lo
> que ella escribió **ya cuelgan de ella** y la siguen sin que nadie los toque.
> Lo que cambia al mudarla es el **ALCANCE**, porque las pantallas acotan por
> `ownerId ?? id`.

Barridos los 130 modelos de Prisma y las 47 tablas de la App, **lo único que es
suyo y está guardado bajo la cuenta son dos cosas**, y las dos se mueven:

| qué | por qué no puede quedarse |
| --- | --- |
| `advisor_clients.owner_user_id` | `clientesDelAsesor` busca por `advisor_user_id`, así que su cartera seguiría funcionando… y Equipo asigna y quita con `where: { advisorUserId, ownerUserId: owner.id }`. Se quedaría con alcance sobre clientes que **desde ninguna pantalla se le puede revocar**. |
| sus filas de `_UserModules` | El armazón, **cuando la persona tiene filas propias, NO las cruza con las de su cuenta**: `if (userModuleRecords.length > 0) modules = allModules.filter(...)`. Sin recortarlas le queda abierto un módulo que la cuenta nueva no tiene. |

Y **lo que no se mueve es lo de la cuenta que deja**: leads, mensajes, tareas,
proyectos, espacios de Documentación, cobros, tickets y canales de área. Mover
una tarea la sacaría del tablero de su equipo y de su proyecto —*un proyecto, un
juego de tareas*—; eso no es suyo, es de allí.

### El informe no es una cortesía: es la forma de la herramienta

`informeDeLaMudanzaAction` cuenta contra la base y **no tiene dentro ni una
sentencia que escriba**; `mudarALaPersonaAction` es el único que escribe. Son
dos funciones y no una con `simular: boolean`, porque un parámetro que decide si
se escribe es un parámetro que alguien pasa mal una vez.

Del lado de la pantalla, lo mismo: **mientras no se haya pedido el informe no
hay botón que pulsar**, y cambiar la cuenta o el rol lo tira —decía lo que iba a
pasar con otros datos—. Sin eso, «primero el informe» sería una costumbre, y una
costumbre se salta el día que hay prisa.

### El recorte de módulos: vaciar la lista le quita el TOPE, no los módulos

Es la trampa de todo esto. Lo obvio es recortar al cruce, y cuando la cuenta
nueva no tiene **ninguno** de los suyos el cruce es vacío… y cero filas en
`_UserModules` es justo lo que el armazón lee como **«sin restricción»**. O sea
que el recorte ingenuo no la deja sin módulos: la deja viendo todo lo que su
plan permita, **más que antes de mudarse**.

Y el cruce se queda en nada por **dos caminos que no son el mismo**. El primero
lo cazó el banco; el segundo hizo falta una mudanza de verdad para verlo, y por
eso está escrito aquí:

1. **La cuenta nueva TIENE lista y no comparte ninguno.** Se le dan los de
   ella: es un tope, y nunca más que su cuenta.
2. **La cuenta nueva NO tiene lista** —una cuenta de administrador, o de plan
   personalizado, que es de lo más normal—. Darle «los de la cuenta» aquí es
   vaciarla, y eso **la ensancha**. Pasó con María Alejandra: tres módulos
   (Chats, Herramientas, Panel) y una cuenta destino sin lista, así que el
   recorte la habría dejado viendo los **catorce** que permitía su plan. Se
   **conservan los suyos**, que siguen sin ser más que su cuenta —su cuenta no
   tiene tope— y no la mueven de donde estaba.

> **El recorte solo puede QUITAR, nunca ensanchar.**

Quien no tenía ninguna no gana ninguna — ya estaba sin tope, igual que su
cuenta.

Y de ahí una lección que vale para cualquier cosa parecida: **una regla que
elige entre dos listas tiene un tercer caso, la lista vacía, y casi nunca
significa lo mismo que las otras dos.** Aquí «vacía» no era «ninguno»: era «sin
tope», o sea lo contrario.

### Lo que deja de alcanzar depende del ROL, y hay que decirlo antes

`laSuerteDeCadaArea` es pura y contesta área por área, con su motivo. Las dos
que importan:

- **Chats.** La bandeja suma las líneas de las cuentas vinculadas, un nivel y en
  los dos sentidos… **salvo a un agente**: `esAgenteDeLaCuenta` corta la lista a
  las líneas propias. Así que una agente pierde sus chats tomados en las líneas
  de la cuenta que deja y una administradora no.
- **Tareas y Proyectos.** No miran vinculadas **en absoluto**: van con
  `where: { id, ownerId: user.ownerId ?? user.id }`. Se pierden con los dos
  roles, y después del cambio no puede ni abrirlas. Por eso el informe las
  cuenta: para reasignarlas antes, no para enterarse después.

Y un canal de **área** se encuentra por la cuenta del canal, así que también se
pierde; un **directo** no, porque se encuentra por pertenencia. El **General** es
de la familia y no cambia.

### Cuatro cosas más que hay que mantener

1. **El destino tiene que ser una CUENTA** (`owner_id` nulo). Colgar a alguien
   de otra persona deja una cadena de dos niveles que ninguna regla de esta casa
   contempla: `cuentaQueManda` lee `persona.ownerId` y da por hecho que esa fila
   ya es la cuenta.
2. **Quien muda manda en las DOS cuentas**, y eso es la puerta de siempre
   (`laCuentaQueConfigura`) más la regla de los canales que cruzan y de las
   Finanzas de la familia: **solo la cuenta MADRE reparte entre las suyas**. El
   superadministrador de verdad pasa esté donde esté.
3. **El `UPDATE` va condicionado al origen que se vio.** Entre el informe y el
   botón alguien pudo moverla ya; así esta llamada no toca nada en vez de
   arrastrarla desde donde no estaba, y se dice con esas palabras.
4. **`actividad_*.cuentaId` no se toca.** Dice contra qué cuenta se gastó aquel
   rato: es historia, y nadie la lee para agrupar —`laJornadaDe` filtra solo por
   `personaId`—. Reescribirla «por consistencia» sería falsear el pasado.

### Y un contador que no puede contar devuelve `null`, no cero

Las tablas de la App las crea su propio módulo la primera vez que alguien las
usa, así que una cuenta que nunca abrió el chat del equipo no tiene
`team_channel_members`. Eso **no es «cero canales»**, y aquí el cero es caro:
esto es justo lo que alguien lee para decidir si le reasigna el trabajo a una
persona antes de moverla. El informe dice «sin contar».

### El banco, en dos modos

`scripts/banco-mudanza.sh`. La decisión va sin base ninguna; lo que solo se ve
contra Postgres es el invariante: **de lo que ella firmó no cambia ni una fila y
no queda nada apuntando a la cuenta que deja**. Se siembran las dos clases de
fila y se compara antes y después, una por una.

El modo roto mueve **solo la fila de la persona** —la forma que se escribe
sola— y afirma los dos restos: la cartera atascada bajo la cuenta de antes y el
módulo de más. Y **los dos ficheros corren en ese modo**: el caso roto del de
Postgres se salta solo en la vuelta normal, así que dejándolo fuera del modo
roto saldría en verde sin haberse ejecutado nunca, que es peor que no tenerlo.

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

## Chat de equipo: limpiar un historial, un puesto que cambia de ocupante, y el orden de los directos

### Limpiar es del súper administrador, y es un `DELETE` de verdad

Desde la propia conversación —canal, General o directo— sale un «⋯» con
**Limpiar historial**, y **solo para el súper administrador de verdad**
(`esSuperAdminDeVerdad`, que con «Ingresar» ya no cuenta). Ni el dueño ni el
administrador de una cuenta: vaciar un canal se lleva lo que escribió todo el
mundo. La puerta está en `limpiarHistorialDelCanalAction`, que lo vuelve a
preguntar, exige la palabra tecleada (`PALABRA_PARA_LIMPIAR`) y **exige que el
canal esté entre los que esa persona ve** —la misma lista que pinta la barra—:
un id que llega del navegador no decide qué se borra.

Cuatro cosas que hay que mantener:

1. **Es un borrado de verdad**, no la señal de «Mensaje eliminado» de borrar un
   mensaje. Limpiar es que la conversación arranque de cero, y cien filas de
   «Mensaje eliminado» no lo serían. Mensajes y reacciones van en **una
   transacción** (`vaciarElHistorial`); el canal y la marca de leído se quedan.
2. **El General es de la FAMILIA**: se vacía con `cuentaId = ANY(familia)` y
   `canalId IS NULL OR 'general'`. Sin el `IS NULL` queda viva la mitad vieja;
   sin acotar por la familia se iría el General de toda la plataforma, que
   comparte el mismo `'general'`.
3. **Las menciones que apuntaban ahí se van con él** (por el `enlace`, con
   `starts_with` y no `left(..., $n)`: Prisma manda el número como `bigint` y
   `left(text, bigint)` no existe). Un aviso que lleva a un hilo vacío se lee
   como que la App pierde mensajes.
4. **El diálogo dice las dos cosas**, y las escribe una función
   (`laAdvertenciaDeLimpiar`): que es irreversible y, en un canal, que afecta a
   todos sus miembros. Y pide teclear la palabra: un «Aceptar» se pulsa sin leer.

### Un directo es una pareja de IDS, así que un puesto que cambia de persona heredaba la conversación

Cuando alguien deja su puesto y otra persona entra **con el mismo usuario**
(Equipo › Editar asesor, cambiando el correo), la fila es la misma y el directo
también: la persona nueva leía la conversación privada de la anterior. Borrar y
crear el asesor no tiene ese problema —el id nuevo abre directos nuevos—, así
que esto solo hace falta al EDITAR.

La casilla **«Entra otra persona en este puesto»** sale **marcada sola al
cambiar el correo** (`sugiereNuevoOcupante`) y se puede desmarcar: la misma
persona puede cambiar de correo. **El servidor solo actúa con la marca
explícita** (`nuevoOcupante: true`); deducirlo del correo sería borrar
conversaciones sin que nadie lo pida. Con la marca, `arrancarDeCeroElPuesto`:

1. **Vacía sus directos** para los dos lados —un directo es una conversación,
   no dos copias—. El canal se queda: se habla con quien ocupe el puesto.
2. **Quita sus menciones pendientes**, que le saltarían a la persona nueva.
3. **Da de baja los dispositivos de la anterior** (`push_subscriptions`): si
   no, los avisos del puesto seguirían llegando a su teléfono.

Los canales de área y el General **no se tocan**: son del equipo. Y va **antes**
de cambiar la identidad: si falla no se cambia nada, porque al revés quedaría la
persona nueva dentro con el historial todavía ahí.

### El orden de los directos es de cada PERSONA, y la llave es con QUIÉN se habla

La lista de Directos se arrastra por un asa (la fila es un botón que abre la
conversación). Se guarda en `orden_en_tablero` con `tipo: "directos"` y
`tableroId` = **la persona que mira** —el único tipo cuya llave es una persona—,
con la tubería de siempre (`useOrdenDeColumna`, `guardarElOrdenDeLaColumnaAction`).
La acción exige que el `tableroId` sea el de quien llama y filtra los ids contra
la gente de su familia.

Tres cosas que hay que mantener:

1. **La tarjeta es la PERSONA, no el canal.** La lista mezcla directos abiertos
   y gente sin directo todavía; por el canal, escribirle a alguien por primera
   vez lo movería de sitio.
2. **Lo sin colocar va DETRÁS** (`ordenarLosDirectos`), al revés que un tablero:
   aquí nadie le da posición a quien entra en el equipo, y delante saltaría
   encima del orden puesto a mano. Sin nada guardado, la lista sale como antes.
3. **Un directo que se lee sin pertenecer** —lo que supervisa quien
   administra— no se ordena: va al final, fuera de la parte que se arrastra.

Lo prueban `scripts/banco-historial-del-equipo.sh` (las acciones contra
Postgres, en dos modos: el roto afirma que no había forma de limpiar, que la
persona nueva leía el directo de la anterior y que el orden no se guardaba) y
`scripts/banco-historial-navegador.sh` (Chromium sobre el build: arrastrar,
recargar, y el diálogo solo para el súper administrador).

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

## La sala usable: quien habla en grande, fondo, mano, chat y moderación

La sala ya entraba y conectaba. Lo que faltaba era poder **trabajar** dentro:
con cuatro personas en cuadrícula todos salen del tamaño de un sello, no había
forma de pedir la palabra sin interrumpir, ni de pasar un dato sin sacarlo de la
reunión, ni de callar a quien dejó la tele encendida.

**Nada de esto renegocia una conexión**, y esa es la idea de la que cuelga todo
—está contada entera en *la idea de la que cuelga TODO: las pistas se negocian
UNA vez*—: el fondo y la pantalla compartida son `replaceTrack`, y la mano, el
silencio y el chat viajan **dentro del latido que ya existía**. Ni un reloj
nuevo, ni una segunda tubería.

### El reparto de orador: tres frenos, y en silencio NO se mueve

Quien habla va en grande y el resto en una tira de miniaturas; la cuadrícula
sigue estando, a un clic. Lo decide `elQueHabla` (`lib/voz-activa.ts`, puro),
que mide el volumen de cada pista con un `AnalyserNode` y aplica **tres frenos
que hacen falta los tres**:

1. **Un suelo** (`NIVEL_MINIMO`). Sin él, el ruido de fondo de un portátil basta
   para ganar el recuadro grande.
2. **Un mínimo en grande** (`MINIMO_EN_GRANDE_MS`, 1,5 s). Sin él, dos personas
   hablando a la vez hacen que la pantalla parpadee entre las dos, que marea más
   que la cuadrícula.
3. **Y una ventaja clara para cambiar** (`VENTAJA_PARA_CAMBIAR`, 1,5×). Un «ajá»
   de fondo no le quita el sitio a quien está explicando algo.

Dos cosas que solo se ven con la sala en silencio:

- **En silencio se QUEDA el último que habló.** Volver a nadie —o al primero de
  la lista— convertiría cada pausa en un salto de cámara. Un recuadro grande
  vacío entre frase y frase se lee como una conexión rota.
- **Pero quien se va suelta el sitio al momento.** Si el que estaba en grande
  ya no está, el reparto se cae al primero en vez de dejar el hueco grande en
  negro.

Y **quien comparte pantalla gana el recuadro grande por encima de quien habla**:
si alguien está enseñando algo, eso es lo que hay que mirar aunque hable otro.

**Con una sola persona manda la cuadrícula**, elija lo que elija
(`laDistribucionQueSeVe`): no hay nada que repartir, y una tira de miniaturas
vacía al lado de un recuadro grande se lee como que falta alguien. Por lo mismo
el botón sale apagado.

El `AudioContext` es **uno por sala y se cierra al salir**. Dejarlo abierto no
se nota en la reunión que se cerró: se nota en la siguiente, porque los
navegadores topan cuántos se pueden tener a la vez y al llegar al tope **deja de
sonar todo**, la llamada de WhatsApp incluida.

### El fondo: el modelo se vendoriza AL CONSTRUIR, ni en el repo ni en un CDN

Desenfocar el fondo o ponerlo liso, encendido y apagado dentro de la reunión.
Lo hace MediaPipe Selfie Segmentation, y lo delicado no es el filtro: es **de
dónde salen sus 6 MB**.

Las dos formas cómodas están mal, cada una por su lado:

| | por qué no |
| --- | --- |
| **comprometerlos en `public/`** | 6 MB de `.wasm` y `.tflite` en el historial de git, para siempre, y cada clon se los baja |
| **pedirlos a un CDN** | una dependencia externa en caliente: el día que ese dominio no conteste, el botón deja de funcionar sin que nadie haya tocado nada — y además se le cuenta a un tercero quién abre una reunión |

> **Se copian del `node_modules` al construir** (`scripts/vendorizar-segmentacion.mjs`,
> colgado de `prebuild`), y `public/segmentacion/` está en `.gitignore`. La
> dependencia entra con `--save-exact`: una versión nueva del modelo cambiaría
> lo que se sirve sin un solo commit.

**Y el script se cae con estruendo** (`exit 1`) si no encuentra los seis
ficheros. Un vendorizado silencioso que no copia nada da un build verde y un
botón que no funciona en producción, que es la familia de fallo de la que va
medio este documento.

Tres cosas del filtro:

1. **`setInterval`, nunca `requestAnimationFrame`.** Con rAF, una pestaña de
   fondo **deja de pintar**, y como lo que se manda es el lienzo, a los demás se
   les congela tu imagen. Con la pestaña escondida no se congela nada.
2. **El orden del lienzo importa**: se pinta la máscara, luego la imagen con
   `source-in` —que recorta a la persona— y luego el fondo con
   `destination-over`, que lo mete por debajo. En otro orden sale la persona
   borrosa sobre un fondo nítido, que es exactamente lo contrario.
3. **Apagar la cámara apaga el fondo primero**, y encenderla lo vuelve a poner.
   Sin eso queda un motor moliendo sobre una pista muerta, y al volver la cámara
   el recuadro se queda negro con la conexión perfecta.

La descarga la comparte **una promesa a nivel de módulo**: dos pulsaciones
seguidas no se bajan 6 MB dos veces.

### La mano y el silencio son HORAS, no interruptores

Las dos columnas nuevas de `sala_participantes` —`manoLevantadaEn` y
`silenciadoEn`— son marcas de tiempo a propósito, y con un booleano las dos se
rompen:

- **Una mano levantada se baja sola** (`VIGENCIA_DE_LA_MANO_MS`, 2 min). Con un
  booleano, quien la levanta y se olvida se queda con el anillo ámbar puesto el
  resto de la reunión, y entonces el anillo deja de significar nada.
- **Y un silencio caduca** (`VIGENCIA_DEL_SILENCIO_MS`, 15 s). Con una marca
  permanente, **la persona no podría volver a encender su micrófono nunca**:
  cada vuelta del latido se lo volvería a apagar. Eso no se lee como una
  moderación: se lee como un micrófono roto.

**Y el silencio es una PETICIÓN, no un interruptor.** El servidor no tiene
ninguna pista que tocar —el micro vive en el navegador de la otra persona—, así
que lo que hace es escribir una marca que **ese navegador obedece** al recibirla.
Se dice con esas palabras en el aviso que sale al pulsarlo: prometer que «lo
silenciaste» sería prometer algo que el servidor no puede cumplir. Lo de
obedecer se recuerda por referencia, para no volver a apagar el micro cuando esa
persona lo encienda otra vez dentro de la misma vigencia.

El anillo de la mano va en el **borde del recuadro** y no solo en un icono: en
una miniatura el icono mide diez píxeles y no lo ve nadie.

### Silenciar y sacar son de quien ADMINISTRA; abrir la puerta, no

Son dos puertas distintas y por eso `sacarDeLaSalaAction` tiene **dos**:

| qué | quién |
| --- | --- |
| dejar entrar o no a quien espera | el anfitrión **y cualquiera del equipo que ya esté dentro** (`puedeAbrirLaPuerta`) |
| silenciar o sacar a quien ya está dentro | el anfitrión **y quien administra la cuenta** (`puedeAdministrarLaSala`) |

Con una sola puerta se rompe una de las dos mitades: si se pide administrar para
abrir, los invitados se quedan esperando para siempre en cuanto el anfitrión
cierre su pestaña; y si basta con estar dentro para sacar, **cualquier invitado
echa al anfitrión**.

Y no se escribió ninguna condición nueva: `puedeAdministrarLaSala` ya contestaba
exactamente esa pregunta para revocar el enlace. Dos formulaciones para «quién
manda en esta sala» es una que se afina y otra que se queda atrás — y aquí
quedarse atrás significa que alguien saca a quien no debía.

**Un `agente` no modera**, que es el reparto de siempre: participa, no manda.
Comprobado con dos navegadores: al agente no le sale ni el botón de silenciar ni
el de sacar.

### El chat de la reunión no sale de la sala

`sala_mensajes`, tabla de la App con `CREATE TABLE IF NOT EXISTS` y sin clave
foránea, y **se borra con la sala** (`revocarLaSala` y el barrido). Es lo que
hace cierta la promesa: lo que se escribe ahí dentro no aparece en el chat del
equipo ni en ningún otro sitio, y cuando la reunión deja de existir tampoco
existe.

Tres cosas:

1. **Viaja en el latido que ya había**, con un corte (`desdeMensaje`) que es la
   **hora del último que ya tengo**, no un `OFFSET`: contar cuántos hay antes
   obliga a recorrerlos. En el caso normal —nadie escribió— la consulta no
   devuelve nada y no cuesta.
2. **El hilo se acumula en el navegador** y se deduplica por id. Pidiéndolo
   entero cada dos segundos se pagaría la conversación completa en cada vuelta.
3. **Y aquí el hilo SÍ se pega abajo solo**, al revés que el chat del equipo.
   Es a propósito: nadie se pone a leer hacia arriba en una reunión de diez
   minutos, y un mensaje que llega y no se ve es un mensaje que no llegó.

### Los cuatro tamaños de la ventana, y el que se recuerda

`lib/ventana-de-reunion.ts`, puro: `pastilla`, `panel`, `maximizada` y
`completa`, en esa escala. `maximizada` **no es** `completa`, y esa es la que
más se usa: llena el hueco de contenido **dejando ver el menú lateral y la barra
de arriba**, así que se puede mirar la campanita o cambiar de pantalla sin salir
de la reunión ni encogerla.

> **`completa` se recuerda como `maximizada`.** Restaurarla al abrir
> significaría pedir pantalla completa sin que nadie haya pulsado nada, y los
> navegadores lo niegan fuera de un gesto: se guardaría un tamaño que no se
> puede devolver, y la reunión abriría en un estado que no existe.

Y la pestaña pública **no recuerda nada y solo ofrece dos**: `localStorage` es
por dominio, así que guardar el tamaño desde la reunión de un invitado le
pisaría el suyo a quien use la plataforma en ese mismo navegador. Y ahí una
`pastilla` sería una barra flotando sobre una página en blanco.

#### Hay DOS `<main>`, y `querySelector` devuelve el que NO sirve

Esto lo cazó medir con dos navegadores de verdad y **leyendo el código no se
ve**. `useHuecoDelContenido` mide el `<main>` a propósito —el menú tiene tres
anchos y además se anima, así que restar variables falla justo en los casos que
importan—. Lo que no se sabía es que hay más de uno:

| | top | left | alto |
| --- | --- | --- | --- |
| el de fuera (`SidebarInset`) | **0** | 48 | 900 |
| el de dentro (el contenido) | **53** | 48 | 847 |

`document.querySelector("main")` devuelve el primero del documento, o sea el de
fuera, **que lleva la barra de arriba dentro**: la reunión maximizada salía
tapándola, que es justo lo contrario de para lo que existe ese tamaño. Y no se
ve como un fallo de medida: se ve como que «maximizada es lo mismo que pantalla
completa».

Se coge **el de más adentro** —el último que no tiene otro `<main>` dentro—, que
es el hueco de contenido por definición y no depende de cuántas capas de armazón
se añadan encima.

### Medido con dos navegadores de verdad y cámara falsa

No con una maqueta: el build servido, dos sesiones reales —la anfitriona en el
panel de la plataforma y un agente por el enlace público—, cámara y micrófono
falsos de Chromium, y la malla conectando de verdad entre las dos.

Lo que se comprobó, y en las cuatro anchuras:

| | 1440 | 1280 | 1024 | 390 |
| --- | --- | --- | --- | --- |
| orador: el grande contra la miniatura | 711.776 / 16.896 | 512.736 / 16.896 | 328.416 / 16.896 | 235.620 / 8.960 |
| cuadrícula: los dos recuadros | 560×754 | 480×654 | 352×622 | 374×355 |
| ¿desborda a lo ancho? | no | no | no | no |

Y de una vez: los dos se ven y **se oyen** (`audio:live` y `video:live` en el
recuadro remoto de cada uno, que es lo único que prueba que el audio llega); la
mano levantada aparece y desaparece en la otra punta; el mensaje del chat llega
firmado; la anfitriona silencia y **el micrófono del otro se apaga de verdad**;
el agente no ve ningún mando de moderación; el fondo descarga sus cinco ficheros
de `/segmentacion` y **sustituye la pista** de la cámara (`fake_device_0` → una
pista de lienzo) y la devuelve al quitarlo; compartir pantalla sustituye la
pista otra vez (`screen:-3:0`) y al dejarlo vuelve la cámara; y los cuatro
tamaños:

| | caja | ¿siguen los `<video>`? |
| --- | --- | --- |
| panel | 896×704 @ (272, 24) | sí |
| maximizada | 1392×847 @ (48, **53**) | sí |
| completa | 1440×900 @ (0, 0), con `fullscreenElement` puesto | sí |
| pastilla | 222×42 | **sí** |

La última fila es la que importa: **plegar esconde la rejilla, no la desmonta**.
Desmontarla se llevaría por delante los `<video>` y con ellos el audio de los
demás — plegar dejaría de ser plegar y pasaría a ser salirse.

## Un diálogo tiene UNA altura, y el aire se resta en `rem`

Los modales crecían hasta pegarse a los bordes de la ventana y ninguno se
parecía al de al lado. Medido en Chromium sobre el CSS del build, con la misma
ventana y contenido de sobra, el aire que quedaba arriba y abajo era:

| ventana | Ticket: abrir | Ticket: detalle | Nueva tarea | Editar cliente |
| --- | --- | --- | --- | --- |
| 1440 | 45 px | 68 px | 158 px | 158 px |
| 1280 | 40 px | 60 px | 108 px | 108 px |
| 1024 | **38 px** | 58 px | 92 px | 92 px |
| 390 | 42 px | 63 px | 130 px | 130 px |

Cuatro diálogos, cuatro medidas distintas, y **el aire encogía con la ventana**:
45 px a 1440 y 38 a 1024, justo donde la pantalla es más pequeña y más se nota.
Los que salían a 158 px no eran los buenos: era el techo en píxeles atascándolos
a media altura con sitio de sobra.

### Y el tope NO se perdió en ningún cambio: nunca llegó a mandar

Revisado el historial, que es lo primero que se pidió. En `main` el fichero
empieza en la importación en bloque (`83056ad8`, 1.400 ficheros); el tope
`max-h-[min(585px,calc(100dvh-2rem))]` **lo añadió** `2d003bfa` (2026-07-05,
«Add client panel and product ordering») en la rama de antes de `main`, de una
línea, y **seguía puesto**. No se borró nunca.

Lo que pasa es que no decidía nada:

> **`cn()` es `tailwind-merge`, así que un `max-h-*` escrito en la pantalla GANA
> al del componente base.** Y lo llevaban ~70 diálogos —`90vh`, `85vh`, `95vh`,
> `585px`, `28rem`…—, cada uno el suyo. El tope de la casa solo se aplicaba a
> los que no traían ninguno.

Esa es la trampa y conviene tenerla delante antes de buscar en el historial: un
valor puesto en el componente base **no es** un valor que mande. Aquí la
pregunta no era «quién lo quitó» sino «quién lo pisa», y se contesta contando
los `max-h` de las pantallas, no leyendo los `git log` del fichero.

Y tenía dos fallos más encima, los dos del mismo tipo:

1. **`vh` es proporcional, así que no es un margen.** Un `90vh` deja 45 px de
   aire en un portátil y 108 en un monitor grande: el diálogo se ve pegado al
   borde exactamente donde menos sitio hay. El aire se resta en `rem`.
2. **Y el techo en píxeles no es un margen tampoco.** `585px` no se mueve: en
   una pantalla alta el diálogo se queda a media altura y en una baja el que
   manda es el otro término.

### La medida, y por qué `dvh`

```
max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]
```

**2rem de aire por lado**, y 1rem en un móvil, que es donde el aire empieza a
costar pantalla. Vive en `ALTO_DEL_DIALOGO` (`components/ui/dialog.tsx`), lo
llevan `DialogContent` y `AlertDialogContent`, y **se exporta** para los modales
escritos a mano.

**`dvh` y no `vh`**: en un móvil `100vh` cuenta la barra del navegador como si
no estuviera, así que el diálogo mide más que lo que se ve y el pie —los
botones— queda por debajo del borde.

### Las tres zonas van con `sticky`, no partiendo el árbol

La forma de libro es meter el cuerpo en un `<div>` con scroll propio y dejar
cabecera y pie fuera. **Aquí no se puede**, y el motivo es concreto: contados,
**20 de los 127 pies no son hijos directos del diálogo** —13 dentro del
`<form>`, 7 dentro de un `<div>` o de un `Tabs`—. Y el pie del `<form>` tiene
que estar ahí: sacándolo, su botón `type="submit"` **deja de enviar nada**.

`position: sticky` se pega al scrollport del ancestro que desplaza **esté donde
esté cada uno en el árbol**, así que la cabecera y el pie se quedan clavados sin
mover un solo nodo. El HTML de las 176 pantallas no se toca.

Tres cosas que hay que mantener:

1. **Quien desplaza sigue siendo el propio `DialogContent`.** Si algún día se
   mete un contenedor con `overflow` entre el diálogo y un pie, ese contenedor
   pasa a ser su scrollport y el `sticky` deja de servir — sin error, solo un pie
   que se va de la pantalla.
2. **La sombra tapa el relleno, y por eso NO es un margen negativo.** Lo que
   desplaza es la caja de relleno, así que el contenido se sigue viendo en los
   24 px de `p-6` antes de desaparecer: pasaría por encima del título. Tirar de
   la cabecera con `-mt-6` lo taparía y **rompe los 24 diálogos que van con
   `p-0`**, donde ese margen la saca fuera. Una sombra sin desenfoque del color
   del fondo (`shadow-[0_-1.5rem_0_0_hsl(var(--background))]`) pinta esa banda
   **sin ocupar un píxel de maquetación**: con `p-6` cubre justo el relleno y
   con `p-0` el `overflow` la recorta. La misma clase vale para los dos.
3. **Y la rejilla se queda.** `DialogContent` es `grid gap-4`: en una columna
   flex con `flex-1 min-h-0` el cuerpo se va a cero cuando el contenedor mide por
   su contenido, que es justo el caso de un diálogo corto.

### Un margen negativo en una REJILLA no descuenta el hueco

Esto costó una vuelta y no se ve leyendo. La X va en una caja de alto cero y
pegajosa —sin eso se va hacia arriba con el contenido y desaparece al bajar— y
esa caja se neutralizaba con un `-mb-4`, que es lo que se haría en un flujo
normal.

**En una rejilla no hace nada**: el hueco lo pone `gap` entre pistas, y el margen
negativo de una pista de alto cero no lo descuenta. Medido con los hijos
delante: el título bajaba de 25 px a 41 y el diálogo crecía de 576 a 592 —en
TODA la plataforma—, y eso no se lee como un fallo: se lee como que el título
está un poco más abajo que antes.

> **El tirón se le da al hermano de ABAJO, que sí tiene alto y sí encoge su
> pista**: `[&>[data-cerrar]+*]:-mt-4`, en la clase del diálogo. Y por
> `data-cerrar`, no por `nth-child(2)`: solo tira cuando la X se pinta, que es
> justo cuando sobra el hueco.

Medido después: el título vuelve a 25 px, el diálogo corto vuelve a **576 px
exactos** —los mismos de antes del cambio— y la X se queda a 17/17 de su esquina
y **sigue dentro tras desplazar hasta el fondo**.

### Los `max-h` de las pantallas se recogieron, y también los de fuera

**60 topes en 53 ficheros**, quitados con un barrido que cambia **solo el token
de alto**: el diff se comprobó línea a línea reconstruyendo cada `className`
original menos su `max-h-*` y exigiendo que diera exactamente la línea nueva.
Los anchos no se tocan, que era el encargo.

Y con ellos, **diez cuerpos con scroll propio** —`overflow-auto max-h-[28rem]` en
los cuatro de Clientes, `max-h-96` en los cuatro de Conexión, el `max-h-[70vh]`
de `CampoEnModal` y el `max-h-[30rem]` de Servicios de reservas—. Ahí estaba la
segunda barra de desplazamiento: medido antes, **Editar cliente tenía 2**; ahora
tiene 1. Un cuerpo capado a 28 rem además deja el diálogo corto en una pantalla
alta y lo desborda en una baja, que es lo contrario de unificar.

**Lo que NO se tocó, y a propósito**: las listas acotadas que viven DENTRO de un
diálogo con más cosas al lado —el historial de versiones, la tabla de permisos,
los desplegables— siguen con su tope. Esas no son «el cuerpo»: son un recuadro
con su propio scroll, y quitárselo haría que una lista de doscientas filas
empujara el resto del diálogo fuera de la pantalla.

Y **los tres modales escritos a mano** —el de Recordatorios y los dos de
Módulos, que no pasan por `DialogContent`— importan `ALTO_DEL_DIALOGO` en vez de
llevar su número. El de Recordatorios tenía `max-h-[585px] max-h-[92vh]`, las dos
clases en la misma cadena; los de Módulos no tenían ninguno en la tarjeta y
`70vh` en el cuerpo, o sea cabecera + 70vh + pie: **el caso que deja los botones
fuera de la pantalla**.

**La landing pública se queda fuera** (`PlanDetailModal`): es una hoja que sube
desde abajo, con su `rounded-t-2xl`, y pegarse al borde inferior es lo que hace
de hoja. No es un diálogo de la plataforma.

### Medido, antes y después

Las mismas cuatro anchuras y los mismos cinco diálogos, sobre el CSS de **los
dos builds** —el `max-height:90vh` y el `min(585px,…)` ya no existen en la hoja
nueva, así que medir el «antes» con ella daría cero y se estaría midiendo el
propio cambio—:

| | antes | ahora |
| --- | --- | --- |
| aire arriba/abajo, 1440/1280/1024 | 38–162 px, distinto en cada uno | **32 px en los cinco** |
| aire arriba/abajo, 390 | 42–130 px | **16 px en los cinco** |
| cabecera | se iba con el desplazamiento | **pegajosa** |
| pie | se iba con el desplazamiento | **pegajoso**, y ningún mando fuera |
| Editar cliente | **2 barras** | **1** |
| diálogo corto | 576 px, sin barra | **576 px, sin barra** |

Las dos últimas filas son las que hay que mirar: la barra doble se fue, y el
diálogo corto **mide lo mismo que medía** —no se estira al tope—, que era la
otra mitad del encargo.

Y cómo se comprueba que la medida existe en producción, que es la familia de
`removeConsole` y la de las clases de `lib/`: se busca la **declaración** en el
CSS del build, no la clase en el código.

```
npm run build && grep -oF "max-height:calc(100dvh - 4rem)" .next/static/css/*.css
```


## Una pantalla de fuera de `(root)` nace SIN poder desplazarse

El formulario público de tickets —el que abre el enlace compartido— **no se
podía desplazar**: los campos de abajo y el botón de enviar quedaban pintados y
fuera de alcance, en computador y en móvil. Y no era de esa pantalla: era de
una clase escrita en otro fichero.

El `<body>` de la App va con **`overflow-hidden`** (`app/layout.tsx`). Está ahí
para el armazón autenticado, que se fija a `100dvh` y se desplaza por dentro
—ver el `SidebarInset` de `app/(root)/layout.tsx`—, así que para él no cambia
nada. Pero **el `overflow` del `body` se propaga al viewport** cuando el
`<html>` lo tiene en `visible`, que es el caso: el documento entero deja de
poder desplazarse, y con él **cualquier página que no viva dentro de
`(root)`** — que son justamente las públicas, las que abre un cliente final.

> **Toda pantalla de fuera de `(root)` declara su propio contenedor que se
> desplaza**, importando `PANTALLA_PUBLICA_QUE_SE_DESPLAZA` de
> `lib/pantalla-publica.ts`. No es una preferencia de estilo: sin eso nace rota.

`(public)` ya se lo había puesto a mano hace tiempo —era la única—; `/t/`,
`bookings`, `schedule` y `(auth)` no. **Lo que no se hizo fue quitar el
`overflow-hidden` del `<body>`**, que es la otra forma de arreglarlo: eso toca
el armazón de un centenar de pantallas autenticadas, que aquí no se pueden
medir, y este documento tiene media docena de reglas sobre lo que cuesta una
regresión de maquetación en Chats.

### Y por eso pasó desapercibido: `overflow: hidden` NO es `clip`

Es la parte que hay que saber antes de medir nada. `hidden` **recorta, pero
deja desplazar por código**: un `scrollTop`, un `scrollIntoView` o el traído
automático del campo que recibe el foco siguen funcionando. Así que
**tabulando con el teclado se llegaba al botón y con la rueda o el dedo no** —
que es la forma más fácil de probar una pantalla y darla por buena.

Y es el mismo error dentro del banco: la primera medida forzaba
`el.scrollTop = 99999` y **daba «llega» en todas las configuraciones, también
en la rota**, porque estaba midiendo justo lo único que seguía funcionando. Se
mide con **`page.mouse.wheel(...)`**, que es entrada de verdad.

### El alto es FIJO, y en `dvh`

- **`h-[100dvh]`, nunca `min-h-*`.** Con `min-h` el elemento crece con su
  contenido, así que su propio `overflow` no se dispara jamás y se vuelve
  exactamente al mismo sitio.
- **`dvh` y no `vh`**: en un móvil `100vh` es el viewport grande —el de cuando
  la barra del navegador está recogida—, así que con la barra desplegada el
  final del contenido queda debajo de ella.

### El centrado del login: el peligro es el alto FIJO, no `screen` frente a `full`

Esta frase se escribió primero al revés y **la medida la desmintió**, así que
conviene no volver a escribirla mal. Lo que corta el principio de un formulario
más alto que la ventana es **`flex h-full items-center`**: la caja no puede
crecer, el centrado reparte el sobrante arriba y abajo, y lo de arriba no se
alcanza porque el desplazamiento no llega a negativo. Medido con 1.400 px de
contenido: **−312 px** a 1319×726 y **−253 px** a 390×844.

`min-h-screen` **no** corta —ni con grid ni con flex—: con un mínimo la caja
crece con su contenido. Así que `CENTRADO_QUE_NO_SE_CORTA` es
`grid min-h-full place-items-center`, y `full` se prefiere a `screen` por otra
razón: lo que hay que llenar es el contenedor que se desplaza, no la ventana.

### Lo exento se dice, con su motivo

Dos pantallas no llevan contenedor **a propósito**, y el banco exige que el
motivo esté escrito: `/reunion/[codigo]` ocupa la pantalla entera por diseño
—la rejilla de video se reparte el alto y no hay nada que desplazar— y `/abrir`
es un `redirect` del servidor que no pinta ni un nodo.

### El banco: un barrido y la página SERVIDA

`scripts/banco-scroll-publico.sh`, dos mitades:

1. **El barrido** (`lib/__tests__/pantallas-publicas-se-desplazan.test.mjs`)
   recorre todo lo que vive fuera de `(root)` y falla si una pantalla no declara
   su contenedor ni está exenta con su motivo. En `MODO=roto` finge que el
   arreglo no está puesto y **exige que las cace**: sin ese modo, lo verde del
   normal no probaría que el barrido mira. Y comprueba la premisa —que el
   `<body>` sigue con `overflow-hidden`—: si algún día se quita, hay que volver
   aquí y decidir, no dejar los contenedores puestos sin motivo.
2. **La página servida**, en Chromium: levanta una base de usar y tirar, siembra
   un enlace público y abre `/t/<codigo>` de verdad. **No vale una maqueta** —el
   primer intento lo era y salió **más corta que la ficha real**, así que cabía
   entera en las cinco ventanas y la medida no ejercía nada—. El «antes» se
   obtiene quitándole al `<main>` las dos clases del contenedor sobre la página
   ya cargada: mismo DOM, misma hoja, mismo contenido.

Y el gate de cada ventana **no es que el contenido desborde**, es que **el botón
quede fuera sin desplazar**: a 1280×800 sobran 24 px que son el relleno de
abajo, el botón ya se veía, y ahí las dos columnas dicen «LLEGA» sin que eso
signifique nada.

| ventana | contenido | antes | ahora | |
| --- | --- | --- | --- | --- |
| 1319×726 · el del reporte | 824 px | **no llega** | **LLEGA** | el botón quedaba fuera |
| 390×844 · el del reporte | 931 px | **no llega** | **LLEGA** | el botón quedaba fuera |
| 1440×900 | 900 px | LLEGA | LLEGA | ya cabía |
| 1280×800 | 824 px | LLEGA | LLEGA | ya cabía |
| 1024×768 | 824 px | LLEGA | LLEGA | ya cabía |

Ninguna de las cinco desborda a lo ancho.

Y una del propio banco, que costó una vuelta: **una clase arbitraria que no use
ninguna pantalla no existe en el CSS del build.** El contenido de encargo del
centrado iba con `h-[1400px]`, que no genera ninguna regla, así que la caja
medía 28 px y la medida no ejercía nada. Va con `style`, que es lo único que no
depende de lo que Tailwind haya compilado.


## La llamada con IA: lanzarla y GRABARLA son dos mitades, y una no existía

«Las llamadas salen y se completan, y al terminar no queda ni Resumen IA ni
Transcripción.» Lo que hay debajo no es una regresión del arreglo anterior: es
que **ese camino nunca tuvo la segunda mitad escrita**.

`startBotCallAction` —el botón «Llamar con IA»— hacía esto:

```ts
const r = await fetch(`${ASTRA_BASE}/api/sessions/${sid}/calls/bot`, …);
if (!r.ok) { … }
await logOutgoingCallAction(digits, 0, false, undefined, { isBot: true, provider: 'astra' });
```

**La respuesta se tiraba.** Y dentro venía lo único con lo que después se
puede pedir la grabación: `{"call":{"callId":"…"}}`. Así que la fila de la
llamada se escribía **sin `astraSid` y sin `astraCallId`**, y sin ese par no
hay a quién preguntarle por el audio — ni entonces ni nunca. Nadie sondeaba,
nadie llamaba a `processCallRecordingForUser`, y **no fallaba nada por el
camino**: la llamada salía, se hablaba, se colgaba, y la fila se quedaba como
nació.

Comprobado con `git log -S` sobre esa línea: está así desde que se escribió el
botón. **Lo que cambió no fue el código, fue que las llamadas empezaron a
salir**, y solo entonces se pudo ver que no dejaban nada.

Y el «antes sí quedaban» del reporte es cierto y es **otra** cosa: las llamadas
en vivo del asesor (`CallDialog.processRecording`) sí lo hacían y siguen
haciéndolo. Dos caminos que acaban en la misma tarjeta, y solo uno lo tenía.

### Lo que NO era, y se descartó mirándolo

Conviene que esté escrito, porque son las dos sospechas naturales y las dos
cuestan una tarde:

| se sospechaba | por qué no |
| --- | --- |
| el cambio de cuenta madre/hija (#842) | esa familia solo decide **de qué línea se lee la configuración del asistente**. La clave de OpenAI y los créditos de `VoicebotService.resolve` salen de la cuenta dueña de `astra_calls_sid`, que es **la misma** bajo la que se escribe la fila de la llamada. Ni toca la grabación. |
| el `VOICEBOT_SECRET` | guarda `resolve`, o sea si la llamada **sale**. El reporte dice que sale. Después de eso no vuelve a intervenir. |

### El camino del flujo sí estaba cableado, con una ventana imposible

`StageAutomationService.doAiCall` —el `AI_CALL` de un cambio de etiqueta— sí
avisaba a la App… después de sondear él mismo la grabación **diez veces cada
20 segundos**, contadas **desde que la llamada se lanza**. O sea 200 segundos.
Una conversación de más de tres minutos agota las diez **estando todavía en
curso**: la grabación queda lista justo después de que nadie la mire, y no
avisa a nadie.

> **La espera vive en UN sitio, y es el de la App** (`esperarYProcesarLaGrabacion`,
> `lib/grabacion-de-llamada.server.ts`): 60 vueltas de 30 s, o sea **media
> hora**. El backend avisa **en cuanto lanza la llamada**, con `esperar: true`,
> y la ruta contesta `202` y sigue de fondo. Dos esperas —una en cada
> repositorio, con dos ventanas distintas— es una que se afina y otra que se
> queda atrás, y aquí la que se quedaba atrás no dejaba ni rastro.

Y **los dos caminos usan esa misma función**: el botón la llama directo, el
flujo entra por la ruta. Con una espera por camino, el día que se toque una el
otro se queda con la vieja.

### Y el astracalls SÍ emite `recording.ready`, pero no lo escucha nadie

`finalizeRecording` lo manda. Ni la App ni el backend tienen ruta que lo
reciba, así que hoy no sirve de nada. **No se montó** —sería una tercera
tubería para lo que la espera ya resuelve—, pero queda dicho: el día que se
quiera quitar el sondeo, ese webhook es por donde se hace, y entonces hay que
quitar la espera, no dejar las dos.

### Transcribir una llamada COBRA, y se cobra como una nota de voz

Esto no se cobraba. Las notas de voz de Chats y las del chat de equipo sí, con
la misma tarifa, y una llamada de diez minutos es exactamente el mismo consumo
de Whisper.

**La tarifa no se vuelve a escribir**: `queHacerConLaGrabacion`
(`lib/transcripcion-de-la-llamada.ts`, puro) llama a `costoDeLaNota` — los
mismos seis créditos por minuto prorrateados, con su `ceil` y su mínimo de uno.
Una cuarta cuenta con su propia aritmética es la forma de que dentro de un año
dos pantallas cobren precios distintos por el mismo minuto de audio.

Cuatro cosas que hay que mantener:

1. **Paga la CUENTA dueña de la conversación, nunca la persona ni la madre.**
   `ia_credits` tiene una fila por cuenta: cobrarle a la persona sería
   cobrarle a una fila que normalmente no existe. Y **no** la raíz de la
   familia: una llamada de Verzay Ventas la paga Ventas, que es donde se
   registró y por cuyo número salió (ver *Una llamada es de la cuenta DUEÑA de
   la conversación*). Esto decía antes «la madre», como el chat de equipo; se
   corrigió a propósito — el chat de equipo sigue cobrando a la madre porque un
   canal es de la familia, y una conversación de WhatsApp no.
2. **El tope va sobre BYTES y se mira ANTES que los créditos.** Los 25 MB son
   un límite de OpenAI y los bytes son el dato que va a viajar. Y el orden
   importa: con las dos cosas mal, decir «sin créditos» manda a recargar para
   nada — con créditos tampoco se habría transcrito.
3. **El cobro va DESPUÉS de tener el texto, y solo si esta vuelta escribió.**
   `guardarYCobrar` lleva `WHERE (raw->'call'->>'transcript') IS NULL`: dos
   vueltas a la vez escriben una sola vez y **solo esa descuenta**. Es la misma
   forma que ya tienen las notas de voz.
4. **Un fallo de hoy no deja marca.** La espera sigue mientras la grabación no
   esté; lo que no se pudo transcribir por créditos o por tamaño se dice con su
   motivo, y nunca se cobra lo que no se entregó.

### La duración sale del propio WAV, no del proveedor

La fila de una llamada del bot se escribe con `durationSecs: 0` —el servidor de
llamadas no devuelve la duración al lanzarla— así que la tarjeta salía sin
tiempo y el cobro no tenía con qué calcularse. `duracionDelWav` lee el
encabezado RIFF (canales, frecuencia y bits, recorriendo los trozos hasta
`data`): **la grabación es, en la práctica, la llamada**, y es lo único fiable
que hay.

### Nada de esto puede ser mudo, y lo era en cinco sitios

Cada punto donde el camino se rendía devolvía un `{ success: false }` dentro de
un `void`. Desde fuera eso es exactamente el síntoma reportado. Ahora **cada
abandono escribe**: la grabación que nunca llegó, la fila que no se encontró
—que pasa cuando se escribió bajo otra cuenta o bajo otra línea—, la cuenta sin
clave de IA, la transcripción vacía, y **el resumen que no salió**.

El último lo destapó el propio banco: `summarize` tenía un `catch { return ''; }`
mudo, así que una llamada podía quedar **con Transcripción y sin Resumen** sin
que nadie supiera si falló el modelo, la clave o la red. Es la regla de siempre
—*ningún `catch` mudo*— en el sitio donde más se parece al fallo original.

### Y `getUserAiConfig` era más estricta que su hermana

Pedía la clave del proveedor por defecto y nada más. `laClaveDeOpenAi` —la que
usan las notas de voz— es más indulgente: el proveedor por defecto **activo**,
luego cualquiera activo, luego la primera. Una cuenta con su clave puesta y sin
proveedor por defecto marcado se llevaba un «Sin configuración de IA activa» y
ninguna transcripción.

Con el modelo hay una condición que no se puede aflojar: **el modelo por
defecto de la cuenta solo vale si es del MISMO proveedor que la clave
elegida.** Con la clave de OpenAI y un modelo de Gemini escrito al lado, la
transcripción se pediría con un nombre que esa API no conoce y volvería vacía
sin decir por qué.

### La fila se busca con la cuenta bajo la que QUEDÓ

`logOutgoingCallAction` devuelve ahora también el `userId`, y no es un detalle:
esa función escribe la burbuja **bajo la cuenta dueña de la línea** (#849), que
cuando la conversación es de una línea de otra cuenta de la familia **no es la
de quien llamó**. `processCallRecordingForUser` busca con
`where: { id, userId }`, así que pasándole la cuenta de quien pulsó no
encontraría la fila y se rendiría — otra vez sin decir nada.

### El banco: cuatro mitades, y el modo roto AFIRMA el fallo

`scripts/banco-grabacion-de-llamada.sh`, contra Postgres y con una familia de
`linked_accounts` sembrada dentro. Se ejercen **las acciones**, no las
funciones puras: probar `processCallRecordingForUser` a solas no diría nada del
fallo, que estaba en quién la llama.

| | qué prueba |
| --- | --- |
| A | la decisión, pura: la tarifa es la de `costoDeLaNota`, el tope antes que los créditos, `null` es ilimitado |
| B | el botón: la fila queda con su `astraSid` y su `astraCallId`, y al colgar tiene Transcripción, Resumen y la duración del WAV |
| C | el flujo: la ruta interna acepta con `202` y la llamada acaba con las dos cosas |
| D | los créditos: paga la madre, la persona no tiene bolsa, y una segunda vuelta no vuelve a cobrar |

`MODO=roto` corre **lo que había, escrito literal**: el registro sin el par de
ids y el sondeo de 200 s del backend. Y afirma el fallo —la fila sin
`astraCallId`, la grabación que no se pide ni una vez, el sondeo que se rinde
antes de que el audio exista y los cero créditos gastados—. Sin ese modo, lo
verde del otro no diría si se arregló la causa o si el caso no llega a
ejercerse.

Se fingen **dos** cosas y ninguna más: `currentUser()` y el paquete `openai`
—transcribir y resumir salen de la red, y el doble cubre **las dos**
(`audio.transcriptions` y `chat.completions`, que es lo que usa `OpenAiClient`):
con una sola, la mitad del camino se quedaría sin ejercer y el banco saldría
verde sin haber probado que el resumen llega a la fila—.

Y tres cosas del propio banco que costaron su vuelta:

1. **Solo se acelera EL temporizador de la espera**, leyendo
   `ESPERA_ENTRE_INTENTOS_MS` **del módulo** en vez de escribir 30.000 a mano.
   Copiado, el banco probaría que su número coincide con el suyo y no con el
   que corre. Y acortando todos los temporizadores del proceso se moverían
   también los de Prisma y los del corredor.
2. **`AiProvider.name` es ÚNICO y la base del banco se reutiliza entre
   ejecuciones.** Con un `create` la segunda vuelta se cae en la siembra y todo
   lo de abajo sale rojo por algo que no tiene nada que ver.
3. **Un paquete de esbuild necesita un `require` de verdad.** `@google/genai`
   pide `child_process` y `xml2js` pide `events` con `require` dinámicos, y el
   envoltorio de esbuild los tira. Eso no es un fallo de producción —ahí corre
   Node— pero aquí **se lo comía el `catch` de `summarize`** y la llamada salía
   con Transcripción y sin Resumen: o sea, el banco reproducía el síntoma que
   venía a probar, por un motivo que no era el suyo. Se arregla con un
   `--banner:js` que defina `require` con `createRequire`.

Lo que **no** se pudo ejercer aquí, y se dice: el servidor de llamadas de
verdad. El `fetch` está apuntado, así que lo probado es el camino entero
—lanzar, registrar, esperar, transcribir, resumir, guardar y cobrar— contra un
astracalls fingido que devuelve un WAV de verdad y que **no entrega la
grabación hasta la vuelta 15**, que es el caso que el sondeo viejo no aguantaba.


## El asistente de voz: el prompt es de la CUENTA, el contexto es de la CONVERSACIÓN

Tres fallos reportados juntos después de que «Llamar con IA» volviera a salir,
y ninguno de los tres era una regresión del arreglo anterior: los tres llevaban
ahí desde siempre y solo se pudieron ver cuando las llamadas empezaron a salir.

| lo que se veía | lo que era |
| --- | --- |
| a **todos** los clientes les decía el mismo `productos_servicios` —«productos naturales»— | `resolve` **nunca leía la conversación**: las instrucciones de todas las llamadas de una cuenta eran idénticas byte a byte |
| «no puedo enviarte el enlace por WhatsApp» | `sendWhatsapp` seguía con `instanceType: 'Whatsapp'`, o sea **el filtro que el arreglo anterior quitó de `resolve` y no de la mitad de al lado** |
| la transcripción decía «Bersi de Versailles» | Whisper escribe lo que oye con palabras que existen, y nadie lo corregía al guardar |

### 1. El prompt no tenía con qué rellenar las variables, así que se las inventó

Lo que despista es que el síntoma nombra una variable —`productos_servicios`— y
eso manda a buscar un sitio donde se sustituyan variables. **No hay ninguno.**
El prompt de la cuenta está escrito en términos de lo que el chat captura
(`nombre`, `productos_servicios`, `dolor_especifico`), y al voicebot se le
entregaba **tal cual, sin nada delante**. Un modelo con un hueco delante lo
rellena, y lo rellena igual todas las veces porque la entrada es la misma.

Así que no es un caché ni un contexto de otra conversación reutilizado: es que
**no había ningún dato de la conversación en ninguna parte**. Se comprueba de
la forma más barata que hay: dos llamadas de la misma cuenta a dos contactos
distintos producían el mismo `instructions`, carácter por carácter.

> **Lo que cambia de una llamada a otra dentro de la misma cuenta es el bloque
> de contexto, y sale del chat de WhatsApp de ESE contacto**
> (`loQueYaSabeDelCliente` → `elContextoDeLaConversacion`, puro). Se añade
> detrás del prompt de la cuenta; el prompt no se toca.

Y la mitad que de verdad arregla el reporte es la otra:

> **Cuando NO hay conversación, el bloque lo dice con esas palabras** y le
> prohíbe inventárselo: «no sabes su nombre, ni a qué se dedica, ni qué
> productos o servicios le interesan… **NO te los inventes: pregúntaselos**».
> Sin esa frase, un bloque vacío es exactamente el hueco de antes y el modelo
> vuelve a rellenarlo con lo de siempre.

Cinco cosas que hay que mantener:

1. **Se buscan las TRES columnas, en tres consultas con `UNION ALL`.** Un
   contacto está guardado bajo la identidad que devolvió el proveedor esa
   vuelta —`remoteJid`, `remoteJidAlt` o `senderPn`— y preguntar por una sola
   «devuelve correcto y vacío», que es la regla de siempre de Chats. Pero
   juntarlas con un `OR` en el mismo `WHERE` deja la consulta **sin índice** y
   recorre `chat_messages` entera, que es la tabla más grande de la plataforma:
   es literalmente el fallo que ya costó caro en
   `levantarMarcasSiElContactoEscribio`. Cada rama lleva además **su propio
   `LIMIT` dentro**, que es *una consulta que devuelve una página tiene que
   poder pararse*.
2. **No se fabrica ningún `@lid`.** Sus dígitos son un id de privacidad; la
   conversación abierta por su `@lid` se encuentra igual, porque esa fila
   guarda el teléfono real en una de las otras dos columnas.
3. **Los registros de llamada y los mensajes vacíos NO son conversación.** Una
   llamada anterior es una fila de `chat_messages` con `messageType = 'call'`:
   colada en el bloque, el modelo se pondría a hablar de ella como si el
   cliente la hubiera escrito.
4. **El bloque va topado por mensajes Y por caracteres**, y se recorta
   **quitando mensajes enteros por delante**, nunca cortando por la mitad: un
   mensaje partido se lee como un mensaje distinto del que se escribió. Lo
   último —lo más reciente— es lo que se conserva.
5. **Que no se pueda leer NUNCA tumba la llamada.** Se devuelve el bloque de
   «no hay conversación», que es más estricto que la verdad y es el lado
   seguro: le manda preguntar, que es lo que hay que hacer cuando no se sabe.
   Y **se escribe en el registro**, porque desde fuera esto se ve como un bot
   que no se acuerda de nada.

El nombre del contacto sale de `Session`, con **el puesto a mano por encima del
de WhatsApp** (`customName || pushName`): es el mismo criterio de la bandeja.

### 2. `enviar_whatsapp`: el proveedor sale de la FILA, también aquí

Es la misma regla que este documento ya tiene escrita —*el proveedor sale de la
FILA, no del parámetro*— reaparecida en la mitad que nadie miró. El arreglo
anterior quitó el filtro de casings de `resolve`; `sendWhatsapp` y
`resolveInstanceCreds` **se quedaron con él**, así que en una cuenta cuya línea
vive en `waha` —que es como nacen hoy las nuevas— no encontraban ninguna fila.

Y el daño era doble, porque son dos funciones distintas:

| | qué se veía |
| --- | --- |
| `sendWhatsapp` | el bot le decía al cliente **«no pude enviarlo por WhatsApp en este momento»** — la frase exacta del reporte |
| `resolveInstanceCreds` (en `ai-agent.service.ts`) | devolvía `null` sin Evolution, así que `buildVoicebotToolset` salía **VACÍO**: esa cuenta perdía además sus herramientas de agenda, productos y cotizaciones. La herramienta no «dejó de ejecutarse»: **no se le llegaba a declarar ninguna** |

> **Una capa no habla por la de abajo.** Arreglar la puerta (`resolve`) sin
> arreglar el envío dejó el asistente entrando y sin poder hacer nada. Cuando
> se declara que una regla es «la línea por QR, sea del proveedor que sea», se
> cuentan **todos** sus sitios, no el que produjo el reporte.

Cuatro cosas que hay que mantener:

1. **La regla es la MISMA función pura** (`linea-del-asistente.ts`).
   `laLineaPorLaQueSeEnvia` es su hermana y se diferencia en una cosa sola: para
   **atender** hace falta que el asistente esté encendido ahí; para **enviar**
   no, porque el auto-mensaje de «no contestó» tiene que salir aunque alguien lo
   apague entre la llamada y su final.
2. **No se escribe un envío por proveedor**: va por `WhatsAppSenderFactory`,
   que es donde vive lo que cada uno necesita —Waha lee su servidor de
   `site_config`, no de las credenciales de Evolution de la cuenta, así que
   exigirle una url de Evolution es pedirle algo que no tiene—.
3. **El saliente deja su burbuja.** Con Evolution llegaba sola por el eco del
   webhook; con Waha **no**, porque su eco se descarta a propósito (solo pasa
   lo que sale del móvil, que es lo que impide que la IA se pause a sí misma).
   Sin esto el enlace le llegaba al cliente y en el panel no había ni rastro.
4. **Y un fallo de envío no es mudo.** La frase que el bot le dice al cliente
   salía sin una sola línea en el registro, y eso es lo que hizo que se leyera
   como «el asistente perdió la herramienta».

`resolveInstanceCreds` además **tolera que no haya url de Evolution**
(`server_url: ''`) en vez de rendirse: las herramientas dinámicas de una cuenta
de Waha no necesitan ese servidor, y devolver `null` por él era regalar el
juego entero de herramientas por un dato que no hacía falta.

### 3. El nombre de la marca se corrige al GUARDAR, con una lista cerrada

El asistente se presenta bien —se oye «Verzy, de Verzay»— y en la transcripción
salía **«Bersi de Versailles»**. No es la voz: es Whisper, que escribe lo que
oye con palabras que existen, y «Versailles» y «Bersi» existen.

> **Se corrige al guardar** (`lib/nombres-de-la-marca.ts`, puro), **con una
> lista CERRADA**. No se toca la voz, y no se «mejora» el texto con el modelo:
> eso sería reescribir lo que dijo el cliente. Lo único que cambia son las
> formas conocidas de los dos nombres propios de la casa.

Y tiene **dos mitades, arriba y abajo**: a la transcripción se le pasa el
vocabulario de la marca (`PISTA_DE_VOCABULARIO`, el `prompt` de Whisper y la
instrucción de Google) para que acierte de entrada, y la lista es la red de
abajo para lo que se le escape. Con solo la de arriba no hay garantía; con solo
la de abajo se trabaja siempre.

Cuatro cosas:

1. **Se aplica a la transcripción Y al resumen**, y en los **dos** caminos
   (`processCallRecordingForUser` y `processMetaCallRecordingForUser`). Con uno
   fuera, es la familia de siempre: «a una hermana se le pasa».
2. **Palabra entera, con `\p{L}` y no `\b`.** Con `\b`, la «s» final de
   «Versalles» ya es límite de palabra y «Versallesco» se cambiaría igual.
3. **Con la vocal acentuada también.** Whisper escribe «Bersí» y «Versáilles»
   tanto como sin tilde; la clave se guarda sin acentos pero la expresión tiene
   que poder encontrarlas.
4. **La lista se alarga solo con formas que se hayan VISTO.** Esto cambia un
   registro de lo que pasó: lo que no esté escrito ahí no se sustituye.

### Y un fallo de la herramienta no puede salir como «Listo.»

Salió al leer el camino de la herramienta en wacalls y no estaba reportado:
`executeVoicebotTool` devolvía **`"Listo."`** ante un 404, un 401 o un 500 de
la plataforma. O sea el bot diciéndole al cliente que ya le había enviado el
enlace **sin haber enviado nada** — que es peor que el fallo que se venía a
arreglar, porque el cliente se queda esperando y nadie se entera.

Ahora se mira el código de estado, un resultado vacío no se convierte en un
«listo», y **cada rama deja su línea**. Y la URL no se deriva a ciegas: si el
endpoint configurado no lleva `/resolve` dentro, se dice y no se inventa una.

### Los bancos, y qué prueba cada uno

| | qué ejerce |
| --- | --- |
| `src/modules/voicebot/__banco__/contexto-y-envio.banco.ts` | **dos conversaciones distintas** —un taller de repuestos y una clínica dental, la segunda guardada bajo `remoteJidAlt` con un `@lid` por delante— reciben **cada una sus propias variables y no las de la otra**; y `enviar_whatsapp` sale por la línea de Waha, con su jid y su burbuja |
| `src/modules/voicebot/linea-del-asistente.spec.ts` | la regla pura: las tres formas del tipo, la fila que gana, y las dos líneas —la que atiende y la que envía— |
| `cmd/server/voicebot_tool_test.go` (wacalls) | que un fallo **no** sale como «Listo.» y que `enviar_whatsapp` sigue declarada |
| `lib/__tests__/grabacion-de-llamada.test.mjs`, sección E | lo que se GUARDA dice «Verzy, de Verzay» **aunque la IA diga otra cosa** |

Cuatro cosas de los bancos que conviene no deshacer:

1. **El modo roto lleva la consulta vieja escrita dentro, literal**
   (`laLineaDeAntesParaEnviar`, con su `instanceType: 'Whatsapp'`), y **afirma
   el fallo**: sobre esas mismas filas no encuentra nada. Sin ese modo, lo verde
   del otro no diría si se arregló la causa o si el caso no se llega a ejercer.
2. **El banco del contexto crea `chat_messages` con la DDL de la App.** Esa
   tabla no está en el esquema de Prisma del backend —la crea la App— así que
   sembrarla a ojo sería probar contra una tabla que no es la de producción.
3. **La prueba del contexto encadena las dos mitades**: se afirma que el bloque
   de una conversación **no** contiene lo de la otra, no solo que contiene lo
   suyo. Con la primera mitad sola, un bloque que las pegara todas saldría
   verde.
4. **`lib/__tests__/grabacion-de-llamada.test.mjs` corre su sección E en los
   dos modos a propósito**: el interruptor de ese banco toca el registro y la
   ventana de espera, no el guardado. Su «antes» lo prueba de otra forma, que
   es la que vale aquí: **se afirma que el doble de la IA SÍ devolvió las formas
   rotas**, así que lo limpio de la fila solo puede venir del guardado.

Y lo que **no** se pudo ejercer, que se dice en vez de disimularlo: el servidor
de llamadas de verdad y los proveedores de WhatsApp de verdad. El `fetch` y los
adaptadores están apuntados, así que lo probado es a qué línea se habla, con qué
jid y qué se persiste — no que Waha entregue el mensaje.


## Llamar y llamar con IA: una barra, y un MENÚ en vez de un segundo botón

Dos pantallas de la misma área, y el mismo encargo: que llamar de las dos
formas se alcance desde donde ya se está, sin inventar mandos nuevos.
**Ninguna llamada cambia de comportamiento** — lo único que cambia es cómo se
llega a ellas.

### 1. El marcador de CRM › Llamadas: una fila, no tres bloques

Eran **dos recuadros con una palabra de más en cada uno**. Arriba un bloque
que se presentaba a sí mismo —un icono de teléfono y la palabra «Marcador»—
con el campo, los dos botones y, al final, un «Rellamar:» con la pastilla del
último contacto. Abajo, pegada a la tabla, otra cabecera que decía «Historial»
y llevaba a la derecha los conteos y los filtros de dirección.

Nada de eso informaba: la pantalla ya se llama Llamadas, el campo ya se ve que
es un campo, y la tabla de abajo ya se ve que es el historial. Lo que sí
costaba es que **los conteos y el filtro vivieran lejos del marcador**, dos
bloques de alto por encima de lo que se viene a leer.

Medido en Chromium sobre el CSS del build, lo que había **por encima de la
primera fila** de la tabla:

| ventana | antes | ahora | recupera |
| --- | --- | --- | --- |
| 1440 | 162 px | **62 px** | 100 px |
| 1280 | 162 px | **62 px** | 100 px |
| 1024 | 162 px | **62 px** | 100 px |
| 390 | **306 px** | **106 px** | **200 px** |

En un teléfono la cabecera se llevaba una pantalla entera antes de la primera
llamada. Es la misma familia que *las métricas van en la BARRA, no en tarjetas
encima de la lista*: la franja de arriba es la que le falta a la tabla.

Cuatro cosas que hay que mantener:

1. **En computador UNA fila; en el teléfono DOS**, y la de abajo se desplaza.
   El corte es `sm:` —el de siempre— y lo que se apila es el
   `flex-col sm:flex-row` de la caja, **no un `flex-wrap`**: con `wrap` la fila
   se parte por donde toque y el resultado depende de cuánto mida un rótulo.
   Medido: una fila a 1440/1280/1024 y dos a 390, siempre.
2. **Lo de la derecha va en UN carril, no en dos.** Las pastillas y el grupo de
   dirección comparten el sitio: metiendo cada una en su propio
   `BarraDeslizable` habría dos scrollports pegados, y en un teléfono el
   segundo se lleva el ancho que le falta al primero. Uno solo, con
   `min-w-max` dentro para que **nada se comprima** — que es la regla que
   `BarraDeAcciones` ya pagó una vez: *un carril que se desplaza no impide que
   lo de dentro encoja*.
3. **«Llamar con IA» pesa lo mismo que «Llamar».** Los dos sólidos, el mismo
   alto y el mismo relleno; lo único que los separa es el color y el icono. En
   contorno, el de IA se leía como el secundario de los dos, y no lo es: son
   dos formas de llamar al mismo número.
4. **Y las pastillas salen también en el teléfono** (`enElTelefono`, opt-in de
   `PastillasDeMetricas`). Van `hidden sm:flex` **a propósito** —son cifras que
   la lista de abajo ya contesta—, y esa sigue siendo la regla; lo que esta
   excepción abre es el caso contrario: **aquí las tres pastillas SON el filtro
   de dirección**, así que esconderlas en un teléfono no ahorra sitio, quita la
   función. Su renglón ya se desplaza, así que no le roban ancho a nada.

#### En el teléfono cede el CAMPO, y los botones se quedan solo con su icono

Esto **lo cazó medir, no leer**, y con el banco ya en verde por lo demás: a
390 px la página **se desplazaba a lo ancho** —`documentElement.scrollWidth`
461 sobre 390—. Listando lo que salía por la derecha, el culpable era el botón
«Llamar con IA» en `position: static`, con su `right` en 461: el campo con su
ancho fijo más los dos botones **con su palabra** y sus huecos pedían del orden
de 450 px en un hueco de 348.

Dos cosas, y hacen falta las dos:

1. **La fila de marcar es `w-full sm:w-auto` y el campo `min-w-0 flex-1
   sm:w-52 sm:flex-none`.** En el teléfono el campo es lo ÚNICO que cede: se
   queda con lo que los dos botones le dejen. De `sm:` en adelante vuelve a
   medir lo suyo y no empuja al carril.
2. **Y los dos botones se quedan solo con su icono por debajo de `sm`**
   (`<span className="hidden sm:inline">`, `px-3 sm:px-4`), con su `aria-label`
   y su `title` puestos. Es la misma decisión que `BotonDeCrear` con su «+» y
   que las acciones secundarias de `BarraDeAcciones`, y por el mismo motivo: en
   un teléfono el ancho es lo único que escasea.

Medido después: **nada desborda en ninguna de las cuatro anchuras**, ningún
rótulo se recorta y a 1024 el carril sobra 202 px que **se desplazan** —que es
lo que esta barra hace desde el #815—.

### 2. En Chats el botón verde es un MENÚ, no dos botones

El encargo decía «no agregues un segundo botón en la cabecera», y eso es lo
que decide la forma: el disparador **sigue siendo el mismo botón verde** y lo
único que cambia es que al pulsarlo se abren dos opciones, en su orden:
**Llamar** (teléfono) y **Llamar con IA** (robot).

`components/chats/MenuDeLlamada.tsx` lo pinta, y **la cabecera lo monta en sus
dos sitios** —el compacto y el ancho— con el mismo componente. Con dos copias,
el día que se afine una el otro se queda atrás, que es la lección de *la barra
de escribir es UNA*.

**Y no hizo falta tocar el servidor.** `startBotCallAction` ya recibe la línea
como segundo parámetro desde el #849, así que la opción de IA le pasa
`datos.instanceName` y la llamada sale **por la línea de la conversación
abierta**, con su burbuja anotada donde toca. La opción normal dispara
`abrirLlamadaAqui(...)`, o sea exactamente lo que el botón hacía ya: el evento
que escucha `AnfitrionDeLlamada` desde el layout, que es lo que hace que una
llamada sobreviva a navegar (#860).

Dos cosas que el banco ejerce y que no se contestan leyendo:

1. **Cada opción dispara la SUYA y no la otra.** Un menú que al pulsar
   «Llamar» lanzara además la llamada con IA gastaría créditos sin que nadie
   los pidiera, y eso no da ningún error.
2. **Las dos van por la línea de la conversación**, no por la de quien mira.
   Es el fallo que ya costó una vuelta entera en *la salida es la línea de la
   CONVERSACIÓN*, y aquí reaparecería solo: copiar el manejador del marcador
   del CRM da `startBotCallAction(digitos)` sin línea, que es exactamente lo
   que el modo roto del banco monta y **afirma**.

### El banco: dos mitades, y cada una con su modo roto

`scripts/banco-llamar-con-ia.sh`, porque el cambio vive en dos capas.

- **El menú**, en Chromium y con el componente REAL: Radix monta el contenido
  en un portal y solo al abrirlo, así que el `onSelect` de cada opción es
  código que **no se ejecuta sin navegador**. `MODO=roto` monta la versión
  INGENUA —la que sale de copiar el manejador del marcador— y afirma el fallo:
  `ia[0].linea === null`. No es «el componente de antes» —este menú es nuevo—
  y **se dice en vez de disimularlo**: es la forma en que esto se escribe solo.
- **La barra**, sobre el CSS del build, con las cuatro anchuras y el hueco real
  de la pantalla. El «antes» **no se escribe a mano**: los dos bloques salen de
  `origin/main` con `git show`, recortados por sus propios comentarios
  (`scripts/sacar-marcador-de-antes.py`), y el script **se cae con estruendo**
  si alguno de sus cinco anclajes no aparece exactamente una vez. Copiados al
  banco se estaría midiendo lo que alguien recuerda de la pantalla vieja.

Y dos errores del propio banco que costaron su vuelta, porque los dos daban
verde o rojo por el motivo equivocado:

1. **Desbordar DENTRO de un carril que se desplaza no es estar fuera.** La
   primera medida cantaba los tres filtros como «fuera de la tarjeta» a 1024:
   `getBoundingClientRect()` informa de su posición **sin recortar**, y ahí
   estaban perfectamente alcanzables —`clientW 230 / scrollW 432`—. Un mando
   solo cuenta como perdido cuando **no tiene ningún antepasado que se
   desplace**.
2. **`variant="outline"` de esta casa NO es transparente.** Lleva
   `bg-background`, que computa a **blanco opaco**, así que la heurística de
   «sólido = fondo no transparente» daba `true` también para el botón de antes
   y el modo roto fallaba por no reproducir nada. Lo que separa un relleno de
   un contorno es que **el fondo del botón no sea el de la tarjeta**, más que
   sea distinto del de «Llamar». Medido: antes `rgb(255,255,255)` con 1 px de
   borde violeta —el mismo blanco de la tarjeta—; ahora `rgb(124,58,237)` sin
   borde, contra el `rgb(22,163,74)` de «Llamar».

## La llamada termina y la plataforma no se entera: el fin lo AVISA AstraCalls

«Las llamadas con IA salen, se habla varios minutos, se cuelga, y en CRM ›
Llamadas la **Duración** se queda en un guion y **Detalle** dice "Sin
detalle". En todas, no en algunas.»

Que no quede **ni la duración** es lo que acota la búsqueda: la duración no
necesita ni OpenAI ni créditos ni clave de IA, así que si tampoco está es que
la plataforma **nunca llegó a enterarse de que esa llamada había acabado**. Por
ahí se empezó, y por ahí resultó estar.

Son cinco fallos encadenados. Los tres primeros explican el guion; los dos
últimos, por qué tampoco habría habido texto aunque se hubiera enterado.

### 1. No existía ningún aviso de fin. Ninguno

Es lo primero que se pidió mirar —si se envía, si llega, si la firma lo
rechaza, si el id coincide— y la respuesta se corta en la primera pregunta:
**AstraCalls no avisaba a nadie de que una llamada había terminado.**

Lo único que emite al colgar es `recording.ready`, y sale por el **webhook por
sesión** (`dispatchWebhook` → `getWebhook()`), que **nadie configura**: sin URL
guardada la función se rinde en su primera línea y el evento no sale del
proceso. Así que no hay firma que rechazarlo ni id que comparar; no hay
petición.

Lo que había en su lugar era **sondeo a ciegas**: la plataforma lanzaba la
llamada y se ponía a pedir la grabación cada tanto, a ver si aparecía.

### 2. Y ese sondeo es una promesa suelta dentro de una petición

`esperarYProcesarLaGrabacion` se lanza **sin `await`** desde una acción de
servidor. No está persistido en ninguna parte: vive en la memoria del proceso
de Next, y **un despliegue lo mata sin dejar rastro**. Esta plataforma
despliega decenas de veces al día —está contado en *por qué reiniciaba el
contenedor*, treinta en un día—, así que media hora de espera es media hora
apostando a que no entre ningún merge.

Y cuando se lo lleva un despliegue **no queda nada**: ni fila a medias, ni
error, ni una línea en el registro. La llamada se queda exactamente como nació.

> **Un aviso que existe es lo único que convierte un sondeo en una red de
> seguridad.** Mientras el fin no lo diga nadie, el sondeo no es el respaldo:
> es el mecanismo entero, y es el que se pierde.

### 3. La duración se calculaba… y se tiraba si no se transcribía

Este es el que explica el guion incluso cuando el sondeo sí sobrevivía.

`processCallRecordingForUser` bajaba el WAV, sacaba sus segundos del
encabezado, preguntaba `queHacerConLaGrabacion` y **solo escribía la fila en el
camino de transcribir**. Sin créditos, o con el audio por encima del tope, se
salía con un `return` y **la duración que ya tenía en la mano se perdía**.

O sea: se hizo el trabajo caro —pedirla, bajarla, medirla— y se tiró el dato
barato, que además es el único que no depende de nada de fuera.

> **Lo que ya se sabe se escribe ANTES de decidir si se hace lo demás.**
> `anotarQueHayGrabacion` va inmediatamente después de calcular los segundos, y
> **se hace `await`**: es el único dato que no puede perderse, así que no viaja
> de fondo. Lo que venga después —transcribir, resumir, cobrar— puede fallar
> entero y la tarjeta sigue diciendo cuánto duró.

Y escribe con **`GREATEST`**, no con asignación: esa fila la tocan el aviso de
fin y el procesado de la grabación, y el segundo no puede **bajar** una
duración que el primero ya había dejado puesta.

### 4. Una llamada de más de 6 min 49 s NO se podía transcribir, y era firme

El WAV de AstraCalls es PCM de 16 kHz, **dos canales** y 16 bits: exactamente
**64.000 bytes por segundo**. El tope de una transcripción de OpenAI son 25 MB,
así que **6 minutos y 49 segundos** es donde deja de caber — y «conversación
real de varios minutos», que es lo que decía el reporte, lo pasa sin esfuerzo.

`queHacerConLaGrabacion` devolvía `demasiado_grande` y ahí se acababa: ni texto,
ni resumen, ni —por el punto 3— duración.

> **25 MB dejó de ser el final del camino: es el tamaño de un TROZO.** El audio
> ya está en PCM, así que se corta (`lib/wav-en-trozos.ts`) y se manda por
> partes; los textos se pegan en orden. **El precio no cambia**, porque se
> cobra por segundos y los segundos son los mismos.

Cinco cosas del corte:

1. **El encabezado se RECORRE hasta `data`**, no se da por hecho que está en el
   offset 44. Un WAV con un chunk `LIST` delante es normal, y el tamaño
   declarado puede mentir si el fichero se cerró a lo bruto: manda lo que de
   verdad hay en el buffer.
2. **Los cortes van alineados a `bytesPorMuestra`.** Cortar a mitad de una
   muestra desfasa los canales del trozo siguiente y lo que se transcribe es
   ruido — que no da ningún error: da un texto malo.
3. **Si cabe entero, se devuelve el buffer TAL CUAL**, sin copiar ni rehacer el
   encabezado. El caso normal no paga nada, y así el camino de siempre no puede
   romperse por esto.
4. **Lo que no se reconoce como WAV se manda entero**, como antes. Adivinar
   sobre un formato que no se entiende es peor que dejarlo pasar: OpenAI
   contestará lo que tenga que contestar.
5. **Y sigue habiendo un tope, `TOPE_DE_TROZOS` (12)**, o sea más de hora y
   cuarto. Existe para que un audio absurdo —una grabación que se quedó
   abierta, un fichero que no es lo que dice ser— no se convierta en cien
   peticiones a OpenAI cobradas de la bolsa de alguien. Por encima sí se
   abandona, y se dice con esas palabras y con los minutos delante.

### 5. Y «Sin detalle» nunca fue el resumen de la llamada

Es el fallo que sobrevive a todos los demás, y el más fácil de dar por
contestado: la columna **Detalle** de CRM › Llamadas pintaba `leadSynthesis`
—la síntesis de lead que escriben los seguimientos del CRM—, **no** el resumen
ni la transcripción. Así que aunque el camino entero hubiera funcionado desde
el primer día, esa columna habría seguido diciendo «Sin detalle».

`elDetalleDeLaLlamada` (`lib/detalle-de-la-llamada.ts`, puro) se queda con la
primera línea con contenido **del resumen de la llamada** —saltándose el guion
de una viñeta, que es como escribe el resumen— y nada más. Lo usan la celda
**y el comparador de ordenación**: con dos criterios, ordenar por Detalle
ordenaría por un texto que no es el que se ve.

> Esto decía antes que miraba primero `leadSynthesis`. **Ya no**: la síntesis
> es contexto del CHAT, no de la llamada, y se queda allá. Ver *CRM ›
> Llamadas: cinco arreglos en la misma pantalla*.

### El arreglo: el aviso viaja por el canal que YA existe

No se inventó ninguna tubería, y esa es la decisión de diseño:

```
AstraCalls  --POST /voicebot/call-ended-->  backend  --POST /api/calls/call-ended-->  App
            X-Voicebot-Secret                        x-internal-secret
```

AstraCalls ya tiene configurado `VOICEBOT_RESOLVE_URL` hacia el backend y ya
manda por ahí su uso y su resultado, **con su mismo secreto**. `voicebotURL`
deriva `/call-ended` de esa misma URL y **se niega si no lleva `/resolve`
dentro**: inventarse un endpoint a partir de una URL que no se reconoce es
mandarle el fin de una llamada a cualquier sitio.

Y el backend lo relaya con `CRM_FOLLOW_UP_RUNNER_KEY`, que es la clave interna
de siempre. **Cero variables de entorno nuevas en los tres repositorios.**

Seis cosas que hay que mantener:

1. **El aviso sale de `removeCall`, que es por donde pasan los tres finales**
   —colgar nosotros, colgar el otro y el barrido de sesión—. Con el aviso
   escrito en cada uno, el tercero se olvida, y un final que no avisa se ve
   exactamente igual que el fallo original.
2. **Los datos del bot se leen ANTES de `finalizeRecording`**, que cierra el
   grabador y suelta la llamada. Leídos después, el aviso sale con el teléfono
   y el `answered` en blanco.
3. **Va en una goroutine** (`go reportCallEnded(...)`): colgar no puede quedarse
   esperando a que la plataforma conteste. Y la plataforma, por lo mismo,
   **contesta `202` en cuanto ha escrito la duración** y deja la grabación de
   fondo.
4. **Sin `sid` o sin `callId` no se manda nada**, y la ruta de la App los exige
   con un `400`. Es el par con el que se encuentra la fila; medio aviso no
   encuentra nada y lo que deja es un error que no se parece a su causa.
5. **`durationSecs` que no venga NO es cero.** La ruta solo lo usa si es finito
   y mayor que cero; lo demás es «no lo dijo», y con `GREATEST` eso deja la
   fila como estaba en vez de borrarle el tiempo a una llamada que sí ocurrió.
   Es la misma regla de *un número que no se puede calcular no se sustituye por
   otro*.
6. **`hasRecording` solo cuenta cuando es un `false` explícito.** Sin el campo
   es «no se sabe», y darlo por falso dejaría sin transcribir una grabación que
   sí está — el mismo reparto que `abierta` en las tarjetas de reunión. Con un
   `false` de verdad la App escribe la duración, contesta `Sin grabación.` y
   **no sondea ni una vez**.

### La fila se busca por `(sid, callId)` y nada más

`laLlamadaDeEseId` no recibe cuenta ninguna. Y eso es a propósito, porque **la
cuenta bajo la que quedó la fila no es la de quien llamó**: `logOutgoingCallAction`
la escribe bajo la cuenta **dueña de la línea** (#849), que en una conversación
de una línea de otra cuenta de la familia es otra. Buscando con la cuenta de
quien pulsó no se encontraría, y el aviso se rendiría sin decir nada — que es
literalmente el fallo del que venimos.

El par `(astraSid, astraCallId)` **ya identifica la llamada sin ambigüedad**: lo
genera el servidor de llamadas y no se repite. La consulta se acota además a
**dos días** (`DIAS_PARA_BUSCAR_LA_LLAMADA`) con `make_interval(days => $1::int)`
—moldeado, que es la regla de siempre: Prisma manda el parámetro sin tipo y
`make_interval` solo acepta `int`—, y eso no es un filtro de permisos: es lo
que impide que esto barra `chat_messages`, que es la tabla más grande de la
plataforma.

Y el aviso **es idempotente**: `procesarElFinDeLaLlamada` puede llegar dos veces
—un reintento de AstraCalls, el flujo y el botón— y no pasa nada. La duración va
con `GREATEST` y el guardado del texto lleva
`WHERE (raw->'call'->>'transcript') IS NULL`, así que solo una vuelta escribe y
**solo esa cobra**.

Y **el sondeo se queda**, ahora sí como lo que debería haber sido: la red de
abajo. El aviso intenta procesar la grabación **una vez de inmediato** —es lo
normal: al colgar suele estar— y solo si no está cae en
`esperarYProcesarLaGrabacion`. Si el aviso no llega nunca —AstraCalls caído, la
red— el camino viejo sigue existiendo.

### Lo que NO era, y se descartó mirándolo

Conviene que esté escrito, porque las dos sospechas naturales cuestan una tarde
cada una y **ninguna de las dos tenía que ver**:

| se sospechaba | por qué no |
| --- | --- |
| el arreglo anterior (#861, el contexto y `enviar_whatsapp`) | ese toca **qué se le dice al modelo** y **por qué línea sale un WhatsApp**. No interviene después de que la llamada empiece, y no escribe nada en la fila. |
| el `VOICEBOT_SECRET` | guarda `resolve`, o sea si la llamada **sale**. El reporte dice que sale y se habla. Después de eso no vuelve a intervenir. |

### El banco

`scripts/banco-grabacion-de-llamada.sh` (App) más los dos de los otros
repositorios, y cada uno prueba lo que solo él puede:

| | qué ejerce |
| --- | --- |
| **App**, secciones F y G | la ruta de fin: `401` sin clave, `400` sin el par, `404` con una llamada que no está, **la duración escrita aunque la transcripción se abandone por créditos**, el `202` que deja `durationSecs: 187` antes de contestar, y `hasRecording: false` que **no sondea ni una vez** |
| **App**, secciones A5–A7 y G | el corte del WAV: un WAV que cabe vuelve intacto, uno que no cabe sale en trozos con encabezado propio y sin perder un byte de datos, y una llamada de 500 s (**32 MB**) que el modo roto abandona por tamaño acaba con **dos** peticiones a la IA, el texto de los dos trozos y su resumen |
| **astracalls**, `fin_de_llamada_test.go` | que `voicebotURL` deriva el endpoint y **se niega** con una URL que no lleva `/resolve`, y que 2 canales × 16.000 Hz × 16 bits son 64.000 bytes/s — el número del que cuelga el punto 4 |
| **api-webhook**, `__banco__/fin-de-llamada.banco.ts` | el relay: la forma exacta de lo que sale hacia la App, que un secreto equivocado **no relaya**, que sin `sid` o `callId` tampoco, y que si falta la configuración **no es mudo** |

`MODO=roto` corre **lo que había, escrito literal** —`laDecisionDeAntes`, con su
`bytes > TOPE_DE_BYTES_DE_AUDIO → demasiado_grande`, y `comoSeProcesabaAntes`,
que baja el audio, decide y **devuelve sin escribir**— y **afirma los dos
fallos**: `durationSecs === 0` y ninguna transcripción.

Y una del propio banco que costó una vuelta, porque es la trampa de esta
familia entera: **el modo roto NO puede llamar a la función de hoy.**
`comoSeProcesabaAntes` empezó llamando a `queHacerConLaGrabacion`, que ya corta
en trozos, así que sobre 32 MB contestaba `transcribir` y el modo roto **no
reproducía nada**: salía verde por no ejercer el caso. Con el «antes» escrito
dentro del banco, los dos modos pasan sus 30 casos y el rojo del roto es el
fallo de verdad.

Por lo mismo hizo falta un `INABARCABLE` (`TOPE_DE_TROZOS × TOPE_DE_BYTES + 1`)
para los casos que prueban `demasiado_grande`: el tamaño que antes lo
disparaba —`TOPE + 1`— ahora se transcribe en dos partes, así que esos dos
casos habrían dejado de ejercer su rama **sin dejar de estar en verde**.


## La App va a DOS réplicas; el backend a UNA, y la diferencia no es de tamaño

Aparecieron **dos contenedores del backend** corriendo en paralelo en
Portainer, donde siempre había habido uno. La tentación es leerlo como lo de
la App —que va a dos **a propósito**, y está contado en *los 100 segundos de
caída por despliegue*— y darlo por bueno. No lo es, y la diferencia es de
**corrección, no de escala**:

| | qué es el proceso | ¿dos réplicas? |
| --- | --- | --- |
| la App | un servidor que atiende peticiones; lo que hay que evitar es el hueco de `502` | **sí**, con `start-first` |
| el backend | un servidor **más 18 planificadores dentro del mismo proceso** | **no**, y subirlo es un fallo |

> **Un proceso que lleva dentro planificadores sin candado compartido no se
> replica.** Dos réplicas no reparten ese trabajo: lo **duplican**. Y lo que se
> duplica aquí son WhatsApps a clientes de verdad —seguimientos del CRM,
> recordatorios, informe semanal, seguimiento de prueba— y una vuelta de
> facturación que **suspende y elimina cuentas**.

Comprobado con un barrido, no supuesto: ninguno de los dieciocho
`*.scheduler.service.ts` toma `advisory_lock`, ni `FOR UPDATE SKIP LOCKED`, ni
elige líder. Y hay dos cosas más que se rompen al duplicar, las dos de familias
que este documento ya conoce:

- **`baileys-sessions` es un volumen `local`.** Dos procesos escribiendo los
  mismos ficheros de sesión de WhatsApp es exactamente la avería de *copiar
  sesiones de WAHA*: sesión corrupta y QR nuevo.
- **El antiflood guarda su estado en un `Map` de memoria.** Con dos réplicas
  cada una ve la mitad del tráfico, así que el tope deja pasar el doble **sin
  que nadie lo note** — un fallo mudo de los caros.

### Un healthcheck que no puede pasar deja DOS contenedores, no cero

Es la causa que estaba debajo, y es la misma trampa que ya costó el primer
intento del healthcheck de la App —*sin `ENV HOSTNAME=0.0.0.0`, `127.0.0.1` da
conexión rechazada*— reaparecida por el otro lado:

```
HEALTHCHECK ... http://localhost:3000/health     ← el de antes
```

Desde **Node 17** el orden de DNS es `verbatim`, y estas imágenes de Debian
llevan `::1 localhost` en `/etc/hosts`, así que `localhost` puede resolver a
**IPv6** primero. Nest escucha en `0.0.0.0`, que es **solo IPv4**: la petición
sale con `ECONNREFUSED` y el healthcheck falla **siempre**, sin que la App
tenga nada malo.

Y lo que eso produce no es «el servicio se cae». Es lo contrario, y por eso
despista: una tarea que no pasa el healthcheck se queda en `starting`, así que
con `start-first` **la vieja no se retira nunca** y quedan **dos contenedores
corriendo en paralelo indefinidamente**. El síntoma que se reporta no es un
error: es «ahora hay dos».

Dos reglas, y las dos valen para cualquier healthcheck de esta plataforma:

1. **`127.0.0.1`, nunca `localhost`.** Un nombre que puede resolver a dos
   familias de direcciones no sirve para preguntarle a un proceso que solo
   escucha en una.
2. **El margen de arranque cubre lo que de verdad tarda el arranque.** El
   backend corre `prisma migrate deploy` **antes** de `node dist/main`: con
   `--start-period=40s --retries=3` bastaban 90 segundos de arranque lento para
   dar la tarea por muerta.

### `start-first` es correcto en la App y está PROHIBIDO en el backend

Por lo mismo que prohíbe la segunda réplica: `start-first` **solapa** la vieja y
la nueva unos segundos, y en ese solape los planificadores corren por duplicado
y las dos tocan el volumen de baileys. El backend va con `stop-first` —que
además es el de Swarm por defecto— **escrito explícito**, para que no se cambie
sin leer por qué.

**Lo que cuesta se dice:** cada despliegue del backend deja un hueco en el que
los webhooks de Evolution, Waha y Meta no encuentran a nadie. Se acepta frente
a mandarle a un cliente el mismo seguimiento dos veces. Volver a `start-first`
pide sacar antes los planificadores a un candado compartido, y eso es un frente
aparte.

### Y se comprueba en el SERVICIO, nunca en el fichero

Es la regla del pendiente 1 aplicada aquí, y hay que tenerla delante antes de
dar nada por arreglado: el `portainer-stack.yml` del repo **no manda** sobre lo
que corre. Del repo entra el `HEALTHCHECK` de la imagen con el siguiente build
—el stack del backend no declara `healthcheck:`, así que el de la imagen es el
que corre—; el bloque `deploy:` solo entra si alguien vuelve a pegar ese stack
en Portainer.

```
docker service inspect backend-app_api-webhook-verzay \
  --format '{{.Spec.Mode.Replicated.Replicas}} {{.Spec.UpdateConfig.Order}}'
docker service ps backend-app_api-webhook-verzay --no-trunc
```

Un `2` ahí es el número que hay que bajar. Y `start-first` con una tarea vieja
en `Running` es la réplica sin retirar.

Lo protege `scripts/banco-replicas.sh` en el repo del backend, en dos modos:
comprueba que `replicas` es **1** y está declarado **una sola vez**, que el
orden es `stop-first`, que el healthcheck no usa `localhost` y tiene margen, y
que **ningún planificador toma candado** —que es *por qué* va a una—. Cuando
alguno lo tome, ese banco se pone rojo a propósito: entonces se puede volver a
decidir, leyendo el bloque `deploy:`, no borrando la línea.


## El CRM de la familia: la URL limpia significa TODAS

La cuenta madre tenía que entrar cuenta por cuenta para ver los leads de sus
hijas: Llamadas, Registros, Kanban y Reportes acotaban cada uno por la cuenta
con la que se abría la pantalla. Con cinco cuentas eso es cinco sesiones
abiertas para mirar un mismo embudo.

**No se estrenó ningún mecanismo.** `laFamiliaDeLaCuenta` —la malla de
`linked_accounts` del #812, en los dos sentidos y con ciclos—, `esLaCuentaMadre`
y `comoListaDeCuentas` son las de siempre, y el selector y la columna de cuenta
son los mismos componentes que ya usa Finanzas de la familia
(`SelectorDeCuentas`, `ColumnaDeCuenta`). Lo que decide vive en
`lib/crm-de-la-familia.ts`, **puro**, y quien lo resuelve contra la base en
`lib/cuentas-del-crm.ts`.

### La diferencia con Finanzas, que es la que decide todo lo demás

Es una sola cosa y de ella cuelga el resto, así que conviene tenerla delante
antes de tocar nada:

| | sin `?cuentas=` en la URL |
| --- | --- |
| **Finanzas** | **solo la cuenta propia** — el selector sirve para JUNTAR a mano |
| **CRM** | **TODAS las de la familia** — unificado es el punto de partida |

En Finanzas consolidar es una elección porque en la cuenta madre conviven las
finanzas de la casa con las personales y sumarlas casi nunca es lo que se
quiere. En el CRM no: los leads, los registros, las llamadas y el tablero de una
familia son **el mismo embudo repartido entre varias líneas**, y mirarlos de uno
en uno es justo el trabajo que esto viene a quitar.

> De ahí la asimetría: **aquí el parámetro se escribe para REDUCIR**, no para
> ampliar. Y `laSeleccionDelCrm` **nunca devuelve una lista vacía**: un
> `?cuentas=` rancio de un enlace guardado dejaría la pantalla en blanco sin
> decir por qué, y el caso común de llegar ahí no es un ataque.

> **Corregido después**: esto decía que bastaba con exigir ser la **raíz** de
> la familia para que una hija no viera a su madre. **No bastaba**: la raíz sale
> de un recuento de votos que una cuenta intermedia puede ganar, y entonces veía
> hacia arriba. El alcance es ahora `lasCuentasQueCuelganDe` —lo propio y lo de
> abajo, nunca la madre ni las hermanas—; está contado entero en *El alcance del
> CRM va HACIA ABAJO*.

### La puerta va en la acción, y el camino común SÍ paga la familia

La lista viaja en la URL y en los parámetros de cada acción, así que **una
acción de servidor ES un endpoint**: `getRegistrosByUserId(propia, …, ids)` se
llama a mano con los ids que uno quiera. Las cinco pestañas la re-resuelven con
`lasCuentasQueConsultaElCrm`, que es la misma puerta que pinta el filtro.

Y aquí está la consecuencia de coste que Finanzas no tiene: allí, sin
parámetro, no se consulta nada —la respuesta es «la propia»—; **aquí hay que
resolver la familia para saber cuál es el «todas»**. Por eso el alcance se
recuerda unos segundos con `recordarPorSesion`, con dos cosas que hay que
mantener:

1. **La llave son los ids que deciden y nada más** (`crm-de-la-familia|<propia>`):
   la familia de una cuenta solo depende de esa cuenta. Lo que decide la
   **persona** —`canManageWorkspace`, que un `agente` no pasa— se resuelve
   **antes** y sin tocar la base, así que ni llega a la llave.
2. **Un alcance recortado por un fallo NO se cachea** (`sirveParaCachear`). Es
   la regla de siempre: guardar cinco segundos una pérdida de vista la propaga
   a las peticiones de al lado, y eso se ve como una pantalla que a veces trae
   menos filas.

### Lo que se puede TOCAR y lo que solo se MIRA no es igual en las cinco

Es el hallazgo de esta vuelta y no se ve leyendo una pantalla: **las acciones de
escritura del CRM no acotan todas igual**, así que el gate de «fila ajena» hace
falta en unas y sobraría en otras.

| | de dónde saca el dueño una escritura | ¿fila ajena de solo lectura? |
| --- | --- | --- |
| Registros | de la FILA (`assertUserCanUseApp(registro.session.userId)`) | **no hace falta**: la madre sí está autorizada |
| Kanban | de la FILA (`updateSessionLeadStatus` resuelve la sesión) | **no hace falta** |
| Llamadas | de la cuenta de quien LLAMA | **sí** — sus cuatro escrituras |
| Reportes | de la cuenta de quien llama | **sí**, y «Eliminar todos» se esconde unificado |

Poner el candado donde no hace falta es peor que no ponerlo: se pinta un «—»
sobre una fila perfectamente editable y nadie sabe por qué. Y no ponerlo donde
hace falta es el «menú abierto, puerta cerrada» de siempre. Por eso
`esDeOtraCuentaDelCrm` está escrita una vez y **sin dueño no es ajena**.

De ahí salió además un rastro muerto que el barrido del diff cazó: una prop
`cuentaPropia` declarada, pasada y **nunca leída** en la tabla de Registros —la
mitad de un gate que al final no hacía falta—. Una prop obligatoria que nadie
usa es la que la próxima pantalla copia creyendo que decide algo.

### El TOPE de una lista crece con las cuentas elegidas

Es la misma trampa que Finanzas ya midió, y aquí vale para las cinco:
`elTopeDelCrm(porCuenta, cuantas)`. Dejando el tope de una cuenta al unificar
cinco, las cinco se reparten las mismas filas —van ordenadas por fecha, así que
se intercalan— y **cada una enseña menos de lo que enseñaba sola**: unificar se
vería como perder filas. Con techo (`TECHO_DE_CUENTAS_EN_UN_TOPE`, 5), porque
esta lista viaja entera al navegador.

El del informe de lo que la IA no supo se llamaba `TOPE_DEL_INFORME` y era un
número fijo; se renombró a `TOPE_POR_CUENTA` **para que el nombre diga la
unidad**, que es lo único que impide volver a dejarlo fijo.

### Y el `grupoId` de dos cuentas distintas NO es el mismo grupo

`lo-que-la-ia-no-supo` agrupaba por `grupoId`, que lo calcula el backend con un
embedding **dentro de una cuenta**. Al unificar, el mismo hueco del
entrenamiento en dos líneas distintas colapsaba en **una sola fila**, con la
cuenta de la primera que apareciera: un número que no se puede explicar
señalando la pantalla.

La clave de agrupación es **compuesta**, `cuenta::grupo`, y el `grupoId` que sale
es esa clave. El banco lo ejerce a propósito sembrando el MISMO `grupoId` en las
tres cuentas: sin la cuenta dentro, tres grupos se leerían como uno.

### El Kanban sin parámetro sigue siendo el de SU cuenta

`getKanbanSessionsAction` lo pintan **tres** pantallas —el CRM, `/tags` y
`/asesores`— y **solo la del CRM unifica**. Llamar a
`lasCuentasQueConsultaElCrm` a secas devuelve todas las de la familia, así que
pondría de golpe las tarjetas de las hijas en dos tableros que nadie tocó, sin
un solo error. **Sin parámetro se contesta con la cuenta propia**, que es
exactamente lo que esas dos enseñaban antes.

Y `KanbanCard.cuentaId` baja **siempre**, unificado o no: la insignia se decide
al pintar y el gate necesita el dueño — con un campo opcional, «sin dueño no es
ajena» dejaría el arrastre abierto sobre tarjetas que la acción luego rechaza.

### Una cosa que se midió y no se tocó: los créditos

`getAnalyticsDataByUserId` consolida sus sesiones, sus mensajes y sus tareas, y
**`ia_credits` no**: esa fila es de la cuenta y sumar los saldos de cinco
cuentas daría un número perfectamente creíble que no corresponde a ninguna
bolsa. Es la familia del «999999999 de -1 créditos»: lo que no se puede sumar no
se suma.

### El banco: la decisión aparte, y las ACCIONES contra Postgres

`scripts/banco-crm-de-la-familia.sh`, dos mitades. Probar `laSeleccionDelCrm` a
solas sería probar el lado que **no tiene puerta**; lo que hay que demostrar es
que las cinco pestañas pasan por ella y que el alcance sale de FILAS —con
`linked_accounts` sembrada— y no de un parámetro. Se finge **solo**
`currentUser()`, `revalidatePath` y el `cache()` de React.

Los cuatro casos del encargo están, y uno más que se añadió al ver el riesgo:
la madre ve las llamadas de sus dos hijas y ninguna de una cuenta ajena; una
hija no ve nada de su madre ni de su hermana **ni escribiendo el parámetro a
mano**; el filtro reduce a una sola cuenta en las cinco pestañas; los totales de
Reportes cuadran con el filtro puesto —y la lista de abajo da el mismo número,
que es lo que evita dos cifras que se contradicen—; y el Kanban sin parámetro
sigue siendo el de su cuenta.

`MODO=roto` lleva **la consulta vieja escrita dentro, literal** —cada acción
acotada a `userId = la propia`— y **afirma el fallo**: la madre ve solo lo suyo.
Sin ese modo, lo verde del otro no diría si se arregló la causa o si el caso no
se llega a ejercer.

Tres cosas del propio banco, que costaron su vuelta:

1. **`weekly_reports` e `ia_sin_respuesta` no están en `schema.prisma`** —las
   crea el backend— así que el banco las escribe con su propia DDL. `Session`,
   `Registro` y `chat_messages` sí están, y las crea `db push`.
2. **`Registro.userId` lo rellena un disparador en producción**, y con
   `db push` no hay disparador: se pone a mano o la siembra entera cae en la
   cuenta equivocada sin decir nada.
3. **La base se reutiliza entre ejecuciones**, así que los ids llevan el sello
   de la vuelta. Y los conteos de cada cuenta son **distintos a propósito**: con
   todas iguales, un total equivocado seguiría cuadrando.

## El alcance del CRM va HACIA ABAJO: la familia no es un alcance

Yair —administrador de Verzay | Atencion, que cuelga de Carlos Arcos y tiene
a Verzay Ventas debajo— veía desde su sesión las llamadas de Carlos. Fuga entre
cuentas, **hacia arriba**.

La causa estaba en cómo se decía «qué alcanza» el CRM (ver *El CRM de la familia*):
**la RAÍZ del componente de `linked_accounts` veía el componente entero**, y la
raíz sale de un recuento de votos (`laRaizQueManda`: quien más vinculó bajo la
suya, y a igualdad el id menor). Esa tabla es una malla con enlaces de vuelta,
así que el recuento lo gana una cuenta INTERMEDIA en cuanto vincula a tantas
como su madre —o a su propia madre de vuelta—. Y el id de Atencion empieza por
dígito: gana los empates. Con eso Atencion era «la madre» y su administrador
veía hacia arriba y hacia los lados.

> **La familia (`laFamiliaDeLaCuenta`) es un componente SIN dirección.** Sirve
> para que un chat del equipo no se parta; **no es un alcance de datos**.

La regla, en `lasCuentasQueCuelganDe` (`lib/crm-de-la-familia.ts`, pura):

1. Se ve lo propio y lo que se alcanza **bajando** por `master → linked`.
2. **Nunca se pasa por una cuenta que también alcanza a esta**: esa está por
   encima. Sin esa condición, un enlace de vuelta (hija → madre) lleva a la
   madre, y de ella a las hermanas.
3. Una pareja recíproca (`A ↔ B`) se anula: ninguna ve a la otra. Es el lado
   seguro a propósito —un enlace de ida y vuelta no dice quién manda—; si hace
   falta, se borra el enlace que sobra y queda escrito el sentido.
4. **El superadministrador de verdad ve la familia entera** (`esSuperAdminDeVerdad`),
   porque todas cuelgan de él. Y eso entra en la llave del recuerdo de 5 s:
   con la misma llave, el administrador heredaría el alcance del super.

Un `agente` sigue viendo solo su cuenta. El alcance ya no depende de quién gane
ningún recuento: `laRaizQueManda` sigue decidiendo quién reparte canales del
chat del equipo, **y nada más**.

Lo prueba `scripts/banco-crm-de-la-familia.sh` (con
`lib/__tests__/crm-alcance-hacia-abajo-db.test.mjs`): el caso de producción con
sus nombres, contra Postgres y por `getCallsCrmData` de verdad. `MODO=roto`
afirma que con la regla vieja Yair alcanzaba a Carlos; y con el código anterior
puesto, el banco normal se pone rojo por los tres sitios.

**Vale para las cinco pestañas del CRM**, porque las cinco pasan por la misma
puerta. Las demás pantallas que cruzan cuentas (Chats, Leads, Finanzas,
Reuniones, Documentos…) **no se han tocado aquí**: están auditadas en el PR.

## Ninguna puerta sube: «Ingresar», el conmutador y `assertCanAccessTargetUser`

La regla del CRM —*el alcance va HACIA ABAJO*— se aplicó después a las tres
puertas que dejan actuar sobre otra cuenta, porque las tres dejaban subir y dos
de ellas dejaban hacerse pasar por el superadministrador:

| puerta | qué dejaba |
| --- | --- |
| «Ingresar» (`impersonateUser`, y la cookie que `currentUser()` lee) | cualquier cuenta con rol `admin` entraba como **cualquier** usuario, Carlos Arcos incluido, y dentro tenía sus poderes |
| el conmutador de cuentas (`active_account_id`) | una hija se cambiaba a la cuenta de su madre y actuaba como ella |
| `assertCanAccessTargetUser` | el vínculo valía en los dos sentidos, y el rol `admin` abría cualquier cuenta |

Y aparte, cinco consultas de Leads (`getSessionsByUserId`,
`getSessionsCountByUserId`, `searchSessionsByUserId`, `getLeadsPorLinea` y
`deleteSession`) **no preguntaban nada**: con sesión y el id de otra cuenta se
leían —y se borraban— sus leads. Ahora pasan por `assertCanAccessTargetUser`,
y `getSessionByRemoteJid` filtra sus cuentas igual que `getSesionesDeLaCuenta`.

> **Quién puede llegar a qué lo decide `puedeLlegarA`
> (`lib/alcance-entre-cuentas.ts`, puro), y lo aplica `juzgarElAlcance`
> (`.server.ts`) en las tres puertas.** Nunca a una cuenta de
> superadministrador, nunca a una por encima de la propia, nunca a una cuenta de
> la casa (`admin`) que no cuelgue de ella. El superadministrador de verdad
> llega a todo. **Solo quita**: lo que queda —los clientes— sigue con las reglas
> de rol de cada puerta.

Cinco cosas que hay que mantener:

1. **El objetivo se juzga por su CUENTA** (`ownerId ?? id`). Entrar como una
   persona del equipo de Carlos es actuar con el alcance de Carlos: su fila dice
   `user`, su cuenta es la de arriba.
2. **La cookie se vuelve a juzgar en CADA petición**, no solo al pulsar
   «Ingresar». Vive treinta días: una puesta antes de esta regla no puede seguir
   abriendo lo que ya no se abre. Si no alcanza, se ignora y se sigue en la
   cuenta propia, con aviso.
3. **El conmutador solo BAJA** (`master = yo, linked = ella`). La rama
   «membership» —cambiarse a quien te vinculó— se quitó entera de `lib/auth.ts`,
   de `switchToAccount` y del menú (`getMyLinkedAccounts`). En producción eso
   dejó sin ese cambio a: Atencion, Ventas, Notificaciones y Pruebas → Carlos;
   Ventas → Atencion; Asesor → Daniel Peralta; y Carlos Padilla, Genesis Crespo
   y Genesis Velez → Roberto Crespo. Todas son cuentas con su propia línea, no
   personas del equipo: el equipo entra por `owner_id`, que no se toca.
4. **Leer los enlaces LANZA** (`losEnlacesDeLaCuenta`), a diferencia de
   `laFamiliaDeLaCuenta`. Sin enlaces «¿está por encima?» contesta que no y la
   puerta se abriría hacia arriba; así que un fallo es un «no», dicho.
5. **Una fila `master = yo, linked = ella` sigue abriendo**, en el conmutador y
   en `assertCanAccessTargetUser`, aunque haya otra de vuelta: es un vínculo que
   uno mismo declaró. Por eso las dos cuentas de Edgar Pérez —vinculadas en los
   dos sentidos— siguen llegando la una a la otra. Lo que una pareja recíproca
   NO da es «Ingresar» como cuenta de la casa: ahí cada una está por encima de
   la otra, igual que en el CRM.

**Lo que esto dejó a medias** —la bandeja de Chats seguía enseñando las líneas
de la madre y sus acciones contestaban «No autorizado»— está cerrado en la
sección siguiente.

Lo prueba `scripts/banco-alcance-entre-cuentas.sh`, contra Postgres y con
`currentUser()` DE VERDAD —solo se finge la petición: la sesión y las cookies—.
`MODO=roto` empaqueta **las mismas pruebas** contra el código de un commit
pinchado (`ANTES_REF`) sacado a un `git worktree`, y afirma la fuga: Yair entra
como Carlos, Atencion se cambia a Carlos, y un cliente lee y borra los leads de
otra cuenta.

## La bandeja de Chats también va HACIA ABAJO: líneas, rutas, otra línea, notas y tiempo real

Es el punto 5 de la auditoría del 2026-09-22. Después de #898 las acciones solo
bajaban, pero **la bandeja seguía juntando las cuentas vinculadas en los dos
sentidos**: la hija veía las líneas de su madre y todo lo que hacía sobre ellas
contestaba «No autorizado». Botones rotos, y además una fuga: el token de tiempo
real la unía a la sala de la madre, así que recibía en vivo sus avisos.

> **Qué cuentas alcanza la bandeja lo decide `lasCuentasDeLaBandeja`
> (`lib/alcance-de-la-bandeja.ts`, puro)**: la cuenta por la que se actúa, la
> fila de la persona, y las que cuelgan de esa cuenta HACIA ABAJO
> (`lasCuentasQueCuelganDe`, la regla del CRM). Nunca la madre ni las
> hermanas. El superadministrador de verdad, la familia entera. Un `agente`,
> solo lo suyo.

La aplican, y **tienen que decir lo mismo**:

| dónde | por qué función |
| --- | --- |
| la página de Chats (qué líneas se pintan) | `lasCuentasQueVeLaBandeja` + `lasLineasDeLasCuentas` |
| las rutas `/api/chats/{lista,conversacion,precarga}` y las acciones de una línea o conversación | `getAssociatedAccountIds` |
| el token de tiempo real (a qué salas se une) | `lasCuentasQueVeLaBandeja` |
| «Enviar por otra línea» de las macros | `getAssociatedAccountIds` |
| con quién se comparte una nota (`getTeamIds`) | `lasCuentasQueCuelganDe` / la familia del superadmin |

`getAssociatedAccountIds` es la de las puertas y **no** recorta al agente —era
así antes y el agente no ve esas líneas de todas formas—; `lasCuentasQueVeLaBandeja`
es la de lo que se ENSEÑA y sí. Una sala de tiempo real de más no es un aviso de
más: es una conversación ajena llegando al navegador.

Seis cosas que hay que mantener:

1. **`getLinkedAccountsInstances` y `getMasterAccountInstances` se fueron.**
   Vivían en un fichero `'use server'`, o sea eran dos endpoints que devolvían
   las líneas de la cuenta que se les nombrara sin preguntar nada, y la
   segunda era justo la que traía las de la madre. Su sustituto,
   `lib/lineas-de-las-cuentas.server.ts`, no decide a quién: la lista la pone
   quien llama.
2. **Una pareja recíproca (`A ↔ B`) se anula**, como en el CRM: ninguna ve las
   líneas de la otra en la bandeja, aunque `assertCanAccessTargetUser` las
   deje actuar. Eso no rompe ningún botón —la bandeja enseña MENOS de lo que
   la puerta deja hacer, nunca más—; si hace falta que una vea a la otra, se
   borra el enlace que sobra.
3. **Un enlace directo `A → N` hace de N una hija de A**, aunque N cuelgue
   también de la madre de A. «Hermana» es la que solo comparte madre.
4. **Las notas: el equipo es la cuenta, su dueña y sus asesores, más lo que
   cuelga hacia abajo.** Antes sumaba las cuentas que la vincularon a una (la
   madre), con su nombre y su correo en el selector.
5. **`getAuthorizedAccountUserIds` de `chat-manual-actions` sigue subiendo, a
   propósito**: es para RECURSOS —las respuestas rápidas y los flujos de la
   cuenta madre—, no para líneas. Lo que decide sobre una línea (la firma,
   borrar un mensaje) va ya con `getAssociatedAccountIds`. Cerrar también los
   recursos es otra decisión, y está pendiente.
6. **El informe de mudanza lo dice**: `origenCuelgaDelDestino`. Pasar de la
   cuenta madre a una hija pierde los chats de la madre, aunque sea
   administradora y estén en la misma familia.

Lo prueba `scripts/banco-bandeja-hacia-abajo.sh`, contra Postgres y con
`currentUser()` de verdad, por las cinco puertas. `MODO=roto` empaqueta las
mismas pruebas contra `22dd27b` y afirma la fuga: la hija ve, ofrece, comparte
y escucha lo de su madre.

## Enviar por un canal (Meta, Telegram) pide que la línea sea tuya o de abajo

`sendChannelTextAction` —texto y archivos por Meta y Telegram— **no comprobaba
de quién era la línea**. Con sesión y el nombre de cualquiera, se le escribía a
un cliente por un canal ajeno. Quedó anotado en el #899; las hermanas del mismo
fichero tenían el mismo hueco: `sendMetaTemplate`, `listMetaTemplates`,
`sendChannelQuickReplyAction` (que solo miraba el atajo, no la línea),
`fetchChannelChats` y `warmChannelMessages`.

> **La puerta es `laLineaDelCanalAlcanza` (`lib/linea-del-canal.server.ts`,
> con la decisión pura en `lib/linea-del-canal.ts`)**: la cuenta dueña de la
> línea tiene que estar en `getAssociatedAccountIds` —la propia y las que
> cuelgan HACIA ABAJO, el mismo alcance con el que la bandeja la enseña—.
> Nunca la madre, nunca una hermana.

Tres cosas que hay que mantener:

1. **Va ANTES de todo**: antes de pausar la IA y antes del `fetch` al backend.
   Un rechazo no escribe nada ni llega al proveedor, y dice
   «No tienes acceso a la línea X: es de otra cuenta.». Tampoco es mudo:
   `[canales] envío rechazado`.
2. **El cuerpo sin puerta vive en `lib/envio-por-canal.server.ts`**
   (`server-only`), y solo lo importan los caminos del servidor SIN sesión que
   eligen la línea ellos: el despachador de avisos, las notificaciones de
   facturación, el aviso de desconexión y `sendMessageWithHistoryAction` (que
   ya está abierta a propósito por la página pública). Ponerles la guarda los
   APAGARÍA —la regla de *un runner de sistema no puede ser una acción*—.
   **Una pantalla nunca importa de ahí**: va por la acción.
3. Lo que llama con sesión (macros, respuesta a llamada perdida) sigue por la
   acción guardada: su línea es propia y pasa.

Lo prueba `scripts/banco-linea-del-canal.sh`, contra Postgres, con
`currentUser()` de verdad y el `fetch` al backend contado. `MODO=roto`
empaqueta las mismas pruebas contra `f48dbe5` y afirma la fuga: la hija escribe
por la línea de su madre y el backend lo recibe.

## CRM › Llamadas: la barra es la de Leads, y marcar vive en una ventana

La pantalla tenía **tres filas de mandos** donde las demás tienen una: la de
pestañas del CRM arriba, debajo el marcador —campo del número, «Llamar» y
«Llamar con IA»— con los rangos de días y «Actualizar» a su derecha, y todavía
una tercera con el buscador, las pastillas y los filtros de dirección. Puesta
al lado de Leads no se leían como la misma plataforma.

Ahora es lo de siempre: **los rangos y el «Actualizar» suben a la fila de
pestañas** (Analíticas · Registros · Llamadas · Kanban · Reportes, pegados a su
derecha con `ml-auto`) y debajo queda **una sola** `BarraDeAcciones` con sus
cinco huecos en orden:

```
[buscador] [·· pastillas + dirección ··] [Exportar CSV] [Llamar] [⋯]
```

> Esa fila de pestañas ya no existe dentro de Llamadas, y con ella se fueron
> los rangos y las pastillas de conteo. Lo que queda es **una sola** barra, la
> de abajo. Está contado entero en *Llamadas se alinea con Leads*.

Medido en Chromium sobre el CSS de los **dos** builds —el «antes» sale de
`origin/main` con `git show`, nunca de una copia escrita en el banco—, lo que
había por encima de la primera fila de la tabla:

| ventana | antes | ahora | recupera |
| --- | --- | --- | --- |
| 1440 | 110 px | **40 px** | 70 px |
| 1280 | 110 px | **40 px** | 70 px |
| 1024 | 110 px | **40 px** | 70 px |
| 390 | **198 px** | **40 px** | **158 px** |

En un teléfono eran casi doscientos píxeles de mandos antes de la primera
llamada. Y en las cuatro anchuras el `⋯` queda pegado al borde derecho y el
azul justo antes (a 48 px, el ancho del `⋯` más su hueco), sin desbordar.

### El rango de días ya no es un mando: es el valor por defecto

Estuvo en la fila de pestañas del CRM, y se fue con ella. `rango-de-dias.ts`
conserva **solo `DIAS_POR_DEFECTO`**, que es lo que consulta la pantalla.

**Si vuelve a hacer falta elegirlo, vuelve AHÍ y no a la pantalla**: el número
que se ofrece y el que se consulta tienen que salir del mismo sitio o un día
dirán cosas distintas, y eso no se ve como un error — se ve como un botón que
no cambia nada.

Y **no es el `period` de al lado.** Aquel es `AnalyticsPeriod` (`"7d"`…) y
decide los filtros de Registros; este es un número de días y va a
`getCallsCrmData`. Juntarlos sería un filtro que promete lo que la pantalla de
al lado no hace.

«Actualizar» pasó al hueco `secundarias` de la barra, al lado de «Exportar»:
es lo que se hace sobre la lista ENTERA sin acotarla, que es justo lo que ese
hueco significa. Llama a `load` directamente —ya no hay contador que subir— y
gira mientras la consulta va y vuelve, porque un botón que no se ve pulsado se
pulsa cinco veces.

### Marcar es lo excepcional: el campo y «Llamar con IA» se fueron al diálogo

El campo del número y los dos botones se comían unos **340 px** de la fila, y
en un teléfono eso obligaba a que el campo cediera hasta cuatro dígitos y a que
los dos botones se quedaran solo con su icono (#866). Marcar un número se hace
de vez en cuando; la barra la usa quien viene a **leer** el historial.

Así que la barra se queda como la de Leads —un solo botón azul, **«Llamar»**,
con el mismo peso y el mismo estilo que su «+ Nuevo»— y lo de marcar vive en
una ventana con la forma de «Crear contacto»: mismo ancho (`sm:max-w-[400px]`),
misma cabecera, mismo `Label` + `Input`, mismo pie.

Cuatro cosas que hay que mantener:

1. **Las dos llamadas son EXACTAMENTE las de antes.** `DialogoDeLlamar` no sabe
   llamar: recibe `alLlamar` y `alLlamarConIa` y los dispara. Cambiar aquí cómo
   se llama sería tener dos formas de hacerlo, y la del menú de la cabecera de
   Chats (#866) se quedaría atrás.
2. **El campo va alineado a la IZQUIERDA**, con su `text-left` escrito: es un
   número que se teclea y se revisa dígito a dígito, y centrado no se puede
   comparar con el de al lado.
3. **Los tres botones son hijos DIRECTOS de `DialogFooter`.** Ese pie es
   `justify-between`: metidos en un `<div>` ve un solo hijo y los manda todos a
   un extremo — está medido en este repositorio, +198 px.
4. **Y llamar CIERRA la ventana.** No es un detalle de estilo: el velo de Radix
   es `fixed inset-0 z-50 bg-black/80` y **se traga las pulsaciones de todo lo
   que hay debajo**, y debajo está la tarjeta flotante que `abrirLlamadaAqui`
   acaba de abrir — **no se podría ni colgar**, ni marcar un segundo número.
   Cerrar no cambia qué llamada sale, y del lado de la IA el aviso no se pierde:
   lo cuenta el `toast` de `startBotDial`. **Lo cazó el banco**, no leer el
   código.

### El banco: la barra sobre el CSS del build, y la ventana en Chromium

`scripts/banco-llamar-con-ia.sh` ya tenía su mitad del menú de Chats; ahora
lleva una segunda, `lib/__tests__/barra-de-llamadas.test.mjs`, y va en
Chromium por un motivo concreto: **Radix monta el contenido de un `Dialog` en
un portal y solo al abrirlo**, así que el `onClick` de cada botón del pie es
código que sin navegador no se ejecuta nunca.

Los dos lados salen de código de verdad. El «ahora» es el `<BarraDeAcciones>`
del árbol de trabajo —que se trae con él el `DialogoDeLlamar` real— y el
«antes», las dos filas de `origin/main`, recortadas por
`scripts/sacar-barra-de-llamadas.py` con anclas que tienen que aparecer
**exactamente una vez**: si no, el script se cae con estruendo en vez de
devolver un fichero que no mide nada.

Y tres cosas del propio banco que costaron su vuelta:

1. **Una barra que no llega a pintarse mide cero y pasa cualquier comprobación
   de «no desborda».** El andamiaje del modo roto no declaraba `unificado` —lo
   nombra el toolbar viejo— así que React reventaba al pintar y el modo roto
   **dejaba de reproducir el fallo en silencio**. Ahora `abrir()` falla con su
   mensaje ante un `pageerror` y ante un hueco que se queda vacío.
2. **`innerText` no ve un rótulo escondido por CSS.** A 390 px el marcador de
   `origin/main` pinta sus dos botones **solo con el icono** (#866), así que
   buscar «Llamar con IA» en el texto de la página daba vacío en el modo roto y
   fallaba por el motivo equivocado. Se afirma sobre marcas del DOM —
   `[data-boton="llamar-ia"]`, `input[aria-label="Número al que llamar"]`— que
   están ahí se pinte el rótulo o no.
3. **El hueco de la pantalla no es la ventana.** Se mide contra
   `{ 1440: 1160, 1280: 1000, 1024: 744, 390: 374 }`, que es lo que le queda a
   la barra con el menú lateral abierto.

`MODO=roto` **afirma el fallo**: no hay ninguna `[data-barra-de-acciones]`, no
hay botón que abra la ventana, y el campo del número y «Llamar con IA» están
sueltos en la fila con el rango de días encima.


## La pantalla en blanco: `app/global-error.tsx` no existia, y sin el no hay NADA

«Application error: a client-side exception has occurred (see the browser
console for more information).» sobre una pantalla en blanco, de forma
intermitente y en rutas distintas —se vio en `/crm/llamadas` y en otras—. Sin
un boton, sin decir que hacer y **sin dejar rastro de nada**: cuando pasa, la
persona recarga a mano o se va, y no queda ni una linea que mirar despues.

Ese texto **es de Next**, literal, en
`node_modules/next/dist/client/components/error-boundary.js:149`. Y saber de
quien es acota la busqueda entera, porque dice **donde** se monta:

```
ErrorBoundary(errorComponent = globalErrorComponent)   <- app/global-error.tsx
  \_ Router  (las tripas de AppRouter)
       \_ RootLayout (app/layout.tsx)
            \_ <ErrorBoundary> (la clase nuestra) -> ErrorScreen
```

> **El limite propio vive DENTRO del layout raiz, o sea por DEBAJO del que Next
> monta en la raiz del enrutador.** Todo lo que reviente en el propio enrutador,
> en el layout raiz o en lo que cuelgue fuera de ese boundary se le escapa por
> arriba — y arriba no habia absolutamente nada.

Y no habia nada de forma literal, que es la parte que hay que leer en el codigo
de Next antes de dar por hecho que «algun limite habra»:

```js
function ErrorBoundary({ errorComponent, errorStyles, errorScripts, children }) {
  const pathname = usePathname();
  if (errorComponent) { return <ErrorBoundaryHandler … /> }
  return <>{children}</>;          // <- SIN errorComponent es un Fragment PELADO
}
```

El repositorio no tenia **ni `app/global-error.tsx` ni `app/error.tsx`**, asi
que la App corria con **cero limites del App Router**: los dos boundaries que
Next monta eran Fragments, y lo unico que quedaba era su `GlobalError` por
defecto — la pantalla en blanco.

### Medido: el limite propio SI caza lo de dentro, y por eso el fallo venia de arriba

Es lo que hace falta saber antes de tocar nada, porque descarta media
investigacion. Se inyectaron fallos en un build servido de verdad, con sesion,
y se leyo que pantalla salia:

| que revienta | antes |
| --- | --- |
| la pagina, en el servidor | `ErrorScreen` (el limite propio) |
| un componente de cliente al pintar, dentro de `{children}` | `ErrorScreen` |
| un componente de cliente al pulsar | `ErrorScreen` |
| **`StoragePersistence`, montado FUERA del limite** | **la pantalla en blanco de Next** |
| **algo por ENCIMA del limite** (el enrutador, el layout raiz) | **la pantalla en blanco de Next** |

Las tres primeras filas son la prueba: **el `ErrorBoundary` de la clase
funciona**. Asi que lo reportado no podia venir de ahi, y las dos ultimas dicen
de donde venia. En las dos, `document.documentElement.id === "__next_error__"`
—la firma de `GlobalError`—, **cero botones** y cero registros.

Y el `<html id="__next_error__">` explica lo otro: `GlobalError` **pinta su
propio `<html>` y su propio `<body>`**, o sea que **sustituye al layout raiz
entero**. No hereda la hoja de estilos, ni las fuentes, ni nada. De ahi que se
vea en blanco y no «como la App pero con un error».

### `FontScaleApplier` y `StoragePersistence` estaban montados FUERA del limite

Eran los dos unicos, y el barrido del banco lo afirma leyendo `app/layout.tsx`
de `origin/main`. Pasan dentro, con su motivo escrito al lado.

Que no hayan reventado nunca hasta ahora no los hace seguros: **lo que se monta
fuera del limite no tiene red**, y los dos tocan APIs del navegador
(`navigator.storage`, la cookie del escalado). Es la misma familia que *nada que
detecte un fallo puede ir detras de algo que falle*, aplicada a la maqueta.

### `ChunkRecovery` no podia salvarlo, por tres motivos a la vez

Conviene decirlo porque parecia que ya habia una red puesta:

1. **Sus oyentes se instalan en un `useEffect`.** Hasta que la hidratacion no
   termina no escucha nadie, y un `ChunkLoadError` de un chunk de arranque
   revienta **antes** de eso.
2. **Cuando el limite global pinta, el layout raiz se desmonta** — y con el, el
   propio `ChunkRecovery`. La red se va con lo que venia a rescatar.
3. **Y su `return` era MUDO.** `MIN_GAP_MS` son 60 s, asi que dentro de ese
   minuto `recover()` se rendia sin escribir una linea: desde fuera, «no se
   recarga y no dice por que». Ahora avisa —y esa espera vive en un solo sitio,
   `lib/recuperar-del-desfase.ts`, que usan la pantalla global, la de ruta, el
   limite de la clase y los oyentes de ventana. Con la cuenta en cada sitio, uno
   recargaria mientras otro cree que todavia no toca.

### Las tres pantallas, y por que son tres y no una

| | de quien es | que pinta |
| --- | --- | --- |
| `app/global-error.tsx` | la raiz del enrutador | su propio `<html>`, con **estilos EN LINEA** |
| `app/error.tsx` | cada ruta | el `ErrorScreen` que ya existia |
| `components/error-bundary.tsx` | el arbol del layout | el mismo `ErrorScreen` |

**La global va con estilos en linea y sin importar ni un componente de la
interfaz.** Esto se monta cuando ya ha fallado algo gordo y Next ha sustituido
el layout raiz: dar por hecho que la hoja de estilos esta cargada es apostar la
ultima red a lo mismo que se acaba de romper. **Si no se ve, no sirve.**

Y la de ruta **reutiliza `ErrorScreen`**, con su recarga automatica, su copia
del detalle y su descarga. Escribir otra pantalla habria sido una segunda que
mantener a la par.

### El fallo se ANOTA antes de recargar, y se cuenta en el arranque siguiente

Es la mitad que de verdad cambia el diagnostico. Una recarga —la de un boton o
la automatica— **se lleva la consola por delante**, asi que lo que no este
guardado no existe: es exactamente el motivo por el que `hardReload(motivo)`
anota el suyo, y aqui se aplica al fallo.

`lib/fallos-del navegador.ts` guarda un anillo de **cinco** en `localStorage`
(`verzay:fallos`), y `ChunkRecovery` los cuenta al arrancar:

```
[app] esta pestaña arrastra 2 fallo(s) de pantalla sin contar
[app] fallo de pantalla { cazadoEn: "global", nombre: "ChunkLoadError", … }
```

Cinco cosas que hay que mantener:

1. **`localStorage`, no `sessionStorage`.** Una pestaña que muere y se abre de
   nuevo pierde la sesion, y ese es justo el caso: la persona cierra y vuelve a
   entrar. Y **cada acceso va en su `try`** — en una ventana privada leerlo
   lanza, y la ultima red no puede caerse por eso.
2. **`cazadoEn` dice por cual de las tres puertas entro** (`global`, `ruta`,
   `arbol`, `ventana`). Sin eso, un fallo anotado no dice si al limite propio se
   le escapo o si nunca llego a el, que es la pregunta que hay que contestar
   ANTES de tocar nada.
3. **Cinco y no cincuenta.** Un desfase de version dispara varios a la vez; lo
   que hace falta es el primero y saber que hubo mas, no un historial.
4. **Se anota ANTES de ofrecer el boton**, en el mismo efecto. Al reves, quien
   pulse deprisa recarga sin haber dejado rastro.
5. **Y sale por `console.error`**, que es lo unico que `removeConsole` no borra
   en ninguna configuracion. Comprobado en el build, y **buscando un trozo sin
   acentos** (la receta de *el build borraba los avisos*).

### La recarga automatica solo para lo que se cura recargando

`esRecuperable` es una lista cerrada: `ChunkLoadError`, «Loading chunk … failed»,
«Loading CSS chunk», «error loading dynamically imported module» y «Failed to
find Server Action». Todos son la misma cosa —**el navegador se quedo con el
build anterior**—, y esta plataforma despliega decenas de veces al dia con dos
replicas, asi que es la familia mas probable detras de lo reportado.

**Lo que no este en la lista NO recarga sola.** Un `TypeError` de verdad
recargando en bucle es peor que una pantalla con un boton: la pantalla se puede
leer y el bucle no se puede ni diagnosticar. Y el caso comun de un `undefined`
—`Cannot read properties of undefined (reading 'success')`, una accion que
revento— **se trata como recuperable a proposito**: ese patron sale de un
desfase entre el cliente y el servidor y lo unico que lo arregla es recargar.

**Lo que NO se pudo hacer, y se dice en vez de disimularlo:** el bundle de
produccion no se pudo inspeccionar desde aqui —`curl
https://agente.ia-app.com/login` contesta `curl: (56) CONNECT tunnel failed,
response 403`, la politica de red de este entorno— y ninguna de las inyecciones
locales reproduce el disparador exacto de produccion. Lo que si queda
establecido y medido es la causa estructural: el fallo escapaba por arriba y no
habia limite, ni mensaje, ni boton, ni registro. **El registro es lo que dira el
disparador la proxima vez**, y para eso se anade.

### El banco: la decision aparte, y el barrido del layout en dos modos

`scripts/banco-pantalla-en-blanco.sh`, sin navegador y en dos modos. Lo que
comprueba y no se ve leyendo:

- Las cinco formas del desfase se reconocen y las cuatro que no lo son **no
  recargan**.
- El anillo se queda con los ultimos cinco, y anotar con un `localStorage` que
  **lanza** no tumba nada.
- Existen las dos pantallas, la global va con `style={` y **sin ni un
  `className=`**, y llama a `anotarElFallo(` antes que a `hardReload(`.
- **Nada nuestro se monta fuera del limite**, leyendo el marcado de
  `app/layout.tsx`.
- Y ningun `hardReload(` de los seis ficheros que recargan se queda sin motivo.

`MODO=roto` lee `app/layout.tsx` de **`origin/main` con `git show`** y afirma el
fallo: encuentra exactamente `["FontScaleApplier","StoragePersistence"]` por
encima del limite. Copiado al banco se estaria comprobando lo que alguien
recuerda del layout viejo.

## Chats: dónde nace un panel flotante lo decide UNA función

Había **once** paneles en Chats y cada uno traía su `align`, su `side` y su
`sideOffset` escritos a mano. Puestos uno al lado de otro no se leían como la
misma pantalla, y varios se salían de su columna. Medido en Chromium sobre el
CSS del build, con la colocación de `origin/main`:

| panel | a 1440 iba de… | la columna es | |
| --- | --- | --- | --- |
| Filtrar por asesor | **0**→224 | 48→432 | se salía sobre el carril de iconos |
| rango de fechas | **0**→256 | 48→432 | igual |
| etiquetas | **0**→288 | 48→432 | igual |
| el «⋯» de la cabecera | 391→**567** | 48→432 | se montaba sobre la conversación |
| temperatura de una fila | 319→**479** | 48→432 | igual |
| asignar asesor de una fila | 355→**579** | 48→432 | igual |
| Macros, en la cabecera | **252**→476 | 432→1440 | invadía la lista |

Y ninguno nacía a la misma altura: los de la columna salían a 108, 112 y 148, y
los de la cabecera a 108 y 148 — así que pasar de un panel a otro hacía saltar
el contenido de sitio.

No era que ninguno estuviera mal por su cuenta: es que **nadie contestaba la
pregunta una sola vez**. Es la misma familia que `BarraDeAcciones` —cada
pantalla colocaba sus mandos donde le tocó— y que `lib/panel-lateral.ts`.

> **Dónde nace un panel lo decide `lib/paneles-flotantes.ts`, y lo mide
> `hooks/usePanelFlotante.ts`.** Cuatro clases y ninguna más:
>
> | clase | dónde nace | por qué |
> | --- | --- | --- |
> | `columnaAncha` | el ancho ENTERO de la columna, a su filo izquierdo, bajo las pastillas | son filtros de la lista: lo que eligen se aplica a la columna entera |
> | `columnaDerecha` | al filo DERECHO de la columna, bajo su control, volteando si no cabe | son de UNA fila: nacen donde se pulsó, y la fila puede estar abajo |
> | `cabecera` | al filo derecho del área de conversación, bajo la cabecera entera | se pasa de uno a otro sin cerrar: todos a la misma altura |
> | `barraDeArriba` | bajo la barra de la plataforma y dentro de la ventana | es la campanita, y la barra es la misma en todas las pantallas |

El nombre no dice «de Chats» a propósito: la campanita vive en la barra de
arriba y tenía exactamente el mismo defecto.

### El signo de `alignOffset` depende de la ALINEACIÓN, y al revés no da error

Es la parte que no se ve leyendo, y por la que las cuentas viven en un módulo y
no en cada componente. `alignOffset` entra en Floating UI como
`offset({ alignmentAxis })`, y ahí:

```js
crossAxis = alignment === 'end' ? alignmentAxis * -1 : alignmentAxis;   // @floating-ui/core
```

O sea: con `align="start"` un positivo mueve a la **derecha**, y con
`align="end"` mueve a la **izquierda**. Escribirlo al revés **no da ningún
error**: deja el panel al otro lado y del doble de lejos. Costó una vuelta ya en
el propio banco, donde el ayudante que reconstruye el filo lo tenía invertido y
cantaba tres fallos que no existían.

Tres cosas más de Radix que hay que tener delante (leídas de
`@radix-ui/react-popper`, no supuestas):

1. **`shift` NO mueve en horizontal** (`crossAxis: false`), así que no hay que
   contar con que meta el panel dentro por el lado. Lo que lo mete es la cuenta.
2. **`size` corre siempre**, con `avoidCollisions` o sin él, así que
   `--radix-…-content-available-height` está puesta pase lo que pase. Es la que
   acota el alto, y es el hueco de VERDAD: `vh` mide la ventana, no lo que queda
   entre el panel y el borde.
3. **`collisionPadding` no es decoración**: entra en `detectOverflow`, así que
   es también lo que descuenta esa variable. Sin él un panel que llega justo al
   borde se queda pegado y su última fila no se lee. Va en las cuatro clases.

### `avoidCollisions` es distinto en los fijados y en los de una fila

No es un gusto, y las dos mitades se rompen si se igualan:

- **`false` en los fijados** (`columnaAncha`, `cabecera`, `barraDeArriba`). Con
  él, Radix puede **voltear** el panel arriba del disparador — y un filtro
  volteado se pone encima de las pastillas, que es justo el mando que dice qué
  se está mirando; y uno de la cabecera se come la fila de Macros y Acciones.
- **`true` en los de una fila** (`columnaDerecha`). La fila puede estar abajo
  del todo, y ahí voltear es lo correcto. Medido: la última fila abre su panel
  de 586 a 852 en una ventana de 900.

### Se MIDE el contenedor, no se resta de variables

Es la misma razón que `MedidaDeLaBarra` y `--alto-de-la-barra`: la columna tiene
**tres anchos** (`--ancho-lateral`, 18/20/22/24 rem), en un móvil ocupa la
pantalla entera —donde esa variable no la describe—, lleva un `max-w-[700px]`
encima y se anima al plegarse. Y la fila de pastillas cambia de alto con los
contadores. Restando variables se acierta en una anchura y se falla en las
otras tres, y eso no se ve como un error: se ve como un panel que unas veces se
sale y otras no.

Cinco cosas del hook que hay que mantener:

1. **Se mide al ABRIR, y solo al abrir** (`onOpenChange`). Esta pantalla tiene
   una regla entera sobre no rehacer nada en cada repintado de una lista de
   miles de filas; con el panel cerrado esto no cuesta nada, y si la ventana
   cambia de tamaño con él abierto Radix lo recoloca solo (`autoUpdate`).
2. **El disparador se pasa por `ref`, no se adivina.** La primera versión lo
   buscaba con `document.activeElement` razonando que Radix le da el foco.
   **No siempre**: un `DropdownMenu` mueve el foco DENTRO del contenido al
   abrirse. Un disparador adivinado mal no da ningún error — deja el panel a
   otra altura.
3. **Las marcas del DOM son el contrato**: `data-columna-de-chats`,
   `data-pastillas-de-chats`, `data-cabecera-de-chat` y `data-barra-de-arriba`.
   Si se añade otro panel, se le cuelga de una de las cuatro.
4. **Sin contenedor NO se inventa**: se devuelve la colocación de siempre
   (`comoSiempre`) y se dice en la consola. Pasa de verdad y no es un fallo:
   `SessionTagsCombobox` lo pinta también el kanban de `/tags` y
   `AdvisorAssignBadge` la lista de asesores de otras pantallas, donde no hay
   ninguna columna de Chats de la que colgar. Callado sería un panel colocado de
   otra forma sin que nadie sepa por qué.
5. **Y los cinco nacen EN el borde de abajo de las pastillas, sin hueco**
   (`SEPARACION_DEL_MENU`, 0). Se mide la fila y no el botón: el «⋯» vive
   DENTRO de ella, y así los cinco salen a la misma altura. Fueron 4 px; ver
   *Pegados, sin separación, y el mismo tratamiento en todos*.

### Medido, antes y después

Chromium sobre el CSS del build, con la maqueta de Chats —carril de iconos,
columna con su fila de pastillas, conversación con su cabecera y la barra de
arriba— en las cuatro anchuras:

| | 1440 | 1280 | 1024 | 390 |
| --- | --- | --- | --- | --- |
| los cinco paneles anchos | 48→432 (384) | 48→432 (384) | 48→400 (352) | 1→391 (390) |
| …y nacen todos en | 156 | 156 | 156 | 156 |
| los tres de una fila, filo derecho | 432 | 432 | 400 | 382 |
| los seis de la cabecera, filo derecho | 1440 | 1280 | 1024 | — |
| …y nacen todos en | 153 | 153 | 153 | — |
| la campana | 1173→1428 | 1013→1268 | 757→1012 | 123→378 |
| …y nace en (la barra acaba en 64) | 69 | 69 | 69 | 69 |

Los cinco anchos miden **exactamente** la columna en las cuatro; los seis de la
cabecera nacen **en el mismo píxel**, que es lo que permite pasar de uno a otro
sin que salte nada; y ninguno de los diecisiete se sale de su contenedor ni le
añade una barra de desplazamiento a la página.

**Un móvil NO es el caso estrecho de esto**, y conviene saberlo antes de buscar
ahí: a 390 la columna ocupa la pantalla entera, así que el `avoidCollisions` de
Radix ya metía dentro los paneles del «antes» —la columna y la ventana son la
misma caja— y **no se salían**. Lo que sí fallaba en las cuatro anchuras es que
ninguno medía la columna y que tapaban las pastillas. El banco lo afirma así, y
no finge un rojo que no existe.

### Y una trampa del banco: un panel EN MOVIMIENTO no está en ningún sitio

Las animaciones de Radix (`zoom-in-95`, `slide-in-from-top-2`) **mueven y
encogen el panel mientras juegan**. Medido a media animación, un panel de 384
salía de **381** y su borde de arriba dos píxeles más alto — o sea, tres fallos
que no existían. El banco las apaga (`animation: none !important`) antes de
medir.

Y la otra: **la emulación de móvil necesita el `<meta name="viewport">`.** Sin
él, Playwright monta un viewport de maqueta de 980px y lo escala, así que a 390
la página medía **2120** de alto y lo que se estaba midiendo no era una pantalla
de teléfono. La App de verdad lo lleva; la maqueta del banco también.

## Chats: Macros y Acciones no se van nunca; las pestañas se pliegan en «Más»

La fila de abajo de la cabecera era **una sola caja con `overflow-x-auto`**: las
pestañas (Mensajes, Notas, Sheets, Copiloto, Web…) y, al final, Macros y
Acciones. Cuando faltaba ancho —la ficha de contacto abierta, un panel lateral,
un portátil— lo que se iba por la derecha, detrás de un desplazamiento sin
barra, eran justo los dos mandos que se usan en cada conversación (y Acciones es
donde está Resolver).

> **Son dos cajas.** Las pestañas viven en `PestanasDelChat`, un hueco
> `flex-1 min-w-0` que se MIDE; Macros y Acciones van en otra caja `shrink-0`.
> Lo que no cabe de las pestañas entra en un desplegable «Más». Lo decide
> `repartirLasPestanas` (`lib/pestanas-del-chat.ts`, pura), y lo usan la fila
> del móvil y la de escritorio.

Tres cosas que hay que mantener:

1. **La pestaña abierta se ve siempre**: si le toca plegarse, ocupa el sitio de
   la última que cabía. Plegada, nadie sabría qué se está mirando.
2. **Se mide una fila FANTASMA** (invisible, fuera del flujo) con todas las
   pestañas y el «Más». Medir las visibles sería medir el resultado de la
   última decisión y oscilar.
3. **Sin medidas no se decide**: se pintan todas. Un reparto con ceros plegaría
   todas en el primer pintado.

Medido en Chromium sobre el CSS del build, con una cabecera de 1056 a 440 px:
Macros y Acciones quedan **enteros dentro de la fila en las cinco**; el «antes»
dejaba Acciones fuera a 520 y a 440.

### La síntesis se edita en el Contexto del lead, y el icono aparte se fue

El icono de Síntesis de la barra abría una ventana emergente
(`SintesisEditDialog`) con lo mismo que ya enseñaba el panel del cerebro. Se
fue, y la síntesis **se edita y se guarda en el propio panel**, con el mismo
comportamiento (`comoSeGuardaLaSintesis`, `lib/sintesis-del-lead.ts`): con
seguimiento se actualiza el suyo, sin él se crea una manual, y vacía no se
guarda. En el móvil el cerebro ocupa el sitio del icono que se quitó: sin él,
la síntesis no tendría forma de verse ahí.

El panel va en este orden, y los tres primeros de la segunda línea en formato
directo —solo el dato—: **Puntuación IA · Estado del lead** (solo la etiqueta)
**· Etiquetas** (solo las etiquetas) **· Follow-ups pendientes** (el número a la
derecha del título) **· Síntesis IA · Playbook de venta**. El orden está en
`ORDEN_DEL_CONTEXTO` y el banco lo compara con los `data-bloque` del panel.

### Todo menú de la conversación crece hacia la IZQUIERDA

`cabecera()` elegía el lado mirando en qué mitad de la cabecera caía el botón.
Con la ficha de contacto o un panel lateral abierto, el icono de la **cita
agendada** caía en la mitad izquierda y su panel crecía hacia la derecha, desde
el centro de la conversación.

> **Una sola regla**, que hoy es `alFiloDeLaConversacion`: crecen hacia la
> izquierda, bajo la cabecera entera, y nunca pasan a `align="start"`. La usan
> `cabecera()` y `colgadoDelIcono()` (el menú de llamar). **Dónde cae su filo
> derecho cambió después**: ya no es el de su botón, sino el de la
> conversación (ver *Todos los menús de la conversación comparten UN filo
> derecho*). Lo que sigue sobre `ANCHO_DEL_MENU_CORTO` es historia.

Cuando a la izquierda del botón no cabe el ancho pedido **en la pantalla** —un
icono pegado al borde izquierdo, que en el móvil es el de llamar— se **corre a
la derecha lo justo** para no salirse (`alignOffset` negativo: con
`align="end"`, negativo mueve a la derecha). Para el menú de llamar, que no tiene
ancho escrito, esa cuenta usa `ANCHO_DEL_MENU_CORTO`.

La maqueta de `banco-paneles-flotantes` tenía Macros pegado a la izquierda de su
fila; en `ChatHeader` va a la derecha, detrás de las pestañas. Con la regla
nueva esa maqueta medía un caso que la cabecera no tiene, y se corrigió.

Lo prueba `scripts/banco-cabecera-del-chat.sh`, en dos modos: la decisión y un
barrido sin navegador, y en Chromium la fila real con `PestanasDelChat`, el menú
de la cita en la mitad izquierda y el `LeadContextSheet` real con sus tres
acciones de servidor fingidas. `MODO=roto` construye con `ANTES_REF` y afirma
los fallos: Acciones fuera, la cita creciendo a la derecha, el párrafo del
estado, «3 pendientes» repetido y la síntesis sin forma de editarse.

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

## Chats: un ancho COMÚN para los paneles, y las dos filas por sus dos extremos

Tres cosas de la misma pantalla, y las tres salen de la misma raíz: **cada
panel y cada fila medía su contenedor**, así que ninguno coincidía con el de al
lado y todos cambiaban de tamaño al abrir otro.

### Los cinco de la columna: 18 rem, y acotados por la columna MEDIDA

Canales, Filtrar por asesor, el rango de fechas, las etiquetas y el «⋯» ocupaban
el ancho ENTERO de la columna, así que entre el texto y su número de la derecha
quedaba un desierto — y, peor, **saltaban de tamaño al abrir uno u otro** y al
cambiar de ventana, porque la columna tiene tres anchos.

> **`ANCHO_DE_LOS_FILTROS`, 18 rem, el mismo para los cinco.** El número no es a
> ojo: es el escalón más pequeño de `--ancho-lateral` y el que ya pedía el mayor
> de los cinco (el de etiquetas, `w-72`), así que **ninguno se queda más
> estrecho de lo que estaba**.

Y va acotado por la columna **medida**, no por la variable: en una columna
estrecha manda ella, que es lo que impide que el panel se monte sobre la
conversación. Siguen naciendo donde nacían —al filo izquierdo y bajo las
pastillas— y **no se toca el tamaño de letra** de lo que va dentro: lo que junta
el texto con su número es el ancho, no la tipografía.

### Los seis de la cabecera: del filo de Macros al filo derecho

Acciones, etiquetas, macros, registros del lead y la cita agendada comparten el
ancho que va **del borde izquierdo de Macros al filo derecho**, que es el que ya
tenían Acciones y Registros. Antes el de etiquetas se pasaba y el de la cita se
quedaba corto.

Sale de **medir** esa fila (`MARCA_DE_MACROS`) y no de una constante, porque se
mueve con el ancho de la conversación —que depende de la lista, de la ficha de
contacto y de los paneles laterales—. Con el ancho fijo, un texto largo se
acomoda en varias líneas: **el panel crece hacia abajo, nunca hacia los lados.**

Tres cosas que hay que mantener:

1. **Sin el filo de Macros, `cabecera()` no inventa ningún ancho.** El combobox
   de etiquetas lo pintan además el CRM y `/sessions`, y el de asesores otras
   pantallas: ahí no hay ninguna fila de Macros que medir. Cada uno conserva su
   `w-*` de siempre — inventarles un ancho a dos pantallas que nadie pidió tocar
   sería peor que no unificar.
2. **Hay un mínimo** (`ANCHO_MINIMO_DE_LA_CABECERA`), y es una GUARDA, no un
   diseño: con la fila de Macros pegada al filo el ancho saldría ridículo. Una
   conversación estrechísima **le gana al mínimo**, que es el lado seguro.
3. **El ancho se acota con `MARGEN_DE_LA_VENTANA`**, como todo lo demás de este
   módulo: un panel que llega justo al borde se pega y su última fila no se lee.

### La simetría de las dos filas: 16 px, y lo que sobresalía era Acciones

La fila de Macros y Acciones no cuadraba con la fila de iconos de encima. Medido
en Chromium sobre el CSS del build, con las clases leídas del componente:

| | izquierda | derecha |
| --- | --- | --- |
| fila de iconos | **12** | **12** |
| fila de Macros y Acciones | texto del tab a **16** | Acciones a **8** |

**Los dos extremos torcidos, y en sentidos contrarios.** Por eso la fila se lee
descuadrada aunque cada número por separado parezca razonable — y por eso lo que
se percibe no es lo que pasa: quien sobresalía a la derecha era **Acciones**, no
el icono de ficha de contacto.

> **El margen es 16 px** (`MARGEN_DE_LA_CABECERA` / `MARGEN_DERECHO_DE_LA_CABECERA`),
> y no es un gusto: es el ÚNICO número al que las dos filas pueden llegar sin
> deformarse. **La de abajo no se pone su hueco de la izquierda**: se lo pone el
> `px-4` de la primera pestaña, que es además el ancho del subrayado de la
> activa. Bajarlo a 12 estrecharía ese subrayado en Mensajes, en Notas y en cada
> integración de la cuenta — o sea deformar la tira de pestañas para cuadrar un
> margen, que es al revés de lo que se pide.

Son **dos constantes y no una** porque cada fila llega de una forma —la de
arriba se pone las dos mitades, la de abajo solo la derecha—. El número es el
mismo, y eso es lo único que no puede separarse: lo comprueba el banco, que
exige que las dos acaben en el mismo escalón. Medido después: **16/16 y 16/16**
en las tres anchuras, y nada desborda.

Y el móvil no se toca: allí las dos filas ya van con `px-2` y cuadran.

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

## Chats: los paneles laterales se mueven IGUAL, y un cambio es un RELEVO

La ficha de Contacto entraba «empujada y frenada de golpe» mientras notas,
recordatorio, tarea, contexto, copiloto y equipo se deslizaban; y al alternar
entre dos paneles se sentía un salto. Eran dos fallos:

| lo que se veía | lo que era |
| --- | --- |
| la ficha aparece de golpe y la conversación se encoge en un fotograma | era un **hermano del flex** montado con `{infoPanelOpen && session && …}`: sin hoja que deslizar y sin fotograma de salida |
| al cambiar de un panel a otro, un reinicio | el que salía se deslizaba hacia fuera y el que entraba hacia dentro, **en el mismo sitio y a la vez** |

> **La ficha es un `PanelLateral`** (`ContactInfoPanel`, con
> `PANEL_DE_LA_FICHA`), montado siempre desde `chat-main`: misma franja, mismo
> ancho (`--ancho-lateral`), mismo anclaje (derecha, bajo la barra), misma
> duración y curva, y reserva la franja como los demás, así que la
> conversación se acomoda con la misma transición. Su cuerpo
> (`FichaDeContacto`) trae sus consultas y es perezoso, como antes.

> **Un cambio entre paneles es un RELEVO, sin transición.** Lo decide
> `comoSeMueveLaHoja` (`lib/panel-lateral.ts`, puro): con la franja vacía,
> `desliza`; con otro ya puesto, `relevo`. `usePanelLateral` lo devuelve y los
> tres marcos de hoja —`PanelLateral`, `ChatSheet` y `PanelDeEquipo`— ponen
> `HOJA_SIN_TRANSICION`: el que entra aparece ya en su sitio y el que sale
> desaparece en el mismo fotograma. La conversación no se mueve porque el
> registro mantiene la franja reservada.

Cuatro cosas que hay que mantener:

1. **Todo va ANTES de pintar** (`useLayoutEffect`): la comprobación de si hay
   otro abierto —antes de registrarse— y el aviso de exclusión. Con
   `useEffect` hay un fotograma con los dos paneles encima o con el nuevo ya
   deslizándose.
2. **El relevo dura UN cambio**: dos fotogramas después se devuelve la
   transición, para que el cierre siguiente se deslice.
3. **En un relevo lo de dentro se desmonta al instante**: no hay salida que
   esperar.
4. **Duración y curva viven en `lib/panel-lateral.ts`** y la conversación
   (`[data-chat-view]` en `globals.css`) las repite: el banco las compara.

Lo prueba `scripts/banco-animacion-de-paneles.sh`: la decisión, un barrido del
código y, en Chromium sobre el CSS del build con la ficha REAL, muestreo
fotograma a fotograma de abrir, cerrar y relevar en los dos sentidos.
`MODO=roto` construye con `ANTES_REF` y afirma que la ficha no se deslizaba y
que el relevo reiniciaba la animación.

## Chats: UN panel a la vez, todos por la derecha, y los menús cuelgan de SU botón

Tres fallos de la misma pantalla, reportados juntos con capturas (22-09):

| lo que se veía | lo que era |
| --- | --- |
| la ficha de Contacto y «Nueva tarea» abiertas a la vez | la ficha **no estaba en la exclusión**: es un hermano del flex, no un `PanelLateral`, y nadie la cerraba |
| la ficha salía a la IZQUIERDA de la conversación | una regla de CSS la ponía `absolute inset-0` —encima de la conversación— mientras hubiera un panel abierto |
| Acciones y Registros del lead cruzando la conversación entera | `ChatHeader` pinta Macros **dos veces** y la medida cogía la del móvil, escondida: 0×0 en el origen |

Cinco cosas que hay que mantener:

1. **La ficha entra en la exclusión.** Primero lo hizo como hermano del flex
   con `reservar: false`; hoy es un `PanelLateral` más (ver *Los paneles
   laterales se mueven IGUAL*). La regla que la superponía sobra, y se fue:
   era la que la sacaba por la izquierda.
2. **«Enviar al equipo» es un `PanelLateral`**, no un `Dialog`. Se abre desde
   la cabecera como los demás, así que sale por el mismo lado y entra en la
   misma exclusión. **Si se añade otro panel en Chats, va por `PanelLateral`**
   (o por `usePanelLateral` si vive en el flex): un modal centrado es un
   panel que no cierra a los demás ni se deja cerrar por ellos.
3. **Un panel de la cabecera crece hacia la izquierda y nace bajo la
   cabecera.** Esto decía «cuelga de SU botón»; se corrigió: el filo derecho es
   el del panel de conversación, el mismo para todos (ver *Todos los menús de
   la conversación comparten UN filo derecho*).
4. **Lo que se mide es lo que SE VE.** `ChatHeader` pinta Macros, Acciones y la
   cita en la fila del móvil y en la de escritorio, así que `querySelector` y un
   `useRef` se quedan con uno cualquiera — a menudo el escondido. El hook guarda
   todos los disparadores y mide el de ancho > 0; y `cabecera()` ignora un
   `desde` fuera de la cabecera, que es la firma de haber medido el escondido.
5. **La prueba que lo destapó monta Macros DOS veces.** La maqueta de
   `banco-paneles-flotantes` pintaba uno, y por eso estaba verde con el fallo
   en producción: *un arnés que no reproduce cuántas veces se monta algo no
   prueba cómo se mide.*

### Todos los menús de la conversación comparten UN filo derecho

> **Esta sección manda sobre las dos de arriba y la de abajo en lo que diga
> «cuelga de su botón».** Aquella regla (#905) resolvía que un menú no naciera
> lejos de su botón, y dejaba el fallo que se reportó después: con cada menú
> colgando de su botón, abrir la cita, luego Registros y luego Acciones movía
> el borde derecho de sitio. Medido en la página servida a 1440: Macros 1308,
> Etiquetas 1352, Cita 1210, Registros 1278, Acciones 1418, Llamar 1108.
> **Seis bordes para seis menús.**

La regla, y es una sola: **el borde derecho de todo menú de la cabecera es el
filo derecho del PANEL DE CONVERSACIÓN** (el recuadro del chat; con la ficha de
contacto abierta, su borde izquierdo), **sin margen**
(`MARGEN_INTERIOR_DE_LA_CONVERSACION`, que fue 16 px y hoy es 0: ver *Las dos
cabeceras de Chats: un margen, un alto*), y crece hacia la izquierda. No
depende del botón que lo abre ni del borde de ninguna fila interna.

Lo decide `alFiloDeLaConversacion` (`lib/paneles-flotantes.ts`, puro), y
pasan por ahí `cabecera()` —Macros, Acciones, Cita, Registros, Etiquetas, el
asesor y «Más»— y `colgadoDelIcono()` —el menú de llamar—. Cuatro cosas:

1. **El contenedor que se mide YA es el panel de conversación.**
   `data-cabecera-de-chat` es el primer hijo de la columna del chat en
   `chat-main` y mide su ancho entero; la ficha de contacto es un hermano del
   flex, así que queda fuera. No hizo falta ninguna marca nueva.
2. **Pegados al borde del recuadro, no al de Acciones.** Fueron 16 px —el
   `pr-4` de la fila de Macros y Acciones, para que el menú acabara donde
   acaba el botón—, y así flotaban dentro del recuadro. Ahora van al filo, y
   contra el borde de la VENTANA (no contra su margen de 8 px): en escritorio
   el recuadro acaba antes que la pantalla.
3. **A Radix se le da como desplazamiento**, porque ancla al disparador: con
   `align="end"`, `alignOffset = disparador.right − filo`, que sale NEGATIVO
   (mueve a la derecha). Al revés no da error: lo deja al otro lado del botón.
4. **El ancho sigue siendo el de la fila de Macros**, ahora de Macros al filo
   compartido, y se acota para que el borde IZQUIERDO no se salga de la
   ventana. El filo nunca se mueve para hacer sitio.

Medido sobre la página servida, a 1440/1366/1280/1024, sin panel, con la ficha
y con «Nueva tarea» abiertas: los seis menús acaban en el mismo píxel en las
doce combinaciones (1418 a 1440 sin panel; 650 a 1024 con la ficha). Lo prueba
`scripts/probar-menus-de-la-cabecera.mjs` desde `banco-paneles-en-chats.sh`, y
`MODO=roto` con un `.next` de `960abc1` afirma los bordes distintos.

### Pegados, sin separación, y el mismo tratamiento en todos

El #917 probó lo contrario —cada menú colgando de SU botón, con una flecha y
10 px de hueco— y **se deshizo sin fusionar**: lo pedido es el filo, no el
botón. Así que la regla del filo de arriba se queda, y encima se cierra la
simetría entre todos los menús de Chats (`lib/paneles-flotantes.ts`):

| | |
| --- | --- |
| separación | **0** (`SEPARACION_DEL_MENU`): los de la cabecera nacen EN el borde de abajo de la cabecera; los filtros, EN el de las pastillas; los de una fila, pegados a su control |
| relleno | **uno**, `RELLENO_DEL_MENU` (`p-2`), en los catorce. Convivían `p-1`, `p-2`, `p-3` y ninguno |
| ancho por tipo | filtros `ANCHO_DE_LOS_FILTROS` (288); cabecera, de Macros al filo; fila `ANCHO_DE_UNA_FILA` (240) — los tres de una fila traían sin ancho, `w-52` y `w-56` |
| alto | `TOPE_FIJADO` en los fijados y `TOPE_DE_FILA` en los de fila, acotados por la variable de Radix |
| flecha | **ninguna**: con separación cero no hay hueco donde ponerla, y Radix le suma su alto al `sideOffset` |

Tres cosas que hay que mantener:

1. **Los filtros de la columna no se abren nunca sobre la conversación.**
   `columnaAncha` los acota a la columna MEDIDA menos el margen; el banco de la
   página servida (`probar-paneles-en-chats.mjs`) exige que su filo derecho
   quede dentro de la columna en todas las anchuras.
2. **Los de una fila, volteados, no suben sobre la búsqueda ni los filtros**:
   `columnaDerecha` recibe el borde de abajo de las pastillas y lo pone de
   `collisionPadding.top`. Es un objeto por lados, no un número.
3. **Un menú anclado al botón no es lo pedido.** Si vuelve la duda, está
   contestada aquí: el borde derecho es el de la conversación y no se mueve al
   pasar de un menú a otro.

### Las dos cabeceras de Chats: un margen, un alto, y la ficha fuera de la tira

La columna de chats y el panel de conversación se leían desalineados al pasar
de uno a otro. Medido sobre la página servida, cada cabecera traía sus números:

| | izquierda | derecha | arriba | abajo | alto |
| --- | --- | --- | --- | --- | --- |
| columna (antes) | 12 | 12 | 8 | 8 | 82 |
| conversación (antes) | 16 | 16 | 0 | 0 | 82 |
| las dos (#909) | 16 | 16 | 16 | 16 | 110 |
| **las dos (ahora)** | **6** | **6** | **6** | **6** | **78** |

Y la primera fila caía en 82 en una y en 79 en la otra.

> **Los números viven en `lib/cabeceras-de-chats.ts` y los usan las DOS
> cabeceras.** El margen es 6 px a los cuatro lados; las filas miden lo mismo
> en las dos (32 y 28 px, con 4 entre ellas), y de ahí sale el alto: 6 + 32 +
> 4 + 28 + 6 + 2 de borde = **78 px**. El #909 los había unificado a 16 y
> 110 px: **unificar no es engordar** — la cabecera tiene que quedar más baja
> que antes, nunca más alta. Con filas del mismo alto y el mismo relleno, lo de
> dentro cae en la misma línea horizontal en las dos columnas. Solo desde `md`:
> por debajo cada una tiene su cabecera de móvil, que no se toca.

Cinco cosas que hay que mantener:

0. **Los controles de icono de la fila de arriba, en las dos cabeceras, tienen
   UNA caja**: `CONTROL_DE_ICONO` (28 de alto y 28 de ancho como mínimo) y
   `GLIFO_DE_CONTROL` (14 px). El embudo medía 24 y asesores/grupos 32, y no se
   leían simétricos. Lo que lleva un número dentro crece a lo ancho, nunca en
   alto; la forma y el color son de cada uno. Y dentro de la tira que se
   desplaza van `shrink-0`: si no, con la ficha abierta a 1024 se encogían a
   16 px en vez de desplazarse. La sonda lo mide.
1. **El margen lo pone la CABECERA, no cada fila.** Con el relleno escrito
   fila por fila (`px-4` arriba, `pr-4` abajo, nada en vertical) es como se
   llegó a tener cuatro números distintos.
2. **La fila de pestañas tira de sí misma `-ml-4`.** La primera pestaña lleva
   su propio `px-4`, que es el ancho de su subrayado; sin tirar, su TEXTO
   arrancaría 16 px más adentro que el avatar de encima. El banco mide el
   texto, no la caja.
3. **La ficha de contacto va FUERA de la tira de iconos que se desplaza**,
   `shrink-0`, como Acciones en la fila de abajo. Dentro, con la conversación
   estrecha —la ficha abierta, un panel lateral— la tira desbordaba y la ficha
   se iba por la derecha: medido **−72 px** (fuera de la caja) a 1024 con la
   ficha abierta, que es el «la ficha y Acciones no acaban en el mismo filo»
   de la captura. Ahora cede la tira; la ficha y Acciones acaban siempre en el
   mismo píxel.
4. **Los menús de la cabecera van PEGADOS al borde del recuadro**, sin margen
   (ver la sección de arriba).

Lo mide `scripts/probar-margenes-de-chats.mjs` (lo corre
`banco-paneles-en-chats.sh`) sobre la página servida, a 1440/1366/1280/1024,
sin panel y con la ficha abierta: los cuatro márgenes de las dos cabeceras, el
texto de la primera pestaña, la ficha y Acciones, el alto, que las filas caigan
en la misma línea y que los menús de Macros y Acciones acaben en el filo.
`MODO=roto` con un `.next` de `fd08262` afirma los fallos (74 en total). Y
`lib/__tests__/cabecera-simetrica.test.mjs` comprueba que el alto de las clases
sale de los números del módulo y que ninguna de las dos vuelve a escribir los
suyos.

Lo que queda abierto y no es de esto: a 1024 con la ficha o un panel abierto,
el botón de llamar de la fila de iconos queda **tapado** (la fila no cabe) y no
se puede pulsar. La sonda lo anota como «tapado» en vez de fingir una medida.

### Y lo que acota un menú es la PANTALLA, no la cabecera

Con la regla de arriba puesta, la Cita agendada, Registros del lead y Macros
seguían naciendo desplazados de su botón en cuanto la conversación se
estrechaba —la ficha o un panel lateral abiertos—. `colgarDelFiloDerecho`
medía «¿cabe a la izquierda del botón?» contra el borde de la **cabecera**: a
1024 con un panel abierto la conversación mide 260 px, el panel pide 219, y los
que caen lejos del filo derecho se corrían a la derecha para no pasar de ese
borde. Medido sobre la página servida: cita **+103 px**, Macros +93,
Registros +47. Acciones y Etiquetas, pegados al filo derecho, no se movían, y
por eso parecía un fallo de unos pocos.

> **A la izquierda de la cabecera está la columna de chats, y eso es
> pantalla.** El menú se corre solo cuando se saldría de la VENTANA, y lo
> justo para quedar a `MARGEN_DE_LA_VENTANA` de su borde. Nunca cambia de
> lado ni se centra.

Y de paso es más robusto: en el caso normal el corrimiento es 0, así que si la
cabecera cambia de ancho con el menú abierto Radix lo mantiene pegado al botón
en vez de arrastrar un desfase calculado al abrir. El hook le pasa
`document.documentElement.clientWidth`.

Lo prueba `scripts/probar-menus-de-la-cabecera.mjs` (lo corre
`banco-paneles-en-chats.sh`): los cinco menús, sin panel, con la ficha y con
«Nueva tarea» abiertos, a 1440/1366/1280/1024, sobre la página servida. El
botón se mide **después** de pulsarlo: la fila de iconos se desplaza en
horizontal y Playwright la mueve al hacer clic. `MODO=roto` con un `.next` del
commit de antes afirma los seis desfases.

Lo comprueba `scripts/banco-paneles-de-chats.sh` —barrido del código, la
exclusión con el hook real y los menús pintados por Radix, en dos modos; el
roto construye con el código de `ANTES_REF` y afirma las tres capturas— y
`scripts/banco-paneles-en-chats.sh` sobre la página servida.

## Chats: el panel de la derecha es la TERCERA columna, no una hoja sobre la ventana

Con un panel abierto —contacto, contexto del lead, recordatorio, nueva tarea,
enviar al equipo, copiloto o chat del equipo— Chats se lee como tres columnas,
y no lo eran. Medido sobre la página servida, con el commit de antes:

| | lista | conversación | panel |
| --- | --- | --- | --- |
| respiro bajo la barra | 5 | 5 | **0** |
| alto de la cabecera | 78 | 78 | **61–69** |
| la raya de la cabecera | 83 | 83 | **62–70** |
| separador con la columna de al lado | 1 px `rgb(226,232,240)` | — | **5 px de hueco, sombra y 1 px `rgb(229,231,235)`** |

La causa es una sola: la franja del panel se coloca contra la VENTANA (bajo la
barra, pegada al borde derecho) y la bandeja vive dentro de la caja del módulo,
con su relleno (`sm:p-1`) y su borde. De ahí los 5 px de más arriba, el hueco
y la sombra entre la conversación y el panel.

> **En Chats la franja se pone sobre la bandeja**: `MedidaDeChats`
> (`components/chats/MedidaDeChats.tsx`) la MIDE y publica `--chats-arriba`,
> `--chats-alto` y `--chats-derecha` con `data-chats-medidos` en la raíz, y la
> regla de `app/globals.css` coloca ahí cada `[data-franja-lateral]`. La hoja
> (`[data-hoja-lateral]`) pierde redondeo, sombra y bordes y se queda con un
> borde izquierdo de 1 px de `--border`: **el mismo separador que el
> `border-r border-border` de la lista.** Solo de `lg` para arriba, que es
> donde la bandeja reserva la franja.

Y la cabecera de todo panel es **`CABECERA_DEL_PANEL`**
(`lib/cabeceras-de-chats.ts`): la misma caja que la de la conversación sin el
`md:` —78 px, filas de 32 y 28, 6 de margen, `border-b-2`—. Arriba el título y
sus iconos de cabecera (la equis, el sonido, limpiar); abajo lo del panel (el
nombre del contacto y sus mandos, los modos del copiloto, el canal abierto del
equipo). Los botones de cabecera son `BOTON_DE_LA_CABECERA_DEL_PANEL`, 28 px.

Cuatro cosas que hay que mantener:

1. **Se MIDE, no se resta.** Encima de la bandeja hay una barra que mide lo que
   mida, a veces pestañas del módulo, y el relleno y el borde de la caja.
2. **Los tres marcos llevan las dos marcas** —`PanelLateral`, `ChatSheet` y
   `PanelDeEquipo`—. Un panel nuevo que no pase por `PanelLateral` las lleva, o
   sube 5 px y abre un hueco.
3. **La franja va con `overflow: hidden`**: cerrada, la hoja se desplaza su
   ancho a la derecha y sin recorte asomaría por el hueco entre la bandeja y el
   borde de la ventana.
4. **Fuera de Chats nada cambia**: al desmontar se borran las variables y la
   marca, y el panel vuelve a la ventana.

### El chat del equipo: UNA vista por vez

Enseñaba a la vez la lista de canales —desplegada con «Cambiar», topada a
320 px— y el hilo debajo, y ninguna se podía usar. Ahora es la LISTA (a panel
completo, `min-h-0 flex-1 overflow-y-auto`: con sesenta filas se desplaza
dentro sin mover la cabecera) o el CHAT de un canal, con su buscador, su caja
de escribir y una flecha de volver en la segunda fila de la cabecera, donde
estaba «Cambiar». En la lista no asoma nada del chat.

Tres cosas que hay que mantener:

1. **El chat se ESCONDE en la vista de lista, no se desmonta**: dentro están el
   borrador, la cita, los archivos elegidos y el anclaje del hilo.
2. **Con la lista delante el hilo NO se marca leído** (`sinMarcar` en
   `hiloDelEquipoAction`) ni se calla su sonido: el reloj sigue trayendo el
   canal cargado —la lista viaja en la misma respuesta— pero nadie lo mira, y
   un mensaje dado por leído así no vuelve a avisar nunca.
3. **Con qué vista abre lo decide `laVistaDeEntrada`**: la del enlace si se
   llega a algo (un aviso de mención, una búsqueda), la de la última vez si no
   (`recordarLaVista`, al lado del canal recordado), y la lista si no hay nada.

Lo prueba `scripts/banco-columnas-de-chats.sh`: sin navegador los números y un
barrido del código; y sobre la página servida, a 1440, 1280 y 1024 y con los
siete paneles, el alto y el centro de las dos filas en las tres columnas, el
respiro, la raya, el ancho y el color de los dos separadores, y el chat del
equipo en su lista (30 canales y 30 personas sembrados) y en su chat.
`MODO=roto` —con un `.next` de `20db904`— lee el código de antes y afirma los
fallos de la tabla de arriba.

## Chats: las tres barras de escribir y los pies fijos son UNO

La regla de toda la pantalla: lo que en un panel se ve de una forma, en los
demás se ve **igual, no parecido**, y el modelo es la conversación de WhatsApp.
Medido sobre la página servida antes de tocar nada:

| | conversación | chat de equipo | copiloto |
| --- | --- | --- | --- |
| alto de la barra | 57 | **65** | otra forma |
| filo → «+» · «+» → caja | 12 · 8 | **24 · 8** | sin «+» |
| a la derecha | un botón | un botón | **micro Y flecha** |

> **Las tres barras llevan el MISMO marco y la misma fila**
> (`MARCO_DE_LA_BARRA`, `FILA_DE_LA_BARRA`, en `lib/barra-de-escribir.ts`): el
> «+» a **6 px** del filo y a 6 de la caja —la mínima y la misma a los dos
> lados, que es ancho que gana la caja—, y el relleno vertical de la
> conversación. **57 px con la raya**, las tres: la raya de arriba y la línea de
> abajo caen en el mismo píxel en las tres columnas.

El copiloto pasó a la barra común: sus sugerencias («Sugerir respuesta»,
«Resumir chat», «Seguimiento»…) viven **dentro del «+»** (`OpcionesRapidas`), y
a la derecha hay UN botón: el micrófono con la caja vacía y la flecha con texto.
Lo decide `losBotonesDeLaDerecha` con `conNota: false` —el copiloto dicta pero
no graba notas—; sin ese campo las otras dos barras deciden lo de siempre.

### El pie FIJO de un panel mide lo que la barra de escribir

«Crear recordatorio», «Nueva tarea» y «Contexto del lead» llevan su fila de
abajo **fija**, con su raya encima y el alto de la barra (`PIE_DEL_PANEL`),
mientras el cuerpo se desplaza por detrás. Antes había que bajar por todo el
formulario para llegar a «Crear». Cuatro cosas:

1. **Entra por `PanelLateral`**: `pie` para una fila de botones normal, y
   `cuerpoPropio` cuando el botón de enviar tiene que vivir DENTRO de un
   `<form>` (el recordatorio: `ReminderForm` con `enPanel` pinta él la fila con
   la misma clase). Sus botones van como hijos DIRECTOS: el pie es
   `justify-between`.
2. **Es del PANEL, no de una sección.** El del contexto sale siempre —«No se
   envía al cliente» a la izquierda y los dos pulgares a la derecha—, haya
   recomendación o no (sin ella, los pulgares apagados). Antes era de la
   sección del playbook y cada caso acababa distinto.
3. **Los botones dicen «Crear» y «Cancelar».** El título del panel ya dice qué
   se crea; «Crear recordatorio» debajo de «Crear recordatorio» es repetirlo.
4. **Crear va en AZUL y guardar en VERDE.** El del recordatorio estaba en verde
   (`variant="save"`); ahora `isEdit ? "save" : "default"`.

Y un fallo de paso: el «Cancelar» del recordatorio en Chats **no cerraba nada**
—el formulario llamaba a un `onCancel` que nadie le pasaba—.

### Los menús de la columna nacen DEBAJO de la raya, colgados de su botón

Canales, etiquetas y fechas, asesores y el «⌄» de las pastillas nacían en el
borde de abajo de las PASTILLAS y en el filo izquierdo de la columna. Debajo de
las pastillas quedan todavía el relleno de la cabecera y su raya, así que **se
comían la línea divisoria**, y los de la derecha se abrían lejos de su botón.

> **`columnaAncha` los hace nacer en el borde de abajo de la cabecera de la
> columna** (`data-cabecera-de-la-columna`, raya incluida), sin hueco, y
> **anclados a su botón**: uno de la mitad izquierda alinea su filo izquierdo
> con el del botón, uno de la derecha su filo derecho; los dos crecen hacia
> dentro y, si no caben, se corren lo justo para no salirse de la columna
> (`elFiloIzquierdoEnLaColumna`).

La sonda comprueba que la raya **se ve entera** preguntando al navegador qué
hay en cada punto de ella, y **en píxeles enteros**: con un medio píxel el
navegador redondea hacia la fila de debajo, que es justo donde el menú sí tiene
que estar, y se cantaba un fallo que no existía.

### El «No autorizado» del Contexto del lead

Al abrir el panel salía en rojo, también al superadministrador:
`getSalesPlaybookAction` exigía que la conversación fuera de la cuenta de quien
mira (`userId = ownerId ?? id`), y la bandeja enseña además las de las cuentas
que cuelgan de ella. `scoreLeadBySessionId` igual («Sesión no encontrada.»).
Ahora las dos buscan la conversación por su id y comprueban
`assertCanAccessTargetUser` con **la cuenta dueña**: hacia abajo, nunca hacia
arriba. La valoración se guarda con esa cuenta y la firma la persona.

Lo prueban `scripts/banco-simetria-de-chats.sh` —la decisión y un barrido, y en
Chromium sobre la página servida a 1440/1280/1024: la raya en las tres
columnas y los siete paneles, las tres barras, los tres pies y los cuatro
menús; `MODO=roto BUILD_ANTES=<.next de antes>` afirma los fallos— y
`scripts/banco-contexto-del-lead.sh`, con las acciones de verdad contra
Postgres y su modo roto.

## Lo que se abre DENTRO de un flotante va encima de él, y la ✕ se esconde con `hideCloseButton`

Cuatro fallos de posición reportados juntos (2026-09-23), cada uno con su causa:

| lo que se veía | la causa |
| --- | --- |
| en la ficha de la cita, «Pendiente» y «Confirmada» del desplegable de estado tapadas y cortadas | el `Select` nace en el `z-50` de `components/ui/select.tsx` y la ficha en `ENCIMA_DEL_BORDE` (`z-[70]`): el hijo quedaba DEBAJO del padre, justo donde se solapan |
| dos ✕ en «Registros», una cortada en la esquina | `[&>button]:hidden` dejó de alcanzar la ✕ del diálogo cuando se metió en su caja `data-cerrar`; además esa ✕, a `-right-2` en un diálogo `p-0`, lo hacía desbordar 8 px a lo ancho |
| el menú de «+ Nuevo» fuera de su sitio | colgaba con `suelto(...)`: con hueco bajo el botón y con Floating UI libre de correrlo contra la ventana, no contra el diálogo |
| la campanita no llegaba al filo derecho | colgaba de su botón, que acaba a 12 px por el `pr-3` de la barra |

Cuatro reglas:

1. **Lo que se abre desde DENTRO de un flotante lleva `ENCIMA_DE_SU_PANEL`
   (`z-[80]`)**, por encima del panel y por debajo de la sala (`z-[99]`). Un
   `Select`, un `Popover` o un menú dentro de algo que ya lleva
   `PANEL_QUE_SE_DESPLAZA` nace en `z-50` si no se le dice nada.
2. **La ✕ de un diálogo se esconde con `hideCloseButton`, nunca con
   `[&>button]:hidden`**, y se estiliza con `[&>[data-cerrar]>button]:…`. Lo
   comprueba un barrido (`menus-de-registros-geometria.test.mjs`) que falla si
   algún `DialogContent` vuelve a escribir `[&>button]`. Estaban así Registros
   (`ChatRegistrosSheet`), Seguimientos (`SeguimientosDetailCell`) y el color
   rojo de la ✕ de `AgentPromptChatDialog`, que tampoco se aplicaba.
3. **Un menú que cuelga de un botón dentro de un diálogo va por
   `bajoSuBotonEnElDialogo`** (clase `bajoSuBotonEnElDialogo` de
   `usePanelFlotante`, que mide el `[role="dialog"]` que lo contiene): pegado
   bajo el botón (`SEPARACION_DEL_MENU`), filo derecho en el del botón y nunca
   más allá del diálogo, creciendo hacia la izquierda, ancho acotado al diálogo
   y `avoidCollisions: false`. Es el criterio de los menús de la cabecera
   aplicado a su contenedor. En el banco no se reprodujo la salida por la
   derecha tal cual —solo el hueco y el desbordamiento de la ✕—, así que la
   garantía va por construcción, no por un caso.
4. **La campanita acaba en el filo derecho de la BARRA** (`bajoLaBarraDeArriba`,
   `alignOffset = botón.right − filo`, negativo), como Acciones en el de su
   recuadro. **Su `sideOffset` y su tope de alto no se tocan**: nace donde nacía,
   y el banco lo compara contra la cuenta de antes.

Lo prueba `scripts/banco-menus-de-registros.sh`: la decisión y el barrido sin
navegador, y en Chromium sobre el CSS del build los componentes REALES
(`ChatAppointmentStatusButton`, `ChatRegistrosSheet`, `NotificationCenter`) a
1440/1280/1024/390. Dos trampas del propio banco: **un `Select` abierto pone
`pointer-events: none` fuera de él**, y `elementFromPoint` se salta lo que no
recibe el puntero —la ficha que tapa no saldría—, así que se devuelven los
punteros antes de preguntar; y una opción cortada puede tener el centro a la
vista, así que se mira arriba, en medio y abajo. `MODO=roto` empaqueta el mismo
arnés contra `ANTES_REF` (un `git worktree`) y afirma los cuatro fallos.

## Chats: todo lo flotante mide el hueco y elige el lado donde CABE

La barra de reacciones de un mensaje abría siempre hacia arriba, y con el
mensaje pegado al borde de arriba del hilo la fila de emojis quedaba fuera y no
se podía pulsar. **A zoom 80 % cabía y a 100 % no**, y eso es lo que delata la
causa: no era un dato, era un RECORTE. El menú (reacciones, Copiar, Editar,
Eliminar) era un `div` con `absolute bottom-8` **dentro del hilo que se
desplaza**, así que el `overflow` del hilo se comía lo que asomara por encima.
Nada lo medía: abría arriba pasara lo que pasara.

> **Todo lo que se abre flotando en Chats va en un PORTAL (Radix), mide el hueco
> de los dos lados antes de abrirse y elige el que cabe entero; si se sale por
> un costado se corre al otro, y si no cabe en ninguno se queda con el que más
> tiene y se desplaza por dentro.** Lo decide `lib/paneles-flotantes.ts`; no se
> escribe un `side` a mano ni un `div` absoluto.

Tres clases nuevas, al lado de las de siempre:

| clase | para qué | límite |
| --- | --- | --- |
| `enElHilo` (por `usePanelFlotante`) | lo que se abre desde un MENSAJE | **el hilo** (`data-hilo-de-chat`, el `div` que se desplaza), no la ventana |
| `suelto(primitiva, side, align)` | lo que no cuelga de ninguna fila medida: el lote, participantes, automatizaciones, la firma, el clip, los emojis | la ventana |
| `deSubmenu()` | Transferir a…, Asignar asesor…, etiquetas | la ventana |

Cinco cosas que hay que mantener:

1. **El límite del menú de un mensaje es el HILO**, pasado como
   `collisionBoundary`. Arriba del hilo está la cabecera con Macros y Acciones y
   abajo la barra de escribir: un menú que se sale del hilo no «cabe», las tapa.
   Prefiere arriba —como se abría— y voltea abajo; se alinea con el lado del
   mensaje (`end` los propios).
2. **Las clases fijadas NO voltean, y no contradicen esto.** `columnaAncha`,
   `cabecera` y `barraDeArriba` nacen justo bajo su fila —volteadas taparían las
   pastillas o la cabecera—, pero su ancho se acota a la ventana y su alto al
   hueco de verdad (`--radix-…-available-height`), así que tampoco pueden
   salirse. Es la misma garantía por otra vía.
3. **Un flotante en un portal no se cierra con un «clic fuera» casero.** El
   panel de emojis tenía un `mousedown` que comprobaba `contains` sobre el nodo
   del botón: con el panel en un portal, pulsar un emoji habría sido «fuera» y
   lo cerraba. Lo cierra Radix. Y `PopoverTrigger` ya alterna: un `onClick` que
   alterna además lo abre y lo cierra en el mismo clic.
4. **Y va ENCIMA de los botones del borde** (`ENCIMA_DEL_BORDE`, `z-[70]`,
   metido en `PANEL_QUE_SE_DESPLAZA`). La pareja del copiloto y el chat del
   equipo vive fija en el borde derecho a media altura en `z-[60]`, y los menús
   de Radix nacen en `z-50`: el menú de un mensaje largo a 1024 salía con una
   esquina TAPADA por esos botones. Lo cazó el banco con `elementFromPoint`;
   mirando la pantalla no se ve. No más de 70: la sala de reunión es `z-[99]`.
5. **Lo que queda a mano, y se dice**: la columna del «+» compacto de la barra
   de escribir (`COLUMNA_DE_HERRAMIENTAS`) y el menú de la derecha siguen siendo
   `absolute bottom-full`. Son los propios botones de la barra, que se pintan en
   fila o en columna según el ancho, y pasarlos a un portal es rehacer
   `BarraDeEscribir`. Abren desde lo más bajo de la pantalla hacia el hilo, que
   no los recorta. Si algún día se recortan, ese es el sitio.

Lo prueba `scripts/banco-flotantes-del-hilo.sh` sobre la página **servida**
(ochenta mensajes sembrados: con tres el hilo no se desplaza y no hay borde que
probar), a 1440/1280/1024 × zoom 100 % y 80 % × ficha cerrada y abierta, con el
mensaje al borde de arriba, en medio y al borde de abajo, propio y del
contacto: el menú entero dentro del hilo, cada emoji es lo que hay en su punto
(`elementFromPoint`) y la primera reacción se PULSA. Y los menús de la
cabecera, el «⋯» de una tarjeta y el filtro de etiquetas, enteros en la ventana
y sin nada encima. El zoom se emula como el navegador: a 80 % la ventana CSS
mide `ancho / 0,8`. `MODO=roto` con un `.next` de `093f071` afirma el recorte.
La decisión, sin navegador, está en `banco-paneles-flotantes.sh`.

## Un saliente automático lo escribe QUIEN LO MANDA, no el eco del proveedor

El recordatorio de una cita le llegaba al cliente por WhatsApp y **en Chats no
quedaba ninguna fila**. Cuando el cliente respondía citándolo, el panel pintaba
**«Ese mensaje todavía no está cargado»** — porque el mensaje citado no existía
en `chat_messages`. En varias citas, no en una.

Y no era el envío: era que **nadie lo escribía**.

Un recordatorio de cita **no** es una fila de `Reminders`. Al agendar, la App
escribe una fila de `seguimientos` con `idNodo = appt-reminder-<id>`, y la
entrega `FollowUpRunnerService`. Ese runner pedía el emisor a pelo
—`factory.getSender(...).sendText(...)`— y eso **manda y no guarda nada**.

### Por qué solo se veía en unas líneas

Esta es la parte que hace que el fallo parezca intermitente y que despista:

| la línea | ¿hay eco del proveedor? | ¿quedaba escrito? |
| --- | --- | --- |
| **Evolution** | sí: `messages.upsert` devuelve también lo que sale por su API | **sí**, lo guardaba el eco |
| **Waha, Meta, Telegram** | el eco se **descarta a propósito** | **no**, nada |

Lo de Waha no es un olvido: `if (esPropio && msg.source !== 'app') return []`
es lo que impide que la IA oiga su propia respuesta, se tome por intervención
humana y **se pause justo después de hablar**. Ese filtro lleva escrita al lado
su premisa: *«lo que sale por la API ya lo guardamos nosotros al enviarlo»*. El
follow-up runner no cumplía su mitad del trato.

> **La regla: un saliente automático se escribe en el mismo sitio donde se
> manda, y se manda por el camino que lo escribe.** En este repositorio ese
> camino ya existía y tenía tres puertas —`sendEvolutionAiText`,
> `enviarMediaIaPorLinea` y `enviarAudioIaPorLinea`, de `WorkflowService`—, que
> es por donde ya salían los follow-ups del CRM, los nodos de flujo y la mitad
> de los recordatorios. **Nadie manda un automático con
> `factory.getSender(...)` a pelo.**

### Y no duplica, porque la fila lleva el id REAL

Es lo que permite que la regla valga también en Evolution, donde el eco SÍ
llega: se envía capturando el id de WhatsApp (`sendTextNodeReturnId` en
Evolution, `sendTextConId` en los canales) y se guarda con él, así que el eco es
**la MISMA fila** y el `ON CONFLICT` la dedupe. Guardar sin id es lo que hacía
salir el mismo mensaje dos veces en el panel —uno «Agente IA» y otro con el
nombre del asesor— habiéndole llegado UNA sola vez al cliente.

Y el id real hace la otra mitad: el acuse (`message.ack`) encuentra la fila y el
✓✓ avanza. Sin él la fila se queda con una palomita para siempre.

### Cinco cosas que hay que mantener

1. **El proveedor sale de la FILA, no del parámetro.** `resolveInstanceType`
   preguntaba con la cuenta y, sin cuenta, se caía a `'evolution'` a ciegas: el
   saliente de una línea de Waha se mandaba al servidor de Evolution —que para
   ella no existe— y no llegaba nada. Ahora la cuenta acota cuando se sabe y,
   cuando no, se pregunta por la línea a secas, que es lo que
   `WhatsAppSenderFactory.getSender` hace desde siempre.
2. **Sin ficha de conversación, la cuenta sale de la LÍNEA.**
   `canSendWithoutSession` deja salir un seguimiento sin sesión, y
   `persistMessage` necesita saber de quién es la fila: con la cuenta vacía el
   mensaje sale y no queda escrito. `Instancias` sabe de quién es la línea.
3. **Y si aun así falta, se avisa.** Un saliente que no queda escrito no se ve
   como un error: se ve como un panel al que le faltan mensajes, que es de lo
   más caro de diagnosticar.
4. **Los tres tipos van por el mismo sitio.** Si el texto se guarda y la media
   no, un recordatorio con imagen sigue desapareciendo — y eso no se lee como
   «falta un caso», se lee como «a veces funciona».
5. **Si se añade otro emisor automático, va por ahí.** Eran dos los que se
   habían quedado fuera —los seguimientos y la rama sin `serverUrl` del runner
   de recordatorios, que es **toda** línea de Waha—, y los dos se veían igual
   desde fuera.

### El banco

`scripts/banco-recordatorio-en-el-chat.sh` (en el repositorio del backend), en
dos modos y contra Postgres, con el **`ChatStoreService` de producción**
escribiendo las filas: las tablas del chat las crea él mismo con
`CREATE TABLE IF NOT EXISTS`, que es el mismo camino que en producción, en vez
de una DDL escrita a mano que podría no parecerse a la de verdad.

`MODO=roto` lleva dentro, **escritos literales**, los tres trozos de antes, y
afirma el fallo: la línea envía y `chat_messages` queda vacía. Y se comprobó lo
que de verdad hace falta comprobar de un modo roto: **quitándole esos trozos se
pone en rojo**, o sea que no estaba verde por no ejercer nada.

## «Llamar con IA» como SEGUIMIENTO: una sola puerta, y el prefijo se quita entero

En el creador de flujos «Llamar con IA (voz)» existía solo como **acción**, que
se ejecuta en cuanto el flujo llega a ese nodo. Ahora existe además en
**SEGUIMIENTOS**, junto a Texto, Imagen, Vídeo, Documento y Nota de voz, con su
duración de retraso y su «Activar Inactividad». **La acción inmediata no
cambia**: son dos nodos distintos, y lo único que los separa es cuándo sale la
llamada.

### La regla: NO se escribe un segundo camino de llamada

> El seguimiento llama por **la misma puerta** que la acción inmediata
> (`StageAutomationService.lanzarLlamadaConIa` → `doAiCall` → wacalls). Con dos
> caminos, el día que se afine uno el otro se queda atrás — y aquí «quedarse
> atrás» es una llamada que sale **sin pasar por la comprobación de créditos**,
> porque quien los descuenta es wacalls al resolver.

De ahí salen gratis las dos mitades del encargo, sin escribir ninguna rama:

- **Los créditos**, porque es el mismo POST a la misma sesión de llamadas de la
  cuenta.
- **El horario**, porque un seguimiento del creador de flujos tiene su `idNodo`
  propio —sin prefijo de recordatorio—, así que `isFlowFollowUp` es cierto y ya
  pasa por `isWithinSendWindow`. Un recordatorio de cita sale siempre y este
  no: son cosas distintas y el runner ya las distinguía.

### El prefijo se quita ENTERO, no el primer trozo

Esto era un fallo latente que salió al añadir el tipo. El tipo base se sacaba
con `tipo.split('-')[1]`, que de `seguimiento-text` da `text` y de
`seguimiento-ai-call` da **`ai`** — un tipo que no existe. Así que la tarjeta se
caía al caso por defecto y pedía subir un archivo para una llamada.

Los cinco tipos de siempre no lo delataban porque ninguno lleva un guion dentro:
`text`, `image`, `video`, `document` y `audio` dan lo mismo por los dos caminos.
**Un separador que solo se prueba con nombres de una sola palabra no está
probado.** La decisión vive en `lib/seguimiento-de-llamada.ts`, pura, y el banco
la ejerce con el invariante —`seguimiento-uno-dos-tres` → `uno-dos-tres`— y no
solo con el caso que la motivó.

### Cuatro cosas más que hay que mantener

1. **La llamada NO sale por la línea de WhatsApp**, así que va **antes** de
   pedir el emisor: pedirlo sería trabajo tirado y un sitio más donde fallar por
   algo que no se usa. Y por lo mismo **no espera el turno del número** ni se lo
   gasta al siguiente WhatsApp que sí va por él: el ritmo de la línea existe
   porque WhatsApp bloquea a quien emite en ráfaga, y esto no emite por ahí.
2. **Sin ficha de conversación no hay a quién llamar**, y se dice con esas
   palabras: el teléfono y la línea salen de `Session`, y el seguimiento solo
   guarda su `remoteJid`. El motivo tiene que poder leerse en la fila.
3. **Nunca un éxito callado.** `doAiCall` devuelve un resultado con motivo en
   sus cinco salidas, y el runner lo convierte en un error de verdad. Sin eso,
   el seguimiento se marcaba como enviado sin haber llamado a nadie — que es lo
   contrario de lo que se ve desde fuera.
4. **El nodo entra en las DOS paletas y en el catálogo por plan.** El fallo de
   esta familia es que a una hermana se le pasa, así que el banco lo comprueba
   leyendo los ficheros, y su modo roto los lee de `origin/main` para afirmar
   que allí no están.

### Los bancos, uno por mitad

- `scripts/banco-seguimiento-de-llamada.sh` (App) — la decisión, sin navegador,
  y las dos paletas más el catálogo. El modo roto es el `split('-')[1]` de
  antes y **afirma** que de `seguimiento-ai-call` sale `ai`.
- `scripts/banco-llamada-como-seguimiento.sh` (backend) — el runner de verdad
  contra Postgres: la llamada sale por el lanzador y **no** por la línea, al
  mismo endpoint que la acción inmediata; respeta el horario; no gasta el turno;
  y un «no se pudo» deja su motivo en la fila. El modo roto lleva dentro,
  literal, el `sendSeguimiento` de antes y afirma el «tipo no soportado».

Lo que **no** se tocó, a propósito: el editor de flujos **legado** (`/flow`),
que nunca tuvo ningún nodo de llamada. Esto entra solo en el lienzo de
`/workflow`.

## Una clave de IA no viaja al navegador: ni la del cliente, ni la de la casa

Perfil › API key recibía la fila entera de `user_ai_configs` —`apiKey` en
claro— y la metía en el formulario. El `type="password"` solo la tapaba en
pantalla: la clave iba en la respuesta de la acción y quedaba en el estado de
React. Y esa clave **casi nunca es del cliente**: las cuentas nuevas nacen con
una llave de la casa (Panel › API keys; antes `SECRET_API_KEY`) y los clientes
de un reseller heredan la suya. O sea que cualquier cuenta leía la clave de
OpenAI de Verzay desde su propio Perfil. Estuvo así desde `2e35653c`.

> **Al navegador solo le llega SI hay clave y sus cuatro últimos caracteres.**
> Lo decide `lib/clave-de-ia-para-el-navegador.ts` (puro): toda acción que
> devuelva una configuración pasa por `sinLaClave`, y guardar con el campo
> **vacío conserva la guardada** (`laClaveQueSeGuarda`), que es lo que permite
> no devolverla nunca.

Tres cosas que hay que mantener:

1. **El lector que sí devuelve la clave vive en `lib/cliente-de-ia.server.ts`,
   con `server-only`**, no en un fichero `'use server'`. Exportada desde
   `userAiconfig-actions.ts`, `resolveUserAiClient` era un endpoint que daba la
   clave a quien la pidiera con su sesión. Lo que devuelve **no se reenvía**.
2. **El ojito y el «copiar» de quien administra se fueron**, a propósito: un
   reseller que ve la clave de la casa es la misma fuga. Para saber cuál llave
   es, está el final y el aviso de origen (`getAiKeyOriginInfo`).
3. **Panel › Clientes** (`getEnrichedClients`) también mandaba `aiConfigs` con
   la clave; va con `sinLaClave`. Si se añade otra lista que incluya
   `aiConfigs`, va igual.

Lo comprueba `scripts/banco-clave-de-ia.sh`: la decisión, un barrido del código
y las acciones de verdad contra Postgres, y en `MODO=roto` el código de
`ANTES_REF` afirma la clave en claro en la respuesta.

## CRM › Llamadas: el detalle usa la nota de voz de Chats, y los turnos solo si el texto los trae

Cuatro arreglos del diálogo «Detalle de la llamada», y la regla de cada uno:

1. **La grabación es la MISMA nota de voz que en Chats**, no una parecida:
   `components/shared/NotaDeVoz.tsx` la pintan `MediaRenderer` y el diálogo
   (`NotaDeVozSuelta`, con el marco y los 350 px de un adjunto). Sin tamaños ni
   colores propios. La duración sale al abrir: `<audio preload="metadata">` y,
   para un webm que dice `Infinity`, `pedirLaDuracionDeVerdad` (salta al final,
   espera `durationchange` y vuelve a 0). Con dos reproductores, el día que se
   afine uno el otro se queda atrás.
2. **«Verzi», «Verzei» y «Berzy» se corrigen AL GUARDAR** —la lista cerrada de
   `lib/nombres-de-la-marca.ts`, con su `PISTA_DE_VOCABULARIO` arriba—. Solo
   transcripciones nuevas: lo guardado no se reescribe, que es un registro de lo
   que pasó.
3. **Los iconos por hablante salen solo si el TEXTO trae quién habla**
   (`lib/turnos-de-la-transcripcion.ts`, puro: `Operador:`/`Asistente:` → robot,
   `Cliente:` → persona). **Comprobado: OpenAI (`gpt-4o-transcribe`/`whisper-1`),
   que es el camino normal, devuelve texto CORRIDO sin hablantes**; solo el de
   Google marca turnos. Sin marcas se pinta tal cual y **no se inventa la
   separación**: repartir un texto corrido sería atribuirle frases a quien no las
   dijo. Si hace falta en todas, el camino es transcribir los dos canales del WAV
   por separado (izquierdo = asistente, derecho = cliente). El Resumen IA no
   lleva iconos: no es una conversación.
4. **Sin «Cerrar» abajo**: el diálogo se cierra con la X, y sin pie no queda una
   fila vacía.
5. **El rótulo «Grabación» lleva la ONDA de sonido** (`AudioWaveform`), con la
   misma caja que los de Resumen IA y Transcripción. No un micrófono: la nota
   ya trae el suyo y quedarían dos.
6. **En el detalle la nota ocupa todo su recuadro** (`NotaDeVozSuelta
   ancho="w-full"`). Cambia solo el largo; el diseño y la duración al abrir son
   los de Chats, y en Chats sigue a 350 px (`ANCHO_DE_LA_NOTA`). Lo prueba
   `scripts/banco-grabacion-del-detalle.sh`, en dos modos, midiendo los iconos
   contra los de los otros dos rótulos en la misma página.

Lo prueba `scripts/banco-detalle-de-llamada.sh`, en dos modos: la regla pura y
el diálogo real en Chromium. `MODO=roto` saca los ficheros de `ANTES_REF` con
`git show` y afirma los fallos. Y el test importa playwright con
`createRequire`: el del entorno vive fuera del repo y un `import()` de ESM no
mira `NODE_PATH`, así que las pruebas de navegador se saltaban en silencio.

## Rellenar el historial de una línea: no duplicar y no partir la conversación

Lo que el dueño escribía desde su teléfono no se guardaba (lo arreglaron
api-webhook#174 y #175), pero Evolution y Waha sí lo tienen en su propia base.
`lib/relleno-de-historial.server.ts` lo trae, y se lanza sobre cualquier línea
desde `/api/admin/rellenar-historial` (solo superadministrador de verdad o la
clave interna):

```
POST { linea, jid }                  revisa UN chat, sin escribir
POST { linea, jid, escribir: true }  rellena ese chat
POST { linea, todos: true }          la línea entera, de fondo (202)
GET  ?linea=X                        cómo va
```

Lo que decide vive en `lib/relleno-de-historial.ts`, puro, y son dos reglas:

1. **Un mensaje ya está si su id de WhatsApp está en la línea bajo CUALQUIERA
   de las identidades del contacto**, comparando el id CRUDO (`idDeWhatsapp`,
   ahora en `lib/`) y `fromMe`. Waha lo serializa y Evolution lo da pelado, y
   una línea que cambió de proveedor tiene las dos formas.
2. **Lo que falta se escribe donde YA VIVE la conversación** (la identidad con
   más filas), no donde lo diga el proveedor. Un chat guardado bajo su `@lid`
   y devuelto por su número se partiría en dos: es exactamente lo que hace el
   relleno ingenuo de volver a pasar todo por `persistEvolutionMessages`, y lo
   que el `MODO=roto` del banco afirma. Y bajo un `@lid` se escribe SIN alias de
   teléfono: `persistChatMessage` se queda con el primero que vea.

Tres cosas del recorrido:

- **En serie y con pausas** (`PAUSA_ENTRE_CHATS_MS`, `PAUSA_ENTRE_PAGINAS_MS`):
  la línea sigue atendiendo y su proveedor no recibe una ráfaga.
- **El avance vive en `relleno_de_historial`**, no en la promesa: un despliegue
  se lleva el proceso, no el avance, y relanzarlo sigue por el chat siguiente
  (por jid, no por posición). Uno que dice «corriendo» sin latido en
  `SIN_LATIDO_MS` se da por interrumpido. Dos lanzamientos a la vez: gana uno,
  lo decide un `INSERT … ON CONFLICT … WHERE` en una sola sentencia.
- **Los adjuntos vienen sin archivo** —«[Imagen]» con su pie—, igual que el
  historial de Waha al abrir un chat. Y el tope por chat son 5.000 mensajes; uno
  más largo se cuenta en `chatsRecortados`.

### Un id de WhatsApp ya guardado en la línea NO se vuelve a escribir, bajo ninguna identidad

La primera pasada sobre RCA (`MULTIGAMA_SA`, 2026-09-24) escribió 11.893
mensajes y **129 salieron repetidos**. Dos causas, y las dos eran de mirar
solo las identidades que da el proveedor:

1. **El puente estaba en una sola fila.** Un chat abierto por su `@lid` tenía
   su historial viejo bajo el número, y lo único que los unía era el
   `remoteJidAlt` de una fila: se veían 24 de 324 mensajes y se reescribía el
   resto. `filasCerradas` sigue ese puente hasta cerrarlo (nunca en un grupo:
   su `senderPn` es quien escribió).
2. **Sin puente ninguno.** Waha listaba al mismo contacto dos veces —por su
   número y por su `@lid`— y devolvía el mismo mensaje en las dos, cada vez con
   su propio `from`. Nada en la base unía las dos. Así que ahora se cargan
   **una vez por línea** las llaves de todo lo que ya tiene
   (`llavesDeLaLinea`) y un id que ya está se da por guardado, venga bajo la
   identidad que venga. Un id de WhatsApp es único: no hace falta saber de
   quién es para saber que ya está.

Los dos casos están en el banco con la forma exacta de producción, y cada uno
se pone rojo si se quita su mitad del arreglo.

### Todas las líneas: en serie, y la del cliente primero a mano

`POST { todasLasLineas: true }` recorre **todas** las líneas por QR (Evolution
y Waha) con `rellenarLaLinea`, una detrás de otra y con
`PAUSA_ENTRE_LINEAS_MS` entre medias: nunca dos a la vez, que serían dos
ráfagas contra el proveedor. `GET ?todas=1` dice cómo va, y `GET ?buscar=RCA`
encuentra una línea por su nombre, el de su dueño, su empresa, su correo o su
número (con o sin indicativo) sin devolver los teléfonos.

1. **El avance vive en la misma tabla**, en la fila `RECORRIDO_DE_TODAS`
   (líneas en `chatsTotal`/`chatsHechos`, la que va en `ultimoChat`). Tras un
   despliegue, relanzarlo sigue por las que faltan.
2. **Se salta la que terminó en ESTE recorrido o hace menos de un día**
   (`lineasQueQuedan`, `RECIEN_TERMINADA_MS`): así se puede rellenar a mano la
   línea del cliente que reclama, mirar cómo quedó, y lanzar el resto sin
   repetirla.
3. **Cada chat hace latir también el recorrido de arriba** (`alLatir`): una
   línea larga tarda horas, y sin ese latido un segundo lanzamiento lo daría
   por muerto y correría en paralelo.
4. Una línea sin credenciales o ya en marcha **no corta** el recorrido: se
   cuenta en `chatsFallidos`, se dice en `ultimoError` y se sigue.

### Y lo que entra EN VIVO mientras corre también cuenta

Una línea grande tarda horas, y la foto de llaves se toma al empezar. Lo que la
IA o el cliente escriben mientras tanto no está en ella: AMERICA_PENSIONADO_ALIADO
dejó **8 repetidos** así —respuestas de la IA guardadas en vivo bajo un jid
pelado (`528711997020`, sin `@s.whatsapp.net`) que el relleno volvió a escribir
bajo el bueno—. Antes de cada chat se suma a las llaves lo que tenga
`messageTimestamp` desde el arranque menos `MARGEN_DE_LO_VIVO_MS`
(`sumarLoQueEntroEnVivo`), por el índice `(userId, instanceName,
messageTimestamp)`: no se relee la línea entera.

Lo del jid pelado es otro fallo, del backend al guardar la respuesta de la IA, y
está sin arreglar: parte la conversación en Chats.

### Y una línea que cambia de proveedor a mitad se CORTA, no se quema

El proveedor se elige al empezar la línea. AUDFONOS_IPS pasó de Evolution a
Waha a mitad del recorrido: su instancia desapareció de Evolution, cada
`findMessages` contestó `404`, y el recorrido siguió **contando 2.000 chats
como fallidos sin escribir una línea en el registro**, porque un chat que el
proveedor no devuelve no lanzaba nada. Desde fuera parecía una línea que iba
bien.

Ahora un chat sin respuesta **se dice** (`[relleno] el proveedor no devolvió el
chat`), y `TOPE_DE_FALLOS_SEGUIDOS` (25) seguidos cortan la línea como
`fallido`, con el motivo en `ultimoError` —si cambió de proveedor, lo nombra—.
El recorrido de todas sigue con la siguiente; esa línea se relanza a mano.

Lo prueba `scripts/banco-relleno-de-historial.sh` contra Postgres, con
`persistChatMessage` de verdad y solo la red fingida (el proveedor se arma con
los mismos traductores, `traidoDeEvolution` y `traidoDeWaha`).

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

## Una cadena de tres servicios sin red debajo se cae con cualquier redespliegue

El 21 las llamadas con IA se registraban completas —duración, Resumen IA y
transcripción—. El 22 por la mañana, no. En medio: se cayó Postgres, se
borraron a mano los contenedores del backend en Portainer, y **los stacks de
postgres y del backend se volvieron a desplegar desde el editor**.

El arreglo del 21 (#877) es correcto y no se toca: AstraCalls avisa al colgar,
el backend lo relaya, la App anota la duración y va a por la grabación. Lo que
no tenía es **red debajo**, y eso es lo que lo hace frágil a cualquier cosa que
pase en un servidor:

| eslabón | de qué depende | qué se ve cuando falla |
| --- | --- | --- |
| AstraCalls → backend | `VOICEBOT_RESOLVE_URL`, con `/resolve` dentro | un `log.Warn` en un servidor |
| backend → App | `NEXTJS_URL` + `CRM_FOLLOW_UP_RUNNER_KEY` | otro `logger.warn` |
| la imagen del backend | que el redespliegue no fije un digest viejo | un `404` que solo ve AstraCalls |

**Los tres se configuran a mano en un editor de Portainer, los tres fallan
mudos, y ninguno deja nada en la base.** Así que el día que uno se cae, lo que
se ve desde fuera es el síntoma original y no hay dónde mirar.

### Lo que había debajo NO era una red

`esperarYProcesarLaGrabacion` es una promesa suelta (`void`) dentro de una
petición, en un proceso que **se despliega decenas de veces al día y corre a
dos réplicas**. Un despliegue se la lleva sin dejar rastro ni a quien
retomarla. Con la llamada ya colgada, eso es un dato que no vuelve nunca.

> **La red tiene que salir de la BASE, no de la memoria de nadie.** Una llamada
> que se lanzó dejó su fila con su par de ids dentro (`astraSid`,
> `astraCallId`); con eso se vuelve a ella desde cero, en otro proceso, en otro
> contenedor y tres despliegues después. Eso es lo único que sobrevive a un
> redespliegue del stack.

Lo decide `lib/rescate-de-llamadas.ts` (puro) y lo ejecuta
`lib/rescate-de-llamadas.server.ts`, por `/api/calls/rescatar`.

### Y la red no puede depender de lo mismo que viene a tapar

Es la decisión de la que cuelga todo lo demás, y es lo que hace que esto
sobreviva a un re-pegado de la plantilla:

> **El barrido usa SOLO `NEXTJS_URL` y `CRM_FOLLOW_UP_RUNNER_KEY`** —las dos
> que el relay ya usaba y **las dos que el `portainer-stack.yml` del repo sí
> lleva**—. Ninguna variable nueva: una variable más es una más que perder en
> el próximo redespliegue, que es exactamente el fallo del que viene. Y su
> reloj **nace ENCENDIDO**, al revés que los dieciocho runners del backend: uno
> que se apaga cuando se pierde su propia variable no tapa nada.

### El número de rescates ES la alarma

Esto no sustituye al aviso: hace que su caída deje de ser invisible. Si el
barrido no rescata nada, la cadena funciona. **Si `sinAviso` no es cero, algún
eslabón está roto ahora mismo**, y se dice nombrando los tres. Es la misma idea
que *una línea muerta no tiene filas*: el cero es el dato.

### Cinco cosas que hay que mantener

1. **Una llamada EN CURSO no está rota.** Sin `EDAD_MINIMA_MS` el barrido le
   pediría a AstraCalls la grabación de una conversación que se está teniendo
   —que no existe hasta que alguien cuelga— y gastaría sus intentos antes de
   que hubiera nada que rescatar.
2. **Hay un tope de intentos, y hace falta.** Cada rescate **se baja el WAV
   entero**. Sin tope, una llamada que no se puede transcribir —sin créditos,
   un audio imposible— se lo bajaría en cada vuelta para siempre. El sello va
   en `raw.call.rescate`: ni tabla nueva ni migración.
3. **El sello se escribe ANTES de intentarlo.** Al revés, un intento que
   revienta a mitad —o un despliegue que se lleva el proceso, que es justo lo
   que pasa aquí— dejaría la llamada sin gastar su turno y la vuelta siguiente
   volvería a bajarse el mismo WAV.
4. **Va acotado por `messageTimestamp`, en serie y a trozos.** Los cinco
   índices de `chat_messages` empiezan por `userId` y aquí no hay ninguno que
   dar: sin esa condición se barre la tabla más grande de la plataforma. Y el
   pool de Prisma son diez por proceso, los mismos turnos que atienden Chats.
5. **`hasRecording === false` es AstraCalls diciendo que no hay audio**, y esa
   llamada está cerrada y correcta. Solo el `false` explícito: sin el campo es
   «no se sabe», que es justo lo que hay que ir a mirar.

### Y lo que estaba mudo: una llamada que no se registra NO se recupera

`logOutgoingCallAction` tenía el `catch` **vacío**. Eso es exactamente el
síntoma «la llamada se hizo, se habló, y no aparece registrada en ninguna
parte»: cuando se llega ahí la llamada ya salió, así que lo único que se pierde
es el registro — y sin fila no hay a quién pedirle la grabación, **ni ahora ni
en el barrido**. De todos los fallos de esta familia es el único que no tiene
arreglo después, así que es el que menos puede callarse.

### La plantilla del stack no lleva los secretos, y eso hay que SABERLO

`api-webhook/portainer-stack.yml` **no lleva** `VOICEBOT_SECRET`,
`ASTRACALLS_URL` ni `ASTRACALLS_API_KEY`: son secretos y no se comitean. Lo que
no puede pasar es que nadie lo sepa, porque **pegar esa plantilla en el editor
de Portainer se los lleva por delante**. Ahora lo dice un bloque en la propia
plantilla, y el backend **nombra en el arranque** las que falten —una vez, no
por petición, que ahí se pierde entre los `logger.log` de `webhook.service`—.

Y lo que hace cada una al faltar, que no es lo mismo:

- **`VOICEBOT_SECRET`**: `if (expected && secret !== expected)`. Vacía **no
  cierra: ABRE** — `/voicebot/*` deja de pedir secreto y cualquiera puede
  gastar los créditos de una cuenta. No rompe las llamadas, y por eso no se
  nota.
- **`ASTRACALLS_URL` / `_API_KEY`**: la acción `AI_CALL` de un flujo no llama a
  nadie. Eso sí se nota, y solo en el registro del backend.

### El banco

`scripts/banco-rescate-de-llamadas.sh` (App, contra Postgres) y su hermano en
el backend. Los dos en dos modos, y el roto **afirma el fallo**: se reproduce
el despliegue que se lleva la promesa suelta y se comprueba que la llamada se
queda como nació —y que **su par de ids seguía ahí todo el tiempo**, que es lo
que convierte el fallo en arreglable: no faltaba el dato, faltaba quien lo
mirara. Comprobado además que quitando el barrido el modo normal **se pone en
rojo por seis sitios**: sin eso no se sabría si lo verde es que se arregló la
causa o que el caso no se ejerce.

### Y el eslabón que se cayó era un CUARTO que no estaba en la lista

La primera versión de esta sección decía que cuál de los tres se cayó no se
podía saber sin mirar el stack. **Se podía, y no era ninguno de los tres**: era
el `middleware.ts` de esta App, y está contado entero en la sección siguiente.
Lo que sigue valiendo de esta es la forma del arreglo — la red sale de la base
— que es lo que hace que el fallo, venga del eslabón que venga, deje de ser
definitivo. **A partir de ahora el barrido lo dice**: `sinAviso` por encima de
cero nombra la cadena en el registro del backend.

## Un `fetch` SIGUE las redirecciones, así que el middleware puede tragarse un aviso entero

Esta es la causa de verdad de «las llamadas con IA no dejan ni duración», y es
de las que se anuncian como un éxito.

El backend avisa del fin de una llamada con
`fetch(NEXTJS_URL + "/api/calls/call-ended")`, con su clave interna y **sin
cookie de sesión**. En `middleware.ts` no había ningún prefijo `/api/calls`, así
que esa petición caía en el `redirect` final hacia `/login`. Y ahí está lo
caro:

> **`fetch` sigue las redirecciones por defecto.** Así que el backend se traía
> **la página de login con un `200`**, `resp.ok` salía `true`, y escribía en su
> registro «fin de llamada avisado a la App» habiendo entregado exactamente
> nada.

Medido sobre el build servido, no deducido:

```
POST /api/calls/call-ended   ->  307 -> /login?callbackUrl=%2Fapi%2Fcalls%2Fcall-ended
como lo ve el backend        ->  resp.ok true · resp.status 200 · resp.url .../login
```

### Por qué su banco estaba verde

Porque llamaba al **manejador** directamente
(`avisarDelFinDeLaLlamada(new Request(...))`), y ahí no hay middleware. El
camino de producción tiene una capa más que ningún caso ejercía.

> **Un banco que llama al manejador de una ruta no prueba que esa ruta se
> alcance.** Son dos preguntas, y la segunda es la que falla en silencio.

### Y no era una ruta: eran nueve

El barrido que se escribió para esto —toda ruta que se autentique con la clave
interna tiene que estar detrás de un prefijo del middleware— encontró **ocho
más**, todas medidas con el mismo `307`:

| | qué se caía |
| --- | --- |
| `/api/calls/{call-ended,process-bot-recording,rescatar}` | el fin de llamada, la transcripción del flujo y su red |
| `/api/send-media`, `/api/products`, `/api/external-client-data{,/search,/tools}` | **las herramientas del agente**: pedía sus productos y sus datos externos y se traía la página de login |
| `/api/bookings/{slots,services,appointment}` | los horarios de reserva del agente |

**Abrir esos prefijos no abre nada**, y se comprobó ruta por ruta antes de
tocarlos: las doce tienen su puerta propia —once con la clave interna y
`calls/recording` con `currentUser()`—. Es la regla de siempre: *ninguna ruta
`/api` confía solo en el middleware*. Comprobado además sobre el build servido
que después del arreglo siguen contestando **401 sin clave y con clave
equivocada**.

### `/api/bookings` se queda fuera A PROPÓSITO, y sigue rota

Sus tres rutas importan ficheros `'use server'` (`bookings-actions`,
`send-message-with-history-action`), así que abrir su prefijo pone en rojo
`acciones-de-sistema.test.mjs` —la guarda de que un runner de sistema no quede
publicado como endpoint—. Eso es un frente aparte: o se le quita el
`'use server'` a esos dos, o se decide que esa guarda no aplica a una ruta con
clave propia. **Lo que no puede pasar es que se dé por revisado**: está en la
lista de exclusiones del banco con su motivo escrito al lado, y el banco falla
si el motivo se queda vacío.

### Las dos cosas que quedan para que no vuelva

1. **El barrido del banco**, que es lo que caza la PRÓXIMA ruta que nazca con
   el mismo agujero. Lee los prefijos **del propio `middleware.ts`** —copiados
   a mano se quedarían cortos el día que se añada uno— y exige además que cada
   prefijo declarado se USE en un `return NextResponse.next()`: declararlo y no
   usarlo se lee igual de bien y no deja pasar a nadie.
2. **Y el backend mira `resp.redirected`**, en los dos sitios que llaman a la
   App. El middleware ya está arreglado; la comprobación se queda porque **un
   fallo que se anuncia como un éxito es el más caro de todos**, y el día que
   alguien añada una ruta sin su prefijo esto lo dice en vez de callarlo.
   Comprobado quitándola: los dos casos se ponen en rojo.

## Llamadas se alinea con Leads: una fila de mandos, un tamaño y el número en azul

La referencia de una pantalla de lista en esta plataforma es **Leads**
(`/sessions`), y CRM › Llamadas se había separado de ella por cuatro sitios a
la vez. Ninguno es grave por su cuenta; puestas las dos pantallas lado a lado,
se leen como dos plataformas.

### 1. El número: a la IZQUIERDA y en AZUL

Iba centrado en su celda y en negro. Las dos cosas son el mismo error de fondo
—**la celda no decía lo que la celda es**— y cada una molesta por su lado:

> **Una columna de teléfonos se lee comparando filas**, así que centrada no se
> puede leer: cada número arranca donde le deja su propio ancho, y el nombre
> que cuelga debajo arranca en otro sitio. Y **el número es lo que se pulsa
> para abrir el chat**, así que en negro no se lee como lo que es.

La clase es **la misma que la de Leads**, no una parecida: `text-blue-600` con
`hover:text-blue-800`, la celda `text-left` y el nombre de debajo sin su
`mx-auto`. Medido en Chromium sobre el CSS del build, a 1440, 1280 y 1024: el
número arranca **a 0 px** del borde interior de su celda, el nombre arranca en
**el mismo píxel** que él, y el color es exactamente el que pinta
`text-blue-600` en esta hoja.

Ojo con ese color: **no es el azul de Tailwind.** Esta plataforma redefine la
paleta y sale `rgb(31, 102, 173)`. El banco no lo lleva escrito —pinta una
sonda con la clase y le pregunta al navegador—, porque un número copiado a mano
probaría que coincide con lo que alguien recuerda del tema, y se pondría rojo
el día que se afine un color sin que nada esté roto.

### 2. Un solo tamaño de letra, y las pastillas no cuentan

La tabla mezclaba dos: `text-sm` (14 px) en el cuerpo y `text-xs` (12 px) en la
cabecera, en el nombre del contacto y en los «—» de una fila ajena. Todo va al
de Leads, que es el `text-sm` de `components/ui/table.tsx`.

**Lo que NO se toca son las pastillas** —el tipo, el resultado, el estado—, y
eso no es una excepción que se inventa aquí: Leads pinta las suyas igual
(`SeguimientoBadge`, las etiquetas). Una píldora es una píldora; lo que tiene
que ser un solo tamaño es el **texto**.

Por eso el banco mide el conjunto de tamaños **descontando lo que cuelgue de un
`rounded-full`**, y afirma que es exactamente uno. Midiendo todo saldrían dos
y habría que ablandar la comprobación hasta que no dijera nada.

### 3. Dentro de Llamadas la fila de pestañas sobra

Encima de la barra iba la fila del CRM —Analíticas · Registros · Llamadas ·
Kanban · Reportes— con el rango de 7/30/90 días y «Actualizar» a su derecha.
Eran **dos filas de mandos** donde el resto de la plataforma tiene una, y la de
arriba le quitaba su alto a la tabla. A las cinco vistas se llega por el menú
del módulo, que es de donde salen sus cinco rutas (`navigation-routes.ts`).

> **Se decide por la RUTA (`initialView`), no por `viewMode`.** Desde `/crm` se
> puede abrir la vista de llamadas **con** esas pestañas, y escondiéndolas ahí
> no habría forma de volver: menú cerrado por dentro, que es el fallo contrario
> al «menú abierto, puerta cerrada» que este documento persigue y se ve igual
> de mal. En su propia ruta el modo no cambia nunca, así que no hay nada que
> cerrar.

Y con la fila se va su contenido: el rango pasa a ser fijo y «Actualizar» baja
al hueco `secundarias` de la barra.

**El selector de cuentas de la familia no se pierde.** Vivía en esa fila, así
que baja a la pantalla **como nodo** (`selectorDeCuentas`) y se pinta en el
hueco `filtros`, que es donde va lo que acota la lista. Y baja **solo en la
ruta de Llamadas**: en las otras cuatro vistas lo sigue pintando la fila de
pestañas, y pasándolo siempre saldrían **dos selectores para el mismo filtro**,
que es tanto como no saber cuál manda.

### 4. Los conteos eran el mismo filtro DOS veces

Las tres pastillas —Total, Salientes, Entrantes, con su cifra— estaban pegadas
al grupo de botones «Todas / Salientes / Entrantes», y hacían **exactamente lo
mismo**: se pulsaba una y el grupo de al lado se ponía igual. Se van las
pastillas y se queda el grupo, que es el mando de siempre y el que dice cuál
está puesto. **No se pierde ningún filtro.**

Lo que sí se habría perdido es el tooltip de «Total», que llevaba la duración
total, el promedio y cuántas se contestaron. **Un dato que desaparece se dice**,
así que no desaparece: se lee posándose sobre el grupo de dirección. Un dato que
solo se mira de reojo no necesita una cifra en la barra.

### El banco: la tabla PINTADA, y el «antes» pinchado a un commit

`scripts/banco-tabla-de-llamadas.sh`. Las tres primeras preguntas son de
píxeles y no se contestan leyendo, así que se miden en Chromium sobre el CSS
del build y con el componente **real**: se monta `CallsCrmClient` entero y lo
único que se finge son sus acciones de servidor, con los **mismos datos en los
dos modos** — así la única diferencia medible es cómo se pinta la fila.

La cuarta vive en otro componente y **se lee del código**: montar
`CrmDashboard` arrastraría el kanban y las gráficas para contestar algo que es
una condición de una línea. Se dice en vez de disimularlo.

`MODO=roto` monta el `CallsCrmClient` de antes, sacado con `git show` y puesto
**junto a sus vecinos** para que sus `./` resuelvan sin tocarle una línea, y
**afirma los cuatro fallos**: la celda centrada, el número en un color que no
es el de Leads, dos tamaños de letra dentro de la misma tabla y las tres cifras
de las pastillas dentro de la barra.

> **Y el «antes» va PINCHADO a un commit, nunca a `origin/main`.** En cuanto un
> cambio se fusiona, `origin/main` pasa a ser el «ahora»: el modo roto deja de
> reproducir nada y **se pone verde sin ejercer el fallo**, que es la peor
> forma de tener un banco.
>
> No es hipotético — le había pasado al de al lado. `banco-llamar-con-ia.sh`
> sacaba su «antes» de `origin/main`, y desde que su propio cambio entró en
> main se caía con «el ancla `{/* Toolbar: buscador + rango de días */}`
> aparece 0 veces». Llevaba roto desde entonces. Los dos llevan ya su
> `ANTES_REF`, con el commit escrito y con la variable para poder apuntar a
> otro sitio.

### Y la segunda vuelta: las columnas de Leads, Acciones que no se corta, y el menú de Chats

1. **Las columnas son las de Leads**: Contacto, Nombre, Duración, Fecha,
   Detalle, Resultado y Acciones. «Tipo» decía siempre «Saliente» y «Estado»
   era un segundo mando del estado del lead, que se cambia en Leads, en el CRM
   y en Chats. Con la columna se fue **`setCallLeadStatusAction`**, que era su
   único llamador —una acción de servidor ES un endpoint—; el dato
   (`Session.leadStatus`) no se toca. Y **el nombre va en su propia columna**,
   no colgado bajo el número.
2. **Un solo tamaño, pastillas incluidas.** La primera vuelta dejó la pastilla
   de Resultado en `text-xs` con el argumento de que Leads hace lo mismo con las
   suyas; al pasar de una pestaña a otra se seguía notando. Ahora es `text-sm`
   como todo lo demás, y el banco mide **todos** los nodos con texto.
3. **Acciones se ve siempre** — ver abajo, *la tercera vuelta*, que cambió
   cómo se sostiene. Aquí se contó con `table-fixed`: Con `table-auto`
   el texto de Detalle —que va en una línea con `truncate`— tiene un ancho
   mínimo igual al texto ENTERO, así que empujaba la tabla y Acciones quedaba
   fuera: un `max-w` en un `<td>` no manda nada en una tabla automática. Las
   columnas fijas llevan su ancho en el `<colgroup>` (`ANCHO_DE_LAS_COLUMNAS`)
   y **Detalle y Resultado se reparten lo que sobra**: cuando falta sitio son
   ellas las que encogen, con «…». Y por si ni así cabe —un teléfono— Acciones
   va `sticky right-0`.
4. **La ventana de Llamar son DOS botones**: «Llamar IA» a la izquierda y
   «Llamar» a la derecha, en la misma fila (`flex-nowrap`: el pie de la casa
   lleva `flex-wrap` y en un teléfono los partiría). Sin «Cancelar», que la
   ventana ya se cierra con la X y tocando fuera.
5. **El menú de llamar de Chats dice «Llamar IA»** —el mismo nombre que en la
   ventana: una acción no se llama de dos formas— y **nace colgado de su icono
   y bajo la cabecera entera** (`colgadoDelIcono`, `lib/paneles-flotantes.ts`).
   Pegado al icono con el `sideOffset` de siempre caía sobre la segunda fila y
   tapaba Macros; y cuánto la tapaba dependía del ancho del badge del asesor y
   del botón de resolver, o sea de cada conversación. Por eso se MIDE y no se
   achica el menú.

Lo prueba `scripts/banco-llamadas-como-leads.sh`, en Chromium y con los
componentes de verdad, en dos modos: el roto monta el «antes» pinchado a un
commit —con sus vecinos del mismo commit en una carpeta hermana, para que sus
`./` no resuelvan al fichero de hoy— y afirma los cinco fallos.

### Y la tercera vuelta: la cabecera ES la de Leads, y el ancho se reparte como allí

«Los encabezados se ven distintos que en Leads» y «queda un hueco grande entre
Fecha y Detalle». Medido sobre las dos páginas SERVIDAS (build con `next start`,
sesión de verdad), y no sobre una maqueta, porque la mitad del fallo la decide
`.app-module-content`, que solo existe dentro del layout:

| | antes | ahora | Leads |
| --- | --- | --- | --- |
| encabezado | **16 px** / 500 | 14 px / 500 | 14 px / 500 |
| alineación de las celdas | Duración→Acciones **centradas** | todas a la izquierda | a la izquierda |
| tabla dentro de su tarjeta (1440) | **1332 / 1382** | 1380 / 1382 | 1380 / 1380 |
| hueco Fecha → Detalle (1440) | **150 px** | 18 px | — |

1. **La cabecera se pinta con los MISMOS componentes que Leads**: `TableHead`
   con las clases de `sessions/_components/data-table.tsx` y dentro el mismo
   `Button` fantasma de `Columns.tsx`. El `<th>` escrito a mano salía a 16 px
   porque dentro de `.app-module-content` un `.text-sm` suelto vale **1rem**
   (`globals.css`) y solo lo compacto (`app-typography-compact`, que lleva
   `TableHead`) o un botón lo bajan a 14. Con los mismos componentes no puede
   notarse al pasar de una pestaña a otra. El color y el grosor se midieron
   iguales (`rgb(100,116,139)`, 500) en los dos: la diferencia que se ve era el
   tamaño.
2. **`table-auto` y sin `<colgroup>`**, como Leads: cada columna mide su
   contenido (`whitespace-nowrap`) y **lo que sobra se lo lleva Detalle**
   (`w-full max-w-0`). Solo con `max-w-0` —probado— el sobrante se repartía
   también a Fecha y el hueco volvía (101 px). `max-w-0` sigue siendo lo que
   impide que el texto de Detalle empuje la tabla. El nombre va topado a `10rem`,
   porque en una tabla automática un nombre largo ensancharía su columna; y la
   celda de Resultado NO lleva `whitespace-nowrap`, para que su pastilla pueda
   encoger con «…».
3. **La tarjeta va sin relleno** (`CardContent p-0`), como la de Leads: la tabla
   llega a los dos bordes. Carga y lista vacía llevan su propio `p-10`.

Y lo que cuesta, que se dice: a **1024 con el menú lateral abierto** la tabla ya
no cabe entera —los encabezados de Leads no se recortan— y **se desplaza**, igual
que la de Leads. Acciones sigue a la vista porque va `sticky`, y eso es lo que
el banco de `llamadas-como-leads` exige ahora a esa anchura; a 1440 y 1280 sigue
exigiendo que no se desplace.

Lo prueba `scripts/banco-cabecera-de-llamadas.sh`, sobre las dos páginas
servidas y comparando **contra Leads medido en la misma sesión** (nada de
números escritos). `MODO=roto` necesita `BUILD_ANTES=<un .next del commit de
antes>`: lo **mueve** a `.next` —con un enlace simbólico el servidor no resuelve
`node_modules`— y afirma los cuatro fallos; el hueco solo sale con un Detalle
CORTO («Sin detalle»), así que se mide en todas las filas y no en la primera.

## Llamadas y Leads, simétricas: el texto se HEREDA, «Marcar resultado» siempre, y flechas en las dos

Quinta vuelta de alinear CRM › Llamadas con Leads, y la regla es una: **igual,
no parecido**. Se mide con las dos tablas de verdad pintadas lado a lado
(`scripts/banco-leads-y-llamadas-simetricas.sh`), no contra números escritos.

| | cómo va |
| --- | --- |
| encabezados | **centrados**, con el estilo de Leads (14 px, 500, gris). El primero dice **«WhatsApp»** |
| WhatsApp, Nombre, Fecha, Detalle, Resultado | a la **izquierda**; Duración **centrada**; el menú de Acciones **centrado** |
| nombre, fecha, detalle | **sin peso ni color propios**: heredan los de la tabla, como en Leads |
| Resultado sin marcar | el desplegable **«Marcar resultado»**, también en la llamada de una cuenta hija |
| flechas de ordenar | Llamadas: todas menos Acciones. Leads: añadidas a WhatsApp, Nombre y Etiquetas |

Cinco cosas que hay que mantener:

1. **Lo que en Leads «se lee en negrilla» no es negrilla**: es texto oscuro al
   lado de un gris. Esas celdas de Leads no llevan ninguna clase de peso ni de
   color; heredan de la `Card`. Por eso `TEXTO_DE_LA_FILA` está **vacío** a
   propósito: tanto `text-muted-foreground` como `font-medium text-foreground`
   —las dos versiones anteriores— eran «parecido». Lo que es un hueco («Poner
   nombre», «Sin detalle») sí va en gris y cursiva: no es un dato.
2. **Marcar resultado se ESCRIBE con el mismo alcance con el que se LEE.**
   `setCallDisposition` buscaba la fila solo bajo las ids de la identidad de
   quien mira, así que la madre veía la llamada de su hija consolidando y no
   podía marcarla: la pantalla pintaba un «—». Ahora acota con
   `lasCuentasQueConsultaElCrm` —lo propio y lo de abajo, nunca la madre ni una
   hermana— y lo prueba `crm-de-la-familia-db.test.mjs` contra Postgres.
3. **Etiquetas de Leads ordena por CANTIDAD** (lo eligió el dueño; no tiene
   gemela en Llamadas). WhatsApp ordena por el número que se ve y Nombre por el
   nombre que se ve, no por el crudo: ordenar por un valor y enseñar otro se lee
   como un orden roto. Acciones no ordena en ninguna de las dos.
4. **Las flechas nuevas de Leads son el MISMO botón que su «Sesión»** de
   siempre; el banco compara estilo, tamaño y el tamaño de la flecha contra la
   de Llamadas.
5. **El CSV no cambia**: su cabecera sigue diciendo «Contacto» porque es lógica
   de datos, no la tabla.

El banco de navegador empaqueta la tabla de Leads con **todas sus acciones de
servidor mudas** (`scripts/empaquetar-con-acciones-mudas.mjs`): cada import de
`@/actions/*` se resuelve a un módulo que exporta los nombres que pide quien
importa. Un módulo **por importador**: esbuild guarda cada módulo por su ruta,
y con una sola el segundo recibiría los nombres del primero. `MODO=roto` pinta
las dos tablas de `ANTES_REF` y afirma los cuatro fallos.

## CRM › Llamadas: cinco arreglos en la misma pantalla

Detalle, el diálogo, el reproductor, el timbre y el resultado. Cinco fallos
reportados juntos; lo que los une es que la pantalla enseñaba cosas que **no
eran de la llamada** o que **no estaban al día**.

### 1. Detalle es la primera línea del RESUMEN de la llamada

Nada de síntesis del lead: esa es del chat. Sin resumen, «Sin detalle». Lo
decide `elDetalleDeLaLlamada` (puro), que también ordena la columna.

### 2. El diálogo trae la llamada FRESCA, y ya no tiene la síntesis

La fila de la tabla es la foto de cuando se cargó la lista, y la transcripción
llega minutos después: el diálogo abría «sin resumen y sin transcripción» con
las dos ya en la base. Ahora pide la fila al abrir (`getCallDetailAction`,
acotada por el mismo alcance del CRM), y mientras haya grabación sin
transcripción vuelve a preguntar cada 8 s con tope de 15 vueltas. Lo fresco
sube a la tabla (`onDetalle`), así la fila también se pone al día.

La síntesis del lead y su campo para escribirla **se fueron del diálogo**: eso
se edita en el chat (*la síntesis se edita en el Contexto del lead*).

### 3. El reproductor enseña la duración desde que abre

`<audio controls>` marca «0:00 / 0:00» hasta que el navegador baja los
metadatos —con un webm, hasta pulsar play—. El reproductor es propio y su
total es `laDuracionDelReproductor(durationSecs, audio.duration)`: **manda la
columna Duración**, y la del navegador solo cuenta si la fila no la trae (un
`Infinity` o un `NaN` de webm no cuentan nunca).

### 4. Duración y grabación empiezan cuando CONTESTAN (AstraCalls)

El grabador arrancaba al marcar, así que el timbre entraba en el audio y en la
duración. `MarkAnswered()` —al pasar a `StatusConnected`— reinicia el reloj y
vacía lo grabado hasta ahí: el WAV y los segundos cuentan desde la respuesta.
Lo prueba `grabacion_al_contestar_test.go` en astracalls.

### 5. Cinco resultados, y la IA propone pero la persona manda

Interesado, **Link enviado** (antes «Agendó»), Volver a llamar, No contesta y
No interesado. «Buzón de voz» y «Número equivocado» se fueron; las filas viejas
se leen con `comoResultadoVigente` (agendo → Link enviado, buzón → No contesta,
número equivocado → sin marcar). **Ni migración ni backfill**.

Al procesar la grabación, `clasificar` le pide al modelo uno de los cinco
(`INSTRUCCIONES_DE_CLASIFICACION`) y `leerElResultadoDeLaIa` lo interpreta
—«no interesado» se mira antes que «interesado», y «link enviado» gana sobre
«interesado»—. Sin transcripción no se pregunta: es No contesta.

Tres cosas que hay que mantener:

1. **La propuesta se guarda siempre en `dispositionIa`**, y en `disposition`
   solo si no hay nada puesto o lo puso la IA (`laIaPuedeEscribir`, la MISMA
   condición del `UPDATE` de `proponerElResultado`). Un resultado viejo sin
   `dispositionSource` cuenta como manual.
2. **Cambiarlo a mano escribe `dispositionSource: 'manual'`** y la IA ya no lo
   pisa. La pastilla lleva el destello cuando lo propuso la IA; sin nada,
   «Marcar resultado».
3. **El fin de llamada solo propone No contesta con `isBot === true` y
   `answered === false`**: una manual sin ese dato no se toca.

Lo prueba `scripts/banco-cinco-de-llamadas.sh`, en dos modos: en Chromium la
columna con y sin resumen, el diálogo con y sin resumen/transcripción, la
carga fresca, la duración sin pulsar play y la pastilla IA con la corrección
manual encima; y sin navegador la clasificación y la regla de quién manda.
`MODO=roto` pinta la pantalla de `ANTES_REF` y afirma los fallos.

## Llamadas: la cuenta es «● Ventas» junto al nombre, no una columna

Consolidando, CRM › Llamadas abría con una columna «Cuenta» —la primera— con el
nombre largo en una pastilla («Verzay | Ventas»). Ocupaba la columna que se lee
primero para decir algo que se mira de reojo. Se fue: las columnas son
Contacto, Nombre, Duración, Fecha, Detalle, Resultado y Acciones, y la cuenta
va **pegada a la derecha del nombre**, como puntico de color y palabra corta.

> **Es la marca de Chats, no una parecida.** Vivía escrita dentro de
> `ChatContactItem` (`instanceColor`, `shortInstanceLabel`); se sacó a
> `lib/insignia-de-linea.ts` (puro) y `components/shared/InsigniaDeLinea.tsx`,
> y las dos pantallas la importan. Con una copia en cada una, el día que se
> afine la paleta la misma cuenta saldría de un color en Chats y de otro en
> Llamadas.

Tres cosas que hay que mantener:

1. **La llave del color es el nombre CRUDO de la línea** (`instanceName`), que
   es con lo que Chats pinta; sin línea, el nombre de la cuenta. El hash no se
   toca: cambiarlo recolorea todas las líneas de golpe.
2. **Solo cambió la presentación.** Sale en las mismas filas que salía la
   columna (consolidando, `unificado`), el filtro por cuenta sigue en la barra
   y en el servidor, y la columna nunca fue ordenable.
3. **Es la excepción a «un solo tamaño en la tabla»**, a propósito: es la marca
   de Chats (9 px), no texto de la tabla. El encargo fue que se viera igual que
   allí.

Lo prueba `scripts/banco-cuenta-en-llamadas.sh`: el color y la palabra contra
las funciones que Chats llevaba dentro —leídas de git—, un barrido de que las
dos pantallas usan la pieza compartida, y la tabla pintada en Chromium
consolidando a 1440/1280/1024. `MODO=roto` pinta la de `ANTES_REF` y afirma la
columna «Cuenta» y la falta del puntico.

## Una llamada es de la cuenta DUEÑA de la conversación, no de quien mira

Estando la madre en una conversación de Verzay Ventas y pulsando «Llamar con
IA», la llamada salía con **el número de la madre**, cobraba a **la madre** y
aparecía en **el chat de la madre**. Sin un solo error.

La causa: AstraCalls identifica la cuenta por la **sesión de llamadas** (`sid`,
`User.astraCallsSid`) — de ahí salen la línea de WhatsApp por la que sale, el
asistente, su configuración y los créditos que se descuentan. Y cada camino
elegía el `sid` a su manera:

| camino | con qué cuenta decidía |
| --- | --- |
| llamada con IA (`startBotCallAction`) | **siempre la de quien mira**, ignorando la línea |
| llamada manual (`startAstraCall`) | la dueña de la línea… y si no tenía número, **en silencio la de quien mira** |
| procesar la grabación desde la tarjeta | buscaba la fila con la cuenta de quien mira: **no la encontraba** |
| la transcripción | cobraba a **la raíz de la familia** |

> **Quién es la cuenta de una llamada lo contesta `laCuentaDeLaLlamada`
> (`lib/cuenta-de-la-llamada.server.ts`), y la preguntan los tres caminos**:
> llamar con IA, llamar a mano y anotar la burbuja. Con la línea de la
> conversación, es su dueña —pasada por `assertCanAccessTargetUser`, que deja a
> la madre llegar a sus hijas y nunca al revés—. Sin línea (el marcador de
> CRM › Llamadas), la de quien mira.

Cuatro cosas que hay que mantener:

1. **Si la cuenta dueña de la línea no tiene número, NO se llama: se dice**
   (`SIN_NUMERO_EN_LA_LINEA`). Caer en el número de quien mira es exactamente
   el fallo: la llamada sale de otro WhatsApp y cobra a otra cuenta.
2. **Grabar y transcribir buscan la fila por el dueño de la FILA**
   (`laCuentaDeLaFilaDeLlamada`), no por `effectiveId`. La fila está escrita
   bajo la cuenta de la conversación; con la de quien mira, `(id, userId)` no
   la encuentra.
3. **La transcripción la paga la cuenta de la fila**, no la raíz de la familia.
4. **La fila del CRM lleva su `instanceName`** (`CallRow`), y volver a llamar
   desde una fila sale por esa línea. Sin eso, relanzar desde el CRM unificado
   de la madre volvía a salir por la madre.

Lo prueba `scripts/banco-cuenta-de-la-llamada.sh`, contra Postgres y con las
acciones de verdad: la madre llama desde Ventas y la llamada sale con el `sid`
de Ventas, se registra y se cobra en Ventas, y aparece en el CRM de Ventas;
desde Pruebas —sin número— no se llama; y una hija no llama desde la línea de
su madre. Corre dos veces, y la segunda empaqueta el mismo fichero contra un
commit pinchado (`ANTES_REF`) y **afirma** los fallos.

### Y el marcador de CRM › Llamadas elige la cuenta con un «Vía:»

El diálogo de Llamar solo pedía el número, así que desde el marcador la llamada
salía **siempre** por la cuenta de quien mira. Ahora lleva el mismo «Vía:» que
«Nuevo mensaje» de Chats (`components/shared/SelectorDeVia.tsx`, que usan los
dos) con las cuentas que esa persona alcanza, y la suya preseleccionada. Vale
para Llamar y para Llamar IA.

> **No hay un camino de llamada nuevo.** Elegir una cuenta es pasarle **su línea
> por QR** a las dos llamadas de siempre, y de ahí `laCuentaDeLaLlamada` saca
> número, créditos y registro, con su `assertCanAccessTargetUser` delante. Lo
> decide `lib/cuentas-para-llamar.ts` (puro) y lo alimenta
> `cuentasParaLlamarAction`.

Cuatro cosas que hay que mantener:

1. **El alcance es el del filtro del CRM** (`resolverLasCuentasDelCrm`): la
   propia y lo de abajo; un `agente`, solo la suya. La lista solo decide qué se
   OFRECE; la puerta sigue en el servidor, que rechaza una línea de arriba o de
   una hermana aunque llegue a mano.
2. **La propia va SIN línea**, que es lo que el marcador hacía antes: elegirla no
   cambia nada, ni para una cuenta con número y sin línea por QR.
3. **Lo que no puede llamar se enseña apagado y dice por qué**: sin número de
   llamadas, o —una de abajo— sin línea por QR, que es por donde se enruta.
4. **Al reabrir vuelve la propia.** Una elección de la vez anterior que se queda
   puesta sin que nadie la vea es una llamada por otra cuenta sin querer.

Lo prueba `scripts/banco-llamar-por-cuenta.sh`: contra Postgres, con las
acciones de verdad, qué ve la madre, una hija y un agente y que Llamar y Llamar
IA por la elegida salen con su número, se registran en ella y le cobran a ella;
y en Chromium, el diálogo real. `MODO=roto` monta el diálogo de `ANTES_REF` y
afirma el fallo: sin «Vía:» y llamando sin cuenta.

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

## Chats: la línea de estado va DENTRO de los 32 px de la fila del nombre

Al apretar la cabecera de 110 a 78 px, «escribiendo…», «grabando audio…», «en
línea», «últ. vez» —y el anuncio, que va en el mismo sitio— **dejaron de verse
sin desaparecer del código**. El bloque del nombre bajó de 36 a 32 px y dentro
de `.app-module-content` un `.text-sm` vale 16/24 y un `.text-xs` 14/20; el
lápiz de editar (28 px) fijaba la fila del nombre, y la línea (un `truncate`,
o sea `min-height: 0` en una columna flex) se aplastaba a **4 px**. No había
error: solo una línea que no se veía. En la lista sí salía, y por eso parecía
que el dato no llegaba a la cabecera.

> **Nombre 18 + estado 14 = los 32 de la fila** (`ALTO_LINEA_DEL_NOMBRE`,
> `ALTO_LINEA_DEL_ESTADO`, en `lib/cabeceras-de-chats.ts`). El nombre conserva
> su letra y solo aprieta el interlineado (`!leading-*`, porque la regla del
> módulo pisa un `leading-*` suelto); la línea va a 11/14 con tamaño propio,
> **nunca `text-xs`**. El lápiz sigue en 28×28 pero con margen vertical
> negativo, para no fijar el alto; por eso el bloque y la fila recortan solo en
> horizontal (`overflow-x-clip`): con `overflow-hidden` se le cortaría el fondo.

La cabecera sigue en 78 px, 6 de margen e iconos de 28. Lo prueba
`scripts/banco-estado-en-la-cabecera.sh` con la `ChatHeader` real en Chromium
sobre el CSS del build, en los seis casos y a 1440/1280/1024; `MODO=roto` la
pinta desde `ANTES_REF` y afirma la línea aplastada.
