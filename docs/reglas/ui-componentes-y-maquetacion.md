# Interfaz: barras, paneles, diálogos y maquetación

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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

### En Chats acomodan; y fuera, TAMBIÉN (ver *El panel empuja el contenido en TODAS las pantallas*)

La ficha de Contacto ya acomodaba la conversación porque es un hermano del flex.
El copiloto y el chat del equipo cuelgan del layout y no pueden ser hermanos de
nada, pero el contenedor de la bandeja ya lleva `data-chat-view`: con un panel
abierto se le reserva la franja por la derecha (`padding-right`). El efecto es
el mismo y no hay que mover ningún panel de sitio. Fuera de Chats esta regla no
aplica —está acotada a ese atributo—, y durante un tiempo eso significó que el
panel se abría encima y tapaba el contenido. Ya no: fuera reserva la envoltura
del layout (sección de abajo).

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

## La X de un diálogo va a 16 px del BORDE, con el relleno medido

En el visor de adjuntos de Chats (un PDF, un documento) la X de cerrar salía
montada sobre la esquina superior derecha, medio afuera. No era del visor: la X
de `DialogContent` iba con `-right-2 -top-2` dentro de la caja de contenido,
pensado para el `p-6` de siempre (24 − 8 = 16 px del borde). En un diálogo
`p-0` —el visor, el simulador, Nuevo mensaje, Macros, el exportador del CRM…—
el mismo `-8px` la dejaba **8 px por fuera**; en uno `px-0`, fuera por la
derecha.

> **`DialogContent` mide su relleno y su hueco entre filas** (`--dialogo-pt`,
> `--dialogo-pr`, `--dialogo-gap`, con `getComputedStyle`, al montar, al cambiar
> la clase y al redimensionar) y la X se coloca a `16px − relleno`
> (`lib/cerrar-del-dialogo.ts`): queda a **16 px del borde por arriba y por la
> derecha** tenga el relleno que tenga. En `p-6` no cambia ni un píxel.

Cuatro cosas que hay que mantener:

1. **La caja pegajosa va con `top-0`**, no con `top: relleno`: en un `sticky` el
   `top` se cuenta desde el borde del relleno del contenedor que desplaza (la
   vista pegajosa descuenta el relleno). Con `top: relleno` bajaba el doble.
2. **Lo que la caja abre se devuelve con el hueco MEDIDO**, no con un `-mt-4`
   fijo: en un `p-0 gap-0` no hay hueco y el `-16px` metía el cuerpo por debajo
   de la cabecera. Y también cuando lo siguiente es un título `sr-only`, que va
   fuera del flujo.
3. **Una pantalla puede centrar la X en su barra** con `--cerrar-arriba`; la
   distancia lateral no se toca. El visor lo hace (1.375rem) y va con `gap-0`:
   la X queda centrada con Descargar y con el mismo hueco a él que al borde.
4. **Nadie reubica la X a mano**: se esconde con `hideCloseButton` o se tiñe con
   `[&>[data-cerrar]>button]:…`. Sheet no tenía el fallo (`right-4 top-4`
   contra su propia caja).

Lo prueba `scripts/banco-cerrar-del-dialogo.sh`: la regla y, en Chromium sobre
el CSS de la App, el visor real (PDF y documento), un diálogo `p-6`, uno `px-0`,
uno `p-0 gap-0` y uno que desplaza, a 1440/1280/1024/390. `MODO=roto` pinta el
mismo arnés con el código de un commit pinchado y afirma la X por fuera y el
cuerpo tapado.

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

## El menú lateral se comprime solo al entrar a CUALQUIER sección

Antes solo Chats lo hacía (al abrir una conversación). Ahora es una regla de la
plataforma: entrar a Correo, Panel, Leads, Herramientas, CRM o cualquier otra
sección deja el menú en su franja de iconos, y se vuelve a abrir con un clic.

> **La regla es `debeComprimirse` (`lib/menu-al-navegar.ts`, pura) y la aplica
> UNA pieza, `ComprimirMenuAlNavegar`, montada una vez DENTRO del
> `SidebarProvider` del layout.** Un colapsador por pantalla es la pantalla que
> se olvida de montarlo; por eso el viejo `ChatSidebarCollapser` —que además no
> lo montaba nadie— se fue.

Cuatro cosas que hay que mantener:

1. **Se comprime al CAMBIAR de ruta, y el efecto depende SOLO de la ruta.** El
   estado del menú se lee por referencia: con `open` en las dependencias, abrir
   el menú a mano lo volvería a cerrar al instante.
2. **La portada (`/`) no es una sección**: no se toca.
3. **En un teléfono no se toca**: allí el menú es una hoja que ya se cierra sola
   al pulsar. `isMobile` nace en falso y lo corrige un efecto del proveedor que
   corre DESPUÉS del de la pieza, así que en el primer pintado se pregunta a la
   pantalla con `matchMedia`.
