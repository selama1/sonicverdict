// Define the structure of the analysis result
export enum Step {
  INPUT = 'INPUT',
  ANALYZING = 'ANALYZING',
  REPORT = 'REPORT',
  DISCUSSING = 'DISCUSSING',
  FULL_VIEW = 'FULL_VIEW'
}

export enum AIUsage {
  NONE = 'No AI Used',
  ASSISTED = 'AI-Assisted',
  GENERATED = 'AI-Generated'
}

export interface ScoreItem {
  criteria: string;
  score: number;
  rationale: string;
}

export interface LabelSuggestion {
  type: string;
  names: string[];
  reason: string;
}

export interface MarketingData {
  socialStrategy: string[];
  streamingStrategy: string[];
  targetLabels: LabelSuggestion[];
}

export interface ImprovementItem {
  suggestion: string;
  importance: 'Critical' | 'High' | 'Medium' | 'Low';
}

export interface ImprovementData {
  production: ImprovementItem;
  composition: ImprovementItem;
  performance: ImprovementItem;
}

export interface ProducerReport {
  artistName: string;
  songName: string;
  lyrics: string;
  timestamps: string[];
  prosodyIssues: string[];
  scores: ScoreItem[];
  technicalAnalysis: {
    mixBalance: string;
    stereoImage: string;
    fidelityIssues: string[];
  };
  composition: {
    key: string;
    bpm: string;
    harmonicAnalysis: string;
    melodicContour: string;
  };
  structure: {
    timeline: string;
    timeToChorus: string;
    energyGraph: string;
  };
  intentVsExecution: {
    gapAnalysis: string;
    verdict: string;
  };
  marketPositioning: {
    genreTags: string[];
    similarArtists: string[];
    playlistFit: string[];
  };
  marketingSuggestions: MarketingData;
  improvementTips: ImprovementData;
}

export interface ChatMessage {
  role: 'model' | 'user';
  text: string;
  producerName?: string; // Only for model messages in the panel
}

export interface FileData {
  base64: string;
  mimeType: string;
}