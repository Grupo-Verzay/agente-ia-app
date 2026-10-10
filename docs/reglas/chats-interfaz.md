# Chats: interfaz de la lista, la cabecera y los paneles

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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
4. **Al salir de Chats** se borran las variables y la marca de la bandeja, y
   manda la colocación de fuera de Chats (`MedidaDelContenido`, abajo).

### El panel empuja el contenido en TODAS las pantallas

En Agenda, el Panel, Leads o cualquier pantalla que no fuera Chats o Correo, el
chat del equipo —y el copiloto y la nota rápida— se abría ENCIMA y tapaba la
parte derecha del contenido: la reserva de la franja estaba acotada a
`[data-chat-view]`.

> **La reserva es de la plataforma.** La envoltura del contenido del layout
> (`data-contenido-de-la-app`, la del `sm:p-1`) gana `padding-right` con un
> panel abierto; la caja del módulo (`data-caja-del-contenido`) se estrecha y
> todo se corre a la izquierda. Donde hay `data-chat-view` manda la regla de
> Chats (`:not(:has([data-chat-view]))`): reservar en los dos sitios dejaría el
> hueco dos veces.

Cuatro cosas que hay que mantener:

1. **Se reserva en la ENVOLTURA, no en la caja.** La caja es la que desplaza:
   con el relleno dentro, su barra de desplazamiento quedaría debajo del panel.
2. **La franja se MIDE** (`MedidaDelContenido`, montada una vez en el layout;
   la cuenta es `laFranjaDelContenido`, pura): arriba y alto los de la caja, y
   a la derecha el relleno de la envoltura, leído del lado IZQUIERDO, que no
   cambia al abrir. Con eso el panel empieza justo donde acaba la caja y lo
   medido no se mueve durante el deslizamiento.
3. **Se lee como Chats**: el panel continúa el marco de la caja —borde arriba,
   derecha y abajo, esquinas derechas redondeadas— y el separador es el borde
   derecho de la propia caja, que pierde sus esquinas derechas mientras hay
   panel.
4. **El mismo punto de corte que Chats (`lg`)** y la misma transición: por
   debajo de 1024 no cabe y el panel se abre encima.

Lo prueba `scripts/banco-panel-fuera-de-chats.sh`: la cuenta y un barrido sin
navegador, y sobre la página servida Agenda, Tareas, Leads y Panel a
1440/1280/1024 con los tres paneles (la caja se estrecha lo que mide el panel,
sin hueco ni solape, el filo derecho sigue a la vista y vuelve al cerrar), que
Chats no cambió y que a 900 no se reserva. `MODO=roto BUILD_ANTES=<.next de
626a48c>` afirma que antes el panel tapaba el contenido.

### Y lo que vive DENTRO de una pantalla no puede estar pegado a la ventana

En el creador de flujos, la paleta «Selecciona una acción» es el `Sidebar` de
shadcn con `side="right"`, que nace `fixed inset-y-0 right-0 h-svh`: pegado a
la VENTANA. Con un panel del borde abierto el contenido se estrechaba y la
paleta se quedaba clavada al borde, DEBAJO del panel: se veía su cabecera
—que además tapaba la barra de arriba— y el resto en blanco.

> **Se ancla a su contenedor** (`PALETA_DEL_FLUJO`, `lib/paleta-del-flujo.ts`:
> `absolute h-full`, que pisan `fixed` y `h-svh` al pasar por `cn`; y el
> `SidebarProvider` de la página en `relative h-full min-h-0`). Es una columna
> del contenido: el panel la corre con lo demás y queda como tercera columna.
> **Si otra pantalla monta un `Sidebar` de shadcn dentro del contenido, va
> igual.**

Lo prueba `scripts/banco-paleta-del-flujo.sh` sobre la página servida, a
1440/1280/1024 con los tres paneles; `MODO=roto BUILD_ANTES=<.next de d76c6ff>`
afirma la paleta tapada y encima de la barra.

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
> módulo pisa un `leading-*` suelto); la línea va a **12/14** (fue 11/14 y se
> leía demasiado pequeña) con tamaño propio, **nunca `text-xs`**. El lápiz sigue en 28×28 pero con margen vertical
> negativo, para no fijar el alto; por eso el bloque y la fila recortan solo en
> horizontal (`overflow-x-clip`): con `overflow-hidden` se le cortaría el fondo.

### Y el nombre se pinta como en la LISTA, y no se recorta a lo alto

