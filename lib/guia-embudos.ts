/**
 * La GUÍA PÚBLICA de Embudos (`/guia/embudos`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`).
 *
 * Las listas de abajo no son decoración: el banco las compara con lo que pinta
 * `/embudos` (`EmbudosClient.tsx`) y con las reglas de `lib/embudos.ts` y
 * `lib/papelera-de-embudos.ts`. Una etapa de fábrica, un mando de columna o una
 * opción del «⋯» nueva sin su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import { ETAPAS_INICIALES, COLORES_RAPIDOS, TOPE_DE_ETAPAS, TOPE_DE_EMBUDOS } from "@/lib/embudos";
import { DIAS_EN_LA_PAPELERA } from "@/lib/papelera-de-embudos";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Embudos en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_EMBUDOS = "Panel";

/** Las cinco ZONAS de la pantalla, en el orden en que se leen. */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas del Panel",
    "La barra de trabajo",
    "El tablero por etapas",
] as const;

/** Las partes de la BARRA DE TRABAJO, en su orden (los huecos de `BarraDeAcciones` en `EmbudosClient.tsx`). */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    "Buscador",
    "Cuenta",
    "Embudo",
    "Asesor",
    "Conversaciones y Actualizar",
    "Nuevo",
    "Más acciones",
] as const;

/** Las siete etapas del «Embudo de ventas» con el que nace toda cuenta, en su orden. */
export const ETAPAS_DEL_EMBUDO_DE_VENTAS = ETAPAS_INICIALES.map((e) => e.nombre);

/** Las tres etapas del SISTEMA: se renombran, pero no se borran, ni se mueven, ni cambian de color. */
export const ETAPAS_DEL_SISTEMA = ETAPAS_INICIALES.filter((e) => e.sistema).map((e) => e.nombre);

/** Los mandos de la cabecera de una columna (sus `aria-label`), en su orden. */
export const MANDOS_DE_UNA_COLUMNA = ["Abrir la papelera", "Vaciar la columna", "Editar etapas"] as const;

/** Las opciones del «⋯» de la barra, en su orden. */
export const MENU_DE_LA_BARRA = [
    "Editar etapas",
    "Asignar asesores",
    "Renombrar embudo",
    "Usar por defecto",
    "Eliminar embudo",
] as const;

/** Las tres formas de filtrar por asesor. */
export const FILTROS_DE_ASESOR = ["Todos los asesores", "Sin asesor asignado", "Un asesor"] as const;

export const CUANTOS_COLORES_RAPIDOS = COLORES_RAPIDOS.length;
export { DIAS_EN_LA_PAPELERA, TOPE_DE_ETAPAS, TOPE_DE_EMBUDOS };

const enLinea = (lista: readonly string[]) => lista.map((x, i) => `${i + 1} ${x}`).join(" · ");

