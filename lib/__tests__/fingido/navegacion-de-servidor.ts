/**
 * `next/navigation` del lado del servidor, fuera de Next: `redirect` y
 * `notFound` lanzan, como en Next, para que quien los llame no siga adelante.
 * Lo usa el banco del dueño del dato (`createNode` y `createWorkflow`
 * redirigen al terminar); ahí no se prueba la navegación, solo la puerta.
 */
export function redirect(url: string): never {
    throw new Error(`NEXT_REDIRECT:${url}`);
}
export function notFound(): never {
    throw new Error("NEXT_NOT_FOUND");
}
