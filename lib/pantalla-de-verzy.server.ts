import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { laCita, elTelefono } from "@/lib/videollamada-en-vivo.server";
import { laCuentaDeVerzy } from "@/lib/videollamada-crm.server";
import { DURACION_DE_LA_SESION_S, lasCookiesDeVerzy } from "@/lib/sesion-de-verzy.server";
import { asegurarColumna } from "@/lib/ddl-sin-bloquear";
import {
    laRutaYElAnclaDeVerzy, comoRutaDeVerzy, laUrlDeLaConversacion, elTituloDeLaNotaDeLaLlamada,
    FPS_DEL_FLUJO, REPETIR_QUIETA_MS, RECORRIDO_DEL_RATON_MS, PAUSA_ENTRE_LETRAS_MS,
    elRecorridoDelRaton, loQueSeBusca, elDestinoQueSeRetoma,
    TAMANO_DE_FABRICA,
    type LugarDeVerzy, type OrdenDeLaPantalla, type ResultadoDeLaOrden, type TamanoDeLaPantalla,
} from "@/lib/pantalla-de-verzy";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";

/**
 * La PANTALLA de Verzy: un Chromium sin cabeza, dentro del servidor, con una
 * sesión REAL de «Verzay Ventas» abierta en proceso con su cookie de Auth.js. Verzy le da
 * órdenes (ir a Chats, abrir la ficha del prospecto, escribir una nota) y la
 * sala del prospecto recibe un FLUJO DE VIDEO de lo que se ve, en vivo y en
 * movimiento: el screencast de Chromium (CDP `Page.startScreencast`) servido
 * como MJPEG. Verzy navega como una persona: el cursor se desliza, el buscador
 * se escribe letra a letra, la nota también. Nada se inventa.
 *
 * Por qué no un marco: el prospecto no puede tener una sesión de Verzay Ventas
 * en su navegador, y no la va a tener nunca. La sesión vive aquí.
 *
 * Dos réplicas: la pantalla de una cita la mueve UNA (la que tiene el turno en
 * `verzy_pantallas`). Las órdenes pasan por la base. El flujo sale directo de
 * la memoria de esa réplica; si la sala cae en la otra, el dueño le pasa los
 * fotogramas por la base (`foto`, solo mientras alguien lo pide en `pideRelevoEn`).
 */

const RUTA_DEL_NAVEGADOR = process.env.CHROMIUM_PATH || undefined;
const BASE_LOCAL = `http://127.0.0.1:${process.env.PORT || 3000}`;
// La ventana nace con el tamaño de fábrica y después toma el formato del hueco
// de la sala (orden «tamano»): así el video la llena sin franjas a los lados.
const ANCHO = TAMANO_DE_FABRICA.ancho;
const ALTO = TAMANO_DE_FABRICA.alto;
const VUELTA_MS = 300;
const LATIDO_MS = 2_000;
const RELEVO_MS = 200;
/** Un relevo pedido hace más de esto ya no lo está mirando nadie. */
const RELEVO_VIVO_MS = 3_000;
/** Sin latido en este rato, el turno de una pantalla queda libre para otra réplica. */
const TURNO_LIBRE_MS = 8_000;
/** Sin que la sala pregunte en este rato, la pantalla se cierra. */
const SIN_MIRAR_MS = 60_000;
/** La sesión lista se conserva este rato después de usarla. */
const SESION_TIBIA_MS = 10 * 60_000;
const ESPERA_DE_LA_ORDEN_MS = 30_000;
/** Cada cuánto mira la sala si su orden ya salió. La réplica dueña además la avisa al momento. */
const MIRAR_LA_ORDEN_MS = 100;
/** Lo que se espera a que la red se calme tras cargar. Más es pantalla quieta. */
const CALMA_DE_LA_RED_MS = 1_200;

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
        await asegurarColumna("verzy_pantallas", "pideRelevoEn", 'ALTER TABLE "verzy_pantallas" ADD COLUMN IF NOT EXISTS "pideRelevoEn" TIMESTAMP(3)');
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
        await contexto.addInitScript(CURSOR_EN_LA_PAGINA);
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

// ---------------------------------------------------------------- el cursor que se VE

/**
 * Chromium sin cabeza no pinta el puntero en el screencast: se dibuja uno en
 * la propia página. Sigue al ratón de verdad (los `mouse.move` de Playwright
 * disparan `mousemove`), hace una onda al pulsar y recuerda su sitio entre
 * páginas. No recibe clics (`pointer-events: none`).
 */
