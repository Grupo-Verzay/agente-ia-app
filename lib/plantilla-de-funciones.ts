/**
 * La PLANTILLA MAESTRA de funciones de los planes: el inventario completo, sin
 * repetir ninguna, que comparten todos los planes de una audiencia (los seis
 * niveles que se venden a clientes, con sus dos modalidades; y aparte, los que
 * se venden a resellers).
 *
 * Cada función se escribe UNA vez —nombre, descripción, categoría y tutorial—
 * y vive en la plantilla. Lo único que es de cada plan es si la tiene
 * ENCENDIDA, si está DESTACADA y en qué orden van sus encendidas. Crear o
 * editar una función en la plantilla llega sola a todos los planes (apagada en
 * los que no la tenían); borrarla la quita de todos.
 *
 * Por qué no cambia nada de lo que ya había: la plantilla nace del inventario
 * de lo que tiene cada plan hoy, y cada plan se reescribe con SUS encendidas,
 * en SU orden y con SUS destacadas; lo nuevo entra apagado. Lo que puede
 * cambiar es el texto de una función que dos planes escribían distinto (una
 * tilde): gana el de un plan activo, que es el que ya se enseña.
 *
 * Puro: lo usan la acción que sincroniza (`lib/plantilla-de-funciones-db.ts`),
 * el panel de Planes y el banco. Las funciones de un plan se siguen guardando
 * en `plan_funciones` y sus encendidas en `features`, así que la landing, la
 * página del plan y las propuestas no cambian de forma de leer.
 */
import {
    comoFunciones,
    idDeLaFuncion,
    laLlaveDelNombre,
    lasFuncionesDelPlan,
    TOPE_DE_FUNCIONES,
    type FuncionDelPlan,
} from "@/lib/pagina-de-plan";
import { laPosicionDelNivel } from "@/lib/nivel-de-la-licencia";

/* ─── Audiencias ───────────────────────────────────────────────────────── */

/** Los planes de clientes y los de resellers son dos catálogos: una plantilla cada uno. */
export type Audiencia = "cliente" | "reseller";
export const AUDIENCIAS: readonly Audiencia[] = ["cliente", "reseller"];

export function laAudienciaDelPlan(p: { isResellerPlan?: boolean | null }): Audiencia {
    return p?.isResellerPlan ? "reseller" : "cliente";
}

export function comoAudiencia(raw: unknown): Audiencia | null {
    return raw === "cliente" || raw === "reseller" ? raw : null;
}

/* ─── La plantilla ─────────────────────────────────────────────────────── */

/** Lo que es de la función, no de un plan. */
export type FuncionDeLaPlantilla = Omit<FuncionDelPlan, "activa" | "destacada">;

/** Lo que es de cada plan. */
export type EstadoEnElPlan = { id: string; activa: boolean; destacada: boolean };

export const TOPE_DE_LA_PLANTILLA = TOPE_DE_FUNCIONES;

function sinEstado(f: FuncionDelPlan): FuncionDeLaPlantilla {
    return { id: f.id, nombre: f.nombre, descripcion: f.descripcion, categoria: f.categoria, tutorial: f.tutorial };
}

/**
 * Lo guardado o lo que llega, saneado: lo de `comoFunciones` (textos, ids,
 * categoría conocida, tope) y además SIN dos funciones con el mismo nombre —sin
 * tildes ni mayúsculas—: gana la primera. Nunca lanza.
 */
export function comoPlantilla(raw: unknown): FuncionDeLaPlantilla[] {
    const vistas = new Set<string>();
    const fuera: FuncionDeLaPlantilla[] = [];
    for (const f of comoFunciones(raw)) {
        const llave = laLlaveDelNombre(f.nombre);
        if (vistas.has(llave)) continue;
        vistas.add(llave);
        fuera.push(sinEstado(f));
    }
    return fuera;
}

/* ─── Las filas de los planes ──────────────────────────────────────────── */

/** Una fila de `subscription_plans` con lo guardado en `plan_funciones`. */
export type FilaDelPlan = {
    id: string;
    plan: string;
    assistanceType: string;
    isActive: boolean;
    features: readonly string[];
    /** Lo de `plan_funciones` tal cual (o `undefined` si no hay fila). */
    guardadas: unknown;
};

function tieneListaGuardada(f: FilaDelPlan): boolean {
    return Array.isArray(f.guardadas) && f.guardadas.length > 0;
}

