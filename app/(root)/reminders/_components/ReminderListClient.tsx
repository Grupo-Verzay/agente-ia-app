'use client'

import { ReminderListClientInterface } from "@/schema/reminder";
import { ReminderList } from "./";

export const ReminderListClient = ({ workflows, filteredReminders, isScheduleView }: ReminderListClientInterface) => {
    return (
        <>
            {filteredReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center mt-8">
                    No se encontraron recordatorios.
                </p>
            ) : (
                <>
                    {filteredReminders.map((reminder) => {
                        const workflow = workflows.find(w => w.id === reminder.workflowId);

                        return (
                            <>
                                {
                                    isScheduleView ?
                                        reminder.isSchedule &&
                                        <ReminderList
                                            key={reminder.id}
                                            reminder={reminder}
                                            workflow={workflow}
                                        /> :
                                        !reminder.isSchedule &&
                                        <ReminderList
                                            key={reminder.id}
                                            reminder={reminder}
                                            workflow={workflow}
                                        />
                                }
                            </>
                        );
                    })}
                </>
            )}
        </>
    )
}