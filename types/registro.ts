import { TipoRegistro } from "./session";

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; message: string };


export const ESTADOS_POR_TIPO: Record<TipoRegistro, string[]> = {
    REPORTE: [
        "Habilitado",
        "Inhabilitado",
    ],
    SOLICITUD: [
        "Pendiente",
        "Procesando",
        "Confirmado",
        "Cancelado",
    ],
    PEDIDO: [
        "Pendiente",
        "Procesando",
        "Despachado",
        "En tránsito",
        "Entregado",
        "Cancelado",
    ],
    RESERVA: [
        "Pendiente",
        "Procesando",
        "Confirmada",
        "Cancelada",
    ],
    RECLAMO: [
        "Pendiente",
        "Procesando",
        "Solucionado",
        "Cancelado",
    ],
    PAGO: [
        "Pendiente",
        "Procesando",
        "Confirmado",
        "Cancelado",
    ],
};