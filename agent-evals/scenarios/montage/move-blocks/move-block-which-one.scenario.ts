/**
 * Scenariusz: Dwa bloki - agent dopytuje lub przesuwa oba
 *
 * Testuje czy agent prawidłowo identyfikuje wieloznaczność gdy są dwa bloki.
 * Akceptowalne zachowania:
 * 1. Agent dopytuje który blok i nie zmienia danych
 * 2. Agent przesuwa oba bloki
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-move-two-blocks-which-001',
  name: 'Dwa bloki - agent dopytuje lub przesuwa oba',
  agent: 'montage',
  tags: ['moveBlocks', 'clarification', 'multi-block', 'alternatives'],
  description: 'Agent powinien dopytać który blok lub przesunąć oba',

  input: {
    userMessage: 'Przesuń wideo o 2 sekundy później',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'a59a6ce2-e9bd-4338-a260-f8428f8a4a67',
    },
  },

  expectations: [
    // Alternatywa 1: Agent zapyta i nic nie zmieni
    {
      agentBehavior: {
        type: 'clarification_question',
        pattern: /który|blok|pierwszy|drugi|oba|1|2|wszystkie/i,
      },
      referenceTags: {
        required: [
          { tag: 'block', attrs: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' } },
          { tag: 'block', attrs: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' } },
        ],
        minCount: [{ tag: 'block', count: 2 }],
      },
      finalState: {
        blocks: {
          unchanged: [
            '46ebff95-61a4-431d-81a5-586f92eeffd7',
            '07f2ee66-0c5a-4c6b-9994-98006cfd579e',
          ],
        },
      },
    },
    // Alternatywa 2: Agent przesunie oba bloki o 2 sekundy (60 klatek przy 30fps)
    // Pierwszy blok: z klatek 25-421 → 85-481
    // Drugi blok: z klatek 448-635 → 508-695
    {
      agentBehavior: {
        type: 'tool_call',
        tool: 'moveBlocks',
      },
      finalState: {
        blocks: {
          modified: [
            {
              match: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
              changes: {
                timelineOffsetInFrames: { equals: 85 },
              },
            },
            {
              match: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' },
              changes: {
                timelineOffsetInFrames: { equals: 508 },
              },
            },
          ],
        },
      },
    },
  ],

  timeout: 40000,
};

export default scenario;
