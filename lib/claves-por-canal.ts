/**
 * Las claves de cada canal del Agente IA, y si están puestas.
 *
 * Antes había UNA configuración de claves (Perfil › Integraciones › Proveedor
 * de IA), de cuando la plataforma solo tenía WhatsApp, y la voz escondida en
 * el «⋯» del editor. Ahora cada canal tiene su botón «Claves» a la vista,
 * antes de «Guardar», con lo que ESE canal necesita para funcionar.
 *
 * Cada «sección» dice DÓNDE vive de verdad su clave. No se inventa un almacén
 * nuevo que nadie lee: el backend sigue leyendo la clave del agente en
 * `user_ai_configs`, la de la voz en `User`, la del avatar en
 * `videollamada_ajustes` y la de cada línea en `Instancias`. Una clave
 * guardada donde el motor no mira sería un fallo mudo.
 *
 * Puro: lo usan el servidor (estado) y el navegador (títulos, colores).
 */

import type { ClaveVistaDesdeElNavegador } from "@/lib/clave-de-ia-para-el-navegador";

export type SeccionDeClaves =
    | "mensajeria"
    | "voz"
    | "llamadas"
    | "videollamadas"
    | "linea-whatsapp-api"
    | "linea-telegram"
    | "linea-facebook"
    | "linea-instagram";

export type ProveedorDeLaSeccion = {
    id: string;
    nombre: string;
    /** `false` = se ve como «Próximamente»: la estructura ya está, el motor aún no. */
    disponible: boolean;
};

export type DefinicionDeSeccion = {
    titulo: string;
    descripcion: string;
    proveedores: ProveedorDeLaSeccion[];
};

export const SECCIONES_DE_CLAVES: Record<SeccionDeClaves, DefinicionDeSeccion> = {
    mensajeria: {
        titulo: "Mensajería",
        descripcion: "El modelo de IA que escribe las respuestas del agente.",
        proveedores: [
            { id: "google", nombre: "Google", disponible: true },
            { id: "openai", nombre: "OpenAI", disponible: true },
        ],
    },
    voz: {
        titulo: "Voz",
        descripcion: "Las notas de voz con las que responde el agente.",
        proveedores: [
            { id: "openai", nombre: "OpenAI TTS", disponible: true },
            { id: "elevenlabs", nombre: "ElevenLabs", disponible: true },
        ],
    },
    llamadas: {
        titulo: "Llamadas con IA",
        descripcion: "La IA que habla en las llamadas de voz.",
        proveedores: [
            { id: "openai", nombre: "OpenAI", disponible: true },
            { id: "elevenlabs", nombre: "ElevenLabs", disponible: false },
        ],
    },
    videollamadas: {
        titulo: "Avatar de videollamada",
        descripcion: "Con qué se hace la videollamada: Tavus (su avatar) o el motor propio de Verzay (el logo de Verzay que habla).",
        proveedores: [
            { id: "tavus", nombre: "Tavus", disponible: true },
            { id: "verzay", nombre: "Motor propio de Verzay", disponible: true },
        ],
    },
    "linea-whatsapp-api": {
        titulo: "Línea de WhatsApp API",
        descripcion: "El Phone Number ID y el token de acceso de Meta.",
        proveedores: [{ id: "meta", nombre: "Meta", disponible: true }],
    },
    "linea-telegram": {
        titulo: "Bot de Telegram",
        descripcion: "El token del bot que da @BotFather.",
        proveedores: [{ id: "telegram", nombre: "Telegram", disponible: true }],
    },
    "linea-facebook": {
        titulo: "Página de Facebook",
        descripcion: "El Page ID y el token de acceso de la página.",
        proveedores: [{ id: "meta", nombre: "Meta", disponible: true }],
    },
    "linea-instagram": {
        titulo: "Cuenta de Instagram",
        descripcion: "El Instagram Account ID y el token de acceso.",
        proveedores: [{ id: "meta", nombre: "Meta", disponible: true }],
    },
};

/**
 * Qué secciones tiene el botón «Claves» de cada canal (por el `slug` de
 * `lib/channel-training.ts`). Los canales de chat que no son WhatsApp llevan
 * su línea y, debajo, la IA de mensajería: sin ella el agente tampoco contesta
 * por ese canal.
 */
export const CLAVES_POR_CANAL: Record<string, SeccionDeClaves[]> = {
    whatsapp: ["mensajeria", "voz"],
    llamadas: ["llamadas"],
    videollamadas: ["videollamadas"],
    "whatsapp-api": ["linea-whatsapp-api", "mensajeria"],
    telegram: ["linea-telegram", "mensajeria"],
    facebook: ["linea-facebook", "mensajeria"],
    instagram: ["linea-instagram", "mensajeria"],
};

