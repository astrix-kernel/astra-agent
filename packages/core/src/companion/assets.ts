/**
 * Character asset manifest for the Aemeath companion.
 *
 * Proprietary artwork is intentionally kept out of the source tree. This manifest
 * declares every asset the renderers expect, where it should live, and how it is
 * used. The Web and CLI loaders read the manifest to decide which renderer to
 * use and to surface a precise, actionable error when an asset is missing.
 */

export type CompanionAssetKind = 'sprite-sheet' | 'portrait' | 'live2d-model' | 'vrm-model' | 'halos';

export type CompanionRenderMode = 'sprite' | 'live2d' | 'vrm' | 'portrait' | 'fallback';

export interface CompanionAsset {
  /** Stable identifier referenced by the loaders. */
  id: string;
  kind: CompanionAssetKind;
  /** Path relative to the companion asset root. */
  path: string;
  /** Renderers that can consume this asset. */
  modes: readonly CompanionRenderMode[];
  /** Optional list of frame files for sprite sheets. */
  frames?: readonly string[];
  /** True when the asset is licensed from the game and must not be redistributed. */
  proprietary: boolean;
  /** Human readable note about what the asset provides. */
  note?: string;
}

/** Directory (relative to the app root) that holds character assets. */
export const COMPANION_ASSET_ROOT = 'assets/companion/aemeath';

/**
 * Declared assets. Entries marked `proprietary: true` must be supplied locally
 * by the user; they are never committed to the repository.
 */
export const COMPANION_ASSETS: readonly CompanionAsset[] = [
  {
    id: 'aemeath.halo',
    kind: 'halos',
    path: 'halo/aemeath-halo.png',
    modes: ['sprite', 'portrait', 'fallback'],
    proprietary: true,
    note: 'Blue digital halo with wing-like motifs, transparent PNG.',
  },
  {
    id: 'aemeath.portrait',
    kind: 'portrait',
    path: 'portrait/aemeath-portrait.webp',
    modes: ['portrait', 'fallback'],
    proprietary: true,
    note: 'Half-body transparent portrait used for the compact companion.',
  },
  {
    id: 'aemeath.fullbody',
    kind: 'portrait',
    path: 'portrait/aemeath-fullbody.webp',
    modes: ['portrait', 'fallback'],
    proprietary: true,
    note: 'Full-body transparent render used when the companion is expanded.',
  },
  {
    id: 'aemeath.sprite',
    kind: 'sprite-sheet',
    path: 'sprite/aemeath-sprite.png',
    frames: [
      'idle-00',
      'idle-01',
      'idle-02',
      'idle-03',
      'blink-00',
      'talk-00',
      'talk-01',
      'think-00',
      'work-00',
      'happy-00',
      'sorry-00',
    ],
    modes: ['sprite'],
    proprietary: true,
    note: 'Sprite sheet with idle/blink/talk/think/work/happy/sorry frames.',
  },
  {
    id: 'aemeath.state.frames',
    kind: 'sprite-sheet',
    path: 'sprite/aemeath-{state}.webp',
    frames: [
      'idle',
      'listen',
      'think',
      'plan',
      'talk',
      'work',
      'approve',
      'happy',
      'sorry',
    ],
    modes: ['sprite', 'portrait', 'fallback'],
    proprietary: true,
    note: 'Per-state transparent frames: sprite/aemeath-<state>.webp',
  },
  {
    id: 'aemeath.live2d',
    kind: 'live2d-model',
    path: 'live2d/aemeath.model3.json',
    modes: ['live2d'],
    proprietary: true,
    note: 'Live2D Cubism model directory (model3.json + moc3 + textures).',
  },
  {
    id: 'aemeath.vrm',
    kind: 'vrm-model',
    path: 'vrm/aemeath.vrm',
    modes: ['vrm'],
    proprietary: true,
    note: 'VRM 1.0 model rendered with three.js.',
  },
];

/** Preference order used when several asset kinds are available. */
export const COMPANION_RENDER_PREFERENCES: readonly CompanionRenderMode[] = ['live2d', 'vrm', 'sprite', 'portrait', 'fallback'];

export interface CompanionAssetReport {
  id: string;
  present: boolean;
  path: string;
  note?: string;
}

/** Human readable guidance shown when required artwork is missing. */
export const MISSING_ASSET_GUIDANCE = [
  'Aemeath character artwork is not bundled with Astra because it is owned by Wuthering Waves / Kuro Games.',
  'Place your own licensed files under the companion asset root, for example:',
  `  ${COMPANION_ASSET_ROOT}/sprite/aemeath-sprite.png`,
  `  ${COMPANION_ASSET_ROOT}/portrait/aemeath-portrait.png`,
  `  ${COMPANION_ASSET_ROOT}/halo/aemeath-halo.png`,
  'Until then Astra renders the built-in vector fallback so the interface stays usable.',
].join('\n');

export function findAsset(id: string): CompanionAsset | undefined {
  return COMPANION_ASSETS.find(asset => asset.id === id);
}
