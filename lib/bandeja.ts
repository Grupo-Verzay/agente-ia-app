/**
 * Cuantas conversaciones trae cada pagina de la bandeja.
 *
 * Vive aqui, en un modulo sin nada de servidor, porque lo necesitan los dos
 * lados: la consulta (`getPersistedInboxChats`) para su `LIMIT`, y el navegador
 * para saber cuanto saltar al pedir la pagina siguiente. Con dos numeros
 * distintos se saltarian filas o se pedirian repetidas.
 *
 * Es **cuanto se LEE**, no cuanto se enseña: el contador de cada linea sale de
 * un `COUNT` aparte y dice el total de verdad. Responde a una sola pregunta:
 * cuantas conversaciones recorre una persona antes de buscar. Subirlo encarece
 * TODAS las cargas de Chats —cada fila es JSON que se descomprime, viaja y se
 * convierte a objetos—; para llegar mas abajo esta la pagina siguiente.
 */
export const TOPE_DE_LA_BANDEJA = 300;
