import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";

import { MainReminders } from "../../reminders/_components";
import { MainReminderInterface } from "@/schema/reminder";
import ServiceManager from './services/ServiceManager';
import { CustomCalendar } from "./dashboard";
import { AgendaKanban } from "./dashboard/AgendaKanban";
import { ShareScheduleLinkButton, UserAvailabilityForm } from "./availability";
import { UpdateMeetingDuration } from "./settings";
import { Clock } from "lucide-react";

export const MainSchedule = ({ isCampaignPage, user, apiKey, reminders, leads, workflows, instancia, }: MainReminderInterface) => {
    const userId = user.id;

    return (
        <div className="flex w-full flex-col gap-4">
            <Tabs defaultValue="dashboard">
                <TabsList className="overflow-x-auto flex gap-4 whitespace-nowrap">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="availability">Disponibilidad</TabsTrigger>
                    <TabsTrigger value="kanban">Kanban</TabsTrigger>
                    <TabsTrigger value="services">Servicios</TabsTrigger>
                    <TabsTrigger value="reminders">Recordatorios</TabsTrigger>
                    <TabsTrigger value="settings">Ajustes</TabsTrigger>
                </TabsList>

                {/* Dashboard */}
                <TabsContent value="dashboard">
                    <Card className="border-none bg-transparent">
                        <CardContent>
                            <CustomCalendar user={user} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Disponibilidad */}
                <TabsContent value="availability" className="mt-2">
                    <div
                        style={{ height: 'calc(100dvh - 148px)' }}
                        className="overflow-y-auto flex flex-col gap-4 pr-1 pb-4"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                <Clock className="w-4 h-4 shrink-0 text-blue-500" />
                                Configura los horarios en que estás disponible para recibir citas.
                            </p>
                            <ShareScheduleLinkButton userId={userId} />
                        </div>
                        <UserAvailabilityForm userId={userId} />
                    </div>
                </TabsContent>

                {/* Kanban */}
                <TabsContent value="kanban" className="mt-2">
                    <div style={{ height: 'calc(100dvh - 148px)' }} className="flex flex-col">
                        <AgendaKanban userId={userId} />
                    </div>
                </TabsContent>

                {/* Servicios */}
                <TabsContent value="services">
                    <Card className="border-none bg-transparent">
                        <CardContent className="flex flex-col gap-2">
                            <ServiceManager userId={userId} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Recordatorios */}
                <TabsContent value="reminders">
                    <Card className="border-none bg-transparent">
                        <CardContent className="flex flex-col gap-2">
                            <MainReminders
                                isCampaignPage={isCampaignPage}
                                user={user}
                                apiKey={apiKey}
                                reminders={reminders}
                                leads={leads}
                                workflows={workflows}
                                instancia={instancia}
                                isScheduleView={true}
                                isSchedule={true}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Ajustes */}
                <TabsContent value="settings">
                    <div className="flex justify-center py-8 px-4">
                        <div className="w-full max-w-lg rounded-xl border bg-card shadow-sm p-6">
                            <UpdateMeetingDuration
                                userId={user.id}
                                meetingDuration={user.meetingDuration ?? 60}
                                meetingUrl={user.meetingUrl}
                            />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
