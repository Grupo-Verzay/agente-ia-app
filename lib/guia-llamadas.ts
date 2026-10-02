/**
 * La GUÍA PÚBLICA de Llamadas (`/guia/llamadas`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan `CallsCrmClient.tsx`, `DialogoDeLlamar.tsx`, `CallDetailDialog.tsx` y
 * `lib/call-dispositions.ts`. Un mando nuevo en la pantalla sin su nombre aquí
 * pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Llamadas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_LLAMADAS = "Bandeja";

/** Las cuatro ZONAS de la pantalla, como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "El historial de llamadas",
] as const;

/** Las partes de la BARRA DE TRABAJO, con el hueco de `BarraDeAcciones` donde vive cada una. */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Todas, Salientes y Entrantes", zona: "filtros" },
    { nombre: "Actualizar", zona: "secundarias" },
    { nombre: "Llamar", zona: "crear" },
    { nombre: "Acciones", zona: "acciones" },
] as const;

/** Los filtros de dirección. El banco los compara con `DIRECTION_OPTIONS`. */
export const DIRECCIONES_DOCUMENTADAS = ["Todas", "Salientes", "Entrantes"] as const;

/** Las columnas del historial, en su orden. El banco las compara con los `<Th>`. */
export const COLUMNAS_DOCUMENTADAS = ["WhatsApp", "Nombre", "Duración", "Fecha", "Detalle", "Resultado", "Acciones"] as const;

/** Los resultados de una llamada. El banco los compara con `CALL_DISPOSITIONS`. */
export const RESULTADOS_DOCUMENTADOS = ["Interesado", "Link enviado", "Volver a llamar", "No contesta", "No interesado"] as const;

/** Los botones de la ventana de llamar, de izquierda a derecha. */
export const BOTONES_DE_LLAMAR = ["Llamar IA", "Llamar"] as const;

/** El menú «⋯» de cada llamada. */
export const ACCIONES_DE_LA_FILA = ["Llamar", "Abrir chat", "Agendar callback", "Ver detalle", "Eliminar"] as const;

/** El menú «⋯» de la barra. */
export const ACCIONES_DE_LA_BARRA = ["Mensaje al no contestar", "Limpiar perdidas", "Eliminar todas las llamadas"] as const;

/** Lo que enseña el detalle de una llamada, en su orden. */
export const PARTES_DEL_DETALLE = ["Grabación", "Resumen IA", "Transcripción"] as const;

