// `actions/subscription-plan-actions` sin base: las landings piden sus planes
// y aquí salen tres de ejemplo, para que el banco pinte las TARJETAS de verdad
// (con las acciones mudas, que contestan `data: []`, saldría «Planes
// próximamente disponibles» y nadie mediría una tarjeta).
const plan = (id: string, nivel: string, nombre: string, usd: number, popular = false, orden = 0) => ({
    id,
    plan: nivel,
    assistanceType: "IA",
    isResellerPlan: false,
    priceUSD: usd,
    priceCop: null,
    priceWholesale: usd / 2,
    priceQuarterly: usd * 2.6,
    priceYearly: usd * 9.3,
    credits: 8000,
    features: ["Respuestas automáticas por WhatsApp", "CRM con pipeline", "Agenda y recordatorios"],
    description: "Para negocios que atienden por WhatsApp todo el día.",
    isPopular: popular,
    isActive: true,
    color: null,
    order: orden,
    checkoutUrlMonthly: null,
    checkoutUrlQuarterly: null,
    checkoutUrlYearly: null,
    name: nombre,
    destacadas: ["Respuestas automáticas por WhatsApp", "CRM con pipeline"],
});

export const PLANES_DE_EJEMPLO = [
    plan("p1", "basico", "Esencial", 49, false, 1),
    plan("p2", "intermedio", "Business", 99, true, 2),
    plan("p3", "avanzado", "Pro", 149, false, 3),
];

export const getActiveSubscriptionPlans = async () => ({ success: true, data: PLANES_DE_EJEMPLO });
export const getActiveResellerAccessPlans = async () => ({ success: true, data: PLANES_DE_EJEMPLO });
