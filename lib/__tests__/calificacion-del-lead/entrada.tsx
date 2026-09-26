import React from "react";
import { createRoot } from "react-dom/client";
import { ChatContactItem } from "@/app/(root)/chats/_components/ChatContactItem";
import { LISTA_DE_CHATS } from "@/lib/lista-de-chats";

/**
 * La maqueta del banco de la CALIFICACIÓN: la fila real (`ChatContactItem`)
 * dentro de `.app-module-content`, en la columna de producción y con las
 * barras de desplazamiento a la vista, que es lo que le quita ancho al
 * renglón. Lo único fingido son las acciones de servidor.
 *
 * Cada fila contesta una pregunta y no se puede quitar ninguna:
 *
 *   - `sinCalificar` una conversación recién llegada, sin nada más: ni pastilla
 *                    de calificación ni renglón. Es el caso del encargo.
 *   - `calificada`   la misma con «Tibio»: la pastilla se pinta, y sigue
 *                    abriendo su menú.
 *   - `apretada`     la fila llena SIN calificar. Con la pastilla de «Sin
 *                    clasificar» dentro, el renglón gastaba su sitio en un
 *                    hueco y empujaba al «+N» una pastilla que sí lleva un
 *                    dato. Aquí se mide qué se gana quitándola.
 *   - `apretadaCal`  la MISMA fila con «Descartado» —la calificación más ancha—
 *                    para poder comparar las dos: la diferencia es lo que la
 *                    pastilla ocupaba.
 *   - `menu`         desde donde se abre el «⋯» y se comprueba que calificar
 *                    sigue teniendo camino sin la pastilla.
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

const UN_FLUJO = JSON.stringify([{ id: "f1", name: "Bienvenida" }]);

function sesion(extra: any) {
  return {
    id: 7,
    userId: "u1",
    remoteJid: "573001112233@s.whatsapp.net",
    pushName: "Yenny",
    instanceId: "i1",
    status: true,
    tags: [],
    leadStatus: null,
    assignedAdvisorId: null,
    etapa: null,
    ...extra,
  };
}

/** La fila llena, sin la calificación: lo que cambia entre las dos de abajo. */
const LLENA = {
  etapa: { id: "e1", nombre: "Contactado", color: 2 },
  assignedAdvisorId: "a2",
  tags: DOS_ETIQUETAS,
  reminderCount: 12,
  latestAppointmentStatus: "CONFIRMADA",
  pendingSeguimientos: 2,
  seguimientosTipos: [{ tipo: "text", count: 2 }],
  flujos: UN_FLUJO,
};

const FILAS: Array<{ id: string; s: any; notas?: boolean; asesores?: boolean }> = [
  { id: "sinCalificar", s: sesion({}), asesores: false },
  { id: "calificada", s: sesion({ leadStatus: "TIBIO" }), asesores: false },
  { id: "apretada", s: sesion({ ...LLENA }), notas: true },
  { id: "apretadaCal", s: sesion({ ...LLENA, leadStatus: "DESCARTADO" }), notas: true },
  { id: "menu", s: sesion({}), asesores: false },
];

function Fila({ id, s, notas, asesores }: { id: string; s: any; notas?: boolean; asesores?: boolean }) {
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
        advisors={asesores === false ? [] : ASESORES}
        currentAdvisorId="a1"
        advisorRole="administrador"
        hasNotes={!!notas}
        onArchive={nada}
        onDeleteRequest={nada}
        onSelect={nada}
        onTogglePin={nada}
        onAssignAdvisor={nadaAsync}
        onLeadStatusChange={nada}
        selected={false}
      />
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <div className="app-module-content flex h-screen">
    {/* La columna de la bandeja, con el ancho y las clases de producción, y un
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
