"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import {
    comoImporte,
    comoSeLeeElImporte,
    elTotal,
    hoyComoFecha,
    losRotulosDeItems,
    MONEDA_POR_DEFECTO,
    MONEDAS,
    TIPO_DE_ITEMS_POR_DEFECTO,
    TIPOS_DE_ITEMS,
    TOPE_DE_CORREO,
    TOPE_DE_EMPRESA,
    TOPE_DE_MEDIO_DE_PAGO,
    TOPE_DE_METODO_DE_PAGO,
    TOPE_DE_NOTA,
    TOPE_DE_SERVICIOS,
    comoTipoDeItems,
    type Propuesta,
    type TipoDeItems,
    type VisibilidadDeNota,
} from "@/lib/propuestas";
import { conLaPlantillaCargada, type PlantillaDePlan } from "@/lib/plantillas-de-planes";

export type LineaDelFormulario = { instanceName: string; nombre: string; tipo: string };

const SELECTOR = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type ServicioEnEdicion = { nombre: string; alcance: string; inversion: string };

export type BorradorDePropuesta = {
    cliente: string;
    fecha: string;
    moneda: string;
    servicios: ServicioEnEdicion[];
    mantenimientoMensual: string;
    mantenimientoDescripcion: string;
    condiciones: string;
    tipoDeItems: TipoDeItems;
    empresa: string;
    whatsapp: string;
    linea: string;
    correo: string;
    vigencia: string;
    nota: string;
    notaVisibilidad: VisibilidadDeNota;
    metodoPago: string;
    medioPago: string;
};

const CAMPOS_NUEVOS_VACIOS = {
    tipoDeItems: TIPO_DE_ITEMS_POR_DEFECTO,
    empresa: "",
    whatsapp: "",
    linea: "",
    correo: "",
    vigencia: "",
    nota: "",
    notaVisibilidad: "interna" as VisibilidadDeNota,
    metodoPago: "",
    medioPago: "",
};

const SERVICIO_VACIO: ServicioEnEdicion = { nombre: "", alcance: "", inversion: "" };

export function borradorDe(p: Propuesta | null): BorradorDePropuesta {
    if (!p) {
        return {
            cliente: "",
            fecha: hoyComoFecha(),
            moneda: MONEDA_POR_DEFECTO,
            servicios: [{ ...SERVICIO_VACIO }],
            mantenimientoMensual: "",
            mantenimientoDescripcion: "",
            condiciones: "",
            ...CAMPOS_NUEVOS_VACIOS,
        };
    }
    return {
        cliente: p.cliente,
        fecha: p.fecha,
        moneda: p.moneda,
        servicios: p.servicios.length
            ? p.servicios.map((s) => ({ nombre: s.nombre, alcance: s.alcance, inversion: String(s.inversion) }))
            : [{ ...SERVICIO_VACIO }],
        mantenimientoMensual: p.mantenimientoMensual === null ? "" : String(p.mantenimientoMensual),
        mantenimientoDescripcion: p.mantenimientoDescripcion,
        condiciones: p.condiciones,
        tipoDeItems: p.tipoDeItems,
        empresa: p.empresa,
        whatsapp: p.whatsapp ? `+${p.whatsapp}` : "",
        linea: p.linea,
        correo: p.correo,
        vigencia: p.vigencia ?? "",
        nota: p.nota,
        notaVisibilidad: p.notaVisibilidad,
        metodoPago: p.metodoPago,
        medioPago: p.medioPago,
    };
}

/**
 * El formulario de crear y de editar una propuesta: el MISMO para los dos, con
 * la propuesta delante o sin ella. Lo que se valida aquí se vuelve a validar en
 * el servidor (`comoPropuesta`): esto solo evita un viaje para decir lo obvio.
 */
