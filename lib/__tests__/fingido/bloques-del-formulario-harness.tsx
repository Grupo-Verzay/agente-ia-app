// La pestaña «Página de detalle» de un plan, la de VERDAD, dentro del MISMO
// diálogo que la monta Panel › Planes (que tiene `transform`: lo que flota al
// arrastrar tiene que salir de él por un portal). Las acciones son de mentira
// (`acciones-del-detalle-del-plan.ts`) y el componente llega por el alias
// `pestana-del-detalle`: el de hoy o, en `MODO=roto`, el de antes.
import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { PlanDetailTab } from "pestana-del-detalle";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lasFuncionesQueSeEnsenan, losDatosDelPlan, type FuncionDelPlan } from "@/lib/pagina-de-plan";
import { pedidas } from "@/lib/__tests__/fingido/acciones-del-detalle-del-plan";

const datos = losDatosDelPlan(
    { plan: "basico", name: "Básico", credits: 8000, priceUSD: 49, assistanceType: "IA" },
    ["Básico"],
);
const funcion = (id: string, nombre: string, categoria: string, activa = true): FuncionDelPlan =>
    ({ id, nombre, descripcion: "", categoria, activa, destacada: true, tutorial: "" }) as unknown as FuncionDelPlan;
const funciones = [
    funcion("f1", "Agente de IA entrenado con tu negocio", "incluye"),
    funcion("f2", "Bandeja de chats con asignación", "incluye"),
    funcion("f3", "Función apagada", "incluye", false),
    funcion("f4", "CRM y embudos", "general"),
];
(window as any).pedidas = pedidas;

const props: Record<string, unknown> = {
    subscriptionPlanId: "plan-banco",
    datos,
    enlaceDeLaPagina: "/planes/basico?tipo=IA",
    planActivo: !(window as any).planApagado,
    funcionesQueSalen: lasFuncionesQueSeEnsenan(funciones, datos, new Map()),
};
const Pestana = PlanDetailTab as unknown as React.ComponentType<Record<string, unknown>>;

createRoot(document.getElementById("app")!).render(
    <>
        <Dialog open>
            <DialogContent className="flex max-w-2xl flex-col" data-dialogo-del-plan>
                <DialogHeader>
                    <DialogTitle>Editar plan</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto py-2 pr-1" data-hueco-del-detalle>
                    <Pestana {...props} />
                </div>
            </DialogContent>
        </Dialog>
        <Toaster />
    </>,
);
(window as any).listo = true;
