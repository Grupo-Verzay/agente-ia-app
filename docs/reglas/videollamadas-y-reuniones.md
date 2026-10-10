# Videollamadas, salas y Reuniones

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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

## Reuniones: moderar donde se mira, y que la puerta SUENE

Tres controles del anfitrión, reportados juntos como que faltaban. El
diagnóstico no fue el que parecía, y conviene tenerlo delante:

| | servidor | interfaz |
| --- | --- | --- |
| sacar a quien ya entró | **estaba entero** (`sacarDeLaSalaAction`, con su puerta) | solo en el panel lateral › pestaña «Gente» |
| pedirle silencio | **estaba entero** (`silenciarAAction`) | igual |
| avisar de quien llama a la puerta | — | **no existía**: una franja ámbar y nada más |

O sea que dos de los tres **ya funcionaban** y no se encontraban. El panel
**nace plegado** y su pestaña por defecto es «chat», así que para sacar a quien
sobró de la reunión anterior hacían falta tres pasos que nadie descubre: abrir
el panel, cambiar de pestaña y pulsar un icono de 24 px sin rótulo. Es el «menú
cerrado por dentro» que ya costó una vuelta en Embudos — el contrario del «menú
abierto, puerta cerrada», y se lee igual de mal: *no se puede*.

> **Un mando SOBRE una persona se ofrece donde esa persona está.** Los dos van
> ahora en un «⋯» sobre su recuadro, además de en la lista de gente. **La
> acción es la misma, el camino es el mismo y la decisión es la misma**: no se
> escribió un segundo camino de moderación.

### La decisión es UNA, y tiene que decir lo que dice el servidor

`losMandosDeModeracion` (`lib/moderar-en-la-sala.ts`, puro) contesta qué se
ofrece, y lo preguntan **los dos** sitios. Con la condición escrita en cada uno
—`moderas && !soyYo && micEncendido`, que es como estaba— el día que se afine
una el otro ofrece otra cosa, y eso no se ve como un error: se ve como que
«desde el recuadro a veces no deja».

Y ofrece **exactamente** las tres cosas que el servidor rechaza, ni una más:
no moderar, hacérselo a uno mismo, y hacérselo a quien ya no está dentro.
Ofreciendo de más sale un botón que da error; de menos, una puerta abierta sin
menú. El banco lo encadena **leyendo los mensajes del propio servidor**: copiar
las tres condiciones a mano dejaría el banco en verde el día que aparezca una
cuarta.

El camino también es uno (`useModerarEnLaSala`): con el `try`/`catch`, el «no
se pudo» y el aviso de que la orden salió escritos en cada sitio, al segundo se
le olvida uno de los tres.

### Dónde va el menú es una MEDIDA, no una preferencia

Esto costó dos intentos y es lo que no se ve leyendo. La reunión tiene **dos
barras flotando `absolute z-20` encima de los recuadros** —la cabecera arriba y
los mandos abajo, 352 px centrados—, así que un botón puede estar perfectamente
pintado y **debajo de otra cosa**:

| dónde se probó | qué lo tapaba |
| --- | --- |
| al final del pie | la barra de mandos, en los recuadros de la fila de abajo |
| arriba a la derecha, `z-10` | los mandos de la cabecera, en el recuadro de esa esquina |
| **arriba a la derecha, `z-30`** | **nada, en las 24 combinaciones** |

Las dos primeras las cazó el banco con `elementFromPoint`, que es lo único que
sabe qué hay de verdad en un punto: `getBoundingClientRect` decía que el botón
estaba donde tenía que estar, y estaba debajo.

> **Lo que lo resuelve es el `z-30`**: ni el recuadro (`relative` sin `z`) ni la
> rejilla crean contexto de apilamiento, así que el botón compite DIRECTAMENTE
> con las barras y les gana. Bajarlo a `z-10` —que es lo que se escribe solo—
> lo devuelve debajo de las dos.

Y va **también en la tira de miniaturas**, no solo en el recuadro grande: en la
vista de orador —la de por defecto— casi todo el mundo está en la tira, así que
un menú solo en el grande obligaría a esperar a que esa persona hablara para
poder moderarla.

### El aviso de la puerta: suena, se repite, y PARA al pulsar

La sala de espera era solo visual, y esa franja no la ve nadie con la reunión
plegada, con la pestaña de fondo o mirando a quien habla. Es *un aviso que
espera es un aviso que no llega*, otra vez.

**Ni un sondeo nuevo**: la lista de quién espera ya llega en la vuelta del
reloj de la sala. Lo único propio es un latido de un segundo que pregunta
«¿toca?», y **solo existe mientras hay alguien en la puerta sin atender** — el
99 % de una reunión no hay nadie y no corre nada. El ritmo de verdad lo pone la
decisión pura (`CADA_CUANTO_SUENA_LA_PUERTA_MS`, 6 s); con un `setInterval` del
intervalo entero, cada persona que llegara reiniciaría el reloj.

Cinco cosas que hay que mantener:

1. **PARA al pulsar, no en la vuelta siguiente.** Al decidir sobre alguien su
   id deja de contar al instante (`losQueEsperanSinAtender`), y **si el
   servidor dice que no —la sala está llena— vuelve a contar**: esa persona
   sigue esperando. Es la misma regla que quitar la fila de un chat antes de
   preguntar y devolverla si falla. Sin esto, entre el clic y la vuelta del
   reloj el aviso suena otra vez, y eso se lee como que el botón no hizo nada.
2. **A quien no puede abrir la puerta no le suena.** Sonaría por algo que no
   puede atender. Sale casi gratis: el servidor ya le manda la lista vacía.
3. **Se puede callar, y solo mientras dure esta reunión.** Un sonido que se
   repite y no se puede parar es lo que hace que se silencie la pestaña entera
   —y entonces se pierden también los avisos que sí importan—. En memoria y no
   en `localStorage`: callarlo para siempre sería volver al fallo del que
   viene, y nadie se acordaría de haberlo hecho. El botón va en la propia
   franja, que es donde se mira cuando suena.
4. **No hay tope de repeticiones**, a propósito: pararlo solo sería volver a
   que nadie se entere. Lo que hay en su lugar es esa decisión de quien modera.
5. **Y la pastilla lo dice.** Plegada, la pastilla es lo único que se ve de la
   reunión, y un sonido sin nada que mirar es peor que ninguno: lleva su número
   en ámbar, como ya llevaba el punto de grabación y el de reconexión. Va
   **dentro del asa** y no como botón — el asa se queda el puntero al agarrarla
   y el clic de un botón de dentro no llegaría a salir.

#### El tono: el único que BAJA, y el más bajo de los tres

| | de → a | dura | volumen |
| --- | --- | --- | --- |
| clientes (`useAdvisorNotifications`) | 880 → 1100 | 450 ms | 0.25 |
| equipo (`TONO_DEL_EQUIPO`) | 1320 → 1760 | 180 ms | 0.14 |
| **la puerta** | **660 → 495** | **120 ms ×2** | **0.10** |

Tres decisiones, cada una por algo distinto: **baja** en vez de subir, que es
lo único que de verdad distingue un aviso de otro estando distraído; **dos
golpes**, como se llama a una puerta, porque uno solo se oye como un error del
navegador; y **el más bajo de los tres**, porque es el único que se repite — al
volumen del de clientes, a la tercera vuelta habría que silenciarlo. El banco
compara los tres, para que nadie lo suba sin darse cuenta.

**Un solo `AudioContext`, perezoso y para siempre.** Cada uno es un hilo de
audio del sistema: abriendo uno por pitido se acumulan hasta que el navegador
deja de dar más, y entonces **deja de sonar todo**, la llamada de WhatsApp
incluida. Es lo que ya hace el sonido del chat del equipo.

### El banco, y lo que de verdad prueba

`scripts/banco-controles-de-la-reunion.sh`, dos mitades, porque el cambio vive
en dos capas: la decisión y un barrido sin navegador (27 casos), y **los
componentes reales en Chromium** (17), donde se contestan las dos preguntas que
no se contestan leyendo: si el menú **se alcanza** y si el sonido **suena, se
repite y para**. El intervalo se lee **del módulo**, no se escribe en el banco:
copiado, probaría que coincide consigo mismo y no con el que corre.

`MODO=roto` corre el «antes» **pinchado a un commit** —nunca `origin/main`, que
el día de la fusión pasa a ser el «después» y el modo roto se pone verde sin
ejercer nada— y afirma el fallo: ni decisión compartida, ni un mando sobre el
recuadro, ni un solo `createOscillator` en todo el módulo de video.

Y una del propio banco que conviene no repetir: **17 pruebas saltadas se leen
como 17 verdes.** Pasó mientras se escribía esto —el CSS del build se estaba
regenerando— y el banco decía «0 fallos». Ahora **se cae con estruendo si no
ejerce ni una**: un banco que no arranca se parece muchísimo a un banco que
pasa.

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

## Agenda: la videollamada con IA (Tavus) es un MODO al lado del enlace fijo

