/**
 * La GUÍA PÚBLICA de Respuestas Rápidas (`/guia/respuestas-rapidas`): qué dice
 * cada sección y qué captura enseña cada paso. Puro: lo leen la página, el
 * script que toma las capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Las listas de abajo (`PASTILLAS_DOCUMENTADAS`, `CATEGORIAS_DOCUMENTADAS`,
 * `PARTES_DE_UNA_RESPUESTA`…) no son decoración: el banco las compara con lo
 * que pintan los componentes de `/auto-replies`. Una pastilla, una categoría o
 * un mando nuevo en la pantalla sin su nombre aquí pone el banco en rojo, que
 * es como se evita que la guía se quede describiendo una pantalla que ya no
 * existe.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Respuestas Rápidas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_RESPUESTAS_RAPIDAS = "Automatizaciones";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La barra de trabajo",
    "La lista de respuestas",
] as const;

/**
 * Las partes de la BARRA DE TRABAJO, en su orden, con el hueco de
 * `BarraDeAcciones` donde vive cada una (`data-zona` en `MainAutoReplies.tsx`).
 */
export const PARTES_DE_LA_BARRA_DE_TRABAJO = [
    { nombre: "Buscador", zona: "buscador" },
    { nombre: "Pastillas que filtran por tipo", zona: "filtros" },
    { nombre: "Categoría", zona: "filtro-de-categoria" },
    { nombre: "Nuevo", zona: "crear" },
    { nombre: "Acciones masivas", zona: "acciones" },
] as const;

/** Las pastillas de la barra: filtran por tipo. El banco las compara con `MainAutoReplies.tsx`. */
export const PASTILLAS_DOCUMENTADAS = ["Todas", "Texto simple", "Ejecutan flujo"] as const;

/** Las categorías de una respuesta. El banco las compara con `lib/quick-reply-categories.ts`. */
export const CATEGORIAS_DOCUMENTADAS = ["General", "Ventas", "Soporte", "Cierre", "Pago"] as const;

/** Los dos tipos de la ventana de crear. El banco los compara con `ReplyTypeSelector.tsx`. */
export const TIPOS_DE_RESPUESTA = ["Texto simple", "Ejecutar flujo"] as const;

/**
 * Las partes de UNA respuesta de la lista, en su orden de izquierda a derecha,
 * con el `data-zona` que la marca (`SortableAutoRepliesList.tsx` y
 * `AutoRepliesCard.tsx`). El icono del tipo no lleva zona: se reconoce por su
 * `title`.
 */
export const PARTES_DE_UNA_RESPUESTA = [
    { nombre: "El asa para ordenar", zona: "asa" },
    { nombre: "La casilla", zona: "casilla" },
    { nombre: "Su tipo", zona: null },
    { nombre: "El atajo", zona: "atajo" },
    { nombre: "La categoría", zona: "categoria" },
    { nombre: "El mensaje", zona: "mensaje" },
    { nombre: "Sus mandos", zona: "mas-acciones" },
] as const;

/** El menú «⋯» de la barra. El banco lo compara con `MainAutoReplies.tsx`. */
export const ACCIONES_MASIVAS_DOCUMENTADAS = ["Marcar todas las que se ven", "Eliminar"] as const;

