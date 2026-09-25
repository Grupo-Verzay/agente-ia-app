/**
 * El «antes» del alcance: el selector tal como estaba cuando ofrecía la cartera
 * entera —o sea, en una cuenta de la casa, **todas las cuentas cliente de la
 * plataforma**— y no recordaba nada.
 *
 * Los tres ficheros se sacan de git (`ANTES_DEL_ALCANCE`) y los `import` de los
 * dos que se apuntan unos a otros llevan su alias de esbuild: sin eso
 * resolverían a los de hoy —que ya llevan el arreglo— y el modo roto pasaría
 * sin ejercer nada.
 *
 * **`ANTES_DEL_ALCANCE` va PINCHADO a un commit, nunca a `origin/main`.** En
 * cuanto este cambio se fusione, `origin/main` sería el «después»: el modo roto
 * dejaría de reproducir el fallo y se pondría verde sin ejercerlo, que es la
 * peor forma de tener un banco.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { tableroDelEmbudoAction } from "../.antes/alcance/embudos-actions";

/**
 * Antes no había ninguna memoria: el tablero abría **siempre** en la cuenta
 * propia. Se declara aquí para que el banco pueda afirmarlo en vez de saltarse
 * el caso.
 */
export async function laCuentaConLaQueAbre(): Promise<string | null> {
    return null;
}

export async function laCuentaRecordada(): Promise<string | null> {
    return null;
}

export { db } from "@/lib/db";
