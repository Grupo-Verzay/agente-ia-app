'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Copy, ExternalLink } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock } from 'lucide-react';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { updateTeam } from '@/actions/bookings-actions';
import { AMERICA_TIMEZONES } from '@/lib/timezones';

// Flatten América timezones to a list of { label, value } pairs
const ALL_TIMEZONES: { label: string; value: string }[] = [
    ...AMERICA_TIMEZONES.flatMap((c) =>
        c.timezones.map((tz) => ({ label: `${c.country} – ${tz}`, value: tz }))
    ),
    { label: 'Europe – Europe/Madrid',  value: 'Europe/Madrid' },
    { label: 'Europe – Europe/London',  value: 'Europe/London' },
];

interface Team {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    timezone: string;
    isActive: boolean;
    minNoticeMinutes: number;
}

const settingsSchema = z.object({
    name:               z.string().min(2, 'El nombre es obligatorio'),
    description:        z.string().optional(),
    timezone:           z.string().min(1, 'Selecciona una zona horaria'),
    minNoticeMinutes:   z.coerce.number().min(0).max(10080),
});
type SettingsFormValues = z.infer<typeof settingsSchema>;

export function BookingTeamSettings({ team, userId }: { team: Team; userId: string }) {
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    const publicUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/bookings/${userId}`
        : `/bookings/${userId}`;

    const form = useForm<SettingsFormValues>({
        resolver: zodResolver(settingsSchema),
        defaultValues: {
            name:               team.name,
            description:        team.description ?? '',
            timezone:           team.timezone,
            minNoticeMinutes:   team.minNoticeMinutes,
        },
    });

    const onSubmit = async (values: SettingsFormValues) => {
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

    const copyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        toast.success('Enlace copiado al portapapeles');
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

            {/* Configuración */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Configuración del equipo</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del equipo</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="description" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descripción (opcional)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Breve descripción de tu equipo o consultorio…"
                                            className="min-h-[80px]"
                                            {...field}
                                        />
                                    </FormControl>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="timezone" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zona horaria</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecciona zona horaria" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="max-h-60">
                                            {ALL_TIMEZONES.map(({ label, value }) => (
                                                <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription className="text-xs">
                                        Zona horaria en la que se muestran los horarios a tus clientes.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
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
                                        Mínimo de minutos de antelación para que un cliente pueda agendar. Ej: 60 = no permite citas en menos de 1 hora.
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
