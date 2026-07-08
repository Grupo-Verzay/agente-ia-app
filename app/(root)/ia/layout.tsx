// Layout del Agente IA: una sola ruta con TABS arriba para cambiar de canal de
// entrenamiento. El editor de cada canal se renderiza debajo.
import { currentUser } from '@/lib/auth';
import { getUserChannelFlags } from '@/lib/channel-access';
import { TRAINING_CHANNELS, isChannelEnabled } from '@/lib/channel-training';
import { ChannelTabs } from './_components/ChannelTabs';

export default async function IaLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const flags = user ? await getUserChannelFlags(user.effectiveId) : {};
  // Canales no habilitados → pestaña con candado (visible pero bloqueada).
  const lockedSlugs = TRAINING_CHANNELS.filter((c) => !isChannelEnabled(c, flags)).map((c) => c.slug);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ChannelTabs lockedSlugs={lockedSlugs} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