const CURSOR_EN_LA_PAGINA = () => {
    const pintar = () => {
        if (document.getElementById("__cursor_de_verzy")) return;
        const c = document.createElement("div");
        c.id = "__cursor_de_verzy";
        c.setAttribute("aria-hidden", "true");
        c.style.cssText = "position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;will-change:transform;";
        c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 14.8 L10.6 21.5 L13.4 20.3 L10.4 13.7 L16.5 13.7 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        let x = 640, y = 400;
        try {
            const g = JSON.parse(sessionStorage.getItem("__cursor_de_verzy") || "null");
            if (g && typeof g.x === "number" && typeof g.y === "number") { x = g.x; y = g.y; }
        } catch { /* sin almacenamiento */ }
        const colocar = () => { c.style.transform = `translate(${x - 3}px, ${y - 2}px)`; };
        colocar();
        document.documentElement.appendChild(c);
        addEventListener("mousemove", (e) => {
            x = e.clientX; y = e.clientY; colocar();
            try { sessionStorage.setItem("__cursor_de_verzy", JSON.stringify({ x, y })); } catch { /* sin almacenamiento */ }
        }, true);
        addEventListener("mousedown", (e) => {
            const o = document.createElement("div");
            o.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(37,99,235,.85);z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.3);opacity:1;`;
            document.documentElement.appendChild(o);
            requestAnimationFrame(() => { o.style.transform = "scale(1.4)"; o.style.opacity = "0"; });
            setTimeout(() => o.remove(), 600);
        }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
    else pintar();
};

// ---------------------------------------------------------------- una pantalla viva

type Suscriptor = (jpeg: Buffer) => void;

type Viva = {
    citaId: string;
    pagina: Pagina;
    /** Lo que Verzy tiene puesto: una ruta de la plataforma o un atajo del cliente. */
    destino: LugarDeVerzy | null;
    prospecto: ElProspecto | null;
    /** El último fotograma del screencast y cuándo llegó. */
    ultimo: Buffer | null;
    ultimoEn: number;
    suscriptores: Set<Suscriptor>;
    raton: { x: number; y: number };
    /** El tamaño de la ventana ahora mismo: el de fábrica o el que pidió la sala. */
    tamano: TamanoDeLaPantalla;
    /** La sesión del screencast, para volver a arrancarlo con otro tamaño. */
    cdp?: { send: (metodo: string, params?: Record<string, unknown>) => Promise<unknown> };
    /** El chat que Verzy dejó abierto. La URL no lo dice: abrirlo pulsando la fila no pone `?jid=`. */
    chatAbierto?: string | null;
    parada: boolean;
    /** Despierta al ciclo: hay una orden nueva y no se espera la vuelta. */
    despertar?: () => void;
    /** Lo que se termina de mover DESPUÉS de contestar la orden (recorrer). */
    despues?: (() => Promise<void>) | null;
    /**
     * Mientras se carga una página nueva el video NO avanza: la sala se queda
     * con el último fotograma bueno. Así nunca ve una carga a medias ni un 404:
     * si la página no existe, se vuelve a la de antes sin que nadie lo note.
     */
    congelada?: boolean;
};
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
        // Antes de marcarla pedida: si NADIE la miraba hace rato, lo guardado es de
        // otra llamada (o de antes de un corte largo) y no se vuelve a abrir.
        const previa = await db.$queryRaw<{ destino: string | null; pedidaEn: Date | null }[]>`
            SELECT "destino", "pedidaEn" FROM "verzy_pantallas" WHERE "citaId" = ${citaId}`;
        await db.$executeRaw`UPDATE "verzy_pantallas" SET "pedidaEn" = NOW() WHERE "citaId" = ${citaId}`;
        if (pantallasVivas.has(citaId)) return true;
        if (!(await tomarElTurno(citaId))) return false;
        if (pantallasVivas.has(citaId)) return true;
        const contexto = await laSesion();
        const pagina = await contexto.newPage();
        const viva: Viva = {
            citaId, pagina, destino: null, prospecto: await elProspecto(citaId),
            ultimo: null, ultimoEn: 0, suscriptores: new Set(), raton: { x: ANCHO / 2, y: ALTO / 2 }, tamano: { ...TAMANO_DE_FABRICA }, parada: false,
        };
        pantallasVivas.set(citaId, viva);
        await empezarElScreencast(viva);
        void elCiclo(viva);
        void elRelevo(viva);
        // Solo un RELEVO en vivo (otra réplica la movía hace nada) vuelve a donde
        // estaba. Si no, lo guardado es viejo: abrirlo era saltar a una página que
        // nadie pidió (la agenda de la prueba anterior). Se olvida.
        const destino = elDestinoQueSeRetoma(previa[0]);
        if (!destino) await db.$executeRaw`UPDATE "verzy_pantallas" SET "destino" = NULL WHERE "citaId" = ${citaId}`.catch(() => {});
        if (destino) void irA(viva, destino).catch(() => {});
        else void pagina.setContent(PANTALLA_DE_ESPERA).catch(() => {});
        return true;
    } catch (error) {
        console.error("[verzy] no se pudo levantar la pantalla", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
        await anotarElError(citaId, error).catch(() => {});
        return false;
    }
}

const PANTALLA_DE_ESPERA = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#f8fafc;font-family:system-ui,sans-serif;color:#334155"><div style="font-size:22px">Verzay Ventas</div></body></html>`;

/** El screencast de Chromium: cada fotograma que pinta la página, en vivo. */
async function empezarElScreencast(viva: Viva): Promise<void> {
    const cdp = await viva.pagina.context().newCDPSession(viva.pagina);
    cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number }) => {
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
        if (viva.congelada) return;
        const jpeg = Buffer.from(f.data, "base64");
        viva.ultimo = jpeg;
        viva.ultimoEn = Date.now();
        for (const s of viva.suscriptores) {
            try { s(jpeg); } catch (error) {
                console.warn("[verzy] un suscriptor del flujo falló", { cita: viva.citaId, motivo: error instanceof Error ? error.message : String(error) });
            }
        }
    });
    viva.cdp = cdp as unknown as Viva["cdp"];
    await arrancarElScreencast(viva);
}

