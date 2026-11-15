import { CreateNookWorkflow } from '@/components/solibra/create-nook';
import { requireProfileUser } from '@/lib/auth/require-profile-user';
import '@/components/solibra/create-nook.css';
export default async function CreateNookPage() { const user=await requireProfileUser();return <CreateNookWorkflow viewerId={user.id}/>; }
