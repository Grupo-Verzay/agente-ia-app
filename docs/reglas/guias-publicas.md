# Guías públicas (`/guia/<módulo>`)

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Documentación pública: `/guia/<módulo>`, generada desde la App real

Prueba piloto con Leads (`/guia/leads`): un índice con el vídeo y una tarjeta
por sección, y una página por sección con sus pasos y sus capturas. Mismo
sistema que una Propuesta comercial: prefijo público en el middleware,
`robots` noindex en `app/guia/layout.tsx` y `X-Robots-Tag` en `next.config.js`
(también alcanza a las imágenes). No lee nada de la base.

> **El contenido vive en `lib/guia-leads.ts` y las capturas NO se hacen a
> mano**: `scripts/generar-guia-leads.sh` siembra datos de ejemplo, sirve el
> build, y `capturar-guia-leads.mjs` sigue una receta por imagen —abre, pulsa,
> resalta— dibujando recuadros, números y flechas con una capa SVG sobre la
> pantalla real, y graba el vídeo. Las marcas se localizan por `data-zona`,
> encabezados y `aria-label`, no por coordenadas.

Tres cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene**: el banco compara las columnas,
   los contadores y las columnas del CSV documentadas con las de
   `Columns.tsx`, `FilterLeadsByStats.tsx` y `sessions-content.tsx`. Si la
   pantalla cambia, se pone en rojo y hay que regenerar.
2. **Regenerar = `npm run build && scripts/generar-guia-leads.sh`, y después
   volver a construir**: `next start` solo sirve lo que había en `public/` al
   construir. El script se cae si falta una imagen que la guía enseña.
3. **Quitar un aviso de sonner del DOM a mano lo rompe**: el script espera a
   que se vayan solos.

Lo prueba `scripts/banco-guia-leads.sh` (reglas y la guía servida sin sesión
a 390 y 1440); `MODO=roto` afirma que en `73f991f` no existía.

### Las miniaturas del índice llevan ENFOQUE, y son propias de la tarjeta

Cada tarjeta de Secciones reutilizaba la captura de un paso: pantalla
completa, sin 16:9 y casi siempre sin velo, así que se veían planas. Ahora
cada sección tiene la suya, `mini-<slug>.webp`: la zona que explica, nítida y
en su recuadro azul, y el resto bajo el MISMO velo de las capturas de paso.

1. **Una receta para las siete** (`miniaturas()` en `capturar-guia-leads.mjs`)
   y un encuadre puro (`scripts/encuadre-de-la-miniatura.mjs`): 16:9 como la
   tarjeta —con otra proporción el `object-cover` cortaría la zona—, centrado
   en la zona con aire (`AIRE`, `ANCHO_MINIMO`) y sin salirse de la pantalla.
2. **El recuadro se ESCALA con el encuadre** (`escala` de `marcar`): la
   miniatura se ve a una cuarta parte y a escala 1 su trazo sería medio píxel.
3. **Se regeneran solas sin tocar pasos ni vídeo**:
   `npm run build && SOLO_MINIATURAS=1 scripts/generar-guia-leads.sh` (y volver
   a construir). El script deja en `scripts/miniaturas-guia-leads.json` dónde
   quedó cada recuadro.

Lo prueba `scripts/banco-miniaturas-guia-leads.sh` en los PÍXELES: 960×540,
fuera de la zona nada pasa de gris medio, dentro hay blanco y en el borde el
azul del recuadro. `MODO=roto` lee `98a247c` y afirma que las tarjetas usaban
la captura de un paso.

### Publicar una guía REGISTRA su tarjeta en «Tutoriales del módulo»

**Regla para toda guía nueva:** el hilo que publica `/guia/<modulo>` añade, en
el MISMO PR, su fila en `GUIAS_PUBLICADAS` (`lib/tutoriales-del-modulo.ts`):
el módulo, la ruta de su pantalla (la de `navigationRoutes`) y su `Contenido`
(de ahí salen el título «Guía de X», la descripción —el subtítulo— y el
enlace). Con eso la tarjeta sale sola en la ventana «Tutoriales del módulo»
(el botón «Ver tutoriales» de la barra de arriba) de esa pantalla y sus
subpantallas el día que se despliega. **No se deja como paso manual** en
Documentación › Administrador tutoriales.

`getGuidesForPath` junta esas filas con las de `GuidesUrl` (las guardadas a
mano, p. ej. vídeos de YouTube); si alguien ya guardó la misma guía a mano,
sale una sola vez y manda la de la base.

**La descripción de la tarjeta es suya, no el subtítulo de la guía**, y sigue
una regla con dos mitades:

1. **Formato «Aprende a [acción concreta] en la plataforma»**, con un
   beneficio claro para el cliente. Referencia: Diagramas → «Aprende a crear y
   gestionar tus diagramas de flujo en la plataforma». Nada de textos
   genéricos repetidos («Recorrido completo del módulo de X con video
   explicativo y guías»): dicen lo mismo en todas las tarjetas.
2. **75 caracteres como mucho** (`TOPE_DE_LA_DESCRIPCION`), para que quepa en
   UNA línea de la tarjeta. Una tilde o una eñe cuentan uno.

El hilo que publica una guía escribe la suya en el campo `tarjeta` de su fila
de `GUIAS_PUBLICADAS`, y la semilla de la guía (`scripts/sembrar-guia-*.mjs`)
usa ese mismo texto. La regla es UNA función, `porQueNoValeLaDescripcion`, y
la preguntan las guías publicadas (el banco), crear y editar un tutorial a mano
(`createGuide`/`updateGuide`, que rechazan lo que no la cumpla) y el formulario
de Documentación › Administrador tutoriales, que la enseña con su contador
mientras se escribe. Las filas de producción que no la cumplían se corrigieron
el 2026-09-30 (`scripts/descripciones-de-los-tutoriales.mjs`, aplicado con
`scripts/corregir-descripciones-de-tutoriales.mjs`, que solo toca una fila si
su texto sigue siendo el de antes). El banco mide en Chromium, con Poppins, que
cada una cabe en una línea a 1440 y 1024; en un teléfono puede partirse. El banco
(`scripts/banco-tutoriales-del-modulo.sh`) falla si una carpeta de
`app/guia/` no tiene su fila, o si su ruta no está en el menú.

Y todas las tarjetas de esa ventana son iguales: título, descripción y, al
final, «Ver tutorial» (`BOTON_VER_TUTORIAL`): el azul del botón de crear
(`bg-blue-600`) en estilo secundario —fondo blanco, borde y letra azules—,
abriendo en otra pestaña con `noopener`. Nada de «Ver en YouTube» en rojo.
`MODO=roto` monta la barra de `7bdc404` y afirma el botón rojo, y lee
`6d4430c` para afirmar que la tarjeta decía el subtítulo y las semillas el
texto genérico.

### El centro de ayuda (`/ayuda`): las guías por grupo del menú, y sin administrar

«Ayuda», en la barra de arriba justo antes de «Soporte», abre el centro de
ayuda. **No sustituye a «Ver tutoriales»**, que sigue enseñando la guía de la
pantalla que se tiene delante: «Ayuda» es para buscar entre TODAS. Y no es el
«Ayuda» de antes (un WhatsApp de soporte, que se fundió en «Soporte»): este no
habla con nadie. «Ayuda» es aprender a hacerlo; «Soporte», que alguien lo
resuelva; por eso van juntos y con la misma forma.

`/ayuda` es un buscador arriba —por palabra clave, entre las guías de
cualquier categoría, y lleva directo a la guía o a la SECCIÓN que coincide—
y debajo diez tarjetas en dos columnas, **una por grupo del menú lateral**:
Panel, Bandeja, Contactos, Integraciones, Herramientas, Apps Externas,
Entrenamiento, Creación de Flujos, Automatizaciones, y Conexión y Ajustes.
Salen **las diez siempre**; la que no tiene guías dice «Próximamente», y al
entrar, «Estamos trabajando en esta guía».

**La portada va CENTRADA y sin subtítulo**: el título y el buscador —el
buscador y las categorías ya dicen qué se hace aquí—, y el buscador es más
corto que la rejilla (`max-w-xl`, 576 px) y no de lado a lado —de lado a lado
se leía como una barra de filtros más—. En un teléfono el tope no muerde y
ocupa el ancho. La lista de resultados cuelga de la caja del buscador, así que
mide lo que él. El título centrado es una prop de la cabecera compartida
(`centrada`), sin flecha; las listas de cada categoría siguen a la izquierda,
con su flecha en el mismo píxel que en Documentación.

> **Una guía cae en su categoría SOLA, por la ruta de su pantalla**: la de su
> fila en `GUIAS_PUBLICADAS` contra las pantallas de cada grupo
> (`CATEGORIAS_DE_AYUDA`, `lib/centro-de-ayuda.ts`, puro), por segmento y
> ganando la más larga. Publicar una guía con su fila —la regla de arriba— la
> pone también aquí; nadie la clasifica a mano. El banco compara las diez
> categorías con el menú de un cliente (`menu-de-un-cliente.mjs`) y cada guía
> con el grupo donde vive su pantalla: **si el menú mueve una pantalla de
> grupo, el banco se pone rojo** y hay que moverla aquí.

Cinco cosas que hay que mantener:

1. **La lista de una categoría es la de Documentación › Guías SIN lo de
   administrar**: ni «+ Nuevo», ni «Editar introducción», ni arrastrar, ni
   «Guías publicadas». La fila es la MISMA pieza (`FilaDeGuia`, que usa
   también `EditarIntroduccionDeLaGuia` con su botón de editar como hijo): el
   banco mide las dos en la misma sesión. Una segunda fila «parecida» es la
   que se queda atrás.
2. **A la pantalla solo viaja lo que se pinta y se busca**
   (`lasGuiasDelCentroDeAyuda`): título, descripción, enlace, las secciones y
   unas claves topadas. El contenido entero de las guías se queda en el
   servidor.
3. **`/ayuda` no es una ruta de ningún módulo**, a propósito: el guardián del
   layout solo cierra rutas que están en algún módulo, así que la abre
   cualquiera con sesión. No se añade a `navigationRoutes`.
4. **Un botón más a la derecha no le puede costar las palabras al selector
   Chats ⇄ Correos**: a 1024 faltaban 6 px y se quedaba en iconos. El
   buscador global mide `w-56` por debajo de `xl` (`w-64` desde ahí), y el
   banco exige «Chats Correos» a 1024, 1280 y 1440.
5. **La barra de las guías se numera con SIETE partes**
   (`PARTES_DE_LA_BARRA_DE_ARRIBA`, con «Centro de ayuda» entre el buscador y
   «Soporte», y `lasPartesDeArriba` del taller en el mismo orden). Cuando la
   barra gana o pierde un botón, la foto de TODAS las guías se rehace SOLA,
   sin regenerar ninguna guía entera:
   `npm run build && scripts/regenerar-barra-de-las-guias.sh && npm run build`
   (`SOLO=leads,catalogo` para unas). La foto se toma con `laFotoDeLaBarra`
   —la misma receta que al generar una guía— y deja su huella en
   `scripts/barra-de-las-guias.json`; el banco falla si una imagen no es la
   apuntada o si se tomó con otras partes. Los vídeos de las guías no se
   rehicieron: nombran la barra de pasada y no la numeran.

Lo prueba `scripts/banco-centro-de-ayuda.sh`: las reglas y un barrido sin
navegador, y en Chromium sobre el CSS del build la barra, la portada, el
buscador, una categoría con guías, otra sin ellas y la fila contra la de
Documentación, a 1440/1280/1024/390 —con el TEXTO del título medido con un
`Range`: la caja de un título a la izquierda también está centrada—.
`MODO=roto` lee y monta la barra de `fd8b831` y afirma que no había «Ayuda»
ni centro de ayuda, y la portada de `38be58b` y afirma el título a la
izquierda, con su subtítulo, y el buscador de lado a lado.

### «Tutoriales» de la landing: una sección ANCLADA, como Preguntas frecuentes

El menú de la landing lleva «Tutoriales» entre «Funciones» y «Precios» (barra,
menú del teléfono y pie) y baja a la sección `#tutoriales` de la MISMA página:
las categorías y su lista de guías cambian de vista ahí dentro
(`TutorialesDeLaLanding`), con la barra de arriba fija. Antes abría una página
aparte (`/tutoriales`) cuyo logo llevaba a «/», o sea al login sin sesión.

**No es una copia**: pinta `CentroDeAyuda` y `GuiasDeLaCategoria` con
`lasGuiasDelCentroDeAyuda()`, igual que `/ayuda`, con dos props propias:
`alElegirCategoria` / `alVolver` (cambian de vista en vez de navegar) e
`incrustado` (sin cabecera ni scroll propio). Va bajo la clase `dark` para tomar
los colores de la landing.

**Y la GUÍA también se abre dentro** (`#tutoriales/<categoria>/<modulo>[/<seccion>]`):
«Ver» de una fila y un resultado del buscador ya no sacan a `/guia/<modulo>`
—otra página, otro diseño, sin la barra de la landing—. La pinta
`GuiaEnLaLanding` con las MISMAS piezas de `components/guia/Guia.tsx` (vídeo,
introducción, `CuadriculaDeSecciones` y `ArticuloDeLaSeccion`), que aceptan
callbacks opcionales (`alAbrir`, `alAbrirSeccion`, `alVerElVideo`): con ellos
pintan un botón que cambia de vista; sin ellos, el `Link` de siempre, así
`/guia/*` no cambia. Cinco cosas:

- **El contenido se pide al abrir** (`laGuiaPublicaAction`, pública a propósito,
  solo de lo que está en `GUIAS_PUBLICADAS`): las diecinueve guías son cientos
  de KB que la landing no puede llevar a cuestas. Se recuerda por módulo, y un
  fallo dice «Reintentar».
- **Va en su recuadro CLARO** dentro de la sección oscura: sus capturas lo son.
- **«Ir al vídeo» baja sin tocar el ancla**: `#demostracion` pisaría la de los
  tutoriales y la vista se perdería.
- **La flecha vuelve a SU categoría** («Volver a <categoría>»), y un ancla rota
  cae en lo más cercano que exista (`laVistaDelAncla`: sección → índice de la
  guía → categoría → portada).
- `/guia/<modulo>` sigue existiendo: las tarjetas de «Ver tutoriales» del panel
  y los enlaces ya repartidos llevan ahí.

Cuatro cosas que hay que mantener:

1. **La vista vive en el ancla** (`#tutoriales/<slug>`, `lib/tutoriales-de-la-landing.ts`,
   puro), escrita con `replaceState`. Un ancla de categoría no es el `id` de
   nada, así que al cambiar (cargando o sin recargar) la sección baja sola.
2. **El logo lleva al principio de la landing** (`#inicio`, el `id` de su raíz),
   en la barra y en el pie, y deja la dirección limpia.
3. **`/tutoriales` y `/tutoriales/<slug>` redirigen** a `/inicio#tutoriales[/slug]`
   (`elEnlaceDeTutoriales`); siguen sin pedir sesión en el middleware.
4. Ni una guía ni una categoría escrita a mano en la landing.

Lo prueba `scripts/banco-tutoriales-publicos.sh` (con build): el código y la
página servida sin sesión a 1440 y 390 —se navega sin salir de `/inicio`, la
barra sigue arriba, el logo vuelve arriba, las direcciones viejas redirigen,
«Ver» abre la guía y una sección con sus capturas sin salir, «Siguiente», la
flecha a la categoría, el enlace directo a una sección y el buscador—.
`MODO=roto` lee `ffe0583` y afirma la página aparte y el logo que no llevaba al
inicio, y `2114b64` (`ANTES_GUIA_REF`) para afirmar que «Ver» abría otra pestaña.

### La barra de arriba lleva la demostración, y el vídeo va justo debajo

`CabeceraDeLaGuia` es UNA fila de 56 px en rejilla simétrica
(`minmax(0,1fr) auto minmax(0,1fr)`): «Guía de la plataforma» a la izquierda,
«▶ Demostración en 1 minuto» en el CENTRO (enlace a `#demostracion`, prop
`demostracion`) y «Módulo X» a la derecha (prop `modulo`). No hay título aparte
encima del vídeo: arranca justo bajo la barra, con el mismo aire arriba que a
los lados (`pt-4 sm:pt-6` = `px-4 sm:px-6`, en `CONTENEDOR_DEL_INDICE`). En un teléfono «Guía de la
plataforma» se queda en su icono para que quepan los tres; en una sección el
centro va vacío. **Las guías de otros módulos usan la misma barra con sus
props.** Lo prueba `scripts/banco-cabecera-de-la-guia.sh` (hace falta build),
a 360..1440; `MODO=roto` pinta la de `9e38996` y afirma el título aparte.

### El índice termina en la línea divisoria, y nada debajo

Debajo de las tarjetas de cierre había una nota —«Las capturas se toman
automáticamente de la plataforma real, con datos de ejemplo»— que es interna y
al cliente no le dice nada. Se fue, y con ella el relleno de abajo: **el índice
de toda guía termina en `FinDeLaGuia`** (la línea divisoria) dentro de
`CONTENEDOR_DEL_INDICE` (sin `pb-*`), los dos de `components/guia/Guia.tsx`.
Una guía nueva usa las dos y no escribe su propio pie. Lo prueba
`lib/__tests__/fin-de-la-guia.test.mjs` (desde `banco-guia-leads.sh`), que
barre todas las guías de `app/guia/*`, y la sonda servida mide que no queda
nada debajo de la línea; `MODO=roto` lee `9e38996` y afirma la nota.

### La introducción ocupa el ancho del contenedor, como el vídeo

El párrafo de introducción del índice (`IntroduccionDeLaGuia`) llevaba un
`max-w-3xl` (768 px) que en escritorio lo cortaba antes que el vídeo y la
cuadrícula, dejando un hueco a la derecha. Ya no tiene tope: mide lo que el
contenedor (`max-w-5xl`). En tablet y móvil el contenedor ya era más estrecho
que 768, así que allí no cambia nada. Lo prueba
`scripts/probar-introduccion-de-la-guia.mjs` (desde `banco-guia-simetrica.sh`),
a 390/768/1024/1280/1440; `MODO=roto` pinta la de `98a247c` y afirma el hueco.

### El vídeo: el cursor de VERDAD y narración, sin marcas encima

Chromium sin cabeza no graba el puntero, así que se dibuja
(`scripts/cursor-de-la-guia.mjs`): la **flecha** al moverse, la **manito**
sobre lo que se pulsa y la «I» en un campo —lo que pintaría el navegador,
decidido por el `cursor` calculado y el tipo de elemento—. **Sin halo, sin
círculo y sin encogerse al pulsar**: con cursor real y voz, las marcas sobran.

La narración (`scripts/narracion-guia-leads.mjs`) va con **Cedar de OpenAI**,
la misma voz del asistente de «Llamar con IA» (`lib/voicebot-voices.ts`), y es
**la voz estándar de toda guía nueva** (`scripts/voz-cedar.mjs`: modelo
`gpt-4o-mini-tts`, sus instrucciones de tono y pronunciación). La pega
`ffmpeg` en Opus (`scripts/voz-de-la-guia.mjs`). Tres cosas:

1. **Cada frase sintetizada va a una caché COMITEADA**
   (`scripts/voz-de-la-guia/cedar/<llave>.ogg`), con la llave sacada de modelo,
   voz, instrucciones y texto: regenerar no repaga lo que no cambió, cambiar
   una frase nunca suena con la vieja, y el vídeo se regenera sin red hacia
   OpenAI. Lo que falte se llena con
   `node scripts/sintetizar-voz-de-la-guia.mjs [narración]`, con red hacia
   `api.openai.com` —que el entorno de trabajo en la nube NO tiene— y la llave
   **«IA CRM» de Panel › API keys** (`verzay_api_keys`), no la variable de
   entorno: `OPENAI_SYSTEM_API_KEY` es la de «Grupo Verzay» (…g6QA) y OpenAI la
   rechaza (401). La primera vez se sintetizó desde el contenedor de la App,
   leyendo esa llave por su nombre con Prisma.
2. **Sin la frase NO se cae a otra voz**: se dice qué falta. La voz de antes
   —`espeak-ng` + MBROLA `es3`, con su `arreglarPho` y su `comoSeDice`— se
   conserva solo a pedido (`VOZ_GUIA=mb-es3`). Y `scripts/voz-de-la-guia/leads.json`
   dice con qué voz y qué guion se narró el vídeo publicado: el banco falla si
   no es Cedar o si el guion cambió sin regenerar.
3. **Una frase no empieza hasta que la anterior terminó de sonar**: nunca
   suenan dos a la vez. Pero lo que se HACE en pantalla ocurre mientras suena
   (ver *El ritmo de la narración*, abajo): esperar a que acabe cada frase
   para actuar es lo que la dejaba cortada.

Lo prueba `lib/__tests__/video-guia-leads.test.mjs` (en `banco-guia-leads.sh`);
`MODO=roto` lee `153f64f` y afirma la bolita con halo y el vídeo mudo, y
`9e38996` para afirmar que la voz era espeak y no Cedar.

### El ritmo de la narración: el de una llamada, no el de un tutorial

La misma voz que habla fluido en «Llamar con IA» sonaba pausada y cortada en el
vídeo. Medido: ~145 palabras por minuto, pausas de medio segundo a 0,8 s DENTRO
de cada frase, huecos de hasta 2,5 s ENTRE frases y 4 s mudos al empezar. Eran
cuatro causas, y se arreglan las cuatro:

| causa | arreglo |
| --- | --- |
| las instrucciones pedían «ritmo pausado de tutorial» | piden el ritmo fluido de una llamada por WhatsApp (`VOZ_CEDAR.instrucciones`) |
| el modelo mete pausas largas en cada coma, y no siempre obedece | `acortarLasPausas` (`voz-de-la-guia.mjs`) deja cada pausa interior en `RITMO.pausaMaximaMs` (280 ms) y los bordes en 30/60 ms. **Solo quita silencio**: la voz sale entera |
| el guion esperaba a que acabara cada frase, respiraba 450-1200 ms, hacía la acción y solo entonces hablaba | las acciones van DENTRO de la frase, en la palabra que las nombra (`alDecir("Clientes inactivos")`), y entre frases solo `RESPIRO_ENTRE_FRASES_MS` (250) |
| frases sueltas de cuatro palabras («Y con Total vuelves a verlos todos») | una frase por idea, como se habla: «…y con Total vuelves a verlos todos» va dentro de la de los contadores |

