/**
 * Cheap, Babylon-free WebGL capability probe. The hook calls this BEFORE
 * dynamically importing Babylon so an unsupported browser takes the honest
 * "not supported" path without ever downloading the engine (plan §10 analogue).
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}
