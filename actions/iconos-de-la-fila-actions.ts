"use server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { comoIconosDeLaFila, type IconosDeLaFila } from "@/lib/iconos-de-la-fila";
import { losIconosDeLaFila, ponerLosIconosDeLaFila } from "@/lib/preferencias-de-persona-db";

/**
 * Los iconitos de la fila de Chats son de la PERSONA (Perfil › Apariencia).
 * Ninguna de las dos acciones recibe un id: la persona sale de la sesión, así
 * que no hay forma de leer ni de cambiar la preferencia de otro.
 */

type Respuesta = { success: true; iconos: IconosDeLaFila } | { success: false; message: string; iconos: IconosDeLaFila };

export async function misIconosDeLaFilaAction(): Promise<Respuesta> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autorizado", iconos: comoIconosDeLaFila(null) };
  const persona = laPersonaQueActua(user).id;
  try {
    return { success: true, iconos: await losIconosDeLaFila(persona) };
  } catch (error) {
    // Sin poder leerla se enseña todo, que es lo de siempre; pero se dice.
    console.warn("[iconos-de-la-fila] no se pudo leer la preferencia", { persona, error: String(error) });
    return { success: false, message: "No se pudo leer la preferencia.", iconos: comoIconosDeLaFila(null) };
  }
}

export async function guardarIconosDeLaFilaAction(iconos: unknown): Promise<Respuesta> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autorizado", iconos: comoIconosDeLaFila(null) };
  const persona = laPersonaQueActua(user).id;
  try {
    return { success: true, iconos: await ponerLosIconosDeLaFila(persona, comoIconosDeLaFila(iconos)) };
  } catch (error) {
    console.warn("[iconos-de-la-fila] no se pudo guardar la preferencia", { persona, error: String(error) });
    return { success: false, message: "No se pudo guardar.", iconos: comoIconosDeLaFila(iconos) };
  }
}
