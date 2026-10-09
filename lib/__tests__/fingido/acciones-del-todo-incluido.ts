/**
 * Las acciones del detalle de un plan de mentira, para pintar la pestaña
 * «Página de detalle» en Chromium sin servidor, con un «Todo incluido» ya
 * guardado (`window.todoIncluidoGuardado`). Guardar apunta lo que se mandó.
 */
export const pedidas: { accion: string; args: unknown[] }[] = [];

export async function getPlanDetailBySubscriptionPlanId(id: string) {
    pedidas.push({ accion: "leer", args: [id] });
    const w = window as unknown as { todoIncluidoGuardado?: { titulo: string; texto: string } | null };
    return {
        success: true as const,
        data: {
            videoUrl: "",
            videoTitle: "",
            videoThumbnailUrl: "",
            ctaButtonText: "",
            ctaButtonUrl: "",
            ctaSecondaryText: "",
            ctaSecondaryUrl: "",
            meetingUrl: "",
            whatsappMessage: "",
            metaTitle: "",
            metaDescription: "",
            ogImageUrl: "",
            faqs: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
        },
        paraQuien: null,
        orden: null,
        recuadros: null,
        todoIncluido: w.todoIncluidoGuardado ?? null,
    };
}

export async function upsertPlanDetail(id: string, input: unknown) {
    pedidas.push({ accion: "guardar", args: [id, input] });
    return { success: true as const, message: "Detalle guardado" };
}
