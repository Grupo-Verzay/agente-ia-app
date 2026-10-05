import { createRoot } from "react-dom/client";
import Sala from "@/components/videollamada/SalaDeLaVideollamada";
const p = new URLSearchParams(location.search);
window.__pedidos = [];
const fetchReal = window.fetch;
window.fetch = async (url, init) => {
    window.__pedidos.push({ url: String(url), metodo: init?.method ?? "GET", cuerpo: init?.body ?? null });
    if (String(url).includes("/api/videollamada/pantalla") && init?.method === "POST") return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    if (String(url).includes("/api/videollamada/pantalla")) return new Response(null, { status: 204 });
    return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
};
createRoot(document.getElementById("raiz")).render(
    <Sala url="https://tavus.daily.co/c123conv" nombre="Alexis" citaId="cita-1" firma="f" reentrada={p.get("reentrada") === "1"} />,
);
window.listo = true;
