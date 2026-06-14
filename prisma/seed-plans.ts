/**
 * Seed de planes de suscripción.
 * Ejecutar con:  npx tsx prisma/seed-plans.ts
 */
import { PrismaClient, Plan } from "@prisma/client";

const prisma = new PrismaClient();

type PlanRow = {
  plan: Plan;
  assistanceType: "IA" | "HUMANO";
  priceUSD: number;       // Precio mensual en licencia ANUAL
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
    priceUSD: 15,
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
      "Incluye 1.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "basico",
    assistanceType: "IA",
    priceUSD: 25,
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
      "Incluye 3.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "intermedio",
    assistanceType: "IA",
    priceUSD: 45,
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
      "Incluye 5.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "avanzado",
    assistanceType: "IA",
    priceUSD: 55,
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
      "Incluye 8.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "enterprise",
    assistanceType: "IA",
    priceUSD: 75,
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
      "Incluye 10.000 créditos totalmente gratis",
    ],
  },
  {
    plan: "personalizado",
    assistanceType: "IA",
    priceUSD: 0,
    credits: 0,
    isPopular: false,
    order: 6,
    description: "Solución a medida para tu empresa",
    features: [
      "Incluye paquetes de licencias",
      "Capacitación personalizada App",
      "Dashboard admin de sus clientes",
      "Sin límite de cobro de tus licencias",
      "Personalización marca, logo y color",
      "Acompañamiento proceso adopción",
      "Cuenta adicional admin plan gratis",
    ],
  },

  /* ══ ASISTENCIA HUMANA ══════════════════════════════════════════════════ */
  {
    plan: "lite",
    assistanceType: "HUMANO",
    priceUSD: 19,
    credits: 3_000,
    isPopular: false,
    order: 1,
    description: "Asistencia humana para comenzar",
    features: [
      "1 instancia de WhatsApp",
      "3.000 créditos incluidos",
      "Asesor humano de configuración",
      "CRM básico de contactos",
      "Soporte por email",
    ],
  },
  {
    plan: "basico",
    assistanceType: "HUMANO",
    priceUSD: 39,
    credits: 5_000,
    isPopular: false,
    order: 2,
    description: "Gestión con acompañamiento humano",
    features: [
      "1 instancia de WhatsApp",
      "5.000 créditos incluidos",
      "Asesor humano asignado",
      "Pipeline de ventas y CRM",
      "Seguimientos personalizados",
      "Soporte por WhatsApp",
    ],
  },
  {
    plan: "intermedio",
    assistanceType: "HUMANO",
    priceUSD: 79,
    credits: 12_000,
    isPopular: false,
    order: 3,
    description: "Equipo humano para gestión completa",
    features: [
      "2 instancias de WhatsApp",
      "12.000 créditos incluidos",
      "Asesor humano dedicado",
      "Agenda y reservas gestionadas",
      "Seguimientos manuales",
      "Reportes mensuales",
    ],
  },
  {
    plan: "avanzado",
    assistanceType: "HUMANO",
    priceUSD: 119,
    credits: 20_000,
    isPopular: true,
    order: 4,
    description: "El más popular en asistencia humana",
    features: [
      "3 instancias de WhatsApp",
      "20.000 créditos incluidos",
      "Asesor humano exclusivo",
      "CRM gestionado por nuestro equipo",
      "Estrategia de ventas incluida",
      "Soporte prioritario",
    ],
  },
  {
    plan: "enterprise",
    assistanceType: "HUMANO",
    priceUSD: 149,
    credits: 30_000,
    isPopular: false,
    order: 5,
    description: "Equipo dedicado para alto volumen",
    features: [
      "Instancias ilimitadas",
      "30.000 créditos incluidos",
      "Equipo humano dedicado",
      "Gestión estratégica completa",
      "Reportes semanales",
      "Soporte 24/7",
    ],
  },
  {
    plan: "personalizado",
    assistanceType: "HUMANO",
    priceUSD: 0,
    credits: 0,
    isPopular: false,
    order: 6,
    description: "Solución humana a medida para tu empresa",
    features: [
      "Instancias según necesidad",
      "Créditos personalizados",
      "Equipo a medida",
      "SLA garantizado",
      "Precio según volumen",
    ],
  },
];

async function main() {
  console.log("🌱 Seeding subscription plans...\n");

  for (const p of PLANS) {
    const result = await prisma.subscriptionPlan.upsert({
      where:  { plan_assistanceType: { plan: p.plan, assistanceType: p.assistanceType } },
      update: {
        priceUSD:    p.priceUSD,
        credits:     p.credits,
        features:    p.features,
        description: p.description,
        isPopular:   p.isPopular,
        order:       p.order,
        isActive:    true,
      },
      create: {
        plan:          p.plan,
        assistanceType: p.assistanceType,
        priceUSD:      p.priceUSD,
        credits:       p.credits,
        features:      p.features,
        description:   p.description,
        isPopular:     p.isPopular,
        order:         p.order,
        isActive:      true,
      },
    });

    const tag   = p.assistanceType === "IA" ? "🤖 IA" : "👤 Humano";
    const price = p.priceUSD === 0 ? "A consultar" : `$${p.priceUSD}/mes`;
    console.log(`  ✅ ${tag} · ${result.plan.toUpperCase().padEnd(13)} ${price}`);
  }

  console.log("\n✨ Listo. Todos los planes fueron creados/actualizados.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
