import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    ESTADOS_POR_DEFECTO,
    TOPE_DE_FILAS,
    TOPE_DE_RESULTADOS,
    TOPE_DE_VERSIONES,
    comoEstados,
    documentoVacio,
    leerElContenido,
    type FilaDeLista,
    type Mencion,
    type TipoDeDocumento,
    type TipoDeMencion,
    type Vista,
} from "@/lib/documentacion";
import type {
    FilaDePermiso,
    Permiso,
    SujetoDePermiso,
    VisibilidadDeEspacio,
} from "@/lib/documentacion-permisos";

/**
 * Dónde vive la documentación interna: seis tablas, todas de la App.
 *
 * ## Por qué tablas nuestras
 *
 * **Las migraciones son del BACKEND** (`docs/db-migrations-ownership.md`), así
 * que nada de esto cuelga de `tasks`, `Project`, `Session` ni `User`: añadirles
 * columnas desde aquí es lo que reventó el #360. Van como `flows`,
 * `tickets_de_soporte` y `work_folders` —`CREATE TABLE IF NOT EXISTS` y **sin
 * ninguna clave foránea**—, así que al borrar algo la limpieza es explícita y
 * no puede reventar el borrado de al lado.
 *
 * ## Las seis, y por qué son seis
 *
 * | tabla | una fila por | crece con |
 * | --- | --- | --- |
 * | `doc_espacios` | carpeta | lo que organiza la cuenta |
 * | `doc_documentos` | documento, lista o plantilla | lo que se escribe |
 * | `doc_versiones` | cambio de un documento | las ediciones, topado |
 * | `doc_menciones` | cosa nombrada dentro de un documento | los enlaces |
 * | `doc_permisos` | quién alcanza qué | lo que se comparte |
 * | `doc_filas` | fila de una lista | lo que se apunta |
 *
 * `doc_filas` es **el único dato de una lista**, y de ahí sale lo de las vistas
 * intercambiables: la tabla, el tablero y el calendario leen estas mismas filas.
 * No hay tres copias que mantener a la par, que es justo lo que hace que en
 * otras herramientas «el calendario a veces no coincide».
 *
 * ## El id es TEXTO
 *
 * Un `uuid` y no un autoincremento: el id viaja al navegador y un entero
 * correlativo diría cuántos documentos tiene la plataforma entera. Es el mismo
 * criterio de `tickets_de_soporte`.
 */

/* ──────────────────────────── Las tablas ────────────────────────────────── */

