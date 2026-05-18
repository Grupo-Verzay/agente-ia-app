import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface TeamService {
    id: string;
    name: string;
    description: string | null;
    duration: number;
    color: string | null;
    members: { teamMember: { id: string; name: string } }[];
}

interface Props {
    services: TeamService[];
    selectedService: string;
    setSelectedService: (id: string) => void;
    setStep: (step: number) => void;
}

export function ServiceStep({ services, selectedService, setSelectedService, setStep }: Props) {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Selecciona un servicio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {services.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                        No hay servicios disponibles por el momento.
                    </p>
                )}
                {services.map((svc) => (
                    <button
                        key={svc.id}
                        type="button"
                        onClick={() => {
                            setSelectedService(svc.id);
                            setStep(1);
                        }}
                        className={[
                            'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                            selectedService === svc.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50 hover:bg-muted/30',
                        ].join(' ')}
                    >
                        <div
                            className="h-10 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: svc.color ?? '#3B82F6' }}
                        />
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{svc.name}</p>
                            {svc.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>
                            )}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="h-3.5 w-3.5" />
                            {svc.duration} min
                        </span>
                    </button>
                ))}
            </CardContent>
        </Card>
    );
}
