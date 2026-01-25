/**
 * Scenariusz: Utwórz nowy timeline i przenieś drugie video
 *
 * Testuje czy agent potrafi:
 * 1. Utworzyć nowy timeline w chapterze
 * 2. Przenieść istniejący blok video na nowy timeline
 *
 * Chapter "Okolice" zawiera jeden timeline "Videos" z dwoma blokami:
 * - Blok 1: test1.mov (445b3c90-fb7b-410a-b601-f4e247099131)
 * - Blok 2: test2.mov (a8699f30-07cd-4482-9a1d-435f148f2e6b) ← ten ma być przeniesiony
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-create-timeline-move-block-001',
  name: 'Utworzenie nowego timeline i przeniesienie drugiego video',
  agent: 'montage',
  tags: ['createTimelines', 'moveBlocksTo', 'timeline-management'],
  description: 'Agent tworzy nowy timeline i przenosi na niego drugie video z istniejącego timeline',

  input: {
    userMessage: 'Utwórz nowy timeline i przenieś na nie drugie video',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'b5d510ff-0ad6-48f9-a028-f81ce41d9d6f', // Chapter "Okolice"
    },
  },

  expectations: [{
    toolCalls: {
      // Agent MUSI wywołać oba narzędzia
      required: ['createTimelines', 'moveBlocksTo'],
      // Może też listować timeline'y/bloki żeby zrozumieć kontekst
      optional: ['listChapterTimelinesSimplifiedBlocks', 'getBlockSettings'],
    },

    finalState: {
      blocks: {
        // Drugie video zostaje przeniesione - zmienia się timelineId
        modified: [
          {
            match: { id: 'a8699f30-07cd-4482-9a1d-435f148f2e6b' },
            changes: {
              // timelineId zmienia się (nie znamy dokładnego ID nowego timeline)
            },
          },
        ],
        // Pierwsze video pozostaje bez zmian
        unchanged: ['445b3c90-fb7b-410a-b601-f4e247099131'],
      },
      // Weryfikacja nowego timeline'u
      timelines: {
        added: [
          {
            match: {
              chapterId: 'b5d510ff-0ad6-48f9-a028-f81ce41d9d6f',
              type: 'video',
            },
          },
        ],
      },
    },
  }],

  timeout: 90000, // Operacja z 2 narzędziami może trwać dłużej
};

export default scenario;
