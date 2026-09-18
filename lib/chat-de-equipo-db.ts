import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { TOPE_DE_MENSAJES, type MensajeDeEquipo } from "@/lib/chat-de-equipo";
import type { ChatCompartido } from "@/lib/chat-compartido";
import { esFinDeLlamada, type FinDeLlamada } from "@/lib/llamada-de-voz";
import {
    CANAL_GENERAL,
    canalDeLaFila,
    type TipoDeCanal,
} from "@/lib/canales-de-equipo";

/**
 * La tabla del chat interno del equipo.
 *
 * **De la App, creada por la App** con `CREATE TABLE IF NOT EXISTS`, igual que
 * `task_comments`, `task_attachments`, `flows` y `tickets_de_soporte`. Las
 * migraciones son del BACKEND (`docs/db-migrations-ownership.md`) y meterle
 * una columna a una tabla suya desde aquí es lo que reventó el #360.
 *
 * Sin clave foránea contra `User`: una `FOREIGN KEY` desde aquí ataría las dos
 * migraciones, y además el nombre del autor se **copia dentro** para que el
 * hilo siga diciendo quién escribió aunque esa persona salga del equipo.
 *
 * `cuentaId` es la cuenta —`ownerId ?? id`, el mismo valor con el que agrupan
 * Carpetas, Proyectos y Diagramas—. Dentro de ella, `canalId` dice en qué
 * canal cae cada mensaje; `NULL` es el **general**, que es donde estaban los
 * mensajes de cuando el hilo era uno solo.
 *
 * Aquí viven también las dos tablas de los canales, `team_channels` y
 * `team_channel_members`, por lo mismo: son de la App y las crea la App.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_chat_messages" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "autorId" TEXT NOT NULL,
                "autorNombre" TEXT,
                "texto" TEXT NOT NULL,
                "mencionados" TEXT[] NOT NULL DEFAULT '{}',
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        // El unico indice que hace falta: el hilo de una cuenta, por fecha. Es
        // la consulta del reloj, que corre cada pocos segundos por pestaña
        // abierta, asi que tiene que ser la mas barata de todas.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_chat_messages_cuenta_idx"
            ON "team_chat_messages" ("cuentaId", "creadoEn")
        `;
        // Desde que cuenta se escribio, cuando NO es la de quien firma.
        //
        // `autorId` y `autorNombre` son la PERSONA, siempre; esto es el rastro
        // de haber escrito desde dentro de una cuenta ajena con «Ingresar».
        // Entra con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` y no reescribiendo
        // el `CREATE`: la tabla ya existe en produccion y un
        // `CREATE TABLE IF NOT EXISTS` no toca una que ya esta — es el fallo
        // que se comete solo al añadirle una columna a una tabla de la App ya
        // desplegada.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "escritoDesde" TEXT
        `;
        // En que canal cae el mensaje. Entra por el mismo camino y por el
        // mismo motivo: la tabla ya esta en produccion. Y entra NULLABLE a
        // proposito — `NULL` es el general, asi que los mensajes de cuando el
        // hilo era uno solo se quedan donde estaban, sin backfill y sin dos
        // clases de mensaje.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "canalId" TEXT
        `;
        // La conversacion de Chats que el mensaje senala, si senala alguna.
        //
        // Cinco columnas y no un blob: cada una se escribe y se lee por su
        // nombre, asi que una clave mal puesta falla en vez de guardarse. Y
        // entran por `ADD COLUMN IF NOT EXISTS` por lo mismo que las de arriba
        // — la tabla ya esta en produccion —, todas NULLABLE: un mensaje
        // normal no senala nada y no hay dos clases de mensaje.
        //
        // `chatNumero` se COPIA de lo que la pantalla ya sabe y no se deduce
        // del jid: los digitos de un `@lid` son un id de privacidad, no un
        // telefono, y fabricarlo daria un numero falso que ademas podria ser
        // el de otro contacto.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "chatLinea" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "chatJid" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "chatIdentidades" TEXT[] NOT NULL DEFAULT '{}'
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "chatNombre" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "chatNumero" TEXT
        `;
        // El registro de una llamada de voz: como acabo y cuanto duro.
        //
        // Va como un MENSAJE MAS del directo —en su sitio por fecha, leido por
        // el mismo lector de siempre— y no en una tabla aparte, que obligaria a
        // mezclar dos listas al pintar el hilo. Lo que lo distingue son estas
        // dos columnas, igual que la tarjeta de una conversacion compartida.
        //
        // Por `ADD COLUMN IF NOT EXISTS` y no reescribiendo el `CREATE`: la
        // tabla ya esta en produccion.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "llamadaFin" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "llamadaSegundos" INTEGER
        `;
        // El indice del reloj, ahora por canal: es la consulta que corre cada
        // pocos segundos por panel abierto.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_chat_messages_canal_idx"
            ON "team_chat_messages" ("cuentaId", "canalId", "creadoEn")
        `;
        // La CITA: el mensaje al que responde este, si responde a alguno.
        //
        // Tres columnas COPIADAS, y esa es la decision entera: el recuadro de
        // la cita se pinta con lo que hay en ESTA fila, sin mirar el original
        // para nada. Es el mismo criterio con el que `autorNombre` ya se copia
        // —para que el hilo siga diciendo quien escribio aunque esa persona
        // salga del equipo—, aplicado al texto del mensaje citado.
        //
        // `citaId` solo sirve para SALTAR. Si el original desaparece, el
        // recuadro se sigue pintando con el nombre y el extracto de aqui; lo
        // unico que cambia es que la pantalla avisa de que ya no esta, y eso se
        // pregunta al leer y no se guarda como marca (ver `CitaDeMensaje`).
        //
        // Entran por `ADD COLUMN IF NOT EXISTS` y NULLABLE, por lo mismo que
        // las de arriba: la tabla ya esta en produccion, un
        // `CREATE TABLE IF NOT EXISTS` no la toca, y un mensaje normal no cita
        // nada — sin dos clases de mensaje y sin backfill.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "citaId" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "citaAutorNombre" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "citaExtracto" TEXT
        `;
        // La NOTA DE VOZ, y su transcripcion. Cuatro columnas mas, con
        // `ADD COLUMN IF NOT EXISTS` porque la tabla ya esta desplegada: un
        // `CREATE TABLE IF NOT EXISTS` no toca una que ya existe, y ese es el
        // fallo que se comete solo al anadirle una columna a una tabla de la
        // App ya desplegada.
        //
        // El audio NO se guarda aqui: se sube al bucket como cualquier adjunto
        // y la fila guarda su direccion. Un opus de un minuto son ~60 kB en
        // base64 dentro de cada fila, y la consulta del reloj se trae la pagina
        // entera cada cinco segundos — eso es meter el audio en el camino
        // caliente para no volver a leerlo nunca.
        //
        // Los mensajes que ya estaban traen `null` en las cuatro, que significa
        // exactamente «este no es una nota de voz»: sin backfill y sin dos
        // clases de mensaje.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "audioUrl" TEXT
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "audioSegundos" INTEGER
        `;
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "audioMime" TEXT
        `;
        // La transcripcion se GUARDA, y ese es el motivo de la columna: se cobra
        // por minuto de audio, asi que pedirla dos veces no puede costar dos
        // veces. Quien la pida despues la lee de aqui y no toca ni un credito.
        await db.$executeRaw`
            ALTER TABLE "team_chat_messages"
            ADD COLUMN IF NOT EXISTS "transcripcion" TEXT
        `;
        // La BUSQUEDA por texto. **Es este indice el que evita recorrer la
        // tabla**, y conviene decirlo asi porque lo primero que se penso fue lo
        // contrario.
        //
        // La idea de partida era que lo que acotaba eran **los canales que la
        // persona puede leer** —unos pocos, ya resueltos por
        // `canalesQueAlcanzan`— y que el indice solo ayudaba dentro de ese
        // trozo. Medido con 60.000 mensajes en 30 canales, el plan dice otra
        // cosa:
        //
        //     Bitmap Heap Scan
        //       Filter: ("canalId" = ANY (...))        <- la lista, DESPUES
        //       -> Bitmap Index Scan on ..._texto_idx  <- esto es lo que manda
        //
        // O sea: **el GIN manda y la lista de canales se aplica como filtro
        // encima.** Los numeros lo confirman: 5 ms con el indice contra 40 ms
        // sin el, con el mismo recorte por canal. Y buscar en 3 canales no es
        // mas rapido que en los 30 (5 ms contra 3 ms): con menos filas que
        // casan, al `LIMIT` le cuesta mas llenarse.
        //
        // Asi que las dos cosas hacen falta y hacen cosas distintas, que es lo
        // que no se puede volver a confundir:
        //
        // - **La lista de canales es la PUERTA.** No se busca donde no se puede
        //   leer. Es correccion, no velocidad.
        // - **El GIN es la velocidad.** Sin el, la consulta crece con el tamaño
        //   de la tabla aunque el recorte por canal siga puesto.
        //
        // `'spanish'` para que «facturas» encuentre «factura»; el prefijo del
        // termino que se esta tecleando lo pone `comoConsultaDeBusqueda`.
        //
        // Y **sin `CREATE EXTENSION`**: `pg_trgm` haria falta para un `ILIKE
        // '%x%'` con indice, pero instalar una extension pide permisos que la
        // App no tiene por que tener, y el dia que no los tenga esto fallaria
        // al arrancar. La busqueda de texto completo viene con Postgres.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_chat_messages_texto_idx"
            ON "team_chat_messages"
            USING GIN (to_tsvector('spanish', "texto"))
        `;
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_channels" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "llave" TEXT,
                "creadoPorId" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_channels_cuenta_idx"
            ON "team_channels" ("cuentaId")
        `;
        // La pareja de un directo, ordenada, es su identidad. UNICO porque el
        // directo lo puede abrir cualquiera de los dos y a la vez: sin esto
        // saldrian dos canales con los mismos dos miembros y la mitad de los
        // mensajes en cada uno.
        await db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "team_channels_llave_key"
            ON "team_channels" ("cuentaId", "llave")
            WHERE "llave" IS NOT NULL
        `;
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_channel_members" (
                "canalId" TEXT NOT NULL,
                "personaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("canalId", "personaId")
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_channel_members_persona_idx"
            ON "team_channel_members" ("personaId")
        `;
        // Las CUENTAS que entran en un canal, cuando cruza cuentas vinculadas.
        // Tabla aparte y no una fila mas en `team_channel_members`: ahi una
        // cuenta y una persona serian la misma columna —una cuenta tambien es
        // una fila de `User`— y no habria forma de saber cual es cual.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_channel_accounts" (
                "canalId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("canalId", "cuentaId")
            )
        `;
        // El indice del listado: «que canales alcanzan a MI cuenta».
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "team_channel_accounts_cuenta_idx"
            ON "team_channel_accounts" ("cuentaId")
        `;
        // Hasta donde ha leido cada persona en cada canal.
        //
        // Una MARCA, no un conjunto de mensajes leidos: un chat crece sin
        // limite y un conjunto creceria con el. Esto es una fila por persona y
        // canal, y no crece nunca.
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "team_chat_reads" (
                "personaId" TEXT NOT NULL,
                "canalId" TEXT NOT NULL,
                "leidoHasta" TIMESTAMP(3) NOT NULL,
                PRIMARY KEY ("personaId", "canalId")
            )
        `;
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/**
 * `42P01` de Postgres: «relation does not exist».
 *
 * **Prisma no lo deja arriba.** En una consulta en crudo el `code` de primer
 * nivel es el suyo —`P2010`— y el de Postgres viaja dentro, en `meta.code`.
 * Mirar solo `error.code` no encuentra nunca el `42P01`. Es el mismo despiste
 * que ya costó una vuelta en `avisos-de-tarea` y en `tickets-db`.
 */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

