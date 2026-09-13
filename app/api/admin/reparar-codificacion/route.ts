import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';
import { repararTextoDoblementeCodificado } from '@/lib/texto-doblemente-codificado';

/**
 * Repara el texto que quedó guardado dos veces codificado.
 *
 * El origen estaba en cinco ficheros del repo que se guardaron mal (ver
 * `lib/texto-doblemente-codificado.ts`), y de ahí se copió a la base: al sembrar
 * las herramientas de un cliente, su descripción se saca del catálogo. Arreglar
 * el catálogo deja limpio lo nuevo; esto limpia lo que ya estaba.
 *
 * **No es cosmético.** La descripción de cada herramienta se le pasa al modelo
 * tal cual (`description: cfg.toolDescription` en el backend), así que el agente
 * venía leyendo `informaciÃ³n` donde debía leer `información`.
 *
 * **Busca, no adivina.** En vez de una lista de tablas escrita a mano —que se
 * queda corta el día que alguien añada una columna— recorre TODAS las columnas
 * de texto de la base y pregunta cuáles traen las señales. Así el informe dice
 * dónde está el daño de verdad, incluido el que no venga del catálogo.
 *
 * Dos pasadas, y la primera no toca nada:
 *
 *   GET  /api/admin/reparar-codificacion            → informe
 *   GET  /api/admin/reparar-codificacion?aplicar=si → repara
 *
 * Entra el admin con su sesión (para poder abrirlo desde el navegador) o una
 * llamada de servidor con la clave de siempre, igual que `fix-appt-apikeys`.
 */

/** Solo se tocan tablas con clave primaria `id` de una sola columna. */
const CLAVE = 'id';

/** Las mismas señales que el reparador, escritas para Postgres. */
const PISTAS_SQL = String.raw`(Ã.|â€|Â[¡¿ªº°»«]|ðŸ|Ãƒ)`;

/** Cuántas filas se traen por vuelta. */
const LOTE = 500;

type Columna = { tabla: string; columna: string };

function autorizado(request: Request, esAdmin: boolean): boolean {
  if (esAdmin) return true;
  const esperada = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!esperada) return false;
  const bearer = request.headers.get('authorization');
  const secreta = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secreta === esperada;
}

/** Las columnas de texto de tablas que tengan una clave primaria `id`. */
async function columnasDeTexto(): Promise<Columna[]> {
  return db.$queryRaw<Columna[]>`
    SELECT c.table_name AS tabla, c.column_name AS columna
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type IN ('text', 'character varying')
      AND EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage k
          ON k.constraint_name = tc.constraint_name
         AND k.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = c.table_name
          AND tc.constraint_type = 'PRIMARY KEY'
          AND k.column_name = ${CLAVE}
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 1
      )
    ORDER BY c.table_name, c.column_name
  `;
}

const ident = (s: string) => Prisma.raw(`"${s.replace(/"/g, '""')}"`);

export async function GET(request: Request) {
  const user = await currentUser().catch(() => null);
  const esAdmin = !!user?.id && isAdminLike(user.role);
  if (!autorizado(request, esAdmin)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const aplicar = new URL(request.url).searchParams.get('aplicar') === 'si';
  const informe: {
    tabla: string;
    columna: string;
    sospechosas: number;
    reparables: number;
    reparadas: number;
    ejemplo?: { antes: string; despues: string };
  }[] = [];

  let columnas: Columna[];
  try {
    columnas = await columnasDeTexto();
  } catch (error) {
    // Un fallo mudo aquí se lee como "no había nada roto", que es lo contrario
    // de lo que pasó.
    console.error('[codificacion] no se pudieron listar las columnas', error);
    return NextResponse.json(
      { ok: false, error: 'No se pudieron listar las columnas de texto.' },
      { status: 500 },
    );
  }

  for (const { tabla, columna } of columnas) {
    let sospechosas = 0;
    let reparables = 0;
    let reparadas = 0;
    let ejemplo: { antes: string; despues: string } | undefined;

    try {
      // Solo las filas con señales: sin este filtro esto sería leer la base
      // entera para mirar cada texto.
      let desde: string | number | null = null;
      for (;;) {
        const filas: { id: string | number; valor: string }[] = await db.$queryRaw`
          SELECT ${ident(CLAVE)} AS id, ${ident(columna)} AS valor
          FROM ${ident(tabla)}
          WHERE ${ident(columna)} ~ ${PISTAS_SQL}
            ${desde === null ? Prisma.empty : Prisma.sql`AND ${ident(CLAVE)}::text > ${String(desde)}`}
          ORDER BY ${ident(CLAVE)}::text
          LIMIT ${LOTE}
        `;
        if (filas.length === 0) break;
        desde = filas[filas.length - 1].id;
        sospechosas += filas.length;

        for (const fila of filas) {
          const limpio = repararTextoDoblementeCodificado(fila.valor);
          if (!limpio) continue;
          reparables++;
          if (!ejemplo) {
            ejemplo = { antes: fila.valor.slice(0, 90), despues: limpio.slice(0, 90) };
          }
          if (aplicar) {
            await db.$executeRaw`
              UPDATE ${ident(tabla)}
              SET ${ident(columna)} = ${limpio}
              WHERE ${ident(CLAVE)} = ${fila.id}
            `;
            reparadas++;
          }
        }
        if (filas.length < LOTE) break;
      }
    } catch (error) {
      console.warn('[codificacion] no se pudo revisar una columna', { tabla, columna, error });
      continue;
    }

    if (sospechosas > 0) informe.push({ tabla, columna, sospechosas, reparables, reparadas, ejemplo });
  }

  const total = informe.reduce(
    (acc, r) => ({
      sospechosas: acc.sospechosas + r.sospechosas,
      reparables: acc.reparables + r.reparables,
      reparadas: acc.reparadas + r.reparadas,
    }),
    { sospechosas: 0, reparables: 0, reparadas: 0 },
  );

  console.info('[codificacion] revision terminada', { aplicar, columnasRevisadas: columnas.length, ...total });

  return NextResponse.json({
    ok: true,
    aplicado: aplicar,
    columnasRevisadas: columnas.length,
    total,
    detalle: informe,
    ...(aplicar ? {} : { siguiente: 'Vuelve a abrirlo con ?aplicar=si para repararlo.' }),
  });
}
