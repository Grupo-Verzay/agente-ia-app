# Páginas públicas, propuestas y /demo

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Propuestas comerciales: el enlace sale POR LA LÍNEA de la propuesta, y el contacto no se publica

Panel › Propuestas crea propuestas con página pública `/propuesta/<token>`
(`lib/propuestas.ts` puro, `lib/propuestas-db.ts`, `actions/propuestas-actions.ts`).
Cada una puede llevar, todo opcional: empresa, WhatsApp del cliente, la línea
de la cuenta desde la que se envía, correo, vigencia, nota interna o pública,
método y medio de pago (el par de Instancias, sin días de licencia) y si la
sección se titula «Servicios» o «Productos». El eslogan del encabezado es de la
CUENTA (`propuestas_ajustes`), no de una propuesta.

Cinco cosas que hay que mantener:

1. **El botón de WhatsApp ENVÍA** (`enviarPropuestaPorWhatsappAction`): al
   número y desde la línea guardados en la propuesta, por el despachador del
   servidor. Solo llega el id; número y línea se leen de la base. **Nunca por
   otra línea**: si la elegida no está conectada se dice (el despachador caería
   a otra). Abrir `wa.me` sin enviar queda en el «⋯».
2. **La línea tiene que ser de la cuenta** (`lasLineasParaEnviar`, la misma
   regla que el despachador), al guardar y al enviar.
3. **La página pública no lleva WhatsApp, correo ni línea**, y la nota solo si
   es pública (`laNotaQueSeEnsena`). Lo que no se entiende es interna.
4. Los campos nuevos entran con `ADD COLUMN IF NOT EXISTS`: la tabla ya está
   en producción.
5. El azul de la cabecera es `AZUL_DE_LA_PROPUESTA` (blue-500 → blue-400), uno
   para la cabecera y las iniciales; y junto al logo va solo «Propuesta
   comercial», no el nombre de la cuenta.

Lo prueba `scripts/banco-propuestas.sh`; `MODO=roto` lee `73f991f` y afirma la
cabecera oscura, el nombre junto al logo y el botón que solo abría `wa.me`.

### El enlace personalizado (`slug`): opcional, único, y el token no se va

En el formulario se puede poner un texto corto («clinica-sonrisa») y el enlace
pasa a ser `/propuesta/clinica-sonrisa`, como el de una landing. Cinco cosas:

1. **Sin personalizar sigue siendo el token** de 32 caracteres: no adivinable.
2. **Con slug, el token SIGUE abriendo la propuesta**: lo ya mandado no se rompe.
3. **Un slug mide de 3 a 30 y un token exactamente 32**, así que nunca tienen la
   misma forma y `laPropuestaPublica` pregunta por UNA columna, nunca por las dos.
4. **Único en toda la plataforma** (la URL es global), con índice único PARCIAL
   (`WHERE "slug" <> ''`); el choque se traduce a «ya lo usa otra propuesta».
   Ojo: en SQL en crudo el 23505 no trae el nombre del índice, dice
   `Key (slug)=`; se miran los dos.
5. **El enlace lo arma una función** (`elEnlaceDeLaPropuesta`): copiar, WhatsApp
   y el aviso al guardar. Se normaliza como el de la landing (minúsculas, sin
   acentos, guiones) y se guarda así; tecleado en mayúsculas abre igual.

`MODO=roto` lee también `f8057cb` y afirma que no había campo ni columna.

### Plantillas de planes: la propuesta guarda una COPIA, nunca el id

Panel › Propuestas tiene una segunda sección, **Plantillas de planes** (una
pastilla al lado de «Propuestas» en la barra), independiente de Productos y
**sin tope de cuántas**: cada plantilla es un plan (Lite, Básico, Business…) con
nombre, precio, moneda y características, una por línea. Tabla de la App
`propuestas_plantillas`, sin clave foránea; las acciones pasan por la misma
puerta que las propuestas (`quienManda`) y van acotadas por la cuenta.

