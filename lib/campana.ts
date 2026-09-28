/**
 * Qué chips ofrece la campanita y qué se marca al pulsar «marcar leídas».
 *
 * Puro y sin imports: lo prueba el banco sin levantar React ni navegador, que
 * es lo único que hace falta para contestar las dos preguntas de abajo.
 */

/** Las clases de aviso que la campanita sabe pintar. */
export type ClaseDeAviso =
    | "task"
    | "appointment"
    | "connection"
    | "chat"
    | "mention"
    | "tarea"
    | "followup"
    /** Correos sin leer en los buzones de la persona. */
    | "correo"
    /** Le asignaron o le quitaron una conversación a la persona. */
    | "asignacion"
    /** El aviso de créditos bajos que el motor manda por WhatsApp. */
    | "creditos";

/** Lo mínimo de un aviso para decidir si se puede marcar. */
export type AvisoMarcable = { id: string; kind: ClaseDeAviso };

/**
 * Los chips, en su orden: **nueve, en tres grupos de tres**, de izquierda a
 * derecha y de arriba abajo.
 *
 * | fila | | | |
 * | --- | --- | --- | --- |
 * | 1 | Chats | Correos | Citas |
 * | 2 | Menciones | Asignaciones | Mis tareas |
 * | 3 | Seguimientos | Errores | Créditos bajos |
 *
 * Nueve son tres filas exactas, así que no queda ninguna última fila a medias.
 *
 * **Sin «Tareas»**: convivían dos chips que se leen igual —«Tareas», las del
 * CRM que vencen, y «Mis tareas», las que alguien te asignó—. Quitar el chip NO
 * esconde sus avisos: los de clase `task` siguen en la lista —salen sin
 * filtro— y siguen contando en la insignia roja del botón. Lo único que se va
 * es la forma de mirarlos por separado.
 */
export const CHIPS_DE_LA_CAMPANA: ClaseDeAviso[] = [
    "chat",
    "correo",
    "appointment",
    "mention",
    "asignacion",
    "tarea",
    "followup",
    "connection",
    "creditos",
];

/** La rejilla es de tres columnas: tres grupos de tres. */
export const CHIPS_POR_FILA = 3;

/**
 * Cuándo la pastilla pone su número DEBAJO del rótulo en vez de al lado.
 *
 * El panel mide lo mismo que los paneles laterales (`--ancho-lateral`, 18 a 24
 * rem), y por debajo de 24 rem tres pastillas en fila no caben con el rótulo y
 * el número lado a lado: «Créditos bajos» con «99+» pide 116 px y a 1024 le
 * tocan 110. En vez de recortar el rótulo o partir la rejilla en dos columnas
 * —cinco filas, la última a medias—, la pastilla se apila: rótulo arriba y
 * número abajo, las nueve igual. Se pregunta a la REJILLA (consulta de
 * contenedor), no a la ventana: lo que decide es cuánto mide el panel.
 *
 * Clases literales: Tailwind solo genera lo que ve escrito.
 */
export const REJILLA_DE_CHIPS = "[container-type:inline-size]";
export const CHIP_APILADO =
    "[@container(max-width:22.5rem)]:flex-col [@container(max-width:22.5rem)]:items-center " +
    "[@container(max-width:22.5rem)]:justify-center [@container(max-width:22.5rem)]:gap-0.5 " +
    "[@container(max-width:22.5rem)]:text-center";

/**
 * Un aviso de conexión NO se puede dar por leído.
 *
 * Es la regla que ya tenía el clic de uno en uno, escrita aquí para que las dos
 * puertas digan lo mismo: describe algo que **sigue roto** —una cuenta sin
 * instancia, sin clave—, y esconderlo para siempre dejaría a esa cuenta sin
 * enviar mensajes sin que nadie lo recuerde. Vuelve a salir hasta que se
 * arregle.
 */
export function sePuedeMarcar(aviso: AvisoMarcable): boolean {
    return aviso.kind !== "connection";
}

/**
 * Lo que marca «marcar leídas»: SOLO lo del chip que esté puesto.
 *
 * Con la lista entera, pulsarlo desde «Menciones» se llevaría por delante los
 * chats y las citas que ni se estaban mirando — y un aviso que desaparece sin
 * haberlo visto no vuelve. Por eso la cuenta sale del chip y no del total.
 *
 * Sin chip puesto (`"all"`, que es como abre) se marca lo que se está viendo,
 * que es todo: es lo mismo que se ve en pantalla, y eso es lo que hace que el
 * botón sea predecible.
 */
