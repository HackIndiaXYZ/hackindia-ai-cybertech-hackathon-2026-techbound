/**
 * Babylon.js render adapter — the ONLY module in the app that imports Babylon,
 * and it is reached solely through a dynamic import from the /app/avatar route
 * (§5). It builds a clearly-labelled procedural placeholder humanoid from
 * primitives, wires a real AvatarLoader with GLB/GLTF drop-in support, and
 * implements the framework-independent {@link AvatarRenderAdapter} seam so all
 * controller logic above it stays testable without WebGL.
 *
 * Honesty: the placeholder exposes named joints so the animation/queue/command
 * pipeline can be validated, but its motions are GENERIC DEVELOPMENT ANIMATIONS,
 * not ISL signs (§10). A GLB that loads but lacks the required named bones is
 * reported as a validation failure rather than silently animated broken (§11).
 */
import {
  Animation,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import type { AbstractMesh, Bone, Material } from '@babylonjs/core';
// Side-effect import: registers the glTF loader used by SceneLoader above.
import '@babylonjs/loaders/glTF';

import { AVATAR_BONES, AVATAR_GLB_URL, PLACEHOLDER_CLIPS } from '../constants.js';
import { ISL_SIGN_REGISTRY, type BoneRotationTarget } from '../islSignRegistry.js';
import { AvatarLoader } from '../avatarLoader.js';
import type { AssetResolutionInput } from '../assetResolver.js';
import type { AvatarLoaderStatus, AvatarRenderAdapter, AvatarRigInfo, ExpressionWeights, PlayClipOptions } from '../types.js';

export interface BabylonAdapterOptions {
  /** GLB URL to attempt. Defaults to AVATAR_GLB_URL; pass `null` to skip probing. */
  glbUrl?: string | null;
  antialias?: boolean;
  attachCameraControls?: boolean;
  onError?: (message: string) => void;
}

/** The adapter plus the explicit loader outcome, so the UI can label honestly. */
export interface BabylonAvatarHandle extends AvatarRenderAdapter {
  loaderStatus: AvatarLoaderStatus;
  loaderReason?: string;
}

/** Keywords used to map a future GLB's bone names onto the AVATAR_BONES contract. */
const BONE_KEYWORDS: Record<string, string[]> = {
  root: ['root', 'hips', 'pelvis'],
  torso: ['torso', 'spine', 'chest'],
  head: ['head', 'neck'],
  left_upper_arm: ['leftupperarm', 'leftshoulder', 'leftarm', 'left arm', 'left_arm'],
  left_forearm: ['leftforearm', 'left_arm_lower', 'lefthandlowerarm', 'left lower'],
  left_hand: ['lefthand', 'left_hand', 'left hand'],
  right_upper_arm: ['rightupperarm', 'rightshoulder', 'rightarm', 'right arm', 'right_arm'],
  right_forearm: ['rightforearm', 'right_arm_lower', 'righthandlowerarm', 'right lower'],
  right_hand: ['righthand', 'right_hand', 'right hand'],
};

interface RigParts {
  nodes: Record<string, TransformNode>;
  mouth: Mesh | null;
  headMaterial: StandardMaterial | null;
}

/**
 * What a pose tween can drive: the {@link TransformNode}s that back an imported
 * GLB skeleton, the skeleton {@link Bone}s of a rig that has no linked node, and
 * the {@link TransformNode}s of the procedural placeholder. All of them expose a
 * mutable Euler `rotation`, which is all the animation path needs.
 */
type PoseTarget = (TransformNode | Bone) & { rotation: Vector3 };

export async function fetchExists(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') ?? '';
    // SPA servers (Vite/preview/nginx try_files) return index.html (text/html)
    // with 200 OK under fallback routing when static assets do not exist.
    if (contentType.includes('text/html')) return false;
    return true;
  } catch {
    return false;
  }
}

function collectBoneNames(meshes: Mesh[]): string[] {
  const names = new Set<string>();
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton) continue;
    for (const bone of skeleton.bones) names.add(bone.name.toLowerCase());
  }
  return [...names];
}

/**
 * Strip rig prefixes/punctuation so `mixamorigLeftArm`, `mixamorig:LeftArm` and
 * `LeftArm` all collapse to the same key. The sign registry uses the no-colon
 * Mixamo spelling while exported GLBs keep the colon, so both must match.
 */
function normalizeBoneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
}

/**
 * Force a node into Euler mode and return its rotation as a mutable vector.
 *
 * glTF importers usually author joint nodes with a `rotationQuaternion`, in which
 * case Babylon ignores `rotation` entirely (and the `rotation` getter reports a
 * stale zero vector). Converting once here makes every later absolute-Euler write
 * — stance, keyframes, release — both readable and effective.
 */
function toEulerRotation(node: TransformNode): Vector3 {
  const q = node.rotationQuaternion;
  if (!q) return node.rotation.clone();
  const euler = q.toEulerAngles();
  // Assigning `rotation` is what clears `rotationQuaternion` (see TransformNode).
  node.rotation = euler;
  return euler.clone();
}

