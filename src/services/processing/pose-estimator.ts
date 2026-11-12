export interface Keypoint {
  name: string; // ex.: "left_knee"
  x: number; // pixels
  y: number;
  score: number; // 0..1
}

export interface PoseFrame {
  frameIndex: number; // 0-based, mesma ordem dos arquivos frame_%06d.jpg
  /** Uma entrada por pessoa detectada no frame. */
  poses: Keypoint[][];
}

/**
 * Contrato do estimador de pose. Trocar a implementação (outro modelo, worker
 * externo etc.) não exige mexer no resto do pipeline.
 */
export interface PoseEstimator {
  /** Recebe o diretório de frames (frame_000001.jpg ...) e devolve keypoints por frame. */
  estimate(framesDir: string): Promise<PoseFrame[]>;
}
