import { Router } from "express";
import { videosController as c } from "../controllers/videos.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { wrap } from "../utils/async-handler.js";

export const videosRouter = Router();
videosRouter.use(requireAuth);
videosRouter.post("/", wrap(c.create)); //              1) registra + URL pré-assinada de PUT
videosRouter.post("/:id/complete", wrap(c.complete)); // 3) confirma o arquivo no S3
videosRouter.post("/:id/process", wrap(c.process)); //   botão "Processar" -> SQS
videosRouter.get("/", wrap(c.list));
videosRouter.get("/:id", wrap(c.get));
videosRouter.get("/:id/urls", wrap(c.urls));
