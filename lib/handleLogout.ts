"use client";

/**
 * Salir. Ver app/api/logout/route.ts para el porqué de hacerlo así.
 *
 * Antes esto encadenaba tres viajes al servidor -acción de limpiar cookies,
 * CSRF de next-auth y el POST de signOut- y solo después navegaba. Sin ninguna
 * señal en pantalla, con el servidor ocupado, "Salir" parecía no hacer nada y
 * cada pulsación repetida lanzaba la cadena otra vez.
 *
 * Ahora navega directamente a la ruta que cierra la sesión: la pestaña enseña
 * su indicador de carga al instante y el servidor contesta con la redirección
 * al login. La segunda pulsación no hace nada: ya vamos de camino.
 */
let saliendo = false;

export function handleLogout() {
  if (saliendo) return;
  saliendo = true;
  window.location.assign("/api/logout");
}
