'use client';

import { useEffect } from 'react';

// Re-aplica el escalado de tamaño de letra (cookie `ui_scale`) tras la hidratación.
// El script inline de app/layout.tsx lo aplica antes de pintar (sin parpadeo), pero
// React puede descartar el estilo inline del <html> al hidratar; este efecto lo
// restaura, para que "Grande"/"Más grande" persista al refrescar en cualquier ruta.
// Fuente de verdad y control: components/font-size-control.tsx.
export function FontScaleApplier() {
  useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|; )ui_scale=([^;]+)/);
      const v = m ? decodeURIComponent(m[1]) : '100';
      document.documentElement.style.fontSize = v && v !== '100' ? `${v}%` : '';
    } catch {
      /* noop */
    }
  }, []);

  return null;
}
