'use server';

import { db } from '@/lib/db';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { comoListaDeCuentas } from '@/lib/etiquetas-de-la-linea';
import { elColorDeLaEtapa, type Etapa } from '@/lib/embudos';
import { lasEtapasDe, losEmbudosDeVarias } from '@/lib/embudos-db';
import { nombreDeLaCuenta } from '@/lib/nombre-de-la-cuenta';
import type { EmbudosDeLaCuenta } from '@/lib/filtro-de-chats-por-cuenta';

/**
 * Las cuentas de la bandeja de Chats, con su nombre y sus embudos (con sus
 * etapas en orden y su color ya resuelto), para el panel de filtros.
 *
 * Una acción ES un endpoint: la lista de cuentas llega del navegador, así que
 * cada una pasa por `laCuentaDeLaAccion` —la misma puerta con la que se piden
 * las etiquetas de la bandeja—. Lo que no se alcanza no se lista, y se dice.
 *
 * Se pide al ABRIR el panel, no en cada carga de Chats: es la pantalla más cara
 * de la App y este dato solo hace falta si alguien va a filtrar. Solo LEE: una
 * cuenta que nunca abrió Embudos no tiene embudos y sale con la lista vacía (no
 * se siembra nada desde aquí).
 */
export async function embudosDelFiltroDeChatsAction(
    cuentasPedidas: unknown,
): Promise<{ success: boolean; message: string; data?: EmbudosDeLaCuenta[] }> {
    try {
        const pedidas = comoListaDeCuentas(cuentasPedidas);
        if (pedidas.length === 0) return { success: true, message: 'Sin cuentas.', data: [] };

        const alcanzadas = await Promise.all(pedidas.map((id) => laCuentaDeLaAccion(id)));
        const cuentas = pedidas.filter((id, i) => alcanzadas[i] === id);
        if (cuentas.length < pedidas.length) {
            console.warn('[chats] el filtro pidió cuentas que no alcanza', {
                pedidas: pedidas.length,
                alcanzadas: cuentas.length,
            });
        }
        if (cuentas.length === 0) return { success: false, message: 'No autorizado.' };

        const [filas, embudosPorCuenta] = await Promise.all([
            db.user.findMany({
                where: { id: { in: cuentas } },
                select: { id: true, company: true, name: true, email: true },
            }),
            losEmbudosDeVarias(cuentas),
        ]);
        const nombres = new Map(filas.map((f) => [f.id, nombreDeLaCuenta(f)]));

        const embudoIds = Array.from(embudosPorCuenta.values()).flat().map((e) => e.id);
        const etapas = await lasEtapasDe(embudoIds);
        const etapasDelEmbudo = new Map<string, Etapa[]>();
        for (const etapa of etapas) {
            const lista = etapasDelEmbudo.get(etapa.embudoId) ?? [];
            lista.push(etapa);
            etapasDelEmbudo.set(etapa.embudoId, lista);
        }

        const data: EmbudosDeLaCuenta[] = cuentas.map((cuentaId) => ({
            cuentaId,
            nombre: nombres.get(cuentaId) ?? 'Cuenta',
            embudos: [...(embudosPorCuenta.get(cuentaId) ?? [])]
                .sort((a, b) => a.orden - b.orden)
                .map((embudo) => ({
                    id: embudo.id,
                    nombre: embudo.nombre,
                    porDefecto: embudo.porDefecto,
                    etapas: [...(etapasDelEmbudo.get(embudo.id) ?? [])]
                        .sort((a, b) => a.orden - b.orden)
                        // El color con la MISMA función que la pastilla de la
                        // fila: la misma etapa no puede salir de dos colores.
                        .map((etapa, posicion) => ({
                            id: etapa.id,
                            nombre: etapa.nombre,
                            color: elColorDeLaEtapa(etapa, posicion),
                        })),
                })),
        }));

        return { success: true, message: 'Embudos obtenidos.', data };
    } catch (error) {
        console.error('[chats] no se pudieron leer los embudos del filtro', error);
        return { success: false, message: 'No se pudieron leer los embudos.' };
    }
}
