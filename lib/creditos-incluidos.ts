/**
 * Los créditos de IA de un plan son «incluidos», nunca «gratis».
 *
 * «Gratis» promete algo que no se cobra, y los créditos van dentro del precio
 * del plan: se pagan con él. Los textos que hoy escribe el panel lo dicen así
 * —«8.000 créditos totalmente gratis IA»—, en `features` y en las funciones de
 * cada plan, y se ven en la landing, en la de un reseller y en la página del
 * plan. Se cambia AL PINTAR, sin tocar lo guardado: así vale para lo que ya
 * está escrito y para lo que se escriba mañana con la palabra de antes.
 *
 * Solo se toca una línea que habla de CRÉDITOS. «Cuenta adicional gratis» o
 * «prueba gratis» no son créditos y se quedan como están.
 */

const CREDITOS = /cr[eé]ditos?/i;

/** «8.000 créditos totalmente gratis IA» → «8.000 créditos de IA incluidos». */
export function conCreditosIncluidos(texto: string): string {
    if (typeof texto !== "string" || !CREDITOS.test(texto) || !/gratis/i.test(texto)) return texto;
    let fuera = texto
        // «totalmente gratis», «completamente gratis», «100% gratis» → «gratis».
        .replace(/\b(?:totalmente|completamente|absolutamente)\s+gratis\b/gi, "gratis")
        .replace(/\b100\s*%\s*gratis\b/gi, "gratis")
        // «8.000 créditos gratis IA» / «gratis de IA» → «8.000 créditos de IA incluidos».
        .replace(/(cr[eé]ditos?)\s+gratis\s+(?:de\s+)?(IA|I\.A\.?)(?![\p{L}\p{N}])/giu, (_t, c: string, ia: string) => `${c} de ${ia} incluidos`)
        // «créditos de IA gratis» / «créditos gratis» → «… incluidos».
        .replace(/(cr[eé]ditos?(?:\s+de\s+(?:IA|I\.A\.?))?)\s+gratis\b/gi, (_t, c: string) => `${c} incluidos`)
        // «gratis: 8.000 créditos» y lo que quede: la palabra, cambiada.
        .replace(/\bgratis\b/gi, (g: string) => (g[0] === "G" ? "Incluidos" : "incluidos"));
    fuera = fuera.replace(/\bincluidos\s+incluidos\b/gi, "incluidos").replace(/[ \t]{2,}/g, " ").trim();
    return fuera;
}

/**
 * Si una línea de la tarjeta repite los créditos del plan («8.000 créditos de
 * IA incluidos» en un plan de 8.000). La tarjeta ya los dice al lado del
 * precio, y dos veces lo mismo en seis líneas es ruido.
 */
export function esLaLineaDeCreditos(texto: string, creditos: number): boolean {
    if (typeof texto !== "string" || !CREDITOS.test(texto) || !(creditos > 0)) return false;
    const numeros = [...texto.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(k\b)?/gi)].map((m) => {
        const n = Number(m[1].replace(/[.,](?=\d{3}(\D|$))/g, ""));
        return m[2] ? n * 1000 : n;
    });
    return numeros.length === 1 && numeros[0] === creditos;
}

/** «8000» → «8.000», igual en el servidor y en el navegador. */
export function losCreditosComoTexto(creditos: number): string {
    const n = Math.trunc(Math.abs(Number(creditos) || 0));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
