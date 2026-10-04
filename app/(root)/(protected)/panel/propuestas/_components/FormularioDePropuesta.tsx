"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Plus, Trash2, X } from "lucide-react";
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
    comoSlug,
    MINIMO_DE_SLUG,
    TOPE_DE_SLUG,
    type Propuesta,
    type TipoDeItems,
    type VisibilidadDeNota,
} from "@/lib/propuestas";
import { conLaFilaCargada, conLaPlantillaCargada, type PlantillaDePlan } from "@/lib/plantillas-de-planes";
import {
    conElPlan,
    elNombreDeLaAsistencia,
    elNumeroDelNivel,
    elPrecioEnLaMoneda,
    laFilaDelPlan,
    laLlaveDelPlan,
    sinElPlan,
    type PlanParaElegir,
    type RefDePlan,
} from "@/lib/plan-de-la-propuesta";
import { cargarPlanEnLaPropuestaAction } from "@/actions/propuestas-actions";

/** El tope del alcance de un servicio: el mismo `maxLength` del campo. */
const TOPE_DEL_ALCANCE = 3000;

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
    slug: string;
    /**
     * Los planes del panel de Planes que la propuesta lleva: solo su referencia.
     * Al cargar una plantilla enlazada se añade el suyo, y la página pública de
     * la propuesta enseña su video y el enlace a su página leídos al abrirse.
     */
    planes: RefDePlan[];
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
    slug: "",
    planes: [] as RefDePlan[],
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
            planes: [],
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
        slug: p.slug ?? "",
        planes: (p.planes ?? []).map((r) => ({ ...r })),
    };
}

