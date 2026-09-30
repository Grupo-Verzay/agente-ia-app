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

/**
 * Cuanto recuerda el servidor una bandeja ya leida (`getPersistedInboxChats`).
 *
 * Vive aqui por lo mismo que el tamaño de pagina: lo necesitan los dos lados.
 * La App NO recibe los webhooks —los guarda el backend, que es otro proceso—,
 * asi que un mensaje que entra no borra esta memoria: la lista que se pide
 * dentro de la ventana devuelve la foto de antes. Para una conversacion que ya
 * esta en la lista da igual (el aviso en vivo la pone al dia), pero una que
 * NACE —un cliente que escribe por primera vez— no sale hasta que se pide la
 * lista con la ventana caducada (`SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS`).
 */
export const MEMORIA_DE_LA_BANDEJA_MS = 10_000;

/**
 * Cuando volver a pedir la lista si el aviso en vivo trajo un chat que no esta
 * en ella: pasada la memoria del servidor, con un margen. La primera vuelta
 * (a los 2 s) puede caer dentro de la ventana y traer la foto de antes; esta
 * ya no puede. Sin ella, el chat nuevo esperaba al reloj de la lista: hasta
 * 20 s con el cliente ya escribiendo.
 */
export const SEGUNDA_VUELTA_DE_UN_CHAT_NUEVO_MS = MEMORIA_DE_LA_BANDEJA_MS + 1_000;
