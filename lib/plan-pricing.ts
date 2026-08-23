import { Plan } from "@prisma/client";

import { PLANS } from "@/types/plans";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * Qué se le cobra a una cuenta por un plan, y en qué moneda.
 *
 * Vive aquí y no dentro de una server action porque lo usan dos caminos
 * distintos: el registro desde la landing (el cliente elige plan antes de
 * existir) y la elección de plan desde dentro (el que venía de la prueba
 * gratis). Si cada uno calculara su precio, tarde o temprano cobrarían
 * distinto por lo mismo.
 */
export type PrecioDePlan = { plan: Plan; price: number; currency: string };

/**
 * Pasa el precio de referencia a la moneda en la que de verdad entra el dinero.
 *
 * Los planes se publican en USD, pero el cobro es en pesos: Wompi es una
 * pasarela colombiana. Si la cuenta queda facturada en USD y el comprobante
 * llega en COP, la validación de monto —que exige que la moneda coincida— manda
 * todos los pagos a revisión manual y no renueva ninguno.
 *
 * Sin tasa configurada no se convierte nada y todo queda como antes.
 */
export async function convertirAMonedaDeCobro(
    precioUSD: number,
): Promise<{ price: number; currency: string }> {
    const cfg = await db.siteConfig
        .findUnique({ where: { id: 1 }, select: { usdToCopRate: true } })
        .catch(() => null);

    const tasa = Number(cfg?.usdToCopRate ?? 0);
    if (!Number.isFinite(tasa) || tasa <= 0) return { price: precioUSD, currency: "USD" };

    // Wompi cobra en pesos enteros; un monto con decimales invalida el enlace.
    return { price: Math.round(precioUSD * tasa), currency: "COP" };
}

/**
 * Nombre comercial del plan de una cuenta.
 *
 * Cada marca le pone el suyo al mismo nivel interno, así que a un cliente de
 * Aizen-Bot hay que mostrarle el nombre de Aizen-Bot y no el de Verzay. Sin
 * nombre propio, la etiqueta por defecto del nivel.
 *
 * NO se filtra por `isActive`: un plan que la marca tiene apagado (no lo vende
 * ahora mismo) igual conserva su nombre, y una cuenta puede estar en ese nivel.
 * Exigir activo hacía que el nombre "desapareciera" y saliera el número de nivel.
 */
export async function etiquetaDePlanParaCuenta(
    plan: Plan,
    resellerUserId: string | null,
): Promise<string | null> {
    // El layout la pide en CADA navegación y el nombre de un plan casi nunca
    // cambia, así que se guarda unos minutos en vez de consultar cada vez. Al
    // vencer se vuelve a leer solo, sin que nadie tenga que invalidar nada.
    return etiquetaEnCache(plan, resellerUserId ?? "");
}

const etiquetaEnCache = unstable_cache(
    async (plan: Plan, resellerUserId: string): Promise<string | null> =>
        leerEtiquetaDePlan(plan, resellerUserId || null),
    ["etiqueta-plan-por-cuenta"],
    { revalidate: 300 },
);

