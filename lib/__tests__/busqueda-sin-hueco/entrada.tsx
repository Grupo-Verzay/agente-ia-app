// Arnés del banco de la búsqueda sin hueco: la columna de Chats (las clases de
// LISTA_DE_CHATS) con el vacío REAL y, debajo, la sección «En mensajes» como la
// pinta la bandeja. En modo roto se empaqueta dentro del árbol del «antes», así
// que el ChatEmptyState es el de entonces.
import React from "react";
import { createRoot } from "react-dom/client";
import { Inbox } from "lucide-react";
import { ChatEmptyState } from "@/app/(root)/chats/_components/ChatEmptyState";

function Columna() {
  const props: any = { Icon: Inbox, message: "No hay chats que coincidan con el filtro.", compacto: true };
  return (
    <div style={{ height: 640, display: "flex", flexDirection: "column" }} className="w-[22rem] border">
      <div data-lista className="flex-1 overflow-y-auto p-1">
        <ChatEmptyState {...props} />
        <section data-en-mensajes className="px-2 py-1">
          <p className="text-xs font-semibold uppercase">En mensajes</p>
          <div className="rounded-md border p-2 text-sm">Laura · cotización del plan</div>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Columna />);
(window as any).listo = true;
