import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

const cssPath = resolve(webRoot, "src", "cast", "receiver.css");
const jsPath = resolve(webRoot, "src", "cast", "receiver.ts");
const htmlPath = resolve(webRoot, "public", "cast", "receiver.html");
const outputPath = resolve(webRoot, "public", "cast", "receiver.html");

function buildReceiver() {
  const css = readFileSync(cssPath, "utf-8");
  const js = readFileSync(jsPath, "utf-8");

  let html = readFileSync(htmlPath, "utf-8");

  // Strip the TypeScript type annotations roughly for the receiver
  // (the receiver runs as plain JS on the Chromecast, not compiled)
  let receiverJs = js;

  // Remove TypeScript type annotations (rough pass)
  receiverJs = receiverJs.replace(/: (string|number|boolean|null|undefined|unknown|Record<string,[^>]*>|Array<[^>]*>|DetectedKind|DriftItem|ReturnType<typeof [^>]+>)/g, "");
  receiverJs = receiverJs.replace(/: DriftItem\[\]/g, "");
  receiverJs = receiverJs.replace(/as ([A-Z][a-zA-Z]*)/g, "");
  receiverJs = receiverJs.replace(/<[^>]+>/g, "");

  // Inject CSS into the style tag
  html = html.replace(
    /<style>\s*\/\* Receiver CSS will be injected by build script \*\/\s*<\/style>/,
    `<style>\n${css}\n  </style>`
  );

  // Inject JS into the script tag
  html = html.replace(
    /<script>\s*\/\* Receiver JS will be injected by build script \*\/\s*<\/script>/,
    `<script>\n${receiverJs}\n  </script>`
  );

  writeFileSync(outputPath, html, "utf-8");
  console.log(`Built receiver to ${outputPath}`);
}

buildReceiver();