export const GUIA_EMBUDOS: Contenido = {
    titulo: "Embudos",
    subtitulo: "Tus conversaciones por etapas, de nuevo a ganado",
    descripcion:
        "Embudos ordena las conversaciones de tu cuenta en un tablero por etapas: Nuevo, Contactado, Interesado y " +
        "así hasta Ganado o Perdido. Las mueves arrastrándolas de una columna a otra. Puedes tener varios embudos, " +
        "elegir qué embudo usa cada asesor, cambiar el nombre, el color y el orden de las etapas, y vaciar lo " +
        "perdido sabiendo que lo recuperas durante " +
        DIAS_EN_LA_PAPELERA +
        " días.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas del Panel, la barra de trabajo y el tablero.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto: enLinea(ZONAS_DE_LA_PANTALLA) + ".",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Embudos con sus cinco partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Embudos está dentro de Panel. Al entrar a una pantalla " +
                        "el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Embudos dentro de Panel",
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
                        "Embudos es una pestaña del Panel, junto a Catálogo, Cobros, Proyectos y las demás: pasas de " +
                        "una a otra sin volver al menú.",
                    imagen: "pestanas.webp",
                    alt: "Las pestañas del Panel con Embudos señalada",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: enLinea(PARTES_DE_LA_BARRA_DE_TRABAJO) + ".",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas.",
                "Lo que ves en el tablero depende de tres cosas: la cuenta, el embudo y el asesor que tengas elegidos.",
            ],
        },
        {
            slug: "tablero",
            titulo: "El tablero por etapas",
            resumen: "Una columna por etapa, una tarjeta por conversación, y se mueven arrastrando.",
            icono: "Kanban",
            miniatura: "mini-tablero.webp",
            pasos: [
                {
                    titulo: "Una columna por etapa",
                    texto:
                        "Cada columna es una etapa del embudo, con su color y, al lado del nombre, cuántas " +
                        "conversaciones tiene. Ese número es el total de verdad, aunque haya muchas.",
                    imagen: "tablero.webp",
                    alt: "El tablero con sus columnas y el número de cada una",
                },
                {
                    titulo: "Una tarjeta por conversación",
                    texto:
                        "Cada tarjeta es un contacto: su nombre, su número, sus etiquetas, hace cuánto cambió de etapa y, " +
                        "abajo, el asesor que lo lleva. El número, en azul, abre su conversación en Chats.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta del tablero con sus partes",
                },
                {
                    titulo: "Arrastra para cambiar de etapa",
                    texto:
                        "Agarra una tarjeta y suéltala en otra columna: la conversación pasa a esa etapa y el número " +
                        "de las dos columnas cambia al momento.",
                    imagen: "arrastrar.webp",
                    alt: "Una tarjeta arrastrándose de Contactado a Interesado",
                },
                {
                    titulo: "Busca una conversación",
                    texto:
                        "El buscador deja solo las tarjetas que coinciden por nombre o número. Mientras buscas, cada " +
                        "columna dice cuántas coinciden de su total.",
                    imagen: "buscar.webp",
                    alt: "Una búsqueda escrita y el tablero con las tarjetas que coinciden",
                },
            ],
            consejos: [
                "La etapa también se cambia desde la conversación, en Chats, sin salir del chat.",
                "Un asesor solo puede mover las conversaciones que lleva él.",
            ],
        },
        {
            slug: "embudo-de-ventas",
            titulo: "El embudo de ventas, ya armado",
            resumen: "Toda cuenta empieza con un embudo de siete etapas listo para usar.",
            icono: "Layers",
            miniatura: "mini-embudo-de-ventas.webp",
            pasos: [
                {
                    titulo: "Siete etapas desde el primer día",
                    texto:
                        "Al abrir Embudos por primera vez ya tienes el «Embudo de ventas»: " +
                        enLinea(ETAPAS_DEL_EMBUDO_DE_VENTAS) +
                        ".",
                    imagen: "embudo-de-ventas.webp",
                    alt: "El Embudo de ventas con sus siete columnas numeradas",
                },
                {
                    titulo: "Tres etapas del sistema",
                    texto:
                        ETAPAS_DEL_SISTEMA.join(", ").replace(/, ([^,]*)$/, " y $1") +
                        " llevan un candado: les puedes cambiar el nombre, pero no se borran, no cambian de color y " +
                        "no se mueven. Nuevo va siempre primera; Ganado y Perdido, al final.",
                    imagen: "etapas-del-sistema.webp",
                    alt: "El editor de etapas con los candados de Nuevo, Ganado y Perdido",
                },
                {
                    titulo: "Las de en medio son tuyas",
                    texto:
                        "Contactado, Interesado, Cotizado y Negociación las puedes renombrar, recolorear, mover, " +
                        "borrar o completar con las tuyas.",
                    imagen: "etapas-libres.webp",
                    alt: "Las cuatro etapas de en medio resaltadas en el editor",
                },
            ],
            consejos: ["Las conversaciones sin asesor, o con uno que no tiene embudo, caen en el embudo por defecto."],
        },
        {
            slug: "selectores",
            titulo: "Elegir embudo, cuenta y asesor",
            resumen: "Los tres selectores de la barra deciden qué tablero tienes delante.",
            icono: "Filter",
            miniatura: "mini-selectores.webp",
            pasos: [
                {
                    titulo: "El selector de embudo",
                    texto:
                        "Si tu cuenta tiene más de un embudo, aquí pasas de uno a otro. Cada uno dice cuántos asesores " +
                        "lo usan, y el que se usa por defecto lo dice.",
                    imagen: "selector-embudo.webp",
                    alt: "El selector de embudo abierto con la lista de embudos",
                },
                {
                    titulo: "El selector de cuenta",
                    texto:
                        "Si de tu cuenta cuelgan otras, eliges de cuál ver el tablero. Lo que crees o muevas allí es " +
                        "de esa cuenta, y la pantalla te lo recuerda en azul.",
                    imagen: "selector-cuenta.webp",
                    alt: "El selector de cuenta abierto con tu cuenta y las que cuelgan de ella",
                },
                {
                    titulo: "El filtro de asesor",
                    texto:
                        "«Todos los asesores», «Sin asesor asignado» o uno en concreto. Si eliges a alguien que usa " +
                        "otro embudo, el tablero pasa a su embudo, y al lado de su nombre se ve a cuál.",
                    imagen: "filtro-asesor.webp",
                    alt: "El filtro de asesor abierto con sus opciones",
                },
            ],
            consejos: [
                "La plataforma recuerda en qué cuenta estabas mirando la próxima vez que abras Embudos.",
                "Un asesor no ve estos selectores: ve solo su embudo y sus conversaciones.",
            ],
        },
        {
            slug: "crear-embudo",
            titulo: "Crear, renombrar y eliminar un embudo",
            resumen: "Un embudo para ventas, otro para soporte, otro para postventa…",
            icono: "PlusCircle",
            miniatura: "mini-crear-embudo.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto:
                        "Escribe su nombre y pulsa Crear. El embudo nuevo nace con las mismas siete etapas, que " +
                        "luego cambias a tu gusto.",
                    imagen: "crear-embudo.webp",
                    alt: "La ventana Nuevo embudo con su nombre escrito",
                },
                {
                    titulo: "El «⋯» del embudo",
                    texto: "Desde los tres puntos de la barra: " + enLinea(MENU_DE_LA_BARRA) + ".",
                    imagen: "menu-del-embudo.webp",
                    alt: "El menú de los tres puntos abierto con sus opciones numeradas",
                },
                {
                    titulo: "Renombrarlo",
                    texto: "«Renombrar embudo» abre su nombre para cambiarlo. Sus etapas y conversaciones no se tocan.",
                    imagen: "renombrar-embudo.webp",
                    alt: "La ventana Renombrar embudo",
                },
                {
                    titulo: "El embudo por defecto",
                    texto:
                        "«Usar por defecto» lo hace el embudo de quien no tiene uno asignado. Eliminar un embudo pide " +
                        "confirmación y no borra ninguna conversación: vuelven al embudo por defecto.",
                    imagen: "eliminar-embudo.webp",
                    alt: "La confirmación de eliminar un embudo",
                },
            ],
            consejos: [`Una cuenta puede tener hasta ${TOPE_DE_EMBUDOS} embudos.`],
        },
        {
            slug: "etapas",
            titulo: "Editar las etapas",
            resumen: "Cambia el nombre, el color y el orden, y añade o quita etapas.",
            icono: "Palette",
            miniatura: "mini-etapas.webp",
            pasos: [
                {
                    titulo: "Abre el editor",
                    texto:
                        "Con el engranaje de cualquier columna, o con «Editar etapas» en los tres puntos de la barra.",
                    imagen: "abrir-etapas.webp",
                    alt: "El engranaje de una columna resaltado",
                },
                {
                    titulo: "Nombre y orden",
                    texto:
                        "Cada fila es una etapa: escribe su nombre y súbela o bájala con las flechas. El orden de las " +
                        "filas es el de las columnas del tablero.",
                    imagen: "etapas-nombre.webp",
                    alt: "Una etapa con su nombre y sus flechas de subir y bajar",
                },
                {
                    titulo: "El color",
                    texto:
                        `Debajo de cada etapa hay ${CUANTOS_COLORES_RAPIDOS} colores rápidos y, al final, un cuadrito ` +
                        "que abre todos los colores.",
                    imagen: "etapas-color.webp",
                    alt: "La fila de colores de una etapa",
                },
                {
                    titulo: "Añadir y quitar",
                    texto:
                        "«Nueva etapa» añade una antes de Ganado; la papelera de una fila la quita. Al guardar, las " +
                        "conversaciones de una etapa quitada pasan a la primera.",
                    imagen: "etapas-nueva.webp",
                    alt: "El botón Nueva etapa y la papelera de una fila",
                },
            ],
            consejos: [`Un embudo admite hasta ${TOPE_DE_ETAPAS} etapas. Nada cambia hasta que pulsas Guardar.`],
        },
        {
            slug: "asesores",
            titulo: "Un embudo para cada asesor",
            resumen: "Cada persona del equipo trabaja en el embudo que le asignes.",
            icono: "Users",
            miniatura: "mini-asesores.webp",
            pasos: [
                {
                    titulo: "Abre «Asignar asesores»",
                    texto: "En los tres puntos de la barra. Sale tu equipo, cada uno con el embudo que usa.",
                    imagen: "asesores.webp",
                    alt: "El panel Asesores y su embudo con el equipo",
                },
                {
                    titulo: "Elige su embudo",
                    texto:
                        "En el desplegable de cada asesor eliges su embudo, o «Sin embudo» para que use el de por " +
                        "defecto. Pulsa Guardar.",
                    imagen: "asesores-elegir.webp",
                    alt: "El desplegable de embudo de un asesor abierto",
                },
                {
                    titulo: "Sus conversaciones lo siguen",
                    texto:
                        "Una conversación está en el embudo de su asesor. Si pasa a un asesor con otro embudo, entra " +
                        "en su primera etapa; si vuelve, recupera la que tenía.",
                    imagen: "asesores-tablero.webp",
                    alt: "El tablero filtrado por un asesor en su embudo",
                },
            ],
            consejos: ["El asesor ve solo su embudo, con un candado al lado del nombre, y solo sus conversaciones."],
        },
        {
            slug: "perdido",
            titulo: "La columna Perdido y su papelera",
            resumen: `Vacía lo perdido y recupéralo durante ${DIAS_EN_LA_PAPELERA} días.`,
            icono: "Trash2",
            miniatura: "mini-perdido.webp",
            pasos: [
                {
                    titulo: "Vaciar la columna",
                    texto:
                        "Solo la columna Perdido tiene la papelera en su cabecera. Al pulsarla te dice cuántas se " +
                        "llevará y pide confirmación.",
                    imagen: "vaciar.webp",
                    alt: "La confirmación de vaciar la columna Perdido",
                },
                {
                    titulo: "La papelera",
                    texto:
                        `Lo vaciado sale del tablero y espera ${DIAS_EN_LA_PAPELERA} días en la papelera, que se abre ` +
                        "con el icono de la caja de la misma columna. Cada fila dice cuántos días le quedan.",
                    imagen: "papelera.webp",
                    alt: "La papelera de Perdido con los días que quedan",
                },
                {
                    titulo: "Restaurar",
                    texto:
                        "«Restaurar» devuelve una conversación a su etapa; «Restaurar todo», todas. Pasados los " +
                        `${DIAS_EN_LA_PAPELERA} días se borran en firme.`,
                    imagen: "restaurar.webp",
                    alt: "El botón Restaurar de una fila de la papelera",
                },
            ],
            consejos: [
                "Si filtras por un asesor, vaciar se lleva solo lo de ese asesor.",
                "Mientras está en la papelera, la conversación sigue en Chats.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("embudos", GUIA_EMBUDOS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