Y lo grabado antes de la primera palabra —la página cargando— se recorta
(`mezclar(…, { desdeMs })`), cortando vídeo y pista en el mismo instante para
no mover la sincronía; por eso el vídeo se vuelve a codificar (VP8). Y el
vídeo acaba con la narración (`-shortest`): la grabación seguía mientras se
cerraba el navegador y dejaba 4-5 s mudos al final.

Cinco cosas que hay que mantener:

1. **`speed` no sirve con `gpt-4o-mini-tts`**: se probó y no cambia nada. El
   ritmo sale de las instrucciones y del recorte de pausas.
2. **Dónde cae una palabra se estima por su posición en el texto**, que con las
   pausas ya acortadas va casi parejo. `alDecir` se cae si el trozo no está en
   la frase que suena, y el banco lo comprueba leyendo el guion.
3. **Nada de esperas mudas en el vídeo**: ni `quitarAvisos` (los avisos se van
   solos mientras se sigue hablando) ni un `callar(n)` largo antes de la
   última frase.
4. **El ritmo queda escrito con el vídeo** (`leads.json`: `RITMO` y el respiro).
   El banco falla si el publicado se hizo con otro: se regenera.
5. **Sintetizar sigue siendo desde el contenedor de la App** (la red de aquí no
   llega a OpenAI): se pide `laPeticion(texto)` con la llave «IA CRM» y el Opus
   se guarda en `rutaDeLaFrase(texto)`. Cambiar las instrucciones cambia la
   llave de TODAS las frases: se vuelven a sintetizar todas y se borran las
   viejas (el banco falla si queda un `.ogg` que ninguna guía dice).

Lo prueba `lib/__tests__/video-guia-leads.test.mjs`: el recorte con audio de
prueba, cada frase ya acortada (ninguna pausa por encima del máximo; el
conjunto ≥ 160 palabras por minuto), el guion y el vídeo publicado medido con
`silencedetect` (≤ 0,7 s mudo al empezar, ningún hueco de más de 1,2 s).
`MODO=roto` lee `c3ae539` y afirma el ritmo de antes.

### Y la imagen se iba quedando DETRÁS de la voz: `recordVideo` estira

Medido en el vídeo, con el rótulo de abajo —que cambia justo cuando empieza
cada frase— como marca: la imagen iba **0,3 s** detrás de la voz al empezar y
**5 s** al final, y el vídeo duraba 4-5 s más que su narración. No era el
guion: era cómo graba Playwright.

`recordVideo` escribe, por cada fotograma que manda el navegador,
`max(1, round(25 · Δt))` fotogramas (`videoRecorder.js`). Cuando el navegador
pinta más deprisa que 25 por segundo —el cursor moviéndose, un texto
escribiéndose, un menú abriéndose— cada uno cuenta **40 ms aunque hayan pasado
16**: diez segundos de animación salen como veinticuatro. Y como el desfase se
acumula donde hay movimiento, no es un retraso fijo que se pueda restar.

> **El vídeo se graba con `scripts/grabadora-de-la-guia.mjs`**: el MISMO
> screencast (CDP `Page.startScreencast`, JPEG al 90 %), pero cada fotograma
> se coloca por su hora de pintar con redondeo ACUMULADO (`fotogramasHasta`):
> el fotograma k enseña lo último pintado antes de `inicio + k · 40 ms`. El
> fotograma 0 es `t0`, el mismo instante desde el que se coloca la voz, así
> que las dos pistas comparten origen.

Tres cosas que hay que mantener:

1. **Nada de `recordVideo` en el vídeo de una guía.** Las capturas fijas no
   graban nada y no les afecta.
2. **Los JPEG van tal cual a un MKV** (`-c:v copy`) y `mezclar` codifica una
   sola vez, al recortar. Y el vídeo acaba con la narración (`-shortest`).
3. **`leads.json` dice dónde empieza cada frase en el vídeo publicado**
   (`empiezanEnMs`), y el banco busca ahí el cambio del rótulo en la imagen: si
   la imagen se despega de la voz más de medio segundo, se pone en rojo.
   `MODO=roto` afirma que el vídeo de antes se grababa con `recordVideo` y su
   imagen duraba más de 3 s que su voz.

### La pantalla va con su MARCO: el menú y la barra de arriba de un cliente

La primera guía enseñaba Leads sin su marco: el menú de la izquierda salía como
letras recortadas («C…», «E…», «L…») y la barra de arriba no se nombraba. **Las
dos cosas nacían en los datos de ejemplo, no en la pantalla**: se sembraban tres
módulos con iconos de lucide (`MessageCircle`) y el menú dibuja los de `iconMap`
(`schema/module.ts`) —sin icono pinta el nombre recortado—; y la cuenta era
`admin`, así que la barra no llevaba «Ver tutoriales» ni «Soporte».

> **Las capturas se toman con la cuenta de un CLIENTE y su menú de verdad.**
> `scripts/menu-de-un-cliente.mjs` es una foto (solo lectura, sin ningún
> `customUrl`: el repositorio es público) de los módulos que ve un cliente en
> producción; `sembrar-guia-leads.mjs` la siembra, deja la cuenta en `user`
> con plan `personalizado` (sin candados) y pone un tutorial para `/sessions`
> y una cuenta que atiende tickets. **Una guía de otro módulo usa la misma
> semilla**: el marco es el mismo en todas las pantallas.

Cinco cosas que hay que mantener:

1. **La vista general nombra las cinco zonas** (`ZONAS_DE_LA_PANTALLA`: menú,
   barra de arriba, barra de trabajo, tabla, pie), el menú tiene su paso
   (dónde vive el módulo, `MODULO_DE_LEADS`) y la barra de arriba el suyo, con
   sus seis partes en orden (`PARTES_DE_LA_BARRA_DE_ARRIBA`). El banco lee
   `Breadcrumbs.tsx` y falla si aparece un botón arriba que la guía no nombra.
2. **El menú se captura RECOGIDO** —así se ve al entrar a cualquier pantalla—
   salvo en su propio paso, abierto con las dos flechas; y se vuelve a recoger,
   porque el vídeo sale del estado de esa sesión y el menú vive en una cookie.
   Lo que pintó el menú recogido queda en `scripts/menu-guia-leads.json` (cada
   módulo con su icono), y el banco lo compara con la foto sembrada.
3. **Las dos fotos del marco se toman en una ventana de PORTÁTIL**
   (`elMarcoDeLaPantalla`, al final de las capturas): la barra a 1024 de ancho
   y el menú abierto a 1280×720. A 1440 la barra salía en una tira tan larga
   que en la página sus iconos se leían de 6 px, y el menú abierto de alto
   entero ocupaba 1211 px de la guía (ahora 667).
4. **Si el menú de producción cambia, la foto se queda atrás** y el banco no
   puede saberlo; sí exige que cada icono exista en `iconMap` y cada ruta en
   `navigationRoutes`. Se actualiza la foto y se regenera.
5. **El vídeo nombra también el menú y la barra** (frases `menu` y
   `barraDeArriba`); sus audios Cedar se sintetizaron desde el contenedor de
   la App. Y `generar-guia-leads.sh` avisa ANTES de empezar si falta `ffmpeg`,
   que el vídeo necesita (`apt-get install -y ffmpeg`): sin él se caía al final,
   después de diez minutos de capturas.

Lo prueba `lib/__tests__/menu-de-la-guia.test.mjs` (en `banco-guia-leads.sh`);
`MODO=roto` lee `8e41502` y afirma la semilla con iconos que el menú no conoce
y la guía sin pasos para el menú ni la barra de arriba.

### Las acciones masivas: el «⋯» de la barra también es de la guía

La primera guía documentaba los cinco mandos de la barra de trabajo y se dejaba
el sexto: el menú «⋯» del final (`BulkActionsDropdown.tsx`), con Exportar a
Excel y a Google Sheets, Activar y Desactivar clientes, Limpiar leads vacíos y
las de riesgo alto. Ni tarjeta, ni captura, ni frase en el vídeo — y nada lo
comparaba, así que nadie se enteró.

> **El menú se documenta como las columnas: contra el código.**
> `ACCIONES_MASIVAS_DOCUMENTADAS` (`lib/guia-leads.ts`) tiene los grupos y sus
> acciones en su orden, y el banco los compara con los que pinta
> `BulkActionsDropdown.tsx` (leídos del marcado). Una acción nueva en ese menú
> sin su nombre en la guía la pone en rojo.

Cuatro cosas que hay que mantener:

1. **Es la octava sección, y la última**, porque es el último mando de la
   barra; la barra de la vista general lo numera como su sexto. Con ocho, el
   cierre del índice es solo «Contáctanos» (1 hueco a 3 columnas, ninguno a 2):
   `probar-guia.mjs` lo calcula con `losHuecos` en vez de dar por hecho
   las siete de antes.
2. **Las capturas leen los grupos del menú PINTADO** (`losGruposDelMenu`),
   cortados por sus separadores, y la miniatura lo enseña ABIERTO: cerrado es
   un icono de 40 px que no dice nada.
3. **La confirmación se CANCELA, en las capturas y en el vídeo**: nada de esta
   sección cambia los datos de ejemplo. El banco falla si el guion pulsa
   «Confirmar».
4. **Los nombres se buscan con `exact: true`**: «Activar clientes» está dentro
   de «Desactivar clientes», y sin él Playwright encuentra los dos.

Lo prueba `lib/__tests__/guia-leads.test.mjs` (y el vídeo, en su banco);
`MODO=roto` lee `c3ae539` y afirma que la guía no tenía la sección ni nombraba
los grupos ni las acciones de exportar y de riesgo alto (Activar y Desactivar
clientes sí salían, de pasada, en un consejo de Sesión).

### La segunda guía, Catálogo: las piezas son COMUNES, y lo que cambia es el contenido

`/guia/catalogo` documenta Panel › Catálogo (`/mis-catalogo`) con el mismo
estándar que Leads: ocho secciones con al menos tres pasos cada una, una
miniatura con enfoque por tarjeta, y el vídeo de un minuto y medio con la voz
Cedar y el MISMO ritmo (`leads.json` y `catalogo.json` tienen que decir el
mismo `ritmo`).

> **Lo que se repetiría en cada guía vive en un sitio**: el modelo de sección y
> paso y la barra de arriba en `lib/guia-de-modulo.ts` (`laGuiaDe`), el taller
> de capturas —marcas, velo, cursor, grabadora, voz— en
> `scripts/taller-de-la-guia.mjs`, el marco (menú y barra de un cliente) en
> `scripts/sembrar-marco-de-la-guia.mjs`, el lanzador en
> `scripts/generar-guia.sh <modulo>` y la sonda de la guía servida en
> `scripts/probar-guia.mjs` (`GUIA=<modulo>`). Cada guía pone su contenido
> (`lib/guia-<modulo>.ts`), su semilla, su receta de capturas y su narración.
> **Una guía nueva no copia ninguna de esas piezas.**

Cinco cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene**: `APARTADOS_DOCUMENTADOS` se
   compara con los cinco apartados y sus campos leídos de `CatalogoPanel.tsx`
   (por `data-seccion-del-catalogo`). Un campo nuevo sin su sitio en la guía
   pone el banco en rojo.
2. **El catálogo público es público**: `/catalogo/` y `/c/` no estaban en el
   middleware, así que a cualquier cliente sin sesión lo mandaba al login (el
   dueño no lo notaba: él sí tiene sesión). Enseña solo productos `isActive`.
3. **El enlace se escribe como el nombre del negocio** (`lib/enlace-del-catalogo.ts`):
   la tilde se quita y la letra se queda —antes «Café» salía «caf-»—, la
   pantalla y el servidor con la misma regla, y los dos enlaces de la pantalla
   leen el dominio de la página: el pie llevaba `agente.ia-app.com` a mano.
4. **Los «así queda» se toman en el catálogo PÚBLICO de verdad**, y los que
   enseñan un ajuste distinto (una red vacía, los interruptores apagados) lo
   cambian, guardan, fotografían y lo DEVUELVEN (`conUnCambio`), y se caen si
   el cambio no se ve. Las tarjetas se enseñan con su vecina bajo el velo.
5. **Las capturas enseñan `agente.ia-app.com`**, no `localhost`: el taller
   reescribe el TEXTO visible (`conElDominioDeLaGuia`), nunca los enlaces.

Lo prueba `scripts/banco-guia-catalogo.sh`: el contenido contra la pantalla,
el vídeo medido con ffmpeg, las miniaturas en los píxeles (el mismo test de
Leads con `GUIA=catalogo`) y la guía servida sin sesión. `MODO=roto` lee
`24ba0b2` y afirma que no había guía, que el catálogo pedía sesión y que el
enlace se escribía mal. Regenerar: `npm run build && scripts/generar-guia-catalogo.sh`
y volver a construir.

### La tercera guía, Diagramas: la lista Y su editor, con las mismas piezas

`/guia/diagramas` documenta Panel › Diagramas (`/diagramas`) y **su editor**
con el estándar de Leads y Catálogo: nueve secciones —vista general, crear, el
editor, agregar pasos, editar un paso, la nota Idea y el paso Libre, compartir,
carpetas y orden, y las acciones masivas—, una miniatura con enfoque por
tarjeta y el vídeo de un minuto con la voz Cedar y el MISMO ritmo que Leads.

No trae ninguna pieza propia: su contenido (`lib/guia-diagramas.ts`, con
`laGuiaDe`), su semilla (`sembrar-guia-diagramas.mjs`, sobre
`sembrarElMarco`), su receta de capturas y vídeo (`capturar-guia-diagramas.mjs`,
sobre el taller) y su narración. Se regenera con
`npm run build && scripts/generar-guia-diagramas.sh && npm run build`, y
`SIN_VIDEO=1`, `SOLO_VIDEO=1` o `SOLO_MINIATURAS=1` rehacen una parte.

Cinco cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene.** El banco compara cada lista de
   la guía con su pareja en el código: los niveles de «Con el equipo», el «⋯»
   de la tarjeta, los tipos de paso de «Selecciona una acción» en sus dos
   grupos, las salidas de la Decisión, los controles del lienzo y las barras
   de un paso y de una nota Idea. Un tipo de paso nuevo sin su nombre en la
   guía lo pone en rojo.
2. **Nada sale recortado con «…» en una captura.** `queNadaSalgaRecortado`
   corta la generación si un nombre de paso o de tarjeta no cabe (dentro de
   `[data-caja-del-contenido]`: el menú y la barra de arriba recortan a
   propósito). Se acorta en la semilla, no en la guía.
3. **El vídeo recorre lo que la guía explica** —la lista, el menú, la barra de
   arriba, crear, agregar un paso por el «+», escribir en su caja, Ordenar y el
   guardado, compartir y el «⋯»— y del «⋯» solo NOMBRA las opciones: pulsar
   Duplicar o Eliminar cambiaría los datos delante de la cámara.
4. **Las miniaturas del editor se toman con el diagrama abierto**, dentro de
   su zona (`tomarLasMiniaturas`), y lo que quede abierto —un diálogo, un
   menú— se cierra con Escape antes de la siguiente (`despues`).
5. **`marcar` admite `sinRecuadro`** (una captura que solo atenúa), y `mover`
   se cae si lo que el vídeo tenía que señalar no se ve: un cursor que va a
   ninguna parte no es un error que se vea en el vídeo, es un vídeo que miente.

Las medidas de un vídeo (silencios, fin de cada pista, cambios del rótulo)
viven en `lib/__tests__/medidas-del-video.mjs` y las usan los bancos de Leads y
de Diagramas.

### Lo que se arregló en el editor al documentarlo

Documentar pantalla por pantalla destapó fallos que no se veían desde dentro:

| | qué pasaba | ahora |
| --- | --- | --- |
| **diagrama de solo lectura** | el lienzo estaba bloqueado, pero el nombre de un paso se podía escribir, su caja prometía «Clic para escribir», la nota Idea se podía reescribir, estirar y cambiar de color, y el candado del lienzo lo **desbloqueaba** —React Flow cambia su propio estado—. Nada se guardaba y al recargar volvía como estaba: trabajo perdido sin un aviso | el nombre es `readOnly`, la caja no es un botón, la nota no tiene barra ni tirador, y el candado no se pinta (`showInteractive={!soloLectura}`) |
| **los tres «+» de la Decisión** | con Sí/Variante/No al 16/50/84 % de una caja pequeña, los tres «+» se montaban unos sobre otros | se abren en abanico (`elAbanicoDeLosMas`, `lib/abanico-de-los-mas.ts`, puro): el de Sí sube y el de No baja lo justo para que entre ellos quede `HUECO_ENTRE_MAS_PX` en los tres tamaños |
| **la barra de un paso** (tamaño, duplicar, eliminar) | pegada a la esquina de la caja, se montaba sobre la mitad derecha del nombre | va encima del nombre y centrada, con `pb-1` en vez de margen para que el cursor no pierda el `group-hover` al subir |
| **los controles del lienzo** | en inglés («Zoom In», «Fit View») | en español (`ETIQUETAS_DEL_LIENZO`) |
| **la tarjeta de la lista** | un nombre largo se pintaba debajo de la casilla, que va fuera del flujo | `pr-9` en todas las tarjetas, también las recibidas, para que todas corten el nombre en el mismo sitio |
| **la pastilla de una carpeta** | un `<span>` sin `data-ui="badge"`: dentro de `.app-module-content` su letra salía a 14 px y 4 px más alta que «Todas» | con la marca, y el «⋯» con `-my-0.5`. Es `components/shared/Carpetas.tsx`, así que vale también para Proyectos |
| **los mensajes** | «flujo» en una pantalla que se llama Diagramas, y «Recuerda darle a Guardar» después de Ordenar, que se guarda solo | «diagrama», y sin el recordatorio |

Lo prueba `scripts/banco-guia-diagramas.sh`: el contenido contra el código, el
vídeo (voz Cedar, ritmo, huecos, sincronía del rótulo), las miniaturas en sus
píxeles (el test de Leads con `GUIA=diagramas`), `fin-de-la-guia` y
`menu-de-la-guia` —que barren las tres guías— y la guía servida a 390 y 1440
(`probar-guia.mjs`). `MODO=roto` lee `6d8cd4b` y afirma que no había guía, que
el editor de lectura dejaba escribir y desbloquear, y que los tres «+» se
montaban.

### La cuarta guía, Reuniones (`/guia/reuniones`): las MISMAS piezas, y el contenido atado al código

Nueve secciones —la pantalla de un vistazo, abrir una reunión, las abiertas,
los mandos, cómo ver la reunión, invitados, chat y gente, grabar y las
pasadas— con sus capturas, su miniatura con enfoque y el vídeo narrado de un
minuto. Mismo estándar que Leads, y no por copiarlo:

> **No copia ninguna pieza común** (las de la sección de arriba): contenido con
> `laGuiaDe("reuniones", …)`, capturas con el taller, el marco con
> `sembrarElMarco` y el lanzador y la sonda comunes. La vista general numera las
> MISMAS seis zonas que Leads y Catálogo —menú, barra de arriba, pestañas del
> Panel— y lleva sus mismos pasos (`menu-lateral`, `barra-de-arriba`,
> `pestanas`). Lo único que necesitó el marco es `modulosQueSeVenden`: grabar
> depende de que exista el módulo `/reuniones/grabaciones`, que se siembra
> ESCONDIDO del menú (una semilla con su propio `db.module.create` sería un
> segundo sitio donde se siembra el menú, y `menu-de-la-guia` lo prohíbe). La
> lista de guías (`MODULOS_CON_GUIA`, `NOMBRE_DE_LA_GUIA`) alimenta el editor
> de introducciones y el «Contáctanos», y su fila en `GUIAS_PUBLICADAS` pone
> la tarjeta en «Ver tutoriales» de `/reuniones` sin ningún paso a mano.

Cinco cosas que hay que mantener:

1. **El contenido se compara con el CÓDIGO** (`guia-reuniones.test.mjs`): las
   pestañas con las `PastillaDeFiltro`, las acciones de la fila con `FilaViva`,
   las caducidades con `DURACIONES`, los seis mandos de abajo con la barra, los
   botones de la cabecera con cada `MandoDeCabecera` (y ninguno sobra), las
   opciones de grabar y del fondo con sus menús, y los números (4 personas, 2
   minutos la mano, 90 días de historial, 180 de grabación) con sus
   constantes. Un mando nuevo sin su nombre en la guía la pone en rojo.
2. **La reunión se captura con TRES personas de verdad** —la anfitriona, un
   invitado que llama a la puerta y Sofía, del equipo— en tres navegadores,
   con cámaras y micrófonos de mentira (`scripts/camaras-de-la-guia.mjs`):
   personas ILUSTRADAS (la guía es pública: ninguna cara real) y solo quien
   habla lleva voz, que es lo que decide quién sale en grande. Sin ficheros,
   Chromium pone su patrón verde y un pitido que «habla».
3. **La semilla corre en la zona de la cuenta** (`process.env.TZ =
   "America/Bogota"` dentro de `sembrar-guia-reuniones.mjs`): con la del
   contenedor (UTC) las pasadas salían a las 5 de la mañana.
4. **El vídeo NO enciende el desenfoque**: lo señala y cierra el menú. El
   desenfoque corre un modelo de segmentación en el procesador y, con tres
   cámaras en la misma máquina, lo que quedaba del minuto se estiraba a más de
   cuatro (medido: 266 s). Y arranca **sin las preferencias de la sala**
   (`reunion:*` de `localStorage`): las capturas la dejan en cuadrícula y con el
   panel abierto, y el vídeo tiene que empezar como la ve quien entra.
