"use server";

import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { quienFirma } from "@/lib/chat-de-equipo";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { canalesQueAlcanzan, guardarUnMensaje } from "@/lib/chat-de-equipo-db";
import { perteneceAlCanal } from "@/lib/canales-de-equipo";
import {
    comoSeCuentaLaLlamada,
    duracionEnSegundos,
    esFinDeLlamada,
    estaDisponible,
    laOtraPersona,
    type FinDeLlamada,
} from "@/lib/llamada-de-voz";
import {
    cerrarLasQueSePasaron,
    contestarLaLlamada,
    crearLaLlamada,
    cuandoSeLeVio,
    dejarElLatido,
    laLlamada,
    loQueMeIncumbe,
    terminarLaLlamada,
    type FilaDeLlamada,
} from "@/lib/llamadas-db";

/**
 * Las llamadas de voz de un directo: señalización, presencia y registro.
 *
 * # La señalización va por NUESTRA base
 *
 * El socket de tiempo real es del **backend**, y desde la App solo se escucha.
 * Y no hace falta más: el WebRTC de esta App es non-trickle —una oferta, una
 * respuesta— así que por el canal viajan dos mensajes, no un goteo de
 * candidatos. Ver `lib/llamada-de-voz.ts`.
 *
 * # Y lo que llega del navegador no decide a quién se llama
 *
 * Llega un `canalId`. De ahí sale **todo lo demás**: que sea un directo, que
 * quien llama esté dentro y quién es la otra persona. Sin eso, mandando un id
 * de canal a mano se le podría hacer sonar el teléfono a cualquiera de la
 * plataforma — que es la misma regla con la que se decide en qué canal se
 * escribe y a quién se menciona.
 */

type Respuesta<T> =
    | ({ success: true } & T)
    | { success: false; message: string };

async function quien() {
    const user = await currentUser();
    if (!user?.id) return null;
    const firma = quienFirma(user);
    if (!firma) return null;
    return {
        personaId: firma.personaId,
        nombre: firma.nombre,
        cuentaId: firma.cuentaId,
        manda: canManageWorkspace(user),
        familia: await laFamiliaDeLaCuenta(firma.cuentaId),
    };
}

/**
 * El directo al que se quiere llamar, y con quién.
 *
 * **Se comprueba la pertenencia, no que el canal exista.** Un administrador LEE
 * los directos de su cuenta —es una decisión tomada a propósito— y eso no le
 * da derecho a llamar desde ellos: meterse en la conversación de otros dos no
 * es supervisar, es suplantar, y una llamada lo es mucho más que un mensaje.
 * Es la misma línea que `puedeEscribirEnElCanal` traza para los directos.
 */
async function elDirecto(canalId: string, yo: Awaited<ReturnType<typeof quien>>) {
    if (!yo) return null;
    const filas = await canalesQueAlcanzan({
        cuentaId: yo.cuentaId,
        personaId: yo.personaId,
        manda: yo.manda,
    });
    const fila = filas.find((f) => f.id === canalId);
    if (!fila) return null;

    const pertenece = perteneceAlCanal({
        personas: fila.miembros ?? [],
        cuentas: fila.cuentas ?? [],
        yo: yo.personaId,
        miCuenta: yo.cuentaId,
    });
    if (!pertenece) return null;

    const otra = laOtraPersona(
        { tipo: fila.tipo, miembros: fila.miembros ?? [] },
        yo.personaId,
    );
    if (!otra) return null;
    return { fila, otra };
}

/**
 * Llamar. Devuelve el id de la llamada, o dice que no está disponible.
 *
 * **La presencia se mira ANTES de crear nada**: si esa persona no tiene la
 * plataforma abierta, quien llama lo sabe al instante en vez de escuchar un
 * tono que no suena en ningún sitio. Es lo pedido, y es lo que hace que esto se
 * pueda usar sin sentirse roto.
 */
