/**
 * PLANTILLAS DE PLANES de Propuestas comerciales: lo que se decide sin base ni
 * navegador.
 *
 * Una plantilla es un plan que la cuenta vende una y otra vez —Lite, Básico,
 * Starter, Esencial, Business, Enterprise…— con su nombre, su precio y su lista
 * de características. Es **independiente de Productos**: no sale del catálogo ni
 * lo toca. Y **no hay tope de cuántas**: se crean las que hagan falta.
 *
 * # Cargar una plantilla es COPIAR, nunca enlazar
 *
 * Al elegirla en una propuesta, su contenido entra como una fila más de la
 * sección de servicios o productos (`laFilaDeLaPlantilla`), hecha de cadenas
 * nuevas. La propuesta guarda esa COPIA y no el id de la plantilla, así que:
 *
 * - lo cargado se edita en la propuesta puntual sin tocar la plantilla, y
 * - editar o borrar la plantilla después no mueve ni una propuesta ya hecha.
 *
 * Es la regla de siempre de un precio: el que se le mandó a un cliente no puede
 * cambiar solo porque alguien retocó la tarifa de la casa.
 */

import { comoImporte, comoMoneda, MONEDAS, type Moneda } from "@/lib/propuestas";

export const TOPE_DE_NOMBRE_DEL_PLAN = 150;
export const TOPE_DE_CARACTERISTICA = 300;
/** Cuántas líneas de características caben en UNA plantilla. No es un tope de plantillas. */
export const TOPE_DE_CARACTERISTICAS = 60;

export type PlantillaDePlan = {
    id: string;
    nombre: string;
    precio: number;
    moneda: Moneda;
    caracteristicas: string[];
    creadaEn: string;
    actualizadaEn: string;
};

export type DatosDePlantilla = Pick<PlantillaDePlan, "nombre" | "precio" | "moneda" | "caracteristicas">;

export type VeredictoDePlantilla = { ok: true; datos: DatosDePlantilla } | { ok: false; motivo: string };

function unaLinea(v: unknown, tope: number): string {
    if (typeof v !== "string") return "";
    return v.replace(/\s+/g, " ").trim().slice(0, tope);
}

/**
 * Las características como las escribe una persona: una por línea, o ya en
 * lista. Se quitan las viñetas del principio («-», «•», «*», «✓») —el alcance
 * de la propuesta las pinta como texto— y las líneas vacías.
 */
export function comoCaracteristicas(v: unknown): string[] {
    const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r\n?|\n/) : [];
    return lista
        .map((c) => (typeof c === "string" ? c : ""))
        .map((c) => c.replace(/^\s*(?:[-•*·✓✔]\s*)+/, ""))
        .map((c) => unaLinea(c, TOPE_DE_CARACTERISTICA))
        .filter(Boolean)
        .slice(0, TOPE_DE_CARACTERISTICAS);
}

/** Lo que se guarda, a partir de lo que llega del navegador. Se vuelve a comprobar en el servidor. */
export function comoPlantilla(raw: unknown): VeredictoDePlantilla {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const nombre = unaLinea(r.nombre, TOPE_DE_NOMBRE_DEL_PLAN);
    if (!nombre) return { ok: false, motivo: "Escribe el nombre del plan." };
    if (typeof r.moneda === "string" && r.moneda.trim() && !(MONEDAS as readonly string[]).includes(r.moneda.trim().toUpperCase())) {
        return { ok: false, motivo: "Esa moneda no está en la lista." };
    }
    const crudoPrecio = r.precio;
    if (crudoPrecio === null || crudoPrecio === undefined || String(crudoPrecio).trim() === "") {
        return { ok: false, motivo: `Escribe el precio de «${nombre}».` };
    }
    // Un precio que no se entiende no se sustituye por cero: es lo que se le cobra al cliente.
    const precio = comoImporte(crudoPrecio);
    if (precio === null) return { ok: false, motivo: `El precio de «${nombre}» no es un importe válido.` };
    return { ok: true, datos: { nombre, precio, moneda: comoMoneda(r.moneda), caracteristicas: comoCaracteristicas(r.caracteristicas) } };
}

/**
 * La fila de servicio/producto que sale de una plantilla, tal como la edita el
 * formulario de la propuesta (todo cadenas). **Cadenas nuevas**: nada de lo que
 * devuelve comparte referencia con la plantilla.
 */
export function laFilaDeLaPlantilla(p: Pick<PlantillaDePlan, "nombre" | "precio" | "caracteristicas">): {
    nombre: string;
    alcance: string;
    inversion: string;
} {
    return {
        nombre: String(p.nombre),
        alcance: p.caracteristicas.map((c) => String(c)).join("\n"),
        inversion: String(p.precio),
    };
}

type FilaEditable = { nombre: string; alcance: string; inversion: string };

function estaVacia(f: FilaEditable): boolean {
    return !f.nombre.trim() && !f.alcance.trim() && !String(f.inversion).trim();
}

/**
 * Las filas de la propuesta después de cargar una plantilla. Autorrellena sin
 * pisar trabajo: las filas en blanco —la que el formulario deja para escribir—
 * se sustituyen, y lo ya escrito se conserva, con el plan detrás.
 */
export function conLaPlantillaCargada<T extends FilaEditable>(filas: readonly T[], plantilla: Pick<PlantillaDePlan, "nombre" | "precio" | "caracteristicas">, tope: number): {
    filas: FilaEditable[];
    cabe: boolean;
} {
    const llenas = filas.filter((f) => !estaVacia(f)).map((f) => ({ nombre: f.nombre, alcance: f.alcance, inversion: f.inversion }));
    if (llenas.length >= tope) return { filas: filas.map((f) => ({ ...f })), cabe: false };
    return { filas: [...llenas, laFilaDeLaPlantilla(plantilla)], cabe: true };
}

/** Orden de la lista: por precio y, a igual precio, por nombre. Es como se lee una escalera de planes. */
export function ordenarPlantillas<T extends Pick<PlantillaDePlan, "precio" | "nombre">>(lista: readonly T[]): T[] {
    return [...lista].sort((a, b) => a.precio - b.precio || a.nombre.localeCompare(b.nombre, "es"));
}
