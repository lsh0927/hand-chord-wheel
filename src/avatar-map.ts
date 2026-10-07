// 얼굴 추적 결과 → VRM 아바타 입력. 브라우저·three.js 의존 없음(테스트 가능).

export type Blendshapes = Record<string, number>;

/** 우리가 쓰는 VRM 표정 프리셋 이름(three-vrm VRMExpressionPresetName 값과 동일) */
export const EXPRESSION_NAMES = ["aa", "oh", "ou", "ee", "blinkLeft", "blinkRight", "happy", "angry", "surprised"] as const;
export type ExpressionName = (typeof EXPRESSION_NAMES)[number];
export type ExpressionWeights = Record<ExpressionName, number>;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * ARKit 이름(MediaPipe 블렌드셰이프) → VRM 프리셋 가중치.
 * mirror=true면 화면이 거울이므로 Left/Right를 바꿔 넣는다(내 왼눈 = 화면 왼쪽 = 아바타 오른눈).
 */
export function mapExpressions(bs: Blendshapes, mirror: boolean, smileGain: number): ExpressionWeights {
  const g = (k: string): number => clamp01(bs[k] ?? 0);
  const avg = (a: string, b: string): number => (g(a) + g(b)) / 2;
  const L = mirror ? "Right" : "Left";
  const R = mirror ? "Left" : "Right";
  return {
    aa: g("jawOpen"),
    oh: g("mouthFunnel"),
    ou: g("mouthPucker"),
    ee: avg("mouthStretchLeft", "mouthStretchRight"),
    blinkLeft: g(`eyeBlink${L}`),
    blinkRight: g(`eyeBlink${R}`),
    happy: clamp01(avg("mouthSmileLeft", "mouthSmileRight") * smileGain),
    angry: avg("browDownLeft", "browDownRight"),
    surprised: clamp01((g("browInnerUp") + avg("eyeWideLeft", "eyeWideRight")) / 2),
  };
}

export interface HeadEuler {
  pitch: number; // x, 라디안
  yaw: number; // y
  roll: number; // z
}
export interface AxisSign {
  x: number;
  y: number;
  z: number;
}
export interface HeadMaxDeg {
  pitch: number;
  yaw: number;
  roll: number;
}
export const ZERO_EULER: Readonly<HeadEuler> = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });

/**
 * MediaPipe 변환 행렬(16개, 열 우선) → 머리 오일러(YXZ; three.js Euler.setFromRotationMatrix 'YXZ'와 같은 공식).
 * sign은 MediaPipe 축 규약을 VRM 축으로 맞추는 부호, mirror는 거울 표시(yaw·roll 반전).
 * 길이가 16이 아니거나 유한하지 않은 값이 있으면 0을 돌려준다 — NaN이 Ema에 들어가면 영구히 굳기 때문.
 */
export function headEulerFromMatrix(data: readonly number[], mirror: boolean, sign: AxisSign, max: HeadMaxDeg): HeadEuler {
  if (data.length !== 16 || !data.every(Number.isFinite)) return { ...ZERO_EULER };
  const R = (i: number, j: number): number => data[j * 4 + i] ?? 0; // 행 i, 열 j (열 우선)
  const m11 = R(0, 0);
  const m13 = R(0, 2);
  const m21 = R(1, 0);
  const m22 = R(1, 1);
  const m23 = R(1, 2);
  const m31 = R(2, 0);
  const m33 = R(2, 2);
  const x = Math.asin(-Math.min(1, Math.max(-1, m23)));
  let y: number;
  let z: number;
  if (Math.abs(m23) < 0.9999999) {
    y = Math.atan2(m13, m33);
    z = Math.atan2(m21, m22);
  } else {
    y = Math.atan2(-m31, m11);
    z = 0;
  }
  let pitch = x * sign.x;
  let yaw = y * sign.y;
  let roll = z * sign.z;
  if (mirror) {
    yaw = -yaw;
    roll = -roll;
  }
  const lim = (v: number, d: number): number => Math.min((d * Math.PI) / 180, Math.max((-d * Math.PI) / 180, v));
  return { pitch: lim(pitch, max.pitch), yaw: lim(yaw, max.yaw), roll: lim(roll, max.roll) };
}
