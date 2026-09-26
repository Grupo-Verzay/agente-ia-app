/**
 * La NOTA RÁPIDA y los TRES botones del borde derecho.
 *
 * # Qué se rompe aquí, y por eso son tres mitades
 *
 * 1. **Que el eje se descuadre.** El copiloto tiene que quedarse clavado en la
 *    mitad de la ventana con la nota y el equipo a la misma distancia. Con
 *    `-translate-y-1/2` lo que se centra es la COLUMNA, así que con dos botones
 *    ninguno estaba centrado —el copiloto caía 20 px por encima— y con tres
 *    iguales vuelve a salir bien **por casualidad**. Eso deja de valer en
 *    silencio el día que entre un cuarto botón. La cuenta es pura y se afirma
 *    sin navegador; que la pantalla la USE, no.
 * 2. **Que la nota pierda lo apuntado.** Lo que se guarda, lo que se recorta y
 *    —lo que de verdad duele— el ORDEN al ascenderla a Notas: si el papel se
 *    vacía antes de que la nota formal exista, un fallo de Notas se lleva lo
 *    escrito y no queda en ninguna parte.
 * 3. **Que el id llegue del navegador.** Una acción de servidor ES un endpoint:
 *    estas tres no reciben ningún `userId` y la ruta tampoco. Eso se lee del
 *    código, y contra Postgres se comprueba además que dos personas no se pisan.
 *
 * `MODO=roto` reproduce el «antes» y AFIRMA el fallo: los botones construidos
 * con los de `ANTES_REF` —dos, sin nota, y el copiloto fuera del centro— y el
 * envío a Notas con el orden INGENUO escrito literal aquí dentro.
 *
 * Se levanta con `scripts/banco-nota-rapida.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "nota-rapida");
const HARNESS = join(AQUI, ".compilado", "harness-botones-del-borde.js");

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");

/**
 * Sin comentarios.
 *
 * El barrido busca clases y nombres en el código, y **el arreglo lleva escrito
 * al lado por qué la columna ya no se centra a sí misma** — con el texto crudo,
 * la explicación del arreglo tumbaría al banco que lo protege. Ya costó una
 * vuelta en el barrido de `BarraDeAcciones`.
 */
const sinComentarios = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const leer = (f) => sinComentarios(crudo(f));
// El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
// fusione, `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde
// sin ejercer nada. Un modo roto que pasa no está en verde, está muerto.
const ANTES_REF = process.env.ANTES_REF ?? "6c83fbe";
const leerDeAntes = (f) =>
    sinComentarios(execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ }));

const geometria = await import(join(COMPILADO, "botones-del-borde.js"));
const reglas = await import(join(COMPILADO, "nota-rapida.js"));

// ─────────────────────────────────────────────────────────────────────────────
// 1. La geometría, pura
// ─────────────────────────────────────────────────────────────────────────────

test("el EJE queda en el centro y sus dos vecinos a la misma distancia", () => {
    const centros = geometria.elCentroDeCadaBoton();
    assert.equal(centros.copiloto, 0, "el copiloto es el eje: cae en el centro");
    assert.equal(
        Math.abs(centros.nota),
        Math.abs(centros.equipo),
        "la nota y el equipo, a la misma distancia del eje",
    );
    assert.ok(centros.nota < 0, "la nota va arriba");
    assert.ok(centros.equipo > 0, "el equipo va abajo");
    assert.equal(centros.nota, -(geometria.LADO_DEL_BOTON + geometria.HUECO_ENTRE_BOTONES));
});

