import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { decodeModelResponse } from "../model-download";
import { alignMirroredWinding } from "../winding";
import {
  DEFAULT_LIGHTING,
  STUDIO_LIGHTS,
  SYSTEMS,
  type Atlas,
  type Part,
} from "../anatomy";
import type { Catalog, Structure } from "@/lib/flashcards/types";

/** Systems loaded as surrounding anatomy on cards. */
const CONTEXT_SYSTEMS = new Set(["skeletal", "muscular", "connective"]);
const NOT_CONTEXT = /tooth|gingiva|papillary/i;

const HIGHLIGHT = "#ff9f1a";
const BONE = SYSTEMS.find((system) => system.id === "skeletal")!.color;
const MUSCLE_GHOST = SYSTEMS.find((system) => system.id === "muscular")!.color;

interface ViewDirection {
  /** Name of this camera direction. */
  name: string;
  dir: T.Vector3;
  up: T.Vector3;
  /** Preference for the conventional atlas views. */
  bias: number;
}
const Y = new T.Vector3(0, 1, 0);
const view = (
  name: string,
  dir: T.Vector3,
  bias: number,
  up = Y,
): ViewDirection => ({ name, dir: dir.normalize(), up, bias });
// The atlas faces +z with the body's right toward -x.
const VIEWS: ViewDirection[] = [
  view("anterior", new T.Vector3(0, 0, 1), 1.1),
  view("posterior", new T.Vector3(0, 0, -1), 1.06),
  view("right lateral", new T.Vector3(-1, 0, 0), 1.03),
  view("left lateral", new T.Vector3(1, 0, 0), 0.92),
  view("right anterolateral", new T.Vector3(-1, 0, 1), 0.98),
  view("right posterolateral", new T.Vector3(-1, 0, -1), 0.96),
  view("left anterolateral", new T.Vector3(1, 0, 1), 0.9),
  view("left posterolateral", new T.Vector3(1, 0, -1), 0.88),
  view("superior", new T.Vector3(0, 1, 0), 0.6, new T.Vector3(0, 0, -1)),
  view("inferior", new T.Vector3(0, -1, 0), 0.55, new T.Vector3(0, 0, 1)),
];

export interface RenderedView {
  view: string;
  dataUrl: string;
}
export interface CardRendererApi {
  ready: boolean;
  error?: string;
  ids(): string[];
  render(
    id: string,
    options?: { views?: number; size?: number },
  ): Promise<RenderedView[]>;
}
declare global {
  interface Window {
    cardRenderer?: CardRendererApi;
  }
}

export function startCardRenderer(host: HTMLElement) {
  const api: CardRendererApi = {
    ready: false,
    ids: () => [],
    render: async () => [],
  };
  window.cardRenderer = api;
  host.textContent = "Loading anatomy for card rendering…";
  load(host, api).catch((e) => {
    api.error = e instanceof Error ? e.message : String(e);
    host.textContent = api.error;
  });
}

function box(p: Part) {
  return new T.Box3(
    new T.Vector3().fromArray(p.bounds[0]),
    new T.Vector3().fromArray(p.bounds[1]),
  );
}