Agenda › Ajustes › Configuración de Reunión ofrece dos modos y cada cuenta
elige: **Enlace de reunión virtual fijo** (el de siempre, `User.meetingUrl`,
sin tocar) y **Videollamada con IA de Verzay**, que manda al cliente
`<plataforma>/videollamada/<id de la cita>`. Las reglas son puras en
`lib/videollamada-ia.ts`; las tablas (`videollamada_ajustes`,
`videollamadas_ia`, de la App y sin clave foránea) en `lib/videollamada-ia-db.ts`.

Cinco cosas que hay que mantener:

1. **El avatar de la plataforma es Verzy** (`NOMBRE_DEL_AVATAR`): su clave y
   su persona_id salen del ENTORNO (`TAVUS_API_KEY`, `TAVUS_PERSONA_ID`, en el
   stack de Portainer; `elAvatarDelEntorno`), nunca del navegador. **Una cuenta
   puede tener el SUYO** (`propioPersonaId` + `propioClaveSellada`, sellada con
   `sellar`; se pone con `guardarElAvatarPropio`, solo servidor, sin pantalla
   todavía). Quién decide es `elAvatarDeLaCuenta` (`elAvatarQueUsa`, pura): el
   propio si está completo, si no el de la casa; lo usan abrir la sesión y la
   disponibilidad. Sin ninguno el modo Tavus no se guarda y dice «no
   disponible»; las columnas viejas `personaId`/`claveSellada` no se leen.
2. **La sesión de Tavus se crea al ABRIR el enlace**, nunca al agendar
   (`queHacerAlAbrir`): abre 15 min antes, vive hasta el FIN de la franja
   (también tras marcarla «No asistió») y dos pestañas reutilizan la misma
   (`reclamarLaCreacion`). El contexto es el de la conversación de WhatsApp.
3. **La ausencia la vigila el BACKEND** (`videollamada-ausencia.scheduler.service.ts`
   en `api-webhook`): minuto 3 sin entrar → llamada de voz IA con la herramienta
   `responder_videollamada`; si entra, se espera al 5; si no puede → «No
   asistió» y reagendar por WhatsApp; minuto 5 → «No asistió» y el enlace por
   WhatsApp. Los 3 y 5 minutos están en los dos repositorios y tienen que decir
   lo mismo.
   > **Sin efecto (2026-10-10):** ese reloj nunca llegó a `api-webhook`. La
   > espera la lleva ahora el ciclo automático de la cita (minuto 5 llamada,
   > minuto 10 No asistida), detrás de su interruptor: ver «Agenda: el ciclo
   > automático de la cita pone SOLO los estados objetivos» en
   > `crm-embudos-agenda-equipo.md`.
4. **La transcripción entra al CRM como una llamada de voz**
   (`lib/videollamada-ia-aviso.server.ts`): `messageType: 'call'` con
   `raw.call.isVideo`, transcript y resumen cobrado a la cuenta.
5. **Google Calendar no se toca**, y la variable `@meeting_link` de los
   recordatorios se cambia por el enlace de ESA cita.

Lo prueban `scripts/banco-videollamada-ia.sh` aquí y
`scripts/banco-ausencia-de-videollamada.sh` en `api-webhook`, los dos con
`MODO=roto` pinchado al commit de antes.

### La pantalla de Verzy: la herramienta se REGISTRA en la persona, y la página sale del guion

Verzy nombraba la dirección en voz alta y en la pantalla no salía nada: la
herramienta `mostrar_pantalla` estaba escrita y **nunca se registró en la
persona de Tavus**, así que el modelo no podía llamarla.

1. **Antes de crear cada conversación se revisa la persona**
   (`asegurarLaPantallaEnLaPersona`, `lib/persona-de-tavus.server.ts`): `GET`
   a `/v2/personas/<id>` y, si falta o está vieja, `PATCH` con
   `elParcheDeLaPersona` (conserva las demás herramientas). Vale para Verzy y
   para el avatar propio de una cuenta. Se recuerda solo si salió bien, y un
   fallo nunca tumba la llamada (se dice en la consola).
2. **Qué página va en cada momento del guion** lo dice `PAGINAS_DEL_AVATAR`
   (`momento` de cada una; precios → `/inicio#pricing`), y el contexto le
   prohíbe decir direcciones: llama a la herramienta y dice qué se ve.
3. **La sala baja al ancla dentro del marco** (`laRutaYElAncla`,
   `bajarAlAncla`): el marco se monta por ruta sin el `#` y cambiar de sección
   en la misma página solo desplaza.

### La sala NO usa la interfaz de Daily: se entra directo

Con `createFrame` (Daily Prebuilt) la sala de Tavus enseñaba antes su pantalla
«Are you ready to join?» en inglés, y un prospecto se quedaba ahí sin pulsar
«Join». La sala va con `DailyIframe.createCallObject`: `join()` conecta al
abrir el enlace, y el video del avatar, mi recuadro y los mandos (silenciar,
cámara, salir) los pinta `SalaDeLaVideollamada`. Si el navegador bloquea el
sonido, sale «Toca aquí para escuchar a Verzy». El permiso de cámara y
micrófono del navegador sigue saliendo: ese no se puede saltar. Lo prueba
`scripts/banco-videollamada-ia.sh`; `MODO=roto` afirma el `createFrame` de
`0319376`.

### El enlace lleva el NOMBRE del prospecto, y la sala no pide nada

El enlace es `/videollamada/maria-alejandra-rosas` (`elEnlaceDelNombre`, con
el nombre de la cita: `customName`, `clientName` o `pushName`). Se guarda UNA
vez por cita en `videollamada_enlaces` (tabla de la App); si el nombre ya lo usa
otra cita, «-2», «-3»… lo decide el `ON CONFLICT`. Sin nombre utilizable va el
id de la cita, y **un enlace con el id sigue abriendo**. El prospecto entra con
ese nombre (`join({ userName })`): no se le pregunta. La sala enseña solo
micrófono, cámara y compartir pantalla (este último solo donde existe
`getDisplayMedia`); sin «Salir» ni chat: el seguimiento va por WhatsApp.


### La sala arranca con el AVATAR solo, envía enlaces y se reconecta sola

La sala (`SalaDeLaVideollamada`) se ve así, y no de otra forma:

1. **Al entrar solo está el avatar en grande.** Nada de pantalla compartida:
   la comparte Verzy con `mostrar_pantalla` cuando su guion lo pide, o si el
   cliente lo pide y el guion lo permite. Entonces la página ocupa la sala y el
   avatar pasa a una MINIATURA abajo a la derecha. El `<video>` del avatar es
   UNO y siempre montado: un recuadro que se monta tarde se queda en negro
   (`usarPista` ya corrió para esa pista). Por eso se quitó el recuadro de la
   cámara propia, que era el que salía negro.
2. **Mandos, centrados: «Silenciar», «Apagar cámara», «Compartir pantalla» y
   «Salir».** El micrófono nace abierto (los turnos y el ruido los maneja
   Tavus) y se silencia con `setLocalAudio`; el botón lee el estado de Daily
   (`micOn`, `aria-pressed`) y, silenciado, va en rojo y dice «Activar
   micrófono». Esto deshace el «sin Silenciar» de antes: se pidió.
3. **`enviar_por_whatsapp`**: cuando el cliente pide la web, un plan o el pago,
   Verzy llama a la herramienta, la sala la pasa a `/api/videollamada/whatsapp`
   (firmado) y el SERVIDOR arma el enlace (`elEnvioArmado`) y lo manda al número
   de la cita por su línea; una vez por llamada y tipo (`videollamada_envios`).
4. **Reconexión**: si la llamada se cae, la sala pide `/api/videollamada/sala`
   (firmado), entra a la MISMA conversación (Tavus la espera 3 min,
   `participant_left_timeout`) y le dice a Verzy que siga sin saludar
   (`conversation.append_llm_context`). Hasta 5 intentos; después, un botón.
5. **Tavus solo cobra lo que se abre**: la conversación se crea al abrir el
   enlace; un enlace que no se abre no cuesta nada.

Lo prueba `scripts/banco-videollamada-ia.sh`; `MODO=roto` lee la sala de
`c4e5b5d5` y afirma el recuadro propio, el «Silenciar» y la falta de envío.

### Con varias personas cada una oye a las demás, y el avatar se queda pequeño

1. **Daily (`createCallObject`) no reproduce el audio remoto solo**: además del
   del avatar, la sala pinta un `<audio>` por cada PERSONA remota
   (`VozDeOtraPersona`, `data-zona="voz-de-persona"`). Las personas entran con
   `userData: MARCA_DE_HUMANO` (`esHumano`), y el avatar es el remoto sin esa
   marca (`elAvatarEntre`): una persona no se confunde con Verzy ni cuenta para
   colgar cuando el avatar sale.