let tablasListas: Promise<void> | null = null;

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_espacios" (
                "id" TEXT PRIMARY KEY,
                -- La CUENTA duena. De ella cuelga todo lo de dentro, lo escriba
                -- quien lo escriba: es la misma regla que en Proyectos
                -- compartidos, y es lo que impide que un espacio compartido se
                -- parta en tantos trozos como cuentas lo abran.
                "cuentaId" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "icono" TEXT,
                "descripcion" TEXT,
                "visibilidad" TEXT NOT NULL DEFAULT 'cuenta',
                "orden" INTEGER NOT NULL DEFAULT 0,
                -- Quien lo creo: la PERSONA, no la fila efectiva.
                "creadoPorId" TEXT NOT NULL,
                "creadoPorNombre" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        // Borrar un espacio es SUAVE: se sella la fecha y no se borra nada.
        // Entra con `ADD COLUMN IF NOT EXISTS` y **no** reescribiendo el
        // `CREATE`: la tabla ya esta en produccion y un
        // `CREATE TABLE IF NOT EXISTS` no toca una que ya existe. Es el fallo
        // que se comete solo al anadirle una columna a una tabla de la App ya
        // desplegada.
        await db.$executeRaw`
            ALTER TABLE "doc_espacios" ADD COLUMN IF NOT EXISTS "borradoEn" TIMESTAMP(3)
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_espacios_cuenta_idx"
            ON "doc_espacios" ("cuentaId", "orden")
        `;

        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_documentos" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "espacioId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL DEFAULT 'documento',
                "titulo" TEXT NOT NULL,
                -- El cuerpo tal cual lo guarda el editor.
                "contenido" JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- El MISMO cuerpo aplanado a texto. Es lo que indexa el GIN y
                -- de donde sale el extracto de un resultado. Se escribe aqui y
                -- no se calcula al leer: aplanar un JSON en cada busqueda seria
                -- recorrer todos los documentos de la cuenta para contestar.
                "texto" TEXT NOT NULL DEFAULT '',
                -- Una lista guarda aqui sus columnas y su vista por defecto.
                "estados" JSONB,
                "vista" TEXT,
                -- Restringido dentro de su propio espacio. Cuando es cierto el
                -- documento desaparece TAMBIEN del listado: ver la regla en
                -- documentacion-permisos.ts.
                "restringido" BOOLEAN NOT NULL DEFAULT false,
                "version" INTEGER NOT NULL DEFAULT 1,
                "creadoPorId" TEXT NOT NULL,
                "creadoPorNombre" TEXT,
                "actualizadoPorId" TEXT,
                "actualizadoPorNombre" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_documentos_espacio_idx"
            ON "doc_documentos" ("espacioId", "actualizadoEn" DESC)
        `;
        // El arbol lee por `("espacioId", "creadoEn")`: el orden de lectura de
        // un espacio es el de CREACION, no el del ultimo retoque. Ver
        // `losDocumentosDe`.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_documentos_espacio_creado_idx"
            ON "doc_documentos" ("espacioId", "creadoEn")
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_documentos_cuenta_idx"
            ON "doc_documentos" ("cuentaId", "tipo")
        `;
        // El GIN es lo que evita recorrer la tabla al buscar, y la lista de
        // espacios que alguien alcanza es la PUERTA. Son dos cosas distintas y
        // hacen falta las dos: medido en el chat de equipo, con el mismo
        // recorte por canal, quitar el indice multiplicaba por ocho.
        //
        // `'spanish'` para que «facturas» encuentre «factura». Y **sin
        // `CREATE EXTENSION`**: `pg_trgm` haria falta para un `ILIKE '%x%'` con
        // indice, pero instalar una extension pide permisos que la App no tiene
        // por que tener, y el dia que no los tenga esto fallaria al arrancar.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_documentos_texto_idx"
            ON "doc_documentos"
            USING GIN (to_tsvector('spanish', "titulo" || ' ' || "texto"))
        `;

        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_versiones" (
                "id" TEXT PRIMARY KEY,
                "documentoId" TEXT NOT NULL,
                "version" INTEGER NOT NULL,
                "titulo" TEXT NOT NULL,
                "contenido" JSONB NOT NULL,
                -- Quien la escribio: la PERSONA. Y el nombre COPIADO dentro,
                -- como autorNombre en el chat de equipo: el historial sigue
                -- diciendo quien cambio que aunque esa persona salga del equipo.
                "autorId" TEXT NOT NULL,
                "autorNombre" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_versiones_documento_idx"
            ON "doc_versiones" ("documentoId", "version" DESC)
        `;

        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_menciones" (
                "documentoId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "refId" TEXT NOT NULL,
                -- La etiqueta COPIADA: el documento sigue diciendo de quien se
                -- hablaba aunque despues se borre el cliente o la tarea.
                "etiqueta" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("documentoId", "tipo", "refId")
            )
        `;
        // El indice del RETROENLACE: «que documentos nombran a esta tarea».
        // Empieza por (tipo, refId) porque esa es la pregunta; la clave
        // primaria empieza por el documento y sirve para la contraria.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_menciones_ref_idx"
            ON "doc_menciones" ("tipo", "refId")
        `;

        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_permisos" (
                "objetoTipo" TEXT NOT NULL,
                "objetoId" TEXT NOT NULL,
                -- persona o cuenta, y por eso son dos columnas y no un id a
                -- secas: una cuenta tambien es una fila de User, asi que sin
                -- el tipo no habria forma de saber cual es cual. Es la misma
                -- razon por la que team_channel_accounts se hizo aparte.
                "sujetoTipo" TEXT NOT NULL,
                "sujetoId" TEXT NOT NULL,
                "permiso" TEXT NOT NULL DEFAULT 'lectura',
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("objetoTipo", "objetoId", "sujetoTipo", "sujetoId")
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_permisos_sujeto_idx"
            ON "doc_permisos" ("sujetoTipo", "sujetoId")
        `;

        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "doc_filas" (
                "id" TEXT PRIMARY KEY,
                "documentoId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "titulo" TEXT NOT NULL,
                "estado" TEXT NOT NULL,
                -- Lo que usa el CALENDARIO, y es del propio dato: no hay una
                -- tabla de eventos al lado que haya que mantener a la par.
                "fecha" TIMESTAMP(3),
                "asignadoId" TEXT,
                "asignadoNombre" TEXT,
                "notas" TEXT,
                "creadoPorId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_filas_documento_idx"
            ON "doc_filas" ("documentoId", "creadoEn")
        `;
        // El calendario pide un rango de fechas de UNA lista.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "doc_filas_fecha_idx"
            ON "doc_filas" ("documentoId", "fecha")
        `;
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

/* ───────────────────────── Un espacio borrado no existe ─────────────────── */

/**
 * «Su espacio no está borrado», para el `WHERE` de cualquier consulta de
 * documentos.
 *
 * Se escribe **una vez** y se importa, igual que `sinGruposSql(alias)` para los
 * grupos del CRM. Y por el mismo motivo: la condición está en las cuatro
 * consultas que traen documentos de la nada —el árbol, abrir, la búsqueda y los
 * retroenlaces— y escribirla a mano en cuatro sitios es garantizar que la
 * quinta se olvide. Un documento de un espacio borrado que se cuela en la
 * búsqueda o en un retroenlace se lee como que borrar no funciona.
 *
 * Lo que ya entró por una de esas cuatro no la vuelve a llevar: el `SELECT …
 * FOR UPDATE` de `guardarDocumento` corre **detrás** de `accesoAEsteDocumento`,
 * que pasa por `elDocumento`.
 *
 * Va como `NOT EXISTS` y no como `JOIN`: así entra por la clave primaria de
 * `doc_espacios` y no cambia el plan de la consulta que la lleva.
 */
export function sinEspacioBorrado(alias: string): Prisma.Sql {
    // El alias lo pone esta casa, nunca el navegador: se interpola a mano
    // porque un identificador no puede ir como parámetro.
    const a = Prisma.raw(`"${alias.replace(/[^A-Za-z0-9_]/g, "")}"`);
    return Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "doc_espacios" e
        WHERE e."id" = ${a}."espacioId" AND e."borradoEn" IS NOT NULL
    )`;
}

/** ¿Es el `42P01` de Postgres —«no existe la tabla»—? */
function faltaLaTabla(error: unknown): boolean {
    // En una consulta en crudo el `code` de primer nivel es el de Prisma
    // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntar solo
    // por el de arriba es lo que dejó el reintento de `task_comments` sin
    // dispararse nunca. Se miran los dos sitios, y el texto.
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    if (e?.code === "42P01" || e?.meta?.code === "42P01") return true;
    return String(e?.message ?? "").includes("42P01");
}

