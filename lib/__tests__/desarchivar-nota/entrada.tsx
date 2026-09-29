import React from "react";
import { createRoot } from "react-dom/client";
import { NotesEditor } from "@/app/(root)/notas/_components/NotesEditor";

/**
 * La maqueta del banco de DESARCHIVAR: la barra REAL del editor de Mis notas
 * (`NotesEditor`), con una nota activa y otra archivada. Lo único fingido son
 * las acciones de servidor (las empaqueta mudas `empaquetar-con-acciones-mudas`).
 *
 * Se apunta a `window.llamadas` lo que la barra le pide a la pantalla: el
 * banco pulsa el botón de archivo y mira qué se pidió. El «antes» no tiene
 * `onToggleArchive` —tenía `onArchive(id)`—, así que se le pasan las DOS props
 * y se apunta cualquiera de las dos: el modo roto tiene que poder decir qué
 * pedía su botón con una nota archivada.
 */
const llamadas: unknown[][] = [];
(window as any).llamadas = llamadas;

function nota(isArchived: boolean) {
    return {
        id: isArchived ? "archivada" : "activa",
        userId: "u1",
        title: isArchived ? "NOTA ARCHIVADA" : "NOTA ACTIVA",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        emoji: null,
        color: null,
        isPinned: false,
        isArchived,
        folderId: null,
        contactJid: null,
        contactName: null,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any;
}

const nada = () => {};

(window as any).pintar = (archivada: boolean) => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    const props: any = {
        note: nota(archivada),
        saving: false,
        sidebarOpen: true,
        currentUserId: "u1",
        canEdit: true,
        isOwner: true,
        ownerName: null,
        onSave: nada,
        onTogglePin: nada,
        onDelete: nada,
        onToggleArchive: (...a: unknown[]) => llamadas.push(["onToggleArchive", ...a]),
        onArchive: (...a: unknown[]) => llamadas.push(["onArchive", ...a]),
        onEmojiChange: nada,
        onColorChange: nada,
        onContactChange: nada,
        onToggleSidebar: nada,
        onBackToList: nada,
        onApplyTemplate: nada,
    };
    raiz.render(<NotesEditor key={props.note.id} {...props} />);
};
(window as any).listo = true;
