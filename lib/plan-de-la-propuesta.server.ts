import "server-only";

import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { db } from "@/lib/db";
import { elEnlaceDeLaPaginaDelPlan } from "@/lib/enlaces-de-planes";
import { conLosNombresVigentes } from "@/lib/nombre-del-nivel.server";
import {
    comoImagenDelPlan,
    elNombreDelPlan,
    elPrecioQueSeEnsena,
    elTituloDelVideo,
    elVideoDelPlan,
    laCapacidadDelPlan,
    lasFuncionesDelPlan,
    lasFuncionesQueSeEnsenan,
    losBotonesDelPlan,
    losDatosDelPlan,
} from "@/lib/pagina-de-plan";
import {
    comoRefDePlan,
    laLlaveDelPlan,
    lasGuiasDeLaPropuesta,
    ordenarPlanesParaElegir,
    type PlanDeLaPropuesta,
    type PlanParaCargar,
    type PlanParaElegir,
    type RefDePlan,
} from "@/lib/plan-de-la-propuesta";
import { lasFuncionesGuardadas } from "@/lib/plan-funciones-db";
import { laPaginaGuardada } from "@/lib/plan-pagina-db";
import { convertirAMonedaDeCobro, precioEnPesosEscrito } from "@/lib/plan-pricing";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

/**
 * Un plan del panel de Planes leído EN VIVO para una propuesta: lo que se carga
 * al elegir una plantilla enlazada y lo que la página pública de la propuesta
 * enseña (video y enlace). Las reglas viven en `lib/plan-de-la-propuesta.ts`;
 * aquí solo se lee, con las MISMAS funciones que la página pública del plan
 * (`lib/pagina-de-plan.server.ts`), así que la propuesta y esa página dicen lo
 * mismo: el mismo nombre, los mismos recuadros y los mismos ítems.
 *
 * Nada de esto tumba a quien pregunta: un fallo se dice en la consola y se
 * devuelve lo que se pudo leer (o `null`).
 */

/** Las mismas guías que la página pública del plan: decide qué funciones se enseñan. */
const GUIAS_QUE_SE_ENSENAN: ReadonlySet<string> = new Set(GUIAS_PUBLICADAS.map((g) => g.modulo));

/**
 * Las que salen DENTRO de la propuesta: las mismas menos las que son para quien
 * ya compró (`GUIAS_FUERA_DE_LA_PROPUESTA`, hoy la del Agente IA).
 */
const GUIAS_EN_LA_PROPUESTA: ReadonlySet<string> = lasGuiasDeLaPropuesta(GUIAS_QUE_SE_ENSENAN);

const COLUMNAS = {
    id: true,
    plan: true,
    name: true,
    assistanceType: true,
    isActive: true,
    priceUSD: true,
    priceCop: true,
    credits: true,
    features: true,
    description: true,
} as const;

/** Los planes de la plataforma (no los de reseller), con el nombre VIGENTE de su nivel. */
async function losPlanesDeLaPlataforma() {
    const filas = await db.subscriptionPlan.findMany({ where: { isResellerPlan: false }, select: COLUMNAS });
    return conLosNombresVigentes(filas);
}

/** Para el selector de una plantilla: todos los planes de la plataforma, también los apagados (se marcan). */
export async function losPlanesParaElegir(): Promise<PlanParaElegir[]> {
    try {
        const planes = await losPlanesDeLaPlataforma();
        const lista: PlanParaElegir[] = [];
        for (const p of planes) {
            const ref = comoRefDePlan({ nivel: p.plan, asistencia: p.assistanceType });
            if (!ref) continue;
            lista.push({ ref, nombre: elNombreDelPlan(p), activo: p.isActive });
        }
        return ordenarPlanesParaElegir(lista);
    } catch (e) {
        console.error("[propuestas] no se pudieron leer los planes del panel para el selector", e);
        return [];
    }
}

/** El precio del plan en cada moneda que el panel sabe dar. */
async function losPreciosDelPlan(p: { priceUSD: unknown; priceCop: unknown }): Promise<PlanParaCargar["precios"]> {
    const usd = Number(p.priceUSD ?? 0);
    const USD = Number.isFinite(usd) && usd > 0 ? usd : null;
    const escrito = precioEnPesosEscrito(p.priceCop as { toString(): string } | null);
    if (escrito) return { COP: escrito.price, USD };
    if (USD === null) return { COP: null, USD };
    const convertido = await convertirAMonedaDeCobro(USD);
    return { COP: convertido.currency === "COP" ? convertido.price : null, USD };
}

