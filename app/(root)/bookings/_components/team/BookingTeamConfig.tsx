'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { updateTeam } from '@/actions/bookings-actions';

interface Team {
    id: string;
    name: string;
    description: string | null;
    timezone: string;
    minNoticeMinutes: number;
}

const schema = z.object({
    name:        z.string().min(2, 'El nombre es obligatorio'),
    description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function BookingTeamConfig({ team }: { team: Team }) {
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name:        team.name,
            description: team.description ?? '',
        },
    });

    useEffect(() => {
        form.reset({
            name:        team.name,
            description: team.description ?? '',
        });
    }, [team]);

    const onSubmit = async (values: FormValues) => {
        setSaving(true);
        try {
            const res = await updateTeam(team.id, values);
            if (res.success) {
                toast.success('Equipo actualizado');
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
        <div className="max-w-lg mx-auto py-4">
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