/** El screencast con el tamaño de la ventana: si no, Chromium lo encoge y vuelven las franjas. */
async function arrancarElScreencast(viva: Viva): Promise<void> {
    await viva.cdp?.send("Page.startScreencast", {
        format: "jpeg", quality: 70, maxWidth: viva.tamano.ancho, maxHeight: viva.tamano.alto, everyNthFrame: 1,
    });
}

/** La ventana toma el formato del hueco de la sala. Mismo tamaño: no se toca nada. */
async function cambiarElTamano(viva: Viva, tamano: TamanoDeLaPantalla): Promise<ResultadoDeLaOrden> {
    if (viva.tamano.ancho === tamano.ancho && viva.tamano.alto === tamano.alto) return { ok: true };
    await viva.pagina.setViewportSize({ width: tamano.ancho, height: tamano.alto });
    viva.tamano = tamano;
    viva.raton = {
        x: Math.min(viva.raton.x, tamano.ancho - 1),
        y: Math.min(viva.raton.y, tamano.alto - 1),
    };
    await viva.cdp?.send("Page.stopScreencast").catch(() => {});
    await arrancarElScreencast(viva);
    return { ok: true };
}

async function anotarElError(citaId: string, error: unknown): Promise<void> {
    const motivo = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await db.$executeRaw`UPDATE "verzy_pantallas" SET "error" = ${motivo} WHERE "citaId" = ${citaId}`;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Latido + órdenes. El video NO pasa por aquí: sale del screencast. */
async function elCiclo(viva: Viva): Promise<void> {
    const { citaId } = viva;
    let latidoEn = 0;
    try {
        for (;;) {
            if (Date.now() - latidoEn >= LATIDO_MS) {
                latidoEn = Date.now();
                const filas = await db.$queryRaw<{ pedidaEn: Date }[]>`
                    UPDATE "verzy_pantallas" SET "vistoEn" = NOW(), "url" = ${viva.pagina.url()}
                    WHERE "citaId" = ${citaId} AND "replica" = ${REPLICA}
                    RETURNING "pedidaEn"
                `;
                if (!filas.length) break; // otra réplica tomó el turno
                if (Date.now() - new Date(filas[0].pedidaEn).getTime() > SIN_MIRAR_MS) break;
                if (sesion) sesion.usadaEn = Date.now();
            }

            const ordenes = await db.$queryRaw<{ id: bigint; tipo: string; datos: unknown }[]>`
                SELECT "id", "tipo", "datos" FROM "verzy_ordenes"
                WHERE "citaId" = ${citaId} AND "hechoEn" IS NULL ORDER BY "id" ASC LIMIT 5
            `;
            for (const o of ordenes) {
                const resultado: ResultadoDeLaOrden = await hacerLaOrden(viva, { tipo: o.tipo, datos: o.datos } as OrdenDeLaPantalla)
                    .catch((error): ResultadoDeLaOrden => ({ ok: false, motivo: error instanceof Error ? error.message : String(error) }));
                if (!resultado.ok) console.warn("[verzy] una orden de la pantalla no salió", { cita: citaId, tipo: o.tipo, motivo: resultado.motivo });
                await db.$executeRaw`
                    UPDATE "verzy_ordenes" SET "hechoEn" = NOW(), "resultado" = ${JSON.stringify(resultado)}::jsonb WHERE "id" = ${o.id}
                `;
                // Contestada la orden, se termina el movimiento (bajar, recorrer):
                // Verzy ya puede hablar de la pantalla mientras se mueve.
                const despues = viva.despues;
                viva.despues = null;
                if (despues) await despues().catch(() => {});
                latidoEn = 0;
            }
            await new Promise<void>((listo) => {
                const t = setTimeout(() => { viva.despertar = undefined; listo(); }, VUELTA_MS);
                viva.despertar = () => { clearTimeout(t); viva.despertar = undefined; listo(); };
            });
        }
    } catch (error) {
        console.error("[verzy] la pantalla se detuvo", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
        await anotarElError(citaId, error).catch(() => {});
    } finally {
        viva.parada = true;
        pantallasVivas.delete(citaId);
        viva.suscriptores.clear();
        await viva.pagina.close().catch(() => {});
        await db.$executeRaw`UPDATE "verzy_pantallas" SET "replica" = NULL WHERE "citaId" = ${citaId} AND "replica" = ${REPLICA}`.catch(() => {});
    }
}

/**
 * Si una sala está conectada a la OTRA réplica, esa pide relevo
 * (`pideRelevoEn`) y el dueño deja ahí el último fotograma cada poco.
 * Sin nadie pidiéndolo no se escribe nada en la base.
 */
async function elRelevo(viva: Viva): Promise<void> {
    let escritoEn = 0;
    while (!viva.parada) {
        await dormir(RELEVO_MS);
        if (viva.parada || !viva.ultimo || viva.ultimoEn === escritoEn) continue;
        try {
            const n = await db.$executeRaw`
                UPDATE "verzy_pantallas" SET "foto" = ${viva.ultimo}, "fotoEn" = NOW(), "error" = NULL
                WHERE "citaId" = ${viva.citaId} AND "replica" = ${REPLICA}
                  AND "pideRelevoEn" > NOW() - make_interval(secs => ${RELEVO_VIVO_MS / 1000}::double precision)
            `;
            if (n > 0) escritoEn = viva.ultimoEn;
        } catch (error) {
            console.warn("[verzy] no se pudo pasar el fotograma a la otra réplica", { cita: viva.citaId, motivo: error instanceof Error ? error.message : String(error) });
            await dormir(2_000);
        }
    }
}

// ---------------------------------------------------------------- moverse como una persona

async function moverA(viva: Viva, x: number, y: number, ms?: number): Promise<void> {
    for (const p of elRecorridoDelRaton(viva.raton, { x, y }, ms)) {
        await viva.pagina.mouse.move(p.x, p.y);
        await dormir(16);
    }
    viva.raton = { x, y };
}

type Localizador = ReturnType<Pagina["locator"]>;

/** Lleva el cursor al centro de lo que se pulsa y pulsa, con su pausa. */
async function clicEn(viva: Viva, l: Localizador): Promise<boolean> {
    await l.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
    const caja = await l.boundingBox().catch(() => null);
    if (!caja) return false;
    await moverA(viva, caja.x + caja.width / 2, caja.y + Math.min(caja.height / 2, 18));
    await dormir(120);
    await viva.pagina.mouse.down();
    await dormir(80);
    await viva.pagina.mouse.up();
    return true;
}

async function recorrerConLaRueda(viva: Viva): Promise<void> {
    await moverA(viva, viva.tamano.ancho * 0.6, viva.tamano.alto * 0.55);
    for (let i = 0; i < 6; i++) { await viva.pagina.mouse.wheel(0, 90); await dormir(70); }
    await dormir(450);
    for (let i = 0; i < 6; i++) { await viva.pagina.mouse.wheel(0, -90); await dormir(70); }
}

// ---------------------------------------------------------------- las órdenes

async function cargar(viva: Viva, ruta: string): Promise<ResultadoDeLaOrden> {
    let res = await viva.pagina.goto(`${BASE_LOCAL}${ruta}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (new URL(viva.pagina.url()).pathname.startsWith("/login")) {
        // La sesión caducó o cambió la versión del token: se vuelve a entrar.
        await entrar(viva.pagina.context());
        res = await viva.pagina.goto(`${BASE_LOCAL}${ruta}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (new URL(viva.pagina.url()).pathname.startsWith("/login")) {
            return { ok: false, motivo: "La sesión de Verzay Ventas no se pudo abrir" };
        }
    }
    if (res && res.status() === 404) return { ok: false, motivo: "Esa página no existe en la plataforma" };
    if (res && res.status() >= 500) return { ok: false, motivo: `La plataforma contestó ${res.status()}` };
    // Corto: Chats y otras pantallas preguntan siempre y nunca quedan «sin red»,
    // y mientras se espera aquí la pantalla está quieta.
    await viva.pagina.waitForLoadState("networkidle", { timeout: CALMA_DE_LA_RED_MS }).catch(() => {});
    await viva.pagina.keyboard.press("Escape").catch(() => {});
    return { ok: true };
}

async function anotarElDestino(viva: Viva, destino: LugarDeVerzy): Promise<void> {
    viva.destino = destino;
    await db.$executeRaw`UPDATE "verzy_pantallas" SET "destino" = ${destino} WHERE "citaId" = ${viva.citaId} AND "replica" = ${REPLICA}`.catch(() => {});
}

async function irA(viva: Viva, destino: LugarDeVerzy): Promise<ResultadoDeLaOrden> {
    // El código NO decide a dónde ir: carga la URL que eligió el modelo, tal
    // cual. Solo si es la misma página (o solo un ancla) no se recarga: se baja.
    const { camino, ancla } = laRutaYElAnclaDeVerzy(destino);
    const aqui = new URL(viva.pagina.url());
    const yaEstamos = !camino || (aqui.origin === new URL(BASE_LOCAL).origin && `${aqui.pathname}${aqui.search}` === camino);
    // Directo, sin pasar por el menú ni por otra sección. La carga va con el
    // video congelado: lo que no existe nunca llega a verse.
    const desde = Date.now();
    if (!yaEstamos) {
        const r = await cargarSinEnsenarElFallo(viva, camino);
        if (!r.ok) return r;
    } else if (await laPaginaDiceQueNoExiste(viva)) {
        return { ok: false, motivo: "Esa página no existe en la plataforma" };
    }
    await anotarElDestino(viva, destino);
    if (ancla) {
        // Se baja ANTES de contestar: Verzy habla de la sección cuando ya se ve.
        const seccion = await laSeccion(viva, ancla);
        if (!seccion) return { ok: true, aviso: "La página se abrió, pero esa sección no está en ella" };
        await bajarA(viva, seccion);
    } else {
        viva.despues = () => recorrerConLaRueda(viva);
    }
    await esperarUnFotogramaDesde(viva, desde);
    return { ok: true };
}

/**
 * Carga una ruta con el video congelado. Si falla o la página dice 404, vuelve
 * a donde estaba (o a la pantalla de espera) ANTES de soltar el video: la sala
 * nunca ve el error. Nunca deja el video congelado.
 */
async function cargarSinEnsenarElFallo(viva: Viva, ruta: string): Promise<ResultadoDeLaOrden> {
    const antes = viva.pagina.url();
    viva.congelada = true;
    try {
        let r: ResultadoDeLaOrden;
        try {
            r = await cargar(viva, ruta);
        } catch (error) {
            r = { ok: false, motivo: error instanceof Error ? error.message : String(error) };
        }
        if (r.ok && await laPaginaDiceQueNoExiste(viva)) r = { ok: false, motivo: "Esa página no existe en la plataforma" };
        if (!r.ok) {
            console.warn("[verzy] una página no cargó; se vuelve a la de antes sin enseñarla", { cita: viva.citaId, ruta, motivo: r.motivo });
            await volverA(viva, antes);
        }
        return r;
    } finally {
        viva.congelada = false;
        // Un toque al ratón obliga a pintar: el video retoma al instante.
        await viva.pagina.mouse.move(viva.raton.x + 1, viva.raton.y).catch(() => {});
        await viva.pagina.mouse.move(viva.raton.x, viva.raton.y).catch(() => {});
    }
}

async function volverA(viva: Viva, url: string): Promise<void> {
    const deLaPlataforma = url.startsWith(BASE_LOCAL);
    const ok = deLaPlataforma
        ? await viva.pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 }).then((res) => !res || res.status() < 400, () => false)
        : false;
    if (!ok || await laPaginaDiceQueNoExiste(viva)) {
        await viva.pagina.setContent(PANTALLA_DE_ESPERA).catch((error) => {
            console.warn("[verzy] no se pudo poner la pantalla de espera", { cita: viva.citaId, motivo: error instanceof Error ? error.message : String(error) });
        });
    }
}