/**
 * Index the poseable nodes of the imported rig by normalized name.
 *
 * Two Babylon facts decide this. (1) Bones are not TransformNodes, so
 * `scene.getTransformNodeByName()` can never resolve them. (2) For a glTF every
 * bone is *linked* to a real node, and `Bone.linkTransformNode` documents that
 * "the local matrix of this bone is overwritten by the transform of the node
 * every frame" — `Skeleton.prepare()` therefore erases anything written to
 * `bone.rotation` at 60fps. The drivable object is the linked node, so that is
 * what gets indexed (verified live: `LeftArm.rotation.x = 0.9` on the Bone read
 * back as 0 one frame later, while the same write on `bone.getTransformNode()`
 * moved the arm).
 */
function collectPoseNodes(scene: Scene): Map<string, PoseTarget> {
  const poseable = new Map<string, PoseTarget>();
  for (const mesh of scene.meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton) continue;
    for (const bone of skeleton.bones) {
      const key = normalizeBoneName(bone.name);
      if (!key || poseable.has(key)) continue;
      const node = bone.getTransformNode();
      if (node) {
        toEulerRotation(node);
        poseable.set(key, node);
      } else {
        poseable.set(key, bone);
      }
    }
  }
  return poseable;
}

function bonesSufficient(provided: string[]): boolean {
  return AVATAR_BONES.every((required) => {
    const keywords = BONE_KEYWORDS[required] ?? [required];
    return provided.some((name) => keywords.some((kw) => name.includes(kw)));
  });
}

/**
 * Re-skin an imported GLB's lit PBR materials as standard materials.
 *
 * Why: on some ANGLE/WebGL2 drivers Babylon's lit PBR effect never reaches
 * `isReady()`, and the mesh is then drawn with the engine's default effect — a
 * flat pure-white silhouette that loses every material colour (verified live:
 * albedo, metallic, roughness and light intensity changes had zero pixel
 * effect, while a standard material on the same mesh shaded correctly).
 * The glTF albedo colours are carried over, so the rig keeps its own palette.
 */
function useStandardMaterials(scene: Scene, meshes: AbstractMesh[]): void {
  const replacements = new Map<Material, StandardMaterial>();

  for (const mesh of meshes) {
    const source = mesh.material;
    if (!(source instanceof PBRMaterial)) continue;

    let replacement = replacements.get(source);
    if (!replacement) {
      const albedo = source.albedoColor ?? new Color3(0.8, 0.8, 0.8);
      replacement = new StandardMaterial(`${source.name}-standard`, scene);
      replacement.diffuseColor = new Color3(albedo.r, albedo.g, albedo.b);
      replacement.emissiveColor = source.emissiveColor?.clone?.() ?? new Color3(0, 0, 0);
      // The rigs are exported metallic+glossy; a soft sheen reads as the same
      // material under the two-light setup without the blown-out PBR specular.
      replacement.specularColor = new Color3(0.14, 0.14, 0.16);
      replacement.specularPower = 48;
      // glTF marks these materials doubleSided; keep both faces lit.
      replacement.backFaceCulling = false;
      replacements.set(source, replacement);
    }
    mesh.material = replacement;
  }

  for (const [source] of replacements) source.dispose();
}

/**
 * The neutral signing stance, taken from the registry's own `default-pose` clip
 * instead of duplicating its numbers here: ISL is produced from a folded-arm
 * posture with the hands in front of the chest, and the word keyframes are
 * authored as absolute bone Euler targets against exactly that stance — so it is
 * also the pose the rig is released back to between signs. (A Mixamo T-pose rest
 * made every sign look like a hand spasm at full arm's length.)
 */
const SIGNING_STANCE: readonly BoneRotationTarget[] = ISL_SIGN_REGISTRY['default-pose']?.frames[0] ?? [];

/**
 * Body-region palette: skin, long-sleeved top, trousers, shoes. Adopted from
 * Sign Kit's default "Teacher" look (MIT). The shipped GLB has no textures at
 * all, so colouring vertices per body region is what turns the single-piece
 * skinned mesh into a person instead of a flat teal cut-out.
 */
const AVATAR_REGION_PALETTE: Record<string, Color3> = {
  skin: Color3.FromHexString('#c68863'),
  top: Color3.FromHexString('#1f3a68'),
  bottom: Color3.FromHexString('#4a4f57'),
  shoes: Color3.FromHexString('#2b2118'),
};

/** Joint-seam mesh keeps its region's colour but darkened, so seams read. */
const JOINT_SHADE = 0.72;

function regionOfBone(boneName: string): string {
  if (/Head|Neck|Hand/.test(boneName)) return 'skin';
  if (/ForeArm|Spine|Shoulder|Arm/.test(boneName)) return 'top';
  if (/Foot|Toe/.test(boneName)) return 'shoes';
  return 'bottom'; // Hips, UpLeg, Leg
}

/**
 * Paint the skinned meshes per body region from skin indices/weights, mirroring
 * the influence that actually deforms each vertex. Returns false (and changes
 * nothing) when a mesh carries no skin data, so the glTF material colours stay
 * as the fallback rather than a black/unlit surprise.
 */
