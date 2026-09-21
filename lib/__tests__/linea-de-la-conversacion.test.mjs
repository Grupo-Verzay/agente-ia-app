/**
 * El banco de «la linea de la conversacion».
 *
 * El encargo: un cliente escribe por Verzay | Atencion, el asesor contesta o le
 * hace una llamada desde la plataforma, y la salida usaba **la linea de la
 * cuenta de quien mira**. Esto lo prueba por los tres sitios donde se decidia:
 *
 *   A. la DECISION, pura y sin base, con el resolvedor viejo al lado;
 *   B. el CODIGO de verdad —que los envios ya no leen `activeActionSetRef` y
 *      que el estado de la linea nace sembrado con el chat del enlace—;
 *   C. las ACCIONES contra Postgres: con que numero se llama y en que
 *      conversacion se anota la llamada.
 *
 * `MODO=roto` ejerce la version de antes y **afirma el fallo**: sin eso, lo
 * verde de la version nueva no diria si se arreglo la causa o si el caso no
 * llega a ejercerse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const sello = Date.now().toString(36);

const {
    ponerAQuienMira,
    startAstraCall,
    logOutgoingCallAction,
    laLineaDeLaConversacion,
    porDondeSaleLaRespuesta,
    porQueNoSeEnvia,
    db,
} = await import("./.compilado/linea/entrada-de-la-linea.js");

/* ── A. La decision ─────────────────────────────────────────────────────── */

/** Los juegos de acciones que la pantalla recibe, uno por linea de la bandeja. */
const JUEGOS = [
    { instanceName: "MADRE_LINEA", instanceType: "waha" },
    { instanceName: "ATENCION_LINEA", instanceType: "waha" },
];

/**
 * El resolvedor VIEJO, literal: un `useRef` que se escribia **solo** dentro de
 * `handleSelectFromSidebar`. Abriendo la conversacion por cualquier otro camino
 * se quedaba en `null` y el envio caia en `sendAnyAction`, que esta atado a la
 * primera linea de la cuenta de quien mira.
 */
function comoSeDecidiaAntes({ pulsoEnLaLista }) {
    const ref = pulsoEnLaLista ? JUEGOS.find((j) => j.instanceName === "ATENCION_LINEA") : null;
    return ref?.instanceName ?? "MADRE_LINEA"; // ?? sendAnyAction
}

test("A1 · abriendo por enlace, el resolvedor viejo manda por la linea de la cuenta", () => {
    // Este caso es la afirmacion del fallo y pasa en los DOS modos: es lo que
    // el modo nuevo tiene que dejar de hacer.
    assert.equal(comoSeDecidiaAntes({ pulsoEnLaLista: false }), "MADRE_LINEA");
    assert.equal(comoSeDecidiaAntes({ pulsoEnLaLista: true }), "ATENCION_LINEA");
});

test("A2 · la linea sale de la conversacion, se abra como se abra", () => {
    const porEnlace = { contacto: undefined, seleccionada: null, info: { instanceName: "ATENCION_LINEA" } };
    const porLaLista = { contacto: { instanceName: "ATENCION_LINEA" }, seleccionada: "ATENCION_LINEA" };

    const decide = ROTO
        ? () => comoSeDecidiaAntes({ pulsoEnLaLista: false })
        : (c) => porDondeSaleLaRespuesta(JUEGOS, c).juego?.instanceName;

    if (ROTO) {
        assert.equal(decide(porEnlace), "MADRE_LINEA", "el modo roto tiene que reproducir el fallo");
    } else {
        assert.equal(decide(porEnlace), "ATENCION_LINEA");
        assert.equal(decide(porLaLista), "ATENCION_LINEA");
    }
});

test("A3 · sin juego para esa linea NO se envia, y se dice por que", () => {
    const salida = porDondeSaleLaRespuesta([], { info: { instanceName: "ATENCION_LINEA" } });
    assert.equal(salida.motivo, "sin-juego");
    const motivo = porQueNoSeEnvia(salida);
    assert.ok(motivo && motivo.includes("ATENCION_LINEA"), "el aviso nombra la linea");
});

