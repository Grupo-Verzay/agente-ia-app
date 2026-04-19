"use server";

import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { fullRegisterSchema } from "@/lib/zod";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";
import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { sanitizeInstanceName } from "@/schema/connection";
import { decodeApiKeyRef } from "@/lib/register-link";

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const DEFAULT_API_KEY_ID = "0c3a9266-4eb1-4a19-824e-844dcfe7a485";
const DEFAULT_WEBHOOK_URL = "https://backend.ia-app.com/webhook";
const DEFAULT_API_URL = process.env.SECRET_API_KEY;
const DEFAULT_DEL_SEGUIMIENTO = "Estamos para servirle.";
const DEFAULT_IA_CREDITS = 1000;
const TRIAL_DAYS = 3;

const DEFAULT_TAGS = [
  { name: "Nuevo cliente", color: "#22c55e" },
  { name: "Cliente activo", color: "#3b82f6" },
  { name: "Por atender", color: "#f97316" },
  { name: "Cerrado", color: "#6b7280" },
];

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
export type RegisterCompletedStep =
  | "user"
  | "billing"
  | "credits"
  | "tags"
  | "instance";

export type FullRegisterResult =
  | {
    success: true;
    trialEndsAt: string;
    trialEndsLabel: string;
    completedSteps: RegisterCompletedStep[];
  }
  | { success: false; error: string };

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function formatTrialDate(date: Date): string {
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

/* ─────────────────────────────────────────
   Instance creation (internal, no auth check)
───────────────────────────────────────── */
async function createInstanceForUser(
  userId: string,
  instanceName: string
): Promise<{ success: boolean; message: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { apiKey: true },
  });

  if (!user?.apiKey) {
    // Fallback: create a local instance record without external API
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: "Whatsapp",
        userId,
        instanceId: `local-${randomUUID()}`,
      },
    });
    return { success: true, message: "Instancia local creada." };
  }

  const { key: apiKey, url: serverUrl } = user.apiKey;

  const response = await fetch(`https://${serverUrl}/instance/create`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  const apiResult = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      success: false,
      message: apiResult?.message ?? `HTTP ${response.status}`,
    };
  }

  const instanceId: string | undefined = apiResult?.hash;
  if (!instanceId) {
    return {
      success: false,
      message: "No se recibió instanceId de la API.",
    };
  }

  await db.instancia.create({
    data: { instanceName, instanceType: "Whatsapp", userId, instanceId },
  });

  return { success: true, message: "Instancia creada exitosamente." };
}

