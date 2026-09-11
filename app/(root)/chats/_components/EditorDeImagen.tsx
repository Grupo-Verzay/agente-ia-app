'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Crop,
  Pencil,
  Square,
  Type as TypeIcon,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Lo que se puede hacer encima de la foto. */
type Herramienta = 'dibujar' | 'flecha' | 'cuadro' | 'texto' | 'recortar';

/** Un trazo ya hecho. Se guardan todos para poder deshacer. */
type Trazo =
  | { tipo: 'dibujar'; color: string; grosor: number; puntos: { x: number; y: number }[] }
  | { tipo: 'flecha' | 'cuadro'; color: string; grosor: number; desde: { x: number; y: number }; hasta: { x: number; y: number } }
  | { tipo: 'texto'; color: string; tamano: number; en: { x: number; y: number }; texto: string }
  | { tipo: 'recorte'; x: number; y: number; ancho: number; alto: number };

const COLORES = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827', '#ffffff'] as const;

const HERRAMIENTAS: { id: Herramienta; icono: typeof Pencil; nombre: string }[] = [
  { id: 'dibujar', icono: Pencil, nombre: 'Dibujar' },
  { id: 'flecha', icono: ArrowUpRight, nombre: 'Flecha' },
  { id: 'cuadro', icono: Square, nombre: 'Cuadro' },
  { id: 'texto', icono: TypeIcon, nombre: 'Texto' },
  { id: 'recortar', icono: Crop, nombre: 'Recortar' },
];

/**
 * El editor de la foto antes de enviarla: recortar, flechas, cuadros, dibujar
 * y escribir encima.
 *
 * Tres decisiones que conviene no deshacer:
 *
 * 1. **Es un paso opcional, no el camino.** Se llega por el lápiz de la
 *    previsualización; si esto fallara, adjuntar y enviar siguen funcionando
 *    exactamente igual que antes. Lo que devuelve es otra `dataUrl`, del mismo
 *    tipo que la que entra, asi que ni el envio ni el backend ni WhatsApp se
 *    enteran: para ellos es una foto normal.
 * 2. **Los trazos se guardan, no se queman.** Se repinta todo en cada cambio a
 *    partir de la lista. Por eso «Deshacer» es quitar el ultimo de la lista y ya,
 *    y por eso un recorte no destruye nada: es un trazo mas.
 * 3. **Se dibuja en coordenadas de la IMAGEN, no de la pantalla.** El lienzo se
 *    ve escalado para que quepa; si se guardaran las coordenadas de pantalla, la
 *    flecha saldria movida en la foto final y de distinto tamano segun la
 *    ventana. `aLaImagen` hace esa conversion, y es la unica.
 */
