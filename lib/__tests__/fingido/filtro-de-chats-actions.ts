/**
 * La acción del filtro de Chats, muda, para los arneses que montan el panel en
 * el navegador: la de verdad arrastra Prisma y la sesión. Un arnés puede dejar
 * sus embudos en `window.__embudosDelBanco`; sin eso, ninguno.
 */
export async function embudosDelFiltroDeChatsAction(_cuentas: unknown) {
  const g = globalThis as { __embudosDelBanco?: unknown[] };
  return { success: true, message: "banco", data: (g.__embudosDelBanco ?? []) as never[] };
}
