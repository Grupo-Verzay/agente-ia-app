"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getCountryCodes } from "@/actions/get-country-action";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
import { elLeadDelContacto } from "@/lib/lead-del-ticket";
import { alFinalDelTablero } from "@/lib/orden-de-tablero-db";
import { TIPOS_DE_ADJUNTO } from "@/lib/adjuntos-de-tarea-tipos";
import {
  armarElNumero,
  elIndicativoDeUnNumero,
  soloDigitos,
} from "@/lib/telefono-de-pais";
import {
  queLeFaltaALaFichaPublica,
  TOPE_DEL_NOMBRE,
  TOPE_DEL_TITULO,
  TOPE_DE_LA_DESCRIPCION,
} from "@/lib/tickets";
import {
  crearElTicket,
  laCuentaDelCodigo,
  TOPE_DE_ADJUNTOS_POR_TICKET,
} from "@/lib/tickets-db";

/**
 * La ficha pública de tickets: la abre un cliente final **sin cuenta**.
 *
 * # El código es la única puerta
 *
 * Todo lo que decide dónde acaba el ticket —a qué bandeja cae, en qué carpeta
 * del bucket se escriben sus archivos, a qué lead se engancha— sale de
 * `laCuentaDelCodigo`, **nunca de lo que mande el navegador**. Es el mismo
 * reparto que una sala de video: tener el enlace deja llamar a la puerta; lo
 * que hay detrás lo resuelve el servidor.
 *
 * Y por eso estas acciones no piden sesión: pedirla sería pedirle al cliente
 * final que se registre para poder pedir soporte, que es justo lo contrario del
 * encargo.
 *
 * # Cada envío es un ticket nuevo e independiente
 *
 * El enlace es **permanente y de la cuenta**, no de una conversación: igual que
 * el de una sala, del que nace una reunión distinta cada vez que alguien entra.
 * No hay tope de envíos —lo reparte el dueño de la cuenta entre sus propios
 * clientes— y no hay ningún estado que se arrastre de un envío al siguiente.
 *
 * # Lo que NUNCA se rellena desde el servidor
 *
 * El nombre y el teléfono los recuerda **el navegador de quien escribe**, no
 * nosotros. Buscarlos por número en el servidor para prellenar la ficha
 * convertiría un enlace público en una forma de leer los datos de cualquier
 * contacto de la cuenta: se teclea un número y la ficha contesta de quién es.
 */

type Result<T> = { success: boolean; message: string; data?: T };

/** Lo que la página pública necesita para pintarse. */
export type FichaPublica = {
  /** Cómo se llama la cuenta que atiende. Es lo que el cliente reconoce. */
  cuentaNombre: string;
  /** Su logo, si tiene. */
  cuentaLogo: string | null;
  /** Los indicativos del selector, tal cual los ofrece la agenda. */
  paises: Array<{ name: string; codes: string[]; flag: string }>;
  /** El del país de la cuenta. **Editable**: es una sugerencia, no un candado. */
  indicativoPorDefecto: string;
};

/**
 * Lo que se enseña arriba de la ficha, y nada más.
 *
 * Deliberadamente **no** devuelve nada de la cuenta que no vaya a verse: quien
 * abre esto puede ser cualquiera que tenga el enlace.
 */
export async function laFichaPublicaAction(
  codigo: string,
): Promise<Result<FichaPublica>> {
  try {
    const cuentaId = await laCuentaDelCodigo(codigo);
    // Un código que no está o está apagado se contesta igual que uno que nunca
    // existió: decir «existe pero está cerrado» ya cuenta algo de una cuenta a
    // quien solo tiene una cadena de texto.
    if (!cuentaId) throw new Error("Este enlace ya no está disponible.");

    const [cuenta, paises] = await Promise.all([
      db.user.findUnique({
        where: { id: cuentaId },
        select: {
          name: true,
          company: true,
          brandName: true,
          email: true,
          image: true,
          notificationNumber: true,
        },
      }),
      getCountryCodes(),
    ]);
    if (!cuenta) throw new Error("Este enlace ya no está disponible.");

    const indicativos = paises.flatMap((p) => p.codes);

    return {
      success: true,
      message: "",
      data: {
        // El nombre comercial primero: es con el que el cliente la conoce.
        cuentaNombre:
          cuenta.brandName?.trim() ||
          cuenta.company?.trim() ||
          cuenta.name?.trim() ||
          cuenta.email,
        cuentaLogo: cuenta.image?.trim() || null,
        paises: paises.map((p) => ({ name: p.name, codes: [...p.codes], flag: p.flag })),
        // **El país de la cuenta sale de su propio número**, que es el único
        // dato de país que hay en la fila: no existe ninguna columna de país, y
        // añadirla a `User` desde la App es lo que reventó el #360. Si no se
        // reconoce, Colombia — que es donde está casi toda la plataforma— y en
        // cualquier caso se puede cambiar.
        indicativoPorDefecto:
          elIndicativoDeUnNumero(cuenta.notificationNumber, indicativos) ?? "+57",
      },
    };
  } catch (error) {
    console.warn("[tickets] no se pudo abrir una ficha pública", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: error instanceof Error ? error.message : "Este enlace ya no está disponible.",
    };
  }
}

