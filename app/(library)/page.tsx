import { getUser } from '@/lib/db/queries';
import { Library } from '@/components/solibra/library';
export default async function LibraryPage() { const user = await getUser(); return <Library user={user ? {id:user.id,name:user.name,email:user.email}:null}/>; }
