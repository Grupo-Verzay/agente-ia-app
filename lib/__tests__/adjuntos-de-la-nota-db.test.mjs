/**
 * LOS ADJUNTOS DE UNA NOTA INTERNA, contra Postgres y con las acciones de
 * VERDAD. Lo que un banco puro no puede decir:
 *
 * 1. Leer las notas de una conversación NO crea la tabla de adjuntos: una
 *    cuenta que nunca adjuntó nada no hace DDL al abrir un chat.
 * 2. Una nota con imagen y documento se guarda con sus archivos y, al abrirla
 *    después, TRAE los archivos, en el orden en que se subieron.
 * 3. Una nota puede ser SOLO un archivo: la bandeja y el aviso de mención
 *    dicen que lleva un archivo en vez de enseñar un hueco.
 * 4. Lo que no vale NO se guarda: ni nota vacía, ni una dirección de fuera del
 *    bucket, ni de la carpeta de otra cuenta, ni más de cuatro archivos — y
 *    una mala no deja pasar a las buenas.
 * 5. Nota y archivos van en UNA transacción: si fallan los archivos, no queda
 *    una nota a medias.
 * 6. La puerta no se afloja: otra cuenta no lee los archivos de una nota
 *    ajena, y solo el autor la borra.
 * 7. Borrar la nota borra sus archivos —filas y bucket—, y un bucket que
 *    falla no impide borrarla.
 *
 * `MODO=roto` corre la acción de `ANTES_REF` y AFIRMA el fallo: una nota no
 * sabía de archivos (los ignoraba) y sin texto se rechazaba.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/adjuntos-notas/entrada-de-los-adjuntos-en-notas-antes.js"
        : "./.compilado/adjuntos-notas/entrada-de-los-adjuntos-en-notas.js"
);
const {
    ponerAQuienMira, createInternalNoteAction, getInternalNotesBySessionAction,
    deleteInternalNoteAction, lasNotasDeLaBandejaAction, quitados, fallan, db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `adj-cuenta-${V}`;
const ASESOR = `adj-asesor-${V}`; // agente de la cuenta
const OTRO = `adj-otro-${V}`; // otra cuenta, sin relación
const LINEA = `LINEA_ADJ_${V}`;
const PUBLICA = process.env.S3_PUBLIC_URL;
const BUCKET = "verzay-media";

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
        canTakeUnassigned: false, ...extra,
    };
}
const laCuenta = () => quien(CUENTA);
const elAsesor = () => quien(ASESOR, { ownerId: CUENTA, advisorRole: "agente" });
const elOtro = () => quien(OTRO);

const llave = (cuenta, nombre, carpeta = "notas-internas") => `${cuenta}/${carpeta}/${V}-${nombre}`;
const url = (cuenta, nombre, carpeta) => `${PUBLICA}/${BUCKET}/${llave(cuenta, nombre, carpeta)}`;
const foto = () => ({ url: url(CUENTA, "foto.png"), nombre: "foto.png", mime: "image/png", tamano: 2048 });
const pdf = () => ({ url: url(CUENTA, "contrato.pdf"), nombre: "contrato.pdf", mime: "application/pdf", tamano: 4096 });

const tablaExiste = async () =>
    (await db.$queryRawUnsafe(
        `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'adjuntos_de_notas'`,
    )).length > 0;
const cuantasNotas = (sessionId) => db.internalNote.count({ where: { sessionId } });
const filasDeAdjuntos = async (noteId) =>
    db.$queryRawUnsafe(`SELECT "url", "tipo", "orden" FROM "adjuntos_de_notas" WHERE "noteId" = $1 ORDER BY "orden"`, noteId);

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "adjuntos_de_notas"`);
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: "La Cuenta" } });
    await db.user.create({ data: { id: OTRO, email: `${OTRO}@banco.test`, name: "Otro" } });
    await db.user.create({ data: { id: ASESOR, email: `${ASESOR}@banco.test`, name: "Aldo Asesor", ownerId: CUENTA, advisorRole: "agente" } });
    await db.instancia.create({ data: { instanceName: LINEA, instanceId: LINEA, userId: CUENTA, instanceType: "Whatsapp" } });
    S.conv = (await db.session.create({
        data: { userId: CUENTA, instanceId: LINEA, remoteJid: `5731${V.slice(-6)}01@s.whatsapp.net`, pushName: "Clienta", status: true },
        select: { id: true },
    })).id;
});

test("MODO=roto: una nota no sabía de archivos — los ignoraba, y sin texto se rechazaba", { skip: !ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const conTexto = await createInternalNoteAction({ sessionId: S.conv, content: "Mira esto", adjuntos: [foto()] });
    assert.equal(conTexto.success, true, conTexto.message);
    assert.equal(conTexto.data.adjuntos, undefined, "el fallo: la nota no trae archivos");
    assert.equal(await tablaExiste(), false, "el fallo: no había dónde guardarlos");

    const soloArchivo = await createInternalNoteAction({ sessionId: S.conv, content: "", adjuntos: [foto()] });
    assert.equal(soloArchivo.success, false, "el fallo: una nota sin texto no se podía guardar");
});

test("leer las notas de una conversación NO crea la tabla de adjuntos", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const sinNada = await getInternalNotesBySessionAction(S.conv);
    assert.equal(sinNada.success, true);
    assert.deepEqual(sinNada.data, []);
    assert.equal(await tablaExiste(), false, "abrir un chat no hace DDL");

    const texto = await createInternalNoteAction({ sessionId: S.conv, content: "Solo texto" });
    assert.equal(texto.success, true, texto.message);
    assert.deepEqual(texto.data.adjuntos, []);
    const leida = await getInternalNotesBySessionAction(S.conv);
    assert.deepEqual(leida.data.find((n) => n.id === texto.data.id).adjuntos, [], "una nota sin archivos no los inventa");
    assert.equal(await tablaExiste(), false, "ni escribir una nota de texto crea la tabla");
});

test("una nota con imagen y documento se guarda, y al abrirla DESPUÉS trae sus archivos en orden", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const r = await createInternalNoteAction({ sessionId: S.conv, content: "Contrato firmado y foto del local", adjuntos: [foto(), pdf()] });
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.adjuntos.length, 2);
    assert.deepEqual(r.data.adjuntos.map((a) => a.tipo), ["image", "document"]);
    assert.equal(await tablaExiste(), true);

    const filas = await filasDeAdjuntos(r.data.id);
    assert.equal(filas.length, 2);
    assert.deepEqual(filas.map((f) => f.orden), [0, 1]);

    // Abrir la conversación después: la nota viene con sus archivos.
    const leida = await getInternalNotesBySessionAction(S.conv);
    assert.equal(leida.success, true);
    const nota = leida.data.find((n) => n.id === r.data.id);
    assert.equal(nota.content, "Contrato firmado y foto del local");
    assert.deepEqual(
        nota.adjuntos.map((a) => [a.nombre, a.tipo, a.mime, a.tamano, a.url]),
        [
            ["foto.png", "image", "image/png", 2048, foto().url],
            ["contrato.pdf", "document", "application/pdf", 4096, pdf().url],
        ],
    );
    S.conArchivos = r.data.id;
});

test("una nota puede ser SOLO un archivo: la bandeja y el aviso de mención dicen que lleva uno", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const audio = { url: url(CUENTA, "nota.webm"), nombre: "nota.webm", mime: "audio/webm", tamano: 900 };
    const r = await createInternalNoteAction({
        sessionId: S.conv, content: "", adjuntos: [audio], mentionedUserIds: [ASESOR],
    });
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.content, "");
    assert.equal(r.data.adjuntos[0].tipo, "audio", "una grabación es audio aunque sea .webm");

    const notas = await lasNotasDeLaBandejaAction();
    const deLaConversacion = notas.find((n) => n.sessionId === S.conv);
    assert.equal(deLaConversacion.texto, "📎 Archivo adjunto", "la fila no enseña un hueco");

    const avisos = await db.collabNotification.findMany({ where: { recipientId: ASESOR, sessionId: S.conv } });
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].content, "🎙️ Audio", "el aviso no llega en blanco");
});

test("una nota vacía —sin texto y sin archivos— no se guarda", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const antes = await cuantasNotas(S.conv);
    const r = await createInternalNoteAction({ sessionId: S.conv, content: "   ", adjuntos: [] });
    assert.equal(r.success, false);
    assert.equal(r.message, "Escribe la nota o adjunta un archivo.");
    assert.equal(await cuantasNotas(S.conv), antes);
});

test("lo que no vale NO se guarda, y una mala no deja pasar a las buenas", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const antes = await cuantasNotas(S.conv);
    const malos = [
        { url: "https://evil.example/x.png", nombre: "x.png", mime: "image/png" },
        { url: `${PUBLICA}/otro-bucket/${llave(CUENTA, "x.png")}`, nombre: "x.png", mime: "image/png" },
        { url: url(CUENTA, "x.png", "chat-equipo"), nombre: "x.png", mime: "image/png" },
        { url: url(OTRO, "x.png"), nombre: "x.png", mime: "image/png" }, // la carpeta de OTRA cuenta
    ];
    for (const malo of malos) {
        const r = await createInternalNoteAction({ sessionId: S.conv, content: "con adjunto malo", adjuntos: [foto(), malo] });
        assert.equal(r.success, false, `no debía guardarse: ${malo.url}`);
    }
    const cinco = Array.from({ length: 5 }, (_, i) => ({ url: url(CUENTA, `f${i}.png`), nombre: `f${i}.png`, mime: "image/png" }));
    const demasiados = await createInternalNoteAction({ sessionId: S.conv, content: "cinco", adjuntos: cinco });
    assert.equal(demasiados.success, false, "más de cuatro no cabe");
    assert.equal(await cuantasNotas(S.conv), antes, "ninguna nota a medias");
});

test("nota y archivos van en UNA transacción: si fallan los archivos no queda la nota", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    const antes = await cuantasNotas(S.conv);
    await db.$executeRawUnsafe(`ALTER TABLE "adjuntos_de_notas" RENAME TO "adjuntos_de_notas_fuera"`);
    try {
        const r = await createInternalNoteAction({ sessionId: S.conv, content: "esta no debe quedar", adjuntos: [foto()] });
        assert.equal(r.success, false);
        assert.equal(await cuantasNotas(S.conv), antes, "la nota se deshizo con sus archivos");
    } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "adjuntos_de_notas_fuera" RENAME TO "adjuntos_de_notas"`);
    }
});

test("la puerta no se afloja: otra cuenta no lee los archivos, y solo el autor borra la nota", { skip: ROTO }, async () => {
    ponerAQuienMira(elOtro());
    const ajena = await getInternalNotesBySessionAction(S.conv);
    assert.equal(ajena.success, false);
    assert.equal(ajena.data, undefined, "ni una nota, ni un archivo");
    const escribe = await createInternalNoteAction({ sessionId: S.conv, content: "intruso", adjuntos: [foto()] });
    assert.equal(escribe.success, false);

    // Un compañero que no la escribió no la borra, y sus archivos siguen.
    ponerAQuienMira(elAsesor());
    const otro = await deleteInternalNoteAction(S.conArchivos);
    assert.equal(otro.success, false);
    assert.equal((await filasDeAdjuntos(S.conArchivos)).length, 2);
});

test("borrar la nota borra sus archivos —filas y bucket—, y un bucket que falla no impide borrarla", { skip: ROTO }, async () => {
    ponerAQuienMira(laCuenta());
    quitados.length = 0;
    fallan.add(llave(CUENTA, "contrato.pdf"));
    try {
        const r = await deleteInternalNoteAction(S.conArchivos);
        assert.equal(r.success, true, r.message);
    } finally {
        fallan.clear();
    }
    assert.equal((await filasDeAdjuntos(S.conArchivos)).length, 0, "las filas se fueron con la nota");
    assert.equal(await db.internalNote.count({ where: { id: S.conArchivos } }), 0);
    assert.deepEqual(
        quitados.map((q) => [q.bucket, q.llave]),
        [[BUCKET, llave(CUENTA, "foto.png")]],
        "se soltó del bucket el archivo que se pudo; el que falló no tumbó nada",
    );

    // Borrar una nota SIN archivos no toca el bucket.
    quitados.length = 0;
    const texto = await createInternalNoteAction({ sessionId: S.conv, content: "nota de texto" });
    assert.equal((await deleteInternalNoteAction(texto.data.id)).success, true);
    assert.equal(quitados.length, 0);
});
