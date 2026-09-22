"use client";

import { useEffect } from "react";

import ErrorScreen from "@/components/shared/ErrorScreen";
import { anotarElFallo, comoSeLee, esRecuperable } from "@/lib/fallos-del-navegador";
import { hardReload } from "@/lib/hard-reload";
import { intentarRecuperar } from "@/lib/recuperar-del-desfase";

/**
 * El limite de ERROR de una pantalla. Lo pinta Next cuando revienta una ruta,
 * y se queda DENTRO del layout raiz: la hoja de estilos esta cargada, asi que
 * aqui si se puede usar la pantalla de error que la App ya tenia
 * (`components/shared/ErrorScreen.tsx`) en vez de escribir otra.
 *
 * Y hacia falta, aunque ya exista el `ErrorBoundary` de `app/layout.tsx`: aquel
 * es un limite de React y por tanto solo caza lo que revienta en el NAVEGADOR.
 * Lo que revienta en un componente de SERVIDOR —o al pedir el arbol de una ruta
 * durante una navegacion— no pasa por el; sin este fichero se iba derecho al
 * limite global de Next, que es la pantalla en blanco.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    anotarElFallo("ruta", error);

    const leido = comoSeLee(error);
    if (esRecuperable(leido.mensaje, leido.nombre)) {
      intentarRecuperar(`pantalla de ruta: ${leido.nombre || leido.mensaje}`);
    }
  }, [error]);

  return (
    <ErrorScreen
      error={error}
      // `reset` vuelve a pintar la ruta sin recargar. Se intenta primero porque
      // no pierde nada de lo que hubiera abierto; si el fallo sigue ahi, vuelve
      // esta misma pantalla y queda la recarga.
      onRetry={() => {
        try {
          reset();
        } catch {
          hardReload("pantalla de ruta: reset fallido");
        }
      }}
      onHome={() => window.location.assign("/")}
    />
  );
}
