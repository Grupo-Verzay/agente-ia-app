'use client';

import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function BookingTeamSettings({ userId }: { userId: string }) {
    const publicUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/bookings/${userId}`
        : `/bookings/${userId}`;

    const copyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        toast.success('Enlace copiado al portapapeles');
    };

    return (
        <div className="max-w-lg mx-auto py-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Enlace público de reservas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Comparte este enlace con tus clientes para que agenden citas directamente.
                    </p>
                    <div className="flex items-center gap-2">
                        <Input value={publicUrl} readOnly className="text-xs" />
                        <Button variant="outline" size="icon" onClick={copyLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" asChild>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