2. **El avatar empieza en grande y, desde la PRIMERA pantalla que se comparte
   bien, queda en miniatura el resto de la reunión** (`pantallaFija`: guarda la
   última pantalla; «ninguna» u ocultar no la quitan). Una primera pantalla que
   falla no cuenta.

Lo prueba `scripts/banco-videollamada-ia.sh` (la sala montada con dos personas y
el avatar).

### En vivo: guion de ventas, agendar, notas y lo que pasa mientras se habla

1. **El contexto lleva el guion** (`elBloqueDelGuion`, `lib/pantalla-del-avatar.ts`)
   con la fecha de hoy en la zona de la cuenta: sin ella el avatar no sabe qué
   es «mañana».
2. **`agendar_seguimiento`** (cita, recordatorio o llamada, `fecha_hora`
   `YYYY-MM-DDTHH:mm`): la sala lo pasa a `/api/videollamada/agendar`
   (firmado) y el servidor lo escribe como seguimiento `auto-reminder-` en la
   zona de la cuenta (`lib/videollamada-en-vivo.server.ts`), una vez por
   tipo y hora; una fecha pasada o a más de un año no se agenda y se le dice
   a Verzy.
3. **Notas de la llamada**: lo que dice el CLIENTE (`role: user`) se apunta en
   un panel de la sala, sin repetir y con tope (`conLaNota`).
4. **Novedades**: la sala pregunta a `/api/videollamada/novedades` cada
   `NOVEDADES_CADA_MS`; si el prospecto se registró o pagó, se le cuenta a
   Verzy (`elAvisoDelPago`) una vez.
5. **Vistas propias** (`/videollamada/vista/ficha` y `/resultados`): las abre
   `mostrar_pantalla` con la firma de la cita; noindex.
6. **El mensaje de WhatsApp** lleva negrilla y acaba en `\n\n👉 <enlace>`.

Lo prueba el mismo banco; `MODO=roto` contra `f0eac70` afirma que nada de esto
existía.

### La pantalla de Verzy es la App REAL de «Verzay Ventas», en un navegador del servidor

> **Esta sección manda sobre la anterior en lo que se ve.** Las vistas
> simuladas (`/videollamada/vista/crm`, `ficha`, `resultados`) y
> `elCrmDelProspecto` / `esLaVistaDelCrm` ya no existen.

1. **Verzy saluda primero**: `custom_greeting = SALUDO_INICIAL` en la
   conversación nueva, y **si en `ESPERA_DEL_SALUDO_MS` (4 s) no ha hablado, la
   sala lo dice ella** con `conversation.echo` (una vez; nunca al reconectar ni
   si ya habló). Sin eso, una réplica que no arranca dejaba la llamada muda.
2. **Lo que se comparte es la plataforma de verdad**: un Chromium sin cabeza en
   el servidor (`lib/pantalla-de-verzy.server.ts`, `playwright-core` externo en
   `next.config.js`, binario en `CHROMIUM_PATH=/usr/bin/chromium` del
   Dockerfile) abre la cuenta «Verzay Ventas» y la sala pinta su captura
   (`<img>` de `/api/videollamada/pantalla`, con `?preparar=1` al montar).
3. **`mostrar_pantalla` solo elige entre `DESTINOS_DE_VERZY`** (panel, chats,
   ficha, recordatorios, citas, embudo) **o «ninguna»**: nada de URLs.
4. **`tomar_nota` guarda en el campo REAL**: `external_client_data.data.notas`
   del prospecto en esa cuenta, el mismo «Notas» de la ficha de Chats.
5. **La sesión se fabrica EN PROCESO** (`lib/sesion-de-verzy.server.ts`: cookie
   de Auth.js firmada con `AUTH_SECRET`, las dos variantes de nombre, con
   `domain` y `path`). **No hay ruta ni token de servicio**: no hace falta
   ninguna variable nueva. `VERZY_CUENTA_ID` sigue siendo opcional.
6. **Las POST a la ruta van PLANAS** (`{tipo:"ir",destino}`,
   `{tipo:"nota",texto}`), con la firma de la cita en la consulta.

Lo prueban `scripts/banco-videollamada-ia.sh` (las reglas, y la sala MONTADA en
Chromium con un Daily de mentira: el saludo de respaldo y las herramientas) y la
prueba local con la App servida (los seis destinos fotografiados y la nota
leída de la base). `MODO=roto` monta la sala de `9c0e76d` y afirma que se
quedaba muda.
Lo prueba el mismo banco; `MODO=roto` contra `3d2ff75` afirma que no había
saludo, ni CRM, y que las notas salían sueltas.

### La pantalla de Verzy ocupa TODO su hueco: el servidor toma la forma de la sala

Compartida, la pantalla salía con franjas vacías a los lados: el Chromium del
servidor iba fijo a 1280×800 y la sala la encajaba (`object-contain`) en un
hueco de otra forma. Ahora la sala MIDE su hueco (`ResizeObserver`, con pausa
de 250 ms) y lo manda como orden `{ tipo: "tamano", ancho, alto }`; el servidor
pone la ventana de esa forma (`elTamanoDeLaPantalla`, mínimo 1024 de ancho para
que la plataforma no pase a móvil) y rearranca el screencast con ese tope
(`cambiarElTamano`). La imagen va `h-full w-full object-contain`. Lo prueba
`scripts/banco-tamano-de-la-pantalla.sh`; `MODO=roto` lee `47824de`.

### La sala entiende los DOS formatos de `mostrar_pantalla`, y se cuelga sola

Tavus no acepta el PATCH de una persona con cambios propios en su editor, así
que Verzy puede seguir mandando el formato VIEJO (`pagina`). **No se fuerza el
cambio en Tavus** (borraría esas ediciones): `laOrdenDeLaPantalla` lee
`destino` y, si no, traduce `pagina` (`DESTINO_DE_LA_PAGINA_VIEJA`; lo
desconocido va al panel, nunca a nada). La sala tiene **«Salir»** y se cuelga
sola (`lib/fin-de-la-videollamada.ts`, pura): Tavus cierra la conversación; una
despedida de Verzy al terminar de hablar; una del cliente (se le avisa a Verzy y
a lo sumo 12 s); o Verzy sale y no vuelve en 8 s. Un saludo no cuelga, y lo
colgado no se reconecta. Lo prueba `scripts/banco-videollamada-ia.sh`.

### La pantalla de Verzy es VIDEO en vivo, no fotos que se renuevan

> **Manda sobre la sección de la App REAL** en cómo llega a la sala. Las fotos
> sueltas que se pedían cada tanto se fueron: la sala abre UN flujo
> (`/api/videollamada/pantalla?stream=1`, `multipart/x-mixed-replace`, MJPEG)
> y el `<img>` lo pinta tal cual llega, así se ve abrir el chat, la ficha y la
> nota escribiéndose letra a letra, como un video tutorial.

1. **Los fotogramas los manda Chromium** con CDP `Page.startScreencast`
   (`abrirElFlujo`, `lib/pantalla-de-verzy.server.ts`), topados a
   `FPS_DEL_FLUJO`; la ruta solo los envuelve (`laCabeceraDeLaParte`). Con la
   pantalla quieta Chromium no manda nada: no cuesta.
2. **Si el flujo se corta, la sala lo reabre sola** (`onError` →
   `REABRIR_EL_VIDEO_MS`); cortarlo al irse la sala (`req.signal`) para el
   screencast.
3. **Se prueba con el flujo de VERDAD** (`scripts/banco-video-de-verzy.sh`):
   la App servida, la cuenta de Verzay Ventas con Chromium del servidor, y se
   cuentan los fotogramas DISTINTOS mientras Verzy va a Chats y escribe una
   nota (≥3 por segundo, ningún congelón de más de 1,5 s), y la nota en la
   base. `MODO=roto` afirma que en `8483adb` no había flujo.
4. **Mientras espera, el cursor se mueve** (`esperarMoviendose`), y **nunca se
   espera a la URL**: abrir el chat pulsando su fila NO pone `?jid=`, así que
   esperar `waitForURL` eran 8 s de pantalla congelada. Qué chat está abierto
   lo recuerda `viva.chatAbierto`, y se espera a lo que se VE.

### Auditoría de la sala (2026-10-05): tres causas raíz, sin parches encima

> **Esta sección manda sobre las anteriores de la videollamada** en el saludo, la
> entrada y el movimiento de la pantalla con la voz.