/* ─────────────────────────────────────────
   Main server action
───────────────────────────────────────── */
export async function fullRegisterAction(
  values: z.infer<typeof fullRegisterSchema>,
  apiKeyRef?: string
): Promise<FullRegisterResult> {
  const parsed = fullRegisterSchema.safeParse(values);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Datos inválidos.";
    return { success: false, error: firstError };
  }

  const { name, email, password, company, notificationNumber, timezone } =
    parsed.data;

  /* ── 0. Check email uniqueness ── */
  const existing = await db.user.findUnique({
    where: { email },
    include: { accounts: { select: { type: true } } },
  });

  if (existing) {
    const hasOAuth = existing.accounts.some((a) => a.type === "oauth");
    return {
      success: false,
      error: hasOAuth
        ? "Esta cuenta usa autenticación externa. Inicia sesión con ese método."
        : "Ya existe una cuenta con este correo electrónico.",
    };
  }

  /* ── Prepare dates ── */
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  const resolvedTimezone =
    timezone ?? "America/Bogota";

  const passwordHash = await bcrypt.hash(password, LENGTH_PASSWORD_HASH);

  /* ── Resolve which ApiKey to assign — prefer the ref from the URL ── */
  const requestedApiKeyId = apiKeyRef ? decodeApiKeyRef(apiKeyRef) : null;
  const targetApiKeyId = requestedApiKeyId ?? DEFAULT_API_KEY_ID;

  const apiKeyExists = await db.apiKey
    .findUnique({ where: { id: targetApiKeyId }, select: { id: true } })
    .catch(() => null);

  /* ── Fetch OpenAI provider for AI auto-config ── */
  const openaiProvider = await db.aiProvider
    .findFirst({
      where: { name: 'openai' },
      include: { models: { orderBy: { name: 'asc' }, take: 1 } },
    })
    .catch(() => null);

  const resolvedApiKeyId = apiKeyExists ? targetApiKeyId : null;

  const completedSteps: RegisterCompletedStep[] = [];
  let userId: string | null = null;

  try {
    /* ── STEPS 1–5: All DB records in a single transaction ── */
    const user = await db.$transaction(async (tx) => {
      // 1. User
      const created = await tx.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          passPlainTxt: password,
          company,
          notificationNumber,
          role: "user",
          plan: "avanzado",
          apiKeyId: resolvedApiKeyId,
          delSeguimiento: DEFAULT_DEL_SEGUIMIENTO,
          webhookUrl: DEFAULT_WEBHOOK_URL,
          apiUrl: DEFAULT_API_URL,
          timezone: resolvedTimezone,
          status: true,
          enabledSynthesizer: true,
          enabledLeadStatusClassifier: true,
          enabledCrmFollowUps: true,
          autoReactivate: "30",
          delayTimeGpt: "10",
          image: "https://medias3.verzay.co/verzay-media/VERZAY-ROBOT-PROFILE.png"
        },
      });

      // 2. UserBilling — 3-day trial
      await tx.userBilling.create({
        data: {
          serviceName: "Agente IA",
          userId: created.id,
          price: 0,
          currencyCode: "USD",
          paymentMethodLabel: "Link de pago",
          paymentNotes: "👉 https://verzay.com/agente-ia",
          notifyRemoteJid: notificationNumber,
          billingStatus: "PAID",
          accessStatus: "ACTIVE",
          dueDate: trialEndsAt,
          serviceStartAt: now,
          serviceEndsAt: trialEndsAt,
          graceDays: 0,
          licenseDays: TRIAL_DAYS,
        },
      });

      // 3. IaCredit — 1000 credits
      await tx.iaCredit.create({
        data: {
          userId: created.id,
          total: DEFAULT_IA_CREDITS,
          used: 0,
          renewalDate: trialEndsAt,
        },
      });

      // 4. Pausar (opening message)
      await tx.pausar.create({
        data: {
          userId: created.id,
          tipo: "abrir",
          mensaje: "Fue un gusto ayudarle.",
          baseurl: "https://conexion.verzay.co",
          instanciaId: "default-instancia-id",
          apikeyId: resolvedApiKeyId ?? DEFAULT_API_KEY_ID,
        },
      });

      // 5. Default tags
      await tx.tag.createMany({
        data: DEFAULT_TAGS.map((tag, index) => ({
          userId: created.id,
          name: tag.name,
          slug: slugify(tag.name),
          color: tag.color,
          order: index,
        })),
      });

      // 6. AI config — auto-configure OpenAI with the default secret key
      if (openaiProvider && process.env.SECRET_API_KEY) {
        await tx.userAiConfig.create({
          data: {
            userId: created.id,
            providerId: openaiProvider.id,
            apiKey: process.env.SECRET_API_KEY,
            isActive: true,
          },
        });
        await tx.user.update({
          where: { id: created.id },
          data: {
            defaultProviderId: openaiProvider.id,
            defaultAiModelId: openaiProvider.models[0]?.id ?? null,
          },
        });
      }

      return created;
    });

    userId = user.id;
    completedSteps.push("user", "billing", "credits", "tags");

    /* ── STEP 6: Create WhatsApp instance (external API + DB) ── */
    const instanceName = sanitizeInstanceName(company);
    const instanceResult = await createInstanceForUser(userId, instanceName);

    if (!instanceResult.success) {
      // Hard rollback — cascade removes billing, credits, pausar, tags
      await db.user.delete({ where: { id: userId } });
      return {
        success: false,
        error: `Error al crear la instancia de WhatsApp: ${instanceResult.message}`,
      };
    }

    completedSteps.push("instance");

    /* ── STEP 7: Auto sign-in ── */
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    return {
      success: true,
      trialEndsAt: trialEndsAt.toISOString(),
      trialEndsLabel: formatTrialDate(trialEndsAt),
      completedSteps,
    };
  } catch (error: unknown) {
    // If user was created but something after the transaction failed, clean up
    if (userId) {
      await db.user.delete({ where: { id: userId } }).catch(() => { });
    }

    if (error instanceof AuthError) {
      console.error("[FULL_REGISTER_ERROR] AuthError:", error);
      return { success: false, error: "No fue posible iniciar sesión automáticamente. Por favor intenta acceder manualmente." };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[FULL_REGISTER_ERROR] Prisma:", error.code, error.message, error.meta);
      return { success: false, error: "Ocurrió un problema al guardar tu información. Por favor intenta de nuevo." };
    }

    if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientRustPanicError) {
      console.error("[FULL_REGISTER_ERROR] Prisma (unknown/panic):", error);
      return { success: false, error: "Ocurrió un problema con la base de datos. Por favor intenta de nuevo más tarde." };
    }

    console.error("[FULL_REGISTER_ERROR]", error);
    return { success: false, error: "Ocurrió un error inesperado. Por favor intenta de nuevo." };
  }
}
