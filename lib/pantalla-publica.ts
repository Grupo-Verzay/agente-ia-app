/**
 * La forma de una pantalla que se abre SIN sesión: su propio contenedor que se
 * desplaza.
 *
 * # Por qué hace falta declararlo, y no sale gratis
 *
 * El `<body>` de la App va con **`overflow-hidden`** (`app/layout.tsx`). Eso
 * está ahí para el armazón autenticado, que se fija a `100dvh` y se desplaza
 * por dentro —ver el `SidebarInset` de `app/(root)/layout.tsx`—, así que para
 * él no cambia nada.
 *
 * Pero el `overflow` del `body` **se propaga al viewport** cuando el `<html>`
 * lo tiene en `visible`, que es el caso. O sea: el documento entero deja de
 * poder desplazarse, y con él **cualquier página que no viva dentro de
 * `(root)`** — que son justamente las públicas, las que abre un cliente final
 * por un enlace.
 *
 * Desde fuera eso se ve como que la pantalla «está cortada»: los campos de
 * abajo y el botón de enviar quedan pintados y fuera de alcance.
 *
 * # Y por eso el fallo pasó desapercibido tanto tiempo
 *
 * `overflow: hidden` **no es `clip`**: recorta, pero deja desplazar por
 * código. Un `scrollTop`, un `scrollIntoView` o el traído automático del campo
 * que recibe el foco siguen funcionando. Así que **tabulando con el teclado se
 * llega al botón y con la rueda o el dedo no**, que es la forma más fácil de
 * probar una pantalla y darla por buena.
 *
 * # El alto es FIJO, nunca `min-h`
 *
 * Con `min-h-[100dvh]` el elemento crece con su contenido, así que su propio
 * `overflow` no se dispara jamás y se vuelve exactamente al mismo sitio. Tiene
 * que ser `h-[100dvh]`: alto de una pantalla, y lo que sobre se desplaza
 * dentro.
 *
 * Y `dvh` y no `vh`: en un móvil `100vh` es el viewport GRANDE —el de cuando
 * la barra del navegador está recogida— así que con la barra desplegada el
 * final del contenido queda debajo de ella.
 *
 * # Si se añade otra pantalla pública, lleva esto
 *
 * No es una preferencia de estilo: sin ello, nace sin poder desplazarse. Lo
 * comprueba `lib/__tests__/pantallas-publicas-se-desplazan.test.mjs`, que
 * recorre todo lo que vive fuera de `(root)` y falla si alguna no declara su
 * contenedor ni está en la lista de exentas con su motivo escrito al lado.
 */
export const PANTALLA_PUBLICA_QUE_SE_DESPLAZA = "h-[100dvh] overflow-y-auto";

/**
 * Lo que va DENTRO cuando el contenido se quiere centrado —el caso del login—.
 *
 * **El centrado no puede colgar de un alto FIJO, y eso está medido.** Con
 * `flex h-full items-center justify-center` y un contenido más alto que la
 * ventana, el centrado reparte el sobrante arriba y abajo y **lo de arriba no
 * se alcanza**: el desplazamiento no llega a negativo. Medido en Chromium con
 * 1.400 px de contenido, el principio del formulario arrancaba en **−312 px** a
 * 1319×726 y en **−253 px** a 390×844.
 *
 * Con `min-h-full` la caja mide como mucho lo que mide su contenido: centra
 * mientras cabe y crece hacia abajo cuando no, así que el principio se queda al
 * alcance (medido: +25 px, que es su propio relleno).
 *
 * Lo que la misma medida desmintió, y conviene no volver a escribirlo mal:
 * `min-h-screen` **no** corta —tampoco con flex—, así que el peligro no es
 * `screen` frente a `full`, es **fijo frente a mínimo**. `full` se prefiere
 * igualmente porque lo que hay que llenar es el contenedor que se desplaza, no
 * la ventana.
 */
export const CENTRADO_QUE_NO_SE_CORTA = "grid min-h-full place-items-center";
