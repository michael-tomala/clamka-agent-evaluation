/**
 * Manualne warianty fixtures dla blur-background-image
 */

import type { CompositionTestFixture } from '../types';

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%234F46E5'/%3E%3Cstop offset='100%25' stop-color='%23EC4899'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='200' height='200'/%3E%3C/svg%3E";

export const blurBackgroundImageFixtures: CompositionTestFixture[] = [
  {
    id: 'blur-background-image--max-blur',
    compositionDefinitionId: 'blur-background-image',
    variantName: 'Max Blur',
    description: 'Maksymalne rozmycie tła (100px) z niską jasnością',
    props: {
      imageAssetId: PLACEHOLDER_IMAGE,
      backgroundBlur: 100,
      backgroundBrightness: 0.3,
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
      anchorPoint: 'center-center',
      shadowEnabled: false,
      'shadow.color': '#000000',
      'shadow.blur': 20,
      'shadow.offsetX': 0,
      'shadow.offsetY': 5,
      'shadow.opacity': 0.3,
    },
    width: 384,
    height: 216,
    durationInFrames: 150,
    fps: 30,
    tags: ['manual', 'edge-case', 'max-blur'],
  },
  {
    id: 'blur-background-image--with-shadow',
    compositionDefinitionId: 'blur-background-image',
    variantName: 'With Shadow',
    description: 'Obrazek z cieniem drop shadow',
    props: {
      imageAssetId: PLACEHOLDER_IMAGE,
      backgroundBlur: 30,
      backgroundBrightness: 0.7,
      positionX: 0.5,
      positionY: 0.5,
      scale: 0.8,
      anchorPoint: 'center-center',
      shadowEnabled: true,
      'shadow.color': '#000000',
      'shadow.blur': 40,
      'shadow.offsetX': 5,
      'shadow.offsetY': 10,
      'shadow.opacity': 0.6,
    },
    width: 854,
    height: 480,
    durationInFrames: 150,
    fps: 30,
    tags: ['manual', 'shadow'],
  },
];