/**
 * Hace algo contra la tabla, creándola si no está.
 *
 * El recuerdo de «ya la creé» es **del proceso, no de la base**: si la tabla
 * desaparece por debajo —una restauración, un entorno recién levantado— el
 * recuerdo seguiría diciendo que existe y todas las consultas fallarían con
 * `42P01` hasta que alguien reiniciara el contenedor. Ante ese código se
 * olvida, se crea y se reintenta **una vez**: si tampoco va la segunda, el
 * problema no era que faltara la tabla.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[chat-equipo] la tabla del hilo no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

type Fila = {
    id: string;
    autorId: string;
    autorNombre: string | null;
    escritoDesde: string | null;
    texto: string;
    mencionados: string[] | null;
    creadoEn: Date;
    chatLinea: string | null;
    chatJid: string | null;
    chatIdentidades: string[] | null;
    chatNombre: string | null;
    chatNumero: string | null;
    llamadaFin: string | null;
    llamadaSegundos: number | null;
    citaId: string | null;
    citaAutorNombre: string | null;
    citaExtracto: string | null;
    audioUrl: string | null;
    audioSegundos: number | null;
    audioMime: string | null;
    transcripcion: string | null;
};

/**
 * De fila a mensaje.
 *
 * `vivas` son los ids de mensajes citados que TODAVIA existen. Se pasa desde
 * fuera porque se resuelve de una vez para toda la pagina —un `IN` sobre la
 * clave primaria— y no una consulta por mensaje. Sin el conjunto, la cita se
 * da por viva: es lo que pasa en los caminos que no citan nada.
 */
