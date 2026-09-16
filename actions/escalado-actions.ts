"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { laCuentaQueConfigura } from "@/lib/cuenta-que-configura";
import { ESCALADO_POR_DEFECTO, type AjustesDeEscalado } from "@/lib/escalado-ajustes";

/**
 * Cómo se comporta la cuenta cuando una conversación se escala a un asesor.
 *
 * Son tres ajustes y viven juntos porque son la misma decisión vista por tres
 * lados: si la IA puede escalar sola, qué pasa con la IA al escalar, y cuánto
 * se espera a que el asesor conteste.
 *
 * Las TRES columnas las crea el BACKEND con su migración, que es quien las
 * aplica. A propósito NO se declaran en `schema.prisma`: una columna declarada
 * aquí y ausente en la base revienta en caliente cada consulta a `User` que no
 * liste columnas, que es como se cayó el panel de facturación en el #360. Se
 * leen y se escriben con SQL en crudo, y todo aquí aguanta que la columna
 * todavía no exista —App desplegada antes que el backend—: se anota y se sigue
 * con el valor de siempre.
 *
 * Esto vivía en Equipo, y estaba mal puesto: los planes sin equipo no ven esa
 * pantalla y también necesitan configurarlo. Ahora es de Perfil ›
 * Comportamiento, que es donde ya están los demás mandos de la IA de la cuenta
 * —el interruptor del agente, los tiempos, las frases automáticas—.
 */

type Resultado = { success: boolean; message?: string };

/** Lo que tiene puesto la cuenta. Nunca falla: si no se puede leer, lo de siempre. */
export async function getAjustesDeEscalado(): Promise<AjustesDeEscalado> {
  const cuenta = await laCuentaQueConfigura();
  if (!cuenta) return ESCALADO_POR_DEFECTO;

  try {
    const filas = await db.$queryRaw<
      { escalarPorIa: boolean; apagarLaIaAlEscalar: boolean; minutosParaSoltar: number }[]
    >`
      SELECT escalation_by_ai_enabled AS "escalarPorIa",
             escalation_disables_ai   AS "apagarLaIaAlEscalar",
             auto_release_minutes     AS "minutosParaSoltar"
      FROM "User" WHERE id = ${cuenta.id}
    `;
    const fila = filas[0];
    if (!fila) return ESCALADO_POR_DEFECTO;
    return {
      // Cada uno cae del lado de SU valor por defecto cuando no se puede leer:
      // escalar por IA viene encendido de serie, apagar la IA al escalar no.
      // Un respaldo que no coincida con el DEFAULT de la columna enseña un
      // interruptor que dice lo contrario de lo que la cuenta está haciendo.
      escalarPorIa: fila.escalarPorIa !== false,
      apagarLaIaAlEscalar: fila.apagarLaIaAlEscalar === true,
      minutosParaSoltar: Number(fila.minutosParaSoltar) || 0,
    };
  } catch (error) {
    // Mudo no: desde fuera esto se ve como un interruptor que siempre aparece
    // apagado y no guarda, que es de lo más difícil de diagnosticar.
    console.warn("[escalado] no se pudieron leer los ajustes de la cuenta", String(error));
    return ESCALADO_POR_DEFECTO;
  }
}

/**
 * Si la IA puede escalar ella sola, por lo que entiende del cliente.
 *
 * Encendido, "quiero hablar con un asesor", "páseme un humano" y "necesito
 * hablar con alguien" llevan al mismo sitio sin que nadie las haya previsto.
 * Apagado, solo escalan las palabras clave configuradas a mano.
 *
 * Lo que NO cambia al apagarlo: **el motivo se registra igual**. La
 * conversación queda marcada con que ahí hizo falta una persona aunque no se
 * llamara a ninguna, y eso es lo que permite ver después si a esta cuenta le
 * convendría encenderlo. Una cuenta apagada no puede ser un agujero negro.
 */
export async function guardarEscalarPorIa(permitir: boolean): Promise<Resultado> {
  const cuenta = await laCuentaQueConfigura();
  if (!cuenta) return { success: false, message: "No autorizado." };

  try {
    await db.$executeRaw`
      UPDATE "User" SET escalation_by_ai_enabled = ${permitir} WHERE id = ${cuenta.id}
    `;
  } catch (error) {
    console.warn("[escalado] no se pudo guardar escalation_by_ai_enabled", String(error));
    return { success: false, message: "Esta opción aún no está disponible en el servidor." };
  }

  revalidatePath("/profile");
  return {
    success: true,
    message: permitir
      ? "La IA podrá pasar una conversación a un asesor cuando el cliente lo pida."
      : "La IA ya no escalará sola. Las palabras clave siguen funcionando.",
  };
}

/**
 * Si escalar apaga la IA en esa conversación.
 *
 * Apagarla NO es lo que impide que la IA conteste encima del asesor: de eso se
 * encarga `Session.status`, que se pone en falso en cuanto una persona escribe,
 * desde la App o desde el móvil. Esto solo decide si se calla ANTES, por el
 * mero hecho de escalar.
 */
export async function guardarApagarLaIaAlEscalar(apagar: boolean): Promise<Resultado> {
  const cuenta = await laCuentaQueConfigura();
  if (!cuenta) return { success: false, message: "No autorizado." };

  try {
    await db.$executeRaw`
      UPDATE "User" SET escalation_disables_ai = ${apagar} WHERE id = ${cuenta.id}
    `;
  } catch (error) {
    console.warn("[escalado] no se pudo guardar escalation_disables_ai", String(error));
    return { success: false, message: "Esta opción aún no está disponible en el servidor." };
  }

  revalidatePath("/profile");
  return {
    success: true,
    message: apagar
      ? "Al escalar, la IA se apagará en esa conversación."
      : "Al escalar, la IA seguirá respondiendo hasta que escriba una persona.",
  };
}

/**
 * Cuánto espera una conversación escalada a que el asesor conteste.
 *
 * `0` = no soltar nunca. Si no contesta nadie en ese tiempo, la conversación
 * vuelve al reparto saltando a quien no respondió; el barrido que lo hace vive
 * en el backend, y solo corre donde escalar apaga la IA: con la IA encendida no
 * hay abandono que castigar.
 */
export async function guardarMinutosParaSoltar(minutos: number): Promise<Resultado> {
  const cuenta = await laCuentaQueConfigura();
  if (!cuenta) return { success: false, message: "No autorizado." };

  // Entre 1 y 240 minutos, o 0 para apagarlo. Un minuto es poco margen para que
  // alguien lea y conteste; cuatro horas ya no es "sin respuesta".
  const valor = minutos <= 0 ? 0 : Math.max(1, Math.min(Math.round(minutos), 240));
  try {
    await db.$executeRaw`UPDATE "User" SET auto_release_minutes = ${valor} WHERE id = ${cuenta.id}`;
  } catch (error) {
    console.warn("[escalado] no se pudo guardar auto_release_minutes", String(error));
    return { success: false, message: "Esta opción aún no está disponible en el servidor." };
  }

  revalidatePath("/profile");
  return {
    success: true,
    message:
      valor === 0
        ? "Las conversaciones escaladas no se soltarán."
        : `Se soltarán a los ${valor} minutos sin respuesta.`,
  };
}
