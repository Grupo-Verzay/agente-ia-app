// Banco de la plantilla maestra de funciones (scripts/banco-plantilla-de-funciones.sh).
// La semilla son los 24 planes de producción sin precios ni enlaces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plantilla-de-funciones");
const ANTES_REF = process.env.ANTES_REF || "94fcc3c";
const crudo = (f) => readFileSync(join(RAIZ, f), "utf8");
function deAntes(f) {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { cwd: RAIZ, encoding: "utf8" });
    } catch {
        return null;
    }
}
const hayBase = Boolean(process.env.DATABASE_URL);
const conBase = hayBase ? test : test.skip;
const puro = ROTO ? test.skip : test;
const bueno = ROTO ? test.skip : conBase;
const roto = ROTO ? conBase : test.skip;

const FIX = JSON.parse(crudo("lib/__tests__/planes-de-produccion.json"));
const P = await import(join(COMPILADO, "puro", "plantilla-de-funciones.js"));
const G = await import(join(COMPILADO, "puro", "pagina-de-plan.js"));
const llave = G.laLlaveDelNombre;
const guardadaDe = new Map(FIX.guardadas.map((g) => [g.subscriptionPlanId, g.funciones]));
const filasDe = (aud) =>
    FIX.planes
        .filter((p) => P.laAudienciaDelPlan(p) === aud)
        .map((p) => ({ ...p, guardadas: guardadaDe.get(p.id) }));
const antesDe = (f) => G.lasFuncionesDelPlan(f.features, f.guardadas);
const encendidas = (lista) => lista.filter((f) => f.activa).map((f) => f.nombre);
const TAMANO = { cliente: 68, reseller: 33 };

/* ─── Las reglas, sin base ─────────────────────────────────────────────── */

puro("una plantilla por audiencia con el inventario completo, sin repetir ninguna", () => {
    for (const aud of P.AUDIENCIAS) {
        const filas = filasDe(aud);
        const { plantilla } = P.completarLaPlantilla([], filas);
        const llaves = plantilla.map((f) => llave(f.nombre));
        assert.equal(new Set(llaves).size, llaves.length, `${aud}: hay una función repetida`);
        assert.equal(new Set(plantilla.map((f) => f.id)).size, plantilla.length, `${aud}: hay un id repetido`);
        for (const f of filas) {
            for (const n of [...f.features, ...antesDe(f).map((x) => x.nombre)]) {
                assert.ok(llaves.includes(llave(n)), `${aud}: «${n}» de ${f.id} no está en la plantilla`);
            }
        }
        assert.equal(plantilla.length, TAMANO[aud], `${aud}: el inventario no mide lo esperado`);
    }
});

puro("cada plan queda como estaba, y lo que no tenía entra apagado y sin destacar", () => {
    for (const aud of P.AUDIENCIAS) {
        const filas = filasDe(aud);
        const { plantilla } = P.completarLaPlantilla([], filas);
        for (const f of filas) {
            const antes = antesDe(f);
            const ahora = P.laListaDelPlan(f, plantilla);
            assert.equal(ahora.length, plantilla.length, `${f.id}: no ve el inventario completo`);
            const tenia = new Set(antes.map((x) => llave(x.nombre)));
            for (const x of ahora) {
                if (!tenia.has(llave(x.nombre))) {
                    assert.equal(x.activa, false, `${f.id}: «${x.nombre}» entró encendida`);
                    assert.equal(x.destacada, false, `${f.id}: «${x.nombre}» entró destacada`);
                }
            }
            if (f.isActive) {
                assert.deepEqual(G.losFeaturesDeLasFunciones(ahora), f.features, `${f.id}: cambiaron sus encendidas`);
                assert.deepEqual(G.lasFuncionesDestacadas(ahora), G.lasFuncionesDestacadas(antes), `${f.id}: cambiaron sus destacadas`);
                const porNombre = new Map(antes.map((x) => [x.nombre, x]));
                for (const x of ahora.filter((y) => y.activa)) {
                    const a = porNombre.get(x.nombre);
                    assert.ok(a, `${f.id}: «${x.nombre}» no estaba`);
                    for (const c of ["categoria", "descripcion", "tutorial"]) {
                        assert.deepEqual(x[c], a[c], `${f.id}: «${x.nombre}» cambió su ${c}`);
                    }
                }
            } else {
                assert.deepEqual(encendidas(ahora).map(llave), encendidas(antes).map(llave), `${f.id}: cambiaron sus encendidas`);
            }
        }
    }
});

