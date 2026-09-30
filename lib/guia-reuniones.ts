/**
 * La GUÍA PÚBLICA del módulo de Reuniones (`/reuniones`), con el mismo
 * estándar que la de Leads (`lib/guia-leads.ts`): una tarjeta por sección con
 * sus capturas, y un vídeo narrado de un minuto.
 *
 * Es el CONTENIDO y es puro a propósito: lo pintan las páginas públicas
 * (`app/guia/reuniones/**`), lo recorre el script que toma las capturas
 * (`scripts/capturar-guia-reuniones.mjs`) y lo comprueba el banco
 * (`lib/__tests__/guia-reuniones.test.mjs`). Una sola lista de secciones y de
 * imágenes: si la página nombrara una captura que el script no toma se vería un
 * hueco, y si el script tomara una que nadie enseña sería peso muerto.
 *
 * Y el texto se ata al CÓDIGO de la pantalla, como en Leads: las pestañas, los
 * mandos de la reunión, los de su cabecera, las acciones de una fila, las
 * caducidades y las opciones de grabar que se documentan aquí se comparan con
 * los que pintan `ReunionesClient.tsx`, `SalaDeVideo.tsx` y `lib/sala-de-video.ts`.
 * El día que la pantalla gane un mando, el banco se pone en rojo y dice cuál
 * falta.
 */
import { lasCapturasDe, lasVecinasEn, laRutaEnLaCarpeta, type Paso, type Seccion } from "./guia";

export type { Paso, Seccion };

/** Dónde viven las capturas, servidas desde `public/`. */
export const CARPETA_DE_CAPTURAS = "/guia/reuniones";

/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = `${CARPETA_DE_CAPTURAS}/demostracion.webm`;
export const PORTADA_DEL_VIDEO = `${CARPETA_DE_CAPTURAS}/portada.webp`;

/** El módulo del menú donde vive la pantalla, y cómo se llama su opción. */
export const MODULO_DE_REUNIONES = "Panel";
export const OPCION_DE_REUNIONES = "Reunion";

/** Las pestañas de la barra. El banco las compara con las `PastillaDeFiltro` de `ReunionesClient.tsx`. */
export const PESTANAS_DOCUMENTADAS = ["Abiertas", "Pasadas", "Grabaciones"] as const;

/** Lo que se hace desde la fila de una reunión abierta. El banco lo lee de `FilaViva`. */
export const ACCIONES_DE_LA_FILA = ["Entrar", "Copiar enlace", "Caducidad", "Regenerar enlace", "Revocar enlace"] as const;

/** Cuánto puede valer un enlace. El banco lo compara con `DURACIONES` de `lib/sala-de-video.ts`. */
export const CADUCIDADES_DOCUMENTADAS = ["1 hora", "8 horas", "1 día", "7 días", "30 días", "No caduca"] as const;

/**
 * Los mandos de ABAJO, en su orden, con el rótulo que llevan en el código
 * (`SalaDeVideo.tsx`). Son seis y ninguno más: el banco cuenta los de la barra.
 */
export const MANDOS_DE_ABAJO = [
    { nombre: "Micrófono", rotulo: "Silenciar el micrófono" },
    { nombre: "Cámara", rotulo: "Apagar la cámara" },
    { nombre: "Compartir la pantalla", rotulo: "Compartir la pantalla" },
    { nombre: "Levantar la mano", rotulo: "Levantar la mano" },
    { nombre: "Fondo", rotulo: "Desenfocar o cambiar el fondo" },
    { nombre: "Salir", rotulo: "Salir de la reunión" },
] as const;

/**
 * Los botones de la CABECERA de la reunión, con uno de sus rótulos. El banco
 * exige que cada `MandoDeCabecera` del código esté aquí.
 */
export const MANDOS_DE_LA_CABECERA = [
    { nombre: "Cuadrícula u orador", rotulo: "Ver a todos en cuadrícula" },
    { nombre: "La franja de participantes", rotulo: "Ocultar la franja de participantes" },
    { nombre: "Chat y gente", rotulo: "Abrir el chat y la gente" },
    { nombre: "Supresión de ruido", rotulo: "Suprimir el ruido de fondo del micrófono" },
    { nombre: "Copiar el enlace", rotulo: "Copiar el enlace de la reunión" },
    { nombre: "Grabar", rotulo: "Grabar la reunión" },
    { nombre: "Plegar", rotulo: "Plegar a una pastilla" },
    { nombre: "Ampliar", rotulo: "Pantalla completa" },
] as const;

