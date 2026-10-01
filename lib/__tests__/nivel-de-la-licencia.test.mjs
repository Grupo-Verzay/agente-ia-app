/**
 * La regla del nivel de un cliente de reseller, sin base, y un barrido de que
 * TODOS los sitios que guardan ese nivel pasan por ella.
 *
 * La regla vive en `lib/nivel-de-la-licencia.ts` y es una frase: si el cliente
 * consume una licencia de un reseller que existe, su nivel es el de esa
 * licencia. El fallo que la destapó fue «Asesor DAYRA», de Daniel Peralta:
 * licencia de Nivel 6 y la cuenta en Nivel 5, sin poder crear usuarios.
 *
 * Corre en DOS modos. `MODO=roto` lee los mismos ficheros de un commit
 * PINCHADO (`ANTES_REF`) con `git show` y **afirma el fallo**: ninguna de las
 * puertas miraba la licencia. Sin ese modo no se sabría si el barrido mira.
 *
 * Como se corre: `scripts/banco-nivel-de-la-licencia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "c902542";

function leer(fichero) {
    if (!ROTO) return readFileSync(fichero, "utf8");
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return "";
    }
}

/**
 * Quita los comentarios: el arreglo lleva escrito al lado por qué, y eso no es
 * código. Los de bloque solo si empiezan la línea: un `"image/*"` dentro de una
 * cadena abriría un «comentario» que se comería medio fichero.
 */
