'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HomeIcon, RocketLaunchIcon, SparklesIcon, ChartBarIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { iconMap, ModuleWithItems } from '@/schema/module';
import { canAccessRoute } from '@/utils/access';
import { isAdmin } from '@/lib/rbac';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { resolveModuleItemDest } from '@/lib/canva-embed';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type HomeUser = {
  id: string;
  name: string | null;
  company: string | null;
  role: string;
  plan: any;
};

const QUICK_LINKS = [
  {
    title: 'AI Image',
    description: 'Generacion de piezas visuales para anuncios.',
    route: '/ai-image',
    accent: 'from-cyan-500 to-blue-600',
  },
  {
    title: 'Leads',
    description: 'Gestion de conversaciones, estados y seguimientos.',
    route: '/sessions',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'CRM',
    description: 'Vista comercial y operativa de tu embudo.',
    route: '/crm',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Chat',
    description: 'Atencion y mensajes en tiempo real.',
    route: '/chats',
    accent: 'from-fuchsia-500 to-pink-600',
  },
] as const;

// Variantes de Panel por rol (comparten label "Panel"). Se colapsan a la del rol
// y se muestran a ancho completo en "Tus módulos".
const PANEL_ROUTES = ['/panel', '/reseller-panel', '/client-panel'];

export function MainHome({
  user,
  modules,
}: {
  user: HomeUser;
  modules: ModuleWithItems[];
}) {
  const router = useRouter();
  const { setLabelModule } = useModuleStore();
  // Módulo agrupador abierto (para elegir sub-módulo).
  const [openModule, setOpenModule] = useState<ModuleWithItems | null>(null);

  const accessibleModules = useMemo(() => {
    // Los tres paneles (/panel, /reseller-panel, /client-panel) comparten label
    // "Panel"; un admin tiene acceso a los tres. Mostrar solo el del rol para no
    // duplicar tarjetas "Panel".
    const rolePanel = isAdmin(user.role)
      ? '/panel'
      : user.role === 'reseller'
        ? '/reseller-panel'
        : '/client-panel';

    return modules
      .filter((moduleComponent) => moduleComponent.showInSidebar)
      .filter((moduleComponent) => {
        const access = canAccessRoute({
          route: moduleComponent.route,
          userRole: user.role,
          userPlan: user.plan,
          modules,
          label: moduleComponent.label,
        });
        return access.allowed;
      })
      // Colapsa las variantes de Panel a la del rol.
      .filter((m) => !PANEL_ROUTES.includes(m.route) || m.route === rolePanel);
  }, [modules, user.role, user.plan]);

  const quickLinks = useMemo(() => {
    return QUICK_LINKS.filter((item) => {
      const access = canAccessRoute({
        route: item.route,
        userRole: user.role,
        userPlan: user.plan,
        modules,
        label: '',
      });
      return access.allowed;
    });
  }, [modules, user.role, user.plan]);

  const handleGoToModule = (label: string, route: string) => {
    setLabelModule(label);
    router.push(route);
  };

  // Módulos agrupadores (isContainer o con sub-módulos): al tocarlos se muestran
  // los sub-módulos para elegir, en vez de navegar a una ruta contenedora vacía.
  const getSubmodules = (m: ModuleWithItems) => m.moduleItems ?? [];
  const isGroup = (m: ModuleWithItems) => m.isContainer || getSubmodules(m).length > 0;

  const handleModuleClick = (m: ModuleWithItems) => {
    if (isGroup(m) && getSubmodules(m).length > 0) {
      setOpenModule(m);
      return;
    }
    handleGoToModule(m.label, m.route);
  };

  const handleGoToSubmodule = (item: { url: string; customUrl?: string | null; title: string }) => {
    if (openModule) setLabelModule(openModule.label);
    setOpenModule(null);
    router.push(resolveModuleItemDest(item.url, item.customUrl));
  };

  // Accesos principales (arriba, a media página cada uno): el Panel del rol y
  // Conexión→Ajustes (/profile). El resto va debajo en la grilla normal.
  const PRIMARY_ROUTES = [...PANEL_ROUTES, '/profile'];
  const primaryModules = [
    accessibleModules.find((m) => PANEL_ROUTES.includes(m.route)),
    accessibleModules.find((m) => m.route === '/profile'),
  ].filter(Boolean) as ModuleWithItems[];
  const otherModules = accessibleModules.filter((m) => !PRIMARY_ROUTES.includes(m.route));

  const renderModuleCard = (moduleComponent: ModuleWithItems) => {
    const Icon = iconMap[moduleComponent.icon as keyof typeof iconMap] || HomeIcon;
    const group = isGroup(moduleComponent);
    const subCount = getSubmodules(moduleComponent).length;
    return (
      <button
        key={moduleComponent.id}
        type="button"
        onClick={() => handleModuleClick(moduleComponent)}
        className="rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-700"
      >
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{moduleComponent.label}</p>
        {group ? (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
            {subCount} {subCount === 1 ? 'módulo' : 'módulos'}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </p>
        ) : (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">{moduleComponent.route}</p>
        )}
      </button>
    );
  };

  const displayName = user.company?.trim() || user.name?.trim() || 'Usuario';

  return (
    <div className="min-h-full space-y-8 p-2 md:p-4">
      <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 p-8 text-white shadow-2xl">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <SparklesIcon className="h-4 w-4" />
              Workspace Home
            </p>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              Bienvenido:
              <span className="block">{displayName}</span>
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4">
              <p className="text-2xl font-extrabold">{accessibleModules.length}</p>
              <p className="text-xs uppercase tracking-wider text-cyan-100">Modulos</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4">
              <p className="text-2xl font-extrabold">{quickLinks.length}</p>
              <p className="text-xs uppercase tracking-wider text-cyan-100">Accesos rapidos</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <RocketLaunchIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold tracking-tight">Accesos rapidos</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.route}
              href={item.route}
              className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className={cn('mb-4 h-1.5 w-16 rounded-full bg-gradient-to-r', item.accent)} />
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.title}</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold tracking-tight">Tus modulos</h2>
        </div>

        {/* Accesos principales: Panel (izq) + Conexión→Ajustes (der), media página cada uno */}
        {primaryModules.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {primaryModules.map(renderModuleCard)}
          </div>
        )}

        {/* Resto de módulos */}
        {otherModules.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {otherModules.map(renderModuleCard)}
          </div>
        )}
      </section>

      {/* Selector de sub-módulos de un agrupador */}
      <Dialog open={!!openModule} onOpenChange={(o) => !o && setOpenModule(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{openModule?.label}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(openModule?.moduleItems ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleGoToSubmodule(item)}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-medium transition hover:border-blue-300 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
              >
                <span>{item.title}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

