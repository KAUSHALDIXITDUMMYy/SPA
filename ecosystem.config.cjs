const path = require("path")
const dotenv = require("dotenv")

dotenv.config({ path: path.join(__dirname, ".env.production") })

/** PM2 config for VPS backend (API + Next.js server). */
module.exports = {
  apps: [
    {
      name: "spa-backend",
      cwd: path.join(__dirname, ".next/standalone"),
      script: "server.js",
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "800M",
    },
  ],
}