/** Espera (poco) a que llegue a la sala un fotograma pintado después de `desde`. */
async function esperarUnFotogramaDesde(viva: Viva, desde: number): Promise<void> {
    const hasta = Date.now() + 1_500;
    while (viva.ultimoEn <= desde && Date.now() < hasta) {
        await viva.pagina.mouse.move(viva.raton.x + 1, viva.raton.y).catch(() => {});
        await viva.pagina.mouse.move(viva.raton.x, viva.raton.y).catch(() => {});
        await dormir(50);
    }
}

/** La sección `#ancla` de la página puesta, si existe. */
async function laSeccion(viva: Viva, ancla: string): Promise<Localizador | null> {
    const destino = viva.pagina.locator(`[id="${ancla.replace(/"/g, "")}"]`).first();
    return (await destino.waitFor({ state: "attached", timeout: 8_000 }).then(() => true, () => false)) ? destino : null;
}

/** Baja, suave y con el cursor, hasta esa sección. */
async function bajarA(viva: Viva, destino: Localizador): Promise<void> {
    await moverA(viva, viva.tamano.ancho * 0.55, viva.tamano.alto * 0.5, 300);
    await destino.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" })).catch(() => {});
    // Hasta que la sección queda arriba (o un tope): el desplazamiento suave
    // dura según lo lejos que esté, y esperar de más es pantalla quieta.
    const hasta = Date.now() + 1_500;
    while (Date.now() < hasta) {
        await dormir(100);
        const arriba = await destino.evaluate((el) => Math.abs(el.getBoundingClientRect().top)).catch(() => 0);
        if (arriba < 4) break;
    }
}

