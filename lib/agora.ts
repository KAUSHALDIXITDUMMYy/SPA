import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteVideoTrack,
  IRemoteAudioTrack,
  ICameraVideoTrack,
} from "agora-rtc-sdk-ng"

export type AgoraJoinRole = "publisher" | "audience"

export interface AgoraJoinConfig {
  channelName: string
  role: AgoraJoinRole
  uid?: number
  appId?: string
  token?: string
  container: HTMLElement
  width?: string | number
  height?: string | number
  // optional preferences
  preferFPS?: number
  prefer720pIfFail?: boolean
}

export interface VideoConfig {
  width: number
  height: number
  frameRate: number
  bitrate: number
}

export class AgoraManager {
  private client: IAgoraRTCClient | null = null
  private localAudio: ILocalAudioTrack | null = null
  private localVideo: ILocalVideoTrack | null = null
  private screenTrack: ILocalVideoTrack | null = null

  // store last join params for reconnect attempts
  private lastJoinConfig: AgoraJoinConfig | null = null
  
  // Adaptive quality configurations - CONSTANT 24 FPS with adaptive resolution
  private readonly QUALITY_PRESETS = {
    // Excellent network - 1080p @ 24 FPS
    excellent: {
      width: 1920,
      height: 1080,
      frameRate: 24,
      bitrate: 2000
    },
    // Good network - 720p @ 24 FPS
    good: {
      width: 1280,
      height: 720,
      frameRate: 24,
      bitrate: 1200
    },
    // Fair network - 480p @ 24 FPS
    fair: {
      width: 854,
      height: 480,
      frameRate: 24,
      bitrate: 800
    },
    // Poor network - 360p @ 24 FPS
    poor: {
      width: 640,
      height: 360,
      frameRate: 24,
      bitrate: 500
    },
    // Very poor network - 240p @ 24 FPS
    veryPoor: {
      width: 426,
      height: 240,
      frameRate: 24,
      bitrate: 300
    }
  }

  // Current quality level
  private currentQuality: keyof typeof this.QUALITY_PRESETS = 'good'
  
  // Track network quality history for smarter adaptation
  private networkQualityHistory: Array<{
    uplink: number
    downlink: number
    timestamp: number
    quality: keyof typeof this.QUALITY_PRESETS
  }> = []
  
  // Track quality change history to prevent rapid flipping
  private lastQualityChangeTime: number = 0
  private readonly QUALITY_CHANGE_COOLDOWN = 3000 // 3 seconds between quality changes
  
  // Track remote users and their stream types
  private remoteUsers: Map<number, { videoTrack?: IRemoteVideoTrack }> = new Map()

  // Network quality monitoring
  private networkQualityInterval: NodeJS.Timeout | null = null
  private lastNetworkQuality = {
    uplink: -1,
    downlink: -1,
    timestamp: 0
  }

  // Track consecutive good network readings for upward adaptation
  private consecutiveGoodReadings: number = 0
  private readonly REQUIRED_GOOD_READINGS_FOR_UPGRADE = 3

  // lazy loaded AgoraRTC module
  private async getAgora() {
    if (typeof window === "undefined") throw new Error("Agora can only be used in the browser")
    const mod = await import("agora-rtc-sdk-ng")
    const AgoraRTC = (mod as any).default ?? mod
    // set log level via documented API (may vary by SDK versions)
    try {
      if (typeof AgoraRTC.setLogLevel === "function") AgoraRTC.setLogLevel(2) // reduce noise
    } catch (e) {
      // no-op if not supported
    }
    return AgoraRTC as any
  }

