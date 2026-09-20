/**
 * La entrada que se empaqueta para el banco de `cuentas-de-finanzas`.
 *
 * Existe por una razón concreta: el `currentUser()` de mentira se inyecta con
 * un alias de esbuild, así que queda **dentro** del paquete. Importándolo
 * aparte desde el banco se estaría moviendo otra copia —otro módulo, otra
 * variable— y `ponerAQuienMira` no tendría ningún efecto sobre el código que
 * corre. Reexportándolo desde aquí, el banco mueve la misma.
 */
// Se importa por su ruta relativa —y no por `@/lib/auth`— para que esto siga
// compilando con el resto del repo; el alias de esbuild hace que las dos
// rutas resuelvan al MISMO fichero, así que el paquete lleva una sola copia.
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    resolverLasCuentasDeFinanzas,
    lasCuentasQueSeConsultan,
} from "@/lib/cuentas-de-finanzas";
