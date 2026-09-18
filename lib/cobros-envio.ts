import {
    resolveWhatsAppDispatcherLine,
    sendMediaViaWhatsAppDispatcher,
    anotarQueNoHabiaLinea,
    sendViaWhatsAppDispatcher,
    type WhatsAppDispatcherLine,
} from "@/actions/whatsapp-dispatcher";
import {
    jidDelCobro,
    mediatypeDelAdjunto,
    puedeSalirElAdjunto,
    textoDelCobro,
    TOPE_DE_ADJUNTOS_QUE_SALEN,
    type AdjuntoDeCobro,
    type CobroParaEnviar,
    type ConfigDeCobros,
    type Hito,
} from "@/lib/cobros";
import { anotarElEnvioDelAdjunto } from "@/lib/cobros-db";

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

/**
 * Cómo le fue a los archivos. **No decide si el cobro salió**: el cobro es el
 * texto, y un adjunto que no sale no puede tirar un recordatorio que sí llegó.
 */
export type ResumenDeAdjuntos = {
    enviados: number;
    /** Los que no salieron, con su motivo. Cada uno queda anotado en su fila. */
    fallidos: Array<{ nombre: string; motivo: string }>;
};

export type ResultadoDelEnvio =
    | { ok: true; linea: string; adjuntos: ResumenDeAdjuntos }
    | { ok: false; motivo: string };

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
    /** Los archivos de la deuda. Salen DESPUÉS del texto, y nunca lo tumban. */
    adjuntos?: AdjuntoDeCobro[];
}): Promise<ResultadoDelEnvio> {
    const jid = jidDelCobro(args.cobro);
    if (!jid) return { ok: false, motivo: "La deuda no tiene un número al que escribir." };

    const linea = args.linea ?? (await laLineaDeLaCuenta(args.ownerId));
    if (!linea) {
        // Sin línea el mensaje no llega ni al despachador, así que este fallo
        // —el más silencioso de todos: la cuenta se quedó sin línea y a sus
        // clientes no les llega nada— solo se puede anotar aquí.
        await anotarQueNoHabiaLinea({
            tipo: "cobro",
            cuentaId: args.ownerId,
            destinatario: jid,
            motivo: "Esta cuenta no tiene una línea de WhatsApp conectada para enviar el cobro.",
        });
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
        // La constancia la deja el despachador, que es por donde pasan los seis
        // caminos automáticos. Los ADJUNTOS no entran aquí: cada uno ya tiene
        // su propio sello en su fila (`anotarElEnvioDelAdjunto`), que es lo que
        // la pantalla de Cobros enseña debajo del archivo.
        registro: { tipo: "cobro", cuentaId: args.ownerId },
    });

    if (!envio?.success) {
        return { ok: false, motivo: envio?.message?.trim() || "No se pudo enviar el mensaje." };
    }

    const adjuntos = await mandarLosAdjuntos({
        linea,
        jid,
        adjuntos: args.adjuntos ?? [],
    });
    return { ok: true, linea: linea.instanceName, adjuntos };
}

/**
 * Los archivos de la deuda, **después** del texto y de uno en uno.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Un archivo que falla no tumba el cobro.** El texto ya salió y es lo que
 *    de verdad hay que entregar; devolver un fallo aquí haría que la vuelta
 *    diaria no anotara el hito y el cliente recibiera el MISMO recordatorio
 *    mañana, y pasado — un adjunto roto convertido en spam. Por eso esto no
 *    devuelve `ok`, devuelve un resumen.
 * 2. **Y tampoco se pierde en silencio.** Cada archivo deja su constancia en su
 *    propia fila (`anotarElEnvioDelAdjunto`), que es lo que la pantalla enseña
 *    debajo del archivo; y el conjunto sale por consola. Un adjunto que no llega
 *    sin decir por qué se lee como que la función no sirve.
 * 3. **En serie, no en paralelo.** Son mensajes a una persona y tienen que
 *    llegar en su orden; y varios envíos a la vez por la misma línea es
 *    exactamente lo que hace que WhatsApp la mire con lupa.
 */
async function mandarLosAdjuntos(args: {
    linea: WhatsAppDispatcherLine;
    jid: string;
    adjuntos: AdjuntoDeCobro[];
}): Promise<ResumenDeAdjuntos> {
    const resumen: ResumenDeAdjuntos = { enviados: 0, fallidos: [] };
    // El tope se vuelve a aplicar aquí y no solo al adjuntar: una deuda puede
    // traer filas de antes de que existiera.
    const lista = args.adjuntos.slice(0, TOPE_DE_ADJUNTOS_QUE_SALEN);
    if (lista.length === 0) return resumen;

    for (const adjunto of lista) {
        const puede = puedeSalirElAdjunto(adjunto);
        if (!puede.ok) {
            resumen.fallidos.push({ nombre: adjunto.nombre, motivo: puede.motivo });
            await anotarElEnvioDelAdjunto(adjunto.id, puede);
            continue;
        }

        let envio: { success: boolean; message: string };
        try {
            envio = await sendMediaViaWhatsAppDispatcher({
                dispatcher: args.linea,
                remoteJid: args.jid,
                media: {
                    mediatype: mediatypeDelAdjunto(adjunto.tipo),
                    mediaUrl: adjunto.url,
                    mimetype: adjunto.mimeType,
                    fileName: adjunto.nombre,
                    // Sin pie: el mensaje de cobro salió entero un momento
                    // antes, y repetirlo debajo de cada archivo sería mandárselo
                    // al cliente tantas veces como archivos lleve la deuda.
                    caption: null,
                },
            });
        } catch (error) {
            // Que un proveedor reviente no puede llevarse por delante los
            // archivos de detrás ni el cobro que ya salió.
            envio = {
                success: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }

        if (envio.success) {
            resumen.enviados++;
            await anotarElEnvioDelAdjunto(adjunto.id, { ok: true });
        } else {
            const motivo = envio.message?.trim() || "No se pudo enviar el archivo.";
            resumen.fallidos.push({ nombre: adjunto.nombre, motivo });
            await anotarElEnvioDelAdjunto(adjunto.id, { ok: false, motivo });
        }
    }

    if (resumen.fallidos.length > 0) {
        console.warn("[cobros] adjuntos que no salieron", {
            linea: args.linea.instanceName,
            enviados: resumen.enviados,
            fallidos: resumen.fallidos,
        });
    }
    return resumen;
}
