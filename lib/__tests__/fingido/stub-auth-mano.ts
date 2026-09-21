/** Sesión fingida para el banco del latido: `currentUser` devuelve lo que se le ponga. */
let _user: any = null;
export function __setUser(u: any) {
    _user = u;
}
export async function currentUser() {
    return _user;
}