async function load(host: HTMLElement, api: CardRendererApi) {
  const [atlas, catalog] = await Promise.all([
    fetch("/models/atlas.json").then((r) => r.json() as Promise<Atlas>),
    fetch("/cards/catalog.json").then((r) => r.json() as Promise<Catalog>),
  ]);
  const wanted = new Set(
    atlas.parts
      .filter((p) => CONTEXT_SYSTEMS.has(p.system) && !NOT_CONTEXT.test(p.name))
      .map((p) => p.id),
  );
  for (const s of catalog.structures) for (const id of s.parts) wanted.add(id);

  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_LIGHTING.exposure;
  host.textContent = "";
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, DEFAULT_LIGHTING.softness);
  scene.environment = env.texture;
  room.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.geometry.dispose();
      const roomMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      roomMaterials.forEach((material) => material.dispose());
    }
  });
  pmrem.dispose();
  scene.add(
    new T.HemisphereLight(
      STUDIO_LIGHTS.hemisphereSky,
      STUDIO_LIGHTS.hemisphereGround,
      DEFAULT_LIGHTING.hemisphere,
    ),
  );
  const camera = new T.PerspectiveCamera(28, 1, 0.005, 20);
  // Same view-locked suns as the studio, so a card matches the atlas lighting.
  const viewLight = (
    color: number,
    intensity: number,
    position: readonly [number, number, number],
  ) => {
    const light = new T.DirectionalLight(color, intensity);
    light.position.set(position[0], position[1], position[2]);
    camera.add(light);
    camera.add(light.target);
    return light;
  };
  viewLight(
    STUDIO_LIGHTS.key.color,
    DEFAULT_LIGHTING.key,
    STUDIO_LIGHTS.key.position,
  );
  viewLight(
    STUDIO_LIGHTS.fill.color,
    DEFAULT_LIGHTING.fill,
    STUDIO_LIGHTS.fill.position,
  );
  viewLight(
    STUDIO_LIGHTS.rim.color,
    DEFAULT_LIGHTING.rim,
    STUDIO_LIGHTS.rim.position,
  );
  scene.add(camera);

  const side = T.DoubleSide;
  const material = {
    highlight: new T.MeshStandardMaterial({
      color: HIGHLIGHT,
      emissive: "#ff6a00",
      emissiveIntensity: 0.55,
      roughness: 0.34,
      metalness: 0.02,
      envMapIntensity: DEFAULT_LIGHTING.environment,
      side,
    }),
    mark: new T.MeshStandardMaterial({
      color: "#ffa500",
      roughness: 0.48,
      metalness: 0.04,
      envMapIntensity: DEFAULT_LIGHTING.environment,
      side,
    }),
    bone: new T.MeshStandardMaterial({
      color: BONE,
      roughness: 0.72,
      metalness: 0.02,
      envMapIntensity: DEFAULT_LIGHTING.environment,
      side,
    }),
    // Ghosted muscles draw in two passes so only their nearest surface is shaded,
    // giving one veil instead of many stacked translucent layers.
    ghostDepth: new T.MeshBasicMaterial({ colorWrite: false, side }),
    ghost: new T.MeshStandardMaterial({
      color: MUSCLE_GHOST,
      roughness: 0.6,
      envMapIntensity: DEFAULT_LIGHTING.environment,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      depthFunc: T.EqualDepth,
      side,
    }),
    idTarget: new T.MeshBasicMaterial({ color: 0xffffff, side }),
    idOccluder: new T.MeshBasicMaterial({ color: 0x000000, side }),
  };

  const parts = new Map(atlas.parts.map((p) => [p.id, p]));
  const meshes = new Map<string, T.Mesh>();
  const chunks = [...new Set([...wanted].map((id) => parts.get(id)!.chunk))];
  let loaded = 0;
  await Promise.all(
    chunks.map(async (ci) => {
      const chunk = atlas.chunks[ci];
      const compressed =
        !!chunk.gzip && typeof DecompressionStream !== "undefined";
      const buffer = await decodeModelResponse(
        await fetch(compressed ? chunk.gzip! : chunk.url),
        chunk.bytes,
        compressed,
      );
      for (const p of atlas.parts) {
        if (p.chunk !== ci || !wanted.has(p.id)) continue;
        const g = new T.BufferGeometry();
        const position = new Float32Array(
          buffer,
          p.positions,
          p.vertexCount * 3,
        );
        const normal = new Int16Array(buffer, p.normals, p.vertexCount * 3);
        const index = new Uint32Array(buffer, p.indices, p.indexCount);
        alignMirroredWinding(position, normal, index);
        g.setAttribute("position", new T.BufferAttribute(position, 3));
        g.setAttribute("normal", new T.BufferAttribute(normal, 3, true));
        g.setIndex(new T.BufferAttribute(index, 1));
        g.boundingBox = box(p);
        g.computeBoundingSphere();
        const mesh = new T.Mesh(g, material.bone);
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        meshes.set(p.id, mesh);
      }
      host.dataset.progress = String(
        Math.round((++loaded / chunks.length) * 100),
      );
    }),
  );

  const structures = new Map(catalog.structures.map((s) => [s.id, s]));
  const muscleParts = new Set(
    catalog.structures
      .filter((s) => s.category === "muscle")
      .flatMap((s) => s.parts),
  );
  const isMuscle = (p: Part) =>
    p.system === "muscular" || muscleParts.has(p.id);
  const ID_SIZE = 96;
  const idTarget = new T.WebGLRenderTarget(ID_SIZE, ID_SIZE);
  const pixels = new Uint8Array(ID_SIZE * ID_SIZE * 4);

  const meshBox = (ids: string[]) => {
    const b = new T.Box3();
    for (const id of ids) {
      const p = parts.get(id);
      if (p) b.union(box(p));
    }
    return b;
  };

  const longest = (b: T.Box3) => {
    const s = b.getSize(new T.Vector3());
    return Math.max(s.x, s.y, s.z);
  };

  /** Output framing leaves a wide margin for neighboring anatomy. `score` frames every direction alike so their scores compare fairly. */
  function frame(bounds: T.Box3, v: ViewDirection, score = false) {
    const center = bounds.getCenter(new T.Vector3());
    const right = new T.Vector3().crossVectors(v.up, v.dir).normalize();
    const up = new T.Vector3().crossVectors(v.dir, right).normalize();
    let w = 0;
    let h = 0;
    for (let i = 0; i < 8; i++) {
      const corner = new T.Vector3(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      ).sub(center);
      w = Math.max(w, Math.abs(corner.dot(right)) * 2);
      h = Math.max(h, Math.abs(corner.dot(up)) * 2);
    }
    const extent = score
      ? bounds.getSize(new T.Vector3()).length()
      : Math.max(w, h) * 4;
    const size = Math.max(0.12, extent);
    const distance = size / 2 / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(center).addScaledVector(v.dir, distance);
    camera.up.copy(v.up);
    camera.lookAt(center);
    camera.near = Math.max(0.005, distance - size * 2);
    camera.far = distance + size * 3;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Meshes near the structure; distant anatomy is left out so the view reads as a regional dissection. */
  function context(s: Structure, subject: T.Box3, one: T.Box3) {
    const size = one.getSize(new T.Vector3());
    const region = subject
      .clone()
      .expandByScalar(Math.max(Math.max(size.x, size.y, size.z) * 2, 0.18));
    const own = new Set(s.parts);
    const bones: T.Mesh[] = [];
    const muscles: T.Mesh[] = [];
    for (const [id, mesh] of meshes) {
      const p = parts.get(id)!;
      if (own.has(id) || !region.intersectsBox(box(p))) continue;
      if (p.system === "skeletal") bones.push(mesh);
      else if (isMuscle(p)) muscles.push(mesh);
    }
    return { bones, muscles: s.category === "muscle" ? muscles : [] };
  }

  function show(visible: T.Mesh[], assign: (m: T.Mesh) => T.Material) {
    for (const mesh of meshes.values()) mesh.visible = false;
    for (const mesh of visible) {
      mesh.visible = true;
      mesh.material = assign(mesh);
    }
  }

  function visiblePixels() {
    renderer.setRenderTarget(idTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(idTarget, 0, 0, ID_SIZE, ID_SIZE, pixels);
    renderer.setRenderTarget(null);
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 128) n++;
    return n;
  }

  api.ids = () => catalog.structures.map((s) => s.id);
  api.render = async (id, options = {}) => {
    const s = structures.get(id);
    if (!s) throw new Error(`Unknown structure ${id}`);
    const one = meshBox(s.focus.length ? s.focus : s.parts);
    const subject = meshBox(s.parts);
    // Both sides share the picture when they fit in the usual frame. A fingertip
    // stays a close-up of one side, because the other hand would shrink it to a speck.
    const framed = longest(subject) <= longest(one) * 4 ? subject : one;
    const targets = s.parts.map((p) => meshes.get(p)!).filter(Boolean);
    const targetSet = new Set(targets);
    const { bones, muscles } = context(s, framed, one);
    const idMaterial = (m: T.Mesh) =>
      targetSet.has(m) ? material.idTarget : material.idOccluder;

    // Score each direction by how much of the structure is visible, both behind
    // the ghosted muscles and with them treated as opaque.
    const scored = VIEWS.map((v) => {
      frame(framed, v, true);
      show([...targets, ...bones, ...muscles], idMaterial);
      const unobstructed = visiblePixels();
      show([...targets, ...bones], idMaterial);
      const throughGhost = visiblePixels();
      return { v, score: (unobstructed * 0.5 + throughGhost * 0.5) * v.bias };
    }).sort((a, b) => b.score - a.score);

    const chosen = [scored[0]];
    for (const candidate of scored.slice(1)) {
      if (chosen.length >= (options.views ?? 2)) break;
      const distinct = chosen.every(
        (c) => c.v.dir.angleTo(candidate.v.dir) > T.MathUtils.degToRad(80),
      );
      if (distinct && candidate.score >= scored[0].score * 0.45)
        chosen.push(candidate);
    }

    const size = options.size ?? 720;
    renderer.setSize(size, size, false);
    const ghosts = new Set(muscles);
    const marked = s.category === "muscle" ? material.highlight : material.mark;
    const out: RenderedView[] = [];
    for (const { v } of chosen) {
      frame(framed, v);
      show([...targets, ...bones, ...muscles], (m) => {
        m.renderOrder = ghosts.has(m) ? 1 : 0;
        return targetSet.has(m)
          ? marked
          : ghosts.has(m)
            ? material.ghostDepth
            : material.bone;
      });
      renderer.render(scene, camera);
      if (ghosts.size) {
        show(muscles, () => material.ghost);
        renderer.autoClear = false;
        renderer.render(scene, camera);
        renderer.autoClear = true;
      }
      out.push({
        view: v.name,
        dataUrl: renderer.domElement.toDataURL("image/webp", 0.86),
      });
    }
    return out;
  };
  api.ready = true;
  host.dataset.ready = "true";
}
