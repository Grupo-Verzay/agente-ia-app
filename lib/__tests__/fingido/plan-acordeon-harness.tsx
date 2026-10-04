// La página pública de un plan, la de VERDAD, con sus funciones armadas en el
// navegador por la MISMA `lasFuncionesQueSeEnsenan` que usa el servidor. Así
// el banco ve qué texto lleva cada tutorial en la versión que se compila: la de
// antes ponía «Guía de <módulo>» y la de ahora «Ver tutorial».
//
// `guias` es un Map de módulo → «Guía de <título>», que sirve a las DOS firmas:
// la vieja leía el título del mapa, la nueva solo pregunta `has`.
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { lasFuncionesQueSeEnsenan } from "@/lib/pagina-de-plan";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

const w = window as any;
const guias = new Map<string, string>(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));
const pagina = { ...w.__pagina, funciones: (lasFuncionesQueSeEnsenan as any)(w.__crudo, w.__datos, guias) };
w.__funciones = pagina.funciones;

createRoot(document.getElementById("app")!).render(<PlanDetailPage pagina={pagina} />);
w.listo = true;
