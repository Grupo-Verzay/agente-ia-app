/**
 * El CONTENIDO de la guía pública de AI Imágenes (`/guia/ai-imagenes`): la
 * pantalla `/ai-image`, donde una cuenta sube la foto de su producto y la IA
 * le devuelve anuncios listos para Instagram, WhatsApp y Facebook, con el
 * texto del post al lado.
 *
 * Mismo estándar que las de Leads, Catálogo, Diagramas, Reuniones y Mis notas,
 * y con las MISMAS piezas: la forma de una sección, la barra de arriba y la
 * carpeta salen de `lib/guia-de-modulo.ts`. Las capturas y el vídeo los genera
 * `scripts/capturar-guia-ai-imagenes.mjs` sobre la App servida de verdad —con
 * un Gemini FINGIDO que devuelve imágenes de ejemplo ya generadas, porque en el
 * banco no hay ni debe haber una clave de Google—, y el banco
 * (`lib/__tests__/guia-ai-imagenes.test.mjs`) compara lo que esta guía dice con
 * lo que pinta la pantalla: los cuatro pasos, los tres formatos, las diez
 * etapas, los estilos de fábrica, los tres motores y las tres calidades.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DE_AI_IMAGENES = "/ai-image";

/** Dónde vive AI imágenes en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_AI_IMAGENES = "Apps Externas";

/**
 * Las siete ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Tu API key de Google",
    "Los cuatro pasos",
    "El paso abierto",
    "La vista previa",
    "El texto del post",
] as const;

/** Los cuatro PASOS del generador, en su orden, con la sección que explica cada uno. */
export const PASOS_DEL_GENERADOR = [
    { paso: "Producto", seccion: "producto" },
    { paso: "Campaña", seccion: "campana" },
    { paso: "Estilo", seccion: "estilo" },
    { paso: "Motor", seccion: "motor" },
] as const;

/** Los formatos y la red de cada uno, tal como los rotula la pantalla. */
export const FORMATOS_DOCUMENTADOS = [
    { formato: "Post Instagram", medida: "1080 x 1080", red: "Instagram" },
    { formato: "Story / WhatsApp", medida: "1080 x 1920", red: "WhatsApp" },
    { formato: "Post Facebook", medida: "1200 x 675", red: "Facebook" },
] as const;

/** Las diez etapas de la estructura de marketing, sin su número, en su orden. */
export const ETAPAS_DOCUMENTADAS = [
    "Hero Section",
    "Identificación Dolor",
    "Presentación Solución",
    "Beneficios Profundos",
    "Prueba Social",
    "Demostración",
    "Manejo Objeciones",
    "Oferta Irresistible",
    "Llamado a la Acción",
    "Sección Confianza",
] as const;

/** Los cuatro estilos de fábrica de la biblioteca visual. */
export const ESTILOS_DOCUMENTADOS = ["Minimalista", "Premium", "Estilo de Vida", "Creativo"] as const;

/** Los tres motores y las tres calidades del paso Motor. */
export const MOTORES_DOCUMENTADOS = [
    "Gemini Flash (Equilibrado)",
    "Gemini 3.1 Pro (Alta Calidad)",
    "Imagen 4 (Fotorrealismo)",
] as const;
export const CALIDADES_DOCUMENTADAS = ["Estándar", "Alta calidad", "Ultra HD"] as const;

/** Lo que queda del texto del post en cada red, como lo dice la guía. */
export const REDES_DEL_TEXTO = [
    { red: "Instagram", hashtags: "hasta 6 hashtags" },
    { red: "WhatsApp", hashtags: "sin hashtags" },
    { red: "Facebook", hashtags: "hasta 2 hashtags" },
] as const;