/** Cómo se nombra un plan en el formulario: con su nombre del panel, o con su nivel si no se sabe. */
function elNombreDelPlanEnElFormulario(ref: RefDePlan, planes: readonly PlanParaElegir[]): string {
    const del = planes.find((p) => laLlaveDelPlan(p.ref) === laLlaveDelPlan(ref));
    const nombre = del ? del.nombre : `Nivel ${elNumeroDelNivel(ref.nivel)}`;
    return `${nombre} · ${elNombreDeLaAsistencia(ref.asistencia)}${del && !del.activo ? " (apagado)" : ""}`;
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
    origen = "",
    plantillas = [],
    planesDelPanel = [],
    guardando,
    onCerrar,
    onGuardar,
}: {
    abierto: boolean;
    propuesta: Propuesta | null;
    lineas: LineaDelFormulario[];
    /** Para enseñar el enlace como va a quedar. */
    origen?: string;
    plantillas?: PlantillaDePlan[];
    /** Los planes del panel de Planes, para nombrar los que lleva la propuesta. */
    planesDelPanel?: PlanParaElegir[];
    guardando: boolean;
    onCerrar: () => void;
    onGuardar: (b: BorradorDePropuesta) => void;
}) {
    const [b, setB] = useState<BorradorDePropuesta>(() => borradorDe(propuesta));
    // Cargar un plan enlazado pide el plan al servidor: mientras va, el selector
    // se apaga, y lo que vuelve se aplica sobre el borrador de ESE momento.
    const [cargandoPlan, setCargandoPlan] = useState(false);
    const bRef = useRef(b);
    bRef.current = b;
    // Una respuesta de una apertura anterior no pinta sobre la siguiente.
    const aperturaRef = useRef(0);

    // Cada apertura empieza de la propuesta que se abre, no del borrador de la anterior.
    useEffect(() => {
        if (abierto) {
            aperturaRef.current += 1;
            setCargandoPlan(false);
            setB(borradorDe(propuesta));
        }
    }, [abierto, propuesta]);

    const total = useMemo(
        () => elTotal(b.servicios.map((s) => ({ inversion: comoImporte(s.inversion) ?? 0 }))),
        [b.servicios],
    );

    const rotulos = losRotulosDeItems(b.tipoDeItems);
    const Rotulo = rotulos.singular.charAt(0).toUpperCase() + rotulos.singular.slice(1);
    // Una propuesta vieja puede apuntar a una línea que ya no está: se enseña
    // igual, para que se vea y se pueda cambiar, en vez de vaciarla callando.
    const slugLimpio = comoSlug(b.slug);
    const host = origen.replace(/^https?:\/\//, "").replace(/\/+$/, "");
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
        if (plantilla.plan) {
            void cargarPlanEnlazado(plantilla);
            return;
        }
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

    /**
     * Una plantilla ENLAZADA a un plan del panel de Planes: el plan se lee HOY
     * en el servidor (`cargarPlanEnLaPropuestaAction`) y entra como una fila más
     * —nombre, precio en la moneda de la propuesta, créditos, catálogo,
     * asistencia y «Qué incluye»—, y su referencia se añade a `planes`, que es
     * lo que hace que la página pública enseñe su video y el enlace a su página.
     */
    const cargarPlanEnlazado = async (plantilla: PlantillaDePlan) => {
        const apertura = aperturaRef.current;
        setCargandoPlan(true);
        let r: Awaited<ReturnType<typeof cargarPlanEnLaPropuestaAction>>;
        try {
            r = await cargarPlanEnLaPropuestaAction(plantilla.id);
        } catch (e) {
            console.error("[propuestas] la carga del plan no llegó al servidor", e);
            r = { success: false, message: "No se pudo leer el plan. Revisa la conexión." };
        }
        if (apertura !== aperturaRef.current) return;
        setCargandoPlan(false);
        if (!r.success) {
            toast.error(r.message);
            return;
        }
        const { plan, avisos } = r.data;
        const actual = bRef.current;
        const sinNada = actual.servicios.every((s) => !s.nombre.trim() && !s.alcance.trim() && !s.inversion.trim());
        const moneda = sinNada ? plantilla.moneda : actual.moneda;
        const fila = laFilaDelPlan(plan, moneda, TOPE_DEL_ALCANCE);
        const cargada = conLaFilaCargada(actual.servicios, fila, TOPE_DE_SERVICIOS);
        if (!cargada.cabe) {
            toast.error(`Ya hay ${TOPE_DE_SERVICIOS} ${rotulos.plural.toLowerCase()}: quita alguno antes de cargar otro plan.`);
            return;
        }
        setB((x) => ({ ...x, servicios: cargada.filas, moneda, planes: conElPlan(x.planes, plan.ref) }));
        for (const aviso of avisos) toast.warning(aviso);
        if (elPrecioEnLaMoneda(plan, moneda) === null) {
            toast.warning(`El panel de Planes no tiene el precio de «${plan.nombre}» en ${moneda}: escríbelo a mano.`);
        }
        toast.success(
            plan.enlace
                ? `«${plan.nombre}» cargado del panel de Planes. La propuesta llevará ${plan.video ? "su video y " : ""}el enlace a su página.`
                : `«${plan.nombre}» cargado del panel de Planes.`,
        );
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
                            ? "Quien ya tiene el enlace verá la versión nueva."
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

                    <div className="space-y-1.5" data-campo-slug>
                        <Label htmlFor="propuesta-slug">Enlace personalizado (opcional)</Label>
                        <div className="flex h-10 items-center rounded-md border border-input bg-background pl-3 text-sm">
                            <span className="shrink-0 text-muted-foreground">/propuesta/</span>
                            <Input
                                id="propuesta-slug"
                                value={b.slug}
                                maxLength={TOPE_DE_SLUG * 2}
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(e) => setB((x) => ({ ...x, slug: e.target.value }))}
                                placeholder="clinica-sonrisa"
                                className="h-full min-w-0 border-0 bg-transparent pl-0.5 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground" data-vista-del-enlace>
                            {slugLimpio === null
                                ? `Tiene que tener entre ${MINIMO_DE_SLUG} y ${TOPE_DE_SLUG} letras, números o guiones.`
                                : slugLimpio
                                  ? `Quedará: ${host}/propuesta/${slugLimpio}${propuesta ? " — el enlace con el código sigue funcionando." : ""}`
                                  : "Vacío: se usa un código aleatorio que nadie puede adivinar."}
                        </p>
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
                                    disabled={cargandoPlan}
                                    aria-busy={cargandoPlan}
                                    onChange={(e) => cargarPlantilla(e.target.value)}
                                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                                >
                                    <option value="">{cargandoPlan ? "Leyendo el plan del panel de Planes…" : "Elige una plantilla de plan…"}</option>
                                    {plantillas.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre} · {comoSeLeeElImporte(p.precio, p.moneda)}
                                            {p.plan ? " · panel de Planes" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                        {b.planes.length > 0 ? (
                            <div data-planes-del-formulario className="space-y-1.5 rounded-lg border border-dashed p-3">
                                <p className="text-xs text-muted-foreground">
                                    Al final de la propuesta salen el video y el enlace a la página de cada plan, como estén en
                                    el panel de Planes al abrirla.
                                </p>
                                <ul className="flex flex-wrap gap-2">
                                    {b.planes.map((ref) => (
                                        <li
                                            key={laLlaveDelPlan(ref)}
                                            data-plan-del-formulario={laLlaveDelPlan(ref)}
                                            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-xs"
                                        >
                                            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span>{elNombreDelPlanEnElFormulario(ref, planesDelPanel)}</span>
                                            <button
                                                type="button"
                                                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                                aria-label={`Quitar el enlace a ${elNombreDelPlanEnElFormulario(ref, planesDelPanel)}`}
                                                title="Quitar el video y el enlace de este plan"
                                                onClick={() => setB((x) => ({ ...x, planes: sinElPlan(x.planes, ref) }))}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
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
                                    maxLength={TOPE_DEL_ALCANCE}
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
