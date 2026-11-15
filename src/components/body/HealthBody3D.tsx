// 3D health body. Reuses the team's working GLB model and viewer approach
// (src/lib/anatomy-viewer).
//
// The body is split into anatomical parts that anyone can recognise (head, neck, shoulders,
// chest, hip, arms, legs, feet) plus a few organs drawn on top where they help (eyes, heart,
// kidneys). Each part takes the colour of the health region it belongs to:
// green, amber, red, or grey stripes for "silent" zones with no recent data.
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { RegionId, Status } from "../../types";

export type PartId =
  | "head" | "eyes" | "neck" | "leftShoulder" | "rightShoulder" | "chest" | "heart" | "hip" | "kidneys"
  | "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "leftFoot" | "rightFoot";

const PARTS: PartId[] = [
  "head", "eyes", "neck", "leftShoulder", "rightShoulder", "chest", "heart", "hip", "kidneys",
  "leftArm", "rightArm", "leftLeg", "rightLeg", "leftFoot", "rightFoot",
];

/** Which health region gives each body part its colour. */
export const PART_REGION: Record<PartId, RegionId> = {
  head: "brain", eyes: "eyes", neck: "neck",
  leftShoulder: "musculoskeletal", rightShoulder: "musculoskeletal",
  chest: "lungs", heart: "heart", hip: "musculoskeletal", kidneys: "kidneys",
  leftArm: "musculoskeletal", rightArm: "musculoskeletal",
  leftLeg: "musculoskeletal", rightLeg: "musculoskeletal",
  leftFoot: "musculoskeletal", rightFoot: "musculoskeletal",
};

export const PART_LABEL: Record<PartId, string> = {
  head: "Head", eyes: "Eyes", neck: "Neck", leftShoulder: "Left shoulder", rightShoulder: "Right shoulder",
  chest: "Chest", heart: "Heart", hip: "Hip", kidneys: "Kidneys",
  leftArm: "Left arm", rightArm: "Right arm", leftLeg: "Left leg", rightLeg: "Right leg",
  leftFoot: "Left foot", rightFoot: "Right foot",
};

/** Organs drawn on top of the anatomical parts. */
const ORGANS: PartId[] = ["eyes", "heart", "kidneys"];

/**
 * Map a point in model space to a body part. The model faces +x, y is up and the body's
 * left side is -z. Calibrated on the bundled GLB (height -0.5..0.5; arms separate from the
 * torso below y = 0.16; legs separate below y = -0.08).
 */
export function partFromPoint(x: number, y: number, z: number): PartId {
  const az = Math.abs(z);
  const side = z < 0 ? "left" : "right";
  if (y > 0.376) {
    if (y > 0.416 && y < 0.452 && x > 0.028 && az < 0.042) return "eyes";
    return "head";
  }
  if (y > 0.32) return az < 0.062 ? "neck" : (`${side}Shoulder` as PartId);
  if (y > 0.22) {
    if (az > 0.085) return `${side}Shoulder` as PartId;
    if (x > 0.0 && ((y - 0.268) / 0.038) ** 2 + ((z + 0.03) / 0.036) ** 2 < 1) return "heart";
    return "chest";
  }
  if (y > -0.1 && az > 0.093) return `${side}Arm` as PartId;
  if (y > 0.13) {
    // kidneys: two ovals on the lower back
    if (x < -0.02 && ((y - 0.165) / 0.03) ** 2 + ((az - 0.045) / 0.022) ** 2 < 1) return "kidneys";
    return "chest";
  }
  if (y > -0.08) return "hip";
  if (y > -0.43) return `${side}Leg` as PartId;
  return `${side}Foot` as PartId;
}

export const STATUS_COLOR: Record<Status, string> = {
  green: "#2fb36b",
  amber: "#f0a020",
  red: "#e5484d",
  silent: "#8a93a6",
};
const STRIPE_DARK = new THREE.Color("#5d6577");
const NEUTRAL_A = new THREE.Color("#d6dde9");
const NEUTRAL_B = new THREE.Color("#a9b3c6");
const NEUTRAL_STRIPE = new THREE.Color("#959eb1");
/** alternate two silvers so neighbouring parts are easy to tell apart */
const PART_TONE: Record<PartId, 0 | 1> = {
  head: 0, eyes: 0, neck: 1, leftShoulder: 0, rightShoulder: 0, chest: 1, heart: 1, hip: 0, kidneys: 0,
  leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1, leftFoot: 0, rightFoot: 0,
};

