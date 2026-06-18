/**
 * Seed de planes de suscripción.
 * Ejecutar con:  npx tsx prisma/seed-plans.ts
 */
import { PrismaClient, Plan } from "@prisma/client";

const prisma = new PrismaClient();

type PlanRow = {
  plan: Plan;
  assistanceType: "IA" | "HUMANO";
  priceUSD: number;
  priceQuarterly: number | null;
  priceYearly: number | null;
  credits: number;
  description: string;
  isPopular: boolean;
  order: number;
  features: string[];
};

const PLANS: PlanRow[] = [
  /* ══ ASISTENCIA IA ══════════════════════════════════════════════════════ */
  {
    plan: "lite",
    assistanceType: "IA",
    priceUSD: 19,
    priceQuarterly: 17,
    priceYearly: 15,
    credits: 1_000,
    isPopular: false,
    order: 1,
    description: "Perfecto para empezar a automatizar",
    features: [
      "Interpreta audios",
      "Lectura de imágenes",
      "Tiene memoria contextual",
      "Concatenación de mensajes",
      "Toma de solicitudes, citas, etc.",
      "Captura de datos en WhatsApp",
      "Notificación eventos otro número",
      "1.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "basico",
    assistanceType: "IA",
    priceUSD: 39,
    priceQuarterly: 30,
    priceYearly: 25,
    credits: 3_000,
    isPopular: false,
    order: 2,
    description: "Para negocios en crecimiento",
    features: [
      "Incluye todo lo del Lite",
      "Catálogo 10 ítems imagen",
      "Respuestas rápidas en texto",
      "Dashboard gráficos básicos",
      "Mis tareas con notificaciones",
      "Módulo de agregar notas varias",
      "Embudos Kanban con etapas/tags",
      "3.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "intermedio",
    assistanceType: "IA",
    priceUSD: 59,
    priceQuarterly: 50,
    priceYearly: 45,
    credits: 5_000,
    isPopular: false,
    order: 3,
    description: "Automatización completa del negocio",
    features: [
      "Incluye todo lo del Básico",
      "Envía archivos multimedia",
      "Respuestas rápidas archivos",
      "Herramientas y tools varias",
      "Captura datos dashboard CRM",
      "Agenda citas con recordatorios",
      "CRM, Chats, creación de eventos",
      "5.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "avanzado",
    assistanceType: "IA",
    priceUSD: 79,
    priceQuarterly: 65,
    priceYearly: 55,
    credits: 8_000,
    isPopular: true,
    order: 4,
    description: "La opción más elegida por nuestros clientes",
    features: [
      "Incluye todo del Intermedio",
      "Mensajes inactividad en flujos",
      "Seguimientos/retargeting Flows",
      "Crea tableros Kanban con etapas",
      "Sincroniza datos en Google Sheets",
      "Reportes, etiquetado, Follow Ups",
      "Chats, CRM y ficha de contactos",
      "8.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "enterprise",
    assistanceType: "IA",
    priceUSD: 99,
    priceQuarterly: 85,
    priceYearly: 75,
    credits: 10_000,
    isPopular: false,
    order: 5,
    description: "Para empresas con alto volumen de mensajes",
    features: [
      "Incluye todo lo del Avanzado",
      "Catálogo 100 ítems imágenes",
      "Analítica de datos/reportes IA",
      "Campañas masivas con IA-bots",
      "Métricas de resultados agentes",
      "Importación metadatos multiplex",
      "Multiusuarios con autoasignación",
      "10.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "personalizado",
    assistanceType: "IA",
    priceUSD: 0,
    priceQuarterly: null,
    priceYearly: null,
    credits: 0,
    isPopular: false,
    order: 6,
    description: "Solución para agencias y revendedores",
    features: [
      "Incluye paquetes de licencias",
      "Capacitación personalizada App",
      "Dashboard admin de sus clientes",
      "Sin límite de cobro de tus licencias",
      "Personalización marca, logo y color",
      "Acompañamiento proceso adopción",
      "Cuenta adicional admin plan gratis",
      "Multiusuarios y tus administradores",
      "Facturación a nombre de tu empresa",
    ],
  },

  /* ══ ASISTENCIA HUMANA ══════════════════════════════════════════════════ */
  {
    plan: "lite",
    assistanceType: "HUMANO",
    priceUSD: 29,
    priceQuarterly: 25,
    priceYearly: 19,
    credits: 3_000,
    isPopular: false,
    order: 1,
    description: "Perfecto para empezar a automatizar",
    features: [
      "Interpreta audios",
      "Lectura de imágenes",
      "Tiene memoria contextual",
      "Concatenación de mensajes",
      "Toma de solicitudes, citas, etc.",
      "Captura de datos en WhatsApp",
      "Notificación eventos otro número",
      "3.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "basico",
    assistanceType: "HUMANO",
    priceUSD: 49,
    priceQuarterly: 45,
    priceYearly: 39,
    credits: 5_000,
    isPopular: false,
    order: 2,
    description: "Para negocios en crecimiento",
    features: [
      "Incluye todo lo del Lite",
      "Catálogo 10 ítems imagen",
      "Respuestas rápidas en texto",
      "Dashboard gráficos básicos",
      "Mis tareas con notificaciones",
      "Módulo de agregar notas varias",
      "Embudos Kanban con etapas/tags",
      "5.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "intermedio",
    assistanceType: "HUMANO",
    priceUSD: 99,
    priceQuarterly: 85,
    priceYearly: 79,
    credits: 12_000,
    isPopular: false,
    order: 3,
    description: "Automatización completa del negocio",
    features: [
      "Incluye todo lo del Básico",
      "Envía archivos multimedia",
      "Respuestas rápidas archivos",
      "Herramientas y tools varias",
      "Captura datos dashboard CRM",
      "Agenda citas con recordatorios",
      "CRM, Chats, creación de eventos",
      "12.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "avanzado",
    assistanceType: "HUMANO",
    priceUSD: 149,
    priceQuarterly: 129,
    priceYearly: 119,
    credits: 20_000,
    isPopular: true,
    order: 4,
    description: "La opción más elegida por nuestros clientes",
    features: [
      "Incluye todo del Intermedio",
      "Mensajes inactividad en flujos",
      "Seguimientos/retargeting Flows",
      "Crea tableros Kanban con etapas",
      "Sincroniza datos en Google Sheets",
      "Reportes, etiquetado, Follow Ups",
      "Chats, CRM y ficha de contactos",
      "20.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "enterprise",
    assistanceType: "HUMANO",
    priceUSD: 199,
    priceQuarterly: 169,
    priceYearly: 149,
    credits: 30_000,
    isPopular: false,
    order: 5,
    description: "Para empresas con alto volumen de mensajes",
    features: [
      "Incluye todo lo del Avanzado",
      "Catálogo 100 ítems imágenes",
      "Analítica de datos/reportes IA",
      "Campañas masivas con IA-bots",
      "Métricas de resultados agentes",
      "Importación metadatos multiplex",
      "Multiusuarios con autoasignación",
      "30.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "personalizado",
    assistanceType: "HUMANO",
    priceUSD: 0,
    priceQuarterly: null,
    priceYearly: null,
    credits: 0,
    isPopular: false,
    order: 6,
    description: "Solución para agencias y revendedores",
    features: [
      "Incluye paquetes de licencias",
      "Capacitación personalizada App",
      "Dashboard admin de sus clientes",
      "Sin límite de cobro de tus licencias",
      "Personalización marca, logo y color",
      "Acompañamiento proceso adopción",
      "Cuenta adicional admin plan gratis",
      "Multiusuarios y tus administradores",
    ],
  },
];

async function main() {
  console.log("🌱 Seeding subscription plans...\n");

  for (const p of PLANS) {
    const result = await prisma.subscriptionPlan.upsert({
      where:  { plan_assistanceType_isResellerPlan: { plan: p.plan, assistanceType: p.assistanceType, isResellerPlan: false } },
      update: {
        priceUSD:       p.priceUSD,
        priceQuarterly: p.priceQuarterly,
        priceYearly:    p.priceYearly,
        credits:        p.credits,
        features:       p.features,
        description:    p.description,
        isPopular:      p.isPopular,
        order:          p.order,
        isActive:       true,
      },
      create: {
        plan:           p.plan,
        assistanceType: p.assistanceType,
        priceUSD:       p.priceUSD,
        priceQuarterly: p.priceQuarterly,
        priceYearly:    p.priceYearly,
        credits:        p.credits,
        features:       p.features,
        description:    p.description,
        isPopular:      p.isPopular,
        order:          p.order,
        isActive:       true,
      },
    });

    const tag = p.assistanceType === "IA" ? "🤖 IA" : "👤 Humano";
    const q   = p.priceQuarterly != null ? `$${p.priceQuarterly}` : "—";
    const y   = p.priceYearly    != null ? `$${p.priceYearly}`    : "—";
    const label = p.priceUSD === 0 ? "A consultar" : `$${p.priceUSD}/mes  trim:${q}  anual:${y}`;
    console.log(`  ✅ ${tag} · ${result.plan.toUpperCase().padEnd(13)} ${label}`);
  }

  console.log("\n✨ Listo. Todos los planes fueron creados/actualizados.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
