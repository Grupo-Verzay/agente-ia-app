/**
 * Qué clientes ofrece el selector de Datos externos, según quién lo pide.
 *
 * `getClientsForSelector` recibía el alcance DEL NAVEGADOR —un `resellerId`
 * opcional— y sin él devolvía **todos los usuarios de la plataforma**, con su
 * nombre y su correo: un reseller que llamara a la acción sin filtro se llevaba
 * la base entera, y la casa recibía además al equipo de cada cuenta y a las
 * cuentas ya eliminadas, que no son clientes.
 *
 * > El alcance lo decide la SESIÓN, nunca un parámetro: la casa ve las cuentas
 * > cliente de la plataforma (sin su equipo ni las eliminadas, y sin las cuentas
 * > de las que ella misma cuelga, igual que el panel de Clientes); un reseller,
 * > su cartera por los dos caminos (`reseller` y `demoResellerId`); nadie más,
 * > nada.
 */
export type AlcanceDelSelector = "plataforma" | "cartera" | "nada";

export function queAlcanzaElSelector(quien: {
    esDeLaCasa: boolean;
    rolDeLaCuenta: string | null | undefined;
}): AlcanceDelSelector {
    if (quien.esDeLaCasa) return "plataforma";
    if (quien.rolDeLaCuenta === "reseller") return "cartera";
    return "nada";
}