puro("guardar la plantilla: renombrar conserva el id, lo nuevo se rehace, y no admite repetidos ni vacíos", () => {
    const { plantilla } = P.completarLaPlantilla([], filasDe("cliente"));
    const editada = plantilla.map((f) => ({ ...f }));
    editada[0].nombre = "Función renombrada en el banco";
    editada.push({ ...plantilla[1], id: plantilla[2].id + "-otra", nombre: "Función nueva del banco" });
    const r = P.laPlantillaQueSeGuarda(editada, plantilla);
    assert.ok(r.ok, r.motivo);
    assert.equal(r.plantilla[0].id, plantilla[0].id);
    const nueva = r.plantilla.find((f) => f.nombre === "Función nueva del banco");
    assert.ok(!plantilla.some((f) => f.id === nueva.id), "una función nueva se hizo pasar por otra");
    assert.match(P.laPlantillaQueSeGuarda("x", plantilla).motivo, /no es válida/);
    assert.match(P.laPlantillaQueSeGuarda([...plantilla, { ...plantilla[0], id: "z" }], plantilla).motivo, /Ya existe/);
    assert.match(P.laPlantillaQueSeGuarda([{ ...plantilla[0], nombre: "  " }], plantilla).motivo, /sin nombre/);
    const larga = Array.from({ length: P.TOPE_DE_LA_PLANTILLA + 1 }, (_, i) => ({ ...plantilla[0], id: `x${i}`, nombre: `F ${i}` }));
    assert.match(P.laPlantillaQueSeGuarda(larga, plantilla).motivo, /admite hasta/);
});

puro("la plantilla nueva llega al plan: renombrar conserva su estado, borrar la quita, lo nuevo entra apagado", () => {
    const filas = filasDe("cliente");
    const { plantilla } = P.completarLaPlantilla([], filas);
    const f = filas.find((x) => x.id === "fx-c-basico-humano");
    const antes = P.laListaDelPlan(f, plantilla);
    const fila = { ...f, features: G.losFeaturesDeLasFunciones(antes), guardadas: antes };
    const [e, d] = antes.filter((x) => x.activa);
    const nueva = plantilla
        .filter((x) => x.id !== d.id)
        .map((x) => (x.id === e.id ? { ...x, nombre: "Renombrada por la plantilla" } : x));
    nueva.push({ ...plantilla[0], id: "f-banco-nueva", nombre: "Agregada en la plantilla" });
    const ahora = P.laListaConLaPlantillaNueva(fila, plantilla, nueva);
    assert.equal(ahora.length, nueva.length);
    const r = ahora.find((x) => x.id === e.id);
    assert.equal(r.nombre, "Renombrada por la plantilla");
    assert.equal(r.activa, true);
    assert.equal(r.destacada, e.destacada);
    assert.ok(!ahora.some((x) => x.id === d.id), "la borrada sigue en el plan");
    const n = ahora.find((x) => x.id === "f-banco-nueva");
    assert.equal(n.activa, false);
    assert.equal(n.destacada, false);
});

puro("una función escrita en un plan entra en la plantilla, encendida ahí y apagada en los demás", () => {
    const filas = filasDe("cliente");
    const { plantilla } = P.completarLaPlantilla([], filas);
    const f = filas.find((x) => x.id === "fx-c-basico-humano");
    const enviada = [...P.laListaDelPlan(f, plantilla), { ...plantilla[0], id: "x-nueva", nombre: "Escrita en el plan", activa: true, destacada: true }];
    const { nuevas, estados } = P.laListaQueManda(plantilla, enviada);
    assert.equal(nuevas.length, 1);
    const nueva = [...plantilla, ...nuevas];
    const suya = P.conLaPlantilla(estados, nueva).find((x) => x.nombre === "Escrita en el plan");
    assert.deepEqual([suya.activa, suya.destacada], [true, true]);
    for (const otra of filas.filter((x) => x.id !== f.id)) {
        const ajena = P.laListaDelPlan(otra, nueva).find((x) => x.nombre === "Escrita en el plan");
        assert.deepEqual([ajena.activa, ajena.destacada], [false, false], otra.id);
    }
});

