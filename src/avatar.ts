import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { CONFIG } from "./config";
import { Ema } from "./mapping";
import { EXPRESSION_NAMES, ZERO_EULER, headEulerFromMatrix, mapExpressions, type ExpressionName } from "./avatar-map";
import type { FaceFrame } from "./face";

export interface AvatarInfo {
  name: string;
  metaVersion: string; // "0" | "1"
}

/** VRM 아바타 장면. 얼굴 프레임을 받아 표정·머리를 갱신하고 render()로 그린다. main.ts에서 동적 import로만 불러온다. */
export class AvatarView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private vrm: VRM | null = null;
  private vrm0 = false; // VRM 0.x는 rotateVRM0로 180° 돌려 두므로 로컬 X·Z축이 반대 → pitch·roll 부호 반전
  private loadSeq = 0; // 로드 세대(기존 switchSeq 관용구): 뒤처진 로드는 버린다
  private contextLost = false;
  private readonly exprEma = new Map<ExpressionName, Ema>();
  private readonly headEma = {
    pitch: new Ema(CONFIG.avatar.headAlpha),
    yaw: new Ema(CONFIG.avatar.headAlpha),
    roll: new Ema(CONFIG.avatar.headAlpha),
  };
  /** WebGL 컨텍스트 소실/복구 알림 */
  onContextChange: ((lost: boolean) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    const cam = CONFIG.avatar.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 20);
    this.camera.position.set(0, cam.y, cam.z);
    this.camera.lookAt(0, cam.y, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);
    for (const n of EXPRESSION_NAMES) {
      this.exprEma.set(n, new Ema(n.startsWith("blink") ? CONFIG.avatar.blinkAlpha : CONFIG.avatar.expressionAlpha));
    }
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // 복구 허용
      this.contextLost = true;
      this.onContextChange?.(true);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.onContextChange?.(false);
    });
  }

  get loaded(): boolean {
    return this.vrm !== null;
  }

  /** 캔버스 CSS 크기에 맞춤. display:none(크기 0)이면 건너뛴다 — 종횡비 0은 투영 행렬을 NaN으로 만든다 */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    if (cssWidth <= 0 || cssHeight <= 0) return;
    this.renderer.setPixelRatio(Math.min(dpr, CONFIG.avatar.maxPixelRatio));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;
    this.camera.updateProjectionMatrix();
  }

  /** VRM 로드(URL 또는 객체 URL). 실패하면 throw(기존 아바타 유지). 더 늦게 시작된 로드가 있으면 CANCELLED */
  async load(url: string): Promise<AvatarInfo> {
    const seq = ++this.loadSeq;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    if (seq !== this.loadSeq) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error("CANCELLED: 다른 아바타 로드가 시작되어 취소했습니다");
    }
    const vrm = (gltf.userData as { vrm?: VRM }).vrm;
    if (!vrm) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error("VRM: VRM 데이터가 없는 파일입니다(일반 glTF)");
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    const meta = vrm.meta;
    const isVrm0 = meta.metaVersion === "0";
    if (isVrm0) VRMUtils.rotateVRM0(vrm); // VRM 0.x는 반대편을 봄 → 카메라 쪽으로
    this.unload();
    this.vrm = vrm;
    this.vrm0 = isVrm0;
    this.scene.add(vrm.scene);
    this.resetPose();
    const name = meta.metaVersion === "0" ? (meta.title ?? "VRM") : meta.name;
    return { name, metaVersion: meta.metaVersion };
  }

  unload(): void {
    if (!this.vrm) return;
    this.scene.remove(this.vrm.scene);
    VRMUtils.deepDispose(this.vrm.scene);
    this.vrm = null;
  }

  /** 표정 0·정면으로 즉시 되돌림(오류·Reset·로드 직후) */
  resetPose(): void {
    for (const e of this.exprEma.values()) e.reset();
    for (const e of Object.values(this.headEma)) e.reset();
    const vrm = this.vrm;
    if (!vrm) return;
    const em = vrm.expressionManager;
    if (em) for (const n of EXPRESSION_NAMES) if (em.getExpression(n)) em.setValue(n, 0);
    vrm.humanoid.getNormalizedBoneNode("head")?.rotation.set(0, 0, 0, "YXZ");
  }

  /** 얼굴 프레임 적용. null이면 표정 0·정면으로 완만히 복귀(Ema) */
  applyFace(face: FaceFrame | null): void {
    const vrm = this.vrm;
    if (!vrm) return;
    const a = CONFIG.avatar;
    const weights = face ? mapExpressions(face.blendshapes, a.mirror, a.smileGain) : null;
    const em = vrm.expressionManager;
    if (em) {
      for (const n of EXPRESSION_NAMES) {
        if (!em.getExpression(n)) continue; // 모델에 없는 표정은 건너뜀
        const target = weights ? weights[n] : 0;
        em.setValue(n, this.exprEma.get(n)?.next(target) ?? target);
      }
    }
    const euler = face?.matrix ? headEulerFromMatrix(face.matrix, a.mirror, a.headAxisSign, a.headMaxDeg) : ZERO_EULER;
    const head = vrm.humanoid.getNormalizedBoneNode("head");
    if (head) {
      const flip = this.vrm0 ? -1 : 1;
      head.rotation.set(this.headEma.pitch.next(euler.pitch) * flip, this.headEma.yaw.next(euler.yaw), this.headEma.roll.next(euler.roll) * flip, "YXZ");
    }
  }

  /** 한 프레임 그리기. 호출 빈도 제한(30 fps)은 호출자(main.ts renderAvatar)가 맡는다 */
  render(): void {
    const dt = Math.min(this.clock.getDelta(), CONFIG.avatar.maxDeltaSec); // 오래 멈췄다 돌아와도 스프링본이 튀지 않게
    if (this.contextLost) return;
    this.vrm?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.unload();
    this.renderer.dispose();
  }
}
