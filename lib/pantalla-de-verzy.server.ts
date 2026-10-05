import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { laCita, elTelefono } from "@/lib/videollamada-en-vivo.server";
import { laCuentaDeVerzy } from "@/lib/videollamada-crm.server";
import { DURACION_DE_LA_SESION_S, lasCookiesDeVerzy } from "@/lib/sesion-de-verzy.server";
import {
    laRutaDelDestino, comoDestino, conLaNotaAgregada, NOMBRES_DE_LOS_DESTINOS,
    type DestinoDeVerzy, type OrdenDeLaPantalla, type ResultadoDeLaOrden,
} from "@/lib/pantalla-de-verzy";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";

/**
 * La PANTALLA de Verzy: un Chromium sin cabeza, dentro del servidor, con una
 * sesión REAL de «Verzay Ventas» abierta en proceso con su cookie de Auth.js. Verzy le da
 * órdenes (ir a Chats, abrir la ficha del prospecto, escribir una nota) y la
 * sala del prospecto recibe FOTOS de lo que se ve. Nada se inventa: lo que sale
 * en la sala es la plataforma de verdad, con sus datos de verdad.
 *
 * Por qué fotos y no un marco: el prospecto no puede tener una sesión de
 * Verzay Ventas en su navegador, y no la va a tener nunca. La sesión vive aquí.
 *
 * Dos réplicas: la pantalla de una cita la mueve UNA (la que tiene el turno en
 * `verzy_pantallas`). Las órdenes y las fotos pasan por la base, así que la
 * sala puede pedirlas a cualquiera de las dos.
 */

const RUTA_DEL_NAVEGADOR = process.env.CHROMIUM_PATH || undefined;
const BASE_LOCAL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const ANCHO = 1280;
const ALTO = 800;
const VUELTA_MS = 700;
/** Sin latido en este rato, el turno de una pantalla queda libre para otra réplica. */
const TURNO_LIBRE_MS = 8_000;
/** Sin que la sala pregunte en este rato, la pantalla se cierra. */
const SIN_MIRAR_MS = 60_000;
/** La sesión lista se conserva este rato después de usarla. */
const SESION_TIBIA_MS = 10 * 60_000;
const ESPERA_DE_LA_ORDEN_MS = 15_000;

const REPLICA = randomBytes(6).toString("hex");

let tablasListas: Promise<void> | null = null;