4. **Chats conserva lo suyo**: abrir una conversación o la ficha de contacto
   sigue comprimiéndolo aunque se haya abierto a mano, y lo devuelve al cerrar.

Lo prueba `scripts/banco-menu-al-navegar.sh`: la regla y un barrido del layout,
y el `SidebarProvider` de verdad en Chromium (1440/1280/1024 y 390).
`MODO=roto` corre la regla de antes y el proveedor sin la pieza, y afirma que
entrar a Correo dejaba el menú abierto.

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

## Los botones del borde: el copiloto es el EJE, y la nota rápida

Eran dos —el copiloto y el chat del equipo— y ahora son tres: de arriba abajo
la **nota rápida**, el **copiloto** y el **chat del equipo**, cada uno con su
panel y nunca dos abiertos a la vez.

### Centrar la COLUMNA no es centrar ningún botón

La columna iba `top-1/2 -translate-y-1/2`, y eso centra **la columna**. Con dos
botones de 36 px y 4 de hueco eso son 76 px de alto, así que el copiloto caía
**20 px por encima** de la mitad de la ventana y el del equipo 20 por debajo:
ninguno de los dos estaba centrado. Con dos botones iguales eso no se nota, y
por eso llevaba años así.

Con tres iguales, centrar la columna vuelve a dar lo correcto **por
casualidad** — el del medio cae justo en el centro—. Y deja de darlo **en
silencio** el día que entre un cuarto botón o que uno cambie de alto: un botón
descuadrado no da ningún error, se ve como una columna torcida y nadie sabe
desde cuándo.

> **La columna se pega a `top: 50%` y se sube lo que mide desde su borde de
> arriba hasta el CENTRO del botón eje** (`elDesplazamientoDelEje`,
> `lib/botones-del-borde.ts`). Con eso el eje queda clavado en la mitad de la
> ventana pase lo que pase, y la simetría de los otros dos sale de que estén a
> la misma distancia de él en la lista.

Cuatro cosas que hay que mantener:

1. **Va en `style`, no en una clase.** Tailwind solo genera lo que ve escrito
   literal, así que un `-translate-y-[58px]` armado en tiempo de ejecución no
   existiría en el CSS y la columna se quedaría sin desplazar **con el build en
   verde**. Es la familia de `removeConsole`.
2. **El eje es el copiloto**, y el orden lo pone `ORDEN_DE_LOS_BOTONES`: el eje
   en medio y los otros dos a un paso por cada lado. Metiendo la nota entre el
   copiloto y el equipo, el eje dejaría de ser el del medio y sus vecinos
   caerían a distancias distintas.
3. **La forma se escribe UNA vez** (`BOTON_DEL_BORDE`). La tenían el copiloto y
   el del equipo, cada uno la suya, con el comentario de «si uno cambia, cambian
   los dos» — que es la forma de reconocer que el día que cambie uno el otro se
   queda. Y **el copiloto ya no trae su posición**: la traía de fábrica y quien
   lo montaba en la columna se la tenía que deshacer con `static right-auto
   top-auto translate-y-0 max-sm:…`; una clase que se pone para quitarla es una
   clase que un día deja de quitarse entera.
4. **Se quedan quietos: no se arrastran.** Lo que sí se arrastra en esta
   plataforma es la ventana de una llamada y la de una reunión, que llevan
   dentro el botón de colgar y pueden tapar lo que se está mirando durante media
   hora. Estos tres son mandos, no ventanas: un mando que cambia de sitio es un
   mando que hay que buscar cada vez.

Y siguen sin tapar la caja de escribir de Chats: la columna mide 116 px con el
eje en su mitad, así que su borde de abajo cae en `50vh + 58px` — a 1280×800 son
342 px de separación y en un móvil de 667 quedan 275. Los 36 px de lado son de
cuando el botón tapaba los tres puntos de las filas, y esa medida se respeta.

## Chats y Correos: el panel vacío es UNO, y una barrita arriba alterna entre las dos

Correo sin correo abierto decía «Elige un correo para leerlo» en gris; Chats
sin conversación tiene su icono grande, título, frase y tres tarjetas. Ahora
los dos son **la misma pieza**, `components/shared/PanelSinSeleccion.tsx`: lo
único propio de cada pantalla es qué dice y qué filtra cada tarjeta (Chats en
`PanelSinChat.tsx`: Mías, Todos, Sin leer; Correo: Destacados, Todos, Sin
leer, cada una con `setFiltro` de SU pastilla). Destacados va en el ámbar de su
pastilla, como «Mías» lleva el violeta de la suya.

