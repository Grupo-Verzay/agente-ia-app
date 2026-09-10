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

/**
 * Cuanto mas ancha es la ventana de candidatos que la pagina que se devuelve.
 *
 * La bandeja recorta ANTES de cruzar tablas: en vez de montar todas las
 * conversaciones y todas las sesiones de la cuenta para quedarse con 300 al
 * final, se preseleccionan las mas recientes de cada fuente y solo esas entran
 * al cruce. El top-300 del resultado esta contenido en el top-N de cada fuente
 * por su propio reloj, asi que con N = 300 ya seria correcto para el caso
 * normal.
 *
 * El margen cubre el caso incomodo: una conversacion vieja -mensaje antiguo,
 * asi que cae fuera de la ventana- cuya SESION se toco hace poco (alguien le
 * cambio la etiqueta o el asesor). Esa fila ordena por el reloj de la sesion y
 * podria entrar en la pagina; si su conversacion quedo fuera, entraria sin su
 * ultimo mensaje. Con la ventana cuatro veces mas ancha eso exige que la
 * conversacion sea de las 1.200 mas viejas Y su sesion de las 300 mas
 * recientes a la vez.
 *
 * No es imposible, es improbable. Por eso se MIDE: `getPersistedInboxChats`
 * cuenta cuantas filas salen sin ultimo mensaje y lo dice
 * (`sinUltimoMensaje`). Si ese numero deja de ser cero de forma habitual, el
 * margen se queda corto y hay que subirlo o pasar al umbral por fecha.
 */
export const VENTANA_DE_CANDIDATOS = 4;
