import { fixtureContributions, fixtureMessages, getArtifact, type Contribution, type Message } from '@/lib/fixtures/conversations';

export interface DemoState { messages: Message[]; contributions: Contribution[] }
export const initialDemoState: DemoState = { messages: fixtureMessages, contributions: fixtureContributions };

export type DemoAction =
  | { type: 'message'; message: Message }
  | { type: 'contribution'; contribution: Contribution; message: Extract<Message, { kind: 'voice' }> }
  | { type: 'translation'; contributionId: string; targetLanguage: string; translation: string };

// Enforce the same Circle → Artifact → Request → Contribution relationship
// in every view. No persistence or backend contract is implied by this reducer.
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'translation') return {
    ...state, contributions: state.contributions.map((item) => item.contributionId === action.contributionId
      ? { ...item, translations: { ...item.translations, [action.targetLanguage]: action.translation } } : item)
  };
  if (action.type === 'message') {
    const message = action.message;
    if (state.messages.some((item) => item.messageId === message.messageId)) return state;
    if (message.kind !== 'text' && !getArtifact(message.circleId, message.artifactId)) return state;
    if (message.kind === 'voice') return state; // Voice references are added atomically below.
    return { ...state, messages: [...state.messages, message] };
  }
  const { contribution, message } = action;
  if (!getArtifact(contribution.circleId, contribution.artifactId)) return state;
  if (state.contributions.some((item) => item.contributionId === contribution.contributionId)) return state;
  if (state.messages.some((item) => item.messageId === message.messageId)) return state;
  if (message.circleId !== contribution.circleId || message.artifactId !== contribution.artifactId || message.contributionId !== contribution.contributionId) return state;
  if (message.senderId !== contribution.authorId) return state;
  if (contribution.requestMessageId) {
    const request = state.messages.find((item) => item.messageId === contribution.requestMessageId);
    if (!request || request.kind !== 'request' || request.circleId !== contribution.circleId || request.artifactId !== contribution.artifactId || request.threadId !== message.threadId || request.recipientId !== contribution.authorId) return state;
  }
  return { messages: [...state.messages, message], contributions: [...state.contributions, contribution] };
}
