#!/usr/bin/env node
/**
 * Deploy Firestore indexes from firestore.indexes.json.
 * Requires: firebase login once (service account cannot create indexes).
 *
 *   npx firebase login
 *   node scripts/deploy-firestore-indexes.mjs
 */
import { spawnSync } from "child_process"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const project = "smas-57b80"

const result = spawnSync(
  "npx",
  ["firebase-tools", "deploy", "--only", "firestore:indexes", "--project", project, "--non-interactive"],
  { cwd: root, stdio: "inherit", shell: true },
)

if (result.status !== 0) {
  console.error("\nIf deploy failed, create the chat index manually in Firebase Console:")
  console.error(
    "https://console.firebase.google.com/project/smas-57b80/firestore/indexes",
  )
  console.error("\nComposite index: streamChatMessages")
  console.error("  streamSessionId  Ascending")
  console.error("  createdAt        Ascending")
  process.exit(result.status ?? 1)
}

console.log("\nIndexes submitted. Wait until status is Enabled in Firebase Console.")
