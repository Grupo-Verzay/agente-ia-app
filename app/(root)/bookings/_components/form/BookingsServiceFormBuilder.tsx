'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HelpCircle, Search, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getTeamServices } from '@/actions/bookings-actions';
import { BookingFormBuilder } from '@/app/(root)/schedule/_components/form/BookingFormBuilder';

interface TeamService {
    id: string;
    name: string;
    color: string | null;
    duration: number;
}

export function BookingsServiceFormBuilder({ teamId, userId }: { teamId: string; userId: string }) {
    const [services, setServices] = useState<TeamService[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTeamServices(teamId);
        if (res.success && res.data) setServices(res.data as TeamService[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const filteredServices = search.trim()
        ? services.filter((service) => service.name.toLowerCase().includes(search.toLowerCase()))
        : services;

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-72" />
                {[1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                    <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Crea servicios primero en la pestana Servicios.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar servicios..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            {filteredServices.map((service) => (
                <div key={service.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: service.color ?? '#3B82F6' }} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            {service.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{service.duration} min</Badge>
                    </div>
                    <Card className="border-border/70">
                        <CardContent className="p-3">
                            <BookingFormBuilder userId={userId} teamServiceId={service.id} />
                        </CardContent>
                    </Card>
                </div>
            ))}

            {filteredServices.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                    <HelpCircle className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No hay servicios que coincidan con la busqueda.</p>
                </div>
            )}
        </div>
    );
}