test("el eje se mantiene centrado aunque cambie cuántos botones hay", () => {
    // Es lo que `-translate-y-1/2` NO hacía: aquello centra la columna, así que
    // el eje se descuadra en cuanto los de arriba y los de abajo no son los
    // mismos. Aquí se ejerce el caso que hoy no existe pero mañana sí: un
    // cuarto botón.
    const cuatro = ["nota", "copiloto", "equipo", "otro"];
    const centros = geometria.elCentroDeCadaBoton(cuatro, "copiloto");
    assert.equal(centros.copiloto, 0);
    assert.equal(Math.abs(centros.nota), Math.abs(centros.equipo));

    const centrarLaColumna = (orden) => {
        const alto = geometria.elAltoDeLaColumna(orden);
        const paso = geometria.LADO_DEL_BOTON + geometria.HUECO_ENTRE_BOTONES;
        return orden.indexOf("copiloto") * paso + geometria.LADO_DEL_BOTON / 2 - alto / 2;
    };
    assert.notEqual(centrarLaColumna(cuatro), 0, "centrando la columna, el eje se va del centro");
});

test("con DOS botones —lo de antes— el copiloto NO estaba centrado", () => {
    // La cuenta de antes, escrita aquí: la columna centrada con el copiloto
    // arriba. 76 px de alto, así que su centro caía 20 px por encima.
    const alto = 2 * geometria.LADO_DEL_BOTON + geometria.HUECO_ENTRE_BOTONES;
    const centroDelCopiloto = geometria.LADO_DEL_BOTON / 2 - alto / 2;
    assert.equal(centroDelCopiloto, -20);
});

test("el desplazamiento es del borde de arriba al centro del eje", () => {
    assert.equal(geometria.elDesplazamientoDelEje(), 58);
    assert.equal(geometria.elAltoDeLaColumna(), 116);
});

