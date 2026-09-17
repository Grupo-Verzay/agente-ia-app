import { TicketsDeSoporteClient } from "./_components/TicketsDeSoporteClient";

/**
 * El tablero del administrador: todos los tickets que le caen.
 *
 * La puerta NO está aquí: está en `ticketsDeSoporteAction`, que solo contesta a
 * la cuenta configurada como destino. La pantalla pinta lo que la consulta le
 * devuelva y enseña «No autorizado» solo si esta lo dice — así la pantalla no
 * puede abrir de más que la consulta.
 *
 * Son **dos vistas**, el mismo patrón de Etiquetas: el tablero kanban por
 * defecto —una columna por estado, y se arrastra para cambiarlo— y una segunda
 * de lista para gestionar. El motivo obligatorio al descartar y el aviso de
 * WhatsApp al resolver son los mismos por los dos caminos: los dos llaman a
 * `moverTicketAction`.
 */
export default function TicketsPage() {
    return <TicketsDeSoporteClient />;
}