const aMensaje = (f: Fila, vivas?: Set<string>): MensajeDeEquipo => ({
    id: f.id,
    autorId: f.autorId,
    autorNombre: f.autorNombre,
    escritoDesde: f.escritoDesde,
    texto: f.texto,
    mencionados: f.mencionados ?? [],
    creadoEn: f.creadoEn.toISOString(),
    // La conversación señalada, cuando el mensaje señala alguna. Hacen falta
    // las DOS mitades —la línea y el jid—: sin línea no hay a dónde llevar y
    // sin jid no hay qué abrir, así que media referencia no es una referencia.
    chat:
        f.chatLinea && f.chatJid
            ? {
                  linea: f.chatLinea,
                  jid: f.chatJid,
                  // La pedida delante: es la que se le devuelve a la pantalla.
                  identidades: Array.from(
                      new Set([f.chatJid, ...(f.chatIdentidades ?? [])]),
                  ),
                  nombre: f.chatNombre,
                  numero: f.chatNumero,
              }
            : null,
    // El registro de una llamada. `esFinDeLlamada` filtra al LEER, para que una
    // fila rara —a mano, o de una version anterior— no llegue a la pantalla
    // como un final que no existe.
    llamada: esFinDeLlamada(f.llamadaFin)
        ? { fin: f.llamadaFin, segundos: Number(f.llamadaSegundos ?? 0) }
        : null,
    // La cita se pinta con lo que hay en ESTA fila. Lo unico que se pregunta
    // por el original es si sigue ahi, para poder decirlo.
    cita: f.citaId
        ? {
              id: f.citaId,
              autorNombre: f.citaAutorNombre,
              extracto: f.citaExtracto ?? "",
              sigueAhi: vivas ? vivas.has(f.citaId) : true,
          }
        : null,
    // La nota de voz. Hace falta la DIRECCION: sin ella no hay nada que
    // reproducir, y los segundos solos serian una burbuja vacia que dice «0:12».
    audio: f.audioUrl
        ? {
              url: f.audioUrl,
              segundos: Number(f.audioSegundos ?? 0),
              mime: f.audioMime,
          }
        : null,
    // La transcripcion ya pagada, si alguien la pidio. `null` es «todavia no»,
    // no «no se pudo»: un fallo no deja marca a proposito, para que se pueda
    // volver a intentar.
    transcripcion: f.transcripcion,
});

