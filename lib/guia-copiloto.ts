/**
 * La GUÍA PÚBLICA de Copiloto (`/guia/copiloto`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que las guías de Leads, Catálogo, Diagramas, Reuniones y
 * Mis notas (armada con `laGuiaDe`) y se pinta con las MISMAS piezas
 * (`components/guia/Guia.tsx`).
 *
 * Copiloto tiene dos dueños y la guía los separa:
 *
 *   - Lo de la PLATAFORMA —el menú, la barra de arriba y los dos botones
 *     «Fijar en Chats» y «Pantalla completa»— sale de `lib/copiloto.ts`, que
 *     es lo que pinta `MainCopiloto.tsx`. El banco compara la guía con eso.
 *   - Lo de DENTRO es el copiloto (LibreChat v0.8.7, el que corre en
 *     `copiloto.ia-app.com`). Sus rótulos no son nuestros: las listas de abajo
 *     (`BOTONES_DE_LA_RESPUESTA`, `MENU_DE_LA_CONVERSACION`…) llevan la
 *     `etiqueta` exacta que enseña el copiloto, y el script de capturas guarda
 *     lo que vio en `scripts/copiloto-guia-librechat.json`. El banco exige que
 *     cada etiqueta que la guía nombra estuviera en pantalla: si el copiloto
 *     se actualiza y un botón cambia de nombre, la guía se pone en rojo.
 *
 * Algunos rótulos del copiloto salen en inglés («Love this», «Upload to
 * Provider»): así los pinta LibreChat en español. La guía los nombra por lo
 * que HACEN y deja el rótulo tal cual en la etiqueta, que es lo que se busca
 * en la pantalla.
 */

import { BOTONES_DE_LA_PLATAFORMA } from "@/lib/copiloto";
import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";
export { BOTONES_DE_LA_PLATAFORMA };

/** Dónde vive Copiloto en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_COPILOTO = "Herramientas";

/**
 * Las seis ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "El panel del copiloto",
    "La conversación",
    "La caja de escribir",
    "Fijar en Chats y pantalla completa",
] as const;

/** Un mando del copiloto: cómo lo llama la guía y el rótulo exacto que enseña el copiloto. */
export type MandoDelCopiloto = { readonly nombre: string; readonly etiqueta: string };

/** Lo que se numera del PANEL del copiloto (la columna de iconos y la lista). */
export const PANEL_DEL_COPILOTO: readonly MandoDelCopiloto[] = [
    { nombre: "Recoger el panel", etiqueta: "Cerrar barra lateral" },
    { nombre: "Nuevo chat", etiqueta: "Nuevo chat" },
    { nombre: "Tus conversaciones", etiqueta: "Historial de Chat" },
    { nombre: "Tu cuenta del copiloto", etiqueta: "Configuración de la cuenta" },
];

/** Los botones de la CAJA DE ESCRIBIR, de izquierda a derecha. */
export const BOTONES_DE_LA_CAJA: readonly MandoDelCopiloto[] = [
    { nombre: "Adjuntar un archivo", etiqueta: "Attach File Options" },
    { nombre: "Herramientas", etiqueta: "Tools Options" },
    { nombre: "Dictar", etiqueta: "Usar micrófono" },
    { nombre: "Enviar", etiqueta: "Enviar mensaje" },
];

/** Los botones de debajo de una RESPUESTA, en su orden. */
export const BOTONES_DE_LA_RESPUESTA: readonly MandoDelCopiloto[] = [
    { nombre: "Leer en voz alta", etiqueta: "Leer en voz alta" },
    { nombre: "Copiar", etiqueta: "Copiar al portapapeles" },
    { nombre: "Editar", etiqueta: "Editar" },
    { nombre: "Bifurcar", etiqueta: "Open Fork Menu" },
    { nombre: "Me gusta", etiqueta: "Love this" },
    { nombre: "No me gusta", etiqueta: "Needs improvement" },
    { nombre: "Regenerar", etiqueta: "Regenerar" },
];

/** El «⋯» de una conversación de la lista, en su orden. */
export const MENU_DE_LA_CONVERSACION = ["Compartir", "Anclar", "Renombrar", "Duplicar", "Change project", "Archivar", "Eliminar"] as const;

/** Los proveedores del selector de modelo (la configuración de producción). */
export const PROVEEDORES_DEL_SELECTOR = ["OpenAI", "My Agents", "DeepSeek"] as const;

/** Las dos formas de adjuntar del clip. */
export const OPCIONES_DEL_CLIP: readonly MandoDelCopiloto[] = [
    { nombre: "Subir el archivo tal cual", etiqueta: "Upload to Provider" },
    { nombre: "Subir como texto", etiqueta: "Subir como texto" },
];

