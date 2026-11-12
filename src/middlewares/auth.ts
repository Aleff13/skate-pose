import type { RequestHandler } from "express";
import { verifyAccessToken } from "../services/jwt.service.js";
import { HttpError } from "./error-handler.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Token ausente (Authorization: Bearer <accessToken>)");
    req.user = await verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, "Token inválido ou expirado"));
  }
};