/** Las dos formas de grabar, como las nombra el menú del botón de grabar. */
export const OPCIONES_DE_GRABAR = ["Grabar video y audio", "Grabar solo el audio"] as const;

/** Las opciones del menú del fondo que no son una muestra de color. */
export const OPCIONES_DE_FONDO = ["Sin fondo", "Desenfocar el fondo", "Subir imagen…"] as const;

export const GUIA_REUNIONES: { titulo: string; subtitulo: string; descripcion: string; secciones: Seccion[] } = {
    titulo: "Reuniones",
    subtitulo: "Videollamadas con tu equipo y tus clientes, sin salir de la plataforma",
    descripcion:
        "Reuniones abre una sala de video con un enlace que puedes compartir. Entran hasta cuatro personas: tu " +
        "equipo pasa directo y quien llega por el enlace llama a la puerta hasta que le dejes pasar. Dentro " +
        "tienes chat, puedes compartir la pantalla, levantar la mano y grabar la reunión para leerla después.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "Dónde está en el menú, la barra de arriba, las pestañas y el botón para abrir una reunión.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Dónde está",
                    texto: "Reuniones está en el menú de la izquierda, dentro de Panel, en la opción «Reunion». Las dos flechas de arriba abren y recogen el menú.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la plataforma abierto, con Panel desplegado y la opción Reunion resaltada",
                },
                {
                    titulo: "La barra de arriba",
                    texto: "Es la misma en toda la plataforma: el menú, Chats y Correos, «Ver tutoriales», el buscador, Soporte y la campana de avisos.",
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba de la plataforma con sus seis partes numeradas",
                },
                {
                    titulo: "Las partes de la pantalla",
                    texto: "Arriba, los apartados de Panel con «Reunion» marcado. Debajo, las pestañas Abiertas, Pasadas y Grabaciones con su número; a la derecha, cuánto vale el enlace y «+ Nuevo»; y la lista.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Reuniones con los apartados de Panel, las pestañas, el botón de caducidad, Nuevo y la lista numerados",
                },
            ],
            consejos: [
                "Una reunión admite hasta 4 personas a la vez: tu equipo y quien llegue por el enlace.",
                "La reunión se abre encima de la plataforma: puedes seguir en Chats o en cualquier pantalla mientras hablas.",
            ],
        },
        {
            slug: "abrir-una-reunion",
            titulo: "Abrir una reunión",
            resumen: "Elige cuánto vale el enlace, ponle un nombre y entra con un clic.",
            icono: "CalendarPlus",
            miniatura: "mini-abrir-una-reunion.webp",
            pasos: [
                {
                    titulo: "Cuánto vale el enlace",
                    texto: "Pulsa el botón del calendario y elige por cuánto tiempo sirve el enlace: 1 hora, 8 horas, 1 día, 7 días, 30 días o No caduca.",
                    imagen: "abrir-caducidad.webp",
                    alt: "El desplegable de la reunión nueva abierto, con las duraciones del enlace",
                },
                {
                    titulo: "Ponle un nombre",
                    texto: "En «Nombre» escribe para qué es. Es opcional, pero así la reconoces en la lista y en el historial.",
                    imagen: "abrir-nombre.webp",
                    alt: "El campo Nombre con el nombre de la reunión escrito",
                },
                {
                    titulo: "Pulsa «+ Nuevo»",
                    texto: "La reunión se crea con esos ajustes y se abre al instante, aquí mismo, sin cambiar de pestaña.",
                    imagen: "abrir-nuevo.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Ya estás dentro",
                    texto: "Entras con tu nombre y tu cámara. Desde aquí copias el enlace para quien tenga que entrar.",
                    imagen: "abrir-sala.webp",
                    alt: "La reunión recién abierta, con la cámara encendida",
                },
            ],
            consejos: [
                "Si la reunión es mañana, elige 1 día o 7 días: un enlace de 1 hora deja de servir a la hora.",
                "«No caduca» solo la ve quien administra la cuenta. Sirve para un enlace fijo de atención.",
            ],
        },
        {
            slug: "reuniones-abiertas",
            titulo: "Las reuniones abiertas",
            resumen: "Entrar, copiar el enlace, alargar su caducidad, cambiarlo o cerrarlo.",
            icono: "Video",
            miniatura: "mini-reuniones-abiertas.webp",
            pasos: [
                {
                    titulo: "Cada reunión abierta",
                    texto: "Cada fila dice su nombre, quién la abrió y cuándo caduca. «Entrar» te mete en ella y el icono de copiar guarda su enlace.",
                    imagen: "abiertas-fila.webp",
                    alt: "Una reunión abierta con Entrar, Copiar enlace y el menú de más acciones numerados",
                },
                {
                    titulo: "Cambiar cuándo caduca",
                    texto: "En «⋯» › Caducidad eliges cuánto tiempo más vale, contado desde ahora. El enlace sigue siendo el mismo.",
                    imagen: "abiertas-caducidad.webp",
                    alt: "El menú de una reunión con el submenú Caducidad abierto",
                },
                {
                    titulo: "Regenerar o revocar",
                    texto: "«Regenerar enlace» crea uno nuevo y el anterior deja de servir. «Revocar enlace» cierra la reunión y saca a quien esté dentro.",
                    imagen: "abiertas-regenerar.webp",
                    alt: "El menú de una reunión con Regenerar enlace y Revocar enlace resaltados",
                },
            ],
            consejos: [
                "Regenerar no cierra la reunión: solo cambia el enlace. Úsalo si llegó a quien no debía.",
                "El menú «⋯» solo sale a quien abrió la reunión o administra la cuenta.",
            ],
        },
        {
            slug: "mandos",
            titulo: "Los mandos de la reunión",
            resumen: "Micrófono, cámara, pantalla, mano, fondo y salir, y cómo se apartan solos.",
            icono: "Mic",
            miniatura: "mini-mandos.webp",
            pasos: [
                {
                    titulo: "Los mandos de abajo",
                    texto: "Micrófono, cámara, compartir la pantalla, levantar la mano, el fondo y el botón rojo para salir.",
                    imagen: "mandos.webp",
                    alt: "La barra de mandos de la reunión con sus seis botones numerados",
                },
                {
                    titulo: "Levantar la mano",
                    texto: "Pide la palabra sin interrumpir: tu recuadro se marca en ámbar para todos. Se baja sola a los dos minutos.",
                    imagen: "mandos-mano.webp",
                    alt: "El recuadro de quien levantó la mano, marcado en ámbar",
                },
                {
                    titulo: "El fondo",
                    texto: "Desenfoca lo que tienes detrás, elige uno de los fondos o sube tu propia imagen. Hace falta tener la cámara encendida.",
                    imagen: "mandos-fondo.webp",
                    alt: "El menú del fondo abierto, con Sin fondo, Desenfocar el fondo, los fondos y Subir imagen",
                },
                {
                    titulo: "Se apartan solos",
                    texto: "A los pocos segundos sin mover el ratón los mandos se esconden y la imagen queda limpia. Vuelven al moverlo o al tocar la pantalla.",
                    imagen: "mandos-escondidos.webp",
                    alt: "La reunión con los mandos escondidos y la imagen limpia",
                },
            ],
            consejos: [
                "Al compartir la pantalla, los demás la ven en tu recuadro en vez de tu cámara. Al dejar de compartir vuelve la cámara.",
                "Escondidos, los mandos no se pueden pulsar sin querer: primero mueve el ratón.",
            ],
        },
        {
            slug: "vista-de-la-sala",
            titulo: "Cómo ver la reunión",
            resumen: "Quien habla en grande o todos en cuadrícula, y la reunión plegada a una pastilla.",
            icono: "LayoutGrid",
            miniatura: "mini-vista-de-la-sala.webp",
            pasos: [
                {
                    titulo: "Los botones de arriba",
                    texto: "Cuántas personas hay, cómo se reparten los recuadros, el chat, quitar el ruido, copiar el enlace, grabar y el tamaño de la ventana.",
                    imagen: "vista-cabecera.webp",
                    alt: "La cabecera de la reunión con sus botones numerados",
                },
                {
                    titulo: "Quien habla, en grande",
                    texto: "En la vista de orador la persona que habla sale grande y el resto en una franja al lado. La franja se puede ocultar.",
                    imagen: "vista-orador.webp",
                    alt: "La reunión en vista de orador, con una persona en grande y la franja al lado",
                },
                {
                    titulo: "Todos en cuadrícula",
                    texto: "Con el botón de la cuadrícula todos se ven del mismo tamaño, uno al lado del otro.",
                    imagen: "vista-cuadricula.webp",
                    alt: "La reunión en cuadrícula, con los recuadros del mismo tamaño",
                },
                {
                    titulo: "Plegar a una pastilla",
                    texto: "Pliega la reunión a una barra pequeña y sigue trabajando: la reunión se sigue oyendo. Se amplía otra vez con un clic.",
                    imagen: "vista-pastilla.webp",
                    alt: "La reunión plegada a una pastilla sobre la pantalla de Reuniones",
                },
            ],
            consejos: [
                "La ventana tiene tres tamaños: pastilla, ampliada y pantalla completa.",
                "La pastilla se puede arrastrar a donde no estorbe.",
            ],
        },
        {
            slug: "invitados",
            titulo: "Invitar a alguien de fuera",
            resumen: "Comparte el enlace; el invitado llama a la puerta y tú decides si pasa.",
            icono: "DoorOpen",
            miniatura: "mini-invitados.webp",
            pasos: [
                {
                    titulo: "Comparte el enlace",
                    texto: "Copia el enlace desde la lista o desde la reunión y envíalo por WhatsApp o correo. No hace falta que tenga cuenta.",
                    imagen: "invitados-enlace.webp",
                    alt: "El botón para copiar el enlace de la reunión resaltado",
                },
                {
                    titulo: "El invitado pone su nombre",
                    texto: "Al abrir el enlace ve la puerta de la reunión: escribe su nombre y pulsa «Entrar».",
                    imagen: "invitados-puerta.webp",
                    alt: "La página del invitado con su nombre escrito y el botón Entrar",
                },
                {
                    titulo: "Espera en la puerta",
                    texto: "Queda esperando hasta que alguien de dentro le deje pasar.",
                    imagen: "invitados-esperando.webp",
                    alt: "La pantalla del invitado esperando a que le dejen entrar",
                },
                {
                    titulo: "Tú decides quién pasa",
                    texto: "Suena un aviso y sale su nombre arriba: «Dejar entrar» o «No dejar entrar».",
                    imagen: "invitados-dejar-entrar.webp",
                    alt: "El aviso de alguien esperando con los botones Dejar entrar y No dejar entrar",
                },
            ],
            consejos: [
                "Tener el enlace deja llamar a la puerta, no entrar: siempre decide alguien de dentro.",
                "Si el aviso de la puerta molesta, se puede callar durante esa reunión.",
            ],
        },
        {
            slug: "chat-y-gente",
            titulo: "El chat y la gente",
            resumen: "Escribir en la reunión, ver quién está y pedir silencio o sacar a alguien.",
            icono: "MessageSquare",
            miniatura: "mini-chat-y-gente.webp",
            pasos: [
                {
                    titulo: "El chat de la reunión",
                    texto: "Con el botón del chat se abre un panel a la derecha. Lo que se escribe ahí solo lo ve quien está en la reunión.",
                    imagen: "chat.webp",
                    alt: "El panel del chat abierto con dos mensajes",
                },
                {
                    titulo: "La gente",
                    texto: "En la pestaña Gente ves quién está, quién tiene la mano levantada y quién tiene el micrófono apagado.",
                    imagen: "gente.webp",
                    alt: "La pestaña Gente con las personas de la reunión",
                },
                {
                    titulo: "Pedir silencio o sacar a alguien",
                    texto: "Quien organiza puede pedirle a alguien que se silencie o sacarlo de la reunión, desde la lista de gente o desde el «⋯» de su recuadro.",
                    imagen: "moderar.webp",
                    alt: "El menú de un recuadro con Pedirle que se silencie y Sacar de la reunión",
                },
            ],
            consejos: [
                "El chat se borra cuando la reunión se cierra.",
                "Pedir silencio apaga el micrófono de esa persona, pero ella puede volver a encenderlo.",
            ],
        },
        {
            slug: "grabar",
            titulo: "Grabar una reunión",
            resumen: "Grabar video o solo audio, ver las grabaciones y leer lo que se dijo.",
            icono: "CircleDot",
            miniatura: "mini-grabar.webp",
            pasos: [
                {
                    titulo: "Elige qué grabar",
                    texto: "Con el botón redondo eliges grabar video y audio o solo el audio. Al lado ves cuánto ocupa una hora de cada uno.",
                    imagen: "grabar-menu.webp",
                    alt: "El menú de grabar abierto, con video y audio o solo el audio",
                },
                {
                    titulo: "Todos ven que se graba",
                    texto: "Arriba sale una franja roja con quién está grabando. Para terminar, pulsa el cuadrado.",
                    imagen: "grabar-franja.webp",
                    alt: "La franja roja de grabación y el botón de parar",
                },
                {
                    titulo: "La pestaña Grabaciones",
                    texto: "Cada grabación con su miniatura, cuánto duró, cuánto pesa y quién la grabó. Puedes verla en grande o descargarla.",
                    imagen: "grabaciones.webp",
                    alt: "La pestaña Grabaciones con dos grabaciones",
                },
                {
                    titulo: "Lo que se dijo, por escrito",
                    texto: "«Transcribir» la pasa a texto con los puntos tratados. El botón dice cuántos créditos cuesta antes de pulsarlo.",
                    imagen: "grabaciones-texto.webp",
                    alt: "Una grabación con sus puntos tratados y su transcripción",
                },
            ],
            consejos: [
                "Grabar solo aparece si tu cuenta tiene el módulo de grabación.",
                "Las grabaciones se guardan 180 días. La transcripción y los puntos tratados se quedan después.",
                "Se graba en la pestaña de quien pulsa: si la cierra, la grabación termina ahí.",
            ],
        },
        {
            slug: "pasadas",
            titulo: "Las reuniones pasadas",
            resumen: "Cuándo fue cada reunión, cuánto duró y quién entró.",
            icono: "History",
            miniatura: "mini-pasadas.webp",
            pasos: [
                {
                    titulo: "La pestaña Pasadas",
                    texto: "Las reuniones que ya terminaron, de los últimos 90 días, de la más reciente a la más antigua.",
                    imagen: "pasadas.webp",
                    alt: "La pestaña Pasadas con el historial de reuniones",
                },
                {
                    titulo: "Cuánto duró y quién entró",
                    texto: "Cada fila dice cuándo fue, cuánto duró y quién entró. Los invitados salen marcados como «(invitado)».",
                    imagen: "pasadas-fila.webp",
                    alt: "Una reunión pasada con su fecha, su duración y sus asistentes resaltados",
                },
                {
                    titulo: "Las que nadie usó",
                    texto: "Si se abrió un enlace y nadie entró, la fila lo dice: «Nadie entró».",
                    imagen: "pasadas-vacia.webp",
                    alt: "Una reunión pasada en la que no entró nadie",
                },
            ],
            consejos: ["Una reunión cuenta desde que entra la primera persona, no desde que se crea el enlace."],
        },
    ],
};

export const SECCIONES: readonly Seccion[] = GUIA_REUNIONES.secciones;

export function laSeccion(slug: string): Seccion | null {
    return SECCIONES.find((s) => s.slug === slug) ?? null;
}

/** La anterior y la siguiente, para navegar sin volver al índice. */
export function lasVecinas(slug: string): { anterior: Seccion | null; siguiente: Seccion | null } {
    return lasVecinasEn(SECCIONES, slug);
}

/** Todas las capturas que la guía enseña, sin repetir: lo que el script tiene que tomar. */
export function lasCapturasQueSeEnsenan(): string[] {
    return lasCapturasDe(SECCIONES, PORTADA_DEL_VIDEO);
}

export function laRutaDeLaCaptura(nombre: string): string {
    return laRutaEnLaCarpeta(CARPETA_DE_CAPTURAS, nombre);
}
