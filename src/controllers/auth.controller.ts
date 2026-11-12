import type { Request, Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });

export const authController = {
  async signUp(req: Request, res: Response) {
    const { email, password } = credentials.parse(req.body);
    res.status(201).json(await authService.signUp(email, password));
  },

  async confirm(req: Request, res: Response) {
    const { email, code } = z.object({ email: z.string().email(), code: z.string().min(1) }).parse(req.body);
    await authService.confirm(email, code);
    res.status(204).end();
  },

  async login(req: Request, res: Response) {
    const { email, password } = credentials.parse(req.body);
    res.json(await authService.login(email, password));
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    res.json(await authService.refresh(refreshToken));
  },
};
