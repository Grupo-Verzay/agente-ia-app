/**
 * Editar a un asesor del equipo: la DECISIÓN, sin base de datos.
 *
 * El menú de tres puntos de Equipo cambió «Cambiar contraseña» por «Editar
 * asesor», una ventana con cuatro campos —nombre, correo, contraseña y rol—.
 * Lo delicado no es el `UPDATE`: es qué se acepta y qué se rechaza, y eso vive
 * aquí, puro, para poder probarlo sin levantar Postgres.
 *
 * La regla que sostiene todo lo demás: **el id que llega del navegador no
 * decide nada, y el dato que llega tampoco**. Esta función recibe los HECHOS ya
 * resueltos —el correo de hoy del asesor y si otro usuario ya usa el correo
 * pedido, que la acción averigua contra la base— y contesta con la decisión.
 * Es el mismo reparto de *quién paga la IA se PREGUNTA*: quien sabe consultar
 * consulta, y la regla solo cruza booleanos.
 *
 * La contraseña es el caso que más fácil se hace mal: **vacía NO es "ponla en
 * blanco", es "no la toques"**. Un `UPDATE` que escribe la contraseña siempre
 * dejaría a medio equipo sin poder entrar en cuanto alguien edite solo el
 * nombre. Por eso `nuevaContrasena` es `null` cuando se deja vacía.
 */

/** Los dos roles que ofrece el selector de la tabla, y ningún otro. */
export type RolDeAsesor = "agente" | "administrador";
export const ROLES_DE_ASESOR: readonly RolDeAsesor[] = ["agente", "administrador"];

export function esRolDeAsesor(v: string): v is RolDeAsesor {
  return (ROLES_DE_ASESOR as readonly string[]).includes(v);
}

/**
 * Un correo con formato razonable: algo, una arroba, un dominio con punto.
 *
 * No se busca cazar cada RFC —eso lo hace rebotar el proveedor de correo—, solo
 * descartar lo que a ojo no es una dirección: sin arroba, sin dominio, con
 * espacios. Es la misma exigencia que el `.email()` de Zod que ya usa el alta.
 */
export function esCorreoValido(correo: string): boolean {
  const c = correo.trim();
  if (!c || /\s/.test(c)) return false;
  return /^[^@]+@[^@]+\.[^@]+$/.test(c);
}

export type EntradaDeEdicion = {
  nombre: string;
  correo: string;
  /** Vacío = no cambiar la contraseña. */
  contrasena: string;
  rol: string;
};

export type ContextoDeEdicion = {
  /** El correo que el asesor tiene HOY, para saber si de verdad cambia. */
  correoActual: string;
  /**
   * ¿Otro usuario distinto de este asesor ya usa el correo pedido? Lo resuelve
   * la acción contra la base; aquí solo se cruza.
   */
  correoYaUsado: boolean;
};

export type ResultadoDeEdicion =
  | { ok: false; motivo: string }
  | {
      ok: true;
      nombre: string;
      /** Ya normalizado: recortado y en minúsculas, listo para guardar. */
      correo: string;
      rol: RolDeAsesor;
      /** Si el correo cambia respecto al de hoy (para no escribir de más). */
      cambiaCorreo: boolean;
      /** La contraseña nueva en claro, o `null` si no se toca. */
      nuevaContrasena: string | null;
    };

/**
 * Valida y normaliza una edición de asesor. Devuelve el motivo del rechazo con
 * palabras que se puedan enseñar tal cual: un aviso vago manda a adivinar.
 */
export function validarEdicionDeAsesor(
  entrada: EntradaDeEdicion,
  contexto: ContextoDeEdicion,
): ResultadoDeEdicion {
  const nombre = entrada.nombre?.trim() ?? "";
  if (!nombre) return { ok: false, motivo: "El nombre es obligatorio." };

  const correo = entrada.correo?.trim().toLowerCase() ?? "";
  if (!esCorreoValido(correo)) {
    return { ok: false, motivo: "El correo no tiene un formato válido." };
  }

  // `correoYaUsado` ya significa "otro usuario distinto tiene este correo", así
  // que reeditar sin tocar el correo nunca choca consigo mismo.
  if (contexto.correoYaUsado) {
    return { ok: false, motivo: "Ese correo ya está en uso por otro usuario." };
  }

  const rol = entrada.rol?.trim() ?? "";
  if (!esRolDeAsesor(rol)) {
    return { ok: false, motivo: "El rol elegido no es válido." };
  }

  // La contraseña: vacía se deja como está; con algo, mínimo 6 como en el alta.
  // Se recorta igual que el alta y el «Cambiar contraseña» de siempre, así que
  // solo espacios cuenta como "no la toques".
  const contrasena = (entrada.contrasena ?? "").trim();
  let nuevaContrasena: string | null = null;
  if (contrasena.length > 0) {
    if (contrasena.length < 6) {
      return { ok: false, motivo: "La contraseña debe tener al menos 6 caracteres." };
    }
    nuevaContrasena = contrasena;
  }

  return {
    ok: true,
    nombre,
    correo,
    rol,
    cambiaCorreo: correo !== (contexto.correoActual?.trim().toLowerCase() ?? ""),
    nuevaContrasena,
  };
}
