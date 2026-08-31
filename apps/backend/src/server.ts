import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createServiceClient } from "./lib/supabase.js";
import { startReservationExpiryJob } from "./modules/fulfillment/expire-reservations.job.js";

const env = loadEnv();
const app = buildApp(env);

startReservationExpiryJob(createServiceClient(env), app.log);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
