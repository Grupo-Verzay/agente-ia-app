"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NivelesDeAcceso } from "@/components/shared/NivelesDeAcceso";
import type { NivelDeAcceso } from "@/lib/niveles-de-acceso";
import { loQueSeOfreceParaCompartir, type Compartible } from "@/lib/documentacion";
import {
    leerLosPermisosAction,
    loQueSePuedeCompartirAction,
    ponerPermisoAction,
    quitarPermisoAction,
    restringirDocumentoAction,
    type PermisoConNombre,
} from "@/actions/documentacion-actions";

/**
 * Con quién del EQUIPO se comparte un espacio o un documento.
 *
 * ## Personas aquí; cuentas, en el otro diálogo
 *
 * Y el reparto no es cosmético. Antes esta lista mezclaba personas y cuentas, y
 * eso es pedirle a quien reparte que adivine la diferencia: con una cuenta
 * entra su equipo ENTERO —que es lo que hace falta para dárselo a un cliente,
 * porque quien comparte no administra ese equipo y no puede acordarse de añadir
 * a cada uno que entre después— y con una persona, solo ella.
 *
 * Ahora son dos puertas con dos públicos:
 *
 * | | quién | con qué |
 * | --- | --- | --- |
 * | **este diálogo** | las PERSONAS de la familia | tres niveles, como Notas |
 * | `CompartirConCuentasDialog` | otras CUENTAS | el de Proyectos y Diagramas |
 *
 * Las dos escriben en `doc_permisos` y las dos pasan por `accesoAEsteEspacio` /
 * `accesoAEsteDocumento`: la puerta de este módulo es más estrecha que la del
 * resto de la App y **lo compartido no se la salta**.
 *
 * ## Los tres niveles, y por qué la papelera se fue
 *
 * Quitar el acceso era una papelera al final de la fila, o sea un sitio
 * distinto para deshacer lo que se acaba de hacer dos centímetros a la
 * izquierda. Ahora «Sin acceso» es **uno de los tres botones**
 * (`components/shared/NivelesDeAcceso.tsx`, el mismo control que Notas) y
 * elegirlo borra la fila — porque «sin acceso» no es un permiso, es que no haya
 * ninguno.
 *
 * De ahí sale un cambio que conviene saber: **el buscador ya NO ofrece a quien
 * ya tiene acceso**. La razón por la que antes sí lo ofrecía —marcado con «Ya
 * tiene acceso»— era que la lista de arriba solo sabía quitar, así que
 * esconderlo dejaba sin forma de pasar de lectura a edición. Con los tres
 * niveles en cada fila esa razón desapareció, y ofrecer dos veces a la misma
 * persona es dar dos sitios para lo mismo.
 */

