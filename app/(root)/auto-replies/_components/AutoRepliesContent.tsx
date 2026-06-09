import { QuickReply, User, Workflow } from '@prisma/client';
import { MainAutoReplies } from './MainAutoReplies';

interface Props {
    user: User;
    workflows: Workflow[];
    autoReplies: QuickReply[];
}

export const AutoRepliesContent = ({ user, workflows, autoReplies }: Props) => {
    return <MainAutoReplies user={user} Workflows={workflows} autoReplies={autoReplies} />;
};