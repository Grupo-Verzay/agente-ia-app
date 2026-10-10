import "server-only";

import { db } from "@/lib/db";
import { comoLaVeElNavegador } from "@/lib/clave-de-ia-para-el-navegador";
import { elAvatarPropio, leerLosAjustes } from "@/lib/videollamada-ia-db";
import {
    elEstadoDeLaLinea,
    elEstadoDeLaMensajeria,
    elEstadoDeLaVoz,
    elEstadoDeLasLlamadas,
    elEstadoDelAvatar,
    esLineaDeLaSeccion,
    esSeccionDeLinea,
    laConfigDeOpenAi,
    lasSeccionesDelCanal,
    type ConfigDeIa,
    type EstadoDeSeccion,
    type SeccionDeClaves,
} from "@/lib/claves-por-canal";

/**
 * El estado de las claves de un canal de una cuenta. Solo lee lo que cada
 * sección necesita y NUNCA devuelve una clave: a lo sumo sus 4 últimos
 * caracteres (`comoLaVeElNavegador`). La cuenta llega ya comprobada.
 */
export async function elEstadoDeLasClaves(cuentaId: string, canal: string): Promise<EstadoDeSeccion[]> {
    const secciones = lasSeccionesDelCanal(canal);
    if (!secciones.length) return [];

    const necesitaIa = secciones.some((s) => s === "mensajeria" || s === "voz" || s === "llamadas" || s === "videollamadas");
    const [cuenta, configs] = necesitaIa
        ? await Promise.all([
            db.user.findUnique({
                where: { id: cuentaId },
                select: {
                    defaultProviderId: true,
                    enableVoiceResponses: true,
                    voiceId: true,
                    ttsProvider: true,
                    elevenLabsApiKey: true,
                    elevenLabsVoiceId: true,
                },
            }),
            db.userAiConfig.findMany({
                where: { userId: cuentaId },
                select: { providerId: true, apiKey: true, isActive: true, provider: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
            }),
        ])
        : [null, []];

    const deIa: ConfigDeIa[] = configs.map((c) => ({
        providerId: c.providerId,
        proveedor: c.provider?.name ?? "",
        isActive: c.isActive,
        clave: comoLaVeElNavegador(c.apiKey),
    }));

    const lineas = secciones.some(esSeccionDeLinea)
        ? await db.instancia.findMany({
            where: { userId: cuentaId, instanceType: { in: ["meta", "telegram"] } },
            select: {
                instanceName: true,
                displayName: true,
                instanceType: true,
                metaChannel: true,
                metaPhoneNumberId: true,
                metaPageId: true,
                metaAccessToken: true,
            },
            orderBy: { id: "asc" },
        })
        : [];

    const una = async (seccion: SeccionDeClaves): Promise<EstadoDeSeccion> => {
        switch (seccion) {
            case "mensajeria":
                return elEstadoDeLaMensajeria(deIa, cuenta?.defaultProviderId ?? null);
            case "voz":
                return elEstadoDeLaVoz({
                    activada: Boolean(cuenta?.enableVoiceResponses),
                    proveedor: cuenta?.ttsProvider ?? "openai",
                    claveElevenLabs: comoLaVeElNavegador(cuenta?.elevenLabsApiKey),
                    vozElevenLabs: cuenta?.elevenLabsVoiceId ?? "",
                    vozOpenAi: cuenta?.voiceId ?? "nova",
                    openAi: laConfigDeOpenAi(deIa),
                });
            case "llamadas":
                return elEstadoDeLasLlamadas(laConfigDeOpenAi(deIa));
            case "videollamadas": {
                const propio = await elAvatarPropio(cuentaId).catch((error) => {
                    console.warn("[claves] no se pudo leer el avatar propio de Tavus", { cuenta: cuentaId, error: String(error) });
                    return null;
                });
                const ajustes = await leerLosAjustes(cuentaId).catch((error) => {
                    console.warn("[claves] no se pudo leer el proveedor de la videollamada", { cuenta: cuentaId, error: String(error) });
                    return null;
                });
                return elEstadoDelAvatar({
                    propio: propio?.clave ? { personaId: propio.personaId, clave: comoLaVeElNavegador(propio.clave) } : null,
                    proveedor: ajustes?.proveedor,
                    openAi: laConfigDeOpenAi(deIa),
                });
            }
            default: {
                const deLaSeccion = lineas
                    .filter((l) => esLineaDeLaSeccion(seccion, l))
                    .map((l) => ({
                        instanceName: l.instanceName,
                        nombre: l.displayName || l.instanceName,
                        identificador:
                            seccion === "linea-telegram"
                                ? (l.metaPhoneNumberId ? `@${l.metaPhoneNumberId}` : null)
                                : seccion === "linea-whatsapp-api"
                                    ? l.metaPhoneNumberId
                                    : l.metaPageId,
                        clave: comoLaVeElNavegador(l.metaAccessToken),
                    }));
                return elEstadoDeLaLinea(seccion, deLaSeccion);
            }
        }
    };

    return Promise.all(secciones.map(una));
}
