import { describe, it, expect } from 'vitest';
import { AvatarLoader } from './avatarLoader.js';
import type { AvatarRigInfo } from './types.js';

const placeholderRig: AvatarRigInfo = {
  name: 'procedural-placeholder',
  isPlaceholder: true,
  bones: ['root'],
  assetSource: 'procedural-placeholder',
};
const gltfRig: AvatarRigInfo = { name: 'gltf-avatar', isPlaceholder: false, bones: ['root'], assetSource: 'gltf' };

function recorder() {
  const seen: string[] = [];
  const loader = new AvatarLoader();
  loader.subscribe((s) => seen.push(s));
  return { loader, seen };
}

describe('AvatarLoader state machine (§2, §13)', () => {
  it('transitions idle → loading → placeholder when no GLB is requested', async () => {
    const { loader, seen } = recorder();
    expect(loader.getStatus()).toBe('idle');
    const outcome = await loader.load({
      inspect: async () => ({ glbRequested: false, glbFound: false, bonesValid: false }),
      build: async () => placeholderRig,
    });
    expect(seen).toEqual(['loading', 'placeholder']);
    expect(outcome.assetSource).toBe('procedural-placeholder');
    expect(outcome.rig).toEqual(placeholderRig);
  });

  it('reaches the asset-missing state (still with a working placeholder rig) when the GLB is absent (§4)', async () => {
    const { loader } = recorder();
    const outcome = await loader.load({
      inspect: async () => ({ glbRequested: true, glbFound: false, bonesValid: false }),
      build: async () => placeholderRig,
    });
    expect(outcome.status).toBe('asset-missing');
    expect(outcome.reason).toBe('asset-missing');
    expect(outcome.rig).not.toBeNull();
  });

  it('loads the real rig when the GLB is valid', async () => {
    const { loader } = recorder();
    const outcome = await loader.load({
      inspect: async () => ({ glbRequested: true, glbFound: true, bonesValid: true }),
      build: async () => gltfRig,
    });
    expect(outcome.status).toBe('loaded');
    expect(outcome.rig).toEqual(gltfRig);
  });

  it('errors on an invalid rig WITHOUT calling build (never animates broken bones, §11)', async () => {
    let built = false;
    const { loader } = recorder();
    const outcome = await loader.load({
      inspect: async () => ({ glbRequested: true, glbFound: true, bonesValid: false }),
      build: async () => {
        built = true;
        return gltfRig;
      },
    });
    expect(outcome.status).toBe('error');
    expect(outcome.reason).toBe('bone-validation-failed');
    expect(built).toBe(false);
  });

  it('surfaces an inspect throw as the error state', async () => {
    const { loader } = recorder();
    const outcome = await loader.load({
      inspect: async () => {
        throw new Error('network down');
      },
      build: async () => placeholderRig,
    });
    expect(outcome.status).toBe('error');
    expect(outcome.reason).toBe('network down');
  });

  it('surfaces a build throw as the error state (graceful, non-throwing)', async () => {
    const { loader } = recorder();
    const outcome = await loader.load({
      inspect: async () => ({ glbRequested: false, glbFound: false, bonesValid: false }),
      build: async () => {
        throw new Error('mesh failed');
      },
    });
    expect(outcome.status).toBe('error');
    expect(outcome.reason).toBe('mesh failed');
  });
});