| lo que se veía | la causa | ahora |
| --- | --- | --- |
| pantalla compartida vacía y avatar que no se achica | el `PATCH` que registra las herramientas en la persona de Tavus rebotaba con **409 `maker_changes`** (la persona tiene ediciones del editor): Verzy nunca tuvo `mostrar_pantalla` | si rebota, **se usa una COPIA de la persona con las herramientas** (`lib/persona-derivada.ts` puro, `laPersonaParaLaConversacion` en `lib/persona-de-tavus.server.ts`), guardada por huella en `videollamada_personas_derivadas` y rehecha cuando la original cambia. **Nunca `force=true`**: borraría lo editado en Tavus |
| arrancaba «a mitad de conversación» | la entrada (`entroEn`) se marcaba al ABRIR la página —también una precarga del enlace—, y la vigilancia de ausencia daba por empezada una llamada sin nadie | la entrada cuenta solo al unirse de verdad a Daily (`joined-meeting` → `PUT /api/videollamada/sala` → `marcarLaEntradaReal`) |
| hablaba de más y saludaba dos veces | tres reglas de saludo distintas (guion, contexto y respaldo) y la pantalla «recorriendo» atada a su voz | UNA regla, `REGLA_DEL_SALUDO`; el guion no repite el saludo; **el recorrido por voz se quitó entero** (solo `ir` y `nota`) |

Cuatro cosas que hay que mantener:

1. **Lo que crea la conversación usa `laPersonaParaLaConversacion`**, y nunca
   lanza: ante un fallo va la original y se dice con `console.error`.
2. **Una copia con una clave de modelo enmascarada no se crea** (Tavus no la
   devuelve): se dice.
3. **La pantalla solo se mueve cuando Verzy llama a `mostrar_pantalla`**, nunca
   por lo que dice.
4. Desde este entorno no se llega a Tavus ni a Daily: lo prueba
   `scripts/banco-videollamada-ia.sh` con los dos fingidos
   (`persona-derivada.test.mjs`: 409 → copia sin `force`, reutilizada por
   huella, la vieja borrada al cambiar, y un fallo que no tumba la llamada).

### Y la persona de Tavus sigue con su herramienta VIEJA: su vocabulario se traduce

La persona de Verzy en Tavus no acepta el PATCH (409 `maker_changes`) y la
copia derivada no se puede crear (la clave del TTS vuelve enmascarada), así que
su `mostrar_pantalla` sigue pidiendo `pagina` con una lista FIJA
(`inicio`, `precios`, `crm_embudo`, `guia` + `modulo`…). Después del #1161 la
sala solo aceptaba rutas y **descartaba todo lo que mandaba Verzy**: decía que
mostraba y la pantalla se quedaba vacía.

`lib/herramienta-vieja-de-tavus.ts` traduce ESE vocabulario (y solo ese) a una
ruta, y la ruta pasa por `comoRutaDeVerzy` como cualquier otra. No es una tabla
de navegación del código: qué página pide sigue decidiéndolo el entrenamiento;
es el diccionario de la herramienta tal como está registrada en Tavus. **Se
borra el día que la persona acepte la herramienta nueva con `ruta`.** Lo prueba
`scripts/banco-videollamada-ia.sh`.

### La primera pantalla iba a «/» y después saltaba sola a la agenda

Dos fallos de la videollamada real, con dos causas:

| lo que se veía | la causa | ahora |
| --- | --- | --- |
| la primera pantalla compartida salía con la ruta vacía («/») y un 404 | `comoRutaDeVerzy` daba «/» por buena, el 404 se guardaba como destino, y una llamada a la herramienta con una ruta que no sirve se descartaba callada: Verzy decía que la mostraba | «/» y lo vacío no son una pantalla; un 404 es un fallo y no se apunta; una ruta inválida devuelve `{accion:"invalida"}` y la sala se lo cuenta a Verzy (`elAvisoDeRutaInvalida`) para que vuelva a llamar con la ruta de su entrenamiento |
| más tarde saltaba sola a una página no pedida | al reabrir la pantalla se retomaba el destino guardado aunque fuera de antes (otra llamada, un corte largo), y el contexto la animaba a compartir «cuando el tema lo pide» | se retoma solo un relevo en vivo (`elDestinoQueSeRetoma`, `RELEVO_EN_VIVO_MS` 20 s); si no, pantalla de espera. El contexto dice: comparte SOLO en el paso del entrenamiento que lo indica o si el cliente lo pide, nunca por tu cuenta |

Lo prueba `scripts/banco-videollamada-ia.sh` (con `ruta-de-verzy.test.mjs`);
`MODO=roto` compila las reglas de `665af12` y afirma los dos fallos. Contra
Tavus y Daily reales no se puede probar desde este entorno.

## Agente IA › Videollamadas: se entrena IGUAL que Llamadas

La pestaña **Videollamadas** va justo después de Llamadas (WhatsApp, Llamadas,
Videollamadas, WhatsApp API, Telegram, Facebook, Instagram) y es un canal
`kind: 'chat'` más (`lib/channel-training.ts`, agente
`system-prompt-ai-videollamadas`): las mismas ocho pestañas —Perfil, Inicio,
Preguntas, Productos, Extras, Palabras clave, Gestión y Cotizaciones—, la misma
vista previa en Markdown y el mismo Guardar que Llamadas, porque es el MISMO
editor (`MainAi` sobre `AgentPrompt`). El editor de guion de siete secciones se
fue.

Tres cosas que hay que mantener:

1. **Lo que se entrena aquí es lo que Verzy lee en la videollamada**:
   `elEntrenamientoDeLaCita` (`lib/videollamada-ia.server.ts`) lee el
   `promptText` de ese agente de la cuenta dueña de la cita, y
   `elBloqueDelGuion` (`lib/pantalla-del-avatar.ts`) lo pone en el contexto de
   Tavus, topado a `TOPE_DEL_ENTRENAMIENTO`.
2. **Sin entrenamiento escrito, cae en el guion de antes**
   (`guion_videollamada` / `elBloqueDelGuionDe`, de fábrica si no hay fila): una
   cuenta que no ha tocado la pestaña sigue igual. El saludo sigue saliendo de
   ahí.
3. **En Tavus solo queda lo técnico**: voz, cara y réplica.

Lo prueba `scripts/banco-guion-videollamada.sh` (el orden de los canales, el
canal de chat y el entrenamiento en el contexto); `MODO=roto` lee `304d3bb`.

### La navegación de Verzy la decide SOLO el prompt de Videollamadas

> **Esta sección manda sobre todas las de arriba** en qué abre Verzy: no hay
> ninguna tabla de rutas, ningún atajo («chats», «ficha», «precios»), ninguna
> traducción de claves viejas, ni ninguna página atada a un momento del guion.

El modelo lee el entrenamiento de Agente IA › Videollamadas y, según el tema,
llama a `mostrar_pantalla` con la URL que quiere. El código **solo ejecuta**:
`comoRutaDeVerzy` (`lib/pantalla-de-verzy.ts`) la sanea y el Chromium del
servidor la carga. Nada más.

1. **Sanear es seguridad, no navegación**: solo rutas de la plataforma (de una
   dirección completa se queda con camino, consulta y ancla); fuera esquemas,
   `//`, `..`, espacios y `RUTAS_PROHIBIDAS` (`/api`, `/login`, `/videollamada`…).
   Una palabra suelta no es una ruta: no se carga.
2. **El contexto no nombra páginas**: dice cómo se usa la herramienta, que no
   lea URLs en voz alta y que a dónde ir lo dice su entrenamiento.
3. **Una ruta que no existe NO es un ok**: un 404 o un 5xx se le cuenta a Verzy
   (`loQueSeLeCuentaAVerzy`) para que no diga que la ve. Mientras habla, la
   pantalla puesta solo se recorre; nunca cambia por su voz.
4. **La única excepción es sanear `/planes`** (pide sesión y en la pantalla no
   abre): `comoRutaDeVerzy` la cambia por `LOS_PRECIOS_DE_LA_LANDING`
   (`/inicio#pricing`). No es navegación: es una dirección que no funciona.
5. **Si el código vuelve a decidir una ruta, está mal**: el banco falla si
   reaparece una tabla (`LUGARES_DE_LA_LANDING`, `DESTINOS_DE_VERZY`,
   `PAGINAS_DEL_AVATAR`…) o una ruta escrita en esos ficheros.

Lo prueban `scripts/banco-videollamada-ia.sh` (las reglas) y
`scripts/banco-navegacion-de-verzy.sh` (la App servida: cada URL de la landing y
de la plataforma se carga tal cual, las palabras sueltas no, y lo que no existe
o está prohibido tampoco). `MODO=roto` afirma las listas de `9a1390d`.

## Videollamada: «Verzy, yo sigo desde aquí» lo decide la SALA, y la pantalla cambia sin esperar

La regla del entrenamiento («cuando te digan "Verzy, yo sigo desde aquí", cállate») se ignoraba. **No era el prompt**: el modelo de Tavus recibe lo que dijo el cliente cuando TERMINA su turno y no puede cortar su propia voz; lo que estaba diciendo seguía saliendo, y su respuesta siguiente era «claro, te dejo». Una herramienta (`silenciar_agente`) llegaría igual de tarde, y registrarla en la persona puede rebotar con 409 `maker_changes`.

> **Lo decide la sala** (`lib/silencio-de-verzy.ts`, puro): oye cada frase transcrita del CLIENTE (`conversation.utterance`, `role: user`) y, al reconocer la orden, manda `conversation.interrupt`, silencia el audio del avatar, le cuenta a Verzy que se calle (`AL_CALLARSE`) y corta cualquier intento de volver a hablar. Vuelve solo si alguien lo llama por su nombre (`AL_LLAMARLO_DE_NUEVO`). Lo que dice Verzy nunca cuenta.

