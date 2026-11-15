// 3D health body. Reuses the team's working GLB viewer approach (src/lib/anatomy-viewer)
// and paints each health region with its status colour: green, amber, red, or grey stripes
// for "silent" zones with no recent data.
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { RegionId, Status } from "../../types";

export const SPATIAL_REGIONS: RegionId[] = ["brain", "eyes", "neck", "heart", "lungs", "kidneys", "musculoskeletal"];

/**
 * Map a point in model space to a health region. The model faces +x, y is up and
 * the body's left side is -z. Calibrated on the bundled GLB (head above y = 0.376).
 */
export function regionFromPoint(x: number, y: number, z: number): RegionId {
  const az = Math.abs(z);
  if (y > 0.376) {
    if (y > 0.416 && y < 0.452 && x > 0.028 && az < 0.042) return "eyes";
    return "brain";
  }
  if (y > 0.32) return az < 0.062 ? "neck" : "musculoskeletal";
  if (y > 0.215) {
    if (az > 0.098) return "musculoskeletal";
    // heart: an ellipse on the front of the chest, slightly to the body's left (-z)
    if (x > 0.0 && ((y - 0.268) / 0.038) ** 2 + ((z + 0.03) / 0.036) ** 2 < 1) return "heart";
    return "lungs";
  }
  if (y > 0.1) {
    if (az > 0.1) return "musculoskeletal";
    return "kidneys";
  }
  return "musculoskeletal";
}

const REGION_INDEX: RegionId[] = ["brain", "eyes", "neck", "heart", "lungs", "kidneys", "musculoskeletal"];

export const STATUS_COLOR: Record<Status, string> = {
  green: "#2fb36b",
  amber: "#f0a020",
  red: "#e5484d",
  silent: "#8a93a6",
};
const STRIPE_DARK = new THREE.Color("#5d6577");
const NEUTRAL = new THREE.Color("#c9d2e2");
const NEUTRAL_STRIPE = new THREE.Color("#9aa3b6");

/** Marker anchors in model space, just outside the front surface of each region. */
const MARKER_ANCHOR: Record<string, [number, number, number]> = {
  brain: [0.05, 0.47, 0.0],
  eyes: [0.062, 0.434, 0.0],
  neck: [0.03, 0.35, 0.0],
  heart: [0.062, 0.272, -0.03],
  lungs: [0.062, 0.29, 0.052],
  kidneys: [0.062, 0.16, -0.04],
  musculoskeletal: [0.045, -0.15, 0.06],
};