export function lasSeccionesDelCanal(canal: string | null | undefined): SeccionDeClaves[] {
    return CLAVES_POR_CANAL[String(canal ?? "")] ?? [];
}

/** `apagada` = no hace falta clave (p. ej. las notas de voz desactivadas): no avisa. */
export type EstadoDeLaClave = "lista" | "pendiente" | "apagada";

export type LineaDelCanal = {
    instanceName: string;
    nombre: string;
    /** Phone Number ID, Page ID, Instagram Account ID o @usuario del bot. */
    identificador: string | null;
    clave: ClaveVistaDesdeElNavegador;
};

export type EstadoDeSeccion = {
    seccion: SeccionDeClaves;
    estado: EstadoDeLaClave;
    /** Una línea para la tarjeta: proveedor y clave ENMASCARADA, o lo que falta. */
    detalle: string;
    /** Solo las secciones de línea. */
    lineas?: LineaDelCanal[];
    /** Solo videollamadas: el avatar (persona) propio guardado. No es secreto. */
    personaId?: string;
    /** Solo videollamadas: el proveedor elegido (`tavus` o `verzay`). */
    proveedor?: string;
    /** Solo videollamadas: si la clave de Tavus está guardada (para volver a Tavus sin escribirla). */
    hayTavus?: boolean;
};

/** El botón avisa si CUALQUIER sección está pendiente; las apagadas no cuentan. */
export function elEstadoDelBoton(secciones: Array<Pick<EstadoDeSeccion, "estado">>): "lista" | "pendiente" {
    return secciones.some((s) => s.estado === "pendiente") ? "pendiente" : "lista";
}

/** Cómo se enseña una clave guardada: nunca entera, a lo sumo sus 4 últimos. */
export function comoSeEnsenaLaClave(clave: ClaveVistaDesdeElNavegador): string {
    if (!clave.tieneClave) return "Sin clave";
    return clave.finalDeLaClave ? `•••• ${clave.finalDeLaClave}` : "••••••••";
}

function nombreDelProveedor(nombre: string | null | undefined): string {
    const n = String(nombre ?? "").trim().toLowerCase();
    if (n === "openai") return "OpenAI";
    if (n === "google") return "Google";
    return String(nombre ?? "").trim() || "Proveedor";
}

/* ── Las reglas de cada sección, sobre datos ya leídos ─────────────────── */

export type ConfigDeIa = {
    providerId: string;
    proveedor: string;
    isActive: boolean;
    clave: ClaveVistaDesdeElNavegador;
};

/**
 * La IA de mensajería: la clave del proveedor por defecto, que es la que usa
 * el motor; sin proveedor por defecto, la primera activa con clave.
 */
export function elEstadoDeLaMensajeria(configs: ConfigDeIa[], proveedorPorDefecto: string | null): EstadoDeSeccion {
    const conClave = configs.filter((c) => c.clave.tieneClave);
    const elegida = proveedorPorDefecto
        ? conClave.find((c) => c.providerId === proveedorPorDefecto)
        : conClave.find((c) => c.isActive) ?? conClave[0];
    if (!elegida) {
        const cual = proveedorPorDefecto ? configs.find((c) => c.providerId === proveedorPorDefecto)?.proveedor : null;
        return {
            seccion: "mensajeria",
            estado: "pendiente",
            detalle: cual ? `Falta la clave de ${nombreDelProveedor(cual)}` : "Falta la clave de IA",
        };
    }
    return {
        seccion: "mensajeria",
        estado: "lista",
        detalle: `${nombreDelProveedor(elegida.proveedor)} · ${comoSeEnsenaLaClave(elegida.clave)}`,
    };
}

/** La clave de OpenAI: la activa primero (igual que `laClaveDeOpenAiEntre`). */
export function laConfigDeOpenAi(configs: ConfigDeIa[]): ConfigDeIa | null {
    const deOpenAi = configs.filter((c) => c.proveedor.trim().toLowerCase() === "openai" && c.clave.tieneClave);
    return deOpenAi.find((c) => c.isActive) ?? deOpenAi[0] ?? null;
}

