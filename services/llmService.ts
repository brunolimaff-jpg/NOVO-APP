// Public facade preserved for App.tsx, ChatInterface.tsx, LoadingSmart.tsx and tests.
// Internal decomposition lives under services/llm/.

export { getPortaState, resetPortaState, initPortaState } from './portaStateService';
export { parsePortaMarkerV2 } from '../utils/porta';

export type { LlmRequestOptions, SendMessageToLlmResult, SpotterExtractedData } from './llm/contracts';
export type { ParsedPortaFeeds } from './llm/porta';

export { cleanPortaFeedMarkers, parseMarkers, parsePortaFeeds } from './llm/porta';
export { generateContinuityQuestion } from './llm/auxiliary';
export { generateDossierModule, getIsolatedBenchmark, sendMessageToLlm } from './llm/investigation-orchestration';
export { isMegaPromptRequest } from './llm/runtime';