Al crear o editar una propuesta, «Cargar plan» la mete en la sección de
servicios o productos con `conLaPlantillaCargada` (`lib/plantillas-de-planes.ts`,
pura): **cadenas nuevas**, las filas en blanco se sustituyen y lo escrito se
queda. La propuesta no guarda el id de la plantilla, así que lo cargado se edita
en la propuesta sin tocar la plantilla, y editar o borrar la plantilla no mueve
ninguna propuesta hecha. La moneda del plan solo se adopta si no había nada
escrito; si no, se avisa.

En el teléfono el buscador de esta pantalla va a `w-32`: con `w-56` al carril
de las dos secciones le quedaban 36 px, justo lo que tapan sus flechas.

Lo prueba `scripts/banco-plantillas-de-planes.sh`: la regla, las acciones contra
Postgres (ocho plantillas, otra cuenta y un agente no tocan nada, independencia
en los dos sentidos) y la pantalla real en Chromium a 1440/1024/390. `MODO=roto`
lee `f8057cb` y afirma que no había plantillas.

### Una plantilla ENLAZADA a un plan del panel lo lee EN VIVO, y la propuesta lleva su video y su enlace

Quien manda en la casa puede enlazar una plantilla a un plan del panel de Planes
(su nivel y su modalidad, `RefDePlan`). Esa plantilla **no guarda el plan**: lo
que guarda de nombre y precio es una foto para ordenar la lista, y al cargarla
en una propuesta todo se lee HOY del panel (`elPlanParaCargar`,
`lib/plan-de-la-propuesta.server.ts`, con las MISMAS funciones que la página
pública del plan): el nombre vigente, el precio en la moneda de la propuesta,
los recuadros de capacidad (créditos, catálogo, asistencia…) y «Qué incluye»
con los mismos ítems y en el mismo orden. Editar el plan en el panel se ve en la
SIGUIENTE propuesta sin tocar la plantilla.

> **La propuesta guarda una COPIA de la fila y la REFERENCIA al plan**
> (`propuestas_comerciales.planes`, JSONB, con `ADD COLUMN IF NOT EXISTS`). La
> fila no cambia aunque se edite el plan después —lo mandado a un cliente no se
> mueve—; el video del plan y el enlace a su página los resuelve la página
> pública de la propuesta AL ABRIRSE (`losPlanesDeLaPropuesta`), al final, en
> «Conoce el plan». Las reglas puras viven en `lib/plan-de-la-propuesta.ts`.

Cinco cosas que hay que mantener:

1. **Solo la casa enlaza, carga y pone planes** (`SOLO_LA_CASA`). Un cliente que
   lo pida a mano: la plantilla se rechaza, la propuesta se guarda sin planes y
   al editar se conservan los que ya tenía.
2. **Sin precio en esa moneda la inversión va vacía**, nunca un cero inventado;
   y el alcance que no cabe dice «…y N más», no se corta a media palabra.
3. **Un plan apagado no tiene página**: al cargarlo se avisa
   (`elAvisoDelPlanApagado`) y la propuesta sale con su video y sin enlace.
4. **El enlace lleva `?tipo=`** (segunda excepción a «la modalidad no va en la
   dirección»): quien abre la propuesta no tiene la cookie. El texto que se ve
   va sin `https://` y sin la consulta (`elTextoDelEnlace`).
5. **El video es el mismo componente que la página del plan**
   (`components/planes/VideoDelPlan.tsx`), sacado de `PlanDetailPage` para que
   los dos no se separen.

Lo prueba `scripts/banco-propuestas-con-plan.sh`: la regla pura, las acciones
contra Postgres (cargar en vivo, editar el plan y que la propuesta vieja no
cambie y la nueva sí, plan apagado, un cliente) y la página pública pintada con
React (video y enlace al final). `MODO=roto` lee `0764700` y afirma que no
existía nada de esto.

### La cabecera va DENTRO de la tarjeta azul

No hay cabecera aparte encima de la tarjeta: **el logo va arriba a la derecha
de la tarjeta azul y el eslogan de la cuenta abajo a la derecha**
(`data-hero-arriba`, `data-hero-abajo`), en negrilla con
`ESLOGAN_DE_LA_PROPUESTA` (16/18/20 px). Ni el nombre de la cuenta ni
«Propuesta comercial» en ninguna parte. Sin eslogan no se pinta nada. Lo
prueba `scripts/banco-cabecera-de-la-propuesta.sh` (con y sin imagen, eslogan
corto, largo y vacío, 390/768/1024/1440); `MODO=roto` monta el de `153f64f`.

