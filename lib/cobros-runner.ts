import {
    tocaRecordatorio,
    type ConfigDeCobros,
    type Hito,
} from "@/lib/cobros";
import {
    anotarElRecordatorio,
    lasConfigsDe,
    losCobrosQuePodrianTocarHoy,
    type CobroDelRunner,
} from "@/lib/cobros-db";
import { laLineaDeLaCuenta, mandarElCobro } from "@/lib/cobros-envio";
import type { WhatsAppDispatcherLine } from "@/actions/whatsapp-dispatcher";

/**
 * La vuelta diaria de recordatorios de Cobros.
 *
 * ## Dónde corre, y por qué ahí
 *
 * Cuelga de `/api/cron/billing`, que ya lo llama n8n una vez al día con su
 * `CRON_SECRET`. Así **no hay infraestructura nueva que montar**: el día que
 * esto se despliega, los recordatorios salen. Con una ruta propia habría que
 * añadirle su flujo en n8n, y hasta que alguien se acordara los avisos no
 * saldrían nunca — un cron que nadie llama no se ve como un error, se ve como
 * que la función no sirve.
 *
 * Va **envuelta** allí: un fallo aquí no puede tumbar el cobro de la
 * plataforma, que es lo que de verdad importa de esa ruta. Pero **tampoco es
 * muda**: devuelve su cuenta y escribe sus avisos, porque unos recordatorios
 * que dejan de salir en silencio se leen como «la App no avisa a mis clientes»,
 * que es de lo más difícil de diagnosticar.
 *
 * ## Qué NO hace, y es a propósito
 *
 * No suspende nada, no corta ningún servicio y no borra ninguna cuenta. Esto le
 * manda un WhatsApp a un cliente de un cliente; lo que haga la cuenta con quien
 * no paga es cosa suya. El `runResellerBillingForAll` de al lado sí suspende y
 * borra, y por eso son dos caminos y no uno.
 */

/** Una cuenta con línea conectada resuelta una sola vez, no una por deuda. */
type PorCuenta = {
    config: ConfigDeCobros;
    linea: WhatsAppDispatcherLine | null;
};

export type ResumenDeCobros = {
    revisados: number;
    enviados: number;
    sinLinea: number;
    fallidos: number;
    porHito: Record<Hito, number>;
};

export async function runRecordatoriosDeCobros(ahora: Date = new Date()): Promise<ResumenDeCobros> {
    const resumen: ResumenDeCobros = {
        revisados: 0,
        enviados: 0,
        sinLinea: 0,
        fallidos: 0,
        porHito: { antes: 0, elDia: 0, despues: 0 },
    };

    const candidatos = await losCobrosQuePodrianTocarHoy();
    resumen.revisados = candidatos.length;
    if (candidatos.length === 0) return resumen;

    // Las configuraciones de todas las cuentas implicadas, de una vez. Una
    // consulta por deuda serían cientos para leer lo mismo.
    const cuentas = [...new Set(candidatos.map((c) => c.ownerId))];
    const configs = await lasConfigsDe(cuentas);

    // La línea se resuelve **una vez por cuenta** y no una por deuda: son varias
    // consultas cada vez, y una cartera de cien clientes las repetiría cien
    // veces para obtener siempre la misma respuesta.
    const porCuenta = new Map<string, PorCuenta>();

    for (const cobro of candidatos) {
        const config = configs.get(cobro.ownerId);
        if (!config) continue;

        const hito = tocaRecordatorio(cobro, config.recordatorios, ahora);
        if (!hito) continue;

        let datos = porCuenta.get(cobro.ownerId);
        if (!datos) {
            datos = { config, linea: await laLineaDeLaCuenta(cobro.ownerId) };
            porCuenta.set(cobro.ownerId, datos);
        }

        if (!datos.linea) {
            // Sin línea no se manda, y **no se anota**: el día que la cuenta
            // conecte la suya, la deuda vuelve a entrar por este mismo hito en
            // vez de haberlo perdido para este ciclo.
            resumen.sinLinea++;
            continue;
        }

        await enviarUno(cobro, datos, hito, ahora, resumen);
    }

    if (resumen.enviados > 0 || resumen.fallidos > 0 || resumen.sinLinea > 0) {
        console.info("[cobros] vuelta diaria de recordatorios", resumen);
    }
    return resumen;
}

async function enviarUno(
    cobro: CobroDelRunner,
    datos: PorCuenta,
    hito: Hito,
    ahora: Date,
    resumen: ResumenDeCobros,
): Promise<void> {
    try {
        const resultado = await mandarElCobro({
            ownerId: cobro.ownerId,
            cobro: {
                contactoNombre: cobro.contactoNombre,
                contactoTelefono: cobro.contactoTelefono,
                contactoJid: cobro.contactoJid,
                concepto: cobro.concepto,
                monto: cobro.monto,
                moneda: cobro.moneda,
                vence: cobro.vence,
            },
            config: datos.config,
            hito,
            ahora,
            linea: datos.linea,
        });

        if (!resultado.ok) {
            // Un envío fallido **no se anota**. Si se anotara, el anti-spam
            // daría por hecho que ya se escribió y ese hito se perdería para
            // siempre: el cliente no recibiría ni el aviso ni nada que lo
            // sustituya, y nadie se enteraría.
            resumen.fallidos++;
            console.warn("[cobros] no se pudo enviar un recordatorio", {
                cobro: cobro.id,
                cuenta: cobro.ownerId,
                hito,
                motivo: resultado.motivo,
            });
            return;
        }

        // Y uno que sí salió se anota **con la fecha de vencimiento de este
        // ciclo**: así una vuelta repetida el mismo día no vuelve a escribir, y
        // en cambio un pago que mueve el vencimiento abre la puerta otra vez sin
        // esperar a mañana.
        if (cobro.vence) {
            await anotarElRecordatorio({ id: cobro.id, hito, vence: cobro.vence, ahora });
        }
        resumen.enviados++;
        resumen.porHito[hito]++;
    } catch (error) {
        resumen.fallidos++;
        console.warn("[cobros] reventó el envío de un recordatorio", {
            cobro: cobro.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
