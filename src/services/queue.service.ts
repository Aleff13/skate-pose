import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { sqs } from "../config/aws.js";
import { resources } from "../infra/resources.js";

export const queueService = {
  async enqueueVideo(videoId: string) {
    await sqs.send(
      new SendMessageCommand({ QueueUrl: resources.queueUrl, MessageBody: JSON.stringify({ videoId }) }),
    );
  },

  /** Long polling (até 20 s). Devolve null se a fila estiver vazia. */
  async receive(): Promise<Message | null> {
    const r = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: resources.queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
      }),
    );
    return r.Messages?.[0] ?? null;
  },

  async delete(receiptHandle: string) {
    await sqs.send(new DeleteMessageCommand({ QueueUrl: resources.queueUrl, ReceiptHandle: receiptHandle }));
  },

  /** Evita que a mensagem reapareça enquanto um vídeo longo ainda está sendo processado. */
  async extendVisibility(receiptHandle: string, seconds: number) {
    await sqs.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: resources.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: seconds,
      }),
    );
  },
};