function sinComentarios(codigo) {
    return codigo.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** El cuerpo de una función exportada: de su `export` al `export` siguiente. */
function elCuerpo(codigo, nombre) {
    const i = codigo.search(new RegExp(`export (?:const|async function|function) ${nombre}\\b`));
    if (i < 0) return "";
    const resto = codigo.slice(i + 1);
    const fin = resto.search(/\nexport (?:const|async function|function) /);
    return fin < 0 ? resto : resto.slice(0, fin);
}

if (!ROTO) {
    const {
        NIVELES,
        elNivelDeLaLicencia,
        elNivelQueSeGuarda,
        estaPorDebajoDeSuLicencia,
        laPosicionDelNivel,
    } = await import("./.compilado/nivel-de-la-licencia/nivel-de-la-licencia.js");
    const script = await import("../../scripts/subir-clientes-a-su-licencia.mjs");

    const LICENCIAS = [
        { resellerUserId: "daniel", subscriptionPlanId: "pool-n6", plan: "personalizado" },
        { resellerUserId: "daniel", subscriptionPlanId: "pool-n3", plan: "intermedio" },
        { resellerUserId: "otro", subscriptionPlanId: "pool-n6", plan: "personalizado" },
    ];
    const CLIENTE = { isDemo: false, demoResellerId: "daniel", resellerSubscriptionPlanId: "pool-n6" };

    test("regla: un cliente de una licencia de Nivel 6 tiene Nivel 6", () => {
        assert.equal(elNivelDeLaLicencia(CLIENTE, LICENCIAS), "personalizado");
        assert.equal(
            elNivelDeLaLicencia({ ...CLIENTE, resellerSubscriptionPlanId: "pool-n3" }, LICENCIAS),
            "intermedio",
        );
    });

    test("regla: sin licencia que EXISTA no hay nivel que heredar", () => {
        assert.equal(elNivelDeLaLicencia(null, LICENCIAS), null);
        assert.equal(elNivelDeLaLicencia({ ...CLIENTE, isDemo: true }, LICENCIAS), null, "una demo no consume licencia");
        assert.equal(elNivelDeLaLicencia({ ...CLIENTE, demoResellerId: null }, LICENCIAS), null);
        assert.equal(elNivelDeLaLicencia({ ...CLIENTE, resellerSubscriptionPlanId: null }, LICENCIAS), null);
        assert.equal(
            elNivelDeLaLicencia({ ...CLIENTE, resellerSubscriptionPlanId: "pool-que-ya-no-esta" }, LICENCIAS),
            null,
            "un plan que su reseller ya no tiene no da nivel",
        );
        assert.equal(
            elNivelDeLaLicencia({ ...CLIENTE, demoResellerId: "nadie" }, LICENCIAS),
            null,
            "la licencia es del reseller DEL CLIENTE, no de cualquiera",
        );
    });

    test("regla: con licencia se guarda SIEMPRE la de la licencia, y se dice si se pidió otra", () => {
        assert.deepEqual(elNivelQueSeGuarda("enterprise", "personalizado"), { plan: "personalizado", corregido: true });
        assert.deepEqual(elNivelQueSeGuarda("personalizado", "personalizado"), { plan: "personalizado", corregido: false });
        assert.deepEqual(
            elNivelQueSeGuarda(undefined, "personalizado"),
            { plan: "personalizado", corregido: false },
            "sin campo en el formulario también endereza",
        );
        assert.deepEqual(elNivelQueSeGuarda("   ", "personalizado"), { plan: "personalizado", corregido: false });
    });

    test("regla: sin licencia se guarda lo pedido tal cual", () => {
        assert.deepEqual(elNivelQueSeGuarda("avanzado", null), { plan: "avanzado", corregido: false });
        assert.deepEqual(elNivelQueSeGuarda(" basico ", null), { plan: "basico", corregido: false });
        assert.deepEqual(elNivelQueSeGuarda(undefined, null), { plan: undefined, corregido: false });
        assert.deepEqual(elNivelQueSeGuarda("", null), { plan: undefined, corregido: false });
    });

    test("regla: «por debajo» compara POSICIONES, no nombres", () => {
        assert.equal(estaPorDebajoDeSuLicencia("enterprise", "personalizado"), true, "el caso de Asesor DAYRA");
        assert.equal(estaPorDebajoDeSuLicencia("lite", "personalizado"), true);
        assert.equal(estaPorDebajoDeSuLicencia("personalizado", "personalizado"), false);
        assert.equal(estaPorDebajoDeSuLicencia("personalizado", "avanzado"), false, "por encima no está por debajo");
        assert.equal(estaPorDebajoDeSuLicencia("enterprise", null), false);
        assert.equal(estaPorDebajoDeSuLicencia("enterprise", "inventado"), false);
        assert.equal(laPosicionDelNivel("personalizado"), 5);
        assert.equal(laPosicionDelNivel(null), -1);
    });

    test("los niveles van en el orden de PLANS (types/plans.ts), que es el de «Nivel N»", () => {
        const plans = readFileSync("types/plans.ts", "utf8").match(/export const PLANS: Plan\[\] = \[([^\]]+)\]/);
        assert.ok(plans, "no se encontró PLANS");
        const orden = plans[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
        assert.deepEqual([...NIVELES], orden);
        assert.deepEqual([...script.NIVELES], orden, "el script de los datos usa el mismo orden");
    });

    test("el script de los datos decide igual que la regla: solo SUBE lo que está por debajo", () => {
        const filas = [];
        let n = 0;
        for (const plan of NIVELES) {
            for (const licencia of [...NIVELES, null, "inventado"]) {
                filas.push({ id: `f${n++}`, nombre: `${plan}/${licencia}`, plan, nivelDeLaLicencia: licencia });
            }
        }
        const { subir, porEncima } = script.laCorreccion(filas);
        const ids = new Set(subir.map((s) => s.id));
        for (const f of filas) {
            assert.equal(
                ids.has(f.id),
                estaPorDebajoDeSuLicencia(f.plan, f.nivelDeLaLicencia),
                `${f.nombre}: el script y la regla no dicen lo mismo`,
            );
        }
        for (const s of subir) assert.ok(laPosicionDelNivel(s.a) > laPosicionDelNivel(s.de), "nunca baja");
        for (const p of porEncima) assert.ok(laPosicionDelNivel(p.plan) > laPosicionDelNivel(p.licencia));
        assert.ok(subir.length > 0 && porEncima.length > 0, "el barrido ejerce los dos lados");
    });
}

// ── El barrido: TODOS los sitios que escriben el nivel pasan por la regla ──

const FICHA = sinComentarios(leer("actions/userClientDataActions.ts"));
const PLANES = sinComentarios(leer("actions/billing/choose-plan-actions.ts"));
const SUSCRIPCION = sinComentarios(leer("lib/suscripcion-activa.server.ts"));
const LICENCIAS_ACC = sinComentarios(leer("actions/reseller-license-actions.ts"));
const DIALOGO = sinComentarios(leer("app/(root)/(protected)/panel/clientes/_components/edit-dialog.tsx"));

const PUERTAS = [
    ["Editar cliente guarda el nivel de la licencia", () => /elNivelDeSuLicencia\(\s*userId\s*\)/.test(elCuerpo(FICHA, "updateClientData")) && /elNivelQueSeGuarda\(/.test(elCuerpo(FICHA, "updateClientData"))],
    ["Crear un cliente (reseller) nace en el nivel de su licencia", () => /elNivelQueSeGuarda\([^)]*pool\.subscriptionPlan\.plan/.test(elCuerpo(FICHA, "createUserWithPausar"))],
    ["Crear un cliente (cuenta de licencias) nace en el nivel de su licencia", () => /plan:\s*pool\.subscriptionPlan\.plan/.test(elCuerpo(LICENCIAS_ACC, "createClientAccount"))],
    ["Elegir plan para pagar no saca a un cliente de su licencia", () => /elNivelDeSuLicencia\(/.test(elCuerpo(PLANES, "elegirPlanParaPagar"))],
    ["Aprobar una suscripción respeta el nivel de la licencia", () => /elNivelDeSuLicencia\(/.test(elCuerpo(SUSCRIPCION, "activarLaSuscripcion"))],
    ["El editor de un solo campo no deja tocar el nivel", () => /field === ['"]plan['"]/.test(elCuerpo(FICHA, "updateClientDataByField"))],
    ["El formulario enseña el nivel de la licencia y no deja cambiarlo", () => /readOnly:\s*Boolean\(user\.nivelDeLaLicencia\)/.test(DIALOGO) && /data-nivel-de-la-licencia/.test(DIALOGO)],
    ["La lista de Clientes trae el nivel de la licencia", () => /losNivelesDeSusLicencias\(/.test(elCuerpo(FICHA, "getEnrichedClients"))],
];

for (const [nombre, pasa] of PUERTAS) {
    if (ROTO) {
        test(`ANTES (${ANTES_REF}): ${nombre} — NO lo hacía`, () => {
            assert.equal(pasa(), false, "en el árbol de antes esto ya estaba: el modo roto no reproduce nada");
        });
    } else {
        test(`barrido: ${nombre}`, () => assert.ok(pasa()));
    }
}
