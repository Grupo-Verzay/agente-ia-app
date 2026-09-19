"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Aterrizar en la ficha que pide la URL.
 *
 * Por aquí caen las menciones de Documentación: pulsar la pastilla de un
 * cliente, una tarea o un ticket lleva a su pantalla con `?cliente=`, `?tarea=`
 * o `?ticket=`, y lo que se espera al llegar es **la ficha abierta**, no la
 * lista con la ficha dentro en algún sitio.
 *
 * ## Es UNA función, no una por pantalla
 *
 * Las tres pantallas hacen lo mismo y cada una lo haría distinto: la de
 * clientes abriendo su diálogo, la de tickets su detalle, la de tareas su
 * ficha. Lo que NO puede variar son las tres reglas de abajo, y con la regla
 * copiada en cada pantalla la tercera se equivoca — y equivocarse aquí no se
 * ve como un error, se ve como un enlace que no lleva a ningún sitio.
 *
 * 1. **Solo la primera vez.** Sin el guardián, cada repintado volvería a abrir
 *    la misma ficha y no se podría navegar a ninguna otra. Es la misma regla
 *    que el salto de la campanita al mensaje de un canal.
 * 2. **Se espera a que la lista esté cargada.** Buscando antes, el id no está
 *    todavía y el aterrizaje se daría por fallido con la ficha perfectamente
 *    disponible un segundo después.
 * 3. **Y si no se encuentra, se DICE.** Una pantalla que se abre en su lista de
 *    siempre después de pulsar un enlace no se lee como «ya no está»: se lee
 *    como que el enlace no funciona, que es el fallo mudo del que va medio este
 *    repositorio.
 */
export function useAterrizajeDeMencion({
    clave,
    listo,
    aterrizar,
    queEs,
}: {
    /** El parámetro de la URL: `cliente`, `tarea` o `ticket`. */
    clave: string;
    /** Si ya hay con qué buscar. Mientras sea `false` no se intenta nada. */
    listo: boolean;
    /** Abre la ficha. Devuelve `false` si ese id no está en la lista. */
    aterrizar: (id: string) => boolean;
    /** Cómo se llama en el aviso: «esa tarea», «ese ticket». */
    queEs: string;
}) {
    const parametros = useSearchParams();
    const yaAterrizo = useRef(false);

    // Por referencia: `aterrizar` llega nueva en cada pintado del padre y
    // ponerla en las dependencias volvería a disparar el efecto sin parar.
    const aterrizarRef = useRef(aterrizar);
    aterrizarRef.current = aterrizar;

    useEffect(() => {
        if (yaAterrizo.current || !listo) return;
        const pedido = (parametros.get(clave) || "").trim();
        if (!pedido) return;

        yaAterrizo.current = true;
        if (aterrizarRef.current(pedido)) return;

        console.warn("[aterrizaje] se pidió algo que no está en la lista", {
            clave,
            pedido,
        });
        toast.error(`No se encontró ${queEs}. Puede que se haya borrado.`);
    }, [parametros, clave, listo, queEs]);
}