function paintAvatarRegions(meshes: AbstractMesh[]): boolean {
  let painted = false;
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton) continue;
    const skinIndex = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
    const skinWeight = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
    if (!skinIndex || !skinWeight || skinIndex.length % 4 !== 0) continue;

    const vertexCount = skinIndex.length / 4;
    const colors = new Float32Array(vertexCount * 4);
    const shade = /Joints/i.test(mesh.name) ? JOINT_SHADE : 1;
    // Vertices whose four primary influences are all zero keep their weights in
    // the "extra" buffers, so check those before blaming bone 0 (the hips).
    const extraIndex = mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind);
    const extraWeight = mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);
    for (let v = 0; v < vertexCount; v++) {
      const offset = v * 4;
      let dominant = 0;
      for (let k = 1; k < 4; k++) {
        if (skinWeight[offset + k] > skinWeight[offset + dominant]) dominant = k;
      }
      let influence = skinIndex[offset + dominant];
      if (skinWeight[offset + dominant] <= 0 && extraWeight && extraIndex) {
        let extraBest = 0;
        for (let k = 1; k < 4; k++) {
          if (extraWeight[offset + k] > extraWeight[offset + extraBest]) extraBest = k;
        }
        if (extraWeight[offset + extraBest] > 0) influence = extraIndex[offset + extraBest];
      }
      const bone = skeleton.bones[influence];
      const region = AVATAR_REGION_PALETTE[regionOfBone(bone ? bone.name : '')] ?? AVATAR_REGION_PALETTE.bottom;
      colors[offset] = region.r * shade;
      colors[offset + 1] = region.g * shade;
      colors[offset + 2] = region.b * shade;
      colors[offset + 3] = 1;
    }

    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    // Babylon derives "use vertex colours" from the mesh geometry (there is no
    // material flag for it), so the base colour has to be neutral white or the
    // palette would be multiplied by the glTF teal albedo.
    const material = mesh.material;
    if (material instanceof StandardMaterial) {
      material.diffuseColor = Color3.White();
      material.ambientColor = new Color3(0.25, 0.25, 0.28);
      material.emissiveColor = new Color3(0, 0, 0);
    }
    painted = true;
  }
  return painted;
}

/** Build the labelled placeholder humanoid. Returns named transform nodes. */
function buildPlaceholderRig(scene: Scene): RigParts {
  const nodes: Record<string, TransformNode> = {};
  for (const bone of AVATAR_BONES) nodes[bone] = new TransformNode(bone, scene);

  const bodyMat = new StandardMaterial('placeholder-body', scene);
  bodyMat.diffuseColor = new Color3(0.62, 0.5, 0.85);
  bodyMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const headMat = new StandardMaterial('placeholder-head', scene);
  headMat.diffuseColor = new Color3(0.72, 0.62, 0.9);
  headMat.specularColor = new Color3(0.1, 0.1, 0.1);

  nodes.root.position = new Vector3(0, 0, 0);

  const torso = MeshBuilder.CreateBox('torso-mesh', { width: 0.5, height: 0.7, depth: 0.28 }, scene);
  torso.material = bodyMat;
  torso.parent = nodes.torso;
  nodes.torso.parent = nodes.root;
  nodes.torso.position = new Vector3(0, 1.15, 0);

  const head = MeshBuilder.CreateSphere('head-mesh', { diameter: 0.34, segments: 12 }, scene);
  head.material = headMat;
  head.parent = nodes.head;
  nodes.head.parent = nodes.torso;
  nodes.head.position = new Vector3(0, 0.55, 0);

  // Rough "mouth" so the lip-sync channel is visible; purely approximate.
  const mouth = MeshBuilder.CreateBox('mouth-mesh', { width: 0.14, height: 0.02, depth: 0.02 }, scene);
  mouth.material = headMat;
  mouth.parent = nodes.head;
  mouth.position = new Vector3(0, -0.05, 0.16);

  const buildArm = (side: 'left' | 'right'): void => {
    const sign = side === 'left' ? 1 : -1;
    const upper = nodes[`${side}_upper_arm`];
    const forearm = nodes[`${side}_forearm`];
    const hand = nodes[`${side}_hand`];

    upper.parent = nodes.torso;
    upper.position = new Vector3(sign * 0.32, 0.32, 0);
    const upperMesh = MeshBuilder.CreateCylinder(`${side}-upper-mesh`, { height: 0.4, diameter: 0.14 }, scene);
    upperMesh.material = bodyMat;
    upperMesh.parent = upper;
    upperMesh.position = new Vector3(0, -0.2, 0);

    forearm.parent = upper;
    forearm.position = new Vector3(0, -0.4, 0);
    const forearmMesh = MeshBuilder.CreateCylinder(`${side}-fore-mesh`, { height: 0.38, diameter: 0.12 }, scene);
    forearmMesh.material = bodyMat;
    forearmMesh.parent = forearm;
    forearmMesh.position = new Vector3(0, -0.19, 0);

    hand.parent = forearm;
    hand.position = new Vector3(0, -0.38, 0);
    const handMesh = MeshBuilder.CreateBox(`${side}-hand-mesh`, { width: 0.16, height: 0.1, depth: 0.08 }, scene);
    handMesh.material = bodyMat;
    handMesh.parent = hand;

    // Detailed realistic finger digits (thumb + 4 fingers)
    const fingerMat = new StandardMaterial(`${side}-finger-mat`, scene);
    fingerMat.diffuseColor = new Color3(0.72, 0.62, 0.9);
    fingerMat.specularColor = new Color3(0.1, 0.1, 0.1);

    // Thumb (angled outwards)
    const thumb = MeshBuilder.CreateCylinder(`${side}-thumb`, { height: 0.08, diameter: 0.03 }, scene);
    thumb.material = fingerMat;
    thumb.parent = hand;
    thumb.position = new Vector3(sign * 0.09, -0.01, 0.02);
    thumb.rotation.z = sign * 0.45;

    // 4 Fingers: Index, Middle, Ring, Pinky
    const fingerOffsets = [0.05, 0.015, -0.02, -0.055];
    const fingerLengths = [0.09, 0.1, 0.085, 0.07];
    const fingerNames = ['index', 'middle', 'ring', 'pinky'];
    fingerNames.forEach((name, idx) => {
      const f = MeshBuilder.CreateCylinder(`${side}-${name}`, { height: fingerLengths[idx], diameter: 0.028 }, scene);
      f.material = fingerMat;
      f.parent = hand;
      f.position = new Vector3(sign * fingerOffsets[idx], -0.09, 0);
    });

    // Rest pose: arms slightly out so they are not clipped into the torso.
    upper.rotation.z = sign * 0.12;
  };
  buildArm('left');
  buildArm('right');

  return { nodes, mouth, headMaterial: headMat };
}

