/**
 * Scenariusz: Usuwanie wypowiedzi off-camera i zacięć z wykładu Hook
 *
 * Testuje czy agent potrafi:
 * 1. Przeanalizować transkrypcje bloków na timeline
 * 2. Zidentyfikować wypowiedzi off-camera (komendy reżyserskie, prośby o przerwę)
 * 3. Zidentyfikować zacięcia (nieoczekiwane pauzy, nielogiczne przerwania)
 * 4. Usunąć lub przyciąć problematyczne fragmenty
 *
 * Kontekst fixture:
 * - Chapter "Hook" z wykładu
 * - 58 bloków, aktualny czas ~13:29 min (24,278 klatek @ 30 FPS)
 * - Cel: skrócić poniżej 12 minut
 *
 * Zidentyfikowane fragmenty off-camera (source FPS 50):
 * 1. "Nie umiem tak." - frames 632-675
 * 2. "Poczekaj, zatrzymaj na chwilę." - frames 65,826-65,897
 * 3. "Ale jesteś, poczekaj." - frames 75,283-75,356
 *
 * Agent musi znaleźć WIĘCEJ fragmentów niż te 3 oczywiste, aby osiągnąć cel <12 min.
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-remove-off-camera-stutters-001',
  name: 'Usuwanie wypowiedzi off-camera i zacięć z wykładu Hook',
  agent: 'montage',
  tags: [
    'removeBlocks',
    'trimBlock',
    'getBlockTranscriptionSegments',
    'renderChapterAudio',
    'complex-montage',
    'off-camera-removal',
    'cleanup',
  ],
  description:
    'Agent analizuje transkrypcje bloków, identyfikuje wypowiedzi off-camera i zacięcia, usuwa lub przycina problematyczne fragmenty aby skrócić chapter poniżej 12 minut',

  input: {
    userMessage: `Usuń z timeline wszystkie wypowiedzi off-camera oraz zacięcia.

Wypowiedzi off-camera to fragmenty gdzie ktoś mówi "za kamerą" - komendy reżyserskie,
prośby o przerwę, pomyłki typu "nie umiem tak", "poczekaj", "zatrzymaj".

Zacięcia to fragmenty z nieoczekiwanymi pauzami lub nielogicznymi przerwami.

Przeanalizuj transkrypcje bloków, zidentyfikuj i usuń problematyczne fragmenty. 
Nie pytaj o potwierdzenie.`,
    context: {
      projectId: 'b3407ed2-3d9d-4474-bf06-58db3f96340f',
      chapterId: 'a33829ec-afb1-41d2-ab16-978a07b41701',
    },
  },

  expectations: [
    // Opcja 1: Agent usuwa całe bloki
    {
      toolCalls: {
        required: ['removeBlocks'],
        optional: [
          'listChapterTimelinesSimplifiedBlocks',
          'getBlockTranscriptionSegments',
          'renderChapterAudio',
          'trimBlock',
          'splitBlock',
        ],
        forbidden: ['createBlocksFromAssets'],
      },
    },
    // Opcja 2: Agent przycina bloki (bez usuwania całych)
    {
      toolCalls: {
        required: ['trimBlock'],
        optional: [
          'listChapterTimelinesSimplifiedBlocks',
          'getBlockTranscriptionSegments',
          'renderChapterAudio',
          'removeBlocks',
          'splitBlock',
        ],
        forbidden: ['createBlocksFromAssets'],
      },
    },
  ],

  timeout: 480000, // 8 minut - złożone zadanie wymagające analizy wielu bloków
};

export default scenario;