Y `mostrar_pantalla` iba lenta por esperas fijas, no por Chromium:

1. **El ciclo de la pantalla despierta al llegar una orden** (`viva.despertar`), y `pedirALaPantalla` mira cada `MIRAR_LA_ORDEN_MS` (100).
2. **La espera de red se topa en `CALMA_DE_LA_RED_MS`** (1,2 s): una página con sondeos nunca queda «quieta».
3. **El gesto del menú va A LA VEZ que la carga**, y bajar al ancla o recorrer con la rueda corre DESPUÉS de contestar (`viva.despues`): la sala sabe el resultado sin esperar la animación.
4. **Nada de caracteres sin escapar en una regla que corre en la sala**: el arnés sirve el paquete sin `charset` y un `[̀-ͯ]` literal tumbó la sala entera. Van como `̀-ͯ`.

Lo prueba `scripts/banco-silencio-y-pantalla.sh` (la regla y un barrido; `MODO=roto` contra `ae856c1` afirma que no existía). Contra Tavus y Daily de verdad no se puede probar desde este entorno.

## Videollamada: Verzy en grande SOLO al presentarse, y la llamada tiene un límite de minutos

> **Esta sección manda sobre las de arriba** en qué se ve en grande: ya no es «el avatar hasta la primera pantalla compartida».

Qué va en grande y qué en miniatura lo decide `laDisposicion` (`lib/disposicion-de-la-videollamada.ts`, pura); la sala solo le pasa lo que sabe y pinta lo que devuelve (`<main data-zona="sala" data-grande data-mini>`):

| situación | grande | miniatura |
| --- | --- | --- |
| presentación (hasta `TOPE_DE_LA_PRESENTACION_MS`, 2 min) | Verzy | — |
| Verzy comparte pantalla | su pantalla | Verzy |
| nada compartido, ya presentado | la PORTADA («Verzay — Soluciones Digitales con IA») | Verzy |
| un asesor dijo «Verzy, yo sigo desde aquí» | su pantalla o su cámara | su cámara (si comparte) |

1. **La presentación acaba** a los 2 minutos, con la primera pantalla compartida o en una reentrada; después Verzy no vuelve a crecer solo.
   **Y desde que Verzy PIDE compartir, nunca vuelve a grande** (`yaSeCompartio`): aunque la pantalla falle al cargar o la quite con «ninguna». Antes, si el servidor de la pantalla fallaba, la presentación no acababa y Verzy volvía a ocupar la sala.
2. **La cámara del CLIENTE no se pinta nunca.** El asesor entra marcado (`userData: {humano, asesor}`, prop `esAsesor`).
3. **La llamada tiene límite**: `limiteMinutos` de la cuenta (fábrica `LIMITE_DE_FABRICA_MIN` 30, entre 5 y 240), contado desde que EMPEZÓ (`empezoEn`, no desde que abrió esta pestaña: recargar no lo reinicia). Lo decide `elCierreDeLaSala`; al cumplirse la sala cuelga sola (`colgar("limite")`).

**La portada es una PIZARRA de la marca**, no una línea suelta: fondo de la marca (el degradado del vídeo de ventas), el logo, «Verzay» en grande y el eslogan aparte (`NOMBRE_DE_LA_PORTADA`, `ESLOGAN_DE_LA_PORTADA`, `LOGO_DE_LA_PORTADA`), con `pb-36` en el teléfono para que la miniatura de Verzy no tape el texto.

Lo prueba `scripts/banco-disposicion-videollamada.sh`: la regla y la sala MONTADA en Chromium con el CSS real a 1440 y 390 (la pizarra con logo, nombre y eslogan sin que la miniatura los tape, cámara del cliente ausente, cuelgue por límite); `MODO=roto` monta la sala de `bf1a4af` y afirma que no había portada ni límite, y lee la de `4c84c02` y afirma que la pizarra era una línea suelta, sin logo ni eslogan aparte. `MODO=roto-miniatura` monta la de `47824de` y afirma que, con la pantalla fallando, Verzy volvía a grande. Contra Tavus y Daily de verdad no se puede probar desde este entorno.

**La miniatura va DENTRO del área de contenido** (que acaba en `bottom-16`, encima de la barra de mandos), a 8 px de su borde derecho y de su borde de abajo, en todas las anchuras: con `sm:bottom-2` bajaba encima de los mandos en escritorio. Lo mide el mismo banco a 1440/1024/390; `MODO=roto-mini` monta la de `4c84c02` y afirma el fallo.

## Videollamada: con pantalla compartida los mandos se esconden solos

Durante una pantalla compartida (la de Verzy, la del asesor o la propia) los
mandos de la sala (Salir, Compartir pantalla, cámara…) flotan encima y **se
apartan solos a los 3,5 s sin actividad**; vuelven al mover el cursor, tocar o
recibir el foco, y no se van con el cursor encima. Sin pantalla compartida se
quedan siempre. No es una regla nueva: es la de la reunión
(`lib/mandos-de-la-reunion.ts` + `hooks/useMandosQueSeEsconden.ts`), y
escondidos van `pointer-events-none` (un Salir invisible no se pulsa). Lo prueba
`scripts/banco-mandos-de-la-videollamada.sh` con la sala montada a 1440 y 390;
`MODO=roto` monta la de `47824de` y afirma que no se escondían.

## Videollamada: la pantalla compartida llena la sala, y los mandos y la miniatura son UNA barra

Con la pantalla compartida había una franja negra arriba con «Verzy te está mostrando: /ruta», franjas negras a los lados y la miniatura de Verzy flotando encima de la pantalla.

1. **No hay ninguna etiqueta de ruta, nunca.** La ruta es un dato interno y su franja le quitaba alto a la pantalla.
2. **La pantalla compartida va `object-cover object-top`** y, cuando los mandos flotan (`mandosFlotan`), llega a `bottom-0`: ocupa la sala entera, sin franjas.
3. **Abajo hay UNA barra (`h-20`)**: los botones centrados y, a la derecha, la miniatura de Verzy (`h-16 w-28`, `bottom-2 right-2`), alineada con ellos. La barra deja hueco a la derecha (`pr-32`) para que la miniatura no tape ningún botón; en el teléfono los botones van solo con su icono.

Lo prueba `scripts/banco-barra-de-la-videollamada.sh`. Monta la sala real con una pantalla compartida a 1440/1024/390 y comprueba que no hay etiqueta, que no hay píxeles negros alrededor de la pantalla y que la miniatura está dentro de la barra, alineada y sin tapar botones. `MODO=roto` monta la sala de `42e8f15` y afirma la etiqueta y las franjas.

## Videollamada: Verzy apunta en la pestaña «Notas» del chat, y un fallo de carga no se ve

| lo que se veía | ahora |
| --- | --- |
| Verzy escribía en la caja «Notas» de la FICHA del contacto | escribe en la pestaña **«Notas»** de la conversación, al lado de «Mensajes» (`data-pestana-del-chat="notes"`): UNA nota por prospecto (`elTituloDeLaNotaDeLaLlamada`, «NOTAS DE LA VIDEOLLAMADA · NOMBRE») y las siguientes se añaden debajo. Si la pestaña no aparece, abre `/notas`, escribe allí y vuelve al chat. Se confirma leyendo `user_notes` |
| una ruta que no existía se le enseñaba al cliente (404) | toda carga va por `cargarSinEnsenarElFallo`: el video se congela mientras carga y, si falla o la página dice que no existe, vuelve a la pantalla anterior (`volverA`) antes de soltar el video; a Verzy se le cuenta el fallo |
| la voz iba por delante de la pantalla | `irA` contesta solo cuando ya hay un fotograma nuevo de la página (`esperarUnFotogramaDesde`) y ya bajó al ancla |

Lo prueban `scripts/banco-notas-de-verzy.sh` (la regla y un barrido; `MODO=roto` contra `422d935` afirma la caja de la ficha) y `scripts/banco-video-de-verzy.sh` (la App servida: tres notas en una sola nota del prospecto y ninguna en la ficha, precios, embudo, agenda y vuelta al chat con su tiempo, y una ruta inexistente que no cambia la pantalla).

## Videollamada: la pantalla compartida se ve ENTERA, va rápida y a la ruta exacta

> **Manda sobre «la pantalla compartida llena la sala»** en cómo se ajusta: ya no es `object-cover` ni llega a `bottom-0`.