Con #935 el nombre quedó en una línea de 18 px con `truncate` —`overflow:
hidden` en los DOS ejes— y en `font-bold`, mientras la fila de la lista lo
pinta en 24 px, con `app-item-title` (600) y sin recorte vertical. Un emoji de
color reserva más alto que la letra (medido: **23 px** en una caja de 18), y en
la cabecera salían cuadritos vacíos donde la lista enseñaba los emojis.

> **Cómo se pinta el nombre de un contacto lo dice `lib/nombre-del-contacto.ts`**:
> `TIPOGRAFIA_DEL_NOMBRE` (la de la lista) y `RECORTE_A_LO_ANCHO`
> (`overflow-x: clip` con «…»). La usan la fila de la lista, `CachedSidebar` y
> las dos cabeceras. **Nunca `truncate` en una línea más baja que 24 px**: la
> línea de estado va igual.

Con Poppins, 600 cae en el mismo fichero Bold que `font-bold`, así que la letra
latina no cambia. La ficha de contacto y el subtítulo de los paneles laterales
no tenían el fallo (sin recorte vertical, o 20 px de línea) y no se tocaron.
Lo que **no** se pudo reproducir aquí es el cuadrito en sí: en Linux Noto Color
Emoji cabe en 18 px; el banco lo afirma por geometría (caja de 18 con
`overflow` oculto frente a los 23 que reserva el emoji) y por las fuentes que el
navegador usa en cada glifo, que ahora son las mismas en la cabecera y en la
lista.

La cabecera sigue en 78 px, 6 de margen e iconos de 28. Lo prueba
`scripts/banco-estado-en-la-cabecera.sh` con la `ChatHeader` real en Chromium
sobre el CSS del build, en los seis casos y a 1440/1280/1024, junto a la fila
REAL de la lista con el mismo nombre. `MODO=roto` la pinta desde dos «antes»,
cada uno con su propio CSS: `6686021` (la línea aplastada) y `1a1f6a8` (11 px,
el nombre en otro peso que la lista y recortado a lo alto).

## Chats: ninguna pastilla de la fila es más estrecha que alta

Tres cosas reportadas juntas de la fila de la lista, y las dos últimas son el
mismo defecto: «el círculo del asesor se ve estirado hacia arriba» y «la
píldora de las etiquetas sale como un óvalo de pie, sin color, y dice +1
habiendo dos etiquetas».

Medido en Chromium sobre el CSS del build, con `ChatContactItem` real:

| pastilla | antes | ahora |
| --- | --- | --- |
| etapa del embudo | **detrás** de la calificación | **delante** |
| asesor asignado | **20,9 × 24** | **24 × 24** |
| etiquetas | escondida en el «+N» | **31,7 × 24**, violeta, siempre |
| el «+N» | **18 × 24**, casi blanco | **24 × 24**, con borde |
| notas internas | 22 × 24 | 24 × 24 |
| seguimientos (en la fila) | letra de **14 px** | 12 px, la de sus vecinas |

### 1. El orden: primero la etapa, después la calificación

La fila y el menú de la cabecera contaban lo mismo **al revés**. Se lee
«en qué punto del embudo está» → «cómo de caliente» → «de quién es».

Esto deshace media frase de *Chats: la etapa del embudo*, que decía «va entre
el estado y el asesor». Lo que no cambia es que **la etapa no deja hueco**
cuando la cuenta no usa embudos: la fila reparte con `gap`.

### 2. La regla de la forma: el suelo de una pastilla es su propio alto

Una pastilla de esta fila es `rounded-full` y mide 24 px de alto. Con el ancho
libre, la que lleva poco dentro —dos iniciales, un «+1»— sale **más estrecha
que alta**, y `rounded-full` sobre una caja así no es una pastilla: es un
**óvalo de pie**. No se lee como un ancho mal puesto; se lee como una fila
descuadrada, que es exactamente como se reportó.

> **`FORMA_DE_LA_PASTILLA` (`lib/pastillas-de-la-fila.ts`) pone el suelo:
> `min-w-6`, o sea el propio alto. En su forma más estrecha una pastilla es un
> CÍRCULO, nunca un óvalo.** Y `justify-center`, que es lo que centra el
> contenido cuando ese suelo entra en juego; con el contenido más ancho no hace
> nada. Se escribe **una vez**: con las medidas a mano en cada componente, una
> queda un par de píxeles distinta de la de al lado y nadie sabe por qué.

El **asesor** es aparte, y por eso tiene su propia constante
(`CIRCULO_DEL_ASESOR`): no es una pastilla, es un **avatar**. Fuera de la fila
ya era `h-7 w-7` —redondo—; dentro iba `h-6` con relleno y sin ancho. El ancho
es el alto y el relleno sobra, porque `initials()` devuelve dos caracteres como
mucho. Lo que sí sigue siendo una pastilla, con su relleno, es «Yo», «Tomar» y
«Asignar»: llevan una palabra dentro.

### 3. Una pastilla que YA es un resumen no cae dentro del «+N»

Es lo que producía el «+1» del reporte, y **no se arregla con el tope**: la
fila sigue enseñando seis pastillas (`MAX_BADGES` no se toca) y lo que sobra
sigue cayendo en el «+N».

> **La de ETIQUETAS no entra en ese reparto, y no es un privilegio: es que ella
> ya es un resumen con su propio número.** Cayendo dentro del «+N» quedaban
> **dos números para lo mismo** y el de fuera mentía — con dos etiquetas y la
> pastilla escondida, la fila decía «+1», que se lee como «una etiqueta».
> Resumir un resumen no informa de nada.

Y el «+N» dejó de titular su globo «Más etiquetas»: ahí cae cualquier pastilla
que no cupo —una cita, una nota, un recordatorio— y **nunca una etiqueta**.

### 4. Las contadoras son UNA anatomía, no cuatro parecidas

La espera de un asesor, los recordatorios, la cita, las notas y las etiquetas
son todas *un icono y un número*. Cuatro estaban escritas iguales a mano y la
de etiquetas iba por su cuenta con `text-xs font-medium` y otro relleno. Ahora
salen de `PASTILLA_CONTADORA`, `GLIFO_DE_LA_PASTILLA` y
`NUMERO_DE_LA_PASTILLA`; **lo único suyo es el color**, que cada una escribe
con clases literales —Tailwind solo genera lo que ve escrito, así que un tono
compuesto en tiempo de ejecución no existiría en el CSS—.

Dos cosas que hay que mantener:

1. **`tabular-nums` en el número.** Sin él 1 y 7 no miden lo mismo, la pastilla
   cambia de ancho al subir el contador y la fila se mueve sola.
2. **`data-ui="badge"` donde haya un `.text-xs`.** Dentro de
   `.app-module-content` un `.text-xs` vale **14 px** y solo lo bajan a 12 los
   controles y lo que lleve esa marca. La de etiquetas salía con la letra dos
   píxeles más grande que la de al lado; `SeguimientoBadge` y `FlowListOrder`
   también, y a esas dos la marca se les pone **solo con `compacta`** —la
   prop que ya significa «en la fila de Chats»—: en el CRM y en `/sessions` se
   quedan exactamente como estaban.

### Y no encarece la fila: sigue siendo un renglón

La pregunta razonable es si sacar las etiquetas del reparto hace la fila más
alta. Medido con la columna de verdad —`var(--ancho-lateral)` con las clases de
`LISTA_DE_CHATS` y **con la barra de desplazamiento a la vista**, que se come su
ancho—:

| caso | pastillas | 1440 | 1280 | 1024 |
| --- | --- | --- | --- | --- |
| el normal | 4 | 1 renglón | 1 | 1 |
| el del reporte | 7 | **1 renglón** | 1 | 1 |
| todo puesto a la vez | 8 | 2 renglones | 2 | 2 |

La fila del reporte cabe en un renglón en las tres: la de etiquetas (31,7 px)
ocupa ocho más que el «+1» al que sustituyó. Solo se parte con las ocho —espera,
etapa, calificación, asesor, recordatorios, seguimientos, etiquetas y el «+N»—,
que es lo que `flex-wrap` viene haciendo desde siempre y no es nuevo.

### El banco

`scripts/banco-simetria-de-la-fila.sh`, con `ChatContactItem` REAL sobre el CSS
del build y dentro de `.app-module-content`, a 1440/1280/1024 y con cinco filas
—el caso normal, el tope justo de seis pastillas, una que desborda, una con UNA
etiqueta y otra sin nada—. **El ancho de la columna no se escribe a mano**: sale
de `var(--ancho-lateral)` y de `LISTA_DE_CHATS`, así que las tres anchuras miden
tres columnas distintas de verdad. Comprueba el orden en píxeles (no por el orden del
JSX), que las etiquetas salen siempre con el total y sus nombres en el globo,
que el asesor es cuadrado de lado, y **la regla de la forma en TODAS las
pastillas**, no solo en las dos del reporte.

`MODO=roto` pinta la misma maqueta con los componentes de `ANTES_REF` —un
`git worktree` aparte, nunca `origin/main`— y afirma los tres fallos con sus
números, el «+1» incluido.

Dos cosas del propio banco que costaron su vuelta:

1. **El nodo que se mide no es el hijo del contenedor.** Varias pastillas viven
   dentro de un `TooltipProvider` y de un envoltorio `inline-flex` que no pinta
   nada: hay que bajar hasta el primero con redondeo completo, o se miden
   envoltorios transparentes de 0 px de relleno y el banco dice que todas están
   mal.
2. **El «antes» no lleva las marcas de hoy.** Buscar `data-pastilla-de-etiquetas`
   en el árbol viejo hace que el modo roto se caiga con un plazo agotado en vez
   de afirmar su fallo; se busca por el icono y por el texto, que es lo único
   que existe en los dos mundos.

## Chats: el renglón de pastillas MIDE su hueco, y un tope no puede hacerlo

El renglón de la fila de la lista se partía en dos líneas a veces, y otras
escondía pastillas que sí cabían. Son los dos lados del mismo fallo, y el
fallo era una línea:

```ts
const MAX_BADGES = 6;
```

Un tope en unidades de «cuántas» no puede contestar una pregunta que es de
**ancho**. Las pastillas no miden lo mismo —«Contactado» 86,7 px y una
contadora 36—, así que seis pastillas son 150 px o 300 según cuáles. De ahí los
dos síntomas a la vez, medidos en la columna de verdad (348 px a 1440, con la
barra de la lista a la vista, que se come sus 10):

| | qué pasaba |
| --- | --- |
| **se partía** | la fila del reporte pedía **360,8 px** de 348 **con el tope ya aplicado**, y el renglón iba `flex-wrap`: lo que no cabía bajaba a una segunda línea |
| **escondía de más** | siete pastillas cortas piden 286,2 px de 348 y la séptima se iba al «+N» igualmente |

Y la segunda línea no es solo feo: la lista **estima el alto de cada fila con
un número fijo** (`estimateSidebarItemHeight`) para virtualizar, así que una
fila más alta le descuadra además el cálculo de la ventana.

> **El renglón mide su hueco y entran las que quepan.** Al «+N» va solo lo que
> de verdad no entra. La decisión es `repartirLasPastillas`
> (`lib/renglon-de-pastillas.ts`, pura) y quien mide es `useRenglonDePastillas`.

Y **nunca hay una segunda línea**: el renglón va `flex-nowrap` con
`overflow-hidden`. Eso es la red de seguridad —para el primer pintado y para un
navegador sin `ResizeObserver`—, no la solución: lo que evita el corte es el
reparto.

### Se miden los nodos que YA están, no una copia invisible

`PestanasDelChat` resuelve lo mismo con una fila fantasma, y aquí **no se
puede**: duplicar ocho pastillas —cada una con su `TooltipProvider`— por cada
fila de una lista de miles es justo lo que *la lista es grande, no rehacerla
por gusto* evita.

Lo que lo hace posible sin la copia es **recordar los anchos**: el primer
pintado de una firma lleva todas las pastillas, así que esa pasada las mide
todas y las guarda por posición. Después el renglón ya no las tiene todas
—unas se fueron al «+N»— pero sus anchos siguen guardados y **siguen
valiendo**: una pastilla va `shrink-0` con su contenido fijo, así que su ancho
no cambia porque cambie el de la columna. Cuando cambia la firma se olvidan y
se empieza otra vez con todas.

Cuatro cosas que hay que mantener:

1. **Cada pastilla dice QUÉ POSICIÓN ocupa** (`data-pastilla`), y no se deduce
   del orden de los hijos. Una pastilla puede no pintar ni un nodo: los flujos
   se cargan con `dynamic` y su `loading` es `null`, y un contador en cero
   devuelve `null`. Contando hijos, los anchos se desplazan y a una pastilla se
   le asigna el de la de al lado — **medido: una fila de siete que cabía de
   sobra se quedaba en seis con un «+1»**, porque el ancho de la última no se
   llegaba a medir nunca.
2. **Un array corto no es «hay menos pastillas»: es «falta una medida».** Con
   `slice` las posiciones sin medir desaparecen y el reparto esconde lo que ni
   siquiera se llegó a medir; se construye con `Array.from({ length: total })`,
   y un hueco cae en la guarda de siempre —sin medidas se pintan todas—.
3. **Se mide en CADA pintado, y antes de pintar.** Antes de pintar porque una
   fila que naciera con todas puestas y se repartiera después se vería saltar.
   Y en cada pintado porque lo que cambia el ancho de una pastilla no siempre
   cambia la firma: el nombre de la etapa, el rótulo de la calificación, una
   pastilla que llega un instante después. La fila está memoizada, así que solo
   corre cuando de verdad cambian sus datos.
4. **Y la LETRA cambia sin que cambie nada más.** El primer pintado sale con la
   fuente de respaldo y Poppins llega después, así que las pastillas de texto
   miden otra cosa — y no hay render ni cambio de tamaño del renglón que lo
   despierte. Se vuelve a medir con `document.fonts.ready`. Sin eso, el reparto
   se quedaba con los anchos de Arial para el resto de la vida de la fila.

**Un solo `ResizeObserver` para toda la lista** (uno de módulo, con un mapa de
avisos): la bandeja monta decenas de filas a la vez y uno por fila serían
decenas de objetos; uno solo admite observar N elementos y entrega **una sola
llamada** con todas las entradas.

### Todas las contadoras miden LO MISMO

Son cinco —flujos, seguimientos, la cita, las notas y las etiquetas— y medían
cinco anchos distintos, con **tres anatomías**:

| pastilla | antes |
| --- | --- |
| notas (solo el candado) | **24,0** |
| etiquetas «2» | **31,7** |
| recordatorios «3» | 32,1 |
| cita | 34,0 |
| seguimientos «2» | **34,9** |

La de etiquetas era de las más estrechas, y `rounded-full` sobre la más
estrecha del renglón es exactamente lo que se lee como «esa se ve más redonda
que las otras». Y no era solo el ancho: flujos y seguimientos iban con el
relleno y la letra de una pastilla de TEXTO —6 px y 12— y un punto de 8 px
donde las demás tienen un glifo de 12.

> **Una contadora es un glifo de 12, un hueco de 4 y un número de 10, con 4 px
> de relleno por lado; y su ancho mínimo es el mismo para todas**
> (`ANCHO_DE_LA_CONTADORA`, `min-w-9`).

**36 px no es un número a ojo**: es lo que mide la más ancha del grupo con
**dos cifras** —los recordatorios con «12», 35,5—, así que de una cifra a dos
ninguna cambia de ancho y las cinco salen exactamente iguales. Con tres
caracteres («99+») crece, y crece igual en todas, porque la regla es una.

Y el punto de color de flujos y seguimientos va **dentro de una caja del tamaño
del glifo de las demás**: así el reparto de dentro es el mismo y el número cae
en el mismo sitio en las cinco.

**El «+N» es una contadora más**, y eso no es estética: el reparto tiene que
CONTAR con su ancho **antes de que exista el nodo**. Por eso
`ANCHO_DE_LA_CONTADORA_PX` vive al lado de la clase y el banco comprueba que el
«+N» pintado mide exactamente eso. Ese valor **no decide nada por su cuenta**:
en cuanto el «+N» existe se mide de verdad, y cuando no existe es porque caben
todas, que se contesta sin mirar su ancho.

### «Asignar» es solo la palabra

El icono de persona delante no añadía nada —la pastilla ya dice «Asignar»— y le
quitaba a la fila los píxeles que hacen falta para que quepa una pastilla más.
Con el icono fuera, la palabra se lee sola y la pastilla puede ser **una de
texto como sus vecinas**: la misma letra y el mismo relleno que la calificación
y la etapa (`PASTILLA_DE_TEXTO`). Iba con `text-[10px]` y 2 px por lado, dos
escalones por debajo, justamente para hacerle sitio al icono.

**Cuando ya está asignada no cambia nada**: sigue siendo el círculo de
iniciales. Y sus otras dos caras —«Tomar» y «Yo», que pinta un `agente`—
conservan su icono, porque ahí sí dice algo (tomar es un «+», «Yo» es un ✓),
pero se leen con la misma letra y el mismo relleno.

Una que solo se ve midiendo: **«Yo» del agente es un `<span>`, no un botón**,
así que sin `data-ui="badge"` su `.text-xs` valdría **14 px** dentro de
`.app-module-content`, donde los controles lo bajan a 12 — saldría con la letra
más grande que la calificación de al lado.

### El banco

`scripts/banco-renglon-de-pastillas.sh`, dos mitades, porque el cambio vive en
dos capas: la **decisión** sin navegador —cuántas caben con medidas de verdad,
qué pasa sin medidas, que el renglón no puede envolver— y la **fila real** en
Chromium sobre el CSS del build, a 1440/1280/1024/390 y con ocho filas. Que la
decisión sea correcta no prueba que la fila la use: eso solo se ve midiendo.

`MODO=roto` pinta la misma maqueta con los componentes de `ANTES_REF` —un
`git worktree` aparte, nunca `origin/main`— y afirma los tres fallos con sus
números. Y se comprobó lo único que dice que un banco mira: **quitándole cada
arreglo al modo bueno se pone en rojo** —el `nowrap`, el tope de vuelta, el
ancho común de las contadoras, el icono de «Asignar» y la marca de «Yo»—.

Y tres bancos vecinos miraban el renglón por sus CLASES
(`.mt-1.flex.flex-wrap`, `.flex-wrap`, el padre de la etapa) y se quedaron
ciegos al cambiar el DOM: **un banco que busca una caja por su clase se rompe
el día que la caja cambia de clase, y lo hace pasando, no fallando** — el de la
fila contaba 0 pastillas y daba por bueno «no hay dos líneas». Los tres van ya
por `[data-renglon-de-pastillas]` con la clase vieja de respaldo, que es lo que
mantiene vivo su modo roto.

## Chats: «Sin clasificar» no es un dato, así que no gasta una pastilla

La calificación del lead se pintaba SIEMPRE, y sin calificar decía «Sin
clasificar» dentro de un recuadro de borde punteado. O sea que toda
conversación que nadie ha calificado —que es como nacen todas— gastaba una
pastilla entera del renglón, que es **lo único que escasea en esa fila**, para
enseñar un hueco. Y lo que empujaba al «+N» era la etapa, los recordatorios o
las etiquetas, que sí llevan un dato.

> **La calificación se pinta cuando la hay: Frío, Tibio, Caliente, Finalizado
> o Descartado. Sin calificar no se pinta nada, y no deja hueco** —el renglón
> reparte con `gap`—. Lo decide `seVeLaCalificacion`
> (`lib/calificacion-del-lead.ts`, pura).

Es la misma regla que la etapa del embudo ya cumplía en la fila de al lado: una
cuenta sin embudos no pinta ninguna pastilla de etapa. Lo que no cuadraba es
que dos pastillas vecinas contestaran distinto a la misma pregunta.

### Quitar la pastilla NO puede quitar el mando

Es la mitad que se olvida, y aquí era la cara: esa pastilla **era el disparador
del menú con el que se califica, y el único que hay en Chats** —el menú «⋯» de
la fila no lo ofrecía, y el Contexto del lead solo enseña la etiqueta—.
Escondiéndola a secas, la conversación que hay que calificar —la que nadie ha
calificado todavía— se quedaba sin ninguna forma de hacerlo. Eso es el «menú
cerrado por dentro» que ya costó una vuelta en el tablero de Embudos, y se lee
igual de mal: *no se puede*.

Así que calificar se mudó al **menú «⋯» de la fila**
(`ClasificarLeadSubmenu`), al lado de «Asignar agente» y «Asignar etiqueta»,
que es donde ya viven las acciones de la fila. Va en un **submenú** por la
regla de siempre —*si la lista es el motivo del menú, scroll; si es una opción
más entre otras, submenú*— y no en un botón nuevo de la fila: devolverle un
mando al renglón sería deshacer el arreglo.

Cuatro cosas que hay que mantener:

1. **El camino de escritura es UNO**, `useCambiarCalificacion`, y lo usan la
   pastilla y el menú. Con dos, el día que se afine uno el otro se queda atrás
   —y eso no se ve como un error: se ve como que «desde el menú a veces no se
   guarda»—.
2. **«Sin clasificar» va primero en el submenú y QUITA la calificación**, como
   «Sin asignar» en el del asesor. Sin esa entrada, una calificación puesta por
   error no se podría deshacer desde ninguna parte.
3. **Lo que pinta una pastilla es EXACTAMENTE lo que el menú ofrece.** Si se
   separaran, el menú dejaría poner una calificación que la fila no enseña —un
   cambio que no se ve— o la fila pintaría una que el menú no sabe quitar. El
   banco las **encadena** en vez de comprobar cada una por su lado.
4. **Lo que llega de fuera no decide**: `comoCalificacion` deja pasar las cinco
   y trata cualquier otra cosa como «sin clasificar», que es el lado seguro —se
   borra una calificación, que se vuelve a poner en un clic; nunca se guarda un
   valor inventado que después ninguna pastilla sabe pintar—.

### Y el disparador era el único `h-7` entre pastillas de `h-6`

Lo destapó medir, no leer. Tres pastillas de la fila abren menú, y dos de ellas
SON el botón: `PastillaDeEtapa` y `AdvisorAssignBadge` se pintan con `h-6` y ya
está. La calificación no: su disparador era un `h-7` envolviendo un badge de
`h-6`, o sea **2 px muertos por arriba y por abajo**.

Eso no se ve como una pastilla descuadrada —va centrada— pero **estira la fila
entera**. Medido en la columna de producción, la misma fila con y sin
calificación:

| | alto de la fila |
| --- | --- |
| con calificación | **96 px** |
| sin ella | **92 px** |

Cuatro píxeles que cambian según el lead esté calificado o no, en una lista
donde cada fila lleva al lado otra que no lo está. Y la bandeja **estima el
alto de sus filas con un número fijo** para virtualizar, así que un alto que
varía le descuadra además la ventana. El disparador mide ya lo que la pastilla
que lleva dentro (`DISPARADOR_DE_LA_PASTILLA`).

**En el «antes» esa diferencia no se podía ver**, y conviene saber por qué en
vez de fingir un rojo: allí TODAS las filas llevaban la pastilla —la calificada
y la que decía «Sin clasificar»— así que las dos medían los mismos 96 px. El
fallo estaba igual; solo se convierte en una DIFERENCIA ahora, cuando una de
las dos deja de pintarla.

### Los tres bancos vecinos tenían una fila sin calificar dentro

Y por eso se pusieron rojos al quitar la pastilla, que es lo correcto. Cada uno
se arregló por lo que ese banco viene a probar, no bajando el listón:

- **`renglon-de-pastillas`** y **`simetria-de-la-fila`**: su fila `sinNada`
  ahora sí es lo que su nombre decía desde el principio —ni una pastilla, ni
  renglón, ni la franja de 24 px de un renglón vacío—. Los dos tenían escrita
  la concesión: «conserva la calificación, que se pinta siempre».
- **`pastilla-de-etapa`**: usaba esa fila como **referencia de ancho** —lo que
  mide «Sin clasificar», que es el listón contra el que se acota la etapa—. La
  referencia se mide ya en su propio nodo, con el MISMO componente y el mismo
  `compacta`: sigue viva en el CRM y en el menú. Y su fila `sin_etapa` lleva
  calificación, o se quedaría sin ninguna pastilla y no habría renglón que
  comparar con el de al lado —se estarían midiendo dos cajas distintas—.

Lo prueba `scripts/banco-calificacion-del-lead.sh`, en dos mitades: la decisión
y el invariante que junta las dos listas, sin navegador; y la fila REAL en
Chromium sobre el CSS del build, a 1440/1280/1024/390, donde se contestan las
dos cosas que no se leen en el código —cuánto ancho devuelve quitar la
pastilla, y que el menú «⋯» (que Radix pinta en un portal y solo al abrirlo)
sigue teniendo con qué calificar—. `MODO=roto` pinta la misma maqueta con los
componentes de un commit **pinchado** y afirma los dos fallos: la pastilla
«Sin clasificar» en una conversación sin calificar, y el menú sin ninguna forma
de calificarla.

Comprobado además lo único que dice que un banco mira: **quitándole cada
arreglo al modo bueno se pone en rojo** —la pastilla incondicional tumba dos
casos, el submenú quitado uno, y el `h-7` de vuelta tres—.

## Chats: los dos desplegables de la cabecera se leen igual, y en MAYÚSCULA

Los que se abren desde la cabecera de la conversación —**Etiquetas** y
**Etapas**— son dos componentes que no se parecen por debajo: uno es un
`Command` de cmdk con sus grupos y el otro una lista de botones. Abiertos uno
tras otro se leían como dos pantallas, y la diferencia no estaba escrita en
ninguna parte.

Medido en Chromium sobre el CSS del build, con la `ChatHeader` real:

| | arranca a | lo puesto | el nombre |
| --- | --- | --- | --- |
| Etiquetas | **20 px** del borde del panel | chulito | tal cual |
| Etapas | **16 px** | chulito | tal cual |

> **Cómo se ve una fila de estos dos menús lo decide `lib/filas-de-los-menus.ts`**
> —el sangrado, la caja, la mayúscula y el gris de lo puesto—. Dónde NACE el
> panel sigue siendo `lib/paneles-flotantes.ts`: son dos preguntas y siguen en
> dos sitios.

### La sangría de más la metía el `p-1` del grupo, y no se ve leyendo

Los cuatro píxeles no los escribía nadie: los pone `CommandGroup` por su cuenta.
Así que **esto no lo caza un barrido del código** —los dos componentes se leen
correctos— y solo aparece midiendo. El grupo deja de meter sangría
(`GRUPO_SIN_SANGRIA`) y el rótulo de Etapas gana la que le faltaba
(`SANGRIA_DEL_MENU`): las filas y los rótulos de los dos arrancan ya en el mismo
píxel, en 1440, 1280, 1024 y 390.

Y el sangrado es **un solo número** para las tres cosas —la fila, su rótulo y lo
que se le quita al grupo—: con dos, vuelven a separarse sin que nadie lo note.

### Y el RÓTULO es el mismo, aunque uno lo pinte cmdk

La primera vuelta alineó las filas y dejó los rótulos con dos tipografías: el de
Etapas ya iba en mayúscula y negrita, y el de Etiquetas lo pinta cmdk con las
suyas (`font-medium`, sin mayúscula). Puestas las dos capturas una al lado de
otra se leía a la primera, así que el rótulo también sale de un sitio.

Y sale **escrito dos veces**, a propósito: cmdk no deja ponerle clases al nodo
del título, así que la segunda copia lleva el prefijo de variante
(`[&_[cmdk-group-heading]]:…`). **No se pueden componer en tiempo de
ejecución** —Tailwind lee el código, así que una clase construida con un `map`
no se genera y el rótulo saldría sin estilo con el build en verde; es la familia
de `removeConsole`—. Que las dos digan lo mismo lo comprueba el banco,
derivando una de la otra.

### El nombre va en mayúscula con CSS, nunca convertido

`uppercase` es `text-transform`, así que el `textContent` sigue siendo el nombre
de verdad. Eso no es un detalle de estilo: **cmdk filtra por ese texto**, así que
buscar «ventas» sigue encontrando «Ventas», y el globo enseña el nombre tal cual
se escribió. Convertirlo en el servidor rompería las dos cosas.

Y por eso el globo deja de ser opcional: en mayúscula el mismo nombre ocupa más,
así que se recorta antes. **Todo nombre en mayúscula lleva su `title`.**

### Lo puesto en Etapas es un GRIS, y el peso no es decoración

Fuera el chulito. La etapa en la que está la conversación lleva fondo gris suave
y nada más —ni marca de verificación ni recuadro: un borde dentro de una lista de
filas de 12 px se lee como un recorte—.

Lo que hay que saber antes de tocarlo: **`--muted` y `--accent` son el MISMO
valor en este tema**, así que el gris de lo puesto y el del cursor encima son
indistinguibles. Mientras se apunta a otra fila habría dos grises iguales, y lo
único que sigue diciendo cuál está puesta es el `font-medium`. El banco lo ejerce
—apunta a una fila y compara los pesos— y **se pone rojo si se quita el peso**.

La otra mitad: el `hover` de la fila es ese mismo gris, así que **apuntar a la
fila puesta no le cambia nada**. Un marcador que se pierde al apuntarlo no marca.

Y quitado el chulito, `aria-selected` es lo único que le queda a quien no ve el
fondo: la lista es un `listbox` y cada etapa una `option`.

### Lo que NO entra, y es la mitad que se pierde sola

**Las píldoras de la lista de chats se quedan con su capitalización** —estado,
etapa, etiquetas—. Y el combobox de Etiquetas lo pintan además el CRM y
`/sessions`: allí nada de esto se aplica. Lo que marca «esta es la de la
cabecera» es la prop `panel`, **la misma con la que ya se decide dónde nace el
panel**, y no una segunda condición que el día que se afine una se quede atrás.

Lo prueba `scripts/banco-filas-de-los-menus.sh`, en dos mitades: las reglas y un
barrido —que falla si una píldora de la fila se va en mayúscula, si un componente
escribe la caja a mano, o si `tailwind.config.ts` deja de mirar `lib/`— y los dos
menús **abiertos de verdad** en Chromium a 1440/1280/1024/390. `MODO=roto`
empaqueta el mismo arnés contra `ANTES_REF` y afirma los cuatro fallos: los 4 px
de más, el chulito, ningún nombre en mayúscula y nada marcado con fondo.

Dos cosas del propio banco que costaron su vuelta:

1. **El paquete del arnés y el módulo compilado no pueden llamarse igual.** Los
   dos caían en `lib/__tests__/.compilado/filas-de-los-menus.js`, así que el
   segundo pisaba al primero: en modo bueno colaba por el orden y en modo roto el
   banco de reglas importaba una maqueta de navegador («document is not
   defined»).
2. **El disparador se busca entre los que SE VEN.** `ChatHeader` pinta los dos
   mandos DOS veces —su fila de móvil y su fila de escritorio—, y en un móvil
   viven además dentro de las herramientas **plegadas**, detrás de la pastilla
   «Activa». Un `querySelector` a secas se queda con el del móvil, que a 1440
   está en `display:none`. Es el mismo error que ya costó una vuelta midiendo
   Macros.

## Chats: los controles de la cabecera, a UNA separación; y la marca abre la fila

Dos fallos de la misma cabecera, reportados juntos: el botón de la **etapa del
embudo** separado del grupo por un hueco de más y pegado al de la ficha de
contacto, y cada fila del desplegable de **Etiquetas** arrancando con un espacio
de más antes de su icono.

### 1. El hueco de más era el `gap-3` de la FILA asomando

La fila de arriba son tres cosas: el bloque del contacto, la tira de controles
que se desplaza, y la ficha de contacto —que va **fuera** de la tira a
propósito, o con la conversación estrecha se iría por la derecha (#909)—. Así
que el hueco entre controles salía de **dos** sitios: la tira lo declaraba
(`gap-1.5`) y el de la tira a la ficha lo ponía el `gap-3` de la fila, que está
ahí para despegar el bloque del contacto. Medido en Chromium sobre el CSS del
build, con la cabecera real, a 1440, 1280 y 1024:

```
 6 px  Llamar → asesor → recordatorio → cita → tarea → registros → contexto
 6 px  contexto → etapa → etiquetas
