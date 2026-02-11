/**
 * Typy dla systemu testowania kompozycji Remotion
 */

export interface CompositionTestFixture {
  id: string;                              // np. 'x-post--default-dark'
  compositionDefinitionId: string;         // np. 'x-post'
  variantName: string;                     // np. 'Default Dark'
  description: string;
  props: Record<string, unknown>;          // flat props BEZ prefixu 'composition.props.'
  width: number;                           // viewport
  height: number;
  durationInFrames: number;                // czas trwania kompozycji
  fps: number;                             // default 30
  tags: string[];
}

export type RenderEngine = 'remotion' | 'puppeteer';

export interface CompositionRenderJob {
  jobId: string;
  fixtureId: string;
  compositionDefinitionId: string;
  variantName: string;
  status: 'pending' | 'rendering' | 'encoding' | 'completed' | 'error';
  progress: number;
  outputPath?: string;
  error?: string;
  renderDurationMs?: number;
  startedAt: string;
  completedAt?: string;
  engine: RenderEngine;
  useBackgroundVideo?: boolean;
}

export interface CompositionBatchJob {
  batchId: string;
  jobs: CompositionRenderJob[];
  status: 'pending' | 'running' | 'completed' | 'error';
  completedCount: number;
  totalCount: number;
}
