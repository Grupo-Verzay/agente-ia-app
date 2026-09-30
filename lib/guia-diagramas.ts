/**
 * La GUÍA PÚBLICA de Diagramas (`/diagramas`), la segunda después de Leads y
 * con su mismo estándar: tarjetas de sección con capturas, un vídeo narrado y
 * la demostración de un minuto.
 *
 * Esto es el CONTENIDO, y es puro a propósito, igual que `lib/guia-leads.ts`:
 * lo pintan las páginas públicas (`app/guia/diagramas/**`), lo recorre el
 * script que toma las capturas (`scripts/capturar-guia-diagramas.mjs`) y lo
 * comprueba el banco (`lib/__tests__/guia-diagramas.test.mjs`). Una sola lista
 * de secciones y de imágenes: si la página nombrara una captura que el script
 * no toma, se vería un hueco; si el script tomara una que nadie enseña, sería
 * peso muerto en el repositorio.
 *
 * Y el texto se ata al CÓDIGO de la pantalla, que es como una guía no se queda
 * describiendo una pantalla que ya no existe. Cada lista de abajo tiene su
 * pareja en el código y el banco las compara:
 *
 *   | aquí                         | allí                                          |
 *   | ---------------------------- | --------------------------------------------- |
 *   | `NIVELES_CON_EL_EQUIPO`      | `COMPARTIR` de `DiagramasListClient.tsx`       |
 *   | `OPCIONES_DE_LA_TARJETA`     | el menú «⋯» de la tarjeta, en ese mismo fichero |
 *   | `PASOS_PRINCIPALES`          | `diagramaPrincipalActions`                     |
 *   | `PASOS_DE_ACCION`            | `diagramaAccionActions`                        |
 *   | `SALIDAS_DE_LA_DECISION`     | los `SourceDotHandle` de la Decisión           |
 *   | `CONTROLES_DEL_LIENZO`       | `ETIQUETAS_DEL_LIENZO` de `FlowCanvas.tsx`      |
 *   | `BOTONES_DE_UN_PASO`         | la barra que sale al pasar el cursor (`FlowNode.tsx`) |
 *   | `HERRAMIENTAS_DE_LA_IDEA`    | la barra de la nota Idea (`IdeaNode.tsx`)       |
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";

// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** Dónde vive Diagramas en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_DIAGRAMAS = "Panel";

/**
 * Las seis ZONAS de la lista, en el orden en que se leen, tal como las numera
 * la captura de «Todo en una pantalla». Una más que en Leads: Diagramas vive
 * dentro de Panel, y un módulo con apartados pinta arriba su fila de pestañas.
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "Las pestañas de Panel",
    "La barra de trabajo",
    "Las carpetas",
    "Tus diagramas",
] as const;

/** Las zonas del EDITOR, como las numera la captura de «Todo en el lienzo». */
export const ZONAS_DEL_EDITOR = [
    "Volver y el nombre",
    "Ordenar",
    "Guardado",
    "El lienzo",
    "Los controles",
] as const;

/** Con quién del EQUIPO se comparte. El banco lo compara con `COMPARTIR`. */
export const NIVELES_CON_EL_EQUIPO = [
    { nombre: "Privado", ayuda: "Solo tú lo ves" },
    { nombre: "Solo lectura", ayuda: "El equipo lo ve, no lo cambia" },
    { nombre: "Editable", ayuda: "El equipo puede cambiarlo" },
] as const;

/** El menú «⋯» de cada tarjeta, en su orden. */
export const OPCIONES_DE_LA_TARJETA = ["Renombrar", "Duplicar", "Compartir con otras cuentas", "Eliminar"] as const;

/** Los pasos de la lista «Selecciona una acción», grupo por grupo y en su orden. */
export const PASOS_PRINCIPALES = [
    "Idea",
    "Libre",
    "Decisión",
    "Campaña",
    "Ejecutar Paso",
    "Ejecutar flujo",
    "Consultar datos",
    "Agregar una nota",
    "Llamado a la acción",
    "Esperar una respuesta",
    "Finalización del proceso",
] as const;

export const PASOS_DE_ACCION = [
    "Menú de opciones",
    "Tomar solicitud",
    "Enviar cotización",
    "Enviar medio de pago",
    "Agendar la cita",
    "Enviar link acción",
    "Registrar datos",
    "Notificar asesor",
    "Escalar a humano",
    "Activar seguimiento",
    "Iniciar automatización",
] as const;

/** Las tres salidas de una Decisión, de arriba abajo. */
export const SALIDAS_DE_LA_DECISION = ["Sí", "Variante", "No"] as const;

