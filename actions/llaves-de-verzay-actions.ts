"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { isAdminLike } from "@/lib/rbac";
import {
  actualizarUnaLlave,
  borrarUnaLlave,
  guardarUnaLlave,
  leerLasLlaves,
  leerUnaLlave,
} from "@/lib/llaves-de-verzay";
import { leCabeOtraCuenta, type LlaveDeVerzay } from "@/lib/llaves-de-verzay-tipos";

/**
 * El registro de llaves de OpenAI de Verzay, desde el panel.
 *
 * ## La puerta
 *
 * Estas claves son de la casa: con una cualquiera se le carga el consumo de IA a
 * Verzay. Así que pasa **la misma puerta que las demás pantallas de plataforma**
 * (planes, créditos): `cuentaQueManda` y `isAdminLike`, que deja pasar al
 * administrador de una cuenta actuando por ella y **no** a un reseller ni a un
 * agente. Escribir aquí una condición propia es como se acabó teniendo un chat
 * que se podía anclar y no se podía borrar.
 *
 * ## Ninguna acción deja un botón colgado
 *
 * Todas devuelven `{ success, message }` y ninguna deja escapar una excepción:
 * una acción que revienta rompe el `await` de la pantalla y la línea que apaga
 * el «Guardando…» no llega a ejecutarse. Es lo que costó la primera versión de
 * Carpetas: el síntoma no era un error, era un diálogo congelado.
 */

type Resultado<T = null> = { success: boolean; message: string; data?: T };

const laClave = z
  .string()
  .trim()
  .min(20, "Esa clave es demasiado corta para ser una de OpenAI.")
  .max(300);

const alta = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre.").max(120),
  clave: laClave,
  cupo: z.number().int().min(0).max(100_000),
  porDefecto: z.boolean(),
  activa: z.boolean(),
});

const edicion = z.object({
  id: z.string().trim().min(1),
  nombre: z.string().trim().min(1, "Ponle un nombre.").max(120),
  /** Vacía = se conserva la que hay. La pantalla no la recibe, así que no puede devolverla. */
  clave: laClave.optional().or(z.literal("")),
  cupo: z.number().int().min(0).max(100_000),
  porDefecto: z.boolean(),
  activa: z.boolean(),
});

async function laPuerta(): Promise<void> {
  const persona = await currentUser();
  const cuenta = persona ? await cuentaQueManda(persona) : null;
  if (!persona || !cuenta || !isAdminLike(cuenta.role)) {
    throw new Error("No autorizado.");
  }
}

export async function leerLasLlavesAction(): Promise<Resultado<LlaveDeVerzay[]>> {
  try {
    await laPuerta();
    return { success: true, message: "OK", data: await leerLasLlaves() };
  } catch (error) {
    console.error("[leerLasLlavesAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron leer las llaves.",
    };
  }
}

export async function crearUnaLlaveAction(
  input: z.infer<typeof alta>,
): Promise<Resultado<null>> {
  try {
    await laPuerta();
    const datos = alta.parse(input);
    await guardarUnaLlave(datos);
    revalidatePath("/panel/api-keys");
    return { success: true, message: "Llave registrada.", data: null };
  } catch (error) {
    console.error("[crearUnaLlaveAction]", error);
    return { success: false, message: elMotivo(error, "No se pudo registrar la llave.") };
  }
}

export async function actualizarUnaLlaveAction(
  input: z.infer<typeof edicion>,
): Promise<Resultado<null>> {
  try {
    await laPuerta();
    const datos = edicion.parse(input);
    await actualizarUnaLlave(datos.id, {
      nombre: datos.nombre,
      clave: datos.clave?.trim() ? datos.clave.trim() : null,
      cupo: datos.cupo,
      porDefecto: datos.porDefecto,
      activa: datos.activa,
    });
    revalidatePath("/panel/api-keys");
    return { success: true, message: "Llave actualizada.", data: null };
  } catch (error) {
    console.error("[actualizarUnaLlaveAction]", error);
    return { success: false, message: elMotivo(error, "No se pudo actualizar la llave.") };
  }
}

/**
 * Qué pasaría si se borrara esta llave.
 *
 * Se pregunta **antes** de enseñar el diálogo, porque el encargo es explícito:
 * al eliminar hay que avisar cuántas cuentas cuelgan de ella y dejar moverlas de
 * golpe. Un diálogo que solo dice «¿seguro?» deja el número invisible justo
 * cuando importa.
 *
 * Los destinos son **solo los que tienen sitio**: ofrecer una llave llena sería
 * pasarse el cupo por la puerta de atrás.
 */
export async function queCuelgaDeLaLlaveAction(id: string): Promise<
  Resultado<{
    nombre: string;
    cuentas: number;
    destinos: Array<{ id: string; nombre: string; libres: number | null }>;
  }>
> {
  try {
    await laPuerta();
    const llave = await leerUnaLlave(id);
    if (!llave) throw new Error("Esa llave ya no estaba.");

    const todas = await leerLasLlaves();
    const destinos = todas
      .filter((l) => l.id !== id && leCabeOtraCuenta(l))
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        libres: l.cupo > 0 ? Math.max(0, l.cupo - l.cuentas) : null,
      }));

    return {
      success: true,
      message: "OK",
      data: { nombre: llave.nombre, cuentas: llave.cuentas, destinos },
    };
  } catch (error) {
    console.error("[queCuelgaDeLaLlaveAction]", error);
    return { success: false, message: elMotivo(error, "No se pudo consultar la llave.") };
  }
}

export async function borrarUnaLlaveAction(input: {
  id: string;
  destinoId?: string | null;
}): Promise<Resultado<{ movidas: number }>> {
  try {
    await laPuerta();
    const id = z.string().trim().min(1).parse(input.id);
    const destinoId = input.destinoId?.trim() || null;

    const llave = await leerUnaLlave(id);
    if (!llave) throw new Error("Esa llave ya no estaba.");

    // **Nadie se queda huérfano.** Si la llave tiene cuentas, el destino es
    // obligatorio: sin él, esas cuentas quedarían apuntando a una clave que ya
    // no está registrada, sin IA y —peor— tomadas por «llave propia del
    // cliente», o sea con créditos ilimitados sobre una key muerta.
    if (llave.cuentas > 0 && !destinoId) {
      throw new Error(
        `Esa llave tiene ${llave.cuentas} cuenta${llave.cuentas === 1 ? "" : "s"}. Elige a qué llave pasan antes de eliminarla.`,
      );
    }

    const { movidas } = await borrarUnaLlave(id, destinoId);
    revalidatePath("/panel/api-keys");

    return {
      success: true,
      message: movidas
        ? `Llave eliminada. ${movidas} cuenta${movidas === 1 ? "" : "s"} movida${movidas === 1 ? "" : "s"}.`
        : "Llave eliminada.",
      data: { movidas },
    };
  } catch (error) {
    console.error("[borrarUnaLlaveAction]", error);
    return { success: false, message: elMotivo(error, "No se pudo eliminar la llave.") };
  }
}

/**
 * El motivo en palabras que se puedan usar.
 *
 * El choque de clave repetida sale de Postgres como `23505`, que no le dice nada
 * a nadie. Es la misma idea que `lib/motivo-de-evolution.ts`: un botón que falla
 * y no dice por qué es una llamada.
 */
function elMotivo(error: unknown, porDefecto: string): string {
  if (error instanceof z.ZodError) {
    return error.errors[0]?.message ?? porDefecto;
  }
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes("verzay_api_keys_clave_key") || texto.includes("23505")) {
    return "Esa clave ya está registrada en otra llave.";
  }
  return texto || porDefecto;
}
