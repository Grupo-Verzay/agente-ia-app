// Normaliza a E.164 con el country code seleccionado en el <CountryCodeSelect />
export const normalizeToE164 = (area: string, raw: string): string | null => {
    const cc = (area || "").replace(/\D/g, "");   // ej. "+58" -> "58"
    let nsn = (raw || "").replace(/\D/g, "");     // solo dígitos

    // Si el usuario pegó el número con el código de país, evítalo (queda solo NSN)
    if (cc && nsn.startsWith(cc)) nsn = nsn.slice(cc.length);

    // Quitar prefijos locales (ceros a la izquierda)
    nsn = nsn.replace(/^0+/, "");

    // Validación básica de longitudes E.164 (3-15 dígitos sin '+', ajusta si quieres)
    const digits = `${cc}${nsn}`;
    if (!cc || nsn.length < 6 || digits.length > 15) return null;

    return `+${digits}`;
};

// Convierte E.164 a JID de WhatsApp
export const toRemoteJid = (e164: string) => e164.replace("+", "") + "@s.whatsapp.net";