export const GUIA_LLAMADAS: Contenido = {
    titulo: "Llamadas",
    subtitulo: "Llama por WhatsApp, tú o la IA, y revisa cada llamada",
    descripcion:
        "Llamadas es donde llamas a tus clientes por WhatsApp —tú mismo o con el asistente de voz IA— y donde " +
        "queda cada llamada: cuánto duró, su grabación, su resumen y cómo terminó. Desde aquí abres el chat del " +
        "contacto, agendas cuándo volver a llamarlo y dejas listo el mensaje para cuando no contesta.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y el historial de llamadas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Llamadas · 4 El historial de llamadas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Llamadas con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Llamadas está dentro de Bandeja, junto a Chats. Al entrar " +
                        "a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Llamadas dentro de Bandeja",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: "1 Buscador · 2 Todas, Salientes y Entrantes · 3 Actualizar · 4 Llamar · 5 Acciones.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo de Llamadas con cada parte numerada",
                },
                {
                    titulo: "Una llamada",
                    texto: "1 WhatsApp · 2 Nombre · 3 Duración · 4 Fecha · 5 Detalle · 6 Resultado · 7 Acciones.",
                    imagen: "fila.webp",
                    alt: "Una llamada del historial con cada columna numerada",
                },
            ],
            consejos: [
                "El historial enseña las llamadas de los últimos 30 días, la más reciente arriba.",
                "Las salientes son las que haces tú o la IA; las entrantes, las que te hicieron y no se contestaron.",
            ],
        },
        {
            slug: "llamar",
            titulo: "Llamar o llamar con IA",
            resumen: "Marca un número y elige: hablas tú o habla el asistente de voz IA.",
            icono: "Phone",
            miniatura: "mini-llamar.webp",
            pasos: [
                {
                    titulo: "Pulsa «Llamar»",
                    texto: "El botón azul de la barra abre la ventana para marcar.",
                    imagen: "llamar-boton.webp",
                    alt: "El botón Llamar resaltado en la barra",
                },
                {
                    titulo: "Escribe el número",
                    texto: "El número de WhatsApp con su indicativo, sin el «+»: por ejemplo 573001234567.",
                    imagen: "llamar-numero.webp",
                    alt: "La ventana Llamar con un número escrito",
                },
                {
                    titulo: "«Llamar»: hablas tú",
                    texto: "El botón verde llama desde tu WhatsApp y abre la ventana de la llamada, con el micrófono de tu computador.",
                    imagen: "llamar-tu.webp",
                    alt: "El botón verde Llamar resaltado en la ventana",
                },
                {
                    titulo: "«Llamar IA»: habla el asistente",
                    texto:
                        "El botón morado hace que el asistente de voz IA llame y converse por ti. Al colgar, la llamada " +
                        "queda aquí con su grabación y su resumen.",
                    imagen: "llamar-ia.webp",
                    alt: "El botón morado Llamar IA resaltado en la ventana",
                },
            ],
            consejos: [
                "Para Llamar IA, el asistente de voz tiene que estar activado en Conexión, en Llamadas.",
                "También llamas desde un chat, con el teléfono verde de su cabecera, y desde los tres puntos de una llamada.",
            ],
        },
        {
            slug: "historial",
            titulo: "El historial y sus filtros",
            resumen: "Filtra por dirección, busca un contacto y ordena por cualquier columna.",
            icono: "Filter",
            miniatura: "mini-historial.webp",
            pasos: [
                {
                    titulo: "Todas, Salientes y Entrantes",
                    texto: "Con Salientes ves las que hiciste; con Entrantes, las que te hicieron. Todas las junta otra vez.",
                    imagen: "historial-filtro.webp",
                    alt: "El filtro Salientes marcado y el historial con solo las salientes",
                },
                {
                    titulo: "Busca un contacto",
                    texto: "Escribe su nombre o parte de su número y la lista se queda con sus llamadas.",
                    imagen: "historial-buscar.webp",
                    alt: "Un nombre escrito en el buscador y sus llamadas en la lista",
                },
                {
                    titulo: "Ordena por una columna",
                    texto: "Pulsa el nombre de una columna para ordenar por ella; otra vez, al revés.",
                    imagen: "historial-ordenar.webp",
                    alt: "La columna Duración ordenada, con su flecha",
                },
                {
                    titulo: "Actualizar",
                    texto: "Trae las llamadas que entraron mientras tenías la pantalla abierta.",
                    imagen: "historial-actualizar.webp",
                    alt: "El botón Actualizar resaltado en la barra",
                },
            ],
            consejos: ["Pasa el cursor por las pastillas de dirección: te dicen la duración total, el promedio y cuántas se contestaron."],
        },
        {
            slug: "abrir-el-chat",
            titulo: "Abrir el chat desde una llamada",
            resumen: "Del número azul a la conversación de WhatsApp de ese contacto.",
            icono: "MessageCircle",
            miniatura: "mini-abrir-el-chat.webp",
            pasos: [
                {
                    titulo: "Pulsa el número azul",
                    texto: "El número de cada llamada abre el chat de ese contacto.",
                    imagen: "chat-numero.webp",
                    alt: "El número azul de una llamada resaltado",
                },
                {
                    titulo: "La conversación, abierta",
                    texto: "Llegas a Chats con su conversación abierta, lista para escribirle.",
                    imagen: "chat-abierto.webp",
                    alt: "El chat del contacto abierto en Chats",
                },
                {
                    titulo: "También desde sus tres puntos",
                    texto: "En los tres puntos de la llamada, «Abrir chat» lleva al mismo sitio.",
                    imagen: "chat-menu.webp",
                    alt: "El menú de tres puntos de una llamada con Abrir chat resaltado",
                },
            ],
        },
        {
            slug: "resultado",
            titulo: "El resultado de cada llamada",
            resumen: "Marca cómo terminó, o deja que la IA lo proponga.",
            icono: "Tags",
            miniatura: "mini-resultado.webp",
            pasos: [
                {
                    titulo: "Marcar resultado",
                    texto: "En la columna Resultado, pulsa «Marcar resultado» para decir cómo terminó la llamada.",
                    imagen: "resultado-marcar.webp",
                    alt: "El botón Marcar resultado de una llamada resaltado",
                },
                {
                    titulo: "Los cinco resultados",
                    texto: "Interesado, Link enviado, Volver a llamar, No contesta y No interesado.",
                    imagen: "resultado-opciones.webp",
                    alt: "La lista de los cinco resultados abierta",
                },
                {
                    titulo: "Lo que propone la IA",
                    texto:
                        "Cuando la llamada tiene grabación, la IA propone el resultado y lo marca con un destello. Si lo " +
                        "cambias tú, manda el tuyo.",
                    imagen: "resultado-ia.webp",
                    alt: "Un resultado propuesto por la IA, con su destello",
                },
                {
                    titulo: "El nombre del contacto",
                    texto: "Pulsa el nombre, o «Poner nombre», para escribirlo. Es el mismo nombre que ves en Chats y en Leads.",
                    imagen: "resultado-nombre.webp",
                    alt: "El campo del nombre de un contacto abierto en la fila",
                },
            ],
        },
        {
            slug: "callback",
            titulo: "Agendar un callback",
            resumen: "Deja apuntado cuándo volver a llamar, y te sale en tus tareas.",
            icono: "CalendarClock",
            miniatura: "mini-callback.webp",
            pasos: [
                {
                    titulo: "Sus tres puntos › Agendar callback",
                    texto: "En los tres puntos de la llamada, «Agendar callback» abre la ventana para apuntarlo.",
                    imagen: "callback-menu.webp",
                    alt: "El menú de tres puntos con Agendar callback resaltado",
                },
                {
                    titulo: "Fecha, hora y una nota",
                    texto: "Elige cuándo volver a llamar y, si quieres, el motivo.",
                    imagen: "callback-ventana.webp",
                    alt: "La ventana Agendar callback con la fecha, la hora y una nota",
                },
                {
                    titulo: "Pulsa «Agendar»",
                    texto: "Queda como una tarea de llamada en Mis tareas, con el contacto ya puesto.",
                    imagen: "callback-listo.webp",
                    alt: "El aviso de callback agendado",
                },
            ],
        },
        {
            slug: "detalle",
            titulo: "El detalle: grabación y transcripción",
            resumen: "Escucha la llamada, lee su resumen y lo que se dijo.",
            icono: "FileText",
            miniatura: "mini-detalle.webp",
            pasos: [
                {
                    titulo: "Pulsa el detalle",
                    texto: "El texto de la columna Detalle, o «Ver detalle» en sus tres puntos, abre la llamada entera.",
                    imagen: "detalle-abrir.webp",
                    alt: "El detalle de una llamada resaltado en la fila",
                },
                {
                    titulo: "La grabación",
                    texto: "Escúchala sin salir de la plataforma, con su duración.",
                    imagen: "detalle-grabacion.webp",
                    alt: "La grabación de la llamada en la ventana de detalle",
                },
                {
                    titulo: "El Resumen IA",
                    texto: "Lo importante de la llamada en pocas líneas: qué pidió el cliente y qué quedó pendiente.",
                    imagen: "detalle-resumen.webp",
                    alt: "El resumen IA de la llamada",
                },
                {
                    titulo: "La transcripción",
                    texto: "Todo lo que se dijo, por escrito y separado por quién habla.",
                    imagen: "detalle-transcripcion.webp",
                    alt: "La transcripción de la llamada",
                },
            ],
            consejos: ["La grabación y la transcripción tardan unos minutos en estar listas después de colgar."],
        },
        {
            slug: "mensaje-al-no-contestar",
            titulo: "El mensaje al no contestar",
            resumen: "El WhatsApp que le llega al cliente cuando no te contesta.",
            icono: "MessageSquare",
            miniatura: "mini-mensaje-al-no-contestar.webp",
            pasos: [
                {
                    titulo: "Acciones › Mensaje al no contestar",
                    texto: "Los tres puntos de la barra abren el menú de acciones; la primera es este mensaje.",
                    imagen: "mensaje-menu.webp",
                    alt: "El menú de Acciones con Mensaje al no contestar resaltado",
                },
                {
                    titulo: "Enciéndelo y escríbelo",
                    texto: "Activa el interruptor y escribe lo que quieres que le llegue, por ejemplo: «Te llamé, ¿cuándo te queda bien?».",
                    imagen: "mensaje-ventana.webp",
                    alt: "La ventana Mensaje al no contestar con el interruptor y el texto",
                },
                {
                    titulo: "Pulsa «Guardar»",
                    texto: "Desde ahí, cuando una llamada no se conteste, ese es el mensaje que sale por WhatsApp.",
                    imagen: "mensaje-guardar.webp",
                    alt: "El botón Guardar de la ventana resaltado",
                },
            ],
            consejos: [
                "En la ventana de la llamada, si no te contestan, el botón «Enviar mensaje de que no contesté» lo manda al momento.",
                "En ese mismo menú, «Limpiar perdidas» y «Eliminar todas las llamadas» borran del historial: piden confirmación y no se deshacen.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("llamadas", GUIA_LLAMADAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
