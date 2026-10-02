/**
 * La GUÍA PÚBLICA de Correos (`/guia/correo`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que
 * pintan `CorreoClient.tsx`, `FilaDeCorreo.tsx`, `LecturaDelCorreo.tsx`,
 * `ConectarCorreo.tsx`, `BulkActionBar.tsx` y `lib/correo.ts`. Un mando nuevo
 * en la pantalla sin su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Correos en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_CORREO = "Bandeja";

/** Las cuatro ZONAS de la pantalla, como las numera «Todo en una pantalla». */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La lista de correos",
    "El correo abierto",
] as const;

/** La cabecera de la lista, de izquierda a derecha. */
export const PARTES_DE_LA_CABECERA = ["Bandejas", "Buscador", "Buscar en", "Actualizar", "Más acciones"] as const;

/** Las tres formas de conectar un correo. El banco las compara con `ConectarCorreo.tsx`. */
export const FORMAS_DE_CONECTAR = ["Conectar Gmail", "Conectar Outlook", "Conectar correo de dominio propio"] as const;

/** Los campos del formulario de dominio propio, en su orden. */
export const CAMPOS_DE_DOMINIO_PROPIO = [
    "Correo",
    "Usuario (si no es el correo)",
    "Contraseña",
    "Servidor de entrada (IMAP)",
    "Puerto",
    "Servidor de salida (SMTP)",
    "Puerto",
] as const;

/** «Buscar en»: los campos del buscador. El banco los compara con `NOMBRE_DEL_CAMPO`. */
export const CAMPOS_DEL_BUSCADOR = ["Todo", "Remitente", "Asunto"] as const;

/** Las cuatro pastillas, en su orden. El banco las compara con `FILTROS_EN_PASTILLA`. */
export const PASTILLAS_DOCUMENTADAS = ["Destacados", "Todos", "Sin leer", "Archivados"] as const;

/** Lo que guarda la flecha «⌄» de las pastillas, en su orden. */
export const MENU_DE_LA_FLECHA = ["Nuevo correo", "Leídos", "Con adjuntos", "Anclados", "Seleccionar todos"] as const;

/** El menú «⋯» de la cabecera de la lista, en su orden (sin los «Desconectar» de cada buzón). */
export const MENU_DE_MAS_ACCIONES = ["Nuevo correo", "Exportar los de la lista", "Conectar otro correo"] as const;

/** La barra de la selección múltiple, de izquierda a derecha. */
export const BARRA_DE_LA_SELECCION = ["Marcar como leído / no leído", "Exportar correos", "Destacar", "Archivar correos", "Eliminar correos"] as const;

/** Los mandos de un correo abierto, de izquierda a derecha. El banco los compara con `MANDOS_DEL_CORREO`. */
export const MANDOS_DOCUMENTADOS = ["Responder", "Reenviar", "Marcar como no leído", "Destacar", "Eliminar", "Más"] as const;

/** El «⋯» de un correo abierto. */
export const MENU_DEL_CORREO_ABIERTO = ["Anclar arriba", "Archivar", "Exportar este correo"] as const;

/** El «⋯» de una fila de la lista, con un correo sin leer. */
export const MENU_DE_LA_FILA = ["Abrir y marcar como leído", "Destacar", "Anclar arriba", "Exportar este correo", "Seleccionar"] as const;

/** Lo que trae la barra de responder. */
export const PARTES_DE_LA_BARRA_DE_RESPONDER = ["Firma del correo", "Adjuntar", "Sugerir respuesta con IA", "Enviar respuesta"] as const;

