import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { env } from "../config/env.js";
import { ddbClient, idp, sqs } from "../config/aws.js";
import { resources } from "./resources.js";

const log = (msg: string) => console.log(`[infra] ${msg}`);

async function ensureTable() {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: env.DDB_TABLE }));
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
  try {
    await ddbClient.send(
      new CreateTableCommand({
        TableName: env.DDB_TABLE,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "ownerId", AttributeType: "S" },
          { AttributeName: "createdAt", AttributeType: "S" },
        ],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byOwner",
            KeySchema: [
              { AttributeName: "ownerId", KeyType: "HASH" },
              { AttributeName: "createdAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
    log(`tabela '${env.DDB_TABLE}' criada`);
  } catch (err) {
    // API e worker sobem juntos: o outro pode ter criado entre o Describe e o Create.
    if ((err as { name?: string }).name !== "ResourceInUseException") throw err;
  }
  await waitUntilTableExists({ client: ddbClient, maxWaitTime: 30 }, { TableName: env.DDB_TABLE });
}

async function queueUrlByName(name: string) {
  try {
    return (await sqs.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl;
  } catch (err) {
    if ((err as { name?: string }).name === "QueueDoesNotExist" || (err as { name?: string }).name === "AWS.SimpleQueueService.NonExistentQueue") return undefined;
    throw err;
  }
}

async function ensureQueues() {
  let dlqUrl = await queueUrlByName(env.SQS_DLQ_NAME);
  if (!dlqUrl) {
    dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: env.SQS_DLQ_NAME }))).QueueUrl!;
    log(`fila '${env.SQS_DLQ_NAME}' criada`);
  }
  const dlqArn = (
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ["QueueArn"] }))
  ).Attributes!.QueueArn!;

  let queueUrl = await queueUrlByName(env.SQS_QUEUE_NAME);
  if (!queueUrl) {
    queueUrl = (
      await sqs.send(
        new CreateQueueCommand({
          QueueName: env.SQS_QUEUE_NAME,
          Attributes: {
            VisibilityTimeout: "300", // o worker estende enquanto processa
            ReceiveMessageWaitTimeSeconds: "20", // long polling
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: dlqArn,
              maxReceiveCount: String(env.SQS_MAX_RECEIVE_COUNT),
            }),
          },
        }),
      )
    ).QueueUrl!;
    log(`fila '${env.SQS_QUEUE_NAME}' criada`);
  }
  resources.queueUrl = queueUrl;
  resources.dlqUrl = dlqUrl;
}

/** Emissor (iss) dos tokens: o endpoint do emulador, ou o Cognito real. */
function issuerFor(poolId: string) {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  if (endpoint) return `${endpoint.replace(/\/$/, "")}/${poolId}`;
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
}

async function ensureUserPool() {
  let poolId = env.COGNITO_USER_POOL_ID;
  let clientId = env.COGNITO_CLIENT_ID;

  if (!poolId || !clientId) {
    if (env.NODE_ENV === "production") {
      throw new Error("Em produção defina COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID");
    }
    const pools = await idp.send(new ListUserPoolsCommand({ MaxResults: 60 }));
    poolId = pools.UserPools?.find((p) => p.Name === env.COGNITO_POOL_NAME)?.Id;
    if (!poolId) {
      poolId = (
        await idp.send(
          new CreateUserPoolCommand({
            PoolName: env.COGNITO_POOL_NAME,
            UsernameAttributes: ["email"],
            AutoVerifiedAttributes: ["email"],
            Policies: { PasswordPolicy: { MinimumLength: 8 } },
          }),
        )
      ).UserPool!.Id!;
      log(`user pool '${env.COGNITO_POOL_NAME}' criado (${poolId})`);
    }
    const clients = await idp.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 }));
    clientId = clients.UserPoolClients?.find((c) => c.ClientName === env.COGNITO_POOL_NAME)?.ClientId;
    if (!clientId) {
      clientId = (
        await idp.send(
          new CreateUserPoolClientCommand({
            UserPoolId: poolId,
            ClientName: env.COGNITO_POOL_NAME,
            ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
          }),
        )
      ).UserPoolClient!.ClientId!;
      log(`app client criado (${clientId})`);
    }
  }
  resources.cognito = { poolId, clientId, issuer: issuerFor(poolId) };
}

/** Cria o que faltar (idempotente). `auth` é só para a API; o worker não precisa do Cognito. */
export async function ensureInfra(opts: { auth: boolean }) {
  await ensureTable();
  await ensureQueues();
  if (opts.auth) await ensureUserPool();
}
