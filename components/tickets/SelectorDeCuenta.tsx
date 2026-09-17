"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Sin tildes y en minúsculas, para buscar "Audífonos" escribiendo "audifonos". */
function normalizar(texto: string) {
    return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type CuentaElegible = {
    id: string;
    name: string | null;
    email: string;
    company: string;
};

/**
 * Elegir a nombre de qué cuenta se abre el ticket.
 *
 * Busca por **empresa, nombre o correo**, igual que el diálogo de «Compartir»
 * de Diagramas y Proyectos —misma normalización y mismos tres campos—, porque
 * es la misma pregunta: identificar una cuenta entre cuarenta cuando lo único
 * que uno recuerda es un trozo del nombre.
 *
 * No es un `<select>` a propósito: con cuarenta cuentas, un desplegable
 * obliga a recorrerlas a ojo.
 */
export function SelectorDeCuenta({
    cuentas,
    elegida,
    onElegir,
    /** Cómo se llama la opción de no elegir ninguna. */
    etiquetaVacia,
}: {
    cuentas: CuentaElegible[];
    elegida: string | null;
    onElegir: (id: string | null) => void;
    etiquetaVacia: string;
}) {
    const [busqueda, setBusqueda] = useState("");

    const consulta = normalizar(busqueda.trim());
    const visibles = useMemo(
        () =>
            consulta
                ? cuentas.filter((c) =>
                      normalizar(`${c.company} ${c.name ?? ""} ${c.email}`).includes(consulta),
                  )
                : cuentas,
        [cuentas, consulta],
    );

    return (
        <div className="space-y-1.5">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por empresa, nombre o correo…"
                    className="h-9 pl-8"
                />
            </div>

            <div className="max-h-44 overflow-y-auto rounded-lg border border-border/70">
                <Fila
                    activa={!elegida}
                    principal={etiquetaVacia}
                    onClick={() => onElegir(null)}
                />
                {visibles.map((c) => (
                    <Fila
                        key={c.id}
                        activa={elegida === c.id}
                        principal={c.company || c.name || c.email}
                        secundario={c.email}
                        onClick={() => onElegir(c.id)}
                    />
                ))}
                {visibles.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                        {cuentas.length === 0 ? "No hay otras cuentas." : "Nada con esa búsqueda."}
                    </p>
                )}
            </div>
        </div>
    );
}

function Fila({
    activa,
    principal,
    secundario,
    onClick,
}: {
    activa: boolean;
    principal: string;
    secundario?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-0 transition-colors",
                activa ? "bg-primary/10" : "hover:bg-accent",
            )}
        >
            <Building2 className={cn("h-3.5 w-3.5 shrink-0", activa ? "text-primary" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{principal}</span>
                {secundario && (
                    <span className="block truncate text-[11px] text-muted-foreground">{secundario}</span>
                )}
            </span>
            {activa && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </button>
    );
}
