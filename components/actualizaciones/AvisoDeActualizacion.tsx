'use client';

import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Actualizacion, ComoSeCerro } from '@/lib/actualizaciones';
import {
    marcarActualizacionVistaAction,
    miActualizacionPendienteAction,
} from '@/actions/actualizaciones-actions';
import { ContenidoDeLaActualizacion } from './ContenidoDeLaActualizacion';

/** Cuánto se espera tras abrir la plataforma: que no compita con la carga. */
const ESPERA_AL_ABRIR_MS = 1500;

/**
 * La ventana que salta UNA vez a cada persona con la última actualización.
 *
 * Cuelga del layout, así que sale esté donde esté quien abre la plataforma. Se
 * pregunta UNA vez al montar —ni reloj ni sondeo: la actualización no es un
 * chat, y quien la publicó puede esperar a la próxima apertura de cada uno—.
 *
 * # Cerrarla o verla la marca, y se marca ANTES de cerrarla
 *
 * Las dos salidas —«Cerrar» (y la X, Escape, el clic de fuera) y «Ver
 * completo»— apuntan la vista en el servidor. Se marca al pulsar, no al
 * terminar de ver: una vez que la persona interactuó con la ventana, ya la vio.
 * Y la marca se pide antes de quitar la ventana: si la acción fallara, lo peor
 * es que vuelva a salir en la próxima apertura, nunca que se pierda sin haberla
 * enseñado.
 */
export function AvisoDeActualizacion() {
    const [actualizacion, setActualizacion] = useState<Actualizacion | null>(null);
    const [abierta, setAbierta] = useState(false);
    const [completa, setCompleta] = useState(false);
    const marcada = useRef(false);

    useEffect(() => {
        let vivo = true;
        const t = setTimeout(() => {
            miActualizacionPendienteAction()
                .then((a) => {
                    if (!vivo || !a) return;
                    setActualizacion(a);
                    setAbierta(true);
                })
                .catch((error) => console.warn('[actualizaciones] no se pudo preguntar la pendiente', error));
        }, ESPERA_AL_ABRIR_MS);
        return () => {
            vivo = false;
            clearTimeout(t);
        };
    }, []);

    const marcar = (como: ComoSeCerro) => {
        if (!actualizacion || marcada.current) return;
        marcada.current = true;
        void marcarActualizacionVistaAction(actualizacion.id, como).catch((error) =>
            console.warn('[actualizaciones] no se pudo marcar como vista', error),
        );
    };

    const cerrar = () => {
        marcar('cerrada');
        setAbierta(false);
    };

    const verCompleta = () => {
        marcar('vista');
        setCompleta(true);
    };

    if (!actualizacion) return null;

    return (
        <Dialog open={abierta} onOpenChange={(o) => (o ? setAbierta(true) : cerrar())}>
            <DialogContent
                className={cn('flex flex-col gap-4', completa ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
                data-aviso-de-actualizacion
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                            <Megaphone className="h-4 w-4" />
                        </span>
                        Nueva actualización
                    </DialogTitle>
                    <DialogDescription>
                        {new Date(actualizacion.publicadaEn).toLocaleDateString('es', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })}
                    </DialogDescription>
                </DialogHeader>

                <ContenidoDeLaActualizacion
                    actualizacion={actualizacion}
                    completa={completa}
                    // Pulsar un enlace es haberla leído. Uno de DENTRO navega en
                    // esta pestaña, así que la ventana se cierra: si no, se
                    // quedaría tapando la pantalla a la que lleva.
                    alAbrirUnEnlace={(deDentro) => {
                        marcar('vista');
                        if (deDentro) setAbierta(false);
                    }}
                />

                <DialogFooter>
                    <Button variant="outline" onClick={cerrar} data-boton-cerrar-actualizacion>
                        Cerrar
                    </Button>
                    {!completa && (
                        <Button
                            onClick={verCompleta}
                            className="bg-orange-500 text-white hover:bg-orange-600"
                            data-boton-ver-actualizacion
                        >
                            Ver completo
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
