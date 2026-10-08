/** 소리 출력 공통 인터페이스. 1차 ToneOutput, 2차 midiOut(Web MIDI → GarageBand/Logic). */
export interface ChordOutput {
  /** 사용자 클릭 핸들러 안에서 동기적으로 호출을 시작해야 한다(브라우저 오디오 정책). */
  start(): Promise<void>;
  /** 들고 있던 음을 놓고 새 화음을 바로 친다. 빈 배열이면 놓기만 한다. */
  play(midi: readonly number[]): void;
  /**
   * level: 0~1 음량(이미 곡선을 거친 값). control: 0~1 선형 제어값(펼침% 또는 높이%).
   * MIDI 출력은 control이 있으면 그것에 비례하는 CC를 보낸다.
   */
  setLevel(level: number, control?: number): void;
  /**
   * 줄 하나를 튕긴다(스트럼 모드). voice: 줄 번호(0~5), delayMs: 지금부터의 지연(≥0, 프레임 안 시차 보존용),
   * velocity: 0~1, holdMs: null이면 다음 타격·stop()까지 울림, 숫자면 그 뒤 끊는다(뮤트). muted는 음색용.
   * 구현은 줄별 마지막 예약 시각을 기억해, stop()·패닉의 종료 메시지를 그 뒤에 보내야 한다(예약된 Note On이 종료 뒤에 켜지면 음이 걸린다).
   */
  pluck(voice: number, midi: number, velocity: number, delayMs: number, holdMs: number | null, muted: boolean): void;
  /** 들고 있던 음과 울리는 줄을 모두 놓는다(예약된 타격보다 뒤에). */
  stop(): void;
  /** 출력 장치가 실제로 소리를 낼 수 있는 상태인가 */
  isRunning(): boolean;
  /** 일시중지된 출력을 다시 켠다(사용자 제스처 안에서 호출) */
  resume(): Promise<void>;
  /** 실행 가능 상태가 바뀔 때 알림 */
  onStateChange(cb: (running: boolean) => void): void;
}
