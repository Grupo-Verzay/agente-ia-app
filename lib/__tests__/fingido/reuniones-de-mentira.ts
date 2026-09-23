/**
 * Las acciones de Reuniones, de mentira, para pintar la pantalla en Chromium.
 *
 * Lo que se mide es CÓMO se pinta —dónde va el video y de qué tamaño—, así que
 * los datos son los mismos en los dos modos del banco: la única diferencia
 * medible es la pantalla. Dos reuniones abiertas, una pasada, y tres
 * grabaciones: dos de video en la abierta y una de audio en la pasada.
 */
const ahora = Date.now();
const iso = (menos: number) => new Date(ahora - menos).toISOString();

export const SALAS = [
    {
        id: "sala-1", codigo: "c1", enlace: "http://x/reunion/c1", canalId: null,
        cuentaId: "madre", cuentaNombre: "Verzay | Atención", anfitrionId: "p1",
        anfitrionNombre: "Yair", titulo: "Demo con el cliente", creadoEn: iso(3_600_000),
        expiraEn: iso(-86_400_000), soyElAnfitrion: true, puedoAdministrar: true,
    },
    {
        id: "sala-2", codigo: "c2", enlace: "http://x/reunion/c2", canalId: null,
        cuentaId: "hija", cuentaNombre: "Verzay | Ventas", anfitrionId: "p2",
        anfitrionNombre: "Sofía", titulo: "Seguimiento semanal", creadoEn: iso(7_200_000),
        expiraEn: iso(-86_400_000), soyElAnfitrion: false, puedoAdministrar: true,
    },
];

export const HISTORIAL = [
    {
        id: "sala-3", titulo: "Reunión de cierre", cuentaNombre: "Verzay | Atención",
        anfitrionNombre: "Yair", empezo: iso(86_400_000), duracion: "32 min",
        duracionSegundos: 1920, asistentes: [{ nombre: "Yair", esInvitado: false }],
        final: "caducada",
    },
];

function grabacion(id: string, modo: "video" | "audio", creada: number, extra = {}) {
    return {
        id, modo, estado: "lista", segundos: 610, duracion: "10:10",
        audioUrl: `/g/${id}.webm`, videoUrl: modo === "video" ? `/g/${id}-v.webm` : null,
        bytes: 25_000_000, pesa: "23,8 MB", creadaEn: iso(creada), pedidaPor: "Yair",
        diasQueLeQuedan: 170, transcripcion: null, resumen: null, creditos: 62,
        porQueNo: null, ...extra,
    };
}

export const POR_SALA = {
    "sala-1": [grabacion("g1", "video", 3_000_000), grabacion("g2", "video", 1_000_000)],
    "sala-3": [grabacion("g3", "audio", 80_000_000)],
};

export async function lasGrabacionesDeLasReunionesAction() {
    return {
        success: true,
        porSala: POR_SALA,
        cupo: { usados: 0, tope: 1, parte: 0, cerca: false, texto: "0 B" },
        puedeGrabar: true,
    };
}

const nada = async () => ({ success: false, message: "banco" });
export const cambiarLaCaducidadAction = nada;
export const crearLaReunionDeLaCuentaAction = nada;
export const regenerarLaSalaAction = nada;
export const revocarLaSalaAction = nada;
export async function transcribirLaReunionAction() {
    return { success: true, transcripcion: "Hola", resumen: "- Punto", yaEstaba: false };
}
export function abrirLaReunionAqui() {}
