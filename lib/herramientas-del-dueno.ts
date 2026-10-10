/**
 * Las herramientas del Modo Dueño y el MÓDULO del que cuelga cada una.
 *
 * Es la tabla «herramienta → módulo» que faltaba: antes de consultar o de
 * preparar cualquier acción, el motor pregunta si la cuenta ALCANZA alguna de
 * estas rutas con la misma regla que pinta los candados del menú
 * (`cuentaAlcanzaLaRuta`, vía `quienesAlcanzanLaRuta`). Si no alcanza ninguna,
 * la función no está en su plan y no se hace.
 *
 * Una herramienta puede vivir en varias pantallas (los leads se ven en el
 * embudo y en «Leads»): basta con alcanzar una. `rutas: null` = no depende de
 * un módulo (el historial y deshacer, que son la propia gobernanza).
 *
 * `irreversible` es lo que el dueño ve ANTES de confirmar: un mensaje enviado
 * no se puede «desenviar». Puede depender de los datos (descartar un lead borra
 * sus seguimientos programados, y eso no vuelve).
 */

export type TipoDeHerramienta = "consulta" | "accion";

export type HerramientaDelDueno = {
  nombre: string;
  /** Nombre del módulo para decírselo al dueño («no está en tu plan: X»). */
  modulo: string;
  rutas: string[] | null;
  tipo: TipoDeHerramienta;
  irreversible?: (args: Record<string, unknown>) => string | null;
};

const SIEMPRE = null;

export const HERRAMIENTAS_DEL_DUENO: Record<string, HerramientaDelDueno> = {
  // ── Consultas ──
  owner_resumen_dia: { nombre: "owner_resumen_dia", modulo: "Tareas y Agenda", rutas: ["/tareas", "/schedule"], tipo: "consulta" },
  owner_listar_citas: { nombre: "owner_listar_citas", modulo: "Agenda de citas", rutas: ["/schedule", "/bookings"], tipo: "consulta" },
  owner_listar_tareas: { nombre: "owner_listar_tareas", modulo: "Tareas", rutas: ["/tareas"], tipo: "consulta" },
  owner_listar_leads: { nombre: "owner_listar_leads", modulo: "Leads / CRM", rutas: ["/sessions", "/crm", "/crm/kanban"], tipo: "consulta" },
  owner_listar_conversaciones: { nombre: "owner_listar_conversaciones", modulo: "Chats", rutas: ["/chats"], tipo: "consulta" },
  owner_listar_productos: { nombre: "owner_listar_productos", modulo: "Productos", rutas: ["/products", "/mis-catalogo"], tipo: "consulta" },
  owner_listar_pagos: { nombre: "owner_listar_pagos", modulo: "Finanzas", rutas: ["/dashboard/finance"], tipo: "consulta" },
  owner_buscar_contacto: { nombre: "owner_buscar_contacto", modulo: "Chats / Leads", rutas: ["/chats", "/sessions", "/crm"], tipo: "consulta" },
  owner_ver_entrenamiento: { nombre: "owner_ver_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "consulta" },
  owner_listar_revisiones_entrenamiento: { nombre: "owner_listar_revisiones_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "consulta" },
  owner_ver_historial_acciones: { nombre: "owner_ver_historial_acciones", modulo: "Modo Dueño", rutas: SIEMPRE, tipo: "consulta" },

  // ── Acciones (todas piden confirmación) ──
  owner_crear_tarea: { nombre: "owner_crear_tarea", modulo: "Tareas", rutas: ["/tareas"], tipo: "accion" },
  owner_crear_recordatorio: { nombre: "owner_crear_recordatorio", modulo: "Tareas", rutas: ["/tareas"], tipo: "accion" },
  owner_enviar_mensaje: {
    nombre: "owner_enviar_mensaje",
    modulo: "Chats",
    rutas: ["/chats"],
    tipo: "accion",
    irreversible: () => "un mensaje enviado no se puede retirar",
  },
  owner_mover_lead: {
    nombre: "owner_mover_lead",
    modulo: "Leads / CRM",
    rutas: ["/crm/kanban", "/crm", "/sessions"],
    tipo: "accion",
    irreversible: (args) =>
      args?.status === "DESCARTADO"
        ? "al descartarlo se borran sus seguimientos programados, y eso no vuelve aunque se deshaga el cambio de estado"
        : null,
  },
  owner_etiquetar_contacto: { nombre: "owner_etiquetar_contacto", modulo: "Etiquetas", rutas: ["/tags", "/chats"], tipo: "accion" },
  owner_asignar_asesor: { nombre: "owner_asignar_asesor", modulo: "Equipo", rutas: ["/equipo"], tipo: "accion" },
  owner_agregar_instruccion_entrenamiento: { nombre: "owner_agregar_instruccion_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "accion" },
  owner_editar_instruccion_entrenamiento: { nombre: "owner_editar_instruccion_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "accion" },
  owner_eliminar_instruccion_entrenamiento: { nombre: "owner_eliminar_instruccion_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "accion" },
  owner_restaurar_entrenamiento: { nombre: "owner_restaurar_entrenamiento", modulo: "Agente de IA", rutas: ["/ia", "/ai"], tipo: "accion" },
  owner_revertir_accion: { nombre: "owner_revertir_accion", modulo: "Modo Dueño", rutas: SIEMPRE, tipo: "accion" },
};

export function laHerramienta(nombre: string): HerramientaDelDueno | null {
  return HERRAMIENTAS_DEL_DUENO[nombre] ?? null;
}

/** Por qué no se puede deshacer, o `null` si sí se puede. */
export function porQueEsIrreversible(nombre: string, args: Record<string, unknown>): string | null {
  return laHerramienta(nombre)?.irreversible?.(args) ?? null;
}

/** El texto que el dueño ve para confirmar. Lo arma el servidor, no la IA. */
export function textoDeConfirmacion(resumen: string, irreversible: string | null): string {
  const partes = [`📝 *Por confirmar:* ${resumen}`];
  if (irreversible) partes.push(`⚠️ *Esto no se puede deshacer:* ${irreversible}.`);
  partes.push("Responde *sí* para hacerlo o *no* para cancelarlo.");
  return partes.join("\n\n");
}
