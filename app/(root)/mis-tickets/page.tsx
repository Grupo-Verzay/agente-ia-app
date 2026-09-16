import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { elDestinoDeLosTickets } from "@/lib/tickets-db";
import { MisTicketsClient } from "./_components/MisTicketsClient";

/**
 * «Mis tickets»: lo que ve el cliente.
 *
 * Solo lo suyo, y **los cinco estados tal cual** —incluido el descartado con su
 * motivo—. Esconderle uno haría que su ticket desapareciera sin explicación, que
 * es justo lo que el encargo evita.
 */
export default async function MisTicketsPage() {
    const user = await currentUser();
    if (!user?.id) return null;

    const cuentaId = user.ownerId ?? user.id;
    const [destino, fila] = await Promise.all([
        elDestinoDeLosTickets(),
        db.user.findUnique({
            where: { id: cuentaId },
            select: { notificationNumber: true },
        }),
    ]);

    // `notificationNumber` no es nulo nunca —tiene `@default("0000000000")`—,
    // asi que «sin numero» es ese relleno. Meterlo tal cual en el campo dejaria
    // el ticket con un numero imposible al que avisar.
    const numero = (fila?.notificationNumber ?? "").replace(/\D+/g, "");

    return (
        <MisTicketsClient
            userId={user.id}
            whatsappPorDefecto={numero && numero !== "0000000000" ? numero : null}
            // La cuenta de destino no abre tickets consigo misma: los atiende.
            // Se compara con la CUENTA, que es bajo la que se archivaria.
            puedeAbrir={!!destino && cuentaId !== destino}
            hayDestino={!!destino}
        />
    );
}
