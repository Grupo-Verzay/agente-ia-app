/**
 * La GUÍA PÚBLICA de Mis datos (`/guia/mis-datos`): qué dice cada sección y qué
 * captura enseña cada paso. Puro: lo leen la página, el script que toma las
 * capturas y graba el vídeo, y el banco.
 *
 * Es la MISMA forma que la guía de Leads (`lib/guia-leads.ts`, armada con
 * `laGuiaDe`) y se pinta con las MISMAS piezas (`components/guia/Guia.tsx`):
 * una tarjeta por sección, sus pasos con capturas de la pantalla real y un
 * vídeo de un minuto narrado.
 *
 * Los nombres de la pantalla —sus dos opciones, sus pestañas, las columnas de
 * la tabla y los separadores— salen de `lib/pantalla-de-mis-datos.ts`, que es
 * de donde los lee también la pantalla: la guía no los puede contar distinto.
 * Lo que la pantalla escribe a mano (los tipos de datos, el resumen de una
 * importación, los campos de un bloque y las acciones de cada «⋯») va en las
 * listas de abajo, y el banco (`lib/__tests__/guia-mis-datos.test.mjs`) las
 * compara con los componentes de `/my-data`. Un botón nuevo en la pantalla sin
 * su nombre aquí pone el banco en rojo.
 */

import { laGuiaDe, TEXTO_DE_LA_BARRA_DE_ARRIBA, type Contenido } from "@/lib/guia-de-modulo";
import {
    ETIQUETAS_DE_LAS_COLUMNAS,
    PESTANAS_DE_LA_SECCION,
    REGISTROS_POR_PAGINA,
    SECCIONES_DE_MIS_DATOS,
    SEPARADORES_DE_LA_BASE,
    TITULO_DE_LA_PANTALLA,
} from "@/lib/pantalla-de-mis-datos";

export type { Paso, Seccion } from "@/lib/guia-de-modulo";
// La barra de arriba es la misma en todas las guías: se reexporta para que los
// bancos que compilan solo esta guía la sigan encontrando aquí.
export { PARTES_DE_LA_BARRA_DE_ARRIBA } from "@/lib/guia-de-modulo";

/** La ruta de la pantalla que documenta esta guía. */
export const RUTA_DE_MIS_DATOS = "/my-data";

/** Dónde vive Mis datos en el menú. El banco lo compara con el menú sembrado. */
export const MODULO_DE_MIS_DATOS = "Integraciones";

/**
 * Las cuatro ZONAS de la pantalla, en el orden en que se leen, tal como las
 * numera la captura de «Todo en una pantalla».
 */
export const ZONAS_DE_LA_PANTALLA = [
    "El menú de la plataforma",
    "La barra de arriba",
    "La cabecera de Mis datos",
    "Las dos opciones",
] as const;

const [SHEETS, BASE] = SECCIONES_DE_MIS_DATOS.map((s) => s.nombre);
const [IMPORTAR, GESTIONAR] = PESTANAS_DE_LA_SECCION.map((p) => p.rotulo);

/** Los dos tipos de datos de Google Sheets, tal como salen en su selector. */
export const TIPOS_DE_DATOS = [
    "👤 Clientes — clave por número WhatsApp",
    "📋 Catálogo / Referencia — clave por cualquier campo",
] as const;

/** Los cuatro números del resumen de una importación de Google Sheets. */
export const RESUMEN_DE_LA_IMPORTACION = ["Creados", "Actualizados", "Errores", "Total"] as const;

/** Los botones de la importación de Google Sheets, en su orden. */
export const BOTONES_DE_SHEETS = ["Ver columnas de la hoja", "Limpiar", "Iniciar importación"] as const;

/** Los campos de un bloque de conocimiento, en el orden de su ventana. */
export const CAMPOS_DEL_BLOQUE = ["Título", "Palabras clave", "Categoría", "Contenido"] as const;

/** Las acciones del «⋯» de cada opción, sin el número que llevan al lado. */
export const ACCIONES_DE_SHEETS = ["Eliminar todos los datos"] as const;
export const ACCIONES_DE_LA_BASE = [
    "Activar todos los bloques",
    "Desactivar todos los bloques",
    "Eliminar bloques inactivos",
    "Eliminar todos los bloques",
] as const;

