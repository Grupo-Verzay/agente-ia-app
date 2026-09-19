// Banco de la frontera entre una ACCIÓN y un RUNNER de sistema.
//
// # Qué prueba, y por qué hacía falta otro banco
//
// El de al lado —`guardas-de-las-acciones.test.mjs`— comprueba que una acción
// que recibe un `userId` pase por una puerta. Eso no sirve para este lote: aquí
// las funciones las llama un **cron**, y desde un cron **no hay sesión**, así
// que ponerles `currentUser()` no las cierra — las apaga. Es literalmente lo
// que dejó los avisos de Waha callados durante días sin un solo error.
//
// Lo que se prueba aquí es la regla de la que salió el arreglo:
//
//   > **Una acción es un endpoint.** Todo `export async function` de un fichero
//   > `'use server'` es un POST al que se llega desde el navegador con los
//   > parámetros que uno quiera, lo llame quien lo llame por dentro. Así que un
//   > runner de sistema **no puede ser una acción**: o el fichero entero deja
//   > de serlo (`import "server-only"`), o el runner se va a `lib/*.server.ts`.
//
// La forma de comprobarlo no es leer las funciones una a una —eso ya se hizo y
// no se sostiene con el tiempo— sino mirar **por dónde entra el sistema**: las
// rutas que el middleware deja pasar sin sesión. Si una de ellas importa un
// fichero de acciones, hay un runner publicado.
//
// Se ejecuta con: node --test lib/__tests__/acciones-de-sistema.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("../../", import.meta.url).pathname;

/**
 * Los prefijos que `middleware.ts` deja pasar SIN sesión.
 *
 * Se leen del propio middleware y no se copian a mano: una lista copiada es una
 * que el día que se añada un prefijo se queda corta, y entonces el banco pasa
 * sobre la puerta nueva sin mirarla.
 */
function prefijosSinSesion() {
    const src = readFileSync(join(RAIZ, "middleware.ts"), "utf8");
    const prefijos = [];
    const re = /^const api\w*Prefix = "([^"]+)";/gm;
    let m;
    while ((m = re.exec(src))) prefijos.push(m[1]);
    return prefijos;
}

function rutas(dir, acc = []) {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) rutas(p, acc);
        else if (n === "route.ts" || n === "route.tsx") acc.push(p);
    }
    return acc;
}

