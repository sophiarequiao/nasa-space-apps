import { useRef, useState, useMemo, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { BodyPartId, HumanBodyProps } from "./types";

const BODY_PART_IDS = [
  "head", "neck", "leftShoulder", "rightShoulder", "spine", "leftArm",
  "rightArm", "lowerBack", "abdomen", "hip", "leftLeg", "rightLeg",
  "leftFoot", "rightFoot", "chest",
] as const;

const BODY_PART_INDEX = new Map(BODY_PART_IDS.map((partId, index) => [partId, index]));

function getBodyPartFromPosition(point: THREE.Vector3): BodyPartId {
  const { x, y, z } = point;

  if (y > 0.376) return "head";
  if (y > 0.32) return "neck";

  if (y > 0.22) {
    if (Math.abs(z) > 0.09) return z < 0 ? "leftShoulder" : "rightShoulder";
    if (x < -0.03) return "spine";
    return "chest";
  }

  if (y > 0.22) {
    if (Math.abs(z) > 0.10) return z < 0 ? "leftArm" : "rightArm";
    if (x < -0.03) return "spine";
    return "chest";
  }
  
  if (y > 0.09) {
    if (Math.abs(z) > 0.10) return z < 0 ? "leftArm" : "rightArm";
    return x < -0.03 ? "lowerBack" : "abdomen";
  }
  if (y > -0.04) {
    if (Math.abs(z) > 0.10) return z < 0 ? "leftArm" : "rightArm";
    return "hip";
  }
  if (y > -0.1) {
    if (Math.abs(z) > 0.10) return z < 0 ? "leftArm" : "rightArm";
  }
  if (y > -0.42) return z < 0 ? "leftLeg" : "rightLeg";
  return z < 0 ? "leftFoot" : "rightFoot";
}

export function HumanBody({ onPartClick, onPartHover, selectedPart, modelPath }: HumanBodyProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredPart, setHoveredPart] = useState<BodyPartId | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  
  const { scene } = useGLTF(modelPath);
  
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry.clone();
        if (geometry.index) {
          child.geometry = geometry.toNonIndexed();
          geometry.dispose();
        } else {
          child.geometry = geometry;
        }

        const color = new THREE.Color("#e8e0d5");
        const colors = new Float32Array(child.geometry.getAttribute("position").count * 3);
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = color.r;
          colors[i + 1] = color.g;
          colors[i + 2] = color.b;
        }
        child.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 0.4,
          metalness: 0.05,
          vertexColors: true,
        });
        child.material = material;
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    const baseColor = new THREE.Color("#e8e0d5");
    const selectedColor = new THREE.Color("#a8d8ff");
    const hoverColor = new THREE.Color("#00aaff");
    const hoveredPartIndex = hoveredPart
      ? BODY_PART_INDEX.get(hoveredPart)
      : undefined;
    
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const colors = child.geometry.getAttribute("color");
        const partIndices = child.geometry.getAttribute("anatomyPart");

        if (!partIndices) {
          const positions = child.geometry.getAttribute("position");
          const ids = new Float32Array(positions.count);
          const point = new THREE.Vector3();
          const modelToLocal = modelRef.current;
          if (!modelToLocal) return;

          child.updateWorldMatrix(true, false);
          modelToLocal.updateWorldMatrix(true, false);
          for (let i = 0; i < positions.count; i += 3) {
            point.set(
              (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3,
              (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3,
              (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3
            );
            child.localToWorld(point);
            modelToLocal.worldToLocal(point);
            const partIndex = BODY_PART_INDEX.get(getBodyPartFromPosition(point)) ?? -1;
            ids[i] = partIndex;
            ids[i + 1] = partIndex;
            ids[i + 2] = partIndex;
          }
          child.geometry.setAttribute("anatomyPart", new THREE.BufferAttribute(ids, 1));
        }

        const cachedPartIndices = child.geometry.getAttribute("anatomyPart");
        for (let i = 0; i < colors.count; i++) {
          const isHoveredPart = hoveredPartIndex !== undefined
            && cachedPartIndices.getX(i) === hoveredPartIndex;
          const color = isHoveredPart
            ? hoverColor
            : selectedPart
              ? selectedColor
              : baseColor;
          colors.setXYZ(i, color.r, color.g, color.b);
        }
        colors.needsUpdate = true;
      }
    });
  }, [clonedScene, selectedPart, hoveredPart]);

  useFrame(() => {
    if (groupRef.current) {
      const targetScale = hovered ? 1.02 : 1;
      groupRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.point && modelRef.current) {
      const localPoint = modelRef.current.worldToLocal(e.point.clone());
      const partId = getBodyPartFromPosition(localPoint);
      onPartClick(partId);
    }
  };

  const updateHoveredPart = (e: ThreeEvent<PointerEvent>) => {
    if (e.point && modelRef.current) {
      const localPoint = modelRef.current.worldToLocal(e.point.clone());
      const partId = getBodyPartFromPosition(localPoint);
      if (partId !== hoveredPart) {
        setHoveredPart(partId);
        onPartHover?.(partId);
      }
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = "pointer";
    updateHoveredPart(e);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    updateHoveredPart(e);
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (
      modelRef.current &&
      e.intersections.some(({ object }) => modelRef.current?.getObjectById(object.id))
    ) {
      return;
    }

    setHovered(false);
    setHoveredPart(null);
    document.body.style.cursor = "default";
    onPartHover?.(null);
  };

  return (
    <group ref={groupRef} position={[0, 0.1, 0]} scale={[4.0, 4.0, 4.0]}>
      <group 
        ref={modelRef}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <primitive 
          object={clonedScene}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
        />
      </group>
    </group>
  );
}