export function EditorDeImagen({
  dataUrl,
  mimeType,
  onGuardar,
  onCerrar,
}: {
  dataUrl: string;
  mimeType: string;
  onGuardar: (dataUrl: string) => void;
  onCerrar: () => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  // La fuente que se pinta: la imagen, o una copia reducida si venia enorme.
  const imagen = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [lista, setLista] = useState(false);
  const [herramienta, setHerramienta] = useState<Herramienta>('dibujar');
  const [color, setColor] = useState<string>(COLORES[0]);
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [enCurso, setEnCurso] = useState<Trazo | null>(null);
  const [guardando, setGuardando] = useState(false);

  // La imagen se carga una vez.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imagen.current = reducirSiEsEnorme(img);
      setLista(true);
    };
    img.onerror = () => {
      console.warn('[editor] no se pudo cargar la imagen para editar');
      onCerrar();
    };
    img.src = dataUrl;
  }, [dataUrl, onCerrar]);

  /** El recorte que haya, para saber qué trozo se ve. */
  const recorte = (() => {
    for (let i = trazos.length - 1; i >= 0; i--) {
      const t = trazos[i];
      if (t.tipo === 'recorte') return t;
    }
    return null;
  })();

  const pintar = useCallback(() => {
    const canvas = lienzo.current;
    const img = imagen.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vista = recorte ?? { x: 0, y: 0, ancho: img.width, alto: img.height };
    canvas.width = vista.ancho;
    canvas.height = vista.alto;

    ctx.drawImage(img, vista.x, vista.y, vista.ancho, vista.alto, 0, 0, vista.ancho, vista.alto);
    ctx.translate(-vista.x, -vista.y);

    const todos = enCurso ? [...trazos, enCurso] : trazos;
    for (const t of todos) dibujarTrazo(ctx, t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [trazos, enCurso, recorte]);

  useEffect(() => {
    if (lista) pintar();
  }, [lista, pintar]);

  /** De donde se pulsó en pantalla a donde cae en la imagen. */
  const aLaImagen = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = lienzo.current;
    if (!canvas) return { x: 0, y: 0 };
    const caja = canvas.getBoundingClientRect();
    const vista = recorte ?? { x: 0, y: 0 };
    return {
      x: vista.x + ((e.clientX - caja.left) / caja.width) * canvas.width,
      y: vista.y + ((e.clientY - caja.top) / caja.height) * canvas.height,
    };
  }, [recorte]);

  /** El grosor se mide en la imagen, así que crece con ella: en una foto de
   *  4000 px un trazo de 3 px no se ve. */
  const grosor = Math.max(3, Math.round((lienzo.current?.width ?? 800) / 250));
  const tamanoDeTexto = Math.max(16, Math.round((lienzo.current?.width ?? 800) / 22));

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (guardando) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = aLaImagen(e);

    if (herramienta === 'texto') {
      const texto = window.prompt('¿Qué quieres escribir?');
      if (texto?.trim()) {
        setTrazos((prev) => [...prev, { tipo: 'texto', color, tamano: tamanoDeTexto, en: p, texto: texto.trim() }]);
      }
      return;
    }

    if (herramienta === 'dibujar') {
      setEnCurso({ tipo: 'dibujar', color, grosor, puntos: [p] });
      return;
    }

    if (herramienta === 'recortar') {
      setEnCurso({ tipo: 'cuadro', color: '#ffffff', grosor, desde: p, hasta: p });
      return;
    }

    setEnCurso({ tipo: herramienta, color, grosor, desde: p, hasta: p });
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enCurso) return;
    const p = aLaImagen(e);
    setEnCurso((prev) => {
      if (!prev) return prev;
      if (prev.tipo === 'dibujar') return { ...prev, puntos: [...prev.puntos, p] };
      if (prev.tipo === 'flecha' || prev.tipo === 'cuadro') return { ...prev, hasta: p };
      return prev;
    });
  };

  const soltar = () => {
    if (!enCurso) return;
    const trazo = enCurso;
    setEnCurso(null);

    if (herramienta === 'recortar' && trazo.tipo === 'cuadro') {
      const x = Math.min(trazo.desde.x, trazo.hasta.x);
      const y = Math.min(trazo.desde.y, trazo.hasta.y);
      const ancho = Math.abs(trazo.hasta.x - trazo.desde.x);
      const alto = Math.abs(trazo.hasta.y - trazo.desde.y);
      // Un recorte de dos pixeles es un clic sin querer, no un recorte.
      if (ancho < 20 || alto < 20) return;
      setTrazos((prev) => [...prev, { tipo: 'recorte', x, y, ancho, alto }]);
      setHerramienta('dibujar');
      return;
    }

    setTrazos((prev) => [...prev, trazo]);
  };

  const guardar = () => {
    const canvas = lienzo.current;
    if (!canvas || guardando) return;
    setGuardando(true);
    try {
      // Se conserva el tipo de la original. Un PNG con fotos pesa muchisimo mas
      // que un JPEG, y el limite de adjunto son 8 MB.
      const tipo = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      onGuardar(canvas.toDataURL(tipo, 0.9));
    } catch (error) {
      // Un fallo mudo aqui se ve como un boton que no hace nada.
      console.error('[editor] no se pudo guardar la imagen editada', error);
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      {/* Barra de arriba */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onCerrar}
          className="h-9 w-9 rounded-full text-white hover:bg-white/10"
          aria-label="Descartar los cambios"
          title="Descartar los cambios"
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-1">
          {HERRAMIENTAS.map(({ id, icono: Icono, nombre }) => (
            <Button
              key={id}
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setHerramienta(id)}
              className={cn(
                'h-9 w-9 rounded-full text-white hover:bg-white/10',
                herramienta === id && 'bg-white/20',
              )}
              aria-label={nombre}
              title={nombre}
            >
              <Icono className="h-5 w-5" />
            </Button>
          ))}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setTrazos((prev) => prev.slice(0, -1))}
            disabled={!trazos.length}
            className="h-9 w-9 rounded-full text-white hover:bg-white/10 disabled:opacity-40"
            aria-label="Deshacer"
            title="Deshacer"
          >
            <Undo2 className="h-5 w-5" />
          </Button>
        </div>

        <Button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="h-9 rounded-full bg-green-500 px-4 text-white hover:bg-green-600"
        >
          <Check className="mr-1.5 h-4 w-4" />
          {guardando ? 'Guardando…' : 'Listo'}
        </Button>
      </div>

      {/* La foto */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas
          ref={lienzo}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          className="max-h-full max-w-full touch-none rounded-lg bg-black object-contain shadow-2xl"
          style={{ cursor: herramienta === 'texto' ? 'text' : 'crosshair' }}
        />
      </div>

      {/* Colores */}
      <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-3">
        {COLORES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className={cn(
              'h-7 w-7 rounded-full border-2 transition-transform',
              color === c ? 'scale-110 border-white' : 'border-white/30',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="ml-3 text-xs text-white/60">
          {herramienta === 'recortar' ? 'Arrastra para recortar' : 'Arrastra sobre la foto'}
        </span>
      </div>
    </div>
  );
}

/**
 * El lado mayor con el que trabaja el editor.
 *
 * Una foto de camara son 4000 px de ancho, y volver a codificarla entera a la
 * salida puede pasarse de los 8 MB que admite el adjunto —ademas de cargarse la
 * memoria de un movil mientras se dibuja—. WhatsApp la recomprime de todas
 * formas, asi que por encima de esto no se gana nada visible.
 *
 * Solo afecta a la foto SI se edita. Sin pasar por el editor se manda tal cual,
 * como siempre.
 */
const LADO_MAXIMO = 2400;

function reducirSiEsEnorme(img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const mayor = Math.max(img.width, img.height);
  if (mayor <= LADO_MAXIMO) return img;

  const escala = LADO_MAXIMO / mayor;
  const copia = document.createElement('canvas');
  copia.width = Math.round(img.width * escala);
  copia.height = Math.round(img.height * escala);
  const ctx = copia.getContext('2d');
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0, copia.width, copia.height);
  console.info('[editor] la foto se redujo para editarla', {
    de: `${img.width}x${img.height}`,
    a: `${copia.width}x${copia.height}`,
  });
  return copia;
}

function dibujarTrazo(ctx: CanvasRenderingContext2D, t: Trazo) {
  if (t.tipo === 'recorte') return; // El recorte lo aplica el `drawImage`, no se pinta.

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (t.tipo === 'dibujar') {
    if (t.puntos.length < 2) return;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = t.grosor;
    ctx.beginPath();
    ctx.moveTo(t.puntos[0].x, t.puntos[0].y);
    for (const p of t.puntos.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }

  if (t.tipo === 'cuadro') {
    ctx.strokeStyle = t.color;
    ctx.lineWidth = t.grosor;
    ctx.strokeRect(
      Math.min(t.desde.x, t.hasta.x),
      Math.min(t.desde.y, t.hasta.y),
      Math.abs(t.hasta.x - t.desde.x),
      Math.abs(t.hasta.y - t.desde.y),
    );
    return;
  }

  if (t.tipo === 'flecha') {
    ctx.strokeStyle = t.color;
    ctx.fillStyle = t.color;
    ctx.lineWidth = t.grosor;
    ctx.beginPath();
    ctx.moveTo(t.desde.x, t.desde.y);
    ctx.lineTo(t.hasta.x, t.hasta.y);
    ctx.stroke();

    const angulo = Math.atan2(t.hasta.y - t.desde.y, t.hasta.x - t.desde.x);
    const punta = t.grosor * 4;
    ctx.beginPath();
    ctx.moveTo(t.hasta.x, t.hasta.y);
    ctx.lineTo(
      t.hasta.x - punta * Math.cos(angulo - Math.PI / 7),
      t.hasta.y - punta * Math.sin(angulo - Math.PI / 7),
    );
    ctx.lineTo(
      t.hasta.x - punta * Math.cos(angulo + Math.PI / 7),
      t.hasta.y - punta * Math.sin(angulo + Math.PI / 7),
    );
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (t.tipo !== 'texto') return;

  // Lleva contorno para que se lea sobre cualquier foto: sin el, el blanco
  // desaparece en una pared blanca y el negro en una sombra.
  ctx.font = `bold ${t.tamano}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.lineWidth = Math.max(2, t.tamano / 8);
  ctx.strokeStyle = t.color === '#ffffff' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
  ctx.strokeText(t.texto, t.en.x, t.en.y);
  ctx.fillStyle = t.color;
  ctx.fillText(t.texto, t.en.x, t.en.y);
}
