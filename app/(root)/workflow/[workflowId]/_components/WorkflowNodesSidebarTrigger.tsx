'use client';

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function WorkflowNodesSidebarTrigger() {
    const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
    const isOpen = isMobile ? openMobile : open;

    return (
        <Button
            size="icon"
            onClick={toggleSidebar}
            title="Agregar nodo"
        >
            {isOpen ? <X /> : <Plus />}
        </Button>
    );
}