export const GUIA_RESPUESTAS_RAPIDAS: Contenido = {
    titulo: "Respuestas Rápidas",
    subtitulo: "Tus mensajes de siempre, guardados y a un atajo de distancia",
    descripcion:
        "Respuestas Rápidas guarda los mensajes que escribes una y otra vez —el saludo, los precios, los medios de " +
        "pago— para enviarlos en segundos desde cualquier chat. Las ordenas por categoría, las encuentras al " +
        "momento y, si una respuesta necesita más que un texto, hace que arranque un flujo.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, la barra de trabajo y la lista de tus respuestas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 La barra de trabajo de Respuestas Rápidas · 4 La lista de respuestas.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Respuestas Rápidas con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Respuestas Rápidas está dentro de Automatizaciones. Al entrar " +
                        "a una pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Respuestas Rápidas dentro de Automatizaciones",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto:
                        "1 Buscador · 2 Pastillas que filtran por tipo · 3 Categoría · 4 Nuevo · 5 Acciones masivas, " +
                        "para varias respuestas a la vez.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Una respuesta",
                    texto:
                        "1 El asa para ordenar · 2 La casilla · 3 Su tipo · 4 El atajo · 5 La categoría · 6 El mensaje · " +
                        "7 Sus mandos.",
                    imagen: "tarjeta.webp",
                    alt: "Una respuesta de la lista con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Respuestas Rápidas por Automatizaciones.",
                "Hay dos clases: las de texto envían un mensaje y las de flujo hacen que arranque un flujo.",
                "Lo que crea un asesor es suyo: sale marcado «De un asesor» y solo lo ven él, el dueño y los administradores.",
            ],
        },
        {
            slug: "crear-de-texto",
            titulo: "Crear una respuesta de texto",
            resumen: "Un mensaje guardado con su atajo, listo para enviarlo en segundos.",
            icono: "PlusCircle",
            miniatura: "mini-crear-de-texto.webp",
            pasos: [
                {
                    titulo: "Pulsa «Nuevo»",
                    texto: "El botón azul de la barra abre la ventana «Crear respuesta rápida».",
                    imagen: "crear-boton.webp",
                    alt: "El botón Nuevo resaltado en la barra",
                },
                {
                    titulo: "Elige «Texto simple»",
                    texto: "Arriba eliges el tipo. «Texto simple» envía un mensaje, y es el que viene marcado.",
                    imagen: "crear-texto-tipo.webp",
                    alt: "La ventana de crear con el tipo Texto simple marcado",
                },
                {
                    titulo: "El atajo",
                    texto:
                        "Es la palabra que tecleas en un chat después de «/». Se escribe en minúsculas y sin espacios, y es opcional.",
                    imagen: "crear-texto-atajo.webp",
                    alt: "El campo Atajo con una palabra escrita",
                },
                {
                    titulo: "La categoría y el mensaje",
                    texto: "Elige una categoría para ordenarlas y escribe el mensaje, que es lo único obligatorio.",
                    imagen: "crear-texto-mensaje.webp",
                    alt: "La categoría elegida y el mensaje escrito en la ventana de crear",
                },
                {
                    titulo: "Pulsa «Crear»",
                    texto: "La respuesta nueva sale la primera de la lista, con su atajo y su categoría.",
                    imagen: "crear-texto-creada.webp",
                    alt: "La respuesta recién creada, la primera de la lista",
                },
            ],
            consejos: ["Un atajo corto y fácil de recordar —/hola, /precios— es el que de verdad se usa."],
        },
        {
            slug: "crear-con-flujo",
            titulo: "Una respuesta que ejecuta un flujo",
            resumen: "En vez de un texto, hace que arranque un flujo del creador de flujos.",
            icono: "GitBranch",
            miniatura: "mini-crear-con-flujo.webp",
            pasos: [
                {
                    titulo: "Elige «Ejecutar flujo»",
                    texto: "En la ventana de crear, el segundo tipo. El mensaje deja paso al flujo que se va a ejecutar.",
                    imagen: "crear-flujo-tipo.webp",
                    alt: "La ventana de crear con el tipo Ejecutar flujo marcado",
                },
                {
                    titulo: "Nombre y flujo",
                    texto: "Ponle un nombre para reconocerla y elige el flujo, que es obligatorio.",
                    imagen: "crear-flujo-campos.webp",
                    alt: "El nombre escrito y el flujo elegido en la ventana de crear",
                },
                {
                    titulo: "Ya está en la lista",
                    texto: "Sale con su icono morado y, en vez del mensaje, el flujo que ejecuta.",
                    imagen: "crear-flujo-creada.webp",
                    alt: "La respuesta de flujo recién creada en la lista",
                },
                {
                    titulo: "Editar flujo",
                    texto: "El botón «Editar flujo» abre ese flujo en su editor para cambiar sus pasos.",
                    imagen: "flujo-editar.webp",
                    alt: "El botón Editar flujo resaltado en una respuesta",
                },
            ],
            consejos: [
                "Crea antes el flujo en el creador de flujos: sin ninguno, la ventana lo avisa.",
                "En un chat, las de flujo se usan desde el rayo; la barra «/» solo sugiere las de texto.",
            ],
        },
        {
            slug: "editar",
            titulo: "Editar una respuesta",
            resumen: "Cambia el mensaje, el atajo, la categoría o el flujo sin abrir ninguna ventana.",
            icono: "PenLine",
            miniatura: "mini-editar.webp",
            pasos: [
                {
                    titulo: "El mensaje",
                    texto: "Pulsa el texto de la respuesta y se abre para escribir. Enter guarda y Escape cancela.",
                    imagen: "editar-mensaje.webp",
                    alt: "El mensaje de una respuesta abierto para editar",
                },
                {
                    titulo: "El atajo",
                    texto: "Pulsa la pastilla del atajo para cambiarlo. Si la respuesta no tiene, sale «+ Atajo».",
                    imagen: "editar-atajo.webp",
                    alt: "El atajo de una respuesta abierto para editar",
                },
                {
                    titulo: "La categoría",
                    texto: "El desplegable de la categoría la cambia al momento.",
                    imagen: "editar-categoria.webp",
                    alt: "El desplegable de categoría de una respuesta abierto",
                },
                {
                    titulo: "El flujo",
                    texto: "En una respuesta de flujo, su desplegable cambia el flujo que ejecuta.",
                    imagen: "editar-flujo.webp",
                    alt: "El desplegable del flujo de una respuesta abierto",
                },
            ],
            consejos: [
                "Cada cambio se guarda solo, y un aviso abajo lo confirma.",
                "El mensaje no puede quedar vacío: si lo borras todo, vuelve el de antes.",
                "Un asesor usa las respuestas de la cuenta, pero solo cambia las suyas.",
            ],
        },
        {
            slug: "filtrar-y-buscar",
            titulo: "Filtrar y buscar",
            resumen: "Encuentra una respuesta por su tipo, su categoría o lo que dice.",
            icono: "Filter",
            miniatura: "mini-filtrar-y-buscar.webp",
            pasos: [
                {
                    titulo: "Las pastillas",
                    texto: "1 Todas · 2 Texto simple · 3 Ejecutan flujo. Cada una dice cuántas hay.",
                    imagen: "filtros-pastillas.webp",
                    alt: "Las tres pastillas de la barra numeradas",
                },
                {
                    titulo: "Un filtro puesto",
                    texto: "Pulsa una pastilla para ver solo esas. Pulsarla otra vez, o «Todas», quita el filtro.",
                    imagen: "filtros-activo.webp",
                    alt: "La pastilla Ejecutan flujo puesta y la lista filtrada",
                },
                {
                    titulo: "Por categoría",
                    texto: "El desplegable deja solo las de una categoría, y dice cuántas tiene cada una.",
                    imagen: "filtros-categoria.webp",
                    alt: "El desplegable de categorías abierto con sus números",
                },
                {
                    titulo: "El buscador",
                    texto: "Busca en el atajo, el mensaje, el flujo y la categoría. No hace falta escribir las tildes.",
                    imagen: "buscar-resultado.webp",
                    alt: "Una búsqueda escrita y la lista con lo que coincide",
                },
                {
                    titulo: "Sin resultados",
                    texto: "Si nada coincide lo dice, y «Quitar filtros» vuelve a enseñarlas todas.",
                    imagen: "buscar-vacio.webp",
                    alt: "La lista vacía con el botón Quitar filtros",
                },
            ],
            consejos: ["Con un filtro puesto, debajo de la lista se lee cuántas ves de cuántas hay."],
        },
        {
            slug: "ordenar",
            titulo: "Ordenar la lista",
            resumen: "Arrastra para dejar arriba las que más usas; el orden es el mismo en tus chats.",
            icono: "ArrowUpDown",
            miniatura: "mini-ordenar.webp",
            pasos: [
                {
                    titulo: "El asa",
                    texto: "Agarra la respuesta por los seis puntos de la izquierda y suéltala donde la quieras.",
                    imagen: "ordenar-asa.webp",
                    alt: "El asa de una respuesta resaltada",
                },
                {
                    titulo: "Se guarda solo",
                    texto: "Al soltarla sale «Orden actualizado». Es el mismo orden en que las ves en tus chats.",
                    imagen: "ordenar-guardado.webp",
                    alt: "La lista reordenada con el aviso Orden actualizado",
                },
                {
                    titulo: "Con un filtro puesto",
                    texto: "Con una búsqueda o un filtro puesto no se reordena: el asa se apaga y dice por qué.",
                    imagen: "ordenar-bloqueado.webp",
                    alt: "El asa apagada con el aviso de quitar los filtros",
                },
            ],
            consejos: ["Una respuesta nueva sale la primera: muévela a su sitio cuando quieras."],
        },
        {
            slug: "usar-en-un-chat",
            titulo: "Usarlas en un chat",
            resumen: "Envía una respuesta desde la conversación con «/» o con el rayo.",
            icono: "Zap",
            miniatura: "mini-usar-en-un-chat.webp",
            pasos: [
                {
                    titulo: "Teclea «/»",
                    texto: "En la caja de escribir de una conversación, teclea «/» y el atajo: salen las respuestas que coinciden.",
                    imagen: "chat-barra.webp",
                    alt: "La caja de escribir de un chat con las respuestas sugeridas encima",
                },
                {
                    titulo: "El texto queda listo",
                    texto: "Elige una y su mensaje queda en la caja. Lo revisas y lo envías.",
                    imagen: "chat-listo.webp",
                    alt: "El mensaje de una respuesta puesto en la caja de escribir",
                },
                {
                    titulo: "El rayo",
                    texto: "El rayo de la barra de escribir abre Atajos: tus respuestas, con su atajo y su categoría.",
                    imagen: "chat-atajos.webp",
                    alt: "El panel Atajos abierto desde el rayo de la barra de escribir",
                },
                {
                    titulo: "Las de flujo",
                    texto: "Las que ejecutan un flujo llevan su icono. Pulsar una la envía: sale el texto o arranca el flujo.",
                    imagen: "chat-atajos-flujo.webp",
                    alt: "Una respuesta de flujo resaltada en el panel Atajos",
                },
            ],
            consejos: [
                "En un chat salen las respuestas de la cuenta dueña de la línea de esa conversación.",
                "La barra «/» sugiere las de texto con atajo; en el rayo salen todas.",
            ],
        },
        {
            slug: "eliminar",
            titulo: "Eliminar respuestas",
            resumen: "Borra una respuesta, o varias a la vez con las acciones masivas.",
            icono: "Trash2",
            miniatura: "mini-eliminar.webp",
            pasos: [
                {
                    titulo: "El «⋯» de una respuesta",
                    texto: "El botón de los tres puntos de la respuesta tiene «Eliminar».",
                    imagen: "eliminar-menu.webp",
                    alt: "El menú de tres puntos de una respuesta abierto con Eliminar",
                },
                {
                    titulo: "Siempre pide confirmación",
                    texto: "La ventana avisa que se borra para siempre. «Cancelar» no cambia nada.",
                    imagen: "eliminar-confirmar.webp",
                    alt: "La ventana de confirmación para eliminar una respuesta",
                },
                {
                    titulo: "Varias a la vez",
                    texto: "Marca las casillas de las que quieras borrar, o «Marcar todas las que se ven» en el «⋯» de la barra.",
                    imagen: "masivas-marcar.webp",
                    alt: "Varias respuestas marcadas con su casilla",
                },
                {
                    titulo: "El «⋯» de la barra",
                    texto: "Su «Eliminar» borra de una vez todas las marcadas, y también pide confirmación.",
                    imagen: "masivas-menu.webp",
                    alt: "El menú de acciones masivas abierto con Eliminar",
                },
            ],
            consejos: [
                "Eliminar no se puede deshacer.",
                "Solo se pueden marcar las respuestas que tú puedes borrar.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("respuestas-rapidas", GUIA_RESPUESTAS_RAPIDAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
