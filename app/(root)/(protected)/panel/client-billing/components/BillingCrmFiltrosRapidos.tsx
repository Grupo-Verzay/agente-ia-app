"use client";

import * as React from "react";
import type { Table } from "@tanstack/react-table";
import { PastillasDeMetricas, type Metrica } from "@/components/shared/PastillasDeMetricas";
import { ClientRow } from "@/types/billing";
import { daysLeftService } from "../helpers";
import { Database, CircleX, UserX, Hourglass } from "lucide-react";

/**
 * Los filtros rápidos de la cartera, en la BARRA y no en tarjetas encima.
 *
 * Esto eran cuatro `Card` a todo lo ancho —«Total», «No pagaron», «En prueba»,
 * «Vence pronto»— en una fila propia por encima del buscador. Y son justo las
 * que hay que conservar: **cada una filtra la tabla de abajo**, así que no son
 * un adorno, son mandos. Lo único que cambia es la forma: pasan a pastillas de
 * icono y número, la misma que ya usan las otras veintidós pantallas.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **El filtro es EXCLUSIVO.** Pulsar una limpia las demás, y volver a
 *    pulsarla deja «Total». Con dos puestas a la vez, la cifra de cada pastilla
 *    —que se calcula sobre los datos SIN filtrar— dejaría de poder alcanzarse
 *    pulsándola, que es la regla de *un filtro que ofrece un número tiene que
 *    poder llegar a él*.
 * 2. **Van `deslizable`.** La barra de esta pantalla ya lleva el buscador,
 *    «Columnas» y «Acciones»; sin el carril, cuatro pastillas más la parten en
 *    dos filas por debajo de 1280, que es exactamente la franja de alto que
 *    esto viene a quitar.
 */
export const BillingCrmFiltrosRapidos = ({
    table,
    data,
    className,
    soonDays,
}: {
    table: Table<ClientRow>;
    data: ClientRow[];
    className?: string;
    soonDays: number;
}) => {
    const paidFilter = table.getColumn("paid")?.getFilterValue() as string | undefined;
    const dueFilter = table.getColumn("due")?.getFilterValue() as string | undefined;

    const total = table.getPreFilteredRowModel().rows.length;

    // Las de prueba no entran en "pagó" ni en "no pagó": no se les ha cobrado
    // nada todavia. Contarlas como morosas hacía ver deuda donde no la hay.
    //
    // No hay pastilla de "Pagaron". Esta pantalla es para perseguir cobros, y el
    // que ya pagó no hay que perseguirlo: ocupaba sitio sin decir qué hacer.
    const unpaidCount = React.useMemo(
        () => data.filter((u) => !u.isDemo && (u.billing?.billingStatus ?? "UNPAID") === "UNPAID").length,
        [data]
    );

    const trialCount = React.useMemo(() => data.filter((u) => u.isDemo).length, [data]);

    const dueSoonCount = React.useMemo(() => {
        return data.filter((u) => {
            const due = u.billing?.dueDate ?? null;
            const left = parseInt(daysLeftService(due));
            return Number.isFinite(left) && left >= 0 && left <= soonDays;
        }).length;
    }, [data, soonDays]);

    const anyQuickFilterActive = !!paidFilter || !!dueFilter;

    function setExclusiveFilter(colId: "paid" | "due", value: string) {
        const col = table.getColumn(colId);
        if (!col) return;

        const curr = col.getFilterValue() as string | undefined;

        // Si ya está activo, se apaga y queda "Total"
        if (curr === value) {
            table.resetColumnFilters();
            return;
        }

        // Limpia TODOS los filtros de columna y aplica solo este
        table.resetColumnFilters();
        col.setFilterValue(value);
    }

    const metricas: Metrica[] = [
        {
            clave: "total",
            icono: <Database />,
            etiqueta: "Total",
            valor: total,
            color: "#3B82F6",
            ayuda: "Toda la cartera, sin filtro.",
            alPulsar: () => table.resetColumnFilters(),
            activa: !anyQuickFilterActive,
        },
        {
            clave: "unpaid",
            icono: <CircleX />,
            etiqueta: "No pagaron",
            valor: unpaidCount,
            color: "#EF4444",
            ayuda: "Cuentas con el cobro pendiente. Las de prueba no entran.",
            alPulsar: () => setExclusiveFilter("paid", "UNPAID"),
            activa: paidFilter === "UNPAID",
        },
        {
            clave: "trial",
            icono: <Hourglass />,
            etiqueta: "En prueba",
            valor: trialCount,
            color: "#F59E0B",
            ayuda: "Todavía no se les ha cobrado nada.",
            alPulsar: () => setExclusiveFilter("paid", "TRIAL"),
            activa: paidFilter === "TRIAL",
        },
        {
            clave: "due-soon",
            icono: <UserX />,
            etiqueta: `Vence pronto (≤ ${soonDays}d)`,
            valor: dueSoonCount,
            color: "#EAB308",
            ayuda: "Les quedan pocos días de servicio.",
            alPulsar: () => setExclusiveFilter("due", "SOON"),
            activa: dueFilter === "SOON",
        },
    ];

    return <PastillasDeMetricas metricas={metricas} className={className} deslizable />;
};