export async function llamarAction(
    canalId: string,
    oferta: string,
): Promise<Respuesta<{ llamadaId: string }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        if (!oferta?.trim()) {
            return { success: false, message: "No se pudo preparar el audio." };
        }

        const directo = await elDirecto(canalId, yo);
        if (!directo) {
            // O no es suyo, o no es un directo. No se distingue a propósito:
            // decir «ese canal no es un directo» ya cuenta algo de un canal que
            // quizá no sea suyo.
            return { success: false, message: "Aquí no se puede llamar." };
        }

        if (!estaDisponible(await cuandoSeLeVio(directo.otra))) {
            // No se crea fila ni se escribe en el directo: no hubo llamada, no
            // llegó a sonar en ninguna parte. Anotarla llenaría el hilo de
            // «no disponible» cada vez que alguien lo intenta.
            return { success: false, message: "No está conectado ahora mismo." };
        }

        const llamadaId = await crearLaLlamada({
            canalId,
            cuentaId: directo.fila.cuentaId,
            dellamaId: yo.personaId,
            aQuienId: directo.otra,
            oferta,
        });
        return { success: true, llamadaId };
    } catch (error) {
        console.warn("[llamadas] no se pudo llamar", error);
        return { success: false, message: "No se pudo iniciar la llamada." };
    }
}

export type LoQuePasa = {
    /** La que me está sonando ahora, si hay alguna. */
    entrante: {
        id: string;
        canalId: string;
        deQuienId: string;
        /**
         * Cómo se llama quien llama.
         *
         * Se resuelve en el servidor y **solo cuando hay una llamada sonando**:
         * el oyente corre en todas las pantallas de todo el mundo, así que una
         * consulta de más en la vuelta normal se multiplicaría por toda la
         * plataforma. Aquí cuesta una lectura por llamada, no por vuelta.
         *
         * Y sin nombre no se deja «Alguien»: un teléfono que suena sin decir
         * quién es no se contesta igual.
         */
        deQuienNombre: string;
        oferta: string | null;
    } | null;
    /** La mía, y en qué punto va. */
    mia: {
        id: string;
        estado: string;
        respuesta: string | null;
    } | null;
    /** Las que acaban de terminar, para que la pantalla se cierre sola. */
    terminadas: Array<{ id: string; fin: string }>;
};

/**
 * El reloj: deja el latido y trae lo que me incumbe, **en una sola vuelta**.
 *
 * Corre en TODAS las pantallas —el aviso tiene que salir esté donde esté— así
 * que es una consulta corta sobre un índice y nada más. Con la pestaña de fondo
 * no se llama, como el resto de relojes de la App.
 *
 * Y de paso cierra las que se pasaron de timbre. Eso se decide **en el servidor
 * y por la hora de la fila**: con un contador en la pantalla de quien llama, si
 * esa pestaña se cierra a mitad la llamada se quedaría sonando para siempre en
 * la otra punta.
 */
export async function atenderLlamadasAction(): Promise<Respuesta<{ datos: LoQuePasa }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        await dejarElLatido(yo.personaId);

        const caducadas = await cerrarLasQueSePasaron(yo.personaId);
        for (const fila of caducadas) await anotarEnElDirecto(fila);

        const filas = await loQueMeIncumbe(yo.personaId);
        const entrante = filas.find(
            (f) => f.aQuienId === yo.personaId && f.estado === "sonando",
        );
        const mia = filas.find((f) => f.dellamaId === yo.personaId);

        return {
            success: true,
            datos: {
                entrante: entrante
                    ? {
                          id: entrante.id,
                          canalId: entrante.canalId,
                          deQuienId: entrante.dellamaId,
                          deQuienNombre: await comoSeLlamaQuienLlama(entrante.dellamaId),
                          oferta: entrante.oferta,
                      }
                    : null,
                mia: mia ? { id: mia.id, estado: mia.estado, respuesta: mia.respuesta } : null,
                terminadas: caducadas.map((f) => ({ id: f.id, fin: f.fin ?? "sin_respuesta" })),
            },
        };
    } catch (error) {
        // Mudo aquí se ve como «a mí no me suenan las llamadas», que es de lo
        // más difícil de diagnosticar.
        console.warn("[llamadas] falló una vuelta del oyente", error);
        return { success: false, message: "No se pudo comprobar las llamadas." };
    }
}

/** El nombre de quien llama, para que el aviso diga quién es. */
async function comoSeLlamaQuienLlama(personaId: string): Promise<string> {
    try {
        const { db } = await import("@/lib/db");
        const fila = await db.user.findUnique({
            where: { id: personaId },
            select: { name: true, email: true },
        });
        return fila?.name?.trim() || fila?.email || "Alguien del equipo";
    } catch (error) {
        // Sin nombre la llamada suena igual; se dice para que «pone Alguien»
        // no se quede sin explicación.
        console.warn("[llamadas] no se pudo resolver quién llama", error);
        return "Alguien del equipo";
    }
}

