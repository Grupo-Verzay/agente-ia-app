'use client';

import { createContext, useContext } from 'react';
import { Action } from '@/types/workflow-node';

export type AddNodeFn = (params: {
    sourceId: string;
    sourceHandle: string;
    action: Action;
}) => void | Promise<void>;

const FlowAddNodeCtx = createContext<AddNodeFn | null>(null);

export const FlowAddNodeProvider = FlowAddNodeCtx.Provider;

export function useAddNode() {
    return useContext(FlowAddNodeCtx);
}
