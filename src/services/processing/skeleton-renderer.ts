import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { env } from "../../config/env.js";
import type { Keypoint, PoseFrame } from "./pose-estimator.js";

const PAIRS = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);

const color = (name: string) =>
  name.startsWith("left_") ? "#00e5ff" : name.startsWith("right_") ? "#ff5252" : "#ffd600";

/** Desenha o esqueleto de cada frame e grava em outDir com o mesmo nome do arquivo. */
export async function renderSkeletonFrames(framesDir: string, poses: PoseFrame[], outDir: string) {
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(framesDir)).filter((f) => f.endsWith(".jpg")).sort();
  const min = env.POSE_MIN_SCORE;

  for (const [i, file] of files.entries()) {
    const img = await loadImage(await readFile(path.join(framesDir, file)));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const lw = Math.max(2, Math.round(img.height / 250));
    ctx.lineWidth = lw;
    ctx.lineCap = "round";

    for (const kps of poses[i]?.poses ?? []) {
      const draw = (a: Keypoint, b: Keypoint) => {
        if (a.score < min || b.score < min) return;
        ctx.strokeStyle = color(b.name);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      for (const pair of PAIRS) {
        const [a, b] = pair as [number, number];
        const ka = kps[a];
        const kb = kps[b];
        if (ka && kb) draw(ka, kb);
      }

      for (const k of kps) {
        if (k.score < min) continue;
        ctx.fillStyle = color(k.name);
        ctx.beginPath();
        ctx.arc(k.x, k.y, lw * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    await writeFile(path.join(outDir, file), canvas.toBuffer("image/jpeg", 90));
  }
}
