import { randomUUID } from "node:crypto";
import path from "node:path";
import { env } from "../config/env.js";
import { HttpError } from "../middlewares/error-handler.js";
import { videoRepository } from "../repositories/video.repository.js";
import { queueService } from "./queue.service.js";
import { storageService } from "./storage.service.js";

const UPLOAD_URL_TTL_SEC = 900;
const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;

export const videoService = {
  /** Passo 1: registra o vídeo e devolve a URL pré-assinada para o cliente enviar direto ao S3. */
  async createUpload(ownerId: string, input: { fileName: string; contentType: string; sizeBytes: number }) {
    if (!input.contentType.startsWith("video/")) throw new HttpError(415, "Apenas arquivos de vídeo são aceitos");
    if (input.sizeBytes > maxBytes) throw new HttpError(413, `Arquivo maior que ${env.MAX_UPLOAD_MB} MB`);

    const id = randomUUID();
    // A extensão vira parte da chave no S3: aceita só ".abc123" curto; qualquer outra coisa é descartada.
    const ext = path.extname(input.fileName).toLowerCase();
    const rawKey = `raw/${ownerId}/${id}${/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""}`;
    const video = await videoRepository.create({
      id,
      ownerId,
      originalName: input.fileName,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      rawKey,
    });
    return {
      video,
      upload: {
        method: "PUT" as const,
        url: await storageService.presignedPutUrl(rawKey, input.contentType, UPLOAD_URL_TTL_SEC),
        headers: { "Content-Type": input.contentType },
        expiresInSec: UPLOAD_URL_TTL_SEC,
      },
    };
  },

  /** Passo 3: confere no S3 que o arquivo chegou (a URL pré-assinada não limita tamanho) e libera o vídeo. */
  async completeUpload(ownerId: string, id: string) {
    const video = await this.get(ownerId, id);
    if (!video) throw new HttpError(404, "Vídeo não encontrado");
    if (video.status !== "pending_upload") return video; // idempotente

    const head = await storageService.head(video.rawKey);
    if (!head) throw new HttpError(409, "O arquivo ainda não está no S3");
    if (head.size > maxBytes) {
      await storageService.remove(video.rawKey);
      await videoRepository.setStatus(id, "failed", `Arquivo maior que ${env.MAX_UPLOAD_MB} MB`);
      throw new HttpError(413, `Arquivo maior que ${env.MAX_UPLOAD_MB} MB`);
    }
    await videoRepository.markUploaded(id, head.size);
    return (await videoRepository.findById(id))!;
  },

  /** Botão "Processar": uploaded|failed -> queued e publica na fila SQS. */
  async requestProcessing(ownerId: string, id: string) {
    const video = await this.get(ownerId, id);
    if (!video) throw new HttpError(404, "Vídeo não encontrado");
    if (!(await videoRepository.markQueued(id))) {
      throw new HttpError(409, `Não é possível processar um vídeo com status '${video.status}'`);
    }
    try {
      await queueService.enqueueVideo(id);
    } catch (err) {
      await videoRepository.setStatus(id, "failed", "Falha ao enfileirar o processamento");
      throw err;
    }
    return (await videoRepository.findById(id))!;
  },

  /** Só devolve o vídeo se ele for do usuário (senão, como se não existisse). */
  async get(ownerId: string, id: string) {
    const v = await videoRepository.findById(id);
    return v && v.ownerId === ownerId ? v : null;
  },

  async list(ownerId: string, limit: number, cursor?: string) {
    try {
      return await videoRepository.listByOwner(ownerId, limit, cursor);
    } catch (err) {
      if (err instanceof SyntaxError) throw new HttpError(400, "Cursor inválido"); // base64/JSON adulterado
      throw err;
    }
  },

  async downloadUrls(ownerId: string, id: string) {
    const v = await this.get(ownerId, id);
    if (!v) return null;
    return {
      raw: v.status === "pending_upload" ? null : await storageService.presignedGetUrl(v.rawKey),
      processed: v.processedKey ? await storageService.presignedGetUrl(v.processedKey) : null,
    };
  },
};