export function elEstadoDeLaVoz(voz: {
    activada: boolean;
    proveedor: string;
    claveElevenLabs: ClaveVistaDesdeElNavegador;
    vozElevenLabs: string;
    vozOpenAi: string;
    openAi: ConfigDeIa | null;
}): EstadoDeSeccion {
    if (!voz.activada) return { seccion: "voz", estado: "apagada", detalle: "Notas de voz desactivadas" };
    if (voz.proveedor === "elevenlabs") {
        if (!voz.claveElevenLabs.tieneClave) return { seccion: "voz", estado: "pendiente", detalle: "Falta la clave de ElevenLabs" };
        if (!voz.vozElevenLabs.trim()) return { seccion: "voz", estado: "pendiente", detalle: "Falta elegir la voz de ElevenLabs" };
        return { seccion: "voz", estado: "lista", detalle: `ElevenLabs · ${comoSeEnsenaLaClave(voz.claveElevenLabs)}` };
    }
    if (!voz.openAi) return { seccion: "voz", estado: "pendiente", detalle: "Falta la clave de OpenAI" };
    return { seccion: "voz", estado: "lista", detalle: `OpenAI TTS · voz ${voz.vozOpenAi || "nova"}` };
}

export function elEstadoDeLasLlamadas(openAi: ConfigDeIa | null): EstadoDeSeccion {
    if (!openAi) return { seccion: "llamadas", estado: "pendiente", detalle: "Falta la clave de OpenAI" };
    return { seccion: "llamadas", estado: "lista", detalle: `OpenAI · ${comoSeEnsenaLaClave(openAi.clave)}` };
}

/**
 * La videollamada, según su proveedor. Con Tavus: sin avatar propio NO hay
 * videollamada con IA (no existe avatar de respaldo). Con el motor propio: la
 * clave de OpenAI de la cuenta (la misma de Llamadas con IA).
 */
export function elEstadoDelAvatar(avatar: {
    propio: { personaId: string; clave: ClaveVistaDesdeElNavegador } | null;
    proveedor?: string;
    openAi?: ConfigDeIa | null;
}): EstadoDeSeccion {
    const comun = { seccion: "videollamadas" as const, proveedor: avatar.proveedor === "verzay" ? "verzay" : "tavus", hayTavus: !!avatar.propio, ...(avatar.propio ? { personaId: avatar.propio.personaId } : {}) };
    if (avatar.proveedor === "verzay") {
        if (!avatar.openAi) return { ...comun, estado: "pendiente", detalle: "Motor propio de Verzay · falta la clave de OpenAI (la de Llamadas con IA)" };
        return { ...comun, estado: "lista", detalle: `Motor propio de Verzay · OpenAI ${comoSeEnsenaLaClave(avatar.openAi.clave)}` };
    }
    if (avatar.propio) {
        return { ...comun, estado: "lista", detalle: `Tavus · ${comoSeEnsenaLaClave(avatar.propio.clave)} · avatar ${avatar.propio.personaId}` };
    }
    return { ...comun, estado: "pendiente", detalle: "Falta tu clave y tu avatar de Tavus: sin ellos no hay videollamada con IA" };
}

export function elEstadoDeLaLinea(seccion: SeccionDeClaves, lineas: LineaDelCanal[]): EstadoDeSeccion {
    if (!lineas.length) return { seccion, estado: "pendiente", detalle: "Sin línea conectada", lineas };
    const sinClave = lineas.filter((l) => !l.clave.tieneClave).length;
    if (sinClave) {
        return { seccion, estado: "pendiente", detalle: sinClave === 1 ? "Una línea sin token" : `${sinClave} líneas sin token`, lineas };
    }
    const detalle = lineas.length === 1
        ? `${lineas[0].identificador ?? lineas[0].nombre} · ${comoSeEnsenaLaClave(lineas[0].clave)}`
        : `${lineas.length} líneas conectadas`;
    return { seccion, estado: "lista", detalle, lineas };
}

/** Qué filas de `Instancias` son las líneas de cada sección de línea. */
export function esLineaDeLaSeccion(
    seccion: SeccionDeClaves,
    fila: { instanceType: string | null; metaChannel: string | null },
): boolean {
    const tipo = String(fila.instanceType ?? "").toLowerCase();
    const canal = String(fila.metaChannel ?? "whatsapp").toLowerCase();
    switch (seccion) {
        case "linea-telegram":
            return tipo === "telegram";
        case "linea-whatsapp-api":
            return tipo === "meta" && canal === "whatsapp";
        case "linea-facebook":
            return tipo === "meta" && canal === "facebook";
        case "linea-instagram":
            return tipo === "meta" && canal === "instagram";
        default:
            return false;
    }
}

export function esSeccionDeLinea(seccion: SeccionDeClaves): boolean {
    return seccion.startsWith("linea-");
}
