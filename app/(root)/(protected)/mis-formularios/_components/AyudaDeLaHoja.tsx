'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Lo que va debajo del campo de Google Sheets, en el diálogo de crear y en la
 * configuración del editor —el mismo texto en los dos—.
 *
 * Decía «Los registros se sincronizarán automáticamente», y eso solo es cierto
 * si la hoja está compartida con el correo de la plataforma. Sin compartirla,
 * cada registro sale «Error» con un «The caller does not have permission» que
 * no dice qué hacer. Ahora dice con QUÉ correo compartirla, y lo copia.
 */
export function AyudaDeLaHoja({ correo }: { correo: string | null }) {
  const [copiado, setCopiado] = useState(false);

  if (!correo) {
    return <p className="text-xs text-muted-foreground">Cada registro se añade como una fila nueva de la hoja.</p>;
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(correo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('No se pudo copiar. Selecciona el correo y cópialo a mano.');
    }
  };

  return (
    <p data-ayuda-de-la-hoja className="text-xs text-muted-foreground">
      Comparte la hoja como <span className="font-medium text-foreground">Editor</span> con{' '}
      <button
        type="button"
        onClick={copiar}
        title="Copiar el correo"
        className="inline-flex max-w-full items-center gap-1 break-all rounded font-mono text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
      >
        {correo}
        {copiado ? <Check className="h-3 w-3 shrink-0 text-green-600" /> : <Copy className="h-3 w-3 shrink-0" />}
      </button>{' '}
      y cada registro se añadirá como una fila nueva.
    </p>
  );
}
