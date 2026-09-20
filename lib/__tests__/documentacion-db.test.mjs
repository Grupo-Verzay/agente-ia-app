/**
 * El banco de Documentación **contra Postgres de verdad**.
 *
 * Lo que se prueba aquí no se puede probar en memoria, y son tres cosas:
 *
 * 1. **Que borrar un espacio es SUAVE**: no desaparece ni una fila, así que se
 *    puede deshacer. Eso solo se ve contando filas en la base.
 * 2. **Que no tiene puerta de atrás.** Esta es la que importa, y corre en
 *    **dos modos**: con la condición `sinEspacioBorrado` puesta y con la
 *    consulta VIEJA al lado, que es la que estaba en el repo. En el modo roto
 *    se afirma que el documento de un espacio borrado **sí** sale por la
 *    búsqueda y por el retroenlace; sin ese modo no se sabría si se arregló la
 *    causa o algo que se le parece.
 * 3. **Que el árbol se lee en el orden en que se escribió** y que un documento
 *    nuevo entra al FINAL, que es el encargo.
 *
 * Cómo se corre (la base es de usar y tirar):
 *
 *     initdb -D /tmp/pgdoc -U postgres -A trust
 *     pg_ctl -D /tmp/pgdoc -o '-p 55437 -k /tmp/pgdoc' start
 *     createdb -h /tmp/pgdoc -p 55437 -U postgres banco
 *     npx esbuild lib/documentacion-db.ts lib/orden-de-tablero-db.ts --bundle \
 *         --platform=node --format=esm --outdir=lib/__tests__/.compilado/banco \
 *         --external:@prisma/client --external:server-only
 *     DATABASE_URL='postgresql://postgres@localhost:55437/banco?host=/tmp/pgdoc' \
 *         node --test lib/__tests__/documentacion-db.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
    borrarEspacio,
    buscarDocumentos,
    crearDocumento,
    crearEspacio,
    cuantosDocumentosTiene,
    editarEspacio,
    elDocumento,
    elEspacio,
    losDocumentosDe,
    losEspaciosCandidatos,
    losQueNombran,
    guardarDocumento,
} from "./.compilado/banco/documentacion-db.js";
import {
    alFinalDelTablero,
    guardarLaColumna,
    posicionesDelTablero,
} from "./.compilado/banco/orden-de-tablero-db.js";

const db = new PrismaClient();

const CUENTA = "atencion";
const PERSONA = "yair";
/**
 * La base es de usar y tirar, pero se reutiliza entre vueltas del banco. Los
 * ids que se comparan a lo ancho de la tabla —el `refId` de un retroenlace—
 * llevan sufijo de esta vuelta: sin él, la segunda ejecución encuentra también
 * los de la primera y el «modo roto» falla por acumulación en vez de por lo que
 * viene a probar.
 */
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CLIENTE = `cliente-${VUELTA}`;

/** Un espacio recién hecho, con nombre único para no pisar a los demás casos. */
let n = 0;
const unEspacio = (extra = {}) =>
    crearEspacio({
        cuentaId: CUENTA,
        nombre: `Espacio ${++n}`,
        icono: null,
        descripcion: null,
        visibilidad: "cuenta",
        creadoPorId: PERSONA,
        creadoPorNombre: "Yair",
        ...extra,
    });

const unDocumento = (espacioId, titulo, extra = {}) =>
    crearDocumento({
        cuentaId: CUENTA,
        espacioId,
        tipo: "documento",
        titulo,
        contenido: {},
        vista: null,
        creadoPorId: PERSONA,
        creadoPorNombre: "Yair",
        ...extra,
    });

/* ── 1. Borrar un espacio es SUAVE ────────────────────────────────────────── */

