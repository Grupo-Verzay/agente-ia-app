/**
 * React DE VERDAD con un `cache()` que no memoriza.
 *
 * `react-cache.ts` sustituye React entero y solo trae `cache`; este banco
 * arrastra además código que usa `createContext`, así que se reexporta el
 * paquete real (por su ruta, para que el alias de `react` no se muerda la
 * cola) y solo se cambia `cache`: fuera de una petición de Next no lo hay.
 */
// @ts-ignore — ruta directa al paquete real
import * as React from "../../../node_modules/react/index.js";
export * from "../../../node_modules/react/index.js";
export default React;
export function cache<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}
