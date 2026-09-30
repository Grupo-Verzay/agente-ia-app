/**
 * El CONTENIDO de la guía pública de Catálogo (`/guia/catalogo`): la pantalla
 * `/mis-catalogo`, donde cada cuenta decide cómo se ve el catálogo público de
 * sus productos (`/catalogo/<cuenta>` y su enlace corto `/c/<nombre>`).
 *
 * Mismo estándar que la de Leads, y con las MISMAS piezas: la forma de una
 * sección, la barra de arriba y la carpeta salen de `lib/guia-de-modulo.ts`.
 * Las capturas y el vídeo los genera `scripts/capturar-guia-catalogo.mjs`
 * sobre la App servida de verdad, y el banco
 * (`lib/__tests__/guia-catalogo.test.mjs`) compara lo que esta guía dice con
 * lo que pinta `CatalogoPanel.tsx`: los cinco apartados, sus campos y en qué
 * orden van. El día que la pantalla gane un campo, el banco se pone en rojo y
 * dice cuál falta.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DEL_CATALOGO = "/mis-catalogo";

/** Dónde vive Catálogo en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_CATALOGO = "Panel";

/**
 * Las seis ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "Ver catálogo y tu enlace personalizado",
    "La configuración, en cinco apartados",
    "El pie, con Guardar",
] as const;

/**
 * Los cinco APARTADOS de la configuración, en su orden, con los campos de cada
 * uno tal como los rotula la pantalla, y la sección de la guía que lo explica.
 * El banco lo compara con `CatalogoPanel.tsx`: un apartado o un campo nuevo sin
 * su sitio aquí lo pone en rojo.
 */
export const APARTADOS_DOCUMENTADOS = [
    { apartado: "Datos básicos", campos: ["Número WhatsApp"], seccion: "whatsapp" },
    { apartado: "Identidad visual", campos: ["URL de imagen de portada / banner", "Color primario (hex)"], seccion: "identidad" },
    {
        apartado: "Textos del catálogo",
        campos: ["Título principal", "Descripción / slogan", "Texto del botón WhatsApp"],
        seccion: "textos",
    },
    { apartado: "Redes sociales", campos: ["Instagram", "Facebook", "TikTok"], seccion: "redes" },
    { apartado: "Opciones de visualización", campos: ["Mostrar stock", "Mostrar SKU"], seccion: "opciones" },
] as const;

