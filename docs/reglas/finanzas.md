# Finanzas

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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
4. **Las cuentas elegidas viajan en los enlaces de la rejilla anual, SIEMPRE
   que no sean la propia y sola** —también UNA cuenta hija—. Sin eso, pulsar
   un mes devolvía la pantalla a la cuenta propia sin decir nada. Ver *pulsar
   un mes del resumen no cambia de cuenta*, abajo.
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

Y «Eliminar todas» **desaparece en cuanto lo que se mira no es la cuenta
propia y sola** —consolidando o con UNA cuenta ajena—: esa acción acota por la
cuenta propia, así que debajo de la lista de otra prometería lo que no hace y
borraría lo que no se está viendo.

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

#### Pulsar un mes del resumen no cambia de cuenta: «la propia y sola» NO es «no consolidar»

Con UNA cuenta hija elegida en el selector, pulsar un mes (o la flecha de año)
del resumen anual devolvía la pantalla a la cuenta madre. Los enlaces de la
rejilla llevaban `?cuentas=` solo «consolidando» —`elegidas.length > 1`—, y el
selector escribe `?cuentas=<hija>` para una sola cuenta ajena: el enlace salía
sin el parámetro y el servidor volvía a la cuenta propia. Ni error ni aviso: la
pantalla cambiaba de cuenta.

> **Son dos preguntas y no se responden con la misma condición.**
> `estaConsolidando` (más de una cuenta) decide lo que SUMA: el desglose, la
> columna «Cuenta», el «Sumando N cuentas». `esSoloLaPropia` decide si se mira
> lo de siempre: si los enlaces llevan la selección, si una fila es ajena y si
> sale «Eliminar todas». Con una cuenta ajena sola, la primera dice «no» y la
> segunda también, y usar la primera para la segunda es exactamente el fallo.

1. **El enlace lo arma `elEnlaceDelResumen` (`lib/accesos-de-finanzas.ts`)**
   con `laSeleccionQueViajaEnElEnlace` (`lib/finanzas-de-la-familia.ts`, pura):
   la regla del selector al revés —solo se calla con la propia y sola, que es
   cuando el selector QUITA el parámetro—. Los tres enlaces de la rejilla
   pasan por ahí; **si se añade otro enlace que mantenga la pantalla, va igual**.
2. **En las listas, una fila es ajena por su dueño, no por consolidar**
   (`esDeOtraCuenta(fila.userId, userId)` a secas). Con una cuenta hija sola,
   el lápiz llamaba a una acción que acota por la cuenta propia y contestaba
   «no encontrada».
3. **«Eliminar todas» va detrás de `esSoloLaPropia`**: borra la cuenta propia,
   así que con la lista de una hija delante borraba lo que no se estaba viendo.

Lo prueban `scripts/banco-cuenta-del-resumen.sh` —las reglas, la ida y vuelta
selector → servidor → enlace → servidor para cada selección posible, y un
barrido del resumen y las tres listas— y `scripts/banco-cuenta-del-resumen-navegador.sh`,
sobre la página servida con una madre y dos hijas de importes distintos: elegir
una hija, pulsar mayo y la flecha de año, y leer la cifra, la URL y el selector;
y en Ventas, que las filas de la hija no se editan ni sale «Eliminar todas».
Los dos con `MODO=roto` contra `fd21c8f` (el navegador, con `BUILD_ANTES`), que
afirma que pulsar mayo volvía a la madre y que las filas de la hija se ofrecían
para editar.

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

## Finanzas: «Compras» abre una COMPRA, con el proveedor de la lista

El acceso «Compras» abría Gastos con `?create=1`, o sea el formulario de un
gasto cualquiera —«Nuevo gasto», sin ningún sitio donde decir a quién se le
compró—. La lista de Proveedores existía y no la usaba nadie. Ventas sí usaba
la suya de clientes.