const adjuntoSchema = z.object({
  url: z.string().trim().url(),
  nombre: z.string().trim().min(1).max(300),
  tipo: z.enum(TIPOS_DE_ADJUNTO),
  mimeType: z.string().trim().max(200).optional(),
  tamanoBytes: z.number().int().nonnegative().optional(),
});

const enviarSchema = z.object({
  codigo: z.string().trim().min(1).max(64),
  nombre: z.string().trim().min(1).max(TOPE_DEL_NOMBRE),
  /** El indicativo elegido en el selector. */
  indicativo: z.string().trim().min(1).max(8),
  /** Lo que se tecleó en el campo del número, tal cual. */
  telefono: z.string().trim().min(1).max(40),
  titulo: z.string().trim().min(1).max(TOPE_DEL_TITULO),
  descripcion: z.string().trim().min(1).max(TOPE_DE_LA_DESCRIPCION),
  adjuntos: z.array(adjuntoSchema).max(TOPE_DE_ADJUNTOS_POR_TICKET).default([]),
});

export async function enviarTicketPublicoAction(
  input: z.infer<typeof enviarSchema>,
): Promise<Result<{ id: string }>> {
  try {
    const parsed = enviarSchema.parse(input);

    const cuentaId = await laCuentaDelCodigo(parsed.codigo);
    if (!cuentaId) throw new Error("Este enlace ya no está disponible.");

    // El número se arma **aquí también**, con la misma función que lo armó en
    // la pantalla. Lo que llega del navegador es lo tecleado, no el resultado:
    // dar por bueno el número final sería dejar que quien manda la petición
    // elija a qué teléfono se le avisa después.
    const paises = await getCountryCodes();
    const numero = armarElNumero({
      indicativo: parsed.indicativo,
      escrito: parsed.telefono,
      indicativos: paises.flatMap((p) => p.codes),
    });
    if (numero.problema) throw new Error(numero.problema);

    const falta = queLeFaltaALaFichaPublica({
      nombre: parsed.nombre,
      telefono: numero.e164,
      titulo: parsed.titulo,
      descripcion: parsed.descripcion,
    });
    if (falta) throw new Error(falta);

    // Y los archivos: se admiten **solo los de la carpeta de esta cuenta**. La
    // dirección llega del navegador, así que sin esto el ticket pintaría un
    // `<img>` —o peor, un `<video>`— apuntando a donde le dijeran, dentro del
    // tablero de quien atiende. Es la misma regla, y la misma función, que
    // valida un adjunto del chat de equipo.
    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    const adjuntos = parsed.adjuntos.filter((a) => {
      const destino = llaveDelArchivoSubido(a.url, process.env.S3_PUBLIC_URL, bucket);
      return destino?.userID === cuentaId;
    });
    if (adjuntos.length !== parsed.adjuntos.length) {
      // No se cae el envío por esto —el ticket vale sin sus fotos— pero no
      // puede ser mudo: un adjunto que desaparece sin decirlo se lee como que
      // la subida no funciona.
      console.warn("[tickets] la ficha pública mandó adjuntos que no son suyos", {
        cuenta: cuentaId,
        mandados: parsed.adjuntos.length,
        admitidos: adjuntos.length,
      });
    }

    // El lead va ANTES de crear el ticket, para que la fila nazca ya
    // enganchada: al revés habría un momento en el que el ticket existe sin
    // contacto, y si el enganche fallara se quedaría así para siempre.
    const sessionId = await elLeadDelContacto({
      cuentaId,
      numero: numero.e164,
      nombre: parsed.nombre,
    });

    const id = randomUUID();
    await crearElTicket({
      id,
      // Las dos son la cuenta dueña del enlace: el ticket **es suyo** y lo
      // atiende ella. `origen` es lo único que lo distingue de uno que abrió
      // alguien con cuenta, y es lo que lo mantiene fuera de «Mis tickets».
      clienteId: cuentaId,
      destinoId: cuentaId,
      // Quien lo escribió no tiene fila en `User`: no hay persona que firmar.
      // Se queda la cuenta, y quién fue de verdad está en `contactoNombre`.
      creadoPorId: cuentaId,
      origen: "publico",
      contactoNombre: parsed.nombre,
      sessionId,
      titulo: parsed.titulo,
      descripcion: parsed.descripcion,
      whatsapp: soloDigitos(numero.e164),
      // Entra **con prioridad normal y sin responsable**, para que lo asigne el
      // dueño: dejar que el cliente final elija quién lo atiende y con qué
      // urgencia es darle mandos sobre el equipo de otro.
      responsableId: null,
      venceEl: null,
      adjuntos: adjuntos.map((a) => ({
        id: randomUUID(),
        url: a.url,
        nombre: a.nombre,
        tipo: a.tipo,
        mimeType: a.mimeType ?? null,
        tamanoBytes: a.tamanoBytes ?? null,
      })),
    });

    // Al final de «recibido», como cualquier otro: colarse por delante pisaría
    // el orden que puso alguien a mano en el tablero.
    await alFinalDelTablero("tickets", cuentaId, id);

    revalidatePath("/tickets");
    return { success: true, message: "Listo, ya lo recibimos.", data: { id } };
  } catch (error) {
    console.error("[enviarTicketPublicoAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo enviar tu solicitud.",
    };
  }
}
