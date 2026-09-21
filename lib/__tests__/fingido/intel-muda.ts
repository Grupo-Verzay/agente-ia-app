/**
 * Dobles mudos para el banco de «Quitar de espera».
 *
 * `resolveSession` —el camino que EXISTIA para bajar el sello, y que el banco
 * usa en `MODO=roto` para enseñar que apagaba tambien la IA— llama por dentro a
 * la inteligencia de la conversacion y al auto-sync de Google Sheets. Los dos
 * hablan con servicios de fuera (OpenAI, el backend, Sheets) que en un banco no
 * existen y que no deciden nada de lo que se prueba: se fingen en el borde.
 *
 * Lo que SI corre de verdad es lo que el banco mide: apagar el sello, marcar
 * resuelta y el estado de la fila.
 */
export async function generateConversationIntelligence(): Promise<void> {}

export async function autoSyncContactIfEnabled(): Promise<void> {}
