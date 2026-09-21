"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Area, RolDeDestino } from "@/lib/mudanza-de-persona";
import type { Informe } from "@/lib/mudanza-de-persona-db";
import {
    cuentasParaMudarAction,
    informeDeLaMudanzaAction,
    mudarALaPersonaAction,
} from "@/actions/mudanza-de-persona-actions";

/**
 * Mover a alguien del equipo a otra cuenta de la familia.
 *
 * **El informe no es un paso opcional: es el botón.** Mientras no se haya
 * pedido no hay nada que pulsar, y cambiar la cuenta o el rol lo tira. Sin eso
 * «antes de aplicar nada, un informe» sería una costumbre, y una costumbre se
 * salta el día que hay prisa.
 *
 * Y lo que se enseña son las dos mitades, no solo la buena: lo que viaja con
 * ella —que es casi todo, porque su id no cambia— y lo que **deja de
 * alcanzar**, con los números de su cuenta actual delante.
 */

/** Ninguna llamada puede dejar el botón colgado (ver `components/shared/Carpetas`). */
async function pedir<T>(
    quéEs: string,
    llamada: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
): Promise<{ success: true; data: T } | { success: false; message: string }> {
    try {
        return await llamada();
    } catch (error) {
        console.warn(`[mudanza] ${quéEs} no llegó al servidor`, error);
        return { success: false, message: `No se pudo ${quéEs}. Revisa la conexión.` };
    }
}

const ROTULO: Record<Area, string> = {
    chats: "Chats tomados en las líneas de antes",
    tareas: "Tareas asignadas",
    proyectos: "Proyectos",
    canales_de_area: "Canales de área de la cuenta de antes",
    directos: "Directos del chat de equipo",
    general: "Canal General",
    documentos_de_la_cuenta: "Lo compartido con la cuenta de antes",
    permisos_propios: "Lo compartido con ella",
    cartera: "Clientes asignados",
};

/** Un número que no se pudo contar NO es un cero. */
function cuantos(n: number | null): string {
    return n === null ? "sin contar" : String(n);
}

