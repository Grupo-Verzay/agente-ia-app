'use client';

import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type SuggestedReplyBarProps = {
  suggestion: string;
  isLoading: boolean;
  hasError: boolean;
  onUse: (text: string) => void;
  onRegenerate: () => void;
  onDismiss: () => void;
};

export function SuggestedReplyBar({
  suggestion,
  isLoading,
  hasError,
  onUse,
  onRegenerate,
  onDismiss,
}: SuggestedReplyBarProps) {
  if (!isLoading && !suggestion && !hasError) {
    return (
      <div className="flex items-center px-3 py-1.5 border-t bg-muted/20">
        <button
          type="button"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-violet-600 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          Sugerir respuesta
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-t bg-muted/40 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generando sugerencia…
          </span>
        ) : hasError ? (
          <span className="text-muted-foreground text-xs">
            No se pudo generar una sugerencia.
          </span>
        ) : (
          <p
            className="text-foreground leading-snug line-clamp-3 cursor-pointer hover:text-violet-600 transition-colors"
            onClick={() => onUse(suggestion)}
            title="Clic para usar esta sugerencia"
          >
            {suggestion}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isLoading && suggestion && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] font-medium text-violet-600 hover:text-violet-700"
            title="Usar sugerencia"
            onClick={() => onUse(suggestion)}
          >
            Usar
          </Button>
        )}
        {!isLoading && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Regenerar sugerencia"
            onClick={onRegenerate}
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Descartar"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