5. **Regenerar**: `npm run build && scripts/generar-guia-reuniones.sh`
   (`SOLO_VIDEO=1` solo el vídeo) y volver a construir. El guion se cae con una
   captura si Sofía no ve la reunión en su lista —con tres navegadores el
   servidor va lento y se insiste unas veces—; un plazo agotado a secas no dice
   por qué.

#### Y las capturas destaparon tres fallos de la sala, que ya están arreglados

| lo que se veía | la causa | el arreglo |
| --- | --- | --- |
| el «⋯» de moderar de un recuadro **no se abría** dentro de la plataforma | su menú iba en un portal al `<body>`, en `z-50`, y la reunión vive en una capa `z-[99]`: se abría DETRÁS | el menú se monta en la capa de la reunión (`container`), como ya hacían los del fondo y de grabar |
| el «⋯» del recuadro grande tapaba el botón del chat | el «⋯» va `z-30` arriba a la derecha, y la cabecera flota encima de los recuadros de arriba | `laAlturaDelMenuDelRecuadro` lo baja lo que mide la cabecera, solo en los recuadros que tocan arriba |
| «Esperando a que te dejen entrar» casi negro sobre casi negro | `Centrada` no llevaba fondo ni color: heredaba el texto de la plataforma sobre la pestaña oscura del invitado | la caja lleva el fondo y el texto de la sala (`bg-zinc-950`, `text-zinc-100`) |

El primero lo prueba `banco-controles-de-la-reunion.sh` (con la reunión encima
de una capa como la de la plataforma, el menú se VE; portado al `body`, el
banco lo ve detrás), el segundo `sala-de-video.test.mjs` y el tercero
`guia-reuniones.test.mjs`.

Lo prueba `scripts/banco-guia-reuniones.sh`: el contenido contra el código y la
simetría con las otras dos guías, el vídeo (Cedar a ritmo de conversación, sin
huecos, el rótulo cambiando cuando empieza cada frase y la imagen acabando con
la voz), las miniaturas con el MISMO test que Leads y Catálogo
(`GUIA=reuniones`), `fin-de-la-guia` y `menu-de-la-guia`, y la guía servida
sin sesión (`probar-guia.mjs`). `MODO=roto` lee `24ba0b2` y afirma que no había
guía, ni vídeo, ni miniaturas, y la espera ilegible.

### La quinta guía, Mis notas: las mismas piezas, y la pantalla expone sus marcas

`/guia/notas` documenta Herramientas › Mis notas (`/notas`) con el estándar de
Leads, Catálogo, Diagramas y Reuniones: diez secciones —vista general, crear y escribir,
formato, carpetas, buscar y ordenar, icono y color, vincular un contacto,
compartir, plantillas y exportar, y archivar y eliminar—, una miniatura con
enfoque por tarjeta y el vídeo de un minuto con la voz Cedar y el MISMO ritmo.
Su tarjeta sale sola en «Tutoriales del módulo» de `/notas`
(`GUIAS_PUBLICADAS`), con su descripción: «Aprende a escribir, organizar y
compartir tus notas en la plataforma».

No trae ninguna pieza propia: su contenido (`lib/guia-notas.ts`, con
`laGuiaDe`), su semilla (`sembrar-guia-notas.mjs`, sobre `sembrarElMarco`), su
receta de capturas y vídeo (`capturar-guia-notas.mjs`, sobre el taller) y su
narración. Se regenera con
`npm run build && scripts/generar-guia-notas.sh && npm run build`.

Seis cosas que hay que mantener:

1. **El código de las dos páginas es el de Leads con otro nombre, letra por
   letra** (sin contar los comentarios): el banco las compara quitando los
   nombres. Una pieza que solo lleve una de las dos es una guía que se pinta
   distinta de la otra.
2. **La frase de la barra de arriba es la MISMA en todas las narraciones**, y
   el paso «La barra de arriba» lleva `TEXTO_DE_LA_BARRA_DE_ARRIBA`: la barra es
   la misma en todas las pantallas. Y el paso siguiente es «El panel de notas»:
   Mis notas no tiene barra de trabajo ni vive en Panel, así que
   `menu-de-la-guia` pide el paso de la zona que SÍ tiene (su
   `ZONAS_DE_LA_PANTALLA`).
3. **La pantalla expone marcas para la receta** (`data-panel-de-notas`,
   `data-barra-de-la-nota`, `data-barra-de-formato`, `data-nota-abierta`…), y
   las recetas no usan coordenadas. Una fila de botones pegados se numera con
   `sinRecuadro`: trece recuadros uno encima de otro no se leen. Y las
   miniaturas que abren una VENTANA (vincular, compartir) la cierran en su
   `despues`: el `cerrarLoAbierto` del taller solo cierra menús.
4. **Las capturas CAMBIAN los datos** (crean, mueven, fijan, comparten…), así
   que antes del vídeo se vuelve a sembrar: sale del mismo punto de partida. Y
   el vídeo no borra nada: archiva, que se ve y se recupera.
5. **Poner el cursor en el editor es un clic sobre la LETRA y después el
   cursor del propio editor** (`elCursorEn`: `.ProseMirror.editor.commands
   .focus("end")`). Un clic sobre la caja del bloque caía fuera del texto, el
   botón de la barra devolvía el cursor al principio y la lista de tareas salía
   pegada al título. Sin ningún error: solo se ve mirando la captura.
6. **Ninguna marca tapa lo que se lee**, y eso se comprueba MIRANDO cada
   captura: un rótulo que cae sobre el texto va a otro lado o se quita, los
   números van donde hay hueco, el recorte acaba en filas enteras, y antes de
   una foto se suelta el foco que dejó un diálogo cerrado (su anillo se lee
   como otra marca).

Lo prueba `scripts/banco-guia-notas.sh`: el contenido contra el código
(`NotesEditor`, `NotesSidebar`, `EditorDeTexto`, `SortableNoteList` y
`niveles-de-acceso`), el vídeo medido como el de Diagramas, las miniaturas en
sus píxeles (`GUIA=notas`), `fin-de-la-guia` y `menu-de-la-guia` —que barren
las cinco guías— y la guía servida a 390 y 1440. `MODO=roto` lee `24ba0b2` y
afirma que no había guía, ni vídeo, ni miniaturas, ni marcas en la pantalla.

### La sexta guía, Google Sheets: y documentarla destapó una pantalla que se quedaba en blanco

`/guia/google-sheets` documenta Integraciones › Google Sheets
(`/google-sheets`) con el estándar de las cinco anteriores: ocho secciones
—vista general, vincular, tu hoja, copiar el enlace, cambiar de hoja, quitar
la hoja, un enlace que no sirve y las respuestas de las citas—, una miniatura
con enfoque por tarjeta y el vídeo de un minuto con la voz Cedar y el MISMO
ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de `/google-sheets`:
«Aprende a vincular y consultar tu hoja de Google Sheets en la plataforma».
Ninguna pieza propia: contenido con `laGuiaDe`, capturas con el taller, el
marco con `sembrarElMarco`. Se regenera con
`npm run build && scripts/generar-guia-google-sheets.sh && npm run build`.

Lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| se guardaba CUALQUIER texto: un documento, una carpeta de Drive o el enlace de «Publicar en la web» quedaban guardados, el campo se escondía —ya había algo— y no se pintaba ninguna hoja —no era una—. Pantalla en blanco para siempre y sin un solo error | lo decide `laHojaQueSeGuarda` (`lib/url-de-google-sheets.ts`, pura), y la preguntan la pantalla antes de mandar y la acción antes de escribir. Lo que no sirve se dice con su motivo bajo el campo, que se queda a la vista; y una hoja mala ya guardada abre el campo con «El enlace guardado no sirve» |
| se guardaba lo pegado (`?usp=sharing`, dos `gid`…) | se guarda el enlace LIMPIO (`/edit`, con su pestaña) y la acción devuelve lo que quedó escrito, que es lo que se pinta |
| nada decía con qué correo compartir la hoja, y sin compartirla la plataforma no puede escribir en ella | el paso 1 de vincular enseña el correo de la cuenta de servicio (`getServiceAccountEmail`), con su botón de copiar |
| escribir la respuesta de una cita en la hoja fallaba EN SILENCIO (`catch {}`) | sigue sin tumbar la cita, y se dice (`[google-sheets] no se pudo escribir…`) |
| la regla del id de una hoja estaba COPIADA en dos acciones | `elIdDeLaHoja`, una vez, y el banco la compara con la copia de antes entrada por entrada: cambiarla cambiaría a qué hoja escriben las integraciones que ya funcionan |
| copiar el enlace sin `try`: sin HTTPS el portapapeles lanza | en su `try`, y si falla se dice qué hacer |
| la barra de la hoja eran iconos sin palabra y no se podía quitar la hoja | Cambiar hoja, Copiar enlace y Abrir, con su palabra, y «Quitar hoja» con confirmación; quitar guarda «sin hoja» (`''`), como siempre |
| la página pedía `sheetsFormName` y `sheetsRegistroName` y no los usaba nadie | ya no los pide |

Cinco cosas que hay que mantener:

1. **El correo que enseña la guía es de EJEMPLO**
   (`hojas@plataforma-ejemplo.iam.gserviceaccount.com`, en
   `scripts/generar-guia.sh`): la guía es pública y el de verdad no se publica.
2. **La hoja es un SIMULACRO** servido por Playwright en `docs.google.com`: una
   rejilla de 40 filas con sus pestañas. Las filas con datos son
   `[data-fila]` —debajo siguen filas vacías, así que la última con datos es
   `.last()`, nunca `:last-of-type`—.
3. **El cursor entra en el iframe**: dentro de un marco el ratón se mueve en
   OTRO documento y la página de arriba deja de recibir sus `mousemove`, así
   que `cursor-de-la-guia.mjs` hace que el marco le cuente a la página dónde
   está la punta y qué forma toca (`postMessage`), y la pinta ella. Vale para
   cualquier guía con un iframe.
4. **El vídeo no quita la hoja ni confirma nada**: señala «Quitar hoja» y
   enseña un enlace que no sirve con su motivo, sin cambiar los datos delante
   de la cámara.
5. **La sección de las citas dice lo que el código escribe**: la pestaña y las
   columnas se comparan con `SHEET_NAME` y `HEADERS` de
   `booking-form-actions.ts`.

Lo prueban `scripts/banco-google-sheets.sh` —la regla y un barrido, la acción
contra Postgres y la pantalla real en Chromium (enlace malo sin mandar, bueno
guardado limpio, la barra con palabra, copiar que falla, quitar con
confirmación)— y `scripts/banco-guia-google-sheets.sh` —el contenido contra
el código, el vídeo, las miniaturas (`GUIA=google-sheets`) y la guía servida—.
Los dos con `MODO=roto` contra `ab6b110`, que afirma que se guardaba cualquier
texto, que no había guía y que la barra no tenía palabras.

### La séptima guía, Integrar URLs: y documentarla destapó que la pantalla guardaba cualquier cosa

`/guia/integraciones` documenta Apps Externas › Integrar urls (`/integraciones`)
con el estándar de las otras seis: siete secciones —vista general, agregar,
tu app dentro de los chats, abrir y editar, ordenar y buscar, eliminar, y
cuando una app no se abre—, una miniatura con enfoque por tarjeta y el vídeo
de un minuto con la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en
«Tutoriales del módulo» de `/integraciones` (`GUIAS_PUBLICADAS`): «Guía de
Integrar URLs» · «Aprende a abrir tus apps web dentro de tus chats en la
plataforma». Siete secciones y no ocho a propósito: el cierre de la cuadrícula
deja la página simétrica tenga las que tenga (con siete, «Contáctanos» y «Ver
el vídeo de nuevo» en escritorio), y la entrada de las apps en el menú
(`#user-integrations`) no la tiene el menú de un cliente, así que no se
documenta.

No trae ninguna pieza propia (contenido con `laGuiaDe`, semilla sobre
`sembrarElMarco`, receta sobre el taller). Se regenera con
`npm run build && scripts/generar-guia-integraciones.sh && npm run build`. La
semilla siembra cuatro apps y cuatro conversaciones, porque media guía es ver
las apps como pestañas de un chat; sus direcciones son de `mi-negocio.co` y
las contesta la receta con una página de ejemplo (`ctx.route`), así que no
dependen de ninguna web ajena. `CON_UNA_ROTA=1` añade la app con la dirección
vieja que enseña el aviso amarillo.

#### Lo que se arregló en la pantalla al documentarla

La pantalla guardaba lo que se escribiera, tal cual, y ninguno de estos fallos
daba un error:

| lo que pasaba | ahora |
| --- | --- |
| una dirección `javascript:` se **ejecutaba** al abrir la pestaña de la app en Chats: se pinta en un `<iframe>` y en un enlace, y el React de Next 14 no la bloquea (solo avisa) | solo se guardan `http`/`https` con dominio (`comoUrlDeIntegracion`), y lo que se ABRE pasa por la misma regla (`laUrlQueSeAbre`) en la pestaña, en «Abrir en nueva pestaña» y en el menú; y el `<iframe>` común (`IframeRenderer`, que usan también Evo, Copiloto y Canva) descarta cualquier esquema que no sea web (`sePuedeIncrustar`) |
| una dirección sin `https://` abría **la propia App** dentro de la pestaña (el navegador la lee como ruta relativa) | se le pone `https://` al guardar, y una fila vieja se abre bien |
| el «máx. 10» de la pastilla no existía: la acción aceptaba la undécima | `TOPE_DE_INTEGRACIONES`, en la acción; «Nuevo» se apaga y el pie lo dice |
| dos apps con el mismo nombre: dos pestañas iguales en Chats | se rechaza, sin mirar mayúsculas ni tildes (`yaExisteElNombre`) |
| borrar era de un clic, sin confirmar | pide confirmación; la fila se quita al momento y vuelve si el servidor dice que no |
| al borrar la ÚLTIMA volvía a salir (`store.length > 0 ? store : initial`) | el store se siembra con lo del servidor y manda él |
| cuatro pastillas arriba que no filtraban nada —dos repetían el total— | se fueron; la cifra va en el pie, debajo, como dice la regla de las métricas |
| crear y editar eran dos formularios en línea distintos, en dos columnas | UNA ventana con la forma de «Crear contacto» de Leads |
| una posición nueva = número de filas: tras borrar una del medio, dos filas en el mismo sitio | la siguiente a la última |
| editar o borrar una fila que ya no estaba **reventaba** (`update`/`delete` de Prisma) | `updateMany`/`deleteMany` con su cuenta; y reordenar va en una transacción |
| con una búsqueda puesta se podía arrastrar una lista a la que le faltaban filas | el asa se apaga y el pie dice por qué |
| en `/canva` se encendían TODAS las apps del menú a la vez | se enciende la que se abrió (`canvaUrl === sub.url`) |

Cinco cosas que hay que mantener:

1. **Las reglas son UNA, `lib/integraciones.ts` (pura)**, y pasan por ella los
   cinco sitios: la acción que guarda, la pantalla, la pestaña de Chats, el
   `<iframe>` común y el menú. Con la regla en uno solo, el quinto la olvida.
2. **Lo que se guarda es lo que se escribió**, con `https://` delante si no lo
   traía, y no el `href` normalizado: el `href` le pone una barra al final y la
   fila diría otra cosa que lo tecleado.
3. **El `<iframe>` común admite rutas de la casa** (`/copiloto`, `/canva?u=`):
   ahí las direcciones las pone la plataforma. Lo único que cierra es un
   esquema que no sea web, decidido con el mismo analizador del navegador
   (`java\tscript:` o un espacio delante no se cuelan).
4. **Las apps son de la PERSONA** (`userId = user.id`, como siempre); ninguna
   acción toca las de otra cuenta, y lo prueba el banco.
5. **Algunas webs no dejan abrirse dentro de otra** (`X-Frame-Options`): eso no
   se puede arreglar desde aquí, y la guía lo dice —«Abrir en nueva pestaña»—.

Lo prueban `scripts/banco-integraciones.sh` —las reglas, un barrido de los
cinco sitios y las cinco acciones contra Postgres; `MODO=roto` corre las de
`ab6b110` y afirma la `javascript:` guardada, la undécima aceptada y la
edición que revienta— y `scripts/banco-guia-integraciones.sh`: el contenido
contra el código (los mandos de la fila, los campos de la ventana, el orden de
las pestañas en Chats), el vídeo, las miniaturas (`GUIA=integraciones`),
`fin-de-la-guia` y `menu-de-la-guia` —que barren las siete guías— y la guía
servida a 390 y 1440; `MODO=roto` lee `ab6b110` y afirma que no había guía.
El test de miniaturas dejó de exigir «al menos ocho secciones» (era la octava
de Leads): ahora compara las secciones leídas con las de la guía compilada.

### La octava guía, Agente IA: la pantalla Y su editor, y las ocho pestañas de UNA fuente

