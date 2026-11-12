import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureInfra } from "./infra/bootstrap.js";
import { storageService } from "./services/storage.service.js";

// Fora de produção cria o que faltar (o emulador perde tudo ao reiniciar).
if (env.NODE_ENV !== "production") await storageService.ensureBucket();
await ensureInfra({ auth: true });

app.listen(env.PORT, () => console.log(`API ouvindo em http://localhost:${env.PORT}`));