test("un eje que no está en la lista no se inventa: se cae al centro", () => {
    const orden = ["nota", "equipo"];
    assert.equal(
        geometria.elDesplazamientoDelEje(orden, "copiloto"),
        geometria.elAltoDeLaColumna(orden) / 2,
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Las reglas de la nota, puras
// ─────────────────────────────────────────────────────────────────────────────

test("lo que no es una cadena vale por vacío, nunca por nulo", () => {
    for (const malo of [null, undefined, 7, {}, []]) {
        assert.equal(reglas.comoTextoDeLaNota(malo), "");
    }
    assert.equal(reglas.comoTextoDeLaNota("hola\nadiós"), "hola\nadiós", "los saltos son contenido");
});

test("el tope recorta Y SE DICE", () => {
    const largo = "a".repeat(reglas.TOPE_DE_LA_NOTA + 50);
    assert.equal(reglas.comoTextoDeLaNota(largo).length, reglas.TOPE_DE_LA_NOTA);
    assert.equal(reglas.seRecorto(largo), true);
    assert.equal(reglas.seRecorto("a".repeat(reglas.TOPE_DE_LA_NOTA)), false, "justo en el tope no");
});

test("sin cambios no se escribe", () => {
    assert.equal(reglas.hayQueGuardar("igual", "igual"), false);
    assert.equal(reglas.hayQueGuardar("", "algo"), true);
    assert.equal(reglas.hayQueGuardar("algo", ""), true, "vaciarla también se guarda");
});

test("el título es la primera línea CON ALGO, no la primera a secas", () => {
    assert.equal(reglas.elTituloDeLaNota("\n\n  Llamar a Marta  \nmañana"), "Llamar a Marta");
    assert.equal(reglas.elTituloDeLaNota("una sola"), "una sola");
    const largo = "b".repeat(reglas.TOPE_DEL_TITULO + 20);
    const titulo = reglas.elTituloDeLaNota(largo);
    assert.equal(titulo.length, reglas.TOPE_DEL_TITULO);
    assert.ok(titulo.endsWith("…"), "recortado, con sus puntos DENTRO del tope");
});

test("el cuerpo lleva el texto ENTERO, con la primera línea dentro", () => {
    const doc = reglas.comoContenidoDeNota("Llamar a Marta\n\npide factura");
    assert.equal(doc.type, "doc");
    assert.equal(doc.content.length, 3, "un párrafo por línea, la vacía incluida");
    assert.deepEqual(doc.content[1], { type: "paragraph" }, "una línea vacía NO lleva un texto vacío");
    const plano = JSON.stringify(doc);
    assert.ok(plano.includes("Llamar a Marta"), "el título también se queda en el cuerpo");
    assert.ok(plano.includes("pide factura"));
});

test("una nota en blanco no se manda a Notas", () => {
    assert.equal(reglas.sePuedeMandarAlModulo("   \n  "), false);
    assert.equal(reglas.sePuedeMandarAlModulo("algo"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. El barrido del código
// ─────────────────────────────────────────────────────────────────────────────

const BOTONES = "components/chat-equipo/BotonesDelBorde.tsx";
const LAUNCHER = "app/(root)/ai-chat/components/ChatLauncher.tsx";

test("los tres botones comparten forma: nadie vuelve a escribir los 36 px", (t) => {
    const texto = ROTO ? leerDeAntes : leer;
    const conLaCompartida = [BOTONES, LAUNCHER].filter((f) =>
        texto(f).includes("BOTON_DEL_BORDE"),
    );
    if (ROTO) {
        t.diagnostic(`en ${ANTES_REF}: ${conLaCompartida.length} de 2 usaban la forma compartida`);
        assert.equal(conLaCompartida.length, 0, "antes cada uno tenía su copia de las clases");
        // Y la copia estaba ahí, literal, en los dos.
        for (const f of [BOTONES, LAUNCHER]) {
            assert.ok(texto(f).includes("rounded-l-full border border-r-0"), f);
        }
        return;
    }
    assert.deepEqual(conLaCompartida, [BOTONES, LAUNCHER]);
});

test("la columna NO se centra a sí misma, y el copiloto no trae su posición", (t) => {
    const texto = ROTO ? leerDeAntes : leer;
    const columna = texto(BOTONES);
    const copiloto = texto(LAUNCHER);
    if (ROTO) {
        assert.ok(columna.includes("-translate-y-1/2"), "antes la columna se centraba entera");
        assert.ok(copiloto.includes("fixed"), "y el copiloto traía su propia posición");
        t.diagnostic("el «antes» centraba la columna, así que ningún botón quedaba en el eje");
        return;
    }
    assert.ok(!columna.includes("-translate-y-1/2"), "centrar la columna descuadra el eje");
    assert.ok(columna.includes("elDesplazamientoDelEje"), "la posición se calcula");
    assert.ok(!copiloto.includes("fixed"), "la posición la pone la columna, no el botón");
    assert.ok(
        !copiloto.includes("translate-y"),
        "ni la trae para que quien lo monta se la tenga que deshacer",
    );
});

test("el tercer botón existe y abre su panel", (t) => {
    const texto = ROTO ? leerDeAntes : leer;
    const columna = texto(BOTONES);
    if (ROTO) {
        assert.ok(!columna.includes("PanelDeNotaRapida"), "antes no había nota rápida");
        t.diagnostic("el «antes» monta dos botones y dos paneles");
        return;
    }
    assert.ok(columna.includes("PanelDeNotaRapida"));
    assert.ok(columna.includes('data-boton-del-borde="nota"'));
});

test("el panel de la nota pasa por PanelLateral, o sea por la exclusión", () => {
    const panel = leer("components/nota-rapida/PanelDeNotaRapida.tsx");
    assert.ok(panel.includes("PanelLateral"), "el marco compartido");
    assert.ok(panel.includes("PANEL_DE_LA_NOTA_RAPIDA"), "con su id, que es lo que lo distingue");
    assert.ok(
        !/Dialog(Content|Overlay)|SheetContent/.test(panel),
        "un modal no cierra a los demás ni se deja cerrar: no es un panel lateral",
    );
});

test("ni la acción ni la ruta aceptan un id del navegador", () => {
    const acciones = leer("actions/nota-rapida-actions.ts");
    for (const m of acciones.matchAll(/export async function (\w+)\(([^)]*)\)/g)) {
        assert.ok(
            !/userId|personaId|cuentaId/.test(m[2]),
            `${m[1]} recibe un id: una acción de servidor ES un endpoint`,
        );
    }
    assert.ok(acciones.includes("currentUser"), "la persona sale de la sesión");
    assert.ok(acciones.includes("laPersonaQueActua"), "y es la PERSONA, no la fila efectiva");

    const ruta = leer("app/api/nota-rapida/route.ts");
    assert.ok(ruta.includes("currentUser"), "ninguna ruta /api confía solo en el middleware");
    assert.ok(ruta.includes("laPersonaQueActua"), "la misma función que la acción");
    assert.ok(
        !/body|cuerpo/.test(ruta.split("laPersonaQueActua")[0] ?? ""),
        "la persona se resuelve antes de mirar lo que llega",
    );
});

test("la tabla es de la App: sin columna en User y con su ddl", () => {
    const base = leer("lib/nota-rapida-db.ts");
    assert.ok(base.includes('CREATE TABLE IF NOT EXISTS "nota_rapida"'));
    assert.ok(base.includes("async function ddl"), "dos réplicas: el «ya existe» se traga");
    assert.ok(base.includes("42P01"), "y el recuerdo de «ya la creé» se olvida si la tabla se va");
    assert.ok(base.includes('"personaId" TEXT PRIMARY KEY'), "una por persona, por construcción");
    assert.ok(
        !leer("prisma/schema.prisma").includes("notaRapida"),
        "`User` es del backend: ni una columna desde aquí",
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Las acciones, contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = Boolean(process.env.DATABASE_URL);
const acciones = hayBase
    ? await import(join(COMPILADO, "entrada-de-la-nota-rapida.js"))
    : null;

const sello = Date.now().toString(36);
const idDe = (quien) => `nota-${sello}-${quien}`;

async function sembrarPersona(quien) {
    const id = idDe(quien);
    await acciones.db.user.upsert({
        where: { id },
        update: {},
        create: { id, email: `${id}@banco.test`, name: quien },
    });
    return id;
}

test("la tabla se crea sola, y sin nada escrito la nota está en blanco", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("enblanco");
    acciones.ponerAQuienMira({ id });
    const r = await acciones.leerMiNotaRapidaAction();
    assert.equal(r.success, true);
    assert.equal(r.texto, "");
});

test("se guarda, se lee, y es UNA por persona", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("unapersona");
    acciones.ponerAQuienMira({ id });
    await acciones.guardarMiNotaRapidaAction("primera");
    await acciones.guardarMiNotaRapidaAction("segunda");
    assert.equal((await acciones.leerMiNotaRapidaAction()).texto, "segunda");
    const filas = await acciones.db.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "nota_rapida" WHERE "personaId" = $1`,
        id,
    );
    assert.equal(filas[0].n, 1, "guardar dos veces no deja dos notas");
});

test("dos personas no se pisan", { skip: !hayBase }, async () => {
    const ana = await sembrarPersona("ana");
    const luis = await sembrarPersona("luis");
    acciones.ponerAQuienMira({ id: ana });
    await acciones.guardarMiNotaRapidaAction("lo de Ana");
    acciones.ponerAQuienMira({ id: luis });
    await acciones.guardarMiNotaRapidaAction("lo de Luis");
    acciones.ponerAQuienMira({ id: ana });
    assert.equal((await acciones.leerMiNotaRapidaAction()).texto, "lo de Ana");
    acciones.ponerAQuienMira({ id: luis });
    assert.equal((await acciones.leerMiNotaRapidaAction()).texto, "lo de Luis");
});

test("dentro de otra cuenta, la nota sigue siendo la de la PERSONA", { skip: !hayBase }, async () => {
    // Es el caso de «Ingresar»: la fila efectiva es la del cliente y la persona
    // es quien está sentado delante. El papel no cambia por entrar a mirar otra
    // cuenta, igual que el sonido del chat del equipo.
    const persona = await sembrarPersona("visitante");
    const cliente = await sembrarPersona("cliente");
    acciones.ponerAQuienMira({ id: persona });
    await acciones.guardarMiNotaRapidaAction("mi papel");

    acciones.ponerAQuienMira({ id: cliente, sessionUserId: persona, porImpersonacion: true });
    assert.equal(
        (await acciones.leerMiNotaRapidaAction()).texto,
        "mi papel",
        "dentro del cliente se sigue viendo el papel propio",
    );
    assert.equal(await acciones.leerLaNotaRapida(cliente), "", "y no se escribió nada bajo el cliente");
});

test("sin sesión no se lee ni se escribe", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("consesion");
    acciones.ponerAQuienMira({ id });
    await acciones.guardarMiNotaRapidaAction("algo mío");

    acciones.ponerAQuienMira(null);
    const leida = await acciones.leerMiNotaRapidaAction();
    assert.equal(leida.success, false);
    assert.equal(leida.texto, "");
    const guardada = await acciones.guardarMiNotaRapidaAction("colado");
    assert.equal(guardada.success, false);

    acciones.ponerAQuienMira({ id });
    assert.equal((await acciones.leerMiNotaRapidaAction()).texto, "algo mío", "nada se pisó");
});

test("el tope recorta al guardar y devuelve lo que quedó", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("larga");
    acciones.ponerAQuienMira({ id });
    const r = await acciones.guardarMiNotaRapidaAction("z".repeat(reglas.TOPE_DE_LA_NOTA + 100));
    assert.equal(r.success, true);
    assert.equal(r.recortada, true, "y se dice");
    assert.equal(r.texto.length, reglas.TOPE_DE_LA_NOTA);
    assert.equal((await acciones.leerLaNotaRapida(id)).length, reglas.TOPE_DE_LA_NOTA);
});

test("mandarla a Notas la guarda con su título y VACÍA el papel", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("asciende");
    acciones.ponerAQuienMira({ id });
    await acciones.guardarMiNotaRapidaAction("Llamar a Marta\npide factura a nombre de la esposa");

    const r = await acciones.mandarLaNotaAlModuloAction(
        "Llamar a Marta\npide factura a nombre de la esposa",
    );
    assert.equal(r.success, true);
    assert.equal(r.titulo, "Llamar a Marta");

    const enNotas = await acciones.getNotes(id);
    assert.equal(enNotas.success, true);
    assert.equal(enNotas.data.length, 1, "una nota formal, no dos");
    assert.equal(enNotas.data[0].title, "LLAMAR A MARTA", "Notas escribe sus títulos en mayúscula");

    const guardada = await acciones.db.userNote.findUnique({ where: { id: r.noteId } });
    const cuerpo = JSON.stringify(guardada.content);
    assert.ok(cuerpo.includes("Llamar a Marta"), "el título también está en el cuerpo");
    assert.ok(cuerpo.includes("pide factura a nombre de la esposa"), "y el texto entero");

    assert.equal(await acciones.leerLaNotaRapida(id), "", "el papel se vació");
});

test("una nota vacía no se manda", { skip: !hayBase }, async () => {
    const id = await sembrarPersona("vacia");
    acciones.ponerAQuienMira({ id });
    const r = await acciones.mandarLaNotaAlModuloAction("   \n ");
    assert.equal(r.success, false);
    const enNotas = await acciones.getNotes(id);
    assert.equal(enNotas.data.length, 0, "ni una fila que alguien tenga que ir a borrar");
});

test(
    "si Notas falla, lo apuntado NO se pierde",
    { skip: !hayBase },
    async (t) => {
        // La persona no tiene fila en `User`, así que `createNote` se cae con la
        // clave foránea: es un fallo de Notas de verdad, no uno fingido.
        const fantasma = `nota-${sello}-fantasma`;
        acciones.ponerAQuienMira({ id: fantasma });
        await acciones.guardarMiNotaRapidaAction("lo que no se puede perder");

        if (ROTO) {
            // El orden INGENUO, escrito literal: vaciar primero y crear
            // después. Es lo que se escribe solo, y es exactamente lo que
            // pierde el texto. `createNote` es la de VERDAD, así que el fallo
            // que se ejerce también lo es.
            const texto = "lo que no se puede perder";
            await acciones.guardarLaNotaRapida(fantasma, "");
            const creada = await acciones.createNote(
                fantasma,
                null,
                reglas.comoContenidoDeNota(texto),
                reglas.elTituloDeLaNota(texto),
            );
            assert.equal(creada.success, false, "Notas falló, igual que en el caso bueno");
            assert.equal(
                await acciones.leerLaNotaRapida(fantasma),
                "",
                "con el orden ingenuo el papel se quedó vacío y la nota formal no existe",
            );
            t.diagnostic("orden ingenuo: lo apuntado se perdió");
            return;
        }

        const r = await acciones.mandarLaNotaAlModuloAction("lo que no se puede perder");
        assert.equal(r.success, false, "Notas falló");
        assert.equal(
            await acciones.leerLaNotaRapida(fantasma),
            "lo que no se puede perder",
            "el papel sigue intacto: primero se crea, y solo entonces se vacía",
        );
    },
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Los TRES botones, en Chromium
// ─────────────────────────────────────────────────────────────────────────────

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

const hayNavegador = Boolean(chromium && CSS && fs.existsSync(HARNESS));

/** Los tres, buscados por su etiqueta: es lo único que existe en los DOS mundos. */
const MIRAR = `() => {
    // La equis de un panel lleva la misma etiqueta («Cerrar la nota
    // rápida»), así que se elige por lo único que distingue a un mando de
    // una equis: aria-expanded. Vale en los dos mundos.
    const uno = (t) => [...document.querySelectorAll('button[aria-label*="' + t + '"]')]
        .find((b) => b.hasAttribute('aria-expanded')) ?? null;
    const caja = (b) => {
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { top: r.top, centro: r.top + r.height / 2, alto: r.height, ancho: r.width, derecha: r.right };
    };
    return {
        medio: window.innerHeight / 2,
        ancho: window.innerWidth,
        desborda: document.documentElement.scrollWidth > window.innerWidth,
        nota: caja(uno('nota rápida')),
        copiloto: caja(uno('copiloto')),
        equipo: caja(uno('chat del equipo')),
        abierta: {
            nota: uno('nota rápida')?.getAttribute('aria-expanded') ?? null,
            copiloto: uno('copiloto')?.getAttribute('aria-expanded') ?? null,
        },
    };
}`;

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http
        .createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        })
        .listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const puerto = servidor.address().port;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--no-sandbox"],
    });
    try {
        await hacer(navegador, puerto);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

async function abrirEn(navegador, puerto, ancho, alto) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));
    await pagina.goto(`http://127.0.0.1:${puerto}/`);
    await pagina.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await pagina.evaluate("window.maqueta()");
    await pagina.waitForTimeout(350);
    // Una columna que no llega a pintarse mide cero y pasaría cualquier
    // comprobación de «no desborda». Se cae con estruendo en vez de medir nada.
    assert.deepEqual(errores, [], `la columna no llegó a pintarse a ${ancho}x${alto}`);
    return pagina;
}

const VENTANAS = [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [390, 667],
];

test("el copiloto es el EJE y sus vecinos son simétricos", { skip: !hayNavegador }, async (t) => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const pagina = await abrirEn(navegador, puerto, ancho, alto);
            const m = await pagina.evaluate(`(${MIRAR})()`);

            if (ROTO) {
                assert.equal(m.nota, null, `${ancho}x${alto}: antes no había botón de nota`);
                assert.notEqual(
                    Math.round(m.copiloto.centro),
                    Math.round(m.medio),
                    `${ancho}x${alto}: antes el copiloto NO caía en el centro`,
                );
                t.diagnostic(
                    `${ancho}x${alto}: copiloto en ${m.copiloto.centro}, centro en ${m.medio} (${m.copiloto.centro - m.medio} px)`,
                );
                await pagina.close();
                continue;
            }

            assert.ok(m.nota && m.copiloto && m.equipo, `${ancho}x${alto}: faltan botones`);
            assert.ok(
                Math.abs(m.copiloto.centro - m.medio) < 0.5,
                `${ancho}x${alto}: el eje en ${m.copiloto.centro}, el centro en ${m.medio}`,
            );
            assert.equal(
                Math.round(m.medio - m.nota.centro),
                Math.round(m.equipo.centro - m.medio),
                `${ancho}x${alto}: la nota y el equipo, a la misma distancia`,
            );
            // Y encadenado con la cuenta pura: la pantalla tiene que dar lo que
            // dice el módulo, no algo parecido.
            const esperado = geometria.elCentroDeCadaBoton();
            for (const cual of ["nota", "copiloto", "equipo"]) {
                assert.ok(
                    Math.abs(m[cual].centro - m.medio - esperado[cual]) < 0.5,
                    `${ancho}x${alto}: ${cual} cae en ${m[cual].centro - m.medio}, se esperaba ${esperado[cual]}`,
                );
            }
            await pagina.close();
        }
    });
});

test("los tres miden lo mismo, van pegados al borde y en su orden", { skip: !hayNavegador || ROTO }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const pagina = await abrirEn(navegador, puerto, ancho, alto);
            const m = await pagina.evaluate(`(${MIRAR})()`);
            for (const cual of ["nota", "copiloto", "equipo"]) {
                assert.equal(m[cual].alto, geometria.LADO_DEL_BOTON, `${cual} de alto`);
                assert.equal(m[cual].ancho, geometria.LADO_DEL_BOTON, `${cual} de ancho`);
                assert.equal(m[cual].derecha, m.ancho, `${cual} pegado al borde derecho`);
            }
            assert.ok(m.nota.top < m.copiloto.top, "la nota, arriba");
            assert.ok(m.copiloto.top < m.equipo.top, "el equipo, abajo");
            assert.equal(
                Math.round(m.copiloto.top - (m.nota.top + m.nota.alto)),
                geometria.HUECO_ENTRE_BOTONES,
                "el hueco declarado es el que hay",
            );
            assert.equal(m.desborda, false, `${ancho}x${alto}: no desborda a lo ancho`);
            await pagina.close();
        }
    });
});