/** Marker anchors in model space, just outside the surface of each region. */
const MARKER_ANCHOR: Partial<Record<RegionId, [number, number, number]>> = {
  brain: [0.05, 0.47, 0.0],
  eyes: [0.062, 0.434, 0.0],
  neck: [0.03, 0.35, 0.0],
  heart: [0.062, 0.272, -0.03],
  lungs: [0.062, 0.29, 0.052],
  kidneys: [-0.07, 0.165, -0.045],
  musculoskeletal: [0.045, -0.2, 0.05],
};

/** Kidneys sit at the back: draw them as an "x-ray" overlay so they are visible from the front too. */
function KidneyOverlay({ status, neutral }: { status: Status; neutral: boolean }) {
  const color = status === "green" ? (neutral ? "#c9a27a" : STATUS_COLOR.green) : status === "silent" ? "#9aa3b6" : STATUS_COLOR[status];
  return (
    <>
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[-0.035, 0.165, 0.045 * sgn]} scale={[0.016, 0.03, 0.02]} renderOrder={8}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={status === "green" ? 0.35 : 0.8} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}

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
  regionStatus: Partial<Record<RegionId, Status>>;
  selected: RegionId | null;
  onSelect?: (r: RegionId) => void;
  interactive?: boolean;
  /** monitor style: green parts are drawn in neutral silver, only problems are tinted */
  neutral?: boolean;
  /** glowing markers on amber/red regions */
  markers?: boolean;
  /** thin ring on the floor around the feet */
  floorRing?: boolean;
}

