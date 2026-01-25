/**
 * Scenariusz: Przesunięcie bloku powodujące kolizję
 *
 * Testuje czy agent wykryje że przesunięcie spowoduje nałożenie na inny blok.
 * Blok 1 (46ebff95): pozycja 25, długość 396 klatek → kończy się na 421
 * Blok 2 (07f2ee66): pozycja 448
 *
 * Przesunięcie o 2 sekundy (60 klatek przy 30 FPS):
 * Nowa pozycja: 25 + 60 = 85
 * Blok kończy się na: 85 + 396 = 481
 * Blok 2 zaczyna na 448 → KOLIZJA!
 *
 * Agent powinien zapytać użytkownika o potwierdzenie zamiast automatycznie wykonać operację.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-move-block-with-context-001',
  name: 'Przesunięcie bloku powodujące kolizję - agent pyta o potwierdzenie',
  agent: 'montage',
  tags: ['moveBlocks', 'contextRefs', 'collision', 'clarification'],
  description: 'Agent powinien wykryć kolizję i zapytać użytkownika o potwierdzenie',

  input: {
    userMessage: 'Przesuń wideo o 2 sekundy później',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'a59a6ce2-e9bd-4338-a260-f8428f8a4a67',
      contextRefs: [
        { type: 'block', id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
      ],
    },
  },

  expectations: [{
    // Agent powinien zapytać o potwierdzenie ze względu na kolizję
    agentBehavior: {
      type: 'clarification_question',
      pattern: 'nało|koliz|nakład|zachodz|konflik|potwierdz',
    },

    toolCalls: {
      // Agent może sprawdzić stan bloków przed wykryciem kolizji
      optional: ['listChapterTimelinesSimplifiedBlocks', 'getBlockSettings'],
      // Ale NIE powinien wykonać moveBlocks bez potwierdzenia
      forbidden: ['moveBlocks'],
    },

    // Bloki nie powinny zostać zmodyfikowane
    finalState: {
      blocks: {
        unchanged: [
          '46ebff95-61a4-431d-81a5-586f92eeffd7',
          '07f2ee66-0c5a-4c6b-9994-98006cfd579e',
        ],
      },
    },
  }],

  timeout: 60000,
};

export default scenario;