Lo prueba `scripts/banco-bandejas-simetricas.sh`: la regla y un barrido, y en
Chromium sobre el CSS del build el panel de Chats de hoy contra el de antes
(sacado de git), el de Correo —con su componente real— contra el de Chats y las
tarjetas que filtran. `MODO=roto` lo corre contra `ANTES_REF` y afirma que no
había panel ni barrita.

### La barra de arriba: el menú primero, sin ruta, y el selector en la columna


> **Una casita lleva al Panel** (`data-boton-del-panel`, dentro de `AlternarBandeja`, 36 px, a un hueco a la derecha de Chats y Correos). Reserva su sitio antes de calcular el selector, que sigue centrado en su columna; el buscador por debajo de `xl` mide `sm:w-40` para que a 1024 el selector conserve sus palabras. Lo prueba `scripts/banco-barra-de-arriba.sh`.

La barra de la plataforma (`components/custom/Breadcrumbs.tsx`) es la MISMA en
todas las pantallas y se lee así:

```
[menú]      [Chats 3 | Correos 12]      …      [tutoriales] [buscar] [soporte] [campana]
            ^ centrado en la columna de la lista
```

1. **No hay casita.** Llevaba al inicio, que ya se abre desde el menú, y en un
   teléfono apretaba los demás iconos. **El menú (las dos flechas) va SIEMPRE
   de primero**, en el mismo píxel en todas las pantallas (16 px, el relleno de
   la barra). La barra mide lo mismo que con la casita: el menú son 28 px con
   `py-3`, y `min-h-7 box-content` lo guarda también en el editor de flujos.
2. **No hay ruta de texto** («leads», «chats»…): no era pulsable de verdad ni
   llevaba a ninguna parte que el menú no lleve. `breadcrumbLabels` sigue
   exportado porque lo usa el copiloto para nombrar la pantalla.
3. **El selector Chats ⇄ Correos sale en TODAS las pantallas** si la persona
   tiene las dos en su menú (`seVeLaBarritaDeBandejas`), y marca la activa
   (`laBandejaActiva`; fuera de las dos, ninguna).
4. **Va centrado en la columna de la lista, no en la barra**: se MIDE
   `[data-columna-de-chats]` (la llevan Chats y Correos) y, donde no hay,
   la columna que habría —`--ancho-lateral` desde el borde del contenido—.
   Es `absolute` dentro de la barra: no empuja nada. Dónde exactamente lo
   decide `dondeVaElSelector` (pura).
5. **Todo botón de la barra es un rectángulo de esquinas redondeadas**
   (`rounded-md`): ni el selector ni la campana son ya píldoras.
6. **Menú → selector con el hueco de los botones de la derecha**
   (`HUECO_DE_LA_BARRA_PX`, 8 px). Y sigue centrado en la columna porque lo que
   cambia es su ANCHO: arranca a un hueco del menú y mide dos veces lo que hay
   del menú al centro de la columna. **Por eso quitar la casita no lo corrió a
   la izquierda**: su centro es el de la columna, lo que ganó fue ancho (el tope
   `PESTANA_MAXIMA_PX` subió a 160 para que la columna más ancha, 24rem, siga
   cabiendo a un hueco del menú). Si centrado se saldría por la derecha (un
   teléfono) conserva el hueco y se acorta. Mide `h-9`, lo que Ver tutoriales,
   Soporte y la campana; con menos de `ANCHO_CON_PALABRAS` enseña solo los
   iconos.
7. **Cada pestaña lleva sus SIN LEER**, con el MISMO número y la misma forma
   que el menú lateral (`elTextoDelContador`, `CLASE_DEL_CONTADOR`): cero y «no
   se sabe» no se pintan, más de 99 es «99+». Chats sale de
   `useChatsQueEsperan` (la pastilla «Sin leer») y Correos de
   `useCorreosSinLeerStore`, **el store que comparten el menú y el selector**:
   la pregunta al proveedor sale una vez por periodo aunque la pidan los dos
   (`pedirSiHaceFalta`, con la pregunta en vuelo compartida). El selector
   también la pide porque en un teléfono el menú no está montado mientras está
   cerrado. Con palabras el número va detrás; solo con iconos, en la esquina de
   la pestaña, para no ensancharla. Por eso una pestaña con palabra pide 116 px
   (`PESTANA_CON_PALABRA_PX`): cabe «Correos 99+».
8. **En el teléfono (por debajo de `sm`, 640 px) «Ver tutoriales» no sale.**
   Allí la barra son ocho iconos en 360 px y no caben: el selector acababa
   encima del botón rojo. «Ayuda», al lado, ya lleva a todas las guías. Es
   `hidden sm:inline-flex` (`BOTON_DE_TUTORIALES_EN_LA_BARRA`,
   `lib/tutoriales-del-modulo.ts`), así que no ocupa sitio y el selector gana
   ese ancho; desde 640 el botón es el de siempre, píxel por píxel. Las guías
   lo siguen nombrando: sus capturas son de escritorio. Lo prueba
   `scripts/banco-tutoriales-en-el-movil.sh` (la barra real, con «Soporte»
   pintado, a 320..600 y 640..1440; `MODO=roto` contra `4af691d` afirma el
   botón encima del selector).