export function FormularioDePropuesta({
    abierto,
    propuesta,
    lineas,
    plantillas = [],
    guardando,
    onCerrar,
    onGuardar,
}: {
    abierto: boolean;
    propuesta: Propuesta | null;
    lineas: LineaDelFormulario[];
    plantillas?: PlantillaDePlan[];
    guardando: boolean;
    onCerrar: () => void;
    onGuardar: (b: BorradorDePropuesta) => void;
}) {
    const [b, setB] = useState<BorradorDePropuesta>(() => borradorDe(propuesta));

    // Cada apertura empieza de la propuesta que se abre, no del borrador de la anterior.
    useEffect(() => {
        if (abierto) setB(borradorDe(propuesta));
    }, [abierto, propuesta]);

    const total = useMemo(
        () => elTotal(b.servicios.map((s) => ({ inversion: comoImporte(s.inversion) ?? 0 }))),
        [b.servicios],
    );

    const rotulos = losRotulosDeItems(b.tipoDeItems);
    const Rotulo = rotulos.singular.charAt(0).toUpperCase() + rotulos.singular.slice(1);
    // Una propuesta vieja puede apuntar a una línea que ya no está: se enseña
    // igual, para que se vea y se pueda cambiar, en vez de vaciarla callando.
    const lineaPerdida = b.linea && !lineas.some((l) => l.instanceName === b.linea) ? b.linea : null;

    /**
     * Carga una PLANTILLA DE PLAN en la sección de servicios o productos. Es una
     * copia (`conLaPlantillaCargada`): lo cargado se edita aquí sin tocar la
     * plantilla. Las filas en blanco se sustituyen y lo ya escrito se conserva.
     * La moneda del plan solo se adopta si no había nada escrito: con filas en
     * otra moneda se avisa en vez de cambiarlas por debajo.
     */
    const cargarPlantilla = (id: string) => {
        const plantilla = plantillas.find((p) => p.id === id);
        if (!plantilla) return;
        const r = conLaPlantillaCargada(b.servicios, plantilla, TOPE_DE_SERVICIOS);
        if (!r.cabe) {
            toast.error(`Ya hay ${TOPE_DE_SERVICIOS} ${rotulos.plural.toLowerCase()}: quita alguno antes de cargar otro plan.`);
            return;
        }
        const sinNada = b.servicios.every((s) => !s.nombre.trim() && !s.alcance.trim() && !s.inversion.trim());
        if (!sinNada && plantilla.moneda !== b.moneda) {
            toast.warning(`El plan «${plantilla.nombre}» está en ${plantilla.moneda} y la propuesta en ${b.moneda}: revisa el importe.`);
        }
        setB((x) => ({ ...x, servicios: r.filas, moneda: sinNada ? plantilla.moneda : x.moneda }));
    };

    const cambiarServicio = (i: number, campo: keyof ServicioEnEdicion, valor: string) =>
        setB((x) => ({ ...x, servicios: x.servicios.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)) }));

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onCerrar()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{propuesta ? "Editar propuesta" : "Nueva propuesta"}</DialogTitle>
                    <DialogDescription>
                        {propuesta
                            ? "El enlace público no cambia: quien ya lo tiene verá la versión nueva."
                            : "Al crearla se genera su página pública con un enlace propio."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    id="formulario-de-propuesta"
                    className="space-y-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onGuardar(b);
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-cliente">Cliente</Label>
                            <Input
                                id="propuesta-cliente"
                                value={b.cliente}
                                maxLength={120}
                                onChange={(e) => setB((x) => ({ ...x, cliente: e.target.value }))}
                                placeholder="Nombre del cliente"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-empresa">Empresa (opcional)</Label>
                            <Input
                                id="propuesta-empresa"
                                value={b.empresa}
                                maxLength={TOPE_DE_EMPRESA}
                                onChange={(e) => setB((x) => ({ ...x, empresa: e.target.value }))}
                                placeholder="Empresa del cliente"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-whatsapp">WhatsApp del cliente (opcional)</Label>
                            <Input
                                id="propuesta-whatsapp"
                                value={b.whatsapp}
                                inputMode="tel"
                                maxLength={24}
                                onChange={(e) => setB((x) => ({ ...x, whatsapp: e.target.value }))}
                                placeholder="+57 300 123 4567"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-correo">Correo de contacto (opcional)</Label>
                            <Input
                                id="propuesta-correo"
                                type="email"
                                value={b.correo}
                                maxLength={TOPE_DE_CORREO}
                                onChange={(e) => setB((x) => ({ ...x, correo: e.target.value }))}
                                placeholder="cliente@empresa.com"
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-fecha">Fecha</Label>
                            <Input
                                id="propuesta-fecha"
                                type="date"
                                value={b.fecha}
                                onChange={(e) => setB((x) => ({ ...x, fecha: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-vigencia">Vigente hasta (opcional)</Label>
                            <Input
                                id="propuesta-vigencia"
                                type="date"
                                value={b.vigencia}
                                min={b.fecha || undefined}
                                onChange={(e) => setB((x) => ({ ...x, vigencia: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-moneda">Moneda</Label>
                            <select
                                id="propuesta-moneda"
                                value={b.moneda}
                                onChange={(e) => setB((x) => ({ ...x, moneda: e.target.value }))}
                                className={SELECTOR}
                            >
                                {MONEDAS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="propuesta-linea">Línea de WhatsApp desde la que se envía (opcional)</Label>
                        <select
                            id="propuesta-linea"
                            value={b.linea}
                            onChange={(e) => setB((x) => ({ ...x, linea: e.target.value }))}
                            className={SELECTOR}
                        >
                            <option value="">Sin línea</option>
                            {lineas.map((l) => (
                                <option key={l.instanceName} value={l.instanceName}>
                                    {l.nombre}
                                </option>
                            ))}
                            {lineaPerdida ? <option value={lineaPerdida}>{lineaPerdida} (ya no está)</option> : null}
                        </select>
                        {lineas.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Esta cuenta no tiene líneas de WhatsApp conectadas.</p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="propuesta-tipo-items">Título de la sección</Label>
                                <select
                                    id="propuesta-tipo-items"
                                    value={b.tipoDeItems}
                                    onChange={(e) => setB((x) => ({ ...x, tipoDeItems: comoTipoDeItems(e.target.value) }))}
                                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                >
                                    {TIPOS_DE_ITEMS.map((t) => (
                                        <option key={t} value={t}>
                                            {losRotulosDeItems(t).plural}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                Total: <span data-total-del-formulario className="font-medium text-foreground">{comoSeLeeElImporte(total, b.moneda)}</span>
                            </span>
                        </div>
                        {plantillas.length > 0 ? (
                            <div className="flex items-center gap-2">
                                <Label htmlFor="propuesta-cargar-plan" className="shrink-0">
                                    Cargar plan
                                </Label>
                                <select
                                    id="propuesta-cargar-plan"
                                    data-cargar-plan
                                    value=""
                                    onChange={(e) => cargarPlantilla(e.target.value)}
                                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                                >
                                    <option value="">Elige una plantilla de plan…</option>
                                    {plantillas.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre} · {comoSeLeeElImporte(p.precio, p.moneda)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                        {b.servicios.map((s, i) => (
                            <div key={i} data-servicio-del-formulario className="space-y-2 rounded-lg border p-3">
                                <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
                                    <Input
                                        aria-label={`${Rotulo} ${i + 1}`}
                                        value={s.nombre}
                                        maxLength={150}
                                        onChange={(e) => cambiarServicio(i, "nombre", e.target.value)}
                                        placeholder={`${Rotulo} ${i + 1}`}
                                    />
                                    <Input
                                        aria-label={`Inversión del ${rotulos.singular} ${i + 1}`}
                                        value={s.inversion}
                                        inputMode="decimal"
                                        onChange={(e) => cambiarServicio(i, "inversion", e.target.value)}
                                        placeholder="Inversión"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                                        disabled={b.servicios.length === 1}
                                        onClick={() =>
                                            setB((x) => ({ ...x, servicios: x.servicios.filter((_, j) => j !== i) }))
                                        }
                                        aria-label={`Quitar el ${rotulos.singular} ${i + 1}`}
                                        title={`Quitar ${rotulos.singular}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Textarea
                                    aria-label={`Alcance del ${rotulos.singular} ${i + 1}`}
                                    value={s.alcance}
                                    maxLength={3000}
                                    rows={3}
                                    onChange={(e) => cambiarServicio(i, "alcance", e.target.value)}
                                    placeholder={`Alcance: qué incluye este ${rotulos.singular}`}
                                />
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={b.servicios.length >= TOPE_DE_SERVICIOS}
                            onClick={() => setB((x) => ({ ...x, servicios: [...x.servicios, { ...SERVICIO_VACIO }] }))}
                        >
                            <Plus className="mr-1 h-4 w-4" /> Añadir {rotulos.singular}
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-mantenimiento">Mantenimiento mensual</Label>
                            <Input
                                id="propuesta-mantenimiento"
                                value={b.mantenimientoMensual}
                                inputMode="decimal"
                                onChange={(e) => setB((x) => ({ ...x, mantenimientoMensual: e.target.value }))}
                                placeholder="Vacío = sin mantenimiento"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-mantenimiento-desc">Qué incluye el mantenimiento</Label>
                            <Textarea
                                id="propuesta-mantenimiento-desc"
                                value={b.mantenimientoDescripcion}
                                maxLength={1000}
                                rows={2}
                                onChange={(e) => setB((x) => ({ ...x, mantenimientoDescripcion: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="propuesta-condiciones">Condiciones</Label>
                        <Textarea
                            id="propuesta-condiciones"
                            value={b.condiciones}
                            maxLength={8000}
                            rows={4}
                            onChange={(e) => setB((x) => ({ ...x, condiciones: e.target.value }))}
                            placeholder="Forma de pago, tiempos de entrega, garantías…"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="propuesta-nota">Nota adicional (opcional)</Label>
                            <select
                                id="propuesta-nota-visibilidad"
                                aria-label="Quién ve la nota"
                                value={b.notaVisibilidad}
                                onChange={(e) =>
                                    setB((x) => ({ ...x, notaVisibilidad: e.target.value === "publica" ? "publica" : "interna" }))
                                }
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                                <option value="interna">Interna (solo el equipo)</option>
                                <option value="publica">Pública (la ve el cliente)</option>
                            </select>
                        </div>
                        <Textarea
                            id="propuesta-nota"
                            value={b.nota}
                            maxLength={TOPE_DE_NOTA}
                            rows={3}
                            onChange={(e) => setB((x) => ({ ...x, nota: e.target.value }))}
                            placeholder={
                                b.notaVisibilidad === "publica"
                                    ? "Se enseña en la página del cliente."
                                    : "Solo la ve el equipo en el panel; el cliente no."
                            }
                        />
                    </div>

                    {/* Información de pago: el mismo par que en Instancias, sin
                        días de licencia ni vencimientos — aquí el cliente todavía
                        no ha contratado. */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-metodo-pago">Método de pago (opcional)</Label>
                            <Input
                                id="propuesta-metodo-pago"
                                value={b.metodoPago}
                                maxLength={TOPE_DE_METODO_DE_PAGO}
                                onChange={(e) => setB((x) => ({ ...x, metodoPago: e.target.value }))}
                                placeholder="Ej: Transferencia / Nequi / Stripe"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-medio-pago">Medio de pago (opcional)</Label>
                            <Textarea
                                id="propuesta-medio-pago"
                                value={b.medioPago}
                                maxLength={TOPE_DE_MEDIO_DE_PAGO}
                                rows={2}
                                onChange={(e) => setB((x) => ({ ...x, medioPago: e.target.value }))}
                                placeholder="Número de cuenta, enlace de pago…"
                            />
                        </div>
                    </div>
                </form>

                {/* Los botones son hijos DIRECTOS del pie: es `justify-between`. */}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="formulario-de-propuesta" disabled={guardando}>
                        {guardando ? "Guardando…" : propuesta ? "Guardar" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
