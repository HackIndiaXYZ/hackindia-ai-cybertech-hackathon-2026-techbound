import { describe, it, expect } from 'vitest';
import { resolveAvatarAsset } from './assetResolver.js';

describe('resolveAvatarAsset (§4, §11 honesty decisions)', () => {
  it('uses the placeholder when no GLB is requested', () => {
    const r = resolveAvatarAsset({ glbRequested: false, glbFound: false, bonesValid: false });
    expect(r).toEqual({ source: 'procedural-placeholder', isPlaceholder: true });
  });

  it('falls back to the placeholder with an asset-missing reason when the GLB is absent (§4)', () => {
    const r = resolveAvatarAsset({ glbRequested: true, glbFound: false, bonesValid: false });
    expect(r.source).toBe('procedural-placeholder');
    expect(r.reason).toBe('asset-missing');
    expect(r.isPlaceholder).toBe(true);
  });

  it('reports a validation failure — never a silent placeholder — for a found-but-invalid GLB (§11)', () => {
    const r = resolveAvatarAsset({ glbRequested: true, glbFound: true, bonesValid: false });
    expect(r.source).toBe('none');
    expect(r.reason).toBe('bone-validation-failed');
    expect(r.isPlaceholder).toBe(false);
  });

  it('loads the real GLB only when it is found and its bones validate', () => {
    const r = resolveAvatarAsset({ glbRequested: true, glbFound: true, bonesValid: true });
    expect(r).toEqual({ source: 'gltf', isPlaceholder: false });
  });
});
