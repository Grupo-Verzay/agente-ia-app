import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Member {
    id: string;
    name: string;
    bio: string | null;
    photo: string | null;
    color: string | null;
}

interface Props {
    members: Member[];
    selectedMember: string;
    setSelectedMember: (id: string) => void;
    setStep: (step: number) => void;
}

export function MemberStep({ members, selectedMember, setSelectedMember, setStep }: Props) {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Elige un especialista</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {members.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                        No hay especialistas disponibles para este servicio.
                    </p>
                )}
                {members.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                            setSelectedMember(m.id);
                            setStep(2);
                        }}
                        className={[
                            'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                            selectedMember === m.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50 hover:bg-muted/30',
                        ].join(' ')}
                    >
                        <div
                            className="h-10 w-10 rounded-full shrink-0 border-2 border-border flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: m.color ?? '#3B82F6' }}
                        >
                            {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{m.name}</p>
                            {m.bio && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.bio}</p>
                            )}
                        </div>
                    </button>
                ))}
                <div className="pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setStep(0)} className="w-full">
                        ← Volver
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
