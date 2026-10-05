/**
 * Lo que Verzy puede ENSEÑAR en la videollamada, y nada más: pantallas reales
 * de la cuenta «Verzay Ventas», navegadas en vivo por el servidor (ver
 * `lib/pantalla-de-verzy.server.ts`). Ninguna página de ejemplo, ningún video
 * promocional, ninguna vista hecha a propósito para la llamada.
 *
 * Puro: lo usan el servidor, la sala, el guion del avatar y el banco.
 */

export const DESTINOS_DE_VERZY = [
    { clave: "dashboard", titulo: "Panel de estadísticas", cuando: "para enseñar el resumen del negocio: chats, leads y ventas" },
    { clave: "chats", titulo: "Chats", cuando: "para enseñar la bandeja de Chats y la conversación de WhatsApp del cliente" },
    { clave: "ficha", titulo: "Ficha de contacto", cuando: "para enseñar la ficha del cliente con sus datos y sus notas" },
    { clave: "recordatorios", titulo: "Recordatorios", cuando: "para enseñar los recordatorios programados por WhatsApp" },
    { clave: "citas", titulo: "Agenda de citas", cuando: "para enseñar las citas agendadas en la agenda" },
    { clave: "embudo", titulo: "Embudo de ventas", cuando: "para enseñar el embudo de ventas con cada conversación en su etapa" },
] as const;

export type DestinoDeVerzy = (typeof DESTINOS_DE_VERZY)[number]["clave"];

export const NOMBRES_DE_LOS_DESTINOS: Record<DestinoDeVerzy, string> = Object.fromEntries(
    DESTINOS_DE_VERZY.map((d) => [d.clave, d.titulo]),
) as Record<DestinoDeVerzy, string>;

export function comoDestino(valor: unknown): DestinoDeVerzy | null {
    const v = String(valor ?? "").trim().toLowerCase();
    return (DESTINOS_DE_VERZY.find((d) => d.clave === v)?.clave as DestinoDeVerzy | undefined) ?? null;
}

/** La ruta REAL de la plataforma para cada destino. La ficha vive en Chats. */
export function laRutaDelDestino(destino: DestinoDeVerzy, conversacion: { jid: string; linea: string | null } | null): string {
    switch (destino) {
        case "dashboard":
            return "/crm/dashboard";
        case "chats":
        case "ficha": {
            if (!conversacion?.jid) return "/chats";
            const q = new URLSearchParams({ jid: conversacion.jid });
            if (conversacion.linea) q.set("instance", conversacion.linea);
            return `/chats?${q.toString()}`;
        }
        case "recordatorios":
            return "/reminders";
        case "citas":
            return "/schedule";
        case "embudo":
            return "/embudos";
    }
}

/** Tope de una nota que se dicta en la llamada, para que no se cuele un párrafo entero. */
export const TOPE_DE_LA_NOTA = 500;

/** Añade la nota al final de las que ya hay, en su propia línea, sin repetirla. */
export function conLaNotaAgregada(antes: string, texto: string): string {
    const nueva = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
    const previo = String(antes ?? "").replace(/\s+$/, "");
    if (!nueva) return previo;
    if (previo.split("\n").some((l) => l.trim() === nueva)) return previo;
    return previo ? `${previo}\n${nueva}` : nueva;
}

export type OrdenDeLaPantalla =
    | { tipo: "ir"; datos: { destino: DestinoDeVerzy } }
    | { tipo: "nota"; datos: { texto: string } };

export type ResultadoDeLaOrden = { ok: true; aviso?: string } | { ok: false; motivo: string };

/** Lo que llega del navegador a la ruta de la pantalla, saneado. */
export function laOrdenPedida(cuerpo: unknown): OrdenDeLaPantalla | null {
    const c = (cuerpo ?? {}) as { tipo?: unknown; destino?: unknown; texto?: unknown };
    if (c.tipo === "ir") {
        const destino = comoDestino(c.destino);
        return destino ? { tipo: "ir", datos: { destino } } : null;
    }
    if (c.tipo === "nota") {
        const texto = String(c.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
        return texto ? { tipo: "nota", datos: { texto } } : null;
    }
    return null;
}

/** Lo que se le cuenta a Verzy después de cada orden, para que no diga algo que no pasó. */
export function loQueSeLeCuentaAVerzy(orden: OrdenDeLaPantalla, r: ResultadoDeLaOrden): string {
    if (orden.tipo === "nota") {
        return r.ok
            ? `La nota quedó guardada en la ficha del cliente en Verzay Ventas: «${orden.datos.texto}».`
            : `La nota NO se pudo guardar (${r.motivo}). No digas que quedó guardada.`;
    }
    const nombre = NOMBRES_DE_LOS_DESTINOS[orden.datos.destino];
    if (!r.ok) return `No se pudo abrir ${nombre} (${r.motivo}). No digas que lo estás mostrando.`;
    return r.aviso ? `En pantalla: ${nombre}. Aviso: ${r.aviso}.` : `En pantalla: ${nombre} de Verzay Ventas, en vivo.`;
}