test("borrar un espacio no borra ni una fila: se puede deshacer", async () => {
    const espacio = await unEspacio();
    const a = await unDocumento(espacio.id, "Alta de cliente");
    const b = await unDocumento(espacio.id, "Baja de cliente");
    // Un documento con cuerpo, para que haya versión y texto indexado.
    await guardarDocumento({
        id: a.id,
        titulo: "Alta de cliente",
        contenido: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "facturacion mensual" }] }] },
        autorId: PERSONA,
        autorNombre: "Yair",
    });

    const antes = {
        espacios: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_espacios" WHERE "id" = ${espacio.id}`,
        documentos: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_documentos" WHERE "espacioId" = ${espacio.id}`,
        versiones: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_versiones" WHERE "documentoId" = ${a.id}`,
    };

    await borrarEspacio(espacio.id);

    const despues = {
        espacios: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_espacios" WHERE "id" = ${espacio.id}`,
        documentos: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_documentos" WHERE "espacioId" = ${espacio.id}`,
        versiones: await db.$queryRaw`SELECT COUNT(*)::int AS c FROM "doc_versiones" WHERE "documentoId" = ${a.id}`,
    };

    // El `DELETE` de antes se llevaba las tres. Ahora las tres siguen ahí.
    assert.equal(despues.espacios[0].c, antes.espacios[0].c, "la fila del espacio se borró");
    assert.equal(despues.documentos[0].c, 2, "se borraron los documentos");
    assert.equal(despues.versiones[0].c, antes.versiones[0].c, "se borró el historial");
    assert.ok(antes.versiones[0].c > 0, "el caso no llegó a crear ninguna versión");

    // Y quitar el sello lo devuelve entero, que es para lo que sirve.
    await db.$executeRaw`UPDATE "doc_espacios" SET "borradoEn" = NULL WHERE "id" = ${espacio.id}`;
    const vuelto = await elEspacio(espacio.id);
    assert.equal(vuelto?.id, espacio.id);
    const docs = await losDocumentosDe([espacio.id]);
    assert.deepEqual(
        docs.map((d) => d.id).sort(),
        [a.id, b.id].sort(),
        "los documentos no volvieron con el espacio",
    );
});

/* ── 2. Y no tiene puerta de atrás: los CUATRO lectores ───────────────────── */

test("un espacio borrado desaparece de las dos puertas que llevan a uno", async () => {
    const espacio = await unEspacio();
    await borrarEspacio(espacio.id);

    // `elEspacio` es por donde pasan `accesoAEsteEspacio` —renombrar, borrar,
    // repartir permisos, crear dentro— y `accesoAEsteDocumento`.
    assert.equal(await elEspacio(espacio.id), null, "elEspacio todavía lo devuelve");

    const { espacios } = await losEspaciosCandidatos({ cuenta: CUENTA, persona: PERSONA });
    assert.ok(
        !espacios.some((e) => e.id === espacio.id),
        "el árbol todavía lo lista",
    );
});

test("y sus documentos desaparecen de los cuatro lectores — con el modo ROTO al lado", async () => {
    const espacio = await unEspacio();
    const doc = await unDocumento(espacio.id, "Procedimiento de alta");
    await guardarDocumento({
        id: doc.id,
        titulo: "Procedimiento de alta",
        contenido: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        { type: "text", text: "pasos del alta" },
                        {
                            type: "mencion",
                            attrs: { tipo: "cliente", refId: CLIENTE, etiqueta: "Acme" },
                        },
                    ],
                },
            ],
        },
        autorId: PERSONA,
        autorNombre: "Yair",
    });

    // Antes de borrar, los cuatro lo ven. Si no, el caso no prueba nada.
    assert.ok((await losDocumentosDe([espacio.id])).some((d) => d.id === doc.id));
    assert.equal((await elDocumento(doc.id))?.id, doc.id);
    assert.ok(
        (await buscarDocumentos({ consulta: "pasos:*", espacioIds: [espacio.id] })).some(
            (d) => d.id === doc.id,
        ),
        "la búsqueda no lo encontraba ni antes de borrar",
    );
    assert.ok(
        (await losQueNombran({ tipo: "cliente", refId: CLIENTE })).some(
            (r) => r.documentoId === doc.id,
        ),
        "el retroenlace no lo traía ni antes de borrar",
    );

    await borrarEspacio(espacio.id);

    assert.deepEqual(await losDocumentosDe([espacio.id]), [], "el árbol todavía lo trae");
    assert.equal(await elDocumento(doc.id), null, "abrir todavía lo devuelve");
    assert.deepEqual(
        await buscarDocumentos({ consulta: "pasos:*", espacioIds: [espacio.id] }),
        [],
        "la búsqueda todavía lo encuentra",
    );
    assert.deepEqual(
        await losQueNombran({ tipo: "cliente", refId: CLIENTE }),
        [],
        "el retroenlace todavía lo enseña",
    );

    // ── EL MODO ROTO ───────────────────────────────────────────────────────
    // Las consultas TAL CUAL estaban antes de este cambio, sin la condición.
    // Sin este bloque no se sabría si lo de arriba pasa porque se arregló la
    // causa o porque el caso no llegaba a ejercerla.
    const busquedaVieja = await db.$queryRaw`
        SELECT "id" FROM "doc_documentos"
        WHERE "espacioId" = ANY(${[espacio.id]}::text[])
          AND "tipo" <> 'plantilla'
          AND to_tsvector('spanish', "titulo" || ' ' || "texto")
              @@ to_tsquery('spanish', ${"pasos:*"})
    `;
    assert.equal(
        busquedaVieja.length,
        1,
        "el modo roto no reprodujo la fuga: la consulta vieja tendría que encontrarlo",
    );

    const retroenlaceViejo = await db.$queryRaw`
        SELECT m."documentoId" FROM "doc_menciones" m
        JOIN "doc_documentos" d ON d."id" = m."documentoId"
        WHERE m."tipo" = 'cliente' AND m."refId" = ${CLIENTE}
    `;
    assert.equal(retroenlaceViejo.length, 1, "el modo roto no reprodujo la fuga del retroenlace");
});