`/guia/agente-ia` documenta Entrenamiento › Agente IA (`/ia`) **y su editor
interno** con el estándar de las siete guías anteriores: diez secciones —vista
general, canales, perfil, pasos, acciones y respuestas de un paso, preguntas
productos y extras, palabras clave, gestión, cotizaciones, y guardar y más
opciones—, una miniatura con enfoque por tarjeta y el vídeo narrado con la voz
Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/ia` (`GUIAS_PUBLICADAS`): «Aprende a entrenar tu agente de IA paso a paso en
la plataforma».

No trae ninguna pieza propia: contenido (`lib/guia-agente-ia.ts`, con
`laGuiaDe`), semilla (`sembrar-guia-agente-ia.mjs`, sobre `sembrarElMarco`, con
un negocio de ejemplo —«Café de la Montaña»— y sus ocho pestañas llenas),
receta de capturas y vídeo (`capturar-guia-agente-ia.mjs`, sobre el taller) y
narración. Se regenera con
`npm run build && scripts/generar-guia-agente-ia.sh && npm run build`.

**La guía se compara con el CÓDIGO de `/ia`, no con una lista escrita en el
banco**: los canales (`lib/channel-training.ts`), las ocho pestañas
(`TYPE_AI_LABELS`), lo que ofrece «Agregar acción» (`FunctionSelector.tsx`,
grupo por grupo y sin el emoji), los modos de la bienvenida, los tipos de
captura de Gestión (`SUBTYPE_OPTIONS`), las coincidencias y acciones de una
palabra clave, el «⋯» del editor (`OPCIONES_DEL_AGENTE`) y los campos fijos del
Perfil. Una pestaña o una acción nueva sin su nombre en la guía la pone en rojo.

#### Lo que se arregló en la pantalla al documentarla

La pantalla eran ocho pestañas escritas cada una a su manera, y ninguna de esas
diferencias daba un error: se veían como una pantalla que no es de una pieza.

| lo que se veía | ahora |
| --- | --- |
| la pestaña «Inicio» abría una tarjeta que decía «Entrenamiento»; «Perfil», una que decía «Información del Negocio» | el título de cada tarjeta ES el de su pestaña (`TYPE_AI_LABELS`) |
| «Agregar Pregunta» con mayúscula al lado de «Agregar producto», y cada mensaje vacío con su frase | `AGREGAR_EN_LA_PESTANA` y `PESTANA_VACIA`, una fuente |
| el paso de Inicio abría «Eliminar entrenamiento» —se lee como borrar el agente entero— y una regla de palabras clave se borraba al primer clic, sin preguntar | `ELIMINAR_EN_LA_PESTANA`, y la regla pide confirmación como las demás |
| el contador de «Elementos del paso» enseñaba el NÚMERO del paso | cuenta sus elementos (`data-cuantos-elementos`) |
| cada lista con sus bordes (`px-6` en Preguntas, Productos y Extras) | los de un paso de Inicio: el contenido arranca bajo el título (`pl-10`) y acaba bajo la papelera (`pr-3`) |
| unas tarjetas de elemento con icono en el título y otras sin él; «Enrutamiento por paso» con el relleno de la `Card` y su título en azul | TODAS por `TituloDelElemento` y con `px-3` |
| el asa decía «Arrastrar» a secas | dice qué arrastra: «Arrastrar paso», «Arrastrar pregunta»… |
| abrir una pestaña ponía «Guardar» en verde sin haber cambiado nada | la foto de lo guardado se arma con las secciones enderezadas (`laSeccionEnOrden`), igual que las pinta cada lista al abrirse |
| el «⋯» decía «IA Prompts» y abría «Chat IA»; «Métricas del agente» abría «Métricas del Agente IA» | `OPCIONES_DEL_AGENTE`: el menú y la ventana se llaman igual |
| la «X» de Métricas caía encima del botón de actualizar, y Métricas e Historial medían distinto | `pr-8` en la fila, y las dos hojas `sm:max-w-md` |
| el botón verde de un campo de Gestión se anunciaba «Guardar» y lo que hace es agregarlo | «Agregar campo» |
| «Condicion para avanzar», «crear formulas», «quedara claro», «Desplazar pestanas» | con sus tildes |

Cuatro cosas que hay que mantener:

1. **Los nombres de la pantalla salen de `ai-section-labels.ts`** y de ningún
   otro sitio. Una tarjeta que vuelva a escribir su título, su botón o su
   mensaje a mano pone el banco en rojo.
2. **Toda tarjeta de elemento lleva `TituloDelElemento` y `px-3`**, también
   las que ya no se ofrecen (Enrutamiento, Consulta, Actualizar datos): los
   bloques que las tengan guardadas se siguen viendo al lado de las demás.
3. **La pantalla expone marcas para la receta** (`data-canales-del-agente`,
   `data-canal`, `data-barra-del-editor`, `data-progreso-del-agente`,
   `data-editor-del-agente`, `data-vista-previa`, `data-bloque`,
   `data-motor-de-flujo`…), y las recetas no usan coordenadas. Las ventanas de
   Radix se quedan montadas escondidas, así que la receta busca con `:visible`.
4. **Ninguna marca tapa lo que se lee**: donde un rótulo de campo ocupa el
   borde de arriba de la caja, el número va al final de ese borde
   (`arribaALaDerecha`) o en el de abajo.

Lo prueban `scripts/banco-guia-agente-ia.sh` —la pantalla
(`pestanas-del-agente`), el contenido contra el código, el vídeo medido como el
de Mis notas, las miniaturas en sus píxeles (`GUIA=agente-ia`),
`fin-de-la-guia` y `menu-de-la-guia` —que barren las ocho guías— y la guía
servida a 390 y 1440—. `MODO=roto` lee `ab6b110` para afirmar los fallos de la
pantalla y `24ba0b2` para afirmar que no había guía, ni vídeo, ni miniaturas,
ni marcas en la pantalla.

### La novena guía, Usuarios: y documentarla destapó puertas abiertas en `/equipo`

`/guia/usuarios` documenta Usuarios (`/equipo`) con el estándar de las ocho
guías anteriores: diez secciones —vista general, crear un usuario, rol y
disponibilidad, auto-asignación, por porcentaje, medir al equipo, el Pipeline,
qué ve cada usuario, editar y quitar, y asignar y más—, una miniatura con
enfoque por tarjeta y el vídeo narrado con la voz Cedar y el MISMO ritmo. Su
tarjeta sale sola en «Tutoriales del módulo» de `/equipo`
(`GUIAS_PUBLICADAS`): «Aprende a crear tu equipo y repartir los chats en la
plataforma».

No trae ninguna pieza propia: contenido (`lib/guia-usuarios.ts`, con
`laGuiaDe`), semilla (`sembrar-guia-usuarios.mjs`, sobre `sembrarElMarco`, con
un equipo de ejemplo y conversaciones por repartir), receta de capturas y vídeo
(`capturar-guia-usuarios.mjs`, sobre el taller) y narración. Se regenera con
`npm run build && scripts/generar-guia-usuarios.sh && npm run build`. Las
capturas CAMBIAN los datos (reparten, crean, editan), así que antes del vídeo
se vuelve a sembrar lo pendiente.

**La guía se compara con el CÓDIGO de `/equipo`**: la barra de trabajo, los
tres modos de reparto, las columnas de la tabla, los roles, los campos de
«Nuevo asesor», el «⋯» de cada fila, el «⋯» de la barra y las tres gráficas,
leídos de `team-client.tsx` y `TeamCharts.tsx`. Un mando nuevo sin su nombre
en la guía la pone en rojo.

#### Lo que se arregló en la pantalla al documentarla

| lo que pasaba | ahora |
| --- | --- |
| «Vincular existente» con el correo de CUALQUIER cuenta se la apropiaba | solo se vincula lo que ya se alcanza (`puertaParaVincular` → `assertCanAccessTargetUser`), y la opción solo sale a quien ya administra cuentas |
| «Reiniciar vínculos» al alcance de cualquier administrador | solo el súper administrador de verdad, tecleando `LIMPIAR` |
| la tabla y «Carga del equipo» contaban distinto a un asesor que atiende otra cuenta | las métricas van acotadas a la cuenta, igual que `getTeamAdvisors` |
| «Asignar sin atender» rechazaba a la administradora del equipo | usa la puerta de la pantalla (`laCuentaQueConfigura`) |
| guardar la auto-asignación repartía lo pendiente y solo decía «Configuración guardada» | devuelve cuántas repartió (`asignadas`), lo dice, y la tabla y las gráficas se ponen al día |
| repartir desde el «⋯» dejaba la tabla con los números de antes | vuelve a leer el equipo y las métricas (`refrescarElEquipo`) |
| «conversaciónes», «Automaciones», «Configuracion» | con su plural y sus tildes |
| los cinco paneles de automatizaciones repetían su título debajo del de la hoja | el título lo pone la hoja, una vez |
| «Mover a otra cuenta» sin destino, «Clientes asignados» en una cuenta sin clientes | se QUITAN, no se pintan en gris |
| «Permisos» enseñaba la ruta interna y el rol como clave | cuántos apartados ve, y el rol en palabras |

Tres cosas que hay que mantener:

1. **Guardar con la auto-asignación encendida CAMBIA datos** (reparte lo que
   estaba sin asesor), así que tiene que decirlo con el número y refrescar lo
   que se ve. Un «guardado» a secas hace desaparecer la columna Sin asignar del
   Pipeline sin que nadie sepa por qué.
2. **Las capturas no llevan marcas encima de lo que se lee**: un desplegable de
   Radix pone `aria-hidden` fuera de él, así que se mide ANTES de abrirlo; y se
   suelta el foco (`soltarElFoco`) antes de cada foto.
3. **La voz se sintetizó con la llave «Agente IA»**: la de «IA CRM» se quedó sin
   créditos en OpenAI. Si vuelve a faltar una frase, se pide desde el
   contenedor de la App con la llave que sí tenga saldo.
4. **A 1280 px la barra de `/equipo` no cabe entera** (le sobran 18 px) y la
   flecha «Ver más filtros» queda ENCIMA de la mitad de «Pipeline»: un clic en
   su centro se lo lleva la flecha. Es el diseño de `BarraDeAcciones`, no un
   fallo; el vídeo hace lo que haría una persona —pulsar la flecha antes—
   con `alAlcance`, que mira qué hay de verdad en ese punto
   (`elementFromPoint`). Se descubrió así: el botón estaba pintado, su
   caja decía que estaba ahí, y el Pipeline no se abría nunca.
5. **El color de las iniciales sale del id** (`colorFor`), así que la semilla
   pone ids FIJOS —y quita a la Sofía que crea antes `sembrar-barra.mjs` con un
   id al azar—. Si no, la misma persona sale de un color en las capturas y de
   otro en el vídeo.

Lo prueban `scripts/banco-guia-usuarios.sh` —el contenido contra el código, el
vídeo medido como los demás, las miniaturas en sus píxeles (`GUIA=usuarios`),
`fin-de-la-guia` y `menu-de-la-guia` —que barren las nueve guías— y la guía
servida a 390 y 1440— y `scripts/banco-equipo-usuarios.sh` —lo de la pantalla,
con las acciones de verdad contra Postgres—. Los dos con `MODO=roto` contra
`ab6b110`, que afirma que no había guía y los fallos de la pantalla.

### La décima guía, Respuestas Rápidas: y documentarla destapó respuestas que no veía nadie

`/guia/respuestas-rapidas` documenta Automatizaciones › Respuestas Rápidas
(`/auto-replies`) con el estándar de las nueve guías anteriores: ocho
secciones —vista general, crear una de texto, una que ejecuta un flujo,
editar, filtrar y buscar, ordenar, eliminar y usarlas en un chat—, una
miniatura con enfoque por tarjeta y el vídeo narrado con la voz Cedar y el
MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/auto-replies` (`GUIAS_PUBLICADAS`): «Aprende a crear y usar tus respuestas
rápidas en la plataforma».

No trae ninguna pieza propia: contenido (`lib/guia-respuestas-rapidas.ts`, con
`laGuiaDe`), semilla (`sembrar-guia-respuestas-rapidas.mjs`, sobre
`sembrarElMarco`, con respuestas de las dos clases, un flujo y una
conversación), receta de capturas y vídeo
(`capturar-guia-respuestas-rapidas.mjs`, sobre el taller) y narración. Se
regenera con `npm run build && scripts/generar-guia-respuestas-rapidas.sh &&
npm run build`.

**La guía se compara con el CÓDIGO**: las pastillas y el «⋯» de la barra con
`MainAutoReplies.tsx`, las categorías con `lib/quick-reply-categories.ts`, los
dos tipos con `ReplyTypeSelector.tsx` y las partes de una respuesta con sus
`data-zona` (`SortableAutoRepliesList.tsx`, `AutoRepliesCard.tsx`). Un mando
nuevo sin su nombre en la guía la pone en rojo.

#### Lo que se arregló en la pantalla al documentarla

Las reglas viven en `lib/respuestas-rapidas.ts` (pura) y las usan la
pantalla, las acciones y los TRES sitios de Chats que ofrecen una respuesta
—la barra «/», el panel de Atajos (⚡) y «Nueva conversación»—.

| lo que pasaba | ahora |
| --- | --- |
| lo que creaba alguien del equipo nacía a nombre de SU fila, y la pantalla lee por la cuenta: **no lo veía nadie, ni quien lo creó**. En producción había 14, con repetidas («referido», «referido_1»…) de volver a crearlas | `createRR` sube a la cuenta de la fila (`laCuentaDeLaFila`). Las ya creadas las devuelve `scripts/mover-respuestas-a-su-cuenta.mjs` (sin `--aplicar` solo dice qué haría), al FINAL de la lista de su cuenta y personales si las creó un agente |
| una respuesta de FLUJO no salía en ningún sitio de Chats: se le exigía el mensaje | `seOfreceEnChats`: a una de texto su mensaje, a una de flujo su flujo |
| en una línea de Waha una de flujo contestaba «no encontrada» | `sendWahaQuickReplyAction` lanza el flujo (con su `intention`, del flujo de la MISMA cuenta) |
| el panel de Atajos escondía las que no tienen atajo | salen todas; la barra «/» sigue ofreciendo solo las de texto con atajo (`seSugiereConLaBarra`): elegir una ahí PONE su mensaje, y una de flujo no tiene |
| el atajo se guardaba de dos formas —la tarjeta lo subía a MAYÚSCULAS y crear lo bajaba— y había uno guardado como «//bienvenida» | `comoAtajo`: sin la barra, en minúsculas y sin espacios, se toque por donde se toque; vacío es `null`, o borrar el atajo no borraba nada |
| una nueva nacía con el 0 de la columna, empatada o perdida en medio | sale la PRIMERA (`elOrdenDeUnaNueva`), sin mover a las demás |
| el orden eran N llamadas en fila india, y un asesor reordenando movía las personales de sus compañeros | una acción y una sentencia (`guardarElOrdenDeLasRespuestasAction`); lo que no se ve se queda en su sitio (`elOrdenConLasDemasEnSuSitio`) |
| con un filtro o una búsqueda puestos se reordenaba el trozo y las escondidas saltaban | no se reordena, y se dice (`porQueNoSePuedeOrdenar`) |
| la búsqueda no encontraba «Envío» tecleando «envio» | `pasaLaBusqueda`, la misma `sinTildes` de Mis notas, que mira también el flujo y la categoría |
| un asesor veía «Editar» en las de la cuenta y el servidor le contestaba «No autorizado» | cada respuesta trae `editable`, y lo que no puede tocar no ofrece mandos |

Cinco cosas que hay que mantener:

1. **Lo que decide si algo sale en Chats es `lib/respuestas-rapidas.ts`.** Con
   la regla escrita en cada uno de los tres sitios, una respuesta sale en uno y
   en otro no, y eso no se ve como un error.
2. **Una respuesta nueva es de la CUENTA; la de un agente, además suya**
   (`respuestas_personales`, la regla de *lo que crea un asesor es SUYO*). La
   persona no es nunca la dueña de la fila.
3. **El borrado en bloque pasa por `deleteRR`**, con las puertas de cada fila,
   y cuenta lo que no pudo.
4. **La receta localiza la fila que se edita por su POSICIÓN, sacada una vez
   por lo que dice** (`fijarLaFila`): al editar el atajo, la pastilla
   «/horario» pasa a ser un campo, su valor no cuenta como texto y `hasText`
   deja de encontrarla.
5. **`mover` y `pulsar` del vídeo NO desplazan nada**: llevan el ratón a la
   caja del elemento, y una fila por debajo del borde de la ventana (a
   1280×800, con la respuesta recién creada arriba) deja el clic fuera de la
   pantalla. El menú no se abre y el guion se cae con un plazo agotado que no
   dice por qué. Antes se trae con la rueda (`aLaVista`), como una persona.

Lo prueban `scripts/banco-guia-respuestas-rapidas.sh` —el contenido contra el
código, el vídeo medido como los demás, las miniaturas en sus píxeles
(`GUIA=respuestas-rapidas`), `fin-de-la-guia` y `menu-de-la-guia` —que barren
las diez guías— y la guía servida a 390 y 1440— y
`scripts/banco-respuestas-rapidas.sh` —las reglas y un barrido, y las acciones
de verdad contra Postgres—. Los dos con `MODO=roto` contra `ab6b110`, que
afirma que no había guía y los fallos de la pantalla.

### La undécima guía, Mis macros: lo que se arregló al documentarla

`/guia/macros` documenta Automatizaciones › Mis macros (`/macros`) con el
estándar de las nueve anteriores: diez secciones —vista general, crear una
macro, responder, otra línea, clasificar y enrutar, tareas y cierre, usar en un
chat, buscar y ordenar, activar/duplicar/eliminar y acciones masivas—, una
miniatura con enfoque por tarjeta y el vídeo de un minuto con la voz Cedar y el
MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de `/macros`
(`GUIAS_PUBLICADAS`): «Aprende a automatizar tus chats con acciones de un clic
en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-macros.sh && npm run build`.

No trae ninguna pieza propia. Lo que sí trajo es la pantalla arreglada, porque
documentarla destapó que **una macro podía decir «Macro aplicada» sin haber
hecho nada**:

| lo que pasaba | ahora |
| --- | --- |
| lo que ENVÍA (mensaje, respuesta rápida, flujo, archivo) salía siempre por Evolution, y el chat solo le pasaba la línea si tenía clave de Evolution: en una de WhatsApp Mensajería **no salía nada** y el aviso decía «aplicada» | sale por el proveedor de la línea de la conversación (`enviarPorLaLinea`, con `elProveedorDeLaLinea`): Waha, canales o Evolution con la clave puesta en el servidor |
| una acción que contestaba `success: false` contaba como hecha | cada una se MIRA (`exigir`) y el aviso lo arma `elResumenDeLaEjecucion`, que nombra lo que no salió y por qué; «parcial» sale en ámbar |
| una acción a medias (mensaje vacío, flujo sin elegir) se saltaba y contaba como hecha | `porQueNoEstaLista` es la misma pregunta al guardar y al correr: el editor —y ahora también el servidor— no guarda una a medias, y al correr una vieja se cuenta como fallida |
| «Enviar por otra línea» no ofrecía las de WhatsApp Mensajería y ponía «Empresa Demo» delante | `seOfreceParaEnviarPorOtraLinea` y `nombreDeLaCuenta`, con el nombre visible de la línea |
| el Agente IA se apagaba con la cuenta de quien pulsa | con la cuenta DUEÑA de la conversación |
| la lista decía «acciónes» y «ejecuciónes» | `elDetalleDeLaFila` |
| el menú de Macros de Chats se quedaba abierto tras lanzar una, comiéndose el primer clic | se cierra al terminar (controlado, `setAbierto(false)` en el `finally`); el nombre largo se lee entero en su `title` |

Las reglas viven en `lib/macros.ts` (puro) y las usan la pantalla, el menú del
chat, la acción y la guía. Tres cosas que hay que mantener:

1. **Activar o desactivar una macro vieja no pasa por la validación**: solo se
   comprueba lo que llega (`updateMacroAction` valida `actions` si vienen).
2. **Nada sale recortado con «…» en una captura**: `queNadaSalgaRecortado` corta
   la generación, en la lista y en el menú del chat. Se acorta en la semilla
   («Dar la bienvenida», «Pedir valoración»), no en la guía.
3. **El vídeo lanza la macro que no envía nada** («Marcar como caliente»:
   etiqueta, calificación y nota) y no elimina, ni duplica ni desactiva.
4. **Dos opciones pegadas de un menú no llevan un recuadro cada una**: con el
   relleno de la marca se montan. Va UNO alrededor del grupo y cada número a la
   izquierda de su opción (`sinRecuadro` + `numeroEn`), en el orden en que se
   ven —«Más acciones» y el «⋯» de las masivas—.

Lo prueban `scripts/banco-macros.sh` —las reglas y un barrido, y las acciones
contra Postgres con las ocho acciones internas apuntadas para afirmar por cuál
proveedor salió cada cosa; `MODO=roto` corre las de `ab6b110` y afirma que en
una línea de WhatsApp Mensajería no salía nada y decía «Macro aplicada.»— y
`scripts/banco-guia-macros.sh` (el contenido contra el código, el vídeo, las
miniaturas y la guía servida; `MODO=roto` contra `ab6b110`).

#### La voz iba por delante de Chats: la carga es un CORTE que no se graba

El vídeo publicado decía «Luego, en cualquier conversación de Chats, pulsas
Macros…» encima de la lista de macros y de «Cargando mensajes…»: la frase
empezaba y DESPUÉS se abría Chats, que tarda unos segundos. Medido en la
imagen, la conversación se veía **2,5 s después** de que la voz la nombrara, y
sin rótulo, porque la navegación se lo llevaba.

> **Lo que tarda en cargar una pantalla no sale en el vídeo.**
> `sinGrabarLaEspera(hacer)` (del taller, junto a `decir`) calla la frase que
> suena, hace `hacer` —abrir Chats y esperar a que la conversación tenga sus
> burbujas (`laConversacionCargada`)— y apunta ese rato como un CORTE. Al
> montar, la imagen lo pierde (`filtroSinLosCortes`) y la voz de después se
> adelanta lo mismo (`tramosSinLosCortes`); la frase empieza con la pantalla ya
> entera, y con su rótulo.

Cuatro cosas que hay que mantener:

1. **Un corte nunca parte una frase**: por eso calla antes, y
   `tramosSinLosCortes` se cae si alguna sonara dentro de uno.
2. **Es opcional**: las guías que no lo llaman se montan exactamente igual. Y
   `macros.json` dice dónde se empalmó (`cortes`) solo cuando lo hay.
3. **La grabadora escribe a 25 fps fijos**, y eso es lo que deja numerar los
   fotogramas seguidos al quitar el corte (`setpts=N/25/TB`): la imagen queda en
   el mismo reloj que la pista.
4. **Volver a Mis macros con «Gestionar macros» no necesita corte**: es una
   navegación dentro de la App y se pinta en menos de medio segundo (medido).

Lo prueba `lib/__tests__/video-guia-macros.test.mjs`: el corte con un vídeo de
colores hecho con ffmpeg, el guion, y en el vídeo publicado que la zona de la
conversación ya se ve como cargada cuando empieza la frase. `MODO=roto` lee el
vídeo de `7c6869f` y afirma que la conversación aparecía segundos después.

#### La ruedita del menú «Macros» de Chats va en el hueco del punto

Al lanzar una macro, la ruedita iba al FINAL de su fila y le quitaba su ancho
(14 px más 8 de hueco) al nombre: «Marcar como caliente» se leía «Marcar como
cali…» justo mientras corría. Ahora gira **en el hueco del punto de color**, con
el color de la macro, así que el nombre no cambia de ancho ni de sitio.

Dos cosas que hay que mantener:

1. **El hueco mide lo que el punto (10 px, `HUECO_DE_LA_MARCA`)**, no lo que la
   ruedita. Con un hueco de 14 px el nombre perdía 4 px también EN REPOSO, y
   con el panel más estrecho (a 1024) «Marcar como caliente» salía cortado sin
   que corriera nada. La ruedita (14 px) gira encima, centrada con `inset`
   negativo, y sobresale 2 px por lado sobre el relleno y el hueco.
2. **`inset` y no `translate`, y con `!`**: `animate-spin` es un `transform` y
   se comería el desplazamiento; y la fila de un menú fuerza todo `svg` a 16 px
   (`[&_svg]:size-4`), así que sin `!h-3.5 !w-3.5` la ruedita sale de 16.

Lo prueba `scripts/banco-ruedita-de-macros.sh`, en Chromium con el `MacrosMenu`
real, Poppins y el ancho de panel de la cabecera, a 1440/1280/1024: el nombre
mide lo mismo antes y mientras gira, la ruedita cae centrada donde estaba el
punto, y ninguna macro de la guía sale con «…».
`MODO=roto` monta el de `7c6869f` y afirma el recorte.

### La duodécima guía, Mis formularios: la lista, su EDITOR y lo que ve el cliente

`/guia/formularios` documenta Apps Externas › Mis formularios
(`/mis-formularios`) con el estándar de las once anteriores, y **las tres
pantallas del módulo**: la lista, el editor de un formulario (preguntas,
redirección a WhatsApp y URL personalizada) y sus Registros, más el formulario
público que llena el cliente (`/f/…`). Diez secciones —vista general, crear,
el editor, las preguntas, WhatsApp, el enlace corto, compartir, Google Sheets,
los registros y activar/eliminar—, una miniatura con enfoque por tarjeta y el
vídeo de un minuto con la voz Cedar y el mismo ritmo. Su tarjeta sale sola en
«Tutoriales del módulo» de `/mis-formularios` (`GUIAS_PUBLICADAS`): «Aprende a
crear formularios y recibir sus respuestas en la plataforma».

No trae ninguna pieza propia: contenido (`lib/guia-formularios.ts`, con
`laGuiaDe`), semilla (`sembrar-guia-formularios.mjs`, sobre `sembrarElMarco`),
receta de capturas y vídeo (`capturar-guia-formularios.mjs`, sobre el taller)
y narración. Se regenera con
`npm run build && scripts/generar-guia-formularios.sh && npm run build`.

Cinco cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene**: el banco compara cada lista
   (`CIFRAS_DE_LA_LISTA`, `MENU_DE_LA_TARJETA`, `CAMPOS_DEL_FORMULARIO`,
   `SECCIONES_DEL_EDITOR`, `MENU_DEL_EDITOR`, `CAMPOS_DEL_CAMPO`,
   `TIPOS_DOCUMENTADOS` y las de Registros) con lo que pintan
   `MisFormulariosClient`, `FormEditorClient`, `FormRegistrosClient` y
   `TIPOS_DE_CAMPO`. Un tipo de campo nuevo sin su nombre en la guía la pone
   en rojo.
2. **El diálogo de Google Sheets enseña el correo de la cuenta de servicio**, y
   es el de EJEMPLO que pone el lanzador común
   (`hojas@plataforma-ejemplo.iam.gserviceaccount.com`), el MISMO de la guía de
   Google Sheets: la guía es pública y el de verdad no se publica. Estuvo con
   el de producción, que el lanzador de esta guía exportaba por su cuenta; lo
   comprueba el banco, que falla si vuelve a poner el suyo.
3. **Pulsar una variable de WhatsApp la AÑADE al final del mensaje**, así que
   el guion escribe en orden (texto → variable → `Control+End` → texto). Con
   el cursor donde quedó, el mensaje salía revuelto.
4. **Las capturas cambian los datos** (crean «Solicitud de evento», le ponen
   WhatsApp y enlace corto, desactivan una encuesta), así que antes del vídeo
   se vuelve a sembrar. El vídeo no elimina nada: desactiva, que se deshace
   con el mismo interruptor.
5. **Ninguna marca tapa lo que se lee** (la regla de la guía de Mis notas): los
   números van a la esquina libre o en el hueco entre filas (`numeroEn`), los
   rótulos que repetían lo que ya dice la pantalla se quitaron, antes de una
   foto se suelta el foco (`soltarElFoco`), y lo que crece al guardar (la
   tarjeta de URL personalizada) se centra antes de fotografiarlo.

La narración se sintetizó el 2026-09-30 con la llave **«Agente IA»** de Panel ›
API keys: la de siempre, «IA CRM», contestaba `429` (sin créditos en OpenAI).
La voz es la misma —Cedar, el mismo modelo y las mismas instrucciones—, así que
la caché sirve igual; lo que hay que hacer es recargar «IA CRM».

Lo prueba `scripts/banco-guia-formularios.sh`: el contenido contra el código,
el vídeo medido como el de Diagramas, las miniaturas en sus píxeles
(`GUIA=formularios`), `fin-de-la-guia` y `menu-de-la-guia` —que barren las
doce guías—, el `pulsar` con un aviso encima (abajo) y la guía servida a 390 y
1440. `MODO=roto` lee `ab6b110` y afirma que no había guía, ni vídeo, ni
miniaturas, ni marcas en la pantalla, y que el clic se lo llevaba el aviso.

#### Un aviso que tapa lo que el vídeo pulsa: `pulsar` espera con el cursor FUERA

El vídeo se quedaba a medias en el Guardar del enlace corto, y no era la
pantalla. La URL personalizada es la ÚLTIMA tarjeta del editor, así que por
mucho que se pida el centro se queda pegada al borde de abajo, que es donde
sale el aviso «WhatsApp guardado» del paso anterior. Su Guardar quedaba debajo
del aviso —y de la franja invisible de 15 px que cada aviso lleva encima
(`[data-sonner-toast]::after`)—, así que el clic se lo llevaba el aviso: el
enlace no se guardaba, sin un solo error. Y el cursor se quedaba ENCIMA del
aviso, y **sonner no quita un aviso con el puntero sobre él**: esperar ahí era
esperar para siempre.

> **`pulsar` (el taller común) pregunta antes qué hay en el centro de lo que va
> a pulsar** (`queAvisoTapa`, con `elementFromPoint`: la caja del botón dice que
> está ahí aunque esté debajo de otra cosa). Si es un aviso, el cursor se queda
> justo a su izquierda y pulsa en cuanto se va (`sinAvisoEncima`). Vale para
> todas las guías, sin tocar ninguna receta.

Tres cosas que hay que mantener:

1. **Lo que se espera es lo que le queda al aviso**, con la narración sonando
   mientras tanto: no es un `quitarAvisos`, que en el vídeo está prohibido. En
   el de Mis formularios fueron 1,2 s.
2. **El cursor espera FUERA del aviso.** Encima lo para, y se quedaría ahí.
3. **Hay un tope** (`ESPERA_POR_UN_AVISO_MS`, 12 s): un aviso que no se va solo
   corta la generación con su motivo en vez de dejar un vídeo mudo.

Lo prueba `lib/__tests__/pulsar-con-un-aviso-encima.test.mjs`, en Chromium con
el `Toaster` real de la App y el botón debajo del aviso y en su franja
invisible. `MODO=roto` corre el `pulsar` de `ab6b110` y afirma el fallo: el
clic no llega, el cursor queda encima y el aviso sigue ahí pasados sus 4 s.

### La decimotercera guía, Copiloto: la pantalla tiene DOS dueños, y la guía los separa

`/guia/copiloto` documenta Herramientas › Copiloto (`/copiloto`) con el mismo
estándar: nueve secciones —vista general, entrar por primera vez, preguntar,
qué hacer con una respuesta, tus conversaciones, elegir la IA, adjuntar y
dictar, fijar en Chats y pantalla completa, y tu cuenta del copiloto—, una
miniatura con enfoque por tarjeta y el vídeo narrado con Cedar al MISMO ritmo.
Su tarjeta sale sola en «Tutoriales del módulo» de `/copiloto`: «Aprende a
redactar mensajes y resolver dudas con IA en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-copiloto.sh && npm run build`.

