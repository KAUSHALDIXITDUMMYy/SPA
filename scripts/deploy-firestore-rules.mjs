/**
 * Deploy firestore.rules to a project via the Firebase Rules REST API,
 * authenticating with a service-account key (no firebase CLI / interactive login needed).
 *
 * Usage: node scripts/deploy-firestore-rules.mjs [path-to-service-account.json]
 *   defaults to scripts/dest-service-account.json
 */
import { GoogleAuth } from "google-auth-library"
import { readFileSync } from "fs"

const saPath = process.argv[2] || "scripts/dest-service-account.json"
const sa = JSON.parse(readFileSync(saPath, "utf8"))
const projectId = sa.project_id
const rulesContent = readFileSync("firestore.rules", "utf8")

const auth = new GoogleAuth({
  credentials: { client_email: sa.client_email, private_key: sa.private_key },
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
})

async function api(method, url, body) {
  const client = await auth.getClient()
  const token = (await client.getAccessToken()).token
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`
const releaseName = `projects/${projectId}/releases/cloud.firestore`

console.log(`Deploying firestore.rules to project: ${projectId}`)

// 1. Create a ruleset from the rules file.
const created = await api("POST", `${base}/rulesets`, {
  source: { files: [{ name: "firestore.rules", content: rulesContent }] },
})
if (created.status !== 200) {
  console.error("❌ Failed to create ruleset:", created.status, JSON.stringify(created.json))
  process.exit(1)
}
const rulesetName = created.json.name
console.log(`✅ Ruleset created: ${rulesetName}`)

// 2. Point the cloud.firestore release at the new ruleset (create, or update if it exists).
let rel = await api("POST", `${base}/releases`, { name: releaseName, rulesetName })
if (rel.status === 409 || (rel.json?.error?.status === "ALREADY_EXISTS")) {
  console.log("Release exists — updating it…")
  rel = await api("PATCH", `https://firebaserules.googleapis.com/v1/${releaseName}`, {
    release: { name: releaseName, rulesetName },
  })
}
if (rel.status !== 200) {
  console.error("❌ Failed to set release:", rel.status, JSON.stringify(rel.json))
  process.exit(1)
}
console.log("✅ Firestore rules are now LIVE (deny-all) on", projectId)
process.exit(0)