/** El 404 de Next: la ruta no es una pantalla. */
async function laPaginaDiceQueNoExiste(viva: Viva): Promise<boolean> {
    const titulo = await viva.pagina.locator("h1").first().textContent({ timeout: 500 }).catch(() => null);
    return /^\s*404\s*$/.test(titulo ?? "");
}

/**
 * Chats, como una persona: entra a la bandeja, escribe el nombre en el
 * buscador letra a letra y abre la conversación. Si no aparece, se abre por
 * enlace (nunca se queda a medias).
 */
async function abrirElChat(viva: Viva): Promise<ResultadoDeLaOrden> {
    const p = viva.prospecto;
    const pagina = viva.pagina;
    if (!new URL(pagina.url()).pathname.startsWith("/chats")) {
        const r = await cargarSinEnsenarElFallo(viva, "/chats");
        if (!r.ok) return r;
    }
    if (!p?.jid) return { ok: true };

    // Ya está abierta: no se vuelve a buscar (sería un rato de pantalla quieta).
    // Se sabe por lo que Verzy hizo o por la URL: abrir pulsando la fila NO pone
    // `?jid=`, y esperar a que la URL lo diga eran 8 s de pantalla congelada.
    const fichaDelChat = pagina.locator('button[title="Ver ficha del contacto"]:visible').first();
    const abierta = viva.chatAbierto === p.jid || new URL(pagina.url()).searchParams.get("jid") === p.jid;
    if (abierta && await fichaDelChat.isVisible().catch(() => false)) {
        return { ok: true };
    }

    const fila = pagina.locator(`[data-chat-id="${p.jid}"]${p.linea ? `[data-chat-instance="${p.linea}"]` : ""}`).first();
    const buscador = pagina.locator("[data-buscador-de-la-columna] input").first();
    const tel = p.jid.split("@")[0]?.replace(/\D/g, "") || null;
    const busqueda = loQueSeBusca(p.nombre, tel);
    if (busqueda && await buscador.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) {
        await clicEn(viva, buscador);
        await pagina.keyboard.press("Control+A").catch(() => {});
        await pagina.keyboard.press("Backspace").catch(() => {});
        await buscador.pressSequentially(busqueda, { delay: PAUSA_ENTRE_LETRAS_MS });
        await dormir(400);
    }
    if (await fila.waitFor({ state: "visible", timeout: 6_000 }).then(() => true, () => false)) {
        const botones = fila.locator("button");
        const abrir = (await botones.count()) > 1 ? botones.nth(1) : botones.first();
        await clicEn(viva, abrir);
        // Chats no se queda nunca «sin red» (sus relojes preguntan siempre):
        // se espera a lo que se ve, la cabecera de la conversación, no a la red
        // ni a la URL (abrir pulsando la fila no la cambia).
        const vista = await fichaDelChat.waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false);
        viva.chatAbierto = vista ? p.jid : null;
        return { ok: true };
    }
    console.info("[verzy] el chat no salió en la bandeja; se abre por enlace", { cita: viva.citaId, jid: p.jid });
    const r = await cargarSinEnsenarElFallo(viva, laUrlDeLaConversacion({ jid: p.jid, linea: p.linea }) ?? "/chats");
    viva.chatAbierto = r.ok ? p.jid : null;
    return r;
}