Lo prueba `scripts/banco-barra-de-arriba.sh`: la regla sin navegador (incluido
que el centro con casita y sin casita es el mismo) y la `Breadcrumbs` real en
Chromium en /chats, /correo, /sessions y /schedule a 1440/1280/1024/390, con y
sin tutoriales, con Poppins cargada y con los números puestos (3 y 12, y 0 y
250): el menú primero y en el mismo píxel, el selector centrado, cada número
dentro de su pestaña sin tapar la palabra. `MODO=roto` monta la barra de
`ANTES_REF` (`f3f296c`) y afirma la casita de primera y ningún número.

## El menú lateral: el numerito de pendientes va por la RUTA, esté donde esté el apartado

Al agrupar pantallas dentro de módulos (Bandeja, Contactos, Integraciones,
Herramientas, Automatizaciones…) se perdió el numerito rojo: el menú solo lo
pintaba en dos apartados SUELTOS, con la ruta escrita a mano
(`route === '/chats'`, `route === '/tareas'`). Dentro de un desplegable nadie
lo pintaba.

> **El número va por la RUTA del apartado, no por su nombre ni por el módulo
> donde esté.** Lo decide `lib/pendientes-del-menu.ts` (puro) y lo pinta el
> menú en sus TRES sitios —el apartado suelto (`ContadorSuelto`), el
> desplegable abierto y el menú flotante de la barra plegada
> (`ContadorDelMenu`)— con una sola forma (`CLASE_DEL_CONTADOR`).

| apartado | ruta | qué cuenta | de dónde sale |
| --- | --- | --- | --- |
| Chats | `/chats` | sin leer | `useChatsQueEsperan` (la pastilla «Sin leer») |
| Correos | `/correo` | sin leer en la entrada | `correosSinLeerAction`, el contador del proveedor |
| Agenda | `/schedule` | la pastilla «Pendiente» del tablero, con todas sus cuentas | `pendientesDelMenuAction` |
| Multiagenda | `/bookings` | la pastilla «Pendiente» de su tablero | `pendientesDelMenuAction` |
| Mis tareas | `/tareas` | pendientes de hoy o vencidas | `useTaskStore` |
| Recordatorios | `/reminders` | el grupo «Pendientes» de lo que su LISTA enseña | `pendientesDelMenuAction` |

**Ningún otro apartado lleva número**, y Llamadas tampoco: es un registro. Un
número que no se atiende enseña a ignorar los que sí.

Cinco cosas que hay que mantener:

1. **Chats y Mis tareas no se vuelven a pedir**: ya los tiene el navegador, y
   una segunda fuente diría un día otra cosa.
2. **Cada número es la pastilla de su pantalla, con la MISMA consulta.**
   Agenda y Multiagenda cuentan con `lib/citas-por-estado.server.ts`, que es
   también lo que pintan sus pastillas: PENDIENTE **por atender** —su hora de
   fin no ha pasado; una de ayer que nadie cambió de estado ya no cuenta—, y en
   Agenda con las cuentas del tablero abierto sin filtro (la propia y las que
   cuelgan de ella). Antes el menú contaba solo la cuenta propia y solo lo
   futuro: el tablero decía 4 y el menú nada. **Recordatorios cuenta lo que su
   LISTA enseña** (`seVeEnLaListaDeRecordatorios`): las plantillas de la Agenda
   (`isSchedule`, hora `minutes-30`) no salen en la lista y antes caían en
   «Pendientes» y «Vencidos» del menú y de las pastillas con la lista vacía.
   Y viaja el desfase horario del navegador: sin él, un recordatorio de mañana
   por la noche caería en otro grupo en el servidor.
3. **Correos suma el contador de cada buzón SOLO si se saben todos**
   (`losNumerosDeLasBandejas`, la regla del selector de bandejas): con uno que
   no contesta, sin número; nunca una suma más baja. Va en su propia acción y
   a otro ritmo (2 min): un buzón lento no retiene los demás.
4. **Solo se cuenta lo que está en el menú** (`lasClavesDelMenu`): quien no
   tiene Correo no le pregunta nada a Gmail. Un reloj montado una vez, que no
   pregunta con la pestaña de fondo.
5. **Cero y «no se sabe» no se pintan**, y por encima de 99 dice «99+».

Lo prueban `scripts/banco-pendientes-del-menu.sh` —la regla, un barrido del
menú y la acción contra Postgres; `MODO=roto` lee el menú de `59f08b4` y
afirma que dentro de un desplegable no había número— y el caso de sin leer de
`scripts/banco-correo.sh`, con los tres proveedores fingidos.
