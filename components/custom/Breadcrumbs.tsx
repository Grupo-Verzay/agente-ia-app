'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { HomeIcon } from '@heroicons/react/24/solid';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from '../ui/sidebar';
import { useEffect, useMemo, useState } from 'react';
import { getGuidesForPath } from '@/actions/guide-actions';
import { getWorkflowNameById } from '@/actions/workflow-actions'; // 👈 agrega esto
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

import { GuideUrl } from '@prisma/client';
import { Button } from '../ui/button';
import ThemeSwitcher from './ThemeSwitcher';

export const breadcrumbLabels: Record<string, string> = {
  flow: 'flujo',
  profile: 'perfil',
  sessions: 'Leads',
  credits: 'planes',
  tools: 'herramientas',
  connection: 'conexiones',
  workflow: 'workflow',
  ai: 'ia',
  'auto-replies': 'Respuestas rápidas',
  reseller: 'afiliados',
  reminders: 'recordatorios',
  tutorial: 'tutoriales',
  guide: 'guías',
  documentation: 'documentación',
  module: 'módulos',
  templates: 'plantillas',
  schedule: 'agendamiento',
  'client-billing': 'finanzas'
};

export const Breadcrumbs = ({ isFlow = false }: { isFlow?: boolean }) => {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? '/';

  const segments = useMemo(
    () => pathname.split('/').filter((segment) => segment !== ''),
    [pathname]
  );

  const [guides, setGuides] = useState<GuideUrl[]>([]);
  const [workflowName, setWorkflowName] = useState<string | null>(null);

  const moduleIndex = useMemo(() => {
    return segments.findIndex((s) => s === 'flow' || s === 'workflow' || s === 'workflows');
  }, [segments]);

  const workflowId = useMemo(() => {
    if (moduleIndex === -1) return null;
    return segments[moduleIndex + 1] ?? null;
  }, [segments, moduleIndex]);

  useEffect(() => {
    const fetchGuides = async () => {
      const data = await getGuidesForPath(pathname);
      setGuides(data);
    };
    if (segments.length > 0) fetchGuides();
  }, [pathname, segments.length]);

  useEffect(() => {
    const fetchWorkflowName = async () => {
      if (!workflowId) {
        setWorkflowName(null);
        return;
      }
      const name = await getWorkflowNameById(workflowId);
      setWorkflowName(name);
    };

    fetchWorkflowName();
  }, [workflowId]);

  // Generamos el array de breadcrumbs
  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');

    const labelFromDict = breadcrumbLabels[segment];

    const isWorkflowIdSegment = workflowId && index === moduleIndex + 1;
    const label =
      (isWorkflowIdSegment && (workflowName ?? 'flujo')) ||
      labelFromDict ||
      decodeURIComponent(segment.replace(/-/g, ' '));

    return { href, label };
  });

  return (
    <>
      {pathname !== "/multiagente" ? (
        <div className={`h-18 shrink-0 ${isFlow && 'flex flex-1'}`}>
          <header className="sticky top-0 w-full border-border flex items-center px-4 dark:bg-gray-900 dark:text-white">
            <Breadcrumb className="py-2 flex flex-row flex-1 overflow-hidden dark:bg-gray-900 dark:text-white">
              <BreadcrumbList>
                {!isFlow && (
                  <>
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                  </>
                )}

                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-primary">
                      <HomeIcon className="h-5" />
                      <span className="sr-only">Home</span>
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>

                {breadcrumbs.length > 0 && <BreadcrumbSeparator />}

                {breadcrumbs.length > 3 ? (
                  <>
                    <BreadcrumbEllipsis />
                    <BreadcrumbSeparator />
                    {breadcrumbs.slice(-2).map((breadcrumb, index) => (
                      <div key={breadcrumb.href} className="flex items-center">
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <Link
                              href={breadcrumb.href}
                              className={`${index === breadcrumbs.length - 1 ? 'text-primary' : 'text-muted-foreground'
                                } hover:text-primary transition`}
                            >
                              {breadcrumb.label.toLocaleLowerCase()}
                            </Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {index !== breadcrumbs.slice(-2).length - 1 && <BreadcrumbSeparator />}
                      </div>
                    ))}
                  </>
                ) : (
                  breadcrumbs.map((breadcrumb, index) => (
                    <div key={breadcrumb.href} className="flex items-center">
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link
                            href={breadcrumb.href}
                            className={`${index === breadcrumbs.length - 1 ? 'text-primary' : 'text-muted-foreground'
                              } hover:text-primary transition`}
                          >
                            {breadcrumb.label.toLocaleLowerCase()}
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {index !== breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                    </div>
                  ))
                )}
              </BreadcrumbList>

              {guides.length > 0 && (
                <div className='flex justify-end flex-1'>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="bg-[#FF0033] hover:bg-[#e60000] text-white font-semibold transition duration-200 uppercase"
                      >
                        <Play className="h-4 w-4 text-white" />
                        <span className="hidden sm:inline">Ver tutoriales</span>
                      </Button>
                    </DialogTrigger>

                    <DialogContent className="max-w-xl sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>🎓 Tutoriales del módulo</DialogTitle>
                        <DialogDescription>
                          Aprende a usar cada función con estos tutoriales.
                        </DialogDescription>
                      </DialogHeader>

                      <ScrollArea className="max-h-[60vh] pr-2">
                        <ul className="space-y-4 mt-4">
                          {guides.map((guide) => (
                            <li
                              key={guide.id}
                              className="border rounded-lg p-5 shadow-sm transition cursor-pointer group"
                              onClick={() => window.open(guide.url, '_blank')}
                            >
                              <h3 className="text-base font-semibold text-foreground transition">
                                {guide.title}
                              </h3>

                              <Button
                                className="mt-3 bg-[#FF0033] hover:bg-[#e60000] text-white font-semibold transition duration-200 uppercase px-4 py-2 text-sm"
                                onClick={(e) => {
                                  e.stopPropagation(); // Evita doble apertura
                                  window.open(guide.url, '_blank');
                                }}
                              >
                                <Play className="w-4 h-4 text-white mr-2" />
                                <span className="hidden sm:inline">Ver en YouTube</span>
                              </Button>
                              <p className="text-sm text-muted-foreground mt-1">{guide.description}</p>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
              {isFlow &&
                <div className="flex flex-1 justify-end">
                  <ThemeSwitcher />
                </div>
              }
            </Breadcrumb>
          </header>
        </div >
      ) : null}
    </>
  );
};