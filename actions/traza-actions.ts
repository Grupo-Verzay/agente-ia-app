"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import type { TrazaConfigPanel } from "@/lib/traza-panel-tipos";

/**
 * Si la traza del panel esta encendida, y para quien.
 *
 * Lee `traza_config`, la MISMA fila que enciende la traza del motor: una sola
 * palanca para los dos lados. Medir el camino de un mensaje sin poder cruzar
 * lo que ve el motor con lo que ve el navegador no sirve de nada.
 *
 * La App solo LEE. La tabla la crea la migracion de `api-webhook`, que es de
 * quien es dueño de las migraciones. Esto no es una formalidad: que la App
 * cree y modifique tablas en el camino de guardado de mensajes es justo la
 * causa raiz nº 3 del diagnostico, y no se arregla cometiendola otra vez.
 * Si la tabla no existe, esto devuelve "apagada" y no pasa nada.
 */
export async function leerTrazaConfigAction(): Promise<TrazaConfigPanel> {
  const apagada: TrazaConfigPanel = { activa: false, muestreo: 0 };
  try {
    // Con sesion: esto no expone nada sensible, pero tampoco tiene por que
    // contestarle a quien no ha entrado.
    const user = await currentUser();
    if (!user?.id) return apagada;

    const filas = await db.$queryRaw<
      Array<{ activa: boolean; muestreo: number; userIds: string[] }>
    >`SELECT "activa", "muestreo", "userIds" FROM "traza_config" WHERE "id" = 1`;

    const fila = filas[0];
    if (!fila?.activa) return apagada;

    // Una cuenta nombrada a mano se traza entera, sin muestreo. Es como se
    // persigue el caso de un cliente que reporta lentitud sin subirle el
    // muestreo a toda la plataforma.
    const nombrada =
      Array.isArray(fila.userIds) &&
      [user.id, user.ownerId].filter(Boolean).some((id) => fila.userIds.includes(id as string));

    return {
      activa: true,
      muestreo: nombrada ? 100 : Number(fila.muestreo) || 0,
    };
  } catch {
    // Silencioso a proposito: si la tabla no esta, esto se preguntaria en cada
    // carga de Chats y el aviso seria constante sin decir nada nuevo.
    return apagada;
  }
}
