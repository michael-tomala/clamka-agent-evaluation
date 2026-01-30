/**
 * Eksport wszystkich scenariuszy media-scout
 */

export { scenario as checkAssetFramesForExtension } from './asset-inspection/check-asset-frames-for-extension.scenario';

import { scenario as checkAssetFramesForExtension } from './asset-inspection/check-asset-frames-for-extension.scenario';

/**
 * Wszystkie scenariusze media-scout
 */
export const allMediaScoutScenarios = [checkAssetFramesForExtension];

/**
 * Scenariusze pogrupowane według kategorii
 */
export const scenariosByCategory = {
  assetInspection: {
    frameAnalysis: [checkAssetFramesForExtension],
  },
};

export default allMediaScoutScenarios;
