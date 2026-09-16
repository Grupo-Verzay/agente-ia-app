import { TicketsDeSoporteClient } from "./_components/TicketsDeSoporteClient";

/**
 * El tablero del administrador: todos los tickets que le caen.
 *
 * La puerta NO está aquí: está en `ticketsDeSoporteAction`, que solo contesta a
 * la cuenta configurada como destino. La pantalla pinta lo que la consulta le
 * devuelva y enseña «No autorizado» solo si esta lo dice — así la pantalla no
 * puede abrir de más que la consulta.
 *
 * Entrega 1: una **lista** con los cinco estados y el motivo obligatorio al
 * descartar. El tablero con arrastrar y soltar es la entrega 2; esto ya sirve
 * de punta a punta.
 */
export default function TicketsPage() {
    return <TicketsDeSoporteClient />;
}
