import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";
import type { Delegate } from "./tracker";

export interface FaceFrame {
  blendshapes: Record<string, number>; // ARKit 이름 → 0~1
  matrix: number[] | null; // 4×4 열 우선 16개
}
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** MediaPipe Face Landmarker 래퍼. 손 추적(HandTracker)과 같은 wasm 파일셋을 쓴다. */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private lastTs = -1;
  delegate: Delegate = "GPU";

  get ready(): boolean {
    return this.landmarker !== null;
  }

  /** GPU → 실패 시 CPU. isStale()이 참이면 늦게 끝난 인스턴스를 닫고 CANCELLED로 끝낸다 */
  async init(isStale: () => boolean = () => false): Promise<Delegate> {
    this.close();
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.tracker.wasmPath);
    let created: FaceLandmarker;
    let delegate: Delegate = "GPU";
    try {
      created = await this.create(fileset, "GPU");
    } catch (e) {
      console.warn("얼굴 모델 GPU 실패, CPU로 재시도", e);
      created = await this.create(fileset, "CPU");
      delegate = "CPU";
    }
    if (isStale()) {
      created.close();
      throw new Error("CANCELLED: 얼굴 모델 로드가 취소되었습니다");
    }
    this.landmarker = created;
    this.delegate = delegate;
    this.lastTs = -1;
    return delegate;
  }

  private create(fileset: Fileset, delegate: Delegate): Promise<FaceLandmarker> {
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: CONFIG.face.modelPath, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: CONFIG.face.minFaceDetectionConfidence,
      minFacePresenceConfidence: CONFIG.face.minFacePresenceConfidence,
      minTrackingConfidence: CONFIG.face.minTrackingConfidence,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  }

  /** 얼굴이 없으면 null. 타임스탬프는 단조 증가로 보정 */
  detect(video: HTMLVideoElement, nowMs: number): FaceFrame | null {
    if (!this.landmarker) return null;
    const ts = Math.max(Math.floor(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    const r = this.landmarker.detectForVideo(video, ts);
    const cats = r.faceBlendshapes[0]?.categories;
    if (!cats || cats.length === 0) return null;
    const blendshapes: Record<string, number> = {};
    for (const c of cats) blendshapes[c.categoryName] = c.score;
    const data = r.facialTransformationMatrixes[0]?.data;
    return { blendshapes, matrix: data && data.length === 16 ? Array.from(data) : null };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
