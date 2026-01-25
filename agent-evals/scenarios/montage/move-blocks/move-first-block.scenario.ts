/**
 * Scenariusz: Dwa bloki - przesunięcie pierwszego powoduje nakładanie
 *
 * Testuje czy agent wykrywa kolizję i pyta użytkownika o potwierdzenie
 * gdy przesunięcie spowoduje nakładanie się bloków.
 */

import type { TestScenario } from '../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-move-first-block-001',
  name: 'Przesunięcie bloku powodujące nakładanie - agent powinien dopytać',
  agent: 'montage',
  tags: ['moveBlocks', 'clarification', 'overlap', 'collision-detection'],
  description: 'Agent powinien wykryć, że przesunięcie spowoduje nakładanie bloków i zapytać o potwierdzenie',

  input: {
    userMessage: 'Przesuń pierwszy blok o 2 sekundy później',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'a59a6ce2-e9bd-4338-a260-f8428f8a4a67',
    },
  },

  expectations: [{

    // Agent powinien odnieść się do obu bloków w odpowiedzi
    referenceTags: {
      required: [
        { tag: 'block', attrs: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' } }, // Blok 1
        { tag: 'block', attrs: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' } }, // Blok 2
      ],
      minCount: [{ tag: 'block', count: 2 }],
    },

    // Bloki NIE powinny być zmienione bez potwierdzenia użytkownika
    finalState: {
      blocks: {
        unchanged: [
          '46ebff95-61a4-431d-81a5-586f92eeffd7', // Blok 1
          '07f2ee66-0c5a-4c6b-9994-98006cfd579e', // Blok 2
        ],
      },
    },
  }],

  timeout: 40000,
};

export default scenario;
