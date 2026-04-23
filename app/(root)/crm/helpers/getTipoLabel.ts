import { TipoRegistro } from "@/types/session";

export function getTipoLabel(tipo: TipoRegistro) {
    switch (tipo) {
        case "REPORTE":
            return "Reportes";
        case "SOLICITUD":
            return "Solicitudes";
        case "PEDIDO":
            return "Pedidos";
        case "RECLAMO":
            return "Reclamos";
        case "PAGO":
            return "Pagos";
        case "RESERVA":
            return "Reservas";
        case "PRODUCTO":
            return "Productos";
        default:
            return tipo;
    }
}