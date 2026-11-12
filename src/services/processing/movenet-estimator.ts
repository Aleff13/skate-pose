import "../../utils/node-compat.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as tf from "@tensorflow/tfjs-node";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { env } from "../../config/env.js";
import type { PoseEstimator, PoseFrame } from "./pose-estimator.js";

const MODELS = {
  // Melhor precisão, 1 pessoa, usa rastreamento temporal entre frames (bom p/ skate).
  thunder: { model: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER },
  lightning: { model: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
  // Até 6 pessoas por frame.
  multipose: { model: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING },
} as const;

export class MoveNetPoseEstimator implements PoseEstimator {
  private detector: Promise<poseDetection.PoseDetector> | null = null;

  private getDetector() {
    this.detector ??= poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: MODELS[env.POSE_MODEL].model,
      enableSmoothing: true,
    });
    return this.detector;
  }

  async estimate(framesDir: string): Promise<PoseFrame[]> {
    const detector = await this.getDetector();
    detector.reset(); // limpa o rastreamento/suavização do vídeo anterior

    const files = (await readdir(framesDir)).filter((f) => f.endsWith(".jpg")).sort();
    const out: PoseFrame[] = [];

    for (const [i, file] of files.entries()) {
      const image = tf.node.decodeImage(await readFile(path.join(framesDir, file)), 3) as tf.Tensor3D;
      try {
        const poses = await detector.estimatePoses(image, { maxPoses: env.POSE_MODEL === "multipose" ? 6 : 1 });
        out.push({
          frameIndex: i,
          poses: poses.map((p) =>
            p.keypoints.map((k) => ({ name: k.name ?? "", x: k.x, y: k.y, score: k.score ?? 0 })),
          ),
        });
      } finally {
        image.dispose();
      }
      if ((i + 1) % 50 === 0 || i + 1 === files.length) {
        console.log(`[pose] ${i + 1}/${files.length} frames`);
      }
    }
    return out;
  }
}
