import { Agent } from "node:https";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { trustedCa } from "../utils/ca.js";

// Endpoint e credenciais vêm das variáveis AWS_* (emulador ou AWS real).
// O SDK JS (Node) ignora AWS_CA_BUNDLE, então aplicamos o certificado aqui:
// assim não depende de NODE_EXTRA_CA_CERTS estar definido no shell.
export const awsClientConfig = trustedCa
  ? { requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ ca: trustedCa }) }) }
  : {};

export const ddbClient = new DynamoDBClient(awsClientConfig);
export const ddb = DynamoDBDocumentClient.from(ddbClient, { marshallOptions: { removeUndefinedValues: true } });

// O emulador devolve QueueUrl com o host real da AWS (sqs.<região>.amazonaws.com).
// Sem desligar isto o SDK trocaria o endpoint por esse host e sairia do emulador.
export const sqs = new SQSClient({ ...awsClientConfig, useQueueUrlAsEndpoint: false });

export const idp = new CognitoIdentityProviderClient(awsClientConfig);