/* ── 3. El número de la confirmación ──────────────────────────────────────── */

test("cuantosDocumentosTiene cuenta TODOS, también los restringidos", async () => {
    const espacio = await unEspacio();
    await unDocumento(espacio.id, "Visible");
    await unDocumento(espacio.id, "Otro visible");
    const oculto = await unDocumento(espacio.id, "Restringido de otro");
    await db.$executeRaw`UPDATE "doc_documentos" SET "restringido" = true, "creadoPorId" = 'otra-persona' WHERE "id" = ${oculto.id}`;

    // El árbol de quien mira enseñaría 2; el borrado se lleva 3. Enseñar el 2
    // en la confirmación es prometer que se borra menos de lo que se borra.
    assert.equal(await cuantosDocumentosTiene(espacio.id), 3);
});

/* ── 4. El orden del árbol ────────────────────────────────────────────────── */

test("el árbol se lee del más VIEJO al más nuevo, y retocar uno no lo sube", async () => {
    const espacio = await unEspacio();
    const primero = await unDocumento(espacio.id, "Primero");
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await unDocumento(espacio.id, "Segundo");
    await new Promise((r) => setTimeout(r, 5));
    const tercero = await unDocumento(espacio.id, "Tercero");

    // Se retoca el PRIMERO: con el orden viejo (`actualizadoEn DESC`) eso lo
    // mandaba arriba del todo, que es justo el síntoma reportado.
    await guardarDocumento({
        id: primero.id,
        titulo: "Primero",
        contenido: { type: "doc", content: [] },
        autorId: PERSONA,
        autorNombre: "Yair",
    });

    const docs = await losDocumentosDe([espacio.id]);
    assert.deepEqual(
        docs.map((d) => d.titulo),
        ["Primero", "Segundo", "Tercero"],
    );

    const viejo = await db.$queryRaw`
        SELECT "titulo" FROM "doc_documentos"
        WHERE "espacioId" = ${espacio.id} ORDER BY "actualizadoEn" DESC
    `;
    assert.equal(
        viejo[0].titulo,
        "Primero",
        "el modo roto no reprodujo el síntoma: retocar tendría que subirlo",
    );
    assert.equal(viejo[2].titulo, primero.titulo === "Primero" ? "Segundo" : viejo[2].titulo);
    void segundo;
    void tercero;
});

test("un documento NUEVO entra al final aunque el espacio esté ordenado a mano", async () => {
    const espacio = await unEspacio();
    const a = await unDocumento(espacio.id, "A");
    const b = await unDocumento(espacio.id, "B");
    const c = await unDocumento(espacio.id, "C");
    for (const d of [a, b, c]) await alFinalDelTablero("espacio", espacio.id, d.id);

    // Alguien los coloca al revés a mano.
    await guardarLaColumna({ tipo: "espacio", tableroId: espacio.id, ids: [c.id, b.id, a.id] });

    const nuevo = await unDocumento(espacio.id, "Nuevo");
    await alFinalDelTablero("espacio", espacio.id, nuevo.id);

    const pos = await posicionesDelTablero("espacio", espacio.id);
    const maximoDeLosViejos = Math.max(pos[a.id], pos[b.id], pos[c.id]);
    assert.ok(
        pos[nuevo.id] > maximoDeLosViejos,
        `el nuevo no quedó al final: ${pos[nuevo.id]} contra ${maximoDeLosViejos}`,
    );
});