test("abrir el copiloto cierra la nota: nunca dos paneles a la vez", { skip: !hayNavegador || ROTO }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        const pagina = await abrirEn(navegador, puerto, 1280, 800);

        await pagina.click('[data-boton-del-borde="nota"]');
        await pagina.waitForTimeout(250);
        let m = await pagina.evaluate(`(${MIRAR})()`);
        assert.equal(m.abierta.nota, "true", "la nota se abrió");
        const hoja = await pagina.$('[data-panel="panel-nota-rapida"]');
        assert.ok(hoja, "y su hoja está en el DOM");
        assert.ok(
            await pagina.$eval('[data-panel="panel-nota-rapida"]', (n) => !n.className.includes("translate-x-full")),
            "puesta, no desplazada fuera",
        );
        assert.ok(await pagina.$("[data-caja-de-la-nota]"), "con su papel dentro");

        await pagina.click('[data-boton-del-borde="copiloto"]');
        await pagina.waitForTimeout(250);
        m = await pagina.evaluate(`(${MIRAR})()`);
        assert.equal(m.abierta.nota, "false", "abrir el copiloto cerró la nota");
        assert.equal(m.abierta.copiloto, "true");
        await pagina.close();
    });
});

test("la nota se guarda SOLA: al parar de teclear y al cerrar", { skip: !hayNavegador || ROTO }, async (t) => {
    await conLaPantalla(async (navegador, puerto) => {
        const pagina = await abrirEn(navegador, puerto, 1280, 800);
        const loPedido = () => pagina.evaluate("window.__nota ?? []");

        await pagina.click('[data-boton-del-borde="nota"]');
        await pagina.waitForSelector("[data-caja-de-la-nota]");
        assert.deepEqual(
            (await loPedido()).map((l) => l.que),
            ["leer"],
            "abrir el panel lee la nota, y nada más",
        );

        // 1. Se teclea y se para: UNA escritura, con lo que hay.
        await pagina.fill("[data-caja-de-la-nota]", "llamar a Marta");
        await pagina.waitForTimeout(reglas.MS_ANTES_DE_GUARDAR + 500);
        let pedido = await loPedido();
        const guardados = pedido.filter((l) => l.que === "guardar");
        assert.equal(guardados.length, 1, `una escritura por pausa, no por tecla (${guardados.length})`);
        assert.equal(guardados[0].texto, "llamar a Marta");

        // 2. Sin cambios no se vuelve a escribir.
        await pagina.waitForTimeout(reglas.MS_ANTES_DE_GUARDAR + 300);
        assert.equal(
            (await loPedido()).filter((l) => l.que === "guardar").length,
            1,
            "sin cambios no se escribe",
        );

        // 3. Se teclea y se CIERRA dentro del reloj: se vuelca igual.
        await pagina.fill("[data-caja-de-la-nota]", "llamar a Marta el martes");
        await pagina.click('[data-boton-del-borde="nota"]');
        await pagina.waitForTimeout(700);
        pedido = await loPedido();
        const ultimo = pedido.filter((l) => l.que === "guardar").at(-1);
        assert.equal(
            ultimo.texto,
            "llamar a Marta el martes",
            "cerrar el panel vuelca lo último, sin esperar al reloj",
        );

        // 4. Y al reabrir sigue ahí: persiste entre aperturas.
        await pagina.click('[data-boton-del-borde="nota"]');
        await pagina.waitForSelector("[data-caja-de-la-nota]");
        await pagina.waitForTimeout(300);
        assert.equal(
            await pagina.$eval("[data-caja-de-la-nota]", (n) => n.value),
            "llamar a Marta el martes",
        );
        t.diagnostic(`peticiones en toda la vuelta: ${(await loPedido()).length}`);
        await pagina.close();
    });
});

