import { NextRequest, NextResponse } from "next/server"

// Use Node runtime for server-side operations
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Agora configuration
const AGORA_APP_ID = process.env.AGORA_APP_ID
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE
const AGORA_BASE_URL = 'https://api.agora.io'

interface AgoraChannel {
  channelName: string
  userCount: number
  created: number
}

interface AgoraUser {
  uid: string
  channelName: string
}

export async function GET(req: NextRequest) {
  try {
    console.log("🔍 Starting Agora direct API cleanup check...")
    
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return NextResponse.json({
        error: "Missing Agora credentials",
        message: "AGORA_APP_ID and AGORA_APP_CERTIFICATE environment variables are required",
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    // Generate authentication header using APP_ID and APP_CERTIFICATE
    const credentials = Buffer.from(`${AGORA_APP_ID}:${AGORA_APP_CERTIFICATE}`).toString('base64')
    const authHeader = `Basic ${credentials}`

    // Step 1: Get active channels from Agora API
    console.log("📡 Fetching active channels from Agora API...")
    const channelsResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/channel/${AGORA_APP_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    })

    if (!channelsResponse.ok) {
      throw new Error(`Failed to fetch channels: HTTP ${channelsResponse.status}`)
    }

    const channelsData = await channelsResponse.json()
    const activeChannels: AgoraChannel[] = channelsData.data || []
    
    console.log(`📊 Found ${activeChannels.length} active channels`)

    // Step 2: Check for lingering channels (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000)
    const lingeringChannels = activeChannels.filter(channel => {
      const createdTime = channel.created * 1000
      return createdTime < oneHourAgo && channel.userCount > 0
    })

    console.log(`⚠️ Found ${lingeringChannels.length} potentially lingering channels`)

    // Step 3: Get users from lingering channels and force disconnect them
    const disconnectedUsers = []
    const disconnectErrors = []

    for (const channel of lingeringChannels) {
      try {
        // Get users in this channel
        const usersResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/channel/user/${AGORA_APP_ID}/${encodeURIComponent(channel.channelName)}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        })

        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          const users: number[] = usersData.data?.users || []

          // Force disconnect each user
          for (const userId of users) {
            try {
              const kickResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/kick/${AGORA_APP_ID}/${encodeURIComponent(channel.channelName)}/${userId}`, {
                method: 'POST',
                headers: {
                  'Authorization': authHeader,
                  'Content-Type': 'application/json'
                }
              })

              if (kickResponse.ok) {
                disconnectedUsers.push({
                  uid: userId,
                  channelName: channel.channelName,
                  success: true
                })
                console.log(`✅ Disconnected user ${userId} from channel ${channel.channelName}`)
              } else {
                disconnectErrors.push({
                  uid: userId,
                  channelName: channel.channelName,
                  error: `HTTP ${kickResponse.status}`,
                  success: false
                })
              }
            } catch (error) {
              disconnectErrors.push({
                uid: userId,
                channelName: channel.channelName,
                error: error instanceof Error ? error.message : 'Unknown error',
                success: false
              })
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing channel ${channel.channelName}:`, error)
      }
    }

    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        totalActiveChannels: activeChannels.length,
        lingeringChannelsFound: lingeringChannels.length,
        usersDisconnected: disconnectedUsers.length,
        disconnectErrors: disconnectErrors.length
      },
      activeChannels: activeChannels.map(channel => ({
        channelName: channel.channelName,
        userCount: channel.userCount,
        created: new Date(channel.created * 1000),
        duration: calculateDuration(channel.created * 1000),
        isLingering: lingeringChannels.includes(channel)
      })),
      lingeringChannels: lingeringChannels.map(channel => ({
        channelName: channel.channelName,
        userCount: channel.userCount,
        created: new Date(channel.created * 1000),
        duration: calculateDuration(channel.created * 1000)
      })),
      disconnectedUsers,
      disconnectErrors,
      recommendations: generateRecommendations(activeChannels.length, lingeringChannels.length, disconnectedUsers.length)
    }

    console.log("🎉 Direct API cleanup check completed:", response.summary)

    return NextResponse.json(response)
  } catch (error) {
    console.error("❌ Direct API cleanup failed:", error)
    return NextResponse.json(
      { 
        error: "Direct API cleanup failed", 
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()
    
    if (action === "force-cleanup-all") {
      console.log("🔄 Force cleanup ALL channels requested...")
      
      if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
        return NextResponse.json({
          error: "Missing Agora credentials",
          message: "AGORA_APP_ID and AGORA_APP_CERTIFICATE environment variables are required"
        }, { status: 500 })
      }

      // Generate authentication header using APP_ID and APP_CERTIFICATE
      const credentials = Buffer.from(`${AGORA_APP_ID}:${AGORA_APP_CERTIFICATE}`).toString('base64')
      const authHeader = `Basic ${credentials}`

      // Get ALL active channels
      const channelsResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/channel/${AGORA_APP_ID}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      })

      if (!channelsResponse.ok) {
        throw new Error(`Failed to fetch channels: HTTP ${channelsResponse.status}`)
      }

      const channelsData = await channelsResponse.json()
      const allActiveChannels: AgoraChannel[] = channelsData.data || []

      // Force disconnect ALL users from ALL channels
      const allDisconnectedUsers = []
      const allDisconnectErrors = []

      for (const channel of allActiveChannels) {
        if (channel.userCount > 0) {
          try {
            // Get users in this channel
            const usersResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/channel/user/${AGORA_APP_ID}/${encodeURIComponent(channel.channelName)}`, {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            })

            if (usersResponse.ok) {
              const usersData = await usersResponse.json()
              const users: number[] = usersData.data?.users || []

              // Force disconnect each user
              for (const userId of users) {
                try {
                  const kickResponse = await fetch(`${AGORA_BASE_URL}/dev/v1/kick/${AGORA_APP_ID}/${encodeURIComponent(channel.channelName)}/${userId}`, {
                    method: 'POST',
                    headers: {
                      'Authorization': authHeader,
                      'Content-Type': 'application/json'
                    }
                  })

                  if (kickResponse.ok) {
                    allDisconnectedUsers.push({
                      uid: userId,
                      channelName: channel.channelName,
                      success: true
                    })
                    console.log(`✅ Force disconnected user ${userId} from channel ${channel.channelName}`)
                  } else {
                    allDisconnectErrors.push({
                      uid: userId,
                      channelName: channel.channelName,
                      error: `HTTP ${kickResponse.status}`,
                      success: false
                    })
                  }
                } catch (error) {
                  allDisconnectErrors.push({
                    uid: userId,
                    channelName: channel.channelName,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    success: false
                  })
                }
              }
            }
          } catch (error) {
            console.error(`❌ Error processing channel ${channel.channelName}:`, error)
          }
        }
      }

      return NextResponse.json({
        timestamp: new Date().toISOString(),
        action: "force-cleanup-all",
        message: "All users have been force disconnected from all channels",
        summary: {
          totalChannels: allActiveChannels.length,
          channelsWithUsers: allActiveChannels.filter(c => c.userCount > 0).length,
          usersDisconnected: allDisconnectedUsers.length,
          disconnectErrors: allDisconnectErrors.length
        },
        channels: allActiveChannels.map(channel => ({
          channelName: channel.channelName,
          userCount: channel.userCount,
          created: new Date(channel.created * 1000),
          duration: calculateDuration(channel.created * 1000)
        })),
        disconnectedUsers: allDisconnectedUsers,
        disconnectErrors: allDisconnectErrors
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("❌ Force cleanup failed:", error)
    return NextResponse.json(
      { 
        error: "Force cleanup failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    )
  }
}

function calculateDuration(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

function generateRecommendations(
  totalChannels: number, 
  lingeringChannels: number, 
  disconnectedUsers: number
): string[] {
  const recommendations = []
  
  if (disconnectedUsers > 0) {
    recommendations.push(`Found and disconnected ${disconnectedUsers} users from lingering channels`)
  }
  
  if (lingeringChannels === 0 && totalChannels > 0) {
    recommendations.push("All active channels appear recent - check browser tabs and mobile apps for lingering connections")
  }
  
  if (totalChannels === 0) {
    recommendations.push("No active channels found - all streams are properly closed")
  }
  
  recommendations.push("Monitor your Agora dashboard for unexpected usage patterns")
  recommendations.push("Consider implementing automatic cleanup in your application")
  recommendations.push("Set up webhooks for real-time channel monitoring")
  
  return recommendations
}
