# Chat de equipo

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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

## Chat de equipo: en una fila de mandos, dos cosas distintas NO llevan el mismo glifo

«El icono de teléfono abre un menú con dos opciones, "Llamada de voz" y
"Videollamada", cuando al lado ya está el icono de cámara que hace lo mismo.»

La mitad del reporte es cierta y la otra es peor de lo que parece. La cabecera
de un canal abierto llevaba, en este orden:

| | qué era | glifo |
| --- | --- | --- |
| teléfono | un **menú** con «Llamada de voz» y «Videollamada» | `Phone` |
| cámara | la **REUNIÓN** —una sala con enlace público, hasta cuatro, sin timbrarle a nadie— | **`Video as VideoCamara`** |
| «⋯» | limpiar el historial, solo el súper administrador | `MoreHorizontal` |

Así que la cámara **no hacía lo mismo**: hacía otra cosa entera. Y nada en la
fila lo decía, porque la opción «Videollamada» del menú se pintaba con `Video`
y el botón de la reunión con `Video as VideoCamara` — **el MISMO icono de
lucide, con un alias que escondía la coincidencia al leer el código**. Desde
fuera la cabecera decía «un teléfono que despliega una cámara, y una cámara al
lado»: indistinguibles, y un clic de más para algo de todos los días.

> **En una fila de mandos, dos cosas distintas no pueden llevar el mismo
> glifo.** El menú se va —el teléfono llama de voz y la cámara hace la
> videollamada, las dos de un solo clic— y la reunión pasa a **`Presentation`**,
> una pantalla. Dejarla con la cámara sería el mismo fallo con otro nombre.

Quién sale en qué canal, con qué glifo, con qué rótulo y de qué color lo decide
**`lib/mandos-del-canal.ts`**, que es puro. El banco comprueba la regla como
**invariante y no caso a caso**: si mañana entra un cuarto mando con un glifo
que ya está, se pone en rojo.

Siete cosas que hay que mantener:

1. **El nombre de un mando de llamada ES su modo** (`voz` / `video`, los de
   `lib/modo-de-la-llamada.ts`), no una lista paralela: lo que se despacha al
   oyente es ese mismo valor. Con dos vocabularios, uno diría `video` y el otro
   `videollamada`, y `comoModo` —que cae en voz ante lo que no reconoce, y ahí
   hace bien— arrancaría la videollamada sin cámara y sin decir por qué.
2. **Llamar, SOLO en un directo; la reunión, en CUALQUIER canal.** Un canal de
   varias personas no tiene «el otro» y una llamada de uno a uno no sabría a
   quién sonarle; una reunión es un sitio al que se entra, así que un canal de
   área es justo donde tiene sentido. Esto es la fachada: la puerta sigue en las
   acciones.
3. **La reunión NO se mete en el «⋯».** Era la otra salida y es peor: ese menú
   solo se pinta para el súper administrador (`puedoLimpiar`), así que en un
   canal de área —donde la reunión es el único mando— el resto del equipo se
   quedaría sin ninguna forma de abrirla. Y el encargo era quitar un clic, no
   moverlo.
4. **Las dos llamadas comparten color y la reunión no.** Son dos formas de lo
   mismo; la reunión es otra cosa. Es lo que hace que la fila se lea de un
   vistazo sin abrir nada.
5. **Los colores son clases LITERALES y viven en `lib/`.** Tailwind solo genera
   lo que ve escrito: un color compuesto en tiempo de ejecución no existiría en
   el CSS y el botón saldría sin color **con el build en verde** (la familia de
   `removeConsole`). Y `tailwind.config.ts` tiene que seguir mirando `./lib/**`
   — se comprueba buscando la **declaración** en el build, no la clase en el
   código:

   ```
   npm run build && grep -c "hover\\:bg-emerald-50" .next/static/css/*.css
   ```
6. **`Video` sigue siendo el glifo de Reuniones en SU pantalla**, donde no hay
   ninguna llamada con la que confundirlo. Lo que cambia es el de esta fila.
7. **Y la cámara cambió de significado**, que se dice en vez de disimularlo:
   quien tenía la costumbre de «cámara = reunión» ahora encuentra la reunión en
   el glifo de pantalla, a su derecha. Ese es el precio de que la fila se lea, y
   no es destructivo: una videollamada de más se cuelga.

El mapa de la llave al icono (`ICONO_DEL_MANDO`) vive en la cabecera y no en el
módulo, para que el módulo siga siendo puro: **allí se decide que los glifos son
distintos, en la cabecera qué dibujo lleva cada uno.**

### El banco: la regla aparte, y la cabecera de VERDAD en Chromium

`scripts/banco-mandos-del-canal.sh`, dos mitades, porque el cambio vive en dos
capas. La segunda monta el **`HiloDelEquipo` de verdad** dentro de un panel de
22 rem y no una maqueta de su cabecera, y es la única que puede contestar tres
cosas:

- **que los tres dibujos se vean distintos**, comparando el `svg.innerHTML` de
  cada botón — una maqueta daría por buenos los glifos que el propio banco
  escribiera, que es justo el fallo;
- **que un clic despache la llamada correcta y no abra NINGÚN menú**
  (`[role="menu"]` a cero en el documento);
- **que los tres midan lo que el resto de los controles de la fila**, medido
  contra el botón de volver y no contra un número escrito a mano.

Medido: los tres mandos a **28×28 con glifo de 14**, los mismos que volver, con
4 px entre ellos y el último pegado al filo derecho de la fila a 1440, 1280,
1024 y 390. En un canal de área sale **solo la reunión**.

Y lo que cuesta, medido en el caso MÁS ancho —los tres mandos, el «⋯» del súper
administrador y un nombre que no cabe— porque ese es el que un mando de más
podía romper y el que no se ve probando con un nombre corto:

| | el nombre se queda con |
| --- | --- |
| antes (dos mandos) | 191 px |
| ahora (tres) | **159 px** |

Los 32 px son el botón de más y su hueco. El nombre sigue recortándose con «…»
—entero en el DOM y en su globo— y **nada desborda** en ninguna de las cuatro
anchuras. Es el precio de que la fila se lea sin abrir nada.

`MODO=roto` monta el `HiloDelEquipo` de `ANTES_REF` —pinchado a un commit, nunca
`origin/main`, que pasa a ser el «ahora» en cuanto esto se fusione— y **afirma
el fallo**: el menú con sus dos opciones, y la cámara de «Videollamada» y la de
la reunión con el **mismo SVG**. Comprobado además lo único que dice que un
banco mira: con la cabecera de antes puesta, el modo bueno se pone en rojo por
tres sitios del barrido y por los cinco casos del navegador.

Dos cosas del propio arnés que costaron su vuelta:

1. **El hilo arrastra `next/link`**, que lee `process.env.__NEXT_*`. En un
   navegador suelto no hay nada que lo ponga, así que el módulo revienta al
   cargarse, `window.listo` no llega nunca y el banco se cae con **un plazo
   agotado, que no se parece en nada a su causa**. La página del arnés pone un
   `process.env` vacío, como la del banco del tablero de Embudos.
2. **Un fingido con la llave equivocada se lee como un fallo de la pantalla.**
   `lasSalasDelCanalAction` devuelve `salas`, no `data`: con `data` el diálogo
   de la reunión reventaba en su `salas.length` y el banco decía «no se abrió el
   diálogo» sobre un mando que funcionaba perfectamente.
3. **Un caso que recorre «los mandos que haya» pasa en verde con CERO mandos.**
   Dos de los once medían dentro de un bucle sin exigir antes cuántos había, así
   que con la cabecera de antes —donde `[data-mando]` no existe— pasaban sin
   haber medido nada. Lo cazó justamente quitarle el arreglo al modo bueno, que
   es la comprobación que dice si un banco mira: ahora los **once** se ponen en
   rojo.

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
botón mide 36 px y es uno de los TRES de una columna alineada, así que crecer
los descuadraría a los tres. Re-medido en Chromium al tocar esa columna, como
manda la regla: los tres siguen en 36 px con sus 4 px de hueco, y el copiloto
—el eje— cae en 400 a 1280×800, con la nota en 360 y el equipo en 440. Ver
*Los botones del borde: el copiloto es el EJE*.

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
   dónde se ponen. Desde que son TRES, el `ChatLauncher` ya no trae su
   posición —la traía y quien lo montaba se la tenía que deshacer— y la forma
   se escribe una vez en `BOTON_DEL_BORDE`. Puestos cada uno por su lado habría
   tres cálculos que mantener a la par, y el día que uno se mueva los otros se
   quedan.
2. **No tapa la caja de escribir de Chats**, y está medido en Chromium, no a
   ojo: la columna mide 116 px con el EJE en su mitad, así que su borde de
   abajo cae en `50vh + 58px`. A 1280×800 quedan **342 px** libres hasta el
   compositor; en un móvil de 390×667, **275 px**. Si se añade un cuarto botón
   a la columna, se vuelve a medir: el hueco se come por abajo.
3. **El reloj solo corre con el panel abierto** (`activo`). Esto cuelga del
   layout, o sea de **todas** las pantallas: un sondeo de 5 s corriendo siempre,
   en todas las pestañas del equipo, es una consulta cada cinco segundos por
   pantalla abierta para un panel que nadie está mirando. Y el hilo **no se pide
   hasta abrirlo**, por lo mismo.

Nunca están los dos paneles abiertos a la vez: abrir uno cierra el otro. Son dos
paneles en el mismo sitio, y abiertos a la vez uno taparía al otro sin decir
cuál está delante.

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