test("A4 · sin linea conocida se deja pasar: el respaldo es lo de siempre", () => {
    const salida = porDondeSaleLaRespuesta(JUEGOS, {});
    assert.equal(salida.motivo, "sin-linea");
    assert.equal(porQueNoSeEnvia(salida), null, "un chat sin linea no puede quedarse sin poder responder");
});

test("A5 · manda el contacto, luego la seleccionada, luego `info`", () => {
    assert.equal(
        laLineaDeLaConversacion({ contacto: { instanceName: "A" }, seleccionada: "B", info: { instanceName: "C" } }),
        "A",
    );
    assert.equal(laLineaDeLaConversacion({ seleccionada: "B", info: { instanceName: "C" } }), "B");
    assert.equal(laLineaDeLaConversacion({ info: { instanceName: "C" } }), "C");
    assert.equal(laLineaDeLaConversacion({ contacto: { instanceName: "   " }, info: { instanceName: "C" } }), "C");
});

/* ── B. El codigo de verdad ─────────────────────────────────────────────── */

const CLIENTE = "app/(root)/chats/_components/chats-client.tsx";
const DIALOGO = "app/(root)/chats/_components/CallDialog.tsx";
const BURBUJA = "app/(root)/chats/_components/MessageBubble.tsx";

/**
 * En modo roto se leen los MISMOS ficheros tal como estaban antes del cambio.
 * Contra `origin/main` y no contra `HEAD`: en cuanto esto se comitee, `HEAD`
 * seria la version nueva y el modo roto dejaria de probar nada.
 */