export function PermisosDelObjeto({
    objetoTipo,
    objetoId,
    nombre,
    restringido,
    alCerrar,
    alCambiarRestringido,
}: {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    nombre: string;
    restringido?: boolean;
    alCerrar: () => void;
    alCambiarRestringido?: (valor: boolean) => void;
}) {
    const [filas, setFilas] = useState<PermisoConNombre[] | null>(null);
    const [candidatos, setCandidatos] = useState<Compartible[] | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [guardando, setGuardando] = useState<string | null>(null);

    const recargar = async () => {
        try {
            const res = await leerLosPermisosAction({ objetoTipo, objetoId });
            if (res.success) setFilas(res.data);
            else toast.error(res.message);
        } catch (error) {
            console.warn("[documentacion] no se pudieron leer los permisos", error);
            toast.error("No se pudieron leer los permisos.");
        }
    };

    useEffect(() => {
        void recargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objetoTipo, objetoId]);

    // La lista se pide UNA vez al abrir y se filtra en el navegador. Una
    // consulta por letra tecleada sería decenas de peticiones para recorrer una
    // lista que cabe entera —es lo que ya hace el diálogo de compartir de
    // Proyectos y Diagramas—.
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const res = await loQueSePuedeCompartirAction({ objetoTipo, objetoId });
                if (!vivo) return;
                if (res.success) setCandidatos(res.data);
                else {
                    setCandidatos([]);
                    toast.error(res.message);
                }
            } catch (error) {
                console.warn("[documentacion] no se pudo leer con quién compartir", error);
                // La lista deja de decir «Cargando…» aunque no llegue nada: un
                // «Cargando…» para siempre no se lee como un fallo, se lee como
                // que la App se quedó pensando.
                if (vivo) setCandidatos([]);
                toast.error("No se pudo leer la lista de personas.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [objetoTipo, objetoId]);

    /** Solo las personas: las cuentas se reparten en el otro diálogo. */
    const personas = (candidatos ?? []).filter((c) => c.sujetoTipo === "persona");
    const concedidas = (filas ?? []).filter((f) => f.sujetoTipo === "persona");

    const ofrecidos = loQueSeOfreceParaCompartir(
        personas,
        concedidas.map((f) => ({
            sujetoTipo: f.sujetoTipo,
            sujetoId: f.sujetoId,
            permiso: f.permiso,
        })),
        busqueda,
    ).filter((c) => !c.yaTiene);

    /** Un solo camino para los tres niveles: poner, cambiar y quitar. */
    const cambiarNivel = async (sujetoId: string, nivel: NivelDeAcceso) => {
        setGuardando(sujetoId);
        try {
            const res =
                nivel === "ninguno"
                    ? await quitarPermisoAction({
                          objetoTipo,
                          objetoId,
                          sujetoTipo: "persona",
                          sujetoId,
                      })
                    : await ponerPermisoAction({
                          objetoTipo,
                          objetoId,
                          sujetoTipo: "persona",
                          sujetoId,
                          permiso: nivel,
                      });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setBusqueda("");
            await recargar();
        } catch (error) {
            console.warn("[documentacion] no se pudo cambiar el acceso", error);
            toast.error("No se pudo cambiar el acceso.");
        } finally {
            setGuardando(null);
        }
    };

    const cambiarRestringido = async (valor: boolean) => {
        try {
            const res = await restringirDocumentoAction({ id: objetoId, restringido: valor });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            alCambiarRestringido?.(valor);
        } catch (error) {
            console.warn("[documentacion] no se pudo cambiar el acceso", error);
            toast.error("No se pudo cambiar el acceso.");
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Compartir «{nombre}» con el equipo</DialogTitle>
                    <DialogDescription>
                        Cada persona con su nivel. Para dárselo a otra cuenta entera —y a su
                        equipo— usa «Compartir con otra cuenta».
                    </DialogDescription>
                </DialogHeader>

                {objetoTipo === "documento" && (
                    <label className="flex items-start gap-2 rounded border p-2 text-sm">
                        <input
                            type="checkbox"
                            checked={Boolean(restringido)}
                            onChange={(e) => void cambiarRestringido(e.target.checked)}
                            className="mt-1"
                        />
                        <span>
                            Restringido dentro de su espacio
                            <span className="block text-xs text-muted-foreground">
                                Deja de verse para quien llegaba por el espacio —también en el
                                árbol, no solo al abrirlo— y solo entran quien lo escribió, quien
                                administra la cuenta y quien esté en la lista de abajo.
                            </span>
                        </span>
                    </label>
                )}

                {/* `min-w-0` en los dos bloques, y NO es decoración: los hijos
                    de `DialogContent` son celdas de un `grid`, y una celda se
                    mide por su contenido mínimo. El nombre de una persona va con
                    `truncate` —o sea sin cortes de línea—, así que su mínimo es
                    el nombre ENTERO: medido en Chromium a 390 px, el bloque
                    salía de 565 dentro de un diálogo de 390. `min-w-0` en el
                    hijo del flex no basta; hace falta aquí. */}
                <div className="max-h-[40vh] min-w-0 overflow-y-auto">
                    {filas === null ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
                    ) : concedidas.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Todavía no se comparte con nadie del equipo.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {concedidas.map((f) => (
                                <li
                                    key={f.sujetoId}
                                    className="flex min-w-0 flex-col gap-2 rounded border p-2"
                                >
                                    <div className="flex min-w-0 items-center gap-2 text-sm">
                                        <User className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate">
                                            {f.sujetoNombre ?? f.sujetoId}
                                        </span>
                                    </div>
                                    <NivelesDeAcceso
                                        valor={f.permiso}
                                        deshabilitado={guardando === f.sujetoId}
                                        alElegir={(nivel) => void cambiarNivel(f.sujetoId, nivel)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
                    <Label htmlFor="permiso-buscar">Añadir a alguien</Label>

                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="permiso-buscar"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Busca a una persona por su nombre"
                            className="pl-8"
                            autoComplete="off"
                        />
                    </div>

                    {/* La lista no se esconde al perder el foco: sin popover no
                        hay carrera entre el `blur` y el `click`, que es lo que
                        obliga al selector de menciones a usar `onMouseDown`. */}
                    <ul className="max-h-40 overflow-y-auto rounded border">
                        {ofrecidos.length === 0 ? (
                            <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                                {candidatos === null
                                    ? "Cargando…"
                                    : personas.length === 0
                                      ? "No hay ninguna persona que ofrecer."
                                      : "Nadie con ese nombre."}
                            </li>
                        ) : (
                            ofrecidos.map((c) => (
                                <li key={c.sujetoId}>
                                    <button
                                        type="button"
                                        // Elegir a alguien le da LECTURA en el
                                        // acto y aparece arriba, donde se le
                                        // sube a edición si hace falta. Un
                                        // selector de permiso aquí abajo sería
                                        // un segundo sitio para lo mismo.
                                        onClick={() => void cambiarNivel(c.sujetoId, "lectura")}
                                        disabled={guardando === c.sujetoId}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                                    >
                                        <User className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate">
                                            {c.etiqueta}
                                            {c.detalle && (
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {c.detalle}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
