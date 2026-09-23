/**
 * Las DOS barras de escribir, en Chromium y sobre la página servida.
 *
 * No una maqueta: el build con `next start` contra una base de usar y tirar,
 * con sesión de verdad. Lo que esto contesta y leyendo el código no se puede:
 * que las dos barras ofrecen **lo mismo** —los mismos botones, los mismos
 * iconos, el mismo pegado— con el mismo ancho, en escritorio y en móvil.
 *
 * Hace falta: `BASE` (la App servida), `USUARIO`, `CLAVE`, y `CHAT_JID` /
 * `CHAT_LINEA` para abrir una conversación de la bandeja.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

/**
 * El ancho por debajo del cual la barra va plegada. Se lee de `lib/`, no se
 * copia: un número escrito aquí a mano probaría que las dos barras coinciden
 * con ESTE banco, no con la regla que corre en producción.
 */
const ANCHO_COMPACTO = Number(
    /ANCHO_COMPACTO\s*=\s*(\d+)/.exec(
        require("node:fs").readFileSync("lib/barra-de-escribir.ts", "utf8"),
    )?.[1],
);
if (!ANCHO_COMPACTO) throw new Error("no se pudo leer ANCHO_COMPACTO de lib/barra-de-escribir.ts");

const BASE = process.env.BASE ?? "http://localhost:3931";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";

const VENTANAS = [
    { nombre: "1440", width: 1440, height: 900 },
    { nombre: "1280", width: 1280, height: 800 },
    { nombre: "1024", width: 1024, height: 768 },
    { nombre: "390 (móvil)", width: 390, height: 844 },
];

/**
 * Chromium sin cabeza NO trae Web Speech, así que sin esto el botón de dictado
 * no existiría en ninguna de las dos barras y la comparación no ejercería
 * nada. Se finge lo mínimo: la clase con `start`/`stop`.
 */
const FINGIR_DICTADO = () => {
    class Falsa {
        constructor() {
            this.lang = "";
            this.continuous = false;
            this.interimResults = false;
        }
        start() {
            this.onstart?.();
        }
        stop() {
            this.onend?.();
        }
        abort() {
            this.onend?.();
        }
    }
    window.SpeechRecognition = Falsa;
    window.webkitSpeechRecognition = Falsa;
};

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

async function entrar(contexto) {
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    // Pulsando antes de que React hidrate, el formulario se envía a pelo y la
    // página se queda en /login (la misma espera que las demás sondas).
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', USUARIO);
    await pagina.fill('input[name="password"]', CLAVE);
    await pagina.click('button[type="submit"]');
    // Se sondea la URL: el login navega en el cliente y `waitForURL` se
    // quedaba esperando un evento de carga que ya había pasado.
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) {
        await pagina.waitForTimeout(500);
    }
    if (pagina.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return pagina;
}

/** Los diálogos de bienvenida tapan los clics; se cierran antes de tocar nada. */
async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

/** Qué ofrece la barra: los botones de la derecha y las herramientas. */
async function leerLaBarra(pagina, caja) {
    return pagina.evaluate((selector) => {
        const area = document.querySelector(selector);
        if (!area) return null;
        const barra = area.closest("div.relative")?.parentElement ?? area.parentElement;
        const cs = getComputedStyle(area);
        const botones = [...(barra?.querySelectorAll("button") ?? [])]
            .filter((b) => {
                const r = b.getBoundingClientRect();
                const ra = area.getBoundingClientRect();
                return r.width > 0 && r.left >= ra.left - 4 && r.right <= ra.right + 8;
            })
            .map((b) => b.getAttribute("aria-label"));
        const laBarra = area.closest('[data-barra="escribir"]');
        // Los de ESTA barra, no los del documento: el copiloto tiene ahora su
        // propia barra con su «+», y cerrado sigue montado fuera de la
        // pantalla — contando el documento entero, su «+» se leía como que
        // la barra que se mide se había plegado.
        const herramientas = [...(laBarra ?? document).querySelectorAll("button[aria-label]")]
            .filter((b) => b.getBoundingClientRect().width > 0)
            .map((b) => b.getAttribute("aria-label"));
        return {
            rellenoDerecho: cs.paddingRight,
            alto: Math.round(area.getBoundingClientRect().height),
            anchoDeLaBarra: laBarra ? Math.round(laBarra.getBoundingClientRect().width) : null,
            botonesDeLaDerecha: botones,
            visibles: herramientas,
        };
    }, caja);
}

