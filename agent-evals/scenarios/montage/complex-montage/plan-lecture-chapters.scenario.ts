/**
 * Scenariusz: Podział wykładu na chaptery na podstawie treści
 *
 * Testuje czy agent potrafi:
 * 1. Przeanalizować transkrypcję wykładu (~32 minuty)
 * 2. Zaproponować logiczny podział na chaptery
 * 3. Utworzyć te chaptery używając narzędzia createChapters
 *
 * Kontekst:
 * - Wykład "Czytanie etykiet przy insulinooporności" (~32 min, 362 segmenty transkrypcji)
 * - Asset ID: 02d10a4a-06f5-4288-af9e-a80c5e940372 (lut.mov)
 * - Chapter kontekstowy: Hook
 *
 * Oczekiwania:
 * - Agent przeanalizuje transkrypcję i zidentyfikuje główne sekcje tematyczne
 * - Utworzy 4-6 chapterów z opisowymi tytułami
 * - Użyje narzędzia createChapters
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-plan-lecture-chapters-001',
  name: 'Podział wykładu na chaptery na podstawie treści',
  agent: 'montage',
  tags: [
    'createChapters',
    'content-analysis',
    'chapter-planning',
    'lecture-structure',
  ],
  description:
    'Agent analizuje transkrypcję wykładu i tworzy logiczny podział na chaptery',

  input: {
    userMessage: `Przeanalizuj transkrypcję wykładu (asset: 02d10a4a-06f5-4288-af9e-a80c5e940372) i podziel go na rozdziały.

Wykład trwa około 32 minuty i dotyczy czytania etykiet produktów przy insulinooporności.

Zadanie:
1. Przeanalizuj treść i zidentyfikuj główne sekcje tematyczne
2. Zaproponuj podział na 4-6 chapterów
3. Utwórz te chaptery używając narzędzia createChapters

Każdy chapter powinien mieć opisowy tytuł po polsku.
Użyj template "default" dla wszystkich chapterów.`,

    context: {
      projectId: 'b3407ed2-3d9d-4474-bf06-58db3f96340f', // Wykład: Czytanie etykiet przy insulinooporności
      chapterId: 'a33829ec-afb1-41d2-ab16-978a07b41701', // Hook
    },
  },

  expectations: [
    {
      toolCalls: {
        // Agent MUSI utworzyć chaptery
        required: ['createChapters'],
        // Opcjonalnie może użyć subagenta media-scout do pobrania transkrypcji
        optional: ['Task'],
      },
    },
  ],

  timeout: 420000, // 7 minut - złożona analiza transkrypcji
};

export default scenario;
