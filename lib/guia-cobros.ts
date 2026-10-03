/**
 * La GUÍA PÚBLICA de Cobros (`/guia/cobros`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: salen de `lib/pantalla-de-cobros.ts`,
 * que es de donde las lee también `/cobros` (`CobrosClient.tsx`, el formulario
 * `FormularioDeCobro.tsx` y la configuración `ConfiguracionDeCobros.tsx`). El
 * banco comprueba que la pantalla las use: un filtro o una opción renombrada en
 * un solo sitio pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { ETIQUETA_DE_LA_SITUACION, UMBRAL_DE_POR_VENCER, VARIABLES_DEL_MENSAJE } from "@/lib/cobros";
import {
    CAMPOS_DE_LA_CONFIGURACION,
    CAMPOS_DEL_COBRO,
    COLUMNAS_DE_LA_CARTERA,
    FILTROS_DE_LA_CARTERA,
    OPCIONES_DE_UNA_DEUDA,
    TITULO_DEL_AVISO,
} from "@/lib/pantalla-de-cobros";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Cobros en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_COBROS = "Panel";

/** Las cuatro ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La cartera",
] as const;

/**
 * Las partes de la BARRA DE TRABAJO, en su orden, con el hueco de
 * `BarraDeAcciones` (`data-zona`) donde vive cada una en `CobrosClient.tsx`.
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Filtros por situación", zona: "filtros" },
    { nombre: "Actualizar", zona: "secundarias" },
    { nombre: "Configuración", zona: "secundarias" },
    { nombre: "Nuevo", zona: "crear" },
] as const;

/** Los filtros, en su orden: son los de la pantalla, no una copia. */
export const FILTROS_DOCUMENTADOS = FILTROS_DE_LA_CARTERA.map((f) => f.etiqueta);
/** Las columnas de la cartera, en su orden. */
export const COLUMNAS_DOCUMENTADAS = COLUMNAS_DE_LA_CARTERA.map((c) => c.nombre);
/** Los campos de «Nuevo cobro», en su orden. */
export const CAMPOS_DOCUMENTADOS = CAMPOS_DEL_COBRO.map((c) => c.nombre);
/** Los campos de la configuración, en su orden. */
export const CONFIGURACION_DOCUMENTADA = CAMPOS_DE_LA_CONFIGURACION.map((c) => c.nombre);
/** Los tres avisos, en su orden. */
export const AVISOS_DOCUMENTADOS = Object.values(TITULO_DEL_AVISO);
/** Las variables de un mensaje, como se escriben. */
export const VARIABLES_DOCUMENTADAS = VARIABLES_DEL_MENSAJE.map((v) => `{${v.clave}}`);

/** Las opciones del «⋯» de una deuda pendiente, en su orden (sin «No era»: esa sale con comprobante). */
export const OPCIONES_DOCUMENTADAS = [
    OPCIONES_DE_UNA_DEUDA.cobrar,
    OPCIONES_DE_UNA_DEUDA.comprobante,
    OPCIONES_DE_UNA_DEUDA.confirmar,
    OPCIONES_DE_UNA_DEUDA.historial,
    OPCIONES_DE_UNA_DEUDA.editar,
    OPCIONES_DE_UNA_DEUDA.eliminar,
] as const;

const enLinea = (lista: readonly string[]) => lista.map((x, i) => `${i + 1} ${x}`).join(" · ");