function BodyMesh({ modelUrl, regionStatus, selected, onSelect, interactive = true, neutral = false, markers = false, floorRing = false,
  onHover }: BodyProps & { onHover: (p: PartId | null, e?: ThreeEvent<PointerEvent>) => void }) {
  const { scene } = useGLTF(modelUrl);
  const modelRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<PartId | null>(null);
  const [clicked, setClicked] = useState<PartId | null>(null);

  // Clone once, convert to non-indexed geometry with a per-vertex colour and part id.
  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const meshes: { mesh: THREE.Mesh; part: Uint8Array; stripe: Uint8Array }[] = [];
    clone.updateMatrixWorld(true);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let geometry = child.geometry.clone() as THREE.BufferGeometry;
      if (geometry.index) geometry = geometry.toNonIndexed();
      const pos = geometry.getAttribute("position");
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
      const part = new Uint8Array(pos.count);
      const stripe = new Uint8Array(pos.count);
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        p.set(
          (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
          (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
          (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
        );
        p.applyMatrix4(child.matrixWorld);
        const k = PARTS.indexOf(partFromPoint(p.x, p.y, p.z));
        const st = Math.floor((p.y + p.z * 0.6) * 90) % 2 === 0 ? 1 : 0; // diagonal stripes
        part[i] = part[i + 1] = part[i + 2] = k;
        stripe[i] = stripe[i + 1] = stripe[i + 2] = st;
      }
      geometry.computeVertexNormals();
      child.geometry = geometry;
      child.material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.05, vertexColors: true });
      meshes.push({ mesh: child, part, stripe });
    });
    return { clone, meshes };
  }, [scene]);

  // Which parts count as "selected": the clicked part if it matches the selected region,
  // otherwise every part of that region (e.g. selected from the list).
  const selectedParts = useMemo(() => {
    if (!selected) return new Set<PartId>();
    if (clicked && PART_REGION[clicked] === selected) return new Set<PartId>([clicked]);
    return new Set(PARTS.filter((p) => PART_REGION[p] === selected));
  }, [selected, clicked]);

  useEffect(() => {
    const cache = new Map<string, THREE.Color>();
    const colorFor = (p: PartId, stripe: number): THREE.Color => {
      const s = regionStatus[PART_REGION[p]] ?? "silent";
      const isSel = selectedParts.has(p);
      const key = `${p}|${s}|${stripe}|${isSel}|${hovered === p}|${selectedParts.size > 0}`;
      let c = cache.get(key);
      if (c) return c;
      const base = PART_TONE[p] ? NEUTRAL_B : NEUTRAL_A;
      if (neutral) {
        c = s === "green" ? base.clone()
          : s === "silent" ? (stripe ? NEUTRAL_STRIPE.clone() : base.clone())
            : new THREE.Color(STATUS_COLOR[s]).lerp(base, 0.12);
        // organs are always slightly tinted so they can be found
        if (s === "green" && ORGANS.includes(p)) c.lerp(new THREE.Color(p === "heart" ? "#d98a8a" : p === "kidneys" ? "#c9a27a" : "#8fb4ff"), 0.35);
      } else {
        c = s === "silent" && stripe ? STRIPE_DARK.clone() : new THREE.Color(STATUS_COLOR[s]);
        if (PART_TONE[p]) c.multiplyScalar(0.9);
      }
      if (hovered === p) c.lerp(new THREE.Color(neutral ? "#9cc0ff" : "#ffffff"), 0.4);
      else if (selectedParts.size && !isSel) c.lerp(new THREE.Color(neutral ? "#7d8698" : "#1a2236"), neutral ? 0.25 : 0.45);
      else if (isSel) c.lerp(new THREE.Color("#ffffff"), 0.18);
      cache.set(key, c);
      return c;
    };
    for (const { mesh, part, stripe } of prepared.meshes) {
      const colors = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < part.length; i++) {
        const c = colorFor(PARTS[part[i]], stripe[i]);
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    }
  }, [prepared, regionStatus, selectedParts, hovered, neutral]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): PartId | null => {
    if (!modelRef.current || !e.point) return null;
    const local = modelRef.current.worldToLocal(e.point.clone());
    return partFromPoint(local.x, local.y, local.z);
  };

  return (
    <group position={[0, 0.08, 0]} scale={[1.72, 1.72, 1.72]}>
      <group ref={modelRef} rotation={[0, -Math.PI / 2, 0]}>
        <primitive
          object={prepared.clone}
          onClick={interactive ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const p = pick(e); if (p) { setClicked(p); onSelect?.(PART_REGION[p]); } } : undefined}
          onPointerMove={interactive ? (e: ThreeEvent<PointerEvent>) => { const p = pick(e); if (p !== hovered) setHovered(p); onHover(p, e); document.body.style.cursor = "pointer"; } : undefined}
          onPointerOut={interactive ? () => { setHovered(null); onHover(null); document.body.style.cursor = "default"; } : undefined}
        />
        {neutral && <KidneyOverlay status={regionStatus.kidneys ?? "silent"} neutral={neutral} />}
        {markers && (Object.keys(MARKER_ANCHOR) as RegionId[]).map((r) => {
          const s = regionStatus[r];
          if (s !== "red" && s !== "amber") return null;
          return <Marker key={r} position={MARKER_ANCHOR[r]!} color={STATUS_COLOR[s]} big={s === "red"} onClick={() => onSelect?.(r)} />;
        })}
      </group>
      {floorRing && (
        <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.205, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export interface HealthBody3DProps extends BodyProps {
  height?: number | string;
  autoRotate?: boolean;
  /** no background: the page behind shows through */
  transparent?: boolean;
}

export function HealthBody3D({ height = 520, autoRotate = false, transparent = false, ...props }: HealthBody3DProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const onHover = (p: PartId | null, e?: ThreeEvent<PointerEvent>) => {
    if (!p || !e || !wrap.current) { setTip(null); return; }
    const r = wrap.current.getBoundingClientRect();
    const region = PART_REGION[p];
    const s = props.regionStatus[region] ?? "silent";
    const note = s === "red" ? "needs action" : s === "amber" ? "keep an eye on it" : s === "silent" ? "not checked recently" : "all good";
    setTip({ text: `${PART_LABEL[p]} · ${note}`, x: e.nativeEvent.clientX - r.left, y: e.nativeEvent.clientY - r.top });
  };
  return (
    <div ref={wrap} className={transparent ? "body3d body3d-clear" : "body3d"} style={{ height, position: "relative" }}>
      <Canvas camera={{ position: [0, 0, 2.4], fov: 45, near: 0.05, far: 100 }} gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }} dpr={[1, 2]}>
        <ambientLight intensity={props.neutral ? 0.55 : 0.75} />
        {props.neutral && <hemisphereLight args={["#fff4e6", "#2a2f3a", 0.7]} />}
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, 4, -5]} intensity={0.5} />
        <Suspense fallback={null}>
          <BodyMesh {...props} onHover={onHover} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2 - 0.12} maxPolarAngle={Math.PI / 2 - 0.12} autoRotate={autoRotate} autoRotateSpeed={1.2} />
      </Canvas>
      {tip && <div className="body-tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>{tip.text}</div>}
    </div>
  );
}

useGLTF.preload(`${import.meta.env.BASE_URL}geometries/human_body.glb`);
