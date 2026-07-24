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

    /** featureKeys que el plan del dueño NO puede usar (candado 🔒 en la paleta). */
    lockedFeatures: Set<string>;
};

const WorkflowEditorShellContext = createContext<Ctx | null>(null);

export function WorkflowEditorShellProvider({
    children,
    lockedFeatures = [],
}: {
    children: React.ReactNode;
    lockedFeatures?: string[];
}) {
    const createNodeRef = useRef<null | ((action: Action) => void)>(null);
    const lockedSet = useMemo(() => new Set(lockedFeatures), [lockedFeatures]);

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
            lockedFeatures: lockedSet,
        }),
        [totalNodes, seguimientoNodes, setCounts, registerCreateNode, clearCreateNode, createNode, lockedSet]
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