/** El menú de la cuenta del copiloto (el círculo con tus iniciales, abajo a la izquierda). */
export const MENU_DE_LA_CUENTA = ["Help", "Mis archivos", "Conversaciones archivadas", "Configuración", "Cerrar sesión"] as const;

/** Las pestañas de la configuración del copiloto. */
export const PESTANAS_DE_CONFIGURACION = ["General", "Chat", "Voz y habla", "Data & Privacy", "Cuenta", "About"] as const;

/** Numera una lista de mandos por su nombre: «1 Uno · 2 Dos». */
const numerados = (lista: readonly { nombre: string }[]) => lista.map((m, i) => `${i + 1} ${m.nombre}`).join(" · ");
/** Una lista de rótulos entre comillas: «Uno», «Dos». */
const entreComillas = (lista: readonly string[]) => lista.map((t) => `«${t}»`).join(", ");

const { fijar, quitar } = BOTONES_DE_LA_PLATAFORMA;

export const GUIA_COPILOTO: Contenido = {
    titulo: "Copiloto",
    subtitulo: "Tu asistente de inteligencia artificial, dentro de la plataforma",
    descripcion:
        "Copiloto es un asistente de inteligencia artificial para tu negocio: le pides un mensaje para un cliente, " +
        "ideas para una promoción o el resumen de un reclamo, y te contesta en segundos. Guarda cada conversación, " +
        "te deja elegir qué inteligencia artificial responde, y lo puedes fijar como pestaña en tus Chats para " +
        "usarlo sin salir de la conversación con el cliente.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, el panel del copiloto, la conversación, la caja de escribir y los dos botones de la plataforma.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 El panel del copiloto · 4 La conversación · 5 La caja de escribir · 6 Fijar en Chats y pantalla completa.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Copiloto con sus seis partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Copiloto está dentro de Herramientas. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Copiloto dentro de Herramientas",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "El panel del copiloto",
                    texto: `${numerados(PANEL_DEL_COPILOTO)}.`,
                    imagen: "panel.webp",
                    alt: "El panel de la izquierda del copiloto con cada parte numerada",
                },
                {
                    titulo: "La caja de escribir",
                    texto: `${numerados(BOTONES_DE_LA_CAJA)}.`,
                    imagen: "caja.webp",
                    alt: "La caja de escribir con sus cuatro botones numerados",
                },
            ],
            consejos: [
                "El copiloto no lee tus chats de WhatsApp ni tus datos de la plataforma: lo que necesite saber, se lo cuentas o se lo pegas.",
            ],
        },
        {
            slug: "primera-vez",
            titulo: "Entrar por primera vez",
            resumen: "El copiloto tiene su propia cuenta: la primera vez te pide entrar, o crearla si todavía no la tienes.",
            icono: "LogIn",
            miniatura: "mini-primera-vez.webp",
            pasos: [
                {
                    titulo: "Te pide entrar",
                    texto:
                        "La primera vez sale su pantalla de entrada. Escribe el correo y la contraseña de tu cuenta del " +
                        "copiloto y pulsa «Continuar».",
                    imagen: "entrar.webp",
                    alt: "La pantalla de entrada del copiloto dentro de la plataforma",
                },
                {
                    titulo: "Si todavía no tienes cuenta",
                    texto:
                        "Pulsa «Regístrese» y llena tu nombre, tu correo y la contraseña dos veces. Con «Continuar» ya estás dentro.",
                    imagen: "registro.webp",
                    alt: "El formulario para crear la cuenta del copiloto",
                },
                {
                    titulo: "Ya estás dentro",
                    texto:
                        "Te saluda por tu nombre y la caja de escribir te espera abajo. Mientras no cierres sesión, este " +
                        "navegador entra directo.",
                    imagen: "bienvenida.webp",
                    alt: "El copiloto recién abierto, con el saludo y la caja de escribir",
                },
            ],
            consejos: [
                "La cuenta del copiloto es aparte de la de la plataforma: puede llevar otra contraseña.",
                "Tus conversaciones son tuyas: el resto de tu equipo no las ve, salvo que compartas una.",
            ],
        },
        {
            slug: "preguntar",
            titulo: "Hacer una pregunta",
            resumen: "Escribes lo que necesitas, pulsas Enter y la respuesta llega escribiéndose. Después sigues la conversación.",
            icono: "MessageCircle",
            miniatura: "mini-preguntar.webp",
            pasos: [
                {
                    titulo: "Escribe lo que necesitas",
                    texto:
                        "En la caja de abajo. Con Enter se envía; con Mayús y Enter pasas a la línea siguiente sin enviar.",
                    imagen: "escribir.webp",
                    alt: "Una pregunta escrita en la caja del copiloto",
                },
                {
                    titulo: "La respuesta llega escribiéndose",
                    texto: "Arriba queda tu pregunta y debajo la respuesta, con sus negritas y sus listas.",
                    imagen: "respuesta.webp",
                    alt: "La respuesta del copiloto debajo de la pregunta",
                },
                {
                    titulo: "Sigue la conversación",
                    texto:
                        "El copiloto recuerda lo que se dijo en esa conversación: puedes pedirle «más corto» o «más formal» " +
                        "sin repetir la pregunta.",
                    imagen: "seguir.webp",
                    alt: "Una segunda pregunta en la misma conversación, con su respuesta",
                },
            ],
            consejos: [
                "Dale contexto: para quién es, qué tono quieres y qué tan largo lo necesitas.",
                "Revisa siempre lo que te conteste antes de mandárselo a un cliente.",
            ],
        },
        {
            slug: "respuestas",
            titulo: "Qué hacer con una respuesta",
            resumen: "Debajo de cada respuesta: escucharla, copiarla, editar tu pregunta, calificarla o pedir otra versión.",
            icono: "MessageSquare",
            miniatura: "mini-respuestas.webp",
            pasos: [
                {
                    titulo: "Los botones de la respuesta",
                    texto: `${numerados(BOTONES_DE_LA_RESPUESTA)}.`,
                    imagen: "botones-de-la-respuesta.webp",
                    alt: "Los botones de debajo de una respuesta, numerados",
                },
                {
                    titulo: "Cópiala para usarla",
                    texto:
                        "«Copiar» la deja lista para pegarla en un chat de WhatsApp, en una nota o en una campaña.",
                    imagen: "copiar.webp",
                    alt: "El botón Copiar de una respuesta resaltado",
                },
                {
                    titulo: "Pide otra versión",
                    texto:
                        "«Regenerar» escribe la respuesta de nuevo. Con «Editar» sobre tu pregunta la cambias y el copiloto " +
                        "vuelve a contestar.",
                    imagen: "regenerar.webp",
                    alt: "El botón Regenerar de una respuesta resaltado",
                },
            ],
        },
        {
            slug: "conversaciones",
            titulo: "Tus conversaciones",
            resumen: "Cada conversación queda guardada con su título. Empiezas otra con Nuevo chat y la ordenas desde su «⋯».",
            icono: "History",
            miniatura: "mini-conversaciones.webp",
            pasos: [
                {
                    titulo: "La lista, por fecha",
                    texto:
                        "A la izquierda, tus conversaciones de la más nueva a la más vieja. El título lo pone el copiloto " +
                        "solo, a partir de lo que preguntaste.",
                    imagen: "lista.webp",
                    alt: "La lista de conversaciones del copiloto, con sus títulos",
                },
                {
                    titulo: "Empieza una nueva",
                    texto:
                        "«Nuevo chat» abre una conversación en blanco. Úsala para cada tema: así el copiloto no mezcla lo " +
                        "de una con lo de otra.",
                    imagen: "nuevo-chat.webp",
                    alt: "El botón Nuevo chat resaltado",
                },
                {
                    titulo: "El «⋯» de una conversación",
                    texto: `Sale al pasar por encima: ${entreComillas([...MENU_DE_LA_CONVERSACION])}.`,
                    imagen: "menu-de-la-conversacion.webp",
                    alt: "El menú de opciones de una conversación abierto",
                },
            ],
            consejos: [
                "Archivar la quita de la lista sin borrarla: la recuperas en tu cuenta, en «Conversaciones archivadas».",
                "«Anclar» la deja arriba de la lista.",
            ],
        },
        {
            slug: "modelos",
            titulo: "Elegir la inteligencia artificial",
            resumen: "Arriba a la izquierda eliges qué inteligencia artificial contesta en esa conversación.",
            icono: "Bot",
            miniatura: "mini-modelos.webp",
            pasos: [
                {
                    titulo: "El selector",
                    texto: "Arriba a la izquierda dice qué inteligencia artificial te está contestando. Púlsalo para cambiarla.",
                    imagen: "selector.webp",
                    alt: "El selector de modelo del copiloto resaltado",
                },
                {
                    titulo: "Los proveedores",
                    texto: `El menú los agrupa por proveedor: ${entreComillas([...PROVEEDORES_DEL_SELECTOR])}. Arriba tiene un buscador.`,
                    imagen: "proveedores.webp",
                    alt: "El menú del selector con los proveedores",
                },
                {
                    titulo: "Los modelos de cada uno",
                    texto:
                        "Al pasar por un proveedor salen sus modelos. El que elijas se queda en esa conversación.",
                    imagen: "modelos.webp",
                    alt: "Los modelos de un proveedor en el selector",
                },
            ],
            consejos: ["Si una respuesta no te convence, prueba la misma pregunta con otro modelo."],
        },
        {
            slug: "archivos",
            titulo: "Adjuntar y dictar",
            resumen: "Con el clip le pasas un archivo para que lo lea, y con el micrófono le dictas en vez de escribir.",
            icono: "Paperclip",
            miniatura: "mini-archivos.webp",
            pasos: [
                {
                    titulo: "El clip",
                    texto: `Dos formas de adjuntar: ${OPCIONES_DEL_CLIP.map((o) => `«${o.etiqueta}»`).join(", que sube el archivo tal cual, y ")}, que le pasa solo su texto.`,
                    imagen: "clip.webp",
                    alt: "El menú del clip abierto con sus dos opciones",
                },
                {
                    titulo: "El archivo, junto a tu pregunta",
                    texto:
                        "Sale encima de la caja. Escribe qué quieres que haga con él —resumirlo, sacar los datos, responderlo— y envía.",
                    imagen: "adjunto.webp",
                    alt: "Un archivo adjunto en la caja de escribir del copiloto",
                },
                {
                    titulo: "Dictar en vez de escribir",
                    texto:
                        "El micrófono de la derecha escribe lo que dices. La primera vez el navegador te pide permiso para usarlo.",
                    imagen: "dictar.webp",
                    alt: "El botón del micrófono de la caja resaltado",
                },
            ],
        },
        {
            slug: "fijar-en-chats",
            titulo: "Fijar en Chats y pantalla completa",
            resumen: "Los dos botones de la plataforma: el copiloto como pestaña en cada chat, y el copiloto a toda la pantalla.",
            icono: "Pin",
            miniatura: "mini-fijar-en-chats.webp",
            pasos: [
                {
                    titulo: "Los dos botones",
                    texto: `1 ${fijar.rotulo}: ${fijar.titulo.charAt(0).toLowerCase()}${fijar.titulo.slice(1)} · 2 Pantalla completa.`,
                    imagen: "botones.webp",
                    alt: "Los dos botones de la plataforma sobre el copiloto, numerados",
                },
                {
                    titulo: "Fijar en Chats",
                    texto: `Al pulsarlo, el botón pasa a «${quitar.rotulo}»: con él lo quitas cuando quieras.`,
                    imagen: "fijado.webp",
                    alt: "El botón Quitar de Chats después de fijar el copiloto",
                },
                {
                    titulo: "El copiloto dentro de cada chat",
                    texto:
                        "En Chats, cada conversación lleva la pestaña «Copiloto» arriba: le pides la respuesta sin salir del chat con el cliente.",
                    imagen: "en-chats.webp",
                    alt: "Una conversación de Chats con la pestaña Copiloto abierta",
                },
                {
                    titulo: "Pantalla completa",
                    texto: "El copiloto ocupa toda la pantalla. Se sale con Esc o con el mismo botón.",
                    imagen: "pantalla-completa.webp",
                    alt: "El copiloto a pantalla completa",
                },
            ],
            consejos: [
                "En un teléfono los dos botones van en su propia fila, encima del copiloto, para no tapar sus botones.",
                "Si el navegador no deja poner la pantalla completa (un iPhone, por ejemplo), ese botón no sale.",
            ],
        },
        {
            slug: "cuenta",
            titulo: "Tu cuenta del copiloto",
            resumen: "Abajo a la izquierda, tus iniciales: tus archivos, lo que archivaste, la configuración y cerrar sesión.",
            icono: "Settings",
            miniatura: "mini-cuenta.webp",
            pasos: [
                {
                    titulo: "El menú de tu cuenta",
                    texto: `Se abre con tus iniciales: ${entreComillas([...MENU_DE_LA_CUENTA])}.`,
                    imagen: "menu-de-la-cuenta.webp",
                    alt: "El menú de la cuenta del copiloto abierto",
                },
                {
                    titulo: "Configuración",
                    texto: `El idioma, el tema claro u oscuro y cómo se ve el chat. Sus pestañas: ${entreComillas([...PESTANAS_DE_CONFIGURACION])}.`,
                    imagen: "configuracion.webp",
                    alt: "La ventana de configuración del copiloto",
                },
                {
                    titulo: "Conversaciones archivadas",
                    texto: "Lo que archivaste, con su fecha. Desde aquí la devuelves a la lista o la borras.",
                    imagen: "archivadas.webp",
                    alt: "La ventana de conversaciones archivadas del copiloto",
                },
            ],
            consejos: ["«Cerrar sesión» cierra el copiloto en este navegador; la plataforma sigue abierta."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("copiloto", GUIA_COPILOTO);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
