import { redirect, notFound } from "next/navigation";

import { normalizarPlan } from "@/lib/plan-pricing";
import { PLANS } from "@/types/plans";

/**
 * Enlace corto de venta: /plan/4
 *
 * Es el que se dicta en una reunión ("plan, barra, cuatro") y el que se pega en
 * un WhatsApp. Lleva el NÚMERO DE NIVEL, no el nombre, así que renombrar
 * "Esencial" a lo que sea no lo rompe: el nivel es fijo.
 *
 * Solo redirige al formulario de siempre con el plan puesto; todo lo demás
 * —precio, cobro, alta de la cuenta— sigue igual que antes.
 */

type Props = {
  params: { nivel: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export default function EnlaceCortoDePlan({ params, searchParams }: Props) {
  const plan = normalizarPlan(params.nivel);

  // Un nivel que no existe no se convierte en una prueba gratis a escondidas:
  // quien reparte el enlace creería que vendió un plan. Mejor que se note.
  if (!plan) notFound();

  const destino = new URLSearchParams();
  destino.set("plan", `nivel-${PLANS.indexOf(plan) + 1}`);

  // Lo demás del enlace se conserva: marca del reseller, afiliado, objetivo…
  for (const [clave, valor] of Object.entries(searchParams)) {
    if (clave === "plan") continue;
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (texto) destino.set(clave, texto);
  }

  // La modalidad NO se pone aquí: viaja en la cookie (`lib/enlaces-de-planes.ts`)
  // y el registro elige la que de verdad se vende en ese nivel
  // (`laAsistenciaQueSeVende`), así que una fila inactiva no puede dejar la
  // cuenta en $0. Si el enlace trae `a=`, se copia y el middleware la pasa a la
  // cookie y la quita de la dirección.
  redirect(`/completar-registro?${destino.toString()}`);
}
