/** 소리 출력 공통 인터페이스. 1차 ToneOutput, 2차 midiOut(Web MIDI → GarageBand/Logic). */
export interface ChordOutput {
  /** 사용자 클릭 핸들러 안에서 동기적으로 호출을 시작해야 한다(브라우저 오디오 정책). */
  start(): Promise<void>;
  /** 들고 있던 음을 놓고 새 화음을 바로 친다. 빈 배열이면 놓기만 한다. */
  play(midi: readonly number[]): void;
  /** 0~1 음량. */
  setLevel(level: number): void;
  /** 들고 있던 음을 놓는다. */
  stop(): void;
  /** 출력 장치가 실제로 소리를 낼 수 있는 상태인가 */
  isRunning(): boolean;
  /** 일시중지된 출력을 다시 켠다(사용자 제스처 안에서 호출) */
  resume(): Promise<void>;
  /** 실행 가능 상태가 바뀔 때 알림 */
  onStateChange(cb: (running: boolean) => void): void;
}
