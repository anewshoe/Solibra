'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { members } from '@/lib/fixtures/conversations';

export function MemberAvatar({ memberId, size = 38 }: { memberId: keyof typeof members; size?: number }) {
  const member = members[memberId];
  return <Avatar style={{ width: size, height: size }}><AvatarImage src={member.image} alt={member.name} /><AvatarFallback>{member.name[0]}</AvatarFallback></Avatar>;
}
