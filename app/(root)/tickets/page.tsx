import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { cuentasParaAbrirTicketAction } from "@/actions/tickets-actions";
import { TicketsDeSoporteClient } from "./_components/TicketsDeSoporteClient";

export const dynamic = "force-dynamic";

/**
 * El tablero del administrador: todos los tickets que le caen.
 *
 * La puerta NO está aquí: está en `ticketsDeSoporteAction`, que solo contesta a
 * la cuenta configurada como destino. La pantalla pinta lo que la consulta le
 * devuelva y enseña «No autorizado» solo si esta lo dice — así la pantalla no
 * puede abrir de más que la consulta. Lo mismo con las dos listas que se cargan
 * aquí: el equipo es el de quien mira, y las cuentas las acota la propia acción.
 *
 * Son **dos vistas**, el mismo patrón de Etiquetas: el tablero kanban por
 * defecto —una columna por estado, y se arrastra para cambiarlo— y una segunda
 * de lista para gestionar. El motivo obligatorio al descartar y el aviso de
 * WhatsApp al resolver son los mismos por los dos caminos: los dos llaman a
 * `moverTicketAction`.
 */
export default async function TicketsPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    // El equipo que atiende —para elegir responsable— y a nombre de qué cuentas
    // se puede registrar un ticket. Las dos vacías es un caso normal: entonces
    // no se pintan ni el selector ni el botón de nuevo.
    const [equipo, cuentas] = await Promise.all([
        getTeamAdvisorInfos(),
        cuentasParaAbrirTicketAction(),
    ]);

    return (
        <TicketsDeSoporteClient
            userId={user.id}
            equipo={equipo.success ? equipo.data ?? [] : []}
            cuentas={cuentas.success ? cuentas.data ?? [] : []}
        />
    );
}
