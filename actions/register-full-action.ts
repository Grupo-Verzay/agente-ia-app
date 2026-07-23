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
import { AGENT_TEMPLATES } from "@/app/(root)/ai/_components/helpers/agentTemplates";
import { AGENT_PROMPT_IDS } from "@/lib/agent-prompt-ids";
import { cookies } from "next/headers";

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const DEFAULT_API_KEY_ID = "0c3a9266-4eb1-4a19-824e-844dcfe7a485";
const DEFAULT_WEBHOOK_URL = "https://backend.ia-app.com/webhook";
const DEFAULT_API_URL = process.env.SECRET_API_KEY;
const DEFAULT_DEL_SEGUIMIENTO = "Estamos para servirle.";
const DEFAULT_REGISTER_PLAN = "avanzado" as const;
const FALLBACK_IA_CREDITS = 8000;
const FREE_TRIAL_DAYS = 7;
const PAID_TRIAL_DAYS = 30;

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
    whatsappUrl?: string;
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
   Helpers para AgentPrompt
─────────────────────────────────────────── */
const TONO_INSTRUCCIONES: Record<string, string> = {
  formal: "Usa un tono formal y respetuoso. Trata al cliente de 'usted', evita coloquialismos y mantén un lenguaje serio y profesional.",
  amigable: "Usa un tono amigable y cercano. Puedes tutear, usar emojis con moderación 😊 y mostrar entusiasmo genuino.",
  casual: "Usa un tono casual y desenfadado. Habla de forma natural y directa, como si fuera una conversación entre amigos.",
  profesional: "Usa un tono profesional y directo. Ve al grano, sé conciso y resuelve las dudas con eficiencia.",
};

function buildRegistrationPromptText(
  company: string,
  businessSector: string,
  mainProduct: string,
  salesObjective: string,
  clienteIdeal: string,
  tono: string,
): string {
  const template = AGENT_TEMPLATES.find((t) => t.id === salesObjective);
  const objectiveLabel = template?.name ?? salesObjective;
  const tonoInstruccion = TONO_INSTRUCCIONES[tono] ?? TONO_INSTRUCCIONES["amigable"];

  const lines: string[] = [
    `# ${company} — Agente de ${objectiveLabel}`,
    ``,
    `**Rubro:** ${businessSector || "No especificado"}`,
    `**Tono:** ${tono || "amigable"}`,
    ``,
    `Eres el asistente de inteligencia artificial de ${company}. Tu objetivo principal es: ${objectiveLabel}.`,
    ``,
    `## PERSONALIDAD Y TONO`,
    ``,
    tonoInstruccion,
    ``,
  ];

  if (mainProduct) {
    lines.push(`## PRODUCTOS Y SERVICIOS`, ``, mainProduct, ``);
  }

  if (clienteIdeal) {
    lines.push(`## PERFIL DEL CLIENTE IDEAL`, ``, clienteIdeal, ``);
  }

  lines.push(`---`, ``, `## FLUJO DE CONVERSACIÓN`);

  if (template?.sections.training) {
    for (const step of template.sections.training) {
      lines.push(``, `### ${step.title}`, ``, step.mainMessage);
    }
  }

  if (template?.sections.management) {
    lines.push(``, `---`, ``, `## GESTIÓN`);
    for (const step of template.sections.management) {
      lines.push(``, `### ${step.title}`, ``, step.mainMessage);
    }
  }

  return lines.join("\n");
}

