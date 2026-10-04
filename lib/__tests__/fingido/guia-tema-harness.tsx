// Las páginas de la GUÍA, las de VERDAD (el layout, el índice y una sección de
// Leads, y la guía metida en la landing), para medir sus colores con la App en
// claro y en oscuro. El banco decide qué se pinta (`window.__vista`) y si la
// raíz lleva `.dark` (`window.__oscuro`), que es lo que pone next-themes.
import React from "react";
import { createRoot } from "react-dom/client";
import LayoutDeLaGuia from "@/app/guia/layout";
import IndiceDeLaGuiaDeLeads from "@/app/guia/leads/page";
import SeccionDeLaGuiaDeLeads from "@/app/guia/leads/[seccion]/page";
import { GuiaEnLaLanding } from "@/components/guia/GuiaEnLaLanding";
import { SECCIONES } from "@/lib/guia-leads";

const w = window as any;
if (w.__oscuro) document.documentElement.classList.add("dark");

async function pintar() {
    const raiz = createRoot(document.getElementById("app")!);
    if (w.__vista === "indice") {
        // El índice es asíncrono (lee la introducción): se espera aquí, como
        // haría el servidor, y se pinta lo que devuelve.
        const indice = await (IndiceDeLaGuiaDeLeads as any)();
        raiz.render(<LayoutDeLaGuia>{indice}</LayoutDeLaGuia>);
    } else if (w.__vista === "seccion") {
        raiz.render(
            <LayoutDeLaGuia>
                <SeccionDeLaGuiaDeLeads params={{ seccion: SECCIONES[0].slug }} />
            </LayoutDeLaGuia>,
        );
    } else {
        // La guía dentro de la landing pública, que es SIEMPRE oscura.
        raiz.render(
            <div className="dark bg-slate-950 p-6 text-white">
                <GuiaEnLaLanding
                    guia={{
                        modulo: "leads",
                        titulo: "Guía de Leads",
                        descripcion: "",
                        nombre: "Leads",
                        subtitulo: "Tus contactos",
                        url: "/guia/leads",
                        ruta: "/sessions",
                        categoria: null,
                        secciones: [],
                    } as any}
                    nombreDeLaCategoria="Contactos"
                    seccion={null}
                    alVolver={() => {}}
                    alAbrirSeccion={() => {}}
                />
            </div>,
        );
    }
    w.listo = true;
}
void pintar();
