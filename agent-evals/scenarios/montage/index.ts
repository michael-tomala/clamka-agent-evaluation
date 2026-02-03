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
export { scenario as checkFrameContent } from './info-questions/check-frame-content.scenario';
export { scenario as summarizeChapterTranscriptions } from './info-questions/summarize-chapter-transcriptions.scenario';
export { scenario as createTimelineMoveBlock } from './timeline-management/create-timeline-move-block.scenario';
export { scenario as selectBestVersionInsulinSpeech } from './complex-montage/select-best-version-insulin-speech.scenario';
export { scenario as selectHookClipsFromLecture } from './complex-montage/select-hook-clips-from-lecture.scenario';
export { scenario as planLectureChapters } from './complex-montage/plan-lecture-chapters.scenario';
export { scenario as createChaptersFromLectureAnalysis } from './complex-montage/create-chapters-from-lecture-analysis.scenario';

import { scenario as moveBlockLater } from './move-block-later.scenario';
import { scenario as moveBlockTooEarly } from './move-block-too-early.scenario';
import { scenario as moveBlockAmbiguous } from './move-blocks/move-block-ambiguous.scenario';
import { scenario as moveBlockWhichOne } from './move-blocks/move-block-which-one.scenario';
import { scenario as moveFirstBlock } from './move-first-block.scenario';
import { scenario as moveBlockWithContext } from './move-blocks/move-block-with-context.scenario';
import { scenario as removeAllGaps } from './remove-gaps/remove-all-gaps.scenario';
import { scenario as removeSecondBlock } from './remove-blocks/remove-second-block.scenario';
import { scenario as videoResizeMode } from './info-questions/video-resize-mode.scenario';
import { scenario as checkFrameContent } from './info-questions/check-frame-content.scenario';
import { scenario as summarizeChapterTranscriptions } from './info-questions/summarize-chapter-transcriptions.scenario';
import { scenario as createTimelineMoveBlock } from './timeline-management/create-timeline-move-block.scenario';
import { scenario as selectBestVersionInsulinSpeech } from './complex-montage/select-best-version-insulin-speech.scenario';
import { scenario as selectHookClipsFromLecture } from './complex-montage/select-hook-clips-from-lecture.scenario';
import { scenario as planLectureChapters } from './complex-montage/plan-lecture-chapters.scenario';
import { scenario as createChaptersFromLectureAnalysis } from './complex-montage/create-chapters-from-lecture-analysis.scenario';

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
  checkFrameContent,
  createTimelineMoveBlock,
  selectBestVersionInsulinSpeech,
  selectHookClipsFromLecture,
  planLectureChapters,
  summarizeChapterTranscriptions,
  createChaptersFromLectureAnalysis,
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
    frameInspection: [checkFrameContent],
    transcriptionSummary: [summarizeChapterTranscriptions],
  },
  timelineManagement: {
    basic: [createTimelineMoveBlock],
  },
  complexMontage: {
    assetSelection: [selectBestVersionInsulinSpeech],
    hookCreation: [selectHookClipsFromLecture],
    chapterPlanning: [planLectureChapters, createChaptersFromLectureAnalysis],
  },
};

export default allMontageScenarios;
