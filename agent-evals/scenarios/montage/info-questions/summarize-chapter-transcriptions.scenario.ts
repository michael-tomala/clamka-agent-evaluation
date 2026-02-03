/**
 * Scenariusz: Podsumowanie chaptera przez subagenta chapter-exploratora
 *
 * Testuje mechanizm delegacji zadań do subagentów:
 * 1. MontageAgent otrzymuje polecenie użycia chapter-exploratora
 * 2. MontageAgent deleguje do chapter-exploratora używając narzędzia Task
 * 3. Chapter-explorator pobiera listę bloków i ich transkrypcje
 * 4. MontageAgent zwraca podsumowanie treści chaptera
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-chapter-explorator-summarize-chapter-001',
  name: 'Podsumowanie chaptera przez chapter-exploratora',
  agent: 'montage',
  tags: [
    'chapter-explorator',
    'Task',
    'delegation',
    'getBlockTranscriptionSegments',
    'summarization',
    'info-question',
  ],
  description:
    'Agent deleguje do subagenta chapter-exploratora zadanie odczytania transkrypcji wszystkich bloków i tworzenia podsumowania chaptera',

  input: {
    userMessage:
      'Użyj agenta chapter-exploratora, aby odczytać transkrypcje wszystkich bloków na timeline i podsumuj chapter',
    context: {
      projectId: 'b3407ed2-3d9d-4474-bf06-58db3f96340f',
      chapterId: 'a33829ec-afb1-41d2-ab16-978a07b41701',
    },
  },

  expectations: [
    {
      toolCalls: {
        required: ['Task'], // Agent MUSI delegować do chapter-exploratora
        forbidden: [
          'moveBlocks',
          'moveBlocksTo',
          'trimBlock',
          'removeBlocks',
          'splitBlock',
          'updateBlockSchemaSettings',
          'createBlocksFromAssets',
          'createTimelines',
          'deleteTimeline',
          'createChapters',
        ],
      },
      agentBehavior: {
        type: 'completion',
      },
    },
  ],

  timeout: 120000,
};

export default scenario;
