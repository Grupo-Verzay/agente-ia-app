# Llamadas de voz, llamadas con IA y CRM › Llamadas

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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
3. **La transcripción la paga la MISMA cuenta que pagó la llamada**, no la raíz
   de la familia: la dueña del `astraSid` con el desempate del backend (ver
   *La llamada y su transcripción: UNA cuenta, la del sid*). En el caso normal
   es la cuenta de la fila.
4. **La fila del CRM lleva su `instanceName`** (`CallRow`), y volver a llamar
   desde una fila sale por esa línea. Sin eso, relanzar desde el CRM unificado
   de la madre volvía a salir por la madre.

Lo prueba `scripts/banco-cuenta-de-la-llamada.sh`, contra Postgres y con las
acciones de verdad: la madre llama desde Ventas y la llamada sale con el `sid`
de Ventas, se registra y se cobra en Ventas, y aparece en el CRM de Ventas;
desde Pruebas —sin número— no se llama; y una hija no llama desde la línea de
su madre. Corre dos veces, y la segunda empaqueta el mismo fichero contra un
commit pinchado (`ANTES_REF`) y **afirma** los fallos.

### La llamada y su transcripción: UNA cuenta, la del sid

«No hay créditos suficientes: hacen falta 14 y quedan 0» sobre una cuenta que
sí tenía créditos. El backend (`api-webhook`, `VoicebotService`) cobra la
llamada a la cuenta dueña del **sid** de la sesión de llamadas, y
`User.astra_calls_sid` **no es única**: con dos cuentas compartiendo sid elige
la de `id` menor (`ORDER BY "id" ASC LIMIT 1`, api-webhook#182, en sus cuatro
consultas). La App leía el saldo —y cobraba— la cuenta de la FILA. Con un sid
compartido, la llamada salía de una bolsa y la transcripción miraba otra.

> **La transcripción se cobra, su saldo se lee y su clave de IA sale de la
> MISMA cuenta que cobró la llamada**: `laCuentaQuePagaLaLlamada`
> (`lib/cuenta-que-paga-la-llamada.server.ts`), con la misma consulta y el
> mismo desempate que el backend; la regla pura en
> `lib/cuenta-que-paga-la-llamada.ts`. **Si se cambia el criterio, se cambia
> en los dos repositorios**: es una sola pregunta.

Tres cosas que hay que mantener:

1. **El sid sale de la FILA**, nunca del navegador: lo escribió este servidor
   al lanzar la llamada.
2. **Sin sid (Meta) o con un sid que ya no es de nadie, paga la fila.** Y
   cuando paga otra cuenta que la de la fila, se dice en la consola: es la
   señal de un sid compartido.
3. **La columna sigue sin índice único**, y no se le pone desde aquí: `User`
   es del backend y con duplicados la migración fallaría.

Lo prueba `scripts/banco-quien-paga-la-llamada.sh`, contra Postgres: dos
cuentas con el mismo sid, la de la fila a cero; la transcripción se cobra en
la que devuelve la consulta del backend (escrita literal), con su clave, y
nada en la de la fila. `MODO=roto` lee el saldo como antes y afirma «cuesta 14
y quedan 0» sobre una llamada que el backend cobró a otra cuenta.

Y los bancos de llamadas usan su propio doble de OpenAI
(`fingido/openai-de-las-llamadas.ts`): compartían `openai-de-mentira.ts` con el
del cobro de IA, que el #993 reescribió sin `audio.transcriptions`.

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

## La llamada con IA: el enlace no se manda dos veces, y no se llama dos veces

«Después de una llamada con IA, "Llamada realizada" y el mensaje con el enlace
de la reunión salen duplicados.» Eran dos fallos distintos con la misma cara:

| lo que se veía | la causa |
| --- | --- |
| el enlace de la reunión llegaba 2-3 veces | el backend contestaba **201** a `POST /voicebot/tool` (lo normal de un `@Post` en NestJS) y wacalls solo da por buena una herramienta con **200 exacto**: el asistente oía «No pude completarlo», volvía a llamar a `enviar_whatsapp` y el enlace salía otra vez. Arreglado en `api-webhook` con `@HttpCode(200)` en las cuatro rutas (`banco-voicebot-contesta-200.sh`) |
| dos «Llamada realizada» | eran **dos llamadas de verdad** al mismo número, la segunda lanzada 29 s después, con la primera todavía en curso |

> **Una llamada con IA a la vez por número** (`startBotCallAction`). Antes de
> pedirla se cruzan las llamadas que ya le hicimos a ese número por esa sesión
> (las filas `callout_<ts>_<digitos>` con su `astraCallId`, últimos 30 min)
> con las que el servidor de llamadas tiene VIVAS (`GET /calls`). Si alguna
> sigue, no se llama: «Ya hay una llamada en curso con este número».