/**
 * Corre algo contra las tablas, creándolas si hicieran falta. **Una** vez.
 *
 * El recuerdo de «ya las creé» es del PROCESO, no de la base: si desaparecen
 * por debajo —una restauración, un entorno recién levantado— el recuerdo
 * seguiría diciendo que están y todas las consultas fallarían hasta que alguien
 * reiniciara el contenedor.
 */
async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!faltaLaTabla(error)) throw error;
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/* ──────────────────────────────── Tipos ─────────────────────────────────── */

export type Espacio = {
    id: string;
    cuentaId: string;
    nombre: string;
    icono: string | null;
    descripcion: string | null;
    visibilidad: VisibilidadDeEspacio;
    orden: number;
    creadoPorId: string;
    creadoPorNombre: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
};

export type Documento = {
    id: string;
    cuentaId: string;
    espacioId: string;
    tipo: TipoDeDocumento;
    titulo: string;
    contenido: unknown;
    estados: string[];
    vista: Vista | null;
    restringido: boolean;
    version: number;
    creadoPorId: string;
    creadoPorNombre: string | null;
    actualizadoPorId: string | null;
    actualizadoPorNombre: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
};

/** Lo que basta para pintar el árbol: sin el cuerpo, que es lo caro. */
export type DocumentoEnLista = Omit<Documento, "contenido" | "estados"> & {
    estados: string[];
};

export type Version = {
    id: string;
    documentoId: string;
    version: number;
    titulo: string;
    contenido: unknown;
    autorId: string;
    autorNombre: string | null;
    creadoEn: Date;
};

export type Resultado = {
    id: string;
    espacioId: string;
    cuentaId: string;
    titulo: string;
    tipo: TipoDeDocumento;
    texto: string;
    restringido: boolean;
    creadoPorId: string;
    actualizadoEn: Date;
};

const nuevoId = () => globalThis.crypto.randomUUID();

/* ────────────────────────────── Los espacios ────────────────────────────── */

/**
 * Los espacios que alguien podría alcanzar, **sin decidir todavía si los
 * alcanza**: los de su cuenta más aquellos donde hay una fila a su nombre o al
 * de su cuenta. Quien decide es `accesoAlEspacio`, con estas filas delante.
 *
 * Partirlo así es lo que permite que la decisión sea pura y esté probada.
 *
 * `porDocumento` son los espacios que entran **solo** porque dentro hay un
 * documento compartido de uno en uno. Se devuelven aparte a propósito: ese
 * espacio NO se alcanza —solo su documento—, y dárselo a `accesoAlDocumento`
 * como si se alcanzara abriría de par en par los demás documentos de dentro.
 */
export async function losEspaciosCandidatos(input: {
    cuenta: string;
    persona: string;
}): Promise<{ espacios: Espacio[]; permisos: FilaDePermiso[]; porDocumento: string[] }> {
    return conLasTablas(async () => {
        const permisos = await db.$queryRaw<FilaDePermiso[]>`
            SELECT "objetoTipo", "objetoId", "sujetoTipo", "sujetoId", "permiso"
            FROM "doc_permisos"
            WHERE ("sujetoTipo" = 'persona' AND "sujetoId" = ${input.persona})
               OR ("sujetoTipo" = 'cuenta'  AND "sujetoId" = ${input.cuenta})
        `;

        const deFuera = permisos
            .filter((p) => p.objetoTipo === "espacio")
            .map((p) => p.objetoId);

        // **Y los espacios de los documentos sueltos que le hayan compartido.**
        // El diálogo de permisos se abre también desde un documento abierto, y
        // entonces escribe una fila de `objetoTipo = 'documento'`. Sin esta
        // consulta esa fila no traía el espacio a ninguna parte: la persona
        // tenía permiso de edición sobre el documento y **su árbol salía
        // vacío**, o sea una puerta abierta sin ningún menú que llevara a
        // ella. Es el mismo «no se puede LISTAR lo que no se puede ABRIR» de
        // `accesoAlDocumento`, del revés.
        const deDocumentos = permisos
            .filter((p) => p.objetoTipo === "documento")
            .map((p) => p.objetoId);

        const espaciosDeEsosDocumentos = deDocumentos.length
            ? await db.$queryRaw<{ espacioId: string }[]>`
                SELECT DISTINCT "espacioId" FROM "doc_documentos"
                WHERE "id" = ANY(${deDocumentos}::text[])
            `
            : [];
        const porDocumento = espaciosDeEsosDocumentos.map((f) => f.espacioId);

        const espacios = await db.$queryRaw<Espacio[]>`
            SELECT * FROM "doc_espacios"
            WHERE "borradoEn" IS NULL
              AND ("cuentaId" = ${input.cuenta}
                OR "id" = ANY(${deFuera}::text[])
                OR "id" = ANY(${porDocumento}::text[]))
            ORDER BY "orden" ASC, "nombre" ASC
        `;

        return { espacios, permisos, porDocumento };
    });
}

/**
 * Un espacio borrado se contesta como **uno que no existe**.
 *
 * Es lo que hace que el borrado suave no tenga puerta de atrás: por aquí pasan
 * `accesoAEsteEspacio` —renombrar, borrar, repartir permisos, crear dentro— y
 * `accesoAEsteDocumento`, así que ni el árbol ni una URL pegada a mano lo
 * alcanzan. Ver `borrarEspacio`.
 */
export async function elEspacio(id: string): Promise<Espacio | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Espacio[]>`
            SELECT * FROM "doc_espacios" WHERE "id" = ${id} AND "borradoEn" IS NULL LIMIT 1
        `;
        return filas[0] ?? null;
    });
}

