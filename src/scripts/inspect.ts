/**
 * "Painel" de terminal: mostra o que existe no emulador (o emulador não tem interface gráfica).
 * Uso: npm run inspect
 */
import { ListUsersCommand, ListUserPoolsCommand } from "@aws-sdk/client-cognito-identity-provider";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetQueueAttributesCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { ddb, idp, sqs } from "../config/aws.js";
import { env } from "../config/env.js";

const section = (t: string) => console.log(`\n=== ${t}`);

section(`DynamoDB · ${env.DDB_TABLE}`);
try {
  const { Items = [] } = await ddb.send(new ScanCommand({ TableName: env.DDB_TABLE }));
  console.table(
    Items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((i) => ({
      id: String(i.id).slice(0, 8),
      owner: String(i.ownerId).slice(0, 8),
      arquivo: i.originalName,
      status: i.status,
      "dur(s)": i.durationSec?.toFixed?.(1),
      erro: i.errorMessage ? String(i.errorMessage).slice(0, 40) : "",
      criado: i.createdAt,
    })),
  );
} catch (e) {
  console.log("erro:", (e as Error).message);
}

section("SQS");
for (const name of [env.SQS_QUEUE_NAME, env.SQS_DLQ_NAME]) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
    const a = (
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["All"] }))
    ).Attributes!;
    console.log(
      `${name.padEnd(24)} na fila: ${a.ApproximateNumberOfMessages}  em processamento: ${a.ApproximateNumberOfMessagesNotVisible}`,
    );
  } catch (e) {
    console.log(`${name}: ${(e as Error).message}`);
  }
}

section("Cognito");
try {
  const pools = (await idp.send(new ListUserPoolsCommand({ MaxResults: 60 }))).UserPools ?? [];
  for (const p of pools) {
    const users = (await idp.send(new ListUsersCommand({ UserPoolId: p.Id }))).Users ?? [];
    console.log(`${p.Name} (${p.Id}) · ${users.length} usuário(s)`);
    for (const u of users) {
      const email = u.Attributes?.find((x) => x.Name === "email")?.Value;
      console.log(`   - ${email}  [${u.UserStatus}]`);
    }
  }
} catch (e) {
  console.log("erro:", (e as Error).message);
}
