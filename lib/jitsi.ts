declare global {
  interface Window {
    JitsiMeetExternalAPI: any
  }
}

export interface JitsiConfig {
  roomName: string
  width: string | number
  height: string | number
  parentNode: HTMLElement
  configOverwrite?: {
    startWithAudioMuted?: boolean
    startWithVideoMuted?: boolean
    enableWelcomePage?: boolean
    prejoinPageEnabled?: boolean
    disableModeratorIndicator?: boolean
    startScreenSharing?: boolean
    enableEmailInStats?: boolean
    [key: string]: any
  }
  interfaceConfigOverwrite?: {
    TOOLBAR_BUTTONS?: string[]
    SETTINGS_SECTIONS?: string[]
    SHOW_JITSI_WATERMARK?: boolean
    SHOW_WATERMARK_FOR_GUESTS?: boolean
    SHOW_BRAND_WATERMARK?: boolean
    BRAND_WATERMARK_LINK?: string
    SHOW_POWERED_BY?: boolean
    DISPLAY_WELCOME_PAGE_CONTENT?: boolean
    DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT?: boolean
    APP_NAME?: string
    NATIVE_APP_NAME?: string
    PROVIDER_NAME?: string
    LANG_DETECTION?: boolean
    CONNECTION_INDICATOR_DISABLED?: boolean
    VIDEO_QUALITY_LABEL_DISABLED?: boolean
    RECENT_LIST_ENABLED?: boolean
    OPTIMAL_BROWSERS?: string[]
    UNSUPPORTED_BROWSERS?: string[]
    AUTO_PIN_LATEST_SCREEN_SHARE?: boolean
    DISABLE_VIDEO_BACKGROUND?: boolean
    DISABLE_BLUR_SUPPORT?: boolean
    [key: string]: any
  }
  userInfo?: {
    displayName?: string
    email?: string
  }
  jwt?: string
}

export class JitsiManager {
  private api: any = null
  private domain = "8x8.vc"
  private magicCookie = process.env.NEXT_PUBLIC_JAAS_APP_ID 
  private lastParent: HTMLElement | null = null

  constructor() {
    this.loadJitsiScript()
  }

