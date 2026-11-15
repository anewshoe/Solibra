import 'server-only';
import { memoryResourceId } from '@/lib/memories/http';

export function persistedVoiceScope(ids: Record<string, string>) {
  return {
    nookId: memoryResourceId(ids.nookId), artifactId: memoryResourceId(ids.artifactId),
    contributionId: memoryResourceId(ids.contributionId)
  };
}
