'use client';

import { useEffect, useMemo } from 'react';

import { WorkflowCanvas } from './WorkflowCanvas';
import type { PropsWorkflowCanvas } from '@/types/workflow-node';
import { useWorkflowEditorShell } from './WorkflowEditorShellProvider';

export function WorkflowEditorClient({ nodesDB, edgesDB, workflowId, user }: PropsWorkflowCanvas) {
    const { setCounts, registerCreateNode, clearCreateNode } = useWorkflowEditorShell();

    const totalNodes = nodesDB.length;
    const seguimientoNodes = useMemo(
        () => nodesDB.filter((n: any) => (n?.tipo ?? '').toLowerCase().startsWith('seguimiento')).length,
        [nodesDB]
    );

    useEffect(() => {
        setCounts(totalNodes, seguimientoNodes);
    }, [totalNodes, seguimientoNodes, setCounts]);

    useEffect(() => {
        return () => {
            setCounts(0, 0);
            clearCreateNode();
        };
    }, [setCounts, clearCreateNode]);

    return (
        <WorkflowCanvas
            edgesDB={edgesDB}
            nodesDB={nodesDB}
            workflowId={workflowId}
            user={user}
            registerCreateNode={registerCreateNode}
        />
    );
}