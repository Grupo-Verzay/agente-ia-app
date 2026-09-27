'use server';

import { confirmarLaCitaPublica, type ResultadoDeLaCitaPublica } from '@/lib/cita-publica.server';

/**
 * **ABIERTA a propósito**: la llama la página pública de agendar
 * (`/schedule/[userId]`), donde entra el cliente final sin sesión.
 *
 * Lo que abre, y por qué es aceptable: recibe **el id de una cita** —un uuid—,
 * el día elegido y la zona horaria de quien reservó. Con eso manda los
 * mensajes de ESA cita (recordatorios, aviso al dueño y confirmación), con el
 * texto, el número, la línea y la clave sacados de la base. No hay forma de
 * elegir destino, línea, texto ni clave, y solo funciona **una vez** y con una
 * cita **recién creada** (ver `lib/cita-publica.server.ts`).
 *
 * Es lo que CLAUDE.md dejó escrito como «lo que la cerraría de verdad»: que la
 * confirmación de la reserva se arme en el servidor a partir del id de la cita,
 * en vez de recibirla hecha con la clave del servidor dentro.
 */
export async function confirmarLaCitaPublicaAction(input: {
    appointmentId: string;
    diaElegido?: string | null;
    zonaDelCliente?: string | null;
}): Promise<ResultadoDeLaCitaPublica> {
    try {
        return await confirmarLaCitaPublica(input);
    } catch (error) {
        console.error('[cita-publica] no se pudo confirmar la cita', error);
        return { success: false, message: 'No se pudo enviar la confirmación.' };
    }
}
