export type VoiceProcessResult = {
  transcript: string;
  originalLanguage: string;
  translation: string;
  targetLanguage: string;
};

export type VoiceProcessError = {
  error: string;
};