export function MudarDeCuentaDialog({
    persona,
    onClose,
    onHecho,
}: {
    persona: { id: string; name: string } | null;
    onClose: () => void;
    onHecho: () => void;
}) {
    const [cuentas, setCuentas] = useState<{ id: string; nombre: string }[]>([]);
    const [destino, setDestino] = useState("");
    const [rol, setRol] = useState<RolDeDestino>("agente");
    const [informe, setInforme] = useState<Informe | null>(null);
    const [pidiendo, setPidiendo] = useState(false);
    const [moviendo, setMoviendo] = useState(false);

    const abierto = !!persona;

    useEffect(() => {
        if (!abierto) return;
        setDestino("");
        setRol("agente");
        setInforme(null);
        pedir("leer las cuentas", () => cuentasParaMudarAction(persona?.id)).then((res) => {
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setCuentas(res.data.map((c) => ({ id: c.id, nombre: c.nombre })));
        });
    }, [abierto, persona?.id]);

    // Cambiar la cuenta o el rol TIRA el informe: decía lo que iba a pasar con
    // otros datos, y un informe que ya no corresponde es peor que ninguno.
    useEffect(() => {
        setInforme(null);
    }, [destino, rol]);

    const verQuePasa = async () => {
        if (!persona || !destino) return;
        setPidiendo(true);
        const res = await pedir("pedir el informe", () =>
            informeDeLaMudanzaAction(persona.id, destino, rol),
        );
        setPidiendo(false);
        if (!res.success) {
            toast.error(res.message);
            return;
        }
        setInforme(res.data);
    };

    const mover = async () => {
        if (!persona || !destino || !informe) return;
        setMoviendo(true);
        const res = await pedir("mover a esta persona", () =>
            mudarALaPersonaAction(persona.id, destino, rol),
        );
        setMoviendo(false);
        if (!res.success) {
            toast.error(res.message);
            return;
        }
        toast.success(`${persona.name} ya está en ${informe.destino.nombre}.`);
        onHecho();
        onClose();
    };

    const seMantiene = informe
        ? (Object.keys(informe.areas) as Area[]).filter((a) => informe.areas[a].suerte === "sigue")
        : [];
    const sePierde = informe
        ? (Object.keys(informe.areas) as Area[]).filter(
              (a) => informe.areas[a].suerte === "se_pierde",
          )
        : [];

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Mover a otra cuenta</DialogTitle>
                    <DialogDescription>
                        {persona?.name} pasa a colgar de otra cuenta de la familia. Su id no
                        cambia, así que nada de lo que ha firmado cambia de autor.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label>Cuenta de destino</Label>
                        <Select value={destino} onValueChange={setDestino}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elige una cuenta" />
                            </SelectTrigger>
                            <SelectContent>
                                {cuentas.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nombre}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {cuentas.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                                No hay otras cuentas en esta familia a las que mover a nadie.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label>Rol allí</Label>
                        <Select value={rol} onValueChange={(v) => setRol(v as RolDeDestino)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="agente">Agente</SelectItem>
                                <SelectItem value="administrador">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {informe && (
                        <div className="grid gap-3 rounded-md border p-3 text-sm">
                            <div>
                                <p className="font-medium">Se mueve</p>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                    <li>Su cuenta pasa a {informe.destino.nombre}, como {rol}.</li>
                                    <li>
                                        Clientes asignados: {cuantos(informe.recuento.cartera)}{" "}
                                        pasan a la cuenta nueva.
                                    </li>
                                    <li>
                                        Módulos: se le quitan{" "}
                                        {informe.recuento.modulosQueSeQuitan.length} y se le dan{" "}
                                        {informe.recuento.modulosQueSeDan.length}.
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <p className="font-medium">Va con ella sin tocar nada</p>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                    <li>Notas: {cuantos(informe.recuento.notas)}</li>
                                    <li>
                                        Documentos compartidos con ella:{" "}
                                        {cuantos(informe.recuento.permisosPropios)}
                                    </li>
                                    <li>
                                        Historial de actividad:{" "}
                                        {cuantos(informe.recuento.diasDeActividad)} días
                                    </li>
                                    <li>
                                        Canales donde está:{" "}
                                        {cuantos(informe.recuento.canalesDondeEsta)}
                                    </li>
                                </ul>
                            </div>

                            {sePierde.length > 0 && (
                                <div>
                                    <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-500">
                                        <TriangleAlert className="h-4 w-4" />
                                        Deja de alcanzar
                                    </p>
                                    <ul className="mt-1 space-y-1 text-muted-foreground">
                                        {sePierde.map((a) => (
                                            <li key={a}>
                                                <span className="text-foreground">{ROTULO[a]}</span>
                                                {a === "chats" &&
                                                    ` (${cuantos(informe.recuento.chatsTomados)})`}
                                                {a === "tareas" &&
                                                    ` (${cuantos(informe.recuento.tareasAbiertas)} abiertas)`}
                                                {a === "proyectos" &&
                                                    ` (${cuantos(informe.recuento.proyectos)})`}
                                                {a === "canales_de_area" &&
                                                    ` (${cuantos(informe.recuento.canalesDeAreaDeAntes)})`}
                                                : {informe.areas[a].porque}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {seMantiene.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Sigue alcanzando: {seMantiene.map((a) => ROTULO[a]).join(", ")}.
                                </p>
                            )}

                            {!informe.recuento.mismaFamilia && (
                                <p className="text-xs text-amber-600 dark:text-amber-500">
                                    Las dos cuentas no están vinculadas entre ellas.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    {informe ? (
                        <Button onClick={mover} disabled={moviendo}>
                            {moviendo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {moviendo ? "Moviendo…" : "Mover"}
                        </Button>
                    ) : (
                        <Button onClick={verQuePasa} disabled={!destino || pidiendo}>
                            {pidiendo ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                            )}
                            {pidiendo ? "Mirando…" : "Ver qué va a pasar"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
