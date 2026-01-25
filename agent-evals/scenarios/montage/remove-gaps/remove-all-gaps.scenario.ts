/**
 * Scenariusz: Dwa bloki z przerwami - usuń wszystkie przerwy
 *
 * Chapter "Problem" zawiera 2 bloki z przerwami:
 * - Blok 1: offset=25, duration=396 → kończy się na 421
 * - Blok 2: offset=448, duration=187 → kończy się na 635
 *
 * Przerwy:
 * - Przed blokiem 1: 25 frames (0-25)
 * - Między blokami: 27 frames (421-448)
 * - Suma: 52 frames
 *
 * Po usunięciu przerw:
 * - Blok 1: offset=0
 * - Blok 2: offset=396 (zaraz po bloku 1)
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-remove-gaps-001',
  name: 'Dwa bloki z przerwami - usuń wszystkie przerwy',
  agent: 'montage',
  tags: ['removeGaps', 'moveBlocks', 'compact'],
  description: 'Agent powinien przesunąć bloki tak aby nie było przerw - od klatki 0, jeden po drugim',

  input: {
    userMessage: 'Usuń wszystkie przerwy z filmu',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'a59a6ce2-e9bd-4338-a260-f8428f8a4a67',
    },
  },

  expectations: [{
    toolCalls: {
      required: ['moveBlocks'],
    },

    finalState: {
      blocks: {
        modified: [
          {
            match: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
            changes: {
              timelineOffsetInFrames: { equals: 0 },
            },
          },
          {
            match: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' },
            changes: {
              timelineOffsetInFrames: { equals: 396 },
            },
          },
        ],
      },
    },
  }],

  timeout: 40000,
};

export default scenario;