/**
 * Espera a que algo aparezca SIN dejar la pantalla quieta: la ficha tarda en
 * traer sus datos, y mientras tanto el cursor recorre el panel como quien lo
 * lee. Una pantalla quieta varios segundos se lee como un video congelado.
 */
async function esperarMoviendose(viva: Viva, l: Localizador, plazoMs: number): Promise<boolean> {
    let listo = false;
    const espera = l.waitFor({ state: "visible", timeout: plazoMs }).then(() => { listo = true; return true; }, () => false);
    const fin = Date.now() + plazoMs;
    let i = 0;
    while (!listo && Date.now() < fin) {
        const x = viva.tamano.ancho * (0.78 + 0.08 * Math.sin(i * 1.3));
        const y = viva.tamano.alto * (0.35 + 0.25 * Math.abs(Math.sin(i * 0.7)));
        await moverA(viva, x, y, 450);
        i++;
    }
    return espera;
}

/**
 * La nota del prospecto en el módulo de Notas: UNA por prospecto y cuenta,
 * vinculada a su conversación. Si no existe se crea vacía; Verzy la escribe
 * después en pantalla, como una persona.
 */
async function laNotaDelProspecto(p: ElProspecto): Promise<{ id: string; titulo: string }> {
    const titulo = elTituloDeLaNotaDeLaLlamada(p.nombre);
    const ya = await db.userNote.findFirst({
        where: { userId: p.cuentaId, isArchived: false, title: titulo },
        select: { id: true },
        orderBy: { createdAt: "desc" },
    });
    if (ya) return { id: ya.id, titulo };
    const nueva = await db.userNote.create({
        data: { userId: p.cuentaId, title: titulo, contactJid: p.jid, contactName: p.nombre || null, content: {} },
        select: { id: true },
    });
    return { id: nueva.id, titulo };
}

/** Abre la pestaña «Notas» de la conversación abierta (o la de «Mensajes»). */
async function laPestanaDelChat(viva: Viva, id: "notes" | "messages"): Promise<boolean> {
    const pagina = viva.pagina;
    const pestana = pagina.locator(`[data-pestana-del-chat="${id}"]:visible`).first();
    if (await pestana.isVisible().catch(() => false)) {
        await clicEn(viva, pestana);
        return true;
    }
    // Sin sitio, la pestaña vive dentro de «Más».
    const mas = pagina.locator("[data-mas-pestanas]:visible").first();
    if (!(await mas.isVisible().catch(() => false))) return false;
    await clicEn(viva, mas);
    const plegada = pagina.locator(`[data-pestana-plegada="${id}"]:visible`).first();
    if (!(await plegada.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false))) {
        await pagina.keyboard.press("Escape").catch(() => {});
        return false;
    }
    await clicEn(viva, plegada);
    return true;
}

/**
 * Con el módulo de Notas en pantalla (la pestaña del chat o /notas), deja
 * abierta la nota del prospecto: si no es la que se ve, la busca por su título
 * en el panel y la pulsa.
 */
