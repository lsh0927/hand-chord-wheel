import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";
import { EMPTY_SELECTION, selectRightHand, type HandSelection } from "./hands";
import type { Point } from "./mapping";

export type Delegate = "GPU" | "CPU";
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTs = -1;
  delegate: Delegate = "GPU";

  /**
   * wasm·모델 로드. 기존 인스턴스가 있으면 먼저 닫는다(재시도 누수 방지).
   * GPU delegate 실패 시 CPU로 한 번 더 시도. 둘 다 실패하면 두 번째 예외를 던진다.
   * isStale()이 true면(타임아웃·재시도로 무효화된 시도) 늦게 만들어진 인스턴스를 즉시 닫고 CANCELLED로 실패한다.
   */
  async init(isStale: () => boolean = () => false): Promise<Delegate> {
    this.close();
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.tracker.wasmPath);
    let created: HandLandmarker;
    let delegate: Delegate = "GPU";
    try {
      created = await this.create(fileset, "GPU");
    } catch (e) {
      console.warn("GPU delegate 실패, CPU로 재시도", e);
      created = await this.create(fileset, "CPU");
      delegate = "CPU";
    }
    if (isStale()) {
      created.close();
      throw new Error("CANCELLED: 모델 로드가 취소되었습니다(타임아웃 또는 재시도)");
    }
    this.landmarker = created;
    this.delegate = delegate;
    this.lastTs = -1;
    return delegate;
  }

  private create(fileset: Fileset, delegate: Delegate): Promise<HandLandmarker> {
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: CONFIG.tracker.modelPath, delegate },
      runningMode: "VIDEO",
      numHands: CONFIG.tracker.numHands,
      minHandDetectionConfidence: CONFIG.tracker.minHandDetectionConfidence,
      minHandPresenceConfidence: CONFIG.tracker.minHandPresenceConfidence,
      minTrackingConfidence: CONFIG.tracker.minTrackingConfidence,
    });
  }

  /** 현재 비디오 프레임에서 오른손 고르기. 타임스탬프는 단조 증가해야 한다. */
  detect(video: HTMLVideoElement, nowMs: number, opts: { swap: boolean; prevPalm: Point | null }): HandSelection {
    if (!this.landmarker) return EMPTY_SELECTION;
    const ts = Math.max(Math.floor(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return selectRightHand(result, { swap: opts.swap, minScore: CONFIG.tracker.minHandednessScore, prevPalm: opts.prevPalm });
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