Lo que la hace distinta es que dentro de la pantalla va OTRA aplicación: el
copiloto es LibreChat v0.8.7 (`copiloto.ia-app.com`), en un `<iframe>`.

> **Lo de la plataforma sale de `lib/copiloto.ts`** —los dos botones, el
> nombre de la pestaña que se fija en Chats— y es lo mismo que pinta
> `MainCopiloto.tsx`. **Lo de dentro son rótulos del copiloto**, que no son
> nuestros: cada lista de `lib/guia-copiloto.ts` lleva la `etiqueta` exacta
> que enseña, y `anotar()` guarda lo que VIO en
> `scripts/copiloto-guia-librechat.json`. El banco exige que cada etiqueta que
> la guía nombra estuviera ahí: si el copiloto se actualiza y un botón cambia
> de nombre, la guía se pone en rojo.

Seis cosas que hay que mantener:

1. **Las capturas no se toman contra producción.** Desde aquí no se llega a
   `copiloto.ia-app.com`, y aunque se llegara escribirían conversaciones en la
   cuenta de alguien y cada respuesta costaría dinero. `copiloto-de-la-guia.sh`
   levanta el MISMO LibreChat (imagen fijada, `librechat.yaml` de producción,
   registro y entrada por correo como allí) con su Mongo y su Meilisearch, y
   una IA de ejemplo (`ia-de-ejemplo.mjs`, `:4010`) en lugar de OpenAI y
   DeepSeek. Lo único que se afloja es el tope de entradas: las capturas entran
   una vez por contexto y el de producción las bloqueaba a la décima.
2. **La página de la App y el copiloto tienen que ser del MISMO sitio**
   (`localhost` y `localhost:3080`, nunca `127.0.0.1`): la sesión del copiloto
   es una cookie, y entre sitios distintos el navegador no la manda dentro de
   un marco. `preparar.mjs` deja el copiloto como al empezar —cuatro
   conversaciones de ejemplo, cada una en su día— antes de las capturas y
   antes del vídeo, escribiéndolas en el copiloto de verdad y tocando en su
   base solo la fecha.
3. **Lo guardado es lo que se LEE**: `anotar()` quita el texto que solo oye
   un lector de pantalla, y el copiloto lo esconde de DOS formas —la clase
   `sr-only` y un estilo en línea con el recorte a 0—. Con una sola, el
   selector se guardaba como «OpenAIseleccionado» y la guía, que dice
   «OpenAI», no encontraba su rótulo.
4. **La «Guía rápida» de Chats se da por vista** en el vídeo
   (`SIN_LA_GUIA_RAPIDA`, un `addInitScript` sobre `chat-onboarding-shown`).
   Con el foco dentro del marco del copiloto, el Escape que la apartaba no le
   llega, y el primer clic del vídeo en Chats se lo comía su ventana.
5. **El cursor dibujado es uno, el del documento de arriba**
   (`cursor-de-la-guia.mjs`): dentro del marco del copiloto el ratón se mueve
   en OTRO documento, y ese le cuenta a la página de arriba dónde está la
   punta y qué forma toca —el mismo mecanismo que estrenó la guía de Google
   Sheets con su hoja incrustada—. Y a PANTALLA COMPLETA el cursor y el rótulo
   se mudan dentro del elemento que la ocupa: colgados del `<body>` quedaban
   debajo y el vídeo los perdía. Vale para cualquier guía con un marco dentro.
6. **Lo que no se puede hacer aquí se hace en producción, y solo eso**: las
   diez frases nuevas de Cedar se sintetizaron desde el contenedor de la App
   con la llave «IA CRM» (ver *El vídeo: el cursor de VERDAD y narración*). La
   frase de la barra de arriba es la de Leads, así que su audio ya estaba.

Lo prueba `scripts/banco-guia-copiloto.sh`: lo de la plataforma contra
`lib/copiloto.ts`, lo del copiloto contra lo que enseñó, el vídeo medido como
el de Mis notas, las miniaturas en sus píxeles (`GUIA=copiloto`),
`fin-de-la-guia` y `menu-de-la-guia` —que barren todas las guías—, el cursor
en Chromium con un marco de OTRO origen y a pantalla completa (un solo cursor,
en la punta del ratón, y dentro del elemento a pantalla completa; con el
cursor de `ab6b110` los dos casos se ponen en rojo) y la guía servida a 390 y
1440. `MODO=roto` lee `ab6b110` y afirma que no había guía, ni vídeo, ni
miniaturas.

### La decimocuarta guía, AI Imágenes: la única pantalla que habla con FUERA, y se fotografía igual

`/guia/ai-imagenes` documenta Apps Externas › AI imágenes (`/ai-image`) con el
estándar de las otras trece: nueve secciones —vista general, la API key, el
producto, la campaña, el estilo, el motor, generar, el texto del post y el kit
de landing—, una miniatura con enfoque por tarjeta y el vídeo de un minuto con
la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo»
de `/ai-image` (`GUIAS_PUBLICADAS`): «Guía de AI Imágenes» y «Aprende a crear
anuncios de tu producto con IA en la plataforma».

No trae ninguna pieza propia salvo una, y es la que la distingue: **generar un
anuncio es una llamada a Gemini con la API key de la cuenta**, y en el banco no
hay clave de Google —ni debe haberla: sería la de un cliente— ni red hacia
Google. Así que la contesta un doble.

> **El Gemini fingido (`scripts/fingido-guia-ai-imagenes.mjs`) se carga DENTRO
> de `next start`** con `NODE_OPTIONS=--import`, y lo pone el lanzador común
> (`generar-guia.sh`) para cualquier guía que tenga su
> `fingido-guia-<modulo>.mjs`. Parchea `globalThis.fetch` antes de que Next
> ponga el suyo, así que **todo lo demás es de verdad**: la acción, el SDK con
> su petición, el cobro de créditos, el hook que reparte por vista y el panel
> del texto. Lo único que no sale de la casa es la respuesta.

Seis cosas que hay que mantener:

1. **Qué devuelve lo decide la PETICIÓN, no un contador**: la etapa se lee del
   prompt (`MARCAS_DE_LA_ETAPA`, las frases que escribe `generateAdImage`), el
   formato de `aspectRatio` y la red del prompt del copy (`REDES_DEL_PROMPT`).
   El banco comprueba que las marcas son las de la acción y las redes las de
   `LAS_REDES`: si la pantalla gana una etapa, el doble no la reconoce y se pone
   rojo.
2. **Las imágenes de ejemplo se generaron UNA vez** con Gemini de verdad
   (`generar-ejemplos-ai-imagenes.mjs`, desde el contenedor de la App, como la
   voz) y viven en `scripts/guia-ai-imagenes/` con sus textos
   (`copies.json`). Solo el producto héroe tiene todos los formatos y redes, así
   que **el vídeo se queda en Hero**: una etapa sin ejemplo saldría vacía.
3. **La pantalla expone sus marcas** (`data-panel`, `data-zona`, `data-paso`,
   `data-boton`, `data-formato`, `data-etapa`…) y las recetas no usan
   coordenadas. Y **no hay `SOLO_MINIATURAS`**: cada miniatura se toma con su
   captura, porque hace falta una tanda generada y el kit encendido.
4. **El vídeo no guarda la clave ni borra estilos**: nombra «Cambiar» y la
   papelera, no las pulsa. El banco falla si el guion pulsa «Guardar».
5. **La API key se pone en ESTA pantalla, con «Configurar»**, no en Mi Perfil
   (Perfil solo ofrece OpenAI): el mensaje de antes mandaba a un sitio donde no
   se puede poner. Y sin clave, el último paso ofrece **«Configurar API key»**
   en vez de «Generar imagen»: un botón que al pulsarlo solo puede dar error es
   peor que uno que dice qué falta.
6. **Regenerar**: `npm run build && scripts/generar-guia-ai-imagenes.sh`
   (`SIN_VIDEO=1` o `SOLO_VIDEO=1`) y volver a construir.

#### Y documentarla destapó diez fallos de la pantalla, que ya están arreglados

| lo que pasaba | ahora |
| --- | --- |
| el paso 2 se llamaba «imagen», en minúscula y diciendo otra cosa | «Campaña» |
| sin clave, el aviso mandaba a «Mi Perfil» | al botón «Configurar» de la propia pantalla (`FALTA_LA_CLAVE`, que `porQueFalloGemini` reconoce como `sin_clave`) |
| la foto del producto y la generada viajaban siempre como `image/png`, fueran lo que fueran | con SU tipo (`lib/imagen-en-base64.ts`: `partirLaImagen`, `comoDataUrl`) |
| borrar un estilo lo quitaba de la pantalla pasara lo que pasara, sin preguntar | pide confirmación, se pinta al momento y vuelve a su sitio si el servidor dice que no, con aviso |
| el chulito del estilo elegido caía encima de la papelera | cada uno en su sitio |
| el servidor guardaba una clave vacía y un estilo sin nombre | los rechaza, con su motivo |
| los dos `catch` de la página eran mudos: un fallo de lectura se veía como «te falta la API key» | avisan en la consola (`[ai-image]`) |
| los nombres de las etapas de la campaña se cortaban con «…» («Identificación del pro…») | parten en dos líneas y se leen enteros |
| la vista previa recortaba el anuncio: la caja se estira con el panel y la imagen iba `object-cover`, así que de un 9:16 se veía una tira | `object-contain`: el anuncio se ve entero, en su formato |
| arriba del menú, en TODAS las pantallas, decía «1 cuenta asociadas» | el adjetivo va con el número (`getAccountCountLabel`): «1 cuenta asociada», «3 cuentas asociadas» |

Más los acentos que faltaban en toda la pantalla (Iluminación, Solución,
Demostración, «Aún no hay vista generada»…).

Lo prueba `scripts/banco-guia-ai-imagenes.sh`: los arreglos de la pantalla
(`pantalla-ai-imagenes.test.mjs`), el contenido contra el código —los pasos, los
formatos, las etapas, los estilos, los motores, las calidades y las redes—, el
doble contra la acción, el vídeo medido como el de Diagramas, las miniaturas en
sus píxeles (`GUIA=ai-imagenes`), `fin-de-la-guia` y `menu-de-la-guia` —que
barren todas las guías— y la guía servida a 390 y 1440. `MODO=roto` lee
`ab6b110` y afirma que no había guía, ni doble, ni vídeo, y los fallos de la
pantalla.

## Documentación pública › La decimoquinta guía, Finanzas: el resumen y sus seis pantallas, y lo que se arregló al documentarlas

`/guia/finanzas` documenta Panel › Finanzas (`/dashboard/finance`) y sus seis
pantallas —Ventas, Gastos, Clientes, Proveedores, Cuentas y Configuración— con
el estándar de las demás: diez secciones (vista general, el resumen del
año, Ventas, Gastos, el filtro de fecha, Clientes, Proveedores, Cuentas,
Configuración y las acciones de cada fila), una miniatura con enfoque por
tarjeta y el vídeo de un minuto con la voz Cedar y el MISMO ritmo. Su tarjeta
sale sola en «Tutoriales del módulo» de `/dashboard/finance` y de sus
subpantallas: «Guía de Finanzas», con «Aprende a registrar ventas y gastos y
ver tu balance en la plataforma».

No trae ninguna pieza propia: contenido en `lib/guia-finanzas.ts`
(`laGuiaDe`), semilla en `sembrar-guia-finanzas.mjs` (sobre `sembrarElMarco`),
receta en `capturar-guia-finanzas.mjs` (sobre el taller) y narración en
`narracion-guia-finanzas.mjs`. Se regenera con
`npm run build && scripts/generar-guia-finanzas.sh && npm run build`.

> **Las seis listas son UNA pantalla escrita una vez.** Eran tres tablas
> distintas, tres juegos de botones de fila y un filtro de fecha en unas sí y
> en otras no. Ahora pintan `TablaDeFinanzas`, sus filas llevan
> `AccionesDeLaFila` (Editar y Eliminar con confirmación), las columnas comunes
> salen de `ColumnasDeMovimientos`, el filtro de fecha es `FiltroDePeriodo`
> (Todo, Mes, Rango; `lib/periodo-de-finanzas.ts`) y la fila de accesos, de
> `lib/accesos-de-finanzas.ts`. Y los dos DETALLES —el de una venta y el de un
> gasto— salen de `lib/detalle-de-finanzas.ts`.

Lo que se arregló al documentarlas, que no daba ningún error:

| lo que pasaba | ahora |
| --- | --- |
| la fila de accesos no llevaba al Resumen | es la primera, y la pantalla que se tiene delante sale marcada (`elAccesoActivo`) |
| el resumen anual solo cambiaba de mes | flechas de año, conservando el mes |
| el eje de la gráfica escribía «850.0k» y salía cortado | sin el «.0» |
| «Fijo» salía de la lista de una empresa de software: un «Arriendo» era variable | `CATEGORIAS_DE_GASTO_FIJO` (nómina, arriendo, servicios, internet…), sin tildes ni mayúsculas, y la guía nombra exactamente esas |
| en los dos detalles la X de cerrar quedaba ENCIMA de Eliminar, y no se parecían (980 y 820 px) | la cabecera deja `SITIO_PARA_LA_X` (48 px, `pr-12`) y la X se baja al centro de los botones (`--cerrar-arriba`, `laAlturaDeLaX`) |
| la columna «Concepto» de Gastos enseñaba el proveedor | `elConceptoDelGasto`; el proveedor va aparte, y el buscador encuentra los dos |
| el código de un contacto era «cuántos hay + 1», y el borrado en bloque borraba DE VERDAD | `elSiguienteCodigo`: sigue al más alto (C-1, C-2… / P-1, P-2…), y en bloque marca `DELETED` como el de uno en uno |
| el «Nuevo» del resumen (venta o gasto) abría su menú FUERA de la pantalla: se pulsaba y no pasaba nada | `BotonDeCrear` pasa su `ref` (`forwardRef`). Radix ancla el menú de un `Trigger asChild` con la ref del hijo; sin ella se queda en `translate(0,-200%)`. Vale para cualquier botón de la casa que se meta en un `asChild` |
| en los detalles, 16 px de más entre la cabecera y la primera tarjeta | `gap-0` en `DIALOGO_DEL_DETALLE`: `DialogContent` es una rejilla con `gap-4` |

Cinco cosas que hay que mantener:

1. **Las capturas en español necesitan DOS cosas**: `args: ["--lang=es-CO"]`
   y `env LANG=es_CO.UTF-8`. El `locale` del contexto no basta: los campos de
   fecha y de mes los pinta el proceso de Chromium con su idioma.
2. **Mientras un `Select` de Radix está abierto, lo de fuera es
   `aria-hidden`**: `getByRole` no encuentra el botón de Guardar. Se mide
   antes de abrir.
3. **La receta comprueba que la X no tape nada** (`queLaXNoTapeNada`) al abrir
   los dos detalles, y que el menú de «Nuevo» caiga dentro de la pantalla: si
   una de las dos vuelve, la generación se corta.
4. **Si «IA CRM» no tiene crédito**, `sintetizar-voz-desde-la-app.mjs` prueba
   las demás llaves de Panel › API keys, desde el contenedor de la App y sin
   sacar la llave de allí.
5. **La zona de una miniatura es lo que SE VE** (`cajaVisible`): el
   rectángulo recortado por cada antepasado que desplaza y por la ventana.
   Con `boundingBox` a secas, la fila de accesos, una tabla ancha y una lista
   larga daban una zona más grande que la pantalla y el recuadro se salía de
   la tarjeta. Una lista larga (Ventas, Gastos) enseña su cabecera y sus
   primeras filas (`FILAS_EN_LA_MINIATURA`).

Lo prueban `scripts/banco-guia-finanzas.sh` —el contenido contra el código
(accesos, columnas, campos, modos del filtro, acciones de fila, categorías
fijas), el vídeo medido como el de Diagramas, las miniaturas en sus píxeles
(`GUIA=finanzas`), `fin-de-la-guia` y `menu-de-la-guia` —que barren todas las
guías— y la guía servida a 390 y 1440— y `scripts/banco-finanzas-simetrica.sh`,
con las reglas y un barrido de las seis pantallas. Los dos con `MODO=roto`
contra `ab6b110`, que afirma que no había guía y los fallos de la tabla.

## Documentación pública › La decimosexta guía, Mis datos: una hoja de Google FINGIDA, y la pantalla arreglada

