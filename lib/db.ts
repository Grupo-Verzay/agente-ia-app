import { PrismaClient } from "@prisma/client";
import "@/lib/env";

/**
 * Conexiones que puede abrir CADA proceso de la app.
 *
 * Sin este valor Prisma lo deduce de los CPU que vea el contenedor, y con
 * varias réplicas eso se multiplica sin que nadie lo haya decidido: PostgreSQL
 * admite 200 conexiones en total, y de ahí comen también el backend, n8n y los
 * demás servicios. Quedarse sin conexiones no ralentiza la app, la tumba.
 *
 * Diez por proceso da holgura de sobra —las consultas de una página caben con
 * margen— y con tres réplicas el techo de la app queda en 30.
 */
const CONEXIONES_POR_PROCESO = Number(process.env.DB_CONNECTION_LIMIT ?? 10);

/**
 * Nombre con el que la app se presenta a PostgreSQL.
 *
 * Sin él, `pg_stat_activity` muestra todas las conexiones iguales y no hay
 * forma de saber cuáles son de la app y cuáles del backend al investigar un
 * pico.
 */
const NOMBRE_APLICACION = process.env.DB_APPLICATION_NAME ?? "agente-ia-app";

/**
 * Añade a la URL los parámetros de conexión, sin tocar los que ya traiga.
 *
 * Se hace aquí y no en la variable de entorno para que el límite viaje con el
 * código: una URL editada a mano en el panel de despliegue se pierde en cuanto
 * alguien recrea el servicio, y este límite es justo lo que no conviene perder.
 * Si la URL no se puede interpretar, se devuelve tal cual y Prisma se comporta
 * como hasta ahora.
 */
function conParametrosDeConexion(url: string | undefined): string | undefined {
    if (!url) return url;
    try {
        const u = new URL(url);
        if (!u.searchParams.has("connection_limit")) {
            u.searchParams.set("connection_limit", String(CONEXIONES_POR_PROCESO));
        }
        if (!u.searchParams.has("application_name")) {
            u.searchParams.set("application_name", NOMBRE_APLICACION);
        }
        return u.toString();
    } catch {
        return url;
    }
}

const prismaClientSingleton = () => {
    const url = conParametrosDeConexion(process.env.DATABASE_URL);
    return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
};

declare const globalThis: {
    prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

export const db = globalThis.prismaGlobal ?? prismaClientSingleton();

// El singleton se guarda SIEMPRE, también en producción.
//
// Antes solo se guardaba fuera de producción, así que cada vez que el módulo se
// evaluaba —y con `output: standalone` lo evalúan por separado los componentes
// de servidor, las acciones y las rutas de API— nacía un cliente nuevo con su
// propio grupo de conexiones. Justo donde más caro sale.
globalThis.prismaGlobal = db;
