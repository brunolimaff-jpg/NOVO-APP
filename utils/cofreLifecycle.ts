// Contrato reconciliado por linhagem (gate MAIN-TYPECHECK-11-PUBLISH-01):
// variante A original (88291834) — importada pelo loading-progress-reducer em
// 78646b43 quando A era vigente; teste original (88291834) emite 'dossier'/
// 'follow_up'. A variante B ('chat'|'radar'|'war_room') surgiu apenas em
// remediações de CI (a65f425b/57ac72cd) sem produtores que a sustentem.
export type GenerationKind = 'dossier' | 'follow_up' | 'deep_dive' | null;
