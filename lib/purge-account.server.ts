import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Borra de verdad los datos de una cuenta ya marcada como eliminada.
 *
 * Va por fuera de cualquier transacción a propósito. Antes todo esto vivía
 * dentro de una sola, y con una cuenta con historial ni siquiera cabía en el
 * tiempo por defecto de Prisma; al ampliarlo a dos minutos dejó de fallar, pero
 * una transacción abierta tanto rato impide reciclar las tuplas muertas de TODA
 * la base mientras dura. Cada borrado por separado se confirma solo y el
 * problema desaparece.
 *
 * Es reanudable: si se corta a medias, la cuenta sigue marcada y el barrido
 * diario la vuelve a coger donde se quedó.
 */
export async function purgarCuentaEliminada(id: string): Promise<{ success: boolean; message: string }> {
  let currentStep = "init";

  try {
    // Cada borrado se confirma por su cuenta: `tx` es la conexión normal, no una
    // transacción. El nombre se conserva para no reescribir treinta líneas.
    const tx = db;
    {
      // Asesores de esta cuenta. Se borran ANTES que ella porque la relación
      // asesor→cuenta madre no está en cascada: al borrar la madre, Prisma les
      // dejaba el vínculo en nulo y los asesores sobrevivían convertidos en
      // cuentas principales sueltas. Aparecían luego en Clientes y en Finanzas
      // como cuentas de nadie, sin servicio ni fecha de cobro.
      //
      // Se borran con tx.user.delete uno a uno, no con deleteMany, para que se
      // dispare el borrado en cascada de TODO lo suyo (sesiones, mensajes,
      // etiquetas). Un deleteMany masivo se saltaría esas cascadas y dejaría el
      // rastro que precisamente estamos limpiando.
      currentStep = "delete_advisors";
      const asesores = await tx.user.findMany({
        where: { ownerId: id },
        select: { id: true },
      });
      for (const asesor of asesores) {
        await tx.promptInstance.deleteMany({ where: { userId: asesor.id } });
        await tx.reminders.deleteMany({ where: { userId: asesor.id } });
        await tx.appointment.deleteMany({ where: { userId: asesor.id } });
        await tx.service.deleteMany({ where: { userId: asesor.id } });
        await tx.reseller.deleteMany({ where: { userId: asesor.id } });
        await tx.user.delete({ where: { id: asesor.id } });
      }

      currentStep = "load_user";
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true, apiKeyId: true },
      });

      currentStep = "load_sessions";
      const sessions = await tx.session.findMany({
        where: { userId: id },
        select: { id: true, instanceId: true, remoteJid: true },
      });
      const instanceIds = sessions
        .map((s) => s.instanceId)
        .filter(Boolean) as string[];
      const remoteJids = sessions
        .map((s) => s.remoteJid)
        .filter(Boolean) as string[];

      currentStep = "load_instancias";
      const instancias = await tx.instancia.findMany({
        where: { userId: id },
        select: { instanceName: true },
      });
      const instanceNames = instancias
        .map((i) => i.instanceName)
        .filter(Boolean) as string[];

      // Cargar apiKey (para limpiar seguimientos + apikey huérfana)
      currentStep = "load_api_key";
      let userApiKey: { key: string } | null = null;
      if (user?.apiKeyId) {
        userApiKey = await tx.apiKey.findUnique({
          where: { id: user.apiKeyId },
          select: { key: true },
        });
      }

      // 1) reseller (no tiene onDelete: Cascade)
      currentStep = "delete_reseller_links";
      await tx.reseller.deleteMany({ where: { userId: id } });
      await tx.reseller.deleteMany({ where: { resellerid: id } });

      // 2) Workflows + rr (no hay FK, pero limpiamos por orden)
      currentStep = "cleanup_workflows_rr";
      const workflows = await tx.workflow.findMany({
        where: { userId: id },
        select: { id: true },
      });
      const workflowIds = workflows.map((w) => w.id);

      if (workflowIds.length) {
        await tx.workflowNode.deleteMany({
          where: { workflowId: { in: workflowIds } },
        });

        await tx.quickReply.deleteMany({
          where: { workflowId: { in: workflowIds } },
        });
      }

      await tx.quickReply.deleteMany({ where: { userId: id } });

      // 3) Historias n8n (tabla sin FK; usamos instanceIds como ya hacías)
      currentStep = "cleanup_n8n_chat_histories";
      if (instanceIds.length) {
        await tx.n8nChatHistory.deleteMany({
          where: { sessionId: { in: instanceIds } },
        });
      }

      // 4) Reminders (sin relación en Prisma)
      currentStep = "cleanup_reminders";
      await tx.reminders.deleteMany({ where: { userId: id } });

      // 5) VerificationToken (por email)
      if (user?.email) {
        currentStep = "cleanup_verification_tokens";
        await tx.verificationToken.deleteMany({
          where: { identifier: user.email },
        });
      }

      // 6) PromptInstance (sin onDelete: Cascade → bloquearía el delete de User)
      currentStep = "cleanup_prompt_instances";
      await tx.promptInstance.deleteMany({ where: { userId: id } });

      // 7) Appointment + Service (por FKs entre sí y sin cascade en Service.user)
      currentStep = "cleanup_appointments_services";
      await tx.appointment.deleteMany({ where: { userId: id } });
      await tx.service.deleteMany({ where: { userId: id } });

      // 8) Seguimientos (tabla sin FKs: limpiamos por señales)
      currentStep = "cleanup_seguimientos";
      const orSeguimientos: Prisma.SeguimientoWhereInput[] = [];
      if (remoteJids.length) orSeguimientos.push({ remoteJid: { in: remoteJids } });
      if (instanceNames.length) orSeguimientos.push({ instancia: { in: instanceNames } });
      if (userApiKey?.key) orSeguimientos.push({ apikey: userApiKey.key });

      if (orSeguimientos.length) {
        await tx.seguimiento.deleteMany({ where: { OR: orSeguimientos } });
      }

      // 9) Borrar usuario (aquí se activan TODOS los onDelete: Cascade)
      currentStep = "delete_user";
      await tx.user.delete({ where: { id } });

      // 10) Limpiar ApiKey huérfana si ya no la usa nadie
      if (user?.apiKeyId) {
        currentStep = "cleanup_apikey";
        await tx.apiKey.deleteMany({
          where: {
            id: user.apiKeyId,
            users: { none: {} },
          },
        });
      }
    }

    // Log simple de éxito
    await db.log.create({
      data: {
        level: "info",
        message: "purgarCuentaEliminada completed",
        context: JSON.stringify({ userId: id }),
      },
    });

    return {
      success: true,
      message: "User and related data deleted successfully.",
    };
  } catch (error) {
    const errMsg = (error as { message?: string })?.message || String(error);
    console.error("[purgarCuentaEliminada] ERROR", { userId: id, step: currentStep, error: errMsg });

    // La cuenta sigue marcada como eliminada, así que el barrido diario la
    // retomará. Dejar constancia del paso permite ver dónde se atasca si se
    // repite.
    try {
      await db.log.create({
        data: {
          level: "error",
          message: `purgarCuentaEliminada failed at step ${currentStep}: ${errMsg}`,
          context: JSON.stringify({ userId: id, step: currentStep }),
        },
      });
    } catch (logErr) {
      console.error("[purgarCuentaEliminada] failed to persist error log", logErr);
    }

    return {
      success: false,
      message: `No se pudo purgar la cuenta (paso: ${currentStep}). ${errMsg}`,
    };
  }
}

/**
 * Barrido de rezagadas: cuentas marcadas como eliminadas cuyos datos siguen ahí.
 *
 * Sin esto, una purga cortada a medias —un despliegue, un reinicio— dejaría la
 * cuenta apagada pero con sus datos dentro para siempre. Corre con el resto de
 * tareas diarias y no necesita saber por dónde se quedó: vuelve a empezar, y
 * los borrados ya hechos simplemente no encuentran nada.
 *
 * De pocas en pocas: son operaciones pesadas y no hay ninguna prisa.
 */
export async function purgarCuentasEliminadasPendientes(limite = 5) {
  const pendientes = await db.user.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true },
    orderBy: { deletedAt: "asc" },
    take: limite,
  });

  let purgadas = 0;
  for (const cuenta of pendientes) {
    const res = await purgarCuentaEliminada(cuenta.id);
    if (res.success) purgadas++;
  }

  return { pendientes: pendientes.length, purgadas };
}

