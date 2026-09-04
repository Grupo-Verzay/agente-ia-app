'use client';

import { createContext, useContext } from 'react';

/**
 * Si este diagrama se está viendo sin permiso para cambiarlo.
 *
 * Existe porque el lienzo se dejaba tocar entero aunque fuera de lectura: se
 * podían arrastrar nodos, escribir en ellos y hasta borrarlos. Nada de eso se
 * guardaba —`FlowEditorClient` ni siquiera llamaba a guardar— y tampoco salía
 * ningún aviso, así que quien lo recibía trabajaba un rato, recargaba y se
 * encontraba el diagrama como al principio. **Trabajo perdido sin un solo
 * error.**
 *
 * La regla: si no se puede guardar, no se puede tocar. Lo que no se pueda
 * hacer no se enseña.
 */
const FlowReadOnlyCtx = createContext(false);

export const FlowReadOnlyProvider = FlowReadOnlyCtx.Provider;

export function useSoloLectura() {
  return useContext(FlowReadOnlyCtx);
}