export const GUIA_CATALOGO: Contenido = {
    titulo: "Catálogo",
    subtitulo: "Tus productos en una página para compartir con tus clientes",
    descripcion:
        "Catálogo es la página pública de tus productos: tu cliente la abre desde un enlace, busca, filtra por " +
        "categoría y te escribe por WhatsApp desde el producto que le interesa. Desde esta pantalla eliges tu enlace, " +
        "tu número, tu portada, tus colores, tus textos y tus redes, y decides qué datos se ven de cada producto.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas del Panel, tu enlace, la configuración y el pie.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 Las pestañas del Panel · " +
                        "4 Ver catálogo y tu enlace personalizado · 5 La configuración, en cinco apartados · 6 El pie, con Guardar.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Catálogo con sus seis partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Catálogo está dentro de Panel. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Catálogo dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "Las pestañas del Panel",
                    texto:
                        "Catálogo es una pestaña del Panel, junto a Embudos, Cobros, Proyectos y las demás: pasas de " +
                        "una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Catálogo señalada",
                },
                {
                    titulo: "Los cinco apartados",
                    texto:
                        "La configuración va en cinco apartados que se abren y se cierran pulsando su título. Al " +
                        "entrar solo está abierto Datos básicos.",
                    imagen: "apartados.webp",
                    alt: "Los cinco apartados de la configuración, numerados",
                },
                {
                    titulo: "Guardar los cambios",
                    texto:
                        "Guardar, abajo a la derecha, guarda los cinco apartados a la vez. A su izquierda está el " +
                        "enlace de tu catálogo público.",
                    imagen: "guardar.webp",
                    alt: "El pie de la pantalla con el enlace público y el botón Guardar",
                },
            ],
            consejos: [
                "Los productos del catálogo se cargan en Entrenamiento › Productos; aquí decides cómo se ven.",
                "El enlace personalizado tiene su propio botón Guardar: no hace falta pulsar el de abajo.",
                "Si sales sin pulsar Guardar, lo que cambiaste en los apartados no se guarda.",
            ],
        },
        {
            slug: "ver-catalogo",
            titulo: "Tu catálogo público",
            resumen: "Lo que ve tu cliente al abrir tu enlace: tus productos, un buscador y las categorías.",
            icono: "Store",
            miniatura: "mini-ver-catalogo.webp",
            pasos: [
                {
                    titulo: "Ver catálogo",
                    texto: "El botón Ver catálogo, arriba a la derecha, abre tu catálogo en otra pestaña tal como lo ve tu cliente.",
                    imagen: "ver-catalogo.webp",
                    alt: "El botón Ver catálogo señalado",
                },
                {
                    titulo: "Así lo ve tu cliente",
                    texto: "Arriba tu portada, tu logo y tus textos; debajo, cada producto activo en su tarjeta.",
                    imagen: "catalogo-publico.webp",
                    alt: "El catálogo público con la portada y las tarjetas de productos",
                },
                {
                    titulo: "Buscar y filtrar",
                    texto:
                        "Tu cliente busca por nombre y filtra por categoría con las pastillas de al lado del buscador. " +
                        "Todos las vuelve a mostrar.",
                    imagen: "catalogo-buscar.webp",
                    alt: "El buscador y las categorías del catálogo público",
                },
                {
                    titulo: "Cada producto",
                    texto:
                        "Cada tarjeta lleva foto, categoría, nombre, precio, el descuento si lo hay y el botón para " +
                        "escribirte por WhatsApp.",
                    imagen: "catalogo-producto.webp",
                    alt: "Una tarjeta de producto con sus partes señaladas",
                },
            ],
            consejos: [
                "Solo salen los productos activos. Si todavía no tienes ninguno, el catálogo enseña productos de ejemplo con un aviso de vista previa.",
                "Tu cliente no necesita cuenta ni contraseña para abrirlo.",
                "Un producto sin stock sale marcado «Sin stock» y su botón no deja escribir.",
            ],
        },
        {
            slug: "url-personalizada",
            titulo: "Tu enlace personalizado",
            resumen: "Un enlace corto, con el nombre de tu negocio, para compartir tu catálogo.",
            icono: "Link2",
            miniatura: "mini-url-personalizada.webp",
            pasos: [
                {
                    titulo: "Escribe el nombre",
                    texto:
                        "Escribe el nombre de tu negocio después de /c/. Los espacios pasan a guiones y las tildes se " +
                        "quitan solas.",
                    imagen: "url-escribir.webp",
                    alt: "El recuadro URL personalizada con un nombre escrito",
                },
                {
                    titulo: "Guárdalo",
                    texto:
                        "Pulsa el Guardar de este recuadro. Debajo aparece la URL activa, lista para copiar y compartir.",
                    imagen: "url-activa.webp",
                    alt: "La URL activa debajo del nombre guardado",
                },
                {
                    titulo: "Si ya está en uso",
                    texto:
                        "Cada nombre es único en toda la plataforma. Si otra cuenta ya lo usa, te lo dice y puedes " +
                        "probar con otro.",
                    imagen: "url-en-uso.webp",
                    alt: "El aviso de que el nombre ya está en uso",
                },
            ],
            consejos: [
                "El enlace largo de siempre sigue funcionando: los que ya compartiste no se rompen.",
                "Puedes cambiar el nombre cuando quieras; el nombre anterior deja de llevar a tu catálogo.",
            ],
        },
        {
            slug: "whatsapp",
            titulo: "El botón de WhatsApp",
            resumen: "El número al que te escriben tus clientes desde cada producto.",
            icono: "MessageCircle",
            miniatura: "mini-whatsapp.webp",
            pasos: [
                {
                    titulo: "Tu número",
                    texto:
                        "En Datos básicos escribe tu número de WhatsApp con el indicativo del país, por ejemplo 573001234567.",
                    imagen: "whatsapp-numero.webp",
                    alt: "El campo Número WhatsApp en Datos básicos",
                },
                {
                    titulo: "En cada producto",
                    texto:
                        "Cada tarjeta del catálogo lleva el botón verde. Al pulsarlo, tu cliente te escribe con el " +
                        "nombre del producto ya puesto.",
                    imagen: "whatsapp-boton.webp",
                    alt: "El botón de WhatsApp en una tarjeta del catálogo",
                },
                {
                    titulo: "Sin unidades, sin botón",
                    texto:
                        "Un producto con el stock en cero enseña «Sin stock disponible» en lugar del botón verde: " +
                        "nadie te escribe por lo que no tienes.",
                    imagen: "whatsapp-sin-stock.webp",
                    alt: "Una tarjeta sin stock, sin botón de WhatsApp",
                },
            ],
            consejos: [
                "Sin número, las tarjetas salen sin botón de WhatsApp.",
                "Lo que dice el botón se cambia en Textos del catálogo.",
            ],
        },
        {
            slug: "identidad",
            titulo: "Portada y color",
            resumen: "La imagen de portada y el color de los precios y los botones.",
            icono: "Palette",
            miniatura: "mini-identidad.webp",
            pasos: [
                {
                    titulo: "La imagen de portada",
                    texto:
                        "En Identidad visual pega la dirección de una imagen ancha (1200 × 300 px recomendado). Sale " +
                        "detrás de tu logo y tu título.",
                    imagen: "identidad-portada.webp",
                    alt: "El campo de la imagen de portada",
                },
                {
                    titulo: "El color principal",
                    texto:
                        "Elígelo con el cuadro de color o escribe su código. Se usa en los precios y en la categoría " +
                        "que se está viendo.",
                    imagen: "identidad-color.webp",
                    alt: "El selector del color principal",
                },
                {
                    titulo: "Así queda",
                    texto: "La portada, arriba del todo; el color, en cada precio y en la pastilla de la categoría elegida.",
                    imagen: "identidad-resultado.webp",
                    alt: "La portada y el color aplicados en el catálogo público",
                },
            ],
        },
        {
            slug: "textos",
            titulo: "Los textos del catálogo",
            resumen: "El título, la descripción y lo que dice el botón de WhatsApp.",
            icono: "Type",
            miniatura: "mini-textos.webp",
            pasos: [
                {
                    titulo: "El título y la descripción",
                    texto:
                        "En Textos del catálogo: 1 Título principal, el nombre grande de arriba · 2 Descripción o " +
                        "eslogan, la frase de debajo.",
                    imagen: "textos-titulo.webp",
                    alt: "Los campos Título principal y Descripción, numerados",
                },
                {
                    titulo: "El texto del botón",
                    texto:
                        "3 Texto del botón WhatsApp: lo que dice el botón verde de cada producto, por ejemplo «Pedir " +
                        "por WhatsApp».",
                    imagen: "textos-boton.webp",
                    alt: "El campo Texto del botón WhatsApp",
                },
                {
                    titulo: "Así queda",
                    texto:
                        "El título y la descripción van sobre la portada; el texto del botón, en el botón verde de cada " +
                        "producto.",
                    imagen: "textos-resultado.webp",
                    alt: "El título, la descripción y el botón en el catálogo público",
                },
            ],
            consejos: [
                "Sin título, el catálogo enseña el nombre de tu empresa.",
                "Sin texto del botón, dice «Consultar por WhatsApp».",
            ],
        },
        {
            slug: "redes",
            titulo: "Redes sociales",
            resumen: "Tus perfiles de Instagram, Facebook y TikTok, arriba del catálogo.",
            icono: "Share2",
            miniatura: "mini-redes.webp",
            pasos: [
                {
                    titulo: "Tus perfiles",
                    texto:
                        "En Redes sociales escribe tu usuario de Instagram, Facebook y TikTok, con o sin @. Deja vacío " +
                        "el que no uses.",
                    imagen: "redes.webp",
                    alt: "Los campos de Instagram, Facebook y TikTok",
                },
                {
                    titulo: "Así queda",
                    texto: "Cada red con usuario sale como un icono arriba a la derecha del catálogo y abre tu perfil.",
                    imagen: "redes-resultado.webp",
                    alt: "Los iconos de las redes arriba del catálogo público",
                },
                {
                    titulo: "La que dejas vacía no sale",
                    texto:
                        "Si borras una red —aquí TikTok— y guardas, su icono desaparece del catálogo; las demás " +
                        "siguen.",
                    imagen: "redes-vacia.webp",
                    alt: "Solo los iconos de Instagram y Facebook arriba del catálogo",
                },
            ],
        },
        {
            slug: "opciones",
            titulo: "Opciones de visualización",
            resumen: "Enseñar o esconder las unidades disponibles y el código de cada producto.",
            icono: "SlidersHorizontal",
            miniatura: "mini-opciones.webp",
            pasos: [
                {
                    titulo: "Stock y SKU",
                    texto:
                        "En Opciones de visualización: Mostrar stock enseña cuántas unidades quedan; Mostrar SKU, el " +
                        "código de referencia de cada producto.",
                    imagen: "opciones.webp",
                    alt: "Los interruptores Mostrar stock y Mostrar SKU",
                },
                {
                    titulo: "Así queda",
                    texto:
                        "Con los dos encendidos, cada tarjeta dice sus unidades y su SKU; con 10 o menos, avisa " +
                        "«¡Últimas!».",
                    imagen: "opciones-resultado.webp",
                    alt: "Las unidades y el SKU en una tarjeta del catálogo público",
                },
                {
                    titulo: "Con los dos apagados",
                    texto:
                        "Cada tarjeta enseña solo su precio y su botón: ni las unidades, ni el SKU, ni el aviso " +
                        "«¡Últimas!».",
                    imagen: "opciones-apagadas.webp",
                    alt: "Una tarjeta del catálogo sin unidades ni SKU",
                },
            ],
            consejos: ["Los interruptores no se guardan solos: pulsa Guardar abajo."],
        },
    ],
};

/** La guía armada: su carpeta, su vídeo y la navegación (`lib/guia-de-modulo.ts`). */
export const GUIA = laGuiaDe("catalogo", GUIA_CATALOGO);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