/** Cuales de estos mensajes citados siguen existiendo. */
async function lasCitasQueSiguenAhi(filas: Fila[]): Promise<Set<string>> {
    const citados = Array.from(
        new Set(filas.map((f) => f.citaId).filter((x): x is string => Boolean(x))),
    );
    if (citados.length === 0) return new Set();
    // Una sola consulta por pagina, por clave primaria. Guardarlo como marca
    // en la fila obligaria a que cada camino que borre un mensaje se acordara
    // de ponerla, y el dia que alguien borre por otro lado la marca miente.
    const vivas = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "team_chat_messages"
        WHERE "id" IN (${Prisma.join(citados)})
    `;
    return new Set(vivas.map((v) => v.id));
}

/**
 * El hilo de una cuenta, del más antiguo al más nuevo.
 *
 * Se piden los ÚLTIMOS `TOPE_DE_MENSAJES` —`DESC` con `LIMIT`, que es lo que
 * entra por el índice— y se le dan la vuelta para pintarlos. Pidiéndolos `ASC`
 * el tope devolvería los PRIMEROS, o sea la conversación de hace un año.
 */
export async function leerElHilo(
    cuentas: string[],
    canalId: string,
): Promise<MensajeDeEquipo[]> {
    const deLaFamilia = cuentas.filter(Boolean);
    if (!deLaFamilia.length) return [];

    return conLaTabla(async () => {
        const filas =
            canalId === CANAL_GENERAL
                // El general se lee sobre TODA LA FAMILIA, y con el `NULL`
                // dentro. Las dos condiciones arreglan un caso cada una:
                //
                // - La familia: `ownerId ?? id` no sube a la cuenta madre, asi
                //   que Grupo Verzay leia bajo `grupo` y la gente de Verzay |
                //   Atencion bajo `atencion` — dos Generales, cada uno viendo
                //   solo lo suyo, y sin un error en ninguna parte.
                // - El `NULL`: ahi estan los mensajes de cuando el hilo era uno
                //   solo. Sin eso el general saldria vacio el dia del
                //   despliegue y parecerian borrados.
                //
                // Y leer sobre la familia es ademas lo que hace que lo que ya
                // se escribio bajo cada cuenta se siga viendo: lo nuevo cae
                // bajo la raiz, lo viejo se queda donde esta y se lee igual.
                ? await db.$queryRaw<Fila[]>`
                    SELECT "id", "autorId", "autorNombre", "escritoDesde",
                           "texto", "mencionados", "creadoEn",
                           "chatLinea", "chatJid", "chatIdentidades",
                           "chatNombre", "chatNumero",
                           "llamadaFin", "llamadaSegundos",
                           "citaId", "citaAutorNombre", "citaExtracto",
                           "audioUrl", "audioSegundos", "audioMime", "transcripcion"
                    FROM "team_chat_messages"
                    WHERE "cuentaId" IN (${Prisma.join(deLaFamilia)})
                      AND ("canalId" IS NULL OR "canalId" = ${CANAL_GENERAL})
                    ORDER BY "creadoEn" DESC
                    LIMIT ${TOPE_DE_MENSAJES}
                `
                // Un canal tiene id propio y ya se comprobo que se puede
                // llegar a el, asi que la cuenta no acota nada mas — y acotar
                // por la de quien lee partiria en trozos el hilo de un canal
                // que cruza cuentas.
                : await db.$queryRaw<Fila[]>`
                    SELECT "id", "autorId", "autorNombre", "escritoDesde",
                           "texto", "mencionados", "creadoEn",
                           "chatLinea", "chatJid", "chatIdentidades",
                           "chatNombre", "chatNumero",
                           "llamadaFin", "llamadaSegundos",
                           "citaId", "citaAutorNombre", "citaExtracto",
                           "audioUrl", "audioSegundos", "audioMime", "transcripcion"
                    FROM "team_chat_messages"
                    WHERE "canalId" = ${canalId}
                    ORDER BY "creadoEn" DESC
                    LIMIT ${TOPE_DE_MENSAJES}
                `;
        const vivas = await lasCitasQueSiguenAhi(filas);
        return filas.map((f) => aMensaje(f, vivas)).reverse();
    });
}

/**
 * Buscar por texto en los canales que esa persona puede leer.
 *
 * **La lista de canales es la PUERTA, no la optimización.** Llega ya resuelta
 * por `canalesQueAlcanzan` —la misma que arma el listado—, así que aquí no se
 * vuelve a decidir quién lee qué. Escribir una segunda condición de permisos en
 * esta consulta sería tener dos que mantener a la par, y el día que se separen
 * la búsqueda enseña lo que la lista esconde.
 *
 * Lo que evita recorrer la tabla es **el GIN**, no esa lista: medido, el plan
 * entra por el índice de texto y aplica los canales como filtro encima (ver el
 * comentario del índice). Las dos cosas hacen falta y hacen cosas distintas.
 *
 * El **general** va aparte porque no es un canal con fila: son los mensajes de
 * la familia con `canalId` nulo o `'general'`, igual que se leen.
 */
export async function buscarEnElEquipo(input: {
    /** Los canales con fila a los que llega. Ya comprobados. */
    canalIds: string[];
    /** La familia, para el general. */
    cuentas: string[];
    /** Ya saneada por `comoConsultaDeBusqueda`. Nunca texto en crudo. */
    consulta: string;
    /** Acotar a un solo canal, cuando se busca «en este canal». */
    soloEsteCanal?: string | null;
    tope: number;
}): Promise<Array<Fila & { canalId: string | null }>> {
    const deLaFamilia = input.cuentas.filter(Boolean);
    const canales = input.canalIds.filter(Boolean);

    // Sin nada que mirar no se consulta. Un `IN ()` vacío es un error de
    // sintaxis, y buscar en cero canales no puede devolver nada de todas
    // formas.
    const puedeElGeneral =
        deLaFamilia.length > 0 &&
        (!input.soloEsteCanal || input.soloEsteCanal === CANAL_GENERAL);
    const canalesQueTocan = input.soloEsteCanal
        ? canales.filter((c) => c === input.soloEsteCanal)
        : canales;
    if (canalesQueTocan.length === 0 && !puedeElGeneral) return [];

    // El alcance, montado con las dos mitades que hagan falta. Se arma una vez
    // y se inyecta: con la condición copiada en dos ramas, una devolvería filas
    // que la otra descarta.
    const trozos: Prisma.Sql[] = [];
    if (canalesQueTocan.length > 0) {
        trozos.push(Prisma.sql`"canalId" IN (${Prisma.join(canalesQueTocan)})`);
    }
    if (puedeElGeneral) {
        trozos.push(
            Prisma.sql`("cuentaId" IN (${Prisma.join(deLaFamilia)})
                        AND ("canalId" IS NULL OR "canalId" = ${CANAL_GENERAL}))`,
        );
    }
    const alcance = Prisma.join(trozos, " OR ");

    return conLaTabla(() => db.$queryRaw<Array<Fila & { canalId: string | null }>>`
        SELECT "id", "autorId", "autorNombre", "escritoDesde",
               "texto", "mencionados", "creadoEn", "canalId",
               "chatLinea", "chatJid", "chatIdentidades",
               "chatNombre", "chatNumero",
               "citaId", "citaAutorNombre", "citaExtracto",
                           "audioUrl", "audioSegundos", "audioMime", "transcripcion"
        FROM "team_chat_messages"
        WHERE (${alcance})
          AND to_tsvector('spanish', "texto") @@ to_tsquery('spanish', ${input.consulta})
        ORDER BY "creadoEn" DESC
        LIMIT ${input.tope}
    `);
}

/**
 * El hilo ALREDEDOR de un mensaje, no los últimos.
 *
 * Hace falta justamente para la búsqueda: un resultado de hace tres meses no
 * está entre los últimos `TOPE_DE_MENSAJES`, así que pulsarlo aterrizaba al
 * final del hilo y el anillo no aparecía nunca — el mismo caso que el salto de
 * la campanita ya admite («si no está, se sigue como siempre, al final»), que
 * en un aviso reciente es aceptable y aquí sería el fallo entero.
 *
 * Se traen los de antes y los de después **en dos consultas acotadas**, no un
 * `OFFSET` sobre el hilo: contar cuántos hay antes de ese mensaje obliga a
 * recorrerlos, y es lo que la regla de *una consulta que devuelve una página
 * tiene que poder pararse* prohíbe.
 */
export async function elHiloAlrededorDe(input: {
    canalId: string;
    cuentas: string[];
    mensajeId: string;
}): Promise<MensajeDeEquipo[]> {
    const deLaFamilia = input.cuentas.filter(Boolean);
    const mitad = Math.floor(TOPE_DE_MENSAJES / 2);

    return conLaTabla(async () => {
        const centro = await db.$queryRaw<Array<{ creadoEn: Date }>>`
            SELECT "creadoEn" FROM "team_chat_messages" WHERE "id" = ${input.mensajeId}
        `;
        // Sin el mensaje no hay alrededor: se contesta vacío y quien llama se
        // cae al hilo normal. Es lo correcto —el mensaje pudo borrarse entre
        // buscarlo y pulsarlo— y no un error que enseñar.
        if (centro.length === 0) return [];
        const cuando = centro[0].creadoEn;

        const alcance =
            input.canalId === CANAL_GENERAL
                ? Prisma.sql`"cuentaId" IN (${Prisma.join(deLaFamilia.length ? deLaFamilia : [""])})
                             AND ("canalId" IS NULL OR "canalId" = ${CANAL_GENERAL})`
                : Prisma.sql`"canalId" = ${input.canalId}`;

        const [antes, despues] = await Promise.all([
            db.$queryRaw<Fila[]>`
                SELECT "id", "autorId", "autorNombre", "escritoDesde",
                       "texto", "mencionados", "creadoEn",
                       "chatLinea", "chatJid", "chatIdentidades",
                       "chatNombre", "chatNumero",
                       "citaId", "citaAutorNombre", "citaExtracto",
                           "audioUrl", "audioSegundos", "audioMime", "transcripcion"
                FROM "team_chat_messages"
                WHERE (${alcance}) AND "creadoEn" <= ${cuando}
                ORDER BY "creadoEn" DESC
                LIMIT ${mitad}
            `,
            db.$queryRaw<Fila[]>`
                SELECT "id", "autorId", "autorNombre", "escritoDesde",
                       "texto", "mencionados", "creadoEn",
                       "chatLinea", "chatJid", "chatIdentidades",
                       "chatNombre", "chatNumero",
                       "citaId", "citaAutorNombre", "citaExtracto",
                           "audioUrl", "audioSegundos", "audioMime", "transcripcion"
                FROM "team_chat_messages"
                WHERE (${alcance}) AND "creadoEn" > ${cuando}
                ORDER BY "creadoEn" ASC
                LIMIT ${mitad}
            `,
        ]);

        const filas = [...antes.reverse(), ...despues];
        const vivas = await lasCitasQueSiguenAhi(filas);
        return filas.map((f) => aMensaje(f, vivas));
    });
}

/** Un mensaje suelto, para comprobar que se puede citar. */
export async function elMensaje(
    id: string,
): Promise<{
    id: string;
    canalId: string | null;
    cuentaId: string;
    autorNombre: string | null;
    texto: string;
    /** Si es una nota de voz. Su `texto` esta vacio, y una cita en blanco no dice nada. */
    audioUrl: string | null;
} | null> {
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<
            Array<{
                id: string;
                canalId: string | null;
                cuentaId: string;
                autorNombre: string | null;
                texto: string;
                audioUrl: string | null;
            }>
        >`
            SELECT "id", "canalId", "cuentaId", "autorNombre", "texto", "audioUrl"
            FROM "team_chat_messages" WHERE "id" = ${id}
        `;
        return filas[0] ?? null;
    });
}

export async function guardarUnMensaje(input: {
    id: string;
    /**
     * La cuenta bajo la que cae el mensaje.
     *
     * **Es la del CANAL, no la de quien escribe** —para el general, la raíz de
     * la familia—. Es la misma regla que ya rige en Proyectos compartidos: las
     * tareas de un proyecto cuelgan de la cuenta dueña, las escriba quien las
     * escriba. Guardándolo bajo la cuenta de quien escribe, el hilo de un canal
     * que cruza se partiría en tantos trozos como cuentas tenga dentro.
     */
    cuentaId: string;
    canalId: string;
    autorId: string;
    autorNombre: string | null;
    /** La cuenta desde la que se escribió, si no es la de quien firma. */
    escritoDesde: string | null;
    texto: string;
    mencionados: string[];
    /**
     * La conversación de Chats que señala, si señala alguna.
     *
     * Ya saneada y ya comprobada por quien llama: aquí no se decide si esa
     * línea es suya. Esa pregunta es de la acción, que es donde está la sesión.
     */
    chat: ChatCompartido | null;
    /** El registro de una llamada de voz, cuando el mensaje es eso. */
    llamada?: { fin: FinDeLlamada; segundos: number } | null;
    /**
     * El mensaje citado, ya COPIADO.
     *
     * Llega con el nombre y el extracto dentro, no con un id que haya que ir a
     * buscar: eso es lo que hace que la cita no dependa del original. Y ya
     * comprobado por quien llama —que sea del MISMO canal—, porque esa
     * pregunta necesita la sesión y aquí no la hay.
     */
    cita: { id: string; autorNombre: string | null; extracto: string } | null;
    /**
     * La nota de voz, cuando el mensaje es una.
     *
     * Llega con la direccion del bucket **ya subida** por quien llama: aqui no
     * se sube nada. Es el mismo reparto que el resto de esta tabla —la accion
     * tiene la sesion, esto solo escribe—.
     */
    audio?: { url: string; segundos: number; mime: string | null } | null;
}): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        INSERT INTO "team_chat_messages"
            ("id", "cuentaId", "canalId", "autorId", "autorNombre",
             "escritoDesde", "texto", "mencionados",
             "chatLinea", "chatJid", "chatIdentidades", "chatNombre", "chatNumero",
             "llamadaFin", "llamadaSegundos",
             "citaId", "citaAutorNombre", "citaExtracto",
             "audioUrl", "audioSegundos", "audioMime")
        VALUES (
            ${input.id}, ${input.cuentaId}, ${input.canalId}, ${input.autorId},
            ${input.autorNombre}, ${input.escritoDesde},
            ${input.texto}, ${input.mencionados},
            ${input.chat?.linea ?? null}, ${input.chat?.jid ?? null},
            ${input.chat?.identidades ?? []},
            ${input.chat?.nombre ?? null}, ${input.chat?.numero ?? null},
            ${input.llamada?.fin ?? null}, ${input.llamada?.segundos ?? null},
            ${input.cita?.id ?? null}, ${input.cita?.autorNombre ?? null},
            ${input.cita?.extracto ?? null},
            ${input.audio?.url ?? null}, ${input.audio?.segundos ?? null},
            ${input.audio?.mime ?? null}
        )
    `);
}

