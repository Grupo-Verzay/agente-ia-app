"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { sacarDeLaSalaAction, silenciarAAction } from "@/actions/salas-de-video-actions";

/**
 * Silenciar y sacar, desde donde sea.
 *
 * Los dos mandos se ofrecen en **dos sitios** —el recuadro de la persona y la
 * lista de gente del panel— y el camino es UNO. No es comodidad: con el
 * `try`/`catch`, el «no se pudo» y el aviso de que la orden salió escritos en
 * cada sitio, al segundo se le olvida uno de los tres, y eso no se ve como un
 * error: se ve como que «desde el recuadro no avisa» o como un botón que se
 * pulsa cinco veces porque no dice nada.
 *
 * Es el mismo reparto que en el resto del repositorio: la **decisión** de qué
 * se ofrece es pura (`losMandosDeModeracion`), el **camino** es este, y la
 * **puerta** de verdad está en el servidor, que vuelve a comprobar quién
 * modera. Esconder un botón nunca fue la puerta.
 */

export type QueSeModera = "silenciar" | "sacar";

export function useModerarEnLaSala(codigo: string) {
    /**
     * Sobre quién hay algo en vuelo, por su id.
     *
     * Por id y no un booleano suelto: los dos sitios pintan a **varias**
     * personas a la vez, y con un solo booleano moderar a una apagaría los
     * botones de todas — que se lee como que la pantalla se colgó.
     */
    const [ocupadoCon, setOcupadoCon] = useState<string | null>(null);

    const moderar = useCallback(
        async (que: QueSeModera, quien: { id: string; nombre: string }) => {
            if (ocupadoCon) return;
            setOcupadoCon(quien.id);
            try {
                const res =
                    que === "silenciar"
                        ? await silenciarAAction({ codigo, participanteId: quien.id })
                        : await sacarDeLaSalaAction({ codigo, participanteId: quien.id });
                if (!res.success) {
                    toast.error(res.message);
                    return;
                }
                if (que === "silenciar") {
                    // Se dice que la orden salió, porque **no es un
                    // interruptor**: entre pulsar y que esa persona se calle
                    // pasa una vuelta de SU reloj. Sin este aviso, el botón
                    // parece no hacer nada durante dos segundos y se pulsa otra
                    // vez.
                    toast.success(`Se le pidió a ${quien.nombre} que silencie su micrófono.`);
                } else {
                    // Y aquí también, aunque el recuadro desaparezca solo: lo
                    // hace en la vuelta siguiente, y en ese par de segundos un
                    // botón que no dijo nada se vuelve a pulsar.
                    toast.success(`${quien.nombre} salió de la reunión.`);
                }
            } catch (error) {
                console.warn("[sala] no se pudo moderar", { que, error });
                toast.error("No se pudo. Inténtalo otra vez.");
            } finally {
                setOcupadoCon(null);
            }
        },
        [codigo, ocupadoCon],
    );

    return { moderar, ocupadoCon };
}
