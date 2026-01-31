/**
 * Scenariusz: Wybór krótkich wypowiedzi na hook otwierający film
 *
 * Testuje czy agent potrafi:
 * 1. Pobrać i przeanalizować transkrypcję z długiego wykładu
 * 2. Zidentyfikować 3-5 krótkich, angażujących wypowiedzi nadających się na hook
 * 3. Zmontować wybrane fragmenty jako oddzielne bloki na timeline
 *
 * Kontekst:
 * - Wykład "Czytanie etykiet przy insulinooporności" (~95 sekund transkrypcji, 362 segmenty)
 * - Asset ID: 02d10a4a-06f5-4288-af9e-a80c5e940372 (lut.mov)
 * - Chapter "Hook" z pustym timeline Videos
 *
 * Dobre kandydatki na hook (krótkie, angażujące, zaskakujące):
 * - "No bo powiedz sam, czy spodziewasz się cukru w parówkach, keczupie, czy chociażby pieczywie?"
 * - "Tak naprawdę jemy śniadanie, które napakowane może być nawet trzema łyżeczkami cukru"
 * - "Błyżeczka cukru to jest 5 gramów"
 * - "Dlaczego uważam, że czytanie etykiet jest bardzo ważne?"
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-select-hook-clips-001',
  name: 'Wybór krótkich wypowiedzi z wykładu na hook',
  agent: 'montage',
  tags: [
    'getMediaAssetsTranscriptions',
    'createBlocksFromAssets',
    'complex-montage',
    'hook-creation',
    'clip-selection',
    'content-analysis',
  ],
  description:
    'Agent analizuje transkrypcję długiego wykładu, wybiera 3-5 krótkich angażujących wypowiedzi i montuje je jako hook otwierający film',

  input: {
    userMessage: `Z filmu prezentującego wykład (id: 02d10a4a-06f5-4288-af9e-a80c5e940372) wybierz 3-5 krótkich wypowiedzi, które nadają się na hook otwierający film i zmontuj hook.

Hook powinien:
- Zaciekawić widza i zachęcić do oglądania dalej
- Zawierać krótkie, dynamiczne wypowiedzi (nie za długie fragmenty)
- Być zaskakujący lub stawiać pytania
- Całość hooka powinna trwać 15-30 sekund`,
    context: {
      projectId: 'b3407ed2-3d9d-4474-bf06-58db3f96340f', // Wykład: Czytanie etykiet przy insulinooporności
      chapterId: 'a33829ec-afb1-41d2-ab16-978a07b41701', // Hook
    },
  },

  expectations: [
    {
      toolCalls: {
        // Agent MUSI pobrać transkrypcje i utworzyć bloki
        required: ['createBlocksFromAssets'],
      },

      finalState: {
        blocks: {
          added: [
            // Sprawdzamy że dodano co najmniej 3 bloki video z tego assetu
            {
              match: {
                blockType: 'video',
                timelineId: '1ffb9580-8295-45eb-b4ad-07bb64b7db0b', // timeline Videos
                mediaAssetId: '02d10a4a-06f5-4288-af9e-a80c5e940372',
              },
              changes: {
                // Blok powinien być krótki (max ~10 sekund = 300 klatek przy 30fps)
                // fileRelativeEndFrame - fileRelativeStartFrame <= 300
              },
            },
            {
              match: {
                blockType: 'video',
                timelineId: '1ffb9580-8295-45eb-b4ad-07bb64b7db0b',
                mediaAssetId: '02d10a4a-06f5-4288-af9e-a80c5e940372',
              },
              changes: {},
            },
            {
              match: {
                blockType: 'video',
                timelineId: '1ffb9580-8295-45eb-b4ad-07bb64b7db0b',
                mediaAssetId: '02d10a4a-06f5-4288-af9e-a80c5e940372',
              },
              changes: {},
            },
          ],
        },
      },

    },
  ],

  timeout: 360000, // 3 minuty - złożone zadanie z analizą transkrypcji
};

export default scenario;
