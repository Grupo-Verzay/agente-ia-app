# Proyectos y tareas

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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