### El plan va ENTERO dentro de su servicio, y la página sigue el tema del dispositivo

> **Esta sección manda sobre la de arriba** en dónde va el plan: ya no es un
> video y un enlace al final.

1. **Un plan cuyo nombre es el de un servicio de la lista se pinta DENTRO de
   esa fila** (`losPlanesDeCadaServicio`, por nombre normalizado): su video, sus
   recuadros de capacidad, sus funciones con su acordeón, su precio
   (`elTextoDelPrecioDelPlan`) y su botón «Comenzar con el plan X». Los que no
   casan con ningún servicio van en «Conoce el plan», también enteros. Son las
   MISMAS piezas que la página del plan (`PlanEnLaPropuesta`).
2. **Nada saca al cliente de la propuesta**: la guía de una función se
   despliega dentro (`GuiaDesplegada` con `sinSalidas`: sin tarjeta de contacto
   ni enlaces de salida) y **solo el botón del plan abre otra pestaña**, con
   `noopener`.
3. **La página sigue el modo claro u oscuro del teléfono del cliente**:
   `data-tema-del-plan="dispositivo"` en el `<main>` y en el `article`, y los
   tokens `--plan-*` de `app/globals.css` cambian con
   `prefers-color-scheme`. La guía va con `tema="dispositivo"`. Nada de colores
   `slate-*`/`white` escritos a mano en la propuesta.

Lo prueba `scripts/banco-propuesta-con-plan-dentro.sh` en Chromium (dónde va
cada plan, la guía sin salidas, el tema claro y oscuro medido y el ancho a
390/768/1024/1440); `MODO=roto` monta la de `94fcc3c` y afirma la cabecera
aparte, el plan suelto con su enlace y el fondo que no cambia.

### El ancho: el MISMO contenedor que la landing, y el párrafo se topa

Era una tira de 672 px (`max-w-2xl`) en medio de cualquier pantalla. Ahora
`ANCHO_DE_LA_PROPUESTA` ES `ANCHO_DE_LA_LANDING` (`max-w-6xl`, con su relleno
dentro): llena la ventana hasta 1152 px y de ahí se centra, igual que la landing
y la página de un plan. Los párrafos largos (alcance, nota, condiciones, pago)
llevan `TOPE_DE_LECTURA` (`max-w-3xl`, ~100 caracteres por línea): con el
contenedor ancho se leerían a 140. Medido: las tarjetas de capacidad de un plan
dentro de un servicio ocupan ~96 % de la fila, sin apretarse. Lo prueba
`scripts/banco-ancho-de-la-propuesta.sh` en Chromium a 390/768/1024/1280/
1440/1920; `MODO=roto` monta el componente de `3d2ff75` y afirma los 672 px.

## Las tres públicas llevan UN pie: el mismo texto, la raya al ancho del contenido y el aire de entre bloques

La landing principal, la página de un plan y la propuesta pública tenían tres
pies distintos: la landing decía «© año Agente IA. Todos los derechos
reservados.» con una raya de lado a lado y 24 px de aire encima; el plan decía
«© año Verzay» (sin los derechos), también de lado a lado; y la propuesta no
tenía ni raya ni derechos, solo «Propuesta preparada por …», con un hueco
enorme encima (`mt-10` más el `pb-16` del artículo).

> **Las tres pintan `PieDeLasPublicas`** (`components/shared/PieDeLasPublicas.tsx`),
> y las reglas viven en `lib/pie-de-las-publicas.ts`: el texto
> (`elTextoDeLosDerechos`, con el año del sistema —las tres páginas son
> dinámicas, así que se actualiza solo—), la raya (`LINEA_DEL_PIE`, una
> `border-t` DENTRO del contenedor del contenido, nunca en el `<footer>`) y el
> aire encima (`AIRE_ENCIMA_DEL_PIE`).

