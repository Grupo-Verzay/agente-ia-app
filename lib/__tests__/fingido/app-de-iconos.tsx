/**
 * Una App mínima con el MISMO React que Next pinta en producción
 * (`next/dist/compiled/react-dom`, el canario de React 19), para el banco de
 * `insignia-en-el-documento.test.mjs`.
 *
 * Lo único que hace es lo que hace el `<head>` de la App al navegar: pinta un
 * `<link rel="icon">` —React lo sube al `<head>` como *hoistable*— y al cambiar
 * de «pantalla» lo desmonta y pinta otro. Es exactamente el camino que llama a
 * `unmountHoistable`, que hace `instance.parentNode.removeChild(instance)`.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
    interface Window {
        irA: (ruta: string) => void;
        errores: string[];
        appLista: boolean;
    }
}

window.errores = [];

function App() {
    const [ruta, setRuta] = useState("proyectos");
    window.irA = setRuta;
    return (
        <>
            {/* Una `key` por ruta: cambiar de pantalla DESMONTA el anterior. */}
            <link key={ruta} rel="icon" href={`/favicon-48.png?r=${ruta}`} sizes="48x48" />
            <div id="ruta">{ruta}</div>
        </>
    );
}

const raiz = createRoot(document.getElementById("app")!, {
    onUncaughtError: (e: unknown) => window.errores.push(String((e as Error)?.message ?? e)),
    onCaughtError: (e: unknown) => window.errores.push(String((e as Error)?.message ?? e)),
} as never);
raiz.render(<App />);
window.appLista = true;
