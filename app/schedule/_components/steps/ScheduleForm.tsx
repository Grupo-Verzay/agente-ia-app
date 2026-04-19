import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCodeSelect } from "@/components/custom/CountryCodeSelect";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScheduleFormInterface } from "@/types/schedule";

export const ScheduleForm = ({
    nameClient,
    countries,
    areaCode,
    phone,
    canContinueStep2,
    setNameClient,
    setAreaCode,
    setPhone,
    setStep,
}: ScheduleFormInterface) => {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Tus datos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Nombre completo</Label>
                        <Input placeholder="Tu nombre" value={nameClient} onChange={(e) => setNameClient(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label>País</Label>
                        {countries &&
                            <CountryCodeSelect
                                countries={countries}
                                defaultValue={areaCode}
                                onChange={(code) => setAreaCode(code)}
                            />}
                    </div>

                    <div className="sm:col-span-2 space-y-2">
                        <Label>WhatsApp</Label>
                        <Input
                            placeholder="Número"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            inputMode="tel"
                            aria-label="Número de WhatsApp"
                        />
                        <p className="text-xs text-muted-foreground">Usaremos este número para confirmar tu cita por WhatsApp.</p>
                    </div>
                </div>

                <div className="flex justify-between gap-2 pt-2">
                    <Button variant="outline" onClick={() => setStep(1)}>
                        Atrás
                    </Button>
                    <Button disabled={!canContinueStep2} onClick={() => setStep(3)}>
                        Revisar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}