const COLUMNAS = Object.values(ETIQUETAS_DE_LAS_COLUMNAS);
/** «a, b y c»: una lista como se lee. */
const enFrase = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs.join(""));

export const GUIA_MIS_DATOS: Contenido = {
    titulo: TITULO_DE_LA_PANTALLA,
    subtitulo: "Los datos de tu negocio, al alcance de tu agente IA",
    descripcion:
        "Mis datos es donde le das a tu agente IA la información de tu negocio para que la use al responder: tus " +
        "clientes o tu catálogo desde una hoja de Google, y los textos de tu negocio divididos en bloques que el " +
        "agente consulta solo cuando le preguntan por ellos.",
    secciones: [
        {
            slug: "vista-general",
            titulo: "La pantalla de un vistazo",
            resumen: `El menú, la barra de arriba, la cabecera y las dos opciones: ${SHEETS} y ${BASE}.`,
            icono: "LayoutDashboard",
            miniatura: "mini-vista-general.webp",
            pasos: [
                {
                    titulo: "Todo en una pantalla",
                    texto:
                        "1 El menú de la plataforma · 2 La barra de arriba · 3 La cabecera de Mis datos · " +
                        `4 Las dos opciones: ${SHEETS} y ${BASE}.`,
                    imagen: "vista-general.webp",
                    alt: "La pantalla de Mis datos con sus cuatro partes numeradas",
                },
                {
                    titulo: "El menú de la plataforma",
                    texto:
                        `Todos los módulos de la plataforma. Mis datos está dentro de ${MODULO_DE_MIS_DATOS}. Al entrar a una ` +
                        "pantalla el menú se recoge en sus iconos; las dos flechas de arriba lo abren entero.",
                    imagen: "menu-lateral.webp",
                    alt: `El menú de la izquierda abierto, con Mis datos dentro de ${MODULO_DE_MIS_DATOS}`,
                },
                {
                    titulo: "La barra de arriba",
                    texto: TEXTO_DE_LA_BARRA_DE_ARRIBA,
                    imagen: "barra-de-arriba.webp",
                    alt: "La barra de arriba con cada botón numerado",
                },
                {
                    titulo: "La cabecera de Mis datos",
                    texto:
                        `A la derecha van los accesos a las dos opciones, ${SHEETS} y ${BASE}, en todas las vistas. ` +
                        "El de la opción abierta sale en azul.",
                    imagen: "cabecera.webp",
                    alt: "La cabecera con el título y los dos accesos",
                },
                {
                    titulo: "Dentro de cada opción",
                    texto:
                        `Las dos se usan igual: ${IMPORTAR} trae los datos, ${GESTIONAR} los muestra y los edita, y el ⋯ ` +
                        "tiene las acciones de toda la opción. La flecha junto al título vuelve aquí.",
                    imagen: "dentro.webp",
                    alt: `Una opción abierta con sus pestañas ${IMPORTAR} y ${GESTIONAR}, el ⋯ y la flecha de volver`,
                },
            ],
            consejos: [
                "Lo que cargas aquí es de tu cuenta: lo ve y lo usa todo tu equipo.",
                "Los accesos de la cabecera cambian de opción sin volver a la portada.",
            ],
        },
        {
            slug: "google-sheets",
            titulo: "Importar desde Google Sheets",
            resumen: "Pega el enlace de tu hoja, elige si son clientes o un catálogo e impórtala.",
            icono: "FileSpreadsheet",
            miniatura: "mini-google-sheets.webp",
            pasos: [
                {
                    titulo: "Pega el enlace de tu hoja",
                    texto:
                        "Comparte tu hoja como «cualquiera con el enlace puede ver» y pega su enlace en el campo, o con el " +
                        "botón de pegar.",
                    imagen: "sheets-enlace.webp",
                    alt: "El campo del enlace de la hoja, con el botón de pegar",
                },
                {
                    titulo: "Clientes o catálogo",
                    texto:
                        "Clientes: cada fila es un cliente, unido a su número de WhatsApp. Catálogo / Referencia: cada fila " +
                        "se reconoce por la columna que elijas, como un SKU.",
                    imagen: "sheets-tipo.webp",
                    alt: "El selector con los dos tipos de datos",
                },
                {
                    titulo: "Ver columnas de la hoja",
                    texto:
                        "Lee la hoja sin importar nada: enseña sus columnas y las primeras filas, y ahí eliges cuál es la " +
                        "del número o la de la clave.",
                    imagen: "sheets-columnas.webp",
                    alt: "La vista previa de la hoja con la columna del número elegida",
                },
                {
                    titulo: "Iniciar importación",
                    texto:
                        "El registro de actividad va contando cada paso, y el resumen dice cuántos se crearon, cuántos se " +
                        "actualizaron, cuántos fallaron y el total.",
                    imagen: "sheets-resultado.webp",
                    alt: "El registro de actividad y el resumen de la importación",
                },
            ],
            consejos: [
                "Si un cliente o una clave ya existía, se actualiza: no se duplica.",
                "Volver a importar la misma hoja pone al día lo que cambió en ella.",
                "Limpiar vacía el formulario y el registro para empezar otra importación.",
            ],
        },
        {
            slug: "datos-importados",
            titulo: "Los datos importados",
            resumen: "La tabla con todo lo que tienes: buscar, elegir columnas, crear, editar y eliminar.",
            icono: "Database",
            miniatura: "mini-datos-importados.webp",
            pasos: [
                {
                    titulo: "La tabla",
                    texto: `${GESTIONAR} enseña cada registro en ${COLUMNAS.length} columnas: ${enFrase(COLUMNAS)}.`,
                    imagen: "datos-tabla.webp",
                    alt: "La tabla de datos importados con sus columnas",
                },
                {
                    titulo: "Buscar y elegir columnas",
                    texto: "El buscador encuentra por número o por clave, y Columnas decide cuáles se ven.",
                    imagen: "datos-buscar.webp",
                    alt: "El buscador con un número escrito y la tabla filtrada",
                },
                {
                    titulo: "Crear un registro a mano",
                    texto:
                        "Nuevo abre una ventana: el número de WhatsApp o la clave, y cada dato como un campo con su valor. " +
                        "Agregar campo suma otro.",
                    imagen: "datos-nuevo.webp",
                    alt: "La ventana de un registro nuevo con sus campos",
                },
                {
                    titulo: "Editar y eliminar",
                    texto:
                        "Cada fila lleva su lápiz para editarla y su papelera para eliminarla. Marcando varias, el ⋯ de la " +
                        "barra las elimina a la vez.",
                    imagen: "datos-fila.webp",
                    alt: "Una fila con el lápiz y la papelera, y la barra con el ⋯",
                },
                {
                    titulo: "Cargar más",
                    texto:
                        `Se cargan de ${REGISTROS_POR_PAGINA} en ${REGISTROS_POR_PAGINA}: el pie dice cuántos ves de ` +
                        "cuántos hay, y Cargar más trae los siguientes.",
                    imagen: "datos-cargar-mas.webp",
                    alt: "El pie de la tabla con el conteo y el botón Cargar más",
                },
            ],
            consejos: [
                "El número o la clave de un registro no se cambia al editarlo: se crea otro y se elimina el viejo.",
                "La fuente dice de dónde vino cada registro: Google Sheets o Manual.",
            ],
        },
        {
            slug: "base-de-conocimiento",
            titulo: "Importar a la base de conocimiento",
            resumen: "Pega el texto de tu negocio y se divide solo en bloques que el agente consulta.",
            icono: "BookOpen",
            miniatura: "mini-base-de-conocimiento.webp",
            pasos: [
                {
                    titulo: "Pega tu contenido",
                    texto:
                        "Tu catálogo, tus precios, tus preguntas frecuentes: pega el texto con un título por tema y cada " +
                        "tema se convierte en un bloque.",
                    imagen: "kb-pegar.webp",
                    alt: "El cuadro de texto con el contenido pegado",
                },
                {
                    titulo: "El separador de secciones",
                    texto:
                        `${SEPARADORES_DE_LA_BASE[0].rotulo.split(" (")[0]} reconoce solo los títulos con ###, las líneas --- y ` +
                        "las líneas en blanco dobles. Si tu texto usa uno solo, elígelo aquí.",
                    imagen: "kb-separador.webp",
                    alt: "El selector del separador abierto con sus cuatro opciones",
                },
                {
                    titulo: "Importar y dividir",
                    texto:
                        "El resumen dice cuántos bloques se crearon y cuáles. Cada uno guarda su título, sus palabras " +
                        "clave y su contenido.",
                    imagen: "kb-resultado.webp",
                    alt: "El resumen con los bloques creados",
                },
            ],
            consejos: [
                "El agente lee solo los bloques que tienen que ver con la pregunta: responde mejor y gasta menos que con todo el texto.",
                "Si no se detectó ninguna sección, prueba con otro separador.",
            ],
        },
        {
            slug: "bloques",
            titulo: "Los bloques de conocimiento",
            resumen: "La lista de bloques: buscar, crear, activar o desactivar, editar y eliminar.",
            icono: "Layers",
            miniatura: "mini-bloques.webp",
            pasos: [
                {
                    titulo: "La lista de bloques",
                    texto:
                        "Cada bloque con su título, su categoría, sus palabras clave y el principio del contenido. Arriba, " +
                        "cuántos hay y cuántos están activos.",
                    imagen: "bloques-lista.webp",
                    alt: "La lista de bloques de conocimiento",
                },
                {
                    titulo: "Activar y desactivar",
                    texto:
                        "El interruptor apaga un bloque sin borrarlo: el agente deja de usarlo y sale como Inactivo. " +
                        "Encenderlo lo devuelve.",
                    imagen: "bloques-interruptor.webp",
                    alt: "Un bloque inactivo con su interruptor apagado",
                },
                {
                    titulo: "Crear un bloque",
                    texto:
                        `Nuevo abre la ventana: ${enFrase(CAMPOS_DEL_BLOQUE)}. Las palabras clave son las que el agente ` +
                        "busca en la pregunta del cliente.",
                    imagen: "bloques-nuevo.webp",
                    alt: "La ventana de un bloque nuevo con sus cuatro campos",
                },
                {
                    titulo: "Buscar, editar y eliminar",
                    texto:
                        "El buscador encuentra por título, palabra clave o categoría. Cada bloque lleva su lápiz y su " +
                        "papelera.",
                    imagen: "bloques-buscar.webp",
                    alt: "La lista filtrada por la búsqueda, con el lápiz y la papelera",
                },
            ],
            consejos: [
                "Un bloque corto y de un solo tema funciona mejor que uno largo con todo.",
                "Apagar un bloque es la forma de probar sin perderlo.",
            ],
        },
        {
            slug: "acciones",
            titulo: "Las acciones de cada opción",
            resumen: "El ⋯ de cada opción: acciones sobre todos los datos o todos los bloques, con confirmación.",
            icono: "MoreHorizontal",
            miniatura: "mini-acciones.webp",
            pasos: [
                {
                    titulo: `El ⋯ de ${SHEETS}`,
                    texto: `${ACCIONES_DE_SHEETS[0]}, con cuántos registros se van a borrar.`,
                    imagen: "acciones-sheets.webp",
                    alt: `El menú ⋯ de ${SHEETS} abierto`,
                },
                {
                    titulo: `El ⋯ de ${BASE}`,
                    texto: `${enFrase(ACCIONES_DE_LA_BASE)}. Cada una dice cuántos bloques toca.`,
                    imagen: "acciones-base.webp",
                    alt: `El menú ⋯ de ${BASE} abierto con sus cuatro acciones`,
                },
                {
                    titulo: "Siempre pide confirmación",
                    texto:
                        "Antes de hacer nada se abre una ventana que dice lo que va a pasar. Eliminar no se puede " +
                        "deshacer.",
                    imagen: "acciones-confirmar.webp",
                    alt: "La ventana de confirmación de una acción",
                },
            ],
            consejos: [
                "El número de cada acción se cuenta al abrir el ⋯: siempre es el de ese momento.",
                "Una acción que no tiene nada que tocar sale apagada.",
            ],
        },
    ],
};

export const GUIA = laGuiaDe("mis-datos", GUIA_MIS_DATOS);

export const CARPETA_DE_CAPTURAS = GUIA.carpeta;
export const VIDEO_DE_DEMOSTRACION = GUIA.video;
export const PORTADA_DEL_VIDEO = GUIA.portada;
export const SECCIONES = GUIA.secciones;
export const { laSeccion, lasVecinas, lasCapturasQueSeEnsenan, laRutaDeLaCaptura } = GUIA;