export function lasQueSeMarcan<T extends AvisoMarcable>(
    avisos: T[],
    chip: ClaseDeAviso | "all",
): T[] {
    return avisos.filter((a) => (chip === "all" || a.kind === chip) && sePuedeMarcar(a));
}

/**
 * Cuántos avisos hay de cada clase, contando los que se ven. Una sola función
 * para las tres veces que la campana recuenta (al cargar, al marcar leídas y al
 * llegar los correos): con la cuenta escrita a mano en cada sitio, el día que
 * entre una clase nueva una de las tres se queda sin ella.
 */
export function losConteos(avisos: { kind: ClaseDeAviso }[]): Record<ClaseDeAviso, number> {
    const conteos: Record<ClaseDeAviso, number> = {
        task: 0, appointment: 0, connection: 0, chat: 0, mention: 0, tarea: 0,
        followup: 0, correo: 0, asignacion: 0, creditos: 0,
    };
    for (const a of avisos) conteos[a.kind] = (conteos[a.kind] ?? 0) + 1;
    return conteos;
}

/**
 * El aviso de correos: UNO, con el número dentro, y solo si hay alguno sin
 * leer. El número va en el id, así que marcarlo leído lo calla hasta que llegue
 * otro correo. `null` —algún buzón no contestó— no es cero: no se avisa de nada
 * que no se sepa.
 */
