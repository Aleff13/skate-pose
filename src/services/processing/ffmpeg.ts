import { run } from "../../utils/exec.js";

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration",
    "-of", "json", file,
  ]);
  const j = JSON.parse(out);
  const stream = j.streams?.[0];
  const duration = Number(j.format?.duration);
  if (!stream || !Number.isFinite(duration)) {
    throw new Error("O arquivo não é um vídeo válido (o ffprobe não encontrou uma trilha de vídeo)");
  }
  const [n, d] = String(stream.r_frame_rate).split("/").map(Number);

  // Celulares gravam em paisagem e marcam a rotação; o ffmpeg já gira os frames, então
  // a resolução "real" (a que o usuário vê) troca largura e altura.
  const rotation = Math.abs(Number(stream.side_data_list?.[0]?.rotation ?? stream.tags?.rotate ?? 0)) % 180;
  const swap = rotation === 90;
  return {
    durationSec: duration,
    width: swap ? stream.height : stream.width,
    height: swap ? stream.width : stream.height,
    fps: n! / (d || 1),
  };
}

export async function extractFrames(input: string, outDir: string) {
  await run("ffmpeg", ["-y", "-i", input, "-q:v", "2", `${outDir}/frame_%06d.jpg`]);
}

/** Monta o mp4 a partir dos frames; reaproveita o áudio do vídeo original, se houver. */
export async function encodeVideo(framesDir: string, fps: number, audioFrom: string, output: string) {
  await run("ffmpeg", [
    "-y",
    "-framerate", String(fps),
    "-i", `${framesDir}/frame_%06d.jpg`,
    "-i", audioFrom,
    "-map", "0:v", "-map", "1:a?",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac", "-shortest",
    "-movflags", "+faststart",
    output,
  ]);
}
