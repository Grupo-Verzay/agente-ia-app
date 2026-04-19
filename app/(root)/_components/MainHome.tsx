'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HomeIcon, RocketLaunchIcon, SparklesIcon, ChartBarIcon } from '@heroicons/react/24/solid';
import { iconMap, ModuleWithItems } from '@/schema/module';
import { canAccessRoute } from '@/utils/access';
import { useModuleStore } from '@/stores/modules/useModuleStore';
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

export function MainHome({
  user,
  modules,
}: {
  user: HomeUser;
  modules: ModuleWithItems[];
}) {
  const router = useRouter();
  const { setLabelModule } = useModuleStore();

  const accessibleModules = useMemo(() => {
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
      });
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
              Bienvenido, {displayName}
            </h1>
            <p className="max-w-2xl text-sm text-cyan-100/90 md:text-base">
              Este es tu punto de entrada principal. Desde aqui puedes saltar directo a los
              modulos activos segun tu rol y plan.
            </p>
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {accessibleModules.map((moduleComponent) => {
            const Icon = iconMap[moduleComponent.icon as keyof typeof iconMap] || HomeIcon;
            return (
              <button
                key={moduleComponent.id}
                type="button"
                onClick={() => handleGoToModule(moduleComponent.label, moduleComponent.route)}
                className="rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-700"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{moduleComponent.label}</p>
                <p className="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">{moduleComponent.route}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

