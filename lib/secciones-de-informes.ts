/**
 * Las SECCIONES de Informes (`/crm/dashboard`, la vista «Analíticas»): qué se
 * llama cada una, qué tarjetas lleva y las reglas del buscador y del plegado.
 *
 * Puro: lo leen la pantalla (`AnalyticsView.tsx`), la guía pública
 * (`lib/guia-informes.ts`) y su banco. Con los nombres escritos en dos sitios,
 * una sección renombrada en la pantalla seguiría saliendo con el nombre viejo
 * en la guía, y nadie lo notaría.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **El título de la sección es el MISMO en el menú «Secciones» y en la
 *    cabecera plegable.** Antes el menú decía «Citas» y la cabecera «Citas
 *    agendadas»: dos nombres para lo mismo.
 * 2. **El buscador filtra SECCIONES**, por su título y por el de sus tarjetas,
 *    sin mirar tildes ni mayúsculas. Antes el campo «Buscar en analíticas…»
 *    guardaba lo escrito y no filtraba nada: un mando que no hace nada.
 */

export const SECCIONES_DE_INFORMES = [
    { clave: "actividad", titulo: "Actividad", tarjetas: ["Nuevas sesiones por día", "Registros por tipo"] },
    { clave: "rendimiento", titulo: "Rendimiento del Agente IA", tarjetas: ["Tasas de conversión", "Efectividad de follow-ups"] },
    {
        clave: "leads",
        titulo: "Leads y seguimientos",
        tarjetas: ["Leads por temperatura", "Embudo de conversión", "Estado de seguimientos", "Resumen de leads"],
    },
    { clave: "citas", titulo: "Citas", tarjetas: ["Resumen de citas", "Citas por estado"] },
    { clave: "llamadas", titulo: "Llamadas", tarjetas: ["Resumen de llamadas", "Llamadas por día"] },
    { clave: "satisfaccion", titulo: "Satisfacción (NPS)", tarjetas: ["Resumen de la encuesta", "NPS por asesor"] },
    { clave: "sentimiento", titulo: "Sentimiento", tarjetas: ["Caídas a negativo por asesor", "Caídas a negativo por día"] },
    { clave: "sesiones", titulo: "Sesiones", tarjetas: ["Estado de sesiones", "Estado del agente IA"] },
    { clave: "flujos", titulo: "Flujos", tarjetas: ["Estado de flujos", "Flujos más ejecutados"] },
    { clave: "etiquetas", titulo: "Etiquetas y madurez", tarjetas: ["Madurez de contactos", "Distribución por etiquetas"] },
    { clave: "ventas", titulo: "Ventas y gastos", tarjetas: ["Resumen financiero", "Gastos por categoría", "Ventas en el período"] },
    { clave: "productos", titulo: "Productos", tarjetas: ["Top productos por stock", "Productos por categoría"] },
    { clave: "sistema", titulo: "Créditos IA", tarjetas: ["Uso de créditos", "Distribución de créditos"] },
] as const;

export type ClaveDeSeccion = (typeof SECCIONES_DE_INFORMES)[number]["clave"];
export type SeccionDeInformes = (typeof SECCIONES_DE_INFORMES)[number];

/** El título de una sección por su clave. */
export const TITULO_DE_LA_SECCION = Object.fromEntries(
    SECCIONES_DE_INFORMES.map((s) => [s.clave, s.titulo]),
) as Record<ClaveDeSeccion, string>;

/** Los periodos del selector de arriba, en su orden (`CrmDashboard.tsx`). */
export const PERIODOS_DE_INFORMES = [
    { valor: "7d", rotulo: "7 días" },
    { valor: "30d", rotulo: "30 días" },
    { valor: "90d", rotulo: "90 días" },
    { valor: "all", rotulo: "Todo" },
] as const;

export type PeriodoDeInformes = (typeof PERIODOS_DE_INFORMES)[number]["valor"];

/** Con qué periodo abre la pantalla. */
export const PERIODO_POR_DEFECTO: PeriodoDeInformes = "30d";

const LETRAS_CON_TILDE = "áàäâéèëêíìïîóòöôúùüûñ";
const LETRAS_SIN_TILDE = "aaaaeeeeiiiioooouuuun";

function sinTildes(texto: string): string {
    let fuera = "";
    for (const c of texto.toLowerCase()) {
        const i = LETRAS_CON_TILDE.indexOf(c);
        fuera += i >= 0 ? LETRAS_SIN_TILDE[i] : c;
    }
    return fuera;
}

/**
 * ¿Sale esta sección con lo que se escribió en el buscador? Vacío: sí. Si no,
 * cuando el título o el de alguna de sus tarjetas lo contiene, sin mirar tildes
 * ni mayúsculas («nps» encuentra «Satisfacción (NPS)», «embudo» encuentra
 * «Leads y seguimientos»).
 */
export function laSeccionPasaLaBusqueda(seccion: { titulo: string; tarjetas: readonly string[] }, texto: string): boolean {
    const buscado = sinTildes(texto.trim());
    if (!buscado) return true;
    return [seccion.titulo, ...seccion.tarjetas].some((t) => sinTildes(t).includes(buscado));
}

/** Pliega o despliega una sección. Devuelve un conjunto nuevo. */
export function alternarPlegada(plegadas: ReadonlySet<ClaveDeSeccion>, clave: ClaveDeSeccion): Set<ClaveDeSeccion> {
    const nuevas = new Set(plegadas);
    if (nuevas.has(clave)) nuevas.delete(clave);
    else nuevas.add(clave);
    return nuevas;
}

/** Dónde recuerda el navegador qué secciones dejó plegadas cada persona. */
export const LLAVE_DE_LAS_PLEGADAS = "informes:plegadas";

/**
 * Lo guardado, saneado: solo claves que existen. Lo que no se entienda —un valor
 * de otra versión, algo a medio escribir— cae en «nada plegado»: se ve de más,
 * nunca de menos.
 */
export function comoPlegadas(valor: unknown): Set<ClaveDeSeccion> {
    if (!Array.isArray(valor)) return new Set();
    const validas = new Set<string>(SECCIONES_DE_INFORMES.map((s) => s.clave));
    return new Set(valor.filter((v): v is ClaveDeSeccion => typeof v === "string" && validas.has(v)));
}
