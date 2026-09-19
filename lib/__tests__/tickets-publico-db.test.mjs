/**
 * El enlace público de Tickets, **contra Postgres de verdad** y con las
 * acciones de producción. Lo único que se finge es `revalidatePath`
 * (`fingido/next-cache.ts`), que necesita una petición de Next y no decide
 * nada; la lista de países es la de verdad.
 *
 * El invariante que esto protege, en una línea:
 *
 *   **El CÓDIGO es la única puerta, y lo que decide a dónde va el ticket sale
 *   del código — nunca de lo que mande el navegador.**
 *
 * De ahí cuelga todo lo demás: la bandeja a la que cae, la carpeta del bucket
 * cuyos archivos se admiten y el lead al que se engancha. Un enlace público que
 * aceptara cualquiera de esas tres cosas del cuerpo de la petición sería una
 * forma de meterle tickets —y `<img>` apuntando a donde sea— en el tablero de
 * otra cuenta.
 *
 * Y las dos cosas que no se ven mirando la pantalla:
 *
 *   - El número se **vuelve a armar en el servidor**. Lo que llega es lo
 *     tecleado, no el resultado: dar por bueno el número final sería dejar que
 *     quien manda la petición elija a qué teléfono se le avisa después. Aquí
 *     está el caso dominicano —809, 829 y 849 sobre el mismo +1— ejercido de
 *     punta a punta, no solo en la función pura.
 *   - Un ticket público **no sale en «Mis tickets»**. Cae en la bandeja de la
 *     cuenta como cualquier otro, pero `clienteId` es la propia cuenta, así que
 *     sin el filtro de `origen` la cuenta se vería a sí misma pidiéndose
 *     soporte.
 *
 * Cómo se corre (la base es de usar y tirar):
 *
 *     initdb -D /tmp/pgtick -U postgres -A trust
 *     pg_ctl -D /tmp/pgtick -o '-p 5433' start
 *     createdb -h 127.0.0.1 -p 5433 -U postgres tickpub
 *     DATABASE_URL=… DIRECT_URL=… npx prisma db push --skip-generate
 *     npx esbuild actions/tickets-publico-actions.ts lib/tickets-db.ts \
 *         --bundle --splitting --platform=node --format=esm \
 *         --outdir=lib/__tests__/.compilado/banco \
 *         --external:@prisma/client --external:server-only --alias:@=. \
 *         --alias:next/cache=./lib/__tests__/fingido/next-cache.ts
 *     sed -i '/server-only/d' lib/__tests__/.compilado/banco/*.js \
 *         lib/__tests__/.compilado/banco/*&#47;*.js
 *     DATABASE_URL='postgresql://postgres@127.0.0.1:5433/tickpub' \
 *     S3_PUBLIC_URL='https://media.ia-app.com' S3_BUCKET_NAME='verzay-media' \
 *         node --test lib/__tests__/tickets-publico-db.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const banco = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado", "banco");
const { enviarTicketPublicoAction, laFichaPublicaAction } = await import(
    path.join(banco, "actions", "tickets-publico-actions.js")
);
const {
    asegurarElEnlace,
    cambiarElEnlace,
    laCuentaDelCodigo,
    losTicketsDelCliente,
    losTicketsDelDestino,
} = await import(path.join(banco, "lib", "tickets-db.js"));
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

const UNA = "cuenta-una";
const OTRA = "cuenta-otra";
const LINEA_UNA = "LINEA_UNA";

// La MISMA forma que escribe la ruta de subida: público/bucket/llave.
const PUBLICO = (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");
const CUBO = process.env.S3_BUCKET_NAME || "verzay-media";
const adjuntoDe = (duena, fichero = "abc-foto.png") => ({
    url: `${PUBLICO}/${CUBO}/${duena}/tickets-publico/${fichero}`,
    nombre: "foto.png",
    tipo: "image",
});

// ── La semilla ───────────────────────────────────────────────────────────────

await db.$executeRawUnsafe(`TRUNCATE "User" CASCADE`);
await db.$executeRawUnsafe(
    `TRUNCATE "tickets_enlace_publico","tickets_de_soporte","ticket_attachments","orden_en_tablero"`,
);

for (const [id, nombre, marca, numero] of [
    [UNA, "Servicios Acme", "Acme Soporte", "573001112233"],
    // Sin marca: manda `company`, y nunca el `name` interno.
    [OTRA, "Beta SAS", null, "18091234567"],
]) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","name","email","role","status","brand_name","notificationNumber","company","updatedAt")
         VALUES ($1,$2,$3,'user'::"Role",true,$4,$5,$6,CURRENT_TIMESTAMP)`,
        id, `${nombre} (interno)`, `${id}@ejemplo.com`, marca, numero, nombre,
    );
}
// Una línea para `UNA`: es lo que deja crear el lead. `OTRA` se queda SIN
// ninguna a propósito — es el caso de una cuenta que todavía no ha conectado
// ningún WhatsApp, y el ticket tiene que entrar igual.
await db.$executeRawUnsafe(
    `INSERT INTO "Instancias" ("userId","instanceName","instanceId","instanceType")
     VALUES ($1,$2,$3,'Whatsapp')`,
    UNA, "ACME_VENTAS", LINEA_UNA,
);

const ficha = (extra = {}) => ({
    codigo: "",
    nombre: "María Gómez",
    indicativo: "+57",
    telefono: "3001234567",
    titulo: "No me carga el código QR",
    descripcion: "Desde esta mañana el QR sale en blanco.",
    adjuntos: [],
    ...extra,
});

// El enlace de cada cuenta. `CODIGO` es `let` porque una prueba de más abajo
// borra la fila a propósito para ejercer la carrera de tres pestañas, y el
// código que sale de ahí es otro: cacheado, el resto del banco preguntaría por
// uno que ya no existe.
let CODIGO = (await asegurarElEnlace(UNA)).codigo;
const CODIGO_OTRA = (await asegurarElEnlace(OTRA)).codigo;

// ── 1. El enlace es PERMANENTE y de la cuenta ────────────────────────────────

test("pedirlo dos veces da el mismo código, y dos cuentas no lo comparten", async () => {
    assert.equal((await asegurarElEnlace(UNA)).codigo, CODIGO);
    assert.notEqual(CODIGO, CODIGO_OTRA);
    assert.match(CODIGO, /^[A-Za-z0-9_-]{8,64}$/, "base64url, que es lo que va en una URL");
});

test("tres pestañas abriendo el tablero a la vez dejan UNA fila", async () => {
    // Con `INSERT … ON CONFLICT DO NOTHING` lo serializa Postgres. Sin eso,
    // tres lecturas simultáneas verían las tres que no existe y escribirían
    // tres códigos, de los que dos quedarían repartidos y muertos.
    await db.$executeRawUnsafe(`DELETE FROM "tickets_enlace_publico" WHERE "cuentaId" = $1`, UNA);
    const tres = await Promise.all([
        asegurarElEnlace(UNA),
        asegurarElEnlace(UNA),
        asegurarElEnlace(UNA),
    ]);
    const [{ n }] = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "tickets_enlace_publico" WHERE "cuentaId" = $1`, UNA,
    );
    assert.equal(n, 1);
    assert.equal(new Set(tres.map((t) => t.codigo)).size, 1);
    CODIGO = tres[0].codigo;
});

// ── 2. El código es la ÚNICA puerta ──────────────────────────────────────────

test("un código inventado o vacío no resuelve a nadie", async () => {
    assert.equal(await laCuentaDelCodigo("no-existe"), null);
    assert.equal(await laCuentaDelCodigo(""), null);
});

test("apagado no resuelve, no deja enviar, y no se distingue de uno que nunca existió", async () => {
    const codigo = (await asegurarElEnlace(UNA)).codigo;
    await cambiarElEnlace(UNA, false);
    assert.equal(await laCuentaDelCodigo(codigo), null);

    const res = await enviarTicketPublicoAction(ficha({ codigo }));
    assert.equal(res.success, false);

    // Decir «existe pero está cerrado» ya cuenta algo de una cuenta a quien
    // solo tiene una cadena de texto.
    const apagada = await laFichaPublicaAction(codigo);
    const inventada = await laFichaPublicaAction("no-existe");
    assert.equal(apagada.message, inventada.message);

    await cambiarElEnlace(UNA, true);
    // **El código no se regenera al volver a encenderlo**: ya está repartido en
    // conversaciones de WhatsApp que nadie va a volver a leer.
    assert.equal((await asegurarElEnlace(UNA)).codigo, codigo);
});

// ── 3. La ficha enseña la cuenta, y nada más ─────────────────────────────────

test("el nombre que se ve es el comercial, y no viaja nada más de la cuenta", async () => {
    const vista = await laFichaPublicaAction(CODIGO);
    assert.equal(vista.data.cuentaNombre, "Acme Soporte");
    assert.deepEqual(
        Object.keys(vista.data).sort(),
        ["cuentaLogo", "cuentaNombre", "indicativoPorDefecto", "paises"],
    );

    const otra = await laFichaPublicaAction(CODIGO_OTRA);
    assert.equal(otra.data.cuentaNombre, "Beta SAS", "sin marca manda `company`");
});

test("el país por defecto sale del número de la cuenta, con el área dentro", async () => {
    // `User` no tiene columna de país —añadirla desde la App es el #360— así
    // que el único dato de país que hay es su propio número.
    assert.equal((await laFichaPublicaAction(CODIGO)).data.indicativoPorDefecto, "+57");
    // Y un dominicano se reconoce como +1809, no como el +1 de Estados Unidos.
    assert.equal((await laFichaPublicaAction(CODIGO_OTRA)).data.indicativoPorDefecto, "+1809");
});

// ── 4. AISLAMIENTO ───────────────────────────────────────────────────────────

test("cada ticket cae SOLO en la bandeja de su cuenta", async () => {
    const antesUna = (await losTicketsDelDestino(UNA, null)).length;
    const antesOtra = (await losTicketsDelDestino(OTRA, null)).length;

    assert.equal((await enviarTicketPublicoAction(ficha({ codigo: CODIGO }))).success, true);
    assert.equal(
        (await enviarTicketPublicoAction(
            ficha({ codigo: CODIGO_OTRA, indicativo: "+1809", telefono: "8091234567", titulo: "El de la otra" }),
        )).success,
        true,
    );

    const deUna = await losTicketsDelDestino(UNA, null);
    const deOtra = await losTicketsDelDestino(OTRA, null);
    assert.equal(deUna.length - antesUna, 1);
    assert.equal(deOtra.length - antesOtra, 1);
    assert.equal(deUna.some((t) => t.titulo === "El de la otra"), false);
});

test("entra con estado recibido, SIN responsable y con quien lo escribió", async () => {
    await enviarTicketPublicoAction(ficha({ codigo: CODIGO, titulo: "Recién llegado" }));
    const t = (await losTicketsDelDestino(UNA, null)).find((x) => x.titulo === "Recién llegado");
    assert.equal(t.estado, "recibido");
    // Dejar que el cliente final elija quién lo atiende y con qué urgencia es
    // darle mandos sobre el equipo de otro.
    assert.equal(t.responsableId ?? null, null);
    assert.equal(t.origen, "publico");
    assert.equal(t.contactoNombre, "María Gómez");
    // Y ese es el nombre que se lee en la tarjeta, no el de la cuenta.
    assert.equal(t.clienteNombre, "María Gómez");
});

// ── 5. El número se ARMA en el servidor ──────────────────────────────────────

for (const [indicativo, escrito, esperado] of [
    ["+57", "3001234567", "573001234567"],
    ["+57", "573001234567", "573001234567"],  // el indicativo repetido se recorta
    ["+1809", "8091234567", "18091234567"],
    ["+1809", "18091234567", "18091234567"],
    // Tecleado con OTRA área dominicana: manda lo escrito, no lo elegido.
    ["+1809", "8291234567", "18291234567"],
]) {
    test(`${indicativo} + «${escrito}» se guarda como ${esperado}`, async () => {
        const titulo = `T ${indicativo} ${escrito}`;
        const res = await enviarTicketPublicoAction(
            ficha({ codigo: CODIGO, indicativo, telefono: escrito, titulo }),
        );
        assert.equal(res.success, true);
        const t = (await losTicketsDelDestino(UNA, null)).find((x) => x.titulo === titulo);
        assert.equal(t.whatsapp, esperado);
    });
}

test("un número que no cuadra se RECHAZA, no se recorta a la fuerza", async () => {
    // Media escalada es peor que ninguna: guardar «12345» como si fuera un
    // teléfono deja un ticket con un aviso imposible y nadie se entera.
    const res = await enviarTicketPublicoAction(
        ficha({ codigo: CODIGO, indicativo: "+57", telefono: "12345", titulo: "Imposible" }),
    );
    assert.equal(res.success, false);
    assert.match(res.message, /10 dígitos/);
    const hay = (await losTicketsDelDestino(UNA, null)).some((t) => t.titulo === "Imposible");
    assert.equal(hay, false);
});

// ── 6. El lead: se engancha si está, se crea si no ───────────────────────────

test("el primer envío crea la ficha de contacto, y el segundo NO la duplica", async () => {
    const cuantas = async () => {
        const [{ n }] = await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS n FROM "Session" WHERE "userId" = $1 AND "remoteJid" LIKE '573001234567%'`,
            UNA,
        );
        return n;
    };
    assert.equal(await cuantas(), 1);

    await enviarTicketPublicoAction(ficha({ codigo: CODIGO, titulo: "Lo mismo otra vez" }));
    assert.equal(await cuantas(), 1, "el mismo cliente no puede salir como dos leads");

    const dos = (await losTicketsDelDestino(UNA, null))
        .filter((t) => t.whatsapp === "573001234567")
        .map((t) => t.sessionId);
    assert.equal(new Set(dos).size, 1, "y todos sus tickets apuntan al mismo");
});

test("se engancha a un lead guardado bajo su identidad ALTERNA", async () => {
    // La regla de siempre de Chats: preguntar por una sola forma «devuelve
    // correcto y vacío», y aquí eso no se vería como un error — se vería como
    // un lead duplicado que aparece solo.
    const creada = await db.session.create({
        data: {
            userId: UNA,
            remoteJid: "999999999999@lid",
            remoteJidAlt: "573009998877@s.whatsapp.net",
            instanceId: LINEA_UNA,
            status: true,
            pushName: "Pedro",
        },
        select: { id: true },
    });

    await enviarTicketPublicoAction(
        ficha({ codigo: CODIGO, telefono: "3009998877", titulo: "Pedro escribe" }),
    );
    const t = (await losTicketsDelDestino(UNA, null)).find((x) => x.titulo === "Pedro escribe");
    assert.equal(t.sessionId, creada.id);

    const [{ n }] = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "Session"
         WHERE "userId" = $1 AND ("remoteJid" LIKE '573009998877%' OR "remoteJidAlt" LIKE '573009998877%')`,
        UNA,
    );
    assert.equal(n, 1, "sin duplicarlo");
});

test("una cuenta SIN línea recibe el ticket igual, solo que sin lead", async () => {
    // El lead necesita una línea de la que colgar; no tenerla no es un fallo
    // del ticket, es una cuenta que todavía no ha conectado un WhatsApp.
    const res = await enviarTicketPublicoAction(
        ficha({ codigo: CODIGO_OTRA, indicativo: "+1809", telefono: "8495554433", titulo: "Sin línea" }),
    );
    assert.equal(res.success, true);
    const t = (await losTicketsDelDestino(OTRA, null)).find((x) => x.titulo === "Sin línea");
    assert.equal(t.sessionId ?? null, null);
});

// ── 7. Un adjunto de OTRA cuenta no entra ────────────────────────────────────

test("solo entran los archivos de la carpeta de ESTA cuenta, y el envío no se cae", async () => {
    // Sin esto, el tablero de quien atiende pintaría un `<img>` —o peor, un
    // `<video>`— apuntando a donde dijera quien mandó la petición.
    const res = await enviarTicketPublicoAction(
        ficha({
            codigo: CODIGO,
            titulo: "Con adjuntos",
            adjuntos: [
                adjuntoDe(UNA),
                adjuntoDe(OTRA),
                { ...adjuntoDe(UNA), url: "https://otro-sitio.com/x/y/z.png" },
            ],
        }),
    );
    // El ticket vale sin sus fotos: perderlo entero por un adjunto ajeno sería
    // dejar sin soporte a quien escribió.
    assert.equal(res.success, true);

    const filas = await db.$queryRawUnsafe(
        `SELECT a."url" FROM "ticket_attachments" a
         JOIN "tickets_de_soporte" t ON t."id" = a."ticketId"
         WHERE t."titulo" = 'Con adjuntos'`,
    );
    assert.equal(filas.length, 1);
    assert.equal(filas[0].url.includes(`/${UNA}/`), true);
});

// ── 8. Un ticket público NO sale en «Mis tickets» ────────────────────────────

test("la cuenta no se ve a sí misma pidiéndose soporte", async () => {
    // `clienteId` es la propia cuenta —el ticket ES suyo— así que sin el filtro
    // de `origen` todos estos saldrían en su lista de «Mis tickets».
    assert.equal((await losTicketsDelCliente(UNA)).length, 0);
    assert.equal((await losTicketsDelDestino(UNA, null)).length > 0, true);
});

test.after(async () => {
    await db.$disconnect();
});
