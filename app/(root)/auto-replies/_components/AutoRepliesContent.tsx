import { QuickReply, User, Workflow } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth';
import { MainAutoReplies } from './MainAutoReplies';

interface Props {
    user: CurrentUser;
    workflows: Workflow[];
    autoReplies: QuickReply[];
}

export const AutoRepliesContent = ({ user, workflows, autoReplies }: Props) => {
    return <MainAutoReplies user={user} Workflows={workflows} autoReplies={autoReplies} />;
};