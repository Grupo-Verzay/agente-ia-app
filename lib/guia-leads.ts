/**
 * La GUÍA PÚBLICA del módulo de Leads (`/sessions`), prueba piloto de la
 * documentación de la plataforma.
 *
 * Esto es el CONTENIDO, y es puro a propósito: lo pintan las páginas públicas
 * (`app/guia/leads/**`), lo recorre el script que toma las capturas
 * (`scripts/capturar-guia-leads.mjs`) y lo comprueba el banco
 * (`lib/__tests__/guia-leads.test.mjs`). Una sola lista de secciones y de
 * imágenes: si la página nombrara una captura que el script no toma, se vería
 * un hueco; si el script tomara una que nadie enseña, sería peso muerto en el
 * repositorio. El banco exige que las dos digan lo mismo.
 *
 * Y el texto se ata al CÓDIGO de la pantalla: las columnas, las pastillas de
 * conteo y las columnas del CSV que se documentan aquí se comparan con las que
 * pintan `Columns.tsx`, `FilterLeadsByStats.tsx` y `sessions-content.tsx`. El
 * día que la pantalla gane o pierda una columna, el banco se pone en rojo y
 * dice cuál falta — así una guía no se queda describiendo una pantalla que ya
 * no existe, que es como envejece toda documentación escrita a mano.
 */

/** Dónde viven las capturas, servidas desde `public/`. */
export const CARPETA_DE_CAPTURAS = "/guia/leads";

/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = `${CARPETA_DE_CAPTURAS}/demostracion.webm`;
export const PORTADA_DEL_VIDEO = `${CARPETA_DE_CAPTURAS}/portada.webp`;

export type Paso = {
    titulo: string;
    /** Una o dos frases. La captura explica; el texto solo pone nombre a lo que se ve. */
    texto: string;
    /** Nombre del fichero en `CARPETA_DE_CAPTURAS`, sin carpeta. */
    imagen: string;
    alt: string;
};

export type Seccion = {
    slug: string;
    titulo: string;
    resumen: string;
    /** Nombre de un icono de lucide-react (ver `IconoDeSeccion`). */
    icono: "LayoutDashboard" | "Columns3" | "ToggleRight" | "Filter" | "Search" | "Download" | "UserPlus" | "MoreHorizontal";
    /**
     * La captura de la tarjeta en el índice: `mini-<slug>.webp`, PROPIA de la
     * tarjeta y no la de un paso. Lleva el enfoque —la zona de la sección
     * nítida y en su recuadro, el resto atenuado— y es 16:9 como la tarjeta
     * (`capturar-guia-leads.mjs › miniaturas`).
     */
    miniatura: string;
    pasos: Paso[];
    /** Lo que conviene saber y no cabe en un paso. Corto. */
    consejos?: string[];
};

/** Lo que dice cada columna de la tabla. El banco lo compara con `Columns.tsx`. */
export const COLUMNAS_DOCUMENTADAS = [
    "WhatsApp",
    "Nombre",
    "Sesión",
    "Agente",
    "Creado",
    "Flujos",
    "Seguimientos",
    "Etiquetas",
    "Acciones",
] as const;

/**
 * Las partes de la BARRA DE ARRIBA, en su orden, con el componente que pinta
 * cada una en `components/custom/Breadcrumbs.tsx`. El banco lee esa barra y
 * exige que tenga exactamente estas, en este orden: un botón nuevo arriba sin
 * su nombre en la guía la pone en rojo, que es como se quedó la primera
 * versión —la barra salía en las capturas y la guía no nombraba ni una parte—.
 */
export const PARTES_DE_LA_BARRA_DE_ARRIBA = [
    { nombre: "Abrir o recoger el menú", componente: "SidebarTrigger" },
    { nombre: "Pasar a Chats o a Correos", componente: "AlternarBandeja" },
    { nombre: "Ver tutoriales", componente: "Ver tutoriales" },
    { nombre: "Buscar en toda la plataforma", componente: "GlobalSearch" },
    { nombre: "Soporte", componente: "BotonDeSoporte" },
    { nombre: "Tus notificaciones", componente: "NotificationCenter" },
] as const;

/**
 * Las cinco ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla». Cada una tiene su paso en la
 * sección (la tabla, su sección entera).
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La tabla",
    "El pie",
] as const;

/** Dónde vive Leads en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_LEADS = "Contactos";

/** Las pastillas de conteo. El banco las compara con `FilterLeadsByStats.tsx`. */
export const PASTILLAS_DOCUMENTADAS = ["Total", "Clientes activos", "Clientes inactivos", "Agente activo"] as const;

