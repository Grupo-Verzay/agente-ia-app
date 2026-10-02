/**
 * La GUÍA PÚBLICA de Mis tareas (`/guia/tareas`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pinta
 * `/tareas` (`TasksClient.tsx`, el panel «Nueva tarea» de `TaskFormDialog.tsx`
 * y el de automatizaciones `TaskTypeAutomationsPanel.tsx`) y con las reglas de
 * `lib/pantalla-de-tareas.ts`. Un grupo, una columna o un mando nuevo sin su
 * nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import {
    ATAJOS_DE_LA_SIGUIENTE,
    CIFRAS_DE_LA_BARRA,
    GRUPOS_DE_LA_LISTA,
    RESULTADOS_RAPIDOS,
    VISTAS_DE_LA_PANTALLA,
} from "@/lib/pantalla-de-tareas";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Mis tareas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_TAREAS = "Herramientas";

/** Las cuatro ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de tareas",
] as const;

/**
 * Las partes de la BARRA DE TRABAJO, en su orden, con el `data-zona` (o el hueco
 * de `BarraDeAcciones`) donde vive cada una en `TasksClient.tsx`.
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Lista o Kanban", zona: "vista" },
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Las cifras", zona: "cifras" },
    { nombre: "Completadas", zona: "completadas" },
    { nombre: "Actualizar", zona: "secundarias" },
    { nombre: "Nuevo", zona: "crear" },
] as const;

/** Las dos vistas, en su orden. Son las de la pantalla, no una copia. */
export const VISTAS_DOCUMENTADAS = VISTAS_DE_LA_PANTALLA;
/** Las cifras de la barra. */
export const CIFRAS_DOCUMENTADAS = CIFRAS_DE_LA_BARRA;
/** Los grupos de la vista Lista, en su orden. */
export const GRUPOS_DOCUMENTADOS = GRUPOS_DE_LA_LISTA;
/** Los resultados de un clic al completar. */
export const RESULTADOS_DOCUMENTADOS = RESULTADOS_RAPIDOS;
/** Los atajos de fecha de la siguiente tarea. */
export const ATAJOS_DOCUMENTADOS = ATAJOS_DE_LA_SIGUIENTE.map((a) => a.rotulo);

/** Las columnas del Kanban: los tipos de tarea de fábrica (`TASK_TYPES`), y «Otros» para los demás. */
export const COLUMNAS_DOCUMENTADAS = ["Seguimiento", "Llamada", "Reunión", "Email", "Tarea"] as const;

/** Las partes de UNA tarea de la lista, con su `data-zona` (`TasksClient.tsx`). */
export const PARTES_DE_UNA_TAREA = [
    { nombre: "Título", zona: "titulo" },
    { nombre: "Contacto", zona: "contacto" },
    { nombre: "Asesor", zona: "asesor" },
    { nombre: "Fecha", zona: "fecha" },
    { nombre: "Tipo", zona: "tipo" },
    { nombre: "Completar, cancelar y eliminar", zona: "mandos" },
] as const;

/** Los campos del panel «Nueva tarea», en su orden (`data-campo` de `TaskFormDialog.tsx`). */
export const CAMPOS_DE_CREAR = [
    { nombre: "Tipo", campo: "tipo" },
    { nombre: "Descripción", campo: "descripcion" },
    { nombre: "Fecha y hora", campo: "fecha" },
    { nombre: "Asignado a", campo: "asignado" },
    { nombre: "Recordatorio por WhatsApp", campo: "recordatorio" },
] as const;

/** Los campos de la ventana «Completar tarea», en su orden (`data-campo` de `TasksClient.tsx`). */
export const CAMPOS_DE_COMPLETAR = [
    { nombre: "¿Cuánto tiempo tomó?", campo: "tiempo" },
    { nombre: "Resultado", campo: "resultado" },
    { nombre: "Resultados rápidos", campo: "rapidos" },
    { nombre: "Programar siguiente tarea", campo: "siguiente" },
] as const;

/** Las acciones de una automatización, en su orden. El banco las compara con `ACTION_TYPES`. */
export const ACCIONES_DE_AUTOMATIZACION = [
    "Agregar tag",
    "Quitar tag",
    "Asignar asesor",
    "Crear tarea",
    "Ejecutar flujo",
    "Enviar mensaje",
    "Recordatorio",
    "Notificar asesor",
    "Activar / Desactivar IA",
    "Enviar archivo",
    "Webhook externo",
    "Cambiar estado lead",
    "Llamar con IA (voz)",
] as const;

