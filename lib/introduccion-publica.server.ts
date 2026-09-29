import "server-only";

import { laIntroduccionGuardada } from "@/lib/introduccion-de-la-guia-db";
import { laIntroduccionQueSeEnsena, type Introduccion, type ModuloConGuia } from "@/lib/introduccion-de-la-guia";

/**
 * La introducción que enseña la página PÚBLICA. Es la única lectura de la base
 * que hace la guía, y nunca la tumba: sin base, o sin la tabla, sale el texto
 * del código — la guía se sigue sirviendo con la base caída.
 */
export async function laIntroduccionPublica(modulo: ModuloConGuia, porDefecto: Introduccion): Promise<Introduccion> {
    try {
        return laIntroduccionQueSeEnsena(await laIntroduccionGuardada(modulo), porDefecto);
    } catch (error) {
        console.warn("[guia] no se pudo leer la introducción editada; sale la del código", {
            modulo,
            error: String((error as Error)?.message ?? error).slice(0, 200),
        });
        return porDefecto;
    }
}
