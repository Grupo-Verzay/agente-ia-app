"use client";

import { RotateCcw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getIconForMessageType } from "./chat-sidebar.utils";
import type { SidebarContact } from "./chat-sidebar.types";

type DeletedContactItemProps = {
  contact: SidebarContact;
  onRestore: (id: string) => void;
};

export function DeletedContactItem({ contact, onRestore }: DeletedContactItemProps) {
  const IconComponent = getIconForMessageType(contact.messageType);

  return (
    <div
      role="listitem"
      className="group rounded-xl border border-transparent p-2 transition hover:bg-accent hover:text-accent-foreground"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar className="h-10 w-10 opacity-60 ring-2 ring-background group-hover:ring-accent">
            <AvatarImage src={contact.avatarSrc} alt={contact.name || "Contacto"} />
            <AvatarFallback>
              {contact.name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-sm font-bold text-muted-foreground">
                {contact.name || "Sin nombre"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {contact.timestamp}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              {IconComponent && (
                <IconComponent className="h-4 w-4 shrink-0 opacity-70" />
              )}
              <span>{contact.lastMessage || "-"}</span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Restaurar chat"
          className="h-8 w-8 shrink-0 rounded-full text-green-600 hover:bg-green-50 hover:text-green-700"
          onClick={(e) => {
            e.stopPropagation();
            onRestore(contact.id);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
