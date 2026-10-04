import "server-only";

import { cache } from "react";

import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { db } from "@/lib/db";
import {
    comoImagenDelPlan,
    comoOrdenDeBloques,
    elNombreDelPlan,
    elParaQuienQueSale,
    elPlanQueSeEnsena,
    elPlanSuperior,
    elPrecioQueSeEnsena,
    elTituloDelVideo,
    elVideoDelPlan,
    laCabeceraDeLaPagina,
    laCapacidadDelPlan,
    laDescripcionQueSale,
    lasFuncionesDelPlan,
    lasFuncionesQueSeEnsenan,
    lasPreguntasQueSalen,
    losBotonesDelPlan,
    losDatosDelPlan,
    type BloqueDeLaPagina,
    type BotonDelPlan,
    type FuncionQueSeEnsena,
    type ParaQuienDelPlan,
    type PlanSuperior,
    type PreguntaDelPlan,
    type TarjetaDeCapacidad,
    type VideoDelPlan,
} from "@/lib/pagina-de-plan";
import { conLosNombresVigentes } from "@/lib/nombre-del-nivel.server";
import { lasFuncionesGuardadas } from "@/lib/plan-funciones-db";
import { laPaginaGuardada } from "@/lib/plan-pagina-db";
import { elParaQuienGuardado } from "@/lib/plan-para-quien-db";
import { normalizarAsistencia, normalizarPlan } from "@/lib/plan-pricing";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

/**
 * Todo lo que enseña la página pública de un plan, leído EN VIVO de lo que hay
 * hoy en el panel de Planes: el plan (nombre, precio, créditos, descripción,
 * si está activo), sus funciones (`features` + `plan_funciones`), su detalle
 * (`plan_details`: video, preguntas, botones, título de la pestaña), «para
 * quién es» (`plan_para_quien`), el orden de sus bloques y los recuadros de
 * catálogo y asistencia (`plan_pagina`) y cuál es el plan inmediato superior.
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
    nombre: string;
    precio: { texto: string; aConsultar: boolean };
    video: (VideoDelPlan & { titulo: string; miniatura: string | null }) | null;
    paraQuien: ParaQuienDelPlan;
    capacidad: TarjetaDeCapacidad[];
    /** Una por función, en el orden del editor del panel. */
    funciones: FuncionQueSeEnsena[];
    preguntas: PreguntaDelPlan[];
    botones: { principal: BotonDelPlan; secundario: BotonDelPlan | null };
    /** La línea discreta del final. `null`: es el último nivel que se vende. */
    planSuperior: PlanSuperior | null;
    meta: { titulo: string; descripcion: string; imagen: string | null };
    marca: string;
    logo: string | null;
    favicon: string | null;
    /** En qué orden se pintan los bloques (el panel los arrastra). Siempre los seis. */
    orden: BloqueDeLaPagina[];
};

const TITULO_DE_LAS_GUIAS: ReadonlyMap<string, string> = new Map(
    GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]),
);

export const laPaginaDelPlan = cache(async (slug: string, tipoCrudo?: string | null): Promise<PaginaDelPlan | null> => {
    const plan = normalizarPlan(slug);
    if (!plan) return null;
    const tipo = normalizarAsistencia(tipoCrudo);

    // Con el nombre VIGENTE de cada nivel (`lib/nombre-del-nivel.ts`): la fila
    // que se enseña puede no ser la que se renombró la última vez.
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
        },
    }).then(conLosNombresVigentes);

    const elegido = elPlanQueSeEnsena(planes, plan, tipo);
    if (!elegido) return null;
    const tipoElegido = elegido.assistanceType === "HUMANO" ? "HUMANO" : "IA";

    const [detalle, guardadas, paraQuienGuardado, paginaGuardada, sitio] = await Promise.all([
        db.planDetail.findUnique({ where: { subscriptionPlanId: elegido.id } }).catch((e) => {
            console.error("[planes] no se pudo leer el detalle del plan; la página sale sin él", { plan: elegido.id, e });
            return null;
        }),
        lasFuncionesGuardadas([elegido.id]).catch((e) => {
            console.error("[planes] no se pudieron leer las funciones guardadas; se deducen de features", { plan: elegido.id, e });
            return new Map<string, unknown>();
        }),
        elParaQuienGuardado(elegido.id).catch((e) => {
            console.error("[planes] no se pudo leer «para quién es»; sale el texto de fábrica", { plan: elegido.id, e });
            return null;
        }),
        laPaginaGuardada(elegido.id).catch((e) => {
            console.error("[planes] no se pudo leer el orden ni los recuadros; sale lo de fábrica", { plan: elegido.id, e });
            return null;
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
        nombre: datos.nombre,
        precio: elPrecioQueSeEnsena(datos),
        video: video
            ? { ...video, titulo: elTituloDelVideo(detalle?.videoTitle, datos), miniatura: comoImagenDelPlan(detalle?.videoThumbnailUrl) }
            : null,
        paraQuien: elParaQuienQueSale(paraQuienGuardado, datos),
        capacidad: laCapacidadDelPlan(datos, paginaGuardada?.recuadros),
        funciones: lasFuncionesQueSeEnsenan(funciones, datos, TITULO_DE_LAS_GUIAS),
        preguntas: lasPreguntasQueSalen(detalle?.faqs, datos),
        botones: losBotonesDelPlan(detalle, datos, sitio),
        planSuperior: elPlanSuperior(planes, elegido),
        meta: { ...laCabeceraDeLaPagina(detalle, datos, descripcion, marca), imagen: comoImagenDelPlan(detalle?.ogImageUrl) },
        marca,
        logo: comoImagenDelPlan(sitio.logoUrl),
        favicon: comoImagenDelPlan(sitio.faviconUrl),
        orden: paginaGuardada?.orden ?? comoOrdenDeBloques(null),
    };
});