Cinco cosas que hay que mantener:

1. **El aire hasta la raya es el que hay entre dos bloques de ESA pantalla**:
   la landing separa sus secciones con `py-6` (48 px entre contenidos) y el
   pie lleva `pt-6`; el plan, con `ESPACIO_DEL_BLOQUE` (`py-8 sm:py-10`), y el
   pie lo mismo; la propuesta, con `mt-8` (32 px entre recuadros), y el pie
   `mt-8`. Debajo de la raya, 24 px en las tres. **Si una pantalla cambia el
   aire entre sus bloques, cambia el del pie**: el banco los compara medidos.
2. **El texto es UNO y nunca se escribe a mano**: ni un `©` ni un
   `getFullYear()` en las tres pantallas (lo exige el barrido).
3. **La propuesta añade encima «Propuesta preparada por <negocio>, Agente IA»**
   (`elTextoDePreparadaPor`, con el nombre del negocio de la cuenta), sin
   quitar los derechos. Sin nombre, «Propuesta preparada por Agente IA».
4. **En la propuesta no hay título encima de la lista**: cada tarjeta dice
   «Servicios: <nombre>» o «Productos: <nombre>» (`data-rotulo-del-item`), con
   el plural de `propuesta.tipoDeItems`.
5. **Las landings de reseller no entran** (`ResellerLandingClient`): tienen su
   propio pie con su marca.

Lo prueba `scripts/banco-pie-de-las-publicas.sh` (hace falta el build): lo puro
y un barrido, y las tres pantallas REALES en Chromium sobre el CSS del build a
1440, 1024 y 390 (la raya al ancho del contenido, el aire medido contra el de
entre bloques, el mismo texto en las tres, «preparada por» encima y los
rótulos en cada tarjeta). `MODO=roto` las pinta con el código de `20f8e50` y
afirma la raya de lado a lado, el aire distinto, el plan sin derechos y la
propuesta sin raya y con «Servicios» encima de la lista.

## El vídeo de ventas (`/demo`): el panel es la App de VERDAD, y lo demás lo dice

`/demo` es una página pública (noindex, sin sesión) con un vídeo de **entre
dos minutos y medio y tres** para que un lead lo vea antes de agendar: la
historia de una clínica contada en **tres pantallas a la vez** —el celular del
negocio, WhatsApp Web y el **panel de Verzay de verdad**—, con la voz Cedar y el
ritmo de las guías.

Se genera con `npm run build && scripts/generar-video-de-ventas.sh` y **después
se vuelve a construir** (`next start` solo sirve lo que había en `public/`).
`ENSAYO=1` graba sin tocar `public/demo/` y deja una captura por escena en
`/tmp/video-de-ventas`.

> **Lo que es de verdad y lo que no se dice en la propia página**
> (`LO_QUE_ES_EL_VIDEO`, `lib/video-de-ventas.ts`): el panel es la App servida
> con `next start` leyendo la base que va escribiendo la historia; el celular y
> WhatsApp Web son recreaciones fieles; las respuestas de la IA siguen un guion
> (`scripts/video-de-ventas/historia.mjs`). Un lead que después ve la plataforma
> no puede sentir que el vídeo le mintió.

### Cómo se graba sin fingir el panel

- **Cada mensaje lo escribe `backend.mjs` en la base como lo haría el webhook**
  —mismo tipo, `sentByAi`, transcripción, adjunto— y **el aviso en vivo sale por
  el mismo socket que en producción**: `tiempo-real.mjs` sirve socket.io v4 sobre
  sondeo desde Playwright, y la App pide su token y se conecta como siempre. Sin
  eso el panel solo se enteraría por sus relojes de respaldo, que es lo que ve
  una cuenta con el socket caído y no un cliente.
- **La historia salta horas con un reloj falso** (`clock.setSystemTime`: del
  mensaje al seguimiento, y al día del recordatorio). Por eso el `pingTimeout`
  del socket emulado es de una semana (`PLAZO_DEL_PING_MS`): engine.io mide su
  plazo con `Date.now()` y cada salto cerraba la conexión; el aviso que caía en
  ese segundo no le llegaba a nadie. **Un aviso que no llega a ninguna pestaña
  tumba la grabación de verdad**; en un ensayo solo avisa.
