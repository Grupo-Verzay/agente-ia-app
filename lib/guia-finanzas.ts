/**
 * El CONTENIDO de la guía pública de Finanzas (`/guia/finanzas`): el resumen
 * `/dashboard/finance` y sus seis pantallas —Ventas, Gastos, Clientes,
 * Proveedores, Cuentas y Configuración—.
 *
 * Mismo estándar que Leads, Catálogo, Diagramas, Reuniones y Mis notas, y con
 * las MISMAS piezas: la forma de una sección, la barra de arriba y la carpeta
 * salen de `lib/guia-de-modulo.ts`. Las capturas y el vídeo los genera
 * `scripts/capturar-guia-finanzas.mjs` sobre la App servida de verdad, y el
 * banco (`lib/__tests__/guia-finanzas.test.mjs`) compara lo que esta guía dice
 * con lo que pintan las pantallas: los accesos de arriba, las columnas de cada
 * tabla, los campos de cada formulario, los modos del filtro de fecha y las
 * opciones del `⋯`. El día que una pantalla gane algo, el banco se pone en
 * rojo y dice qué falta.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DE_FINANZAS = "/dashboard/finance";

/** Dónde vive Finanzas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_FINANZAS = "Panel";

/**
 * Las siete ZONAS de la pantalla de partida, en el orden en que se leen, tal
 * como las numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "Los accesos de Finanzas",
    "La barra: buscar, Nuevo y el ⋯",
    "El resumen del año, mes a mes",
    "La gráfica del mes, día a día",
] as const;

/**
 * Los ACCESOS de la fila de arriba, en su orden de partida. El banco los compara
 * con `ACCESOS_DE_FINANZAS` (`lib/accesos-de-finanzas.ts`): un acceso nuevo sin
 * su nombre aquí lo pone en rojo.
 */
export const ACCESOS_DOCUMENTADOS = [
    "Resumen",
    "Clientes",
    "Productos",
    "Proveedores",
    "Propuestas",
    "Ventas",
    "Gastos",
    "Compras",
    "Recibos de caja",
    "Notas",
    "Cuentas",
    "Configuración",
] as const;

/** Las columnas de Ventas, en su orden. Gastos lleva las mismas y «Tipo» después de «Categoría». */
export const COLUMNAS_DE_VENTAS = ["Concepto", "Categoría", "Total", "Fecha", "Cuenta", "Soportes"] as const;
export const COLUMNAS_DE_GASTOS = ["Concepto", "Categoría", "Tipo", "Total", "Fecha", "Cuenta", "Soportes"] as const;
export const COLUMNAS_DE_CUENTAS = ["Cuenta", "Ventas", "Gastos", "Saldo"] as const;

/** Los campos del formulario de una venta y de un gasto, tal como los rotula la pantalla. */
export const CAMPOS_DE_UNA_VENTA = [
    "Producto",
    "Contacto",
    "Monto (base)",
    "Extra",
    "Descuento",
    "Cuenta",
    "Categoría",
    "Descripción",
] as const;
export const CAMPOS_DE_UN_GASTO = ["Concepto", "Monto", "Cuenta", "Categoría", "Descripción"] as const;
/**
 * Los de una COMPRA: los de un gasto con el proveedor delante. Una compra es un
 * gasto con proveedor (`lib/compras-de-finanzas.ts`), elegido de la lista de
 * Proveedores, igual que una venta elige su contacto.
 */
export const CAMPOS_DE_UNA_COMPRA = ["Proveedor", ...CAMPOS_DE_UN_GASTO] as const;

/** Los campos de fábrica de la ficha de un cliente (el primero es «Proveedor» en un proveedor). */
export const CAMPOS_DE_UN_CONTACTO = [
    "Cliente",
    "Nombre y apellido",
    "Teléfono",
    "Email",
    "Departamento",
    "Ciudad",
    "Dirección de entrega",
    "Contacto de WhatsApp",
    "Notas",
] as const;

/** Los tres modos del botón de fecha de Ventas, Gastos y Cuentas. */
export const MODOS_DEL_PERIODO = ["Todo", "Mes", "Rango"] as const;

