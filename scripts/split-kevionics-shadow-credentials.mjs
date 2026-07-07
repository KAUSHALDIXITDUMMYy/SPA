import fs from "fs"

function parseLines(path) {
  const raw = fs.readFileSync(path, "utf8").split(/\r?\n/)
  const rows = []
  let past = false
  for (const line of raw) {
    if (!past) {
      if (line.startsWith("──")) past = true
      continue
    }
    if (!line.trim() || line.startsWith("Total")) continue
    if (line.includes("|")) rows.push(line)
  }
  return rows
}

function emailOf(line) {
  return line.split("|")[0].trim().toLowerCase()
}

function localOf(line) {
  return emailOf(line).split("@")[0]
}

function domainOf(line) {
  return emailOf(line).split("@")[1]
}

function isSmDomain(line) {
  const d = domainOf(line)
  return d === "sportsmagician.com" || d === "pubsportsmagician.com"
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Same person as kevionics user: exact local, local+bk, local+digits, jim→jimmy */
function matchesKevShadow(kevLocal, smLocal) {
  const k = kevLocal.toLowerCase()
  const s = smLocal.toLowerCase()
  if (s === k) return true
  if (s === `${k}bk`) return true
  if (k === "jim" && s === "jimmy") return true
  if (k === "admin") return false
  return new RegExp(`^${escapeRegExp(k)}[0-9]+$`).test(s)
}

const kevRows = parseLines("kevionics-credentials.txt")
const smRows = parseLines("sportsmagician-credentials.txt")

const kevPrimary = kevRows
  .filter((line) => domainOf(line) === "kevionics.com")
  .sort((a, b) => emailOf(a).localeCompare(emailOf(b)))

const kevLocals = [...new Set(kevPrimary.map(localOf))]
const moved = []
const kept = []

for (const line of smRows) {
  if (!isSmDomain(line)) {
    kept.push(line)
    continue
  }
  const smLoc = localOf(line)
  const hit = kevLocals.some((kl) => matchesKevShadow(kl, smLoc))
  if (hit) moved.push(line)
  else kept.push(line)
}

moved.sort((a, b) => emailOf(a).localeCompare(emailOf(b)))

const mkHeader = (title) => [
  title,
  "Generated: 2026-06-23T11:54:25.932Z",
  "KEEP THIS FILE PRIVATE. Distribute passwords only over secure channels, then delete it.",
  "─".repeat(80),
  "",
]

const kevOut = [
  ...mkHeader("KEVIONICS — User Credentials"),
  "── @kevionics.com (primary) ──",
  "",
  ...kevPrimary,
  "",
  "── @sportsmagician.com shadow accounts (same Kevionics users) ──",
  "",
  ...moved,
  "",
  `Total @kevionics.com accounts: ${kevPrimary.length}`,
  `Total @sportsmagician.com shadow accounts: ${moved.length}`,
  `Total accounts: ${kevPrimary.length + moved.length}`,
].join("\n")

const smOut = [
  ...mkHeader("SPORTS MAGICIAN — User Credentials"),
  ...kept.sort((a, b) => emailOf(a).localeCompare(emailOf(b))),
  "",
  `Total accounts: ${kept.length}`,
].join("\n")

fs.writeFileSync("kevionics-credentials.txt", kevOut)
fs.writeFileSync("sportsmagician-credentials.txt", smOut)

console.log(`Moved ${moved.length} shadow @sportsmagician accounts to kevionics-credentials.txt`)
for (const line of moved) console.log(`  ${emailOf(line)}`)
console.log(`Sports Magician remaining: ${kept.length}`)