export async function crearEspacio(input: {
    cuentaId: string;
    nombre: string;
    icono?: string | null;
    descripcion?: string | null;
    visibilidad: VisibilidadDeEspacio;
    creadoPorId: string;
    creadoPorNombre: string | null;
}): Promise<Espacio> {
    return conLasTablas(async () => {
        const id = nuevoId();
        await db.$executeRaw`
            INSERT INTO "doc_espacios"
                ("id", "cuentaId", "nombre", "icono", "descripcion", "visibilidad",
                 "orden", "creadoPorId", "creadoPorNombre")
            VALUES (
                ${id}, ${input.cuentaId}, ${input.nombre}, ${input.icono ?? null},
                ${input.descripcion ?? null}, ${input.visibilidad},
                -- Al final, y en una sola consulta: con dos, dos espacios
                -- creados a la vez leerian el mismo maximo y se llevarian el
                -- mismo numero.
                COALESCE((SELECT MAX("orden") + 1 FROM "doc_espacios" WHERE "cuentaId" = ${input.cuentaId}), 0),
                ${input.creadoPorId}, ${input.creadoPorNombre}
            )
        `;
        const creado = await elEspacio(id);
        if (!creado) throw new Error("No se pudo crear el espacio.");
        return creado;
    });
}

export async function editarEspacio(input: {
    id: string;
    nombre?: string;
    icono?: string | null;
    descripcion?: string | null;
    visibilidad?: VisibilidadDeEspacio;
}): Promise<void> {
    await conLasTablas(async () => {
        const cambios: Prisma.Sql[] = [];
        if (input.nombre !== undefined) cambios.push(Prisma.sql`"nombre" = ${input.nombre}`);
        if (input.icono !== undefined) cambios.push(Prisma.sql`"icono" = ${input.icono}`);
        if (input.descripcion !== undefined) {
            cambios.push(Prisma.sql`"descripcion" = ${input.descripcion}`);
        }
        if (input.visibilidad !== undefined) {
            cambios.push(Prisma.sql`"visibilidad" = ${input.visibilidad}`);
        }
        if (cambios.length === 0) return;
        cambios.push(Prisma.sql`"actualizadoEn" = CURRENT_TIMESTAMP`);

        await db.$executeRaw`
            UPDATE "doc_espacios"
            SET ${Prisma.join(cambios, ", ")}
            WHERE "id" = ${input.id}
        `;
    });
}

/**
 * Cuántos documentos tiene un espacio, **todos**, los alcance quien pregunte o
 * no.
 *
 * Es el número que enseña la confirmación de borrar, y por eso es un `COUNT` y
 * no el largo de la lista que el árbol pudo cargar: el árbol enseña lo que esa
 * persona alcanza —sin los restringidos de otros— y el borrado se lleva el
 * espacio entero. Un «se van a borrar 3» que se lleva 11 es peor que no decir
 * ninguno. Es la misma regla que *un contador es un `COUNT`, no un `length`*.
 */
export async function cuantosDocumentosTiene(espacioId: string): Promise<number> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ cuantos: bigint }>>`
            SELECT COUNT(*) AS "cuantos" FROM "doc_documentos" WHERE "espacioId" = ${espacioId}
        `;
        return Number(filas[0]?.cuantos ?? 0);
    });
}

/**
 * Borra un espacio: **suave, sellando la fecha, sin borrar una sola fila**.
 *
 * Era un `DELETE` en cascada —documentos, versiones, menciones, filas y
 * permisos— y eso no se deshace: un espacio con seis meses de procedimientos
 * dentro se iba con un clic y no había forma de traerlo. Ahora se sella
 * `borradoEn` y **todo lo de dentro se queda intacto**, así que quitar el sello
 * devuelve el espacio con sus documentos, su historial de versiones y sus
 * permisos tal cual estaban.
 *
 * # Lo que hace que no tenga puerta de atrás
 *
 * No basta con esconder el espacio: sus documentos siguen existiendo. Se cierra
 * por los dos sitios y en ninguno más:
 *
 * 1. **El espacio** desaparece de `elEspacio` y de `losEspaciosCandidatos`, que
 *    son las dos puertas por las que se llega a uno.
 * 2. **Sus documentos** desaparecen de las cuatro consultas que los leen, con
 *    `sinEspacioBorrado(alias)` — escrito una vez, no cuatro.
 *
 * Sin la segunda mitad quedaba un hueco real y estrecho: `accesoAlDocumento`
 * deja pasar a **quien escribió** un documento aunque su espacio no se alcance,
 * así que su autor habría podido abrirlo con una URL guardada y lo habría visto
 * salir como retroenlace desde una tarea.
 *
 * **No hay pantalla para deshacerlo**, y eso se dice en vez de disimularlo: se
 * recupera desde la base (`UPDATE "doc_espacios" SET "borradoEn" = NULL WHERE
 * "id" = …`). Lo que esto compra es que el dato siga ahí para poder hacerlo.
 */
