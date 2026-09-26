/**
 * La entrada que se empaqueta para el banco del copy del anuncio.
 *
 * Lo que sale por aquí es la ACCIÓN de verdad —`generarCopyDelAnuncio`— y no
 * las funciones puras: probar `instruccionesDelCopy` a solas sería probar el
 * lado que no tiene puerta. Lo que hay que demostrar es que la acción usa **la
 * misma clave de Gemini que ya configura esa pantalla**, que le manda la imagen
 * ya creada, y que un fallo vuelve con su motivo en vez de lanzar.
 *
 * Los dos dobles van DENTRO del paquete, con un alias: importados aparte serían
 * otra copia y ni `ponerAQuienMira` ni `ponerLoQueDiceGemini` moverían el código
 * que corre.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { ponerLoQueDiceGemini, loQueSeLePidioAGemini } from "./genai-de-mentira";

export { generarCopyDelAnuncio, saveUserGoogleApiKey } from "@/actions/ai-image-actions";
export { db } from "@/lib/db";