- **Lo que viaja en la conversación sale de `MEDIOS`**, también lo que se sirve
  al estudio. Con la lista escrita a mano se quedó sirviendo un `.mp4` viejo
  cuando el vídeo pasó a `.webm`: 404, y el vídeo de WhatsApp Web se quedaba en
  su portada sin decir nada. **Un vídeo que el estudio no puede pintar también
  tumba la grabación.**
- **Dentro de la grabación los vídeos van en WebM VP9** (el Chromium de
  Playwright no trae H.264) y se sirven como `video/webm`. El vídeo publicado sí
  es H.264 + AAC, que se reproduce en cualquier sitio.
- **El vídeo se graba con `grabadora-de-la-guia.mjs`, nunca con `recordVideo`**
  (estira las animaciones y la imagen se despega de la voz; ver la sección de
  las guías).
- **Las pantallas del portátil que no se ven van con `visibility: hidden`**, no
  solo transparentes. El portátil lleva cuatro capas de la App (Chats, Agenda,
  Embudos y Reportes) a 1440×900, y con `opacity: 0` Chromium las sigue
  rasterizando: al entrar la cuarta, el compositor sin cabeza se quedó sin
  memoria de raster y **ninguna se pintaba** —el portátil salía en blanco o con
  teselas viejas, sin un solo error—. La visibilidad espera a que acabe el
  fundido, así la que sale se sigue viendo mientras se va.

### Lo que hubo que arreglar en la App para poder grabarlo

Grabar la App de verdad destapó tres fallos que un cliente también ve:

1. **El borrador de un aviso en vivo no se sustituía nunca**
   (`lib/aviso-en-vivo-del-chat.ts`). La conversación abierta pinta al instante
   lo que trae el socket como texto plano; el mensaje de verdad —con su
   reproductor, su archivo y su «Agente IA»— lo trae el reloj con el MISMO id y
   la misma hora, así que `areListsDifferent` no veía nada nuevo y el borrador
   se quedaba: una nota de voz como «🎧 Audio» sin reproductor, un PDF como su
   etiqueta, la IA firmada «Asesor». Ahora el borrador lleva `DEL_AVISO_EN_VIVO`
   y mientras la respuesta del reloj traiga su versión real, la lista cambió.
2. **La ficha, la cabecera y la etapa no se enteraban de lo que la IA hacía**
   (`lib/crm-de-la-conversacion-abierta.ts`): al entrar un mensaje NUEVO en la
   conversación abierta se vuelve a leer lo de ESA conversación, agrupando la
   ráfaga. No es un reloj nuevo: el de sesiones sigue a 60 s.
3. **Un chat que nace no salía hasta el reloj de la lista**: el servidor
   recuerda la bandeja 10 s (`MEMORIA_DE_LA_BANDEJA_MS`) y la primera vuelta
   traía la foto de antes. Hay una segunda vuelta pasada esa memoria
   (`SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS`).

### El arranque: cinco negocios, un contenido distinto cada uno

Los primeros segundos son cinco tarjetas de ejemplo, en este orden: **tienda en
línea, clínica, cursos, consultoría y agencia de viajes**
(`NEGOCIOS_DEL_ARRANQUE`), y **debajo de las cinco**, en UNA línea centrada, «y
cualquier negocio que venda por WhatsApp» (`CIERRE_DEL_MONTAJE`). Después, la
pantalla de la marca: el logo, el nombre y la frase `LEMA_DE_LA_MARCA`, **sin la
lista de píldoras** de antes.

Seis cosas que hay que mantener:

1. **Cada tarjeta enseña un contenido distinto** —imagen, nota de voz, video,
   PDF y ubicación— y su `medio` tiene que ser el de sus mensajes (el banco lo
   compara). **El PDF de la consultoría y el mapa del viaje los manda la IA**:
   es lo que la IA hace por el negocio. La foto, la portada del video y el mapa
   se generan al grabar (`MEDIOS_DEL_MONTAJE`, `generarLosMediosDelMontaje`),
   ilustrados: la página es pública y no lleva ni fotos de nadie ni teselas de
   un servicio de mapas.