export async function borrarEspacio(id: string): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            UPDATE "doc_espacios"
            SET "borradoEn" = CURRENT_TIMESTAMP, "actualizadoEn" = CURRENT_TIMESTAMP
            WHERE "id" = ${id} AND "borradoEn" IS NULL
        `;
    });
}

/* ───────────────────────────── Los documentos ───────────────────────────── */

function comoDocumento(fila: Record<string, unknown>): Documento {
    return {
        ...(fila as unknown as Documento),
        estados: comoEstados(fila.estados),
        contenido: fila.contenido ?? documentoVacio(),
    };
}

/**
 * Los documentos de unos espacios, **del más viejo al más nuevo**.
 *
 * Iba `ORDER BY "actualizadoEn" DESC`, y eso es lo que hacía que el árbol se
 * leyera del revés: cada documento nuevo entraba arriba del todo, y encima
 * cualquier retoque en uno viejo lo subía. Una documentación se lee en el orden
 * en que se escribió, así que se ordena por `creadoEn` y el nuevo queda al
 * final — que es lo que se pidió, y no hace falta ningún backfill: la columna
 * ya estaba en todas las filas.
 *
 * Encima de esto manda el orden **puesto a mano** (`orden_en_tablero`, tipo
 * `espacio`), que aplica quien llama con `ordenarLaColumna`: lo que nadie ha
 * arrastrado nunca sale exactamente así.
 */
export async function losDocumentosDe(espacioIds: string[]): Promise<DocumentoEnLista[]> {
    if (espacioIds.length === 0) return [];
    return conLasTablas(async () => {
        // **Sin `contenido` ni `texto`**: el árbol de un espacio pinta títulos,
        // y traerse el cuerpo de cada documento para no enseñarlo es descargar
        // la cuenta entera en cada carga de la pantalla.
        const filas = await db.$queryRaw<Array<Record<string, unknown>>>`
            SELECT "id", "cuentaId", "espacioId", "tipo", "titulo", "estados", "vista",
                   "restringido", "version", "creadoPorId", "creadoPorNombre",
                   "actualizadoPorId", "actualizadoPorNombre", "creadoEn", "actualizadoEn"
            FROM "doc_documentos" d
            WHERE "espacioId" = ANY(${espacioIds}::text[])
              AND ${sinEspacioBorrado("d")}
            ORDER BY "creadoEn" ASC
        `;
        return filas.map((f) => ({
            ...(f as unknown as DocumentoEnLista),
            estados: comoEstados(f.estados),
        }));
    });
}

export async function elDocumento(id: string): Promise<Documento | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<Record<string, unknown>>>`
            SELECT d.* FROM "doc_documentos" d
            WHERE d."id" = ${id} AND ${sinEspacioBorrado("d")}
            LIMIT 1
        `;
        return filas[0] ? comoDocumento(filas[0]) : null;
    });
}

/** Los permisos que hay sobre unos objetos concretos. Para pintar el diálogo. */
export async function losPermisosDe(input: {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
}): Promise<FilaDePermiso[]> {
    return conLasTablas(async () => {
        return db.$queryRaw<FilaDePermiso[]>`
            SELECT "objetoTipo", "objetoId", "sujetoTipo", "sujetoId", "permiso"
            FROM "doc_permisos"
            WHERE "objetoTipo" = ${input.objetoTipo} AND "objetoId" = ${input.objetoId}
        `;
    });
}

export async function ponerPermiso(input: {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    sujetoTipo: SujetoDePermiso;
    sujetoId: string;
    permiso: Permiso;
}): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            INSERT INTO "doc_permisos" ("objetoTipo", "objetoId", "sujetoTipo", "sujetoId", "permiso")
            VALUES (${input.objetoTipo}, ${input.objetoId}, ${input.sujetoTipo}, ${input.sujetoId}, ${input.permiso})
            ON CONFLICT ("objetoTipo", "objetoId", "sujetoTipo", "sujetoId")
            DO UPDATE SET "permiso" = EXCLUDED."permiso"
        `;
    });
}

export async function quitarPermiso(input: {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    sujetoTipo: SujetoDePermiso;
    sujetoId: string;
}): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`
            DELETE FROM "doc_permisos"
            WHERE "objetoTipo" = ${input.objetoTipo}
              AND "objetoId" = ${input.objetoId}
              AND "sujetoTipo" = ${input.sujetoTipo}
              AND "sujetoId" = ${input.sujetoId}
        `;
    });
}

export async function crearDocumento(input: {
    cuentaId: string;
    espacioId: string;
    tipo: TipoDeDocumento;
    titulo: string;
    contenido?: unknown;
    estados?: string[];
    vista?: Vista | null;
    restringido?: boolean;
    creadoPorId: string;
    creadoPorNombre: string | null;
}): Promise<Documento> {
    return conLasTablas(async () => {
        const id = nuevoId();
        const contenido = input.contenido ?? documentoVacio();
        const { texto, menciones } = leerElContenido(contenido);
        const estados = comoEstados(input.estados ?? [...ESTADOS_POR_DEFECTO]);

        await db.$transaction(async (tx) => {
            await tx.$executeRaw`
                INSERT INTO "doc_documentos"
                    ("id", "cuentaId", "espacioId", "tipo", "titulo", "contenido", "texto",
                     "estados", "vista", "restringido", "version",
                     "creadoPorId", "creadoPorNombre", "actualizadoPorId", "actualizadoPorNombre")
                VALUES (
                    ${id}, ${input.cuentaId}, ${input.espacioId}, ${input.tipo}, ${input.titulo},
                    ${JSON.stringify(contenido)}::jsonb, ${texto},
                    ${JSON.stringify(estados)}::jsonb, ${input.vista ?? null},
                    ${input.restringido ?? false}, 1,
                    ${input.creadoPorId}, ${input.creadoPorNombre},
                    ${input.creadoPorId}, ${input.creadoPorNombre}
                )
            `;
            await escribirLasMenciones(tx, id, input.cuentaId, menciones);
            // La primera versión se escribe al crear, no en el primer guardado:
            // sin ella, volver atrás desde la segunda versión no tendría a
            // dónde volver.
            await tx.$executeRaw`
                INSERT INTO "doc_versiones"
                    ("id", "documentoId", "version", "titulo", "contenido", "autorId", "autorNombre")
                VALUES (${nuevoId()}, ${id}, 1, ${input.titulo},
                        ${JSON.stringify(contenido)}::jsonb,
                        ${input.creadoPorId}, ${input.creadoPorNombre})
            `;
        });

        const creado = await elDocumento(id);
        if (!creado) throw new Error("No se pudo crear el documento.");
        return creado;
    });
}

