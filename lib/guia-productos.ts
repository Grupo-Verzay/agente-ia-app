/**
 * El CONTENIDO de la guía pública de Productos (`/guia/productos`): la pantalla
 * `/products`, donde cada cuenta carga los productos que su agente ofrece y que
 * salen en su catálogo público.
 *
 * Mismo estándar que la de Leads, y con las MISMAS piezas: la forma de una
 * sección, la barra de arriba y la carpeta salen de `lib/guia-de-modulo.ts`.
 * Las capturas y el vídeo los genera `scripts/capturar-guia-productos.mjs`
 * sobre la App servida de verdad, y el banco
 * (`lib/__tests__/guia-productos.test.mjs`) compara las listas de abajo con lo
 * que pintan `MainProducts.tsx`, `ProductTable.tsx` y `ProductForm.tsx`: las
 * columnas, las cifras y los campos del formulario. Un campo nuevo en la
 * pantalla sin su sitio aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DE_PRODUCTOS = "/products";

/** Dónde vive Productos en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_PRODUCTOS = "Entrenamiento";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La tabla de productos",
] as const;

/** Los mandos de la BARRA DE TRABAJO, de izquierda a derecha. */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    "El buscador",
    "Las cifras",
    "Tu cupo del plan",
    "Ver catálogo",
    "Nuevo",
] as const;

/** Las cuatro cifras de la barra, con el nombre que enseñan al pasar el ratón. */
export const CIFRAS_DE_LA_BARRA = ["Total productos", "Activos", "Sin stock", "Cupos disponibles"] as const;

/** Las columnas de la tabla, en su orden (la primera, sin título, es el asa). */
export const COLUMNAS_DE_LA_TABLA = ["Nombre", "SKU", "Precio", "Stock", "Estado", "Categoría", "Imagen", "Acciones"] as const;

/** Los campos del formulario de un producto, en el orden en que se ven. */
export const CAMPOS_DEL_PRODUCTO = [
    "Activo",
    "Fotos",
    "Nombre",
    "Precio",
    "Precio antes",
    "Categoría",
    "Código",
    "Inventario",
    "Etiquetas",
    "Descripción",
] as const;

