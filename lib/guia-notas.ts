/**
 * La GUÍA PÚBLICA de Mis notas (`/guia/notas`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con `laGuiaDe`) y se pinta con
 * las MISMAS piezas (`components/guia/Guia.tsx`): una tarjeta por sección, sus
 * pasos con capturas de la pantalla real y un vídeo de un minuto narrado.
 *
 * Las listas de abajo (`PARTES_DE_LA_BARRA_DE_LA_NOTA`, `PESTANAS_DEL_PANEL`,
 * `FORMATOS_DEL_TEXTO`…) no son decoración: el banco las compara con lo que
 * pintan los componentes de `/notas`. Un botón nuevo en la pantalla sin su
 * nombre aquí pone el banco en rojo, que es como se evita que la guía se quede
 * describiendo una pantalla que ya no existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Mis notas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_NOTAS = "Herramientas";

/**
 * Las cinco ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "El panel de notas",
    "La barra de la nota",
    "La nota",
] as const;

/**
 * Los mandos de la BARRA DE LA NOTA abierta, en su orden de izquierda a
 * derecha, con el nombre que enseña cada uno al posar el cursor (`title` en
 * `NotesEditor.tsx`). El estado de guardado no es un botón: no tiene nombre.
 */
export const PARTES_DE_LA_BARRA_DE_LA_NOTA = [
    { nombre: "Ocultar el panel", titulo: "Ocultar panel" },
    { nombre: "Icono", titulo: "Icono de la nota" },
    { nombre: "Color", titulo: "Color de nota" },
    { nombre: "Guardado", titulo: null },
    { nombre: "Compartir", titulo: "Compartir con el equipo" },
    { nombre: "Contacto", titulo: "Vincular contacto" },
    { nombre: "Plantillas", titulo: "Nueva nota desde plantilla" },
    { nombre: "Exportar", titulo: "Exportar" },
    { nombre: "Modo enfoque", titulo: "Modo enfoque" },
    { nombre: "Historial", titulo: "Historial" },
    { nombre: "Fijar", titulo: "Fijar" },
    { nombre: "Archivar", titulo: "Archivar nota" },
    { nombre: "Eliminar", titulo: "Eliminar nota" },
] as const;

/** Las cuatro pestañas del panel: lo que se lee y el nombre entero al posar el cursor. */
export const PESTANAS_DEL_PANEL = [
    { rotulo: "Todas", titulo: "Todas" },
    { rotulo: "Sueltas", titulo: "Sin carpeta" },
    { rotulo: "Compartidas", titulo: "Compartidas" },
    { rotulo: "Archivo", titulo: "Archivadas" },
] as const;

/**
 * La barra de FORMATO del texto, grupo por grupo y en su orden, con el nombre
 * de cada botón (`EditorDeTexto.tsx`, cortado por sus separadores).
 */
export const FORMATOS_DEL_TEXTO = [
    { grupo: "Texto", botones: ["Negrita", "Cursiva", "Subrayado", "Tachado", "Código inline"] },
    { grupo: "Títulos", botones: ["Título 1", "Título 2", "Título 3"] },
    { grupo: "Listas y bloques", botones: ["Lista", "Lista numerada", "Lista de tareas", "Cita", "Bloque de código"] },
    { grupo: "Alinear", botones: ["Alinear izquierda", "Centrar", "Alinear derecha"] },
    { grupo: "Separador", botones: ["Separador"] },
    { grupo: "Deshacer y rehacer", botones: ["Deshacer", "Rehacer"] },
] as const;

/** Las plantillas, tal como salen en su menú. */
export const PLANTILLAS_DOCUMENTADAS = ["📋 Reunión", "📞 Seguimiento cliente", "✅ Lista de tareas"] as const;

/** Los formatos del menú Exportar. */
export const FORMATOS_DE_EXPORTAR = ["Markdown (.md)", "Texto (.txt)"] as const;

/** Los colores de una nota, con su nombre al posar el cursor. */
export const COLORES_DE_LA_NOTA = ["Sin color", "Amarillo", "Rosa", "Verde", "Azul", "Violeta", "Naranja", "Gris"] as const;

/** Los tres niveles de compartir (`lib/niveles-de-acceso.ts`). */
export const NIVELES_DE_COMPARTIR = ["Sin acceso", "Solo lectura", "Puede editar"] as const;