async function abrirLaNota(viva: Viva, nota: { id: string; titulo: string }): Promise<boolean> {
    const pagina = viva.pagina;
    const titulo = pagina.locator('input[placeholder="Sin título"]:visible').first();
    const texto = pagina.locator("[data-texto-de-la-nota] .ProseMirror:visible").first();
    const abierta = async () =>
        (await titulo.inputValue({ timeout: 500 }).catch(() => "")).trim().toUpperCase() === nota.titulo
        && await texto.isVisible().catch(() => false);
    // El módulo tarda en traer sus notas: mientras, el cursor no se queda quieto.
    const buscador = pagina.locator("[data-buscador-de-notas] input:visible").first();
    await esperarMoviendose(viva, pagina.locator("[data-buscador-de-notas] input:visible, [data-texto-de-la-nota]:visible, button[title=\"Mostrar panel\"]:visible").first(), 15_000);
    if (await abierta()) return true;
    if (!(await buscador.isVisible().catch(() => false))) {
        const mostrar = pagina.locator('button[title="Mostrar panel"]:visible').first();
        if (await mostrar.isVisible().catch(() => false)) await clicEn(viva, mostrar);
        if (!(await buscador.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false))) return false;
    }
    await clicEn(viva, buscador);
    await pagina.keyboard.press("Control+A").catch(() => {});
    await pagina.keyboard.press("Backspace").catch(() => {});
    await buscador.pressSequentially(nota.titulo.slice(0, 40), { delay: PAUSA_ENTRE_LETRAS_MS });
    const fila = pagina.locator(`[data-nota-de-la-lista="${nota.id}"]:visible`).first();
    if (!(await esperarMoviendose(viva, fila, 8_000))) return false;
    await clicEn(viva, fila);
    for (let i = 0; i < 20; i++) {
        if (await abierta()) return true;
        await dormir(250);
    }
    return false;
}

/** Escribe el texto al final de la nota abierta, letra a letra. */
async function escribirEnLaNota(viva: Viva, textoNuevo: string): Promise<void> {
    const pagina = viva.pagina;
    const caja = pagina.locator("[data-texto-de-la-nota] .ProseMirror:visible").first();
    const antes = ((await caja.innerText({ timeout: 2_000 }).catch(() => "")) ?? "").trim();
    await clicEn(viva, caja);
    await pagina.keyboard.press("Control+End").catch(() => {});
    if (antes) await pagina.keyboard.press("Enter").catch(() => {});
    await caja.pressSequentially(textoNuevo, { delay: PAUSA_ENTRE_LETRAS_MS });
    await dormir(300);
}

/** La nota guardada en la BASE trae el texto (el editor guarda solo). */
async function laNotaTraeElTexto(id: string, texto: string): Promise<boolean> {
    const fila = await db.userNote.findUnique({ where: { id }, select: { content: true } });
    if (!fila) return false;
    const aguja = JSON.stringify(texto.trim()).slice(1, -1);
    return JSON.stringify(fila.content ?? {}).includes(aguja);
}

/**
 * Tomar una nota es una ACCIÓN: se escribe en la pestaña «Notas» de la
 * conversación del prospecto (al lado de «Mensajes»), NUNCA en la ficha de
 * contacto. Si esa pestaña no se puede usar, se abre «Notas» del menú, se
 * escribe ahí y se vuelve al chat. Se confirma en la base.
 */
async function tomarLaNota(viva: Viva, texto: string): Promise<ResultadoDeLaOrden> {
    const p = viva.prospecto;
    if (!p?.jid) return { ok: false, motivo: "El prospecto todavía no tiene conversación en Verzay Ventas" };
    const nota = await laNotaDelProspecto(p);

    let escrita = false;
    const r = await abrirElChat(viva);
    if (r.ok && await laPestanaDelChat(viva, "notes") && await abrirLaNota(viva, nota)) {
        await escribirEnLaNota(viva, texto);
        escrita = true;
    }
    let porElMenu = false;
    if (!escrita) {
        console.info("[verzy] la pestaña Notas del chat no se pudo usar; se escribe desde Notas del menú", { cita: viva.citaId });
        const enNotas = await cargarSinEnsenarElFallo(viva, "/notas");
        if (enNotas.ok && await abrirLaNota(viva, nota)) {
            await escribirEnLaNota(viva, texto);
            escrita = true;
            porElMenu = true;
        }
    }
    if (!escrita) return { ok: false, motivo: "No se pudo abrir la nota de la conversación" };

    // Se comprueba en la BASE, no en la pantalla: guardada de verdad o no.
    let guardada = false;
    for (let i = 0; i < 24 && !guardada; i++) {
        await dormir(500);
        guardada = await laNotaTraeElTexto(nota.id, texto);
    }
    // De vuelta a la conversación, como estaba.
    if (porElMenu) {
        viva.chatAbierto = null;
        await abrirElChat(viva);
    } else {
        await laPestanaDelChat(viva, "messages");
    }
    if (!guardada) {
        console.error("[verzy] la nota se escribió pero no se confirmó guardada", { cita: viva.citaId, nota: nota.id });
        return { ok: false, motivo: "La nota se escribió pero no se confirmó guardada" };
    }
    return { ok: true };
}