1. **Nunca se corta**: la pantalla compartida va con `AJUSTE_DE_LA_PANTALLA` (`h-full w-full object-contain object-center`, `lib/disposicion-de-la-videollamada.ts`) y acaba ENCIMA de la barra (`ABAJO_DE_LO_GRANDE`, `bottom-20`), también con los mandos escondidos: si bajara, al volver taparían su parte de abajo (la barra de escribir con los emojis). El servidor ya toma la forma del hueco (`elTamanoDeLaPantalla`), así que casi siempre la llena; si la forma no cuadra, salen franjas en vez de deformar o recortar.
2. **Más rápida**: la calma de red se topa en 600 ms, las esperas tras un clic y la rueda se acortaron, el fotograma nuevo se espera como mucho 900 ms, y el ratón y las letras van más ágiles (`RECORRIDO_DEL_RATON_MS` 400, `PAUSA_ENTRE_LETRAS_MS` 35).
3. **Ruta exacta**: el contexto lleva `REGLA_DE_LA_RUTA_EXACTA` (`lib/pantalla-del-avatar.ts`): la URL es la que el entrenamiento declara para ese tema, tal cual, sin cambiarla por una sección parecida. La navegación sigue decidiéndola solo el prompt.

Lo prueba `scripts/banco-barra-de-la-videollamada.sh` con la sala montada a 1440×900, 1024×768, 768×1024 y 390×844 (la imagen entera, su forma real, encima de la barra); `MODO=roto` contra `60d2a1b` afirma el recorte.

## Videollamada: sin páginas de error, el dispositivo del cliente, y el video crece al esconder los mandos

> **Manda sobre la sección de arriba** en el borde de abajo: con los mandos escondidos la pantalla compartida baja a `bottom-0`.

1. **Nunca se ve una página de error** (`ERR_CONNECTION_REFUSED`, `chrome-error://`…): `esUnaPaginaDeError` (`lib/pantalla-de-verzy.ts`) la reconoce, el screencast no manda sus fotogramas, `cargar` la cuenta como fallo y el ciclo vuelve a la pantalla anterior.
2. **Los mismos 4 mandos en el móvil que en el PC** (silenciar, cámara, compartir, salir), centrados y simétricos; la barra deja `px-28 sm:px-32` a los lados para la miniatura.
3. **La pantalla emula el dispositivo del cliente**: la sala manda `dispositivo` (`elDispositivo`) con el tamaño, y el servidor pone métricas (dpr 2 y móvil fuera del PC), `AGENTE_DEL_DISPOSITIVO` y táctil por CDP; si cambia el dispositivo, recarga.
4. **Al esconderse los mandos el video baja a `bottom-0`** con una transición de 300 ms (`elAbajoDeLoGrande`); al volver, sube a `bottom-20` y nada queda tapado. El tamaño que se pide al servidor cuenta ese hueco.
5. **Una cámara vertical lleva miniatura vertical** (`miniDe`).
6. **Más rápida**: calma de red 400 ms, esperas tras clic y rueda más cortas, bajar al ancla topado en 1 s.

Lo prueban `banco-tamano-de-la-pantalla.sh`, `banco-mandos-de-la-videollamada.sh`, `banco-barra-de-la-videollamada.sh` y `banco-disposicion-videollamada.sh` a 390×844, 768×1024 y 1440×900. `banco-video-de-verzy.sh` tiene tres fallos que ya da `main` (moverse a Chats, la nota y volver de /inicio): no son de esto.

### Y desde el CHAT: el icono de propuestas de la cabecera

La cabecera de una conversación lleva, junto a notas, recordatorio y Google
Sheets, un icono de propuestas (`ChatPropuestaPanel`, en las dos filas de
`ChatHeader`). Abre un `PanelLateral` (`PANEL_DE_LA_PROPUESTA`) con el MISMO
`FormularioDePropuesta` que Panel › Propuestas (`marco="panel"`), con su «Cargar
plan», y al final un botón verde de ancho completo, «Enviar por WhatsApp».

1. **Lo lee `propuestaDesdeElChatAction(instanceName)` y lo envía
   `crearYEnviarPropuestaDesdeElChatAction(instanceName, destino, datos)`**: la
   cuenta es la DUEÑA de la línea de la conversación (`resolveInstanceOwner` +
   `quienManda`), nunca la de quien mira; otra cuenta o un agente, no.
2. **El número y la línea los pone el servidor**: el WhatsApp y la línea del
   formulario se ignoran; va al contacto de ESE chat por ESA línea (que tiene
   que estar en `lasLineasParaEnviar`). Un `@lid` se manda a su jid.
3. **Se crea y se envía con las funciones de siempre** (`crearPropuesta`,
   `enviarLaPropuesta`): queda en Panel › Propuestas como cualquier otra.

Lo prueba `scripts/banco-propuesta-desde-el-chat.sh` (barrido y las acciones
contra Postgres con el despachador fingido); `MODO=roto` lee `70273b0` y afirma
que no existía.

## Videollamada: la GRABA la sala del cliente, y llega al detalle de CRM › Llamadas

El detalle de una videollamada con Verzy no enseñaba ni video, ni audio, ni
(a veces) transcripción. Cuatro causas, con el código delante:

| | qué pasaba | ahora |
| --- | --- | --- |
| a | Tavus no grababa: no se le pedía, y **solo graba en Amazon S3, GCS o Azure** (no acepta un endpoint propio: no puede escribir en MinIO) | graba la **sala del navegador** (`hooks/useGrabacionDeLaVideollamada.ts`) |
| b | el aviso `recording_ready` de Tavus trae `s3_key`, no una URL | ya no hace falta: la grabación no sale de Tavus |
| c | una grabación que llegaba después de la transcripción no tocaba la fila del CRM | `copiarLaGrabacionAlCrm` la mezcla en `raw.call`, llegue antes o después |
| d | `CallDetailDialog` solo pintaba audio de AstraCalls | con `isVideo` y `videoUrl`: «Detalle de la videollamada» y `<video controls preload="metadata">` |

La transcripción y el resumen siguen saliendo de Tavus (`callback_url` →
`lib/videollamada-ia-aviso.server.ts`), con turnos «Asistente:» / «Cliente:»
que `losTurnos` reconoce.

1. **Graba la pestaña del CLIENTE; la de un asesor, solo sin cliente** (`laSalaGraba`, ver la sección siguiente):
   el cliente está siempre; si grabaran los dos habría dos ficheros de la
   misma llamada. Empieza sola al entrar, **sigue a través de las
   reconexiones** (la sala no se desmonta; el mezclador vuelve a enchufar las
   pistas por su id) y una recarga («Volver a entrar») abre otra grabación. De
   varias, al CRM va la más larga.
2. **Lo que se graba es lo que se ve**: el lienzo (1280×720, 10 fps, 900 kbps)
   pinta lo grande ENTERO (`comoCabeEntero`) —el avatar, la pantalla de Verzy
   (el `<img>` MJPEG), o la cámara/pantalla del asesor— y la miniatura abajo a
   la derecha. La cámara del cliente NO (la sala tampoco la pinta); su voz sí:
   el micrófono entra en la mezcla (`miMicro`), con la del avatar y las demás
   personas. El audio va además en su propio fichero a `AUDIO_BPS`, como en
   Reuniones. Video a menos bitrate que Reuniones a propósito: sube el
   cliente, a menudo por el móvil y mientras manda su cámara a la llamada.
3. **Trozos de 10 s, no partes de 8 MiB** (`TROZO_CADA_MS`). El cliente casi
   nunca pulsa «Salir»: **cierra la pestaña**, y lo que no se subió se pierde.
   Con las partes de Reuniones eso era la llamada ENTERA (el audio tarda media
   hora en juntar 8 MiB). Al cerrar, el servidor pega los trozos EN ORDEN en
   partes de ≥5 MiB (memoria acotada a una parte) y las junta con
   `juntarLasPartes` (el de Reuniones, con `modulo: "videollamadas"`). Un
   trozo perdido se salta y se dice; sin ningún trozo, la grabación queda
   `fallida`, nunca en `grabando`.
4. **Safari graba mp4**: el formato sale del `MediaRecorder`
   (`elFormatoDeLaGrabacion`) y decide extensión y tipo. Un mp4 guardado como
   `.webm` no lo abre bien nadie.
5. **Se dice que se graba**: una pastilla «● Grabando» en la sala del cliente
   (la regla de Reuniones: grabar a alguien sin que se note no es una
   función).
6. **La ruta es pública con la firma de la cita** (`/api/videollamada/grabacion`,
   `a=empezar|trozo|cerrar`, todo `POST` porque `sendBeacon` solo sabe
   `POST`). Sin sesión, sus techos son lo único que impide llenar el bucket:
   la grabación tiene que ser DE esa cita, 8 MiB por trozo, 2 GiB por
   grabación, 20 grabaciones por cita. El middleware ya deja pasar
   `/api/videollamada`; el banco prueba que se ALCANZA (401 de la firma, no
   un `/login`).
7. **Tres caminos cierran, uno junta**: colgar, `pagehide` (`sendBeacon`) y el
   barrido diario de `/api/cron/billing` (`recogerLasGrabacionesDeLaSala`,
   las que llevan `HORAS_SIN_CERRAR` sin un trozo nuevo, en su propio `try` y
   el último). `reclamarElCierreDeLaSala` pasa `grabando → juntando` y solo
   uno gana.
