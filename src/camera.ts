/** 보안 컨텍스트·API 지원 여부. 실패하면 한국어 메시지를 가진 Error를 던진다(접두어 UNSUPPORTED). */
export function assertCameraSupported(): void {
  if (!window.isSecureContext) {
    throw new Error("UNSUPPORTED: 이 주소에서는 카메라를 쓸 수 없습니다.\nChrome에서 http://127.0.0.1:5173 또는 http://localhost:5173 로 여세요");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("UNSUPPORTED: 이 브라우저는 카메라 API를 지원하지 않습니다. Chrome을 사용하세요");
  }
}

/**
 * 전면 카메라를 열어 video에 연결하고 재생까지 기다린다. 거울 표시는 CSS(scaleX(-1))가 맡는다.
 * 이미 열린 스트림이 있으면 먼저 닫는다(재시도 누수 방지). 트랙이 끝나면(뽑힘·다른 앱 점유) onEnded를 1회 부른다.
 * isStale()이 true를 돌려주면(타임아웃·재시도로 이 시도가 무효화됨) 받은 스트림을 즉시 닫고 CANCELLED로 실패한다 —
 * 60초 타임아웃 뒤 사용자가 뒤늦게 '허용'을 눌러도 오류 화면 뒤에서 카메라가 켜지지 않게 하기 위함.
 */
export async function openCamera(video: HTMLVideoElement, onEnded: () => void, isStale: () => boolean = () => false): Promise<void> {
  stopCamera(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: "user",
    },
    audio: false,
  });
  const discard = (): never => {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("CANCELLED: 카메라 열기가 취소되었습니다(타임아웃 또는 재시도)");
  };
  if (isStale()) discard();
  const track = stream.getVideoTracks()[0];
  track?.addEventListener("ended", onEnded, { once: true });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  if (isStale()) {
    if (video.srcObject === stream) video.srcObject = null;
    discard();
  }
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
