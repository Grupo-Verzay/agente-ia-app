/**
 * Deja el COPILOTO LOCAL de las capturas (`copiloto-de-la-guia.sh`) en el
 * punto de partida de la guía: sin conversaciones de antes y con cuatro de
 * ejemplo, cada una de otro día, así la lista enseña sus grupos por fecha
 * («Hoy», «Ayer», «7 días anteriores»…) como la de una cuenta de verdad.
 *
 * Lo usan las capturas (al empezar) y el vídeo (antes de grabar): las
 * capturas crean y archivan conversaciones, y el vídeo tiene que salir del
 * mismo punto de partida que la primera captura.
 *
 * Las conversaciones se crean escribiéndolas en el copiloto de verdad —no a
 * mano en su base—: así sus títulos los pone el propio copiloto, igual que en
 * producción. Lo único que se toca en la base es la FECHA, que no se puede
 * fingir de otra forma.
 */
import { execFileSync } from "node:child_process";

import { laRespuestaA } from "./ia-de-ejemplo.mjs";

export const COPILOTO_LOCAL = process.env.COPILOTO_LOCAL ?? "http://localhost:3080";
/** La cuenta del copiloto de las capturas (la crea `copiloto-de-la-guia.sh`). */
export const CUENTA_DEL_COPILOTO = { email: "jefe@banco.test", clave: "banco1234" };

/**
 * Las conversaciones de partida: lo que se escribe, el título que le pone el
 * copiloto (`ia-de-ejemplo.mjs`) y cuántos días hace que se tuvo.
 */