/** Lo que trae un plan al cargarlo en una propuesta, leído hoy del panel. `null`: ese plan no existe. */
export async function elPlanParaCargar(ref: RefDePlan, origen: string): Promise<PlanParaCargar | null> {
    try {
        const planes = await losPlanesDeLaPlataforma();
        const fila = planes.find((p) => p.plan === ref.nivel && (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") === ref.asistencia);
        if (!fila) return null;

        const [guardadas, pagina, detalle, precios] = await Promise.all([
            lasFuncionesGuardadas([fila.id]).catch((e) => {
                console.error("[propuestas] no se pudieron leer las funciones guardadas del plan; se deducen", { plan: fila.id, e });
                return new Map<string, unknown>();
            }),
            laPaginaGuardada(fila.id).catch((e) => {
                console.error("[propuestas] no se pudieron leer los recuadros del plan; salen los de fábrica", { plan: fila.id, e });
                return null;
            }),
            db.planDetail.findUnique({ where: { subscriptionPlanId: fila.id }, select: { videoUrl: true } }).catch((e) => {
                console.error("[propuestas] no se pudo leer el video del plan", { plan: fila.id, e });
                return null;
            }),
            losPreciosDelPlan(fila),
        ]);

        const datos = losDatosDelPlan(fila, planes.map(elNombreDelPlan));
        const funciones = lasFuncionesQueSeEnsenan(
            lasFuncionesDelPlan(fila.features ?? [], guardadas.get(fila.id)),
            datos,
            GUIAS_QUE_SE_ENSENAN,
        );
        return {
            ref,
            nombre: datos.nombre,
            activo: fila.isActive,
            precios,
            capacidad: laCapacidadDelPlan(datos, pagina?.recuadros).map((c) => ({ titulo: c.titulo, valor: c.valor })),
            funciones: funciones.map((f) => f.nombre),
            video: Boolean(elVideoDelPlan(detalle?.videoUrl)),
            enlace: fila.isActive ? `${origen}${elEnlaceDeLaPaginaDelPlan(ref.nivel, ref.asistencia)}` : null,
        };
    } catch (e) {
        console.error("[propuestas] no se pudo leer el plan del panel", { ref, e });
        return null;
    }
}

/**
 * Lo que la página pública de una propuesta enseña de cada plan: su video, sus
 * recuadros, «Qué incluye» y el precio con su botón, leídos como su página.
 */
export type { PlanDeLaPropuesta };

export async function losPlanesDeLaPropuesta(refs: readonly RefDePlan[], origen: string): Promise<PlanDeLaPropuesta[]> {
    if (refs.length === 0) return [];
    try {
        const planes = await losPlanesDeLaPlataforma();
        const nombres = planes.map(elNombreDelPlan);
        const filas = refs
            .map((ref) => ({
                ref,
                fila: planes.find((p) => p.plan === ref.nivel && (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") === ref.asistencia),
            }))
            .filter((x): x is { ref: RefDePlan; fila: (typeof planes)[number] } => Boolean(x.fila));
        if (filas.length === 0) return [];

        const ids = filas.map((x) => x.fila.id);
        const [detalles, guardadas, paginas, sitio] = await Promise.all([
            db.planDetail.findMany({ where: { subscriptionPlanId: { in: ids } } }).catch((e) => {
                console.error("[propuestas] no se pudo leer el detalle de los planes de la propuesta; salen sin video", e);
                return [];
            }),
            lasFuncionesGuardadas(ids).catch((e) => {
                console.error("[propuestas] no se pudieron leer las funciones guardadas de los planes; se deducen", e);
                return new Map<string, unknown>();
            }),
            Promise.all(
                ids.map((id) =>
                    laPaginaGuardada(id).catch((e) => {
                        console.error("[propuestas] no se pudieron leer los recuadros del plan; salen los de fábrica", { plan: id, e });
                        return null;
                    }),
                ),
            ),
            getSiteConfig().catch((e) => {
                console.error("[propuestas] no se pudo leer la configuración del sitio; el botón sale con el registro", e);
                return {} as { whatsappNumber?: string | null };
            }),
        ]);
        const porPlan = new Map(detalles.map((d) => [d.subscriptionPlanId, d]));
        const paginaDe = new Map(ids.map((id, i) => [id, paginas[i]]));

        return filas.map(({ ref, fila }) => {
            const datos = losDatosDelPlan(fila, nombres);
            const detalle = porPlan.get(fila.id);
            const video = elVideoDelPlan(detalle?.videoUrl);
            return {
                llave: laLlaveDelPlan(ref),
                nombre: datos.nombre,
                video: video
                    ? { ...video, titulo: elTituloDelVideo(detalle?.videoTitle, datos), miniatura: comoImagenDelPlan(detalle?.videoThumbnailUrl) }
                    : null,
                enlace: fila.isActive ? `${origen}${elEnlaceDeLaPaginaDelPlan(ref.nivel, ref.asistencia)}` : null,
                plan: fila.plan,
                tipo: ref.asistencia,
                activo: fila.isActive,
                capacidad: laCapacidadDelPlan(datos, paginaDe.get(fila.id)?.recuadros),
                funciones: lasFuncionesQueSeEnsenan(
                    lasFuncionesDelPlan(fila.features ?? [], guardadas.get(fila.id)),
                    datos,
                    GUIAS_EN_LA_PROPUESTA,
                ),
                precio: elPrecioQueSeEnsena(datos),
                boton: fila.isActive ? losBotonesDelPlan(detalle ?? null, datos, sitio).principal : null,
            };
        });
    } catch (e) {
        console.error("[propuestas] no se pudieron leer los planes de la propuesta; sale sin ellos", e);
        return [];
    }
}

/** El nombre y el precio de hoy de los planes enlazados, para pintar las plantillas con lo vigente. */
export async function losResumenesDeLosPlanes(
    refs: readonly RefDePlan[],
): Promise<Map<string, { nombre: string; activo: boolean; precios: PlanParaCargar["precios"] }>> {
    const fuera = new Map<string, { nombre: string; activo: boolean; precios: PlanParaCargar["precios"] }>();
    if (refs.length === 0) return fuera;
    try {
        const planes = await losPlanesDeLaPlataforma();
        for (const ref of refs) {
            const fila = planes.find((p) => p.plan === ref.nivel && (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") === ref.asistencia);
            if (!fila || fuera.has(laLlaveDelPlan(ref))) continue;
            fuera.set(laLlaveDelPlan(ref), { nombre: elNombreDelPlan(fila), activo: fila.isActive, precios: await losPreciosDelPlan(fila) });
        }
    } catch (e) {
        console.error("[propuestas] no se pudo leer el nombre vigente de los planes enlazados", e);
    }
    return fuera;
}
