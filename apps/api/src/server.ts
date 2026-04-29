import { buildApp } from "./app.js";
import { startMetadataExtractionWorker } from "./lib/metadata-extraction.js";
import { ensureBucket } from "./lib/storage.js";
import { startTranscriptionWorker } from "./lib/transcription.js";
import { startPromptCampaignScheduler } from "./routes/prompt-campaigns.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "0.0.0.0";

await ensureBucket();

const app = buildApp();
const stopTranscriptionWorker =
  process.env.WHISPER_API_URL?.trim()
    ? startTranscriptionWorker(app.log)
    : null;
if (!stopTranscriptionWorker) {
  app.log.info("Transcription worker disabled: WHISPER_API_URL is not configured");
}

const stopMetadataWorker =
  process.env.DISABLE_METADATA_WORKER === "1"
    ? null
    : startMetadataExtractionWorker(app.log);

const stopPromptCampaignScheduler =
  process.env.DISABLE_PROMPT_CAMPAIGN_SCHEDULER === "1"
    ? null
    : startPromptCampaignScheduler(app.log);

app.addHook("onClose", async () => {
  stopTranscriptionWorker?.();
  stopMetadataWorker?.();
  stopPromptCampaignScheduler?.();
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