export function elAvisoDeCorreos(sinLeer: number | null): {
    id: string; kind: "correo"; title: string; description: string; href: string;
} | null {
    if (sinLeer === null || !Number.isFinite(sinLeer) || sinLeer <= 0) return null;
    return {
        id: `correo:${sinLeer}`,
        kind: "correo",
        title: sinLeer === 1 ? "Tienes 1 correo sin leer" : `Tienes ${sinLeer} correos sin leer`,
        description: "En la bandeja de entrada de tus correos conectados.",
        href: "/correo",
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Créditos bajos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los umbrales del aviso de créditos, en porcentaje disponible.
 *
 * Son **los mismos** que `creditFlags` del motor (`api-webhook`,
 * `src/types/open-ai.ts`): 50, 25, 5 y 0. El motor apunta en
 * `ia_credit_alerts` cada umbral por el que ya mandó el WhatsApp —una fila por
 * cuenta y umbral, que se borra al renovar— y la campana lee esas mismas filas:
 * así enseña **el mismo aviso**, no uno parecido calculado por su cuenta.
 * `-1` es el aviso que el motor manda cuando la cuenta no tiene bolsa.
 */
export const UMBRALES_DE_CREDITOS = [50, 25, 5, 0] as const;

/** Lo que la campana sabe del saldo de la cuenta, ya resuelto en el servidor. */
export type SaldoParaLaCampana =
    | { estado: "ilimitado" }
    | { estado: "sin_bolsa" }
    | { estado: "quedan"; disponibles: number; total: number };

export type AvisoDeCreditos = {
    umbral: number;
    enviadoEn: string;
    disponibles: number | null;
    total: number | null;
};

/**
 * Qué aviso de créditos enseña la campana, si alguno.
 *
 * 1. **Solo lo que el WhatsApp ya avisó.** Sin fila en `ia_credit_alerts` no
 *    hay aviso, aunque el saldo esté bajo: la campana refleja el aviso, no
 *    inventa otro.
 * 2. **Y solo mientras siga siendo cierto.** El motor borra las filas al
 *    renovar, pero una recarga a mano no: sin esta condición la campana diría
 *    «te queda el 5 %» a una cuenta que acaba de recargar. Ilimitado nunca
 *    avisa, y un porcentaje que no se puede calcular no se inventa.
 * 3. **Entre varios, el más grave** —el umbral más bajo que siga en pie—. Un
 *    aviso por cuenta, no cuatro repitiendo lo mismo.
 */
export function elAvisoDeCreditos(
    enviados: { umbral: number; enviadoEn: string }[],
    saldo: SaldoParaLaCampana,
): AvisoDeCreditos | null {
    if (saldo.estado === "ilimitado") return null;
    if (saldo.estado === "sin_bolsa") {
        const sinRegistro = enviados.find((e) => e.umbral === -1);
        return sinRegistro ? { ...sinRegistro, disponibles: null, total: null } : null;
    }
    const { disponibles, total } = saldo;
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(disponibles)) return null;
    const porcentaje = disponibles <= 0 ? 0 : total > 0 ? Math.floor((disponibles / total) * 100) : null;
    if (porcentaje === null) return null;
    const vivos = enviados
        .filter((e) => e.umbral >= 0 && porcentaje <= e.umbral)
        .sort((a, b) => a.umbral - b.umbral);
    const elMasGrave = vivos[0];
    return elMasGrave ? { ...elMasGrave, disponibles, total } : null;
}

/** El texto del aviso, en las palabras del WhatsApp que lo mandó. */
export function elTextoDelAvisoDeCreditos(aviso: AvisoDeCreditos): { titulo: string; descripcion: string } {
    const cifras =
        aviso.disponibles !== null && aviso.total !== null
            ? `Quedan ${aviso.disponibles} de ${aviso.total} créditos. `
            : "";
    if (aviso.umbral < 0) {
        return { titulo: "Sin créditos disponibles", descripcion: "La cuenta no tiene bolsa de créditos asignada." };
    }
    if (aviso.umbral === 0) {
        return { titulo: "Te quedaste sin créditos", descripcion: `${cifras}Recarga para reactivar tu agente.` };
    }
    if (aviso.umbral <= 5) {
        return { titulo: `Urgente: te queda el ${aviso.umbral} % de los créditos`, descripcion: `${cifras}Recarga ya para no interrumpir tu servicio.` };
    }
    if (aviso.umbral <= 25) {
        return { titulo: `Solo te queda el ${aviso.umbral} % de los créditos`, descripcion: `${cifras}Te recomendamos recargar pronto.` };
    }
    return { titulo: `Te queda el ${aviso.umbral} % de los créditos`, descripcion: `${cifras}Aún tienes tiempo para recargar.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Asignaciones
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de `AssignmentLog`, tal cual. */
export type FilaDeAsignacion = {
    id: number;
    sessionId: number;
    advisorId: string | null;
    assignedBy: string | null;
    action: string;
    createdAt: string;
};

export type CambioDeAsignacion = {
    id: number;
    sessionId: number;
    tipo: "asignada" | "quitada";
    /** Quién lo hizo; `null` es el reparto automático. */
    porQuien: string | null;
    en: string;
};

/**
 * Quién lleva la conversación DESPUÉS de una fila del registro.
 *
 * Las acciones no escriben todas lo mismo en `advisorId`:
 * - `released` y `returned_to_ai` la dejan sin nadie, aunque `returned_to_ai`
 *   apunte en `advisorId` a quien la llevaba.
 * - `resolved` y `reopened` no la cambian de manos.
 * - el resto (`assigned`, `auto_assigned`, `taken`, `transferred`) la deja en
 *   manos de `advisorId`.
 */
function quienLaLlevaDespues(fila: FilaDeAsignacion, antes: string | null): string | null {
    if (fila.action === "released" || fila.action === "returned_to_ai") return null;
    if (fila.action === "resolved" || fila.action === "reopened") return antes;
    return fila.advisorId;
}

/**
 * Cuándo a una persona le asignaron o le quitaron una conversación.
 *
 * El registro no guarda «a quién se le quitó»: una transferencia apunta solo a
 * quien la recibe. Así que se recorre la historia de cada conversación en
 * orden y se compara quién la llevaba antes y después de cada fila. Por eso las
 * filas tienen que llegar **enteras por conversación**, también las de antes de
 * la ventana: sin ellas no se sabe quién la llevaba al empezar.
 *
 * Lo que hace la propia persona no le avisa a ella: tomarla o soltarla no es
 * algo de lo que tenga que enterarse por la campana.
 */
export function losCambiosDeAsignacion(
    filas: FilaDeAsignacion[],
    persona: string,
    desde: string,
): CambioDeAsignacion[] {
    const porConversacion = new Map<number, FilaDeAsignacion[]>();
    for (const fila of filas) {
        const lista = porConversacion.get(fila.sessionId) ?? [];
        lista.push(fila);
        porConversacion.set(fila.sessionId, lista);
    }
    const inicio = new Date(desde).getTime();
    const cambios: CambioDeAsignacion[] = [];
    for (const lista of Array.from(porConversacion.values())) {
        lista.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
        let antes: string | null = null;
        for (const fila of lista) {
            const despues = quienLaLlevaDespues(fila, antes);
            const cuenta = new Date(fila.createdAt).getTime() >= inicio && fila.assignedBy !== persona;
            if (cuenta && despues === persona && antes !== persona) {
                cambios.push({ id: fila.id, sessionId: fila.sessionId, tipo: "asignada", porQuien: fila.assignedBy, en: fila.createdAt });
            } else if (cuenta && antes === persona && despues !== persona) {
                cambios.push({ id: fila.id, sessionId: fila.sessionId, tipo: "quitada", porQuien: fila.assignedBy, en: fila.createdAt });
            }
            antes = despues;
        }
    }
    return cambios.sort((a, b) => new Date(b.en).getTime() - new Date(a.en).getTime());
}