12 px  etiquetas → ficha de contacto     ← el hueco de más
```

Nueve controles a 6 px y el último a 12. Y no estaba escrito como una decisión
en ninguna parte: es el gap de la fila asomando por el **único** sitio donde la
fila separa dos controles en vez de dos bloques.

> **El hueco entre controles es UNO** (`HUECO_ENTRE_CONTROLES` /
> `CLASE_HUECO_ENTRE_CONTROLES`, `lib/cabeceras-de-chats.ts`): la tira y la
> ficha van dentro de una caja con ese hueco, y el `gap-3` de la fila se queda
> para lo único que separa —el bloque del contacto de los controles—. **La ficha
> sigue fuera de la tira**: lo que cambia es de quién hereda su hueco.

Tres cosas que hay que mantener:

1. **La etapa va ANTES de las etiquetas, en las DOS filas** —la de móvil y la de
   escritorio—. Con el orden puesto en una sola, la misma cabecera ofrecería sus
   controles en un orden distinto según la anchura.
2. **En el móvil, `justify-start` y no `justify-between`.** Aquel reparte el
   sobrante ENTRE los huecos, así que ninguno mide lo que declara el `gap` y no
   todos miden lo mismo: medido, **6,7 y 6,6 px** en la misma fila. Es la familia
   de *`justify-start` amontona TODO el sobrante en el último hueco*, por la otra
   punta.
3. **Y el número no se escribe en el componente.** Con el `gap` suelto en la
   cabecera, el día que se afine el de `lib/` este se queda atrás y vuelve un
   hueco que nadie declaró.

### 2. La sangría de Etiquetas la metía un elemento INVISIBLE

La fila abría con un `Check` de 16 px a `opacity-0` mientras esa etiqueta no
estuviera asignada —y **un `opacity-0` no libera sitio: el hueco sigue ahí**—,
así que con su `gap-2` detrás el icono empezaba 24 px más adentro que el punto de
Etapas. Medido:

| | la marca que se VE | el nombre |
| --- | --- | --- |
| Etiquetas (antes) | **40** px del borde del panel | **64** |
| Etapas | 16 | 32 |

**Y el banco de las filas (#920) no lo cazaba**, aunque mide exactamente ese
sangrado: medía el primer **hijo** de la fila —que en Etiquetas es el envoltorio,
y ese sí arrancaba en 16— y no la primera cosa que **se ve**. Un hueco que lo
mete un elemento invisible no aparece leyendo el código ni midiendo la caja de la
fila: aparece midiendo el glifo, y descartando lo que tiene `opacity: 0`.

> **Los dos menús abren con la MISMA marca** (`MARCA_DE_LA_FILA`,
> `lib/filas-de-los-menus.ts`): un punto de 8 px del color de lo que nombra la
> fila —el de Etapas ya iba así—, así que la marca, el nombre y el hueco entre
> los dos caen en el mismo píxel en los dos. Medido después: marca en 16 y nombre
> en 32 en los dos, en 1440, 1280 y 1024.

Cuatro cosas que hay que mantener:

1. **El chulito no se fue: se movió al final**, pegado al contador
   (`CHULITO_AL_FINAL`). Etiquetas es de selección **múltiple**: el gris de
   `FILA_PUESTA` dice «esta está puesta» igual que en Etapas, pero con varias a
   la vez el chulito es lo que deja recorrer la lista y ver cuáles. Al final, un
   hueco reservado no mueve nada de la izquierda y mantiene los contadores en la
   misma columna.
2. **Lo puesto se marca igual en los dos**: `FILA_PUESTA`, y el `font-medium` es
   lo que lo distingue de la fila apuntada —`--muted` y `--accent` son el MISMO
   valor en este tema—.
3. **En Etiquetas la marca sustituye al icono de etiqueta**, que dentro del panel
   de Etiquetas no decía nada que su rótulo no dijera ya y que `CommandItem`
   fuerza a 16 px (`[&_svg]:size-4`, un selector de descendiente que gana a un
   `h-3 w-3` suelto): con el icono, los nombres seguirían sin alinearse.
4. **Fuera de Chats la fila NO cambia.** `SessionTagsCombobox` lo pintan también
   el CRM y `/sessions`, y allí se queda con su chulito y su icono delante. Lo
   que marca «esta es la de la cabecera» es la prop `panel`, la misma con la que
   ya se decide dónde nace el panel, y no una segunda condición.

### El banco

`scripts/banco-botones-de-la-cabecera.sh`, dos mitades. La segunda tiene que ser
en navegador, y las dos cosas que mide lo explican: **cuál `gap` cae entre qué
botones** no se ve leyendo los dos `gap`, y **una sangría que mete algo
invisible** no se ve ni leyendo ni midiendo la caja de la fila. `MODO=roto`
empaqueta el mismo arnés contra `ANTES_REF` —pinchado a un commit, nunca a
`origin/main`— y afirma los tres fallos: 12 px entre el último control y la
ficha, las etiquetas antes de la etapa, y la marca de una etiqueta 24 px más
adentro que la de una etapa.

Comprobado además lo único que dice que un banco mira: **quitándole cada arreglo
al modo bueno se pone en rojo** —sin la caja que envuelve la tira y la ficha,
sin el cambio de orden, y con el chulito invisible de vuelta delante del
nombre—.

## Chats: los iconitos de la fila los elige cada PERSONA, en Apariencia

Perfil › Apariencia lleva DOS tarjetas lado a lado, en su propia fila
(`md:col-span-2`), con un interruptor por cada pastilla del renglón de la fila
de Chats: **Indicadores prioritarios** (calificación, asesor asignado, etapa
del embudo, cita agendada, notas internas) e **Indicadores secundarios** (en
espera de asesor, recordatorios, flujos ejecutados, seguimientos, etiquetas).
Las reglas son puras en `lib/iconos-de-la-fila.ts` (`ICONOS_DE_LA_FILA`,
`TARJETAS_DE_ICONOS`) y las usan la tarjeta, la lista y la fila
(`ChatContactItem`, props `ver*`).

1. **Todos encendidos por defecto**: solo un `false` explícito apaga; lo raro no
   esconde nada (`comoIconosDeLaFila`). Las claves viejas `sinLeer` y
   `resumenIa` se ignoran: ya no tienen interruptor.
2. **Solo pastillas.** El aro, el ancla, archivada, bloqueada, silenciada, el
   tipo de mensaje, escribiendo, las palomitas, la nota o el resumen en la
   línea del mensaje, la marca de línea, sin leer y destacada no se apagan.
3. **Es de la PERSONA** (`laPersonaQueActua`), en
   `preferencias_de_persona.iconosDeLaFila` (JSONB); ninguna acción recibe un id.
4. **Esconder no filtra** ni borra el dato. Guardar avisa a la lista abierta
   (`chats:iconos-de-la-fila`) y, si falla, el interruptor vuelve.

Lo prueba `scripts/banco-iconos-de-la-fila.sh`; `MODO=roto` lee `7d3709d` y
afirma los cinco interruptores de antes.

## Chats: el estado de la sesión es UNA pastilla que ES el interruptor

> **Esta sección manda sobre la del #1192** en cómo se ve el estado de la
> sesión en la cabecera del móvil.

La pastilla «Activa» (verde) / «Pausada» (gris) **es** el interruptor
(`SwitchStatus` con `pastilla`): un solo elemento, sin control al lado. La
versión por defecto y la compacta no cambian (Leads las usa). Y la fila de
herramientas del móvil reparte todo el ancho con `justify-between`, así que al
quitar un icono los demás se reacomodan con huecos iguales y los dos bordes
pegados. Lo prueba `scripts/banco-estado-de-sesion-en-la-cabecera.sh`;
`MODO=roto` lee `f227386` y afirma la pastilla aparte y el hueco.

## Chats: la vista previa de una foto o un video lleva su pie

La fila decía siempre «🖼️ Imagen» / «🎥 Video», aunque el mensaje llevara un
texto. Ahora, con pie, enseña el icono y ese texto en una línea (como la nota
interna: candado y texto); sin pie, «Imagen» / «Video» como antes. Vale para lo
recibido y lo enviado. El pie sale de `imageMessage.caption` /
`videoMessage.caption` o, suelto, de `conversation` (`pieParaLaFila` en
`chat-sidebar.utils.ts`); la etiqueta `[Imagen]`, el rótulo de la burbuja
optimista y el nombre del archivo NO son un pie. Documentos, audios y
stickers no cambian. Lo prueba `scripts/banco-pie-en-la-vista-previa.sh`;
`MODO=roto` lee `1d733ad` y afirma que el pie no salía.
