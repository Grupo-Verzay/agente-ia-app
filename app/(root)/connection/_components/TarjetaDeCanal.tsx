'use client';

import { ReactNode } from 'react';
import { Info, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TituloDeTarjeta } from './TituloDeTarjeta';
import { ContactoDeTarjeta } from './ContactoDeTarjeta';

/**
 * La tarjeta de un canal que se conecta pegando credenciales: Cloud API,
 * Telegram, Facebook e Instagram. Los cuatro se conectan igual, así que se
 * pintan igual.
 *
 * Antes cada estado era otra tarjeta distinta: sin conectar, un formulario con
 * una línea de ayuda suelta y un botón de color; conectada, un pie con dos
 * botones —uno que solo recargaba y otro con un lápiz que decía "Editar"—. Los
 * dos botones abrían el MISMO formulario de credenciales, así que la persona
 * tenía que aprenderse dos sitios para una sola cosa.
 *
 * Ahora hay **un botón, en el mismo sitio**: "Conectar <canal>" cuando no hay
 * nada y "Editar credenciales" cuando ya está. Y el estado conectado se lee
 * como la línea de WhatsApp -avatar, nombre y dato debajo-, que es la anatomía
 * del resto de la pantalla.
 *
 * Crear la instancia ES pegar las credenciales: no hay paso previo. Por eso no
 * existe un botón que cree algo vacío.
 */
interface TarjetaDeCanalProps {
  icono: ReactNode;
  titulo: string;
  /** Color de marca del canal, para el botón. */
  color: string;
  conectado?: boolean;
  /** Sin conectar: el nombre que tendrá la instancia. No se escribe a mano. */
  instanceName?: string;
  /** Conectado: nombre visible y el dato que identifica la cuenta. */
  nombre?: string;
  dato?: ReactNode;
  /** Texto del botón cuando no hay nada conectado. Nombra el canal. */
  textoConectar: string;
  alAbrirFormulario: () => void;
  /** Solo cuando hay algo que borrar. */
  alEliminar?: () => void;
  /** Un control propio del canal en la cabecera (p. ej. las llamadas). */
  extraEnCabecera?: ReactNode;
}

export const TarjetaDeCanal = ({
  icono,
  titulo,
  color,
  conectado,
  instanceName,
  nombre,
  dato,
  textoConectar,
  alAbrirFormulario,
  alEliminar,
  extraEnCabecera,
}: TarjetaDeCanalProps) => (
  <Card className={`border-border flex flex-col ${conectado ? '' : 'border-dashed'}`}>
    <CardHeader className="p-4 pb-2">
      <div className="flex items-center justify-between gap-2">
        <TituloDeTarjeta icono={icono}>{titulo}</TituloDeTarjeta>
        <div className="flex shrink-0 items-center gap-2">
          {extraEnCabecera}
          {conectado && alEliminar && (
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8"
              onClick={alEliminar}
              title="Eliminar canal"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </CardHeader>

    <CardContent className="flex flex-col gap-3 p-4 pt-2">
      {conectado ? (
        <ContactoDeTarjeta icono={icono} nombre={nombre ?? ''} dato={dato} fondo="bg-muted" />
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-[13px] text-muted-foreground">Nombre de instancia</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[13px]">{instanceName}</span>
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
        </div>
      )}

      {/* El MISMO botón, en el MISMO sitio, abriendo el MISMO formulario. */}
      <Button
        onClick={alAbrirFormulario}
        className="w-full gap-2 border-0 text-white hover:opacity-90"
        style={{ backgroundColor: color }}
      >
        {conectado ? <KeyRound className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {conectado ? 'Editar credenciales' : textoConectar}
      </Button>
    </CardContent>
  </Card>
);
