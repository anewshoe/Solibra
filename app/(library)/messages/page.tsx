import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { MessageNookSelector } from '@/components/solibra/message-nook-selector';
export default async function MessagesPage() { const user=await requireProfileUser();return <MessageNookSelector viewerId={user.id}/>; }
