# Documentación interna, notas, carpetas y formularios

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

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

## La campana: nueve pastillas, y tres fuentes nuevas que NO son un aviso nuevo

La campana tenía seis pastillas. Ahora son nueve, en tres grupos de tres
(`CHIPS_DE_LA_CAMPANA`, `lib/campana.ts`): **Chats, Correos, Citas · Menciones,
Asignaciones, Mis tareas · Seguimientos, Errores, Créditos bajos**. Nueve son
tres filas exactas, así que la rejilla es de tres columnas iguales y ya no hay
reparto de «la última fila a medias».

Las tres nuevas **no estrenan ningún registro**: leen lo que ya se escribe.

| pastilla | de dónde sale | qué se enseña |
| --- | --- | --- |
| Correos | `correosSinLeerAction`, el contador del proveedor (el del menú) | el número, y UN aviso «Tienes N correos sin leer» |
| Asignaciones | `AssignmentLog`, recorriendo la historia de cada conversación (`losCambiosDeAsignacion`) | te asignaron / te quitaron un chat, 7 días |
| Créditos bajos | `ia_credit_alerts`, las filas con las que el motor no repite el WhatsApp (`elAvisoDeCreditos`) | el aviso más grave ya enviado que SIGUE siendo cierto |

Cinco cosas que hay que mantener:

1. **El registro no guarda a quién se le quitó un chat**: una transferencia
   apunta solo a quien la recibe. Por eso se trae la historia ENTERA de las
   conversaciones candidatas —también lo de antes de la ventana— y se compara
   quién la llevaba antes y después de cada fila. `released` y
   `returned_to_ai` la dejan sin nadie; `resolved` y `reopened` no la cambian
   de manos. Lo que hace uno mismo no le avisa.
2. **Créditos bajos refleja el aviso del WhatsApp, no inventa otro**: sin fila
   en `ia_credit_alerts` no sale nada aunque el saldo ande bajo, y una cuenta
   que ya recargó deja de verlo aunque la fila siga (el motor la borra solo al
   renovar). Los umbrales son los de `creditFlags` del motor (50/25/5/0) y el
   saldo se lee con `elSaldoDeLaFila`, la regla del motor.
3. **Correos va aparte y sin esperar**: pregunta a Gmail/Outlook/IMAP, y un
   buzón lento no puede retener la carga del resto. `null` («algún buzón no
   contestó») se pinta «—», nunca 0. Como en Chats, el número es el del
   proveedor: marcar leída la notificación no marca los correos.
4. **Las cuentas se hacen con `losConteos`**, una sola función para las tres
   veces que la campana recuenta.
5. **Que el rótulo quepa se MIDE**: con «99+» en todas y a 390 px, «Créditos
   bajos» se recortaba. El panel pasó a `w-[min(96vw,420px)]`, la pastilla a
   `px-1 gap-0.5` y el número a `px-0.5`; con eso ningún rótulo se recorta en
   ninguna de las cuatro anchuras.

Lo prueba `scripts/banco-campana.sh`: la regla pura, la acción de verdad contra
Postgres (asignada y quitada entre dos asesores, el 5 % con sus cifras, la
cuenta que recargó) y la campana real en Chromium sobre el CSS del build a
1440/1280/1024/390, con números normales y con «99+» en todas. `MODO=roto`
corre todo contra `97ae916` y afirma seis pastillas y ninguna de las nuevas.

### Y el panel mide LO MISMO que los paneles laterales

Iba a `min(96vw,420px)`: 36 px más ancho que el chat del equipo, el copiloto,
las notas y la ficha, que miden `--ancho-lateral` (18/20/22/24 rem). Ahora el
ancho es `ANCHO_DEL_PANEL_LATERAL` (`lib/panel-lateral.ts`), la MISMA clase que
las franjas, y acaba en el mismo filo derecho. En un teléfono sigue acotado a
la ventana.

Y con menos ancho, las nueve pastillas **no se recortan ni pasan a dos
columnas**: por debajo de 22,5 rem de rejilla (`REJILLA_DE_CHIPS`, consulta de
contenedor) cada pastilla pone su número DEBAJO del rótulo (`CHIP_APILADO`),
las nueve igual. Se pregunta a la rejilla, no a la ventana.

Lo prueba `scripts/banco-ancho-de-la-campana.sh`: la campana real y la franja
real de `PanelLateral` en la misma página, a 1440/1280/1024/800/700/390, con
«99+» en todas. `MODO=roto` monta la de `a62250d` y afirma los 420 px.