type Tx = Prisma.TransactionClient;

async function escribirLasMenciones(
    tx: Tx,
    documentoId: string,
    cuentaId: string,
    menciones: Mencion[],
): Promise<void> {
    // Se reemplazan enteras, no se hace un diff: lo que ya no se nombra tiene
    // que dejar de aparecer en el retroenlace, y un diff mal hecho deja filas
    // apuntando a un texto que ya no las contiene.
    await tx.$executeRaw`DELETE FROM "doc_menciones" WHERE "documentoId" = ${documentoId}`;
    if (menciones.length === 0) return;

    const valores = menciones.map(
        (m) => Prisma.sql`(${documentoId}, ${m.tipo}, ${m.refId}, ${m.etiqueta}, ${cuentaId})`,
    );
    await tx.$executeRaw`
        INSERT INTO "doc_menciones" ("documentoId", "tipo", "refId", "etiqueta", "cuentaId")
        VALUES ${Prisma.join(valores, ", ")}
        ON CONFLICT ("documentoId", "tipo", "refId") DO UPDATE SET "etiqueta" = EXCLUDED."etiqueta"
    `;
}

export type ResultadoDeGuardado = {
    version: number;
    /** Si de verdad cambió algo. Con `false` no se escribió ninguna versión. */
    huboCambio: boolean;
    textoRecortado: boolean;
};

/**
 * Alguien guardó antes que tú.
 *
 * Se distingue de cualquier otro fallo **a propósito**: quien llama tiene que
 * poder decirlo con esas palabras. Un «no se pudo guardar» genérico aquí haría
 * que la persona lo reintentara, y reintentar es justo lo que pisa el trabajo
 * del otro.
 */
export class LoCambioOtro extends Error {
    constructor(readonly versionQueHay: number) {
        super("Alguien guardó este documento mientras lo editabas.");
        this.name = "LoCambioOtro";
    }
}

/**
 * Guarda un documento: el cuerpo, su texto plano, sus menciones y una versión.
 *
 * **Las cuatro cosas van en UNA transacción.** A medias, cada pareja miente: el
 * documento diría una cosa y sus menciones otra —un retroenlace hacia algo que
 * el texto ya no nombra—, y el historial se saltaría un cambio que sí ocurrió.
 *
 * Y **una versión por CAMBIO, no por guardado**: si el contenido y el título
 * son los mismos que los de la última versión no se escribe ninguna. Sin eso,
 * un autoguardado llena el historial de entradas idénticas y volver atrás deja
 * de servir para nada, que es como se estropea un historial de versiones.
 */
export async function guardarDocumento(input: {
    id: string;
    titulo: string;
    contenido: unknown;
    estados?: string[];
    vista?: Vista | null;
    autorId: string;
    autorNombre: string | null;
    /**
     * La versión que tenía delante quien edita.
     *
     * Si la guardada es mayor, alguien escribió mientras tanto y esto **no
     * pisa**: lanza `LoCambioOtro`. Sin esa comprobación, dos personas con el
     * documento abierto se borran el trabajo la una a la otra sin que ninguna
     * se entere — y un documento no es un arrastre de tablero, que se deshace
     * volviéndolo a arrastrar.
     *
     * Es opcional para que volver a una versión anterior no tenga que fingir
     * una: ese camino ya sabe sobre qué escribe.
     */
    versionQueSeVio?: number;
}): Promise<ResultadoDeGuardado> {
    return conLasTablas(async () => {
        const { texto, menciones, textoRecortado } = leerElContenido(input.contenido);
        const contenidoJson = JSON.stringify(input.contenido ?? documentoVacio());

        return db.$transaction(async (tx) => {
            const actuales = await tx.$queryRaw<
                Array<{ cuentaId: string; version: number; igual: boolean }>
            >`
                SELECT "cuentaId", "version",
                       -- **La comparación se hace en SQL, no en JavaScript.**
                       -- JSONB normaliza el orden de las claves al guardar, así
                       -- que comparar dos JSON.stringify decía «cambió»
                       -- SIEMPRE aunque el contenido fuera idéntico. Con eso,
                       -- cada vuelta del guardado automático escribía una
                       -- versión y el historial se llenaba de entradas iguales
                       -- hasta que volver atrás dejaba de servir para nada.
                       -- Lo cazó el banco. El = de jsonb compara el DATO, no
                       -- su texto, que es la pregunta que de verdad se hace.
                       ("titulo" = ${input.titulo}
                        AND "contenido" = ${contenidoJson}::jsonb) AS "igual"
                FROM "doc_documentos" WHERE "id" = ${input.id}
                FOR UPDATE
            `;
            const actual = actuales[0];
            if (!actual) throw new Error("El documento ya no existe.");

            // La comprobación va DENTRO del `FOR UPDATE`: fuera, dos guardados
            // simultáneos leerían los dos la misma versión y pasarían los dos.
            if (
                typeof input.versionQueSeVio === "number" &&
                actual.version > input.versionQueSeVio
            ) {
                throw new LoCambioOtro(actual.version);
            }

            const igual = actual.igual === true;
            const version = igual ? actual.version : actual.version + 1;

            const cambios: Prisma.Sql[] = [
                Prisma.sql`"titulo" = ${input.titulo}`,
                Prisma.sql`"contenido" = ${contenidoJson}::jsonb`,
                Prisma.sql`"texto" = ${texto}`,
                Prisma.sql`"version" = ${version}`,
                Prisma.sql`"actualizadoPorId" = ${input.autorId}`,
                Prisma.sql`"actualizadoPorNombre" = ${input.autorNombre}`,
                Prisma.sql`"actualizadoEn" = CURRENT_TIMESTAMP`,
            ];
            if (input.estados !== undefined) {
                cambios.push(Prisma.sql`"estados" = ${JSON.stringify(comoEstados(input.estados))}::jsonb`);
            }
            if (input.vista !== undefined) cambios.push(Prisma.sql`"vista" = ${input.vista}`);

            await tx.$executeRaw`
                UPDATE "doc_documentos" SET ${Prisma.join(cambios, ", ")} WHERE "id" = ${input.id}
            `;
            await escribirLasMenciones(tx, input.id, actual.cuentaId, menciones);

            if (!igual) {
                await tx.$executeRaw`
                    INSERT INTO "doc_versiones"
                        ("id", "documentoId", "version", "titulo", "contenido", "autorId", "autorNombre")
                    VALUES (${nuevoId()}, ${input.id}, ${version}, ${input.titulo},
                            ${contenidoJson}::jsonb, ${input.autorId}, ${input.autorNombre})
                `;
                // Se conservan las últimas. Un historial sin tope crece con
                // cada tecla guardada y acaba pesando más que el documento.
                await tx.$executeRaw`
                    DELETE FROM "doc_versiones"
                    WHERE "documentoId" = ${input.id}
                      AND "version" <= ${version - TOPE_DE_VERSIONES}
                `;
            }

            return { version, huboCambio: !igual, textoRecortado };
        });
    });
}

