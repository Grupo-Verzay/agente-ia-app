"use client";

import { useCallback, useEffect, useState } from "react";
import {
    createAvailability,
    getUserAvailability,
    deleteAvailability,
    updateAvailability,
    clearDayAvailability,
} from "@/actions/userAvailability-actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, PlusCircle, Ban, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { ScheduleAvailabilitySkeleton } from "./ScheduleAvailabilitySkeleton";

const defaultTime = { startTime: "14:00", endTime: "18:00" };
const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function generateHourOptions(): string[] {
    const hours: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            hours.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        }
    }
    return hours;
}

type Entry = { id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string };

export const UserAvailabilityForm = ({ userId }: { userId: string }) => {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [entriesByDay, setEntriesByDay] = useState<Record<number, Entry[]>>({});

    const hours = generateHourOptions();

    const loadAvailability = useCallback(async () => {
        setLoading(true);
        const res = await getUserAvailability(userId);
        if (res.success) {
            const data = (res.data as Entry[]) ?? [];
            const grouped: Record<number, Entry[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
            data.forEach((e) => grouped[e.dayOfWeek].push(e));
            setEntriesByDay(grouped);
        } else {
            toast.error(res.message ?? "Error al cargar");
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => { void loadAvailability(); }, [loadAvailability]);

    const handleAdd = async (day: number) => {
        const res = await createAvailability({
            userId,
            dayOfWeek: day,
            startTime: defaultTime.startTime,
            endTime: defaultTime.endTime,
        });
        if (res.success) {
            toast.success("Periodo añadido");
            await loadAvailability();
        } else toast.error(res.message);
    };

    const handleDelete = async (id: string) => {
        const res = await deleteAvailability(id);
        if (res.success) {
            toast.success("Periodo eliminado");
            await loadAvailability();
        } else toast.error(res.message);
    };

    const handleBanDay = async (day: number) => {
        const res = await clearDayAvailability(userId, day);
        if (res.success) {
            toast.success("Día marcado como no disponible");
            await loadAvailability();
        } else toast.error(res.message);
    };

    const handleDuplicate = async (e: Entry) => {
        const res = await createAvailability({
            userId,
            dayOfWeek: e.dayOfWeek,
            startTime: e.startTime,
            endTime: e.endTime,
        });
        if (res.success) {
            toast.success("Periodo duplicado");
            await loadAvailability();
        } else toast.error(res.message);
    };

    const handleUpdate = async (id: string, field: "startTime" | "endTime", value: string) => {
        const entry = Object.values(entriesByDay).flat().find((e) => e.id === id);
        if (!entry) return;
        const newStart = field === "startTime" ? value : entry.startTime;
        const newEnd = field === "endTime" ? value : entry.endTime;


        const res = await updateAvailability(id, newStart, newEnd);
        if (res.success) {
            toast.success("Periodo actualizado");
            await loadAvailability();
        } else toast.error(res.message);
        router.refresh();
    };

    if (loading) return <ScheduleAvailabilitySkeleton />;

    return (
        <div className="space-y-4">
            {Array.from({ length: 7 }).map((_, i) => {
                const list = entriesByDay[i] ?? [];
                const empty = list.length === 0;
                return (
                    <div key={i} className="flex items-start gap-3">
                        <div className="w-24 flex items-center gap-2">
                            <span className="font-medium">{dayLabels[i]}</span>

                            {/* ➕ agregar siempre, aunque existan periodos */}
                            <Button variant="ghost" size="icon" onClick={() => handleAdd(i)} title="Añadir otro periodo">
                                <PlusCircle className="w-4 h-4" />
                            </Button>

                            {/* 🛇 limpiar el día */}
                            <Button variant="ghost" size="icon" onClick={() => handleBanDay(i)} title="Marcar no disponible">
                                <Ban className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="flex-1">
                            {empty ? (
                                <span className="text-muted-foreground">No disponible</span>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {list.map((entry) => (
                                        <Card key={entry.id} className="flex items-center justify-between gap-2 border-none p-2">
                                            <div className="flex items-center gap-2">
                                                <Select value={entry.startTime} onValueChange={(val) => handleUpdate(entry.id, "startTime", val)}>
                                                    <SelectTrigger className="w-24"><SelectValue placeholder="Inicio" /></SelectTrigger>
                                                    <SelectContent className="border-border">
                                                        {hours.map((h) => (
                                                            <SelectItem key={h} value={h}>{h}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <span>–</span>
                                                <Select value={entry.endTime} onValueChange={(val) => handleUpdate(entry.id, "endTime", val)}>
                                                    <SelectTrigger className="w-24"><SelectValue placeholder="Fin" /></SelectTrigger>
                                                    <SelectContent className="border-border">
                                                        {hours.map((h) => (
                                                            <SelectItem key={h} value={h}>{h}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Button variant="secondary" size="icon" onClick={() => handleDuplicate(entry)} title="Duplicar periodo">
                                                    <Copy className="w-4 h-4" />
                                                </Button>
                                                <Button variant="destructive" size="icon" onClick={() => handleDelete(entry.id)} title="Eliminar periodo">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
