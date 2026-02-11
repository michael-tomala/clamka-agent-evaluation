/**
 * Manualne warianty fixtures dla youtube-subscribe-card
 */

import type { CompositionTestFixture } from '../types';

export const youtubeSubscribeCardFixtures: CompositionTestFixture[] = [
  {
    id: 'youtube-subscribe-card--fast-animation',
    compositionDefinitionId: 'youtube-subscribe-card',
    variantName: 'Fast Animation',
    description: 'Szybka animacja slide-in i slide-out',
    props: {
      dataSource: 'manual',
      useConnectedChannel: true,
      customChannelId: '',
      channelName: 'Quick Channel',
      avatar: 'https://yt3.ggpht.com/BDgSMBCUlWGPDE290aFysMoCtO2dClwz_ODM_xZX0Lry0aX8ZhpJ3btCuGOR-R_m9NHHeDOs4Bs=s176-c-k-c0x00ffffff-no-rj',
      subscriberCount: 50000,
      buttonText: 'SUBSCRIBE',
      subscribedText: 'SUBSCRIBED',
      subscriberSuffix: 'subscribers',
      slideInDuration: 10,
      slideOutDuration: 10,
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
      anchorPoint: 'center-center',
    },
    width: 854,
    height: 480,
    durationInFrames: 180,
    fps: 30,
    tags: ['manual', 'fast-animation'],
  },
  {
    id: 'youtube-subscribe-card--large-numbers',
    compositionDefinitionId: 'youtube-subscribe-card',
    variantName: 'Large Numbers',
    description: 'Duża liczba subskrybentów - test formatowania',
    props: {
      dataSource: 'manual',
      useConnectedChannel: true,
      customChannelId: '',
      channelName: 'Mega Popular Channel With Very Long Name',
      avatar: 'https://yt3.ggpht.com/BDgSMBCUlWGPDE290aFysMoCtO2dClwz_ODM_xZX0Lry0aX8ZhpJ3btCuGOR-R_m9NHHeDOs4Bs=s176-c-k-c0x00ffffff-no-rj',
      subscriberCount: 999999999,
      buttonText: 'SUBSCRIBE',
      subscribedText: 'SUBSCRIBED',
      subscriberSuffix: 'subscribers',
      slideInDuration: 30,
      slideOutDuration: 30,
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
      anchorPoint: 'center-center',
    },
    width: 854,
    height: 480,
    durationInFrames: 180,
    fps: 30,
    tags: ['manual', 'edge-case', 'large-numbers'],
  },
];