export async function borrarDocumento(id: string): Promise<void> {
    await conLasTablas(async () => {
        await db.$transaction(async (tx) => {
            await tx.$executeRaw`DELETE FROM "doc_filas" WHERE "documentoId" = ${id}`;
            await tx.$executeRaw`DELETE FROM "doc_menciones" WHERE "documentoId" = ${id}`;
            // Y las que apuntaban A él, o queda un retroenlace roto.
            await tx.$executeRaw`
                DELETE FROM "doc_menciones" WHERE "tipo" = 'documento' AND "refId" = ${id}
            `;
            await tx.$executeRaw`DELETE FROM "doc_versiones" WHERE "documentoId" = ${id}`;
            await tx.$executeRaw`
                DELETE FROM "doc_permisos" WHERE "objetoTipo" = 'documento' AND "objetoId" = ${id}
            `;
            await tx.$executeRaw`DELETE FROM "doc_documentos" WHERE "id" = ${id}`;
        });
    });
}

/* ────────────────────────────── Las versiones ───────────────────────────── */

export async function lasVersionesDe(documentoId: string): Promise<Version[]> {
    return conLasTablas(async () => {
        // Sin `contenido`: el historial es una lista de quién y cuándo, y
        // traerse el cuerpo de cien versiones para pintar cien fechas es
        // descargar el documento cien veces.
        return db.$queryRaw<Version[]>`
            SELECT "id", "documentoId", "version", "titulo",
                   '{}'::jsonb AS "contenido", "autorId", "autorNombre", "creadoEn"
            FROM "doc_versiones"
            WHERE "documentoId" = ${documentoId}
            ORDER BY "version" DESC
            LIMIT ${TOPE_DE_VERSIONES}
        `;
    });
}

export async function laVersion(input: {
    documentoId: string;
    version: number;
}): Promise<Version | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Version[]>`
            SELECT * FROM "doc_versiones"
            WHERE "documentoId" = ${input.documentoId} AND "version" = ${input.version}
            LIMIT 1
        `;
        return filas[0] ?? null;
    });
}

/* ────────────────────────────── Las menciones ───────────────────────────── */

export type Retroenlace = {
    documentoId: string;
    titulo: string;
    espacioId: string;
    cuentaId: string;
    restringido: boolean;
    creadoPorId: string;
    etiqueta: string;
    actualizadoEn: Date;
};

/**
 * Los documentos que nombran a una cosa. El retroenlace.
 *
 * Devuelve **candidatos**: quien llama los pasa por `accesoAlDocumento` antes
 * de enseñar ni el título. Un retroenlace que enseña el título de un documento
 * que no se puede abrir es una fuga, y la más fácil de cometer — porque el
 * enlace no se pide desde la pantalla del documento, sino desde la de la tarea.
 */
export async function losQueNombran(input: {
    tipo: TipoDeMencion;
    refId: string;
    tope?: number;
}): Promise<Retroenlace[]> {
    return conLasTablas(async () => {
        return db.$queryRaw<Retroenlace[]>`
            SELECT m."documentoId", d."titulo", d."espacioId", d."cuentaId",
                   d."restringido", d."creadoPorId", m."etiqueta", d."actualizadoEn"
            FROM "doc_menciones" m
            JOIN "doc_documentos" d ON d."id" = m."documentoId"
            WHERE m."tipo" = ${input.tipo} AND m."refId" = ${input.refId}
              AND ${sinEspacioBorrado("d")}
            ORDER BY d."actualizadoEn" DESC
            LIMIT ${input.tope ?? 50}
        `;
    });
}

/** Lo que un documento nombra. Para pintar sus enlaces salientes. */
export async function loQueNombra(documentoId: string): Promise<Mencion[]> {
    return conLasTablas(async () => {
        return db.$queryRaw<Mencion[]>`
            SELECT "tipo", "refId", "etiqueta"
            FROM "doc_menciones" WHERE "documentoId" = ${documentoId}
            ORDER BY "creadoEn" ASC
        `;
    });
}

/* ────────────────────────────── La búsqueda ─────────────────────────────── */

