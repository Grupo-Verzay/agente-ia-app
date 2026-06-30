// Layout del Agente IA: una sola ruta con TABS arriba para cambiar de canal de
// entrenamiento. El editor de cada canal se renderiza debajo.
import { ChannelTabs } from './_components/ChannelTabs';

export default function IaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ChannelTabs />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
