import { createRoot } from "react-dom/client";
import Sala from "@/components/videollamada/SalaDeLaVideollamada";
const p = new URLSearchParams(location.search);
// Lo de la grabación va a la RED (la prueba lo intercepta, `sendBeacon`
// incluido); lo demás de la sala contesta «ok» aquí mismo.
const fetchReal = window.fetch.bind(window);
// Lo demás se APUNTA (`window.__pedidos`): el banco mira, p. ej., que al
// pulsar «Salir» se termine la conversación (`DELETE /api/videollamada/sala`).
window.__pedidos = [];
window.fetch = async (url, init) => {
    window.__pedidos.push({ url: String(url), metodo: init?.method ?? "GET" });
    if (String(url).includes("/api/videollamada/grabacion")) return fetchReal(url, init);
    if (String(url).includes("/api/videollamada/pantalla") && !init?.method) return new Response(null, { status: 204 });
    return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
};
createRoot(document.getElementById("raiz")).render(
    <Sala url="https://tavus.daily.co/c123conv" nombre="Alexis" citaId="cita-1" firma="f" esAsesor={p.get("asesor") === "1"} />,
);
window.listo = true;
