'use client';

import { useState } from 'react';
import { Monitor, LogOut, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logoutAction } from '@/actions/auth-action';

interface Props {
    userName: string;
    userEmail: string;
}

export function SesionesCard({ userName, userEmail }: Props) {
    const [loading, setLoading] = useState(false);

    const handleLogoutAll = async () => {
        setLoading(true);
        await logoutAction();
    };

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {/* Card: Sesión actual */}
            <Card className="border-border">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Monitor className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-semibold">Sesión activa</CardTitle>
                            <CardDescription className="text-xs">Dispositivo con acceso a tu cuenta</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                        <div>
                            <p className="text-sm font-medium">{userName}</p>
                            <p className="text-xs text-muted-foreground">{userEmail}</p>
                        </div>
                        <Badge variant="outline" className="text-green-600 bg-green-500/10 border-green-500/30 shrink-0">
                            Actual
                        </Badge>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                        <span>Si detectas actividad sospechosa, cierra sesión para revocar el acceso.</span>
                    </div>
                </CardContent>
            </Card>

            {/* Card: Cerrar sesión */}
            <Card className="border-border border-dashed">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                            <LogOut className="w-4 h-4 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-semibold">Cerrar sesión</CardTitle>
                            <CardDescription className="text-xs">Revoca el acceso en todos los dispositivos</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Esto cerrará tu sesión actual y cualquier otro dispositivo conectado a tu cuenta.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={handleLogoutAll}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                        Cerrar sesión en todos los dispositivos
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