/**
 * La nota de voz de un mensaje, para poder transcribirla.
 *
 * Devuelve tambien su `canalId`, que es lo que decide **quien puede pedirla**:
 * la puerta se pregunta contra el canal del MENSAJE, no contra el que diga el
 * navegador. Sin eso, mandar el id de un mensaje de un directo ajeno seria
 * transcribirlo con los creditos de quien lo pide.
 */
export async function elAudioDelMensaje(id: string): Promise<{
    id: string;
    canalId: string;
    audioUrl: string | null;
    audioSegundos: number | null;
    audioMime: string | null;
    transcripcion: string | null;
} | null> {
    if (!id) return null;
    const filas = await conLaTabla(() => db.$queryRaw<Array<{
        id: string;
        canalId: string | null;
        audioUrl: string | null;
        audioSegundos: number | null;
        audioMime: string | null;
        transcripcion: string | null;
    }>>`
        SELECT "id", "canalId", "audioUrl", "audioSegundos", "audioMime", "transcripcion"
        FROM "team_chat_messages"
        WHERE "id" = ${id}
        LIMIT 1
    `);
    const f = filas[0];
    if (!f) return null;
    return {
        id: f.id,
        // Un mensaje de cuando el hilo era uno solo trae `canalId` nulo: ese es
        // el general. Es la misma traduccion que hace el lector del hilo.
        canalId: canalDeLaFila(f.canalId),
        audioUrl: f.audioUrl,
        audioSegundos: f.audioSegundos === null ? null : Number(f.audioSegundos),
        audioMime: f.audioMime,
        transcripcion: f.transcripcion,
    };
}

/**
 * Guardar la transcripcion de una nota.
 *
 * **Solo si no la tenia ya** (`WHERE "transcripcion" IS NULL`): dos personas
 * pulsando «Transcribir» a la vez escriben una sola vez y la segunda no pisa
 * nada. Lo que evita cobrar dos veces es la lectura de antes; esto evita que
 * dos textos distintos se turnen en la pantalla.
 */
export async function guardarLaTranscripcion(id: string, texto: string): Promise<void> {
    if (!id || !texto) return;
    await conLaTabla(() => db.$executeRaw`
        UPDATE "team_chat_messages"
           SET "transcripcion" = ${texto}
         WHERE "id" = ${id} AND "transcripcion" IS NULL
    `);
}

// ── Los canales ─────────────────────────────────────────────────────────────

export type FilaDeCanal = {
    id: string;
    tipo: TipoDeCanal;
    nombre: string;
    llave: string | null;
    /** La cuenta DUEÑA del canal. Bajo ella caen sus mensajes. */
    cuentaId: string;
    miembros: string[];
    /** Las cuentas que entran, si el canal cruza. Vacío = canal de una cuenta. */
    cuentas: string[];
};

/**
 * Los canales guardados de una cuenta, con sus miembros.
 *
 * **El general NO sale de aquí**: no es una fila, es una constante, y quien
 * llama lo pone delante. Guardarlo obligaría a crearlo en cada cuenta y a
 * acordarse de hacerlo en las que ya existen — o sea un backfill para algo que
 * no necesita ninguno.
 *
 * Los miembros se traen en la MISMA consulta, agregados. Pidiéndolos aparte
 * serían una consulta por canal, y esto lo lee la pantalla en cada apertura.
 */
