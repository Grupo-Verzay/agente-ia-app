import React from "react";
import { createRoot } from "react-dom/client";
import { ChatContactItem } from "@/app/(root)/chats/_components/ChatContactItem";
import { LISTA_DE_CHATS } from "@/lib/lista-de-chats";

/**
 * La maqueta del banco de la SIMETRÍA de la fila de Chats: la fila real
 * (`ChatContactItem`) dentro de `.app-module-content`, que es donde vive en
 * producción y donde un `.text-xs` vale 14/20 y no 12/16. Lo único fingido son
 * las acciones de servidor.
 *
 * Cada fila contesta una pregunta y no se puede quitar ninguna:
 *
 *   - `pocas`    el caso normal: etapa, calificación, asesor y etiquetas. Es
 *                donde se mide que la pastilla de etiquetas se PINTA y que el
 *                orden es etapa → calificación.
 *   - `justas`   seis pastillas: el tope exacto, sin «+N».
 *   - `desborda` OCHO, o sea dos por encima del tope: sale el «+N» **y** las
 *                etiquetas siguen ahí. Es el caso del reporte, donde la fila
 *                enseñaba «+1» en lugar de las dos etiquetas.
 *   - `unaSola`  una etiqueta: el globo dice «1 etiqueta», no «1 etiquetas».
 *   - `sinNada`  sin asesor, sin etapa y sin etiquetas: ni pastilla ni hueco.
 *
 * El ancho NO se escribe a mano: la columna es `var(--ancho-lateral)` con las
 * clases de `LISTA_DE_CHATS`, igual que en producción, así que las tres
 * anchuras miden de verdad tres columnas distintas (24 rem a 1440 y 1280,
 * 22 rem a 1024). Y con las barras de desplazamiento A LA VISTA, que se comen
 * su ancho: escondidas, el caso más justo no existe en el banco.
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

const FILAS: Array<{ id: string; s: any; notas?: boolean }> = [
  { id: "pocas", s: sesion({ tags: DOS_ETIQUETAS }) },
  {
    id: "justas",
    s: sesion({ tags: DOS_ETIQUETAS, reminderCount: 3, latestAppointmentStatus: "CONFIRMADA" }),
    notas: true,
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
    }),
    notas: true,
  },
  { id: "unaSola", s: sesion({ tags: [DOS_ETIQUETAS[0]] }) },
  { id: "sinNada", s: sesion({ tags: [], etapa: null, assignedAdvisorId: null, leadStatus: null }) },
];

function Fila({ id, s, notas }: { id: string; s: any; notas?: boolean }) {
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
        advisors={id === "sinNada" ? [] : ASESORES}
        currentAdvisorId="a1"
        advisorRole="administrador"
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