/**
 * Quién manda cuando dos planes escriben distinto la misma función: primero
 * los ACTIVOS (son los que ya se enseñan en la landing y en su página), luego
 * los que pasaron por el editor (tienen descripción, categoría y tutorial
 * elegidos a mano), luego el nivel más bajo, IA antes que Humano, y el id.
 */
export function elOrdenDeLasFilas<T extends FilaDelPlan>(filas: readonly T[]): T[] {
    const pos = (p: string) => {
        const i = laPosicionDelNivel(p);
        return i < 0 ? 99 : i;
    };
    return [...filas].sort(
        (a, b) =>
            Number(b.isActive) - Number(a.isActive) ||
            Number(tieneListaGuardada(b)) - Number(tieneListaGuardada(a)) ||
            pos(a.plan) - pos(b.plan) ||
            Number(a.assistanceType === "HUMANO") - Number(b.assistanceType === "HUMANO") ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * La plantilla con TODO lo que tienen los planes hoy: lo que ya estaba, tal
 * cual y en su orden, y detrás cada función que un plan tenga y la plantilla
 * no —por nombre, sin tildes ni mayúsculas—, en el orden de prioridad de las
 * filas y en el orden de cada plan. Es lo que hace que nada se pierda la
 * primera vez, y que una función que entre por otro camino (`features` tocado
 * a mano, «Inicializar») acabe también en la plantilla.
 */
export function completarLaPlantilla(
    base: readonly FuncionDeLaPlantilla[],
    filas: readonly FilaDelPlan[],
): { plantilla: FuncionDeLaPlantilla[]; agregadas: number } {
    const plantilla = comoPlantilla(base);
    const llaves = new Set(plantilla.map((f) => laLlaveDelNombre(f.nombre)));
    const ids = new Set(plantilla.map((f) => f.id));
    const nuevas = new Map<string, FuncionDeLaPlantilla>();
    let agregadas = 0;
    for (const fila of elOrdenDeLasFilas(filas)) {
        for (const f of lasFuncionesDelPlan(fila.features ?? [], fila.guardadas)) {
            const llave = laLlaveDelNombre(f.nombre);
            const yaNueva = nuevas.get(llave);
            if (yaNueva) {
                // Una entrada que nace en esta vuelta coge la primera
                // descripción y el primer tutorial que encuentre: un plan
                // inactivo puede ser el único que los tenía escritos.
                if (!yaNueva.descripcion && f.descripcion) yaNueva.descripcion = f.descripcion;
                if (!yaNueva.tutorial && f.tutorial) yaNueva.tutorial = f.tutorial;
                continue;
            }
            if (llaves.has(llave)) continue;
            if (plantilla.length >= TOPE_DE_LA_PLANTILLA) break;
            let id = f.id;
            let vez = 0;
            while (ids.has(id)) id = `${idDeLaFuncion(f.nombre, vez++)}-p`;
            const nueva: FuncionDeLaPlantilla = { ...sinEstado(f), id };
            plantilla.push(nueva);
            nuevas.set(llave, nueva);
            llaves.add(llave);
            ids.add(id);
            agregadas++;
        }
    }
    return { plantilla, agregadas };
}

/* ─── De la plantilla a cada plan ──────────────────────────────────────── */

/**
 * El estado de cada función de la plantilla en una lista de un plan: por id
 * cuando el nombre también casa, y si no, por nombre. Lo que no está en la
 * plantilla o ya salió se ignora.
 */
export function emparejar(
    lista: readonly FuncionDelPlan[],
    plantilla: readonly FuncionDeLaPlantilla[],
): EstadoEnElPlan[] {
    const porId = new Map(plantilla.map((f) => [f.id, f]));
    const porLlave = new Map(plantilla.map((f) => [laLlaveDelNombre(f.nombre), f]));
    const vistos = new Set<string>();
    const fuera: EstadoEnElPlan[] = [];
    for (const f of lista) {
        const llave = laLlaveDelNombre(f.nombre);
        let t = porId.get(f.id);
        if (!t || laLlaveDelNombre(t.nombre) !== llave) t = porLlave.get(llave);
        if (!t || vistos.has(t.id)) continue;
        vistos.add(t.id);
        fuera.push({ id: t.id, activa: f.activa, destacada: f.destacada });
    }
    return fuera;
}

/**
 * La lista de un plan: sus encendidas en SU orden, con los datos de la
 * plantilla y SU estrella; detrás, todas las demás de la plantilla, apagadas y
 * en el orden de la plantilla. Una que el plan nunca tuvo nace sin estrella:
 * se enciende y se destaca a mano.
 */
export function conLaPlantilla(
    estados: readonly EstadoEnElPlan[],
    plantilla: readonly FuncionDeLaPlantilla[],
): FuncionDelPlan[] {
    const porId = new Map(plantilla.map((f) => [f.id, f]));
    const estadoPorId = new Map(estados.map((e) => [e.id, e]));
    const fuera: FuncionDelPlan[] = [];
    const puestas = new Set<string>();
    for (const e of estados) {
        const t = porId.get(e.id);
        if (!e.activa || !t || puestas.has(t.id)) continue;
        puestas.add(t.id);
        fuera.push({ ...t, activa: true, destacada: e.destacada });
    }
    for (const t of plantilla) {
        if (puestas.has(t.id)) continue;
        fuera.push({ ...t, activa: false, destacada: estadoPorId.get(t.id)?.destacada ?? false });
    }
    return fuera;
}

/** Lo que queda escrito para un plan con la plantilla puesta. */
export function laListaDelPlan(fila: FilaDelPlan, plantilla: readonly FuncionDeLaPlantilla[]): FuncionDelPlan[] {
    return conLaPlantilla(emparejar(lasFuncionesDelPlan(fila.features ?? [], fila.guardadas), plantilla), plantilla);
}

/* ─── Guardar la plantilla ─────────────────────────────────────────────── */

export type PlantillaQueSeGuarda =
    | { ok: true; plantilla: FuncionDeLaPlantilla[] }
    | { ok: false; motivo: string };

/**
 * La plantilla que manda el editor, comprobada contra la que había: sin nombres
 * vacíos ni repetidos y dentro del tope. Un id que ya existía se conserva —es
 * lo que hace que renombrar una función la renombre en todos los planes, en
 * vez de apagar la vieja y crear otra—; uno que no existía se rehace, para que
 * una función nueva no pueda hacerse pasar por otra.
 */
export function laPlantillaQueSeGuarda(
    raw: unknown,
    anterior: readonly FuncionDeLaPlantilla[],
): PlantillaQueSeGuarda {
    if (!Array.isArray(raw)) return { ok: false, motivo: "La lista de funciones no es válida." };
    if (raw.length > TOPE_DE_LA_PLANTILLA) {
        return { ok: false, motivo: `La plantilla admite hasta ${TOPE_DE_LA_PLANTILLA} funciones.` };
    }
    const vacias = raw.filter((x) => {
        const n = x && typeof x === "object" ? (x as { nombre?: unknown }).nombre : null;
        return typeof n !== "string" || !n.trim();
    });
    if (vacias.length > 0) return { ok: false, motivo: "Hay una función sin nombre: escríbelo o quítala." };

    const limpias = comoFunciones(raw);
    const vistas = new Map<string, string>();
    for (const f of limpias) {
        const llave = laLlaveDelNombre(f.nombre);
        if (vistas.has(llave)) {
            return { ok: false, motivo: `Ya existe una función con ese nombre: «${vistas.get(llave)}».` };
        }
        vistas.set(llave, f.nombre);
    }

    const idsAnteriores = new Set(anterior.map((f) => f.id));
    const usados = new Set<string>();
    const fuera: FuncionDeLaPlantilla[] = [];
    for (const f of limpias) {
        let id = f.id;
        if (!idsAnteriores.has(id) || usados.has(id)) {
            let vez = 0;
            id = idDeLaFuncion(f.nombre, vez);
            while (idsAnteriores.has(id) || usados.has(id)) id = idDeLaFuncion(f.nombre, ++vez);
        }
        usados.add(id);
        fuera.push({ ...sinEstado(f), id });
    }
    return { ok: true, plantilla: fuera };
}

/**
 * La lista de un plan con la plantilla NUEVA: lo que el plan tenía (emparejado
 * contra la plantilla ANTERIOR, que es con la que se guardó) puesto sobre la
 * nueva. Así un renombre llega al plan con su estrella, y una función borrada
 * de la plantilla sale del plan.
 */
export function laListaConLaPlantillaNueva(
    fila: FilaDelPlan,
    anterior: readonly FuncionDeLaPlantilla[],
    nueva: readonly FuncionDeLaPlantilla[],
): FuncionDelPlan[] {
    return conLaPlantilla(emparejar(lasFuncionesDelPlan(fila.features ?? [], fila.guardadas), anterior), nueva);
}

/* ─── Guardar un plan ──────────────────────────────────────────────────── */

/**
 * Lo que manda el editor de UN plan, contra la plantilla: el estado de cada
 * función (encendida, destacada, orden) y, si escribió una función que la
 * plantilla no tiene, esa función NUEVA, que entra en la plantilla y en los
 * demás planes apagada. Los textos de una función que ya existe los pone la
 * plantilla: se editan allí, no desde un plan.
 */
export function laListaQueManda(
    plantilla: readonly FuncionDeLaPlantilla[],
    enviada: unknown,
): { nuevas: FuncionDeLaPlantilla[]; estados: EstadoEnElPlan[] } {
    const lista = comoFunciones(enviada);
    const porId = new Map(plantilla.map((f) => [f.id, f]));
    const porLlave = new Map(plantilla.map((f) => [laLlaveDelNombre(f.nombre), f]));
    const ids = new Set(plantilla.map((f) => f.id));
    const nuevasPorLlave = new Map<string, FuncionDeLaPlantilla>();
    const nuevas: FuncionDeLaPlantilla[] = [];
    const estados: EstadoEnElPlan[] = [];
    const vistos = new Set<string>();
    for (const f of lista) {
        const llave = laLlaveDelNombre(f.nombre);
        // Por id solo si el nombre también casa: una función nueva cuyo id
        // generado coincida con el de otra no puede quedarse con su estado.
        let t = porId.get(f.id);
        if (!t || laLlaveDelNombre(t.nombre) !== llave) t = porLlave.get(llave) ?? nuevasPorLlave.get(llave);
        if (!t) {
            if (plantilla.length + nuevas.length >= TOPE_DE_LA_PLANTILLA) continue;
            let id = f.id;
            let vez = 0;
            while (ids.has(id)) id = idDeLaFuncion(f.nombre, vez++);
            t = { ...sinEstado(f), id };
            ids.add(id);
            nuevas.push(t);
            nuevasPorLlave.set(llave, t);
        }
        if (vistos.has(t.id)) continue;
        vistos.add(t.id);
        estados.push({ id: t.id, activa: f.activa, destacada: f.destacada });
    }
    return { nuevas, estados };
}

/* ─── Para el panel ────────────────────────────────────────────────────── */

/** Cuántos planes tienen encendida cada función: lo que dice el aviso de borrar. */
export function enCuantosPlanesEstaEncendida(
    listas: readonly (readonly FuncionDelPlan[])[],
): Map<string, number> {
    const cuenta = new Map<string, number>();
    for (const lista of listas) {
        for (const f of lista) if (f.activa) cuenta.set(f.id, (cuenta.get(f.id) ?? 0) + 1);
    }
    return cuenta;
}

/** Dos listas iguales en lo que se guarda. Para no reescribir lo que no cambió. */
export function mismaLista(a: unknown, b: readonly FuncionDelPlan[]): boolean {
    return JSON.stringify(comoFunciones(a)) === JSON.stringify(comoFunciones(b));
}

/**
 * El orden con el que el editor de un plan pinta su lista: las encendidas en
 * SU orden, detrás las apagadas de la plantilla en el orden de la plantilla, y
 * al final las apagadas que la plantilla todavía no tiene (las recién
 * escritas). Así apagar una función la devuelve a su sitio del inventario, y
 * encenderla no reordena las demás.
 */
export function enElOrdenDeLaPlantilla(
    lista: readonly FuncionDelPlan[],
    plantilla: readonly FuncionDeLaPlantilla[],
): FuncionDelPlan[] {
    const posicion = new Map(plantilla.map((f, i) => [f.id, i]));
    const encendidas = lista.filter((f) => f.activa);
    const apagadas = lista.filter((f) => !f.activa);
    const deLaPlantilla = apagadas
        .filter((f) => posicion.has(f.id))
        .sort((a, b) => (posicion.get(a.id) ?? 0) - (posicion.get(b.id) ?? 0));
    const nuevas = apagadas.filter((f) => !posicion.has(f.id));
    return [...encendidas, ...deLaPlantilla, ...nuevas];
}