const enLinea = (lista: readonly string[]) => lista.map((x, i) => `${i + 1} ${x}`).join(" · ");

export const GUIA_TAREAS: Contenido = {
    titulo: "Mis tareas",
    subtitulo: "Tu lista de pendientes, ordenada por fecha y por tipo",
    descripcion:
        "Mis tareas reúne las llamadas, seguimientos, reuniones y demás pendientes de tu equipo. Las ves en una " +
        "lista agrupada por fecha —vencidas, hoy, mañana, esta semana y más adelante— o en un tablero por tipo, " +
        "donde cada tipo puede lanzar sus propias automatizaciones. Al completar una apuntas cuánto tiempo tomó y " +
        "su resultado, y de paso programas la siguiente.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la lista de tus tareas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Mis tareas · 4 La lista de tareas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Mis tareas con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Mis tareas está dentro de Herramientas. Al entrar a una " +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Mis tareas dentro de Herramientas",
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
                    titulo: "Una tarea",
                    texto: enLinea(PARTES_DE_UNA_TAREA.map((p) => p.nombre)) + ".",
                    imagen: "tarjeta.webp",
                    alt: "Una tarea de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Mis tareas por Herramientas.",
                "Una tarea también se crea desde un chat, y entonces queda unida a ese contacto.",
            ],
        },
        {
            slug: "lista",
            titulo: "La lista, agrupada por fecha",
            resumen: "Tus tareas ordenadas de la más urgente a la más lejana.",
            icono: "List",
            miniatura: "mini-lista.webp",
            pasos: [
                {
                    titulo: "Los grupos",
                    texto:
                        "La lista reparte tus tareas por cuándo vencen: " +
                        GRUPOS_DE_LA_LISTA.filter((g) => g !== "Completadas").join(", ") +
                        ". Cada grupo dice cuántas tiene.",
                    imagen: "lista.webp",
                    alt: "La vista Lista con sus grupos por fecha",
                },
                {
                    titulo: "Las vencidas, en rojo",
                    texto:
                        "Una tarea cuya hora ya pasó va arriba, en «Vencidas», con su borde y su fecha en rojo. Las de " +
                        "hoy llevan el borde azul.",
                    imagen: "lista-vencidas.webp",
                    alt: "El grupo Vencidas con sus tareas en rojo",
                },
                {
                    titulo: "El buscador",
                    texto: "Busca por el título, el tipo o el nombre del contacto.",
                    imagen: "lista-buscar.webp",
                    alt: "Una búsqueda escrita y la lista con lo que coincide",
                },
                {
                    titulo: "Ver las completadas",
                    texto:
                        "El botón «Completadas» enseña al final las que ya cerraste, tachadas y con su resultado. " +
                        "Púlsalo otra vez para esconderlas.",
                    imagen: "lista-completadas.webp",
                    alt: "El grupo Completadas al final de la lista",
                },
            ],
            consejos: [
                "Una tarea de esta mañana cuya hora ya pasó cuenta como vencida: no esperes al día siguiente para verla en rojo.",
                "El contacto en azul abre su conversación en Chats.",
            ],
        },
        {
            slug: "metricas",
            titulo: "Las cifras",
            resumen: "Cuántas tienes pendientes, cuántas se vencieron y cuántas son para hoy.",
            icono: "BarChart3",
            miniatura: "mini-metricas.webp",
            pasos: [
                {
                    titulo: "Las tres cifras",
                    texto:
                        enLinea(CIFRAS_DE_LA_BARRA) +
                        ". Si pasas el ratón por una, dice qué cuenta.",
                    imagen: "cifras.webp",
                    alt: "Las tres cifras de la barra numeradas",
                },
                {
                    titulo: "Cuadran con la lista",
                    texto:
                        "Las cifras salen de la misma regla que los grupos: «Vencidas» arriba es el mismo número que el " +
                        "grupo «Vencidas» de la lista, y «Para hoy» el del grupo «Hoy».",
                    imagen: "cifras-y-grupos.webp",
                    alt: "La cifra de vencidas y el grupo Vencidas, con el mismo número",
                },
                {
                    titulo: "Siempre al día",
                    texto:
                        "Cambian solas al completar, cancelar o crear una tarea. El botón de las flechas vuelve a traer " +
                        "la lista entera, por si tu equipo cambió algo.",
                    imagen: "cifras-actualizar.webp",
                    alt: "El botón Actualizar resaltado al lado de las cifras",
                },
            ],
            consejos: ["«Pendientes» cuenta todas las que no has cerrado, vencidas incluidas."],
        },
        {
            slug: "kanban",
            titulo: "El Kanban por tipo",
            resumen: "Las mismas tareas repartidas en columnas: llamadas, reuniones, seguimientos…",
            icono: "Kanban",
            miniatura: "mini-kanban.webp",
            pasos: [
                {
                    titulo: "Pulsa «Kanban»",
                    texto: "Arriba a la izquierda cambias de la lista al tablero, y con «Lista» vuelves.",
                    imagen: "kanban-boton.webp",
                    alt: "El botón Kanban resaltado",
                },
                {
                    titulo: "Una columna por tipo",
                    texto:
                        enLinea(COLUMNAS_DOCUMENTADAS) +
                        ". Cada una dice cuántas tiene pendientes; los tipos que crees tú salen como columnas más.",
                    imagen: "kanban.webp",
                    alt: "El tablero con sus columnas numeradas",
                },
                {
                    titulo: "Una tarea en su columna",
                    texto:
                        "La tarjeta enseña el título, el contacto, el asesor y la fecha, con sus botones de completar, " +
                        "cancelar y eliminar. Las completadas van debajo, separadas.",
                    imagen: "kanban-tarjeta.webp",
                    alt: "Una tarjeta del tablero resaltada",
                },
            ],
            consejos: ["Una tarea cambia de columna si le cambias el tipo: el tablero la coloca sola."],
        },
        {
            slug: "automatizaciones",
            titulo: "Automatizaciones por tipo",
            resumen: "Lo que pasa solo cada vez que se crea una tarea de ese tipo.",
            icono: "Zap",
            miniatura: "mini-automatizaciones.webp",
            pasos: [
                {
                    titulo: "El engranaje de la columna",
                    texto: "Cada columna del Kanban lleva un engranaje que abre las automatizaciones de ese tipo.",
                    imagen: "automatizaciones-engranaje.webp",
                    alt: "El engranaje de una columna resaltado",
                },
                {
                    titulo: "Sus automatizaciones",
                    texto:
                        "Cada una tiene un nombre, un interruptor para encenderla o apagarla y la lista de acciones que " +
                        "hace cuando se crea una tarea de ese tipo. Abajo escribes el nombre de una nueva y pulsas «Crear».",
                    imagen: "automatizaciones.webp",
                    alt: "El panel de automatizaciones de un tipo con una automatización",
                },
                {
                    titulo: "Agrega una acción",
                    texto:
                        "«Agregar acción» deja elegir qué se hace y cuántos minutos después de crear la tarea.",
                    imagen: "automatizaciones-accion.webp",
                    alt: "La ventana de nueva acción con los tipos de acción abiertos",
                },
            ],
            consejos: [
                "Las acciones que puedes elegir: " + ACCIONES_DE_AUTOMATIZACION.join(", ") + ".",
                "Con 0 minutos la acción se hace en el momento; con más, espera ese tiempo.",
                "Apagar el interruptor la detiene sin borrarla.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear una tarea",
            resumen: "El tipo, qué hay que hacer, cuándo y quién la hace.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "El botón azul de la barra abre el panel «Nueva tarea», a la derecha.",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Rellena el panel",
                    texto:
                        enLinea(CAMPOS_DE_CREAR.map((c) => c.nombre)) +
                        ". La fecha propuesta es mañana a las 9:00.",
                    imagen: "crear-panel.webp",
                    alt: "El panel Nueva tarea con sus campos numerados",
                },
                {
                    titulo: "Un tipo propio",
                    texto:
                        "Al final de la lista de tipos, «Agregar tipo» crea uno con el nombre que quieras; sale como " +
                        "una columna más en el Kanban.",
                    imagen: "crear-tipo.webp",
                    alt: "La lista de tipos abierta con Agregar tipo al final",
                },
                {
                    titulo: "Pulsa «Crear»",
                    texto: "La tarea aparece en su grupo de la lista, y su asesor recibe el aviso si lo marcaste.",
                    imagen: "crear-lista.webp",
                    alt: "La tarea recién creada en la lista",
                },
            ],
            consejos: ["La descripción es lo que se ve como título en la lista: empieza por lo que hay que hacer."],
        },
        {
            slug: "completar",
            titulo: "Completar y programar la siguiente",
            resumen: "Cuánto tiempo tomó, qué resultado dio y cuándo es la próxima.",
            icono: "ListChecks",
            miniatura: "mini-completar.webp",
            pasos: [
                {
                    titulo: "El botón verde",
                    texto: "El círculo verde de una tarea abre la ventana «Completar tarea».",
                    imagen: "completar-boton.webp",
                    alt: "El botón de completar de una tarea resaltado",
                },
                {
                    titulo: "Tiempo y resultado",
                    texto:
                        enLinea(CAMPOS_DE_COMPLETAR.slice(0, 3).map((c) => c.nombre)) +
                        ". El tiempo es obligatorio, en minutos, horas o días; los resultados rápidos son " +
                        RESULTADOS_RAPIDOS.join(", ") +
                        ".",
                    imagen: "completar-ventana.webp",
                    alt: "La ventana Completar tarea con el tiempo y el resultado",
                },
                {
                    titulo: "Programar la siguiente",
                    texto:
                        "Marca «Programar siguiente tarea», elige su tipo y su fecha: " +
                        ATAJOS_DOCUMENTADOS.join(", ") +
                        " o la que tú quieras. Sale a las 9:00.",
                    imagen: "completar-siguiente.webp",
                    alt: "La siguiente tarea programada con sus atajos de fecha",
                },
                {
                    titulo: "Pulsa «Marcar completada»",
                    texto: "La tarea pasa a Completadas con su resultado, y la siguiente entra en su grupo.",
                    imagen: "completar-hecha.webp",
                    alt: "La tarea completada con su resultado y la siguiente en la lista",
                },
            ],
            consejos: [
                "Un día son ocho horas de trabajo, no veinticuatro.",
                "Programar la siguiente es la forma de no perder un seguimiento: no tienes que acordarte de crearla.",
            ],
        },
        {
            slug: "cancelar-y-eliminar",
            titulo: "Cancelar o eliminar",
            resumen: "Sacar de la lista lo que ya no se va a hacer.",
            icono: "Trash2",
            miniatura: "mini-cancelar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "Los dos botones de cada tarea",
                    texto: "A la derecha de cada tarea están la X amarilla, que la cancela, y la papelera roja, que la elimina.",
                    imagen: "cancelar-botones.webp",
                    alt: "Una tarea con la X de cancelar y la papelera de eliminar resaltadas",
                },
                {
                    titulo: "Cancelar",
                    texto:
                        "La X amarilla saca la tarea de tu lista sin contarla como hecha. Pide confirmación, y «Volver» " +
                        "no cambia nada.",
                    imagen: "cancelar-confirmar.webp",
                    alt: "La ventana para cancelar una tarea",
                },
                {
                    titulo: "Eliminar",
                    texto:
                        "La papelera roja la borra para siempre, con su historial. También pide confirmación.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana para eliminar una tarea",
                },
            ],
            consejos: [
                "Cancela lo que ya no se va a hacer; elimina solo lo que se creó por error.",
                "Eliminar no se puede deshacer.",
            ],
        },
        {
            slug: "ficha",
            titulo: "La ficha de una tarea",
            resumen: "El texto entero, su estado y los documentos que la nombran.",
            icono: "FileText",
            miniatura: "mini-ficha.webp",
            pasos: [
                {
                    titulo: "Pulsa el título",
                    texto: "El título de una tarea abre su ficha.",
                    imagen: "ficha-titulo.webp",
                    alt: "El título de una tarea resaltado",
                },
                {
                    titulo: "Todo lo de la tarea",
                    texto:
                        "Lo que hay que hacer, completo; su tipo y su estado, cuándo vence, a quién está asignada, su " +
                        "contacto y, si ya se hizo, su resultado.",
                    imagen: "ficha.webp",
                    alt: "La ficha de una tarea abierta",
                },
                {
                    titulo: "Ir a su conversación",
                    texto: "El nombre del contacto, en azul, te lleva a su conversación en Chats.",
                    imagen: "ficha-contacto.webp",
                    alt: "La ficha con el nombre del contacto resaltado",
                },
            ],
            consejos: ["Pulsa fuera de la ficha o la X para volver a la lista."],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("tareas", GUIA_TAREAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
