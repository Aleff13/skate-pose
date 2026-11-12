import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  S3_BUCKET: z.string().min(1).default("skate-videos"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  DDB_TABLE: z.string().min(1).default("videos"),

  SQS_QUEUE_NAME: z.string().min(1).default("video-processing"),
  SQS_DLQ_NAME: z.string().min(1).default("video-processing-dlq"),
  SQS_MAX_RECEIVE_COUNT: z.coerce.number().int().min(1).default(3),

  // Em produção informe os IDs. Fora dela, a API acha/cria o pool pelo nome.
  COGNITO_POOL_NAME: z.string().min(1).default("skate-pose"),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),

  MAX_UPLOAD_MB: z.coerce.number().default(500),
  WORK_DIR: z.string().default("./tmp"),
  POSE_MODEL: z.enum(["thunder", "lightning", "multipose"]).default("thunder"),
  POSE_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.3),
});

export const env = schema.parse(process.env);