2. **El encabezado es el de un chat de WhatsApp**: 56 px, gris claro, pegado
   arriba, con atrás, videollamada y llamada. Nada de franja de color.
3. **Los mensajes arrancan pegados arriba** (`.mini .muro` con
   `justify-content: flex-start`), no al fondo como en un chat largo.
4. **El teléfono de una tarjeta es `.caja > .pant`, no `.marco > .vid`**: una
   burbuja de video también lleva `.vid` y `.marco` dentro, y con esos nombres
   heredaba los 600 px de alto y el fondo del teléfono y salía como **un
   recuadro negro con un punto en el centro**. La portada se comprueba en los
   píxeles —en la página pintada y en los fotogramas del vídeo publicado
   (`montaje.cajas`)—: una imagen con el botón de reproducir encima, y la
   duración sobre una franja oscura abajo, como en WhatsApp (sin ella se perdía
   sobre una portada clara). Y los nombres se leen enteros: el del PDF sin «…»
   y el del lugar en una línea.
5. **El cierre es una línea DEBAJO, no una columna al lado**: va fuera de la
   fila de tarjetas (`#montaje > .cierreMontaje`), centrado, por encima de los
   subtítulos. Al lado se leía como una tarjeta más.
6. **El cierre sale con la frase que lo dice y nunca antes del último mensaje
   de la última tarjeta**: `yCualquierNegocio()` espera lo que falte y devuelve
   cuánto, y el `.json` del vídeo guarda cuándo salió (`montaje.cierreMs`). La
   página nombra los mismos negocios (`NEGOCIOS_DEL_VIDEO`).

Lo mide pintado `lib/__tests__/montaje-del-video.test.mjs` (en el banco del
vídeo), y en el vídeo publicado se buscan el cierre, la portada y el mapa en los
fotogramas. Su `MODO=roto` pinta el estudio de `1807a22` (el arranque viejo),
el de `a7e2b45` (cuatro tarjetas, el PDF del cliente, el cierre al lado y la
duración ilegible) y las tarjetas de hoy con el marco del celular de `1807a22`
—el choque de clases de la regla 4—, y afirma sus fallos.

### La historia de Laura, escena por escena

Después del arranque (título en pantalla «Cada minuto sin respuesta es una venta
que se enfría», con su voz) y la promesa, el orden es el de `NARRACION`
(`scripts/video-de-ventas/narracion.mjs`) y el banco lo compara con el guion:
texto, nota de voz, **Google Sheets** (sus datos en una hoja recreada, justo
después de la financiación), archivos, caliente, **seguimiento** («la IA insiste
como tú decidas: con texto, nota de voz, un archivo o hasta una llamada»)
seguido de **una llamada de WhatsApp de verdad escrita en el panel** —Laura
contesta y se oyen hablando, con dos voces del mismo modelo (`LA_LLAMADA`)—, la
cita, el recordatorio, **el paso a un asesor**, el embudo y **los reportes**.
Después de los reportes, **«13 · Trabaja en equipo»**: tres líneas de WhatsApp
—Ventas (6 asesores), Soporte (3) y Cobros (2), `LINEAS_DEL_EQUIPO`— con sus
asesores atendiendo a la vez, y el embudo **de verdad** filtrado por Andrea, la
asesora de Ventas (`/embudos?asesor=`). Antes del cierre, un **resumen** con
todas las píldoras, «Trabaja en equipo» incluida. **No hay ráfaga de «Y hay
más»**: Modo dueño y Operarios de campo se quitaron.

**El cierre es solo la marca y su frase, sin botones**: el vídeo se manda dentro
de un flujo de WhatsApp y el llamado llega después por texto. La PÁGINA sí
conserva sus dos llamados (agendar y escribir al **+57 323 361 2620**,
`LLAMADO.whatsapp`).

Tres cosas del montaje que hay que mantener:

1. **El primer fotograma es una portada** (`#portada`: logo, nombre y un botón
   de reproducir) durante `PORTADA_MS` (500 ms). WhatsApp usa el primer
   fotograma como miniatura al compartir el archivo, y antes era negro. El
   `.jpg` publicado (portada de la página y `og:image`) es un fotograma de esa
   portada (`PORTADA_JPG_MS`). Más larga que ~0,8 s, la voz empieza tarde y el
   banco de los huecos mudos se pone rojo.
2. **De los cinco negocios a la marca no hay pausa**: `callar(0)` y la marca
   entra deslizándose en medio segundo. Antes había un respiro y un fundido
   lento, y se veía la pantalla quieta.
3. **El esquema de las tres líneas es una recreación** (las líneas y los
   asesores no se siembran); el embudo filtrado sí es la App. La página lo dice
   en `LO_QUE_ES_EL_VIDEO`.

La hoja de Sheets, la llamada vista en el celular, el resumen y las tres líneas
son recreaciones, y la página lo dice (`LO_QUE_ES_EL_VIDEO`); la llamada queda
escrita en el panel como una llamada de verdad (`messageType: 'call'`). El
`MODO=roto` del banco lee la historia de `e2e0005` (pinchado) y afirma que allí
la apertura decía otra cosa y no había ni Sheets, ni llamada, ni asesor, ni
reportes, ni resumen; y la de `6619c2e` (`ANTES_DEL_EQUIPO`) y afirma que no
había portada ni escena del equipo, que estaba la ráfaga y que el cierre
llevaba botones. El vídeo publicado se mide en sus fotogramas: el primero no es
negro y enseña el botón de reproducir, la marca se mueve al entrar y las líneas
se ven.

### La página

`app/demo/`: el vídeo con su portada, qué es real y qué no, las trece capacidades
en el orden del vídeo (`CAPACIDADES_DEL_VIDEO`, trece: filas llenas y la
última centrada) y dos llamados del mismo tamaño —agendar y escribir por WhatsApp, con
`noopener`—. Pública en el middleware y noindex por metadatos y por cabecera
(`/demo/:path*`, también el vídeo).

Lo prueba `scripts/banco-video-de-ventas.sh`: el borrador que se sustituye (con
la `areListsDifferent` sacada del fichero), el CRM de la conversación abierta,
la historia y el estudio, la voz Cedar completa y el guion, el vídeo publicado
medido con ffmpeg (H.264 1920×1080, menos de dos minutos, sin huecos mudos) y la
página servida sin sesión a 390 y 1440. `MODO=roto` saca la función de
`316b70c` y afirma que el borrador se quedaba y que no había ni vídeo ni página.

La síntesis de la narración usa «IA CRM» por defecto; si OpenAI contesta 429 se
pide con otra llave de la misma tabla: `NOMBRE_LLAVE="Agente IA" node
scripts/sintetizar-en-el-contenedor.mjs scripts/video-de-ventas/narracion.mjs`.

## La propuesta pública: el precio dos veces, la cuadrícula sin huecos, sin la guía del Agente IA, y el video se compacta

> **Esta sección manda sobre la de arriba** en qué pasa con el video al abrir la
> guía: se queda, pero se COMPACTA. Y sobre *El plan va ENTERO dentro de su
> servicio* en dónde va el precio.

Cuatro fallos de `/propuesta/<token>`, reportados juntos:

| lo que se veía | la causa | ahora |
| --- | --- | --- |
| el precio salía cuatro veces: «Inversión total», junto al nombre del servicio, junto al botón del plan y en un «Total» al final | la fila del servicio pintaba su importe aunque el plan ya trajera el suyo, y el «Total» de abajo repetía el de arriba | **dos**: «Inversión total» arriba y el precio del plan junto a «Comenzar con el plan». Un servicio que NO es un plan conserva su importe en su fila (`data-precio-del-servicio`) |
| la cuadrícula de secciones de la guía desplegada dejaba un hueco | con `sinSalidas` se escondía «Contáctanos» y nadie ocupaba su sitio | «Ver el vídeo de nuevo» lo ocupa: `lasClasesDelCierre(n, { conContacto: false })` (`lib/cierre-de-la-guia.ts`), la MISMA regla de la guía de la plataforma |
| salía la guía del Agente IA («Entrena al asistente que atiende a tus clientes») | la propuesta usaba todas las guías publicadas | `GUIAS_FUERA_DE_LA_PROPUESTA` (`lib/plan-de-la-propuesta.ts`) la deja fuera: la función sale con su nombre y su descripción, sin «Ver guía» ni video |
| «Ver guía» no compactaba el video | `TutorialEnLaPagina` lo dejaba a todo el ancho | `VIDEO_COMPACTO` (`max-w-[14rem] sm:max-w-sm`) con la guía abierta y `data-video-compacto`; al ocultarla vuelve a su tamaño |