  private loadJitsiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve()
        return
      }

      const appId = this.magicCookie
      if (!appId) {
        reject(new Error("Missing NEXT_PUBLIC_JAAS_APP_ID"))
        return
      }

      const script = document.createElement("script")
      script.src = `https://${this.domain}/${appId}/external_api.js`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Failed to load Jitsi Meet API"))
      document.head.appendChild(script)
    })
  }

  private generateJaaSRoomName(roomName: string): string {
    return `${this.magicCookie}/${roomName}`
  }

  async createRoom(config: JitsiConfig): Promise<any> {
    await this.loadJitsiScript()

    // Ensure any previous session is fully disposed before creating a new one
    if (this.api) {
      try {
        this.api.dispose()
      } catch (e) {
        // ignore
      }
      this.api = null
    }

    // Get a fresh JWT for this room from our server
    let jwt: string | undefined = undefined
    try {
      const res = await fetch("/api/jaas/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: config.roomName,
          user: {
            name: config.userInfo?.displayName,
            email: config.userInfo?.email,
            moderator: true,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to fetch token")
      jwt = data.token
    } catch (err) {
      console.error("Failed to fetch JaaS token:", err)
    }

    const defaultConfig = {
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        enableWelcomePage: false,
        prejoinPageEnabled: false,
        disableModeratorIndicator: true,
        startScreenSharing: false,
        enableEmailInStats: false,
        // Avoid P2P for stability and consistent SFU behavior during screen share
        p2p: { enabled: false },
        // Reduce client overhead to help maintain frame rate
        disableAudioLevels: true,
        // Target 720p at high framerate to prioritize smoothness
        constraints: {
          video: {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 60, max: 60 },
          },
        },
        // Try to lock desktop sharing framerate at 60fps
        desktopSharingFrameRate: { min: 60, max: 60 },
          // Keep simulcast for camera, but disable it for screenshare to stabilize 60fps
          disableSimulcastForScreenSharing: true,
        // Avoid Jitsi suspending video which can cause choppiness
        disableSuspendVideo: true,
        // Aim for 720p sending resolution
        resolution: 720,
        // Prefer a widely compatible codec to reduce CPU on many clients
        videoQuality: {
          preferredCodec: "H264",
          maxFullResolutionParticipants: 1,
          maxBitratesVideo: {
            low: 250000,
            standard: 1200000,
              high: 10000000,
          },
        },
          // Ensure H264 is allowed for hardware acceleration
          disableH264: false,
        // Keep multiple layers; avoid layer suspension to reduce quality oscillations
        disableSimulcast: false,
        enableLayerSuspension: false,
        ...config.configOverwrite,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          "microphone",
          "camera",
          "desktop",
          "fullscreen",
          "fodeviceselection",
          "hangup",
          "profile",
          "recording",
          "livestreaming",
          "etherpad",
          "sharedvideo",
          "settings",
          "raisehand",
          "videoquality",
          "filmstrip",
          "feedback",
          "stats",
          "shortcuts",
          "tileview",
          "videobackgroundblur",
          "download",
          "help",
          "mute-everyone",
          "security",
        ],
        SETTINGS_SECTIONS: ["devices", "language", "moderator", "profile", "calendar"],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
        APP_NAME: "Kevonics Screen Share",
        NATIVE_APP_NAME: "Kevonics Screen Share",
        PROVIDER_NAME: "Kevonics Screen Share",
        LANG_DETECTION: false,
        CONNECTION_INDICATOR_DISABLED: false,
        VIDEO_QUALITY_LABEL_DISABLED: false,
        RECENT_LIST_ENABLED: false,
        AUTO_PIN_LATEST_SCREEN_SHARE: true,
        DISABLE_VIDEO_BACKGROUND: false,
        DISABLE_BLUR_SUPPORT: false,
        ...config.interfaceConfigOverwrite,
      },
      jwt: config.jwt || jwt,
      ...config,
      roomName: this.generateJaaSRoomName(config.roomName),
    }

    console.log("[v0] Creating JaaS room with config:", {
      domain: this.domain,
      roomName: defaultConfig.roomName,
      hasJWT: !!defaultConfig.jwt,
    })

    // Track the parent node for potential future cleanup (let Jitsi handle DOM removal)
    this.lastParent = (defaultConfig.parentNode as HTMLElement) || null

    this.api = new window.JitsiMeetExternalAPI(this.domain, defaultConfig)

    this.api.addEventListener("videoConferenceJoined", () => {
      console.log("[v0] Successfully joined JaaS conference")
    })

    this.api.addEventListener("videoConferenceLeft", () => {
      console.log("[v0] Left JaaS conference")
    })

    return this.api
  }

  async startScreenShare(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleShareScreen")
    }
  }

  async stopScreenShare(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleShareScreen")
    }
  }

  async muteAudio(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleAudio")
    }
  }

  async unmuteAudio(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleAudio")
    }
  }

  async muteVideo(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleVideo")
    }
  }

  async unmuteVideo(): Promise<void> {
    if (this.api) {
      await this.api.executeCommand("toggleVideo")
    }
  }

  addEventListener(event: string, listener: Function): void {
    if (this.api) {
      this.api.addEventListener(event, listener)
    }
  }

  removeEventListener(event: string, listener: Function): void {
    if (this.api) {
      this.api.removeEventListener(event, listener)
    }
  }

  dispose(): void {
    if (this.api) {
      this.api.dispose()
      this.api = null
    }
    // Avoid manual DOM child removals to prevent React reconciliation conflicts
  }

  getApi(): any {
    return this.api
  }
}

export const jitsiManager = new JitsiManager()
