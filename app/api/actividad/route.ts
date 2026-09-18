import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { quienFirma } from "@/lib/chat-de-equipo";
import { comoEnvioDeJornada } from "@/lib/actividad-del-equipo";
import { guardarLaJornada } from "@/lib/actividad-del-equipo-db";

/**
 * Donde aterriza el contador de jornada del navegador.
 *
 * ## Por qué es una ruta `/api` y no una acción de servidor
 *
 * Porque tiene que poder salir con **`navigator.sendBeacon`**, y `sendBeacon`
 * manda un POST a una URL. Es la única forma de que el último minuto llegue
 * cuando la pestaña se está yendo: un `fetch` normal lo cancela el navegador en
 * cuanto la página se descarga, así que el envío de despedida —justo el que
 * evita perder la cola— no llegaría nunca.
 *
 * ## La puerta
 *
 * Comprueba `currentUser()` **por sí misma**. El middleware se pudo saltar con
 * la CVE-2025-29927 y volverá a poder en la próxima; una ruta que solo confía
 * en él es una ruta abierta. Es el H02 de la auditoría del 2026-09-06.
 *
 * Y **no recibe ningún id**: de quién es el tiempo lo decide el servidor con la
 * sesión (`quienFirma`), nunca el cuerpo de la petición. Si el navegador
 * pudiera decir a nombre de quién va, cualquiera le escribiría la jornada a
 * otro.
 */
export async function POST(request: Request) {
    const user = await currentUser();
    if (!user?.id) {
        return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
    }

    // La MISMA función que decide quién firma un mensaje del chat de equipo, y
    // por las mismas dos razones: el tiempo es de la PERSONA que está sentada
    // delante —dentro de una cuenta ajena por «Ingresar» no es la jornada del
    // cliente—, y la CUENTA es la que agrupa para el administrador. Escribir
    // aquí otra fórmula sería tener dos que mantener a la par.
    const firma = quienFirma(user);
    if (!firma) {
        return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
    }

    let crudo: unknown = null;
    try {
        crudo = await request.json();
    } catch {
        // `sendBeacon` manda un `Blob`; si llega algo que no es JSON no hay
        // nada que guardar y tampoco nada que arreglar.
        return NextResponse.json({ success: false, message: "Cuerpo ilegible." }, { status: 400 });
    }

    const envio = comoEnvioDeJornada(crudo);
    if (!envio) {
        return NextResponse.json({ success: false, message: "Envío vacío." }, { status: 400 });
    }

    try {
        await guardarLaJornada({
            personaId: firma.personaId,
            cuentaId: firma.cuentaId,
            envio,
        });
    } catch (error) {
        // Aquí sí se contesta con un fallo: el navegador conserva su acumulado
        // y el envío siguiente lo trae otra vez. Como lo que se guarda es el
        // total y no un incremento, reintentar es gratis.
        console.warn("[actividad] no se pudo guardar la jornada", {
            personaId: firma.personaId,
            error,
        });
        return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
