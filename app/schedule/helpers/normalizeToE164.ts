// Normaliza a E.164 con el country code seleccionado en el <CountryCodeSelect />
export const normalizeToE164 = (area: string, raw: string): string | null => {
    const cc = (area || "").replace(/\D/g, "");   // ej. "+58" -> "58"
    let nsn = (raw || "").replace(/\D/g, "");     // solo dígitos

    // Si el usuario pegó el número con el código de país completo, evítalo (queda solo NSN)
    if (cc && nsn.startsWith(cc)) {
        nsn = nsn.slice(cc.length);
    } else if (cc.startsWith("1") && cc.length === 4 && nsn.startsWith(cc.slice(1))) {
        // NANP (+1 + área de 3 díg., ej. RD 1829/1809/1849, PR 1787/1939):
        // el cliente suele escribir su número CON el área pero SIN el "1"
        // (ej. cc="1829" y escribe "8294275026"). Evita duplicar el área.
        nsn = nsn.slice(cc.length - 1);
    }

    // Quitar prefijos locales (ceros a la izquierda)
    nsn = nsn.replace(/^0+/, "");

    // Validación básica de longitudes E.164 (3-15 dígitos sin '+', ajusta si quieres)
    const digits = `${cc}${nsn}`;
    if (!cc || nsn.length < 6 || digits.length > 15) return null;

    return `+${digits}`;
};

// Convierte E.164 a JID de WhatsApp
export const toRemoteJid = (e164: string) => e164.replace("+", "") + "@s.whatsapp.net";
