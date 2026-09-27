import { endOfDay } from "date-fns";
import { SOON_DAYS_BILLING } from "@/types/billing";

/**
 * Qué cuentas mira el cobro diario de la plataforma (recordatorios,
 * vencimiento y suspensión). Sale de `runBillingDailyJobInternal` para que el
 * banco del ciclo pagado pueda comprobar con LA MISMA consulta que una cuenta
 * reactivada vuelve a recibir su próximo cobro.
 *
 * Pide `User.status = true`: por eso una cuenta pagada que se quedaba
 * deshabilitada no volvía a cobrarse nunca. Quien la devuelve es
 * `devolverElAcceso` (lib/devolver-el-acceso.server.ts).
 */
export function dondeEntraEnElCobro(now: Date) {
    return {
        user: {
            status: true,
            // El cron de plataforma NO gestiona clientes de resellers:
            // su ciclo de cobro lo maneja el reseller.
            demoResellerId: null,
        },
        dueDate: {
            not: null,
            lte: endOfDay(new Date(now.getTime() + SOON_DAYS_BILLING * 24 * 60 * 60 * 1000)),
        },
    };
}
