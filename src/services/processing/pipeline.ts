import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { videoRepository } from "../../repositories/video.repository.js";
import { storageService } from "../storage.service.js";
import { encodeVideo, extractFrames, probe } from "./ffmpeg.js";
import { MoveNetPoseEstimator } from "./movenet-estimator.js";
import type { PoseEstimator } from "./pose-estimator.js";
import { renderSkeletonFrames } from "./skeleton-renderer.js";
import type { Video } from "../../types/video.js";

const estimator: PoseEstimator = new MoveNetPoseEstimator();

/**
 * raw (S3) -> download -> probe -> frames -> pose -> render esqueleto -> mp4 -> upload processado (S3)
 */
export async function processVideo(video: Video): Promise<void> {
  const workDir = path.resolve(env.WORK_DIR, video.id);
  const framesDir = path.join(workDir, "frames");
  const skeletonDir = path.join(workDir, "skeleton");
  const rawPath = path.join(workDir, "raw");
  const outPath = path.join(workDir, "processed.mp4");
  await mkdir(framesDir, { recursive: true });

  try {
    await videoRepository.setStatus(video.id, "processing");
    await storageService.downloadToFile(video.rawKey, rawPath);

    const info = await probe(rawPath);
    await videoRepository.setProbe(video.id, info);
    await extractFrames(rawPath, framesDir);

    const poses = await estimator.estimate(framesDir);
    await renderSkeletonFrames(framesDir, poses, skeletonDir);
    await encodeVideo(skeletonDir, info.fps, rawPath, outPath);

    const processedKey = `processed/${video.id}.mp4`;
    await storageService.uploadFile(processedKey, outPath, "video/mp4");
    await videoRepository.setProcessed(video.id, processedKey);
  } catch (err) {
    await videoRepository.setStatus(video.id, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
