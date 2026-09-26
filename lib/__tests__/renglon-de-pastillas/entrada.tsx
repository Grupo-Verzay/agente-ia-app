import React from "react";
import { createRoot } from "react-dom/client";
import { ChatContactItem } from "@/app/(root)/chats/_components/ChatContactItem";
import { LISTA_DE_CHATS } from "@/lib/lista-de-chats";

/**
 * La maqueta del banco del RENGLÓN de pastillas: la fila real
 * (`ChatContactItem`) dentro de `.app-module-content`, que es donde vive en
 * producción y donde un `.text-xs` vale 14/20 y no 12/16. Lo único fingido son
 * las acciones de servidor.
 *
 * Cada fila contesta una pregunta y no se puede quitar ninguna:
 *
 *   - `cabenTodas`  cuatro pastillas cortas: no sale «+N» y no se esconde nada.
 *   - `sieteCortas` SIETE pastillas que caben de sobra. Es el caso que el tope
 *                   de 6 escondía sin necesidad: aquí tienen que salir las
 *                   siete.
 *   - `desborda`    la fila del reporte: con el tope aplicado seguía pidiendo
 *                   360,8 px en una columna de 348, o sea SEGUNDA LÍNEA.
 *   - `contadoras`  las cinco contadoras del encargo —flujos, seguimientos,
 *                   cita, notas y etiquetas— en la misma fila, que es donde se
 *                   comparan sus anchos unas con otras.
 *   - `sinAsignar`  sin asesor: es la única donde existe la pastilla
 *                   «Asignar», y donde se mide que ya no lleva icono.
 *   - `sinNada`     sin pastillas de sesión y sin etiquetas: ni renglón ni hueco.
 *
 * El ancho NO se escribe a mano: la columna es `var(--ancho-lateral)` con las
 * clases de `LISTA_DE_CHATS`, igual que en producción, así que las anchuras
 * miden de verdad columnas distintas. Y con las barras de desplazamiento A LA
 * VISTA, que se comen su ancho: escondidas, el caso más justo no existe.
 */

const nada = () => {};
const nadaAsync = async () => {};

const ASESORES = [
  { id: "a1", name: "Sofía Pérez", email: "sofia@x.com" },
  { id: "a2", name: "Yair Silvera", email: "yair@x.com" },
] as any;

const DOS_ETIQUETAS = [
  { id: 1, name: "Cliente VIP", color: "#7C3AED" },
  { id: 2, name: "Seguimiento marzo", color: "#059669" },
];

function sesion(extra: any) {
  return {
    id: 7,
    userId: "u1",
    remoteJid: "573001112233@s.whatsapp.net",
    pushName: "Yenny",
    instanceId: "i1",
    status: true,
    tags: [],
    leadStatus: "TIBIO",
    assignedAdvisorId: "a2",
    etapa: { id: "e1", nombre: "Contactado", color: 2 },
    ...extra,
  };
}

const UN_FLUJO = JSON.stringify([{ id: "f1", name: "Bienvenida" }]);

const FILAS: Array<{ id: string; s: any; notas?: boolean; rol?: string }> = [
  { id: "cabenTodas", s: sesion({ tags: DOS_ETIQUETAS }) },
  {
    // SIETE pastillas cortas que caben de sobra: etapa de una palabra, la
    // calificación, el asesor y cuatro contadoras. Medido, piden 286 px de
    // los 348 de la columna, así que las siete tienen que salir y NO puede
    // haber «+N» — con el tope de 6, la séptima se escondía teniendo sitio.
    id: "sieteCortas",
    s: sesion({
      etapa: { id: "e2", nombre: "Nuevo", color: 0 },
      reminderCount: 3,
      flujos: UN_FLUJO,
      pendingSeguimientos: 2,
      seguimientosTipos: [{ tipo: "text", count: 2 }],
      latestAppointmentStatus: "CONFIRMADA",
    }),
  },
  {
    id: "desborda",
    s: sesion({
      tags: DOS_ETIQUETAS,
      reminderCount: 12,
      latestAppointmentStatus: "CONFIRMADA",
      escalatedAt: Date.now() - 7 * 60_000,
      pendingSeguimientos: 2,
      seguimientosTipos: [{ tipo: "text", count: 2 }],
      flujos: UN_FLUJO,
    }),
    notas: true,
  },
  {
    // Las cinco contadoras del encargo —flujos, seguimientos, cita, notas y
    // etiquetas— en la misma fila, que es donde se comparan unas con otras.
    // Sin etapa, sin asesor (`advisors` vacío) y sin recordatorios, para que
    // quepan las cinco también en la columna más estrecha: la calificación se
    // pinta siempre y ya ocupa su parte.
    id: "contadoras",
    s: sesion({
      etapa: null,
      assignedAdvisorId: null,
      tags: DOS_ETIQUETAS,
      latestAppointmentStatus: "CONFIRMADA",
      flujos: UN_FLUJO,
      pendingSeguimientos: 2,
      seguimientosTipos: [{ tipo: "text", count: 2 }],
    }),
    notas: true,
  },
  { id: "sinAsignar", s: sesion({ assignedAdvisorId: null, tags: [] }) },
  // Las otras dos caras del mismo mando, que las pinta un `agente`: sin nadie
  // asignado dice «Tomar» y con la conversación suya dice «Yo». Se miden
  // porque las tres tienen que leerse igual que la calificación de al lado, y
  // «Yo» no es un botón —así que su `.text-xs` valdría 14 px sin su marca—.
  { id: "agenteTomar", s: sesion({ assignedAdvisorId: null, tags: [] }), rol: "agente" },
  { id: "agenteYo", s: sesion({ assignedAdvisorId: "a1", tags: [] }), rol: "agente" },
  { id: "sinNada", s: sesion({ tags: [], etapa: null, assignedAdvisorId: null, leadStatus: null }) },
];

function Fila({ id, s, notas, rol }: { id: string; s: any; notas?: boolean; rol?: string }) {
  return (
    <div data-fila={id} className="mb-2">
      <ChatContactItem
        contact={
          {
            id: "573001112233@s.whatsapp.net",
            name: "Yenny Ramírez",
            avatarSrc: "",
            lastMessage: "hola",
            lastMessageId: "m1",
            timestamp: "10:00",
            ts: Date.now(),
            instanceName: "BANCO_VENTAS",
            chatSession: s,
          } as any
        }
        advisors={id === "sinNada" || id === "contadoras" ? [] : ASESORES}
        currentAdvisorId="a1"
        advisorRole={rol ?? "administrador"}
        hasNotes={!!notas}
        onArchive={nada}
        onDeleteRequest={nada}
        onSelect={nada}
        onTogglePin={nada}
        onAssignAdvisor={nadaAsync}
        selected={false}
      />
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <div className="app-module-content flex h-screen">
    {/* La columna de la bandeja, con el ancho y las clases de producción. Un
        alto corto a propósito: la lista tiene que desbordar para que salga su
        barra, que es la que le quita ancho a la fila. */}
    <div className="flex h-[420px] flex-col" style={{ width: "var(--ancho-lateral)" }}>
      <div className={LISTA_DE_CHATS}>
        {FILAS.map((f) => (
          <Fila key={f.id} {...f} />
        ))}
      </div>
    </div>
  </div>,
);
(window as any).listo = true;
