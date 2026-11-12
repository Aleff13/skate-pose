import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../config/aws.js";
import { env } from "../config/env.js";
import type { NewVideo, Video, VideoStatus } from "../types/video.js";

const TableName = env.DDB_TABLE;

const toVideo = (i: Record<string, any>): Video => ({
  id: i.id,
  ownerId: i.ownerId,
  originalName: i.originalName,
  mimeType: i.mimeType,
  sizeBytes: i.sizeBytes,
  rawKey: i.rawKey,
  processedKey: i.processedKey ?? null,
  status: i.status,
  errorMessage: i.errorMessage ?? null,
  durationSec: i.durationSec ?? null,
  width: i.width ?? null,
  height: i.height ?? null,
  fps: i.fps ?? null,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});

/**
 * Atualiza só os campos informados (e updatedAt). Falha se o vídeo não existir.
 * Com `onlyFrom`, só atualiza se o status atual estiver na lista e devolve false caso contrário
 * (transição atômica: evita enfileirar o mesmo vídeo duas vezes).
 */
async function update(id: string, fields: Record<string, unknown>, onlyFrom?: VideoStatus[]): Promise<boolean> {
  const all = { ...fields, updatedAt: new Date().toISOString() };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = Object.entries(all).map(([k, v], n) => {
    names[`#f${n}`] = k; // "status" é palavra reservada no DynamoDB
    values[`:v${n}`] = v;
    return `#f${n} = :v${n}`;
  });
  let condition = "attribute_exists(id)";
  if (onlyFrom) {
    names["#cs"] = "status";
    condition += ` AND #cs IN (${onlyFrom.map((_, n) => `:c${n}`).join(", ")})`;
    onlyFrom.forEach((st, n) => (values[`:c${n}`] = st));
  }
  try {
    await ddb.send(
      new UpdateCommand({
        TableName,
        Key: { id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: condition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (err) {
    if (onlyFrom && err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

export const videoRepository = {
  async create(v: NewVideo): Promise<Video> {
    const now = new Date().toISOString();
    const item = { ...v, status: "pending_upload" as VideoStatus, createdAt: now, updatedAt: now };
    await ddb.send(new PutCommand({ TableName, Item: item, ConditionExpression: "attribute_not_exists(id)" }));
    return toVideo(item);
  },

  async findById(id: string): Promise<Video | null> {
    const { Item } = await ddb.send(new GetCommand({ TableName, Key: { id } }));
    return Item ? toVideo(Item) : null;
  },

  /** Vídeos do dono, mais recentes primeiro. `cursor` é opaco (base64). */
  async listByOwner(ownerId: string, limit: number, cursor?: string) {
    const startKey = cursor ? JSON.parse(Buffer.from(cursor, "base64url").toString()) : undefined;
    const r = await ddb.send(
      new QueryCommand({
        TableName,
        IndexName: "byOwner",
        KeyConditionExpression: "ownerId = :o",
        ExpressionAttributeValues: { ":o": ownerId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: startKey,
      }),
    );
    return {
      items: (r.Items ?? []).map(toVideo),
      nextCursor: r.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(r.LastEvaluatedKey)).toString("base64url")
        : null,
    };
  },

  async setStatus(id: string, status: VideoStatus, errorMessage: string | null = null) {
    await update(id, { status, errorMessage });
  },

  async setProbe(id: string, p: { durationSec: number; width: number; height: number; fps: number }) {
    await update(id, p);
  },

  async setProcessed(id: string, processedKey: string) {
    await update(id, { processedKey, status: "processed", errorMessage: null });
  },

  /** pending_upload -> uploaded, gravando o tamanho real visto no S3. */
  markUploaded: (id: string, sizeBytes: number) => update(id, { status: "uploaded", sizeBytes }, ["pending_upload"]),

  /** uploaded|failed -> queued. false se o status atual não permitir. */
  markQueued: (id: string) => update(id, { status: "queued", errorMessage: null }, ["uploaded", "failed"]),
};
