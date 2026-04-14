// Public facade preserved for App.tsx, ChatInterface.tsx, LoadingSmart.tsx and tests.
// Internal decomposition lives under services/gemini/.

export { getPortaState, resetPortaState, initPortaState } from './portaStateService';
export { parsePortaMarkerV2 } from '../utils/porta';

export type {
  GeminiRequestOptions,
  SendMessageToGeminiResult,
  SpotterExtractedData,
} from './gemini/contracts';
export type { ParsedPortaFeeds } from './gemini/porta';

export { cleanPortaFeedMarkers, parseMarkers, parsePortaFeeds } from './gemini/porta';
export { generateContinuityQuestion, generateLoadingCuriosities } from './gemini/auxiliary';
export { generateDossierModule, getIsolatedBenchmark, sendMessageToGemini } from './gemini/investigation-orchestration';
export { isMegaPromptRequest } from './gemini/runtime';
