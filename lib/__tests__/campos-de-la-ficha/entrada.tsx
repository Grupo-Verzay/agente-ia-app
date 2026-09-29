import React from "react";
import { createRoot } from "react-dom/client";
import { ContactFieldsConfigDialog } from "@/app/(root)/chats/_components/ContactFieldsConfigDialog";

/**
 * La maqueta del banco de los campos de la ficha: el diálogo REAL de
 * «Configurar campos de la ficha», abierto. Lo único fingido son las acciones
 * de servidor (mudas, de `empaquetar-con-acciones-mudas`). Lo que el diálogo
 * decide guardar se ve en `onSaved`, que se apunta en `window.guardado`.
 */
(window as any).guardado = null;

(window as any).pintar = (campos: unknown[]) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(
        <ContactFieldsConfigDialog
            key={Math.random()}
            userId="u1"
            open
            onOpenChange={() => {}}
            fields={campos as any}
            onSaved={(f) => { (window as any).guardado = f; }}
        />,
    );
};
(window as any).listo = true;
