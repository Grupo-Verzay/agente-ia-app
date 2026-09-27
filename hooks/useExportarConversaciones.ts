"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { exportarConversacionesAction, type PedidoDeExportacion } from "@/actions/exportar-conversaciones-actions";
import { descargarExportacion, laZonaDeQuienMira } from "@/lib/descargar-exportacion";

/**
 * Exportar conversaciones de Chats, desde donde sea: el menú «Acciones» de la
 * cabecera, la barra de acciones en lote y la lista de Calidad del CRM.
 *
 * **Un solo camino**: la acción, el aviso y la descarga están escritos aquí y
 * en ningún otro sitio. Con uno por pantalla, al tercero se le olvida decir
 * cuántas no se pudieron exportar, y un «listo» sobre diez de las que salieron
 * ocho es peor que un error.
 *
 * Mientras exporta, `exportando` es cierto y una segunda pulsación no hace
 * nada: que se vea que se pulsó, y que pulsar cinco veces no baje cinco zips.
 */
export function useExportarConversaciones() {
    const [exportando, setExportando] = useState(false);
    const enCurso = useRef(false);

    const exportar = useCallback(async (pedidos: PedidoDeExportacion[]): Promise<boolean> => {
        if (enCurso.current || pedidos.length === 0) return false;
        enCurso.current = true;
        setExportando(true);
        const aviso = toast.loading(
            pedidos.length === 1 ? "Exportando la conversación…" : `Exportando ${pedidos.length} conversaciones…`,
        );
        try {
            const r = await exportarConversacionesAction(pedidos, laZonaDeQuienMira());
            if (!r.success) {
                toast.error(r.message, { id: aviso });
                return false;
            }
            descargarExportacion(r.archivos, `Chats exportados ${new Date().toISOString().slice(0, 10)}`);
            if (r.omitidas > 0) toast.warning(r.message, { id: aviso });
            else toast.success(r.message, { id: aviso });
            return true;
        } catch (error) {
            console.error("[exportar] la acción falló", error);
            toast.error("No se pudo exportar. Revisa la conexión e inténtalo de nuevo.", { id: aviso });
            return false;
        } finally {
            enCurso.current = false;
            setExportando(false);
        }
    }, []);

    return { exportando, exportar };
}
