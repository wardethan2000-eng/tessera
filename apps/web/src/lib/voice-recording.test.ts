import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecordedAudioFile,
  getAudioFileExtension,
  getPreferredAudioRecordingMimeType,
  getVoiceRecordingSupportState,
  hasPendingVoiceTranscriptions,
  normalizeMimeType,
} from "./voice-recording";

describe("voice recording helpers", () => {
  it("picks the first supported recording mime type", () => {
    const mimeType = getPreferredAudioRecordingMimeType({
      isTypeSupported: (candidate) =>
        candidate === "audio/mp4" || candidate === "audio/ogg;codecs=opus",
    });

    assert.equal(mimeType, "audio/mp4");
  });

  it("normalizes mime types and file extensions", () => {
    assert.equal(normalizeMimeType("audio/webm;codecs=opus"), "audio/webm");
    assert.equal(getAudioFileExtension("audio/mp4"), "m4a");
    assert.equal(getAudioFileExtension("audio/ogg"), "ogg");
  });

  it("creates a recorded file with a stable extension", () => {
    const file = createRecordedAudioFile(new Blob(["hello"], { type: "audio/mp4" }), {
      baseName: "Grandma Interview",
      timestamp: new Date("2026-04-20T12:00:00.000Z"),
    });

    assert.equal(file.type, "audio/mp4");
    assert.match(file.name, /^Grandma-Interview-2026-04-20T12-00-00-000Z\.m4a$/);
  });

  it("detects pending voice transcriptions", () => {
    assert.equal(
      hasPendingVoiceTranscriptions([
        { id: "1", kind: "story", transcriptStatus: "none" },
        { id: "2", kind: "voice", transcriptStatus: "queued" },
      ]),
      true,
    );

    assert.equal(
      hasPendingVoiceTranscriptions([
        { id: "1", kind: "voice", transcriptStatus: "completed" },
      ]),
      false,
    );
  });

  it("distinguishes secure-context failures from unsupported browsers", () => {
    assert.deepEqual(
      getVoiceRecordingSupportState({
        hasWindow: true,
        hasNavigator: true,
        hasMediaRecorder: true,
        hasGetUserMedia: false,
        isSecureContext: false,
      }),
      {
        supported: false,
        reason: "secure_context_required",
      },
    );

    assert.deepEqual(
      getVoiceRecordingSupportState({
        hasWindow: true,
        hasNavigator: true,
        hasMediaRecorder: false,
        hasGetUserMedia: false,
        isSecureContext: true,
      }),
      {
        supported: false,
        reason: "unsupported_browser",
      },
    );
  });
});