## Documentación: flecha de regreso, orden propio arrastrando, y una barra

Las cuatro pantallas internas de Documentación (Actualizaciones, Tutoriales,
Guías y Conexión API de Meta) abren con **la misma cabecera**
(`components/documentacion/CabeceraDeDocumentacion.tsx`): la flecha de regreso a
`/documentation` y el título, en el mismo píxel en las cuatro. Y encima **va la
barra de pestañas del panel**, como en Embudos (ver *Documentación es un apartado
del panel*, abajo).

> **Regla de la plataforma: donde haya una lista o unas tarjetas reordenables,
> se reordenan arrastrando y soltando**, como en Módulos. En Documentación son
> tres: las cuatro tarjetas de la portada (`doc-portada`), las guías publicadas
> (`guias-publicadas`, solo la casa) y los tutoriales (`tutoriales`).

Cinco cosas que hay que mantener:

1. **El orden es de la PERSONA**, no de la cuenta: `orden_en_tablero` con
   `tableroId` = `laPersonaQueActua(user).id`. Lo leen y guardan
   `leerMiOrdenAction`/`guardarMiOrdenAction` (`actions/orden-propio-actions.ts`),
   que ponen la persona ellas —ninguna recibe un id de persona— y filtran los ids
   contra la lista de esa pantalla (`losIdsQueValen`). La acción genérica de
   columnas **rechaza** estos tres tipos.
2. **La colocación y el arrastre son los de Proyectos**: `RejillaOrdenable`,
   `TarjetaOrdenable` (con `asa` izquierda, derecha o centro para no pisar lo de
   la esquina) y `moverEnLaListaCompleta`. `useOrdenPropio` es
   `useOrdenDeTarjetas` con otra llave. Con una búsqueda puesta se guarda la
   lista ENTERA y lo escondido conserva su sitio.
3. **La página trae el orden del servidor** (`ordenInicial`), para no pintar la
   lista en un orden y moverla al instante. `comoOrdenGuardado` convierte lo que
   no sea un objeto en «nada colocado».
4. **Guías y Tutoriales van por `BarraDeAcciones`**: el buscador a la izquierda
   y «Nuevo» (`BotonDeCrear`) a la derecha. `BotonDeCrear` no reenvía la ref,
   así que su diálogo se abre con `onClick`, **nunca con `DialogTrigger`**.
5. **Una tarjeta de recurso mide lo mismo que la de al lado**
   (`TarjetaDeDocumento`: título en dos líneas reservadas, detalle en una,
   descripción en dos, botones abajo) en `REJILLA_DE_DOCUMENTOS`: sin eso la
   rejilla de tutoriales salía escalonada. Meta va en bloques con título
   (Elige cómo conectar, Antes de empezar, Credenciales paso a paso, Preguntas
   frecuentes), con los dos caminos del mismo alto.

Lo prueba `scripts/banco-documentacion-simetrica.sh`: las reglas y un barrido,
las acciones contra Postgres (el orden de una persona no mueve el de otra, un id
inventado no entra, un cliente no ordena las guías publicadas) y las pantallas
reales en Chromium a 1440/1280/1024/390 (la flecha en el mismo píxel, «Nuevo» a
la derecha, tarjetas iguales, y arrastrar que reordena y guarda). `MODO=roto`
lee las pantallas de `e3f2e7a` y afirma que no había flecha, ni arrastre, ni
barra.

## Documentación › Actualizaciones: publicar y que salte UNA vez a cada persona

La tarjeta «Plantillas IA» se quitó de Documentación (su pantalla `/templates`
sigue existiendo) y en su sitio va **Actualizaciones**. Orden de izquierda a
derecha: Actualizaciones, Administrador tutoriales, Administrador guías,
Conexión API de Meta. **Cada tarjeta lleva su color escrito** (`accent`): con el
color sacado del índice, reordenar les cambiaba el color a todas. El título
reserva dos líneas y la descripción tres (`min-h-[2lh]`, `min-h-[3lh]`), así el
icono, el título, la descripción y el botón caen a la misma altura en las cuatro.

En `/documentation/actualizaciones` se escribe un texto breve, se sube (opcional)
un video o documento por `/api/upload` y se publica. A cada persona que abra la
plataforma le salta una ventana (`AvisoDeActualizacion`, colgada del layout) con
**la más reciente que no ha visto**; «Ver completo» la agranda y «Cerrar» (o la
X, Escape, fuera) la cierra, y las dos la dan por vista para siempre.

