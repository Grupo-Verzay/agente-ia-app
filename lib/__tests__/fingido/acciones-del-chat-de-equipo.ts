/**
 * Las acciones del chat de equipo, fingidas para el banco de los mandos de la
 * cabecera.
 *
 * Lo que se prueba es la CABECERA del hilo —qué mandos ofrece, con qué glifo y
 * qué dispara cada uno—, así que lo único que hace falta de verdad es que
 * `hiloDelEquipoAction` devuelva un hilo abierto con el canal que el banco
 * pida. Todo lo demás está para que el módulo cargue: la cabecera no lo llama.
 *
 * El canal se elige por el id que el banco pasa (`directo-1`, `area-1`), para
 * poder medir la MISMA cabecera en un directo y en un canal de área sin montar
 * dos arneses.
 */

type Canal = {
    id: string;
    tipo: "general" | "area" | "directo";
    nombre: string;
    conQuienId: string | null;
    pertenezco: boolean;
    puedoEscribir: boolean;
    cuentas: string[];
};

const CANALES: Canal[] = [
    {
        id: "general",
        tipo: "general",
        nombre: "General",
        conQuienId: null,
        pertenezco: true,
        puedoEscribir: true,
        cuentas: [],
    },
    {
        id: "area-1",
        tipo: "area",
        nombre: "Ventas",
        conQuienId: null,
        pertenezco: true,
        puedoEscribir: true,
        cuentas: [],
    },
    {
        id: "directo-1",
        tipo: "directo",
        nombre: "Sofía Restrepo",
        conQuienId: "p2",
        pertenezco: true,
        puedoEscribir: true,
        cuentas: [],
    },
];

/** Si quien mira es súper administrador: el banco lo decide desde la página. */
function puedoLimpiar(): boolean {
    return (globalThis as { __puedoLimpiar?: boolean }).__puedoLimpiar === true;
}

/**
 * El nombre del directo, que el banco puede alargar desde la página.
 *
 * Hace falta para medir el caso MÁS ancho de la fila: tres mandos, el «⋯» del
 * súper administrador y un nombre que no cabe. Es el que un mando de más podría
 * romper, y el que no se ve probando con «Sofía».
 */
function nombreDelDirecto(): string {
    return (globalThis as { __nombreLargo?: string }).__nombreLargo || "Sofía Restrepo";
}

export async function hiloDelEquipoAction(canalPedido?: string) {
    const base = CANALES.find((c) => c.id === canalPedido) ?? CANALES[0];
    const canal =
        base.tipo === "directo" ? { ...base, nombre: nombreDelDirecto() } : base;
    return {
        success: true as const,
        data: {
            canales: CANALES.map((c) => (c.id === canal.id ? canal : c)),
            canalId: canal.id,
            mensajes: [],
            yo: "p1",
            cuentaId: "cuenta-1",
            equipo: [
                { id: "p1", name: "Yair Silvera", email: "yair@verzay.com", esCuenta: false },
                { id: "p2", name: "Sofía Restrepo", email: "sofia@verzay.com", esCuenta: false },
            ],
            gente: [
                { id: "p1", name: "Yair Silvera", email: "yair@verzay.com", esCuenta: false },
                { id: "p2", name: "Sofía Restrepo", email: "sofia@verzay.com", esCuenta: false },
            ],
            nombres: { p1: "Yair Silvera", p2: "Sofía Restrepo" },
            puedoEscribir: true,
            mando: true,
            cuentasDeLaFamilia: [],
            soyLaMadre: false,
            origen: "http://localhost",
            reuniones: {},
            puedoLimpiar: puedoLimpiar(),
            ordenDeDirectos: {},
        },
    };
}

const noSeLlama = async () => ({ success: false as const, message: "el banco no llama a esto" });

export const abrirDirectoAction = noSeLlama;
export const buscarEnElEquipoAction = noSeLlama;
export const crearCanalAction = noSeLlama;
export const enviarAlEquipoAction = noSeLlama;
export const limpiarHistorialDelCanalAction = noSeLlama;
export const ponerMiembrosAction = noSeLlama;
export const borrarMensajeDelEquipoAction = noSeLlama;
export const editarMensajeDelEquipoAction = noSeLlama;
export const reaccionarEnElEquipoAction = noSeLlama;
export const renombrarCanalAction = noSeLlama;
export const transcribirNotaDelEquipoAction = noSeLlama;

// Las que importan los vecinos que el hilo monta: el contador de sin-leer del
// panel y el interruptor del sonido. Ninguna decide nada de la cabecera.
export async function sinLeerDelEquipoAction() {
    return { success: true as const, data: { total: 0, porCanal: {}, avisos: [], sonido: false, navegador: false } };
}
export const cambiarSonidoDelEquipoAction = noSeLlama;
