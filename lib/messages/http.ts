import 'server-only';
import { nookId } from '@/lib/nooks/http';
export function messageScope(params:Record<string,string>) {return {nookId:nookId(params.nookId),messageId:nookId(params.messageId)};}