`/guia/mis-datos` documenta Integraciones › Mis datos (`/my-data`) con el
mismo estándar: seis secciones —vista general, Google Sheets, los datos
importados, la base de conocimiento, los bloques y el «⋯» de cada opción—, una
miniatura con enfoque por tarjeta y el vídeo con la voz Cedar y el MISMO ritmo.
Su tarjeta sale sola en «Tutoriales del módulo» de `/my-data`
(`GUIAS_PUBLICADAS`): «Aprende a darle a tu agente IA los datos de tu negocio
en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-mis-datos.sh && npm run build`.

Cinco cosas que hay que mantener:

1. **La hoja de Google la contesta `scripts/fingido-guia-mis-datos.mjs`**,
   cargado DENTRO de `next start` con el MISMO mecanismo que el Gemini fingido
   de AI Imágenes (`generar-guia.sh` lo pone con `--import` cuando existe
   `fingido-guia-<modulo>.mjs`). Nació como un `servidor-guia-*.cjs` con
   `--require` en otra rama y se fundió al juntarlas: dos mecanismos para lo
   mismo son uno que se afina y otro que se queda atrás. Este equipo no sale a
   internet, y una guía no puede depender de una hoja que alguien puede
   borrar. Sus filas se cruzan a propósito con la semilla —ocho existen y
   cuatro son nuevas—, así el resumen enseña «Creados» y «Actualizados».
2. **Los nombres que la pantalla y la guía comparten salen de
   `lib/pantalla-de-mis-datos.ts`** (las dos opciones, sus pestañas, las
   columnas, los separadores, el título), y el banco comprueba que la pantalla
   también los lee de ahí.
3. **Las dos opciones se pintan con las MISMAS piezas**: `PestanasDeLaSeccion`
   (las pestañas Importar y Gestionar y el «⋯»), y el lápiz y la papelera de
   cada fila con `components/shared/EditarYEliminar.tsx` —la tabla los
   escondía detrás de un «⋯» y la lista de bloques los enseñaba sueltos—.
4. **El vídeo abre el «⋯» y lo cierra con Escape**: sus acciones borran o
   apagan TODO, y nada se confirma delante de la cámara.
5. **Seis secciones y no ocho**: `miniaturas-guia-leads` compara lo leído con
   las secciones de la guía compilada, tenga las que tenga.

Y dos que el vídeo destapó en el taller común (`taller-de-la-guia.mjs`), que
valen para todas las guías:

- **`mover` trae a la vista lo que está fuera de la ventana** (desplazamiento
  suave) y se cae si aun así no se ve. Antes movía el ratón a un punto fuera de
  la pantalla, el clic no tocaba nada y el vídeo se quedaba esperando un
  resultado que no llegaba.
- **`pulsar` trae a la vista, espera a los avisos y después mira que no haya
  NADA encima.** Un aviso lo resuelve `sinAvisoEncima` —el cursor espera fuera
  de él, porque con el ratón encima sonner pausa su reloj y no se va nunca—, y
  por eso va ANTES de `mover` y después de traer el botón a la ventana (un
  aviso solo tapa lo que está en ella). Lo demás —un menú que no se cerró, una
  capa puesta— lo caza `sinNadaEncima`, que se cae diciendo qué lo tapa. Y lo
  que se arregló en Mis datos fue la pantalla que ponía el aviso encima del
  botón, no la espera.

Y lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| «Línea en blanco doble» llevaba `value="\n\n"` en el JSX: un atributo no interpreta la barra, viajaban cuatro caracteres y el texto entraba como UN bloque | `SEPARADORES_DE_LA_BASE` separa `valor` de lo que parte (`elSeparador`) |
| sin pestaña en la URL se pedía `&gid=` vacío (`"".trim() ?? "0"` nunca cae en el `"0"`), y un `#heading=…` se colaba | `laUrlDelCsv` (`lib/url-de-google-sheets.ts`): siempre `docs.google.com`, y el `gid` solo si son dígitos |
| el «⋯» de Google Sheets contaba lo que le pasaba Gestionar: en Importar decía «(0)» y apagaba el borrado | cuenta él al abrirse (`contarExternalClientData`) |
| la cabecera decía «Mis Datos Externos» y el menú «Mis datos»; las pestañas, «Importar/Gestión» en una y «Importar contenido/Gestionar bloques» en la otra | un nombre, de `lib/pantalla-de-mis-datos.ts` |
| la tabla cargaba 200 y el pie decía el total, así que el resto no se alcanzaba | «Cargar más» de 200 en 200, y el pie dice «200 de 350» |
| importar buscaba al cliente solo por su forma canónica (`…@s.whatsapp.net`): uno guardado antes con el número pelado o con `@c.us` no se encontraba y se creaba OTRO | `elRegistroDelMismoNumero` busca por todas las formas del MISMO teléfono (`lasFormasDelMismoNumero`) y deja la fila en la canónica; nunca un `@lid` |
| guardar a mano pasaba cualquier clave por la regla del número: editar el SKU «SKU-001» de un catálogo guardaba `001@s.whatsapp.net` y dejaba el de verdad sin cambiar | solo un número pasa a su forma de WhatsApp (`esUnNumeroDeWhatsApp`); una clave de catálogo se queda como está |
| la tabla pintaba `573004522013@s.whatsapp.net` | enseña el número (`laClaveQueSeLee`), con la clave entera en su `title` |
| una fila que no entraba en la importación se contaba como error sin decir por qué | `[mis-datos] una fila de la importación no se pudo guardar`, con su código |
| «Ver columnas» sacaba el aviso «6 columnas detectadas» abajo a la derecha, justo ENCIMA de «Iniciar importación»: el clic se lo comía el aviso | sin aviso: la cifra ya se lee debajo del selector de la columna |
| el selector del tipo de datos y el del separador recortaban su texto; la vista previa se cortaba a 160 px de alto | miden lo que dicen (`w-auto max-w-full`), y la vista previa enseña sus cinco filas |
| un bloque importado guardaba su «### título» dentro del contenido: la lista lo enseñaba dos veces, con la almohadilla, y el agente recibía la marca | `elContenidoSinElTitulo`: el contenido es lo de debajo del encabezado; y «Encabezados Markdown» parte en la LÍNEA que empieza por `###` (`ANTES_DE_CADA_ENCABEZADO`), como la detección automática |
| el título de un bloque se pintaba en MAYÚSCULAS en el diálogo y se convertía al teclear: un bloque importado se veía distinto de lo guardado y, con tocar una letra, quedaba en mayúsculas; uno creado a mano salía distinto de los importados | se ve y se guarda tal cual se escribe; lo ya guardado no se toca |

Lo prueban `scripts/banco-guia-mis-datos.sh` (el contenido contra la pantalla,
la tarjeta de Tutoriales, el vídeo medido, las miniaturas en sus píxeles y la
guía servida), `scripts/banco-pantalla-de-mis-datos.sh` (las reglas y un
barrido de las piezas compartidas y de los `catch` mudos) y
`scripts/banco-mis-datos.sh`, que ahora corre también
`mis-datos-sin-duplicados-db.test.mjs` contra Postgres: una hoja con clientes
guardados en formas viejas los ACTUALIZA, importarla dos veces no duplica, un
`@lid` no casa con nadie y editar un SKU no crea un registro fantasma. Los tres
con `MODO=roto` contra `ab6b110` (el de Postgres empaqueta las acciones de ese
commit en un `git worktree`), que afirma los fallos de la tabla de arriba.

La voz se sintetizó desde el contenedor de la App con la llave «Agente IA» de
Panel › API keys: «IA CRM» contestó que no le quedan créditos en OpenAI y
«Grupo Verzay» que la llave no vale. Si una guía nueva necesita voz, se prueba
por nombre hasta la que conteste.

## Documentación pública › La decimoséptima guía, Llamadas: llamar, el historial y sus ventanas, sin llamar a nadie

`/guia/llamadas` documenta Bandeja › Llamadas (`/crm/llamadas`) con el estándar
de las anteriores: ocho secciones —vista general, llamar (tú o el asistente con
IA), el historial y sus filtros, abrir el chat desde una llamada, el resultado y
el nombre, agendar un callback, el detalle (grabación, Resumen IA y
transcripción) y el mensaje al no contestar—, una miniatura con enfoque por
tarjeta y el vídeo de minuto y medio con la voz Cedar y el MISMO ritmo. Su
tarjeta sale sola en «Tutoriales del módulo» de `/crm/llamadas`. Ninguna pieza
propia: contenido en `lib/guia-llamadas.ts`, semilla
`sembrar-guia-llamadas.mjs`, receta `capturar-guia-llamadas.mjs` y narración
`narracion-guia-llamadas.mjs`. Se regenera con
`npm run build && scripts/generar-guia-llamadas.sh && npm run build`.

Cuatro cosas que hay que mantener:

1. **Ni las capturas ni el vídeo llaman a nadie**: señalan «Llamar» y «Llamar
   IA» y los dejan sin pulsar; el vídeo cancela el callback y el mensaje al no
   contestar. La grabación de ejemplo es un audio de la caché de Cedar servido
   por la receta (`ctx.route`), y los números y nombres son de ejemplo.
2. **El contenido se compara con el código**: las direcciones, las columnas,
   los resultados, los dos botones de la ventana de llamar en su orden, el «⋯»
   de la fila y el de la barra, y las tres partes del detalle en su orden
   (`guia-llamadas.test.mjs`). Una opción nueva sin su nombre la pone en rojo.
3. **El paso a Chats y la vuelta son CORTES** (`sinGrabarLaEspera`): la carga
   de la conversación no sale en el vídeo.
4. **Con un menú de Radix abierto lo de fuera es `aria-hidden`**: la receta
   mide los tres puntos de la fila y de la barra ANTES de abrirlos.

Lo prueba `scripts/banco-guia-llamadas.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=llamadas`, `fin-de-la-guia`, `menu-de-la-guia`
y la guía servida a 390 y 1440); `MODO=roto` contra `2c7b35e` afirma que no
había guía.

## Documentación pública › La decimoctava guía, Productos: y documentarla destapó productos que nacían agotados

`/guia/productos` documenta Entrenamiento › Productos (`/products`) con el
mismo estándar: diez secciones —vista general, buscar, las cifras, ver el
catálogo, crear, fotos, precio, categoría y código, inventario, y editar,
ordenar y eliminar—, una miniatura con enfoque por tarjeta y el vídeo con la
voz Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/products` (`GUIAS_PUBLICADAS`). Ninguna pieza propia: contenido con
`laGuiaDe` (`lib/guia-productos.ts`), semilla sobre `sembrarElMarco`, receta
sobre el taller (las fotos del catálogo las sirve `imagenes-guia-catalogo.mjs`).
Se regenera con `npm run build && scripts/generar-guia-productos.sh && npm run build`.

Lo que se arregló en la pantalla al documentarla (las reglas, puras, en
`lib/productos.ts`):

| lo que pasaba | ahora |
| --- | --- |
| el interruptor de inventario nacía en «Sin límite» y el formulario en 0: un producto nuevo se guardaba **agotado** y en el catálogo perdía su botón de WhatsApp | los dos nacen de `elInventarioAlAbrir` (sin límite si es nuevo) |
| «Sin stock» contaba los de inventario sin límite (`stock <= 0` incluye el -1) | cuenta CERO unidades (`estaAgotado`) |
| Guardar con la categoría vacía no hacía nada | el campo enseña su error y sale `porQueNoSeGuardaElProducto` |
| abrir un producto con código decía «Este código ya está registrado» sobre el suyo | `checkIfSkuExists` excluye el que se edita; y un código repetido no se guarda |
| el buscador solo miraba el nombre | nombre, código y categoría (`dondeBusca`) |
| arrastrar en la página 2 (o con una búsqueda) escribía `0..n` sobre ese trozo y lo subía por delante de la página 1 | `elOrdenCompleto`: lo movido se coloca en los sitios que ya ocupaba |
| borrar un producto lo dejaba en el catálogo público | se revalida `/catalogo` |
| el botón de crear decía «+ Agregar» y el pie del formulario era un `div` a mano | `BotonDeCrear` («Nuevo») y `DialogFooter` |

Y de la receta, lo que vale para las siguientes: **una marca con rótulo solo
donde hay hueco**. En un formulario de dos columnas cada rótulo cae sobre el
campo de al lado; ahí va solo el recuadro y lo explica el texto de la guía. Y
antes de cada foto se suelta el foco (`sinFoco`): al cerrar un diálogo el foco
vuelve al lápiz de la fila y su anillo se lee como otra marca.

Lo prueba `scripts/banco-guia-productos.sh`: el contenido contra la pantalla
(columnas, cifras y campos leídos del código), las reglas, el vídeo, las
miniaturas en sus píxeles (`GUIA=productos`), `fin-de-la-guia` y
`menu-de-la-guia` —que barren todas las guías— y la guía servida a 390 y 1440.
`MODO=roto` lee `7767f6f` y afirma que no había guía y los fallos del
formulario y de la cifra.

## Documentación pública › La decimonovena guía, Crear flujos: la lista Y su editor, y las pastillas ahora filtran

`/guia/flujos` documenta Creación de Flujos (`/workflow`) **y su editor** con
el estándar de las anteriores: diez secciones —vista general, los cuatro
tipos (Inicio, IA, Flujo y Chatbot), crear, palabras clave y disparadores, el
editor, agregar pasos, automatizaciones, seguimientos, el «⋯» de una tarjeta
y los límites del plan—, una miniatura con enfoque por tarjeta y el vídeo de
un minuto con la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en
«Tutoriales del módulo» de `/workflow`: «Aprende a crear flujos automáticos
para tus chats en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-flujos.sh && npm run build`.

> **De qué tipo es un flujo lo decide `lib/flujos-de-la-lista.ts` (pura), y lo
> usan la barra, la lista y la guía**: la bienvenida gana a todo; con
> disparador de IA es de IA aunque tenga palabras clave; con palabras clave,
> Chatbot; y lo demás, Flujo. Con el tipo deducido en dos sitios, una pastilla
> diría «3» y al pulsarla saldrían 2.

Lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| las cuatro pastillas de tipo eran cifras sueltas (`no son pulsables`) | filtran: pulsarla deja ese tipo, pulsarla otra vez lo quita (`alPulsarUnTipo`) |
| la búsqueda miraba el JSON crudo de las palabras clave, así que «contiene» encontraba todos los chatbots | busca en el nombre y en las palabras de verdad (`lasPalabrasClave`, `pasaElFiltro`) |
| con una búsqueda puesta se podía arrastrar una lista a la que le faltaban filas | el asa se apaga y dice por qué (`porQueNoSePuedeOrdenar`) |
| «CREAR FLUJO» en mayúsculas en la barra, y el «⋯» decía «Mas Acciones», «Bienvenida» y «Quitar» | «Nuevo» (`BotonDeCrear`), «Más acciones», «Usar como bienvenida» y «Quitar bienvenida» |
| los controles del lienzo en inglés («Zoom In», «Fit View») | en español (`ETIQUETAS_DEL_LIENZO_DEL_FLUJO`), como Diagramas |
| en «Selecciona una acción», pasar el ratón por una fila a medio ver desplazaba la lista y el clic caía en la fila de al lado (pasaba también en Diagramas) | la lista solo se desplaza sola con el teclado o al buscar, nunca por el ratón (`porRaton`, en los dos `InlineAddNode`) |

Cuatro cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene**: el banco compara los tipos con
   `TIPOS_DE_FLUJO`, el «⋯» de la tarjeta con `WorkflowAction.tsx`, la paleta
   «Selecciona una acción» con `types/workflow-node.ts` grupo por grupo y en su
   orden (`PALETA_DOCUMENTADA`), y los topes con `MAX_NODES_PER_WORKFLOW`,
   `MAX_SEGUIMIENTOS_PER_WORKFLOW` y `MAX_MESSAGE_LENGTH`. Un paso nuevo en la
   paleta sin su nombre en la guía la pone en rojo.
2. **Eliminar un flujo pide confirmación con `GenericDeleteDialog`**, sin
   teclear el nombre: `DeleteWorkflowDialog` existe y no lo usa nadie. Y el
   «⋯» de un paso del editor solo tiene «Eliminar nodo».
3. **En el vídeo, tras abrir el panel del «+» se espera a que acabe su
   animación** (400 ms): un clic antes cae en la fila de al lado —se agregaba
   Imagen donde se pidió Texto—.
4. **Las capturas crean un flujo y lo editan**, así que antes del vídeo se
   vuelve a sembrar; el vídeo crea uno de ejemplo y no borra nada.

Lo prueba `scripts/banco-guia-flujos.sh`: el contenido y las reglas de la
lista contra el código, el vídeo medido como el de Finanzas, las miniaturas en
sus píxeles (`GUIA=flujos`), `fin-de-la-guia` y `menu-de-la-guia` y la guía
servida a 390 y 1440. `MODO=roto` lee `7767f6f` y afirma que no había guía,
que las pastillas no filtraban y que la pantalla no exponía sus marcas.

## Documentación pública › La vigésima guía, Agenda: el calendario, la página pública y sus ocho pestañas

`/guia/agenda` documenta Contactos › Agenda (`/schedule`) con el estándar de las
anteriores: diez secciones —vista general, el calendario, estado y reagendar,
disponibilidad, el enlace público de reserva, el Kanban, los servicios, los
recordatorios antes de la cita, el formulario de calificación con sus registros,
y los ajustes (duración, enlace de reunión, anticipación y Google Calendar)—,
una miniatura con enfoque por tarjeta y el vídeo narrado con la voz Cedar y el
MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de `/schedule`
(`GUIAS_PUBLICADAS`): «Aprende a gestionar tus citas y tu agenda en la
plataforma».

No trae ninguna pieza propia: contenido (`lib/guia-agenda.ts`, con `laGuiaDe`),
semilla (`sembrar-guia-agenda.mjs`, sobre `sembrarElMarco`, con una clínica de
ejemplo: citas en varios estados, servicios, recordatorios, preguntas y
registros), receta (`capturar-guia-agenda.mjs`, sobre el taller) y narración. Se
regenera con `npm run build && scripts/generar-guia-agenda.sh && npm run build`.

**La guía se compara con el CÓDIGO** (`guia-agenda.test.mjs`): las pestañas con
`PESTANAS_DE_LA_AGENDA` (`lib/pantalla-de-agenda.ts`, que la pantalla también
lee), las cifras de arriba, los estados de la ficha y del Kanban, las vistas del
calendario, los mandos de un periodo, los pasos de la página pública, los tipos
de pregunta y los campos de Ajustes.

Cinco cosas que hay que mantener:

1. **La página pública se fotografía de verdad y NUNCA se pulsa su Confirmar**:
   ese botón reserva. Elegir un día ya pasa solo a la hora (no hay «Continuar»
   que pulsar). Las banderas del selector de país vienen de fuera, así que la
   receta sirve una dibujada; y la foto se recorta a la tarjeta, que es una
   columna estrecha.
2. **El vídeo no cancela ni reserva nada**: señala «Sí, cancelar la cita» y
   «Confirmar» sin pulsarlos (lo afirma el banco). Arrastra una tarjeta de
   Pendiente a Confirmada, y por eso antes del vídeo se vuelve a sembrar.
3. **Las fechas salen en español solo con `--lang=es-CO` y `LANG=es_CO.UTF-8`**:
   el campo de fecha de Reagendar lo pinta el proceso de Chromium.
4. **Cada carga dice «Agenda cargada con éxito»**: la receta quita el aviso al
   cambiar de pestaña, fuera del vídeo (dentro está prohibido).
5. **«Buscar pregunta…» también lleva la palabra «pregunta»**: el campo de una
   pregunta nueva se busca por su ejemplo, o se escribe en el buscador.

Lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| el enlace de reserva llevaba `agente.ia-app.com` escrito a mano: desde el dominio de un reseller se compartía el de otro | `elEnlaceDeReserva` con el dominio de la página abierta |
| copiar el enlace sin `try`: sin HTTPS el portapapeles lanza callado | en su `try`, y si falla dice qué hacer |
| la confirmación de cancelar decía «Cancelar» (que NO cancela) y «Eliminar» (que cancela) | «Volver» y «Sí, cancelar la cita» |
| la lista de recordatorios pintaba «days-1» | «1 día antes» (`formatReminderTime` entiende las cuatro unidades) |
| «Estas», «Telefono», «accion», «cancelacion»… | con sus tildes |

Lo prueba `scripts/banco-guia-agenda.sh`: el contenido contra el código, el
vídeo medido como los demás, las miniaturas en sus píxeles (`GUIA=agenda`),
`fin-de-la-guia` y `menu-de-la-guia` —que barren todas las guías— y la guía
servida a 390 y 1440. `MODO=roto` lee `2c7b35e` y afirma que no había guía, ni
marcas en la pantalla, y el enlace escrito a mano.

## Documentación pública › La vigesimoprimera guía, Recordatorios: lo que se arregló al documentarla

`/guia/recordatorios` documenta Automatizaciones › Recordatorios (`/reminders`)
con el estándar de las demás: nueve secciones —vista general, la lista, el
tablero Kanban, crear, adjunto y nota de voz, fecha y repetición, el flujo, el
historial de envíos, y editar y eliminar—, una miniatura con enfoque por
tarjeta y el vídeo narrado con Cedar al MISMO ritmo. Su tarjeta sale sola en
«Tutoriales del módulo» de `/reminders`: «Aprende a programar recordatorios por
WhatsApp en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-recordatorios.sh && npm run build`.

No trae ninguna pieza propia (contenido con `laGuiaDe`, semilla sobre
`sembrarElMarco`, receta sobre el taller). Dos cosas de la receta:

1. **Sin bucket, `/api/upload` lo contesta la propia receta** (`ctx.route`,
   con `archivos.ejemplo.co`): elegir el archivo, su vista previa, guardarlo y
   la marca «Media» de la tarjeta son de verdad. La nota de voz se graba con el
   micrófono de mentira de Chromium.
2. **Las capturas crean un recordatorio**, así que antes del vídeo se vuelve a
   sembrar; y las ventanas de eliminar se CANCELAN, en las capturas y en el
   vídeo.

Lo que se arregló en la pantalla, que no daba ningún error:

| lo que pasaba | ahora |
| --- | --- |
| **«Hola @client_name» le llegaba al cliente con la arroba dentro**: un recordatorio de un contacto lo entrega el seguimiento que se escribe al crearlo, y ese camino manda el texto tal cual | `elMensajeDelRecordatorio` (`lib/repeticion-del-recordatorio.ts`) lo cambia por el nombre al crear y al editar, con la regla del motor («Cliente» si no lo hay o es «Desconocido») |
| la hora del historial salía en crudo, `2026-10-02T14:30:00.000Z` | `laHoraDelEnvio`: `dd/MM/yyyy HH:mm` en la zona de quien mira; el reloj de pared viejo se queda como está |
| «Cada dia» y «Todos los dias» —lo mismo para el motor— salían las dos, y «Repetir cada N» no lo lee el motor | una lista, `REPETICIONES`, con sus tildes; «Todos los días» solo se ofrece si ya la tiene, y «cada N» se quitó |
| el buscador de flujos buscaba por el ID: escribir el nombre no encontraba nada | `value` lleva el nombre (`SelectWorkflowBox`) |

Lo prueba `scripts/banco-guia-recordatorios.sh`: el contenido contra el código
(vistas, cifras, columnas, archivos, repeticiones, campos, partes de un
recordatorio, historial, el «⋯»), los arreglos, el vídeo medido como el de Mis
macros, las miniaturas en sus píxeles (`GUIA=recordatorios`), `fin-de-la-guia`
y `menu-de-la-guia` y la guía servida a 390 y 1440. `MODO=roto` contra
`ab6b110` afirma que no había guía y que el `@client_name` llegaba tal cual.

## Documentación pública › La vigesimosegunda guía, Etiquetas: el tablero y su Gestionar, y el filtro que no se quitaba

`/guia/etiquetas` documenta Contactos › Etiquetas (`/tags`) con el mismo
estándar: diez secciones —vista general, el tablero, arrastrar, calificar con
IA, filtrar por puntaje, varios a la vez, y crear, editar, ordenar y eliminar
una etiqueta—, una miniatura con enfoque por tarjeta y el vídeo narrado con
Cedar al MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/tags`: «Aprende a organizar tus contactos con etiquetas en la plataforma».
Se regenera con `npm run build && scripts/generar-guia-etiquetas.sh && npm run build`.

