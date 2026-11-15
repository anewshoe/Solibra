// Sample activity, not a live activity feed or backend response.
export interface RecentAddition {
  id: string;
  circleId: string;
  nookName: string;
  artifactId: string;
  activity: string;
}
export const sampleRecentAdditions: RecentAddition[] = [{
  id: 'sample-kitchen-voice', circleId: 'rivera-family', nookName: 'The Rivera family',
  artifactId: 'sundays-in-her-kitchen', activity: 'Elena added a voice recording to “Sundays in her kitchen.”'
}];
