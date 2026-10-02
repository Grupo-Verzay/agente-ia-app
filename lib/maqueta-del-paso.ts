/**
 * La MAQUETA de un paso del entrenamiento con dos acciones nuevas —«Agregar
 * caso» y «Transición»— antes de construir su lógica.
 *
 * Es solo pantalla: nada de esto se guarda, ni llega al prompt, ni lo lee el
 * motor. Vive en `/ia/maqueta` para revisar el ORDEN y los CAMPOS de un paso
 * al lado de las tarjetas de verdad (Ejecutar flujo, Respuesta, Nota interna),
 * que se pintan con sus componentes de siempre.
 *
 * Lo que decide aquí —puro, para probarlo sin navegador— es lo que la pantalla
 * pinta: el orden de arriba abajo, el menú «Agregar acción» con las dos nuevas
 * y los rótulos de sus campos. El día que se construya la lógica, estos
 * nombres son los que hay que conservar.
 */

/** Lo que puede llevar un paso en la maqueta, en el orden en que se pinta. */
export type ElementoDeLaMaqueta =
    | "plantilla"
    | "ejecutar_flujo"
    | "respuesta"
    | "caso"
    | "transicion"
    | "nota_interna";

/**
 * El orden del encargo, de arriba abajo. «respuesta» y «caso» comparten
 * puesto: es la sección de la RESPUESTA, y lleva una cosa u otra según el paso
 * necesite un texto fijo o varios según lo que pase.
 */
export const ORDEN_DE_LA_MAQUETA: ReadonlyArray<{
    puesto: number;
    elementos: ReadonlyArray<ElementoDeLaMaqueta>;
    rotulo: string;
    nueva: boolean;
}> = [
    { puesto: 1, elementos: ["plantilla"], rotulo: "Plantilla del paso", nueva: false },
    { puesto: 2, elementos: ["ejecutar_flujo"], rotulo: "Ejecutar flujo", nueva: false },
    { puesto: 3, elementos: ["respuesta", "caso"], rotulo: "Respuesta o casos", nueva: true },
    { puesto: 4, elementos: ["transicion"], rotulo: "Transición", nueva: true },
    { puesto: 5, elementos: ["nota_interna"], rotulo: "Nota interna", nueva: false },
];

/** En qué puesto cae un elemento. */
export const puestoDe = (el: ElementoDeLaMaqueta): number =>
    ORDEN_DE_LA_MAQUETA.find((s) => s.elementos.includes(el))?.puesto ?? 99;

/**
 * Coloca un elemento nuevo en su puesto, detrás de los del mismo puesto: un
 * segundo caso va debajo del primero, nunca encima de la transición.
 */
export function insertarEnSuPuesto<T extends { tipo: ElementoDeLaMaqueta }>(lista: T[], nuevo: T): T[] {
    const p = puestoDe(nuevo.tipo);
    const i = lista.findIndex((e) => puestoDe(e.tipo) > p);
    if (i === -1) return [...lista, nuevo];
    return [...lista.slice(0, i), nuevo, ...lista.slice(i)];
}

/**
 * Un paso tiene RESPUESTA o CASOS, no las dos: con un texto fijo y además
 * casos, el modelo no sabría cuál mandar. Elegir una quita la otra.
 */
export const quitaAlAgregar = (el: ElementoDeLaMaqueta): ElementoDeLaMaqueta | null =>
    el === "caso" ? "respuesta" : el === "respuesta" ? "caso" : null;

/** Una transición por paso: un paso pasa a UN paso siguiente. */
export const esUnica = (el: ElementoDeLaMaqueta): boolean =>
    el === "transicion" || el === "respuesta" || el === "ejecutar_flujo" || el === "nota_interna";

/** El menú «Agregar acción», con los dos grupos de hoy y las dos nuevas. */
export const MENU_DE_LA_MAQUETA: ReadonlyArray<{
    grupo: "ACCIONES" | "TEXTO";
    opciones: ReadonlyArray<{ tipo: ElementoDeLaMaqueta | "notificar_asesor" | "leer_google_sheets"; icono: string; rotulo: string; nueva: boolean }>;
}> = [
    {
        grupo: "ACCIONES",
        opciones: [
            { tipo: "ejecutar_flujo", icono: "⚡", rotulo: "Ejecutar flujo", nueva: false },
            { tipo: "notificar_asesor", icono: "🔔", rotulo: "Notificar asesor", nueva: false },
            { tipo: "leer_google_sheets", icono: "📊", rotulo: "Leer Google Sheets", nueva: false },
            { tipo: "transicion", icono: "➡️", rotulo: "Transición", nueva: true },
        ],
    },
    {
        grupo: "TEXTO",
        opciones: [
            { tipo: "respuesta", icono: "📝", rotulo: "Agregar respuesta", nueva: false },
            { tipo: "caso", icono: "🔀", rotulo: "Agregar caso", nueva: true },
            { tipo: "nota_interna", icono: "🔒", rotulo: "Agregar nota interna", nueva: false },
        ],
    },
];

/** Los campos de la tarjeta «Caso». */
export const CAMPOS_DEL_CASO = {
    titulo: "CASO",
    escenario: { rotulo: "Escenario", placeholder: "¿Cuándo aplica este caso?" },
    respuesta: { rotulo: "Respuesta", placeholder: "El texto que se envía si este caso aplica" },
} as const;

/** El campo de la tarjeta «Transición». */
export const CAMPO_DE_LA_TRANSICION = {
    titulo: "TRANSICIÓN",
    pregunta: "¿A qué paso pasa cuando se completen los datos de este paso?",
    vacio: "Elegir paso…",
} as const;

/**
 * Los pasos que ofrece la lista de la transición: los ya creados, por su
 * nombre y en su orden, menos el propio (pasar a sí mismo no es avanzar). Un
 * paso sin título se nombra por su número para que se pueda elegir igual.
 */
export function pasosParaLaTransicion(
    pasos: ReadonlyArray<{ id: string; titulo?: string | null }>,
    actual: string,
): Array<{ id: string; nombre: string }> {
    return pasos
        .map((p, i) => ({ id: p.id, nombre: (p.titulo ?? "").trim() || `Paso ${i + 1}` }))
        .filter((p) => p.id !== actual);
}