function Marker({ position, color, big, onClick }: { position: [number, number, number]; color: string; big: boolean; onClick: () => void }) {
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!halo.current) return;
    const t = (clock.getElapsedTime() * (big ? 1.2 : 0.8)) % 1;
    halo.current.scale.setScalar(1 + t * 1.8);
    (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
  });
  return (
    <group position={position}>
      <mesh renderOrder={10} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <sphereGeometry args={[big ? 0.0075 : 0.006, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <mesh ref={halo} renderOrder={9}>
        <sphereGeometry args={[big ? 0.0075 : 0.006, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

interface BodyProps {
  modelUrl: string;
  /** monitor style: green regions are drawn in neutral silver, only problems are tinted */
  neutral?: boolean;
  /** glowing markers on amber/red regions */
  markers?: boolean;
  regionStatus: Partial<Record<RegionId, Status>>;
  selected: RegionId | null;
  onSelect?: (r: RegionId) => void;
  interactive?: boolean;
}

function BodyMesh({ modelUrl, regionStatus, selected, onSelect, interactive = true, neutral = false, markers = false }: BodyProps) {
  const { scene } = useGLTF(modelUrl);
  const modelRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<RegionId | null>(null);

  // Clone once, convert to non-indexed geometry with a per-vertex colour and a per-vertex region id.
  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const meshes: { mesh: THREE.Mesh; region: Uint8Array; stripe: Uint8Array }[] = [];
    clone.updateMatrixWorld(true);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let geometry = child.geometry.clone() as THREE.BufferGeometry;
      if (geometry.index) geometry = geometry.toNonIndexed();
      const pos = geometry.getAttribute("position");
      const colors = new Float32Array(pos.count * 3);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const region = new Uint8Array(pos.count);
      const stripe = new Uint8Array(pos.count);
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        p.set(
          (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
          (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
          (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
        );
        p.applyMatrix4(child.matrixWorld);
        const r = REGION_INDEX.indexOf(regionFromPoint(p.x, p.y, p.z));
        const st = Math.floor((p.y + p.z * 0.6) * 90) % 2 === 0 ? 1 : 0; // diagonal stripes
        region[i] = region[i + 1] = region[i + 2] = r;
        stripe[i] = stripe[i + 1] = stripe[i + 2] = st;
      }
      geometry.computeVertexNormals();
      child.geometry = geometry;
      child.material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.05, vertexColors: true });
      meshes.push({ mesh: child, region, stripe });
    });
    return { clone, meshes };
  }, [scene]);

  // Repaint whenever statuses, selection or hover change.
  useEffect(() => {
    const cache = new Map<string, THREE.Color>();
    const colorFor = (r: RegionId, stripe: number): THREE.Color => {
      const s = regionStatus[r] ?? "silent";
      const key = `${r}|${s}|${stripe}|${selected === r}|${hovered === r}|${selected !== null}`;
      let c = cache.get(key);
      if (c) return c;
      c = neutral
        ? s === "green" ? NEUTRAL.clone() : s === "silent" ? (stripe ? NEUTRAL_STRIPE.clone() : NEUTRAL.clone()) : new THREE.Color(STATUS_COLOR[s]).lerp(NEUTRAL, 0.15)
        : s === "silent" && stripe ? STRIPE_DARK.clone() : new THREE.Color(STATUS_COLOR[s]);
      if (hovered === r) c.lerp(new THREE.Color(neutral ? "#8fb4ff" : "#ffffff"), 0.35);
      else if (selected && selected !== r) c.lerp(new THREE.Color(neutral ? "#8a93a6" : "#1a2236"), neutral ? 0.25 : 0.45);
      else if (selected === r) c.lerp(new THREE.Color("#ffffff"), 0.15);
      cache.set(key, c);
      return c;
    };
    for (const { mesh, region, stripe } of prepared.meshes) {
      const colors = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < region.length; i++) {
        const c = colorFor(REGION_INDEX[region[i]], stripe[i]);
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    }
  }, [prepared, regionStatus, selected, hovered, neutral]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): RegionId | null => {
    if (!modelRef.current || !e.point) return null;
    const local = modelRef.current.worldToLocal(e.point.clone());
    return regionFromPoint(local.x, local.y, local.z);
  };

  return (
    <group position={[0, -0.06, 0]} scale={[2.0, 2.0, 2.0]}>
      <group ref={modelRef} rotation={[0, -Math.PI / 2, 0]}>
        <primitive
          object={prepared.clone}
          onClick={interactive ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const r = pick(e); if (r) onSelect?.(r); } : undefined}
          onPointerMove={interactive ? (e: ThreeEvent<PointerEvent>) => { const r = pick(e); if (r !== hovered) setHovered(r); document.body.style.cursor = "pointer"; } : undefined}
          onPointerOut={interactive ? () => { setHovered(null); document.body.style.cursor = "default"; } : undefined}
        />
        {markers && (Object.keys(MARKER_ANCHOR) as RegionId[]).map((r) => {
          const s = regionStatus[r];
          if (s !== "red" && s !== "amber") return null;
          return <Marker key={r} position={MARKER_ANCHOR[r]} color={STATUS_COLOR[s]} big={s === "red"} onClick={() => onSelect?.(r)} />;
        })}
      </group>
    </group>
  );
}

export interface HealthBody3DProps extends BodyProps {
  height?: number | string;
  /** no background: the page behind shows through */
  transparent?: boolean;
  autoRotate?: boolean;
}

export function HealthBody3D({ height = 520, autoRotate = false, transparent = false, ...props }: HealthBody3DProps) {
  return (
    <div className={transparent ? "body3d body3d-clear" : "body3d"} style={{ height }}>
      <Canvas camera={{ position: [0, 0.05, 2.35], fov: 45, near: 0.05, far: 100 }} gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }} dpr={[1, 2]}>
        <ambientLight intensity={props.neutral ? 0.55 : 0.75} />
        {props.neutral && <hemisphereLight args={["#fff4e6", "#2a2f3a", 0.7]} />}
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, 4, -5]} intensity={0.5} />
        <Suspense fallback={null}>
          <BodyMesh {...props} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2} maxPolarAngle={Math.PI / 2} autoRotate={autoRotate} autoRotateSpeed={1.2} />
      </Canvas>
    </div>
  );
}

useGLTF.preload(`${import.meta.env.BASE_URL}geometries/human_body.glb`);
