'use client';

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutList, ListChecks } from "lucide-react";
import { guardarIconosDeLaFilaAction, misIconosDeLaFilaAction } from "@/actions/iconos-de-la-fila-actions";
import {
    conElIcono,
    ICONOS_POR_DEFECTO,
    losIconosDelGrupo,
    TARJETAS_DE_ICONOS,
    type ClaveDeIcono,
    type IconosDeLaFila,
} from "@/lib/iconos-de-la-fila";
import { avisarDeLosIconosDeLaFila } from "@/lib/iconos-de-la-fila-evento";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * Perfil › Apariencia: qué pastillas se ven en la fila de cada conversación de
 * Chats, en dos tarjetas lado a lado (prioritarios y secundarios). Una por
 * interruptor, todas encendidas por defecto. Es de la PERSONA: la acción la
 * saca de la sesión. Se pinta al momento y vuelve si no se guarda. Va como dos
 * hijos directos de la rejilla de Apariencia (un fragmento).
 */
export function IconosDeLaFilaCard() {
    const [iconos, setIconos] = useState<IconosDeLaFila>(ICONOS_POR_DEFECTO);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState<ClaveDeIcono | null>(null);

    useEffect(() => {
        let vivo = true;
        misIconosDeLaFilaAction()
            .then((res) => { if (vivo) setIconos(res.iconos); })
            .catch((error) => console.warn("[iconos-de-la-fila] no se pudo leer", String(error)))
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, []);

    const cambiar = async (clave: ClaveDeIcono, visible: boolean) => {
        const antes = iconos;
        const nuevos = conElIcono(antes, clave, visible);
        setIconos(nuevos);
        setGuardando(clave);
        try {
            const res = await guardarIconosDeLaFilaAction(nuevos);
            if (!res.success) {
                setIconos(antes);
                toast.error(res.message || "No se pudo guardar.");
                return;
            }
            setIconos(res.iconos);
            avisarDeLosIconosDeLaFila(res.iconos);
        } catch (error) {
            setIconos(antes);
            toast.error("No se pudo guardar.");
            console.warn("[iconos-de-la-fila] fallo al guardar", String(error));
        } finally {
            setGuardando(null);
        }
    };

    // Su propia fila, a todo el ancho de la rejilla de Apariencia: las dos
    // tarjetas van siempre lado a lado, caiga donde caiga la tarjeta de antes.
    return (
        <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2" data-iconos-de-la-fila>
            {TARJETAS_DE_ICONOS.map((tarjeta) => {
                const Icono = tarjeta.grupo === "prioritarios" ? ListChecks : LayoutList;
                return (
                    <Card
                        key={tarjeta.grupo}
                        className="border-border flex flex-col"
                        data-ajuste-de-iconos-de-la-fila={tarjeta.grupo}
                    >
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icono className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-semibold">{tarjeta.titulo}</CardTitle>
                                    <CardDescription className="text-xs">{tarjeta.detalle}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            {losIconosDelGrupo(tarjeta.grupo).map((icono) => (
                                <div key={icono.clave} className="flex items-start gap-3" data-icono-de-la-fila={icono.clave}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">{icono.titulo}</p>
                                        <p className="text-xs text-muted-foreground">{icono.detalle}</p>
                                    </div>
                                    <Switch
                                        checked={iconos[icono.clave]}
                                        disabled={cargando || guardando !== null}
                                        onCheckedChange={(v) => void cambiar(icono.clave, v)}
                                        className="data-[state=checked]:bg-green-600"
                                        aria-label={icono.titulo}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