8. **La fila del CRM, en los dos órdenes**: el cierre escribe la grabación y
   LUEGO la copia a la fila `tavus_<cita>`; `anotarEnElCrm` escribe la fila y
   LUEGO copia la grabación. El último de los dos siempre ve lo del otro. La
   copia es un merge de JSONB en `raw.call` con solo las llaves con valor
   (`laGrabacionParaElCrm`): un `null` pisaría una dirección buena.
9. **Tabla de la App** `videollamada_grabaciones` (`CREATE TABLE IF NOT
   EXISTS` en `lib/videollamada-ia-db.ts`, como las demás de la videollamada).
   En SQL crudo, los números que van a `make_interval` o `LIMIT` llevan
   `::int`: Prisma los manda como `bigint` y `make_interval(hours => bigint)`
   no existe (lo cazó el banco).
10. **En el detalle**: sin el «Reintentar» de AstraCalls en una videollamada
    (reintentar allí no traería la transcripción de Tavus). Sin grabación, la
    transcripción y el resumen se ven igual.

Lo prueba `scripts/banco-detalle-de-videollamada.sh`: las reglas puras, la
ruta y el cierre contra Postgres con un bucket fingido, la sala montada en
Chromium con un Daily de mentira con pistas de verdad (mide que el video
junto se ve a 1280×720 y que el audio lleva las dos voces), el diálogo
pintado, y la ruta alcanzada con el build. `MODO=roto` monta la sala y el
diálogo de `5983031` y afirma que no se subía ni un byte y que el detalle
salía «de la llamada» sin video.

**Lo que no se pudo ejercer aquí**: MinIO de verdad y un teléfono de verdad.
Si en producción algo falla, mirar primero la unión (`composeObject`) y un
cliente en iPhone (mp4).

## Videollamada: graba también el ASESOR cuando está solo con Verzy, y en el chat sale con la cámara

Tras la sección anterior, una videollamada de prueba seguía sin dejar ni audio
ni video, y en la lista de chats salía «📞 Videollamada con IA realizada».

| | qué pasaba | ahora |
| --- | --- | --- |
| a | quien abre el enlace **con la sesión iniciada** entra como asesor (`esDelEquipo` en `app/videollamada/[id]/page.tsx`), y la regla era «el asesor nunca graba». Así se PRUEBA la videollamada: el dueño abre el enlace en su navegador. En la sala no había nadie que grabara | `laSalaGraba({ esAsesor, hayCliente })`: el cliente graba siempre; el asesor, **mientras no haya cliente** en la sala. Si el cliente se va, el asesor empieza |
| b | la vista previa de la lista ponía `📞` a toda fila `call` | `🎥` cuando `raw.call.isVideo` (`lastTextFrom`); el distintivo «Saliente» del detalle lleva la cámara |

1. **«Hay cliente»** = un remoto con la marca de persona y SIN la de asesor
   (`lasPistas` → `hayCliente`). La pestaña del cliente siempre cuenta como
   que hay cliente: es ella.
2. **Una vez empezada, sigue**: si el cliente entra después de que el asesor
   empezara, graban los dos y al CRM va la más larga (`copiarLaGrabacionAlCrm`).
   Una grabación de más es mejor que ninguna.
3. La burbuja de la conversación ya pintaba la cámara (`MessageBubble`, con
   `call.isVideo`); el banco lo vigila igual.

Lo prueba `scripts/banco-videollamada-graba-el-asesor.sh` (sala montada en
Chromium: el asesor solo graba y sube trozos; con el cliente dentro, no; si
el cliente se va, empieza; y el chat con `🎥`). `MODO=roto` monta los de
`7343076` y afirma que el asesor solo no subía ni un byte y que la lista decía
`📞`. De paso, `sala-que-graba.test.mjs` ya no exige que el cierre por
`sendBeacon` sea el ÚLTIMO pedido: el trozo de los 10 s se puede cruzar con él.

## Videollamada: la grabación no espera al primer clic (el audio parado no graba ni el video)

> **Superada por la sección siguiente**: ya no hay botón ni reintentos; la sala no usa `AudioContext` para grabar.

La grabación ya llegaba al CRM, pero **empezaba un minuto o más tarde** que
la llamada: su primer fotograma ya era la portada con Verzy en miniatura, o
sea, después de la presentación.

> **Con el `AudioContext` de la grabación parado no se graba NADA, ni el
> video.** El video lleva la mezcla de voces, y sin ella rodando Chrome no
> suelta ni un fotograma (medido en Chromium: con el contexto suspendido,
> ni un byte en 25 s; al reanudarlo, trozos normales). Y un `AudioContext`
> creado sin un clic en la página **nace parado** (regla de Chrome y Safari).
> El hook lo arrancaba UNA vez al crearlo y luego solo con el primer toque o
> tecla: la grabación empezaba cuando el cliente tocaba la página por
> primera vez.

1. **Se insiste** (`REINTENTAR_EL_AUDIO_CADA_MS`, 1 s): el navegador deja
   arrancarlo en cuanto la cámara o el micrófono están abiertos (es lo que ya
   deja sonar al avatar sin clic), y eso pasa DESPUÉS de crear el contexto.
2. **Si a los `EN_PAUSA_TRAS_MS` (3 s) sigue parado, se pide el toque** con
   el botón que la sala ya tenía para el sonido bloqueado («Toca aquí para
   activar el audio de la llamada», `data-zona="activar-sonido"`). Antes de
   perder el primer trozo de 10 s.
3. **«Grabando» es verdad**: la pastilla y `data-grabando` solo con el audio
   rodando (`grabando = montada && corriendo`). Antes decía «Grabando»
   mientras no se grababa nada.

Lo prueba `scripts/banco-grabacion-sin-clic.sh`: la sala montada en Chromium
con la regla del navegador FINGIDA (Playwright la apaga: lanza Chromium con
`--autoplay-policy=no-user-gesture-required` y marca como gesto cada
`evaluate`, así que el clic «de verdad» se mira con `isTrusted`). Si el
navegador deja a los 1,5 s, el primer trozo con video llega antes de los
14 s y sin botón; si no deja, sale el botón, no dice «Grabando», y al tocarlo
graba. `MODO=roto` monta la sala de `2954e39` y afirma que sin clic no subía
ni un byte aunque el navegador ya dejara, y que nada pedía el toque.

De paso, en `sala-que-graba.test.mjs` el cierre por `sendBeacon` se prueba
con el evento `pagehide` en la página viva: navegando fuera, Playwright a
veces no veía el beacon en su ruta (fallaba a ratos también en `main`).

## Videollamada: cada voz se graba SUELTA y el servidor la mezcla (sin toque, también en el teléfono)

Con el arreglo anterior seguía haciendo falta un toque: en el TELÉFONO una
videollamada no dejó ni un byte (el `AudioContext` no arrancó y nadie tocó el
botón). La regla del navegador no se puede saltar desde la página, así que
**la grabación ya no depende del `AudioContext`**:

1. **El video es solo el lienzo** (`captureStream`, sin pista de audio): nada
   lo puede parar. Empieza al entrar, como antes.
2. **Cada voz va con su propio `MediaRecorder`** sobre su pista tal cual (la
   de Verzy, el micrófono, cada persona; una reconexión trae pistas nuevas y
   abre voces nuevas). Un `MediaRecorder` sobre una pista nativa no necesita
   ningún toque. Cada voz dice **cuándo empezó respecto al video**
   (`desdeMs`) y sube a `?a=trozo&cual=voz&pista=N&desde=ms`.
3. **El servidor mezcla al cerrar** (`juntarConLasVoces`): baja el video y
   cada voz a disco (sin tenerlos en memoria), `ffmpeg` retrasa cada voz a su
   sitio (`adelay`), las mezcla (`amix` + `volume`) y saca la mezcla sola
   (`audioUrl`) y el video con la mezcla **sin recodificar el video**
   (`-c:v copy`). Las órdenes las arma una función pura
   (`lasOrdenesDeLaMezcla`).
4. **`ffmpeg`**: el sistema del contenedor no lo trae, pero `@ffmpeg-installer/ffmpeg`
   está en `dependencies` y el contenedor hace `npm ci --omit=dev`: el binario
   estático vive en `node_modules/@ffmpeg-installer/linux-x64/ffmpeg`
   (`elFfmpeg`, `FFMPEG_PATH` manda). Si falla, **no se pierde la llamada**:
   va el video mudo y, de audio, la voz más larga, y se dice.
5. **Techos de la ruta sin sesión**: 40 voces por grabación (`TOPE_DE_VOCES`),
   `desde` entre 0 y 6 h; los de bytes y trozos, como siempre. Las voces se
   apuntan en `videollamada_grabacion_voces` (tabla de la App, `CREATE TABLE
   IF NOT EXISTS` en `lib/videollamada-ia-db.ts`).
