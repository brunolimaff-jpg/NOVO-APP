export type WarRoomMode = 'tech' | 'killscript' | 'benchmark' | 'objections';

export type WarRoomRoute = 'tech' | 'benchmark';

export interface WarRoomMessage {
  role: 'user' | 'model';
  text: string;
}

export interface WarRoomSource {
  title: string;
  url: string;
}

export interface WarRoomResult {
  text: string;
  sources: WarRoomSource[];
  outOfScope?: boolean;
  isError?: boolean;
  retryable?: boolean;
  technicalDetails?: string;
}

export interface WarRoomQueryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WarRoomIntentFlags {
  wantsProcessoAgricola: boolean;
  wantsIntegracao: boolean;
  wantsFercus: boolean;
  wantsTalhao: boolean;
  wantsGatecAgricola: boolean;
  wantsBanking: boolean;
}

export interface WarRoomDocsContextResult {
  docsContext: string;
  docsUnavailable: boolean;
}

export interface GroundingResponseLike {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
    };
  }>;
}

export interface WarRoomModelResponse extends GroundingResponseLike {
  text?: string;
}
