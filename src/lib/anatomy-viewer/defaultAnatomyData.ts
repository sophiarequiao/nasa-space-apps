import type { AnatomyData, BodyPartId } from './types';

export const defaultAnatomyData: AnatomyData = {
  head: {
    id: "head",
    name: "Head",
    description: "The head includes the face, skull, and scalp.",
    facts: [
      "The human skull is made up of 22 bones",
      "The scalp covers and protects the skull",
      "Facial muscles enable expressions"
    ],
    color: "#ff6b6b"
  },
  neck: {
    id: "neck",
    name: "Neck",
    description: "The neck connects the head to the torso and supports head movement.",
    facts: [
      "The neck contains 7 cervical vertebrae",
      "Major arteries and veins pass through the neck",
      "The thyroid gland is located in the neck"
    ],
    color: "#ffa94d"
  },
  leftShoulder: {
    id: "leftShoulder",
    name: "Left Shoulder",
    description: "The shoulder joint is one of the most mobile joints in the body, connecting the arm to the torso.",
    facts: [
      "The shoulder has the greatest range of motion of any joint",
      "It consists of three bones: clavicle, scapula, and humerus",
      "Four rotator cuff muscles stabilize the shoulder"
    ],
    color: "#ffd43b"
  },
  rightShoulder: {
    id: "rightShoulder",
    name: "Right Shoulder",
    description: "The shoulder joint is one of the most mobile joints in the body, connecting the arm to the torso.",
    facts: [
      "The shoulder has the greatest range of motion of any joint",
      "It consists of three bones: clavicle, scapula, and humerus",
      "Four rotator cuff muscles stabilize the shoulder"
    ],
    color: "#ffd43b"
  },
  chest: {
    id: "chest",
    name: "Chest",
    description: "The chest is the front upper-torso region, from the shoulders to the abdomen.",
    facts: [
      "The ribcage consists of 12 pairs of ribs",
      "The chest cavity is separated from the abdomen by the diaphragm",
      "Intercostal muscles between ribs assist in breathing"
    ],
    color: "#74c0fc"
  },
  spine: {
    id: "spine",
    name: "Spine",
    description: "The spine (vertebral column) protects the spinal cord and provides structural support for the body.",
    facts: [
      "The spine consists of 33 vertebrae",
      "It has natural curves that help absorb shock",
      "The spinal cord runs through the vertebral canal"
    ],
    color: "#b197fc"
  },
  leftArm: {
    id: "leftArm",
    name: "Left Arm",
    description: "The arm extends from the shoulder to the wrist, containing the humerus, radius, and ulna bones.",
    facts: [
      "The arm contains three main bones",
      "The elbow is a hinge joint",
      "Muscles in the arm enable flexion and extension"
    ],
    color: "#fcc419"
  },
  rightArm: {
    id: "rightArm",
    name: "Right Arm",
    description: "The arm extends from the shoulder to the wrist, containing the humerus, radius, and ulna bones.",
    facts: [
      "The arm contains three main bones",
      "The elbow is a hinge joint",
      "Muscles in the arm enable flexion and extension"
    ],
    color: "#fcc419"
  },
  lowerBack: {
    id: "lowerBack",
    name: "Lower Back",
    description: "The lower back (lumbar region) supports the upper body and allows for movement and flexibility.",
    facts: [
      "The lumbar spine has 5 vertebrae",
      "It bears most of the body's weight",
      "Lower back muscles are crucial for posture"
    ],
    color: "#b197fc"
  },
  abdomen: {
    id: "abdomen",
    name: "Abdomen",
    description: "The abdomen is the front torso region below the chest and above the pelvis.",
    facts: [
      "The abdominal wall supports the torso",
      "The navel is located near the center of the abdomen",
      "The abdomen connects the chest to the pelvis"
    ],
    color: "#a9e34b"
  },
  hip: {
    id: "hip",
    name: "Hip",
    description: "The hip joint connects the leg to the pelvis and is one of the body's largest weight-bearing joints.",
    facts: [
      "The hip is a ball-and-socket joint",
      "It supports body weight during movement",
      "The pelvis consists of three fused bones"
    ],
    color: "#fab005"
  },
  leftLeg: {
    id: "leftLeg",
    name: "Left Leg",
    description: "The leg extends from the hip to the ankle, containing the femur, tibia, and fibula bones.",
    facts: [
      "The femur is the longest bone in the body",
      "The leg contains powerful muscles for walking",
      "The knee is the largest joint in the body"
    ],
    color: "#38d9a9"
  },
  rightLeg: {
    id: "rightLeg",
    name: "Right Leg",
    description: "The leg extends from the hip to the ankle, containing the femur, tibia, and fibula bones.",
    facts: [
      "The femur is the longest bone in the body",
      "The leg contains powerful muscles for walking",
      "The knee is the largest joint in the body"
    ],
    color: "#38d9a9"
  },
  leftFoot: {
    id: "leftFoot",
    name: "Left Foot",
    description: "The foot provides balance, support, and propulsion for walking and running.",
    facts: [
      "Each foot has 26 bones",
      "The foot has three arches for shock absorption",
      "There are over 100 muscles, tendons, and ligaments in each foot"
    ],
    color: "#4dabf7"
  },
  rightFoot: {
    id: "rightFoot",
    name: "Right Foot",
    description: "The foot provides balance, support, and propulsion for walking and running.",
    facts: [
      "Each foot has 26 bones",
      "The foot has three arches for shock absorption",
      "There are over 100 muscles, tendons, and ligaments in each foot"
    ],
    color: "#4dabf7"
  }
};
