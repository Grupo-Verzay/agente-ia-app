'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, Clock } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { updateTeam } from '@/actions/bookings-actions';

interface Team {
    id: string;
    minNoticeMinutes: number;
}

const schema = z.object({
    minNoticeMinutes: z.coerce.number().min(0).max(10080),
});
type FormValues = z.infer<typeof schema>;

export function BookingTeamSettings({ userId, team }: { userId: string; team: Team }) {
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    const publicUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/bookings/${userId}`
        : `/bookings/${userId}`;

    const copyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        toast.success('Enlace copiado al portapapeles');
    };

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { minNoticeMinutes: team.minNoticeMinutes },
    });

    useEffect(() => {
        form.reset({ minNoticeMinutes: team.minNoticeMinutes });
    }, [team]);

    const onSubmit = async (values: FormValues) => {
        setSaving(true);
        try {
            const res = await updateTeam(team.id, values);
            if (res.success) {
                toast.success('Ajustes guardados');
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto space-y-6 py-4">
            {/* Enlace público */}
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

            {/* Tiempo mínimo */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Configuración avanzada</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField control={form.control} name="minNoticeMinutes" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                        Tiempo mínimo de anticipación
                                    </FormLabel>
                                    <div className="flex items-center gap-3">
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={10080}
                                                className="w-28"
                                                {...field}
                                            />
                                        </FormControl>
                                        <span className="text-sm text-muted-foreground">minutos</span>
                                    </div>
                                    <FormDescription className="text-xs">
                                        Mínimo de minutos de antelación para agendar. Ej: 60 = no permite citas en menos de 1 hora.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <Button type="submit" disabled={saving} className="w-full">
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar cambios
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