async function leerEtiquetaDePlan(
    plan: Plan,
    resellerUserId: string | null,
): Promise<string | null> {
    try {
        if (resellerUserId) {
            const propio = await db.resellerPlan.findFirst({
                where: { resellerUserId, plan },
                select: { name: true },
                orderBy: { assistanceType: "asc" },
            });
            if (propio?.name?.trim()) return propio.name.trim();
        }

        const dePlataforma = await db.subscriptionPlan.findFirst({
            where: { plan, isResellerPlan: false },
            select: { name: true },
            orderBy: { assistanceType: "asc" },
        });
        return dePlataforma?.name?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Cómo llama una marca a cada uno de los seis niveles.
 *
 * Es `etiquetaDePlanParaCuenta` para los seis de una vez, en una sola consulta,
 * para las pantallas que los listan juntos —el desplegable de "Crear cliente",
 * por ejemplo—. Ahí no sirve la tabla interna de nombres: dice "Agencias" para el
 * nivel 6 y "Enterprise" para el 5, que no es como los vende ninguna marca, y
 * quien crea el cliente termina eligiendo el nivel equivocado.
 *
 * Al nivel que la marca no le puso nombre le queda su número, que es lo único
 * cierto que se puede decir de él sin inventarse un nombre comercial ajeno.
 */
export async function etiquetasDePlanesParaMarca(
    resellerUserId: string | null,
): Promise<Record<string, string>> {
    const etiquetas: Record<string, string> = {};

    try {
        // Una marca o la otra, nunca las dos mezcladas: rellenar los huecos de un
        // reseller con los nombres de la plataforma sería ponerle en el
        // desplegable el nombre comercial de otra marca.
        // Sin filtro de `isActive`: el nombre de un nivel vale aunque la marca lo
        // tenga apagado; se puede asignar ese nivel a un cliente igual.
        const filas = resellerUserId
            ? await db.resellerPlan.findMany({
                where: { resellerUserId },
                select: { plan: true, name: true },
                orderBy: { assistanceType: "asc" },
            })
            : await db.subscriptionPlan.findMany({
                where: { isResellerPlan: false },
                select: { plan: true, name: true },
                orderBy: { assistanceType: "asc" },
            });

        for (const p of filas) {
            const nombre = p.name?.trim();
            if (nombre && !etiquetas[p.plan]) etiquetas[p.plan] = nombre;
        }
    } catch {
        // Sin nombres se devuelve el mapa vacío y el llamador cae a los niveles.
    }

    return etiquetas;
}

/** El nivel llega por URL o por un formulario, así que se valida contra el enum. */
/**
 * El plan que pide un enlace de registro.
 *
 * Acepta dos formas y devuelve la misma:
 *
 *   - Por NIVEL: `nivel-2`, `nivel2`, `nivel 2` o `2`. Es la buena para los
 *     enlaces de venta. Los seis niveles no cambian nunca, mientras que el
 *     nombre interno de alguno —`avanzado` se vende como "Esencial",
 *     `enterprise` como "Business"— se lee como un nombre comercial y se presta
 *     a confusión con el que el cliente ve en la landing.
 *   - Por nombre interno: `basico`, `avanzado`… Sigue funcionando, para no
 *     romper ningún enlace que ya esté circulando.
 *
 * El número es la posición en PLANS, que está en orden ascendente de capacidad:
 * Nivel 1 = lite … Nivel 6 = personalizado. Es la misma numeración que usan las
 * pantallas internas (PLAN_LEVEL_LABELS).
 */
export function normalizarPlan(valor: string | undefined | null): Plan | null {
    const slug = valor?.trim().toLowerCase();
    if (!slug) return null;

    const porNivel = slug.match(/^(?:nivel[\s_-]*)?(\d+)$/);
    if (porNivel) {
        const nivel = Number(porNivel[1]);
        return nivel >= 1 && nivel <= PLANS.length ? PLANS[nivel - 1] : null;
    }

    return (Object.values(Plan) as string[]).includes(slug) ? (slug as Plan) : null;
}

export function normalizarAsistencia(valor: string | undefined | null): "IA" | "HUMANO" {
    return valor?.trim().toUpperCase() === "HUMANO" ? "HUMANO" : "IA";
}

/**
 * Precio de un plan para una cuenta concreta.
 *
 * Si la cuenta es de un reseller manda el precio que ese reseller le puso a su
 * plan: cada marca vende lo mismo a su precio, y cobrarle el de la plataforma
 * sería cobrarle el de otra marca.
 */
export async function precioDePlanParaCuenta(
    planSlug: string | undefined | null,
    assistanceType: string | undefined | null,
    resellerUserId: string | null,
): Promise<PrecioDePlan | null> {
    const plan = normalizarPlan(planSlug);
    if (!plan) return null;

    const tipo = normalizarAsistencia(assistanceType);

    if (resellerUserId) {
        const propio = await db.resellerPlan
            .findFirst({
                where: { resellerUserId, plan, assistanceType: tipo, isActive: true },
                select: { priceMonthly: true, priceCop: true },
            })
            .catch(() => null);
        if (propio) {
            const enPesos = precioEnPesosEscrito(propio.priceCop);
            if (enPesos) return { plan, ...enPesos };
            return { plan, ...(await convertirAMonedaDeCobro(Number(propio.priceMonthly))) };
        }
    }

    const dePlataforma = await db.subscriptionPlan
        .findFirst({
            where: { plan, assistanceType: tipo, isResellerPlan: false, isActive: true },
            select: { priceUSD: true, priceCop: true },
        })
        .catch(() => null);

    const enPesos = precioEnPesosEscrito(dePlataforma?.priceCop);
    if (enPesos) return { plan, ...enPesos };

    return { plan, ...(await convertirAMonedaDeCobro(Number(dePlataforma?.priceUSD ?? 0))) };
}

/**
 * El precio en pesos que se escribió a mano, si lo hay.
 *
 * Es el que manda: puesto, no se convierte nada y el cliente paga exactamente la
 * cifra que se publicó. Vacío o en cero se devuelve null, y el llamador sigue con
 * la conversión desde dólares de siempre — así ningún plan que nadie haya tocado
 * cambia de precio.
 */
function precioEnPesosEscrito(
    valor: { toString(): string } | null | undefined,
): { price: number; currency: string } | null {
    const pesos = Number(valor ?? 0);
    if (!Number.isFinite(pesos) || pesos <= 0) return null;
    // Wompi cobra en pesos enteros; un monto con decimales invalida el enlace.
    return { price: Math.round(pesos), currency: "COP" };
}
