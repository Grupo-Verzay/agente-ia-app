"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { canManageWorkspace } from "@/lib/workspace-roles";
import {
    comoDiasDeGracia,
    comoDiasDeLicencia,
    MENSAJES_POR_DEFECTO,
    soloDigitos,
    TOPE_DE_DIAS,
    type CicloDeCobro,
    type CobroConAdjuntos,
    type ConfigDeCobros,
    type Hito,
} from "@/lib/cobros";
import {
    adjuntarAlCobro,
    borrarElCobro,
    confirmarElPago,
    crearElCobro,
    editarElCobro,
    laCarteraDe,
    laConfigDe,
    losCiclosDe,
    guardarLaConfig,
    moverElEstado,
    quitarAdjuntoDelCobro,
} from "@/lib/cobros-db";
import { laLineaDeLaCuenta, mandarElCobro } from "@/lib/cobros-envio";
import { TIPOS_DE_ADJUNTO, type TipoDeAdjunto } from "@/lib/adjuntos-de-tarea-tipos";

/**
 * Las acciones de Cobros.
 *
 * **La puerta está aquí, no en la pantalla.** `/cobros` no está montada en
 * ningún módulo —se asigna a mano desde «Editar módulo»—, y el guardián del
 * layout solo cierra rutas que SÍ están en algún módulo y denegadas: una que no
 * está en ninguno no entra en `rutasNegadas` y se alcanza escribiendo la URL.
 * Así que cada acción resuelve la cuenta y pasa por `assertCanAccessTargetUser`,
 * y la pantalla pinta lo que estas devuelvan.
 *
 * Y un recordatorio del fichero, que ya costó una versión entera en Carpetas:
 * un módulo `'use server'` **solo exporta funciones asíncronas**. Los tipos y
 * las constantes viven en `lib/cobros.ts`.
 */

type Respuesta<T> = { success: boolean; message?: string; data?: T };

/**
 * De qué cuenta es la cartera de quien está mirando, comprobado.
 *
 * `effectiveId` es la cuenta —el asesor de un equipo trabaja sobre la de su
 * dueño—, y aun así pasa por la regla: es la que respeta a todos los que tienen
 * que pasar (uno mismo, el asesor sobre su dueño, cuentas vinculadas, admin y
 * super admin).
 */
async function laCuenta() {
    const user = await currentUser();
    if (!user) throw new Error("No autorizado.");
    const ownerId = user.effectiveId ?? user.ownerId ?? user.id;
    await assertCanAccessTargetUser(ownerId);
    return { user, ownerId };
}