Cuatro cosas que hay que mantener:

1. **El cruce es por el `callId`**: la lista del servidor de llamadas no dice a
   qué número va cada llamada. Una colgada (`stale`) no cuenta.
2. **Un candado en memoria tapa el doble clic** (`lanzandose`): entre pedir la
   llamada y escribir su fila la consulta todavía no la ve.
3. **Si no se puede saber, se deja llamar, y se dice**: bloquear una llamada
   legítima porque el servidor no contestó es peor que el duplicado.
4. **La regla es `lib/llamada-en-curso.ts` (pura)**; la consulta y la red,
   `lib/llamada-en-curso.server.ts`.

Lo prueba `scripts/banco-llamada-en-curso.sh`, contra Postgres con la acción de
verdad y el servidor de llamadas fingido (con la primera viva, el doble clic,
la llamada terminada, el servidor caído y otro número). `MODO=roto` empaqueta
la acción de `675dcee` y afirma dos llamadas y dos filas.

## El cupo de llamadas: un sitio que solo se libera cuando todo sale bien no es un cupo

«Límite de llamadas simultáneas alcanzado» al llamar desde un chat, **sin
ninguna llamada en curso**, y sin forma de arreglarlo desde la App.

El aviso no lo escribe esta plataforma: es un `429` de **AstraCalls**
(`actions/astracalls-actions.ts`). Su cupo —`-max-calls-per-session` /
`WACALLS_MAX_CALLS`, 8 por línea— se cuenta sobre `sess.reg`, que es un mapa
**en memoria**. Una llamada entra al empezar y solo salía cuando alguien le
ponía el final: el navegador con su `DELETE`, o WhatsApp con su `terminate`.

> **Y ninguno de los dos es de fiar.** Cuando ese aviso no llegaba, el sitio no
> se liberaba **nunca** —no había ni plazo de timbre, ni duración máxima, ni
> barrido— así que la única forma de vaciar el contador era reiniciar el
> proceso. Ocho finales malos seguidos y la línea se queda sin poder llamar,
> con el cupo entero ocupado por llamadas que no existen.

Y desde fuera eso no se parece a un fallo: se parece a una línea agotada. La
tarjeta ofrece «Volver a llamar» justo debajo del aviso, así que se reintenta,
y el reintento contesta lo mismo.

### Los nueve caminos, y los cinco que se habían olvidado

En el navegador `CallDialog` tenía **una sola** puerta que avisara al servidor
—`hangup`— y todo lo demás se iba por `cleanup()`, que suelta el micrófono y
la conexión de ESTE navegador y no le dice nada a nadie:

| camino | qué dejaba |
| --- | --- |
| el audio que no conecta (`astraCallWebrtc` falla) | un sitio ocupado **y el teléfono del cliente sonando** |
| micrófono denegado, y los dos `catch` | igual |
| **cerrar la tarjeta mientras la llamada salía** | el peor: `hangup` no encontraba nada que colgar porque `callRef` se apuntaba en la línea **siguiente** al guardián de cancelación |
| desmontar —recargar con F5, navegar fuera— | `cleanup()` a secas |

**La regla: toda salida va por `hangup()`, que es la única puerta.** Que sea
una no es estilo: son dos mitades —soltar el sitio y soltar el micro— y
repartidas por nueve caminos olvidarse de una no se nota desde dentro. Y **la
llamada se apunta ANTES del guardián de cancelación**: desde que el servidor la
crea hay un sitio que liberar pase lo que pase.

### Pero el navegador siempre se puede morir: el plazo vive en el SERVIDOR

Es la mitad que de verdad cierra esto, y es la misma forma que *la red tiene
que salir de la BASE, no de la memoria de nadie*: no se puede depender de que
un aviso salga de una pestaña que puede desaparecer —y **una llamada del bot no
tiene pestaña detrás en absoluto**—.

> **Toda llamada nace con un plazo. Si nadie la termina, la termina el reloj.**
> Un barrido cada 30 s en astracalls (`cmd/server/barrido-de-llamadas.go`)
> suelta lo que pasó de su plazo: **2 min sin contestar**
> (`WACALLS_RING_TIMEOUT_SECS`) y **4 h hablando** (`WACALLS_MAX_CALL_SECS`).

Son dos plazos y no uno porque una llamada sonando cinco minutos no existe y
una conversación de cinco minutos es lo más normal del mundo. Y son red de
seguridad, no política: se eligen tan largos que ninguna llamada de verdad los
alcanza, porque cortar una conversación en curso es mucho peor que tener un
sitio ocupado un rato de más.

