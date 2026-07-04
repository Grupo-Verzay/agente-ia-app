'use client';

import { createContext, useContext } from 'react';
import { Action } from '@/types/workflow-node';

export type AddNodeFn = (params: {
    sourceId: string;
    sourceHandle: string;
    action: Action;
}) => void | Promise<void>;

const WorkflowAddNodeCtx = createContext<AddNodeFn | null>(null);

export const WorkflowAddNodeProvider = WorkflowAddNodeCtx.Provider;

export function useAddNode() {
    return useContext(WorkflowAddNodeCtx);
}
