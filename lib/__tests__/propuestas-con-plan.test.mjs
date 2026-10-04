/**
 * PROPUESTAS QUE LLEVAN UN PLAN del panel de Planes.
 *
 * 1. **La regla** (pura): la fila de servicio que sale de un plan (nombre,
 *    alcance con su capacidad y su «Qué incluye», y el precio en la moneda de
 *    la propuesta), el texto y el rótulo del enlace, y qué planes se pintan.
 * 2. **Las acciones contra Postgres**: una plantilla enlazada a un plan lo carga
 *    EN VIVO —precio, créditos, catálogo, asistencia, «Qué incluye», video y el
 *    enlace a su página pública—; editar el plan en el panel se ve en la
 *    siguiente propuesta y NO en la que ya se hizo; un plan apagado no lleva
 *    enlace; y solo la casa enlaza plantillas y pone planes.
 * 3. **La página pública de la propuesta**, pintada con el componente de
 *    verdad: el plan COMPLETO (video, capacidad, «Qué incluye», precio y el
 *    botón de comenzar) dentro del servicio que se llama como él, y suelto al
 *    final si ninguno se llama así. Ningún enlace a la página del plan: lo
 *    único que abre otra pestaña es el botón de comenzar.
 *
 * `MODO=roto` lee el código de `ANTES_REF` (0764700) y AFIRMA que no existía
 * nada de esto: ni el módulo del plan, ni la acción que lo carga, ni la sección
 * del plan en la página pública.
 *
 * Se levanta con `scripts/banco-propuestas-con-plan.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "propuestas-con-plan");
const ANTES_REF = process.env.ANTES_REF ?? "0764700";
const PUBLICA = "components/propuestas/PropuestaPublica.tsx";
const FORM = "app/(root)/(protected)/panel/propuestas/_components/FormularioDePropuesta.tsx";

const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");

if (ROTO) {
    test("ANTES: no existía el módulo que lee un plan del panel para una propuesta", () => {
        assert.ok(deAntes("lib/propuestas.ts"), "no se pudo leer ANTES_REF");
        assert.equal(deAntes("lib/plan-de-la-propuesta.ts"), null);
        assert.equal(deAntes("lib/plan-de-la-propuesta.server.ts"), null);
    });
    test("ANTES: una plantilla no se enlazaba a un plan ni se cargaba en vivo", () => {
        const acc = deAntes("actions/propuestas-actions.ts");
        assert.ok(acc, "no se pudo leer las acciones de ANTES_REF");
        assert.equal(acc.includes("cargarPlanEnLaPropuestaAction"), false);
        assert.equal(deAntes("lib/plantillas-de-planes.ts").includes("RefDePlan"), false);
        assert.equal(deAntes(FORM).includes("cargarPlanEnLaPropuestaAction"), false);
    });
    test("ANTES: la página pública de la propuesta no llevaba el video ni el enlace del plan", () => {
        const pub = deAntes(PUBLICA);
        assert.ok(pub, "no se pudo leer la página pública de ANTES_REF");
        assert.equal(pub.includes("data-planes-de-la-propuesta"), false);
        assert.equal(pub.includes("data-enlace-del-plan"), false);
        assert.equal(deAntes("lib/propuestas-db.ts").includes('"planes"'), false);
    });
} else {
    const r = await import(join(COMPILADO, "plan-de-la-propuesta.js"));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    const PLAN = {
        ref: { nivel: "basico", asistencia: "IA" },
        nombre: "Básico",
        activo: true,
        precios: { COP: 150000, USD: 40 },
        capacidad: [
            { titulo: "Créditos de IA", valor: "8.000" },
            { titulo: "Asistencia", valor: "IA 24/7" },
        ],
        funciones: ["CRM y embudos", "Agenda de citas"],
        video: true,
        enlace: "https://app.test/planes/nivel-2?tipo=IA",
    };

    test("la fila que sale de un plan: nombre, alcance con capacidad y «Qué incluye», y su precio", () => {
        const f = r.laFilaDelPlan(PLAN, "COP", 4000);
        assert.equal(f.nombre, "Básico");
        assert.equal(f.inversion, "150000");
        assert.equal(
            f.alcance,
            "Créditos de IA: 8.000\nAsistencia: IA 24/7\n\nQué incluye este plan:\n• CRM y embudos\n• Agenda de citas",
        );
        assert.equal(r.laFilaDelPlan(PLAN, "USD", 4000).inversion, "40");
    });

    test("sin precio en esa moneda la inversión va vacía, nunca un cero inventado", () => {
        assert.equal(r.laFilaDelPlan(PLAN, "EUR", 4000).inversion, "");
        assert.equal(r.laFilaDelPlan({ ...PLAN, precios: { COP: null, USD: 40 } }, "COP", 4000).inversion, "");
    });

    test("lo que no cabe en el alcance se dice («…y N más») y no se corta a media palabra", () => {
        const muchas = Array.from({ length: 40 }, (_, i) => `Función número ${i + 1} con un nombre largo`);
        const a = r.elAlcanceDelPlan({ capacidad: PLAN.capacidad, funciones: muchas }, 300);
        assert.ok(a.length <= 300, `mide ${a.length}`);
        assert.match(a, /…y \d+ más$/);
        for (const linea of a.split("\n").filter((l) => l.startsWith("• "))) {
            assert.ok(muchas.includes(linea.slice(2)), `línea cortada: ${linea}`);
        }
    });

    test("el enlace se lee sin https, sin la consulta y sin la barra; y lleva su rótulo", () => {
        assert.equal(r.elTextoDelEnlace("https://app.test/planes/nivel-2?tipo=IA"), "app.test/planes/nivel-2");
        assert.equal(r.elTextoDelEnlace("http://app.test/planes/nivel-2/"), "app.test/planes/nivel-2");
        assert.equal(r.elRotuloDelEnlaceDelPlan(" Básico "), "Ver todo lo que incluye el plan Básico");
    });

    test("un plan sin video ni enlace no deja un recuadro vacío", () => {
        const lista = [
            { llave: "a", nombre: "A", video: null, enlace: null },
            { llave: "b", nombre: "B", video: null, enlace: "https://x.test/planes/nivel-1" },
        ];
        assert.deepEqual(r.losPlanesQueSeEnsenan(lista).map((p) => p.llave), ["b"]);
    });

    test("la lista de planes de una propuesta: sin repetidos, sin lo que no es un plan", () => {
        const refs = r.comoListaDeRefs([
            { nivel: "basico", asistencia: "IA" },
            { nivel: "basico", asistencia: "IA" },
            { nivel: "nivel-3", asistencia: "HUMANO" },
            { nivel: "no-existe", asistencia: "IA" },
            "basura",
        ]);
        assert.deepEqual(refs, [
            { nivel: "basico", asistencia: "IA" },
            { nivel: "intermedio", asistencia: "HUMANO" },
        ]);
        assert.deepEqual(r.comoListaDeRefs("[malo"), []);
        const con = r.conElPlan(refs, { nivel: "basico", asistencia: "IA" });
        assert.equal(con.length, 2);
        assert.deepEqual(r.sinElPlan(con, { nivel: "basico", asistencia: "IA" }), [{ nivel: "intermedio", asistencia: "HUMANO" }]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    const hayBase = Boolean(process.env.DATABASE_URL);
    const conBase = hayBase ? test : test.skip;
    const m = hayBase ? await import(join(COMPILADO, "entrada-de-propuestas-con-plan.js")) : null;
    const pub = hayBase ? await import(join(COMPILADO, "entrada-de-la-propuesta-publica.js")) : null;

    const SELLO = Date.now().toString(36);
    const CASA = `casa-${SELLO}`;
    const CLI = `cli-${SELLO}`;
    const PERSONA_CASA = { id: CASA, sessionUserId: CASA, role: "admin", ownerId: null, name: "La casa" };
    const PERSONA_CLI = { id: CLI, sessionUserId: CLI, role: "user", ownerId: null, name: "Un cliente" };
    const REF = { nivel: "basico", asistencia: "IA" };
    const ENLACE = "https://app.test/planes/nivel-2?tipo=IA";
    const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const elPlan = async (plan, assistanceType, datos) =>
        m.db.subscriptionPlan.upsert({
            where: { plan_assistanceType_isResellerPlan: { plan, assistanceType, isResellerPlan: false } },
            update: datos,
            create: { plan, assistanceType, isResellerPlan: false, ...datos },
        });

    const BASICO = {
        name: "Básico",
        priceCop: 150000,
        priceUSD: 40,
        credits: 8000,
        features: ["CRM y embudos", "Agenda de citas"],
        isActive: true,
    };

    const unaPropuesta = (servicios, planes) => ({ cliente: "Clínica Sonrisa", fecha: "2026-09-29", moneda: "COP", servicios, planes });

    let plantillaId = null;
    let token = null;

    conBase("siembra: las dos cuentas y los planes del panel", async () => {
        for (const [id, extra] of [
            [CASA, { role: "admin" }],
            [CLI, { role: "user" }],
        ]) {
            await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ...extra } });
        }
        const basico = await elPlan("basico", "IA", BASICO);
        await elPlan("basico", "HUMANO", { ...BASICO, priceCop: 250000, priceUSD: 70 });
        await elPlan("intermedio", "IA", { ...BASICO, name: "Intermedio", credits: 12000, isActive: false });
        await m.db.planDetail.upsert({
            where: { subscriptionPlanId: basico.id },
            update: { videoUrl: VIDEO, videoTitle: "Así funciona", videoThumbnailUrl: null },
            create: { subscriptionPlanId: basico.id, videoUrl: VIDEO, videoTitle: "Así funciona" },
        });
    });

    conBase("la casa ve los planes del panel para enlazar, y enlaza una plantilla", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        const lista = await m.listarPropuestasAction();
        assert.equal(lista.success, true, lista.message);
        const llaves = lista.data.planes.map((p) => `${p.ref.nivel}:${p.ref.asistencia}`);
        assert.ok(llaves.includes("basico:IA"));
        assert.ok(llaves.includes("intermedio:IA"), "los apagados también se ofrecen, marcados");
        assert.equal(lista.data.planes.find((p) => p.ref.nivel === "intermedio").activo, false);

        const creada = await m.crearPlantillaAction({ plan: REF, moneda: "COP" });
        assert.equal(creada.success, true, creada.message);
        assert.deepEqual(creada.data.plan, REF);
        // Lo guardado es una foto para ordenar la lista, sacada del plan HOY.
        assert.equal(creada.data.nombre, "Básico");
        assert.equal(creada.data.precio, 150000);
        assert.deepEqual(creada.data.caracteristicas, []);
        plantillaId = creada.data.id;
    });

    conBase("al cargarla trae el plan EN VIVO: precio, créditos, capacidad, «Qué incluye», video y enlace", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        const c = await m.cargarPlanEnLaPropuestaAction(plantillaId);
        assert.equal(c.success, true, c.message);
        const { plan, avisos } = c.data;
        assert.deepEqual(avisos, []);
        assert.equal(plan.nombre, "Básico");
        assert.equal(plan.precios.COP, 150000);
        assert.equal(plan.precios.USD, 40);
        assert.ok(plan.capacidad.some((x) => /8[.,]?000/.test(x.valor)), JSON.stringify(plan.capacidad));
        assert.ok(plan.capacidad.length >= 2, "créditos y asistencia como mínimo");
        assert.deepEqual(plan.funciones, ["CRM y embudos", "Agenda de citas"]);
        assert.equal(plan.video, true);
        assert.equal(plan.enlace, ENLACE);

        const fila = m.laFilaDelPlan(plan, "COP", m.TOPE_DE_ALCANCE);
        assert.equal(fila.inversion, "150000");
        assert.match(fila.alcance, /Qué incluye este plan:\n• CRM y embudos\n• Agenda de citas/);
        assert.match(fila.alcance, /8[.,]?000/);
    });

    conBase("la propuesta se crea con la fila del plan y la referencia al plan", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        const c = await m.cargarPlanEnLaPropuestaAction(plantillaId);
        const fila = m.laFilaDelPlan(c.data.plan, "COP", m.TOPE_DE_ALCANCE);
        const { filas, cabe } = m.conLaFilaCargada([{ nombre: "", alcance: "", inversion: "" }], fila, 30);
        assert.equal(cabe, true);
        assert.equal(filas.length, 1, "la fila en blanco se sustituye");
        const p = await m.crearPropuestaAction(unaPropuesta(filas, [REF]));
        assert.equal(p.success, true, p.message);
        assert.deepEqual(p.data.planes, [REF]);
        assert.equal(p.data.servicios[0].nombre, "Básico");
        assert.equal(p.data.servicios[0].inversion, 150000);
        token = p.data.token;
    });

    conBase("la página pública lleva el plan COMPLETO dentro de su servicio, sin salir de la propuesta", async () => {
        const prop = await m.laPropuestaPublica(token);
        assert.ok(prop, "la propuesta pública no se encontró");
        assert.deepEqual(prop.planes, [REF]);
        const planes = await m.losPlanesDeLaPropuesta(prop.planes, "https://app.test");
        assert.equal(planes.length, 1);
        assert.equal(planes[0].nombre, "Básico");
        assert.equal(planes[0].video?.tipo, "iframe");
        assert.match(planes[0].video.url, /youtube\.com\/embed\/dQw4w9WgXcQ/);
        assert.ok((planes[0].capacidad ?? []).length >= 2, JSON.stringify(planes[0].capacidad));
        assert.deepEqual(planes[0].funciones.map((f) => f.nombre), ["CRM y embudos", "Agenda de citas"]);
        assert.ok(planes[0].precio, "lleva su precio");

        const html = pub.pintarLaPropuesta(prop, planes);
        // El servicio se llama como el plan: el plan va DENTRO de su tarjeta.
        assert.ok(html.includes('data-servicio-con-plan="basico:IA"') || /data-servicio-con-plan="[^"]+"/.test(html), "el servicio no lleva su plan");
        assert.equal(html.includes("data-planes-de-la-propuesta"), false, "no queda suelto al final");
        assert.ok(html.includes("data-plan-en-la-propuesta"));
        assert.ok(html.includes('data-video="iframe"'));
        assert.ok(html.includes("data-capacidad-del-plan"));
        assert.ok(html.includes("data-que-incluye"));
        assert.ok(html.includes("data-precio-del-plan"));
        // Nada lleva a la página del plan: el cliente se queda en la propuesta.
        assert.equal(html.includes("data-enlace-del-plan"), false);
        assert.equal(html.includes(`href="${ENLACE}"`), false);
        assert.equal(html.includes("app.test/planes/"), false);
        // Lo único que abre otra pestaña es el botón de comenzar, con noopener.
        const fuera = html.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
        assert.equal(fuera.length, 1, fuera.join("\n"));
        assert.match(fuera[0], /data-boton-del-plan/);
        assert.match(fuera[0], /rel="noopener noreferrer"/);
        // Y sigue el tema del dispositivo.
        assert.ok(html.includes('data-tema-del-plan="dispositivo"'));
    });

    conBase("editar el plan en el panel se ve en la siguiente propuesta, y no en la que ya se hizo", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        await m.db.subscriptionPlan.updateMany({ where: { plan: "basico" }, data: { name: "Básico Plus" } });
        await m.db.subscriptionPlan.updateMany({
            where: { plan: "basico", assistanceType: "IA", isResellerPlan: false },
            data: { priceCop: 180000, credits: 12000, features: ["CRM y embudos", "Agenda de citas", "Reportes semanales"] },
        });

        const c = await m.cargarPlanEnLaPropuestaAction(plantillaId);
        assert.equal(c.success, true, c.message);
        assert.equal(c.data.plan.nombre, "Básico Plus");
        assert.equal(c.data.plan.precios.COP, 180000);
        assert.ok(c.data.plan.capacidad.some((x) => /12[.,]?000/.test(x.valor)), JSON.stringify(c.data.plan.capacidad));
        assert.deepEqual(c.data.plan.funciones, ["CRM y embudos", "Agenda de citas", "Reportes semanales"]);

        // La lista pinta la plantilla con lo vigente.
        const lista = await m.listarPropuestasAction();
        const pl = lista.data.plantillas.find((x) => x.id === plantillaId);
        assert.equal(pl.nombre, "Básico Plus");
        assert.equal(pl.precio, 180000);

        // La propuesta ya hecha conserva su copia.
        const vieja = lista.data.propuestas.find((x) => x.token === token);
        assert.equal(vieja.servicios[0].nombre, "Básico");
        assert.equal(vieja.servicios[0].inversion, 150000);
        assert.doesNotMatch(vieja.servicios[0].alcance, /Reportes semanales/);

        // Y una NUEVA lleva lo de hoy.
        const fila = m.laFilaDelPlan(c.data.plan, "COP", m.TOPE_DE_ALCANCE);
        const nueva = await m.crearPropuestaAction(unaPropuesta([fila], [REF]));
        assert.equal(nueva.success, true, nueva.message);
        assert.equal(nueva.data.servicios[0].nombre, "Básico Plus");
        assert.equal(nueva.data.servicios[0].inversion, 180000);
        assert.match(nueva.data.servicios[0].alcance, /Reportes semanales/);

        // La página pública de la propuesta vieja ya nombra el plan como está hoy.
        const planes = await m.losPlanesDeLaPropuesta([REF], "https://app.test");
        assert.equal(planes[0].nombre, "Básico Plus");
    });

    conBase("un plan apagado se dice al cargarlo y sale sin enlace (el video sigue)", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        await m.db.subscriptionPlan.updateMany({ where: { plan: "basico", assistanceType: "IA", isResellerPlan: false }, data: { isActive: false } });
        try {
            const c = await m.cargarPlanEnLaPropuestaAction(plantillaId);
            assert.equal(c.success, true, c.message);
            assert.equal(c.data.plan.enlace, null);
            assert.equal(c.data.avisos.length, 1);
            assert.match(c.data.avisos[0], /está apagado en el panel de Planes/);

            const prop = await m.laPropuestaPublica(token);
            const planes = await m.losPlanesDeLaPropuesta(prop.planes, "https://app.test");
            assert.equal(planes[0].enlace, null);
            assert.ok(planes[0].video, "el video sigue");
            const html = pub.pintarLaPropuesta(prop, planes);
            assert.equal(html.includes("data-enlace-del-plan"), false);
            assert.ok(html.includes("data-video="));
            // Su servicio se llama «Básico» y el plan ya es «Básico Plus»: no
            // empareja, así que sale en su sección al final, entero igual.
            assert.ok(html.includes("data-planes-de-la-propuesta"));
            assert.ok(html.indexOf("data-planes-de-la-propuesta") > html.indexOf("data-servicio"));
            assert.equal(html.includes("data-boton-del-plan"), false, "apagado no se ofrece comenzar");
        } finally {
            await m.db.subscriptionPlan.updateMany({ where: { plan: "basico", assistanceType: "IA", isResellerPlan: false }, data: { isActive: true } });
        }
    });

    conBase("quien no es de la casa no ve los planes, no enlaza, no carga y no pone planes", async () => {
        m.ponerAQuienMira(PERSONA_CLI);
        const lista = await m.listarPropuestasAction();
        assert.equal(lista.success, true, lista.message);
        assert.deepEqual(lista.data.planes, []);

        const enlazada = await m.crearPlantillaAction({ plan: REF, moneda: "COP" });
        assert.equal(enlazada.success, false);
        assert.match(enlazada.message, /Solo quien administra la plataforma/);

        // Una plantilla de otra cuenta no existe para el cliente.
        const carga = await m.cargarPlanEnLaPropuestaAction(plantillaId);
        assert.equal(carga.success, false);
        assert.equal(carga.message, "Plantilla no encontrada.");

        const p = await m.crearPropuestaAction(unaPropuesta([{ nombre: "Consultoría", alcance: "", inversion: "100000" }], [REF]));
        assert.equal(p.success, true, p.message);
        assert.deepEqual(p.data.planes, [], "los planes que mande se descartan");

        // Una plantilla a mano sigue funcionando como siempre.
        const mano = await m.crearPlantillaAction({ nombre: "Mi plan", precio: "90000", moneda: "COP", caracteristicas: "Uno\nDos" });
        assert.equal(mano.success, true, mano.message);
        assert.equal(mano.data.plan, null);
        assert.deepEqual(mano.data.caracteristicas, ["Uno", "Dos"]);
    });

    conBase("una plantilla a mano no se carga como plan", async () => {
        m.ponerAQuienMira(PERSONA_CASA);
        const mano = await m.crearPlantillaAction({ nombre: "Paquete propio", precio: "50000", moneda: "COP", caracteristicas: "A" });
        assert.equal(mano.success, true, mano.message);
        const c = await m.cargarPlanEnLaPropuestaAction(mano.data.id);
        assert.equal(c.success, false);
        assert.match(c.message, /no está enlazada a un plan/);
    });

    test("el formulario carga el plan por la acción y manda la referencia", () => {
        const form = crudo(FORM);
        assert.ok(form.includes("cargarPlanEnLaPropuestaAction"));
        assert.ok(form.includes("laFilaDelPlan"));
        assert.ok(crudo(PUBLICA).includes("PlanEnLaPropuesta"));
        assert.ok(crudo("components/propuestas/PlanEnLaPropuesta.tsx").includes("VideoDelPlan"));
    });
}