/** Los botones de abajo a la izquierda del lienzo, de arriba abajo. */
export const CONTROLES_DEL_LIENZO = ["Acercar", "Alejar", "Ver todo el diagrama", "Bloquear o desbloquear el lienzo"] as const;

/** Lo que sale encima de un paso al pasar el cursor, de izquierda a derecha. */
export const BOTONES_DE_UN_PASO = ["Tamaño", "Duplicar nodo", "Eliminar nodo"] as const;

/** La segunda fila de la barra de la nota Idea (la primera son los emojis). */
export const HERRAMIENTAS_DE_LA_IDEA = ["Escribir en la nota", "Negrita", "Duplicar la nota", "Eliminar la nota", "Color de la nota"] as const;

export const GUIA_DIAGRAMAS: Contenido = {
    titulo: "Diagramas",
    subtitulo: "Tus procesos, dibujados paso a paso",
    descripcion:
        "Diagramas es la pizarra donde dibujas cómo funciona un proceso: por dónde entra el cliente, qué se le " +
        "pregunta, qué pasa según responda y cómo termina. No ejecuta nada: sirve para pensarlo, para " +
        "explicárselo a tu equipo y para enseñarle a un cliente cómo va a funcionar su atención. Aquí " +
        "aprendes a crearlos, a armar los pasos en el editor, a compartirlos y a tenerlos en orden.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: "El menú, la barra de arriba, las pestañas de Panel, la barra de trabajo, las carpetas y tus diagramas.",
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba, la misma en todas las pantallas · " +
                        "3 Las pestañas de Panel, con Diagramas marcada · 4 La barra de trabajo de Diagramas · " +
                        "5 Las carpetas · 6 Tus diagramas, una tarjeta por diagrama.",
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Diagramas con sus seis partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        "Todos los módulos de la plataforma. Diagramas está dentro de Panel: arriba salen sus pestañas, " +
                        "con Diagramas marcada. Al entrar a una pantalla el menú se recoge en sus iconos; las dos " +
                        "flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: "El menú de la izquierda abierto, con Diagramas dentro de Panel",
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La barra de trabajo",
                    texto: "1 El nombre de la pantalla y cuántos diagramas tienes · 2 Nuevo, para crear uno · 3 Acciones, para varios a la vez.",
                    imagen: "barra.webp",
                    alt: "La barra de trabajo con cada parte numerada",
                },
                {
                    titulo: "Cada tarjeta es un diagrama",
                    texto:
                        "1 El asa, para cambiarla de sitio · 2 El nombre · 3 La casilla, para marcarla · " +
                        "4 Cuántos pasos tiene y cuándo se editó · 5 Con quién del equipo se comparte · " +
                        "6 La carpeta · 7 Más opciones. Pulsa la tarjeta para abrir el diagrama.",
                    imagen: "tarjeta.webp",
                    alt: "Una tarjeta de diagrama con cada parte numerada",
                },
            ],
            consejos: [
                "El menú y la barra de arriba son los mismos en todas las pantallas: desde cualquiera llegas a Diagramas por Panel.",
                "Un diagrama no envía nada a nadie: explica un proceso. Para que algo pase de verdad están los flujos.",
            ],
        },
        {
            slug: "crear",
            titulo: "Crear un diagrama",
            resumen: "Ponle un nombre y empieza con el Inicio y una Decisión ya puestos.",
            icono: "PlusCircle",
            miniatura: "mini-crear.webp",
            pasos: [
                {
                    titulo: "Pulsa «+ Nuevo»",
                    texto: "Es el botón azul de la barra.",
                    imagen: "crear-boton.webp",
                    alt: "El botón azul Nuevo resaltado",
                },
                {
                    titulo: "Ponle un nombre",
                    texto: "Escríbelo y pulsa «Crear», o Enter. No puede llamarse igual que otro de tus diagramas.",
                    imagen: "crear-dialogo.webp",
                    alt: "La ventana Nuevo diagrama con el nombre escrito",
                },
                {
                    titulo: "Se abre el editor",
                    texto:
                        "Nace con dos pasos ya conectados: 1 Inicio, por donde arranca el proceso · 2 Una Decisión, para " +
                        "empezar a repartir los caminos.",
                    imagen: "crear-editor.webp",
                    alt: "El editor de un diagrama nuevo con Inicio y Decisión numerados",
                },
            ],
            consejos: [
                "El nombre se cambia después desde el «⋯» de su tarjeta, con «Renombrar».",
                "Para partir de uno que ya tienes, usa «Duplicar» en su «⋯»: la copia es tuya y el original no se toca.",
            ],
        },
        {
            slug: "editor",
            titulo: "El editor de un vistazo",
            resumen: "El nombre, el guardado automático, Ordenar, el lienzo y sus controles.",
            icono: "LayoutGrid",
            miniatura: "mini-editor.webp",
            pasos: [
                {
                    titulo: "Todo en el lienzo",
                    texto:
                        "1 Volver a la lista y el nombre del diagrama · 2 Ordenar · 3 Guardado · " +
                        "4 El lienzo, con los pasos y sus conexiones · 5 Los controles.",
                    imagen: "editor-vista.webp",
                    alt: "El editor de un diagrama con sus cinco partes numeradas",
                },
                {
                    titulo: "Se guarda solo",
                    texto:
                        "Cada cambio se guarda solo, un segundo después. El botón dice «Guardar» mientras hay algo por " +
                        "mandar, «Guardando...» y después «Guardado». Púlsalo si quieres guardar sin esperar.",
                    imagen: "editor-guardado.webp",
                    alt: "El botón de guardado en su estado Guardado",
                },
                {
                    titulo: "Ordenar",
                    texto: "Acomoda todos los pasos en carriles, de izquierda a derecha, sin moverlos uno por uno.",
                    imagen: "editor-ordenar.webp",
                    alt: "El botón Ordenar resaltado encima del lienzo",
                },
                {
                    titulo: "Los controles",
                    texto:
                        "1 Acercar · 2 Alejar · 3 Ver todo el diagrama · 4 Bloquear el lienzo, para mirarlo sin " +
                        "arrastrar un paso por error.",
                    imagen: "editor-controles.webp",
                    alt: "Los controles del lienzo con cada botón numerado",
                },
            ],
            consejos: [
                "Arrastra el fondo del lienzo para moverte; la rueda del ratón acerca y aleja.",
                "La flecha de la izquierda, junto al nombre, te devuelve a la lista de diagramas.",
            ],
        },
        {
            slug: "agregar-pasos",
            titulo: "Agregar y conectar pasos",
            resumen: "El «+» de cada paso, la lista de tipos y cómo unir un paso con otro.",
            icono: "GitBranch",
            miniatura: "mini-agregar-pasos.webp",
            pasos: [
                {
                    titulo: "El «+» de cada salida",
                    texto:
                        "A la derecha de cada paso está su punto de salida y, al lado, un «+». Si el paso ya sigue " +
                        "hacia otro, el «+» aparece al pasar el cursor.",
                    imagen: "pasos-mas.webp",
                    alt: "El botón más junto a la salida de un paso",
                },
                {
                    titulo: "Selecciona una acción",
                    texto:
                        "1 El buscador · 2 Principales, los de todos los días · 3 Acciones, lo que se hace con el cliente. " +
                        "Elige uno y queda puesto y conectado.",
                    imagen: "pasos-paleta.webp",
                    alt: "La lista Selecciona una acción con sus partes numeradas",
                },
                {
                    titulo: "Busca por su nombre",
                    texto: "Escribe una palabra y la lista se queda con los que coinciden. Con las flechas y Enter eliges sin el ratón.",
                    imagen: "pasos-buscar.webp",
                    alt: "La lista filtrada al escribir cita",
                },
                {
                    titulo: "El paso nuevo, ya conectado",
                    texto: "Aparece a la derecha, unido al paso de donde saliste.",
                    imagen: "pasos-nuevo.webp",
                    alt: "El paso nuevo conectado y el aviso de nodo creado",
                },
                {
                    titulo: "Conectar arrastrando",
                    texto: "Arrastra desde 1, el punto de salida de un paso, hasta 2, el punto de entrada de otro.",
                    imagen: "pasos-conectar.webp",
                    alt: "Una conexión a medio arrastrar entre dos pasos",
                },
                {
                    titulo: "La Decisión tiene tres salidas",
                    texto: "Sí, Variante y No: cada una lleva a su propio camino.",
                    imagen: "pasos-decision.webp",
                    alt: "Una Decisión con sus salidas Sí, Variante y No",
                },
                {
                    titulo: "Quitar una conexión",
                    texto: "Pulsa la línea y sale el botón «Eliminar».",
                    imagen: "pasos-quitar.webp",
                    alt: "Una conexión seleccionada con su botón Eliminar",
                },
            ],
            consejos: [
                "Un paso al que no le llega ninguna línea lleva una chincheta roja: es por donde entra la conversación.",
                "«Finalización del proceso» no tiene salida: después de un final no sigue nada.",
            ],
        },
        {
            slug: "editar-un-paso",
            titulo: "Escribir y cambiar un paso",
            resumen: "El nombre, el texto de cada paso, su tamaño, duplicarlo y eliminarlo.",
            icono: "PenLine",
            miniatura: "mini-editar-un-paso.webp",
            pasos: [
                {
                    titulo: "El nombre, encima del paso",
                    texto: "Púlsalo y escríbelo ahí mismo.",
                    imagen: "paso-nombre.webp",
                    alt: "El nombre de un paso resaltado encima de su caja",
                },
                {
                    titulo: "El texto de un paso",
                    texto:
                        "Pulsa la caja del paso y se abre una ventana: 1 El nombre · 2 Lo que pasa en ese paso. " +
                        "«Listo» lo guarda; «Cancelar» lo deja como estaba.",
                    imagen: "paso-dialogo.webp",
                    alt: "La ventana de un paso con sus campos numerados",
                },
                {
                    titulo: "Se lee debajo",
                    texto: "El texto aparece debajo de la caja. Púlsalo para volver a cambiarlo.",
                    imagen: "paso-texto.webp",
                    alt: "El texto de un paso debajo de su caja",
                },
                {
                    titulo: "Los botones del paso",
                    texto: "Al pasar el cursor por encima: 1 Tamaño S, M o L · 2 Duplicar · 3 Eliminar.",
                    imagen: "paso-botones.webp",
                    alt: "Los tres botones de un paso numerados",
                },
            ],
            consejos: [
                "Para mover un paso, arrástralo por su caja.",
                "El tamaño no cambia lo que significa el paso: sirve para destacar los importantes.",
            ],
        },
        {
            slug: "idea-y-libre",
            titulo: "La nota Idea y el paso Libre",
            resumen: "Notas sueltas para pensar el diagrama y un paso que se diseña a tu gusto.",
            icono: "StickyNote",
            miniatura: "mini-idea-y-libre.webp",
            pasos: [
                {
                    titulo: "La Idea es una nota",
                    texto: "Se escribe directamente dentro: púlsala y escribe. No es un paso del proceso, es un apunte.",
                    imagen: "idea-nota.webp",
                    alt: "Una nota Idea con texto en el lienzo",
                },
                {
                    titulo: "Sus herramientas",
                    texto: "Al pasar el cursor: 1 Emojis · 2 Escribir, negrita, duplicar y eliminar · 3 Colores.",
                    imagen: "idea-herramientas.webp",
                    alt: "La barra de la nota Idea con cada parte numerada",
                },
                {
                    titulo: "Estírala",
                    texto: "Desde el punto de la esquina de abajo a la derecha: ancha, alta o pequeña.",
                    imagen: "idea-estirar.webp",
                    alt: "El punto para estirar la nota en su esquina",
                },
                {
                    titulo: "El paso Libre",
                    texto:
                        "No trae nada decidido: 1 Dentro de la caja, un icono o un texto corto · 2 El icono · " +
                        "3 El color · 4 El largo de la caja.",
                    imagen: "libre-dialogo.webp",
                    alt: "La ventana del paso Libre con sus opciones numeradas",
                },
                {
                    titulo: "Así se ve",
                    texto: "Una caja con tu icono o tu texto, del color y el largo que elegiste.",
                    imagen: "libre-ejemplo.webp",
                    alt: "Pasos Libres con icono y con texto en el lienzo",
                },
            ],
            consejos: [
                "En la Idea, lo que escribas entre dos asteriscos se ve en negrita al dejar de escribir.",
                "Una Idea no cuenta como paso: úsala para dejar preguntas o recordatorios mientras piensas el proceso.",
            ],
        },
        {
            slug: "compartir",
            titulo: "Compartir con tu equipo y con otras cuentas",
            resumen: "Quién lo ve, quién lo cambia y cómo se ve uno que te compartieron.",
            icono: "Users",
            miniatura: "mini-compartir.webp",
            pasos: [
                {
                    titulo: "Con tu equipo",
                    texto:
                        "Abajo a la izquierda de la tarjeta: 1 Privado, solo tú lo ves · 2 Solo lectura, el equipo lo ve y no " +
                        "lo cambia · 3 Editable, el equipo puede cambiarlo.",
                    imagen: "compartir-equipo.webp",
                    alt: "El menú Con el equipo con sus tres opciones numeradas",
                },
                {
                    titulo: "Con otras cuentas",
                    texto:
                        "En el «⋯» de la tarjeta, «Compartir con otras cuentas»: 1 Busca la cuenta · 2 Actívala · " +
                        "3 Elige si solo lo mira o si puede editarlo. «Guardar» lo comparte.",
                    imagen: "compartir-cuentas.webp",
                    alt: "La ventana de compartir con otras cuentas",
                },
                {
                    titulo: "Lo que te comparten",
                    texto: "Sale en tu lista con su marca: 1 «Compartido contigo», solo lo miras · 2 «Compartido · editable», puedes cambiarlo.",
                    imagen: "compartir-recibido.webp",
                    alt: "Una tarjeta con la marca Compartido contigo",
                },
                {
                    titulo: "Uno de solo lectura",
                    texto: "Se abre con la marca «Solo lectura»: puedes recorrerlo y acercarte, pero no mover ni cambiar nada.",
                    imagen: "compartir-lectura.webp",
                    alt: "El editor de un diagrama de solo lectura",
                },
            ],
            consejos: [
                "Duplicar uno que te compartieron crea una copia tuya, que sí puedes cambiar.",
                "Solo quien creó el diagrama, o un administrador, decide con quién se comparte.",
            ],
        },
        {
            slug: "carpetas-y-orden",
            titulo: "Carpetas, orden y opciones",
            resumen: "Agrupa tus diagramas en carpetas, cámbialos de sitio y renómbralos, duplícalos o elimínalos.",
            icono: "FolderOpen",
            miniatura: "mini-carpetas-y-orden.webp",
            pasos: [
                {
                    titulo: "Las carpetas",
                    texto: "1 Todas · 2 Una carpeta, con cuántos tiene · 3 Sin carpeta · 4 Nueva carpeta.",
                    imagen: "carpetas-barra.webp",
                    alt: "La fila de carpetas con cada parte numerada",
                },
                {
                    titulo: "Crear una carpeta",
                    texto: "Pulsa «Nueva carpeta», escribe el nombre y guárdala.",
                    imagen: "carpetas-nueva.webp",
                    alt: "La ventana Nueva carpeta",
                },
                {
                    titulo: "Meter un diagrama en una carpeta",
                    texto: "El icono de carpeta de la tarjeta abre la lista: elige una, o «Sin carpeta» para sacarlo.",
                    imagen: "carpetas-mover.webp",
                    alt: "La lista para mover un diagrama a una carpeta",
                },
                {
                    titulo: "Cambiarlo de sitio",
                    texto: "Arrastra la tarjeta por su asa, arriba a la izquierda, y suéltala donde la quieras.",
                    imagen: "carpetas-reordenar.webp",
                    alt: "El asa de una tarjeta para reordenarla",
                },
                {
                    titulo: "Más opciones",
                    texto: "El «⋯» de la tarjeta: Renombrar, Duplicar, Compartir con otras cuentas y Eliminar.",
                    imagen: "tarjeta-opciones.webp",
                    alt: "El menú de más opciones de una tarjeta abierto",
                },
            ],
            consejos: [
                "Eliminar una carpeta no elimina los diagramas que tenía: vuelven a salir sueltos.",
                "El orden de las tarjetas es el mismo para todo tu equipo.",
            ],
        },
        {
            slug: "acciones-masivas",
            titulo: "Eliminar varios a la vez",
            resumen: "Marca los diagramas que sobran y elimínalos juntos desde el «⋯» de la barra.",
            icono: "MoreHorizontal",
            miniatura: "mini-acciones-masivas.webp",
            pasos: [
                {
                    titulo: "Marca los diagramas",
                    texto: "Con la casilla de arriba a la derecha de cada tarjeta.",
                    imagen: "masivas-marcar.webp",
                    alt: "Dos tarjetas marcadas con su casilla",
                },
                {
                    titulo: "El botón «⋯» de la barra",
                    texto: "Dice cuántos marcaste y ofrece eliminarlos.",
                    imagen: "masivas-menu.webp",
                    alt: "El menú de acciones con Eliminar 2 diagramas",
                },
                {
                    titulo: "Siempre pide confirmación",
                    texto: "«Cancelar» no cambia nada; «Eliminar» los borra y no se puede deshacer.",
                    imagen: "masivas-confirmar.webp",
                    alt: "La ventana que pide confirmar antes de eliminar",
                },
            ],
            consejos: [
                "Los diagramas que te compartieron no llevan casilla: no se eliminan desde tu cuenta.",
                "Para uno solo, usa «Eliminar» en el «⋯» de su tarjeta.",
            ],
        },
    ],
};

/** La guía armada con las piezas comunes (`laGuiaDe`): la carpeta, el vídeo y la navegación. */
export const GUIA = laGuiaDe("diagramas", GUIA_DIAGRAMAS);

/** Dónde viven las capturas, servidas desde `public/`. Es la misma ruta que la guía. */
export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
/** El vídeo de demostración, grabado por el mismo script que las capturas. */
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
