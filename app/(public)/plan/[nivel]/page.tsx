import { redirect, notFound } from "next/navigation";

import { db } from "@/lib/db";
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

/**
 * La modalidad que de verdad está a la venta en ese nivel.
 *
 * Cada nivel tiene dos filas, IA y Humano, con su propio precio, y el precio
 * sale de la fila. Si el enlace no dice cuál, apuntar a ciegas a IA crearía la
 * cuenta en $0 cuando esa fila está inactiva —que es justo el caso cuando solo
 * se vende la de Humano—. Así que se mira cuál está activa.
 */
async function modalidadALaVenta(plan: (typeof PLANS)[number]): Promise<"IA" | "HUMANO"> {
  const activas = await db.subscriptionPlan
    .findMany({
      where: { plan, isResellerPlan: false, isActive: true },
      select: { assistanceType: true },
    })
    .catch(() => []);

  const tipos = new Set(activas.map((fila) => fila.assistanceType?.toUpperCase()));
  if (tipos.has("IA")) return "IA";
  if (tipos.has("HUMANO")) return "HUMANO";

  // Ninguna activa: se manda la de siempre y el formulario decide.
  return "IA";
}

export default async function EnlaceCortoDePlan({ params, searchParams }: Props) {
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

  if (!destino.has("a")) destino.set("a", await modalidadALaVenta(plan));

  redirect(`/completar-registro?${destino.toString()}`);
}
