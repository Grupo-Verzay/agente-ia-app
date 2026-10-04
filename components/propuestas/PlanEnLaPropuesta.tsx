"use client";

import {
    BloqueQueIncluye,
    COLOR_DEL_PLAN,
    COLUMNAS_DE_CAPACIDAD,
    MarcoDelVideo,
    RecuadrosDeCapacidad,
    VERDE_DEL_BOTON,
} from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { VideoDelPlan } from "@/components/planes/VideoDelPlan";
import { Button } from "@/components/ui/button";
import { estaEnUnMarco, recordarLaAsistencia } from "@/lib/enlaces-de-planes";
import { elTextoDelPrecioDelPlan, type PlanDeLaPropuesta } from "@/lib/plan-de-la-propuesta";
import { cn } from "@/lib/utils";

/**
 * Un plan del panel de Planes DENTRO de una propuesta, con las MISMAS piezas
 * de su página pública (`PlanDetailPage`): el video con su título, los
 * recuadros de capacidad, «Qué incluye este plan» con su acordeón entero y,
 * al final, el precio con el botón «Comenzar con el plan».
 *
 * Lo que NO entra, a propósito: «Para quién es», «Un caso típico», las
 * preguntas frecuentes y la línea hacia el plan superior. Y nada saca al
 * cliente de la propuesta: los tutoriales de fuera no se ofrecen
 * (`enLaPropuesta`), las guías se despliegan aquí mismo sin sus enlaces de
 * salida, y el botón de comenzar abre el registro en OTRA pestaña, así la
 * propuesta se queda abierta detrás.
 *
 * Los colores son los tokens `--plan-*`: la propuesta los pone con
 * `data-tema-del-plan="dispositivo"`, que sigue el modo claro u oscuro del
 * dispositivo del cliente.
 */
export function PlanEnLaPropuesta({ plan }: { plan: PlanDeLaPropuesta }) {
    const gradiente = COLOR_DEL_PLAN[plan.plan ?? ""] ?? "from-blue-500 to-blue-600";
    const capacidad = plan.capacidad ?? [];
    const funciones = plan.funciones ?? [];
    const boton = plan.boton ?? null;

    return (
        <div data-plan-en-la-propuesta={plan.llave} className="space-y-8">
            {plan.video ? (
                <div data-video-del-plan>
                    <MarcoDelVideo titulo={plan.video.titulo} gradiente={gradiente}>
                        <VideoDelPlan video={plan.video} />
                    </MarcoDelVideo>
                </div>
            ) : null}

            {capacidad.length > 0 ? (
                <div
                    data-capacidad-del-plan
                    className={cn("grid gap-4", COLUMNAS_DE_CAPACIDAD[capacidad.length] ?? "sm:grid-cols-3")}
                >
                    <RecuadrosDeCapacidad capacidad={capacidad} />
                </div>
            ) : null}

            {funciones.length > 0 ? <BloqueQueIncluye funciones={funciones} enLaPropuesta /> : null}

            {plan.precio ? (
                <div data-comenzar-el-plan className="text-center">
                    <p
                        data-precio-del-plan
                        className={cn("font-bold text-plan-tinta", plan.precio.aConsultar ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl")}
                    >
                        {elTextoDelPrecioDelPlan(plan.precio)}
                    </p>
                    {boton ? (
                        <div className="mt-6 flex justify-center">
                            <a
                                href={boton.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-boton-del-plan
                                onClick={() => recordarLaAsistencia(plan.tipo, { entreSitios: estaEnUnMarco() })}
                                className="w-full sm:w-auto"
                            >
                                <Button
                                    size="lg"
                                    tabIndex={-1}
                                    className={cn("w-full border-0 px-8 text-base font-semibold text-white sm:w-auto", VERDE_DEL_BOTON)}
                                >
                                    {boton.texto}
                                </Button>
                            </a>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
