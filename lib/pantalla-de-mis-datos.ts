/**
 * Las reglas de la pantalla de Mis datos (`/my-data`) que se pueden decidir sin
 * pintar nada. Puro: lo usan la pantalla y la guía pública, y el banco lo prueba
 * sin base ni navegador (`scripts/banco-pantalla-de-mis-datos.sh`).
 *
 * La pantalla tiene DOS secciones —Google Sheets y la Base de conocimiento— que
 * hacen lo mismo con dos clases de dato: importar y después gestionar lo
 * importado. Estaban escritas cada una a su manera y no se leían como la misma
 * pantalla:
 *
 *   - las pestañas se llamaban «Importar / Gestión» en una e «Importar
 *     contenido / Gestionar bloques» en la otra, con iconos distintos;
 *   - el «⋯» de cada sección medía 32 px en una y 36 en la otra, con un icono
 *     vertical que no es el «⋯» del resto de la plataforma;
 *   - la lista de bloques pintaba su barra a mano («Nuevo bloque» y el buscador
 *     suelto debajo) mientras la de datos usa la barra de la plataforma.
 *
 * Por eso lo que ven las dos sale de aquí: el nombre de cada sección, sus dos
 * pestañas y cómo se escriben los números. Con dos copias, el día que se afine
 * una la otra se queda atrás.
 */

/** Cómo se llama la pantalla: el MISMO nombre que su entrada del menú. */
export const TITULO_DE_LA_PANTALLA = "Mis datos";

export type SeccionDeMisDatos = "sheets" | "knowledge";

/**
 * Las dos secciones, en el orden en que se ofrecen. `nombre` es lo que dicen el
 * atajo de la cabecera, la tarjeta de la portada y el rótulo de su «⋯»: una
 * sección se llama igual en los tres sitios.
 */
export const SECCIONES_DE_MIS_DATOS: readonly { id: SeccionDeMisDatos; nombre: string }[] = [
    { id: "sheets", nombre: "Google Sheets" },
    { id: "knowledge", nombre: "Base de conocimiento" },
];

export function elNombreDeLaSeccion(id: SeccionDeMisDatos): string {
    return SECCIONES_DE_MIS_DATOS.find((s) => s.id === id)?.nombre ?? id;
}

/** Las dos pestañas de CADA sección, las mismas en las dos. */
export const PESTANAS_DE_LA_SECCION = [
    { valor: "import", rotulo: "Importar" },
    { valor: "management", rotulo: "Gestionar" },
] as const;

/**
 * Cómo se llama cada columna de la tabla de datos en su menú «Columnas». El
 * menú pintaba el id interno con la primera letra en mayúscula («RemoteJid»,
 * «Data», «Source», «UpdatedAt»): cuatro palabras en inglés en una pantalla en
 * español. La cabecera de la columna y su casilla en el menú dicen lo mismo.
 */
export const ETIQUETAS_DE_LAS_COLUMNAS: Record<string, string> = {
    remoteJid: "WhatsApp o clave",
    data: "Datos",
    source: "Fuente",
    updatedAt: "Actualizado",
};

export function laEtiquetaDeLaColumna(id: string): string {
    return ETIQUETAS_DE_LAS_COLUMNAS[id] ?? id;
}

/**
 * La FUENTE de un registro, como se lee. Se guardaba y se enseñaba el valor
 * interno —«google_sheets», con su guion bajo—. Lo que no se reconoce se enseña
 * tal cual: inventarle un nombre sería decir de dónde vino algo que no se sabe.
 */
export function laFuente(source: string | null | undefined): string {
    const s = (source ?? "").trim();
    if (!s || s === "manual") return "Manual";
    if (s === "google_sheets") return "Google Sheets";
    if (s === "api") return "API";
    if (s === "import") return "Importación";
    return s;
}

/**
 * Cuántos registros se piden en cada vuelta. La lista cargaba los 200 más
 * recientes y el pie decía el TOTAL, así que con más de 200 la paginación no
 * llegaba a los demás y el buscador no los encontraba: un número que no se
 * puede alcanzar. Ahora se piden de 200 en 200 con «Cargar más».
 */
export const REGISTROS_POR_PAGINA = 200;

export function quedanPorCargar(cargados: number, total: number): number {
    return Math.max(0, total - cargados);
}

/**
 * El pie de la tabla. Con todo cargado dice el total; con registros por traer
 * dice cuántos hay DELANTE de cuántos: «200 de 350» se entiende, «350» sobre una
 * paginación que se acaba en 200 no.
 */
export function elPieDeLaTabla({
    cargados,
    total,
    pagina,
    paginas,
}: {
    cargados: number;
    total: number;
    pagina: number;
    paginas: number;
}): string {
    const cuantos = quedanPorCargar(cargados, total) > 0 ? `${cargados} de ${total}` : `${total}`;
    return `${cuantos} registro(s) · página ${pagina} de ${Math.max(1, paginas)}`;
}

/** Junta una página nueva a lo que ya había, sin repetir ninguno y en su orden. */
export function juntarLosRegistros<T extends { id: string | number }>(previos: readonly T[], nuevos: readonly T[]): T[] {
    const vistos = new Set(previos.map((r) => String(r.id)));
    return [...previos, ...nuevos.filter((r) => !vistos.has(String(r.id)))];
}

/**
 * La columna clave de la importación, dicha IGUAL con y sin la vista previa.
 * Sin vista previa el campo se llamaba siempre «Columna con el número WhatsApp»,
 * también en modo catálogo, donde la clave es un SKU o un código.
 */
export function laEtiquetaDeLaColumnaClave(modoCatalogo: boolean): string {
    return modoCatalogo ? "Columna clave (identificador único)" : "Columna con el número WhatsApp";
}

