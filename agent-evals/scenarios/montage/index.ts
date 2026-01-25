/**
 * Eksport wszystkich scenariuszy montage
 */

export { scenario as moveBlockLater } from './move-block-later.scenario';
export { scenario as moveBlockTooEarly } from './move-block-too-early.scenario';
export { scenario as moveBlockAmbiguous } from './move-blocks/move-block-ambiguous.scenario';
export { scenario as moveBlockWhichOne } from './move-blocks/move-block-which-one.scenario';
export { scenario as moveFirstBlock } from './move-first-block.scenario';
export { scenario as moveBlockWithContext } from './move-blocks/move-block-with-context.scenario';
export { scenario as removeAllGaps } from './remove-gaps/remove-all-gaps.scenario';
export { scenario as removeSecondBlock } from './remove-blocks/remove-second-block.scenario';
export { scenario as videoResizeMode } from './info-questions/video-resize-mode.scenario';
export { scenario as createTimelineMoveBlock } from './timeline-management/create-timeline-move-block.scenario';

import { scenario as moveBlockLater } from './move-block-later.scenario';
import { scenario as moveBlockTooEarly } from './move-block-too-early.scenario';
import { scenario as moveBlockAmbiguous } from './move-blocks/move-block-ambiguous.scenario';
import { scenario as moveBlockWhichOne } from './move-blocks/move-block-which-one.scenario';
import { scenario as moveFirstBlock } from './move-first-block.scenario';
import { scenario as moveBlockWithContext } from './move-blocks/move-block-with-context.scenario';
import { scenario as removeAllGaps } from './remove-gaps/remove-all-gaps.scenario';
import { scenario as removeSecondBlock } from './remove-blocks/remove-second-block.scenario';
import { scenario as videoResizeMode } from './info-questions/video-resize-mode.scenario';
import { scenario as createTimelineMoveBlock } from './timeline-management/create-timeline-move-block.scenario';

/**
 * Wszystkie scenariusze montage
 */
export const allMontageScenarios = [
  moveBlockLater,
  moveBlockTooEarly,
  moveBlockAmbiguous,
  moveBlockWhichOne,
  moveFirstBlock,
  moveBlockWithContext,
  removeAllGaps,
  removeSecondBlock,
  videoResizeMode,
  createTimelineMoveBlock,
];

/**
 * Scenariusze pogrupowane według kategorii
 */
export const scenariosByCategory = {
  moveBlocks: {
    basic: [moveBlockLater, moveBlockTooEarly],
    ambiguous: [moveBlockAmbiguous],
    multiBlock: [moveBlockWhichOne, moveFirstBlock, moveBlockWithContext],
  },
  removeBlocks: {
    basic: [removeSecondBlock],
  },
  removeGaps: {
    basic: [removeAllGaps],
  },
  infoQuestions: {
    videoSettings: [videoResizeMode],
  },
  timelineManagement: {
    basic: [createTimelineMoveBlock],
  },
};

export default allMontageScenarios;