> **Una compra ES un gasto con proveedor, y no una tabla nueva.**
> `FinanceTransaction` solo conoce `SALE` y `EXPENSE` y su esquema es del
> BACKEND (#360), así que una compra es un `EXPENSE` con `counterparty` = el
> nombre del proveedor y `reference` = `proveedor:<id>`. Sale en Gastos, en el
> resumen y en el balance igual que cualquier gasto, que es lo que es. Las
> reglas viven en `lib/compras-de-finanzas.ts` (puro).

Seis cosas que hay que mantener:

1. **`?create=compra` abre una compra y `?create=1` sigue abriendo un gasto**
   (`elFormularioAlEntrar`). «Nuevo» de Gastos abre un gasto, y los enlaces
   viejos no cambian. Lo que no se reconoce no abre nada.
2. **El `?create=` se quita de la dirección en cuanto se usa**
   (`laDireccionSinCrear`, con `router.replace`), y el guardián del efecto se
   suelta cuando ya no hay parámetro. Sin las dos cosas, pulsar «Compras» por
   segunda vez llevaba a la MISMA dirección y no abría nada.
3. **El proveedor sale de la lista de Proveedores** (`SelectorDeProveedor`, el
   gemelo del «Contacto» de una venta): con buscador por nombre, código o
   teléfono, y un proveedor que no está se crea ahí mismo por la MISMA acción
   que la pantalla de Proveedores (`createFinanceContact`), con su código P-n.
   Se ofrece crear cuando lo tecleado no es el nombre EXACTO de ninguno.
4. **El navegador manda el id, nunca el nombre.** `createExpense` y
   `updateExpense` buscan ese id entre los proveedores ACTIVOS de la cuenta
   (`elProveedorDeLaCompra`) y ponen ellos el nombre y la referencia; uno de
   otra cuenta se rechaza. Y `updateExpense` escribe solo sus campos: con el
   `...data` de antes, una edición podía mover la fila a otra cuenta.
5. **Al editar, el proveedor se manda solo si CAMBIÓ**
   (`elProveedorQueSeManda`): una compra cuyo proveedor se borró después se
   tiene que poder seguir corrigiendo.
6. **Un gasto con proveedor se abre como compra al editarlo** (`esUnaCompra`,
   que mira también el `counterparty`), para no perder ese dato.

Lo prueban `scripts/banco-compras-de-finanzas.sh` —la regla y un barrido, y
las acciones contra Postgres— y `scripts/banco-compras-navegador.sh`, sobre la
página servida: «Compras» abre «Nueva compra» y vuelve a abrir al pulsarlo
otra vez, sin proveedor no guarda, la compra queda con su proveedor, uno nuevo
se crea desde el formulario y sale en Proveedores, y «Nuevo gasto» sigue donde
estaba. Los dos con `MODO=roto` pinchado a `fd21c8f`, que afirma que «Compras»
abría «Nuevo gasto» sin proveedor.

## Finanzas: un fondo claro FIJO necesita su tono de modo oscuro

En «Resumen anual por mes» el valor del mes seleccionado no se veía en modo
oscuro. La casilla elegida iba con `bg-sky-50` —un celeste claro que no cambia
con el tema— y su número no lleva color propio: hereda el del texto de la
tarjeta, que en oscuro es casi blanco. Medido en Chromium: **1,02 de
contraste**, blanco sobre blanco. En claro se veía bien, y por eso no saltaba.

Y al lado había otro igual de mudo: un mes en pérdidas usaba `text-destructive`,
que en el tema oscuro es un rojo OSCURO (es el `--destructive` de los botones de
borrar, que llevan texto blanco encima): **2,00** sobre la tarjeta oscura.

> **La casilla es `MesDelResumenAnual`** (`dashboard/finance/_components/`), y
> sus dos colores son constantes con su tono de oscuro al lado:
> `FONDO_DEL_MES_ELEGIDO` (`dark:bg-sky-950`) y `CIFRA_NEGATIVA`
> (`dark:text-red-400`). En claro no cambia ni un color.

Dos cosas que hay que mantener:

1. **Un fondo de color claro (`bg-*-50`, `bg-*-100`) sobre un texto que hereda
   el del tema necesita su `dark:`**: el texto sí cambia con el tema y el fondo
   no. Es la forma más corta de pintar blanco sobre blanco sin un solo error.
2. **No se arregla tocando `--destructive` del tema oscuro**: ese token es el
   fondo de los botones de borrar. Se pone el rojo claro donde el rojo es TEXTO.

Lo prueba `scripts/banco-resumen-anual-oscuro.sh`: monta la casilla de verdad y
la de antes (su JSX sacado de `fd21c8f` con `git show`) sobre el CSS del build,
en claro y en oscuro a 1440 y 390, y mide el contraste del número contra el
fondo que de verdad tiene detrás. Exige ≥ 4,5 en oscuro, el mes elegido
todavía marcado, y en claro los mismos colores que antes. `MODO=roto` afirma el
blanco sobre blanco y el rojo ilegible.
