import { createRoot } from "react-dom/client";
import Sala from "@/components/videollamada/SalaDeLaVideollamada";
// La sala REAL con el proveedor que diga la dirección (`?url=`). Las rutas de
// la videollamada contestan aquí; las señales entre dos pestañas van al banco
// (`window.__senal`, un puente al proceso de la prueba) si existe.
const p = new URLSearchParams(location.search);
window.__pedidos = [];
window.fetch = async (url, init) => {
    const u = String(url);
    let cuerpo = null;
    try { cuerpo = init?.body ? JSON.parse(init.body) : null; } catch { cuerpo = init?.body ?? null; }
    window.__pedidos.push({ url: u, metodo: init?.method ?? "GET", cuerpo });
    const json = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
    if (u.includes("/api/videollamada/motor") && cuerpo?.a === "sesion") return json({ ok: true, clave: "ek_de_un_uso", modelo: "gpt-realtime", conversacionId: "conv-1", frases: [] });
    if (u.includes("/api/videollamada/senales")) return json(window.__senal ? await window.__senal(cuerpo) : { ok: true, presentes: [], senales: [], ice: [] });
    if (u.includes("/api/videollamada/pantalla") && !init?.method) return new Response(null, { status: 204 });
    return json({ ok: true });
};
createRoot(document.getElementById("raiz")).render(
    <Sala url={p.get("url") ?? "verzay:conv-1"} nombre={p.get("nombre") ?? "Alexis"} citaId="cita-1" firma="f"
        reentrada={p.get("reentrada") === "1"} esAsesor={p.get("asesor") === "1"} />,
);
window.listo = true;