/**
 * Busca dentro del TEXTO de los documentos, no solo en el título.
 *
 * Dos cosas, y hacen cosas distintas:
 *
 * - **Los espacios que alcanza quien busca son la PUERTA.** Llegan ya resueltos
 *   por la misma función que arma el árbol, así que no hay dos condiciones de
 *   permisos que mantener a la par — el día que se separasen, la búsqueda sería
 *   la forma de leer lo que el árbol esconde.
 * - **El GIN es la velocidad**, y nada más.
 *
 * Lo que se teclea NUNCA llega en crudo a `to_tsquery`: lo sanea
 * `comoConsultaDeBusqueda`, que es el mismo de la búsqueda del chat de equipo.
 * Un `!` suelto no es una búsqueda rara, revienta la consulta entera.
 */
export async function buscarDocumentos(input: {
    /** Ya saneada por `comoConsultaDeBusqueda`. Nunca texto en crudo. */
    consulta: string;
    espacioIds: string[];
    tope?: number;
}): Promise<Resultado[]> {
    if (input.espacioIds.length === 0) return [];
    return conLasTablas(async () => {
        return db.$queryRaw<Resultado[]>`
            SELECT "id", "espacioId", "cuentaId", "titulo", "tipo", "texto",
                   "restringido", "creadoPorId", "actualizadoEn"
            FROM "doc_documentos" d
            WHERE "espacioId" = ANY(${input.espacioIds}::text[])
              AND "tipo" <> 'plantilla'
              AND ${sinEspacioBorrado("d")}
              AND to_tsvector('spanish', "titulo" || ' ' || "texto")
                  @@ to_tsquery('spanish', ${input.consulta})
            ORDER BY "actualizadoEn" DESC
            LIMIT ${input.tope ?? TOPE_DE_RESULTADOS}
        `;
    });
}

/* ───────────────────────── Las filas de una lista ───────────────────────── */

export async function lasFilasDe(documentoId: string): Promise<FilaDeLista[]> {
    return conLasTablas(async () => {
        return db.$queryRaw<FilaDeLista[]>`
            SELECT "id", "documentoId", "titulo", "estado", "fecha",
                   "asignadoId", "asignadoNombre", "notas", "creadoEn"
            FROM "doc_filas"
            WHERE "documentoId" = ${documentoId}
            ORDER BY "creadoEn" ASC
            LIMIT ${TOPE_DE_FILAS}
        `;
    });
}

export async function crearFila(input: {
    documentoId: string;
    cuentaId: string;
    titulo: string;
    estado: string;
    fecha: Date | null;
    asignadoId: string | null;
    asignadoNombre: string | null;
    notas: string | null;
    creadoPorId: string;
}): Promise<FilaDeLista> {
    return conLasTablas(async () => {
        const id = nuevoId();
        await db.$executeRaw`
            INSERT INTO "doc_filas"
                ("id", "documentoId", "cuentaId", "titulo", "estado", "fecha",
                 "asignadoId", "asignadoNombre", "notas", "creadoPorId")
            VALUES (${id}, ${input.documentoId}, ${input.cuentaId}, ${input.titulo},
                    ${input.estado}, ${input.fecha}, ${input.asignadoId},
                    ${input.asignadoNombre}, ${input.notas}, ${input.creadoPorId})
        `;
        const filas = await db.$queryRaw<FilaDeLista[]>`
            SELECT "id", "documentoId", "titulo", "estado", "fecha",
                   "asignadoId", "asignadoNombre", "notas", "creadoEn"
            FROM "doc_filas" WHERE "id" = ${id}
        `;
        if (!filas[0]) throw new Error("No se pudo crear la fila.");
        return filas[0];
    });
}

export async function editarFila(input: {
    id: string;
    titulo?: string;
    estado?: string;
    fecha?: Date | null;
    asignadoId?: string | null;
    asignadoNombre?: string | null;
    notas?: string | null;
}): Promise<void> {
    await conLasTablas(async () => {
        const cambios: Prisma.Sql[] = [];
        if (input.titulo !== undefined) cambios.push(Prisma.sql`"titulo" = ${input.titulo}`);
        if (input.estado !== undefined) cambios.push(Prisma.sql`"estado" = ${input.estado}`);
        if (input.fecha !== undefined) cambios.push(Prisma.sql`"fecha" = ${input.fecha}`);
        if (input.asignadoId !== undefined) {
            cambios.push(Prisma.sql`"asignadoId" = ${input.asignadoId}`);
            cambios.push(Prisma.sql`"asignadoNombre" = ${input.asignadoNombre ?? null}`);
        }
        if (input.notas !== undefined) cambios.push(Prisma.sql`"notas" = ${input.notas}`);
        if (cambios.length === 0) return;
        cambios.push(Prisma.sql`"actualizadoEn" = CURRENT_TIMESTAMP`);

        await db.$executeRaw`
            UPDATE "doc_filas" SET ${Prisma.join(cambios, ", ")} WHERE "id" = ${input.id}
        `;
    });
}

export async function laFila(id: string): Promise<(FilaDeLista & { cuentaId: string }) | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<FilaDeLista & { cuentaId: string }>>`
            SELECT "id", "documentoId", "cuentaId", "titulo", "estado", "fecha",
                   "asignadoId", "asignadoNombre", "notas", "creadoEn"
            FROM "doc_filas" WHERE "id" = ${id} LIMIT 1
        `;
        return filas[0] ?? null;
    });
}

export async function borrarFila(id: string): Promise<void> {
    await conLasTablas(async () => {
        await db.$executeRaw`DELETE FROM "doc_filas" WHERE "id" = ${id}`;
    });
}

/** Cuántas filas tiene ya una lista. Para no pasarse del tope. */
export async function cuantasFilasTiene(documentoId: string): Promise<number> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<Array<{ cuantas: bigint }>>`
            SELECT COUNT(*)::bigint AS cuantas FROM "doc_filas" WHERE "documentoId" = ${documentoId}
        `;
        return Number(filas[0]?.cuantas ?? 0);
    });
}
