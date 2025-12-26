# Agora Stream Cleanup Scripts

This directory contains scripts to help identify and close any lingering Agora streams that might be consuming minutes unexpectedly.

## Files

- `cleanup-agora-streams.js` - CommonJS version (Firebase-based cleanup)
- `cleanup-agora-streams.mjs` - ES Modules version (Firebase-based cleanup)
- `../app/api/agora/cleanup/route.ts` - API endpoint for programmatic cleanup

## Usage

### Command Line Scripts

1. **Firebase-based cleanup (RECOMMENDED):**
   ```bash
   npm run cleanup-streams
   ```

2. **ES Modules version:**
   ```bash
   npm run cleanup-streams-esm
   ```

3. **Direct execution:**
   ```bash
   node scripts/cleanup-agora-streams.js
   ```

### API Endpoint

You can also trigger cleanup via HTTP requests:

1. **Check and cleanup lingering streams:**
   ```bash
   curl http://localhost:3000/api/agora/cleanup
   ```

2. **Force close ALL active streams (use with caution):**
   ```bash
   curl -X POST http://localhost:3000/api/agora/cleanup \
     -H "Content-Type: application/json" \
     -d '{"action": "force-cleanup-all"}'
   ```

## What the Scripts Do

1. **Check Firebase** for active stream sessions
2. **Identify lingering streams** (sessions older than 1 hour)
3. **Force close** any lingering streams by updating their status in Firebase
4. **Report results** with detailed information about what was found and closed

## Environment Variables Required

Make sure these environment variables are set:

```bash
# Firebase Configuration (REQUIRED)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Agora Configuration (for token generation)
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate
```

## Output Example

```
🚀 Starting Agora Stream Cleanup Process...

🔍 Checking for active stream sessions in Firebase...
📊 Found 3 active stream sessions

📋 Active Stream Sessions:
  1. Session ID: abc123
     Publisher: John Doe (user123)
     Room ID: stream-user123-1234567890-xyz789
     Title: My Gaming Stream
     Duration: 2h 15m 30s
     Created: 12/15/2023, 2:30:45 PM

🔍 Checking for potentially lingering streams...
⚠️ Found 2 potentially lingering streams (older than 1 hour):
  1. John Doe - My Gaming Stream (2h 15m 30s)
  2. Jane Smith - Untitled (1h 45m 12s)

🔄 Force closing 2 lingering streams...
✅ Force closed stream session: abc123
✅ Force closed stream session: def456

📊 Cleanup Results:
  ✅ Successfully closed: 2
  ❌ Failed to close: 0

🎯 Cleanup Summary:
  Total active streams found: 3
  Lingering streams identified: 2
  Streams force closed: 2

💰 Potential cost savings: Closing lingering streams should stop Agora minute consumption.

🎉 Cleanup process completed!
```

## Recommendations

1. **Run regularly** - Set up a cron job to run this script every hour or so
2. **Monitor usage** - Check your Agora dashboard for unexpected usage patterns
3. **Implement automatic cleanup** - Add proper error handling in your app for network disconnections
4. **Browser cleanup** - Ensure users properly close browser tabs when leaving streams

## Troubleshooting

If you're still seeing unexpected minute consumption after running the cleanup:

1. Check browser tabs that might still be connected
2. Check mobile apps that might not have properly disconnected
3. Look for network issues that prevented proper cleanup
4. Monitor the Agora dashboard for real-time usage patterns
