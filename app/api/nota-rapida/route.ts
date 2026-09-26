import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { guardarLaNotaRapida } from "@/lib/nota-rapida-db";
import { comoTextoDeLaNota } from "@/lib/nota-rapida";

export const dynamic = "force-dynamic";

/**
 * El volcado de la nota rápida cuando la página se va.
 *
 * # Por qué hay una ruta y no basta la acción de servidor
 *
 * Porque **una acción de servidor no sobrevive al `pagehide`**. El guardado
 * normal va con su reloj: se espera a que se deje de teclear y se manda. Quien
 * cierra la pestaña dentro de esa ventana pierde lo último que escribió, y eso
 * no se ve como un reloj: se ve como que la App pierde lo que escribes.
 *
 * Lo único que el navegador garantiza que sale con la página ya muerta es un
 * `fetch` con `keepalive`, y eso pide una URL. Así que el navegador vuelca aquí
 * al esconderse la pestaña y al irse la página; todo lo demás sigue yendo por
 * la acción.
 *
 * # No es una segunda puerta
 *
 * Esto **no confía en el middleware** —que es la regla de siempre para toda
 * ruta `/api`—: resuelve `currentUser()` y saca la persona con la MISMA función
 * que la acción, así que el id no llega nunca del navegador. Lo que llega es el
 * texto y nada más.
 *
 * Y no importa el fichero de acciones: escribe con `lib/nota-rapida-db`, que es
 * el único camino de escritura que hay. Con una copia aquí, el día que se afine
 * el saneado o el tope la nota se guardaría de dos maneras según por dónde
 * entrara.
 */
export async function POST(req: Request) {
    try {
        const user = await currentUser();
        if (!user?.id) {
            return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
        }
        const persona = laPersonaQueActua(user);
        if (!persona.id) {
            return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
        }

        const cuerpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
        // `undefined` es «no mandó nada» y vaciar la nota por eso sería el peor
        // final posible para un volcado de cierre. Vaciarla a propósito manda
        // una cadena vacía, que sí pasa.
        if (!cuerpo || typeof cuerpo.texto !== "string") {
            return NextResponse.json({ success: false, message: "Falta el texto." }, { status: 400 });
        }

        await guardarLaNotaRapida(persona.id, comoTextoDeLaNota(cuerpo.texto));
        return NextResponse.json({ success: true });
    } catch (error) {
        // Nadie está mirando cuando esto corre —la página ya se fue—, así que
        // la consola del servidor es el único sitio donde puede verse.
        console.error("[nota-rapida] no se pudo volcar la nota al cerrar", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
