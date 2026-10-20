export interface WorkspaceAsset { path: string; name: string; loaded: boolean }
export type PreviewTarget =
  | { kind: 'sprite'; setName: string; spriteIndex: number }
  | { kind: 'source'; sceneIndex: number; videoId: number; sourceIndex: number }
  | { kind: 'composition'; sceneIndex: number; compositionId: number }