function comoEsta(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    return execFileSync("git", ["show", `origin/main:${ruta}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

test("B1 · los tres envios NO deciden con `activeActionSetRef`", () => {
    const src = comoEsta(CLIENTE);
    const sospechosos = ["activeActionSetRef.current?.sendText", "activeActionSetRef.current?.sendWorkflow", "activeActionSetRef.current?.sendQuickReply"];
    const encontrados = sospechosos.filter((s) => src.includes(s));
    if (ROTO) {
        assert.deepEqual(encontrados, sospechosos, "el modo roto tiene que ver los tres");
    } else {
        assert.deepEqual(encontrados, [], "un envio que lee ese ref vuelve a salir por la linea de la cuenta");
        for (const q of ["salida.juego?.sendText", "salida.juego?.sendWorkflow", "salida.juego?.sendQuickReply"]) {
            assert.ok(src.includes(q), `falta ${q}`);
        }
    }
});

test("B2 · la linea del chat abierto nace sembrada con el chat del enlace", () => {
    const src = comoEsta(CLIENTE);
    const sembrada = src.includes("useState<string | null>(\n    initialSelectedChat?.instanceName ?? null,\n  )");
    const infoSembrada = src.includes("instanceName: initialSelectedChat?.instanceName ?? instanceName,");
    if (ROTO) {
        assert.ok(!sembrada && !infoSembrada, "el modo roto tiene que ver el estado sin sembrar");
    } else {
        assert.ok(sembrada, "`selectedInstanceName` sigue naciendo en null");
        assert.ok(infoSembrada, "`info.instanceName` sigue naciendo con la linea de la pagina");
    }
});

test("B3 · la llamada sale por la linea RESUELTA y se anota en su conversacion", () => {
    const src = comoEsta(DIALOGO);
    const conLaCruda = src.includes("startAstraCall(`+${phone}`, instanceName)");
    const conLaResuelta = src.includes("startAstraCall(`+${phone}`, effName)");
    const registroConLinea = /logOutgoingCallAction\([\s\S]*?metaInstanceRef\.current,\s*\)/.test(src);
    if (ROTO) {
        assert.ok(conLaCruda, "el modo roto tiene que ver la prop en crudo");
        assert.ok(!registroConLinea, "el modo roto tiene que ver el registro sin linea");
    } else {
        assert.ok(conLaResuelta && !conLaCruda, "sigue llamandose con la prop en crudo");
        assert.ok(registroConLinea, "el registro sigue sin decir en que conversacion fue");
    }
});

test("B4 · «devolver llamada» de una burbuja lleva su linea", () => {
    const src = comoEsta(BURBUJA);
    const conLinea = src.includes("instanceName: laConversacion?.instanceName");
    if (ROTO) assert.ok(!conLinea, "el modo roto tiene que ver la llamada sin linea");
    else assert.ok(conLinea, "la burbuja vuelve a llamar sin decir por que linea");
});

/* ── C. Las acciones, contra Postgres ───────────────────────────────────── */

const madre = `madre-${sello}`;
const atencion = `atencion-${sello}`;
const LINEA_MADRE = `MADRE_${sello}`;
const LINEA_ATENCION = `ATENCION_${sello}`;
const TELEFONO = "573001112233";

test("C0 · siembra: la madre y su cuenta vinculada, cada una con su linea y su numero", async () => {
    await db.user.create({
        data: { id: madre, email: `${madre}@b.co`, name: "Grupo Verzay", role: "admin", astraCallsSid: `sid-${madre}` },
    });
    await db.user.create({
        data: { id: atencion, email: `${atencion}@b.co`, name: "Verzay | Atencion", role: "user", astraCallsSid: `sid-${atencion}` },
    });
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `lnk-${sello}`,
        madre,
        atencion,
    );
    await db.instancia.create({ data: { userId: madre, instanceId: `i-${madre}`, instanceName: LINEA_MADRE, instanceType: "waha" } });
    await db.instancia.create({ data: { userId: atencion, instanceId: `i-${atencion}`, instanceName: LINEA_ATENCION, instanceType: "waha" } });
    ponerAQuienMira({ id: madre, email: `${madre}@b.co`, role: "admin", effectiveId: madre });
});

test("C1 · se llama con el numero de la cuenta DUEÑA de la linea de la conversacion", async () => {
    const visitadas = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
        visitadas.push(String(url));
        return { ok: true, status: 200, json: async () => ({ call: { callId: "c1" } }), text: async () => "" };
    };
    try {
        // El modo roto es lo que hacia `CallDialog` desde una burbuja o desde el
        // CRM: la linea se resolvia unas lineas mas arriba y despues se tiraba,
        // asi que a la accion le llegaba `undefined`.
        const r = await startAstraCall(`+${TELEFONO}`, ROTO ? undefined : LINEA_ATENCION);
        assert.equal(r.success, true, r.message);
        const sid = visitadas.at(-1)?.match(/\/api\/sessions\/([^/]+)\/calls/)?.[1];
        if (ROTO) {
            assert.equal(sid, `sid-${madre}`, "el modo roto tiene que llamar con el numero de la cuenta propia");
        } else {
            assert.equal(sid, `sid-${atencion}`, "se sigue llamando con el numero de otra linea");
        }
    } finally {
        globalThis.fetch = original;
    }
});

test("C2 · la burbuja de la llamada se anota en la conversacion desde la que se llamo", async () => {
    const { id } = await logOutgoingCallAction(
        TELEFONO,
        42,
        false,
        undefined,
        { provider: "astra" },
        ROTO ? undefined : LINEA_ATENCION,
    );
    assert.ok(id, "no se escribio ninguna fila");
    const fila = await db.chatMessage.findFirst({
        where: { id: BigInt(id) },
        select: { userId: true, instanceName: true },
    });
    if (ROTO) {
        assert.equal(fila.userId, madre, "el modo roto tiene que anotarla bajo la cuenta propia");
        assert.equal(fila.instanceName, LINEA_MADRE);
    } else {
        assert.equal(fila.userId, atencion, "la llamada se sigue anotando bajo otra cuenta");
        assert.equal(fila.instanceName, LINEA_ATENCION, "la llamada se sigue anotando en otra conversacion");
    }
});

test("C3 · sin linea sigue anotandose donde se anotaba: no se pierde ningun registro", async () => {
    const { id } = await logOutgoingCallAction(TELEFONO, 7, false, undefined, { provider: "astra" });
    assert.ok(id, "un registro sin linea no puede perderse");
    const fila = await db.chatMessage.findFirst({
        where: { id: BigInt(id) },
        select: { userId: true, instanceName: true },
    });
    assert.equal(fila.userId, madre);
    assert.equal(fila.instanceName, LINEA_MADRE);
});

test("C9 · se recoge la siembra", async () => {
    await db.$disconnect();
});
