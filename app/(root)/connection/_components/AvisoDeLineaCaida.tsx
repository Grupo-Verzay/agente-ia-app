'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { envioFallidoDeLaLinea } from '@/actions/estado-de-linea-actions';

/**
 * «Conectado» en verde con la linea muerta.
 *
 * La tarjeta pregunta a Evolution por `/instance/connect` y Evolution contesta
 * `state: "open"` — pero esa respuesta puede ser mentira: el socket real de
 * WhatsApp se cae y Evolution sigue diciendo que la sesion esta abierta. Una
 * sesion zombi.
 *
 * El 2026-09-10 un cliente perdio la mañana con MONTERREY_PENSIONADO_ALIADO:
 * el flujo entero, los seguimientos y los envios manuales reventaban con
 * «Connection Closed», el backend anotaba «Revisar la conexion de la
 * instancia», y la pantalla decia «Conectado». Se busco el fallo en la App.
 *
 * Este aviso no pregunta el estado otra vez —daria lo mismo—: enseña lo que
 * SABE el que envia. El backend marca la linea al fallar un envio por sesion
 * cerrada y la desmarca con el primer envio que vuelve a salir bien.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **No sustituye al boton verde, va encima.** El estado que da el proveedor
 *    sigue siendo un dato; lo que faltaba era el otro. Taparlo dejaria a la
 *    persona sin saber si la sesion existe.
 * 2. **Dice que hacer.** «Vuelve a escanear el QR» es la accion; un aviso que
 *    solo dice que algo va mal manda a abrir un ticket.
 */
export function AvisoDeLineaCaida({ instanceName }: { instanceName: string }) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [caida, setCaida] = useState(false);

  useEffect(() => {
    if (!instanceName) return;
    let vigente = true;

    const mirar = async () => {
      try {
        const estado = await envioFallidoDeLaLinea(instanceName);
        if (!vigente) return;
        setCaida(estado.caida);
        setMotivo(estado.motivo);
      } catch {
        // Sin respuesta no se inventa un aviso: la tarjeta se queda como estaba.
      }
    };

    void mirar();
    // Al mismo ritmo que el estado de la conexion, para que las dos cosas de la
    // tarjeta se muevan juntas y no se contradigan durante medio minuto.
    const reloj = setInterval(() => void mirar(), 40000);
    return () => {
      vigente = false;
      clearInterval(reloj);
    };
  }, [instanceName]);

  if (!caida) return null;

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400"
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong className="font-medium">Esta línea no está enviando.</strong>{' '}
        WhatsApp rechaza los mensajes porque la sesión se cerró. Vuelve a escanear el QR.
        {motivo ? <span className="block opacity-70">{motivo}</span> : null}
      </span>
    </div>
  );
}
