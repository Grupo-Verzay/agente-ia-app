/**
 * Quién ve los mandos de gestión en la pantalla de Clientes.
 *
 * Es **solo lo que se ENSEÑA**: quién puede de verdad editar, repartir módulos,
 * asignar o eliminar lo deciden `lib/gestion-de-clientes.ts` y cada acción por
 * su lado, en el servidor. Enseñar el botón no abre la puerta.
 *
 * Y el rol que llega es el de la **CUENTA** por la que se actúa
 * (`currentUserRol`, de `getClientsPageData`), no el de la persona: el
 * administrador de una cuenta se crea con rol `user`, y preguntándole el suyo
 * se quedaba sin ningún mando — es el fallo que ya costó una vuelta en
 * `user-actions-menu`.
 *
 * Vive aquí y no en `lib/rbac.ts` porque lo pintan componentes de cliente y
 * aquel importa `@prisma/client`. Y no en `lib/gestion-de-clientes.ts`, que es
 * de servidor entero. **Puro y sin un solo import**, para que lo pueda usar
 * cualquiera de los dos lados: si la condición se escribe otra vez a mano, el
 * día que se afine una la otra se queda atrás y aparece un menú que ofrece algo
 * que la acción rechaza.
 */
export function elRolGestionaClientes(rol?: string | null): boolean {
    return rol === "admin" || rol === "super_admin" || rol === "reseller";
}

/**
 * Lo mismo en `/admin/clientes`, que es **más estrecho**: ahí el reseller no
 * edita ni elimina.
 *
 * Que las dos pantallas de clientes no abran a la misma gente viene de antes y
 * no se toca de refilón: cambiarlo aquí abriría o cerraría permisos sin que
 * nadie lo haya pedido. Lo que sí importa es que **la casilla de una fila y el
 * "Eliminar" de su menú salgan juntos**: una columna de casillas en una
 * pantalla donde no se puede borrar es ofrecer marcar filas para nada.
 */
export function elRolAdministraClientes(rol?: string | null): boolean {
    return rol === "admin" || rol === "super_admin";
}
