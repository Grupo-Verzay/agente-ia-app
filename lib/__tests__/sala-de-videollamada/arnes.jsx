import { createRoot } from "react-dom/client";
import Sala from "@/components/videollamada/SalaDeLaVideollamada";
const p = new URLSearchParams(location.search);
window.__pedidos = [];
const fetchReal = window.fetch;
window.fetch = async (url, init) => {
    window.__pedidos.push({ url: String(url), metodo: init?.method ?? "GET", cuerpo: init?.body ?? null });
    // `?pantallaFalla=1`: el navegador del servidor no carga la pantalla.
    if (String(url).includes("/api/videollamada/pantalla") && init?.method === "POST" && p.get("pantallaFalla") === "1") throw new TypeError("Failed to fetch");
    if (String(url).includes("/api/videollamada/pantalla") && init?.method === "POST") return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    if (String(url).includes("/api/videollamada/pantalla")) return new Response(null, { status: 204 });
    return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
};
createRoot(document.getElementById("raiz")).render(
    <Sala url="https://tavus.daily.co/c123conv" nombre="Alexis" citaId="cita-1" firma="f" reentrada={p.get("reentrada") === "1"}
        {...(p.get("limite") ? { limiteMinutos: Number(p.get("limite")) } : {})}
        {...(p.get("empezo") ? { empezoEn: p.get("empezo") } : {})} />,
);
window.listo = true;