Ninguna pieza propia salvo la IA de ejemplo que pone los puntajes
(`fingido-guia-etiquetas.mjs`, cargado por el lanzador común): calificar es una
llamada a OpenAI con la clave de la cuenta, y el banco no la tiene. El puntaje
de cada contacto de ejemplo lo decide la semilla (`guia-etiquetas-datos.mjs`).

Lo que se arregló en la pantalla al documentarla, con las reglas en
`lib/etiquetas-de-la-pantalla.ts` (pura):

| lo que pasaba | ahora |
| --- | --- |
| pulsar el rango de puntaje puesto no lo quitaba: la «x» lo prometía y no había forma de volver a ver el tablero entero | `elFiltroDePuntaje`: otro clic en el mismo lo quita |
| los cinco rangos vivían en tres copias (la barra, el filtro y el color de la insignia de cada tarjeta) | `RANGOS_DE_PUNTAJE`, una vez |
| reordenar las etiquetas con una búsqueda puesta guardaba el orden de un TROZO y las escondidas desaparecían hasta recargar | con búsqueda no se arrastra, y se dice (`porQueNoSePuedenOrdenarLasEtiquetas`) |
| eliminar una etiqueta preguntaba «Se eliminará ETIQUETA», sin decir cuál | dice «la etiqueta VIP» (`queSeElimina` de `GenericDeleteDialog`; sin él, las demás pantallas siguen igual) |
| en la tarjeta del tablero el nombre del contacto se recortaba a «Ca…»: el puntaje, la hora y el destello iban en su misma fila | van en una fila debajo (`data-zona="medidas"`), y el nombre se queda la suya entera; la receta se cae si algo de una tarjeta sale con «…» (`queNadaSalgaRecortado`) |

Y la pantalla expone sus marcas (`data-zona` en las barras, la cabecera de cada
columna, cada parte de una tarjeta y la lista de Gestionar), que es lo que la
receta usa: nada de coordenadas. El vídeo no borra nada: la ventana de eliminar
una etiqueta se CANCELA y no abre el borrado de contactos.

Lo prueba `scripts/banco-guia-etiquetas.sh`: los arreglos de la pantalla, el
contenido contra el código (vistas, rangos, las dos barras, la cabecera de una
columna, las seis partes de una tarjeta y el «⋯» sin registros), el vídeo, las
miniaturas (`GUIA=etiquetas`), `fin-de-la-guia` y `menu-de-la-guia`, y la guía
servida. `MODO=roto` contra `7767f6f` afirma que no había guía y los fallos de
la pantalla.

## Documentación pública › La vigesimotercera guía, Conexión y Ajustes: una pantalla, ocho pestañas, un apartado por pestaña

`/guia/conexion` documenta Conexión y Ajustes (`/profile`) con el estándar de
las anteriores: una sección de vista general y **una por pestaña** —Conexión,
Integraciones, Preferencias, Comportamiento, Herramientas, Cuenta, Seguridad y
Apariencia—, una miniatura con enfoque por tarjeta y el vídeo narrado con la voz
Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/profile` (`GUIAS_PUBLICADAS`): «Aprende a conectar tus canales y ajustar tu
cuenta en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-conexion.sh && npm run build`.

> **Los nombres y el orden de las pestañas salen de `PESTANAS_DEL_PERFIL`
> (`lib/pantalla-de-perfil.ts`)**, que leen la pantalla, la guía y el banco. Con
> los nombres escritos en dos sitios, una pestaña renombrada seguiría saliendo
> con el nombre viejo en la guía y nadie lo notaría.

Lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| el monto del plan decía «250.000 COP COP/mes» | `elMontoAlMes` |
| el interruptor de Google Maps nacía apagado aunque la cuenta tuviera su enlace (se calculaba antes de que llegara el usuario) | sin tocar, manda lo guardado (`tieneEnlaceDeMaps`) |
| el nombre de línea propuesto quitaba la letra con tilde («CAF_DE_LA_MONTAA») | se quita la tilde y la letra se queda (`sanitizeInstanceNameInput`); las líneas ya creadas no se tocan |
| el proveedor de IA decía «OpenIA» | «OpenAI» |
| los rótulos del menú de opciones del plan solo salían al pasar el ratón (en un táctil nunca), y cada opción era un botón dentro de un enlace | se ven con el menú abierto, y el botón es un `span` |
| la licencia y los créditos de la cabecera usaban `xs:`, que no existe en este Tailwind | `sm:` |

Tres cosas que hay que mantener:

1. **La pantalla expone marcas para la receta** (`data-tira-del-perfil`,
   `data-ficha-del-perfil`, `data-pestanas-del-perfil`,
   `data-pestana-del-perfil`, `data-panel-del-perfil`, `data-acciones-del-plan`)
   y las recetas no usan coordenadas. Una tarjeta se busca por su título EXACTO
   dentro del panel de su pestaña.
2. **Ni las capturas ni el vídeo guardan, cambian de plan ni cierran la
   sesión**: señalan los botones y no los pulsan. Las conexiones de los canales
   son de ejemplo (`fingido-guia-conexion.mjs`), con el número y la clave de IA
   de mentira (`•••• AbCd`).
3. **La tarjeta de «Modo Dueño por WhatsApp» se llama así**, entera: una receta
   que la busque por «Modo dueño» se queda esperando.

Lo prueba `scripts/banco-guia-conexion.sh`: las pestañas y las tarjetas contra
el código, los arreglos de la pantalla, el vídeo medido como los demás, las
miniaturas en sus píxeles (`GUIA=conexion`), `fin-de-la-guia` y
`menu-de-la-guia` —que barren todas las guías— y la guía servida a 390 y 1440.
`MODO=roto` lee `de0cd9d` y afirma que no había guía, ni marcas en la pantalla,
y el «COP COP/mes».

## Documentación pública › La vigesimocuarta guía, Chats: la pantalla más completa, y la llamada que caía en otro chat

`/guia/chats` documenta Bandeja › Chats (`/chats`) con el estándar de las
anteriores: la lista con sus filtros y pastillas, la selección múltiple, la
cabecera (presencia, llamar, asesor, recordatorio, cita, etapa, etiquetas, IA
encendida o pausada), el menú de Acciones, los mensajes (responder, reenviar,
reaccionar, traducir, editar, transcribir), la barra de escribir (respuestas
rápidas, adjuntos, nota interna, macros, firma, plantillas de Meta), la ficha
del contacto y la llamada en curso; con una miniatura con enfoque por tarjeta y
el vídeo con la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales
del módulo» de `/chats`. Ninguna pieza propia salvo el doble
`fingido-guia-chats.mjs` (AstraCalls y las plantillas de Meta, cargado dentro
de `next start` como el Gemini de AI Imágenes). Se regenera con
`npm run build && scripts/generar-guia-chats.sh && npm run build`.

Cinco cosas que hay que mantener:

1. **Nadie recibe nada**: la llamada se contesta con un audio de mentira que el
   navegador de las capturas reconoce (`RESPUESTA_DE_AUDIO`), y «el cliente
   colgó» se finge parando los bytes (`window.__guiaColgo`): colgar desde la
   tarjeta la CIERRA y la pregunta «¿Cómo resultó la llamada?» no sale.
2. **Las respuestas rápidas se escriben con «/» y una letra** (`/h`): con la
   barra sola no se sugiere nada.
3. **`abrirMenu` devuelve un localizador PEREZOSO** (`.last()` de lo visible):
   al pasar el ratón por un submenú pasa a ser el submenú. Las cajas se miden
   antes de pasar por encima.
4. **Una base recién hecha necesita `chat_messages.editedAt` ANTES de
   servir** (`generar-guia.sh`). La App la añade al usarla, y si otra conexión
   ya preparó un `SELECT *` revienta para siempre con «cached plan must not
   change result type»: la conversación sale vacía sin un error a la vista.
   En producción la columna existe hace tiempo.
5. **La ficha se fotografía cuando no queda nada «Cargando»**: llega en varias
   consultas.

Y tres del vídeo, que solo se ven grabándolo:

- **Filtrar y seleccionar cierran la conversación abierta**: antes de hablar
  de la cabecera se vuelve a abrir, sin grabar la carga (`sinGrabarLaEspera`).
- **«Traducir» no sale en un mensaje en español** (`seOfreceTraducir`): el
  vídeo señala Reenviar; la captura de traducir usa la conversación en inglés.
- **«Plegar» solo existe con la llamada CONECTADA**, y la tarjeta tarda la
  gracia del audio en preguntar cómo fue: el cliente «cuelga» en cuanto
  conecta, y lo que quede de esa espera se corta, o el vídeo acaba mudo.

#### Y documentarla destapó que una llamada desde el chat podía ir a NADIE

Con un contacto abierto por su número, llamar desde la cabecera de Chats salía
hacia `D@lid` —un id inventado con los mismos dígitos— y la burbuja de la
llamada caía en una conversación aparte, «Contacto Sin Número». La causa:
`identidadesDelChat` (y `remoteJidAliases`) traen los CANDIDATOS de
`buildWhatsAppJidCandidates`, que fabrica el `@lid` a propósito; mezclados con
las identidades reales, `sinTelefonosFalsosDeLid` veía el `@lid` fabricado y
descartaba el teléfono de verdad como «falso».

> **El destino de una llamada se decide con las identidades REALES**
> (`elDestinoDeLaConversacion`, `lib/destino-de-la-llamada.ts`): los
> candidatos solo entran si con las reales no sale nada. La usan la cabecera y
> `chat-main`. Si otro sitio llama con lo que trae la conversación, va por ahí.

Lo prueban `scripts/banco-guia-chats.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=chats`, `fin-de-la-guia`, `menu-de-la-guia` y
la guía servida a 390 y 1440) y `scripts/banco-destino-de-la-llamada.sh`
(caso A5: el teléfono real gana a un `@lid` fabricado). `MODO=roto` contra un
commit pinchado afirma que no había guía y que la llamada iba al `@lid`.

## Documentación pública › La vigesimoquinta guía, Correos: los buzones son de MENTIRA, y nada se envía

`/guia/correo` documenta Bandeja › Correos (`/correo`) con el estándar de las
anteriores: diez secciones —vista general, conectar (Gmail, Outlook o dominio
propio), varios buzones y el selector de bandejas, el buscador y «Buscar en»,
las pastillas y la flecha, la selección múltiple (leído, exportar, destacar,
archivar, eliminar), leer y organizar un correo, responder con archivos y la
firma de cada buzón, reenviar y escribir uno nuevo—, una miniatura con enfoque
por tarjeta y el vídeo narrado con Cedar al MISMO ritmo (dura 1:48: cubre tanto
como Chats, y su banco usa el margen de Chats). Su tarjeta sale sola en
«Tutoriales del módulo» de `/correo`: «Aprende a leer y responder los correos
de tu negocio en la plataforma». Se regenera con
`npm run build && scripts/generar-guia-correo.sh && npm run build`.

Cinco cosas que hay que mantener:

1. **Los tres buzones son de ejemplo y los contesta un doble**
   (`fingido-guia-correo.mjs`, cargado dentro de `next start` como el Gemini de
   AI Imágenes): un Gmail en memoria que se reinicia al volver a sembrar
   (`/tmp/guia-correo-reinicio`). La semilla sella las credenciales con la MISMA
   llave que la App (HKDF con la etiqueta `"verzay-correo"`, que es un nombre
   del código y no un dato; el banco la descuenta al buscar datos reales).
2. **Ni las capturas ni el vídeo envían, borran, desconectan ni siguen un
   OAuth**: «Conectar Gmail», «Enviar correo» y «Eliminar correos» se señalan
   y no se pulsan, y el reenvío se cancela. El banco lo lee del guion.
3. **Antes de cada foto el ratón sale de la lista y se suelta el foco**
   (`apartar`): encima de una fila salen sus mandos de pasar el ratón y la
   casilla vacía, y el anillo del último botón se lee como otra marca.
4. **Botones pegados llevan UN recuadro y los números fuera** (`enFila`): en
   los mandos del correo, sobre la fila «Para», que está vacía a la derecha; en
   las pastillas, a caballo del borde de abajo, sin tapar el nombre de la fila.
5. **La guía se compara con el código**: las pastillas y la flecha con
   `FILTROS_EN_PASTILLA`/`FILTROS_EN_LA_FLECHA`, «Buscar en» con
   `NOMBRE_DEL_CAMPO`, y la ventana de conectar, la barra de la selección, los
   tres «⋯», los mandos del correo y la barra de responder con sus componentes.

Lo prueba `scripts/banco-guia-correo.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=correo`, `fin-de-la-guia`, `menu-de-la-guia` y
la guía servida a 390 y 1440); `MODO=roto` contra `400482e` afirma que no había
guía.

## Documentación pública › La vigesimosexta guía, Follow-ups IA: el asistente del sintetizador, la clasificación y los follow-ups por estado

`/guia/follow-ups` documenta Bandeja › Follow-ups IA (`/crm/rules`) con el
estándar de las anteriores: la vista general, **el sintetizador** (sus cuatro
pasos: marco base, reglas globales, tipos CRM y previsualización), **la
clasificación de leads** (marco, definiciones, criterios y previsualización) y
**los follow-ups por estado**: tiempos e intentos, horario, mensajes (objetivo,
prompt y respaldo), la biblioteca de archivos, el flujo por estado y el resumen
antes de guardar; una miniatura con enfoque por tarjeta y el vídeo con la voz
Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/crm/rules`. Ninguna pieza propia: contenido en `lib/guia-follow-ups.ts`,
semilla `sembrar-guia-follow-ups.mjs`, receta `capturar-guia-follow-ups.mjs` y
narración. Se regenera con
`npm run build && scripts/generar-guia-follow-ups.sh && npm run build`.

> **Lo que la pantalla y la guía dicen igual sale de
> `lib/follow-ups-de-la-pantalla.ts`**: las tres pestañas, los campos de la
> regla de un estado (con su `data-zona`) y la línea del resumen. Una pestaña o
> un campo renombrado en un solo sitio pone el banco en rojo.

Lo que se arregló en la pantalla al documentarla: la pestaña decía
«Clasificacion lead» y los campos «Max intentos», «Dias habilitados» y «Mensaje
fallback» (ahora con tildes y «Mensaje de respaldo»); «Restaurar defaults» pasó
a «Restaurar valores de fábrica»; el límite de la biblioteca decía «8/8» escrito
a mano (ahora `MAX_MEDIA_PER_STATUS`) y en voseo; y el horario enseñaba la zona
del servidor en vez de la de la cuenta.

Dos cosas de la receta: las marcas de un campo van SIN rótulo (el rótulo del
propio campo ya lo dice y encima lo tapaba), y en una rejilla de tarjetas los
números van `sinRecuadro`; el recorte deja aire arriba (`conAireArriba`) para
que el número no quede cortado.

Lo prueba `scripts/banco-guia-follow-ups.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=follow-ups`, `fin-de-la-guia`,
`menu-de-la-guia` y la guía servida a 390 y 1440); `MODO=roto` contra `400482e`
afirma que no había guía ni marcas en la pantalla.

## Documentación pública › La vigesimoséptima guía, Mis tareas: y la cifra y la lista no decían lo mismo

`/guia/tareas` documenta Bandeja › Mis tareas (`/tareas`) con el estándar de
las anteriores: la vista Lista agrupada por fecha, el Kanban por tipo con sus
automatizaciones, las cifras, crear una tarea, completarla con tiempo y
resultado programando la siguiente, la ficha, y cancelar o eliminar; con una
miniatura con enfoque por tarjeta y el vídeo con la voz Cedar y el MISMO
ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de `/tareas`. Ninguna
pieza propia: contenido en `lib/guia-tareas.ts`, semilla
`sembrar-guia-tareas.mjs`, receta `capturar-guia-tareas.mjs` y narración
`narracion-guia-tareas.mjs`. Se regenera con
`npm run build && scripts/generar-guia-tareas.sh && npm run build`.

Lo que se arregló en la pantalla al documentarla, con las reglas en
`lib/pantalla-de-tareas.ts` (pura, la usan la pantalla y la guía):

| lo que pasaba | ahora |
| --- | --- |
| la cifra «Vencidas» miraba la HORA y la lista el DÍA: una tarea de esta mañana contaba arriba como vencida y salía abajo en «Hoy» | una regla, `elGrupoDeLaTarea` y `lasCifras`: abierta y con la hora pasada es vencida en los dos sitios |
| cancelar no pedía confirmación, y eliminar usaba `window.confirm` | las dos con un `AlertDialog` («Volver» / «Sí, cancelar la tarea» / «Eliminar») |
| «Manana», «Proxima semana», «No respondio» | con sus tildes (`ATAJOS_DE_LA_SIGUIENTE`, `RESULTADOS_RAPIDOS`) |
| crear desde un chat proponía la fecha en UTC (las 14:00 en Colombia) | `laFechaPropuesta`, mañana a las 9:00 de quien mira |
| la lista vacía decía lo mismo sin tareas que sin resultados de búsqueda | `elMensajeDeLaListaVacia` |

Cuatro cosas que hay que mantener:

1. **Las capturas y el vídeo nunca confirman cancelar ni eliminar**: abren la
   confirmación y pulsan «Volver». La tarea que se crea va sin recordatorio de
   WhatsApp, y antes del vídeo se vuelve a sembrar.
2. **Las fechas de los campos salen en español solo con `--lang=es-CO` y
   `LANG=es_CO.UTF-8`**, como en Finanzas.
3. **El número de cada asesor sale de `User.notificationNumber`**: la semilla lo
   pone, o la guía enseña «+0000000000».
4. **Los títulos de ejemplo caben en la tarjeta del Kanban**
   (`queNadaSalgaRecortado`): se acortan en la semilla, no en la guía.

Lo prueba `scripts/banco-guia-tareas.sh`: las reglas y el contenido contra el
código (vistas, cifras, grupos, columnas por tipo, acciones de automatización,
campos, confirmaciones), el vídeo, las miniaturas (`GUIA=tareas`),
`fin-de-la-guia`, `menu-de-la-guia` y la guía servida. `MODO=roto` contra
`400482e` afirma que no había guía, ni reglas compartidas, ni confirmaciones.

## Documentación pública › La vigesimoctava guía, Multiagenda: la agenda de un equipo, y la reserva pública que pedía sesión

`/guia/multiagenda` documenta Integraciones › Multiagenda (`/bookings`) con el
estándar de las anteriores: diez secciones —vista general, el calendario, estado
y reagendar, el Kanban con sus automatizaciones, especialistas (servicios,
disponibilidad y configuración de cada uno), servicios, recordatorios por
servicio, formulario por servicio, ajustes (enlace público y anticipación) y la
página pública de reserva—, una miniatura con enfoque por tarjeta y el vídeo con
la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo»
de `/bookings`: «Aprende a gestionar las citas de tu equipo en la plataforma».
Ninguna pieza propia: contenido en `lib/guia-multiagenda.ts`, semilla
`sembrar-guia-multiagenda.mjs` (una clínica con tres especialistas, cuatro
servicios y citas en los siete estados), receta `capturar-guia-multiagenda.mjs`
y narración. Se regenera con
`npm run build && scripts/generar-guia-multiagenda.sh && npm run build`.

Lo que se arregló al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| **la página pública de reserva (`/bookings/<cuenta>`) mandaba al login** a quien no tenía sesión; el dueño no lo notaba porque él sí la tiene | `/bookings/` (con barra) es público en el middleware; `/bookings` a secas sigue pidiendo sesión |
| el **archivo** de un recordatorio de servicio se guardaba y el seguimiento salía siempre como `text`: al cliente le llegaba solo el mensaje | `elTipoDelSeguimiento` (`lib/recordatorios-de-la-reserva.ts`): `seguimiento-<tipo>` con su archivo, al crear y al reagendar |
| la insignia de un especialista contaba FRANJAS: dos turnos de lunes a viernes decían «10 día(s)» | `losDiasQueAtiende` + `elRotuloDeLosDias` (`lib/pantalla-de-multiagenda.ts`) |
| el enlace público se leía de `window.location` al pintar (servidor y navegador no coincidían), y copiar iba sin `try` | `elEnlaceDeReservaDelEquipo`, con el origen leído al montar, y copiar en su `try` |
| borrar un recordatorio era de un clic | pide confirmación |

Tres cosas que hay que mantener:

1. **Las pestañas salen de `PESTANAS_DE_MULTIAGENDA`**, que leen la pantalla, la
   guía y el banco; las demás listas de la guía se comparan con el código.
2. **Ni las capturas ni el vídeo reservan, cancelan ni borran**: la página
   pública se recorre hasta «Tus datos» sin pulsar «Confirmar cita», y la
   confirmación de cancelar se cierra con «Volver».
3. **La carga de la página pública no sale en el vídeo** (`sinGrabarLaEspera`).

Lo prueba `scripts/banco-guia-multiagenda.sh` (el contenido contra el código,
los arreglos, el vídeo, las miniaturas con `GUIA=multiagenda`,
`fin-de-la-guia`, `menu-de-la-guia` y la guía servida a 390 y 1440);
`MODO=roto` contra `400482e` afirma que no había guía ni marcas, y los fallos.

#### Y el calendario de Multiagenda pintaba las citas del día ANTERIOR

Lo destapó la receta de capturas, que no encontraba la cita de hoy: el
Dashboard decía «2 de octubre» y debajo enseñaba las del 1. FullCalendar va con
`timeZone={timezone}` (una zona NOMBRADA) y sin el plugin de zonas, así que
hace «UTC-coercion»: el `info.start` de `datesSet` es la medianoche del día EN
UTC, y `startOfDay` en un navegador al oeste de Greenwich daba el día de antes.
Y por lo mismo, Semana y Mes pintaban cada cita 5 h corrida (su instante como
si fuera UTC).

> **Con FullCalendar en una zona nombrada se habla en hora de pared**
> (`lib/calendario-en-la-zona.ts`, puro): los eventos van con `laHoraDePared`,
> el día visible se lee con `elDiaDelCalendario` y `now` es la hora de pared de
> la zona. Agenda (`/schedule`) no lo tiene porque va con `timeZone="local"`.

Y el taller común reescribe también el `value` de los campos con
`conElDominioDeLaGuia` (el enlace público de Ajustes va en un `<input>` y salía
con `localhost`).

## Documentación pública › La vigesimoctava guía, Campañas: y documentarla destapó campañas que no hacían lo que decían

`/guia/campanas` documenta Creación de Flujos › Campañas (`/campaigns`) con el
estándar de las anteriores: once secciones —vista general, la lista, el tablero
Kanban (Pendientes, Para hoy, Mañana, Recurrentes, Enviados, Vencidos), crear
una campaña con mensaje y variables, adjunto o audio grabado, fecha y hora,
segmentar por estado y etiquetas, varios contactos, flujo asociado, pausa entre
envíos con su aviso de riesgo, y el historial con reintentar, pausar y
reanudar—, una miniatura con enfoque por tarjeta y el vídeo con la voz Cedar y
el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/campaigns`: «Aprende a enviar campañas por WhatsApp a tus contactos en la
plataforma». Ninguna pieza propia (contenido con `laGuiaDe`, semilla sobre
`sembrarElMarco`, receta sobre el taller). Se regenera con
`npm run build && scripts/generar-guia-campanas.sh && npm run build`.