function comoFecha(valor: string | null | undefined): Date | null {
    const texto = (valor ?? "").trim();
    if (!texto) return null;
    // Del `<input type="date">` viene "YYYY-MM-DD". Se sella a MEDIODÍA UTC y no
    // a medianoche: a medianoche, en una zona -05:00 la fecha se ve como el día
    // anterior y el vencimiento del día 1 sale como día 31.
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return new Date(`${texto}T12:00:00.000Z`);
    const fecha = new Date(texto);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const AdjuntoSchema = z.object({
    url: z.string().min(1),
    nombre: z.string().min(1).max(300),
    tipo: z.enum(TIPOS_DE_ADJUNTO as unknown as [TipoDeAdjunto, ...TipoDeAdjunto[]]),
    mimeType: z.string().max(200).nullable().optional(),
    tamanoBytes: z.number().nullable().optional(),
});

const CobroSchema = z.object({
    contactoNombre: z.string().trim().min(1, "Falta el nombre del cliente.").max(200),
    contactoTelefono: z.string().trim().min(1, "Falta el número de WhatsApp.").max(40),
    contactoJid: z.string().trim().max(200).nullable().optional(),
    concepto: z.string().trim().max(200).default(""),
    monto: z.number().nonnegative().nullable().optional(),
    moneda: z.string().trim().min(1).max(10).default("COP"),
    vence: z.string().trim().nullable().optional(),
    diasDeLicencia: z.number().int().min(1).max(TOPE_DE_DIAS),
    diasDeGracia: z.number().int().min(0).max(TOPE_DE_DIAS),
});

/* ── Leer ─────────────────────────────────────────────────────────────────── */

export async function laCarteraAction(): Promise<Respuesta<CobroConAdjuntos[]>> {
    try {
        const { ownerId } = await laCuenta();
        return { success: true, data: await laCarteraDe(ownerId) };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer la cartera.";
        console.warn("[cobros] no se pudo leer la cartera", { message });
        return { success: false, message };
    }
}

export async function losCiclosAction(cobroId: string): Promise<Respuesta<CicloDeCobro[]>> {
    try {
        const { ownerId } = await laCuenta();
        return { success: true, data: await losCiclosDe(String(cobroId ?? "").trim(), ownerId) };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer el historial.";
        return { success: false, message };
    }
}

export async function laConfigAction(): Promise<Respuesta<ConfigDeCobros>> {
    try {
        const { ownerId } = await laCuenta();
        return { success: true, data: await laConfigDe(ownerId) };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer la configuración.";
        return { success: false, message };
    }
}

/**
 * Por qué línea sale el mensaje.
 *
 * Se enseña en la configuración a propósito: una cuenta con dos líneas
 * conectadas no tiene por qué adivinar cuál eligió el sistema, y una cuenta sin
 * ninguna necesita saber **por qué** no le sale ningún cobro. El `null` es
 * información, no un fallo.
 */
export async function laLineaDeCobrosAction(): Promise<Respuesta<{ instanceName: string } | null>> {
    try {
        const { ownerId } = await laCuenta();
        const linea = await laLineaDeLaCuenta(ownerId);
        return { success: true, data: linea ? { instanceName: linea.instanceName } : null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer la línea.";
        return { success: false, message };
    }
}

/* ── Escribir ─────────────────────────────────────────────────────────────── */

export async function crearCobroAction(
    entrada: unknown,
    adjuntos: unknown = [],
): Promise<Respuesta<{ id: string }>> {
    try {
        const { user, ownerId } = await laCuenta();
        const datos = CobroSchema.parse(entrada);
        const archivos = z.array(AdjuntoSchema).max(20).parse(adjuntos ?? []);

        const id = randomUUID();
        await crearElCobro({
            id,
            ownerId,
            creadoPorId: user.id,
            contactoNombre: datos.contactoNombre,
            contactoTelefono: soloDigitos(datos.contactoTelefono),
            contactoJid: datos.contactoJid?.trim() || null,
            concepto: datos.concepto,
            monto: datos.monto ?? null,
            moneda: datos.moneda,
            vence: comoFecha(datos.vence),
            diasDeLicencia: comoDiasDeLicencia(datos.diasDeLicencia),
            diasDeGracia: comoDiasDeGracia(datos.diasDeGracia),
            adjuntos: archivos.map((a) => ({
                id: randomUUID(),
                url: a.url,
                nombre: a.nombre,
                tipo: a.tipo,
                mimeType: a.mimeType ?? null,
                tamanoBytes: a.tamanoBytes ?? null,
            })),
        });

        revalidatePath("/cobros");
        return { success: true, data: { id } };
    } catch (error) {
        const message =
            error instanceof z.ZodError
                ? error.errors[0]?.message ?? "Faltan datos."
                : error instanceof Error
                  ? error.message
                  : "No se pudo crear el cobro.";
        return { success: false, message };
    }
}

export async function editarCobroAction(id: string, entrada: unknown): Promise<Respuesta<null>> {
    try {
        const { ownerId } = await laCuenta();
        const datos = CobroSchema.parse(entrada);

        const tocada = await editarElCobro({
            id: String(id ?? "").trim(),
            ownerId,
            contactoNombre: datos.contactoNombre,
            contactoTelefono: soloDigitos(datos.contactoTelefono),
            concepto: datos.concepto,
            monto: datos.monto ?? null,
            moneda: datos.moneda,
            vence: comoFecha(datos.vence),
            diasDeLicencia: comoDiasDeLicencia(datos.diasDeLicencia),
            diasDeGracia: comoDiasDeGracia(datos.diasDeGracia),
        });
        if (!tocada) return { success: false, message: "Esa deuda ya no está." };

        revalidatePath("/cobros");
        return { success: true };
    } catch (error) {
        const message =
            error instanceof z.ZodError
                ? error.errors[0]?.message ?? "Faltan datos."
                : error instanceof Error
                  ? error.message
                  : "No se pudo guardar.";
        return { success: false, message };
    }
}

/** Marcar que llegó el comprobante. **A mano**: aquí no se detecta ningún pago. */
export async function marcarComprobanteAction(id: string): Promise<Respuesta<null>> {
    try {
        const { ownerId } = await laCuenta();
        const tocada = await moverElEstado({
            id: String(id ?? "").trim(),
            ownerId,
            antes: "pendiente",
            despues: "comprobante",
        });
        if (!tocada) return { success: false, message: "Esa deuda ya no estaba pendiente." };
        revalidatePath("/cobros");
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo marcar.",
        };
    }
}

/** Deshacer la marca: el comprobante no era, o era de otra cosa. */
export async function volverAPendienteAction(id: string): Promise<Respuesta<null>> {
    try {
        const { ownerId } = await laCuenta();
        const tocada = await moverElEstado({
            id: String(id ?? "").trim(),
            ownerId,
            antes: "comprobante",
            despues: "pendiente",
        });
        if (!tocada) return { success: false, message: "Esa deuda ya no estaba en comprobante." };
        revalidatePath("/cobros");
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo deshacer.",
        };
    }
}

