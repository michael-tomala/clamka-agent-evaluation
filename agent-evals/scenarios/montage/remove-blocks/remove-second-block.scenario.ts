/**
 * Scenariusz: Okolice - usuń drugi blok
 *
 * Chapter "Okolice" zawiera 2 bloki:
 * - Blok 1: ID=445b3c90-fb7b-410a-b601-f4e247099131, offset=62, media: test1.mov
 * - Blok 2: ID=a8699f30-07cd-4482-9a1d-435f148f2e6b, offset=535, media: test2.mov (DO USUNIĘCIA)
 *
 * Agent powinien usunąć drugi blok za pomocą narzędzia removeBlocks.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-remove-second-block-001',
  name: 'Okolice - usuń drugi blok',
  agent: 'montage',
  tags: ['removeBlocks', 'deletion', 'single-block'],
  description: 'Agent powinien usunąć drugi blok z chapteru Okolice',

  input: {
    userMessage: 'Usuń drugi blok',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'b5d510ff-0ad6-48f9-a028-f81ce41d9d6f',
    },
  },

  expectations: [{
    toolCalls: {
      required: ['removeBlocks'],
    },

    finalState: {
      blocks: {
        deleted: ['a8699f30-07cd-4482-9a1d-435f148f2e6b'],
        unchanged: ['445b3c90-fb7b-410a-b601-f4e247099131'],
      },
    },
  }],

  timeout: 60000,
};

export default scenario;
