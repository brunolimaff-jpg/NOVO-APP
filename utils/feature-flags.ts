export const isDebugSearch = () => process.env.DEBUG_SEARCH === '1';
export const isEvidencePipelineV2 = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EVIDENCE_PIPELINE_V2 === '1') ||
  (typeof process !== 'undefined' && process.env?.EVIDENCE_PIPELINE_V2 === '1');