Cinco cosas que hay que mantener:

1. **Publicar, listar y retirar son de la CASA** (`quienMandaEnLaCasa`): lo que
   se publica le sale a toda la plataforma.
2. **Ver y cerrar son de la PERSONA** (`laPersonaQueActua`), y ninguna acción
   recibe un id de persona. `actualizaciones_vistas` tiene `(personaId,
   actualizacionId)` de clave: «una vez» es la forma de la tabla.
3. **Solo salta la MÁS RECIENTE** (`laActualizacionPendiente`, pura; el SQL de
   `laPendienteDe` dice lo mismo y el banco las encadena). Las anteriores sin
   ver no saltan nunca: encadenar ventanas enseña a despacharlas sin leer.
4. **El archivo tiene que ser de NUESTRO bucket** (`comoSeGuardaElAdjunto` →
   `llaveDelArchivoSubido`): si no, la ventana de todos pintaría un `<video>`
   apuntando a donde dijera quien publica.
5. **Dos tablas de la App** (`actualizaciones`, `actualizaciones_vistas`), con
   `ddl()` y sin clave foránea; ni una columna en `User` (#360). Retirar borra la
   fila y sus marcas.

Lo prueba `scripts/banco-actualizaciones.sh`: la regla y un barrido, las
acciones contra Postgres, y en Chromium las cuatro tarjetas (orden y simetría a
1440/1280/1024/390) y la ventana. `MODO=roto` pinta la página de `ANTES_REF` y
afirma «Plantillas IA» dentro y ninguna ventana.

### Enlaces en el texto, y el video se REPRODUCE en la tarjeta

Las direcciones del texto se pintan con `TextoConEnlaces`
(`components/shared/TextoConFormato.tsx`): la MISMA regla de enlaces que los
chats (`partirPorEnlaces`, lo de dentro navega, lo de fuera abre pestaña con
`noopener`) y SIN leer las marcas de WhatsApp: esto no viaja por WhatsApp. En la
ventana, pulsar un enlace la marca como vista y uno de dentro la cierra.

El video no se descargaba por el reproductor: se descargaba por salir como
DOCUMENTO. Tres reglas:

1. **Un mime genérico (`octet-stream`) no decide la clase**: manda la
   extensión (`esUnMimeGenerico`, en `laClaseDelAdjunto`).
2. **El bucket guarda el tipo de lo que HAY** (`elTipoConElQueSeGuarda`, con
   los primeros bytes, en `/api/upload`). En producción se subió un
   «Leads.mp4» que por dentro es un WebM, servido como `video/mp4`: Chrome lo
   reproduce, Safari no.
3. **Reproducir es un botón encima del video** (`data-reproducir-video`), no
   el clic en la superficie, que Safari no atiende; y `controlsList="nodownload"`.

Lo prueba `scripts/banco-contenido-de-actualizacion.sh`, en la tarjeta y en la
ventana con ese mismo video servido como lo sirve el bucket; `MODO=roto` monta
`0a3f714` y afirma el texto plano y la descarga.

## Documentación es un apartado del panel: lleva su barra, como Embudos

Documentación se quedaba sin la barra de pestañas del panel (Operaciones,
Embudos, Proyectos…) que Embudos sí conserva. No era la ruta: las dos viven
fuera de `/panel` (`/documentation`, `/embudos`) y a las dos se la pone el
layout raíz por ser una pestaña del panel. Lo que la quitaba era una lista de
excepciones (`RUTAS_SIN_PESTANAS`), puesta al darle a Documentación su flecha
de regreso.

> **Quién ve la barra lo decide `seVeLaBarraDelPanel` (`lib/barra-del-panel.ts`)
> y no tiene excepciones por ruta.** Toda pantalla cuya dirección sea una
> pestaña del panel —y sus subpantallas, por segmento— la lleva. No se vuelve a
> escribir una lista de rutas sin barra.

**No se mudó a `/panel/documentation`**, y es a propósito: ser un módulo del
panel es que su dirección esté entre sus pestañas (`ModuleItem`), no que cuelgue
de `/panel`. Mudarla rompería los enlaces, las guías, los tutoriales guardados y
los apartados de la base, y el layout de `/panel` además pide sus apartados.

Lo prueba `scripts/banco-barra-del-panel.sh`, pintando el `PanelAwareTabNav`
real con las pestañas de producción: Documentación y sus cuatro pantallas con
la barra y «Documentacion» marcada, la misma barra que Embudos. `MODO=roto`
pinta la de `675dcee` y afirma que Documentación salía sin ella.

## Mis notas: archivar y desarchivar son UN botón con dos caras

Una nota archivada no tenía forma de volver a la lista activa. La acción de
servidor (`unarchiveNote`) existía y estaba importada en `NotesClient`, pero
**no la llamaba nadie**: archivar vivía solo en la barra del editor.

> **El MISMO botón, en el MISMO sitio de la barra** (entre Fijar y Eliminar),
> cambia de cara según `note.isArchived`: caja y «Archivar nota» en una activa,
> `ArchiveRestore` y «Desarchivar nota» en una archivada. Lo decide
> `elMandoDeArchivo` (`lib/archivo-de-notas.ts`, pura) y lo ejecuta
> `handleToggleArchive`, un solo manejador para las dos.

Las dos caras hacen lo simétrico: sacan la nota de la lista que se mira
(activas o Archivo), la cierran, avisan y recuentan las carpetas. Solo el dueño
ve el botón, y la puerta sigue siendo `elDuenoDeLasNotas` en la acción.

Lo prueba `scripts/banco-desarchivar-nota.sh`: la regla y un barrido, las
acciones contra Postgres (ida y vuelta, nadie desarchiva una ajena) y la barra
real en Chromium. `MODO=roto` lee y monta `16e81b7` y afirma que con la nota
archivada el botón seguía diciendo «Archivar nota».

## Mis notas: la pantalla, arreglada al documentarla

Documentar `/notas` destapó fallos que no daban ningún error; las reglas viven
en `lib/pantalla-de-notas.ts` (pura) y las usan la pantalla y las acciones:

| lo que pasaba | ahora |
| --- | --- |
| pulsar una carpeta la abría Y la plegaba: había que pulsar dos veces | `alPulsarUnaCarpeta`: una carpeta nueva se abre desplegada; la abierta se pliega |
| el buscador solo miraba el TÍTULO (`string_contains` sobre la raíz del JSON no encuentra nada) | busca en el título y en el cuerpo aplanado, sin tildes (`translate` + `sinTildes`, una sola lista), y escapa `%` y `_` |
| Archivo y Compartidas ignoraban la búsqueda | buscan igual, y Archivo va fijadas arriba y por su orden |
| el número de una carpeta contaba sus archivadas | cuenta lo que su lista enseña |
| el pie contaba las claves del JSON («type», «doc»…) | `contarPalabras` cuenta lo escrito, y «1 palabra» en singular |
| una lista vacía decía lo mismo sin notas que sin resultados | `elMensajeDeLaListaVacia` dice por qué, y qué se buscó |
| no se podía mover una nota que ya existía a una carpeta | «Mover a carpeta» en su «⋯», y la lista se pone al día (`laNotaSigueEnLaVista`) |
| el «⋯» de una nota o carpeta solo salía con el ratón | también con el teclado y en táctil (`MANDO_QUE_APARECE_AL_PASAR`) |
| eliminar desde la lista no pedía confirmación | la pide, como desde la nota |
| con una búsqueda puesta se podía arrastrar y revolvía el orden | no se reordena buscando, y se dice |
| «Vincular contacto» pedía los contactos de la PERSONA: vacío para el equipo | la ruta lee la cuenta activa de la sesión; un `agente`, solo lo suyo |
| elegir un icono o un color dejaba su menú abierto encima de la nota (botones sueltos dentro del menú) | cada opción es un `DropdownMenuItem`: elegir cierra, y se recorren con las flechas |
| salir del título guardaba la nota entera aunque no hubiera cambiado: «Guardando…» sin tocar nada | `handleTitleBlur` solo guarda si el título cambió |
| las cuatro pestañas del panel llevaban icono y no cabían en 18rem: «Suelt…», «Co…», «Archi…» | la palabra entera y sin icono, cada una del ancho de lo que dice (`flex-auto`), como las pastillas de Chats; la guía se cae si alguna se corta |

Lo prueba `scripts/banco-notas.sh` (reglas, barrido y las acciones y la ruta
contra Postgres); `MODO=roto` corre el código de `24ba0b2` y afirma cada fallo.

## La nota rápida: un papel por PERSONA, que se guarda solo

Una sola nota por persona, en texto plano, que se guarda sola y sigue ahí
mañana. El sitio donde apuntar el dato que acaban de decir por teléfono sin
salir de la conversación que se tiene delante. Y un botón que la asciende a
**nota formal** del módulo de Notas cuando deja de ser un recado.

**La tabla es de la App**, `nota_rapida`, con `CREATE TABLE IF NOT EXISTS`, su
`ddl()` para las dos réplicas y **sin clave foránea**. Ni una columna en `User`:
esa es del BACKEND y añadirle columnas desde aquí es lo que reventó el #360. Y
**la clave primaria ES el `personaId`**: «una por persona» no es una decisión de
la pantalla que alguien pueda saltarse mandando dos, es la forma de la tabla.

### Es de la PERSONA, y el id no llega del navegador

Ninguna de las tres acciones recibe un `userId`, y eso no es comodidad: **es la
puerta**. Una acción de servidor ES un endpoint, así que un id que llegara de
fuera sería la forma de leer —y de pisar— la nota de otro. Aquí no hay nada que
comprobar porque no hay nada que aceptar. Tampoco pasa por `laCuentaDeLaAccion`:
eso resuelve un ALCANCE y esto no tiene alcance ninguno.

Y es la **persona** (`laPersonaQueActua`), no la fila efectiva: dentro de una
cuenta ajena con «Ingresar» el papel sigue siendo el de quien está sentado
delante. Es el mismo reparto que `preferencias_de_persona`.

### Texto plano, y no el editor de la casa

Dos motivos, y el segundo es una trampa menos:

- Lo que se guarda es una cadena, así que el guardado automático —que corre
  mientras se escribe— manda unos bytes y no el árbol entero de un documento.
- Y no hay que pasar por `comoJsonPlano`: lo que sale de tiptap lleva dentro
  objetos con `Object.create(null)` y **no se puede mandar a una acción de
  servidor** sin aplanarlo. Ese arreglo existe y está escrito, pero es un sitio
  menos donde caerse.

Cuando lo apuntado deja de ser un recado, el botón del pie lo manda a Notas y
ahí sí tiene su editor, su carpeta y su título.

### «Se guarda sola» son CUATRO momentos, no un reloj

Un reloj de guardado por sí solo pierde lo último que se escribe cada vez que
alguien cierra la pestaña antes de que salte. Así que se vuelca:

1. al dejar de teclear (`MS_ANTES_DE_GUARDAR`);
2. al **cerrar el panel**;
3. al **esconderse la pestaña**;
4. y al **irse la página**, que es el único caso en el que el navegador ya no va
   a esperar a nadie: ahí va por `fetch(..., { keepalive: true })` contra
   `/api/nota-rapida`, que es lo único que sale con la página muerta. **Una
   acción de servidor no sobrevive a un `pagehide`.**

Esa ruta **no es una segunda puerta**: resuelve `currentUser()` y saca la
persona con la MISMA función que la acción —el id no llega nunca del
navegador— y escribe por `lib/nota-rapida-db`, que es el único camino de
escritura. Con una copia ahí, la nota se guardaría de dos maneras según por
dónde entrara.

Tres cosas más:

1. **Lo que se compara es lo GUARDADO, no lo mandado.** Con lo último *mandado*,
   un guardado que falló contaría como hecho y la tecla siguiente no volvería a
   intentarlo: el texto se quedaría solo en la pantalla y se perdería al
   recargar, sin un solo error a la vista.
2. **Sin cambios no se escribe.** Esto corre cada vez que se deja de teclear, y
   una escritura por pausa sobre una nota que no cambió es una petición para no
   cambiar nada.
3. **Se sanea lo que VUELVE, no solo lo que se manda.** Una respuesta que no
   traiga una cadena —un despliegue a medias, una acción que cambió de forma—
   dejaría el papel en `undefined` y la pantalla se cae al primer `trim()`. Lo
   cazó el banco.

### Ascenderla a Notas: primero se crea, y solo entonces se vacía

**El orden es el único posible.** Al revés, un fallo de `createNote` se llevaría
por delante lo apuntado sin haberlo guardado en ninguna parte — y eso no se
deshace. El banco lo ejerce con el orden INGENUO escrito literal dentro y afirma
la pérdida.

Cuatro cosas:

1. **Se vacía a propósito, y no se pierde nada**: lo apuntado ya está en Notas
   cuando el papel se vacía, así que lo que se borra es la copia. Dejándolo
   puesto, el botón se pulsa dos veces sin querer y quedan dos notas iguales.
   Por eso lo que se dice después del clic no es «listo»: es **qué** se guardó y
   **dónde**.
2. **La crea `createNote`, la de siempre.** No hay un segundo camino para crear
   una nota: de ahí salen gratis el registro de auditoría y dónde aterriza —la
   nota cae donde `/notas` la crearía para quien está mirando, así que se
   encuentra donde se va a buscar—. El papel es de la PERSONA y eso es otra
   pregunta: son dos funciones.
3. **El título es la primera línea CON ALGO**, no la primera a secas —quien
   empieza con un salto tendría una nota sin título—, y **el texto entero entra
   en el cuerpo**, la primera línea incluida: quien asciende un recado espera
   encontrarlo tal cual lo escribió.
4. **Una nota en blanco no se manda**, y el botón se **apaga**, no se esconde:
   un mando que aparece y desaparece mueve de sitio al de al lado justo cuando
   se va a pulsar. Y mientras se manda dice «Enviando…», que es la regla de *que
   se vea que se pulsó*.

### El banco

`scripts/banco-nota-rapida.sh`, en tres mitades porque el cambio vive en tres
capas: las **reglas** puras (dónde cae cada botón, qué se recorta, cómo sale una
nota formal), un **barrido** del código (que los tres compartan forma, que la
columna no vuelva a centrarse a sí misma, que el panel pase por `PanelLateral` y
que ni la acción ni la ruta acepten un id) y las **acciones contra Postgres** más
los **tres botones en Chromium**, donde además se comprueba que la nota se guarda
sola —al parar de teclear y al cerrar— y que reabrir el panel la trae.

`MODO=roto` construye con los botones de un commit **pinchado** —nunca
`origin/main`, que pasa a ser el «ahora» en cuanto esto se fusiona— y afirma el
fallo: dos botones, sin nota, y el copiloto **20 px por encima del centro** en
las cuatro anchuras.

Y se comprobó lo único que dice que un banco mira: quitándole el arreglo al modo
bueno se pone en rojo —el `-translate-y-1/2` de vuelta, el orden ingenuo al
ascender, un `userId` en una acción y el volcado al cerrar el panel—.

## Mis formularios: el formulario público es PÚBLICO, y las reglas viven en un sitio

Documentar la pantalla destapó fallos que no daban ningún error, y el primero
es el que dejaba el módulo sin servir para lo que existe:

| lo que pasaba | ahora |
| --- | --- |
| **`/f/…` y la subida de archivos del formulario mandaban al LOGIN**: el dueño no lo notaba (él tiene sesión) y a sus clientes no les abría | los dos prefijos pasan sin sesión en el middleware, con su puerta propia (formulario activo, carpeta del bucket del formulario) |
| el enlace se armaba con el id de QUIEN MIRA: el de alguien del equipo llevaba a un formulario inexistente | `elEnlaceDelFormulario`, con la cuenta dueña y su URL personalizada |
| el slug quitaba la letra con tilde («satisfaccin») | la regla del enlace del catálogo: se quita la tilde, se queda la letra |
| `{{¿Cuál es tu nombre?}}` no se sustituía, y un «(» sin cerrar tumbaba el envío | `elMensajeDeWhatsapp` sustituye el texto literal |
| la pestaña de Google Sheets se buscaba por nombre exacto: «A sheet with the name … already exists» en cada registro (visto en producción) | `laPestanaDelFormulario`, sin mirar mayúsculas ni espacios |
| el envío público guardaba cualquier clave que llegara, y se podía enviar a un formulario desactivado | solo los campos del formulario, topados, y nunca a uno inactivo |
| las cifras de la lista y de Registros no filtraban; el editor pintaba cifras que no filtraban nada | las cifras SON el filtro (Registros filtra en el servidor); las del editor se fueron al «⋯» |
| las acciones usaban el id de la persona | van por `laCuentaDeLaAccion`, y el equipo ve los formularios de su cuenta |

Las reglas son puras y viven en `lib/formularios.ts`: las usan la lista, el
editor, Registros, el formulario público, las acciones y la guía. **Si otra
pantalla arma un enlace, un slug o un mensaje de un formulario, va por ahí.**

Lo prueba `scripts/banco-formularios.sh` (las reglas, y las acciones y la ruta
de subida contra Postgres con Google fingido); `MODO=roto` corre `ab6b110` y
afirma cada fallo.