export const GUIA_COBROS: Contenido = {
    titulo: "Cobros",
    subtitulo: "Tu cartera de clientes, con recordatorios de pago por WhatsApp",
    descripcion:
        "Cobros reúne a quienes te deben un pago recurrente —una mensualidad, una suscripción, un servicio— y les " +
        "recuerda pagar por WhatsApp antes, el día y después del vencimiento. Ves de un vistazo quién está al día y " +
        "quién se atrasó, marcas el comprobante cuando llega y, al confirmar el pago, el vencimiento salta solo al " +
        "ciclo siguiente.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y tu cartera.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Cobros · 4 La cartera.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Cobros con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Cobros está dentro de Panel. Al entrar a una pantalla el " +
                        "menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Cobros dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: enLinea(PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => p.nombre)) + ".",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Una deuda",
                    texto: enLinea(COLUMNAS_DOCUMENTADAS) + " · 7 El menú de acciones.",
                    imagen: "fila.webp",
                    alt: "Una deuda de la cartera con cada columna numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Cobros por Panel.",
                "Los cobros salen por tu línea de WhatsApp. Si no tienes una conectada, la pantalla te avisa arriba.",
            ],
        },
        {
            slug: "cartera",
            titulo: "La cartera y sus filtros",
            resumen: "Quién está al día, quién está por vencer y quién se atrasó.",
            icono: "Filter",
            miniatura: "mini-cartera.webp",
            pasos: [
                {
                    titulo: "Lo urgente, arriba",
                    texto:
                        "La cartera va ordenada por lo que te pide algo: primero los comprobantes por revisar, luego " +
                        "las vencidas, las que vencen pronto y al final las que están al día.",
                    imagen: "cartera.webp",
                    alt: "La cartera con deudas en distintas situaciones",
                },
                {
                    titulo: "Los filtros",
                    texto: enLinea(FILTROS_DOCUMENTADOS) + ". Cada uno dice cuántas deudas tiene; pulsa uno para ver solo esas.",
                    imagen: "filtros.webp",
                    alt: "Los filtros por situación numerados",
                },
                {
                    titulo: "La situación de cada deuda",
                    texto:
                        `«${ETIQUETA_DE_LA_SITUACION.porVencer}» es la que vence en ${UMBRAL_DE_POR_VENCER} días o menos; ` +
                        `«${ETIQUETA_DE_LA_SITUACION.vencida}», la que ya pasó su fecha. La columna Vence dice cuánto falta o cuánto pasó.`,
                    imagen: "filtro-vencidas.webp",
                    alt: "El filtro Vencidas puesto con sus deudas",
                },
                {
                    titulo: "El buscador",
                    texto: "Busca por el nombre del cliente, su número o lo que le cobras.",
                    imagen: "buscar.webp",
                    alt: "Una búsqueda escrita y la cartera con lo que coincide",
                },
            ],
            consejos: [
                "Una deuda sin fecha de vencimiento sale en «Todos».",
                "Si pasa los días de gracia, la columna Vence lo dice: así sabes a quién toca llamar.",
            ],
        },
        {
            slug: "cobrar-ahora",
            titulo: "Cobrar ahora",
            resumen: "Mandar el recordatorio en el momento, sin esperar a su día.",
            icono: "Send",
            miniatura: "mini-cobrar-ahora.webp",
            pasos: [
                {
                    titulo: "El menú de la deuda",
                    texto: "Los tres puntos al final de cada fila abren todo lo que puedes hacer con esa deuda.",
                    imagen: "menu-de-la-deuda.webp",
                    alt: "El menú de acciones de una deuda abierto",
                },
                {
                    titulo: "«Cobrar ahora»",
                    texto:
                        "Manda al cliente, por WhatsApp, el mensaje que toca según su situación, con sus datos de pago " +
                        "y los archivos de la deuda.",
                    imagen: "cobrar-ahora.webp",
                    alt: "La opción Cobrar ahora resaltada en el menú",
                },
                {
                    titulo: "Si algo no sale",
                    texto:
                        "Si un archivo no se pudo mandar, la fila lo dice en ámbar debajo del concepto, para que lo " +
                        "reenvíes o lo cambies.",
                    imagen: "cobrar-aviso.webp",
                    alt: "Una deuda con el aviso de un archivo que no salió",
                },
            ],
            consejos: [
                "No hace falta usarlo a diario: los recordatorios salen solos en los días que configuraste.",
                "Si el cliente ya mandó el comprobante, no se le insiste.",
            ],
        },
        {
            slug: "comprobante",
            titulo: "Llegó el comprobante",
            resumen: "Apartar la deuda mientras revisas el pago.",
            icono: "Receipt",
            miniatura: "mini-comprobante.webp",
            pasos: [
                {
                    titulo: "Márcalo al recibirlo",
                    texto:
                        "Cuando el cliente te manda la foto del pago, abre su menú y pulsa «Llegó el comprobante».",
                    imagen: "comprobante-opcion.webp",
                    alt: "La opción Llegó el comprobante resaltada",
                },
                {
                    titulo: "Sube arriba de la cartera",
                    texto:
                        "La deuda pasa a «Comprobante recibido», va la primera y deja de recibir recordatorios mientras " +
                        "lo revisas.",
                    imagen: "comprobante-fila.webp",
                    alt: "Una deuda con el estado Comprobante recibido",
                },
                {
                    titulo: "Si no era",
                    texto:
                        "Si el pago no aparece, «No era: volver a pendiente» la devuelve como estaba y los " +
                        "recordatorios vuelven a salir.",
                    imagen: "comprobante-volver.webp",
                    alt: "La opción No era: volver a pendiente resaltada",
                },
            ],
            consejos: ["El filtro «Comprobantes» te deja ver de un golpe todo lo que tienes por revisar."],
        },
        {
            slug: "confirmar-pago",
            titulo: "Confirmar el pago",
            resumen: "Dar el ciclo por pagado y pasar al siguiente.",
            icono: "Wallet",
            miniatura: "mini-confirmar-pago.webp",
            pasos: [
                {
                    titulo: "«Confirmar pago»",
                    texto: "Cuando el dinero ya está en tu cuenta, abre el menú de la deuda y pulsa «Confirmar pago».",
                    imagen: "confirmar-opcion.webp",
                    alt: "La opción Confirmar pago resaltada",
                },
                {
                    titulo: "Revisa y confirma",
                    texto:
                        "La ventana te dice hasta qué fecha salta el vencimiento. «Sí, confirmar el pago» lo deja " +
                        "hecho; «Volver» no cambia nada.",
                    imagen: "confirmar-ventana.webp",
                    alt: "La ventana para confirmar el pago con la fecha siguiente",
                },
                {
                    titulo: "Queda al día",
                    texto:
                        "El vencimiento salta tantos días como su licencia, el ciclo suma uno y los recordatorios " +
                        "vuelven a empezar para el siguiente.",
                    imagen: "confirmar-hecho.webp",
                    alt: "La deuda al día con su nuevo vencimiento",
                },
            ],
            consejos: [
                "Si confirmas antes de que venza, no pierdes días: el siguiente vencimiento se cuenta desde la fecha que tenía.",
                "Si confirmas tarde, se cuenta desde hoy.",
            ],
        },
        {
            slug: "historial",
            titulo: "El historial de ciclos",
            resumen: "Cuántas veces te ha pagado cada cliente, y cuándo.",
            icono: "History",
            miniatura: "mini-historial.webp",
            pasos: [
                {
                    titulo: "La columna Ciclo",
                    texto: "Dice cuántos pagos le has confirmado a ese cliente.",
                    imagen: "historial-columna.webp",
                    alt: "La columna Ciclo de la cartera resaltada",
                },
                {
                    titulo: "«Historial de ciclos»",
                    texto: "En el menú de la deuda, abre la lista de todos sus pagos.",
                    imagen: "historial-opcion.webp",
                    alt: "La opción Historial de ciclos resaltada",
                },
                {
                    titulo: "Cada pago, con sus fechas",
                    texto:
                        "Cada ciclo dice el monto, cuándo lo confirmaste y de qué vencimiento a cuál saltó.",
                    imagen: "historial.webp",
                    alt: "La ventana Ciclos pagados con sus pagos",
                },
            ],
            consejos: ["Es la forma rápida de saber cuántos meses lleva un cliente pagando contigo."],
        },
        {
            slug: "crear",
            titulo: "Crear una deuda",
            resumen: "El cliente, lo que le cobras, cuándo vence y cómo te paga.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "El botón azul de la barra abre la ventana «Nuevo cobro».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Los datos del cobro",
                    texto: enLinea(CAMPOS_DOCUMENTADOS.slice(0, 8)) + ".",
                    imagen: "crear-ventana.webp",
                    alt: "La ventana Nuevo cobro con sus campos numerados",
                },
                {
                    titulo: "Sus archivos",
                    texto:
                        "En «Cuenta de cobro» adjuntas la factura o la cuenta: sube el archivo, arrástralo o pégalo. " +
                        "Sale con cada recordatorio.",
                    imagen: "crear-adjuntos.webp",
                    alt: "El bloque Cuenta de cobro con un archivo adjunto",
                },
                {
                    titulo: "Sus propios datos de pago",
                    texto:
                        "Si este cliente paga a otra cuenta o con otro enlace, escríbelo en «Datos de pago de este " +
                        "cobro». Va al final de cada mensaje.",
                    imagen: "crear-nota.webp",
                    alt: "El campo Datos de pago de este cobro escrito",
                },
            ],
            consejos: [
                "Días de licencia es cuánto dura un ciclo: 30 para una mensualidad.",
                "Días de gracia es cuánto esperas después del vencimiento antes de darla por atrasada.",
                "El número de WhatsApp va con su indicativo de país.",
            ],
        },
        {
            slug: "editar-y-eliminar",
            titulo: "Editar o eliminar una deuda",
            resumen: "Corregir sus datos, o quitarla cuando ya no aplica.",
            icono: "Trash2",
            miniatura: "mini-editar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "«Editar»",
                    texto:
                        "Abre la misma ventana con sus datos puestos: cambia el monto, la fecha o los datos de pago y " +
                        "pulsa «Guardar».",
                    imagen: "editar.webp",
                    alt: "La ventana Editar cobro con sus datos",
                },
                {
                    titulo: "«Eliminar»",
                    texto:
                        "Al final del menú. Pide confirmación porque se lleva la deuda con su historial; «Volver» no " +
                        "cambia nada.",
                    imagen: "eliminar.webp",
                    alt: "La ventana para eliminar un cobro",
                },
            ],
            consejos: [
                "Eliminar no se puede deshacer.",
                "Solo quien administra la cuenta ve la opción de eliminar.",
            ],
        },
        {
            slug: "recordatorios",
            titulo: "Cuándo se recuerda",
            resumen: "Los tres avisos: antes, el día y después del vencimiento.",
            icono: "CalendarClock",
            miniatura: "mini-recordatorios.webp",
            pasos: [
                {
                    titulo: "La configuración",
                    texto: "El botón del engranaje, en la barra, abre «Configuración de cobros».",
                    imagen: "configuracion-boton.webp",
                    alt: "El botón de configuración resaltado en la barra",
                },
                {
                    titulo: "Por dónde salen y cómo te pagan",
                    texto:
                        "Arriba dice por qué línea salen los cobros. En «Cómo te pagan» escribes tus cuentas o enlaces: " +
                        "valen para toda la cartera.",
                    imagen: "configuracion.webp",
                    alt: "La configuración con la línea y los datos de pago",
                },
                {
                    titulo: "Los tres avisos",
                    texto:
                        "1 Días antes · 2 El día que vence · 3 Días después. Deja un número en blanco y ese aviso no " +
                        "sale; el del día se enciende con su interruptor.",
                    imagen: "configuracion-cuando.webp",
                    alt: "Los tres avisos numerados",
                },
            ],
            consejos: [
                "Cada aviso sale una sola vez por ciclo: el cliente no recibe el mismo mensaje dos veces.",
                "Los recordatorios paran cuando marcas el comprobante, y vuelven en el ciclo siguiente.",
            ],
        },
        {
            slug: "mensajes",
            titulo: "Los mensajes",
            resumen: "Qué le dice cada recordatorio al cliente.",
            icono: "MessageSquare",
            miniatura: "mini-mensajes.webp",
            pasos: [
                {
                    titulo: "Un mensaje por aviso",
                    texto: enLinea(AVISOS_DOCUMENTADOS) + ". Escribe cada uno a tu manera.",
                    imagen: "mensajes.webp",
                    alt: "Los tres mensajes de la configuración",
                },
                {
                    titulo: "Las variables",
                    texto:
                        "Se cambian solas por los datos de cada cliente: " + VARIABLES_DOCUMENTADAS.join(" ") + ".",
                    imagen: "mensajes-variables.webp",
                    alt: "Las variables que se pueden usar en un mensaje",
                },
                {
                    titulo: "Pulsa «Guardar»",
                    texto: "Los cambios valen desde el siguiente recordatorio que salga.",
                    imagen: "mensajes-guardar.webp",
                    alt: "El botón Guardar de la configuración resaltado",
                },
            ],
            consejos: [
                "{pago} pone lo que escribiste en «Cómo te pagan»; los datos propios de una deuda van además al final.",
                "Un mensaje corto y amable se paga antes que uno largo.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("cobros", GUIA_COBROS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
