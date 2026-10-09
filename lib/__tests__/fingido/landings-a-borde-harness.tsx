// Las cinco pantallas públicas, las de VERDAD, una por una según `window.__cual`:
// la landing principal, las dos de resellers, la página de un plan y la
// propuesta (con un plan dentro de su servicio, que es lo que NO debe pegarse
// al borde). Lo que mide el banco de «a borde en el móvil».
import React from "react";
import { createRoot } from "react-dom/client";
import * as Landing from "@/app/(public)/inicio/_components/LandingClient";
import * as Resellers from "@/app/(public)/resellers/_components/ResellerLandingClient";
import * as MiLanding from "@/app/(public)/r/[slug]/_components/ResellerLandingClient";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";
import { lasFuncionesQueSeEnsenan } from "@/lib/pagina-de-plan";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { PLANES_DE_EJEMPLO } from "./acciones-de-planes-de-la-landing";

const w = window as any;

const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id: string, nombre: string, descripcion: string, tutorial: string | null) => ({
    id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial,
});
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "leads"),
    F("reportes", "Reportes semanales", "Un resumen cada lunes.", null),
];
const guias = new Map<string, string>(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));
const funciones = (lasFuncionesQueSeEnsenan as any)(CRUDO, DATOS, guias);

const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99", aConsultar: false },
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [
        { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." },
        { id: "catalogo", icono: "catalogo", titulo: "Catálogo", valor: "25 productos", detalle: "Con foto y precio." },
    ],
    funciones,
    preguntas: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
    todoIncluido: { titulo: "Todo incluido, sin sorpresas", texto: "Configuración inicial\nSoporte por WhatsApp\nActualizaciones sin costo" },
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/nivel-4" },
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "incluido", "comenzar"],
};

const largo = "El alcance incluye configurar la línea, entrenar al agente con el catálogo completo y dejar listos los flujos de venta. ";
const PROPUESTA = {
    token: "t".repeat(32),
    cliente: "Clínica Dental Sonrisa",
    empresa: "Grupo Sonrisa SAS",
    fecha: "2026-09-28",
    vigencia: "2026-10-15",
    tipoDeItems: "servicios",
    nota: largo,
    metodoPago: "Transferencia",
    medioPago: "Bancolombia",
    moneda: "COP",
    servicios: [
        { nombre: "Business", alcance: largo, inversion: 1500000 },
        { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 },
    ],
    mantenimientoMensual: 250000,
    mantenimientoDescripcion: largo,
    condiciones: "50% al iniciar y 50% al entregar.",
    actualizadaEn: "2026-09-28T12:00:00.000Z",
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};
const BUSINESS = {
    llave: "intermedio:IA",
    nombre: "Business",
    plan: "intermedio",
    tipo: "IA",
    activo: true,
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    enlace: "/planes/nivel-3",
    capacidad: PAGINA.capacidad,
    funciones,
    todoIncluido: PAGINA.todoIncluido,
    precio: { texto: "$99", aConsultar: false },
    boton: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false },
};

const L = Landing as any;
const R = Resellers as any;
const M = MiLanding as any;

const contacto = { whatsappNumber: "573001112233", meetingUrl: null, instagram: null, facebook: null, logoUrl: null };
const MI_LANDING = {
    plans: PLANES_DE_EJEMPLO, businessName: "Mi Agencia", slug: "mi-agencia", primaryColor: null, bgColor: null,
    headline: null, subheadline: null, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", ctaHeadline: null, ctaSubtitle: null,
    testimonials: null, stats: null, ...contacto,
};

const pantallas: Record<string, React.ReactNode> = {
    landing: (
        <div className="min-h-full bg-[#0a0f1a]">
            <L.LandingClient guiasDeAyuda={[]} {...contacto} videoUrl="/videos/landing.mp4" />
        </div>
    ),
    resellers: (
        <div className="min-h-full bg-[#0a0f1a]">
            <R.ResellerLandingClient {...contacto} />
        </div>
    ),
    r: (
        <div className="min-h-full bg-[#0a0f1a]">
            <M.ResellerLandingClient {...MI_LANDING} />
        </div>
    ),
    plan: (
        <div className="min-h-full">
            <PlanDetailPage pagina={PAGINA as any} />
        </div>
    ),
    propuesta: (
        <main data-tema-del-plan="dispositivo" className={`bg-plan-fondo ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <PropuestaPublica propuesta={PROPUESTA as any} planes={[{ ...BUSINESS }] as any} />
        </main>
    ),
};

createRoot(document.getElementById("app")!).render(pantallas[w.__cual] ?? <p>sin pantalla: {String(w.__cual)}</p>);
w.listo = true;
