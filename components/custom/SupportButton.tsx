'use client';

import { useState } from 'react';
import { Loader2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupportWhatsappUrl } from '@/actions/support-actions';
import { toast } from 'sonner';

/**
 * Botón global de ayuda. Abre el WhatsApp de soporte (reseller de la cuenta o
 * Verzay de respaldo). Pensado para el footer del sidebar — disponible en toda la app.
 */
export const SupportButton = ({
  message,
  className,
  label,
}: {
  message?: string;
  className?: string;
  /** Si se pasa, muestra el texto junto al ícono (oculto en móvil). */
  label?: string;
}) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const res = await getSupportWhatsappUrl(message);
    setLoading(false);
    if (res.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } else {
      toast.error('No hay un número de soporte configurado. Inténtalo más tarde.');
    }
  };

  const Icon = loading ? Loader2 : HelpCircle;

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? 'sm' : 'icon'}
      onClick={handleClick}
      disabled={loading}
      title="Ayuda / Soporte"
      aria-label="Ayuda / Soporte"
      className={`gap-1.5 ${className ?? ''}`}
    >
      <Icon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
      {label && <span className="hidden sm:inline">{label}</span>}
    </Button>
  );
};