/** La línea del registro de actividad que cuenta las filas encontradas. */
export function lasFilasEncontradas(total: number, modoCatalogo: boolean): string {
    return modoCatalogo
        ? `${total} fila(s) con clave encontradas`
        : `${total} fila(s) con número de WhatsApp encontradas`;
}

/**
 * Los SEPARADORES de la base de conocimiento, en el orden del desplegable.
 *
 * `valor` es lo que guarda el desplegable y `separa` lo que de verdad parte el
 * texto. Son dos cosas a propósito: la opción «Línea en blanco doble» llevaba
 * `value="\n\n"` escrito en el JSX, y un atributo de JSX NO interpreta las
 * barras invertidas —lo que viajaba era una barra y una ene, cuatro
 * caracteres—, así que el texto no se partía nunca y todo el catálogo entraba
 * como UN solo bloque, sin ningún error.
 */
export const SEPARADORES_DE_LA_BASE = [
    { valor: "auto", rotulo: "Automático (detecta ### --- o líneas vacías)", separa: undefined },
    { valor: "encabezados", rotulo: "### — Encabezados Markdown", separa: "###" },
    { valor: "linea-divisoria", rotulo: "--- — Línea divisoria", separa: "---" },
    { valor: "linea-en-blanco", rotulo: "Línea en blanco doble", separa: "\n\n" },
] as const;

export type SeparadorDeLaBase = (typeof SEPARADORES_DE_LA_BASE)[number]["valor"];

/** Lo que parte el texto con esa opción; `undefined` es «que lo detecte solo». */
export function elSeparador(valor: string): string | undefined {
    return SEPARADORES_DE_LA_BASE.find((s) => s.valor === valor)?.separa;
}

/**
 * La CLAVE de un registro como se lee en la tabla. Un cliente se guarda con su
 * número en la forma de WhatsApp —`573004522013@s.whatsapp.net`—, y la tabla
 * lo pintaba así: el número se perdía entre el sufijo, y un registro guardado
 * con el número pelado se veía como OTRO cliente. Se enseña el número; lo que
 * no es un número de WhatsApp (el SKU de un catálogo, un `@lid`) sale tal cual.
 */
export function laClaveQueSeLee(remoteJid: string | null | undefined): string {
    const valor = (remoteJid ?? "").trim();
    const numero = /^(\d+)@(s\.whatsapp\.net|c\.us)$/.exec(valor);
    return numero ? numero[1] : valor;
}

/**
 * Las formas en que puede estar GUARDADO el mismo cliente, a partir de su forma
 * canónica. Importar y guardar a mano buscaban el registro solo por la
 * canónica, así que uno guardado antes con el número pelado —o con `@c.us`— no
 * se encontraba y se creaba OTRO: el mismo cliente dos veces, y el agente
 * leyendo el que le tocara.
 *
 * Solo las formas del MISMO teléfono: nunca un `@lid`, cuyos dígitos son un id
 * de privacidad y no un número (fabricarlo casaría con otro contacto). Y lo que
 * no es un teléfono —la clave de un catálogo— solo es igual a sí mismo.
 */
export function lasFormasDelMismoNumero(canonica: string): string[] {
    const valor = (canonica ?? "").trim();
    const numero = /^(\d+)@s\.whatsapp\.net$/.exec(valor);
    if (!numero) return valor ? [valor] : [];
    return [valor, numero[1], `${numero[1]}@c.us`];
}

/**
 * ¿Lo que se escribió como clave de un registro es un NÚMERO de WhatsApp? Solo
 * entonces se pasa a su forma de WhatsApp. Guardar a mano pasaba cualquier
 * clave por esa regla, y la regla se queda con los dígitos: el SKU «SKU-001» de
 * un catálogo se guardaba como `001@s.whatsapp.net`, así que EDITAR un registro
 * de catálogo creaba otro al lado y el de verdad se quedaba sin cambiar.
 *
 * Es un número lo que ya es un jid (lleva `@`) y lo que solo lleva dígitos con
 * los signos con que se escribe un teléfono, con al menos siete dígitos.
 */
export function esUnNumeroDeWhatsApp(valor: string | null | undefined): boolean {
    const v = (valor ?? "").trim();
    if (!v) return false;
    if (v.includes("@")) return true;
    return /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 7;
}

/**
 * El CONTENIDO de un bloque importado, sin la línea de su título. Al dividir por
 * encabezados, el trozo empieza por «### Horario de fin de año», y se guardaba
 * entero: la lista de bloques enseñaba el título dos veces —una en su sitio y
 * otra con la almohadilla delante, dentro del texto— y el agente recibía una
 * marca de Markdown que no dice nada. El título ya va en su campo, así que el
 * contenido es lo de debajo.
 *
 * Solo se quita cuando la primera línea ES un encabezado (`#`): partiendo por
 * `---` o por líneas en blanco, la primera línea es el principio del texto y se
 * queda. Y si debajo no hay nada, el contenido es el título sin la marca: un
 * bloque vacío no le sirve a nadie.
 */
export function elContenidoSinElTitulo(trozo: string): string {
    const texto = (trozo ?? "").trim();
    const lineas = texto.split("\n");
    const primera = lineas.findIndex((l) => l.trim().length > 0);
    if (primera < 0 || !/^#+\s/.test(lineas[primera].trim())) return texto;
    const resto = lineas.slice(primera + 1).join("\n").trim();
    return resto || lineas[primera].trim().replace(/^#+\s*/, "");
}

/** Lo que parte el texto por sus encabezados: la línea que empieza por `###`, no cualquier `###`. */
export const ANTES_DE_CADA_ENCABEZADO = /(?=^###\s)/m;
