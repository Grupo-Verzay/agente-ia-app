/**
 * Embudos, en Chromium y sobre la página SERVIDA, de punta a punta:
 *
 *  1. El dueño entra, crea «Ventas» por la pantalla y asigna a Ana. Y su
 *     tablero **acaba en sus etapas**: ni un recuadro de «Nueva etapa» entre
 *     las columnas, que se crean en «Etapas del embudo».
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
 *  7. La fila de colores del panel de etapas, medida contra la de Etiquetas EN
 *     LA MISMA SESIÓN: los mismos seis círculos, del mismo tamaño, con el mismo
 *     cuadrito de selector libre, sin la palabra «Color» y arrancando donde
 *     arranca el campo del nombre.
 *  8. Las tres etapas de sistema: su nombre se edita, y no se borran, no se
 *     mueven y no tienen fila de colores.
 *  9. Vaciar «Perdido» —solo esa columna tiene el botón—, la papelera con sus
 *     días y restaurar, que las devuelve a SU etapa y no a la primera.
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

/** Cierra los diálogos de bienvenida y guías que tapan los clics. */
async function cerrarLasCapas(pagina) {
    for (let i = 0; i < 6; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(350);
    }
}

async function abrirEmbudos(pagina) {
    await pagina.goto(`${BASE}/embudos`, { waitUntil: "networkidle" });
    await cerrarLasCapas(pagina);
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

/**
 * Arrastra una tarjeta a una columna, con el ratón de verdad.
 *
 * Con siete columnas, la de destino puede estar FUERA de la vista —el tablero se
 * desplaza a lo ancho—, así que primero se la trae: sin eso el `boundingBox` de
 * la cabecera cae fuera de la ventana y el ratón suelta en el vacío. Ese era el
 * fallo que hacía que la segunda tarjeta no llegara nunca.
 */
async function arrastrarA(pagina, quien, columna) {
    const cab = pagina.locator("span.uppercase.text-white", { hasText: columna }).first();
    await cab.scrollIntoViewIfNeeded();
    await pagina.waitForTimeout(400);
    const origen = pagina.locator("p.capitalize", { hasText: quien }).first();
    await origen.scrollIntoViewIfNeeded();
    const a = await origen.boundingBox();
    const d = await cab.boundingBox();
    if (!a || !d) return false;
    await pagina.mouse.move(a.x + 20, a.y + 5);
    await pagina.mouse.down();
    await pagina.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
    await pagina.mouse.move(d.x + 30, d.y + 120, { steps: 20 });
    await pagina.mouse.up();
    await pagina.waitForTimeout(1800);
    return true;
}

/** Las tarjetas que hay DENTRO de una columna, por el nombre de su cabecera. */
const deLaColumna = (pagina, nombre) =>
    pagina.evaluate((n) => {
        const cab = [...document.querySelectorAll("span.uppercase.text-white")].find(
            (s) => s.textContent?.trim() === n,
        );
        const col = cab?.closest("div.rounded-xl");
        return [...(col?.querySelectorAll("p.capitalize") ?? [])].map((p) => p.textContent?.trim());
    }, nombre);

/**
 * La fila de colores que haya en la pantalla: sus círculos, su tamaño y el
 * cuadrito del selector libre.
 *
 * Se mide igual en las dos pantallas —Etiquetas y el panel de etapas— para poder
 * compararlas entre ellas en vez de contra números copiados a mano. Los colores
 * se leen del estilo computado y se normalizan a hex en mayúsculas: el navegador
 * los devuelve como `rgb(...)`.
 */
const medirLaFilaDeColores = (pagina) =>
    pagina.evaluate(() => {
        const aHex = (rgb) => {
            const n = rgb.match(/\d+/g);
            if (!n) return rgb;
            return (
                "#" +
                n
                    .slice(0, 3)
                    .map((x) => Number(x).toString(16).padStart(2, "0"))
                    .join("")
                    .toUpperCase()
            );
        };
        const cuadrito = document.querySelector('input[type="color"]');
        if (!cuadrito) return null;
        const fila = cuadrito.parentElement;
        const circulos = [...fila.querySelectorAll("button")];
        if (circulos.length === 0) return null;
        const c = circulos[0].getBoundingClientRect();
        const q = cuadrito.getBoundingClientRect();
        return {
            circulos: circulos.map((b) => aHex(getComputedStyle(b).backgroundColor)),
            tamano: `${Math.round(c.width)}x${Math.round(c.height)}`,
            cuadrito: `${Math.round(q.width)}x${Math.round(q.height)}`,
            tipoDelCuadrito: cuadrito.type,
        };
    });

const navegador = await chromium.launch();
try {
    // ── 1. El dueño crea y asigna ─────────────────────────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "dueno@embudos.test");
        await abrirEmbudos(pagina);
        /*
         * La cuenta NACE con su embudo: nadie lo creó, y el tablero ya está
         * puesto con sus siete columnas en su orden. La pantalla vacía de «Aún
         * no hay embudos» no se ve en una cuenta nueva.
         */
        exigir(
            (await pagina.getByText("Aún no hay embudos en esta cuenta").count()) === 0,
            "dueño: la cuenta nace con su embudo, no con la pantalla vacía",
        );
        const alEntrar = await columnas(pagina);
        exigir(
            JSON.stringify(alEntrar) ===
                JSON.stringify(["Nuevo", "Contactado", "Interesado", "Cotizado", "Negociación", "Ganado", "Perdido"]),
            `dueño: las siete etapas, en su orden (${alEntrar.join(", ")})`,
        );
        exigir(await pagina.getByText("Embudo: Embudo de ventas").isVisible(), "dueño: y su embudo tiene nombre");

        /*
         * El tablero ACABA EN SUS ETAPAS.
         *
         * Detrás de las columnas hubo un recuadro punteado del alto de una
         * columna con «Nueva etapa» dentro, y se leía como una etapa más —vacía
         * y sin nombre—. Se mira con el dueño delante, que es quien lo veía; un
         * asesor nunca lo tuvo, y eso ya se comprueba abajo.
         */
        exigir(
            (await pagina.getByText("Nueva etapa").count()) === 0,
            "dueño: el tablero no ofrece ningún «Nueva etapa» entre las columnas",
        );
        const finalDeLaFila = await pagina.evaluate(() => {
            const cab = document.querySelector("span.uppercase.text-white");
            const fila = cab?.closest("div.rounded-xl")?.parentElement;
            if (!fila) return null;
            const ultimo = fila.children[fila.children.length - 1];
            return {
                hijos: fila.children.length,
                ultimoEsColumna: Boolean(ultimo?.querySelector("span.uppercase.text-white")),
            };
        });
        exigir(
            finalDeLaFila?.hijos === 7 && finalDeLaFila.ultimoEsColumna,
            `dueño: la fila tiene un hijo por etapa y acaba en una columna (${JSON.stringify(finalDeLaFila)})`,
        );

        // Renombrar una del cliente se ve en el tablero.
        await pagina.getByRole("button", { name: "Acciones" }).click();
        await pagina.getByRole("menuitem", { name: "Editar etapas" }).click();
        await pagina.getByText("Etapas del embudo").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(800);
        exigir(
            (await pagina.$$('input[aria-label^="Nombre de la etapa"]')).length === 7,
            "dueño: el panel de etapas trae las siete",
        );
        // Y aquí SÍ hay un «Nueva etapa»: es el otro lado del cambio de arriba
        // —las etapas se crean donde se editan—, así que quitarlo del tablero
        // no deja a nadie sin poder crear una.
        exigir(
            (await pagina.getByRole("button", { name: "Nueva etapa" }).count()) === 1,
            "dueño: y las etapas se crean aquí, en «Etapas del embudo»",
        );
        await pagina.getByLabel("Nombre de la etapa 4").fill("Cotización enviada");
        await pagina.getByRole("button", { name: "Guardar" }).click();
        await pagina.getByText("Etapas guardadas.").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(800);
        const cols = await columnas(pagina);
        exigir(cols.includes("Cotización enviada"), `dueño: la etapa renombrada sale en el tablero (${cols.join(", ")})`);
        exigir(
            cols[0] === "Nuevo" && cols[5] === "Ganado" && cols[6] === "Perdido",
            `dueño: Nuevo sigue primera y Ganado/Perdido últimas (${cols.join(", ")})`,
        );
        const vistas = await tarjetas(pagina);
        exigir(vistas.length === 4, `dueño: ve las cuatro conversaciones de la cuenta (${vistas.length})`);
        exigir(await pagina.getByText("Sin asignar").first().isVisible(), "dueño: la conversación sin asesor lo dice");
        await pagina.screenshot({ path: `${CAPTURAS}/1-dueno-1440.png` });

        // Asignar a Ana.
        await pagina.getByRole("button", { name: "Acciones" }).click();
        await pagina.getByRole("menuitem", { name: "Asignar asesores" }).click();
        await pagina.getByLabel("Embudo de Ana Ruiz").click();
        await pagina.getByRole("option", { name: "Embudo de ventas" }).click();
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
            JSON.stringify(porColumna.map(([, n]) => n)) === JSON.stringify(["4", "0", "0", "0", "0", "0", "0"]),
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
        // La hija también nace con el suyo, así que se ven SUS conversaciones sin
        // tener que crear nada. El embudo es de la cuenta que se mira, no de
        // quien la mira.
        exigir(
            (await pagina.getByText("Aún no hay embudos en esta cuenta").count()) === 0,
            "dueño: la cuenta hija también nace con su embudo",
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1b-cuenta-hija.png` });

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

    // ── 1d. La fila de colores: la MISMA que la de Etiquetas ───────────────
    /*
     * El encargo es que quede «idéntica a la de Etiquetas», así que se miden las
     * DOS en la misma sesión y se comparan entre ellas: con los números escritos
     * a mano, esto se pondría rojo el día que alguien afine la de Etiquetas
     * —cuando lo correcto sería que las dos se movieran juntas— y verde el día
     * que se separen por un valor que el banco copió mal.
     */
    {
        const { contexto, pagina } = await entrar(navegador, "dueno@embudos.test");

        // Primero la de Etiquetas, que es la referencia.
        await pagina.goto(`${BASE}/tags`, { waitUntil: "networkidle" });
        await pagina.waitForTimeout(2000);
        await cerrarLasCapas(pagina);
        // Esa pantalla abre en su Kanban: el formulario de crear una etiqueta
        // vive en «Gestionar».
        // Por TEXTO y no por rol: esa pestaña no es un `button` accesible.
        await pagina.locator("text=Gestionar").first().click();
        await pagina.waitForTimeout(1000);
        // Y su botón azul dice «Nuevo», como el de todas (`BotonDeCrear`).
        await pagina.getByRole("button", { name: "Nuevo" }).first().click();
        await pagina.waitForTimeout(1000);
        const deEtiquetas = await medirLaFilaDeColores(pagina);
        exigir(deEtiquetas !== null, "Etiquetas: se encuentra su fila de colores");
        await pagina.screenshot({ path: `${CAPTURAS}/1d-etiquetas-colores.png` });

        // Y ahora la del diálogo de etapas.
        await abrirEmbudos(pagina);
        await pagina.getByRole("button", { name: "Acciones" }).click();
        await pagina.getByRole("menuitem", { name: "Editar etapas" }).click();
        await pagina.getByText("Etapas del embudo").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(800);
        const deEtapas = await medirLaFilaDeColores(pagina);
        exigir(deEtapas !== null, "Etapas: se encuentra su fila de colores");
        await pagina.screenshot({ path: `${CAPTURAS}/1d-etapas-colores.png` });

        if (deEtiquetas && deEtapas) {
            exigir(
                JSON.stringify(deEtapas.circulos) === JSON.stringify(deEtiquetas.circulos),
                `los seis colores rápidos son los MISMOS de Etiquetas (${deEtapas.circulos.join(" ")})`,
            );
            exigir(
                deEtapas.circulos.length === 6,
                `son seis círculos, como en Etiquetas (${deEtapas.circulos.length})`,
            );
            exigir(
                deEtapas.tamano === deEtiquetas.tamano,
                `los círculos miden lo mismo que en Etiquetas (${deEtapas.tamano} vs ${deEtiquetas.tamano})`,
            );
            exigir(
                deEtapas.cuadrito === deEtiquetas.cuadrito,
                `el cuadrito del selector libre mide lo mismo (${deEtapas.cuadrito} vs ${deEtiquetas.cuadrito})`,
            );
            exigir(deEtapas.tipoDelCuadrito === "color", "el cuadrito abre el selector libre del navegador");
        }

        // Y las tres cosas del encargo sobre la fila.
        exigir(
            (await pagina.getByText("Etapas del embudo").locator("..").getByText("Color", { exact: true }).count()) === 0,
            "la fila no lleva la palabra «Color» delante",
        );
        const alineados = await pagina.evaluate(() => {
            const campo = document.querySelector('input[aria-label="Nombre de la etapa 2"]');
            const circulo = campo
                ?.closest("div.space-y-2")
                ?.querySelector('button[aria-label^="Color #"]');
            if (!campo || !circulo) return null;
            return [Math.round(campo.getBoundingClientRect().left), Math.round(circulo.getBoundingClientRect().left)];
        });
        exigir(
            alineados !== null && Math.abs(alineados[0] - alineados[1]) <= 1,
            `los círculos arrancan donde el campo del nombre (${JSON.stringify(alineados)})`,
        );

        // ── Las tres de sistema: nombre sí, lo demás no ────────────────────
        const sistema = await pagina.evaluate(() => {
            const filas = [...document.querySelectorAll('input[aria-label^="Nombre de la etapa"]')].map((i) => {
                const caja = i.closest("div.space-y-2");
                return {
                    nombre: i.value,
                    editable: !i.disabled,
                    candado: Boolean(caja?.querySelector('[aria-label="Etapa del sistema"]')),
                    borrar: Boolean(caja?.querySelector('[aria-label="Eliminar etapa"]')),
                    flechas: caja?.querySelectorAll('[aria-label="Subir etapa"], [aria-label="Bajar etapa"]').length ?? 0,
                    colores: caja?.querySelectorAll('button[aria-label^="Color #"]').length ?? 0,
                };
            });
            return filas;
        });
        const lasDeSistema = sistema.filter((f) => f.candado);
        exigir(lasDeSistema.length === 3, `hay tres etapas del sistema (${lasDeSistema.length})`);
        exigir(
            lasDeSistema.every((f) => f.editable && !f.borrar && f.flechas === 0 && f.colores === 0),
            "una de sistema: el nombre se edita, y no se borra, no se mueve y no cambia de color",
        );
        exigir(
            sistema[0].nombre === "Nuevo" &&
                sistema[sistema.length - 2].nombre === "Ganado" &&
                sistema[sistema.length - 1].nombre === "Perdido",
            `Nuevo primera y Ganado/Perdido últimas en el panel (${sistema.map((f) => f.nombre).join(", ")})`,
        );
        const delCliente = sistema.filter((f) => !f.candado);
        exigir(
            delCliente.every((f) => f.borrar && f.colores === 6),
            "una del cliente: se borra y tiene sus seis colores",
        );
        // Y la primera del cliente no puede subir por encima de «Nuevo».
        const primeraDelCliente = pagina.locator('input[aria-label="Nombre de la etapa 2"]')
            .locator("..")
            .getByLabel("Subir etapa");
        exigir(await primeraDelCliente.isDisabled(), "la primera del cliente no salta por encima de «Nuevo»");
        await pagina.keyboard.press("Escape");
        await contexto.close();
    }

    // ── 1e. Vaciar «Perdido», la papelera y restaurar ──────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "dueno@embudos.test");
        await abrirEmbudos(pagina);

        // Solo la columna de Perdido tiene los dos botones.
        const cuantosVaciar = await pagina.getByLabel("Vaciar la columna").count();
        exigir(cuantosVaciar === 1, `solo una columna tiene el botón de vaciar (${cuantosVaciar})`);
        const enPerdido = await pagina.evaluate(() => {
            const b = document.querySelector('[aria-label="Vaciar la columna"]');
            return b?.closest("div.rounded-xl")?.querySelector("span.uppercase")?.textContent?.trim();
        });
        exigir(enPerdido === "Perdido", `y es la de Perdido (${enPerdido})`);

        // Se arrastran dos tarjetas a Perdido.
        for (const quien of ["María", "Marta"]) {
            exigir(await arrastrarA(pagina, quien, "Perdido"), `se arrastra ${quien} a Perdido`);
        }
        const antesDeVaciar = await deLaColumna(pagina, "Perdido");
        exigir(antesDeVaciar.length === 2, `dos tarjetas en Perdido (${antesDeVaciar.join(", ")})`);
        await pagina.screenshot({ path: `${CAPTURAS}/1e-antes-de-vaciar.png` });

        // El diálogo dice el número y que se puede deshacer.
        await pagina.getByLabel("Vaciar la columna").click();
        await pagina.getByText("¿Vaciar «Perdido»?").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(1200);
        const dice = (await pagina.locator('[role="alertdialog"]').textContent()) ?? "";
        exigir(/2 conversaciones/.test(dice), `el diálogo dice cuántas se lleva (${dice.slice(0, 120)})`);
        exigir(/30 días/.test(dice), "el diálogo dice que se pueden recuperar 30 días");
        // Acotado AL DIÁLOGO y exacto: `getByRole(name)` coincide por substring,
        // así que «Vaciar» a secas encontraba antes el botón de la columna
        // —«Vaciar la columna»— y se quedaba esperando a que se habilitara uno
        // que ya no estaba en pantalla.
        await pagina.locator('[role="alertdialog"]').getByRole("button", { name: "Vaciar", exact: true }).click();
        await pagina.getByText(/Se vaciaron 2 conversaciones/).waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(1500);

        const despues = await deLaColumna(pagina, "Perdido");
        exigir(despues.length === 0, `la columna queda vacía (${despues.join(", ")})`);
        const enElTablero = await tarjetas(pagina);
        exigir(
            !enElTablero.some((n) => /María|Marta/.test(n)),
            `y no reaparecen en ninguna otra columna (${enElTablero.join(", ")})`,
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1e-vaciada.png` });

        // La papelera las tiene, con sus días.
        await pagina.getByLabel("Abrir la papelera").click();
        await pagina.getByText("Papelera de Perdido").waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(1200);
        const enLaPapelera = await pagina.$$eval("p.truncate", (els) => els.map((e) => e.textContent?.trim()));
        exigir(
            enLaPapelera.filter((n) => /María|Marta/.test(n ?? "")).length === 2,
            `las dos están en la papelera (${enLaPapelera.join(", ")})`,
        );
        exigir(
            (await pagina.getByText(/Quedan 30 días/).count()) >= 1,
            "la papelera dice los días que quedan",
        );
        await pagina.screenshot({ path: `${CAPTURAS}/1e-papelera.png` });

        // Y restaurar las devuelve a Perdido, no a la primera columna.
        await pagina.getByRole("button", { name: "Restaurar todo" }).click();
        await pagina.getByText(/restauradas a su etapa/).waitFor({ timeout: 15000 });
        await pagina.waitForTimeout(1800);
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(500);
        const vueltas = await deLaColumna(pagina, "Perdido");
        exigir(
            vueltas.length === 2,
            `restaurar las devuelve a SU etapa, no a la primera (${vueltas.join(", ")})`,
        );
        exigir(
            (await pagina.getByLabel("Abrir la papelera").count()) === 0,
            "con la papelera vacía su botón no se pinta",
        );
        exigir(await sinDesborde(pagina), "con los dos botones de Perdido la página no se desplaza a lo ancho");
        await contexto.close();
    }

    // ── 2. La administradora: los mismos mandos ────────────────────────────
    {
        const { contexto, pagina } = await entrar(navegador, "monica@embudos.test");
        await abrirEmbudos(pagina);
        exigir(await pagina.getByRole("button", { name: "Nuevo" }).isVisible(), "administradora: tiene «Nuevo»");
        exigir(await pagina.getByText("Embudo: Embudo de ventas").isVisible(), "administradora: tiene el selector de embudo");
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
            // Arrastrar «Julián» a «Interesado», con el ratón de verdad.
            await arrastrarA(pagina, "Julián", "Interesado");
            await pagina.reload({ waitUntil: "networkidle" });
            await pagina.waitForSelector("[data-barra-de-acciones]");
            const enCerrado = await pagina.evaluate(() => {
                const cab = [...document.querySelectorAll("span.uppercase.text-white")].find(
                    (s) => s.textContent?.trim() === "Interesado",
                );
                const col = cab?.closest("div.rounded-xl");
                return [...(col?.querySelectorAll("p.capitalize") ?? [])].map((p) => p.textContent?.trim());
            });
            exigir(enCerrado.some((n) => /Julián/.test(n ?? "")), `Ana: la tarjeta arrastrada sigue en «Interesado» al recargar (${enCerrado})`);
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
