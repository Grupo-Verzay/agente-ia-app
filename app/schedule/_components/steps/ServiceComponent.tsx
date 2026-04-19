import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServiceInterface } from "@/types/schedule";

export const ServiceComponent = ({
    setSelectedService,
    setStep,
    selectedService,
    user
}: ServiceInterface) => {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Selecciona un servicio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona un servicio" />
                    </SelectTrigger>
                    <SelectContent>
                        {user.services.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                                {service.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex justify-end">
                    <Button onClick={() => setStep(1)} disabled={!selectedService}>
                        Continuar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
