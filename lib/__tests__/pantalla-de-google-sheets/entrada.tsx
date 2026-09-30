import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { GoogleSheetsClient } from "@/app/(root)/google-sheets/_components/GoogleSheetsClient";

/**
 * La maqueta del banco de la pantalla de Google Sheets: el `GoogleSheetsClient`
 * REAL, con el `Toaster` para que los avisos se puedan leer. Lo único fingido
 * es la acción de guardar (`fingido/acciones-de-google-sheets.ts`), que apunta
 * lo que se le pide en `window.__guardados`.
 *
 * `window.pintar(hojaGuardada)` monta la pantalla desde cero con esa hoja (o
 * sin ninguna). El «antes» tenía otras props (`initialFormName`…) y no tenía
 * `serviceAccountEmail`: se le pasan todas, y cada versión lee las suyas.
 */
const CORREO = "hojas@plataforma-ejemplo.iam.gserviceaccount.com";

(window as any).pintar = (hoja: string | null) => {
    (window as any).__guardados = [];
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(<React.Fragment />);
    setTimeout(() => {
        const props: any = {
            userId: "cuenta-1",
            initialSheetsUrl: hoja,
            serviceAccountEmail: CORREO,
            initialFormName: null,
            initialRegistroName: null,
        };
        raiz.render(
            <div className="h-[760px] p-4">
                <GoogleSheetsClient key={String(Math.random())} {...props} />
                <Toaster />
            </div>,
        );
    }, 0);
};

(window as any).CORREO = CORREO;
(window as any).listo = true;
