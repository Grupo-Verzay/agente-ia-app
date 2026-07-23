"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { BASE_TRAINING_AGENT_ID } from "@/lib/channel-training";
import { getOrCreateChannelPrompt, publishPrompt } from "@/actions/system-prompt-actions";
import { isAdminOrReseller } from "@/lib/rbac";

/**
 * Asistente de "dar de alta el Agente IA" (primer arranque).
 *
 * Guía al dueño en 5 pasos y guarda TODO en las mismas secciones que usa el
 * editor (business, training, faq, products, extras, management), luego publica.
 * No usa columnas nuevas en la BD: el estado se deriva de si el agente ya tiene
 * contenido + una cookie de "hacerlo después".
 */

const DISMISS_COOKIE = "agent_onboarding_dismissed";

const VALID_OBJECTIVES = new Set([
  "venta-directa",
  "venta-consultiva",
  "agendamiento-citas",
  "calificacion-leads",
  "atencion-cliente",
  "pedidos-delivery",
]);

// Subtipos válidos de captura de datos (management). Deben coincidir con el enum
// de PromptElementSchema (agentAi.ts).
const GESTION_SUBTYPES = new Set(["Solicitudes", "Pedidos", "Reclamos", "Reservas", "Citas"]);

// Mensaje principal por subtipo (copiado de CAPTURA_MAIN_MESSAGES en agentAi.ts)
// para que cada paso de gestión tenga contenido y la sección se renderice.
const CAPTURA_MSG: Record<string, string> = {
  Solicitudes: "Cuando un usuario exprese una solicitud, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:",
  Reclamos: "Cuando un usuario exprese una queja o problema, debes recopilar los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:",
  Pedidos: "Cuando un usuario exprese realizar un **pedido**, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:",
  Reservas: "Cuando un usuario exprese una reserva, recopila todos los datos **uno a uno** o **en una sola toma si el usuario los da completos** de la siguiente manera:",
  Citas: "Cuando un usuario exprese agendar una **cita**",
};

const clean = (s?: string | null) => (s ?? "").trim();
const uid = () => crypto.randomUUID();

/** La cuenta "efectiva" (dueña) del usuario actual. */
function ownerId(me: { effectiveId?: string | null; id: string }): string {
  return me.effectiveId ?? me.id;
}

/**
 * ¿El Agente IA REAL (el prompt base de WhatsApp que atiende) ya está configurado?
 * Mira exactamente el mismo prompt que lee el editor (agentId base), no "cualquiera".
 */
async function isAgentConfigured(userId: string): Promise<boolean> {
  const p = await db.agentPrompt.findFirst({
    where: { userId, agentId: BASE_TRAINING_AGENT_ID },
    select: { businessName: true, status: true, sections: true },
  });
  if (!p) return false;
  const hasBiz = !!(p.businessName && p.businessName.trim());
  const steps = (p.sections as any)?.training?.steps;
  const hasFlow = Array.isArray(steps) && steps.length > 0;
  return hasBiz || hasFlow || p.status === "published";
}

/**
 * ¿Debe mostrarse el asistente de primer arranque?
 * Solo al dueño (no asesores ni admins), solo si NO lo pospuso y su agente aún no
 * tiene contenido.
 */
export interface OnboardingPrefill {
  objectiveId?: string;
  nombre?: string;
  ofrece?: string;
}

export async function getAgentOnboardingState(): Promise<{
  show: boolean;
  name?: string | null;
  prefill?: OnboardingPrefill | null;
}> {
  const me = await currentUser();
  if (!me?.id) return { show: false };
  if ((me as { advisorRole?: string | null }).advisorRole) return { show: false };
  if (isAdminOrReseller((me as { role?: string | null }).role)) return { show: false };

  const cookieStore = await cookies();
  if (cookieStore.get(DISMISS_COOKIE)?.value === "1") return { show: false };

  const userId = ownerId(me);
  if (await isAgentConfigured(userId)) return { show: false };

  // Pre-carga desde el registro (objetivo/negocio) si existe.
  let prefill: OnboardingPrefill | null = null;
  const raw = cookieStore.get("agent_onboarding_prefill")?.value;
  if (raw) {
    try {
      const p = JSON.parse(raw);
      prefill = { objectiveId: p.objectiveId, nombre: p.nombre, ofrece: p.ofrece };
    } catch {
      /* noop */
    }
  }

  return { show: true, name: (me as { name?: string | null }).name ?? null, prefill };
}

/** Marca el asistente como pospuesto ("hacerlo después") vía cookie. */
export async function dismissAgentOnboarding(): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  cookieStore.set(DISMISS_COOKIE, "1", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return { ok: true };
}

export interface AgentOnboardingInput {
  business: {
    nombre: string;
    sector: string;
    ofrece: string;
    ubicacion: string;
    horario: string;
    telefono: string;
    sitio: string;
    notas?: string;
  };
  objectiveId: string;
  /** Camino del cliente (pasos base + adicionales) en orden. */
  steps: { title: string; message: string }[];
  faq: { q: string; a: string }[];
  products: { name: string; desc: string }[];
  /** Medios de pago (coma-separados). */
  pagos: string;
  extras?: string;
  /** Tipos de gestión activados con sus campos a capturar. */
  gestion?: { tipo: string; campos: string[] }[];
}

/**
 * Da de alta el agente: construye todas las secciones desde lo que llenó el
 * cliente y publica el prompt base de WhatsApp (el que atiende de verdad).
 */
