// El arnés de «Resumen anual por mes» de Finanzas: DOS rejillas de doce meses
// con la casilla de verdad (`MesDelResumenAnual`) —o la de antes, según el
// alias con el que se empaquete (ver scripts/banco-resumen-anual-oscuro.sh)—,
// dentro de la misma envoltura que en la App: el `main` con `themeClass` y la
// caja `app-module-content`, y la `Card` de siempre, que es de donde hereda el
// número su color.
//
// Rejilla A: el mes elegido va en positivo (marzo). Rejilla B: el mes elegido
// va en NEGATIVO (mayo). Febrero y mayo van en pérdidas en las dos.
import React from "react";
import { createRoot } from "react-dom/client";
import { Card, CardContent } from "@/components/ui/card";
import { themeClass } from "@/types/generic";
// @ts-expect-error: lo resuelve el alias del banco (ahora o antes).
import { MesDelResumenAnual } from "@mes-del-resumen";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];
const EN_PERDIDAS = new Set([1, 4]);

const formato = (n: number) => new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n);

function losMeses(elegido: number) {
    return MESES.map((label, i) => {
        const sales = EN_PERDIDAS.has(i) ? 400000 : 1650000;
        const expenses = 750000;
        return {
            key: `2026-${String(i + 1).padStart(2, "0")}`, label, sales, expenses,
            balance: sales - expenses, active: i === elegido,
        };
    });
}

function Rejilla({ id, elegido }: { id: string; elegido: number }) {
    return (
        <Card className="border-border">
            <CardContent className="px-2 pb-2 pt-0">
                <div data-rejilla={id} className="grid grid-cols-2 overflow-hidden rounded-md border border-border sm:grid-cols-3 lg:grid-cols-6">
                    {losMeses(elegido).map((mes) => (
                        <MesDelResumenAnual key={mes.key} mes={mes}
                            href={`/dashboard/finance?month=${mes.key}`} formato={formato} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

createRoot(document.getElementById("app")!).render(
    <main className={`min-h-screen ${themeClass}`}>
        <div className="app-module-content space-y-2 p-2">
            <Rejilla id="A" elegido={2} />
            <Rejilla id="B" elegido={4} />
        </div>
    </main>,
);
(window as any).listo = true;