async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        if (!["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c))) throw error;
    }
}

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "verzy_pantallas" (
                "citaId" TEXT PRIMARY KEY,
                "replica" TEXT,
                "vistoEn" TIMESTAMP(3),
                "pedidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "destino" TEXT,
                "url" TEXT,
                "foto" BYTEA,
                "fotoEn" TIMESTAMP(3),
                "error" TEXT
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "verzy_ordenes" (
                "id" BIGSERIAL PRIMARY KEY,
                "citaId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "datos" JSONB NOT NULL DEFAULT '{}'::jsonb,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "hechoEn" TIMESTAMP(3),
                "resultado" JSONB
            )
        `);
        await ddl(() => db.$executeRaw`CREATE INDEX IF NOT EXISTS "verzy_ordenes_cita_idx" ON "verzy_ordenes" ("citaId", "id")`);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

// ---------------------------------------------------------------- navegador

type Navegador = import("playwright-core").Browser;
type Contexto = import("playwright-core").BrowserContext;
type Pagina = import("playwright-core").Page;

let navegador: Promise<Navegador> | null = null;
let sesion: { contexto: Contexto; usadaEn: number } | null = null;
let abriendoLaSesion: Promise<Contexto> | null = null;

async function elNavegador(): Promise<Navegador> {
    navegador ??= (async () => {
        const { chromium } = await import("playwright-core");
        const b = await chromium.launch({
            executablePath: RUTA_DEL_NAVEGADOR,
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--lang=es-CO"],
        });
        b.on("disconnected", () => {
            navegador = null;
            sesion = null;
        });
        return b;
    })().catch((error) => {
        navegador = null;
        throw error;
    });
    return navegador;
}

/** Abre (o reutiliza) la sesión de Verzay Ventas en proceso. */
async function laSesion(): Promise<Contexto> {
    if (sesion) {
        sesion.usadaEn = Date.now();
        return sesion.contexto;
    }
    abriendoLaSesion ??= (async () => {
        const b = await elNavegador();
        const contexto = await b.newContext({ viewport: { width: ANCHO, height: ALTO }, locale: "es-CO", timezoneId: "America/Bogota" });
        await contexto.addInitScript(() => {
            try { localStorage.setItem("chat-onboarding-shown", "true"); } catch { /* sin almacenamiento */ }
        });
        await entrar(contexto);
        sesion = { contexto, usadaEn: Date.now() };
        return contexto;
    })().finally(() => {
        abriendoLaSesion = null;
    });
    return abriendoLaSesion;
}

/**
 * Mete la sesión de Verzay Ventas en el contexto. Las dos cookies van con
 * `secure` en la de `__Secure-`: Chromium la acepta y la manda a 127.0.0.1
 * (origen de confianza), y es la que Auth.js lee cuando `NEXTAUTH_URL` es https.
 */
async function entrar(contexto: Contexto): Promise<void> {
    const sesionDeVerzy = await lasCookiesDeVerzy();
    if (!sesionDeVerzy) throw new Error("La sesión de Verzay Ventas no se abrió (sin cuenta o sin AUTH_SECRET)");
    const expires = Math.floor(Date.now() / 1000) + DURACION_DE_LA_SESION_S;
    await contexto.addCookies(sesionDeVerzy.cookies.map((c) => ({
        // Con `domain` y `path`, no con `url`: con `url` http Chromium rechaza
        // la cookie `__Secure-` («Invalid cookie fields»). 127.0.0.1 cuenta
        // como origen seguro, así que la manda igual por http.
        name: c.nombre, value: c.valor, domain: "127.0.0.1", path: "/", httpOnly: true,
        sameSite: "Lax" as const, secure: c.nombre.startsWith("__Secure-"), expires,
    })));
}

/** Mantiene la sesión tibia: se cierra solo si nadie la usó en un buen rato. */
setInterval(() => {
    if (sesion && Date.now() - sesion.usadaEn > SESION_TIBIA_MS && !pantallasVivas.size) {
        const c = sesion.contexto;
        sesion = null;
        c.close().catch(() => {});
    }
}, 60_000).unref?.();

/** Deja la sesión abierta y lista antes de que haga falta. Nunca lanza. */
export async function prepararLaSesionDeVerzy(): Promise<boolean> {
    try {
        await laSesion();
        return true;
    } catch (error) {
        console.error("[verzy] no se pudo preparar la sesión de Verzay Ventas", { motivo: error instanceof Error ? error.message : String(error) });
        return false;
    }
}

// ---------------------------------------------------------------- el prospecto en Verzay Ventas

type ElProspecto = { cuentaId: string; jid: string | null; linea: string | null; identidades: string[]; nombre: string };

async function elProspecto(citaId: string): Promise<ElProspecto | null> {
    const [cita, cuenta] = await Promise.all([laCita(citaId), laCuentaDeVerzy()]);
    if (!cita || !cuenta) return null;
    const telefono = elTelefono(cita.session);
    const base = cita.session?.remoteJid || (telefono ? `${telefono}@s.whatsapp.net` : "");
    const identidades = base
        ? buildWhatsAppJidCandidates(base, [cita.session?.remoteJidAlt, telefono ? `${telefono}@s.whatsapp.net` : null])
        : [];
    const nombre = (cita.session?.customName || cita.clientName || cita.session?.pushName || "").trim();
    if (!identidades.length) return { cuentaId: cuenta.id, jid: null, linea: null, identidades, nombre };
    const ses = await db.session.findFirst({
        where: { userId: cuenta.id, OR: [{ remoteJid: { in: identidades } }, { remoteJidAlt: { in: identidades } }] },
        orderBy: { updatedAt: "desc" },
        select: { remoteJid: true, instanceId: true },
    });
    if (!ses) return { cuentaId: cuenta.id, jid: null, linea: null, identidades, nombre };
    const linea = await db.instancia.findFirst({
        where: { userId: cuenta.id, OR: [{ instanceName: ses.instanceId }, { instanceId: ses.instanceId }] },
        select: { instanceName: true },
    });
    return { cuentaId: cuenta.id, jid: ses.remoteJid, linea: linea?.instanceName ?? ses.instanceId ?? null, identidades, nombre };
}

// ---------------------------------------------------------------- una pantalla viva

type Viva = { citaId: string; pagina: Pagina; destino: DestinoDeVerzy | null; prospecto: ElProspecto | null };
const pantallasVivas = new Map<string, Viva>();

async function tomarElTurno(citaId: string): Promise<boolean> {
    await asegurarLasTablas();
    const n = await db.$executeRaw`
        INSERT INTO "verzy_pantallas" ("citaId", "replica", "vistoEn", "pedidaEn")
        VALUES (${citaId}, ${REPLICA}, NOW(), NOW())
        ON CONFLICT ("citaId") DO UPDATE SET "replica" = ${REPLICA}, "vistoEn" = NOW(), "pedidaEn" = NOW()
        WHERE "verzy_pantallas"."replica" = ${REPLICA}
           OR "verzy_pantallas"."replica" IS NULL
           OR "verzy_pantallas"."vistoEn" IS NULL
           OR "verzy_pantallas"."vistoEn" < NOW() - make_interval(secs => ${TURNO_LIBRE_MS / 1000}::double precision)
    `;
    return n > 0;
}

/**
 * Que la pantalla de esta cita esté corriendo en alguna réplica. Si nadie la
 * tiene, la toma esta. Nunca lanza: devuelve si esta réplica la está moviendo.
 */
export async function asegurarLaPantalla(citaId: string): Promise<boolean> {
    try {
        await asegurarLasTablas();
        await db.$executeRaw`UPDATE "verzy_pantallas" SET "pedidaEn" = NOW() WHERE "citaId" = ${citaId}`;
        if (pantallasVivas.has(citaId)) return true;
        if (!(await tomarElTurno(citaId))) return false;
        const contexto = await laSesion();
        const pagina = await contexto.newPage();
        const viva: Viva = { citaId, pagina, destino: null, prospecto: await elProspecto(citaId) };
        pantallasVivas.set(citaId, viva);
        void elCiclo(viva);
        return true;
    } catch (error) {
        console.error("[verzy] no se pudo levantar la pantalla", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
        await anotarElError(citaId, error).catch(() => {});
        return false;
    }
}

async function anotarElError(citaId: string, error: unknown): Promise<void> {
    const motivo = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await db.$executeRaw`UPDATE "verzy_pantallas" SET "error" = ${motivo} WHERE "citaId" = ${citaId}`;
}

async function elCiclo(viva: Viva): Promise<void> {
    const { citaId } = viva;
    try {
        for (;;) {
            const filas = await db.$queryRaw<{ replica: string | null; pedidaEn: Date }[]>`
                UPDATE "verzy_pantallas" SET "vistoEn" = NOW()
                WHERE "citaId" = ${citaId} AND "replica" = ${REPLICA}
                RETURNING "replica", "pedidaEn"
            `;
            if (!filas.length) break; // otra réplica tomó el turno
            if (Date.now() - new Date(filas[0].pedidaEn).getTime() > SIN_MIRAR_MS) break;
            if (sesion) sesion.usadaEn = Date.now();

            const ordenes = await db.$queryRaw<{ id: bigint; tipo: string; datos: unknown }[]>`
                SELECT "id", "tipo", "datos" FROM "verzy_ordenes"
                WHERE "citaId" = ${citaId} AND "hechoEn" IS NULL ORDER BY "id" ASC LIMIT 5
            `;
            for (const o of ordenes) {
                const resultado = await hacerLaOrden(viva, { tipo: o.tipo, datos: o.datos } as OrdenDeLaPantalla)
                    .catch((error): ResultadoDeLaOrden => ({ ok: false, motivo: error instanceof Error ? error.message : String(error) }));
                if (!resultado.ok) console.warn("[verzy] una orden de la pantalla no salió", { cita: citaId, tipo: o.tipo, motivo: resultado.motivo });
                await db.$executeRaw`
                    UPDATE "verzy_ordenes" SET "hechoEn" = NOW(), "resultado" = ${JSON.stringify(resultado)}::jsonb WHERE "id" = ${o.id}
                `;
            }

            if (viva.destino) {
                const foto = await viva.pagina.screenshot({ type: "jpeg", quality: 60 }).catch(() => null);
                if (foto) {
                    await db.$executeRaw`
                        UPDATE "verzy_pantallas" SET "foto" = ${foto}, "fotoEn" = NOW(), "url" = ${viva.pagina.url()}, "error" = NULL
                        WHERE "citaId" = ${citaId} AND "replica" = ${REPLICA}
                    `;
                }
            }
            await new Promise((r) => setTimeout(r, VUELTA_MS));
        }
    } catch (error) {
        console.error("[verzy] la pantalla se detuvo", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
        await anotarElError(citaId, error).catch(() => {});
    } finally {
        pantallasVivas.delete(citaId);
        await viva.pagina.close().catch(() => {});
        await db.$executeRaw`UPDATE "verzy_pantallas" SET "replica" = NULL WHERE "citaId" = ${citaId} AND "replica" = ${REPLICA}`.catch(() => {});
    }
}

// ---------------------------------------------------------------- las órdenes

async function irA(viva: Viva, destino: DestinoDeVerzy): Promise<ResultadoDeLaOrden> {
    const p = viva.prospecto;
    const ruta = laRutaDelDestino(destino, p?.jid ? { jid: p.jid, linea: p.linea } : null);
    let res = await viva.pagina.goto(`${BASE_LOCAL}${ruta}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (new URL(viva.pagina.url()).pathname.startsWith("/login")) {
        // La sesión caducó o cambió la versión del token: se vuelve a entrar.
        await entrar(viva.pagina.context());
        res = await viva.pagina.goto(`${BASE_LOCAL}${ruta}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (new URL(viva.pagina.url()).pathname.startsWith("/login")) {
            return { ok: false, motivo: "La sesión de Verzay Ventas no se pudo abrir" };
        }
    }
    if (res && res.status() >= 500) return { ok: false, motivo: `La plataforma contestó ${res.status()}` };
    await viva.pagina.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await viva.pagina.keyboard.press("Escape").catch(() => {});
    viva.destino = destino;

    if (destino === "ficha") {
        if (!p?.jid) return { ok: false, motivo: "El prospecto todavía no tiene conversación en Verzay Ventas" };
        const abierta = await abrirLaFicha(viva.pagina);
        if (!abierta) return { ok: false, motivo: "No se pudo abrir la ficha del contacto" };
    }
    if ((destino === "chats" || destino === "ficha") && !p?.jid) {
        return { ok: true, aviso: "El prospecto todavía no tiene conversación en Verzay Ventas: se ve la bandeja" };
    }
    return { ok: true };
}

async function abrirLaFicha(pagina: Pagina): Promise<boolean> {
    if (await pagina.locator("textarea[data-notas]").first().isVisible().catch(() => false)) return true;
    const boton = pagina.locator('button[title="Ver ficha del contacto"]:visible').first();
    await boton.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    if (!(await boton.isVisible().catch(() => false))) return false;
    await boton.click();
    return pagina.locator("textarea[data-notas]").first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
}

async function tomarLaNota(viva: Viva, texto: string): Promise<ResultadoDeLaOrden> {
    const p = viva.prospecto;
    if (!p?.jid) return { ok: false, motivo: "El prospecto todavía no tiene conversación en Verzay Ventas" };
    if (viva.destino !== "ficha") {
        const fuimos = await irA(viva, "ficha");
        if (!fuimos.ok) return fuimos;
    }
    const caja = viva.pagina.locator("textarea[data-notas]").first();
    await caja.scrollIntoViewIfNeeded().catch(() => {});
    const antes = await caja.inputValue();
    const despues = conLaNotaAgregada(antes, texto);
    await caja.click();
    await caja.fill(despues);
    await caja.blur(); // la ficha guarda al salir del campo
    // Se comprueba en la BASE, no en la pantalla: guardada de verdad o no.
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await laNotaEstaGuardada(p, texto)) return { ok: true };
    }
    return { ok: false, motivo: "La nota se escribió en la ficha pero no se confirmó guardada" };
}

async function laNotaEstaGuardada(p: ElProspecto, texto: string): Promise<boolean> {
    const filas = await db.externalClientData.findMany({
        where: { userId: p.cuentaId, remoteJid: { in: Array.from(new Set([p.jid!, ...p.identidades])) } },
        select: { data: true },
    });
    return filas.some((f) => {
        const notas = (f.data as Record<string, unknown> | null)?.notas;
        return typeof notas === "string" && notas.includes(texto.trim());
    });
}

async function hacerLaOrden(viva: Viva, orden: OrdenDeLaPantalla): Promise<ResultadoDeLaOrden> {
    if (orden.tipo === "ir") {
        const destino = comoDestino((orden.datos as { destino?: unknown })?.destino);
        if (!destino) return { ok: false, motivo: "Destino desconocido" };
        return irA(viva, destino);
    }
    if (orden.tipo === "nota") {
        const texto = String((orden.datos as { texto?: unknown })?.texto ?? "").trim();
        if (!texto) return { ok: false, motivo: "Nota vacía" };
        return tomarLaNota(viva, texto);
    }
    return { ok: false, motivo: "Orden desconocida" };
}

// ---------------------------------------------------------------- lo que pide la sala

/** Deja una orden y espera su resultado un rato. Nunca lanza. */
export async function pedirALaPantalla(citaId: string, orden: OrdenDeLaPantalla): Promise<ResultadoDeLaOrden> {
    try {
        await asegurarLasTablas();
        const filas = await db.$queryRaw<{ id: bigint }[]>`
            INSERT INTO "verzy_ordenes" ("citaId", "tipo", "datos") VALUES (${citaId}, ${orden.tipo}, ${JSON.stringify(orden.datos ?? {})}::jsonb)
            RETURNING "id"
        `;
        await asegurarLaPantalla(citaId);
        const id = filas[0].id;
        const hasta = Date.now() + ESPERA_DE_LA_ORDEN_MS;
        while (Date.now() < hasta) {
            await new Promise((r) => setTimeout(r, 400));
            const r = await db.$queryRaw<{ resultado: ResultadoDeLaOrden | null; hechoEn: Date | null }[]>`
                SELECT "resultado", "hechoEn" FROM "verzy_ordenes" WHERE "id" = ${id}
            `;
            if (r[0]?.hechoEn) return r[0].resultado ?? { ok: false, motivo: "Sin resultado" };
            await asegurarLaPantalla(citaId);
        }
        return { ok: true, aviso: "Sigue en curso" };
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error("[verzy] no se pudo pedir a la pantalla", { cita: citaId, motivo });
        return { ok: false, motivo };
    }
}

/** La última foto de la pantalla, o null si todavía no hay. */
export async function laFotoDeLaPantalla(citaId: string): Promise<{ foto: Buffer; en: Date; destino: string | null } | null> {
    await asegurarLasTablas();
    void asegurarLaPantalla(citaId);
    const filas = await db.$queryRaw<{ foto: Buffer | null; fotoEn: Date | null; url: string | null }[]>`
        SELECT "foto", "fotoEn", "url" FROM "verzy_pantallas" WHERE "citaId" = ${citaId}
    `;
    const f = filas[0];
    if (!f?.foto || !f.fotoEn) return null;
    return { foto: Buffer.from(f.foto), en: f.fotoEn, destino: f.url };
}

export { NOMBRES_DE_LOS_DESTINOS };