/** Contestar, con la respuesta SDP dentro. */
export async function contestarAction(
    llamadaId: string,
    respuesta: string,
): Promise<Respuesta<{ oferta: string | null }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const fila = await laLlamada(llamadaId);
        // Solo la contesta a quien va dirigida. Sin esto, con el id a mano
        // cualquiera podría meterse en la llamada de otros dos.
        if (!fila || fila.aQuienId !== yo.personaId) {
            return { success: false, message: "Esa llamada no es tuya." };
        }
        if (!(await contestarLaLlamada(llamadaId, respuesta))) {
            // La colgaron mientras se contestaba. Se dice, en vez de dejar a
            // quien contestó escuchando un silencio.
            return { success: false, message: "La llamada ya había terminado." };
        }
        return { success: true, oferta: fila.oferta };
    } catch (error) {
        console.warn("[llamadas] no se pudo contestar", error);
        return { success: false, message: "No se pudo contestar." };
    }
}

/**
 * Colgar, rechazar o darla por no conectada.
 *
 * Las tres son lo mismo —terminar— y por eso son una sola acción: con tres, el
 * día que se afine el registro se afina en una y las otras dejan de anotarlo.
 */
export async function terminarAction(
    llamadaId: string,
    fin: string,
): Promise<Respuesta<{ listo?: true }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        if (!esFinDeLlamada(fin)) {
            // Lo que llega de fuera pasa por la lista: un final inventado se
            // quedaría guardado y saldría en el directo como algo que nadie
            // sabe de dónde salió.
            return { success: false, message: "Ese final no existe." };
        }

        const fila = await laLlamada(llamadaId);
        if (!fila) return { success: false, message: "Esa llamada no existe." };
        if (fila.dellamaId !== yo.personaId && fila.aQuienId !== yo.personaId) {
            return { success: false, message: "Esa llamada no es tuya." };
        }

        const terminada = await terminarLaLlamada(llamadaId, fin);
        // `null` es que ya estaba terminada: las dos puntas cuelgan casi a la
        // vez, y sin esto se escribirían DOS registros de la misma llamada.
        if (terminada) await anotarEnElDirecto(terminada);
        return { success: true };
    } catch (error) {
        console.warn("[llamadas] no se pudo terminar", error);
        return { success: false, message: "No se pudo colgar." };
    }
}

/**
 * Dejar la llamada escrita en el directo, como un mensaje más.
 *
 * **Nunca lanza.** La llamada ya pasó y eso es lo que importa; pero tampoco es
 * mudo: un registro que no aparece se lee como que la App pierde lo que hiciste.
 *
 * Y lo firma **quien llamó**, no quien colgó: la fila dice «Fulano llamó», y
 * colgar es de los dos.
 */
async function anotarEnElDirecto(fila: FilaDeLlamada): Promise<void> {
    try {
        const fin = (fila.fin ?? "sin_respuesta") as FinDeLlamada;
        const segundos = duracionEnSegundos(fila.contestadaEn, fila.terminadaEn);
        await guardarUnMensaje({
            id: `llamada-${fila.id}`,
            cuentaId: fila.cuentaId,
            canalId: fila.canalId,
            autorId: fila.dellamaId,
            autorNombre: null,
            escritoDesde: null,
            texto: comoSeCuentaLaLlamada(fin, segundos),
            mencionados: [],
            chat: null,
            // Una llamada no cita a nadie: el registro lo deja la llamada al
            // terminar, no alguien respondiendo a un mensaje.
            cita: null,
            llamada: { fin, segundos },
        });
    } catch (error) {
        console.warn("[llamadas] la llamada no quedó escrita en el directo", {
            llamada: fila.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Los servidores ICE, resueltos en el SERVIDOR.
 *
 * Las credenciales de TURN no pueden ir en el paquete del navegador: con ellas
 * cualquiera usaría vuestro relevo para su propio tráfico. Por eso viajan en la
 * respuesta de una acción y no en una variable `NEXT_PUBLIC_`.
 *
 * Sin TURN configurado devuelve solo STUN, que es lo que hay hoy: se conecta
 * directo siempre que se pueda y las llamadas entre redes que no lo permiten
 * **no conectan** — y lo dicen, con `sin_conexion`.
 */
export async function losServidoresDeLlamadaAction(): Promise<
    Respuesta<{ ice: RTCIceServer[] }>
> {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };

    const { losServidoresIce } = await import("@/lib/llamada-de-voz");
    return {
        success: true,
        ice: losServidoresIce({
            TURN_URL: process.env.TURN_URL,
            TURN_USER: process.env.TURN_USER,
            TURN_PASSWORD: process.env.TURN_PASSWORD,
        }),
    };
}