  private async fetchToken(channelName: string, role: AgoraJoinRole, uid?: number) {
    const res = await fetch("/api/agora/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName, role, uid }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || "Failed to fetch Agora token")
    return data as { token: string; uid: number; appId: string }
  }

  // Public join method
  async join(config: AgoraJoinConfig) {
    const { channelName, role, uid, container } = config
    this.lastJoinConfig = config

    const tokenInfo = await this.fetchToken(channelName, role, uid)
    const appId = tokenInfo.appId
    const token = tokenInfo.token
    const agoraUid = tokenInfo.uid

    const AgoraRTC = await this.getAgora()
    
    // Create client for audio-only streaming with low latency configuration
    this.client = AgoraRTC.createClient({
      mode: "live",
      codec: "vp8",
    })
    
    // Configure for ultra-low latency audio streaming
    try {
      // Set client for low latency (if method exists)
      if (typeof this.client.setLowLatencyMode === 'function') {
        await this.client.setLowLatencyMode(true)
        console.log("Low latency mode enabled")
      }
    } catch (err) {
      console.warn("Failed to enable low latency mode:", err)
    }

    this.client?.setClientRole(role === "publisher" ? "host" : "audience")

    // Setup handlers before join to catch events during join
    this.setupAgoraErrorHandling()

    await this.client?.join(appId, channelName, token, agoraUid)

    if (role === "publisher") {
      // For publishers, start microphone audio only
      await this.enableMic()
    } else {
      // Audience: setup audio subscription only
      await this.setupSubscriberAudioOnly(container)
    }

    // Network quality monitoring not needed for audio-only
  }

  // Audio-only: no video streaming setup needed

  // Setup subscriber for audio-only streaming with low latency
  private async setupSubscriberAudioOnly(container: HTMLElement) {
    if (!this.client) return

    // Handle user published events - audio only with low latency optimization
    this.client.on("user-published", async (user, mediaType) => {
      try {
        await this.client!.subscribe(user, mediaType)
      } catch (err) {
        console.warn("subscribe failed", err)
        return
      }

      if (mediaType === "audio") {
        const remoteAudioTrack = user.audioTrack as IRemoteAudioTrack | undefined
        if (!remoteAudioTrack) return
        try {
          // Play audio with low latency settings
          remoteAudioTrack.play()
          
          // Set volume to maximum for clear audio
          try {
            await remoteAudioTrack.setVolume(100)
            console.log("Remote audio volume set to maximum")
          } catch (volErr) {
            console.warn("Failed to set remote audio volume:", volErr)
          }
          
          // Configure for low latency playback
          try {
            // Set audio processing for minimal buffer delay (if supported)
            if (typeof remoteAudioTrack.setAudioFrameCallback === 'function') {
              await remoteAudioTrack.setAudioFrameCallback(undefined, 10) // 10ms buffer
              console.log("Remote audio frame callback configured for low latency")
            }
          } catch (procErr) {
            console.warn("Failed to configure remote audio processing:", procErr)
          }
          
          console.log("Remote audio track playing with low latency settings")
        } catch (e) {
          console.warn("remoteAudioTrack.play failed", e)
        }
      }
    })

    this.client.on("user-unpublished", (user) => {
      // Cleanup if needed
    })

    this.client.on("user-left", (user) => {
      // Cleanup if needed
    })
  }

  // leave and cleanup
  async leave() {
    try {
      // Clear network monitoring
      if (this.networkQualityInterval) {
        clearInterval(this.networkQualityInterval)
        this.networkQualityInterval = null
      }

      if (this.localAudio) {
        try {
          this.localAudio.stop()
          this.localAudio.close()
        } catch {}
      }
      if (this.localVideo) {
        try {
          this.localVideo.stop()
          this.localVideo.close()
        } catch {}
      }
      if (this.screenTrack) {
        try {
          this.screenTrack.stop()
          this.screenTrack.close()
        } catch {}
      }

      if (this.client) {
        // unpublish any published tracks
        try {
          const toUnpublish: any[] = []
          if (this.localAudio) toUnpublish.push(this.localAudio)
          if (this.localVideo) toUnpublish.push(this.localVideo)
          if (this.screenTrack) toUnpublish.push(this.screenTrack)
          if (toUnpublish.length) {
            await this.client.unpublish(toUnpublish)
          } else {
            // ensure any previously published tracks are released (safe no-op)
            try {
              await this.client.unpublish()
            } catch {}
          }
        } catch (e) {
          console.warn("unpublish error", e)
        }

        try {
          await this.client.leave()
        } catch (e) {
          console.warn("client.leave failed", e)
        }
      }
    } finally {
      this.client = null
      this.localAudio = null
      this.localVideo = null
      this.screenTrack = null
      this.lastJoinConfig = null
      this.remoteUsers.clear()
      this.networkQualityHistory = []
      this.consecutiveGoodReadings = 0
    }
  }

  // Start screen share with adaptive configuration
  async startScreenShare(
    container: HTMLElement,
    options?: { fullScreen?: boolean; withSystemAudio?: boolean }
  ) {
    if (!this.client) throw new Error("Client not joined")
    if (this.screenTrack) return

    const fullScreen = options?.fullScreen ?? true
    const withSystemAudio = options?.withSystemAudio ?? true

    const AgoraRTC = (await this.getAgora()).default ?? (await this.getAgora())

    // Use current quality preset for screen sharing
    const config = this.QUALITY_PRESETS[this.currentQuality]

    const tryConfigs = [
      // Primary: Adaptive resolution @ 24 FPS
      {
        encoderConfig: {
          width: config.width,
          height: config.height,
          frameRate: config.frameRate, // Constant 24 FPS
        },
        optimizationMode: "detail" as const,
        screenSourceType: fullScreen ? ("screen" as const) : ("window" as const),
      },
      // Fallback: encoded string with 24 FPS equivalent
      {
        encoderConfig: "1080p_1", // Use predefined 1080p profile
        optimizationMode: "detail" as const,
        screenSourceType: fullScreen ? ("screen" as const) : ("window" as const),
      },
      // Lowest fallback
      {
        encoderConfig: "480p_1", // Use predefined 480p profile
        optimizationMode: "detail" as const,
        screenSourceType: fullScreen ? ("screen" as const) : ("window" as const),
      },
    ]

    let createErr: any = null
    let track: ILocalVideoTrack | [ILocalVideoTrack, ILocalAudioTrack] | null = null

    for (const cfg of tryConfigs) {
      try {
        track = (await AgoraRTC.createScreenVideoTrack(cfg as any, withSystemAudio ? "auto" : "disable")) as any
        createErr = null
        break
      } catch (e) {
        createErr = e
      }
    }

    if (!track) {
      console.error("Failed to create screen track", createErr)
      throw new Error("Unable to create screen track for screen sharing")
    }

    // Handle both array and single-track responses
    if (Array.isArray(track)) {
      this.screenTrack = track[0]
      try {
        await this.client.publish([track[0]])
        if (track[1]) {
          try {
            await this.client.publish([track[1]])
          } catch {}
        }
      } catch (e) {
        console.warn("publish array track failed", e)
      }
      try {
        track[0].play(container, { fit: "contain" })
      } catch (e) {
        console.warn("play screen track failed", e)
      }
    } else {
      this.screenTrack = track
      try {
        await this.client.publish([track])
      } catch (e) {
        console.warn("publish track failed", e)
      }
      try {
        track.play(container, { fit: "contain" })
      } catch (e) {
        console.warn("play screen track failed", e)
      }
    }
  }

  async stopScreenShare() {
    if (!this.client || !this.screenTrack) return
    try {
      await this.client.unpublish([this.screenTrack] as any)
    } catch (e) {
      // ignore
    }
    try {
      this.screenTrack.stop()
      this.screenTrack.close()
    } catch {}
    this.screenTrack = null
  }

  // Start camera with adaptive configuration
  async startCamera(container: HTMLElement) {
    if (!this.client) throw new Error("Client not joined")
    if (this.localVideo) return

    const AgoraRTC = await this.getAgora()
    
    // Use current quality preset for camera
    const config = this.QUALITY_PRESETS[this.currentQuality]

    try {
      this.localVideo = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: {
          width: config.width,
          height: config.height,
          frameRate: config.frameRate, // Constant 24 FPS
        },
        optimizationMode: "detail",
      })
      
      if (this.localVideo) {
        await this.client?.publish([this.localVideo])
        this.localVideo.play(container, { fit: "contain" })
      }
    } catch (e) {
      console.warn("create/publish camera failed", e)
      throw e
    }
  }

  async stopCamera() {
    if (!this.client || !this.localVideo) return
    try {
      await this.client.unpublish([this.localVideo])
    } catch (e) {
      // ignore
    }
    try {
      this.localVideo.stop()
      this.localVideo.close()
    } catch {}
    this.localVideo = null
  }

  // Update video quality dynamically based on network conditions
  private async updateVideoQuality(newQuality: keyof typeof this.QUALITY_PRESETS) {
    if (this.currentQuality === newQuality) return
    
    // Check cooldown period to prevent rapid quality flipping
    const now = Date.now()
    if (now - this.lastQualityChangeTime < this.QUALITY_CHANGE_COOLDOWN) {
      console.log(`Quality change skipped - in cooldown period`)
      return
    }
    
    console.log(`Updating video quality from ${this.currentQuality} to ${newQuality}`)
    this.currentQuality = newQuality
    this.lastQualityChangeTime = now

    // Update local video track if exists
    if (this.localVideo) {
      try {
        const config = this.QUALITY_PRESETS[newQuality]
        await this.localVideo.setEncoderConfiguration({
          width: config.width,
          height: config.height,
          frameRate: config.frameRate,
          bitrate: config.bitrate,
        })
        console.log("Local video quality updated")
      } catch (err) {
        console.warn("Failed to update local video quality:", err)
      }
    }

    // Update screen track if exists
    if (this.screenTrack) {
      try {
        const config = this.QUALITY_PRESETS[newQuality]
        await this.screenTrack.setEncoderConfiguration({
          width: config.width,
          height: config.height,
          frameRate: config.frameRate,
          bitrate: config.bitrate,
        })
        console.log("Screen share quality updated")
      } catch (err) {
        console.warn("Failed to update screen share quality:", err)
      }
    }

    // Update remote stream qualities
    await this.updateAllRemoteStreamQualities(newQuality)
    
    // Add to history for tracking
    this.networkQualityHistory.push({
      uplink: this.lastNetworkQuality.uplink,
      downlink: this.lastNetworkQuality.downlink,
      timestamp: now,
      quality: newQuality
    })
    
    // Keep only last 50 entries
    if (this.networkQualityHistory.length > 50) {
      this.networkQualityHistory = this.networkQualityHistory.slice(-50)
    }
  }

  // Update all remote streams to specified quality
  private async updateAllRemoteStreamQualities(quality: keyof typeof this.QUALITY_PRESETS) {
    if (!this.client) return

    const streamType = this.getStreamTypeForQuality(quality)
    
    try {
      for (const uid of this.remoteUsers.keys()) {
        await this.adjustRemoteStreamQuality(uid, quality)
      }
      console.log(`All remote streams updated to ${quality} quality`)
    } catch (e) {
      console.warn("Failed to update remote stream qualities:", e)
    }
  }

  // Adjust individual remote stream quality
  private async adjustRemoteStreamQuality(uid: string | number, quality: keyof typeof this.QUALITY_PRESETS) {
    if (!this.client) return

    const streamType = this.getStreamTypeForQuality(quality)
    
    try {
      await this.client.setRemoteVideoStreamType(uid, streamType)
    } catch (err) {
      console.warn(`Failed to set stream type for user ${uid}:`, err)
    }
  }

  // Map quality level to stream type
  private getStreamTypeForQuality(quality: keyof typeof this.QUALITY_PRESETS): number {
    const qualityMap: Record<keyof typeof this.QUALITY_PRESETS, number> = {
      excellent: 0, // High stream
      good: 0,      // High stream
      fair: 1,      // Low stream
      poor: 1,      // Low stream
      veryPoor: 1   // Low stream
    }
    return qualityMap[quality]
  }

  // Advanced network quality monitoring with adaptive streaming
  private enableAdvancedNetworkQualityMonitoring() {
    if (!this.client) return

    // Clear any existing interval
    if (this.networkQualityInterval) {
      clearInterval(this.networkQualityInterval)
    }

    // Use built-in network quality event
    this.client.on("network-quality", (stats: any) => {
      try {
        const uplink = stats?.uplinkNetworkQuality ?? -1
        const downlink = stats?.downlinkNetworkQuality ?? -1
        const timestamp = Date.now()

        // Store latest quality data
        this.lastNetworkQuality = {
          uplink,
          downlink,
          timestamp
        }

        // Determine quality level based on network conditions with smart adaptation
        this.determineOptimalQualityWithSmartAdaptation(uplink, downlink)
      } catch (e) {
        console.warn("Network quality monitoring error:", e)
      }
    })

    // Additional proactive network checking
    this.networkQualityInterval = setInterval(() => {
      this.performProactiveNetworkCheck()
    }, 5000) // Check every 5 seconds
  }

  // Smart quality adaptation that handles both downgrade and upgrade scenarios
  private async determineOptimalQualityWithSmartAdaptation(uplink: number, downlink: number) {
    const targetQuality = this.calculateTargetQuality(uplink, downlink)
    
    // Different logic for upgrading vs downgrading
    if (this.shouldUpgradeQuality(targetQuality)) {
      await this.updateVideoQuality(targetQuality)
      this.consecutiveGoodReadings = 0 // Reset after successful upgrade
    } else if (this.shouldDowngradeQuality(targetQuality)) {
      // Downgrade immediately when network worsens
      await this.updateVideoQuality(targetQuality)
      this.consecutiveGoodReadings = 0 // Reset on downgrade
    }
  }

  // Calculate what quality we should target based on network conditions
  private calculateTargetQuality(uplink: number, downlink: number): keyof typeof this.QUALITY_PRESETS {
    // Network quality scale: 0-1 (excellent), 2-3 (good), 4-5 (fair), 6-7 (poor)
    if (downlink <= 1 && uplink <= 1) {
      return 'excellent'
    } else if (downlink <= 3 && uplink <= 3) {
      return 'good'
    } else if (downlink <= 5 && uplink <= 5) {
      return 'fair'
    } else if (downlink <= 7 && uplink <= 7) {
      return 'poor'
    } else {
      return 'veryPoor'
    }
  }

  // Determine if we should upgrade quality (more conservative)
  private shouldUpgradeQuality(targetQuality: keyof typeof this.QUALITY_PRESETS): boolean {
    const currentLevel = this.getQualityLevel(this.currentQuality)
    const targetLevel = this.getQualityLevel(targetQuality)
    
    // Only consider if target is actually better
    if (targetLevel >= currentLevel) return false
    
    // For upgrades, require consecutive good readings
    if (targetLevel < currentLevel) {
      this.consecutiveGoodReadings++
      console.log(`Good network reading ${this.consecutiveGoodReadings}/${this.REQUIRED_GOOD_READINGS_FOR_UPGRADE} for upgrade`)
      
      if (this.consecutiveGoodReadings >= this.REQUIRED_GOOD_READINGS_FOR_UPGRADE) {
        console.log(`Network stable enough for quality upgrade`)
        return true
      }
    }
    
    return false
  }

  // Determine if we should downgrade quality (more aggressive)
  private shouldDowngradeQuality(targetQuality: keyof typeof this.QUALITY_PRESETS): boolean {
    const currentLevel = this.getQualityLevel(this.currentQuality)
    const targetLevel = this.getQualityLevel(targetQuality)
    
    // Only consider if target is worse
    if (targetLevel <= currentLevel) return false
    
    // For downgrades, react immediately to prevent quality issues
    if (targetLevel > currentLevel) {
      console.log(`Network degraded, downgrading quality immediately`)
      this.consecutiveGoodReadings = 0 // Reset on downgrade
      return true
    }
    
    return false
  }

  // Convert quality name to numeric level for comparison (lower number = better quality)
  private getQualityLevel(quality: keyof typeof this.QUALITY_PRESETS): number {
    const levels: Record<keyof typeof this.QUALITY_PRESETS, number> = {
      excellent: 0,
      good: 1,
      fair: 2,
      poor: 3,
      veryPoor: 4
    }
    return levels[quality]
  }

  // Perform proactive network checks
  private async performProactiveNetworkCheck() {
    if (!this.client) return

    try {
      // Get connection state
      const connectionState = this.client.connectionState
      
      // If connection is poor, consider downgrading quality
      if (connectionState === 'RECONNECTING' || connectionState === 'DISCONNECTED') {
        await this.updateVideoQuality('veryPoor')
        this.consecutiveGoodReadings = 0
      }
      
      // If we have stable connection and good network history, consider gradual upgrade
      if (connectionState === 'CONNECTED' && this.consecutiveGoodReadings > 0) {
        const targetQuality = this.calculateTargetQuality(
          this.lastNetworkQuality.uplink, 
          this.lastNetworkQuality.downlink
        )
        
        if (this.shouldUpgradeQuality(targetQuality)) {
          await this.updateVideoQuality(targetQuality)
        }
      }
    } catch (e) {
      console.warn("Proactive network check failed:", e)
    }
  }

  // Microphone enable/disable - automatically starts when publisher joins
  // Optimized for low latency, high sensitivity, and noise reduction
  async enableMic() {
    if (!this.client) throw new Error("Client not joined")
    if (!this.localAudio) {
      const AgoraRTC = await this.getAgora()
      try {
        // Create microphone track with optimized settings for maximum quality and clarity
        this.localAudio = await AgoraRTC.createMicrophoneAudioTrack({
          // Enhanced noise suppression for background noise reduction
          noiseSuppression: true,
          // Echo cancellation to prevent feedback
          echoCancellation: true,
          // Auto gain control for consistent volume
          autoGainControl: true,
          // Optimize for high quality audio with low latency
          encoderConfig: {
            sampleRate: 48000, // High sample rate (48kHz) for professional quality
            stereo: false, // Mono for lower latency (can enable stereo for even better quality if bandwidth allows)
            bitrate: 128, // High bitrate (128 kbps) for crystal clear audio quality
          },
        })
        
        if (this.localAudio) {
          // Increase microphone sensitivity/gain for better pickup
          try {
            // Set volume to maximum (100) for highest sensitivity
            await this.localAudio.setVolume(100)
            console.log("Microphone volume set to maximum (100) for high sensitivity")
          } catch (volErr) {
            console.warn("Failed to set microphone volume:", volErr)
          }
          
          // Configure audio processing for minimal delay
          try {
            // Set audio processing mode for low latency
            // Use smaller buffer size for lower latency (if supported)
            if (typeof this.localAudio.setAudioFrameCallback === 'function') {
              // Set callback with minimal buffer delay (10ms)
              await this.localAudio.setAudioFrameCallback(undefined, 10)
              console.log("Audio frame callback configured for low latency (10ms buffer)")
            }
          } catch (procErr) {
            console.warn("Failed to configure audio processing:", procErr)
          }
          
          // Apply additional audio optimizations for maximum quality
          try {
            // Set encoder configuration for optimal quality
            if (typeof this.localAudio.setEncoderConfiguration === 'function') {
              await this.localAudio.setEncoderConfiguration({
                sampleRate: 48000, // 48kHz sample rate for professional quality
                stereo: false, // Mono for lower latency (set to true for stereo if bandwidth allows)
                bitrate: 128, // High bitrate (128 kbps) for crystal clear audio
              })
              console.log("Audio encoder configured for high quality (128 kbps, 48kHz)")
            }
          } catch (encErr) {
            console.warn("Failed to configure audio encoder:", encErr)
          }
          
          // Additional quality enhancements
          try {
            // Enable high-quality audio processing
            if (typeof this.localAudio.setProcessingAudioParams === 'function') {
              await this.localAudio.setProcessingAudioParams({
                sampleRate: 48000,
                channelCount: 1, // Mono
              })
              console.log("Audio processing parameters optimized for quality")
            }
          } catch (procErr) {
            console.warn("Failed to set audio processing parameters:", procErr)
          }
          
          // Publish with low latency settings
          await this.client?.publish([this.localAudio])
          
          console.log("Microphone audio track published with optimized settings (low latency, high sensitivity, noise reduction)")
        }
      } catch (e) {
        console.warn("create/publish mic failed", e)
        if (this.localAudio) {
          try {
            this.localAudio.stop()
            this.localAudio.close()
          } catch {}
          this.localAudio = null
        }
        throw e
      }
    } else {
      try {
        await this.localAudio.setEnabled(true)
        // Ensure volume is still at maximum
        try {
          await this.localAudio.setVolume(100)
        } catch {}
        try {
          await this.client.publish([this.localAudio], {
            priority: "high",
          })
        } catch {}
      } catch (e) {
        console.warn("enable mic failed", e)
      }
    }
  }

  async disableMic() {
    if (!this.client || !this.localAudio) return
    try {
      await this.localAudio.setEnabled(false)
        try {
          await this.client?.unpublish([this.localAudio])
        } catch {}
    } catch (e) {
      console.warn("disable mic error", e)
    }
  }

  // Set microphone volume/sensitivity (0-100)
  async setMicVolume(volume: number) {
    if (!this.localAudio) return
    try {
      const clampedVolume = Math.max(0, Math.min(100, volume))
      await this.localAudio.setVolume(clampedVolume)
      console.log(`Microphone volume set to ${clampedVolume}%`)
    } catch (e) {
      console.warn("Failed to set microphone volume:", e)
    }
  }

  // Get current microphone volume
  getMicVolume(): number {
    if (!this.localAudio) return 0
    try {
      return this.localAudio.getVolumeLevel() || 0
    } catch (e) {
      return 0
    }
  }

  // Get current network quality information
  getNetworkQuality() {
    return { ...this.lastNetworkQuality }
  }

  // Get current video quality setting
  getCurrentQuality() {
    return this.currentQuality
  }

  // Get network quality history for analytics
  getNetworkQualityHistory() {
    return [...this.networkQualityHistory]
  }

  // Manual quality override (for testing or user preference)
  async setManualQuality(quality: keyof typeof this.QUALITY_PRESETS) {
    await this.updateVideoQuality(quality)
    this.consecutiveGoodReadings = 0 // Reset counter on manual change
  }

  // Setup exceptions and reconnection handling
  private setupAgoraErrorHandling() {
    if (!this.client) return

    // connection-state-change: attempt simple rejoin if disconnected
    this.client.on("connection-state-change", async (curState: string, revState: string) => {
      console.log("Agora connection state changed:", curState, "from", revState)
      if (curState === "DISCONNECTED") {
        if (!this.lastJoinConfig) return
        setTimeout(async () => {
          try {
            await this.client?.leave()
          } catch {}
          try {
            await this.join(this.lastJoinConfig!)
          } catch (e) {
            console.warn("Rejoin attempt failed", e)
          }
        }, 1500)
      }
    })

    // generic exception event
    this.client.on("exception", (event: any) => {
      console.error("Agora exception:", event)
      if (event?.code === 17 && this.lastJoinConfig) {
        setTimeout(async () => {
          try {
            await this.join(this.lastJoinConfig!)
          } catch (e) {
            console.warn("Rejoin after exception failed", e)
          }
        }, 2000)
      }
    })
  }
}

export const agoraManager = new AgoraManager()