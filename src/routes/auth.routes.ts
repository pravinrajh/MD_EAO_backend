import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authRateLimiter, loginRateLimiter } from "../middlewares/rateLimit.middleware";
import { validate } from "../middlewares/validation.middleware";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "../validations/auth.validation";

const router = Router();

router.post("/register", authRateLimiter, validate(registerSchema), authController.register);
router.post("/login", loginRateLimiter, validate(loginSchema), authController.login);
router.post("/refresh", authRateLimiter, validate(refreshSchema), authController.refresh);
router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, validate(logoutSchema), authController.logout);

export default router;