6. **Las salas de antes** (páginas abiertas antes del despliegue) suben
   `cual=audio` con la mezcla del navegador: sin voces, el cierre junta como
   siempre.

Lo prueba `scripts/banco-grabacion-voces-sueltas.sh`: las órdenes de la
mezcla; la ruta y el cierre contra Postgres con el `ffmpeg` de verdad y medios
fabricados por él (un tono desde el segundo 0 y otro que entra a los 4 s: antes
de los 4 s suena uno, después los dos; el video se copia), el techo de voces,
el caso sin `ffmpeg` y el de una sala de antes; y la sala montada en Chromium
con la regla del navegador FINGIDA: sin un solo toque dice «Grabando», sube
video y cada voz con su `desde`, y lo subido mezclado con `ffmpeg` es un video
1280×720 con las dos voces, el video y la voz a la par (<1 s). `MODO=roto`
monta la sala de `fb40429` y afirma que sin un toque no subía ni un byte de
video y salía el botón. `scripts/banco-grabacion-sin-clic.sh` se retiró: lo
que probaba (el botón) ya no existe.

**Lo que no se pudo ejercer aquí**: un teléfono de verdad y MinIO de verdad.
Si un teléfono no graba, mirar en el log del servidor si llegó `a=empezar` y
algún `cual=voz`.

## Videollamada: al CRM va la grabación que dura más DE VERDAD, no la que estuvo más rato abierta

Una videollamada de 3:40 se oía entera recién colgada y, al volver al
detalle, solo traía 36 s. De varias grabaciones de una cita al CRM va «la más
larga» (`copiarLaGrabacionAlCrm`), y «larga» eran los `segundos` que mandaba
el navegador: el **reloj** desde que empezó a grabar hasta que cerró. Una
sala que se vuelve a abrir —el teléfono recarga la pestaña al volver al
navegador, o se pulsa otra vez el enlace; con la conversación `finalizada`
`queHacerAlAbrir` crea otra— graba otra vez, y en segundo plano el teléfono la
congela: 36 s grabados en varios minutos de reloj. Esa ganaba y tapaba a la
buena en el CRM.

1. **Manda lo que mide `ffmpeg`** del fichero que sale (`laDuracionDelFichero`:
   `-c copy -f null` con `-progress`, recorre los paquetes sin decodificar).
2. **Sin medida** (una sala de antes, o `ffmpeg` que no lee), el reloj del
   navegador **sin pasar de lo que cabe en los trozos** subidos, uno cada
   `TROZO_CADA_MS` (`losSegundosDeLaGrabacion`, pura). Lo mismo para el
   barrido de las huérfanas.
3. Se dice en el log cuando una grabación dura bastante menos que su reloj.

Lo prueba `scripts/banco-grabacion-la-mas-larga.sh`: la regla pura y dos
grabaciones de la misma cita contra Postgres y el `ffmpeg` de verdad (8 s con
8 s de reloj; 3 s con 300 s de reloj): la buena sigue en el CRM y cada una
apunta lo que dura. `MODO=roto` compila la ruta y el cierre de `0442bbb` y
afirma que la de 3 s tapaba a la de 8 s. Dos pruebas de
`grabacion-de-videollamada-db.test.mjs` daban por bueno el reloj (600 s y
3600 s con un solo trozo): ahora piden los trozos que esa duración necesita.

## Videollamada: la DURACIÓN del CRM es la de la grabación, no la del aviso de Tavus

El detalle decía **4:33** y la grabación duraba **1:29**. La grabación era la
buena: va de entrar a la sala a colgar. Los 4:33 los escribe el aviso de Tavus
(`anotarEnElCrm`: «ahora − `entroEn`»), y Tavus avisa cuando CIERRA la
conversación, que es `participant_left_timeout` (**180 s**) después de que el
cliente cuelga (está así para que una caída del teléfono pueda volver a la
misma conversación). 1:29 + 3:00 ≈ 4:33.

1. **Con la grabación viaja su duración**: `laGrabacionParaElCrm` añade
   `durationSecs` (los `segundos` medidos por `ffmpeg`, sección anterior) al
   merge de `raw.call`. Como el cierre y el aviso copian la grabación LUEGO de
   escribir lo suyo (`copiarLaGrabacionAlCrm`), la duración buena gana en los
   dos órdenes.
2. Sin grabación (o sin medida) queda la del aviso: un `0` no pisa nada.
3. No se toca `participant_left_timeout`: acortarlo haría que una caída de
   red cortara la conversación.

Lo prueba `scripts/banco-duracion-de-la-videollamada.sh` (la regla pura y, contra
Postgres y el `ffmpeg` de verdad, los dos órdenes: el CRM queda con ~9 s de
grabación y no con los 273 del aviso). `MODO=roto` compila `dd0a1f7` y afirma
que el CRM se quedaba con los 273.

## Videollamada: la llamada COMPLETA, «Salir» deja de cobrar, y la pantalla de Verzy en el formato de cada sala

Tres cosas pedidas juntas.

**1. La llamada completa en un video.** Una recarga de la página (el teléfono
la recarga al volver al navegador) abre otra grabación: una llamada de 40
minutos cortada a los 30 quedaba en dos ficheros y el detalle enseñaba solo el
de 30. Ahora, al cerrar cada parte, `unirLasPartesDeLaCita` pega TODAS las
partes `lista` de la cita, en el orden en que se grabaron, con el `concat` de
`ffmpeg` sin recodificar, y las guarda como una grabación más de la cita
(`union-<cita>`, `guardarLaUnion`) con la duración de todo: es la más larga y
la que va al CRM sin otra regla. Las partes no se borran. Solo se unen si todas
tienen ese fichero y el mismo formato; si no, se dice y queda la más larga.

**2. «Salir» termina la conversación; una caída espera un minuto.** Tavus cobra
mientras la conversación sigue abierta, y tras colgar esperaba
`participant_left_timeout` (180 s) por si el cliente volvía. Ahora:
- `ESPERA_SI_SE_CAE_S` = **60** (`lib/fin-de-la-videollamada.ts`), para quien se
  queda sin red.
- Al colgar A PROPÓSITO («Salir», la despedida, el límite) sin nadie más en la
  sala (`terminaLaConversacionAlColgar`), la sala llama a
  `DELETE /api/videollamada/sala` (firma de la cita) y el servidor hace
  `POST /v2/conversations/<id>/end` con la clave de la cuenta
  (`terminarLaConversacion`) y la marca `finalizada`: abrir el enlace otra vez
  crea una conversación nueva con lo ya hablado. Un asesor que sale con el
  cliente dentro no la termina. 400/404 de Tavus = ya cerrada.

**3. La pantalla de Verzy en el formato de cada sala.** La pantalla de una cita
era UNA ventana de Chromium y cada sala le mandaba su tamaño: la última en
hablar se la quedaba (el teléfono acababa viendo la vista de escritorio). Ahora:
- La ventana que Verzy mueve (el **conductor**) toma el dispositivo de la
  PRIMERA sala que habla (`laVistaQueToca`); cada otro dispositivo tiene su
  **espejo**: otra ventana del mismo contexto (la misma sesión), con su tamaño,
  su agente y su vista táctil, que sigue al conductor (`seguirAlConductor`):
  la misma ruta (`laRutaQueSigueElEspejo`, con el chat abierto por fila) y lo
  mismo bajado en proporción (`laProporcionBajada`). Sin cursor ni gestos: la
  información es la misma, cambia cómo se acomoda.
- El flujo se pide con `&d=movil|tablet|pc` y cada sala ve su vista.
- El espejo nadie mira en `SIN_MIRAR_MS` se cierra. Por la otra réplica, el
  relevo es por dispositivo (`verzy_pantalla_vistas`).
- El screencast solo manda cuando algo se pinta y un espejo no tiene cursor:
  `tocarParaPintar` cambia un punto de 1 px casi transparente.
- Lo que no se ve en el espejo: el tecleo de una nota en directo (se ve en el
  conductor; el espejo enseña la página).

Lo prueban:
- `scripts/banco-grabacion-completa.sh`: reglas puras; dos partes unidas en
  orden (440 Hz y luego 660 Hz) con el `ffmpeg` de verdad y la duración de
  todo en el CRM; `DELETE` que termina en Tavus una vez; la sala en Chromium
  («Salir» termina; el asesor con el cliente dentro, no). `MODO=roto` contra
  `8488992`.
- `scripts/banco-vista-por-dispositivo.sh`: la pantalla de verdad (Chromium por
  CDP) con una plataforma de mentira: teléfono, ordenador y tableta, cada flujo
  medido por su JPEG (vertical, horizontal, intermedio), la misma página con el
  agente de cada aparato, y los espejos que siguen a Verzy de página y de
  sección. `MODO=roto` contra `8488992`: todos recibían el mismo fotograma.

`banco-silencio-y-pantalla.sh` falla ya en `main` (espera `CALMA_DE_LA_RED_MS
= 600` y el código dice 400): no es de este cambio.