/**
 * Confirmar el pago: cierra el ciclo y abre el siguiente.
 *
 * Se puede confirmar desde los dos estados —hay quien paga y avisa por teléfono
 * sin mandar nada por WhatsApp—, así que el `antes` viaja desde la pantalla.
 *
 * Y con él viaja **el vencimiento que se vio**, que es la llave del ciclo: el
 * estado no sirve de guarda porque confirmar devuelve la fila a `pendiente`, y
 * sin esta fecha dos confirmaciones a la vez saltaban el vencimiento dos veces
 * —un mes regalado por un doble clic—. Solo se compara; nunca se escribe.
 */
export async function confirmarPagoAction(
    id: string,
    antes: "pendiente" | "comprobante",
    venceQueSeVio: string | null,
): Promise<Respuesta<{ siguienteVence: string }>> {
    try {
        const { user, ownerId } = await laCuenta();
        const visto = venceQueSeVio ? new Date(venceQueSeVio) : null;
        if (visto && Number.isNaN(visto.getTime())) {
            return { success: false, message: "Vuelve a cargar la lista y prueba otra vez." };
        }

        const cerrado = await confirmarElPago({
            id: String(id ?? "").trim(),
            ownerId,
            antes,
            venceQueSeVio: visto,
            confirmadaPorId: user.id,
            cicloId: randomUUID(),
            ahora: new Date(),
        });
        if (!cerrado) {
            return { success: false, message: "Esa deuda cambió mientras tanto. Vuelve a mirarla." };
        }

        console.info("[cobros] ciclo confirmado", {
            cobro: id,
            vencia: cerrado.vencia?.toISOString() ?? null,
            siguienteVence: cerrado.siguienteVence.toISOString(),
        });
        revalidatePath("/cobros");
        return { success: true, data: { siguienteVence: cerrado.siguienteVence.toISOString() } };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo confirmar.",
        };
    }
}

/**
 * Borrar una deuda. **Un `agente` no borra.**
 *
 * Es la misma puerta que el resto de acciones destructivas de la App —la de
 * `canManageWorkspace`— más nada propio: borrar aquí se lleva el historial de
 * ciclos de ese cliente, que es lo único que recuerda cuánto lleva pagando.
 */
export async function borrarCobroAction(id: string): Promise<Respuesta<null>> {
    try {
        const { user, ownerId } = await laCuenta();
        if (!canManageWorkspace(user)) {
            return { success: false, message: "Solo quien administra la cuenta puede eliminar cobros." };
        }
        const tocada = await borrarElCobro(String(id ?? "").trim(), ownerId);
        if (!tocada) return { success: false, message: "Esa deuda ya no está." };
        revalidatePath("/cobros");
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo eliminar.",
        };
    }
}

/* ── Adjuntos ─────────────────────────────────────────────────────────────── */

export async function adjuntarACobroAction(entrada: unknown): Promise<Respuesta<{ id: string }>> {
    try {
        const { ownerId } = await laCuenta();
        const datos = AdjuntoSchema.extend({ cobroId: z.string().trim().min(1) }).parse(entrada);

        const id = randomUUID();
        const ok = await adjuntarAlCobro({
            id,
            cobroId: datos.cobroId,
            ownerId,
            url: datos.url,
            nombre: datos.nombre,
            tipo: datos.tipo,
            mimeType: datos.mimeType ?? null,
            tamanoBytes: datos.tamanoBytes ?? null,
        });
        if (!ok) return { success: false, message: "Esa deuda no es de esta cuenta." };

        revalidatePath("/cobros");
        return { success: true, data: { id } };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo adjuntar.",
        };
    }
}

