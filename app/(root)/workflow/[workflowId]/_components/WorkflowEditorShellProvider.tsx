'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Action } from '@/types/workflow-node';

type Ctx = {
    totalNodes: number;
    seguimientoNodes: number;
    setCounts: (total: number, seguimiento: number) => void;

    registerCreateNode: (fn: (action: Action) => void) => void;
    clearCreateNode: () => void;
    createNode: (action: Action) => boolean;
};

const WorkflowEditorShellContext = createContext<Ctx | null>(null);

export function WorkflowEditorShellProvider({ children }: { children: React.ReactNode }) {
    const createNodeRef = useRef<null | ((action: Action) => void)>(null);

    const [totalNodes, setTotalNodes] = useState(0);
    const [seguimientoNodes, setSeguimientoNodes] = useState(0);

    const setCounts = useCallback((total: number, seguimiento: number) => {
        setTotalNodes(total);
        setSeguimientoNodes(seguimiento);
    }, []);

    const registerCreateNode = useCallback((fn: (action: Action) => void) => {
        createNodeRef.current = fn;
    }, []);

    const clearCreateNode = useCallback(() => {
        createNodeRef.current = null;
    }, []);

    const createNode = useCallback((action: Action) => {
        if (!createNodeRef.current) return false;
        createNodeRef.current(action);
        return true;
    }, []);

    const value = useMemo(
        () => ({
            totalNodes,
            seguimientoNodes,
            setCounts,
            registerCreateNode,
            clearCreateNode,
            createNode,
        }),
        [totalNodes, seguimientoNodes, setCounts, registerCreateNode, clearCreateNode, createNode]
    );

    return (
        <WorkflowEditorShellContext.Provider value={value}>
            {children}
        </WorkflowEditorShellContext.Provider>
    );
}

export function useWorkflowEditorShell() {
    const ctx = useContext(WorkflowEditorShellContext);
    if (!ctx) throw new Error('useWorkflowEditorShell must be used within WorkflowEditorShellProvider');
    return ctx;
}