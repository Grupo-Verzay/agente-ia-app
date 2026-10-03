import "server-only";

import { cache } from "react";

import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { db } from "@/lib/db";
import {
    comoImagenDelPlan,
    elNombreDelPlan,
    elPlanQueSeEnsena,
    elPrecioQueSeEnsena,
    elTituloDelVideo,
    elVideoDelPlan,
    laCabeceraDeLaPagina,
    laCapacidadDelPlan,
    laDescripcionQueSale,
    lasFuncionesDelPlan,
    lasFuncionesPorCategoria,
    lasPreguntasQueSalen,
    losBotonesDelPlan,
    losDatosDelPlan,
    type BotonDelPlan,
    type GrupoDeFunciones,
    type PreguntaDelPlan,
    type TarjetaDeCapacidad,
    type VideoDelPlan,
} from "@/lib/pagina-de-plan";
import { lasFuncionesGuardadas } from "@/lib/plan-funciones-db";
import { normalizarAsistencia, normalizarPlan } from "@/lib/plan-pricing";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

/**
 * Todo lo que enseña la página pública de un plan, leído EN VIVO de lo que hay
 * hoy en el panel de Planes: el plan (nombre, precio, créditos, descripción,
 * si está activo), sus funciones (`features` + `plan_funciones`) y su detalle
 * (`plan_details`: video, preguntas, botones, título de la pestaña).
 *
 * Nada de lo que sale aquí está escrito a mano en la página: si en el panel se
 * apaga, se renombra o se edita una función, la página lo dice la próxima vez
 * que se abre. Y lo guardado que ya no cuadra con el plan (un nombre viejo,
 * otros créditos) no sale: se avisa en el panel.
 *
 * `cache` de React: la página y su `generateMetadata` piden lo mismo en la misma
 * petición, y se lee una vez.
 */

export type PaginaDelPlan = {
    plan: string;
    tipo: "IA" | "HUMANO";
    /** El otro tipo de asistencia de este nivel, si también está activo. */
    otroTipo: "IA" | "HUMANO" | null;
    nombre: string;
    descripcion: string | null;
    esPopular: boolean;
    precio: { texto: string; aConsultar: boolean };
    video: (VideoDelPlan & { titulo: string; miniatura: string | null }) | null;
    capacidad: TarjetaDeCapacidad[];
    grupos: GrupoDeFunciones[];
    preguntas: PreguntaDelPlan[];
    botones: { principal: BotonDelPlan; secundario: BotonDelPlan | null };
    meta: { titulo: string; descripcion: string; imagen: string | null };
    marca: string;
    logo: string | null;
    favicon: string | null;
};

const TITULO_DE_LAS_GUIAS: ReadonlyMap<string, string> = new Map(
    GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]),
);

export const laPaginaDelPlan = cache(async (slug: string, tipoCrudo?: string | null): Promise<PaginaDelPlan | null> => {
    const plan = normalizarPlan(slug);
    if (!plan) return null;
    const tipo = normalizarAsistencia(tipoCrudo);

    const planes = await db.subscriptionPlan.findMany({
        where: { isResellerPlan: false },
        select: {
            id: true,
            plan: true,
            name: true,
            assistanceType: true,
            isActive: true,
            priceUSD: true,
            credits: true,
            features: true,
            description: true,
            isPopular: true,
        },
    });

    const elegido = elPlanQueSeEnsena(planes, plan, tipo);
    if (!elegido) return null;
    const tipoElegido = elegido.assistanceType === "HUMANO" ? "HUMANO" : "IA";
    const otro = tipoElegido === "IA" ? "HUMANO" : "IA";
    const otroTipo = planes.some((p) => p.plan === plan && p.isActive && (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") === otro)
        ? otro
        : null;

    const [detalle, guardadas, sitio] = await Promise.all([
        db.planDetail.findUnique({ where: { subscriptionPlanId: elegido.id } }).catch((e) => {
            console.error("[planes] no se pudo leer el detalle del plan; la página sale sin él", { plan: elegido.id, e });
            return null;
        }),
        lasFuncionesGuardadas([elegido.id]).catch((e) => {
            console.error("[planes] no se pudieron leer las funciones guardadas; se deducen de features", { plan: elegido.id, e });
            return new Map<string, unknown>();
        }),
        getSiteConfig(),
    ]);

    const datos = losDatosDelPlan(elegido, planes.map(elNombreDelPlan));
    const funciones = lasFuncionesDelPlan(elegido.features ?? [], guardadas.get(elegido.id));
    const marca = sitio.brandName?.trim() || "Agente IA";
    const descripcion = laDescripcionQueSale(elegido.description, datos);
    const video = elVideoDelPlan(detalle?.videoUrl);

    return {
        plan,
        tipo: tipoElegido,
        otroTipo,
        nombre: datos.nombre,
        descripcion,
        esPopular: !!elegido.isPopular,
        precio: elPrecioQueSeEnsena(datos),
        video: video
            ? { ...video, titulo: elTituloDelVideo(detalle?.videoTitle, datos), miniatura: comoImagenDelPlan(detalle?.videoThumbnailUrl) }
            : null,
        capacidad: laCapacidadDelPlan(datos, funciones),
        grupos: lasFuncionesPorCategoria(funciones, datos, TITULO_DE_LAS_GUIAS),
        preguntas: lasPreguntasQueSalen(detalle?.faqs, datos),
        botones: losBotonesDelPlan(detalle, datos, sitio),
        meta: { ...laCabeceraDeLaPagina(detalle, datos, descripcion, marca), imagen: comoImagenDelPlan(detalle?.ogImageUrl) },
        marca,
        logo: comoImagenDelPlan(sitio.logoUrl),
        favicon: comoImagenDelPlan(sitio.faviconUrl),
    };
});