export const GUIA_CORREO: Contenido = {
    titulo: "Correos",
    subtitulo: "Lee y responde los correos de tu negocio sin salir de la plataforma",
    descripcion:
        "Correos junta en una sola bandeja los correos de tu negocio: Gmail, Outlook o un correo de tu propio " +
        "dominio, uno o varios. Desde aquí los lees, los filtras, los organizas de a uno o en grupo, y respondes, " +
        "reenvías o escribes uno nuevo con tus archivos y la firma de cada buzón. Solo tú ves los correos que conectas.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la lista de correos y el correo abierto.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La lista de correos · 4 El correo abierto.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Correos con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Correos está dentro de Bandeja, junto a Chats. Al entrar " +
                        "a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Correos dentro de Bandeja",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La lista de correos",
                    texto: "1 Bandejas · 2 Buscador · 3 Buscar en · 4 Actualizar · 5 Más acciones · 6 Las pastillas de filtro.",
                    imagen: "lista.webp",
                    alt: "La cabecera de la lista de correos con cada parte numerada",
                },
                {
                    titulo: "Un correo de la lista",
                    texto:
                        "1 Quién lo manda, con la casilla para seleccionarlo · 2 El asunto y el comienzo · " +
                        "3 La hora · 4 De qué buzón llegó, el clip si trae archivos y el punto si está sin leer.",
                    imagen: "fila.webp",
                    alt: "Un correo de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "Los correos se leen de tu Gmail, Outlook o servidor en el momento: la plataforma no guarda copias.",
                "Lo que marcas, archivas o eliminas aquí también cambia en tu correo de siempre.",
            ],
        },
        {
            slug: "conectar",
            titulo: "Conectar tu correo",
            resumen: "Gmail u Outlook con un botón, o un correo de tu propio dominio con sus datos.",
            icono: "Link2",
            miniatura: "mini-conectar.webp",
            pasos: [
                {
                    titulo: "Abre «Conectar otro correo»",
                    texto: "En el «⋯» de la lista, «Conectar otro correo». La primera vez la pantalla te lo ofrece sola.",
                    imagen: "conectar-menu.webp",
                    alt: "El menú Más acciones abierto con Conectar otro correo resaltado",
                },
                {
                    titulo: "Gmail u Outlook",
                    texto:
                        "Pulsa «Conectar Gmail» o «Conectar Outlook», entra con tu cuenta y da el permiso. Al volver, " +
                        "el buzón ya está en la lista.",
                    imagen: "conectar-dialogo.webp",
                    alt: "La ventana Conectar otro correo con los botones de Gmail, Outlook y dominio propio",
                },
                {
                    titulo: "Un correo de tu propio dominio",
                    texto:
                        "Con «Conectar correo de dominio propio» escribes tu correo, la contraseña y los servidores de " +
                        "entrada (IMAP) y de salida (SMTP) que te da tu proveedor de correo.",
                    imagen: "conectar-dominio.webp",
                    alt: "El formulario de dominio propio con el correo, la contraseña y los servidores",
                },
            ],
            consejos: [
                "Solo tú ves los correos que conectas: ni el dueño de la cuenta ni un administrador.",
                "Si un buzón pide «volver a conectar», repite estos pasos con el mismo correo: no se duplica.",
            ],
        },
        {
            slug: "buzones",
            titulo: "Varios buzones",
            resumen: "Todos juntos en una bandeja, o cada uno por separado.",
            icono: "Layers",
            miniatura: "mini-buzones.webp",
            pasos: [
                {
                    titulo: "El selector de bandejas",
                    texto:
                        "Con más de un correo conectado, arriba a la izquierda sale «Todas». Lo abres y eliges ver " +
                        "todos juntos o un solo buzón; cada uno dice cuántos correos tiene.",
                    imagen: "buzones-selector.webp",
                    alt: "El selector de bandejas abierto con Todas y los tres buzones",
                },
                {
                    titulo: "Todas las bandejas juntas",
                    texto: "En «Todas» cada correo lleva la marca del buzón al que llegó, con su color: así sabes desde cuál responder.",
                    imagen: "buzones-unificada.webp",
                    alt: "La lista con correos de varios buzones y la marca de cada uno resaltada",
                },
                {
                    titulo: "Un solo buzón",
                    texto: "Elige un buzón y la lista enseña solo lo suyo. La plataforma recuerda cuál estabas mirando.",
                    imagen: "buzones-uno.webp",
                    alt: "La lista con solo los correos de soporte",
                },
                {
                    titulo: "Quitar un buzón",
                    texto: "En el «⋯» de la lista, «Desconectar» y la dirección. Tus correos siguen en tu Gmail o tu servidor.",
                    imagen: "buzones-desconectar.webp",
                    alt: "El menú Más acciones con las opciones de desconectar cada buzón",
                },
            ],
        },
        {
            slug: "buscar",
            titulo: "Buscar un correo",
            resumen: "Escribe un nombre o un asunto, y elige dónde buscar.",
            icono: "Search",
            miniatura: "mini-buscar.webp",
            pasos: [
                {
                    titulo: "Escribe en el buscador",
                    texto: "La lista se filtra mientras escribes, sin tildes ni mayúsculas: «cotizacion» encuentra «Cotización».",
                    imagen: "buscar-escribir.webp",
                    alt: "El buscador con una palabra escrita y la lista filtrada",
                },
                {
                    titulo: "Elige dónde buscar",
                    texto: "El botón de al lado del buscador cambia el campo: Todo, Remitente o Asunto. El buscador dice cuál está puesto.",
                    imagen: "buscar-campo.webp",
                    alt: "El menú Buscar en abierto con Todo, Remitente y Asunto",
                },
                {
                    titulo: "Solo en el remitente",
                    texto: "Con «Remitente» encuentras todo lo que mandó una persona, aunque su nombre no esté en el asunto.",
                    imagen: "buscar-remitente.webp",
                    alt: "La lista filtrada por el remitente",
                },
            ],
            consejos: ["El buscador mira los correos cargados en la lista; «Cargar más» al final trae los anteriores."],
        },
        {
            slug: "filtros",
            titulo: "Las pastillas de filtro",
            resumen: "Destacados, Todos, Sin leer y Archivados, y la flecha con el resto.",
            icono: "Filter",
            miniatura: "mini-filtros.webp",
            pasos: [
                {
                    titulo: "Cuatro pastillas",
                    texto: "1 Destacados · 2 Todos · 3 Sin leer · 4 Archivados. Cada una dice cuántos hay; púlsala para filtrar y otra vez para quitarlo.",
                    imagen: "filtros-pastillas.webp",
                    alt: "Las cuatro pastillas de filtro numeradas",
                },
                {
                    titulo: "Sin leer",
                    texto: "Deja solo lo que todavía no abriste. Al abrir un correo deja de estar sin leer, también en tu Gmail.",
                    imagen: "filtros-sin-leer.webp",
                    alt: "La lista con el filtro Sin leer puesto",
                },
                {
                    titulo: "Archivados",
                    texto: "Trae lo que sacaste de la bandeja de entrada. No se borró: sigue en tu correo, guardado aparte.",
                    imagen: "filtros-archivados.webp",
                    alt: "La lista con los correos archivados",
                },
                {
                    titulo: "La flecha del final",
                    texto: "Guarda «Nuevo correo», tres filtros más —Leídos, Con adjuntos y Anclados— y «Seleccionar todos».",
                    imagen: "filtros-flecha.webp",
                    alt: "El menú de la flecha abierto con sus opciones",
                },
            ],
        },
        {
            slug: "seleccion",
            titulo: "Varios a la vez",
            resumen: "Marca correos y márcalos como leídos, destácalos, archívalos, expórtalos o elimínalos juntos.",
            icono: "ListChecks",
            miniatura: "mini-seleccion.webp",
            pasos: [
                {
                    titulo: "Marca los correos",
                    texto: "Pasa el ratón por el círculo de un correo y pulsa su casilla. Con uno marcado, un toque en otro lo suma.",
                    imagen: "seleccion-casilla.webp",
                    alt: "Tres correos marcados en la lista",
                },
                {
                    titulo: "La barra de la selección",
                    texto:
                        "Cambia las pastillas por: 1 Leído o no leído · 2 Exportar · 3 Destacar · 4 Archivar · 5 Eliminar. " +
                        "Arriba dice cuántos llevas.",
                    imagen: "seleccion-barra.webp",
                    alt: "La barra de la selección con cada botón numerado",
                },
                {
                    titulo: "Leído o no leído",
                    texto: "El primer botón abre las dos opciones. Lo mismo hace la estrella con Destacar y Quitar destacado.",
                    imagen: "seleccion-leido.webp",
                    alt: "El menú Marcar como leído o no leído abierto",
                },
                {
                    titulo: "Eliminar pide confirmación",
                    texto: "Los correos van a la papelera de tu correo, de donde se recuperan. Archivar, en cambio, no pregunta.",
                    imagen: "seleccion-eliminar.webp",
                    alt: "La ventana que confirma eliminar los correos seleccionados",
                },
            ],
            consejos: ["Exportar descarga los correos marcados en un archivo de texto, con quién los mandó, cuándo y qué dicen."],
        },
        {
            slug: "leer",
            titulo: "Leer y organizar un correo",
            resumen: "Ábrelo, mira sus archivos y decide: destacar, anclar, archivar o eliminar.",
            icono: "BookOpen",
            miniatura: "mini-leer.webp",
            pasos: [
                {
                    titulo: "Ábrelo",
                    texto: "Pulsa un correo y se abre a la derecha: quién lo manda, el asunto, para quién va y lo que dice.",
                    imagen: "leer-abrir.webp",
                    alt: "Un correo abierto a la derecha de la lista",
                },
                {
                    titulo: "Los mandos de arriba",
                    texto: "1 Responder · 2 Reenviar · 3 Marcar como no leído · 4 Destacar · 5 Eliminar · 6 Más.",
                    imagen: "leer-mandos.webp",
                    alt: "Los mandos del correo abierto numerados",
                },
                {
                    titulo: "Sus archivos",
                    texto: "Los archivos que trae van debajo del asunto. Pulsa uno para descargarlo.",
                    imagen: "leer-adjuntos.webp",
                    alt: "El archivo adjunto del correo resaltado",
                },
                {
                    titulo: "Más: anclar, archivar, exportar",
                    texto: "«Anclar arriba» lo deja de primero en la lista hasta que lo desancles. «Archivar» lo saca de la bandeja de entrada.",
                    imagen: "leer-mas.webp",
                    alt: "El menú Más del correo abierto con Anclar arriba, Archivar y Exportar",
                },
                {
                    titulo: "Sin abrirlo",
                    texto: "Al pasar el ratón por un correo de la lista salen Archivar, Eliminar y su «⋯», con lo mismo que arriba.",
                    imagen: "leer-fila.webp",
                    alt: "Las acciones de un correo de la lista al pasar el ratón",
                },
            ],
        },
        {
            slug: "responder",
            titulo: "Responder con archivos y firma",
            resumen: "Escribe la respuesta, adjunta archivos y pon la firma de ese buzón.",
            icono: "Send",
            miniatura: "mini-responder.webp",
            pasos: [
                {
                    titulo: "Pulsa «Responder»",
                    texto: "Abajo sale la barra para escribir. La respuesta va a quien te escribió y desde el buzón al que llegó el correo.",
                    imagen: "responder-barra.webp",
                    alt: "La barra de responder abierta debajo del correo",
                },
                {
                    titulo: "Adjunta archivos",
                    texto: "El clip abre tus archivos: fotos, documentos o lo que necesites. También puedes pegar una captura en la caja.",
                    imagen: "responder-adjuntar.webp",
                    alt: "La respuesta con un archivo adjunto listo para enviar",
                },
                {
                    titulo: "La firma de cada buzón",
                    texto:
                        "El botón de la firma la escribe y la enciende para ESE buzón: soporte firma como soporte y ventas " +
                        "como ventas. Encendida, va al final de cada correo.",
                    imagen: "responder-firma.webp",
                    alt: "La ventana de la firma del buzón de soporte con su texto y el interruptor",
                },
                {
                    titulo: "Envía",
                    texto: "Pulsa la flecha azul, o Ctrl y Enter. Enter solo hace un salto de línea, como en cualquier correo.",
                    imagen: "responder-enviar.webp",
                    alt: "El botón de enviar la respuesta resaltado",
                },
            ],
            consejos: ["El destello de la barra le pide a la IA un borrador de respuesta; lo revisas antes de enviarlo."],
        },
        {
            slug: "reenviar",
            titulo: "Reenviar un correo",
            resumen: "Mándalo a otra persona con sus archivos y unas líneas tuyas.",
            icono: "ArrowLeftRight",
            miniatura: "mini-reenviar.webp",
            pasos: [
                {
                    titulo: "Pulsa «Reenviar»",
                    texto: "Arriba de la barra sale «Reenviar a». Escribe uno o varios correos separados por comas.",
                    imagen: "reenviar-destino.webp",
                    alt: "El campo Reenviar a con una dirección escrita",
                },
                {
                    titulo: "Añade un mensaje",
                    texto: "Lo que escribas va arriba del correo original. Los archivos del original se incluyen solos, y puedes sumar los tuyos.",
                    imagen: "reenviar-mensaje.webp",
                    alt: "El reenvío con un mensaje escrito",
                },
                {
                    titulo: "Envía",
                    texto: "Pulsa la flecha o Ctrl y Enter. La equis junto a «Reenviar a» lo cancela sin enviar nada.",
                    imagen: "reenviar-enviar.webp",
                    alt: "El botón de reenviar el correo resaltado",
                },
            ],
        },
        {
            slug: "nuevo-correo",
            titulo: "Escribir un correo nuevo",
            resumen: "Elige desde qué buzón sale, a quién va, el asunto y el mensaje.",
            icono: "PenLine",
            miniatura: "mini-nuevo-correo.webp",
            pasos: [
                {
                    titulo: "Abre «Nuevo correo»",
                    texto: "Está de primero en la flecha de las pastillas y en el «⋯» de la lista.",
                    imagen: "nuevo-abrir.webp",
                    alt: "El menú de la flecha con Nuevo correo resaltado",
                },
                {
                    titulo: "Llena el correo",
                    texto: "1 Desde qué buzón sale · 2 Para · 3 Asunto · 4 El mensaje. Abajo tienes la firma y el clip, como al responder.",
                    imagen: "nuevo-formulario.webp",
                    alt: "El correo nuevo con sus campos numerados",
                },
                {
                    titulo: "Envía o descarta",
                    texto: "La flecha azul lo envía. La papelera de arriba lo descarta y vuelves a la lista.",
                    imagen: "nuevo-enviar.webp",
                    alt: "Los botones de enviar y descartar el correo nuevo",
                },
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("correo", GUIA_CORREO);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
