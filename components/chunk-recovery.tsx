'use client'

import { useEffect } from "react";

import { anotarElFallo, contarLosFallosAnteriores, esRecuperable } from "@/lib/fallos-del-navegador";
import { cleanCacheBustParam, reportarRecargaPrevia } from "@/lib/hard-reload";
import { intentarRecuperar } from "@/lib/recuperar-del-desfase";

/**
 * Lo que oye la VENTANA: errores y promesas rechazadas que no pasan por ningun
 * limite de React (un `addEventListener`, una promesa suelta, un chunk que se
 * pide fuera del pintado).
 *
 * Lo que decide si se recarga vive en `lib/` —`esRecuperable` y
 * `intentarRecuperar`—, porque lo preguntan tambien las dos pantallas de error.
 * Aqui solo queda el oyente.
 */
export function ChunkRecovery() {
  useEffect(() => {
    // Si venimos de una recuperación, la carga fue bien: se limpia el parámetro
    // para que no quede a la vista ni se propague al compartir el enlace.
    cleanCacheBustParam();
    // Y se cuenta por que se recargo la vez anterior, si fue cosa nuestra. Sin
    // esto, una recarga se lleva la consola por delante y no queda ni rastro:
    // "la App se refresca sola" no se podia comprobar de ninguna forma.
    reportarRecargaPrevia();
    // Lo mismo con los fallos de pantalla: lo que se anoto en la carga anterior
    // se cuenta aqui. Sin esto, "se me quedo en blanco y recargue" no deja ni
    // un dato que mirar al dia siguiente.
    contarLosFallosAnteriores();

    const alRechazar = (e: PromiseRejectionEvent) => {
      const mensaje = String(e?.reason?.message || "");
      const nombre = String(e?.reason?.name || "");
      if (!esRecuperable(mensaje, nombre)) return;
      anotarElFallo("ventana", e?.reason, "promesa rechazada");
      intentarRecuperar(`promesa rechazada: ${nombre || mensaje}`);
    };
    const alFallar = (e: ErrorEvent) => {
      const mensaje = String(e?.message || e?.error?.message || "");
      const nombre = String(e?.error?.name || "");
      if (!esRecuperable(mensaje, nombre)) return;
      anotarElFallo("ventana", e?.error ?? mensaje, "error de la pagina");
      intentarRecuperar(`error de la pagina: ${nombre || mensaje}`);
    };
    window.addEventListener("unhandledrejection", alRechazar);
    window.addEventListener("error", alFallar);
    return () => {
      window.removeEventListener("unhandledrejection", alRechazar);
      window.removeEventListener("error", alFallar);
    };
  }, []);
  return null;
}
