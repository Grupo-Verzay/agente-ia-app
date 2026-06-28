'use client';

import { useState } from 'react';
import { Loader2, HelpCircle } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { getSupportWhatsappUrl } from '@/actions/support-actions';
import { toast } from 'sonner';

/**
 * Botón general de ayuda para la sección de Conexión.
 * Abre el WhatsApp de soporte (reseller de la cuenta, o Verzay de respaldo)
 * con un mensaje pre-llenado.
 */
export const SupportButton = ({ message }: { message?: string }) => {
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
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <HelpCircle className="h-4 w-4" />
      )}
      <span>¿Necesitas ayuda?</span>
      <FaWhatsapp className="h-4 w-4 text-green-500" />
    </Button>
  );
};