test("enviar a Notas manda lo apuntado y vacía el papel", { skip: !hayNavegador || ROTO }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        const pagina = await abrirEn(navegador, puerto, 1280, 800);
        await pagina.click('[data-boton-del-borde="nota"]');
        await pagina.waitForSelector("[data-caja-de-la-nota]");

        // Con el papel en blanco el botón está APAGADO, no escondido: su sitio
        // no puede bailar según lo que haya escrito.
        assert.ok(await pagina.$("[data-mandar-a-notas]"), "el botón sale siempre");
        assert.equal(await pagina.$eval("[data-mandar-a-notas]", (b) => b.disabled), true);

        await pagina.fill("[data-caja-de-la-nota]", "Cotización de Horeca\ndos líneas de detalle");
        await pagina.waitForTimeout(200);
        assert.equal(await pagina.$eval("[data-mandar-a-notas]", (b) => b.disabled), false);

        await pagina.click("[data-mandar-a-notas]");
        await pagina.waitForTimeout(600);
        const mandado = (await pagina.evaluate("window.__nota ?? []")).filter((l) => l.que === "mandar");
        assert.equal(mandado.length, 1);
        assert.equal(mandado[0].texto, "Cotización de Horeca\ndos líneas de detalle");
        assert.equal(
            await pagina.$eval("[data-caja-de-la-nota]", (n) => n.value),
            "",
            "el papel se vació: lo apuntado ya vive en Notas",
        );
        await pagina.close();
    });
});
