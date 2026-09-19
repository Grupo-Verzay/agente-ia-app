"use client";

import { createContext, useContext } from "react";

/**
 * El origen de la plataforma, ahí donde haga falta pintarlo.
 *
 * Quien decide si un enlace de un mensaje es de dentro o de fuera necesita
 * saber por qué dominio se está sirviendo la App, y **ese dato solo lo tiene el
 * servidor**: leerlo del navegador con `window.location` daría una salida en el
 * servidor y otra en el navegador, o sea una hidratación rota.
 *
 * Va por contexto y no por props porque el sitio donde se necesita —la burbuja
 * de un mensaje— está al fondo de tres componentes grandes y memoizados. Es el
 * mismo patrón con el que esta misma lista ya le baja la conversación al botón
 * de transcribir una nota: bajarlo como prop serían cuatro ficheros de cadena
 * y tocar la firma de cada fila.
 *
 * **No cuesta repintados**: el valor es una cadena que no cambia en toda la
 * vida de la página, así que ningún consumidor se vuelve a pintar por esto.
 */
const Contexto = createContext<string>("");

export const OrigenDeLaAppProvider = Contexto.Provider;

/** El origen, o cadena vacía si nadie lo puso — y entonces todo es de fuera. */
export function useOrigenDeLaApp(): string {
    return useContext(Contexto);
}
