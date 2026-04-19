import { QuickReply, User, Workflow } from '@prisma/client';
import { MainAutoReplies } from './MainAutoReplies';
import { UserWorkflows } from '@/app/(root)/flow/_components';

interface Props {
    user: User;
    workflows: Workflow[];
    autoReplies: QuickReply[];
}

export const AutoRepliesContent = ({ user, workflows, autoReplies }: Props) => {
    if (workflows.length === 0) {
        return <UserWorkflows userId={user.id} isPro={false} />;
    }

    return <MainAutoReplies user={user} Workflows={workflows} autoReplies={autoReplies} />;
};