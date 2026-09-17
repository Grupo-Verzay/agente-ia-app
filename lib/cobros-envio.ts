import {
    resolveWhatsAppDispatcherLine,
    sendViaWhatsAppDispatcher,
    type WhatsAppDispatcherLine,
} from "@/actions/whatsapp-dispatcher";
import {
    jidDelCobro,
    textoDelCobro,
    type CobroParaEnviar,
    type ConfigDeCobros,
    type Hito,
} from "@/lib/cobros";

/**
 * Mandar un cobro por WhatsApp.
 *
 * Aquí vive **solo lo que tiene efectos**: resolver la línea y hablar con el
 * proveedor. Armar el texto es puro y está en `lib/cobros.ts`, que es lo que
 * permite probarlo sin levantar nada.
 *
 * **No se escribe ni una línea de envío nueva**: quien habla con Evolution,
 * Waha o Meta es `sendViaWhatsAppDispatcher`, que ya sabe distinguirlos.
 */

export type ResultadoDelEnvio = { ok: true; linea: string } | { ok: false; motivo: string };

/**
 * La línea por la que sale el mensaje: **la de la propia cuenta, y solo esa**.
 *
 * `includeAdminFallback: false` es la parte que importa. Sin él, una cuenta sin
 * línea conectada caería a la línea oficial de la plataforma y sus clientes
 * recibirían el cobro desde un número que no es el suyo — desde fuera, un
 * desconocido pidiéndoles dinero. Es preferible que no salga y que la pantalla
 * lo diga, que es justo lo que hace la configuración.
 */
export async function laLineaDeLaCuenta(ownerId: string): Promise<WhatsAppDispatcherLine | null> {
    return resolveWhatsAppDispatcherLine({ ownerUserId: ownerId, includeAdminFallback: false });
}

export async function mandarElCobro(args: {
    ownerId: string;
    cobro: CobroParaEnviar;
    config: ConfigDeCobros;
    hito: Hito;
    ahora: Date;
    /** Si ya se resolvió antes —la vuelta diaria la resuelve una vez por cuenta—. */
    linea?: WhatsAppDispatcherLine | null;
}): Promise<ResultadoDelEnvio> {
    const jid = jidDelCobro(args.cobro);
    if (!jid) return { ok: false, motivo: "La deuda no tiene un número al que escribir." };

    const linea = args.linea ?? (await laLineaDeLaCuenta(args.ownerId));
    if (!linea) {
        return {
            ok: false,
            motivo: "Esta cuenta no tiene una línea de WhatsApp conectada para enviar el cobro.",
        };
    }

    const texto = textoDelCobro(args.cobro, args.config, args.hito, args.ahora);
    if (!texto.trim()) return { ok: false, motivo: "El mensaje de cobro está vacío." };

    const envio = await sendViaWhatsAppDispatcher({
        dispatcher: linea,
        remoteJid: jid,
        text: texto,
    });

    if (!envio?.success) {
        return { ok: false, motivo: envio?.message?.trim() || "No se pudo enviar el mensaje." };
    }
    return { ok: true, linea: linea.instanceName };
}
