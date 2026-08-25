'use client';

import { createContext, useContext } from 'react';
import type { DiagramaAction } from './diagrama-node-types';

export type AddNodeFn = (params: {
    sourceId: string;
    sourceHandle: string;
    action: DiagramaAction;
}) => void | Promise<void>;

const FlowAddNodeCtx = createContext<AddNodeFn | null>(null);

export const FlowAddNodeProvider = FlowAddNodeCtx.Provider;

export function useAddNode() {
    return useContext(FlowAddNodeCtx);
}
