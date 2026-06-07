"use client";

import { useState } from "react";
import { Copy, Check, Users, DollarSign, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "@/components/custom/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:  { label: "Pendiente",  variant: "secondary" },
  approved: { label: "Aprobada",   variant: "default" },
  paid:     { label: "Pagada",     variant: "default" },
  rejected: { label: "Rechazada",  variant: "destructive" },
};

type Profile = {
  id: string; code: string; commissionRate: number; notes: string | null;
  totalReferrals: number; activeReferrals: number;
  pendingAmount: number; totalEarned: number; registerUrl: string;
};
type Referral = {
  id: string; createdAt: Date;
  referredUser: { name: string | null; email: string; company: string };
  commissionsCount: number;
};
type Commission = {
  id: string; amount: number; currencyCode: string; status: string;
  paymentRef: string | null; createdAt: Date; paidAt: Date | null;
  referredUserName: string | null;
};

export function AffiliateDashboard({
  profile, referrals, commissions,
}: {
  profile: Profile;
  referrals: Referral[];
  commissions: Commission[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(profile.registerUrl);
    setCopied(true);
    toast.success("Link copiado.");
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-3 sm:p-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Panel de Afiliado</h1>
          <p className="text-xs text-muted-foreground">
            Comisión: <span className="font-semibold text-foreground">{(profile.commissionRate * 100).toFixed(0)}%</span> por cada pago de tus referidos
          </p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard icon={<Users className="h-3.5 w-3.5" />} label="Referidos" value={profile.totalReferrals} color="#3B82F6" helper="Total de usuarios que se registraron con tu link" />
          <MetricCard icon={<Clock className="h-3.5 w-3.5" />} label="Por cobrar" value={fmt(profile.pendingAmount, "USD")} color="#F59E0B" helper="Comisiones pendientes de aprobación o pago" />
          <MetricCard icon={<DollarSign className="h-3.5 w-3.5" />} label="Total ganado" value={fmt(profile.totalEarned, "USD")} color="#10B981" helper="Comisiones ya pagadas" />
          <MetricCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Tasa" value={`${(profile.commissionRate * 100).toFixed(0)}%`} color="#8B5CF6" helper="Tu porcentaje de comisión por cada pago" />
        </div>

        {/* Link de referido */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tu link de referido</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs font-mono">
              {profile.registerUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent"
              title="Copiar link"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Tabla de referidos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Referidos ({referrals.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {referrals.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Aún no tienes referidos.</p>
              ) : (
                <div className="divide-y text-xs">
                  {referrals.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.referredUser.name ?? r.referredUser.company}</p>
                        <p className="truncate text-muted-foreground">{r.referredUser.email}</p>
                      </div>
                      <div className="shrink-0 text-right text-muted-foreground">
                        <p>{new Date(r.createdAt).toLocaleDateString("es-CO")}</p>
                        <p>{r.commissionsCount} pago(s)</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabla de comisiones */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Comisiones ({commissions.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {commissions.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Aún no tienes comisiones.</p>
              ) : (
                <div className="divide-y text-xs">
                  {commissions.map((c) => {
                    const statusCfg = STATUS_LABELS[c.status] ?? { label: c.status, variant: "outline" as const };
                    return (
                      <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.referredUserName ?? "—"}</p>
                          <p className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("es-CO")}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">{fmt(c.amount, c.currencyCode)}</p>
                          <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
