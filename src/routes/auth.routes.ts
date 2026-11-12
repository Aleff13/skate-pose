import { Router } from "express";
import { authController as c } from "../controllers/auth.controller.js";
import { wrap } from "../utils/async-handler.js";

export const authRouter = Router();
authRouter.post("/signup", wrap(c.signUp));
authRouter.post("/confirm", wrap(c.confirm));
authRouter.post("/login", wrap(c.login));
authRouter.post("/refresh", wrap(c.refresh));