export async function canalesQueAlcanzan(input: {
    cuentaId: string;
    /** Quién mira. Un directo se encuentra porque está DENTRO, no por la cuenta. */
    personaId: string;
    /** Si además supervisa los directos de la gente de su cuenta. */
    manda: boolean;
}): Promise<FilaDeCanal[]> {
    const { cuentaId, personaId, manda } = input;
    return conLaTabla(() => db.$queryRaw<FilaDeCanal[]>`
        SELECT c."id", c."tipo", c."nombre", c."llave", c."cuentaId",
               COALESCE(
                   (SELECT ARRAY_AGG(m."personaId")
                    FROM "team_channel_members" m WHERE m."canalId" = c."id"),
                   '{}'
               ) AS "miembros",
               COALESCE(
                   (SELECT ARRAY_AGG(a."cuentaId")
                    FROM "team_channel_accounts" a WHERE a."canalId" = c."id"),
                   '{}'
               ) AS "cuentas"
        FROM "team_channels" c
        WHERE c."cuentaId" = ${cuentaId}
           OR EXISTS (
                SELECT 1 FROM "team_channel_accounts" a
                WHERE a."canalId" = c."id" AND a."cuentaId" = ${cuentaId}
           )
           -- Un DIRECTO se encuentra porque estás DENTRO, no por la cuenta de
           -- la que cuelga. Cuelga de la RAÍZ de la familia —para que entre
           -- cuentas hermanas no salga duplicado— y se buscaba por la cuenta de
           -- quien mira: solo coinciden en la raíz, así que desde cualquier
           -- vinculada el directo no aparecía y el servidor se caía al general.
           OR (
                c."tipo" = 'directo'
                AND EXISTS (
                    SELECT 1 FROM "team_channel_members" m
                    WHERE m."canalId" = c."id" AND m."personaId" = ${personaId}
                )
           )
           -- Y quien manda sigue leyendo los directos de LA GENTE DE SU CUENTA,
           -- que es como estaba escrita la regla. Por la cuenta de la que
           -- cuelgan ya no vale: ahora cuelgan todos de la raíz, así que solo
           -- los leería la raíz.
           OR (
                ${manda}::boolean
                AND c."tipo" = 'directo'
                AND EXISTS (
                    SELECT 1 FROM "team_channel_members" m
                    JOIN "User" u ON u."id" = m."personaId"
                    WHERE m."canalId" = c."id"
                      AND (u."id" = ${cuentaId} OR u."owner_id" = ${cuentaId})
                )
           )
        ORDER BY c."creadoEn" ASC
    `);
}

/** Un canal concreto, para comprobar de quién es antes de tocarlo. */
export async function elCanal(
    cuentaId: string,
    canalId: string,
): Promise<FilaDeCanal | null> {
    const filas = await conLaTabla(() => db.$queryRaw<FilaDeCanal[]>`
        SELECT c."id", c."tipo", c."nombre", c."llave", c."cuentaId",
               COALESCE(
                   (SELECT ARRAY_AGG(m."personaId")
                    FROM "team_channel_members" m WHERE m."canalId" = c."id"),
                   '{}'
               ) AS "miembros",
               COALESCE(
                   (SELECT ARRAY_AGG(a."cuentaId")
                    FROM "team_channel_accounts" a WHERE a."canalId" = c."id"),
                   '{}'
               ) AS "cuentas"
        FROM "team_channels" c
        WHERE c."cuentaId" = ${cuentaId} AND c."id" = ${canalId}
    `);
    return filas[0] ?? null;
}

