/**
 * Embudos, en Chromium y sobre la página SERVIDA, de punta a punta:
 *
 *  1. El dueño entra, crea «Ventas» por la pantalla y asigna a Ana.
 *  2. La administradora entra y ve lo mismo que el dueño, con los mismos mandos.
 *  3. Ana entra: ve SU embudo con solo sus dos conversaciones, sin selector,
 *     sin «Nuevo», sin «⋯», sin editar etapas; arrastra una tarjeta a otra
 *     etapa y al recargar sigue ahí.
 *  4. Beto, sin embudo, ve la pantalla vacía que lo dice.
 *  5. El dueño filtra por asesor —«Todos» de partida— y elige la cuenta HIJA:
 *     el tablero pasa a ser el de esa cuenta, con sus conversaciones y sin
 *     ninguna de la madre.
 *  6. El selector ofrece SOLO su cuenta y la hija —el dueño es `admin`, así que
 *     antes del #948 le salía además la cuenta cliente sin vínculo— y el
 *     tablero **abre donde se quedó**: se vuelve a `/embudos` con la dirección
 *     limpia y sigue en la hija.
 *
 * Y en cada paso, a 1440 y a 390: que la página no se desplaza a lo ancho.
 * Deja capturas en `CAPTURAS` para mirarlas.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3947";
const CLAVE = "banco1234";
const CAPTURAS = process.env.CAPTURAS ?? "/tmp/embudos-capturas";
fs.mkdirSync(CAPTURAS, { recursive: true });

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    console.log(`${bien ? "ok  " : "MAL "} ${que}`);
};

async function entrar(navegador, email, ancho = 1440) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    const pagina = await contexto.newPage();
    pagina.on("pageerror", (e) => fallos.push(`error en la página (${email}): ${e.message}`));
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', email);
    await pagina.fill('input[name="password"]', CLAVE);
    await pagina.click('button[type="submit"]');
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
    if (pagina.url().includes("/login")) throw new Error(`no se pudo entrar como ${email}`);
    return { contexto, pagina };
}

async function abrirEmbudos(pagina) {
    await pagina.goto(`${BASE}/embudos`, { waitUntil: "networkidle" });
    // Diálogos de bienvenida u otros que tapen los clics.
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
    await pagina.waitForSelector("[data-barra-de-acciones]", { timeout: 20000 });
}

const sinDesborde = (pagina) =>
    pagina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const columnas = (pagina) =>
    pagina.$$eval("[data-barra-de-acciones] ~ div span.uppercase, span.uppercase.text-white", (els) =>
        els.map((e) => e.textContent?.trim()),
    );
const tarjetas = (pagina) =>
    pagina.$$eval("p.capitalize", (els) => els.map((e) => e.textContent?.trim()).filter(Boolean));

const navegador = await chromium.launch();
try {
    // ── 1. El dueño crea y asigna ─────────────────────────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "dueno@embudos.test");
        await abrirEmbudos(pagina);
        exigir(await pagina.getByText("Aún no hay embudos en esta cuenta").isVisible(), "dueño: sin embudos, lo dice");
        await pagina.getByRole("button", { name: "Nuevo" }).click();
        await pagina.getByLabel("Nombre del embudo").fill("Ventas");
        await pagina.getByRole("button", { name: "Crear" }).click();
        await pagina.getByText("Etapas del embudo").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(800);
        exigir(
            (await pagina.$$('input[aria-label^="Nombre de la etapa"]')).length === 3,
            "dueño: el embudo nace con tres etapas y se abre su panel",
        );
        await pagina.getByLabel("Nombre de la etapa 2").fill("Cotización enviada");
        await pagina.getByRole("button", { name: "Guardar" }).click();
        await pagina.getByText("Etapas guardadas.").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(800);
        const cols = await columnas(pagina);
        exigir(cols.includes("Cotización enviada"), `dueño: la etapa renombrada sale en el tablero (${cols.join(", ")})`);
        const vistas = await tarjetas(pagina);
        exigir(vistas.length === 4, `dueño: ve las cuatro conversaciones de la cuenta (${vistas.length})`);
        exigir(await pagina.getByText("Sin asignar").first().isVisible(), "dueño: la conversación sin asesor lo dice");
        await pagina.screenshot({ path: `${CAPTURAS}/1-dueno-1440.png` });

        // Asignar a Ana.
        await pagina.getByRole("button", { name: "Acciones" }).click();
        await pagina.getByRole("menuitem", { name: "Asignar asesores" }).click();
        await pagina.getByLabel("Embudo de Ana Ruiz").click();
        await pagina.getByRole("option", { name: "Ventas" }).click();
        await pagina.getByRole("button", { name: "Guardar" }).click();
        await pagina.getByText("Asignaciones guardadas.").waitFor({ timeout: 15000 });
        exigir(await sinDesborde(pagina), "dueño 1440: la página no se desplaza a lo ancho");
        await contexto.close();
    }

    // ── 1b. El filtro de asesor y el selector de cuenta ────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "dueno@embudos.test");
        await abrirEmbudos(pagina);

        // Por defecto, TODOS los asesores juntos.
        const filtro = pagina.locator('[data-filtro="asesor"]');
        const cuenta = pagina.locator('[data-selector="cuenta"]');
        exigir(
            (await filtro.textContent())?.includes("Todos los asesores"),
            "dueño: el filtro de asesor abre en «Todos los asesores»",
        );
        exigir((await tarjetas(pagina)).length === 4, "dueño: con «todos» ve las cuatro");

        /*
         * El total de cada columna. Nada se ha movido todavía, así que las
         * cuatro están en la primera etapa: el reparto tiene que ser 4-0-0.
         *
         * Con cuatro conversaciones este número coincide con el de tarjetas
         * pintadas; lo que se comprueba aquí es que sale del tablero y que cae
         * en la columna que le toca. Que sea un `COUNT` y no un `length` lo
         * ejerce el banco de Postgres, con 520 conversaciones —o sea más que el
         * tope—, que es el único sitio donde los dos números se separan.
         */
        const porColumna = await pagina.$$eval("span.uppercase.text-white", (cabs) =>
            cabs.map((c) => {
                const fila = c.parentElement;
                const badge = fila?.querySelector("div > div");
                return [c.textContent?.trim(), badge?.textContent?.trim()];
            }),
        );
        exigir(
            JSON.stringify(porColumna.map(([, n]) => n)) === JSON.stringify(["4", "0", "0"]),
            `dueño: cada columna lleva su total y en su sitio (${JSON.stringify(porColumna)})`,
        );

        // Filtrar a Ana: solo las suyas.
        await filtro.click();
        await pagina.getByRole("menuitem", { name: "Ana Ruiz" }).click();
        await pagina.waitForTimeout(1500);
        const deAna = await tarjetas(pagina);
        exigir(
            deAna.length === 2 && deAna.every((n) => /María|Julián/.test(n)),
            `dueño: filtrando a Ana ve solo sus dos (${deAna.join(", ")})`,
        );
        exigir(
            new URL(pagina.url()).searchParams.get("asesor") !== null,
            "dueño: el asesor filtrado queda en la dirección",
        );

        exigir((await filtro.textContent())?.includes("Ana Ruiz"), "dueño: el mando dice a quién se filtró");

        // «Sin asesor asignado»: solo la que no tiene.
        await filtro.click();
        await pagina.getByRole("menuitem", { name: "Sin asesor asignado" }).click();
        await pagina.waitForTimeout(1500);
        const sinAsesor = await tarjetas(pagina);
        exigir(
            sinAsesor.length === 1 && /Marta/.test(sinAsesor[0]),
            `dueño: «sin asesor» enseña solo la que no tiene (${sinAsesor.join(", ")})`,
        );

        // Y volver a «todos» las junta otra vez, y limpia la dirección.
        await filtro.click();
        await pagina.getByRole("menuitem", { name: "Todos los asesores" }).click();
        await pagina.waitForTimeout(1500);
        exigir((await tarjetas(pagina)).length === 4, "dueño: volver a «todos» las junta otra vez");
        exigir(
            new URL(pagina.url()).searchParams.get("asesor") === null,
            "dueño: «todos» es la dirección limpia",
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1b-filtro-de-asesor.png` });

        // ── El selector de cuenta ──────────────────────────────────────────
        exigir(
            (await cuenta.textContent())?.includes("Banco de Embudos"),
            "dueño: el selector de cuenta abre en la suya",
        );
        await cuenta.click();
        await pagina.waitForTimeout(400);
        /*
         * Lo que OFRECE, que es el fallo del #948: el dueño es `admin`, así que
         * su cartera son todas las cuentas cliente de la plataforma y el
         * selector las ofrecía. Solo pueden salir la suya y la que cuelga de
         * ella.
         */
        const ofrecidas = (await pagina.getByRole("menuitem").allTextContents()).map((t) => t.trim());
        exigir(
            ofrecidas.length === 2,
            `dueño: el selector ofrece solo su cuenta y la hija (${ofrecidas.join(" | ")})`,
        );
        exigir(
            !ofrecidas.some((t) => /Sin Vinculo/i.test(t)),
            "dueño: una cuenta cliente sin vínculo NO se ofrece",
        );
        await pagina.getByRole("menuitem", { name: /Verzay Ventas/ }).click();
        await pagina.waitForTimeout(2500);

        exigir(
            new URL(pagina.url()).searchParams.get("cuenta") !== null,
            "dueño: la cuenta elegida queda en la dirección",
        );
        exigir(
            await pagina.getByText("Estás viendo el tablero de").isVisible(),
            "dueño: se avisa de que el tablero es de otra cuenta",
        );
        // La hija no tiene embudos todavía: la pantalla lo dice, y el mando de
        // crear sigue ahí porque la madre administra esa cuenta.
        exigir(
            await pagina.getByText("Aún no hay embudos en esta cuenta").isVisible(),
            "dueño: en la hija, que todavía no tiene embudos, lo dice",
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1b-cuenta-hija-vacia.png` });

        // Se crea uno EN la hija y aparecen SUS conversaciones, ninguna de la madre.
        await pagina.getByRole("button", { name: "Nuevo" }).click();
        await pagina.getByLabel("Nombre del embudo").fill("Ventas hija");
        await pagina.getByRole("button", { name: "Crear" }).click();
        await pagina.getByText("Etapas del embudo").waitFor({ timeout: 15000 });
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(1500);

        const deLaHija = await tarjetas(pagina);
        exigir(
            deLaHija.length === 2 && deLaHija.every((n) => /Panadería|Distribuidora/.test(n)),
            `dueño: en la hija ve SUS dos conversaciones (${deLaHija.join(", ")})`,
        );
        exigir(
            !deLaHija.some((n) => /María|Julián|Ferretería|Marta/.test(n)),
            "dueño: ninguna conversación de la madre se cuela en el tablero de la hija",
        );
        exigir(await sinDesborde(pagina), "dueño: con los tres mandos la página no se desplaza a lo ancho");

        exigir((await cuenta.textContent())?.includes("Verzay Ventas"), "dueño: el mando dice qué cuenta se mira");

        /*
         * Y abre donde se quedó: se entra a `/embudos` con la dirección LIMPIA
         * —como quien lo abre desde el menú— y sigue en la hija. Antes volvía
         * siempre a la propia, así que había que elegirla en cada visita.
         *
         * La dirección se pone al día sola: si no, diría «la propia» mientras
         * se está mirando otra cuenta, y copiarla llevaría a otro sitio.
         */
        await pagina.goto(`${BASE}/embudos`, { waitUntil: "domcontentloaded" });
        await pagina.waitForTimeout(3000);
        exigir(
            (await cuenta.textContent())?.includes("Verzay Ventas"),
            "dueño: al volver con la dirección limpia, el tablero abre en la hija",
        );
        exigir(
            new URL(pagina.url()).searchParams.get("cuenta") !== null,
            "dueño: y la dirección lo dice, para que el enlace no mienta",
        );
        const recordadas = await tarjetas(pagina);
        exigir(
            recordadas.length === 2 && !recordadas.some((n) => /María|Julián|Ferretería|Marta/.test(n)),
            `dueño: y son las de la hija (${recordadas.join(", ")})`,
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1b-cuenta-recordada.png` });

        // Y volver a la suya devuelve las cuatro.
        await cuenta.click();
        await pagina.getByRole("menuitem", { name: /Banco de Embudos/ }).click();
        await pagina.waitForTimeout(2500);
        const devuelta = await tarjetas(pagina);
        exigir(
            devuelta.length === 4 && !devuelta.some((n) => /Panadería|Distribuidora/.test(n)),
            `dueño: al volver a su cuenta ve las suyas (${devuelta.join(", ")})`,
        );
        exigir(
            new URL(pagina.url()).searchParams.get("cuenta") === null,
            "dueño: su propia cuenta es la dirección limpia",
        );

        // Volver a la suya también se recuerda: si no, no habría forma de salir
        // de la hija sin escribir la dirección a mano en cada visita.
        await pagina.goto(`${BASE}/embudos`, { waitUntil: "domcontentloaded" });
        await pagina.waitForTimeout(3000);
        exigir(
            (await cuenta.textContent())?.includes("Banco de Embudos"),
            "dueño: al volver a la suya, eso es lo que se recuerda",
        );
        await contexto.close();
    }

    // ── 1c. La hija no ve a su madre ni puede elegir cuenta ────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "hija@embudos.test");
        await abrirEmbudos(pagina);
        exigir(
            (await pagina.locator('[data-selector="cuenta"]').count()) === 0,
            "la hija: no se le ofrece ninguna cuenta que elegir",
        );
        const suyas = await tarjetas(pagina);
        exigir(
            suyas.length === 2 && suyas.every((n) => /Panadería|Distribuidora/.test(n)),
            `la hija: ve solo lo suyo (${suyas.join(", ")})`,
        );
        await contexto.close();
    }

    // ── 2. La administradora: los mismos mandos ────────────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "monica@embudos.test");
        await abrirEmbudos(pagina);
        exigir(await pagina.getByRole("button", { name: "Nuevo" }).isVisible(), "administradora: tiene «Nuevo»");
        exigir(await pagina.getByText("Embudo: Ventas").isVisible(), "administradora: tiene el selector de embudo");
        exigir((await tarjetas(pagina)).length === 4, "administradora: ve las cuatro conversaciones");
        await pagina.getByRole("button", { name: "Acciones" }).click();
        exigir(await pagina.getByRole("menuitem", { name: "Editar etapas" }).isVisible(), "administradora: puede editar etapas");
        await pagina.keyboard.press("Escape");
        await contexto.close();
    }

    // ── 3. Ana: su embudo y nada más ───────────────────────────────────────
    for (const ancho of [1440, 390]) {
        const { contexto, pagina } = await entrar(navegador, "ana@embudos.test", ancho);
        await abrirEmbudos(pagina);
        const vistas = await tarjetas(pagina);
        exigir(
            vistas.length === 2 && vistas.every((n) => /María|Julián/.test(n)),
            `Ana ${ancho}: ve solo sus dos conversaciones (${vistas.join(", ")})`,
        );
        exigir((await pagina.getByRole("button", { name: "Nuevo" }).count()) === 0, `Ana ${ancho}: sin «Nuevo»`);
        exigir((await pagina.getByRole("button", { name: "Acciones" }).count()) === 0, `Ana ${ancho}: sin «⋯»`);
        exigir((await pagina.getByLabel("Editar etapas").count()) === 0, `Ana ${ancho}: sin editar etapas`);
        exigir((await pagina.getByText("Nueva etapa").count()) === 0, `Ana ${ancho}: sin «Nueva etapa»`);
        exigir(await pagina.locator("[title^='Te lo asignó']").isVisible(), `Ana ${ancho}: su embudo, con candado`);
        exigir(await sinDesborde(pagina), `Ana ${ancho}: la página no se desplaza a lo ancho`);
        await pagina.screenshot({ path: `${CAPTURAS}/3-ana-${ancho}.png` });

        if (ancho === 1440) {
            // Arrastrar «Julián» a la tercera columna, con el ratón de verdad.
            const origen = pagina.locator("p.capitalize", { hasText: "Julián" });
            const destino = pagina.locator("span.uppercase.text-white", { hasText: "Cerrado" });
            const a = await origen.boundingBox();
            const d = await destino.boundingBox();
            await pagina.mouse.move(a.x + 20, a.y + 5);
            await pagina.mouse.down();
            await pagina.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
            await pagina.mouse.move(d.x + 30, d.y + 120, { steps: 20 });
            await pagina.mouse.up();
            await pagina.waitForTimeout(2000);
            await pagina.reload({ waitUntil: "networkidle" });
            await pagina.waitForSelector("[data-barra-de-acciones]");
            const enCerrado = await pagina.evaluate(() => {
                const cab = [...document.querySelectorAll("span.uppercase.text-white")].find(
                    (s) => s.textContent?.trim() === "Cerrado",
                );
                const col = cab?.closest("div.rounded-xl");
                return [...(col?.querySelectorAll("p.capitalize") ?? [])].map((p) => p.textContent?.trim());
            });
            exigir(enCerrado.some((n) => /Julián/.test(n ?? "")), `Ana: la tarjeta arrastrada sigue en «Cerrado» al recargar (${enCerrado})`);
        }
        await contexto.close();
    }

    // ── 4. Beto, sin embudo ────────────────────────────────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "beto@embudos.test");
        await abrirEmbudos(pagina);
        exigir(await pagina.getByText("Aún no tienes un embudo asignado").isVisible(), "Beto: sin embudo, lo dice");
        exigir((await tarjetas(pagina)).length === 0, "Beto: no ve ninguna conversación");
        await pagina.screenshot({ path: `${CAPTURAS}/4-beto-1440.png` });
        await contexto.close();
    }
} finally {
    await navegador.close();
}

if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\nEmbudos, sobre la página servida: todo en su sitio.");
