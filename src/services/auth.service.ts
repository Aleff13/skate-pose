import {
  AdminConfirmSignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { idp } from "../config/aws.js";
import { env } from "../config/env.js";
import { resources } from "../infra/resources.js";

const tokens = (r: { AuthenticationResult?: Record<string, any> }) => {
  const a = r.AuthenticationResult;
  if (!a) throw new Error("Cognito não devolveu tokens (desafio de autenticação não suportado)");
  return {
    accessToken: a.AccessToken as string,
    idToken: a.IdToken as string,
    refreshToken: a.RefreshToken as string | undefined,
    expiresIn: a.ExpiresIn as number,
  };
};

export const authService = {
  async signUp(email: string, password: string) {
    const { poolId, clientId } = resources.cognito;
    await idp.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );
    // Dev: o emulador não envia e-mail, então confirmamos direto. Em produção vale o código por e-mail.
    if (env.NODE_ENV !== "production") {
      await idp.send(new AdminConfirmSignUpCommand({ UserPoolId: poolId, Username: email }));
      return { confirmed: true };
    }
    return { confirmed: false };
  },

  async confirm(email: string, code: string) {
    await idp.send(
      new ConfirmSignUpCommand({ ClientId: resources.cognito.clientId, Username: email, ConfirmationCode: code }),
    );
  },

  async login(email: string, password: string) {
    const r = await idp.send(
      new InitiateAuthCommand({
        ClientId: resources.cognito.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    );
    return tokens(r);
  },

  async refresh(refreshToken: string) {
    const r = await idp.send(
      new InitiateAuthCommand({
        ClientId: resources.cognito.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );
    return tokens(r);
  },
};
