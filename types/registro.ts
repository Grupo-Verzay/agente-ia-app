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
        "Rechazado",
    ],
    PEDIDO: [
        "Pendiente",
        "Procesando",
        "Despachado",
        "En tránsito",
        "Entregado",
        "Rechazado",
    ],
    RESERVA: [
        "Pendiente",
        "Procesando",
        "Confirmada",
        "Rechazada",
    ],
    RECLAMO: [
        "Pendiente",
        "Procesando",
        "Solucionado",
        "Rechazado",
    ],
    PAGO: [
        "Pendiente",
        "Procesando",
        "Confirmado",
        "Rechazado",
    ],
    PRODUCTO: [
        "Cotizado",
        "Pendiente",
        "Confirmado",
        "Entregado",
        "Rechazado",
    ],
};