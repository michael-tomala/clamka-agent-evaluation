/**
 * Scenariusz: Sprawdzenie zawartości konkretnej klatki
 *
 * Testuje czy agent użyje narzędzia renderChapterFrame
 * gdy użytkownik pyta co znajduje się w konkretnej klatce.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-render-frame-246-001',
  name: 'Sprawdzenie zawartości klatki 246',
  agent: 'montage',
  tags: ['renderChapterFrame', 'info-question', 'frame-inspection'],
  description:
    'Agent powinien użyć renderChapterFrame aby pokazać co znajduje się w klatce 246',

  input: {
    userMessage: 'Co znajduje się w klatce 246?',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'b5d510ff-0ad6-48f9-a028-f81ce41d9d6f', // Okolice
    },
  },

  expectations: [
    {
      toolCalls: {
        required: ['renderChapterFrame'],
      },
    },
  ],

  timeout: 60000,
};

export default scenario;
