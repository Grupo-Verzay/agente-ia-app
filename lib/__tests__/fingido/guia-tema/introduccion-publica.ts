/** `lib/introduccion-publica.server.ts` sin base: sale el texto del código. */
export async function laIntroduccionPublica<T>(_modulo: string, porDefecto: T): Promise<T> {
    return porDefecto;
}
