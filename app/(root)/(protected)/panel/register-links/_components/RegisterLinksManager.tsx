"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Link2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { RegisterLinkItem } from "@/actions/admin/get-register-links-action";

/* ─────────────────────────────────────────
   Single link row
───────────────────────────────────────── */
function LinkRow({ item, index }: { item: RegisterLinkItem; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.registerUrl);
    setCopied(true);
    toast.success("URL copiada al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Server className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-medium">Servidor {index + 1}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {item.serverUrl}
          </Badge>
        </div>
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            readOnly
            value={item.registerUrl}
            className="pl-8 pr-3 text-xs font-mono bg-background cursor-default"
            onFocus={(e) => e.target.select()}
          />
        </div>
        <Button
          size="sm"
          variant={copied ? "secondary" : "default"}
          onClick={handleCopy}
          className="shrink-0 transition-all duration-200"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copiar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main component
───────────────────────────────────────── */
interface Props {
  links: RegisterLinkItem[];
}

export function RegisterLinksManager({ links }: Props) {
  if (links.length === 0) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Sin servidores configurados</CardTitle>
          <CardDescription>
            Primero agrega al menos una API Key en{" "}
            <span className="font-medium text-foreground">Conexiones API</span>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-base">Links de Registro por Servidor</CardTitle>
        <CardDescription>
          Cada URL asigna automáticamente el servidor correspondiente al nuevo usuario.
          No se expone ninguna clave sensible en los links.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {links.map((item, index) => (
          <LinkRow key={item.id} item={item} index={index} />
        ))}
      </CardContent>
    </Card>
  );
}