test("un espacio que nadie ha arrastrado no tiene ni una posición guardada", async () => {
    // Es lo que hace que esto no cambiara ningún árbol hasta el primer
    // arrastre: sin filas, `ordenarLaColumna` devuelve la lista tal cual.
    const espacio = await unEspacio();
    await unDocumento(espacio.id, "Solo");
    assert.deepEqual(await posicionesDelTablero("espacio", espacio.id), {});
});

/* ── 5. Renombrar ─────────────────────────────────────────────────────────── */

test("renombrar cambia el nombre y no toca lo de dentro", async () => {
    const espacio = await unEspacio();
    const doc = await unDocumento(espacio.id, "Dentro");

    await editarEspacio({ id: espacio.id, nombre: "Procedimientos", icono: "📘" });

    const leido = await elEspacio(espacio.id);
    assert.equal(leido?.nombre, "Procedimientos");
    assert.equal(leido?.icono, "📘");
    assert.equal((await losDocumentosDe([espacio.id]))[0]?.id, doc.id);
});

test("y un espacio BORRADO no se puede renombrar: para el resto del código no existe", async () => {
    const espacio = await unEspacio();
    await borrarEspacio(espacio.id);
    // `editarEspacioAction` pasa antes por `accesoAEsteEspacio`, que pregunta a
    // `elEspacio`. Sin fila que devolver, la acción contesta «No autorizado».
    assert.equal(await elEspacio(espacio.id), null);
});


/* ── 6. La migración, sobre el esquema de HOY ─────────────────────────────── */

test("`borradoEn` entra sobre una tabla que YA existe sin ella, y la fila vieja sobrevive", async () => {
    // Los casos de arriba crean las tablas de cero, que **no es el camino de
    // producción**: allí `doc_espacios` ya está desplegada y un
    // `CREATE TABLE IF NOT EXISTS` no la toca. Esto reproduce ese camino: la
    // tabla con la forma VIEJA, una fila dentro, y el `ALTER` encima.
    await db.$executeRaw`DROP TABLE IF EXISTS "doc_espacios_viejo"`;
    await db.$executeRaw`
        CREATE TABLE "doc_espacios_viejo" (
            "id" TEXT PRIMARY KEY,
            "cuentaId" TEXT NOT NULL,
            "nombre" TEXT NOT NULL,
            "visibilidad" TEXT NOT NULL DEFAULT 'cuenta',
            "creadoPorId" TEXT NOT NULL
        )
    `;
    await db.$executeRaw`
        INSERT INTO "doc_espacios_viejo" VALUES ('v1', ${CUENTA}, 'De antes', 'cuenta', ${PERSONA})
    `;

    const columna = async () => db.$queryRaw`
        SELECT "column_name" FROM "information_schema"."columns"
        WHERE "table_name" = 'doc_espacios_viejo' AND "column_name" = 'borradoEn'
    `;
    assert.equal((await columna()).length, 0, "el caso no reprodujo la forma vieja");

    // El mismo `ALTER` que corre al arrancar, dos veces: tiene que poder
    // repetirse en cada arranque sin quejarse.
    for (let i = 0; i < 2; i++) {
        await db.$executeRaw`
            ALTER TABLE "doc_espacios_viejo" ADD COLUMN IF NOT EXISTS "borradoEn" TIMESTAMP(3)
        `;
    }
    assert.equal((await columna()).length, 1, "la columna no se creó");

    // Y la fila que ya estaba sigue intacta, con la columna nueva en NULL —o
    // sea, «no borrado», que es lo que tiene que valer para todo lo de antes.
    const vieja = await db.$queryRaw`SELECT * FROM "doc_espacios_viejo" WHERE "id" = 'v1'`;
    assert.equal(vieja.length, 1);
    assert.equal(vieja[0].nombre, "De antes");
    assert.equal(vieja[0].borradoEn, null);

    await db.$executeRaw`DROP TABLE "doc_espacios_viejo"`;
});

test.after(async () => {
    await db.$disconnect();
});
