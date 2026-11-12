import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../middlewares/error-handler.js";
import { videoService } from "../services/video.service.js";
import { toPublic } from "../types/video.js";

const idSchema = z.string().uuid();
const owner = (req: Request) => req.user!.sub; // requireAuth garante
const idParam = (req: Request) => idSchema.parse(req.params.id);

export const videosController = {
  /** Passo 1 do upload: cria o registro e devolve a URL pré-assinada. */
  async create(req: Request, res: Response) {
    const body = z
      .object({
        fileName: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
        sizeBytes: z.number().int().positive(),
      })
      .parse(req.body);
    const { video, upload } = await videoService.createUpload(owner(req), body);
    res.status(201).json({ video: toPublic(video), upload });
  },

  /** Passo 3: confirma que o arquivo chegou ao S3. */
  async complete(req: Request, res: Response) {
    res.json(toPublic(await videoService.completeUpload(owner(req), idParam(req))));
  },

  /** Botão "Processar". */
  async process(req: Request, res: Response) {
    res.status(202).json(toPublic(await videoService.requestProcessing(owner(req), idParam(req))));
  },

  async list(req: Request, res: Response) {
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().optional() })
      .parse(req.query);
    const { items, nextCursor } = await videoService.list(owner(req), q.limit, q.cursor);
    res.json({ items: items.map(toPublic), nextCursor });
  },

  async get(req: Request, res: Response) {
    const video = await videoService.get(owner(req), idParam(req));
    if (!video) throw new HttpError(404, "Vídeo não encontrado");
    res.json(toPublic(video));
  },

  async urls(req: Request, res: Response) {
    const urls = await videoService.downloadUrls(owner(req), idParam(req));
    if (!urls) throw new HttpError(404, "Vídeo não encontrado");
    res.json(urls);
  },
};
