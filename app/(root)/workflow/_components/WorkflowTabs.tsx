"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GitBranch, Zap } from "lucide-react"
import CreateWorflowDialog from "../../flow/_components/CreateWorflowDialog"

interface Props {
    flujoContent: React.ReactNode
    triggersContent: React.ReactNode
    triggersCount: number
}

export function WorkflowTabs({ flujoContent, triggersContent, triggersCount }: Props) {
    const [tab, setTab] = useState("flujos")

    return (
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4">
                <TabsList className="h-9">
                    <TabsTrigger value="flujos" className="gap-1.5 text-sm px-4">
                        <GitBranch className="h-3.5 w-3.5" />
                        Flujos
                    </TabsTrigger>
                    <TabsTrigger value="disparadores" className="gap-1.5 text-sm px-4">
                        <Zap className="h-3.5 w-3.5" />
                        Disparadores IA
                        {triggersCount > 0 && (
                            <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 px-1.5 py-0 rounded-full font-medium leading-4">
                                {triggersCount}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {tab === "flujos" && <CreateWorflowDialog isPro={true} />}
            </div>

            <TabsContent value="flujos" className="mt-0 flex-1">
                {flujoContent}
            </TabsContent>

            <TabsContent value="disparadores" className="mt-0 flex-1">
                {triggersContent}
            </TabsContent>
        </Tabs>
    )
}