/** Las pestañas de los movimientos de una cuenta. */
export const MOVIMIENTOS_DE_UNA_CUENTA = ["Todos", "Ventas", "Gastos"] as const;

export const GUIA_FINANZAS: Contenido = {
    titulo: "Finanzas",
    subtitulo: "Tus ventas, tus gastos y tu balance, mes a mes",
    descripcion:
        "Finanzas es la contabilidad de tu negocio: anotas cada venta y cada gasto, con su cuenta, su categoría y su " +
        "soporte, y el resumen te dice cuánto entró, cuánto salió y cuánto te quedó cada mes. Desde aquí llevas también " +
        "tus clientes, tus proveedores, tus cuentas de dinero y la moneda en la que trabajas.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas del Panel, los accesos, la barra, el resumen y la gráfica.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 Las pestañas del Panel · " +
                        "4 Los accesos de Finanzas · 5 La barra: buscar, Nuevo y el ⋯ · 6 El resumen del año, mes a mes · " +
                        "7 La gráfica del mes, día a día.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Finanzas con sus siete partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Finanzas está dentro de Panel. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Finanzas dentro de Panel",
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
                        "Finanzas es una pestaña del Panel, junto a Catálogo, Cobros, Proyectos y las demás: pasas de " +
                        "una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Finanzas señalada",
                },
                {
                    titulo: "Los accesos de Finanzas",
                    texto:
                        "Debajo van los accesos: Resumen, cada pantalla de Finanzas y los atajos para crear. La " +
                        "pantalla en la que estás sale marcada; si no caben, las flechas de los lados enseñan el resto.",
                    imagen: "accesos.webp",
                    alt: "La fila de accesos de Finanzas con Resumen marcado",
                },
            ],
            consejos: [
                "Los accesos se reordenan arrastrándolos, y el orden se queda para la próxima vez.",
                "Compras y Recibos de caja son atajos: Compras abre una compra nueva, con el proveedor de tu lista de Proveedores, y Recibos de caja una venta nueva.",
            ],
        },
        {
            slug: "resumen",
            titulo: "El resumen del año",
            resumen: "Cuánto te quedó cada mes, la gráfica de ventas y gastos día a día y los atajos para anotar.",
            icono: "BarChart3",
            miniatura: "mini-resumen.webp",
            pasos: [
                {
                    titulo: "Mes a mes",
                    texto:
                        "Cada casilla es un mes con su balance: lo que vendiste menos lo que gastaste. Un mes en rojo " +
                        "gastó más de lo que vendió. Pulsa un mes para verlo abajo.",
                    imagen: "resumen-anual.webp",
                    alt: "El resumen anual con los doce meses y un mes en rojo",
                },
                {
                    titulo: "Cambiar de año",
                    texto: "Las flechas junto al año te llevan al año anterior o al siguiente, con el mismo mes elegido.",
                    imagen: "resumen-anos.webp",
                    alt: "Las flechas del año en el resumen anual",
                },
                {
                    titulo: "La gráfica del mes",
                    texto:
                        "Ventas y gastos del mes elegido, día a día. Pasa el ratón por un día para ver sus cifras.",
                    imagen: "resumen-grafica.webp",
                    alt: "La gráfica de ventas y gastos por día del mes",
                },
                {
                    titulo: "Anotar desde aquí",
                    texto:
                        "Nuevo abre Agregar venta o Agregar gasto sin salir del resumen, y el buscador te lleva a " +
                        "Ventas con lo que escribiste ya buscado.",
                    imagen: "resumen-nuevo.webp",
                    alt: "El botón Nuevo abierto con Agregar venta y Agregar gasto",
                },
            ],
            consejos: [
                "El total de una venta es su monto más el extra menos el descuento; el resumen suma ese total.",
                "Los importes salen en la moneda de Configuración.",
            ],
        },
        {
            slug: "ventas",
            titulo: "Ventas",
            resumen: "La lista de lo que vendiste, cómo anotar una venta y su detalle con los soportes.",
            icono: "TrendingUp",
            miniatura: "mini-ventas.webp",
            pasos: [
                {
                    titulo: "La lista de ventas",
                    texto:
                        "1 Las columnas: concepto, categoría, total, fecha, cuenta y soportes · 2 Cada venta en su " +
                        "fila: púlsala para ver su detalle.",
                    imagen: "ventas-lista.webp",
                    alt: "La lista de ventas con sus columnas",
                },
                {
                    titulo: "Nueva venta",
                    texto:
                        "Nuevo abre el formulario: el producto, el contacto de tus chats, el monto, la cuenta donde " +
                        "entra el dinero y la categoría. A la derecha ves cómo queda.",
                    imagen: "ventas-nueva.webp",
                    alt: "El formulario de una venta nueva",
                },
                {
                    titulo: "Extra y descuento",
                    texto:
                        "1 Monto (base) · 2 Extra, lo que se suma, como un envío · 3 Descuento, lo que se resta · " +
                        "4 El total: base más extra menos descuento.",
                    imagen: "ventas-importes.webp",
                    alt: "Los campos Monto, Extra y Descuento numerados",
                },
                {
                    titulo: "El detalle y los soportes",
                    texto:
                        "El detalle enseña el total, el contacto, la descripción y los soportes: la factura o el " +
                        "comprobante que adjuntaste. Desde aquí se edita o se elimina.",
                    imagen: "ventas-detalle.webp",
                    alt: "El detalle de una venta con su soporte adjunto",
                },
            ],
            consejos: [
                "La cuenta marcada como predeterminada se elige sola en cada venta nueva.",
                "Recibos de caja, en los accesos de arriba, abre Ventas con el formulario ya abierto.",
            ],
        },
        {
            slug: "gastos",
            titulo: "Gastos",
            resumen: "Lo que pagaste, si es fijo o variable, y cómo anotar un gasto.",
            icono: "Receipt",
            miniatura: "mini-gastos.webp",
            pasos: [
                {
                    titulo: "La lista de gastos",
                    texto:
                        "Las mismas columnas que Ventas y una más: Tipo, que dice si el gasto es fijo o variable según " +
                        "su categoría.",
                    imagen: "gastos-lista.webp",
                    alt: "La lista de gastos con la columna Tipo",
                },
                {
                    titulo: "Fijo o variable",
                    texto:
                        "1 Fijo: nómina, salarios, arriendo, alquiler, renta, servicios públicos, internet, seguros, " +
                        "servidores, API y herramientas, lo que pagas cada mes · 2 Variable: todo lo demás.",
                    imagen: "gastos-tipo.webp",
                    alt: "La columna Tipo con gastos fijos y variables",
                },
                {
                    titulo: "Nuevo gasto",
                    texto:
                        "Nuevo abre el formulario: 1 Concepto · 2 Monto · 3 La cuenta de donde sale el dinero · " +
                        "4 La categoría · 5 Una descripción, si hace falta.",
                    imagen: "gastos-nuevo.webp",
                    alt: "El formulario de un gasto nuevo",
                },
                {
                    titulo: "El detalle",
                    texto: "Pulsa un gasto para ver su detalle, con sus soportes, y editarlo o eliminarlo desde ahí.",
                    imagen: "gastos-detalle.webp",
                    alt: "El detalle de un gasto",
                },
            ],
            consejos: [
                "Compras, en los accesos de arriba, abre una compra nueva: un gasto con su proveedor, elegido de tu lista de Proveedores o creado ahí mismo.",
                "Una compra se guarda en Gastos como cualquier otro gasto, con el proveedor debajo del concepto.",
            ],
        },
        {
            slug: "periodo",
            titulo: "Filtrar por fecha",
            resumen: "Ver todo, un mes o un rango de días, en Ventas, Gastos y Cuentas.",
            icono: "CalendarRange",
            miniatura: "mini-periodo.webp",
            pasos: [
                {
                    titulo: "El botón de fecha",
                    texto:
                        "Al lado del buscador. Dice lo que estás viendo: Todas, un mes o un rango. Es el mismo en " +
                        "Ventas, Gastos y Cuentas.",
                    imagen: "periodo-boton.webp",
                    alt: "El botón de fecha en la barra de Ventas",
                },
                {
                    titulo: "Un mes",
                    texto: "1 Elige Mes · 2 y el mes que quieres ver: la lista enseña solo lo de ese mes.",
                    imagen: "periodo-mes.webp",
                    alt: "El filtro de fecha en modo Mes",
                },
                {
                    titulo: "Un rango",
                    texto: "Elige Rango y pon 1 desde y 2 hasta: la lista enseña lo de esos días. 3 Todo quita el filtro.",
                    imagen: "periodo-rango.webp",
                    alt: "El filtro de fecha en modo Rango con las dos fechas",
                },
            ],
            consejos: ["En Cuentas, el periodo cambia los saldos: ves cuánto entró y salió de cada cuenta en esas fechas."],
        },
        {
            slug: "clientes",
            titulo: "Clientes",
            resumen: "Tus clientes con su ficha, y los campos que quieras añadirle.",
            icono: "Users",
            miniatura: "mini-clientes.webp",
            pasos: [
                {
                    titulo: "La lista de clientes",
                    texto:
                        "1 Las columnas: código, nombre, teléfono, correo, ciudad y los demás datos de la ficha · " +
                        "2 Cada cliente en su fila: púlsalo para abrir su ficha.",
                    imagen: "clientes-lista.webp",
                    alt: "La lista de clientes",
                },
                {
                    titulo: "Nuevo cliente",
                    texto:
                        "Nuevo abre su ficha. 1 El código: vacío, se pone solo (C-1, C-2…) · 2 El nombre, lo único " +
                        "obligatorio · 3 Su chat de WhatsApp, para vincularlo.",
                    imagen: "clientes-nuevo.webp",
                    alt: "La ficha de un cliente nuevo",
                },
                {
                    titulo: "Tus propios campos",
                    texto:
                        "Campos abre la configuración de la ficha: añade los datos que necesites —un número, una fecha, " +
                        "una lista de opciones—, ordénalos y decide cuáles son obligatorios y cuáles se ven.",
                    imagen: "clientes-campos.webp",
                    alt: "La ventana Configurar campos",
                },
            ],
        },
        {
            slug: "proveedores",
            titulo: "Proveedores",
            resumen: "A quién le compras, con la misma ficha que un cliente y sus propios campos.",
            icono: "Truck",
            miniatura: "mini-proveedores.webp",
            pasos: [
                {
                    titulo: "La lista de proveedores",
                    texto:
                        "La misma forma que Clientes. 1 Las columnas de la ficha · 2 Cada proveedor en su fila: " +
                        "púlsalo para abrir su ficha.",
                    imagen: "proveedores-lista.webp",
                    alt: "La lista de proveedores",
                },
                {
                    titulo: "Nuevo proveedor",
                    texto: "Nuevo abre su ficha. 1 El código: vacío, se pone solo (P-1, P-2…) · 2 El nombre, lo único obligatorio.",
                    imagen: "proveedores-nuevo.webp",
                    alt: "La ficha de un proveedor nuevo",
                },
                {
                    titulo: "Sus propios campos",
                    texto:
                        "Los campos de Proveedores van aparte de los de Clientes: lo que añadas aquí no cambia la ficha " +
                        "de un cliente.",
                    imagen: "proveedores-campos.webp",
                    alt: "La ventana Configurar campos de proveedores",
                },
            ],
        },
        {
            slug: "cuentas",
            titulo: "Cuentas",
            resumen: "Dónde está tu dinero: el saldo de cada cuenta, sus movimientos y la predeterminada.",
            icono: "Wallet",
            miniatura: "mini-cuentas.webp",
            pasos: [
                {
                    titulo: "El saldo de cada cuenta",
                    texto:
                        "Cada cuenta —la caja, el banco, una billetera— con lo que entró en ventas, lo que salió en " +
                        "gastos y su saldo.",
                    imagen: "cuentas-lista.webp",
                    alt: "La lista de cuentas con sus ventas, gastos y saldo",
                },
                {
                    titulo: "Los movimientos de una cuenta",
                    texto: "Pulsa una cuenta para ver sus movimientos, con las pestañas Todos, Ventas y Gastos.",
                    imagen: "cuentas-movimientos.webp",
                    alt: "Los movimientos de una cuenta",
                },
                {
                    titulo: "Nueva cuenta",
                    texto:
                        "Nuevo abre el formulario: nombre, tipo, la moneda de la cuenta y si es la predeterminada.",
                    imagen: "cuentas-nueva.webp",
                    alt: "El formulario de una cuenta nueva",
                },
                {
                    titulo: "La predeterminada",
                    texto:
                        "La estrella de cada fila la marca como predeterminada: se elige sola en cada venta y cada " +
                        "gasto nuevo.",
                    imagen: "cuentas-predeterminada.webp",
                    alt: "El botón para marcar una cuenta como predeterminada",
                },
            ],
            consejos: ["Una cuenta con ventas o gastos no se puede eliminar: primero se mueven o se borran sus movimientos."],
        },
        {
            slug: "configuracion",
            titulo: "Configuración",
            resumen: "La moneda en la que salen tus importes.",
            icono: "Settings",
            miniatura: "mini-configuracion.webp",
            pasos: [
                {
                    titulo: "Tu moneda",
                    texto: "En Configuración eliges la moneda preferida: la del resumen, la gráfica y las listas.",
                    imagen: "configuracion.webp",
                    alt: "La configuración de Finanzas con la moneda preferida",
                },
                {
                    titulo: "Guárdala",
                    texto: "Elige la moneda en la lista y pulsa Guardar, que se enciende en cuanto la cambias.",
                    imagen: "configuracion-lista.webp",
                    alt: "Otra moneda elegida y el botón Guardar encendido",
                },
                {
                    titulo: "Cada cuenta, su moneda",
                    texto:
                        "Cada cuenta de dinero lleva además su propia moneda, en su formulario: es con la que nacen sus " +
                        "ventas y sus gastos.",
                    imagen: "configuracion-cuenta.webp",
                    alt: "La moneda de una cuenta en su formulario",
                },
            ],
        },
        {
            slug: "acciones",
            titulo: "Marcar, editar y eliminar",
            resumen: "Los botones de cada fila, marcar varias, las columnas y vaciar la contabilidad.",
            icono: "MoreHorizontal",
            miniatura: "mini-acciones.webp",
            pasos: [
                {
                    titulo: "Los botones de cada fila",
                    texto: "Al final de cada fila: Editar y Eliminar. Eliminar siempre pide confirmación.",
                    imagen: "acciones-fila.webp",
                    alt: "Los botones Editar y Eliminar de una fila",
                },
                {
                    titulo: "Marcar varias",
                    texto:
                        "La casilla de cada fila la marca, y la de arriba marca todo lo que se ve. El ⋯ de la barra " +
                        "elimina las marcadas de una vez.",
                    imagen: "acciones-marcar.webp",
                    alt: "Varias ventas marcadas y el menú ⋯ abierto",
                },
                {
                    titulo: "Columnas",
                    texto: "Columnas enseña o esconde cada columna de la tabla.",
                    imagen: "acciones-columnas.webp",
                    alt: "El menú Columnas abierto",
                },
                {
                    titulo: "Vaciar la contabilidad",
                    texto:
                        "En el ⋯ del resumen, Vaciar contabilidad borra todas las ventas y los gastos de tu cuenta: " +
                        "1 escribe VACIAR y 2 confirma con el botón rojo.",
                    imagen: "vaciar.webp",
                    alt: "La ventana para vaciar la contabilidad",
                },
            ],
            consejos: [
                "Vaciar la contabilidad no se deshace, y solo toca tu cuenta.",
                "Eliminar todas las ventas, en el ⋯ de Ventas, borra todas, no solo las que se ven.",
            ],
        },
    ],
};

/** La guía armada: su carpeta, su vídeo y la navegación (`lib/guia-de-modulo.ts`). */
export const GUIA = laGuiaDe("finanzas", GUIA_FINANZAS);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
