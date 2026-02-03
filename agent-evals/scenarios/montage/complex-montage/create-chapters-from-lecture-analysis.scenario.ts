/**
 * Scenariusz: Analiza wykładu i tworzenie rozdziałów
 *
 * Testuje czy agent potrafi:
 * 1. Przeanalizować plik wykładu (lut.mov)
 * 2. Zaplanować podział na rozdziały
 * 3. Utworzyć nowe rozdziały zastępując aktualne
 *
 * Kontekst:
 * - Wykład "Czytanie etykiet przy insulinooporności" (~32 min)
 * - Asset ID: 02d10a4a-06f5-4288-af9e-a80c5e940372 (lut.mov)
 * - Chapter kontekstowy: Hook
 *
 * Oczekiwania:
 * - Agent przeanalizuje wykład i zidentyfikuje główne sekcje tematyczne
 * - Użyje narzędzia createChapters do utworzenia nowych rozdziałów
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-create-chapters-from-lecture-001',
  name: 'Analiza wykładu i tworzenie rozdziałów',
  agent: 'montage',

  tags: [
    'createChapters',
    'content-analysis',
    'chapter-planning',
    'lecture-structure',
    'batch-operation',
  ],

  description:
    'Agent analizuje plik wykładu (lut.mov), planuje podział na rozdziały i tworzy nowe rozdziały zastępując aktualne.',

  input: {
    userMessage:
      'Przeanalizuj plik z wykładem lut.mov i zaplanuj podział na rozdziały. Zastap aktualne rozdziały nowymi. Nie pytaj o zgode, tylko utworz chaptery!! Nie umieszczaj bloków w nowych rozdziałach.',
    context: {
      projectId: 'b3407ed2-3d9d-4474-bf06-58db3f96340f',
      chapterId: 'a33829ec-afb1-41d2-ab16-978a07b41701',
    },
  },

  expectations: [
    {
      toolCalls: {
        required: ['createChapters'],
        optional: [
          'Task',
          'listMediaAssets',
          'getBlockTranscriptionSegments',
          'searchTranscription',
          'listChapterTimelinesSimplifiedBlocks',
          'removeChapters',
        ],
      }
    },
  ],

  timeout: 400000,
};

export default scenario;