function buildRegistrationSections(
  company: string,
  businessSector: string,
  mainProduct: string,
  salesObjective: string,
  clienteIdeal: string,
  tono: string,
) {
  const template = AGENT_TEMPLATES.find((t) => t.id === salesObjective);

  const trainingSteps = (template?.sections.training ?? []).map((step) => ({
    id: randomUUID(),
    title: step.title,
    mainMessage: step.mainMessage,
    variableQueRecoge: "",
    condicionParaAvanzar: "",
    elements: [],
  }));

  const managementSteps = (template?.sections.management ?? []).map((step) => ({
    id: randomUUID(),
    title: step.title,
    mainMessage: step.mainMessage,
    elements: [],
  }));

  return {
    business: {
      nombre: company,
      sector: businessSector,
      ubicacion: "",
      horarios: "",
      telefono: "",
      email: "",
      sitio: "",
      facebook: "",
      instagram: "",
      tiktok: "",
      youtube: "",
      linkedin: "",
      twitter: "",
      telegram: "",
      notas: [
        clienteIdeal ? `Cliente ideal: ${clienteIdeal}` : null,
        tono ? `Tono del agente: ${tono}` : null,
      ].filter(Boolean).join(" | ") || "",
    },
    training: { steps: trainingSteps },
    faq: { steps: [] },
    products: {
      items: mainProduct
        ? [{ id: randomUUID(), name: mainProduct, description: "", price: "", image: "" }]
        : [],
    },
    extras: { firmaEnabled: false, firmaText: "", firmaName: "", items: [] },
    management: { steps: managementSteps },
  };
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

  try {
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
      return { success: false, message: "No se recibió instanceId de la API." };
    }

    await db.instancia.create({
      data: { instanceName, instanceType: "Whatsapp", userId, instanceId },
    });

    return { success: true, message: "Instancia creada exitosamente." };
  } catch {
    return { success: false, message: "Error de conexión con la API de WhatsApp." };
  }
}

