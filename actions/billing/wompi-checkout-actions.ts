"use server";

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

/**
 * Enlace de pago de Wompi para renovar el servicio.
 *
 * La cadena completa ya existía menos esta pieza: Wompi avisa al backend, el
 * backend saca el cliente de la REFERENCIA del pago y la App aplica la
 * renovación sola. Lo que faltaba era generar el enlace con esa referencia.
 *
 * Los enlaces guardados en cada plan (checkoutUrl*) no sirven para esto: son
 * fijos y iguales para todos, así que el pago llega sin decir de quién es y el
 * webhook lo descarta. Por eso el enlace se arma aquí, en el momento, con el
 * cliente dentro.
 */

/** Mismo formato que espera el backend: verzay-{userId}-{planCode}-{timestamp}. */
function construirReferencia(userId: string, planCode: string): string {
  return `verzay-${userId}-${planCode}-${Date.now()}`;
}

/**
 * Firma de integridad de Wompi: SHA256(referencia + monto + moneda + secreto).
 *
 * Sin ella Wompi rechaza el enlace. Y es lo que impide que alguien cambie el
 * monto en la URL y renueve pagando menos.
 */
function firmarIntegridad(referencia: string, centavos: number, moneda: string, secreto: string) {
  return createHash("sha256").update(`${referencia}${centavos}${moneda}${secreto}`).digest("hex");
}

export interface EnlacePagoResult {
  success: boolean;
  message: string;
  url?: string;
}

export async function crearEnlacePagoRenovacion(): Promise<EnlacePagoResult> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autorizado." };

  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (!publicKey || !integritySecret) {
    return {
      success: false,
      message: "Los pagos en línea no están configurados todavía. Escríbenos y te pasamos los datos.",
    };
  }

  // El monto sale de lo que se le factura a ESTE cliente, no del precio de lista
  // del plan. Son cosas distintas: hay cuentas con precio pactado, descuento o
  // periodicidad propia, y cobrarles el de lista sería cobrarles de más o de
  // menos. Renovar es pagar lo tuyo.
  const facturacion = await db.userBilling.findUnique({
    where: { userId: user.id },
    select: { price: true, currencyCode: true, serviceName: true },
  });

  const precio = Number(facturacion?.price ?? 0);
  if (!facturacion || !Number.isFinite(precio) || precio <= 0) {
    return {
      success: false,
      message: "Tu cuenta no tiene un precio asignado. Escríbenos para configurarlo.",
    };
  }

  const moneda = (facturacion.currencyCode || "COP").toUpperCase();
  // Wompi cobra en centavos y solo acepta enteros; redondear evita que un precio
  // con decimales genere un monto inválido y el enlace muera al abrirse.
  const centavos = Math.round(precio * 100);

  const planCode = (facturacion.serviceName || user.plan || "servicio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // El backend parte la referencia por guiones para recuperar el userId, así
    // que el código de plan no puede traer ninguno o se llevaría por delante un
    // trozo del identificador.
    .replace(/[^a-z0-9]/g, "");

  const referencia = construirReferencia(user.id, planCode || "servicio");
  const firma = firmarIntegridad(referencia, centavos, moneda, integritySecret);

  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", publicKey);
  url.searchParams.set("currency", moneda);
  url.searchParams.set("amount-in-cents", String(centavos));
  url.searchParams.set("reference", referencia);
  url.searchParams.set("signature:integrity", firma);
  if (user.email) url.searchParams.set("customer-data:email", user.email);
  const redirect = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (redirect) url.searchParams.set("redirect-url", `${redirect.replace(/\/+$/, "")}/profile`);

  return { success: true, message: "Enlace generado.", url: url.toString() };
}
