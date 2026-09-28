'use client';

import { AlternarBandeja } from "@/components/shared/AlternarBandeja";
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '../ui/sidebar';
import { useEffect, useRef, useState } from 'react';
import { getGuidesForPath } from '@/actions/guide-actions';
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
import { NotificationCenter } from '@/components/shared/NotificationCenter';
import { AvisoDeTareaEmergente } from '@/components/shared/AvisoDeTarea';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { MedidaDeLaBarra } from '@/components/shared/MedidaDeLaBarra';
import { MARCA_DE_LA_BARRA } from '@/hooks/usePanelFlotante';
import { BotonDeSoporte } from '@/components/tickets/BotonDeSoporte';

/**
 * Nombres legibles de cada segmento de ruta. La barra ya NO pinta una ruta de
 * texto, pero el copiloto los usa para decir en qué pantalla está la persona
 * (`app/(root)/ai-chat/hooks/useChatContext.ts`).
 */
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
  'client-billing': 'finanzas',
  'mis-formularios': 'mis formularios'
};

/**
 * La barra de arriba de la plataforma, la MISMA en todas las pantallas:
 *
 *   [menú]      [Chats 3 | Correos 12]      …      [tutoriales] [buscar] [soporte] [campana]
 *                ^ centrado en la columna de la lista
 *
 * - **El menú (las dos flechas) va siempre de primero**, en el mismo píxel en
 *   todas las pantallas. **No hay casita**: llevaba al inicio, que ya se abre
 *   desde el menú, y en un teléfono le quitaba sitio a los demás iconos.
 * - **Sin ruta de texto** («leads», «chats»…): no era pulsable de verdad ni
 *   llevaba a ninguna parte que el menú no lleve.
 * - **El selector Chats ⇄ Correos** sale en todas las pantallas, marcando la
 *   activa y con los sin leer de cada una, centrado en la columna de la lista
 *   (`AlternarBandeja`). Quitar la casita NO lo mueve: su centro es el de la
 *   columna, y lo que cambia es cuánto mide.
 * - **Todos los botones son rectángulos de esquinas redondeadas**
 *   (`rounded-md`), ninguno en píldora: la barra es simétrica.
 */
export const Breadcrumbs = ({ isFlow = false }: { isFlow?: boolean }) => {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? '/';
  const hayRuta = pathname.split('/').some((s) => s !== '');

  const laBarra = useRef<HTMLDivElement>(null);
  const laCabecera = useRef<HTMLElement>(null);
  const loDeLaIzquierda = useRef<HTMLDivElement>(null);
  const loDeLaDerecha = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<GuideUrl[]>([]);

  useEffect(() => {
    if (!hayRuta) {
      setGuides([]);
      return;
    }
    getGuidesForPath(pathname).then(setGuides);
  }, [pathname, hayRuta]);

  return (
    <>
      {/* Lo que mide esta barra decide dónde arrancan los paneles laterales:
          justo debajo, sin taparla nunca. Su alto NO está escrito en ninguna
          clase —`h-18` no existe en Tailwind—, así que se mide. */}
      <MedidaDeLaBarra de={laBarra} />
      <div ref={laBarra} className={`h-18 shrink-0 ${isFlow && 'flex flex-1'}`}>
          {/* `data-barra-de-arriba`: de aquí sale el borde de ABAJO con el que
              se coloca el panel de la campanita. Lo lee `usePanelFlotante`.
              `relative` porque el selector Chats ⇄ Correos va `absolute`
              dentro, centrado en la columna de la lista. */}
          <header
            ref={laCabecera}
            {...{ [MARCA_DE_LA_BARRA]: "" }}
            className="sticky top-0 w-full border-b border-border bg-background flex items-center pl-4 pr-3 dark:bg-gray-900 dark:text-white"
          >
            {/* El menú SIEMPRE de primero. `py-3` es el que le da el alto a la
                barra: 28 px del menú más 12 arriba y abajo, los mismos 52 que
                con la casita. `min-h-7` con `box-content` los guarda también
                en el editor de flujos, que no pinta el menú. */}
            <div ref={loDeLaIzquierda} data-inicio-de-la-barra className="box-content flex min-h-7 shrink-0 items-center py-3">
              {!isFlow && <SidebarTrigger />}
            </div>

            {!isFlow && (
              <AlternarBandeja barra={laCabecera} izquierda={loDeLaIzquierda} derecha={loDeLaDerecha} />
            )}

            <div className="flex-1" />
            {isFlow && <ThemeSwitcher />}

            {/* Los botones de la derecha, en la misma fila y a la misma altura,
                y todos con la MISMA forma: rectángulo de esquinas redondeadas. */}
            <div ref={loDeLaDerecha} data-botones-de-la-barra className="ml-2 flex shrink-0 items-center gap-2">
              {guides.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 bg-[#FF0033] hover:bg-[#e60000] text-white font-semibold transition duration-200 uppercase"
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
              )}
              <GlobalSearch />
              {/* «Soporte»: abre el ticket nuevo, o lleva al tablero si esta es
                  la cuenta que los atiende. */}
              <BotonDeSoporte />
              <NotificationCenter />
            </div>
          </header>
          {/* El aviso que interrumpe. Va aqui —y no en cada pantalla— porque
              esta barra es la misma en todas: asi salta en Chats, en
              Analiticas o donde este la persona. No pinta nada hasta que hay
              algo que decir. */}
          <AvisoDeTareaEmergente />
        </div >
    </>
  );
};
