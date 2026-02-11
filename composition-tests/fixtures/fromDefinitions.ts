/**
 * Auto-generowanie fixtures z definicji kompozycji (examples)
 */

import { builtinCompositionDefinitions } from '../../../desktop-app/shared/builtins/compositions/index';
import type { CompositionTestFixture } from '../types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generuje fixtures z pola `examples` każdej definicji kompozycji
 */
export function generateFixturesFromDefinitions(): CompositionTestFixture[] {
  const fixtures: CompositionTestFixture[] = [];

  for (const definition of builtinCompositionDefinitions) {
    if (!definition.examples || definition.examples.length === 0) continue;

    for (const example of definition.examples) {
      const fixture: CompositionTestFixture = {
        id: `${definition.id}--${slugify(example.name)}`,
        compositionDefinitionId: definition.id,
        variantName: example.name,
        description: example.description || `${definition.name} - ${example.name}`,
        props: { ...example.props },
        width: example.width || 1920,
        height: example.height || 1080,
        durationInFrames: definition.defaultDurationInFrames,
        fps: 30,
        tags: ['auto-generated'],
      };

      fixtures.push(fixture);
    }
  }

  return fixtures;
}