export async function crearUnCanal(input: {
    id: string;
    cuentaId: string;
    nombre: string;
    creadoPorId: string;
    miembros: string[];
    /** Las cuentas que entran, si cruza. Vacío = canal de una sola cuenta. */
    cuentas?: string[];
}): Promise<void> {
    await conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "team_channels"
                ("id", "cuentaId", "tipo", "nombre", "llave", "creadoPorId")
            VALUES (${input.id}, ${input.cuentaId}, 'area', ${input.nombre}, NULL, ${input.creadoPorId})
        `;
        await ponerLosMiembros(input.id, input.miembros);
        if (input.cuentas?.length) await ponerLasCuentas(input.id, input.cuentas);
    });
}

/**
 * Qué cuentas entran en un canal, **entera**.
 *
 * Se borra y se vuelve a escribir dentro de una transacción, como la lista de
 * personas: con dos consultas sueltas, un fallo entre medias dejaría el canal
 * sin ninguna cuenta dentro y desaparecería de la pantalla de todo el mundo
 * menos de la madre, que es peor que no haber cambiado nada.
 */
export async function ponerLasCuentas(canalId: string, cuentas: string[]): Promise<void> {
    const limpias = Array.from(new Set(cuentas.map((c) => c.trim()).filter(Boolean)));
    await conLaTabla(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`DELETE FROM "team_channel_accounts" WHERE "canalId" = ${canalId}`;
            for (const cuentaId of limpias) {
                await tx.$executeRaw`
                    INSERT INTO "team_channel_accounts" ("canalId", "cuentaId")
                    VALUES (${canalId}, ${cuentaId})
                    ON CONFLICT DO NOTHING
                `;
            }
        }),
    );
}

export async function renombrarUnCanal(
    cuentaId: string,
    canalId: string,
    nombre: string,
): Promise<number> {
    return conLaTabla(() => db.$executeRaw`
        UPDATE "team_channels"
        SET "nombre" = ${nombre}
        WHERE "cuentaId" = ${cuentaId} AND "id" = ${canalId} AND "tipo" = 'area'
    `);
}

/**
 * La lista de miembros de un canal, **entera**.
 *
 * Se borra y se vuelve a escribir dentro de una transacción: con dos consultas
 * sueltas, un fallo entre medias dejaría el canal sin nadie dentro, que es
 * peor que no haber cambiado nada.
 */
export async function ponerLosMiembros(canalId: string, personas: string[]): Promise<void> {
    const limpias = Array.from(new Set(personas.map((p) => p.trim()).filter(Boolean)));
    await conLaTabla(() =>
        db.$transaction(async (tx) => {
            await tx.$executeRaw`DELETE FROM "team_channel_members" WHERE "canalId" = ${canalId}`;
            for (const personaId of limpias) {
                await tx.$executeRaw`
                    INSERT INTO "team_channel_members" ("canalId", "personaId")
                    VALUES (${canalId}, ${personaId})
                    ON CONFLICT DO NOTHING
                `;
            }
        }),
    );
}

/**
 * El directo de dos personas, creándolo si todavía no existe.
 *
 * El `ON CONFLICT DO NOTHING` sobre la llave es lo que hace que abrirlo los dos
 * a la vez —cada uno desde su lado— no cree dos canales. Y después se LEE, en
 * vez de fiarse de lo que devolvió el `INSERT`: si el conflicto saltó, el id
 * bueno es el que ya estaba, no el que se acaba de generar.
 */
export async function abrirElDirecto(input: {
    id: string;
    cuentaId: string;
    llave: string;
    miembros: [string, string];
}): Promise<string> {
    return conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "team_channels"
                ("id", "cuentaId", "tipo", "nombre", "llave", "creadoPorId")
            VALUES (${input.id}, ${input.cuentaId}, 'directo', '', ${input.llave}, ${input.miembros[0]})
            ON CONFLICT ("cuentaId", "llave") WHERE "llave" IS NOT NULL DO NOTHING
        `;
        const filas = await db.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "team_channels"
            WHERE "cuentaId" = ${input.cuentaId} AND "llave" = ${input.llave}
        `;
        const id = filas[0]?.id ?? input.id;
        // Los dos miembros se AÑADEN, no se reescribe la lista: abrirlo es
        // algo que pasa cada vez que se pulsa el nombre, y un borrar-y-poner
        // ahí dejaría el directo un instante sin nadie dentro en cada clic.
        for (const personaId of input.miembros) {
            await db.$executeRaw`
                INSERT INTO "team_channel_members" ("canalId", "personaId")
                VALUES (${id}, ${personaId})
                ON CONFLICT DO NOTHING
            `;
        }
        return id;
    });
}

// ── La gente ────────────────────────────────────────────────────────────────

export type FilaDePersona = {
    id: string;
    name: string | null;
    email: string | null;
    /** Es una CUENTA de la familia, no alguien del equipo. */
    esCuenta: boolean;
};

/**
 * La gente de unas cuantas cuentas: sus equipos **y las cuentas mismas**.
 *
 * Existe porque `getTeamAdvisorInfos` resuelve la cuenta por dentro, desde
 * `currentUser()`, así que solo sabe mirar desde un lado. Aquí hacen falta
 * varias a la vez: la familia entera.
 *
 * Dos cosas que no son evidentes:
 *
 * 1. **La cuenta misma entra.** Su fila no cuelga de nadie —`owner_id` en
 *    nulo—, así que un `WHERE owner_id IN (…)` la deja fuera. Con un hilo único
 *    eso solo significaba que al dueño no se le podía mencionar; con directos
 *    significa que nadie puede escribirle.
 * 2. **Se ordena y se deduplica en la consulta.** La misma persona puede caer
 *    por dos caminos —es cuenta vinculada y además está en el equipo de otra—,
 *    y salir dos veces en la lista de con quién hablar es un directo duplicado
 *    esperando a que alguien pulse el segundo.
 */
export async function laGenteDeLasCuentas(cuentas: string[]): Promise<FilaDePersona[]> {
    const ids = Array.from(new Set(cuentas.map((c) => c.trim()).filter(Boolean)));
    if (!ids.length) return [];

    return db.$queryRaw<FilaDePersona[]>`
        SELECT DISTINCT ON (u.id) u.id, u.name, u.email,
               (u."owner_id" IS NULL) AS "esCuenta"
        FROM "User" u
        WHERE u.id IN (${Prisma.join(ids)})
           OR u."owner_id" IN (${Prisma.join(ids)})
        ORDER BY u.id, u.name ASC
    `.catch((error) => {
        // Sin gente no se puede mencionar ni abrir un directo, y eso se lee
        // como «el chat no conoce a nadie». Se dice.
        console.warn("[chat-equipo] no se pudo leer la gente de la familia", {
            cuentas: ids.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return [] as FilaDePersona[];
    });
}

// ── Lo que falta por leer ───────────────────────────────────────────────────

export type SinLeerDeUnCanal = { canalId: string; sinLeer: number };

/**
 * Cuántos mensajes sin leer tiene una persona en cada canal.
 *
 * # Las tres condiciones, y cada una arregla algo distinto
 *
 * 1. **Posterior a su marca.** Sin marca no hay nada leído, así que sale todo
 *    lo que haya. Es lo cierto —nadie los ha leído— y evita lo otro: sembrar la
 *    marca al vuelo, que abriría una ventana de un ciclo entero en la que un
 *    mensaje recién llegado se daría por leído solo.
 * 2. **De otra persona.** Lo que uno escribe no le llega a él.
 * 3. **De un canal donde PERTENECE.** Esa lista la decide quien llama, y no es
 *    la de los canales que puede leer: un administrador lee todos los directos
 *    de su cuenta, y contárselos le pondría encima el tráfico de todo el mundo
 *    — que es tanto como no tener contador.
 *
 * # Y el general va aparte, porque no es una fila
 *
 * Sus mensajes se reparten entre las cuentas de la familia y su `canalId` puede
 * ser `NULL` —los de cuando el hilo era uno solo—, así que se cuenta con las
 * dos condiciones, igual que se lee.
 *
 * Una sola consulta para todos los canales: esto corre cada pocos segundos, con
 * el panel cerrado, en todas las pantallas de la App. Una por canal serían
 * tantas peticiones como canales tenga la cuenta, cada vuelta.
 */
export async function sinLeerPorCanal(input: {
    personaId: string;
    /** Los canales donde pertenece. El general NO va aquí: se cuenta aparte. */
    canales: string[];
    /** Las cuentas de la familia, para el general. */
    familia: string[];
    /** Si el general entra en la cuenta. Siempre, salvo que no haya familia. */
    conGeneral: boolean;
}): Promise<SinLeerDeUnCanal[]> {
    const canales = Array.from(new Set(input.canales.filter(Boolean)));
    const familia = Array.from(new Set(input.familia.filter(Boolean)));

    return conLaTabla(async () => {
        const salida: SinLeerDeUnCanal[] = [];

        if (input.conGeneral && familia.length) {
            const filas = await db.$queryRaw<{ sinLeer: bigint }[]>`
                SELECT COUNT(*)::bigint AS "sinLeer"
                FROM "team_chat_messages" m
                LEFT JOIN "team_chat_reads" r
                       ON r."personaId" = ${input.personaId}
                      AND r."canalId" = ${CANAL_GENERAL}
                WHERE m."cuentaId" IN (${Prisma.join(familia)})
                  AND (m."canalId" IS NULL OR m."canalId" = ${CANAL_GENERAL})
                  AND m."autorId" <> ${input.personaId}
                  AND (r."leidoHasta" IS NULL OR m."creadoEn" > r."leidoHasta")
            `;
            const n = Number(filas[0]?.sinLeer ?? 0);
            if (n > 0) salida.push({ canalId: CANAL_GENERAL, sinLeer: n });
        }

        if (canales.length) {
            const filas = await db.$queryRaw<{ canalId: string; sinLeer: bigint }[]>`
                SELECT m."canalId", COUNT(*)::bigint AS "sinLeer"
                FROM "team_chat_messages" m
                LEFT JOIN "team_chat_reads" r
                       ON r."personaId" = ${input.personaId}
                      AND r."canalId" = m."canalId"
                WHERE m."canalId" IN (${Prisma.join(canales)})
                  AND m."autorId" <> ${input.personaId}
                  AND (r."leidoHasta" IS NULL OR m."creadoEn" > r."leidoHasta")
                GROUP BY m."canalId"
            `;
            for (const f of filas) salida.push({ canalId: f.canalId, sinLeer: Number(f.sinLeer) });
        }

        return salida;
    });
}

/**
 * Marca un canal como leído hasta un momento dado.
 *
 * **La hora es la del último mensaje que se ENSEÑÓ, no `now()`.** Con `now()`,
 * un mensaje que entrara entre que se leyó el hilo y que se escribe la marca
 * quedaría dado por leído sin que nadie lo hubiera visto — y un mensaje que se
 * pierde así no vuelve a avisar nunca.
 *
 * Y la marca solo AVANZA, con el `WHERE` del `ON CONFLICT`. Dos cosas de una:
 * releer un canal viejo no puede hacer que vuelvan a salir como sin leer los
 * mensajes de en medio, y **cuando no hay nada que mover, Postgres no escribe
 * la fila**. Eso importa porque esto se llama en cada vuelta del reloj del
 * panel abierto: con un `SET` incondicional serían escrituras cada cinco
 * segundos por cada persona que tenga el panel delante.
 */
export async function marcarLeido(
    personaId: string,
    canalId: string,
    hasta: Date,
): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        INSERT INTO "team_chat_reads" ("personaId", "canalId", "leidoHasta")
        VALUES (${personaId}, ${canalId}, ${hasta})
        ON CONFLICT ("personaId", "canalId") DO UPDATE
        SET "leidoHasta" = EXCLUDED."leidoHasta"
        WHERE "team_chat_reads"."leidoHasta" < EXCLUDED."leidoHasta"
    `);
}

