/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Correos, encima de
 * `sembrar-barra.mjs` (la cuenta y su menú).
 *
 * Tres buzones de Gmail conectados a la persona —ventas, soporte y
 * facturación—, el de soporte con su firma encendida. Sus credenciales se
 * SELLAN igual que las sella la plataforma (`lib/correo-cifrado.server.ts`:
 * AES-256-GCM con la llave sacada de `AUTH_SECRET` por HKDF), así que la
 * App las abre como cualquier buzón. El access token es de ejemplo y vence
 * dentro de un año: la App no pide renovarlo y el Gmail fingido
 * (`fingido-guia-correo.mjs`) sabe por él de qué buzón le preguntan.
 *
 * Todo es inventado —direcciones, nombres y correos—: la guía es pública.
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 */
import { createCipheriv, hkdfSync, randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { BUZONES } from "./guia-correo-datos.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/correo",
    title: "Guía de Correos",
    description: "Aprende a leer y responder los correos de tu negocio en la plataforma",
    url: "/guia/correo",
});

const secreto = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!secreto) throw new Error("Falta AUTH_SECRET: sin ella la App no podría abrir las credenciales sembradas.");
const LLAVE = Buffer.from(hkdfSync("sha256", secreto, "verzay-correo", "credenciales", 32));

/** El MISMO sello que `sellar` de la plataforma. */
function sellar(datos) {
    const iv = randomBytes(12);
    const cifrador = createCipheriv("aes-256-gcm", LLAVE, iv);
    const cifrado = Buffer.concat([cifrador.update(JSON.stringify(datos), "utf8"), cifrador.final()]);
    return ["v1", iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

// La tabla la crea la App la primera vez; la semilla corre antes, así que la
// pone ella con la MISMA forma (`lib/correo-db.ts`).
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "correo_cuentas" (
        "id" TEXT PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "cuentaId" TEXT,
        "proveedor" TEXT NOT NULL,
        "direccion" TEXT NOT NULL,
        "nombre" TEXT,
        "credenciales" TEXT NOT NULL,
        "estado" TEXT NOT NULL DEFAULT 'conectada',
        "ultimoError" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "correo_cuentas_persona_buzon_key" ON "correo_cuentas" ("personaId", "proveedor", "direccion")`,
);
await db.$executeRawUnsafe(`ALTER TABLE "correo_cuentas" ADD COLUMN IF NOT EXISTS "firma" TEXT`);
await db.$executeRawUnsafe(`ALTER TABLE "correo_cuentas" ADD COLUMN IF NOT EXISTS "firmaActiva" BOOLEAN NOT NULL DEFAULT false`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "correo_anclados" (
        "personaId" TEXT NOT NULL,
        "buzonId" TEXT NOT NULL,
        "correoId" TEXT NOT NULL,
        "foto" JSONB NOT NULL,
        "ancladoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("personaId", "buzonId", "correoId")
    )`);

await db.$executeRaw`DELETE FROM "correo_anclados" WHERE "personaId" = ${dueno.id}`;
await db.$executeRaw`DELETE FROM "correo_cuentas" WHERE "personaId" = ${dueno.id}`;

const UN_ANO = 365 * 24 * 60 * 60 * 1000;
let orden = 0;
for (const b of BUZONES) {
    const credenciales = sellar({ tipo: "oauth", accessToken: b.token, refreshToken: `${b.token}-renovar`, expiraEn: Date.now() + UN_ANO });
    // `creadoEn` escalonado: la lista de buzones va en el orden en que se conectaron.
    const creado = new Date(Date.now() - (BUZONES.length - orden++) * 60_000);
    await db.$executeRaw`
        INSERT INTO "correo_cuentas"
            ("id", "personaId", "cuentaId", "proveedor", "direccion", "nombre", "credenciales", "estado", "firma", "firmaActiva", "creadoEn", "actualizadoEn")
        VALUES (${`guia-buzon-${b.clave}`}, ${dueno.id}, ${dueno.id}, 'gmail', ${b.direccion}, ${b.nombre}, ${credenciales},
                'conectada', ${b.firma}, ${Boolean(b.firma)}, ${creado}, ${creado})
    `;
}

// El Gmail fingido vuelve a sus correos de partida al ver esta marca nueva.
writeFileSync("/tmp/guia-correo-reinicio", String(Date.now()));

console.log(`[guia-correo] ${BUZONES.length} buzones sembrados para ${dueno.email}`);
await db.$disconnect();
