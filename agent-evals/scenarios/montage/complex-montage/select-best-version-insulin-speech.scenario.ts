/**
 * Scenariusz: Wybór lepszej wersji wypowiedzi o insulinooporności
 *
 * Testuje czy agent potrafi:
 * 1. Pobrać i przeanalizować transkrypcje z 2 różnych assetów
 * 2. Porównać jakość transkrypcji i wybrać lepszą wersję
 * 3. Zmontować fragment wypowiedzi z wybranego assetu
 *
 * Kontekst:
 * - 2 assety z tym samym nagraniem wypowiedzi o insulinooporności
 * - Asset 29cad02a ma błędy w transkrypcji ("przeinsulino porno", "etetyczny")
 * - Asset ca495b26 ma czystą transkrypcję (lepszy)
 *
 * Oczekiwana wypowiedź: "Jeśli ktoś mówi ci, że przy insulinoporności musisz
 * całkowicie odstawić chleb, to powiela pewien dietetyczny mit"
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-select-best-version-001',
  name: 'Wybór lepszej wersji wypowiedzi o insulinooporności',
  agent: 'montage',
  tags: [
    'createBlocksFromAssets',
    'complex-montage',
    'asset-selection',
    'transcription-quality',
  ],
  description:
    'Agent analizuje 2 assety z tą samą wypowiedzią, wybiera lepszą wersję na podstawie jakości transkrypcji i montuje fragment',

  input: {
    userMessage: `Zmontuj fragment wypowiedzi: "Jeśli ktoś mówi ci, że przy insulinoporności musisz całkowicie odstawić chleb, to powiela pewien dietetyczny mit".
Mamy dwa nagrania tej samej wypowiedzi - wybierz lepszą wersję (płynniejszą, z lepszą transkrypcją).
Całość ma być zmontowana płynnie i zrozumiale dla widza.`,
    context: {
      projectId: '2c32de44-0fa2-4e99-b272-401da7e79731', // Dietetyk Kamila Tomala - Instagram Short
      chapterId: 'b0f318db-5690-43b8-9c76-47b53d3cd64f', // Instagram
    },
  },

  expectations: [
    {
      toolCalls: {
        // Agent MUSI utworzyć bloki (getMediaAssetsTranscriptions wywołuje trans-agent)
        required: ['createBlocksFromAssets'],
        // Może też użyć innych narzędzi do eksploracji
        optional: [
          'listMediaAssets',
          'listChapterTimelinesSimplifiedBlocks',
          'searchScenes',
        ],
        // Brak zabronionych narzędzi
        forbidden: [],
      },

      finalState: {
        blocks: {
          added: [
            {
              match: {
                blockType: 'video',
              },
              changes: {
                // Blok powinien używać assetu ca495b26 (lepszego)
                mediaAssetId: {
                  equals: 'ca495b26-2467-4968-90e9-d9b174160c4b',
                },
                // fileRelativeStartFrame powinien być około 62 (początek wypowiedzi)
                fileRelativeStartFrame: { lte: 70 }, // tolerancja na trim
                // fileRelativeEndFrame powinien być około 211 (koniec "mit")
                fileRelativeEndFrame: { gte: 200 },
              },
            },
          ],
        },
      },
      // Usunięto referenceTags - tag 'mediaAsset' nie istnieje w systemie
    },
  ],

  timeout: 240000, // 3 minuty - złożone zadanie z wieloma narzędziami
};

export default scenario;
