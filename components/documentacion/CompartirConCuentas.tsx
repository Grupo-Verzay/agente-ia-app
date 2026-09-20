"use client";

import {
    CompartirConCuentasDialog,
    type CompartirCon,
} from "@/components/shared/CompartirConCuentasDialog";
import {
    compartirConCuentasAction,
    lasCuentasParaCompartirAction,
} from "@/actions/documentacion-actions";

/**
 * Compartir un espacio o un documento **con otra cuenta**, con el diálogo de
 * Proyectos y Diagramas.
 *
 * Es literalmente ese componente: no hay una segunda versión del buscador, ni
 * del interruptor por cuenta, ni del selector de permiso, ni del «N de M
 * cuentas». `CompartirConCuentasDialog` se escribió con `cargar` y `guardar`
 * como huecos justamente para esto, así que lo único que vive aquí son las dos
 * llamadas y la traducción de sus formas.
 *
 * **Y lo que se guarda son filas de `doc_permisos`**, no una tabla nueva. Esa
 * es la mitad que no se puede ablandar: la puerta de este módulo
 * —`accesoAEsteEspacio` / `accesoAEsteDocumento`— lee esas filas y solo esas.
 * Un compartir escrito en `project_shares`, o en una tabla propia, sería un
 * acceso que esa puerta no mira.
 */
export function CompartirConCuentas({
    abierto,
    setAbierto,
    objetoTipo,
    objetoId,
    nombre,
    alGuardar,
}: {
    abierto: boolean;
    setAbierto: (abierto: boolean) => void;
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    nombre: string;
    alGuardar: () => void;
}) {
    return (
        <CompartirConCuentasDialog
            open={abierto}
            setOpen={setAbierto}
            titulo={nombre}
            queSeVe="Documentos"
            cargar={async () => {
                const res = await lasCuentasParaCompartirAction({ objetoTipo, objetoId });
                // El diálogo distingue «no llegó la lista» de «la lista está
                // vacía»: con `cuentas: []` y `ok: true` diría «No hay otras
                // cuentas», que es una respuesta y no un fallo.
                return res.success
                    ? { ok: true, cuentas: res.data }
                    : { ok: false, cuentas: [], message: res.message };
            }}
            guardar={async (destinos: CompartirCon[]) => {
                const res = await compartirConCuentasAction({
                    objetoTipo,
                    objetoId,
                    destinos,
                });
                return res.success ? { ok: true } : { ok: false, message: res.message };
            }}
            onSaved={alGuardar}
        />
    );
}