export async function completeAgentOnboarding(
  input: AgentOnboardingInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await currentUser();
    if (!me?.id) return { ok: false, error: "No autorizado." };
    if ((me as { advisorRole?: string | null }).advisorRole) {
      return { ok: false, error: "Solo el dueño de la cuenta puede configurar el agente." };
    }
    if (!VALID_OBJECTIVES.has(input.objectiveId)) {
      return { ok: false, error: "Objetivo no válido." };
    }

    const userId = ownerId(me);
    const b = input.business ?? ({} as AgentOnboardingInput["business"]);
    if (!clean(b.nombre)) return { ok: false, error: "Falta el nombre del negocio." };

    // Prompt base de WhatsApp — el MISMO que lee el editor (agentId base).
    const prompt = await getOrCreateChannelPrompt({ userId, agentId: BASE_TRAINING_AGENT_ID });

    // --- Construcción de secciones (mismo formato que el editor) ---

    // "¿Qué ofrece?" no tiene campo propio en business: va en NOTAS ADICIONALES.
    // Los medios de pago van como pregunta frecuente (más abajo), que es su lugar.
    const notas = [
      clean(b.ofrece) ? `Qué ofrecemos: ${clean(b.ofrece)}` : "",
      clean(b.notas),
    ]
      .filter(Boolean)
      .join("\n\n");

    const business = {
      nombre: clean(b.nombre),
      sector: clean(b.sector),
      ubicacion: clean(b.ubicacion),
      horarios: clean(b.horario),
      telefono: clean(b.telefono),
      sitio: clean(b.sitio),
      notas,
    };

    // Camino del cliente → training.steps (title = paso, mainMessage = lo que dice).
    const training = {
      steps: (input.steps ?? [])
        .filter((s) => clean(s.title) || clean(s.message))
        .map((s) => ({
          id: uid(),
          title: clean(s.title),
          mainMessage: clean(s.message),
          elements: [] as any[],
        })),
    };

    // Preguntas frecuentes → faq.steps (title = pregunta, mainMessage = respuesta).
    const faqSteps = (input.faq ?? [])
      .filter((f) => clean(f.q))
      .map((f) => ({ id: uid(), title: clean(f.q), mainMessage: clean(f.a), elements: [] as any[] }));
    // Medios de pago → pregunta frecuente (visible + el agente la responde).
    if (clean(input.pagos)) {
      faqSteps.push({ id: uid(), title: "Medios de pago", mainMessage: `Aceptamos: ${clean(input.pagos)}.`, elements: [] as any[] });
    }
    const faq = { steps: faqSteps };

    // Productos / servicios → products.steps (title = nombre, mainMessage = ficha).
    const products = {
      steps: (input.products ?? [])
        .filter((p) => clean(p.name))
        .map((p) => ({
          id: uid(),
          title: clean(p.name),
          mainMessage: clean(p.desc) || clean(p.name),
          elements: [] as any[],
        })),
    };

    // Extras / información adicional → un step de extras (sin firma).
    const extras = {
      firmaEnabled: false,
      firmaText: "",
      firmaName: "",
      steps: clean(input.extras)
        ? [{ id: uid(), title: "Información adicional", mainMessage: clean(input.extras), elements: [] as any[] }]
        : [],
    };

    // Gestión → management.steps con elementos captura_datos por tipo.
    // Cada paso lleva su mensaje predefinido (CAPTURA_MSG) para que la sección
    // aparezca aunque no tenga campos/enlace (ej. Citas), igual que el editor.
    const management = {
      steps: (input.gestion ?? [])
        .filter((g) => GESTION_SUBTYPES.has(g.tipo))
        .map((g) => {
          if (g.tipo === "Citas") {
            // Citas: el enlace de agendamiento se configura aparte (queda vacío aquí).
            return {
              id: uid(),
              title: "Citas",
              mainMessage: CAPTURA_MSG.Citas,
              elements: [
                { id: uid(), kind: "function", fn: "captura_datos", subtype: "Citas", prompt: "" },
              ] as any[],
            };
          }
          return {
            id: uid(),
            title: g.tipo,
            mainMessage: CAPTURA_MSG[g.tipo] ?? "",
            elements: [
              {
                id: uid(),
                kind: "function",
                fn: "captura_datos",
                subtype: g.tipo,
                prompt: "por favor indicame los siguientes datos",
                fields: (g.campos ?? []).map((c) => clean(c)).filter(Boolean),
              },
            ] as any[],
          };
        }),
    };

    const existing = (prompt.sections ?? {}) as Record<string, any>;
    const sections = { ...existing, business, training, faq, products, extras, management };

    await db.agentPrompt.update({
      where: { id: prompt.id },
      data: {
        sections: sections as any,
        version: { increment: 1 },
        businessName: business.nombre || null,
        businessSector: business.sector || null,
      },
    });

    // Publicar (compila el promptText + crea revisión).
    const fresh = await db.agentPrompt.findUnique({
      where: { id: prompt.id },
      select: { version: true },
    });
    const pub = await publishPrompt({
      promptId: prompt.id,
      version: fresh?.version ?? prompt.version + 1,
      publishedBy: userId, // FK a User.id (no el nombre)
      note: "Configuración inicial (asistente)",
      revalidate: "/ia",
    });
    if (!pub.ok) return { ok: false, error: (pub as { error?: string }).error ?? "No se pudo publicar." };

    // Marcar como hecho (cookie) — el agente ya tiene contenido igual.
    const cookieStore = await cookies();
    cookieStore.set(DISMISS_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    return { ok: true };
  } catch (e: any) {
    console.error("[completeAgentOnboarding]", e);
    return { ok: false, error: "No se pudo dar de alta el agente." };
  }
}
