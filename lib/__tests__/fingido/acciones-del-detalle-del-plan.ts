/**
 * Las acciones del detalle de un plan de mentira, para pintar la pestaña
 * «Página de detalle» en Chromium sin servidor. Leer devuelve un detalle con
 * un orden de la página DISTINTO al de fábrica (`window.ordenGuardado`), que
 * es el caso que el banco viene a probar; guardar apunta lo que se mandó.
 */
export const pedidas: { accion: string; args: unknown[] }[] = [];

export async function getPlanDetailBySubscriptionPlanId(id: string) {
    pedidas.push({ accion: "leer", args: [id] });
    const w = window as unknown as { ordenGuardado?: string[] };
    return {
        success: true as const,
        data: {
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            videoTitle: "Así funciona el plan",
            videoThumbnailUrl: "",
            ctaButtonText: "Quiero este plan",
            ctaButtonUrl: "",
            ctaSecondaryText: "",
            ctaSecondaryUrl: "",
            meetingUrl: "",
            whatsappMessage: "",
            metaTitle: "",
            metaDescription: "",
            ogImageUrl: "",
            // Lo de antes que la página ya no enseña: la pestaña vieja lo avisaba con un texto.
            testimonials: [{ name: "Ana", text: "Muy bueno." }],
            faqs: [
                { question: "¿Cuánto tarda la puesta en marcha?", answer: "Un día hábil." },
                { question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." },
            ],
        },
        paraQuien: { paraQuien: "Negocios que venden por WhatsApp.", caso: "Una clínica que agenda citas." },
        orden: w.ordenGuardado ?? null,
        recuadros: null,
    };
}

export async function upsertPlanDetail(id: string, input: unknown) {
    pedidas.push({ accion: "guardar", args: [id, input] });
    return { success: true as const, message: "Detalle guardado" };
}