puro("el editor abierto se pone al día sin perder lo que se estaba escribiendo", () => {
    const filas = filasDe("cliente");
    const { plantilla } = P.completarLaPlantilla([], filas);
    const f = filas.find((x) => x.id === "fx-c-basico-humano");
    const lista = [...P.enElOrdenDeLaPlantilla(P.laListaDelPlan(f, plantilla), plantilla),
        { ...plantilla[0], id: "en-el-editor", nombre: "Escribiéndose", activa: true, destacada: false }];
    const e = lista.find((x) => x.activa);
    const nueva = plantilla.map((x) => (x.id === e.id ? { ...x, nombre: "Renombrada mientras" } : x));
    const r = P.elEditorConLaPlantillaNueva(lista, plantilla, nueva);
    assert.equal(r.find((x) => x.id === e.id).nombre, "Renombrada mientras");
    assert.equal(r.find((x) => x.id === e.id).activa, true);
    assert.ok(r.some((x) => x.id === "en-el-editor" && x.activa), "se perdió lo que se estaba escribiendo");
});

puro("barrido: Planes abre la plantilla, la guarda y el plan manda su versión", () => {
    const pm = crudo("app/(root)/(protected)/admin/planes/_components/PlanesMain.tsx");
    for (const s of ["guardarLaPlantillaDeFunciones", "PlantillaDeFuncionesDialog", "data-abrir-plantilla-de-funciones",
        "elEditorConLaPlantillaNueva", "versionDeLaPlantilla"]) {
        assert.ok(pm.includes(s), `PlanesMain no usa ${s}`);
    }
    const ac = crudo("actions/subscription-plan-actions.ts");
    assert.ok(ac.includes("sincronizarLaAudiencia"), "las acciones no pasan por la plantilla");
    assert.ok(!/["']use server["']/.test(crudo("lib/plantilla-de-funciones-db.ts")), "la sincronización no puede ser un endpoint");
});

/* ─── Las acciones, contra Postgres ───────────────────────────────────── */

const sello = Date.now().toString(36);
const persona = (id, role) => ({
    id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role, rolDeLaPersona: role,
    porImpersonacion: false, email: `${id}@banco.test`, name: id,
});
const CASA = persona(`pf-casa-${sello}`, "admin");
const CLIENTE = persona(`pf-cliente-${sello}`, "user");
const m = hayBase ? await import(join(COMPILADO, "entrada-de-plantilla-de-funciones.js")) : null;

async function sembrar() {
    const { db } = m;
    await db.$executeRawUnsafe(`DELETE FROM "plan_funciones_maestras"`).catch(() => {});
    await db.planDetail.deleteMany({});
    await db.subscriptionPlan.deleteMany({});
    await m.lasFuncionesGuardadas(["x"]);
    await db.$executeRawUnsafe(`DELETE FROM "plan_funciones"`);
    for (const u of [CASA, CLIENTE]) await db.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role } });
    for (const p of FIX.planes) {
        await db.subscriptionPlan.create({ data: {
            id: p.id, plan: p.plan, assistanceType: p.assistanceType, isResellerPlan: p.isResellerPlan,
            isActive: p.isActive, order: p.order, priceUSD: 10, credits: 1000, features: p.features,
        } });
    }
    for (const g of FIX.guardadas) {
        await db.$executeRawUnsafe(
            `INSERT INTO "plan_funciones" ("subscriptionPlanId","funciones","actualizadoEn") VALUES ($1,$2::jsonb,NOW())`,
            g.subscriptionPlanId, JSON.stringify(g.funciones),
        );
    }
}
async function lasListas() {
    const planes = await m.db.subscriptionPlan.findMany({ orderBy: { id: "asc" } });
    const guardadas = await m.lasFuncionesGuardadas(planes.map((p) => p.id));
    return new Map(planes.map((p) => [p.id, { ...p, lista: G.lasFuncionesDelPlan(p.features, guardadas.get(p.id)) }]));
}
async function destacadasDeLaLanding() {
    const r = await m.getActiveSubscriptionPlans();
    return Object.fromEntries(r.data.map((p) => [p.id, p.destacadas]));
}
async function paginas() {
    const fuera = {};
    for (const [plan, tipo] of [["basico", "HUMANO"], ["avanzado", "HUMANO"], ["enterprise", "HUMANO"]]) {
        try {
            const p = await m.laPaginaDelPlan(plan, tipo);
            fuera[plan] = p ? p.funciones.map((f) => f.nombre) : null;
        } catch (e) {
            fuera[plan] = `ERROR ${e.message}`;
        }
    }
    return fuera;
}
const plantillaDe = async (aud) => {
    m.ponerAQuienMira(CASA);
    return (await m.getAllSubscriptionPlans()).plantillas[aud];
};