/**
 * Qué tiene esta persona sin leer que MEREZCA sonar.
 *
 * Es el hermano de `sinLeerPorCanal` y va sobre la misma tabla, con la misma
 * marca de leído — porque la pregunta es la misma con una condición más
 * encima: **un directo, o una mención**. Un mensaje del general sin mención no
 * suena nunca, y por eso no puede salir de aquí.
 *
 * # Por qué la mención sale de `team_chat_messages` y no de `task_alerts`
 *
 * El aviso de una mención también existe en `task_alerts` —es el que enciende
 * la campanita y la ventana que interrumpe— y era la fuente que parecía obvia.
 * No lo es: ahí el canal viaja dentro de `enlace`, o sea **dentro de una
 * URL**, así que habría que parsearla para saber de qué canal era; y el aviso
 * se apaga al atenderlo, que es una vida distinta de la de «sin leer». La
 * columna `mencionados` ya guarda a quién se mencionó, decidido por el
 * servidor al escribir y sobre la gente de ESE canal. Es el mismo dato, en la
 * misma fila, sin una segunda tabla que mantener a la par.
 *
 * # Y devuelve la HORA, no un contador
 *
 * Quien decide si suena compara contra lo último que ya sonó, así que lo que
 * hace falta es **cuándo** llegó lo más nuevo, no cuántos hay. Con un contador
 * no habría forma de distinguir «sigue habiendo tres sin leer» de «ha entrado
 * uno más», y sonaría en cada vuelta del reloj.
 */
export type AvisoSinLeer = {
    canalId: string;
    /** Del más nuevo sin leer, en milisegundos. */
    cuando: number;
    motivo: "directo" | "mencion";
};

export async function loQuePuedeSonar(input: {
    personaId: string;
    /** Los directos donde pertenece. Cualquier mensaje suyo sin leer suena. */
    directos: string[];
    /** Los demás canales donde pertenece. Ahí solo suena una mención. */
    otros: string[];
    /** Las cuentas de la familia, para el general — que no es una fila. */
    familia: string[];
    conGeneral: boolean;
}): Promise<AvisoSinLeer[]> {
    const directos = Array.from(new Set(input.directos.filter(Boolean)));
    const otros = Array.from(new Set(input.otros.filter(Boolean)));
    const familia = Array.from(new Set(input.familia.filter(Boolean)));

    return conLaTabla(async () => {
        const salida: AvisoSinLeer[] = [];

        // Los directos: cualquier mensaje de la otra persona sin leer.
        if (directos.length) {
            const filas = await db.$queryRaw<{ canalId: string; cuando: Date }[]>`
                SELECT m."canalId", MAX(m."creadoEn") AS "cuando"
                FROM "team_chat_messages" m
                LEFT JOIN "team_chat_reads" r
                       ON r."personaId" = ${input.personaId}
                      AND r."canalId" = m."canalId"
                WHERE m."canalId" IN (${Prisma.join(directos)})
                  AND m."autorId" <> ${input.personaId}
                  AND (r."leidoHasta" IS NULL OR m."creadoEn" > r."leidoHasta")
                GROUP BY m."canalId"
            `;
            for (const f of filas) {
                salida.push({
                    canalId: f.canalId,
                    cuando: f.cuando.getTime(),
                    motivo: "directo",
                });
            }
        }

        // Los demás canales: solo si le mencionaron a ella.
        if (otros.length) {
            const filas = await db.$queryRaw<{ canalId: string; cuando: Date }[]>`
                SELECT m."canalId", MAX(m."creadoEn") AS "cuando"
                FROM "team_chat_messages" m
                LEFT JOIN "team_chat_reads" r
                       ON r."personaId" = ${input.personaId}
                      AND r."canalId" = m."canalId"
                WHERE m."canalId" IN (${Prisma.join(otros)})
                  AND m."autorId" <> ${input.personaId}
                  AND ${input.personaId} = ANY(m."mencionados")
                  AND (r."leidoHasta" IS NULL OR m."creadoEn" > r."leidoHasta")
                GROUP BY m."canalId"
            `;
            for (const f of filas) {
                salida.push({
                    canalId: f.canalId,
                    cuando: f.cuando.getTime(),
                    motivo: "mencion",
                });
            }
        }

        // Y el general aparte, con las dos condiciones de siempre: no es una
        // fila de canal y su `canalId` puede ser `NULL` —los mensajes de
        // cuando el hilo era uno solo—. Sin esa mitad, una mención de entonces
        // sería inencontrable aquí igual que lo era al leer.
        if (input.conGeneral && familia.length) {
            const filas = await db.$queryRaw<{ cuando: Date | null }[]>`
                SELECT MAX(m."creadoEn") AS "cuando"
                FROM "team_chat_messages" m
                LEFT JOIN "team_chat_reads" r
                       ON r."personaId" = ${input.personaId}
                      AND r."canalId" = ${CANAL_GENERAL}
                WHERE m."cuentaId" IN (${Prisma.join(familia)})
                  AND (m."canalId" IS NULL OR m."canalId" = ${CANAL_GENERAL})
                  AND m."autorId" <> ${input.personaId}
                  AND ${input.personaId} = ANY(m."mencionados")
                  AND (r."leidoHasta" IS NULL OR m."creadoEn" > r."leidoHasta")
            `;
            const cuando = filas[0]?.cuando;
            if (cuando) {
                salida.push({
                    canalId: CANAL_GENERAL,
                    cuando: cuando.getTime(),
                    motivo: "mencion",
                });
            }
        }

        return salida;
    });
}
