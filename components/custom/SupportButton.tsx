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
}: {
  message?: string;
  className?: string;
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

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={loading}
      title="Ayuda / Soporte"
      aria-label="Ayuda / Soporte"
      className={className}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <HelpCircle className="h-5 w-5" />
      )}
    </Button>
  );
};