bueno("al abrir el panel nace la plantilla, y ningún plan cambia lo que enseña", async () => {
    await sembrar();
    const landing = await destacadasDeLaLanding();
    const pagina = await paginas();
    const antes = await lasListas();

    m.ponerAQuienMira(CLIENTE);
    const ajeno = await m.getAllSubscriptionPlans();
    assert.equal(ajeno.success, false);
    const filas = await m.db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "plan_funciones_maestras"`).catch(() => [{ n: 0 }]);
    assert.equal(filas[0].n, 0, "un cliente hizo nacer la plantilla");

    m.ponerAQuienMira(CASA);
    const r = await m.getAllSubscriptionPlans();
    assert.equal(r.success, true);
    assert.equal(r.plantillas.cliente.plantilla.length, TAMANO.cliente);
    assert.equal(r.plantillas.reseller.plantilla.length, TAMANO.reseller);
    const ahora = await lasListas();
    for (const [id, a] of antes) {
        const n = ahora.get(id);
        assert.deepEqual(n.features, a.features, `${id}: cambió features`);
        const aud = P.laAudienciaDelPlan(a);
        assert.equal(n.lista.length, r.plantillas[aud].plantilla.length, `${id}: no ve el inventario completo`);
        // Un plan apagado puede escribir una función con otras tildes que la
        // plantilla: su lista la nombra como la plantilla, sus features no se tocan.
        const llaves = (xs) => xs.map(G.laLlaveDelNombre);
        if (a.isActive) assert.deepEqual(encendidas(n.lista), a.features, `${id}: cambiaron sus encendidas`);
        else assert.deepEqual(llaves(encendidas(n.lista)), llaves(a.features), `${id}: cambiaron sus encendidas`);
        if (a.isActive) assert.deepEqual(G.lasFuncionesDestacadas(n.lista), G.lasFuncionesDestacadas(a.lista), `${id}: cambiaron sus destacadas`);
    }
    assert.deepEqual(await destacadasDeLaLanding(), landing, "la tarjeta de la landing cambió");
    assert.deepEqual(await paginas(), pagina, "la página de un plan cambió");

    const otra = await m.getAllSubscriptionPlans();
    assert.equal(otra.plantillas.cliente.version, r.plantillas.cliente.version, "abrir otra vez escribió una versión nueva");
});

bueno("lo que se edita en la plantilla llega a los doce planes de clientes y no a los de resellers", async () => {
    const actual = await plantillaDe("cliente");
    const antesReseller = await plantillaDe("reseller");
    const [uno, dos] = actual.plantilla;
    const editada = actual.plantilla
        .filter((f) => f.id !== dos.id)
        .map((f) => (f.id === uno.id ? { ...f, nombre: "Renombrada en la plantilla", descripcion: "Descrita en el banco" } : f));
    editada.push({ ...uno, id: "lo-que-diga-el-navegador", nombre: "Creada en la plantilla", descripcion: "" });

    m.ponerAQuienMira(CLIENTE);
    assert.match((await m.guardarLaPlantillaDeFunciones("cliente", editada, actual.version)).message, /No autorizado/);
    m.ponerAQuienMira(CASA);
    assert.match((await m.guardarLaPlantillaDeFunciones("nadie", editada, actual.version)).message, /no existe/);
    assert.match((await m.guardarLaPlantillaDeFunciones("cliente", [...editada, { ...editada[2], id: "z" }], actual.version)).message, /Ya existe/);

    const r = await m.guardarLaPlantillaDeFunciones("cliente", editada, actual.version);
    assert.equal(r.success, true, r.message);
    assert.equal(r.plantilla.version, actual.version + 1);
    const listas = await lasListas();
    const clientes = [...listas.values()].filter((p) => !p.isResellerPlan);
    assert.equal(clientes.length, 12);
    for (const p of clientes) {
        const nombres = p.lista.map((f) => f.nombre);
        assert.ok(nombres.includes("Renombrada en la plantilla"), `${p.id}: no le llegó el nombre nuevo`);
        assert.ok(!nombres.includes(dos.nombre), `${p.id}: la borrada sigue`);
        const creada = p.lista.find((f) => f.nombre === "Creada en la plantilla");
        assert.ok(creada, `${p.id}: no le llegó la creada`);
        assert.deepEqual([creada.activa, creada.destacada], [false, false], `${p.id}: la creada no entró apagada`);
        assert.equal(p.lista.find((f) => f.nombre === "Renombrada en la plantilla").descripcion, "Descrita en el banco");
    }
    assert.deepEqual((await plantillaDe("reseller")).plantilla, antesReseller.plantilla, "se tocó la plantilla de resellers");
    const vieja = await m.guardarLaPlantillaDeFunciones("cliente", editada, actual.version);
    assert.equal(vieja.message, m.LA_PLANTILLA_CAMBIO, "una versión vieja pisó la plantilla");
});

bueno("una función creada en un plan llega apagada a los demás, y una versión vieja no guarda nada", async () => {
    const actual = await plantillaDe("cliente");
    const listas = await lasListas();
    const basico = listas.get("fx-c-basico-humano");
    const funciones = [...basico.lista, { ...actual.plantilla[0], id: "nueva-del-plan", nombre: "Creada en el Básico", activa: true, destacada: true }];
    const base = { plan: "basico", assistanceType: "HUMANO", isResellerPlan: false, isActive: true, priceUSD: 10, credits: 1000, features: [] };

    const r = await m.upsertSubscriptionPlan({ ...base, funciones, versionDeLaPlantilla: actual.version });
    assert.equal(r.success, true, r.message);
    const despues = await lasListas();
    const suya = despues.get("fx-c-basico-humano").lista.find((f) => f.nombre === "Creada en el Básico");
    assert.deepEqual([suya.activa, suya.destacada], [true, true]);
    for (const p of [...despues.values()].filter((x) => !x.isResellerPlan && x.id !== "fx-c-basico-humano")) {
        const ajena = p.lista.find((f) => f.nombre === "Creada en el Básico");
        assert.ok(ajena, `${p.id}: no le llegó`);
        assert.deepEqual([ajena.activa, ajena.destacada], [false, false], `${p.id}: no entró apagada`);
    }
    assert.ok(!despues.get("fx-r-basico-ia").lista.some((f) => f.nombre === "Creada en el Básico"), "cruzó a los resellers");
    assert.equal((await plantillaDe("cliente")).version, actual.version + 1);

    const vieja = await m.upsertSubscriptionPlan({ ...base, credits: 2222, funciones, versionDeLaPlantilla: actual.version });
    assert.equal(vieja.message, m.LA_PLANTILLA_CAMBIO);
    const fila = await m.db.subscriptionPlan.findUnique({ where: { id: "fx-c-basico-humano" } });
    assert.equal(fila.credits, 1000, "una versión vieja guardó el plan");
});

bueno("el camino viejo (solo features) también pasa por la plantilla", async () => {
    const lite = (await lasListas()).get("fx-c-lite-ia");
    const r = await m.upsertSubscriptionPlan({
        plan: "lite", assistanceType: "IA", isResellerPlan: false, isActive: false, priceUSD: 10, credits: 1000,
        features: [...lite.features, "Función del camino viejo"],
    });
    assert.equal(r.success, true, r.message);
    const p = await plantillaDe("cliente");
    assert.ok(p.plantilla.some((f) => f.nombre === "Función del camino viejo"), "no entró en la plantilla");
    const otra = (await lasListas()).get("fx-c-enterprise-humano").lista.find((f) => f.nombre === "Función del camino viejo");
    assert.deepEqual([otra.activa, otra.destacada], [false, false]);
});

/* ─── El «antes»: no había plantilla ─────────────────────────────────── */

roto("ANTES: no había plantilla, y una función creada en un plan no llegaba a ningún otro", async () => {
    assert.equal(deAntes("lib/plantilla-de-funciones.ts"), null);
    assert.equal(deAntes("lib/plantilla-de-funciones-db.ts"), null);
    await sembrar();
    m.ponerAQuienMira(CASA);
    const r = await m.getAllSubscriptionPlans();
    assert.equal(r.success, true);
    assert.equal("plantillas" in r, false, "ya había plantilla");
    const basico = (await lasListas()).get("fx-c-basico-humano");
    const funciones = [...basico.lista, { ...basico.lista[0], id: "nueva-del-plan", nombre: "Creada en el Básico", activa: true, destacada: true }];
    const g = await m.upsertSubscriptionPlan({ plan: "basico", assistanceType: "HUMANO", isResellerPlan: false, isActive: true, priceUSD: 10, credits: 1000, features: [], funciones });
    assert.equal(g.success, true, g.message);
    const listas = await lasListas();
    for (const p of [...listas.values()].filter((x) => x.id !== "fx-c-basico-humano")) {
        assert.ok(!p.lista.some((f) => f.nombre === "Creada en el Básico"), `${p.id}: ya le llegaba`);
    }
});
