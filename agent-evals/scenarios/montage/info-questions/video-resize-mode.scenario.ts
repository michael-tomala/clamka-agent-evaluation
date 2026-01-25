/**
 * Scenariusz: Pytanie o rozmiar wideo vs rozdzielczość projektu
 *
 * Testuje czy agent poprawnie wyjaśnia działanie resizeMode
 * gdy użytkownik pyta dlaczego wideo nie jest w rozmiarze rozdzielczości projektu.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-info-resize-mode-001',
  name: 'Pytanie o rozmiar wideo - agent wyjaśnia resizeMode',
  agent: 'montage',
  tags: ['info-question', 'resizeMode', 'video-settings', 'no-modification'],
  description:
    'Agent powinien wyjaśnić że rozmiar wideo zależy od ustawienia resizeMode w settings bloku i opisać dostępne opcje',

  input: {
    userMessage: 'Dlaczego wideo nie jest w rozmiarze rozdzielczości projektu?',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'b5d510ff-0ad6-48f9-a028-f81ce41d9d6f', // Okolice
    },
  },

  expectations: [
    {
      // Agent NIE powinien modyfikować żadnych danych - to pytanie informacyjne
      toolCalls: {
        forbidden: ['moveBlocks', 'trimBlock', 'removeBlocks', 'splitBlock', 'updateBlock'],
      },

      // Odpowiedź agenta powinna zawierać wzmiankę o resizeMode
      agentBehavior: {
        type: 'completion',
      },
    },
  ],

  timeout: 60000,
};

export default scenario;
