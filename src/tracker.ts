import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";
import { selectRightHand, type HandSelection } from "./hands";
import type { Point } from "./mapping";

export type Delegate = "GPU" | "CPU";
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
const EMPTY: HandSelection = { chosen: null, otherPalms: [], labels: [] };

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTs = -1;
  delegate: Delegate = "GPU";

  /** wasm·모델 로드. GPU delegate 실패 시 CPU로 한 번 더 시도. 둘 다 실패하면 두 번째 예외를 던진다. */
  async init(): Promise<Delegate> {
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.tracker.wasmPath);
    try {
      this.landmarker = await this.create(fileset, "GPU");
      this.delegate = "GPU";
    } catch (e) {
      console.warn("GPU delegate 실패, CPU로 재시도", e);
      this.landmarker = await this.create(fileset, "CPU");
      this.delegate = "CPU";
    }
    return this.delegate;
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
    if (!this.landmarker) return EMPTY;
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