export const GUIA_PRODUCTOS: Contenido = {
    titulo: "Productos",
    subtitulo: "Lo que vendes, con su foto, su precio y sus unidades",
    descripcion:
        "Productos es la lista de lo que vendes. Cada producto lleva fotos, precio, categoría, código e inventario. " +
        "Tu agente IA los ofrece en las conversaciones y los activos salen en tu catálogo público, listos para que " +
        "tu cliente te escriba por WhatsApp.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la tabla de tus productos.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo · 4 La tabla de productos, uno por fila.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Productos con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Productos está dentro de Entrenamiento. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Productos dentro de Entrenamiento",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 El buscador · 2 Las cifras · 3 Tu cupo del plan · 4 Ver catálogo · 5 Nuevo, para crear un " +
                        "producto.",
                    imagen: "barra-de-trabajo.webp",
                    alt: "La barra de trabajo con sus cinco partes numeradas",
                },
                {
                    titulo: "La tabla de productos",
                    texto:
                        "Una fila por producto: nombre, SKU, precio, stock, estado, categoría, foto y, al final, sus " +
                        "acciones para editar y eliminar.",
                    imagen: "tabla.webp",
                    alt: "La tabla de productos con sus columnas",
                },
            ],
            consejos: [
                "El orden de la tabla es el orden del catálogo: arrastra una fila para cambiarlo.",
                "Cómo se ve tu catálogo —portada, colores, textos— se decide en Panel › Catálogo.",
            ],
        },
        {
            slug: "buscar",
            titulo: "Buscar un producto",
            resumen: "El buscador encuentra por nombre, por código o por categoría.",
            icono: "Search",
            miniatura: "mini-buscar.webp",
            pasos: [
                {
                    titulo: "Escribe lo que buscas",
                    texto:
                        "Escribe en el buscador de la izquierda. La tabla se filtra sola mientras escribes, sin pulsar " +
                        "nada.",
                    imagen: "buscar-escribir.webp",
                    alt: "El buscador con una palabra escrita",
                },
                {
                    titulo: "Por nombre, código o categoría",
                    texto:
                        "Busca en el nombre, en el código y en la categoría, sin importar mayúsculas: «origen» trae " +
                        "todos los cafés de esa categoría.",
                    imagen: "buscar-categoria.webp",
                    alt: "La tabla filtrada por una categoría",
                },
                {
                    titulo: "Volver a verlos todos",
                    texto: "Borra lo que escribiste y la tabla vuelve a enseñar todos tus productos.",
                    imagen: "buscar-todos.webp",
                    alt: "La tabla con todos los productos de nuevo",
                },
            ],
            consejos: ["Con una búsqueda puesta también puedes arrastrar: los productos escondidos no pierden su sitio."],
        },
        {
            slug: "cifras",
            titulo: "Las cifras de arriba",
            resumen: "Cuántos productos tienes, cuántos activos, cuántos agotados y cuántos te quedan.",
            icono: "BarChart3",
            miniatura: "mini-cifras.webp",
            pasos: [
                {
                    titulo: "Las cuatro cifras",
                    texto: "1 Total productos · 2 Activos · 3 Sin stock · 4 Cupos disponibles.",
                    imagen: "cifras.webp",
                    alt: "Las cuatro cifras de la barra de trabajo, numeradas",
                },
                {
                    titulo: "Su nombre, al pasar el ratón",
                    texto: "Cada cifra es un número con su icono. Pasa el ratón por encima y te dice qué cuenta.",
                    imagen: "cifras-nombre.webp",
                    alt: "El nombre de una cifra al pasar el ratón",
                },
                {
                    titulo: "Tu cupo del plan",
                    texto:
                        "Al lado, cuántos productos tienes de los que permite tu plan. Al llegar al tope se pone en " +
                        "rojo y Nuevo se apaga.",
                    imagen: "cupo.webp",
                    alt: "El contador de productos del plan",
                },
            ],
            consejos: [
                "Sin stock cuenta solo los productos con cero unidades; los que tienen inventario sin límite no se agotan.",
                "Las cifras se ven en pantallas anchas; en el teléfono quedan escondidas para dejar sitio a la tabla.",
            ],
        },
        {
            slug: "ver-catalogo",
            titulo: "Ver tu catálogo",
            resumen: "Un botón abre tu catálogo público, tal como lo ve tu cliente.",
            icono: "ExternalLink",
            miniatura: "mini-ver-catalogo.webp",
            pasos: [
                {
                    titulo: "El botón Ver catálogo",
                    texto: "El botón con la flecha, al lado de Nuevo, abre tu catálogo público en otra pestaña.",
                    imagen: "ver-catalogo.webp",
                    alt: "El botón Ver catálogo señalado",
                },
                {
                    titulo: "Así lo ve tu cliente",
                    texto:
                        "Cada producto activo en su tarjeta, con su foto, su precio y el botón para escribirte por " +
                        "WhatsApp.",
                    imagen: "catalogo-publico.webp",
                    alt: "El catálogo público con las tarjetas de productos",
                },
                {
                    titulo: "Solo lo activo",
                    texto:
                        "Un producto inactivo no sale en el catálogo. Sigue en tu tabla, con su estado en gris, por si " +
                        "lo vuelves a activar.",
                    imagen: "catalogo-inactivo.webp",
                    alt: "Un producto inactivo en la tabla",
                },
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un producto",
            resumen: "El botón Nuevo abre el formulario: nombre, precio y categoría bastan para empezar.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa Nuevo",
                    texto: "El botón azul de la derecha abre el formulario del producto.",
                    imagen: "crear-nuevo.webp",
                    alt: "El botón Nuevo señalado",
                },
                {
                    titulo: "El formulario",
                    texto:
                        "Arriba el interruptor Activo y las fotos; debajo el nombre, los precios, la categoría, el " +
                        "código, el inventario, las etiquetas y la descripción.",
                    imagen: "crear-formulario.webp",
                    alt: "El formulario de un producto nuevo",
                },
                {
                    titulo: "Guárdalo",
                    texto:
                        "Pulsa Guardar. El producto aparece en la tabla y, si está activo, en tu catálogo. Si falta " +
                        "algo, te dice qué campo revisar.",
                    imagen: "crear-guardado.webp",
                    alt: "El producto nuevo en la tabla",
                },
            ],
            consejos: [
                "Nombre, precio y categoría son obligatorios; lo demás puedes completarlo después.",
                "Un producto nuevo nace con inventario sin límite: no sale agotado hasta que tú controles sus unidades.",
            ],
        },
        {
            slug: "fotos",
            titulo: "Las fotos",
            resumen: "Hasta cuatro fotos por producto; la primera es la principal.",
            icono: "Upload",
            miniatura: "mini-fotos.webp",
            pasos: [
                {
                    titulo: "Agrega una foto",
                    texto: "Pulsa el recuadro Agregar y elige una imagen de tu equipo. Se sube sola.",
                    imagen: "fotos-agregar.webp",
                    alt: "El recuadro Agregar del formulario",
                },
                {
                    titulo: "Hasta cuatro",
                    texto:
                        "Debajo dice cuántas llevas. La primera lleva la marca Principal: es la que sale en la tabla y " +
                        "en el catálogo.",
                    imagen: "fotos-cuatro.webp",
                    alt: "Cuatro fotos, la primera marcada como Principal",
                },
                {
                    titulo: "Quita una foto",
                    texto: "Pasa el ratón sobre la foto y pulsa la X roja de su esquina.",
                    imagen: "fotos-quitar.webp",
                    alt: "La X para quitar una foto",
                },
            ],
            consejos: ["Fotos cuadradas y con buena luz se ven mejor en las tarjetas del catálogo."],
        },
        {
            slug: "precio",
            titulo: "Precio y descuento",
            resumen: "El precio de venta y, si quieres mostrar una rebaja, el precio de antes.",
            icono: "Percent",
            miniatura: "mini-precio.webp",
            pasos: [
                {
                    titulo: "El precio",
                    texto: "Escribe el precio de venta, solo el número. Se le ponen los puntos de miles solos.",
                    imagen: "precio.webp",
                    alt: "El campo Precio del formulario",
                },
                {
                    titulo: "El precio de antes",
                    texto:
                        "Si el producto está rebajado, escribe en Precio antes lo que costaba. Déjalo vacío si no hay " +
                        "descuento.",
                    imagen: "precio-antes.webp",
                    alt: "El campo Precio antes con un valor más alto",
                },
                {
                    titulo: "Así queda",
                    texto: "En el catálogo, el precio de antes sale tachado al lado del nuevo, con el porcentaje de descuento.",
                    imagen: "precio-catalogo.webp",
                    alt: "Una tarjeta del catálogo con el precio tachado y el descuento",
                },
            ],
        },
        {
            slug: "categoria-y-codigo",
            titulo: "Categoría, código y etiquetas",
            resumen: "Cómo agrupas tus productos, cómo los identificas y cómo los encuentras.",
            icono: "Tags",
            miniatura: "mini-categoria-y-codigo.webp",
            pasos: [
                {
                    titulo: "La categoría",
                    texto:
                        "Escribe la categoría, por ejemplo «Café de origen». Tus clientes filtran el catálogo con " +
                        "ella, así que escríbela igual en todos los de su grupo.",
                    imagen: "categoria.webp",
                    alt: "El campo Categoría del formulario",
                },
                {
                    titulo: "El código",
                    texto:
                        "El código (SKU) es tu referencia interna. Es único: si otro producto ya lo usa, el formulario " +
                        "te avisa y no deja guardar.",
                    imagen: "codigo.webp",
                    alt: "El aviso de código ya registrado",
                },
                {
                    titulo: "Las etiquetas",
                    texto:
                        "Escribe una palabra y pulsa Enter o el botón verde: «oferta», «nuevo». Hasta diez, y se quitan " +
                        "con su X.",
                    imagen: "etiquetas.webp",
                    alt: "Etiquetas agregadas a un producto",
                },
            ],
            consejos: ["El código es opcional, pero ayuda a encontrar un producto con el buscador."],
        },
        {
            slug: "inventario",
            titulo: "El inventario",
            resumen: "Sin límite, o contando las unidades que te quedan.",
            icono: "Layers",
            miniatura: "mini-inventario.webp",
            pasos: [
                {
                    titulo: "Sin límite",
                    texto:
                        "Con el interruptor apagado, el producto nunca se agota. Sirve para servicios o para lo que " +
                        "siempre tienes.",
                    imagen: "inventario-sin-limite.webp",
                    alt: "El inventario sin límite",
                },
                {
                    titulo: "Controlado",
                    texto: "Enciende el interruptor y escribe cuántas unidades tienes. La tabla lo enseña en la columna Stock.",
                    imagen: "inventario-controlado.webp",
                    alt: "El inventario controlado con un número de unidades",
                },
                {
                    titulo: "Agotado",
                    texto:
                        "Con cero unidades, el stock sale en rojo, suma en la cifra Sin stock y en el catálogo dice " +
                        "«Sin stock», sin botón de WhatsApp.",
                    imagen: "inventario-agotado.webp",
                    alt: "Un producto agotado, con el stock en rojo",
                },
            ],
        },
        {
            slug: "editar-y-eliminar",
            titulo: "Editar, ordenar y eliminar",
            resumen: "El lápiz cambia un producto, el asa lo mueve y la papelera lo borra.",
            icono: "ArrowUpDown",
            miniatura: "mini-editar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "Editar",
                    texto:
                        "El lápiz de la fila abre el mismo formulario con sus datos. Cambia lo que quieras y pulsa " +
                        "Guardar.",
                    imagen: "editar.webp",
                    alt: "El formulario de editar un producto",
                },
                {
                    titulo: "Ordenar",
                    texto:
                        "Arrastra una fila por el asa de la izquierda y suéltala donde quieras. El catálogo sigue el " +
                        "mismo orden.",
                    imagen: "ordenar.webp",
                    alt: "El asa de una fila para arrastrar",
                },
                {
                    titulo: "Eliminar",
                    texto:
                        "La papelera roja pide confirmación antes de borrar. Si solo quieres esconderlo del catálogo, " +
                        "mejor desactívalo.",
                    imagen: "eliminar.webp",
                    alt: "La confirmación de eliminar un producto",
                },
            ],
            consejos: ["Eliminar no se deshace: el producto se va de la tabla y del catálogo para siempre."],
        },
    ],
};

/** La guía armada: su carpeta, su vídeo y la navegación (`lib/guia-de-modulo.ts`). */
export const GUIA = laGuiaDe("productos", GUIA_PRODUCTOS);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