**Y por encima de los dos manda el AUDIO.** Mientras entren tramas del otro
lado la llamada no se toca, por vieja que sea. Es la misma regla que ya rige el
fin de una llamada de WhatsApp —*el detector principal es el audio, no el
proveedor*— y aquí es lo que impide la regresión que este barrido podría
causar: cualquier camino en el que una conversación viva no llegara a marcarse
como «contestada» se cortaría a los dos minutos. Un minuto entero sin una sola
trama no es «no está hablando»: con DTX son cientos de paquetes que no
llegaron.

Cuatro cosas más que hay que mantener:

1. **Un plazo que no se entiende cae en el de por defecto, NUNCA en «sin
   plazo».** Equivocarse hacia un plazo de más cuesta un sitio ocupado unas
   horas; equivocarse hacia el infinito es volver al fallo, y callado.
2. **La llamada se sella al ENTRAR al registro**, no donde se cree: es la línea
   que ocupa el sitio, así que no puede haber forma de entrar sin fecha. Sin
   sello el barrido no la juzga y se queda para siempre.
3. **`soltarLlamada` va aparte de `terminateCall`, y hace falta.** Aquel **no
   libera una llamada atascada**, que es justo lo que hay que liberar:
   `EndCall` se rinde en su primera línea cuando ya no hay un `currentCall`
   vivo —`if call == nil || call.IsEnded() { return nil }`— así que no sale
   ningún `OnEnded` y nadie la quita del registro. Y esos son exactamente los
   dos estados en los que se queda una colgada. Se avisa a WhatsApp si se
   puede y después se quita **sin preguntar**, que es el orden que `doEndCall`
   lleva usando desde siempre sin dejar un sitio ocupado.
4. **El sello de «contestada» se pone una sola vez, y sin condiciones
   delante.** Iba a colgar del grabador, que solo existe con `RECORDINGS_DIR`
   puesto: una instalación sin grabación no habría marcado nunca «contestada»
   y el barrido le habría aplicado el plazo de timbre a una conversación en
   curso.

### Los tres huecos concretos, que son por donde más se llegaba

No son el plazo: son sitios donde ya se sabía que la llamada había muerto y se
volvía sin decirlo.

| | qué pasaba |
| --- | --- |
| `HandleCallAck` con `error` | WhatsApp rechaza el offer —el número no recibe llamadas, está bloqueado, hay límite—. Es un NO definitivo, así que **no hay ningún `terminate` que esperar**. Se escribía el error y la llamada se quedaba sonando en el registro para siempre. Basta con llamar a un número que no se puede llamar |
| el offer que no llega a salir | la consulta se rinde a los 15 s, se escribía y se volvía. Igual |
| `LoggedOut` | desvinculada la sesión sus llamadas no pueden seguir vivas, y se quedaban ocupando el cupo hasta reiniciar |

### Y ahora se puede MIRAR

`GET /api/sessions/{sid}/calls` devuelve además la lista, con la edad de cada
llamada, si se contestó, si hubo audio, si es del bot y si está colgada
(`stale`, con su motivo). Sin eso el aviso es un número sin nada detrás: no hay
forma de saber si son llamadas de verdad o sitios que se quedaron ocupados, ni
de soltar una por su id. **Un número distinto de cero en `stale` es la señal de
que algún final no está llegando**, que es la misma idea que *una línea muerta
no tiene filas*: el cero es el dato.

### Lo que NO se tocó, y se dice

**`duration_ms` sigue sin usarse.** La App lo manda con 300.000 creyendo que es
un tope de cinco minutos y el servidor lo decodifica y lo ignora desde siempre.
Honrarlo de golpe cortaría a los cinco minutos toda llamada que hoy dura más,
así que queda escrito en vez de cambiarse por sorpresa.

### Los bancos, uno por mitad

- `scripts/banco-cupo-de-llamadas.sh` (astracalls) — el barrido devuelve el
  sitio y se puede volver a llamar, y **no corta lo que está vivo**: ni una
  conversación de hora y media, ni una que acaba de empezar a sonar, ni una con
  audio entrando que nunca se marcó. `MODO=roto` corre el barrido por el camino
  viejo y **afirma el fallo**: las ocho colgadas siguen ahí.
- `scripts/banco-cupo-de-llamadas.sh` (esta App) — que fuera de `hangup` no se
  nombren ni `cleanup` ni `soltarElSitio`. `MODO=roto` lee la misma tarjeta de
  un commit **pinchado** y afirma los once caminos que abandonaban.

Y una del propio banco, que costó una vuelta y vale para cualquiera de esta
familia: **el primer barrido miraba si había un `soltarElSitio()` CERCA, y
pasaba al quitarle el arreglo a un camino** — encontraba el del bloque de al
lado. Un modo roto que pasa no está en verde, está muerto. Lo que se comprueba
es una invariante **exacta** y no una vecindad, y se comprobó quitando el
arreglo de cada uno de los cuatro caminos, uno por uno, para ver el rojo.
