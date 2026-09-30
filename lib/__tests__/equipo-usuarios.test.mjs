/**
 * Usuarios (`/equipo`): lo que se arregló al documentarla, sin base de datos.
 *
 * 1. **Las reglas puras**: quién ve «Vincular existente» y «Reiniciar
 *    vínculos», qué dice cada módulo en «Permisos» y cómo busca el Pipeline.
 * 2. **Un barrido del código**, que es lo único que dice si la pantalla PASA
 *    por esas reglas: que las dos opciones peligrosas del «⋯» van detrás de su
 *    condición, que «Mover a otra cuenta» no sale sin destino, que «Permisos»
 *    no enseña la ruta interna del módulo, que las métricas van acotadas a la
 *    cuenta, que «Asignar sin atender» deja pasar al administrador del equipo y
 *    que la palabra «Automaciones» no queda en ninguna pantalla.
 *
 * `MODO=roto` lee los MISMOS ficheros del commit de antes (`ANTES_REF`,
 * pinchado: nunca `origin/main`, que en cuanto esto se fusione pasa a ser el
 * «después») y AFIRMA cada fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "ab6b110";
const t = test;

/** El fichero de hoy, o el del commit de antes en modo roto. `null` si no existe. */
function leer(ruta) {
    if (!ROTO) return existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
    try {
        return execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
}

/** Sin comentarios: el arreglo lleva escrito al lado por qué, y eso no puede tumbar el barrido. */
function sinComentarios(codigo) {
    return codigo
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const CLIENTE = "app/(root)/equipo/_components/team-client.tsx";
const PAGINA = "app/(root)/equipo/page.tsx";
const PERMISOS = "app/(root)/equipo/_components/AdvisorPermissionsDialog.tsx";
const CLIENTES = "app/(root)/equipo/_components/AdvisorClientsDialog.tsx";
const PIPELINE = "app/(root)/asesores/components/AdvisorKanbanBoard.tsx";
const CONMUTADOR = "components/AccountSwitcher.tsx";

/* ── 1. Las reglas puras ─────────────────────────────────────────────────── */

const reglas = ROTO ? null : await import("./.compilado/equipo-usuarios/reglas.js");

t("vincular una cuenta solo se ofrece a la casa y al reseller", { skip: ROTO }, () => {
    const { ofreceVincularCuentas } = reglas;
    for (const r of ["admin", "super_admin", "reseller"]) assert.equal(ofreceVincularCuentas(r), true, r);
    for (const r of ["user", "affiliate", null, undefined, ""]) assert.equal(ofreceVincularCuentas(r), false, String(r));
});

t("reiniciar los vínculos es solo del súper administrador de verdad", { skip: ROTO }, () => {
    const { ofreceReiniciarVinculos } = reglas;
    assert.equal(ofreceReiniciarVinculos(true), true);
    assert.equal(ofreceReiniciarVinculos(false), false);
    assert.equal(ofreceReiniciarVinculos(undefined), false);
});

t("«Permisos» dice cuántos apartados ve, no la ruta del módulo", { skip: ROTO }, () => {
    const { elConteoDelModulo } = reglas;
    assert.equal(elConteoDelModulo(1, 1), "Ve su apartado");
    assert.equal(elConteoDelModulo(0, 1), "No lo ve");
    assert.equal(elConteoDelModulo(0, 4), "No ve ninguno de sus 4 apartados");
    assert.equal(elConteoDelModulo(4, 4), "Ve sus 4 apartados");
    assert.equal(elConteoDelModulo(2, 4), "Ve 2 de 4 apartados");
});

t("el buscador del Pipeline encuentra sin tildes y por dígitos", { skip: ROTO }, () => {
    const { pasaLaBusquedaDelContacto: pasa } = reglas;
    const maria = { pushName: "María Pérez", remoteJid: "573001112233@s.whatsapp.net" };
    assert.equal(pasa(maria, "maria"), true);
    assert.equal(pasa(maria, "PEREZ"), true);
    assert.equal(pasa(maria, "+57 300 111"), true);
    assert.equal(pasa(maria, "300-111-2233"), true);
    assert.equal(pasa(maria, "ana"), false);
    assert.equal(pasa(maria, "999"), false);
    // El sufijo de dispositivo no es parte del número.
    assert.equal(pasa({ pushName: null, remoteJid: "573233246305:39@s.whatsapp.net" }, "39"), false);
    assert.equal(pasa(maria, ""), true);
});

/* ── 2. El barrido del código ────────────────────────────────────────────── */

t("«Reiniciar vínculos» del ⋯ va detrás del súper administrador", () => {
    const c = sinComentarios(leer(CLIENTE));
    const conPuerta = /puedeReiniciarVinculos[\s\S]{0,200}clave:\s*"vinculos"/.test(c);
    if (ROTO) assert.equal(conPuerta, false, "en ANTES tenía que salir a cualquiera");
    else {
        assert.ok(conPuerta, "la opción tiene que ir detrás de puedeReiniciarVinculos");
        assert.match(c, /data-confirmar-reinicio/, "el diálogo pide teclear la palabra");
        assert.match(leer(PAGINA), /puedeReiniciarVinculos=\{ofreceReiniciarVinculos\(esSuperAdminDeVerdad\(user\)\)\}/);
    }
});

t("«Vincular existente» va detrás de quien ya administra cuentas, aquí y en el conmutador", () => {
    const c = sinComentarios(leer(CLIENTE));
    const s = sinComentarios(leer(CONMUTADOR));
    const conPuerta = /puedeVincular[\s\S]{0,200}clave:\s*"vincular"/.test(c);
    const conmutador = /ofreceVincularCuentas/.test(s);
    if (ROTO) {
        assert.equal(conPuerta, false);
        assert.equal(conmutador, false);
    } else {
        assert.ok(conPuerta);
        assert.ok(conmutador, "«Agregar cuenta» del conmutador pregunta lo mismo");
        assert.match(leer(PAGINA), /puedeVincular=\{ofreceVincularCuentas\(rolQueAbrePuertas\(user\)\)\}/);
    }
});

t("las dos acciones que vinculan pasan por la misma puerta en el servidor", () => {
    const equipo = leer("actions/team-actions.ts");
    const conmutador = leer("actions/linked-account-actions.ts");
    const n = [equipo, conmutador].filter((f) => /await puertaParaVincular\(/.test(f)).length;
    assert.equal(n, ROTO ? 0 : 2);
});

t("reiniciar los vínculos pide al súper administrador y la palabra, también en el servidor", () => {
    const f = sinComentarios(leer("actions/linked-account-actions.ts"));
    const cuerpo = f.slice(f.indexOf("export async function resetAllLinkedAccounts"));
    const pideSuper = /ofreceReiniciarVinculos\(esSuperAdminDeVerdad\(user\)\)/.test(cuerpo);
    const pidePalabra = /confirmaLaLimpieza\(confirmacion\)/.test(cuerpo);
    if (ROTO) {
        assert.equal(pideSuper, false);
        assert.equal(pidePalabra, false);
    } else {
        assert.ok(pideSuper);
        assert.ok(pidePalabra);
    }
});

t("«Mover a otra cuenta» no sale si no hay otra cuenta a la que mover", () => {
    const c = sinComentarios(leer(CLIENTE));
    const conDestino = /advisor\.esDelEquipo\s*&&\s*hayCuentasParaMudar/.test(c);
    assert.equal(conDestino, !ROTO);
});

t("«Permisos» no enseña la ruta interna del módulo y el rol va en palabras", () => {
    const c = sinComentarios(leer(PERMISOS));
    const enseñaRuta = /\{mod\.route\}/.test(c);
    const rolEnPalabras = /elNombreDelRol\(quienEs\.role\)/.test(c);
    if (ROTO) {
        assert.equal(enseñaRuta, true, "en ANTES pintaba «#container», «/client-panel»…");
        assert.equal(rolEnPalabras, false);
    } else {
        assert.equal(enseñaRuta, false);
        assert.ok(rolEnPalabras);
        assert.match(c, /elConteoDelModulo\(/);
    }
});

t("las métricas del equipo cuentan SOLO las conversaciones de esta cuenta", () => {
    const f = leer("actions/team-actions.ts");
    const cuerpo = f.slice(f.indexOf("export async function getTeamMetrics"), f.indexOf("export type AutoAssignSettingsData"));
    const acotada = /ON s\.assigned_advisor_id = d\.id\s+AND s\."userId" = \$\{owner\.id\}/.test(cuerpo);
    assert.equal(acotada, !ROTO);
});

t("«Asignar sin atender» usa la puerta de la pantalla, no «solo el dueño»", () => {
    const f = sinComentarios(leer("actions/advisor-assign-actions.ts"));
    const cuerpo = f.slice(f.indexOf("export async function bulkAutoAssign"), f.indexOf("export async function transferSession"));
    const conLaPuerta = /laCuentaQueConfigura\(\)/.test(cuerpo);
    assert.equal(conLaPuerta, !ROTO);
    if (!ROTO) assert.doesNotMatch(cuerpo, /user\.ownerId \? null : user\.id/);
});

t("la lista de clientes dice el nombre de la cuenta, no «Empresa Demo» en cada fila", () => {
    const c = sinComentarios(leer(CLIENTES));
    assert.equal(/nombreDeLaCuenta\(c\)/.test(c), !ROTO);
});

t("el buscador del Pipeline pasa por la regla, no por un `includes` crudo", () => {
    const c = sinComentarios(leer(PIPELINE));
    assert.equal(/pasaLaBusquedaDelContacto\(c, searchQuery\)/.test(c), !ROTO);
});

t("«Asignar sin atender» es una acción secundaria de la barra", () => {
    const c = sinComentarios(leer(CLIENTE));
    const enSecundarias = /secundarias=\{\s*<Button[\s\S]{0,200}data-accion="asignar-sin-atender"/.test(c);
    assert.equal(enSecundarias, !ROTO);
});

t("la palabra es «Automatizaciones»: «Automaciones» no queda en ninguna pantalla", () => {
    let conLaPalabra;
    try {
        const salida = ROTO
            ? execFileSync("git", ["grep", "-l", "Automaciones", ANTES, "--", "app", "actions", "components", "lib"], { encoding: "utf8" })
            : execFileSync("git", ["grep", "-l", "--untracked", "Automaciones", "--", "app", "actions", "components", "lib"], { encoding: "utf8" });
        conLaPalabra = salida.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__"));
    } catch {
        conLaPalabra = [];
    }
    if (ROTO) assert.ok(conLaPalabra.length > 0, "en ANTES salía en las pantallas de automatizaciones");
    else assert.deepEqual(conLaPalabra, []);
});

t("guardar la auto-asignación dice cuántas repartió, también al encender el interruptor", () => {
    const c = sinComentarios(leer(CLIENTE));
    // El aviso con el número sale aunque ese guardado no avise (`avisar`), y va
    // ANTES del «Configuración guardada» a secas.
    const conElNumero = /else if \(\(res\.data\?\.asignadas \?\? 0\) > 0\) toast\.success\(res\.message/.test(c);
    assert.equal(conElNumero, !ROTO);
});

t("repartir vuelve a leer los números: la tabla no se queda con los de antes", () => {
    const c = sinComentarios(leer(CLIENTE));
    // Después de «Asignar sin atender», de guardar un reparto que asignó y al
    // volver del Pipeline, se vuelven a pedir la carga y las métricas.
    const trasAsignar = /bulkAutoAssign\(\)[\s\S]{0,600}if \(n > 0\) await refrescarElEquipo\(\)/.test(c);
    const trasGuardar = /\(res\.data\?\.asignadas \?\? 0\) > 0\) void refrescarElEquipo\(\)/.test(c);
    const trasElPipeline = /if \(view === "pipeline"\) void refrescarElEquipo\(\)/.test(c);
    // Y la tabla lee las métricas del ESTADO, no las que llegaron al abrir.
    const deLaCarga = /teamMetrics\?\.advisors/.test(c);
    assert.equal(trasAsignar && trasGuardar && trasElPipeline && !deLaCarga, !ROTO);
});

t("el aviso de «Asignar sin atender» escribe «conversaciones», no «conversaciónes»", () => {
    const c = sinComentarios(leer(CLIENTE));
    const malPlural = /conversación\$\{[^}]*'es'/.test(c);
    assert.equal(malPlural, ROTO);
});

t("los paneles de automatizaciones no repiten el título que ya pone su hoja", () => {
    const paneles = ["Advisor", "Tag", "ReminderGroup", "Appt", "TaskType"].map(
        (n) => `app/(root)/crm/rules/components/${n}AutomationsPanel.tsx`,
    );
    const conTitulo = paneles.filter((f) => /<h3[^>]*>Automa\w* — /.test(sinComentarios(leer(f) ?? "")));
    if (ROTO) assert.equal(conTitulo.length, 5, "en ANTES los cinco repetían el título de su hoja");
    else assert.deepEqual(conTitulo, []);
});