/** El menú «⋯» de una nota de la lista, y el de una carpeta. */
export const MENU_DE_LA_NOTA = ["Fijar", "Mover a carpeta", "Eliminar"] as const;
export const MENU_DE_LA_CARPETA = ["Editar", "Eliminar"] as const;

export const GUIA_NOTAS: Contenido = {
    titulo: "Mis notas",
    subtitulo: "Tus apuntes, ordenados en carpetas y a mano cuando los necesitas",
    descripcion:
        "Mis notas es tu cuaderno dentro de la plataforma. Escribes con formato, ordenas en carpetas, encuentras " +
        "cualquier nota en segundos, la vinculas a un contacto de WhatsApp, la compartes con tu equipo y la " +
        "archivas cuando ya no la necesitas a la vista.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, el panel de notas, la barra de la nota y la nota abierta.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 El panel de notas · 4 La barra de la nota abierta · 5 La nota: su título, su texto y el pie.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Mis notas con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Mis notas está dentro de Herramientas. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Mis notas dentro de Herramientas",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "El panel de notas",
                    texto:
                        "1 Nueva carpeta · 2 Nueva nota · 3 Las cuatro pestañas · 4 El buscador · 5 Tus notas · 6 Tus carpetas.",
                    imagen: "panel.webp",
                    alt: "El panel de la izquierda con cada parte numerada",
                },
                {
                    titulo: "La barra de la nota",
                    texto:
                        "1 Ocultar el panel · 2 Icono · 3 Color · 4 Guardado · 5 Compartir · 6 Contacto · 7 Plantillas · " +
                        "8 Exportar · 9 Modo enfoque · 10 Historial · 11 Fijar · 12 Archivar · 13 Eliminar.",
                    imagen: "barra-de-la-nota.webp",
                    alt: "La barra de la nota abierta con cada botón numerado",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Mis notas por Herramientas.",
                "Tus notas son tuyas: nadie del equipo las ve si no las compartes.",
                "Pasa el cursor por cualquier botón para ver su nombre.",
            ],
        },
        {
            slug: "crear-y-escribir",
            titulo: "Crear y escribir una nota",
            resumen: "Una nota nueva, su título, su texto y cómo sabes que ya se guardó.",
            icono: "PenLine",
            miniatura: "mini-crear-y-escribir.webp",
            pasos: [
                {
                    titulo: "Pulsa «+»",
                    texto: "Es el botón «Nueva nota» de arriba del panel. La nota se crea al momento y queda abierta.",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nueva nota resaltado arriba del panel",
                },
                {
                    titulo: "El título",
                    texto: "Escríbelo arriba de la nota. Sale siempre en mayúsculas y se guarda al pulsar Enter o al pasar al texto.",
                    imagen: "crear-titulo.webp",
                    alt: "El título de una nota nueva escrito en mayúsculas",
                },
                {
                    titulo: "El texto",
                    texto: "Escribe debajo, como en cualquier documento. La barra de formato está justo encima del texto.",
                    imagen: "crear-texto.webp",
                    alt: "El texto de la nota escrito bajo la barra de formato",
                },
                {
                    titulo: "Se guarda sola",
                    texto: "Mientras escribes dice «Guardando...» y a los pocos segundos «Guardado». No hay botón de guardar.",
                    imagen: "crear-guardado.webp",
                    alt: "El aviso Guardado en la barra de la nota",
                },
                {
                    titulo: "El pie de la nota",
                    texto: "Abajo a la izquierda, cuántas palabras lleva la nota.",
                    imagen: "crear-palabras.webp",
                    alt: "El pie de la nota con el número de palabras",
                },
            ],
            consejos: [
                "Una nota nueva se crea dentro de la carpeta que tengas abierta.",
                "Si no hay ninguna nota abierta, el botón «Nueva nota» del centro de la pantalla hace lo mismo.",
            ],
        },
        {
            slug: "formato",
            titulo: "Dar formato al texto",
            resumen: "Negrita, títulos, listas, tareas, alineación y deshacer.",
            icono: "Type",
            miniatura: "mini-formato.webp",
            pasos: [
                {
                    titulo: "La barra de formato",
                    texto:
                        "1 Texto · 2 Títulos · 3 Listas y bloques · 4 Alinear · 5 Separador · 6 Deshacer y rehacer.",
                    imagen: "formato-barra.webp",
                    alt: "La barra de formato con sus seis grupos numerados",
                },
                {
                    titulo: "Negrita, cursiva y más",
                    texto: "Selecciona el texto y pulsa el botón. Vuelve a pulsarlo para quitarlo.",
                    imagen: "formato-negrita.webp",
                    alt: "Una palabra en negrita con su botón marcado",
                },
                {
                    titulo: "Títulos",
                    texto: "«Título 1», «Título 2» y «Título 3» convierten la línea en un encabezado, del más grande al más pequeño.",
                    imagen: "formato-titulos.webp",
                    alt: "Una línea convertida en título",
                },
                {
                    titulo: "Lista de tareas",
                    texto: "Cada línea lleva su casilla: márcala cuando termines esa tarea.",
                    imagen: "formato-tareas.webp",
                    alt: "Una lista de tareas con una casilla marcada",
                },
                {
                    titulo: "Deshacer y rehacer",
                    texto: "«Deshacer» quita el último cambio y «Rehacer» lo vuelve a poner.",
                    imagen: "formato-deshacer.webp",
                    alt: "Los botones Deshacer y Rehacer resaltados",
                },
            ],
            consejos: [
                "Texto: Negrita, Cursiva, Subrayado, Tachado y Código inline. Listas y bloques: Lista, Lista numerada, Lista de tareas, Cita y Bloque de código.",
                "Alinear: izquierda, centro o derecha. El Separador pone una línea horizontal entre dos partes de la nota.",
            ],
        },
        {
            slug: "carpetas",
            titulo: "Ordenar en carpetas",
            resumen: "Crea carpetas con su color, abre una y mueve notas dentro.",
            icono: "FolderOpen",
            miniatura: "mini-carpetas.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nueva carpeta»",
                    texto: "Es el botón de la carpeta con un «+», arriba del panel, al lado de «Nueva nota».",
                    imagen: "carpetas-boton.webp",
                    alt: "El botón Nueva carpeta resaltado",
                },
                {
                    titulo: "Nombre y color",
                    texto: "1 Escribe el nombre · 2 Elige uno de los diez colores · 3 Pulsa «Crear».",
                    imagen: "carpetas-dialogo.webp",
                    alt: "La ventana Nueva carpeta con sus partes numeradas",
                },
                {
                    titulo: "Abrir una carpeta",
                    texto: "Púlsala y debajo salen sus notas. El número de al lado dice cuántas tiene, sin contar las archivadas.",
                    imagen: "carpetas-abierta.webp",
                    alt: "Una carpeta abierta con sus notas debajo",
                },
                {
                    titulo: "Mover una nota a una carpeta",
                    texto: "En el «⋯» de la nota, «Mover a carpeta» y elige la carpeta. «Sin carpeta» la saca de todas.",
                    imagen: "carpetas-mover.webp",
                    alt: "El menú Mover a carpeta de una nota abierto",
                },
                {
                    titulo: "Editar o eliminar la carpeta",
                    texto: "El «⋯» de la carpeta: «Editar» cambia su nombre o su color; «Eliminar» la borra y sus notas pasan a Sueltas.",
                    imagen: "carpetas-menu.webp",
                    alt: "El menú de una carpeta abierto, con Editar y Eliminar",
                },
            ],
            consejos: [
                "Eliminar una carpeta no borra ninguna nota: las encuentras en la pestaña Sueltas.",
                "El «⋯» de una nota o de una carpeta aparece al pasar el cursor por encima.",
            ],
        },
        {
            slug: "buscar-y-ordenar",
            titulo: "Buscar y ordenar",
            resumen: "Las cuatro pestañas, el buscador, fijar arriba y arrastrar.",
            icono: "Search",
            miniatura: "mini-buscar-y-ordenar.webp",
            pasos: [
                {
                    titulo: "Las cuatro pestañas",
                    texto:
                        "1 Todas · 2 Sueltas, las que no están en ninguna carpeta · 3 Compartidas, las que te compartieron · 4 Archivo.",
                    imagen: "buscar-pestanas.webp",
                    alt: "Las cuatro pestañas del panel numeradas",
                },
                {
                    titulo: "El buscador",
                    texto: "Escribe en «Buscar notas...»: busca en el título y en el texto, con o sin tildes.",
                    imagen: "buscar-resultado.webp",
                    alt: "El resultado de buscar una palabra en las notas",
                },
                {
                    titulo: "Fijar arriba",
                    texto: "En el «⋯» de la nota, «Fijar». Sube arriba de la lista, con las demás fijadas, y lleva una chincheta.",
                    imagen: "buscar-fijar.webp",
                    alt: "Una nota fijada arriba de la lista con su chincheta",
                },
                {
                    titulo: "Arrastrar para ordenar",
                    texto: "Agarra la nota por los puntos de su izquierda y suéltala donde quieras. El orden se guarda.",
                    imagen: "buscar-arrastrar.webp",
                    alt: "El asa de arrastrar de una nota resaltada",
                },
            ],
            consejos: [
                "El buscador busca dentro de la pestaña o la carpeta que tengas abierta.",
                "Con algo escrito en el buscador no se puede arrastrar: bórralo para ordenar.",
            ],
        },
        {
            slug: "icono-y-color",
            titulo: "Icono y color",
            resumen: "Distingue una nota de otra de un vistazo.",
            icono: "Palette",
            miniatura: "mini-icono-y-color.webp",
            pasos: [
                {
                    titulo: "El icono",
                    texto: "Pulsa la carita de la barra de la nota y elige uno de los treinta iconos.",
                    imagen: "icono-menu.webp",
                    alt: "Los iconos de la nota abiertos",
                },
                {
                    titulo: "Se ve en la lista",
                    texto: "El icono sale delante del título de la nota en el panel. Pulsar el mismo otra vez lo quita.",
                    imagen: "icono-lista.webp",
                    alt: "Una nota con su icono en la lista",
                },
                {
                    titulo: "El color",
                    texto: "El círculo de al lado: Sin color, Amarillo, Rosa, Verde, Azul, Violeta, Naranja y Gris.",
                    imagen: "color-menu.webp",
                    alt: "Los colores de la nota abiertos",
                },
                {
                    titulo: "La nota con su color",
                    texto: "El fondo de la nota entera toma ese color. «Sin color» lo quita.",
                    imagen: "color-nota.webp",
                    alt: "Una nota con el fondo amarillo",
                },
            ],
            consejos: ["Pasa el cursor por cada color para ver su nombre."],
        },
        {
            slug: "vincular-contacto",
            titulo: "Vincular un contacto",
            resumen: "Une la nota a un contacto de WhatsApp y abre su chat desde ella.",
            icono: "Link2",
            miniatura: "mini-vincular-contacto.webp",
            pasos: [
                {
                    titulo: "Pulsa «Vincular contacto»",
                    texto: "Es el botón de la persona con un «+» en la barra de la nota.",
                    imagen: "contacto-boton.webp",
                    alt: "El botón Vincular contacto resaltado",
                },
                {
                    titulo: "Busca el contacto",
                    texto: "Escribe su nombre o su número y pulsa el contacto. Son los contactos de tu cuenta.",
                    imagen: "contacto-dialogo.webp",
                    alt: "La ventana Vincular contacto con el buscador y la lista",
                },
                {
                    titulo: "Queda en la barra",
                    texto: "Su nombre sale en azul en la barra de la nota. La «x» lo desvincula.",
                    imagen: "contacto-vinculado.webp",
                    alt: "El contacto vinculado en azul en la barra de la nota",
                },
                {
                    titulo: "Abrir su chat",
                    texto: "Abajo a la derecha de la nota sale su nombre: púlsalo y se abre su conversación en Chats.",
                    imagen: "contacto-pie.webp",
                    alt: "El contacto en el pie de la nota",
                },
            ],
            consejos: ["Una nota se vincula a un solo contacto. Para cambiarlo, quita el que tiene y vincula otro."],
        },
        {
            slug: "compartir",
            titulo: "Compartir con el equipo",
            resumen: "Decide quién ve la nota y quién puede editarla.",
            icono: "Users",
            miniatura: "mini-compartir.webp",
            pasos: [
                {
                    titulo: "Pulsa «Compartir con el equipo»",
                    texto: "Es el botón de las dos personas en la barra de la nota.",
                    imagen: "compartir-boton.webp",
                    alt: "El botón Compartir con el equipo resaltado",
                },
                {
                    titulo: "Tres niveles por persona",
                    texto: "1 Sin acceso · 2 Solo lectura · 3 Puede editar. Se guarda al pulsar.",
                    imagen: "compartir-niveles.webp",
                    alt: "La ventana de compartir con los tres niveles numerados",
                },
                {
                    titulo: "Lo que te compartieron",
                    texto: "En la pestaña Compartidas. El lápiz dice que puedes editarla; el ojo, que solo puedes leerla.",
                    imagen: "compartir-recibidas.webp",
                    alt: "La pestaña Compartidas con notas de otra persona",
                },
                {
                    titulo: "Una nota de solo lectura",
                    texto: "La barra dice «Solo lectura» y de quién es. Puedes leerla y exportarla, no cambiarla.",
                    imagen: "compartir-lectura.webp",
                    alt: "Una nota compartida abierta en solo lectura",
                },
            ],
            consejos: [
                "Solo quien escribió la nota puede compartirla, archivarla o eliminarla.",
                "Si la eliminas, deja de estar también para quienes la tenían compartida.",
            ],
        },
        {
            slug: "plantillas-y-exportar",
            titulo: "Plantillas, exportar, enfoque e historial",
            resumen: "Empieza con una plantilla, descarga la nota, escribe sin distracciones y mira sus cambios.",
            icono: "FileStack",
            miniatura: "mini-plantillas-y-exportar.webp",
            pasos: [
                {
                    titulo: "Nueva nota desde plantilla",
                    texto: "Tres plantillas: Reunión, Seguimiento cliente y Lista de tareas. Crean una nota nueva; la abierta no cambia.",
                    imagen: "plantillas-menu.webp",
                    alt: "El menú de plantillas abierto",
                },
                {
                    titulo: "Exportar",
                    texto: "Descarga la nota como «Markdown (.md)» o como «Texto (.txt)».",
                    imagen: "exportar-menu.webp",
                    alt: "El menú Exportar abierto",
                },
                {
                    titulo: "Modo enfoque",
                    texto: "La nota ocupa toda la pantalla. El mismo botón, «Salir del modo enfoque», la devuelve a su sitio.",
                    imagen: "enfoque.webp",
                    alt: "Una nota en modo enfoque ocupando toda la pantalla",
                },
                {
                    titulo: "Historial",
                    texto: "Qué se hizo con la nota y cuándo, lo más reciente arriba: crearla, cada cambio, compartirla, archivarla y recuperarla.",
                    imagen: "historial.webp",
                    alt: "El panel Historial de una nota",
                },
            ],
            consejos: ["El archivo .md abre con formato en cualquier editor de Markdown; el .txt es texto limpio."],
        },
        {
            slug: "archivar-y-eliminar",
            titulo: "Archivar y eliminar",
            resumen: "Quita una nota de la vista sin perderla, o bórrala para siempre.",
            icono: "Archive",
            miniatura: "mini-archivar-y-eliminar.webp",
            pasos: [
                {
                    titulo: "Archivar",
                    texto: "Pulsa la caja de la barra de la nota. Sale de tus notas y queda en la pestaña Archivo.",
                    imagen: "archivar-boton.webp",
                    alt: "El botón Archivar nota resaltado",
                },
                {
                    titulo: "Desarchivar",
                    texto: "En Archivo, abre la nota: el mismo botón dice «Desarchivar nota» y la devuelve a tus notas.",
                    imagen: "desarchivar.webp",
                    alt: "Una nota archivada con el botón Desarchivar nota",
                },
                {
                    titulo: "Eliminar",
                    texto: "La papelera roja de la barra, o «Eliminar» en el «⋯» de la nota.",
                    imagen: "eliminar-boton.webp",
                    alt: "El botón Eliminar nota resaltado",
                },
                {
                    titulo: "Siempre pide confirmación",
                    texto: "La ventana avisa que se borra para siempre. «Cancelar» no cambia nada.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana de confirmación para eliminar una nota",
                },
            ],
            consejos: [
                "Si solo quieres quitarla de la vista, archívala: no se pierde nada y la recuperas cuando quieras.",
                "Eliminar no se puede deshacer.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("notas", GUIA_NOTAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
