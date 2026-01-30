/**
 * Scenariusz: Sprawdzenie klatek assetu do rozciągnięcia bloku
 *
 * Testuje czy agent użyje narzędzia renderAssetFrame
 * aby sprawdzić zawartość dalszych klatek w assetcie wideo.
 * Użytkownik chce wiedzieć czy może rozciągnąć blok wideo
 * który używa tylko pierwszej połowy materiału.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'media-scout-check-asset-frames-001',
  name: 'Sprawdzenie klatek assetu do rozciągnięcia bloku',
  agent: 'media-scout',
  tags: ['renderAssetFrame', 'asset-inspection', 'info-question'],
  description:
    'Agent sprawdza zawartość dalszych klatek w assetcie wideo, aby ocenić czy blok można rozciągnąć',

  input: {
    userMessage:
      'Sprawdź co znajduje się na dalszych klatkach assetu test1.mov (po klatce 200) - chcę wiedzieć czy mogę rozciągnąć blok wideo który używa tylko pierwszej połowy tego materiału.',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: '97353b61-3640-4a60-99a7-ca7c14c112e1', // Montaz
    },
  },

  expectations: [
    {
      toolCalls: {
        required: ['renderAssetFrame'],
        // Agent może też użyć getMediaAsset lub listMediaAssets
        optional: ['getMediaAsset', 'listMediaAssets'],
      },
      agentBehavior: {
        type: 'completion',
      },
    },
  ],

  timeout: 60000,
};

export default scenario;
