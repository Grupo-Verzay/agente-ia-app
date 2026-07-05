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
            className="h-9 w-9 rounded-md [&_svg]:size-5"
        >
            {isOpen ? <X strokeWidth={3} /> : <Plus strokeWidth={3} />}
        </Button>
    );
}
