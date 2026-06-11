export interface VoiceMessageMock {
  id: string;
  sender: string;
  avatar: string;
  time: string;
  duration: string;
  language: string;
  originalText: string;
  englishText: string;
  romanUrduText?: string;
  summary: string;
  sentiment: string;
  audioWave: number[];
}

export interface TranscriptionResult {
  transcript: string;
  detectedLanguage: string;
  translation: string;
  romanUrduTranslation?: string;
  summary?: string;
  sentiment?: string;
  isDemo?: boolean;
}

export interface ExtensionFileBlueprint {
  fileName: string;
  language: string;
  code: string;
  description: string;
}
