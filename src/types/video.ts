export type VideoStatus =
  | "pending_upload" // registro criado, arquivo ainda não confirmado no S3
  | "uploaded" // arquivo no S3, pronto para processar
  | "queued" // na fila SQS
  | "processing" // worker trabalhando
  | "processed"
  | "failed";

export interface Video {
  id: string;
  ownerId: string; // sub do Cognito
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rawKey: string;
  processedKey: string | null;
  status: VideoStatus;
  errorMessage: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export type NewVideo = Pick<Video, "id" | "ownerId" | "originalName" | "mimeType" | "sizeBytes" | "rawKey">;

/** O que a API expõe: sem chaves internas do S3 nem o dono. */
export type PublicVideo = Omit<Video, "ownerId" | "rawKey" | "processedKey"> & { hasProcessed: boolean };

export const toPublic = ({ ownerId: _o, rawKey: _r, processedKey, ...rest }: Video): PublicVideo => ({
  ...rest,
  hasProcessed: processedKey !== null,
});