/**
 * Create the Babylon-backed adapter. Async because it runs the full loader cycle
 * (probe GLB → validate → mount, or fall back to the placeholder) before the
 * adapter's rig is known.
 */
export async function createBabylonAvatarAdapter(
  canvas: HTMLCanvasElement,
  options: BabylonAdapterOptions = {},
): Promise<BabylonAvatarHandle> {
  const engine = new Engine(canvas, options.antialias ?? true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.96, 0.95, 0.98, 1);

  // Camera positioned at +Z (alpha = Math.PI / 2) so avatar faces forward towards the viewer.
  const camera = new ArcRotateCamera('avatar-camera', Math.PI / 2, Math.PI / 2.6, 4.2, new Vector3(0, 1.1, 0), scene);
  camera.attachControl(canvas, true);
  if (options.attachCameraControls === false) camera.detachControl();

  new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  const key = new DirectionalLight('key', new Vector3(-0.4, -1, -0.6), scene);
  key.intensity = 0.8;

  const frameListeners = new Set<(deltaMs: number) => void>();
  let frameObserver: (() => void) | null = null;

  const runRenderLoop = (): void => {
    engine.runRenderLoop(() => scene.render());
  };
  runRenderLoop();
  const resizeHandler = (): void => engine.resize();
  window.addEventListener('resize', resizeHandler);

  // ---- Loader wiring -------------------------------------------------------
  const glbUrl = options.glbUrl === undefined ? AVATAR_GLB_URL : options.glbUrl;
  let rigParts: RigParts | null = null;
  let rigInfo: AvatarRigInfo = {
    name: 'none',
    isPlaceholder: true,
    bones: AVATAR_BONES,
    assetSource: 'none',
  };

  const loader = new AvatarLoader();
  const outcome = await loader.load({
    async inspect(): Promise<AssetResolutionInput> {
      const glbRequested = glbUrl !== null;
      if (!glbRequested) return { glbRequested: false, glbFound: false, bonesValid: false };
      const found = await fetchExists(glbUrl as string);
      return { glbRequested: true, glbFound: found, bonesValid: found /* placeholder; real validation would run post-load */ };
    },
    async build(source): Promise<AvatarRigInfo> {
      if (source === 'gltf') {
        try {
          // Real rig path. Phase 2D ships no GLB, so this only runs if one is
          // dropped into the asset path. Import + validate bones, or fail loudly.
          const imported = await SceneLoader.ImportMeshAsync('', glbUrl as string, '', scene);
          const names = collectBoneNames(imported.meshes as unknown as Mesh[]);
          if (!bonesSufficient(names)) {
            throw new Error('GLB avatar does not expose the required named bones (see AVATAR_BONES).');
          }
          // This rig is posed by direct bone-rotation writes (see poseNodes below).
          // Any glTF animation group the file ships with is auto-started on import
          // and rewrites those same transforms every frame BEFORE the render, which
          // is why a cold load measured as the bind T-pose no matter what stance was
          // written. Nothing here needs them, so they are stopped and released.
          for (const group of imported.animationGroups ?? []) {
            group.stop();
            group.dispose();
          }
          useStandardMaterials(scene, imported.meshes);
          paintAvatarRegions(imported.meshes);
          rigInfo = { name: 'gltf-avatar', isPlaceholder: false, bones: AVATAR_BONES, assetSource: 'gltf' };
          return rigInfo;
        } catch (e) {
          console.warn('Failed loading GLB avatar, falling back to procedural rig:', e);
        }
      }
      rigParts = buildPlaceholderRig(scene);
      rigInfo = {
        name: 'procedural-placeholder',
        isPlaceholder: true,
        bones: AVATAR_BONES,
        assetSource: 'procedural-placeholder',
      };
      return rigInfo;
    },
  });

  if (outcome.status === 'error' && options.onError) options.onError(outcome.reason ?? 'avatar-load-failed');

  // ---- Rig handles ---------------------------------------------------------
  // The poseable nodes are indexed once and their bind rotations snapshotted in
  // Euler form, so any sign can be blended and then released to the same stance.
  const poseNodes = collectPoseNodes(scene);
  const poseRest = new Map<PoseTarget, Vector3>();
  for (const node of poseNodes.values()) poseRest.set(node, node.rotation.clone());
  let disposed = false;
  // Bumped on every clip/reset so stages queued by an older clip cannot land on
  // top of the current one.
  let clipSeq = 0;

  if (poseNodes.size > 0) {
    for (const stance of SIGNING_STANCE) {
      const node = poseNodes.get(normalizeBoneName(stance.bone));
      if (!node) continue;
      const stanceVec = node.rotation.clone();
      stanceVec[stance.axis] = stance.value;
      node.rotation = stanceVec;
      // The stance, not the bind pose, is what a sign relaxes back to.
      poseRest.set(node, stanceVec.clone());
    }
  }

  /**
   * Hold the signing stance on every rendered frame until the first clip plays.
   *
   * The stance is written the instant the GLB resolves, but a skinned rig keeps
   * settling while the renderer produces its first frames — and a bounded retry
   * count proved unreliable here (measured live: the very first paint still showed
   * the bind T-pose). Re-asserting the same absolute targets every idle frame is
   * idempotent, costs five vector writes, and switches itself off permanently the
   * moment any clip is played, so it can never fight a sign in progress: after
   * that the queue's own rest handling owns the pose.
   */
  const applySigningStance = (): void => {
    for (const stance of SIGNING_STANCE) {
      const node = poseNodes.get(normalizeBoneName(stance.bone));
      if (!node) continue;
      const rest = poseRest.get(node);
      if (!rest) continue;
      node.rotation = rest.clone();
    }
  };
  const stanceObserver = (): void => {
    if (disposed || clipSeq > 0) return;
    applySigningStance();
  };
  // Before render, not after: a write made after `scene.render()` only reaches the
  // NEXT frame, which is one frame of visible bind pose we do not want on cold load.
  scene.onBeforeRenderObservable.add(stanceObserver);

  // ---- Animation helpers ---------------------------------------------------
  const poseTween = (node: PoseTarget, to: Vector3, durationMs: number, loop = false): void => {
    const fps = 30;
    const totalFrames = Math.max(2, Math.round((durationMs / 1000) * fps));
    const anim = new Animation(
      `${node.name}-anim`,
      'rotation',
      fps,
      Animation.ANIMATIONTYPE_VECTOR3,
      loop ? Animation.ANIMATIONLOOPMODE_CYCLE : Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    const keys = loop
      ? [
          { frame: 0, value: node.rotation.clone() },
          { frame: Math.floor(totalFrames / 2), value: to },
          { frame: totalFrames - 1, value: node.rotation.clone() },
        ]
      : [{ frame: 0, value: node.rotation.clone() }, { frame: totalFrames - 1, value: to }];
    anim.setKeys(keys);
    scene.beginDirectAnimation(node, [anim], 0, totalFrames - 1, loop);
  };

  const setRestPose = (): void => {
    clipSeq += 1;
    scene.stopAllAnimations();
    // Assign (not mutate) so nodes still in quaternion mode get the conversion.
    for (const [node, rest] of poseRest) node.rotation = rest.clone();
    if (!rigParts) return;
    const n = rigParts.nodes;
    n.torso.rotation.set(0, 0, 0);
    n.head.rotation.set(0, 0, 0);
    n.left_upper_arm.rotation.set(0, 0, 0.12);
    n.right_upper_arm.rotation.set(0, 0, -0.12);
    n.left_forearm.rotation.set(0, 0, 0);
    n.right_forearm.rotation.set(0, 0, 0);
    n.left_hand.rotation.set(0, 0, 0);
    n.right_hand.rotation.set(0, 0, 0);
    if (n.mouth) n.root.position.y = 0;
  };

  /** Release the pose after a sign so the next one starts from the same stance. */
  const returnToRest = (durationMs: number): void => {
    if (disposed) return;
    if (rigParts) {
      setRestPose();
      return;
    }
    scene.stopAllAnimations();
    for (const [node, rest] of poseRest) poseTween(node, rest.clone(), durationMs);
  };

  return {
    loaderStatus: outcome.status,
    loaderReason: outcome.reason,
    get rig() {
      return rigInfo;
    },
    getSupportedClips(): readonly string[] {
      return [...PLACEHOLDER_CLIPS, ...Object.keys(ISL_SIGN_REGISTRY)];
    },
    playClip(clipId: string, clipOptions: PlayClipOptions): void {
      const seq = ++clipSeq;
      if (ISL_SIGN_REGISTRY[clipId]) {
        const islClip = ISL_SIGN_REGISTRY[clipId];
        const dur = clipOptions.durationMs || 900;
        scene.stopAllAnimations();

        const applyTarget = (target: BoneRotationTarget, tweenDur: number): void => {
          // 1. Imported GLB rig: drive the node that actually owns the bone's
          //    transform. Writing the Bone instead is a no-op because
          //    Skeleton.prepare() re-copies the linked node over it every frame.
          const poseNode = poseNodes.get(normalizeBoneName(target.bone));
          if (poseNode) {
            const targetVec = poseNode.rotation.clone();
            targetVec[target.axis] = target.value;
            poseTween(poseNode, targetVec, tweenDur);
            return;
          }

          // 2. Rigs authored as plain transform nodes.
          const node =
            scene.getTransformNodeByName(target.bone) ??
            scene.getTransformNodeByName(`mixamorig:${target.bone.replace(/^mixamorig:?/, '')}`) ??
            scene.getTransformNodeByName(target.bone.replace(/^mixamorig:?/, ''));

          if (node) {
            const targetVec = node.rotation.clone();
            targetVec[target.axis] = target.value;
            poseTween(node, targetVec, tweenDur);
            return;
          }

          // 3. Map to procedural placeholder nodes
          if (rigParts) {
            const bName = target.bone.toLowerCase();
            let pNode: TransformNode | undefined;
            if (bName.includes('leftarm') || bName.includes('left_upper_arm')) {
              pNode = rigParts.nodes.left_upper_arm;
            } else if (bName.includes('leftforearm')) {
              pNode = rigParts.nodes.left_forearm;
            } else if (bName.includes('lefthand')) {
              pNode = rigParts.nodes.left_hand;
            } else if (bName.includes('rightarm') || bName.includes('right_upper_arm')) {
              pNode = rigParts.nodes.right_upper_arm;
            } else if (bName.includes('rightforearm')) {
              pNode = rigParts.nodes.right_forearm;
            } else if (bName.includes('righthand')) {
              pNode = rigParts.nodes.right_hand;
            } else if (bName.includes('neck') || bName.includes('head')) {
              pNode = rigParts.nodes.head;
            }

            if (pNode) {
              const targetVec = pNode.rotation.clone();
              targetVec[target.axis] = target.value;
              poseTween(pNode, targetVec, tweenDur);
            }
          }
        };

        const frames = islClip.frames;
        if (frames.length > 0) {
          const stepDur = dur / frames.length;
          // Play EVERY stage, not just the ends: these signs are 3-4 stage
          // sequences (reach -> hold -> release) and skipping the middle stages
          // turns a word into a single snapped handshape.
          frames.forEach((frame, stage) => {
            const targets = [...frame];
            if (stage === 0) {
              for (const target of targets) applyTarget(target, stepDur);
              return;
            }
            setTimeout(() => {
              if (disposed || seq !== clipSeq) return;
              for (const target of targets) applyTarget(target, stepDur);
            }, stage * stepDur);
          });
          // Hold the final handshape briefly, then relax.
          setTimeout(() => {
            if (disposed || seq !== clipSeq) return;
            returnToRest(420);
          }, dur + 260);
        }
        return;
      }

      if (!rigParts) return; // real GLB: dev poses do not apply (guarded)
      const n = rigParts.nodes;
      const dur = clipOptions.durationMs;
      scene.stopAllAnimations();
      switch (clipId) {
        case 'idle':
          // Gentle vertical bob to prove the loop + render are live.
          break;
        case 'raise-left-hand':
          poseTween(n.left_upper_arm, new Vector3(0, 0, -1.1), dur);
          break;
        case 'raise-right-hand':
          poseTween(n.right_upper_arm, new Vector3(0, 0, 1.1), dur);
          break;
        case 'open-hands':
          poseTween(n.left_upper_arm, new Vector3(0, 0, -0.5), dur);
          poseTween(n.right_upper_arm, new Vector3(0, 0, 0.5), dur);
          break;
        case 'close-hands':
          poseTween(n.left_upper_arm, new Vector3(0, 0, 0.05), dur);
          poseTween(n.right_upper_arm, new Vector3(0, 0, -0.05), dur);
          break;
        case 'point':
          poseTween(n.right_upper_arm, new Vector3(0, 0, 1.4), dur);
          poseTween(n.right_forearm, new Vector3(-0.6, 0, 0), dur);
          break;
        case 'wave':
          poseTween(n.right_upper_arm, new Vector3(0, 0, 1.2), dur);
          poseTween(n.right_forearm, new Vector3(0, 0.6, 0.4), dur, true);
          break;
        case 'sign-namaste':
          poseTween(n.left_upper_arm, new Vector3(0.6, 0.2, -0.4), dur);
          poseTween(n.right_upper_arm, new Vector3(0.6, -0.2, 0.4), dur);
          poseTween(n.left_forearm, new Vector3(0.8, 0.3, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.8, -0.3, 0), dur);
          poseTween(n.head, new Vector3(0.2, 0, 0), dur);
          break;
        case 'sign-thank':
          poseTween(n.right_upper_arm, new Vector3(0.7, 0, 0.3), dur / 2);
          poseTween(n.right_forearm, new Vector3(1.1, 0, 0), dur / 2);
          break;
        case 'sign-help':
          poseTween(n.left_upper_arm, new Vector3(0.5, 0, -0.2), dur);
          poseTween(n.left_forearm, new Vector3(0.7, 0.2, 0), dur);
          poseTween(n.right_upper_arm, new Vector3(0.6, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(0.8, -0.1, 0), dur);
          break;
        case 'sign-water':
          poseTween(n.right_upper_arm, new Vector3(0.9, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(1.2, 0, 0.2), dur, true);
          break;
        case 'sign-food':
          poseTween(n.right_upper_arm, new Vector3(0.8, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(1.3, 0, 0), dur, true);
          break;
        case 'sign-where':
          poseTween(n.left_upper_arm, new Vector3(0.4, 0, -0.6), dur);
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.6), dur);
          poseTween(n.left_forearm, new Vector3(0.5, 0, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.5, 0, 0), dur);
          poseTween(n.head, new Vector3(0.15, 0.2, 0), dur);
          break;
        case 'sign-no':
          poseTween(n.right_upper_arm, new Vector3(0.5, 0, 0.4), dur);
          poseTween(n.right_forearm, new Vector3(0.7, 0.5, 0), dur, true);
          poseTween(n.head, new Vector3(0, 0.35, 0), dur, true);
          break;
        case 'sign-yes':
          poseTween(n.right_upper_arm, new Vector3(0.5, 0, 0.3), dur);
          poseTween(n.right_forearm, new Vector3(0.6, 0, 0), dur, true);
          poseTween(n.head, new Vector3(0.3, 0, 0), dur, true);
          break;
        case 'sign-please':
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(0.9, 0.3, 0), dur, true);
          break;
        case 'sign-sorry':
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(0.9, 0.2, 0), dur, true);
          poseTween(n.head, new Vector3(0.15, 0, 0.1), dur);
          break;
        case 'sign-self':
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(1.0, 0.4, 0), dur);
          break;
        case 'sign-you':
          poseTween(n.right_upper_arm, new Vector3(1.2, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(0.2, 0, 0), dur);
          break;
        case 'sign-stop':
          poseTween(n.right_upper_arm, new Vector3(1.1, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(0.3, 0, 0), dur);
          poseTween(n.right_hand, new Vector3(-0.5, 0, 0), dur);
          break;
        case 'sign-happy':
          poseTween(n.left_upper_arm, new Vector3(0.5, 0, -0.2), dur);
          poseTween(n.right_upper_arm, new Vector3(0.5, 0, 0.2), dur);
          poseTween(n.left_forearm, new Vector3(1.1, -0.2, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(1.1, 0.2, 0), dur, true);
          break;
        case 'sign-sad':
          poseTween(n.head, new Vector3(0.35, 0, 0), dur);
          poseTween(n.left_upper_arm, new Vector3(0.2, 0, -0.1), dur);
          poseTween(n.right_upper_arm, new Vector3(0.2, 0, 0.1), dur);
          break;
        case 'sign-school':
          poseTween(n.left_upper_arm, new Vector3(0.5, 0, -0.2), dur);
          poseTween(n.right_upper_arm, new Vector3(0.5, 0, 0.2), dur);
          poseTween(n.left_forearm, new Vector3(0.9, 0.5, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(0.9, -0.5, 0), dur, true);
          break;
        case 'sign-hospital':
          poseTween(n.left_upper_arm, new Vector3(0.3, 0, -0.2), dur);
          poseTween(n.right_upper_arm, new Vector3(0.6, 0.4, 0), dur);
          poseTween(n.right_forearm, new Vector3(1.2, 0.3, 0), dur);
          break;
        case 'sign-doctor':
          poseTween(n.left_upper_arm, new Vector3(0.4, 0, -0.2), dur);
          poseTween(n.left_forearm, new Vector3(0.8, 0.1, 0), dur);
          poseTween(n.right_upper_arm, new Vector3(0.7, 0.2, 0), dur);
          poseTween(n.right_forearm, new Vector3(1.1, 0.4, 0), dur);
          break;
        case 'sign-father':
          poseTween(n.right_upper_arm, new Vector3(1.1, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(1.4, 0.2, 0), dur);
          break;
        case 'sign-mother':
          poseTween(n.right_upper_arm, new Vector3(0.8, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(1.2, 0, 0), dur);
          break;
        case 'sign-friend':
          poseTween(n.left_upper_arm, new Vector3(0.5, 0.2, -0.3), dur);
          poseTween(n.right_upper_arm, new Vector3(0.5, -0.2, 0.3), dur);
          poseTween(n.left_forearm, new Vector3(0.9, 0.3, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.9, -0.3, 0), dur);
          break;
        case 'sign-family':
          poseTween(n.left_upper_arm, new Vector3(0.6, 0, -0.4), dur);
          poseTween(n.right_upper_arm, new Vector3(0.6, 0, 0.4), dur);
          poseTween(n.left_forearm, new Vector3(0.7, 0.2, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(0.7, -0.2, 0), dur, true);
          break;
        case 'sign-city':
          poseTween(n.left_upper_arm, new Vector3(0.9, 0, -0.3), dur);
          poseTween(n.right_upper_arm, new Vector3(0.9, 0, 0.3), dur);
          poseTween(n.left_forearm, new Vector3(0.8, 0, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.8, 0, 0), dur);
          break;
        case 'sign-market':
          poseTween(n.left_forearm, new Vector3(0.8, 0.2, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(0.8, -0.2, 0), dur, true);
          break;
        case 'sign-park':
          poseTween(n.left_upper_arm, new Vector3(0.6, 0, -0.6), dur);
          poseTween(n.right_upper_arm, new Vector3(0.6, 0, 0.6), dur);
          break;
        case 'sign-dog':
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.3), dur);
          poseTween(n.right_forearm, new Vector3(0.7, 0, 0), dur, true);
          break;
        case 'sign-child':
          poseTween(n.right_upper_arm, new Vector3(0.3, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(0.4, 0, 0), dur, true);
          break;
        case 'sign-girl':
          poseTween(n.right_upper_arm, new Vector3(0.8, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(1.3, 0.2, 0), dur);
          break;
        case 'sign-shirt':
          poseTween(n.right_upper_arm, new Vector3(0.7, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(1.1, 0, 0), dur, true);
          break;
        case 'sign-dress':
          poseTween(n.left_upper_arm, new Vector3(0.4, 0, -0.1), dur);
          poseTween(n.right_upper_arm, new Vector3(0.4, 0, 0.1), dur);
          poseTween(n.left_forearm, new Vector3(0.5, 0, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.5, 0, 0), dur);
          break;
        case 'sign-hat':
          poseTween(n.right_upper_arm, new Vector3(1.3, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(1.4, 0, 0), dur);
          break;
        case 'sign-shoe':
          poseTween(n.left_forearm, new Vector3(0.9, 0.3, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(0.9, -0.3, 0), dur, true);
          break;
        case 'sign-black':
          poseTween(n.right_upper_arm, new Vector3(0.9, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(1.3, 0.3, 0), dur);
          break;
        case 'sign-yellow':
          poseTween(n.right_upper_arm, new Vector3(0.7, 0, 0.3), dur);
          poseTween(n.right_forearm, new Vector3(1.0, 0.4, 0), dur, true);
          break;
        case 'sign-heavy':
          poseTween(n.left_upper_arm, new Vector3(0.3, 0, -0.1), dur);
          poseTween(n.right_upper_arm, new Vector3(0.3, 0, 0.1), dur);
          poseTween(n.left_forearm, new Vector3(0.3, 0, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.3, 0, 0), dur);
          break;
        case 'sign-street':
          poseTween(n.left_upper_arm, new Vector3(0.7, 0, -0.1), dur);
          poseTween(n.right_upper_arm, new Vector3(0.7, 0, 0.1), dur);
          poseTween(n.left_forearm, new Vector3(0.4, 0, 0), dur);
          poseTween(n.right_forearm, new Vector3(0.4, 0, 0), dur);
          break;
        case 'sign-monday':
          poseTween(n.right_upper_arm, new Vector3(0.6, 0, 0.2), dur);
          poseTween(n.right_forearm, new Vector3(0.8, 0.4, 0), dur, true);
          break;
        case 'sign-night':
          poseTween(n.left_forearm, new Vector3(0.8, 0.5, 0), dur);
          poseTween(n.right_upper_arm, new Vector3(0.8, -0.2, 0), dur);
          poseTween(n.right_forearm, new Vector3(1.0, 0.3, 0), dur);
          break;
        case 'sign-how-are-you':
          poseTween(n.right_upper_arm, new Vector3(0.8, 0, 0.1), dur / 2);
          poseTween(n.right_forearm, new Vector3(0.4, 0, 0), dur);
          poseTween(n.head, new Vector3(0.15, 0.1, 0), dur);
          break;
        case 'sign-he':
        case 'sign-she':
          poseTween(n.right_upper_arm, new Vector3(0.5, 0, 0.3), dur);
          poseTween(n.right_forearm, new Vector3(0.6, 0, 0), dur);
          break;
        case 'sign-stand':
          poseTween(n.left_forearm, new Vector3(0.7, 0.2, 0), dur);
          poseTween(n.right_upper_arm, new Vector3(0.7, 0, 0.1), dur);
          poseTween(n.right_forearm, new Vector3(1.0, 0, 0), dur);
          break;
        case 'sign-walk':
          poseTween(n.left_forearm, new Vector3(0.6, 0, 0), dur, true);
          poseTween(n.right_forearm, new Vector3(0.6, 0, 0), dur, true);
          break;
        case 'reset':
        default:
          setRestPose();
          break;
      }
    },
    setExpression(weights: ExpressionWeights): void {
      if (!rigParts?.headMaterial) return;
      const emphasis = weights.emphasis ?? 0;
      const affirmative = weights.affirmative ?? 0;
      const negative = weights.negative ?? 0;
      const question = weights.question ?? 0;
      rigParts.headMaterial.emissiveColor = new Color3(
        0.04 + emphasis * 0.22 + negative * 0.2,
        0.05 + affirmative * 0.2,
        0.08 + question * 0.24,
      );
    },
    setMouthOpen(value: number): void {
      if (!rigParts?.mouth) return;
      const v = Math.min(1, Math.max(0, value));
      rigParts.mouth.scaling.y = 0.2 + v * 3.5;
    },
    reset(): void {
      setRestPose();
      if (rigParts?.mouth) rigParts.mouth.scaling.y = 0.2;
      if (rigParts?.headMaterial) rigParts.headMaterial.emissiveColor = new Color3(0.04, 0.05, 0.08);
    },
    onFrame(cb: (deltaMs: number) => void): () => void {
      frameListeners.add(cb);
      if (!frameObserver) {
        frameObserver = () => {
          const dt = engine.getDeltaTime();
          for (const listener of frameListeners) listener(dt);
        };
        scene.onBeforeRenderObservable.add(frameObserver);
      }
      return () => {
        frameListeners.delete(cb);
        if (frameListeners.size === 0 && frameObserver) {
          scene.onBeforeRenderObservable.removeCallback(frameObserver);
          frameObserver = null;
        }
      };
    },
    dispose(): void {
      // Full teardown — this route is dynamically loaded, so leaving no engine,
      // scene, meshes, materials, observers or window listeners behind matters.
      disposed = true;
      scene.stopAllAnimations();
      scene.onBeforeRenderObservable.removeCallback(stanceObserver);
      window.removeEventListener('resize', resizeHandler);
      if (frameObserver) scene.onBeforeRenderObservable.removeCallback(frameObserver);
      frameObserver = null;
      frameListeners.clear();
      camera.detachControl();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
