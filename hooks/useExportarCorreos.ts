"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { exportarCorreosAction } from "@/actions/correo-actions";
import { descargarExportacion, laZonaDeQuienMira } from "@/lib/descargar-exportacion";

/**
 * Exportar correos, desde los tres sitios de Correo: el «⋯» de una fila, el del
 * correo abierto y el de la barra (los de la lista). Es el gemelo de
 * `useExportarConversaciones` de Chats: el mismo aviso, la misma descarga (un
 * `.txt`, o un `.zip` con varios) y el mismo candado contra la doble pulsación.
 */
export function useExportarCorreos() {
    const [exportando, setExportando] = useState(false);
    const enCurso = useRef(false);

    const exportar = useCallback(async (pedidos: { buzonId: string; correoId: string }[]): Promise<boolean> => {
        if (enCurso.current || pedidos.length === 0) return false;
        enCurso.current = true;
        setExportando(true);
        const aviso = toast.loading(pedidos.length === 1 ? "Exportando el correo…" : `Exportando ${pedidos.length} correos…`);
        try {
            const r = await exportarCorreosAction(pedidos, laZonaDeQuienMira());
            if (!r.success) {
                toast.error(r.message, { id: aviso });
                return false;
            }
            descargarExportacion(r.archivos, `Correos exportados ${new Date().toISOString().slice(0, 10)}`);
            if (r.omitidos > 0) toast.warning(r.message, { id: aviso });
            else toast.success(r.message, { id: aviso });
            return true;
        } catch (error) {
            console.error("[correo] la exportación falló", error);
            toast.error("No se pudo exportar. Revisa la conexión e inténtalo de nuevo.", { id: aviso });
            return false;
        } finally {
            enCurso.current = false;
            setExportando(false);
        }
    }, []);

    return { exportando, exportar };
}
