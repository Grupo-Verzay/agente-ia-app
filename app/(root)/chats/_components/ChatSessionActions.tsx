'use client';

import { SwitchStatus } from '../../sessions/_components/SwitchStatus';
import { SwitchAgentDisabled } from '../../sessions/_components/SwitchAgentDisabled';
import type { Session } from '@/types/session';

type ChatSessionActionsProps = {
  session: Session | null;
  userId: string;
  mutateSessions: () => void;
};

export function ChatSessionActions({ session, userId, mutateSessions }: ChatSessionActionsProps) {
  if (!session) {
    return null;
  }

  return (
    <SwitchAgentDisabled
      agentDisabled={Boolean(session.agentDisabled)}
      userId={userId}
      sessionId={session.id}
      mutateSessions={mutateSessions}
    />
  );
}
