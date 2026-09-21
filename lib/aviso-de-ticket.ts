/**
 * A quién le salta un ticket, y a dónde lleva su aviso.
 *
 * **Puro a propósito**: de aquí tiran la acción de la ficha pública, la de
 * abrir un ticket desde dentro y el trabajo diario de los vencimientos. Con la
 * regla escrita en cada uno, el cuarto se olvidaría de alguien — y eso no se ve
 * como un error, se ve como que «a mí los tickets no me llegan».
 *
 * # Por qué reutiliza la tubería de las menciones y no estrena una
 *
 * Un ticket que entra por el enlace público saca **la misma ventana que
 * interrumpe** que una mención del chat del equipo: la misma tabla
 * (`task_alerts`), la misma campanita y el mismo clic obligatorio. Es la regla
 * que este proyecto lleva escrita desde que el chat de equipo nació: *un aviso
 * más, en otro sitio y con otra forma de despacharse, se aprende a ignorar* —y
 * el precio no es ese aviso, es que con él se empiezan a despachar sin leer los
 * que ya funcionaban—.
 *
 * Lo único que distingue a un aviso de ticket es su `tipo` y que **no cuelga de
 * ninguna tarea** (`taskId: null`), igual que los del chat: de ahí sale que el
 * clic aterrice por el `enlace`.
 */

/** La ruta del módulo. Quien no la alcanza no recibe ningún aviso de ticket. */
export const RUTA_DE_TICKETS = "/tickets";

/**
 * A dónde lleva el aviso: al tablero, **con el ticket ya abierto**.
 *
 * Una sola función para los tres sitios que escriben este enlace. Aterrizar en
 * la lista y dejar buscar la tarjeta no es llegar: en una cuenta con cientos de
 * tickets es no llegar. El parámetro es el que ya lee `TicketsDeSoporteClient`
 * (`useAterrizajeDeMencion({ clave: "ticket" })`), que es por donde aterriza
 * también una mención de Documentación — no se estrena ningún camino.
 */
export function elEnlaceDelTicket(id: string): string {
  return `/tickets?ticket=${encodeURIComponent(id)}`;
}

/** Lo que el aviso enseña como título. Sin quién, no se inventa a nadie. */
export function tituloDelAvisoDeTicket(quien: string | null | undefined): string {
  const persona = (quien ?? "").trim();
  return persona ? `${persona} abrió un ticket de soporte` : "Nuevo ticket de soporte";
}

export type AQuienAvisaUnTicket = {
  /** Los que reciben el aviso. Puede salir vacío, y eso es un dato. */
  destinatarios: string[];
  /** `true` cuando manda el responsable: el aviso es suyo y de nadie más. */
  soloElResponsable: boolean;
  /**
   * El ticket tiene responsable y **ese responsable no alcanza el módulo**.
   *
   * Se devuelve aparte para que quien llama lo diga: es el único caso en el que
   * esta función se queda sin nadie a quien avisar teniendo a alguien asignado,
   * y callarlo se lee como «a esta persona no le llega nada». No es un fallo
   * del aviso: es una cuenta mal configurada, y hay que poder verlo.
   */
  elResponsableNoAlcanza: boolean;
};

/**
 * **La regla**, y es una frase: *si el ticket tiene responsable, el aviso es
 * suyo; si no, es de todo el que alcance el módulo.*
 *
 * Un ticket recién llegado no tiene a nadie asignado —lo abre un cliente, y el
 * cliente no reparte el trabajo del equipo que lo atiende—, así que va a todos:
 * lo contrario sería un aviso que no despierta a nadie hasta que alguien se
 * asome al tablero por su cuenta, que es justo lo que esto viene a evitar. En
 * cuanto alguien se lo asigna, **deja de ser de todos**: seguir avisando al
 * equipo entero de un ticket que ya tiene dueño es exactamente el aviso de más
 * que enseña a despachar los avisos sin leer.
 *
 * Y el responsable pasa por el MISMO filtro de módulo que los demás: un aviso
 * que lleva a una pantalla que esa persona no puede abrir es peor que no
 * mandarlo. Cuando eso pasa, se dice (`elResponsableNoAlcanza`).
 */
export function aQuienAvisaUnTicket(input: {
  responsableId?: string | null;
  /** Las personas de la cuenta que ALCANZAN el módulo, ya resueltas. */
  conAcceso: readonly string[];
}): AQuienAvisaUnTicket {
  const conAcceso = Array.from(
    new Set((input.conAcceso ?? []).map((id) => (id ?? "").trim()).filter(Boolean)),
  );
  const responsable = (input.responsableId ?? "").trim();

  if (responsable) {
    const alcanza = conAcceso.includes(responsable);
    return {
      destinatarios: alcanza ? [responsable] : [],
      soloElResponsable: true,
      elResponsableNoAlcanza: !alcanza,
    };
  }

  return {
    destinatarios: conAcceso,
    soloElResponsable: false,
    elResponsableNoAlcanza: false,
  };
}