export const CONVERSACIONES_DE_PARTIDA = [
    { pregunta: "Dame ideas de promoción para diciembre", titulo: "Ideas de promoción para diciembre", haceDias: 12 },
    { pregunta: "Escribe las preguntas frecuentes de envío para mis clientes", titulo: "Preguntas frecuentes de envíos", haceDias: 4 },
    { pregunta: "Un cliente pide descuento, ¿cómo le respondo sin bajar el precio?", titulo: "Respuesta a pedido de descuento", haceDias: 1 },
    { pregunta: "Escribe un mensaje de bienvenida para un cliente nuevo", titulo: "Mensaje de bienvenida", haceDias: 0 },
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Entra al copiloto por su API y devuelve el token. */
async function elToken() {
    const r = await fetch(`${COPILOTO_LOCAL}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: CUENTA_DEL_COPILOTO.email, password: CUENTA_DEL_COPILOTO.clave }),
    });
    if (!r.ok) throw new Error(`[copiloto] no se pudo entrar al copiloto local: ${r.status}. ¿Está corriendo scripts/copiloto-de-la-guia.sh?`);
    return (await r.json()).token;
}

/** Borra TODAS las conversaciones de la cuenta, archivadas incluidas. */
export async function vaciarElCopiloto() {
    const token = await elToken();
    const auth = { authorization: `Bearer ${token}` };
    // Con la lista ya vacía el copiloto contesta 500 («Conversation not found»):
    // no se mira lo que contesta el borrado, se mira que no quede ninguna.
    await fetch(`${COPILOTO_LOCAL}/api/convos/all`, { method: "DELETE", headers: auth });
    for (const archivadas of [false, true]) {
        const r = await fetch(`${COPILOTO_LOCAL}/api/convos?limit=25&isArchived=${archivadas}`, { headers: auth });
        const quedan = (await r.json()).conversations?.length ?? -1;
        if (quedan !== 0) throw new Error(`[copiloto] no se pudieron borrar las conversaciones${archivadas ? " archivadas" : ""}: quedan ${quedan}`);
    }
}

/**
 * Entra al copiloto en una página o un marco (`frameLocator`): su sesión no se
 * puede reutilizar entre contextos (el token de refresco rota), así que cada
 * contexto entra una vez.
 */
export async function entrarAlCopiloto(donde, { esperar = 30000 } = {}) {
    await donde.locator('input[name="email"]').waitFor({ state: "visible", timeout: esperar });
    await donde.locator('input[name="email"]').fill(CUENTA_DEL_COPILOTO.email);
    await donde.locator('input[name="password"]').fill(CUENTA_DEL_COPILOTO.clave);
    await donde.locator('button[type="submit"]').click();
    await donde.locator("textarea").first().waitFor({ state: "visible", timeout: esperar });
}

/**
 * El final de la respuesta que va a dar la IA de ejemplo, tal como se LEE en
 * pantalla (sin las marcas de negrita): cuando aparece, la respuesta terminó
 * de escribirse. Los botones de debajo no sirven de señal: el copiloto los
 * pinta solo con el ratón encima.
 */
export function elFinalDeLaRespuesta(pregunta) {
    const ultima = laRespuestaA(pregunta).respuesta.split("\n").filter((l) => l.trim()).at(-1);
    return ultima.replace(/\*\*/g, "").replace(/^[-\d.]+\s*/, "").trim().slice(-24);
}

/** Cuántas veces está ya en pantalla el final de la respuesta a `pregunta`: se cuenta ANTES de enviar. */
export const cuantasRespuestas = (donde, pregunta) => donde.getByText(elFinalDeLaRespuesta(pregunta)).count();

/**
 * Espera a que termine de escribirse la respuesta a `pregunta`: su final está
 * una vez más que `antes` y ya no hay botón de parar. Aparte de enviar para
 * que el vídeo y las capturas puedan pulsar Enter ellos —y enseñarlo—.
 */
export async function esperarLaRespuesta(donde, pregunta, antes) {
    const fin = donde.getByText(elFinalDeLaRespuesta(pregunta));
    for (let i = 0; i < 120; i += 1) {
        if ((await fin.count()) > antes && !(await donde.locator('[data-testid="stop-generation-button"], button[aria-label*="Detener" i], button[aria-label*="Stop" i]').count())) return;
        await espera(250);
    }
    throw new Error(`[copiloto] la respuesta a «${pregunta.slice(0, 40)}…» no terminó`);
}

/** Escribe una pregunta, la envía y espera a que la respuesta termine de escribirse. */
export async function preguntarYEsperar(donde, pregunta, { tecleando = false, pausa = 30 } = {}) {
    const antes = await cuantasRespuestas(donde, pregunta);
    const caja = donde.locator("textarea").first();
    if (tecleando) await caja.pressSequentially(pregunta, { delay: pausa });
    else await caja.fill(pregunta);
    await caja.press("Enter");
    await esperarLaRespuesta(donde, pregunta, antes);
}

/** Espera a que el copiloto le ponga título a la conversación abierta (sale en la lista). */
export async function esperarElTitulo(donde, titulo) {
    await donde.getByText(titulo, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
}

/**
 * Entra al copiloto en un CONTEXTO que todavía no lo ha hecho, en una página
 * aparte que se cierra: sus marcos (el de /copiloto, el de la pestaña de
 * Chats) abren ya con la sesión puesta. Lo usa el vídeo, que no puede enseñar
 * la pantalla de entrada.
 */
export async function entrarEnElContexto(contexto) {
    const p = await contexto.newPage();
    try {
        await p.goto(`${COPILOTO_LOCAL}/login`, { waitUntil: "domcontentloaded" });
        await entrarAlCopiloto(p);
    } finally {
        await p.close();
    }
}

/**
 * Deja el copiloto con las conversaciones de partida, y cada una en su día.
 * Se crean en un contexto propio: el de quien llama no tiene por qué haber
 * entrado todavía.
 */
export async function dejarElCopilotoComoAlEmpezar(navegador) {
    await vaciarElCopiloto();
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-CO", timezoneId: "America/Bogota" });
    try {
        const p = await ctx.newPage();
        await p.goto(`${COPILOTO_LOCAL}/login`, { waitUntil: "domcontentloaded" });
        await entrarAlCopiloto(p);
        for (const c of CONVERSACIONES_DE_PARTIDA) {
            await p.goto(`${COPILOTO_LOCAL}/c/new`, { waitUntil: "domcontentloaded" });
            await p.locator("textarea").first().waitFor({ state: "visible", timeout: 30000 });
            await preguntarYEsperar(p, c.pregunta);
            await esperarElTitulo(p, c.titulo);
        }
    } finally {
        await ctx.close();
    }
    // La fecha: lo único que no se puede tener escribiendo hoy.
    const guion = CONVERSACIONES_DE_PARTIDA.filter((c) => c.haceDias > 0)
        .map(
            (c) =>
                `db.conversations.updateMany({ title: ${JSON.stringify(c.titulo)} }, ` +
                `{ $set: { updatedAt: new Date(Date.now() - ${c.haceDias} * 86400000), createdAt: new Date(Date.now() - ${c.haceDias} * 86400000) } });`,
        )
        .join("\n");
    execFileSync("docker", ["exec", "cop-guia-mongo", "mongosh", "--quiet", "--port", "27117", "LibreChat", "--eval", guion], { stdio: "pipe" });
}