export async function quitarAdjuntoDeCobroAction(id: string): Promise<Respuesta<null>> {
    try {
        const { ownerId } = await laCuenta();
        const ok = await quitarAdjuntoDelCobro(String(id ?? "").trim(), ownerId);
        if (!ok) return { success: false, message: "Ese archivo ya no está." };
        revalidatePath("/cobros");
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo quitar.",
        };
    }
}

/* ── La configuración ─────────────────────────────────────────────────────── */

const ConfigSchema = z.object({
    datosDePago: z.string().max(2000).default(""),
    mensajes: z.object({
        antes: z.string().max(4000).default(""),
        elDia: z.string().max(4000).default(""),
        despues: z.string().max(4000).default(""),
    }),
    recordatorios: z.object({
        diasAntes: z.number().int().min(1).max(TOPE_DE_DIAS).nullable(),
        elDia: z.boolean(),
        diasDespues: z.number().int().min(1).max(TOPE_DE_DIAS).nullable(),
    }),
});

export async function guardarConfigAction(entrada: unknown): Promise<Respuesta<ConfigDeCobros>> {
    try {
        const { ownerId } = await laCuenta();
        const datos = ConfigSchema.parse(entrada);

        // Un mensaje en blanco cae al de siempre. Guardar el vacío tal cual
        // dejaría a la cuenta mandando WhatsApps SIN TEXTO a sus clientes, y eso
        // no se recoge.
        const config: ConfigDeCobros = {
            ownerId,
            datosDePago: datos.datosDePago,
            mensajes: {
                antes: datos.mensajes.antes.trim() || MENSAJES_POR_DEFECTO.antes,
                elDia: datos.mensajes.elDia.trim() || MENSAJES_POR_DEFECTO.elDia,
                despues: datos.mensajes.despues.trim() || MENSAJES_POR_DEFECTO.despues,
            },
            recordatorios: datos.recordatorios,
        };
        await guardarLaConfig(config);
        revalidatePath("/cobros");
        return { success: true, data: config };
    } catch (error) {
        const message =
            error instanceof z.ZodError
                ? error.errors[0]?.message ?? "Faltan datos."
                : error instanceof Error
                  ? error.message
                  : "No se pudo guardar.";
        return { success: false, message };
    }
}

/* ── Cobrar ahora ─────────────────────────────────────────────────────────── */

/**
 * El botón «Cobrar ahora»: manda el mensaje a mano, sin esperar al hito.
 *
 * **No toca las marcas del anti-spam.** Si las tocara, mandar uno a mano hoy le
 * quitaría al cliente el recordatorio automático de hoy —que es justo el día en
 * que vence—, y desde fuera parecería que el sistema dejó de avisar.
 */
export async function cobrarAhoraAction(id: string): Promise<Respuesta<{ linea: string }>> {
    try {
        const { ownerId } = await laCuenta();
        const cartera = await laCarteraDe(ownerId);
        const cobro = cartera.find((c) => c.id === String(id ?? "").trim());
        if (!cobro) return { success: false, message: "Esa deuda ya no está." };

        const config = await laConfigDe(ownerId);
        const ahora = new Date();
        const vence = cobro.vence ? new Date(cobro.vence) : null;

        // Qué plantilla usar cuando se manda a mano: la que corresponda a cómo
        // está la deuda hoy. Sin fecha, la de «antes», que es la neutra.
        const faltan = vence ? Math.round((vence.getTime() - ahora.getTime()) / 86_400_000) : null;
        const hito: Hito = faltan === null ? "antes" : faltan < 0 ? "despues" : faltan === 0 ? "elDia" : "antes";

        const resultado = await mandarElCobro({
            ownerId,
            cobro: { ...cobro, vence },
            config,
            hito,
            ahora,
        });
        if (!resultado.ok) return { success: false, message: resultado.motivo };

        console.info("[cobros] cobro enviado a mano", { cobro: cobro.id, linea: resultado.linea, hito });
        return { success: true, data: { linea: resultado.linea } };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo enviar.",
        };
    }
}
