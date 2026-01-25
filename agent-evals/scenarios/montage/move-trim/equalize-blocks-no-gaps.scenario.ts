/**
 * Scenariusz: Zamień kolejność bloków, wyrównaj długości i usuń przerwy
 *
 * Chapter "Problem" zawiera 2 bloki z różnymi długościami i przerwami:
 * - Blok 1: id=46ebff95..., offset=25, duration=396 → kończy się na 421
 * - Blok 2: id=07f2ee66..., offset=448, duration=187 → kończy się na 635
 *
 * Problemy:
 * - Różnica długości: 209 frames (396 - 187)
 * - Przerwa przed blokiem 1: 25 frames
 * - Przerwa między blokami: 27 frames (448 - 421)
 * - Bloki są w niewłaściwej kolejności
 *
 * Agent powinien:
 * 1. Zamienić kolejność bloków (Blok 2 pierwszy, Blok 1 drugi)
 * 2. Użyć trimBlock do wyrównania długości (różnica ≤ 50 frames)
 * 3. Użyć moveBlocks do usunięcia przerw
 * 4. Blok 2 (07f2ee66...) zaczyna się od offsetu 0
 * 5. Blok 1 (46ebff95...) zaczyna się zaraz po bloku 2 (bez przerwy)
 *
 * Możliwe strategie agenta:
 * - Skrócić blok 1 do ~187 frames (wyrównanie do bloku 2)
 * - Wydłużyć blok 2 do ~396 frames (wyrównanie do bloku 1)
 * - Kombinacja (oba bloki do wartości pośredniej ~290)
 */

import type { TestScenario } from '../../../types/scenario';

export const scenario: TestScenario = {
  id: 'montage-move-trim-equalize-001',
  name: 'Zamień kolejność bloków, wyrównaj długości i usuń przerwy',
  agent: 'montage',
  tags: ['trimBlock', 'moveBlocks', 'equalize', 'removeGaps', 'swapOrder'],
  description: 'Agent powinien zamienić kolejność bloków (Blok 2 pierwszy), wyrównać długości (tolerancja ±50 klatek) i usunąć wszystkie przerwy',

  input: {
    userMessage: 'Zmontuj krótki film tylko zamień kolejność bloków i wyrównaj ich długości bez przerw',
    context: {
      projectId: 'e814f244-c66b-4b55-a681-b41a40efcd44',
      chapterId: 'a59a6ce2-e9bd-4338-a260-f8428f8a4a67',
    },
  },

  expectations: [
    // Wariant A: Agent skraca blok 1 do długości bloku 2 (~187 frames)
    // Po zamianie kolejności: Blok 2 jest pierwszy (offset=0), Blok 1 drugi
    {
      toolCalls: {
        required: ['trimBlock', 'moveBlocks', 'moveBlocksTo'],
      },
      finalState: {
        blocks: {
          modified: [
            {
              // Blok 2 (pierwotnie drugi) - teraz PIERWSZY
              match: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' },
              changes: {
                timelineOffsetInFrames: { equals: 0 },
                // Zachowuje oryginalną długość lub nieznacznie zmieniony (~187 ±50)
                durationInFrames: { gte: 137, lte: 237 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
            {
              // Blok 1 (pierwotnie pierwszy) - teraz DRUGI
              match: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
              changes: {
                // Offset = duration bloku 2 (w zakresie 137-237)
                timelineOffsetInFrames: { gte: 137, lte: 237 },
                // Skrócony do ~187 (±50 tolerancji = 137-237)
                durationInFrames: { gte: 137, lte: 237 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
          ],
        },
      },
    },
    // Wariant B: Agent wydłuża blok 2 do długości bloku 1 (~396 frames)
    // Po zamianie kolejności: Blok 2 jest pierwszy (offset=0), Blok 1 drugi
    {
      toolCalls: {
        required: ['trimBlock', 'moveBlocks', 'moveBlocksTo'],
      },
      finalState: {
        blocks: {
          modified: [
            {
              // Blok 2 (pierwotnie drugi) - teraz PIERWSZY
              match: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' },
              changes: {
                timelineOffsetInFrames: { equals: 0 },
                // Wydłużony do ~396 (±50 tolerancji = 346-446)
                durationInFrames: { gte: 346, lte: 446 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
            {
              // Blok 1 (pierwotnie pierwszy) - teraz DRUGI
              match: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
              changes: {
                // Offset = duration bloku 2 (w zakresie 346-446)
                timelineOffsetInFrames: { gte: 346, lte: 446 },
                // Zachowuje oryginalną długość lub nieznacznie zmieniony
                durationInFrames: { gte: 346, lte: 446 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
          ],
        },
      },
    },
    // Wariant C: Agent wyrównuje oba bloki do wartości pośredniej (~291 frames)
    // Po zamianie kolejności: Blok 2 jest pierwszy (offset=0), Blok 1 drugi
    {
      toolCalls: {
        required: ['trimBlock', 'moveBlocks', 'moveBlocksTo'],
      },
      finalState: {
        blocks: {
          modified: [
            {
              // Blok 2 (pierwotnie drugi) - teraz PIERWSZY
              match: { id: '07f2ee66-0c5a-4c6b-9994-98006cfd579e' },
              changes: {
                timelineOffsetInFrames: { equals: 0 },
                // Wartość pośrednia (241-341)
                durationInFrames: { gte: 187, lte: 200 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
            {
              // Blok 1 (pierwotnie pierwszy) - teraz DRUGI
              match: { id: '46ebff95-61a4-431d-81a5-586f92eeffd7' },
              changes: {
                // Offset = duration bloku 2
                timelineOffsetInFrames: { gte: 185, lte: 200 },
                // Wartość pośrednia (241-341)
                durationInFrames: { gte: 185, lte: 200 },
                fileRelativeStartFrame: { equals: 0 },
              },
            },
          ],
        },
      },
    },
  ],

  timeout: 120000,
};

export default scenario;
