import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CountryCodeSelect } from "@/components/custom/CountryCodeSelect";
import type { Country } from "@/components/custom/CountryCodeSelect";

interface Props {
    nameClient: string;
    areaCode: string;
    phone: string;
    countries?: Country[];
    canContinue: boolean;
    loading?: boolean;
    setNameClient: (v: string) => void;
    setAreaCode: (v: string) => void;
    setPhone: (v: string) => void;
    setStep: (step: number) => void;
    backStep?: number;
    onContinue: () => void;
    onPhoneBlur?: () => void;
}

export function ClientDataStep({
    nameClient, areaCode, phone, countries, canContinue, loading = false,
    setNameClient, setAreaCode, setPhone, setStep, backStep = 3, onContinue, onPhoneBlur,
}: Props) {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Tus datos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Nombre completo</Label>
                        <Input
                            placeholder="Tu nombre"
                            value={nameClient}
                            onChange={(e) => setNameClient(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>País</Label>
                        {countries && (
                            <CountryCodeSelect
                                countries={countries}
                                defaultValue={areaCode}
                                onChange={(code) => setAreaCode(code)}
                            />
                        )}
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                        <Label>WhatsApp</Label>
                        <Input
                            placeholder="Número"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            onBlur={onPhoneBlur}
                            inputMode="tel"
                        />
                        <p className="text-xs text-muted-foreground">
                            Recibirás la confirmación de tu cita por WhatsApp.
                        </p>
                    </div>
                </div>
                <div className="flex justify-between gap-2 pt-2">
                    <Button variant="outline" onClick={() => setStep(backStep)}>← Atrás</Button>
                    <Button
                        disabled={!canContinue || loading}
                        onClick={onContinue}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {loading ? 'Agendando...' : 'Confirmar cita'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
