import { z } from "zod";
import type { Message } from "@aws-sdk/client-sqs";
import { env } from "./config/env.js";
import { ensureInfra } from "./infra/bootstrap.js";
import { videoRepository } from "./repositories/video.repository.js";
import { processVideo } from "./services/processing/pipeline.js";
import { queueService } from "./services/queue.service.js";
import { storageService } from "./services/storage.service.js";

const body = z.object({ videoId: z.string().uuid() });
const VISIBILITY_SECONDS = 300;
const HEARTBEAT_MS = 120_000;

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig}: terminando após o job atual`);
    stopping = true;
  });
}

async function handle(msg: Message) {
  const receipt = msg.ReceiptHandle!;
  const parsed = body.safeParse(JSON.parse(msg.Body ?? "null"));
  if (!parsed.success) {
    console.error("[worker] mensagem inválida, descartando:", msg.Body);
    return queueService.delete(receipt);
  }

  const video = await videoRepository.findById(parsed.data.videoId);
  // queued = pedido novo; processing/failed = redelivery de uma tentativa anterior.
  if (!video || !["queued", "processing", "failed"].includes(video.status)) {
    console.log(`[worker] ${parsed.data.videoId}: ${video ? `status '${video.status}'` : "não existe"}, descartando`);
    return queueService.delete(receipt);
  }

  const heartbeat = setInterval(() => {
    queueService.extendVisibility(receipt, VISIBILITY_SECONDS).catch((e) =>
      console.warn("[worker] não consegui estender a visibilidade:", e.message),
    );
  }, HEARTBEAT_MS);

  try {
    console.log(`[worker] processando ${video.id} (${video.originalName})`);
    await processVideo(video);
    await queueService.delete(receipt);
    console.log(`[worker] ${video.id} concluído`);
  } catch (err) {
    // Sem delete: a mensagem volta após o visibility timeout e, passando de
    // SQS_MAX_RECEIVE_COUNT tentativas, vai para a DLQ.
    console.error(`[worker] falha em ${video.id}:`, err instanceof Error ? err.message : err);
  } finally {
    clearInterval(heartbeat);
  }
}

if (env.NODE_ENV !== "production") await storageService.ensureBucket();
await ensureInfra({ auth: false });
console.log("[worker] aguardando mensagens...");

while (!stopping) {
  try {
    const msg = await queueService.receive();
    if (msg) await handle(msg);
  } catch (err) {
    console.error("[worker] erro no loop:", err instanceof Error ? err.message : err);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.log("[worker] encerrado");
process.exit(0);