export const GUIA_AI_IMAGENES: Contenido = {
    titulo: "AI Imágenes",
    subtitulo: "Anuncios de tu producto hechos con IA, con su texto listo para publicar",
    descripcion:
        "AI Imágenes convierte la foto de tu producto en anuncios para Instagram, WhatsApp y Facebook. Lo haces en " +
        "cuatro pasos —el producto, la campaña, el estilo y el motor de IA— y la plataforma te devuelve cada imagen " +
        "en su formato, con el texto del post escrito para esa red. También genera en una sola tanda las diez " +
        "imágenes de una página de ventas.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, tu API key, los cuatro pasos, la vista previa y el texto del post.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 Tu API key de Google · 4 Los cuatro pasos · " +
                        "5 El paso abierto · 6 La vista previa · 7 El texto del post.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de AI Imágenes con sus siete partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. AI imágenes está dentro de Apps Externas. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con AI imágenes dentro de Apps Externas",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Los cuatro pasos",
                    texto:
                        "1 Producto · 2 Campaña · 3 Estilo · 4 Motor. Pasas de uno a otro con Siguiente y Anterior, o " +
                        "pulsando el paso; el que ya está listo lleva su chulito.",
                    imagen: "pasos.webp",
                    alt: "Los cuatro pasos del generador, numerados",
                },
                {
                    titulo: "La vista previa y el texto",
                    texto:
                        "A la derecha, la imagen que se generó y, debajo, el texto del post para la red de ese formato. " +
                        "Los dos cambian juntos.",
                    imagen: "resultado.webp",
                    alt: "La vista previa de un anuncio y su texto del post",
                },
            ],
            consejos: [
                "Lo que eliges en los pasos se queda mientras no cierres la pantalla: puedes volver a un paso y cambiarlo.",
                "Cada imagen y cada texto usan la IA de tu cuenta: si se queda sin créditos, no se genera y la pantalla te lo dice.",
                "En un teléfono los pasos enseñan solo su número y su icono.",
            ],
        },
        {
            slug: "api-key",
            titulo: "Tu API key de Google",
            resumen: "La clave de Google AI Studio con la que se generan tus imágenes y tus textos.",
            icono: "KeyRound",
            miniatura: "mini-api-key.webp",
            pasos: [
                {
                    titulo: "Si falta la clave",
                    texto:
                        "Arriba del generador sale un aviso ámbar que dice que la necesitas, con el botón Configurar.",
                    imagen: "api-key-aviso.webp",
                    alt: "El aviso ámbar de la API key con el botón Configurar",
                },
                {
                    titulo: "Pégala y guárdala",
                    texto:
                        "Configurar abre esta ventana: pega tu API key y pulsa Guardar. El enlace de abajo te lleva a " +
                        "Google AI Studio para sacar una.",
                    imagen: "api-key-dialogo.webp",
                    alt: "La ventana para pegar la API key de Google",
                },
                {
                    titulo: "Ya configurada",
                    texto:
                        "El aviso pasa a gris y dice que la clave está configurada. Con Cambiar pones otra cuando quieras.",
                    imagen: "api-key-lista.webp",
                    alt: "El aviso gris de la API key configurada, con el botón Cambiar",
                },
            ],
            consejos: [
                "La clave se pone aquí, no en Mi Perfil: es la de Google (Gemini), no la de OpenAI.",
                "Sin clave, el botón del último paso dice «Configurar API key» y abre esta misma ventana.",
                "La clave no se enseña nunca después de guardarla.",
            ],
        },
        {
            slug: "producto",
            titulo: "Sube tu producto",
            resumen: "La foto de tu producto, de la que salen todos los anuncios.",
            icono: "Upload",
            miniatura: "mini-producto.webp",
            pasos: [
                {
                    titulo: "Sube la foto",
                    texto:
                        "En el paso 1, pulsa el recuadro y elige la foto de tu producto. Una foto limpia, con fondo claro, " +
                        "da los mejores anuncios.",
                    imagen: "producto-subir.webp",
                    alt: "El recuadro para subir la foto del producto",
                },
                {
                    titulo: "Así queda cargada",
                    texto:
                        "La foto se ve grande. 1 Su número y cuántas llevas cargadas · 2 Con Siguiente pasas a la campaña.",
                    imagen: "producto-cargado.webp",
                    alt: "La foto del producto cargada en el paso 1",
                },
                {
                    titulo: "Varias fotos a la vez",
                    texto:
                        "1 Agregar más imágenes suma otros productos u otros ángulos: se genera el mismo anuncio para " +
                        "cada uno · 2 Pulsa una miniatura para verla y la X para quitarla.",
                    imagen: "producto-varios.webp",
                    alt: "Agregar más imágenes y las miniaturas de las fotos cargadas",
                },
            ],
            consejos: [
                "Con varias fotos, arriba de la vista previa sale un botón por producto para ver los anuncios de cada uno.",
                "Si quitas una foto, sus anuncios se van con ella.",
            ],
        },
        {
            slug: "campana",
            titulo: "La campaña",
            resumen: "Qué formatos, qué etapa de venta, qué ambiente y qué detalles lleva el anuncio.",
            icono: "LayoutTemplate",
            miniatura: "mini-campana.webp",
            pasos: [
                {
                    titulo: "Texto y modo",
                    texto:
                        "1 Incluir copy en la imagen: la IA escribe títulos y precio dentro de la foto · 2 Genera las 10 " +
                        "etapas: el kit de landing.",
                    imagen: "campana-interruptores.webp",
                    alt: "Los interruptores de texto en la imagen y del kit de las diez etapas",
                },
                {
                    titulo: "Los formatos",
                    texto:
                        "Post Instagram (1080 x 1080), Story / WhatsApp (1080 x 1920) y Post Facebook (1200 x 675). " +
                        "Marca los que quieras; al menos uno queda siempre.",
                    imagen: "campana-formatos.webp",
                    alt: "Los tres formatos a generar",
                },
                {
                    titulo: "La estructura de marketing",
                    texto:
                        "Elige la etapa de venta del anuncio, de 1 Hero Section a 10 Sección Confianza. Debajo se lee " +
                        "para qué sirve la que eliges.",
                    imagen: "campana-estructura.webp",
                    alt: "Las diez etapas de la estructura de marketing",
                },
                {
                    titulo: "El ADN visual y los detalles",
                    texto:
                        "1 Escribe el ambiente —fondo, luz, sensación— · 2 O toca una de las ideas rápidas · 3 En " +
                        "Detalles específicos, lo que la IA no debe improvisar.",
                    imagen: "campana-adn.webp",
                    alt: "El ADN visual con sus ideas rápidas y los detalles del anuncio",
                },
            ],
            consejos: [
                "Si tu producto lleva un precio o una frase exacta, escríbelo en Detalles específicos.",
                "Sin texto en la imagen, la foto sale limpia para ponerle tus letras después.",
            ],
        },
        {
            slug: "estilo",
            titulo: "El estilo",
            resumen: "La dirección visual del anuncio: uno de fábrica o uno tuyo.",
            icono: "Palette",
            miniatura: "mini-estilo.webp",
            pasos: [
                {
                    titulo: "Elige un estilo",
                    texto:
                        "La biblioteca visual trae cuatro: Minimalista, Premium, Estilo de Vida y Creativo. El elegido " +
                        "lleva su chulito.",
                    imagen: "estilo-elegir.webp",
                    alt: "La biblioteca visual con el estilo Premium elegido",
                },
                {
                    titulo: "Crea el tuyo",
                    texto:
                        "Crear estilo abre dos campos: el nombre y la descripción —luz, fondo, materiales—. Guardar " +
                        "estilo lo deja en tu biblioteca.",
                    imagen: "estilo-crear.webp",
                    alt: "Los campos para crear un estilo propio",
                },
                {
                    titulo: "Borra uno tuyo",
                    texto:
                        "Los tuyos llevan una papelera. Antes de borrar te pregunta, con el nombre delante: no se puede " +
                        "deshacer.",
                    imagen: "estilo-borrar.webp",
                    alt: "La confirmación para eliminar un estilo propio",
                },
            ],
            consejos: [
                "Tus estilos se guardan en tu cuenta: los encuentras la próxima vez que entres.",
                "Los cuatro de fábrica no se pueden borrar.",
            ],
        },
        {
            slug: "motor",
            titulo: "El motor",
            resumen: "El modelo de IA, cuántas variantes y con qué calidad.",
            icono: "Cpu",
            miniatura: "mini-motor.webp",
            pasos: [
                {
                    titulo: "El modelo de IA",
                    texto:
                        "1 Gemini Flash, para la mayoría de anuncios · 2 Gemini 3.1 Pro, para más detalle y texto dentro " +
                        "de la imagen · 3 Imagen 4, para fotos de estudio.",
                    imagen: "motor-modelo.webp",
                    alt: "Los tres modelos de IA para generar",
                },
                {
                    titulo: "Variantes y calidad",
                    texto:
                        "1 Variantes por imagen: de 1 a 10 versiones distintas de cada anuncio · 2 Calidad: Estándar, " +
                        "Alta calidad o Ultra HD.",
                    imagen: "motor-variantes.webp",
                    alt: "El contador de variantes y las tres calidades",
                },
                {
                    titulo: "Lo que se generará",
                    texto:
                        "1 Cuántas imágenes salen: productos por formatos por variantes · 2 El estilo y los detalles que " +
                        "se van a usar.",
                    imagen: "motor-resumen.webp",
                    alt: "El resumen de lo que se generará",
                },
            ],
            consejos: ["Más variantes son más imágenes: mira el total estimado antes de generar."],
        },
        {
            slug: "generar",
            titulo: "Generar y descargar",
            resumen: "Generar la tanda, recorrer los formatos y las variantes, y bajar la imagen.",
            icono: "Sparkles",
            miniatura: "mini-generar.webp",
            pasos: [
                {
                    titulo: "Generar imagen",
                    texto:
                        "En el paso 4, abajo a la derecha, pulsa Generar imagen. Cada anuncio aparece en la vista previa " +
                        "en cuanto está listo.",
                    imagen: "generar-boton.webp",
                    alt: "El botón Generar imagen en el pie del paso 4",
                },
                {
                    titulo: "Formatos y variantes",
                    texto:
                        "1 Arriba de la imagen pasas de un formato a otro · 2 Con los números de Variante eliges cuál de " +
                        "las versiones ves.",
                    imagen: "generar-vista.webp",
                    alt: "Los formatos y las variantes sobre la vista previa",
                },
                {
                    titulo: "Descargar",
                    texto: "El botón de arriba a la derecha baja la imagen que estás viendo, en su tamaño.",
                    imagen: "generar-descargar.webp",
                    alt: "El botón de descargar la imagen",
                },
            ],
            consejos: [
                "Mientras se genera, la vista previa dice «Generando anuncio…»; puedes mirar lo que ya salió.",
                "Si algo falla, el motivo sale en rojo encima de los botones del pie.",
            ],
        },
        {
            slug: "texto-del-post",
            titulo: "El texto del post",
            resumen: "El texto que acompaña a cada imagen, escrito para Instagram, WhatsApp o Facebook.",
            icono: "Type",
            miniatura: "mini-texto-del-post.webp",
            pasos: [
                {
                    titulo: "Se escribe solo",
                    texto:
                        "Debajo de la vista previa, la IA escribe el texto del post mirando la imagen. Arriba dice para " +
                        "qué red es y cuántos caracteres lleva.",
                    imagen: "texto-escrito.webp",
                    alt: "El texto del post escrito para Instagram",
                },
                {
                    titulo: "Cambia con el formato",
                    texto:
                        "Cada formato tiene su red: Instagram lleva hasta 6 hashtags, WhatsApp sin hashtags y Facebook " +
                        "hasta 2.",
                    imagen: "texto-whatsapp.webp",
                    alt: "El texto del post adaptado a WhatsApp, sin hashtags",
                },
                {
                    titulo: "Edita, copia o vuelve a generar",
                    texto:
                        "Puedes cambiarlo antes de publicarlo. 1 Copiar texto lo deja en el portapapeles · 2 Volver a " +
                        "generar escribe otro.",
                    imagen: "texto-copiar.webp",
                    alt: "Los botones Copiar texto y Volver a generar",
                },
            ],
            consejos: [
                "Lo que editas a mano se queda en su formato aunque cambies a otro y vuelvas.",
                "Si el texto pasa del largo de la red, abajo te avisa cuántos caracteres sobran.",
            ],
        },
        {
            slug: "kit-landing",
            titulo: "El kit de landing",
            resumen: "Las diez imágenes de una página de ventas, en una sola tanda.",
            icono: "LayoutGrid",
            miniatura: "mini-kit-landing.webp",
            pasos: [
                {
                    titulo: "Enciende el modo",
                    texto:
                        "1 En el paso 2, enciende Genera las 10 etapas · 2 En lugar de los formatos y la estructura sale " +
                        "este aviso: el kit sale en cuadrado, con las diez etapas.",
                    imagen: "kit-modo.webp",
                    alt: "El modo kit landing encendido en el paso Campaña",
                },
                {
                    titulo: "Generar kit",
                    texto: "En el paso 4 el botón pasa a decir Generar kit: salen las diez etapas de tu producto.",
                    imagen: "kit-generar.webp",
                    alt: "El botón Generar kit en el pie del paso 4",
                },
                {
                    titulo: "Recorre las diez etapas",
                    texto:
                        "1 Arriba de la vista previa, un botón por etapa, de Hero Section a Sección Confianza · 2 Cada " +
                        "una trae su texto del post.",
                    imagen: "kit-etapas.webp",
                    alt: "Los botones de las diez etapas sobre la vista previa del kit",
                },
            ],
            consejos: ["Pon las diez imágenes en tu página en su orden: cuentan la venta de principio a fin."],
        },
    ],
};

/** La guía armada: su carpeta, su vídeo y la navegación (`lib/guia-de-modulo.ts`). */
export const GUIA = laGuiaDe("ai-imagenes", GUIA_AI_IMAGENES);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