/** Pega un PNG de verdad en la caja, como haría un Ctrl+V con una captura. */
async function pegarUnaCaptura(pagina, caja) {
    await pagina.focus(caja);
    return pagina.evaluate((selector) => {
        const area = document.querySelector(selector);
        if (!area) return false;
        // 1×1 PNG.
        const base64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const fichero = new File([bytes], "image.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(fichero);
        const ev = new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
        });
        area.dispatchEvent(ev);
        return true;
    }, caja);
}

const filas = [];

const navegador = await chromium.launch();

for (const v of VENTANAS) {
    const contexto = await navegador.newContext({
        viewport: { width: v.width, height: v.height },
        permissions: [],
    });
    await contexto.addInitScript(FINGIR_DICTADO);
    const pagina = await entrar(contexto);

    /* ─── el chat de equipo ─── */
    await pagina.goto(`${BASE}/chat-equipo`, { waitUntil: "domcontentloaded" });
    await apartarLoQueTapa(pagina);
    // El chat del equipo enseña UNA vista por vez y abre en la lista de
    // canales: la barra de escribir es del chat, así que se entra en uno.
    await pagina.waitForSelector("[data-lista-de-canales], textarea", { timeout: 60000 });
    await apartarLoQueTapa(pagina);
    const fila = await pagina.$("[data-lista-de-canales] [data-fila-de-canal]");
    if (fila && (await fila.isVisible())) await fila.click();
    await pagina.waitForSelector("textarea", { timeout: 60000 });
    const equipo = await leerLaBarra(pagina, "textarea");

    /*
     * Editar y borrar: **existían** y no se alcanzaban.
     *
     * El `⋯` de un mensaje cuelga de un `group`, y ese `group` era la línea
     * del nombre y la hora —unos doce píxeles de alto—, no la burbuja. Así que
     * había que acertar con el cursor dentro de esa franja, y desde fuera eso
     * no se lee como «el hover está mal puesto»: se lee como «no deja editar
     * mensajes», que es como se reportó.
     *
     * Por eso se mide posando el cursor sobre el TEXTO del mensaje, que es
     * donde lo pondría cualquiera, y se compara la opacidad antes y después:
     * con el `group` en la línea de la hora, posarlo ahí no cambiaba nada.
     */
    let hover = null;
    if (v.width >= 1024) {
        const dicho = `banco ${Date.now()}`;
        const burbuja = pagina.locator(`text=${dicho}`).first();
        // El envío se reintenta por el BOTÓN si el Enter no llegó: la primera
        // pulsación puede caer antes de que el hilo termine de hidratarse, y
        // un banco que se rinde ahí dice «no deja editar» sobre un mensaje que
        // nunca llegó a mandarse.
        for (const comoSeManda of ["Enter", "botón"]) {
            // `focus`, no `click`: alguna capa de bienvenida se queda
            // encima y se come la pulsación, y el banco se rendiría por algo
            // que no tiene nada que ver con la barra.
            await pagina.focus("textarea");
            await pagina.fill("textarea", dicho);
            if (comoSeManda === "Enter") await pagina.keyboard.press("Enter");
            else await pagina.locator('button[aria-label="Enviar"]').last().click();
            try {
                await burbuja.waitFor({ timeout: 20000 });
                break;
            } catch {
                if (comoSeManda === "botón") throw new Error("no se pudo mandar el mensaje");
            }
        }
        // La opacidad vive en la FILA de acciones, no en el botón: medir el
        // botón da 1 siempre y el banco saldría verde sin haber ejercido
        // nada, que es el fallo que esta suite lleva media sección evitando.
        const opacidad = () =>
            pagina
                .locator('button[aria-label="Acciones del mensaje"]')
                .last()
                .evaluate((b) => Number(getComputedStyle(b.parentElement).opacity))
                .catch(() => -1);
        const enReposo = await opacidad();
        /*
         * Se vuelve a posar el cursor si hace falta: el hilo se refresca solo
         * cada cinco segundos, y una vuelta que caiga justo entre el `hover` y
         * la medida sustituye el nodo que había debajo del cursor — el
         * navegador no le da `:hover` a un nodo nuevo hasta el movimiento
         * siguiente. Sin el reintento el banco dice que el «⋯» no sale cuando
         * lo que pasó es que el reloj se cruzó.
         */
        let alPosarse = 0;
        for (let intento = 0; intento < 5; intento += 1) {
            await pagina.mouse.move(2, 2);
            await burbuja.hover();
            await pagina.waitForTimeout(200);
            alPosarse = await opacidad();
            if (alPosarse === 1) break;
        }
        await pagina.locator('button[aria-label="Acciones del mensaje"]').last().click();
        await pagina.waitForTimeout(300);
        const opciones = await pagina
            .locator('[role="menuitem"]')
            .allInnerTexts()
            .catch(() => []);
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(200);
        hover = { enReposo, alPosarse, opciones };

        exigir(
            enReposo === 0 && alPosarse === 1,
            `${v.nombre} · chat de equipo: posar el cursor SOBRE EL TEXTO no saca el «⋯» (${enReposo} → ${alPosarse})`,
        );
        for (const cual of ["Responder", "Editar", "Eliminar"]) {
            exigir(
                opciones.some((o) => o.trim() === cual),
                `${v.nombre} · chat de equipo: el menú del mensaje no ofrece «${cual}» (ofrece ${opciones.join(", ") || "nada"})`,
            );
        }
        await pagina.fill("textarea", "");
    }

    await pegarUnaCaptura(pagina, "textarea");
    await pagina.waitForTimeout(400);
    const pegoEquipo = await pagina
        .locator('button[aria-label^="Quitar "]')
        .count()
        .catch(() => 0);

    filas.push({
        ventana: v.nombre,
        pantalla: "chat de equipo",
        "ancho barra": equipo?.anchoDeLaBarra ?? "—",
        "relleno dcha": equipo?.rellenoDerecho,
        "botones dcha": (equipo?.botonesDeLaDerecha ?? []).join(" · ") || "—",
        "«+» a la vista": (equipo?.visibles ?? []).includes("Herramientas de mensaje")
            ? "sí"
            : "no",
        "formato en fila": (equipo?.visibles ?? []).includes("Emojis") ? "sí" : "no",
        "pegar una captura": pegoEquipo > 0 ? "SÍ" : "no",
        "«⋯» al posarse": hover
            ? `${hover.enReposo} → ${hover.alPosarse}`
            : "—",
        "menú del mensaje": hover ? hover.opciones.slice(0, 3).join(" · ") || "—" : "—",
    });

    exigir(
        pegoEquipo > 0,
        `${v.nombre} · chat de equipo: pegar una captura no adjuntó nada`,
    );
    exigir(
        (equipo?.botonesDeLaDerecha ?? []).some((e) => /dictar/i.test(e ?? "")) ||
            (equipo?.botonesDeLaDerecha ?? []).some((e) => /voz/i.test(e ?? "")),
        `${v.nombre} · chat de equipo: no hay dictado ni micrófono a la derecha`,
    );

    /* ─── Chats ─── */
    await pagina.goto(
        `${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`,
        { waitUntil: "domcontentloaded" },
    );
    await apartarLoQueTapa(pagina);
    let chats = null;
    let pegoChats = 0;
    try {
        try {
            await pagina.waitForSelector('textarea[aria-label="Escribe tu mensaje"]', {
                timeout: 45000,
            });
        } catch {
            // La bandeja es la pantalla más cara de la App: una recarga antes
            // de rendirse. Darla por no cargada deja la comparación a medias
            // y el banco saldría verde habiendo medido UNA barra — ya pasó.
            await pagina.reload({ waitUntil: "domcontentloaded" });
            await apartarLoQueTapa(pagina);
            await pagina.waitForSelector('textarea[aria-label="Escribe tu mensaje"]', {
                timeout: 60000,
            });
        }
        chats = await leerLaBarra(pagina, 'textarea[aria-label="Escribe tu mensaje"]');
        await pegarUnaCaptura(pagina, 'textarea[aria-label="Escribe tu mensaje"]');
        await pagina.waitForTimeout(400);
        pegoChats = await pagina.locator('button[aria-label="Quitar adjunto"]').count();
    } catch {
        chats = null;
    }

    exigir(
        Boolean(chats),
        `${v.nombre} · Chats: la barra no llegó a pintarse, así que esta anchura no comparó nada`,
    );

    filas.push({
        ventana: v.nombre,
        pantalla: "Chats",
        "ancho barra": chats?.anchoDeLaBarra ?? "—",
        "relleno dcha": chats?.rellenoDerecho ?? "—",
        "botones dcha": (chats?.botonesDeLaDerecha ?? []).join(" · ") || "—",
        "«+» a la vista": chats
            ? (chats.visibles ?? []).includes("Herramientas de mensaje")
                ? "sí"
                : "no"
            : "—",
        "formato en fila": chats
            ? (chats.visibles ?? []).includes("Emojis")
                ? "sí"
                : "no"
            : "—",
        "pegar una captura": chats ? (pegoChats > 0 ? "SÍ" : "no") : "—",
        "«⋯» al posarse": "—",
        "menú del mensaje": "—",
    });

    if (chats) {
        exigir(pegoChats > 0, `${v.nombre} · Chats: pegar una captura no adjuntó nada`);
    }

    /*
     * La comparación que contesta el encargo, y NO es «a la misma ventana, lo
     * mismo»: las dos barras viven en huecos distintos —la de Chats comparte
     * la ventana con la lista de la bandeja, así que a 1024 mide 588 px y la
     * del equipo 976— y lo que decide si se pliegan es SU ancho, no el de la
     * ventana. Comparándolas por ventana salían tres «fallos» que no lo eran.
     *
     * Lo que sí tiene que ser igual es la REGLA: por debajo de
     * `ANCHO_COMPACTO` las herramientas se pliegan en el «+» y a la derecha
     * queda un botón; por encima van en fila y a la derecha los tres. Se
     * comprueba en cada barra por separado, contra su propio ancho medido.
     */
    for (const [donde, leida] of [
        ["chat de equipo", equipo],
        ["Chats", chats],
    ]) {
        if (!leida?.anchoDeLaBarra) continue;
        const deberiaPlegarse = leida.anchoDeLaBarra < ANCHO_COMPACTO;
        const estaPlegada = (leida.visibles ?? []).includes("Herramientas de mensaje");
        exigir(
            estaPlegada === deberiaPlegarse,
            `${v.nombre} · ${donde}: la barra mide ${leida.anchoDeLaBarra} px y ${
                estaPlegada ? "se plegó" : "NO se plegó"
            } (el corte está en ${ANCHO_COMPACTO})`,
        );
        // Y el hueco de la caja sale de la MISMA lista de botones: tres son
        // `pr-28` (112 px) y uno `pr-12` (48). De más, la última palabra se
        // corta contra un hueco vacío; de menos, el texto pasa por debajo.
        exigir(
            leida.rellenoDerecho === (deberiaPlegarse ? "48px" : "112px"),
            `${v.nombre} · ${donde}: el hueco de la derecha es ${leida.rellenoDerecho} y debería ser ${
                deberiaPlegarse ? "48px" : "112px"
            }`,
        );
    }

    await contexto.close();
}

await navegador.close();

console.table(filas);

if (fallos.length) {
    console.error("\nNO pasa:");
    for (const f of fallos) console.error(" ·", f);
    process.exit(1);
}
console.log(
    "\nLas dos barras aplican la misma regla, y las dos pegan una captura, en las cuatro anchuras.",
);