/**
 * El menú «⋯» de la barra (las ACCIONES MASIVAS), grupo por grupo y en su
 * orden. El banco lo compara con `BulkActionsDropdown.tsx`: una acción nueva
 * en ese menú sin su nombre en la guía la pone en rojo — que es como se quedó
 * la primera versión, que no nombraba ninguna.
 */
export const ACCIONES_MASIVAS_DOCUMENTADAS = [
    { grupo: "Exportar", acciones: ["Exportar a Excel", "Sincronizar a Google Sheets"] },
    { grupo: "Gestión masiva", acciones: ["Activar clientes", "Desactivar clientes", "Limpiar leads vacíos"] },
    { grupo: "Riesgo alto", acciones: ["Borrar historial", "Eliminar clientes", "Eliminar seguimientos"] },
] as const;

/** Las columnas del CSV exportado. El banco las compara con `sessions-content.tsx`. */
export const COLUMNAS_DEL_CSV = [
    "ID",
    "Nombre",
    "Teléfono",
    "Lead Status",
    "Conversación",
    "Agente IA",
    "Asesor",
    "Etiquetas",
    "Fecha creación",
] as const;

export const GUIA_LEADS: { titulo: string; subtitulo: string; descripcion: string; secciones: Seccion[] } = {
    titulo: "Leads",
    subtitulo: "Tus contactos de WhatsApp, en una sola lista",
    descripcion:
        "Leads reúne a cada persona que te ha escrito por WhatsApp. Desde aquí ves en qué punto está cada " +
        "contacto, decides si la IA le responde, lo encuentras en segundos, lo exportas, creas contactos nuevos y " +
        "cambias todos a la vez con las acciones masivas.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo, la tabla y el pie de página.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Leads · 4 La tabla, un contacto por fila · 5 El pie, para pasar de página.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Leads con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Leads está dentro de Contactos. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Leads dentro de Contactos",
                },
                {
                    titulo: "La barra de arriba",
                    texto:
                        "1 Abrir o recoger el menú · 2 Pasar a Chats o a Correos · 3 Ver tutoriales · " +
                        "4 Buscar en toda la plataforma · 5 Soporte · 6 Tus notificaciones.",
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 Buscador · 2 Contadores que filtran · 3 Línea (si tienes varias) · 4 Exportar CSV · " +
                        "5 Nuevo contacto · 6 Acciones masivas, para todos los contactos a la vez.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada botón numerado",
                },
                {
                    titulo: "Pasar de página",
                    texto:
                        "Abajo a la derecha están las flechas de página y a la izquierda cuántos contactos estás viendo del total.",
                    imagen: "paginacion.webp",
                    alt: "El pie de la tabla con el contador y las flechas de página",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Leads por Contactos.",
                "La lista se actualiza sola cada 30 segundos: no hace falta recargar la página.",
                "Pulsa el nombre de cualquier columna para ordenar la tabla por ella; vuelve a pulsar para invertir el orden.",
            ],
        },
        {
            slug: "columnas",
            titulo: "Qué muestra cada columna",
            resumen: "Las nueve columnas de la tabla, una por una.",
            icono: "Columns3",
            miniatura: "mini-columnas.webp",
            pasos: [
                {
                    titulo: "WhatsApp",
                    texto: "El número del contacto. Púlsalo y se abre su conversación en Chats, en la línea por la que escribió.",
                    imagen: "col-whatsapp.webp",
                    alt: "La columna WhatsApp resaltada",
                },
                {
                    titulo: "Nombre",
                    texto: "El nombre con el que aparece. Púlsalo para corregirlo: el cambio se ve también en Chats.",
                    imagen: "col-nombre.webp",
                    alt: "La columna Nombre resaltada",
                },
                {
                    titulo: "Sesión",
                    texto: "Verde: la conversación está abierta. Gris: está cerrada o pausada.",
                    imagen: "col-sesion.webp",
                    alt: "La columna Sesión resaltada",
                },
                {
                    titulo: "Agente",
                    texto: "Azul: la IA le responde a este contacto. Apagado: la IA no le escribe, aunque esté encendida para los demás.",
                    imagen: "col-agente.webp",
                    alt: "La columna Agente resaltada",
                },
                {
                    titulo: "Creado",
                    texto: "El día y la hora en que el contacto entró por primera vez.",
                    imagen: "col-creado.webp",
                    alt: "La columna Creado resaltada",
                },
                {
                    titulo: "Flujos",
                    texto: "Cuántos flujos automáticos ha recorrido. Pasa el cursor por encima para ver sus nombres.",
                    imagen: "col-flujos.webp",
                    alt: "La columna Flujos resaltada",
                },
                {
                    titulo: "Seguimientos",
                    texto: "Los mensajes programados que todavía no han salido. Púlsalo para ver cuáles son y cuándo salen.",
                    imagen: "col-seguimientos.webp",
                    alt: "La columna Seguimientos resaltada",
                },
                {
                    titulo: "El detalle de los seguimientos",
                    texto: "Al pulsar el número se abre la lista de seguimientos pendientes de ese contacto.",
                    imagen: "seguimientos-detalle.webp",
                    alt: "La ventana con los seguimientos pendientes de un contacto",
                },
                {
                    titulo: "Etiquetas",
                    texto: "Las etiquetas del contacto. Púlsalas para poner o quitar etiquetas sin salir de la lista.",
                    imagen: "col-etiquetas.webp",
                    alt: "La columna Etiquetas resaltada",
                },
                {
                    titulo: "Elegir etiquetas",
                    texto: "Marca o desmarca las que quieras. Se guarda al momento.",
                    imagen: "etiquetas-menu.webp",
                    alt: "El selector de etiquetas abierto",
                },
                {
                    titulo: "Acciones",
                    texto: "El botón «⋯» de cada fila abre lo que se puede hacer con ese contacto.",
                    imagen: "col-acciones.webp",
                    alt: "La columna Acciones resaltada",
                },
                {
                    titulo: "El menú de acciones",
                    texto: "Borrar su historial de conversación, borrar el contacto o borrar sus seguimientos pendientes.",
                    imagen: "acciones-menu.webp",
                    alt: "El menú de acciones de una fila abierto",
                },
            ],
            consejos: ["Todo lo que borras desde Acciones pide confirmación antes y no se puede deshacer."],
        },
        {
            slug: "sesion-y-agente",
            titulo: "Activar o desactivar la sesión y el agente",
            resumen: "Los dos interruptores de cada contacto y qué cambia con cada uno.",
            icono: "ToggleRight",
            miniatura: "mini-sesion-y-agente.webp",
            pasos: [
                {
                    titulo: "El interruptor de Sesión",
                    texto: "En verde, la conversación con ese contacto está abierta y la IA puede atenderla.",
                    imagen: "sesion-interruptor.webp",
                    alt: "El interruptor de Sesión de un contacto, encendido",
                },
                {
                    titulo: "Apagar la sesión",
                    texto:
                        "Púlsalo y pasa a gris: la conversación queda en pausa. Sale un aviso de «¡Actualizado!» cuando se guarda.",
                    imagen: "sesion-apagada.webp",
                    alt: "El interruptor de Sesión apagado y el aviso de guardado",
                },
                {
                    titulo: "El interruptor de Agente",
                    texto: "En azul, la IA le responde a este contacto.",
                    imagen: "agente-interruptor.webp",
                    alt: "El interruptor de Agente de un contacto, encendido",
                },
                {
                    titulo: "Apagar el agente para un contacto",
                    texto:
                        "Púlsalo y la IA deja de escribirle solo a esta persona. Útil cuando la atiende alguien del equipo.",
                    imagen: "agente-apagado.webp",
                    alt: "El interruptor de Agente apagado y el aviso",
                },
            ],
            consejos: [
                "Sesión y Agente son independientes: puedes tener la conversación abierta y la IA apagada para que la atienda una persona.",
                "Cuando un asesor escribe desde Chats, la IA se pausa sola en esa conversación.",
                "Para cambiarlos en todos los contactos a la vez usa el menú «⋯» de la barra: «Activar clientes» o «Desactivar clientes».",
            ],
        },
        {
            slug: "filtros",
            titulo: "Filtrar con los contadores",
            resumen: "Los números de la barra también son filtros.",
            icono: "Filter",
            miniatura: "mini-filtros.webp",
            pasos: [
                {
                    titulo: "Cuatro contadores",
                    texto:
                        "1 Total · 2 Clientes activos (sesión abierta) · 3 Clientes inactivos · 4 Agente activo. Cada uno dice cuántos hay.",
                    imagen: "filtros-pastillas.webp",
                    alt: "Los cuatro contadores de la barra numerados",
                },
                {
                    titulo: "Pasa el cursor para ver el nombre",
                    texto: "Cada contador enseña su nombre al posar el cursor encima.",
                    imagen: "filtros-nombre.webp",
                    alt: "El nombre de un contador al posar el cursor",
                },
                {
                    titulo: "Púlsalo para filtrar",
                    texto: "La tabla se queda solo con esos contactos y el contador queda marcado.",
                    imagen: "filtros-activo.webp",
                    alt: "La tabla filtrada por Clientes inactivos",
                },
                {
                    titulo: "Quitar el filtro",
                    texto: "Vuelve a pulsar el mismo contador, o pulsa «Total».",
                    imagen: "filtros-total.webp",
                    alt: "El contador Total, que quita el filtro",
                },
            ],
            consejos: [
                "Si tu cuenta tiene varias líneas de WhatsApp, el botón «Línea» deja ver los contactos de una sola; los contadores se recalculan para esa línea.",
            ],
        },
        {
            slug: "buscar",
            titulo: "Buscar un contacto",
            resumen: "Por nombre o por número, mientras escribes.",
            icono: "Search",
            miniatura: "mini-buscar.webp",
            pasos: [
                {
                    titulo: "El buscador",
                    texto: "Está a la izquierda de la barra. Busca en todos tus contactos, no solo en la página que ves.",
                    imagen: "buscar-campo.webp",
                    alt: "El buscador de la barra resaltado",
                },
                {
                    titulo: "Escribe un nombre o un número",
                    texto: "La tabla se filtra mientras escribes. Sirve un trozo del nombre o unos dígitos del teléfono.",
                    imagen: "buscar-resultado.webp",
                    alt: "El resultado de buscar un nombre",
                },
                {
                    titulo: "Por número",
                    texto: "Unos pocos dígitos bastan para encontrarlo.",
                    imagen: "buscar-numero.webp",
                    alt: "El resultado de buscar por número",
                },
            ],
            consejos: ["Borra el texto del buscador para volver a la lista completa."],
        },
        {
            slug: "exportar",
            titulo: "Exportar a CSV",
            resumen: "Descarga todos tus contactos para abrirlos en Excel o Google Sheets.",
            icono: "Download",
            miniatura: "mini-exportar.webp",
            pasos: [
                {
                    titulo: "Pulsa «Exportar CSV»",
                    texto: "Está en la barra, justo antes de «+ Nuevo».",
                    imagen: "exportar-boton.webp",
                    alt: "El botón Exportar CSV resaltado",
                },
                {
                    titulo: "Se descarga el archivo",
                    texto: "Un aviso confirma cuántos contactos se exportaron. El archivo se llama contactos_ y la fecha de hoy.",
                    imagen: "exportar-aviso.webp",
                    alt: "El aviso de contactos exportados",
                },
                {
                    titulo: "Qué trae el archivo",
                    texto: "Una fila por contacto, con estas columnas.",
                    imagen: "exportar-archivo.webp",
                    alt: "El archivo CSV abierto, con sus columnas",
                },
            ],
            consejos: [
                "Exporta todos los contactos de la cuenta, aunque tengas un filtro puesto.",
                "El archivo abre bien en Excel con tildes y eñes.",
                "Para Excel o Google Sheets usa el menú «⋯» del final de la barra (sección Acciones masivas).",
            ],
        },
        {
            slug: "nuevo-contacto",
            titulo: "Crear un contacto nuevo",
            resumen: "Añade a alguien a mano, con su número y su nombre.",
            icono: "UserPlus",
            miniatura: "mini-nuevo-contacto.webp",
            pasos: [
                {
                    titulo: "Pulsa «+ Nuevo»",
                    texto: "Es el botón azul de la barra.",
                    imagen: "nuevo-boton.webp",
                    alt: "El botón azul Nuevo resaltado",
                },
                {
                    titulo: "Rellena los datos",
                    texto:
                        "1 Instancia: la línea de WhatsApp (sale solo si tienes varias) · 2 El número con el indicativo del país, sin espacios ni «+» · 3 El nombre.",
                    imagen: "nuevo-dialogo.webp",
                    alt: "La ventana Crear contacto con sus campos numerados",
                },
                {
                    titulo: "Pulsa «Crear»",
                    texto: "El contacto aparece en la lista al momento.",
                    imagen: "nuevo-creado.webp",
                    alt: "El contacto nuevo en la lista con el aviso de creado",
                },
            ],
            consejos: ["Ejemplo de número: 573001234567 (57 es Colombia, luego el celular)."],
        },
        {
            slug: "acciones-masivas",
            titulo: "Acciones masivas",
            resumen: "El menú «⋯» de la barra: exportar a Excel o a Google Sheets y cambiar o limpiar todos los contactos a la vez.",
            icono: "MoreHorizontal",
            miniatura: "mini-acciones-masivas.webp",
            pasos: [
                {
                    titulo: "El botón «⋯»",
                    texto: "Es el último de la barra, pegado al borde derecho. Abre lo que se hace con todos los contactos a la vez.",
                    imagen: "masivas-boton.webp",
                    alt: "El botón de acciones masivas resaltado al final de la barra",
                },
                {
                    titulo: "Tres grupos",
                    texto: "1 Exportar · 2 Gestión masiva · 3 Riesgo alto. Cada grupo lleva su título dentro del menú.",
                    imagen: "masivas-menu.webp",
                    alt: "El menú de acciones masivas abierto, con sus tres grupos numerados",
                },
                {
                    titulo: "Exportar",
                    texto:
                        "«Exportar a Excel» descarga la página de la tabla que estás viendo. «Sincronizar a Google Sheets» manda todos los contactos a tu hoja conectada.",
                    imagen: "masivas-exportar.webp",
                    alt: "El grupo Exportar del menú resaltado",
                },
                {
                    titulo: "Gestión masiva",
                    texto:
                        "«Activar clientes» y «Desactivar clientes» abren o pausan la sesión de todos. «Limpiar leads vacíos» quita los contactos sin un número válido.",
                    imagen: "masivas-gestion.webp",
                    alt: "El grupo Gestión masiva del menú resaltado",
                },
                {
                    titulo: "Riesgo alto",
                    texto:
                        "«Borrar historial» borra el historial de conversación de todos, «Eliminar clientes» borra todos los contactos y «Eliminar seguimientos», los programados.",
                    imagen: "masivas-riesgo.webp",
                    alt: "El grupo Riesgo alto del menú resaltado",
                },
                {
                    titulo: "Siempre pide confirmación",
                    texto: "Una ventana dice qué vas a ejecutar. «Cancelar» no cambia nada; «Confirmar» lo aplica a todos tus contactos.",
                    imagen: "masivas-confirmar.webp",
                    alt: "La ventana de confirmación de una acción masiva, con Cancelar y Confirmar",
                },
            ],
            consejos: [
                "Todo este menú actúa sobre TODOS los contactos de la cuenta, no solo sobre la página o el filtro que tengas puesto. La excepción es «Exportar a Excel», que descarga la página que ves.",
                "Para cambiar un solo contacto usa los interruptores de su fila o el «⋯» de esa fila (sección Qué muestra cada columna).",
                "«Sincronizar a Google Sheets» pide tener tu hoja conectada: se conecta en la ficha de un contacto, en la sección Google Sheets.",
            ],
        },
    ],
};

export const SECCIONES: readonly Seccion[] = GUIA_LEADS.secciones;

export function laSeccion(slug: string): Seccion | null {
    return SECCIONES.find((s) => s.slug === slug) ?? null;
}

/** La anterior y la siguiente, para navegar sin volver al índice. */
export function lasVecinas(slug: string): { anterior: Seccion | null; siguiente: Seccion | null } {
    const i = SECCIONES.findIndex((s) => s.slug === slug);
    if (i < 0) return { anterior: null, siguiente: null };
    return { anterior: SECCIONES[i - 1] ?? null, siguiente: SECCIONES[i + 1] ?? null };
}

/** Todas las capturas que la guía enseña, sin repetir: lo que el script tiene que tomar. */
export function lasCapturasQueSeEnsenan(): string[] {
    const todas = new Set<string>([PORTADA_DEL_VIDEO.split("/").pop()!]);
    for (const s of SECCIONES) {
        todas.add(s.miniatura);
        for (const p of s.pasos) todas.add(p.imagen);
    }
    return [...todas];
}

export function laRutaDeLaCaptura(nombre: string): string {
    return `${CARPETA_DE_CAPTURAS}/${nombre}`;
}