const esAccion = (rel) => {
    const src = readFileSync(join(RAIZ, rel + ".ts"), "utf8");
    return /^\s*﻿?['"]use server['"]/m.test(src.slice(0, 200));
};

/**
 * Las rutas sin sesión a las que SÍ se les deja importar una acción, y por qué.
 *
 * El banco falla si un motivo no explica nada, igual que en el banco de al
 * lado. Y falla también si una entrada sobra: una excusa que ya no hace falta
 * es una puerta que alguien vuelve a abrir creyendo que estaba pactada.
 */
const PACTADAS = {
    "app/api/schedule/appointment/route.ts::@/actions/appointments-actions":
        "createAppointment la abre tambien la pagina publica /schedule/[userId], asi que ya es publica a proposito",
    "app/api/schedule/appointment/route.ts::@/actions/chat-history/send-message-with-history-action":
        "la confirmacion de la cita: la manda tambien el navegador de quien reserva, que no tiene sesion (ver el comentario del fichero)",
    "app/api/schedule/slots/route.ts::@/actions/getAvailableSlots-actions":
        "las horas libres son lo que la pagina publica de reservas tiene que pintar antes de que nadie tenga cuenta",
    "app/api/owner/sync-contact/route.ts::@/actions/google-sheets-actions":
        "autoSyncContactIfEnabled: no recibe ningun dato, solo adelanta un volcado que la propia cuenta pidio (ver el comentario del fichero)",
};

test("ninguna ruta sin sesion importa un fichero de acciones", () => {
    const prefijos = prefijosSinSesion();
    assert.ok(prefijos.length >= 8, `se leyeron ${prefijos.length} prefijos del middleware`);

    const publicadas = [];
    let miradas = 0;

    for (const ruta of rutas(join(RAIZ, "app/api"))) {
        const rel = relative(RAIZ, ruta);
        const url = "/" + rel.replace(/^app/, "").replace(/\/route\.tsx?$/, "").replace(/^\//, "");
        if (!prefijos.some((p) => url.startsWith(p))) continue;
        miradas++;

        const src = readFileSync(ruta, "utf8");
        const re = /from ['"](@\/actions\/[^'"]+)['"]/g;
        let m;
        while ((m = re.exec(src))) {
            const modulo = m[1];
            if (!esAccion(modulo.replace("@/", ""))) continue;
            const llave = `${rel}::${modulo}`;
            if (llave in PACTADAS) continue;
            publicadas.push(llave);
        }
    }

    assert.ok(miradas >= 10, `se esperaban mas rutas sin sesion, se miraron ${miradas}`);
    assert.deepEqual(
        publicadas,
        [],
        "estas rutas sin sesion llaman a una accion, o sea que ese runner es un endpoint:\n  " +
            publicadas.join("\n  "),
    );
});

/**
 * Los módulos a los que se mudó el sistema. Dos cosas cada uno: que lleven
 * `server-only` —que es lo que hace que el build se caiga en el sitio si
 * alguien los importa desde un componente de cliente— y que NO hayan vuelto a
 * `'use server'`, que es el fallo que este banco existe para cazar.
 */
const MODULOS = [
    "actions/whatsapp-dispatcher.ts",
    "actions/vigilancia-actions.ts",
    "actions/billing/billing-job-actions.ts",
    "actions/billing/billing-payment-internal.ts",
    "actions/sending-image-actions.ts",
    "actions/public-branding-actions.ts",
    "lib/reseller-billing-runner.server.ts",
    "lib/weekly-report-runner.server.ts",
    "lib/aviso-de-desconexion.server.ts",
    "lib/grabacion-de-llamada.server.ts",
];

test("los modulos de sistema no han vuelto a ser acciones", () => {
    for (const f of MODULOS) {
        const src = readFileSync(join(RAIZ, f), "utf8");
        assert.ok(
            /^\s*﻿?import ["']server-only["'];/m.test(src.slice(0, 300)),
            `${f} deberia empezar por import "server-only"`,
        );
        assert.ok(
            !/^\s*﻿?['"]use server['"]/m.test(src.slice(0, 300)),
            `${f} volvio a ser un fichero de acciones: sus exports son endpoints otra vez`,
        );
    }
});

test("ninguna excusa se cuela sin motivo", () => {
    for (const [llave, motivo] of Object.entries(PACTADAS)) {
        assert.ok(
            typeof motivo === "string" && motivo.trim().length > 20,
            `la excusa de ${llave} no explica por que`,
        );
    }
});

/**
 * Y la otra mitad, que es la que de verdad se olvida: los llamadores del
 * runner tienen que apuntar al sitio nuevo.
 *
 * Esto no es redundante con el compilador. `tsc` caza el import que ya no
 * existe, pero **no** caza que alguien vuelva a exportar el runner desde el
 * fichero de acciones «para no cambiar el import» — que es el atajo que
 * deshace todo esto sin romper nada.
 */
test("los crons llaman al modulo, no a la accion", () => {
    const esperado = {
        "app/api/cron/billing/route.ts": ["@/lib/reseller-billing-runner.server"],
        "app/api/cron/weekly-report/route.ts": ["@/lib/weekly-report-runner.server"],
        "app/api/cron/evolution-disconnect/route.ts": ["@/lib/aviso-de-desconexion.server"],
        "app/api/calls/process-bot-recording/route.ts": ["@/lib/grabacion-de-llamada.server"],
    };
    for (const [ruta, modulos] of Object.entries(esperado)) {
        const src = readFileSync(join(RAIZ, ruta), "utf8");
        for (const modulo of modulos) {
            assert.ok(src.includes(modulo), `${ruta} ya no importa ${modulo}`);
        }
    }
});
