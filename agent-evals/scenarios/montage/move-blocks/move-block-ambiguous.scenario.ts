/**
 * Scenariusz: Dwuznaczne polecenie - przesuń (kierunek nieznany)
 *
 * Testuje zachowanie agenta gdy kierunek nie jest jasny.
 * Agent powinien albo dopytać, albo wykonać operację w domyślnym kierunku.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-move-block-ambiguous-001',
  name: 'Dwuznaczne polecenie - przesuń (kierunek nieznany)',
  agent: 'montage',
  tags: ['moveBlocks', 'ambiguous', 'clarification'],
  description: 'Agent powinien dopytać o kierunek lub wykonać domyślną operację',

  input: {
    userMessage: 'Przesuń blok o 2 sekundy',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'f45ffef1-6deb-4d70-9d39-979834aa4570',
    },
  },

  expectations: [{
    // Agent powinien dopytać o kierunek LUB założyć kierunek i wykonać
    agentBehavior: {
      type: 'clarification_question',
      oneOf: [
        {
          type: 'clarification_question',
          pattern: /kierunek|prawo|lewo|później|wcześniej|w którą stronę|naprzód|wstecz/i,
        },
        {
          type: 'tool_call',
          tool: 'moveBlocks',
          args: {
            deltaInFrames: { oneOf: [60, -60] }, // 2s * 30fps = 60 (w prawo lub lewo)
          },
        },
      ],
    },
  }],

  timeout: 40000,
};

export default scenario;