Cinco cosas que hay que mantener:

1. **El «Total» de abajo no vuelve**: el total va UNA vez, arriba. Lo que se
   quita de la fila es solo el importe de un servicio CON plan que trae precio.
2. **Sin contacto, el vídeo ocupa todo lo que aquel ocupaba**: una tarjeta más
   en un teléfono, una fila entera si la última está llena, y si no, todos los
   huecos. `lasFilasQuedanLlenas` lo comprueba con las dos opciones.
3. **La guía del Agente IA solo sale de la PROPUESTA**: la página pública del
   plan y «Cargar plan» siguen con todas las guías (`GUIAS_QUE_SE_ENSENAN`).
   Una guía más que sea para quien ya compró entra en esa lista.
4. **La compactación vive en `TutorialEnLaPagina`, compartido**: la página del
   plan y la propuesta hacen exactamente lo mismo. Va sin transición y con el
   borde de arriba del video quieto, así que abrir la guía sigue sin mover la
   página (la regla de `cuantoBajarParaVerLaGuia` no cambia).
5. **El precio junto al botón es `data-precio-del-plan`** dentro de
   `data-comenzar-el-plan`, el de `PlanEnLaPropuesta`.

Lo prueba `scripts/banco-propuesta-sin-repeticiones.sh` (hace falta el build):
la propuesta REAL en Chromium sobre el CSS del build, a 1440, 768 y 390 —el
importe una sola vez arriba y el precio junto al botón, un servicio sin plan con
su importe, la cuadrícula sin huecos y con el vídeo en el cierre, la función del
Agente IA sin su guía y las demás con la suya, y el video que se compacta y
vuelve—. `MODO=roto` empaqueta lo mismo contra `cbc47f6` y afirma los cuatro
fallos.

Y `banco-plan-orden-y-guia-sin-saltos` se ajustó a la compactación: cuando el
video al encogerse ya sube la guía a la vista, no bajar es lo correcto; lo que
exige es que el borde de arriba del video no se mueva y que en alguna anchura
(390) se siga ejerciendo el bajar a verla.

## Propuestas: el saludo de envío por WhatsApp es de la CUENTA, y el modal se llama «Configuración»

El modal que era «Eslogan de tus propuestas» es **Configuración** y lleva dos
campos: el eslogan y el **Saludo de envío por WhatsApp**. El de fábrica
(`SALUDO_DE_FABRICA`, `lib/propuestas.ts`) es «Hola *{cliente}*, te comparto
nuestra propuesta comercial, haz clic en el enlace para conocer los detalles.»,
dos saltos de línea y «👉 {enlace}».

1. **`{cliente}` y `{enlace}` los completa el envío** (`elMensajeDeWhatsapp`):
   sin `{enlace}` se añade al final, para que nunca salga sin él.
2. **Vacío o igual al de fábrica se guarda vacío**: la cuenta usa el de fábrica
   (`comoSaludo`, tope `TOPE_DE_SALUDO`).
3. **Vive en `propuestas_ajustes.saludo`** (tabla de la App, `ADD COLUMN IF NOT
   EXISTS`); guardar uno no toca el otro y la fila se borra solo con los dos
   vacíos (`ponerLosAjustes`).
4. Lo lee el botón de WhatsApp de la pantalla y el envío del servidor.

Lo prueba `scripts/banco-saludo-de-propuestas.sh`; `MODO=roto` lee `62386d4` y
afirma que no existía.
