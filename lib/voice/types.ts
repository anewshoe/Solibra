export type VoiceTranscript = {
  transcript: string;
  originalLanguage: string;
};

export type VoiceProcessResult = VoiceTranscript & {
  translation: string;
  targetLanguage: string;
};

export type VoiceProcessError = {
  error: string;
};

/** Returned with a non-2xx status when transcription completed but translation failed. */
export type VoiceTranslationFailure = VoiceTranscript & VoiceProcessError & {
  stage: 'translation';
  targetLanguage: string;
};