> **Las reglas de una campaña viven en `lib/campanas.ts` (puro)**: las
> variables, la pausa, las horas de cada envío, qué se reprograma al editar y
> cómo se nombra a quién le llega. Las usan las acciones, la tarjeta y la guía.

Lo que se arregló al documentarla, que no daba ningún error:

| lo que pasaba | ahora |
| --- | --- |
| una campaña de UN contacto se guardaba como recordatorio y desaparecía de Campañas | lo decide la pantalla desde la que se crea (`esUnaCampana`) |
| la repetición se ofrecía y el motor repetía el texto crudo, sin variables, archivo ni pausa | una campaña sale UNA vez (`LA_CAMPANA_NO_SE_REPITE`); «Recurrentes» queda para las de antes |
| editar una campaña no cambiaba lo que salía | lo pendiente o pausado se reprograma (`elPlanDeLaEdicion`); lo ya enviado o fallido no se toca, y nadie recibe dos veces |
| eliminar una campaña dejaba sus `camping-<id>-<n>` saliendo | se borran con ella (`reminderSeguimientoWhere`), también en «Eliminar todas» |
| reintentar y reanudar ponían todos los envíos a la misma hora | escalonados desde ahora con la pausa (`lasHorasEscalonadas`) |
| la tarjeta pintaba los nombres y los números pegados por comas, con un enlace al chat roto | «N contactos», con la lista en el `title` (`losContactosDeLaCampana`) |
| segmentar usaba el id de la persona: a alguien del equipo no le encontraba a nadie | la cuenta activa (`effectiveId`) |
| **el flujo asociado no se ejecutaba nunca**, y el motor BORRABA cada envío: el historial decía siempre 0 enviados y no había qué reintentar | en `api-webhook` (`envio-de-campana.ts`): el flujo corre y el envío se queda como `sent` o `failed` |

Tres cosas que hay que mantener:

1. **La guía dice lo que la pantalla tiene**: el banco compara columnas, cifras,
   campos, variables, archivos, estados del segmento, partes de una tarjeta y
   botones del historial con el código, y los topes de la pausa con
   `PAUSA_MINIMA`/`PAUSA_MAXIMA`.
2. **Ni las capturas ni el vídeo envían nada**: el aviso de riesgo y las
   confirmaciones se CANCELAN, y la línea y el servidor son de ejemplo.
3. **Las capturas crean una campaña**, así que antes del vídeo se vuelve a
   sembrar.

Lo prueban `scripts/banco-campanas.sh` (las reglas y las acciones contra
Postgres), `scripts/banco-guia-campanas.sh` (contenido, vídeo, miniaturas,
`fin-de-la-guia`, `menu-de-la-guia` y la guía servida) y, en `api-webhook`,
`scripts/banco-campana-en-el-motor.sh`. Los tres con `MODO=roto` contra un
commit pinchado que afirma los fallos de la tabla.

## Documentación pública › La trigésima guía, Embudos: el tablero, sus siete etapas y la papelera de Perdido

`/guia/embudos` documenta Panel › Embudos (`/embudos`) con el estándar de las
anteriores: la vista general, el tablero (una columna por etapa, una tarjeta
por conversación), arrastrar, los tres selectores (embudo, cuenta y asesor), el
embudo de ventas sembrado de siete etapas, crear, renombrar, usar por defecto y
eliminar un embudo, editar etapas (nombre, color y orden, con candado en Nuevo,
Ganado y Perdido), asignar un embudo a cada asesor y la columna Perdido con su
papelera de 30 días; una miniatura con enfoque por tarjeta y el vídeo narrado
con Cedar al MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/embudos`: «Aprende a organizar tus conversaciones por etapas en la
plataforma». Ninguna pieza propia: contenido en `lib/guia-embudos.ts`, semilla
`sembrar-guia-embudos.mjs` (dos embudos, cuatro personas y una cuenta hija),
receta `capturar-guia-embudos.mjs` y narración. Se regenera con
`npm run build && scripts/generar-guia-embudos.sh && npm run build`.

Tres cosas que hay que mantener:

1. **Ni las capturas ni el vídeo cambian nada**: crear, etapas y asesores se
   CANCELAN, y no se pulsa Eliminar, Vaciar, Restaurar ni Restaurar todo. El
   banco lo lee del guion; arrastrar sí mueve una tarjeta, y antes del vídeo se
   vuelve a sembrar.
2. **La pantalla expone marcas para la receta** (`data-tarjeta`,
   `data-columna`, `data-cabeza-de-columna`, `data-selector="embudo"`,
   `data-hoja`), y las recetas no usan coordenadas.
3. **Un nombre largo no se recorta**: el del asesor en «Asesores y su embudo»
   parte en dos líneas, y el selector de embudo mide hasta 18rem.

Lo prueba `scripts/banco-guia-embudos.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=embudos`, `fin-de-la-guia`, `menu-de-la-guia` y

## Documentación pública › La trigesimoprimera guía, Cobros: la cartera, sus tres avisos y nada que se cobre de verdad

`/guia/cobros` documenta Panel › Cobros (`/cobros`) con el estándar de las
anteriores: diez secciones —vista general, la cartera y sus filtros por
situación, Cobrar ahora, comprobante recibido, confirmar el pago, el historial
de ciclos, crear una deuda (con sus datos de pago propios y adjuntos), editar y
eliminar, cuándo se recuerda (antes, el día y después) y los mensajes con sus
variables—, una miniatura con enfoque por tarjeta y el vídeo con la voz Cedar y
el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de `/cobros`
(`GUIAS_PUBLICADAS`). Los nombres que comparten pantalla y guía salen de
`lib/pantalla-de-cobros.ts`. Se regenera con
`npm run build && scripts/generar-guia-cobros.sh && npm run build`.

Cuatro cosas que hay que mantener:

1. **Nada se manda ni se borra**: «Cobrar ahora» se señala y no se pulsa,
   eliminar se cierra con «Volver» y la configuración con «Cancelar». Lo lee
   el banco del guion.
2. **La línea de WhatsApp de ejemplo sale CONECTADA** gracias al doble
   `fingido-guia-cobros.mjs` (un Waha de ejemplo, cargado dentro de
   `next start`) y al `siteConfig` que siembra `sembrar-guia-cobros.mjs`. Sin
   él la cartera pinta «no tiene una línea de WhatsApp conectada».
3. **El botón del formulario dice «Crear» en una deuda nueva y «Guardar» al
   editar**, y la guía lo nombra así.
4. **Las capturas crean, marcan y confirman deudas**: antes del vídeo se vuelve
   a sembrar, y las fechas son relativas a hoy en la zona de la cuenta.

Lo prueba `scripts/banco-guia-cobros.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=cobros`, `fin-de-la-guia`, `menu-de-la-guia` y
la guía servida a 390 y 1440); `MODO=roto` contra `84f98e5` afirma que no había
guía.

## Documentación pública › La trigesimoprimera guía, Calificación: el tablero por etapa, y los rangos de puntaje son UNO

`/guia/calificacion` documenta Bandeja › Calificación (`/crm/kanban`) con el
estándar de las anteriores: siete secciones —vista general, el tablero (Sin
clasificar, Frío, Tibio, Caliente, Finalizado y Descartado), buscar, arrastrar
entre columnas, calificar con IA (uno o todos), filtrar por puntaje y las
automatizaciones por etapa—, una miniatura con enfoque por tarjeta y el vídeo
con la voz Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del
módulo» de `/crm/kanban`: «Aprende a calificar tus contactos por etapa en la
plataforma». Ninguna pieza propia salvo la IA de ejemplo que pone los puntajes
(`fingido-guia-calificacion.mjs`, como la de Etiquetas). Se regenera con
`npm run build && scripts/generar-guia-calificacion.sh && npm run build`.

## Documentación pública › La vigesimonovena guía, Informes: trece secciones plegables, y el buscador que no buscaba

`/guia/informes` documenta Panel › Estadísticas (`/crm/dashboard`) con el
estándar de las anteriores: ocho secciones —vista general, periodo y cuentas de
la familia, la barra (buscar, filtrar, mostrar u ocultar, exportar y plegar),
actividad y agente IA, leads con seguimientos y citas, llamadas con NPS y
sentimiento, sesiones con flujos y etiquetas, y ventas con productos y
créditos—, una miniatura con enfoque por tarjeta y el vídeo con la voz Cedar y
el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/crm/dashboard`: «Aprende a leer los números de tu negocio en la plataforma».
Se regenera con `npm run build && scripts/generar-guia-informes.sh && npm run build`.

> **Las trece secciones, sus tarjetas y los periodos viven en
> `lib/secciones-de-informes.ts` (pura)**, y de ahí salen el menú «Secciones»,
> la cabecera de cada sección, el buscador, el selector de periodo y la guía.
> Con los nombres escritos dos veces, el menú decía una cosa y la cabecera
> otra.

Lo que se arregló en la pantalla al documentarla:

| lo que pasaba | ahora |
| --- | --- |
| los cinco rangos de puntaje estaban copiados aquí, y el color de la insignia en una tercera copia con otros cortes | salen de `lib/etiquetas-de-la-pantalla.ts`, los del tablero de Etiquetas (`elRangoDelPuntaje`, `pasaElFiltroDePuntaje`, `cuantasPorRango`) |
| pulsar el rango puesto no lo quitaba | otro clic lo quita, como en Etiquetas |
| el nombre del contacto se recortaba a «Ca…» con el puntaje, los avisos y la hora al lado | el nombre va solo en su fila y lo de medir debajo |
| agarrar el teléfono o el destello de una tarjeta empezaba un arrastre | `onPointerDown` los detiene |

La pantalla expone sus marcas (`data-zona`, `data-tarjeta-del-tablero`) y la
receta no usa coordenadas. **Ni las capturas ni el vídeo cambian una
automatización**: la ventana de una acción nueva se cancela, y el banco lo lee
del guion.

Lo prueba `scripts/banco-guia-calificacion.sh` (las columnas, los rangos, las
barras, las partes de una tarjeta y las acciones de una automatización contra
el código, el vídeo, las miniaturas con `GUIA=calificacion`, `fin-de-la-guia`,
`menu-de-la-guia` y la guía servida); `MODO=roto` contra `84f98e5` afirma que
no había guía ni marcas.
| «Buscar en analíticas» no filtraba nada | deja las secciones cuyo nombre o el de una de sus gráficas coincide, sin tildes ni mayúsculas (`laSeccionPasaLaBusqueda`), y dice cuando no queda ninguna |
| las secciones no se podían plegar | se pliegan por su título (`aria-expanded`) y se recuerda en `localStorage` (`LLAVE_DE_LAS_PLEGADAS`); lo raro cae en «nada plegado» |
| el menú «Secciones» y la cabecera nombraban distinto la misma sección | los dos de `SECCIONES_DE_INFORMES` |

Tres cosas que hay que mantener:

1. **La pantalla expone sus marcas** (`data-zona` pestanas-del-crm, periodo, cuentas,
   buscador, filtros, secciones, exportar, totales, secciones-de-informes, y
   `data-seccion-de-informes` en cada sección) y la receta no usa coordenadas.
2. **El vídeo no descarga el CSV**: señala «Exportar» y no lo pulsa; y pliega y
   despliega la misma sección, así no deja nada cambiado.
3. **La semilla es una clínica con dos cuentas hijas**, para que «Cuentas de la
   familia» tenga qué ofrecer y «Solo mi cuenta» cambie las cifras.

Lo prueba `scripts/banco-guia-informes.sh`: el contenido contra el código (vistas,
periodos, opciones de cuentas, mandos, estados del filtro y las trece
secciones), las reglas, el vídeo, las miniaturas (`GUIA=informes`),
`fin-de-la-guia`, `menu-de-la-guia` y la guía servida a 390 y 1440. `MODO=roto`
contra `84f98e5` afirma que no había guía, que el buscador no filtraba y que las
secciones no se plegaban.

## Documentación pública › La guía de Proyectos: la lista, el tablero y la ventana de una tarea

`/guia/proyectos` documenta Panel › Proyectos (`/proyectos`) con el estándar de
las anteriores: nueve secciones —vista general, buscar y filtrar, carpetas y
orden, crear, editar/compartir/eliminar, el tablero por columnas, el filtro de
vencimiento, la tarea (título, tipo, fecha, responsable) y sus adjuntos y
comentarios—, una miniatura con enfoque por tarjeta y el vídeo con la voz
Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/proyectos`: «Aprende a organizar tus proyectos y sus tareas en la
plataforma». Ninguna pieza propia: contenido en `lib/guia-proyectos.ts`,
semilla `sembrar-guia-proyectos.mjs`, receta `capturar-guia-proyectos.mjs` y
narración. Se regenera con
`npm run build && scripts/generar-guia-proyectos.sh && npm run build`.

Cuatro cosas que hay que mantener:

1. **La pantalla expone sus marcas** (`data-proyecto`, `data-tarea`,
   `data-columna`, `data-campo` en las dos ventanas y `data-zona` en la barra,
   la tarjeta, el tablero y el distintivo de vencimiento), y el banco compara
   la guía con ellas: las partes de la tarjeta, sus botones por su `title`, los
   campos de «Nuevo proyecto» y de una tarea en su orden, las columnas
   (`BOARD_COLUMNS`) y el filtro de vencimiento.
2. **Nada se confirma**: eliminar un proyecto o una tarea se cierra con
   «Cancelar» o «Volver», y soltar una tarea en Hecho abre «Dar por hecha», que
   también se cancela. Las capturas crean un proyecto y mueven una tarea, así
   que antes del vídeo se vuelve a sembrar.
3. **Los botones de una tarjeta salen al pasar el ratón** (`opacity-0`): la
   receta se pone encima antes de medirlos, y mide los desplegables de Radix
   ANTES de abrirlos (fuera queda `aria-hidden`).
4. **Los adjuntos de ejemplo los sirve la receta** (`archivos.ejemplo.co`): no
   hay bucket en el banco.

Lo prueba `scripts/banco-guia-proyectos.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=proyectos`, `fin-de-la-guia`,
`menu-de-la-guia` y la guía servida a 390 y 1440); `MODO=roto` contra
`84f98e5` afirma que no había guía ni marcas en la pantalla.

## Documentación pública › La trigesimosegunda guía, Reportes: el resumen semanal, lo que la IA no supo y la Calidad

`/guia/reportes` documenta Bandeja › Reportes (`/crm/reportes`, en el menú
«Resumen» dentro de Panel) con el estándar de las anteriores: diez secciones
—vista general, generar un reporte, leerlo (resumen, métricas, calidad y
actividad), el envío por WhatsApp, exportar a Excel, borrar, «Lo que la IA no
supo responder», los registros filtrados por tipo, y Calidad por asesor y por
conversación—, una miniatura con enfoque por tarjeta y el vídeo con la voz
Cedar y el MISMO ritmo. Su tarjeta sale sola en «Tutoriales del módulo» de
`/crm/reportes` (`GUIAS_PUBLICADAS`): «Aprende a revisar el resumen semanal de
tu negocio en la plataforma». Ninguna pieza propia: contenido en
`lib/guia-reportes.ts`, semilla `sembrar-guia-reportes.mjs`, receta
`capturar-guia-reportes.mjs` y narración. Se regenera con
`npm run build && scripts/generar-guia-reportes.sh && npm run build`.

Cuatro cosas que hay que mantener:

1. **Generar un reporte es una llamada a la IA y un WhatsApp**, y en la guía los
   contesta un doble (`fingido-guia-reportes.mjs`, cargado dentro de
   `next start`): el reporte sale «Enviado» sin que a nadie le llegue nada.
2. **Ni las capturas ni el vídeo borran nada**: la papelera abre su
   confirmación y se cierra con «Volver»; «Eliminar todos» solo se señala. Lo
   afirma el banco leyendo el guion.
3. **La pantalla expone sus marcas** (`data-zona`, `data-reporte`,
   `data-boton`, `data-pregunta`, `data-pestana`, `data-confirmar-borrado`) y
   la receta no usa coordenadas. «Abrir la conversación» de Calidad es un
   ENLACE, no un botón, y su columna es la última de una tabla que se desplaza
   a lo ancho: se trae a la vista antes de medir.
4. **La guía se compara con el código**: las pestañas del CRM, los botones de
   la barra, los bloques y métricas de un reporte, las columnas del Excel, los
   periodos de «Lo que la IA no supo», los tipos, columnas y acciones de
   Registros y las columnas de Calidad.

Lo prueba `scripts/banco-guia-reportes.sh` (el contenido contra el código, el
vídeo, las miniaturas con `GUIA=reportes`, `fin-de-la-guia`, `menu-de-la-guia`
y la guía servida a 390 y 1440); `MODO=roto` contra `84f98e5` afirma que no
había guía ni marcas en la pantalla.

## Las guías (`/guia/*`) siguen el tema de la App, con tokens `--guia-*`

Las guías se quedaban **blancas** aunque el cliente tuviera la App en oscuro.

**El diagnóstico, que es lo que decide la forma del arreglo:** las piezas son
compartidas (`components/guia/Guia.tsx`: el video, la introducción, la
cuadrícula de secciones, el artículo de una sección, el fin), pero **cada una
de las 35 guías tiene su propia copia** de la página del índice y de la página
de una sección (70 ficheros en `app/guia/*`), y todas llevaban sus colores
`slate-*` escritos a mano. Así que no bastaba con cambiar una plantilla.

> **Cada color de una guía es una variable `--guia-*`** (`app/globals.css`)
> y se pinta con `bg-guia-*`, `text-guia-*` y `border-guia-*`
> (`tailwind.config.ts`). El valor claro es exactamente el `slate-*` de antes
> —en claro no cambia ni un píxel— y `.dark` pone los oscuros. next-themes ya
> pone `dark` en `<html>`, y las guías son del mismo origen.

Cuatro cosas que hay que mantener:

1. **Una guía nueva usa los tokens**, nunca un `slate-*` ni un `white`. El
   banco barre los 70 ficheros y `Guia.tsx` y falla si aparece uno.
2. **Lo que vive sobre su propia superficie de color se queda fijo**, y el
   banco lo tiene en su lista de permitidos con el motivo: el marco del video
   (`bg-slate-900`), lo que va encima de una captura, el número en su círculo
   azul y la tarjeta azul de «Contáctanos».
3. **La guía abierta DENTRO de la landing sigue clara**
   (`data-guia-tema="claro"` en `GuiaEnLaLanding`): sus capturas son claras y
   la landing es oscura por su cuenta. Ese atributo vuelve a poner los valores
   claros en ese elemento, aunque cuelgue de un `.dark`.
4. **El orden de la página no cambia**: el video primero, después la
   introducción y después la cuadrícula de secciones, que NO es un acordeón.

Lo prueba `scripts/banco-plan-acordeon-y-guias-tema.sh` (hace falta el build):
lo puro y dos barridos (el ancho de los bloques y los colores de las guías), la
página del plan real en Chromium a 1440 y 390 (todos los bloques del mismo
ancho que la landing, sin rayas, «Ver tutorial» en todas, el acordeón que abre
uno a la vez con su video) y el índice y una sección de una guía en claro y en
oscuro, más la guía de la landing que sigue clara. `MODO=roto` pinta lo mismo
con el código de `2fda6a3` y afirma los fallos: el nombre de la guía como
enlace, ningún acordeón, anchos distintos y la guía blanca en oscuro.