async function hacerLaOrden(viva: Viva, orden: OrdenDeLaPantalla): Promise<ResultadoDeLaOrden> {
    if (orden.tipo === "ir") {
        const d = orden.datos as { lugar?: unknown } | undefined;
        const destino = comoRutaDeVerzy(d?.lugar);
        if (!destino) return { ok: false, motivo: "Esa ruta no es una pantalla de la plataforma" };
        return irA(viva, destino);
    }
    if (orden.tipo === "nota") {
        const texto = String((orden.datos as { texto?: unknown })?.texto ?? "").trim();
        if (!texto) return { ok: false, motivo: "Nota vacía" };
        return tomarLaNota(viva, texto);
    }
    if (orden.tipo === "tamano") return cambiarElTamano(viva, orden.datos);
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
        // Si la pantalla vive en ESTA réplica, se la despierta: no espera su vuelta.
        pantallasVivas.get(citaId)?.despertar?.();
        const id = filas[0].id;
        const hasta = Date.now() + ESPERA_DE_LA_ORDEN_MS;
        while (Date.now() < hasta) {
            await dormir(MIRAR_LA_ORDEN_MS);
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

/** Marca que alguien mira desde ESTA réplica y lee el último fotograma relevado. */
async function elFotogramaRelevado(citaId: string): Promise<{ foto: Buffer; en: Date } | null> {
    await db.$executeRaw`UPDATE "verzy_pantallas" SET "pideRelevoEn" = NOW(), "pedidaEn" = NOW() WHERE "citaId" = ${citaId}`;
    const filas = await db.$queryRaw<{ foto: Buffer | null; fotoEn: Date | null }[]>`
        SELECT "foto", "fotoEn" FROM "verzy_pantallas" WHERE "citaId" = ${citaId}
    `;
    const f = filas[0];
    return f?.foto && f.fotoEn ? { foto: Buffer.from(f.foto), en: f.fotoEn } : null;
}

/** El último fotograma, o null si todavía no hay. */
export async function laFotoDeLaPantalla(citaId: string): Promise<{ foto: Buffer; en: Date; destino: string | null } | null> {
    await asegurarLasTablas();
    await asegurarLaPantalla(citaId);
    const viva = pantallasVivas.get(citaId);
    if (viva?.ultimo) return { foto: viva.ultimo, en: new Date(viva.ultimoEn), destino: viva.destino };
    const f = await elFotogramaRelevado(citaId);
    return f ? { ...f, destino: null } : null;
}

/**
 * El FLUJO de la pantalla: llama a `enviar` con cada fotograma nuevo (como
 * mucho `FPS_DEL_FLUJO` por segundo, y el último otra vez cada
 * `REPETIR_QUIETA_MS` con la pantalla quieta) hasta que `señal` se aborte.
 * Si la pantalla vive en esta réplica, directo de la memoria; si vive en la
 * otra, por relevo. Nunca lanza.
 */
export async function abrirElFlujo(citaId: string, enviar: (jpeg: Buffer) => void, senal: AbortSignal): Promise<void> {
    const minimo = Math.floor(1000 / FPS_DEL_FLUJO);
    let enviadoEn = 0;
    let ultimoEnviado: Buffer | null = null;
    let pendiente: Buffer | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const mandar = (jpeg: Buffer) => {
        if (senal.aborted) return;
        enviadoEn = Date.now();
        ultimoEnviado = jpeg;
        try { enviar(jpeg); } catch (error) {
            console.warn("[verzy] no se pudo mandar un fotograma", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
        }
    };
    const recibir: Suscriptor = (jpeg) => {
        const falta = minimo - (Date.now() - enviadoEn);
        if (falta <= 0) { mandar(jpeg); return; }
        pendiente = jpeg;
        espera ??= setTimeout(() => { espera = null; if (pendiente) { const j = pendiente; pendiente = null; mandar(j); } }, falta);
    };

    try {
        await asegurarLasTablas();
        let viva: Viva | undefined;
        let preguntadoEn = 0;
        let fotoEn = 0;
        while (!senal.aborted) {
            // Cada tanto: que la pantalla siga viva y que se sepa que alguien mira.
            if (Date.now() - preguntadoEn > 5_000) {
                preguntadoEn = Date.now();
                if (!viva || viva.parada) {
                    await asegurarLaPantalla(citaId);
                    const v = pantallasVivas.get(citaId);
                    if (v && v !== viva) {
                        viva?.suscriptores.delete(recibir);
                        viva = v;
                        viva.suscriptores.add(recibir);
                        if (viva.ultimo) mandar(viva.ultimo);
                    }
                } else {
                    await db.$executeRaw`UPDATE "verzy_pantallas" SET "pedidaEn" = NOW() WHERE "citaId" = ${citaId}`;
                }
            }
            if (!viva || viva.parada) {
                // La pantalla vive en la otra réplica: relevo por la base.
                const f = await elFotogramaRelevado(citaId);
                if (f && f.en.getTime() !== fotoEn) { fotoEn = f.en.getTime(); mandar(f.foto); }
                await dormir(RELEVO_MS);
                continue;
            }
            if (ultimoEnviado && Date.now() - enviadoEn >= REPETIR_QUIETA_MS) mandar(ultimoEnviado);
            await dormir(250);
        }
        viva?.suscriptores.delete(recibir);
    } catch (error) {
        console.error("[verzy] el flujo de la pantalla se cortó", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) });
    } finally {
        if (espera) clearTimeout(espera);
        for (const v of pantallasVivas.values()) v.suscriptores.delete(recibir);
    }
}