/* ─────────────────────────────────────────
   Main server action
───────────────────────────────────────── */
export async function fullRegisterAction(
  values: z.infer<typeof fullRegisterSchema>,
  apiKeyRef?: string,
  affiliateCode?: string,
  resellerSlug?: string,
  isPaid?: boolean
): Promise<FullRegisterResult> {
  const parsed = fullRegisterSchema.safeParse(values);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Datos inválidos.";
    return { success: false, error: firstError };
  }

  const { name, email, password, company, notificationNumber, timezone, businessSector, salesObjective, mainProduct, clienteIdeal, tono } =
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
  const trialDays = isPaid ? PAID_TRIAL_DAYS : FREE_TRIAL_DAYS;
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

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

  /* ── Look up plan credits before transaction ── */
  const planCreditsConfig = await db.planConfig
    .findUnique({ where: { plan: DEFAULT_REGISTER_PLAN } })
    .catch(() => null);
  const initialCredits = planCreditsConfig?.credits ?? FALLBACK_IA_CREDITS;

  /* ── Pre-lookup reseller for demo account creation ── */
  let resellerUserId: string | null = null;
  if (resellerSlug) {
    const resellerRow = await db.reseller.findFirst({
      where: { slug: resellerSlug },
      select: { resellerid: true, demoLimit: true },
    }).catch(() => null);
    if (resellerRow?.resellerid) {
      resellerUserId = resellerRow.resellerid;
      const demoLimit = resellerRow.demoLimit ?? 3;
      const demosUsed = await db.user.count({
        where: { demoResellerId: resellerUserId, isDemo: true },
      });
      if (demosUsed >= demoLimit) {
        return { success: false, error: "Prueba no disponible en este momento. Contacta al reseller para más información." };
      }
    }
  }

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
          company,
          notificationNumber,
          role: "user",
          plan: DEFAULT_REGISTER_PLAN,
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
          image: "https://medias3.verzay.co/verzay-media/VERZAY-ROBOT-PROFILE.png",
          trialEndsAt,
          ...(resellerUserId && {
            isDemo: true,
            demoResellerId: resellerUserId,
            demoCredits: 1000,
            demoExpiresAt: trialEndsAt,
          }),
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
          licenseDays: trialDays,
        },
      });

      // 3. IaCredit — créditos según plan
      await tx.iaCredit.create({
        data: {
          userId: created.id,
          total: initialCredits,
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

      // 7. Workflow BIENVENIDA — template inicial listo para editar (flujo avanzado)
      const bienvenidaWorkflow = await tx.workflow.create({
        data: {
          userId: created.id,
          name: 'BIENVENIDA',
          definition: '{}',
          status: 'active',
          isPro: false,
          order: 0,
          triggerOnNewSession: true,
        },
      });
      await tx.workflowNode.create({
        data: {
          workflowId: bienvenidaWorkflow.id,
          tipo: 'message',
          message: '¡Hola! 👋 Bienvenido. Estamos aquí para ayudarte.',
          order: 1,
          posX: 100,
          posY: 100,
        },
      });

      return created;
    });

    userId = user.id;
    completedSteps.push("user", "billing", "credits", "tags");

    /* ── STEP 6: Create WhatsApp instance (external API + DB) ── */
    const instanceName = sanitizeInstanceName(company);
    const instanceResult = await createInstanceForUser(userId, instanceName);

    if (instanceResult.success) {
      completedSteps.push("instance");
    } else {
      console.warn("[FULL_REGISTER] WhatsApp instance creation failed (non-fatal):", instanceResult.message);
    }

    /* ── STEP 7: Affiliate referral ── */
    if (affiliateCode) {
      const affiliate = await db.affiliateProfile.findUnique({
        where: { code: affiliateCode.trim().toUpperCase() },
        select: { id: true },
      }).catch(() => null);
      if (affiliate) {
        await db.affiliateReferral.create({
          data: { affiliateId: affiliate.id, referredUserId: userId },
        }).catch(() => null);
      }
    }

    /* ── STEP 7b: Reseller WhatsApp URL ── */
    let whatsappUrl: string | undefined;
    if (resellerUserId) {
      const resellerUser = await db.user.findUnique({
        where: { id: resellerUserId },
        select: { notificationNumber: true },
      }).catch(() => null);

      if (resellerUser?.notificationNumber) {
        const phone = resellerUser.notificationNumber.replace(/\D/g, "");
        const objectiveLabel = AGENT_TEMPLATES.find((t) => t.id === salesObjective)?.name ?? salesObjective;
        const parts = [
          `\u{1F680} \u{00A1}Hola! Acabo de crear mi cuenta en Agente IA.`,
          ``,
          `\u{1F464} Nombre: ${name}`,
          `\u{1F3E2} Empresa: ${company}`,
          businessSector ? `\u{1F3F7} Rubro: ${businessSector}` : null,
          `\u{1F3AF} Objetivo: ${objectiveLabel}`,
          mainProduct ? `\u{1F4E6} Productos/servicios: ${mainProduct}` : null,
          clienteIdeal ? `\u{1F465} Cliente ideal: ${clienteIdeal}` : null,
          ``,
          `Requiero ayuda para seguir con el proceso de configuraci\u{00F3}n.`,
        ].filter(Boolean).join("\n");
        whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(parts)}`;
      }
    } else if (!isPaid) {
      const verzayPhone = process.env.VERZAY_WHATSAPP_NUMBER?.replace(/\D/g, "");
      if (verzayPhone) {
        const objectiveLabel = AGENT_TEMPLATES.find((t) => t.id === salesObjective)?.name ?? salesObjective;
        const parts = [
          `\u{1F680} \u{00A1}Hola! Acabo de crear mi cuenta en Agente IA.`,
          ``,
          `\u{1F464} Nombre: ${name}`,
          `\u{1F3E2} Empresa: ${company}`,
          businessSector ? `\u{1F3F7} Rubro: ${businessSector}` : null,
          `\u{1F3AF} Objetivo: ${objectiveLabel}`,
          mainProduct ? `\u{1F4E6} Productos/servicios: ${mainProduct}` : null,
          clienteIdeal ? `\u{1F465} Cliente ideal: ${clienteIdeal}` : null,
          ``,
          `Requiero ayuda para seguir con el proceso de configuraci\u{00F3}n.`,
        ].filter(Boolean).join("\n");
        whatsappUrl = `https://wa.me/${verzayPhone}?text=${encodeURIComponent(parts)}`;
      }
    }

    /* ── STEP 7c: NO se pre-configura el agente ──
       El asistente de alta (5 pasos) lo configura cuando el usuario entra por
       primera vez. Dejamos pre-cargado el objetivo/negocio del registro vía
       cookie para que el asistente arranque con esos datos. */
    try {
      const cookieStore = await cookies();
      cookieStore.set(
        "agent_onboarding_prefill",
        JSON.stringify({ objectiveId: salesObjective ?? "", nombre: company ?? "", ofrece: mainProduct ?? "" }),
        { maxAge: 60 * 60 * 24 * 7, path: "/", httpOnly: true, sameSite: "lax" },
      );
    } catch { /* noop */ }

    /* ── STEP 8: Auto sign-in ── */
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
      whatsappUrl,
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

    if (error instanceof Prisma.PrismaClientValidationError) {
      console.error("[FULL_REGISTER_ERROR] Prisma validation:", error.message);
      return { success: false, error: `Error de validación: ${error.message.slice(0, 200)}` };
    }

    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FULL_REGISTER_ERROR]", msg);
    return { success: false, error: `Error: ${msg.slice(0, 300)}` };
  }
}
