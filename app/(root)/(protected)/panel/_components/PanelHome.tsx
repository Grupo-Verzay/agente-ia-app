'use client';

import Link from 'next/link';
import { ShieldCheckIcon, Squares2X2Icon } from '@heroicons/react/24/solid';

type PanelSection = {
    url: string;
    title: string;
};

const SECTION_ACCENTS = [
    'from-blue-500 to-blue-700',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-purple-700',
    'from-amber-500 to-orange-600',
    'from-fuchsia-500 to-pink-600',
    'from-cyan-500 to-sky-600',
    'from-rose-500 to-red-600',
    'from-indigo-500 to-blue-600',
    'from-lime-500 to-green-600',
    'from-orange-500 to-amber-600',
];

export function PanelHome({
    sections,
    adminName,
}: {
    sections: PanelSection[];
    adminName: string;
}) {
    return (
        <div className="min-h-full space-y-8 p-2 md:p-4">
            {/* Hero */}
            <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-8 text-white shadow-2xl">
                <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" />
                <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                            <ShieldCheckIcon className="h-4 w-4" />
                            Panel de Control
                        </p>
                        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                            Hola, {adminName}
                        </h1>
                        <p className="max-w-2xl text-sm text-indigo-100/90 md:text-base">
                            Gestiona y configura todos los aspectos de la plataforma desde aquí.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-center">
                        <p className="text-2xl font-extrabold">{sections.length}</p>
                        <p className="text-xs uppercase tracking-wider text-indigo-100">Secciones</p>
                    </div>
                </div>
            </section>

            {/* Secciones */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Squares2X2Icon className="h-5 w-5 text-blue-600" />
                    <h2 className="text-xl font-bold tracking-tight">Secciones del panel</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {sections.map((section, i) => (
                        <Link
                            key={section.url}
                            href={section.url}
                            className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
                        >
                            <div className={`mb-4 h-1.5 w-16 rounded-full bg-gradient-to-r ${SECTION_ACCENTS[i % SECTION_ACCENTS.length]}`} />
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{section.title}</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{section.url}</p>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
