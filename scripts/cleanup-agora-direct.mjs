#!/usr/bin/env node

/**
 * Agora Stream Cleanup Script - Direct API Version
 * 
 * This script directly checks Agora API for active channels and users,
 * then force disconnects any lingering connections that might be consuming minutes.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

// Firebase configuration (for logging purposes)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Agora configuration
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;

// Agora API endpoints
const AGORA_BASE_URL = 'https://api.agora.io';

class AgoraDirectCleanup {
  constructor() {
    this.activeChannels = [];
    this.activeUsers = [];
    this.disconnectedUsers = [];
    this.errors = [];
  }

  /**
   * Generate Agora API authentication header
   */
  generateAuthHeader() {
    if (!AGORA_CUSTOMER_ID || !AGORA_CUSTOMER_SECRET) {
      throw new Error('AGORA_CUSTOMER_ID and AGORA_CUSTOMER_SECRET environment variables are required');
    }
    
    const credentials = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Get all active channels from Agora API
   */
  async getActiveChannels() {
    console.log('🔍 Fetching active channels from Agora API...');
    
    try {
      const authHeader = this.generateAuthHeader();
      const response = await fetch(`${AGORA_BASE_URL}/v1/projects/${AGORA_APP_ID}/rtls/channels`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'X-Request-ID': this.generateRequestId()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.activeChannels = data.data || [];
      
      console.log(`📊 Found ${this.activeChannels.length} active channels`);
      
      if (this.activeChannels.length > 0) {
        console.log('\n📋 Active Channels:');
        this.activeChannels.forEach((channel, index) => {
          console.log(`  ${index + 1}. Channel: ${channel.channelName}`);
          console.log(`     Users: ${channel.userCount || 0}`);
          console.log(`     Created: ${new Date(channel.created * 1000).toLocaleString()}`);
          console.log(`     Duration: ${this.calculateDuration(channel.created * 1000)}`);
          console.log('');
        });
      }

      return this.activeChannels;
    } catch (error) {
      console.error('❌ Error fetching active channels:', error);
      this.errors.push({ type: 'get_channels', error: error.message });
      return [];
    }
  }

  /**
   * Get users in a specific channel
   */
  async getChannelUsers(channelName) {
    try {
      const authHeader = this.generateAuthHeader();
      const response = await fetch(`${AGORA_BASE_URL}/v1/projects/${AGORA_APP_ID}/rtls/channels/${encodeURIComponent(channelName)}/users`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'X-Request-ID': this.generateRequestId()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error(`❌ Error fetching users for channel ${channelName}:`, error);
      return [];
    }
  }

  /**
   * Force kick a user from a channel
   */
  async kickUserFromChannel(channelName, userId) {
    try {
      const authHeader = this.generateAuthHeader();
      const response = await fetch(`${AGORA_BASE_URL}/v1/projects/${AGORA_APP_ID}/rtls/channels/${encodeURIComponent(channelName)}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'X-Request-ID': this.generateRequestId()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`✅ Successfully kicked user ${userId} from channel ${channelName}`);
      return { success: true, channelName, userId };
    } catch (error) {
      console.error(`❌ Failed to kick user ${userId} from channel ${channelName}:`, error);
      return { success: false, channelName, userId, error: error.message };
    }
  }

  /**
   * Check for lingering channels (channels with users for more than 1 hour)
   */
  async checkForLingeringChannels() {
    console.log('\n🔍 Checking for potentially lingering channels...');
    
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const lingeringChannels = this.activeChannels.filter(channel => {
      const createdTime = channel.created * 1000;
      return createdTime < oneHourAgo && (channel.userCount || 0) > 0;
    });

    if (lingeringChannels.length > 0) {
      console.log(`⚠️ Found ${lingeringChannels.length} potentially lingering channels:`);
      
      for (const channel of lingeringChannels) {
        const duration = this.calculateDuration(channel.created * 1000);
        console.log(`  - ${channel.channelName} (${duration}, ${channel.userCount} users)`);
        
        // Get users in this channel
        const users = await this.getChannelUsers(channel.channelName);
        this.activeUsers.push(...users.map(user => ({
          ...user,
          channelName: channel.channelName
        })));
      }
    } else {
      console.log('✅ No lingering channels found (all active channels are recent or empty)');
    }

    return lingeringChannels;
  }

  /**
   * Force disconnect all users from lingering channels
   */
  async forceDisconnectLingeringUsers() {
    if (this.activeUsers.length === 0) {
      console.log('✅ No users to disconnect');
      return [];
    }

    console.log(`\n🔄 Force disconnecting ${this.activeUsers.length} users from lingering channels...`);
    
    const results = [];
    for (const user of this.activeUsers) {
      const result = await this.kickUserFromChannel(user.channelName, user.uid);
      results.push(result);
      
      if (result.success) {
        this.disconnectedUsers.push(user);
      }
      
      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`\n📊 Disconnection Results:`);
    console.log(`  ✅ Successfully disconnected: ${successCount}`);
    console.log(`  ❌ Failed to disconnect: ${failureCount}`);

    if (failureCount > 0) {
      console.log('\n❌ Failed disconnections:');
      results.filter(r => !r.success).forEach(result => {
        console.log(`  - Channel ${result.channelName}, User ${result.userId}: ${result.error}`);
      });
    }

    return results;
  }

  /**
   * Update Firebase with cleanup results
   */
  async updateFirebaseWithResults() {
    if (this.disconnectedUsers.length === 0) return;

    console.log('\n📝 Updating Firebase with cleanup results...');
    
    try {
      // Log cleanup results to Firebase
      const cleanupLog = {
        timestamp: new Date(),
        type: 'agora_direct_cleanup',
        channelsChecked: this.activeChannels.length,
        usersDisconnected: this.disconnectedUsers.length,
        errors: this.errors.length,
        details: {
          activeChannels: this.activeChannels.map(c => ({
            channelName: c.channelName,
            userCount: c.userCount,
            created: new Date(c.created * 1000)
          })),
          disconnectedUsers: this.disconnectedUsers.map(u => ({
            uid: u.uid,
            channelName: u.channelName,
            joinedAt: u.joinedAt
          }))
        }
      };

      const logsRef = collection(db, 'cleanupLogs');
      await addDoc(logsRef, cleanupLog);
      
      console.log('✅ Cleanup results logged to Firebase');
    } catch (error) {
      console.error('❌ Failed to log cleanup results to Firebase:', error);
    }
  }

  /**
   * Calculate duration from timestamp
   */
  calculateDuration(timestamp) {
    const now = Date.now();
    const diffMs = now - timestamp;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `cleanup-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Main cleanup process
   */
  async runCleanup() {
    console.log('🚀 Starting Agora Direct API Cleanup Process...\n');
    
    try {
      // Step 1: Get active channels from Agora API
      const activeChannels = await this.getActiveChannels();
      
      if (activeChannels.length === 0) {
        console.log('✅ No active channels found. All streams are properly closed.');
        return {
          activeChannels: 0,
          lingeringChannels: 0,
          disconnectedUsers: 0
        };
      }

      // Step 2: Check for lingering channels
      const lingeringChannels = await this.checkForLingeringChannels();
      
      // Step 3: Force disconnect users from lingering channels
      let disconnectedUsers = 0;
      if (lingeringChannels.length > 0) {
        const disconnectResults = await this.forceDisconnectLingeringUsers();
        disconnectedUsers = disconnectResults.filter(r => r.success).length;
        
        console.log('\n🎯 Cleanup Summary:');
        console.log(`  Total active channels found: ${activeChannels.length}`);
        console.log(`  Lingering channels identified: ${lingeringChannels.length}`);
        console.log(`  Users force disconnected: ${disconnectedUsers}`);
        
        if (disconnectedUsers > 0) {
          console.log('\n💰 Cost savings: Disconnecting lingering users should stop Agora minute consumption.');
        }
      } else {
        console.log('\n✅ All active channels appear to be recent and legitimate.');
        console.log('💡 If you\'re still seeing unexpected minute consumption, check:');
        console.log('   - Browser tabs that might still be connected');
        console.log('   - Mobile apps that might not have properly disconnected');
        console.log('   - Network issues that prevented proper cleanup');
      }

      // Step 4: Update Firebase with results
      await this.updateFirebaseWithResults();

      return {
        activeChannels: activeChannels.length,
        lingeringChannels: lingeringChannels.length,
        disconnectedUsers: disconnectedUsers
      };

    } catch (error) {
      console.error('❌ Cleanup process failed:', error);
      throw error;
    }
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    console.log('\n📋 Detailed Cleanup Report:');
    console.log('=' .repeat(50));
    
    if (this.activeChannels.length > 0) {
      console.log('\n🔍 Active Channels Found:');
      this.activeChannels.forEach((channel, index) => {
        console.log(`\n${index + 1}. Channel Details:`);
        console.log(`   Channel Name: ${channel.channelName}`);
        console.log(`   User Count: ${channel.userCount || 0}`);
        console.log(`   Created: ${new Date(channel.created * 1000).toLocaleString()}`);
        console.log(`   Duration: ${this.calculateDuration(channel.created * 1000)}`);
      });
    }
    
    if (this.disconnectedUsers.length > 0) {
      console.log('\n👥 Users Disconnected:');
      this.disconnectedUsers.forEach((user, index) => {
        console.log(`\n${index + 1}. User Details:`);
        console.log(`   UID: ${user.uid}`);
        console.log(`   Channel: ${user.channelName}`);
        console.log(`   Joined: ${new Date(user.joinedAt * 1000).toLocaleString()}`);
      });
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      this.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.type}: ${error.error}`);
      });
    }
    
    console.log('\n' + '=' .repeat(50));
  }
}

// Main execution
async function main() {
  const cleanup = new AgoraDirectCleanup();
  
  try {
    const results = await cleanup.runCleanup();
    cleanup.generateReport();
    
    console.log('\n🎉 Direct API cleanup process completed!');
    console.log('\n💡 Recommendations:');
    console.log('   - Run this script regularly to catch lingering connections');
    console.log('   - Monitor your Agora dashboard for unexpected usage');
    console.log('   - Set up webhooks for real-time channel monitoring');
    console.log('   - Consider implementing automatic cleanup in your app');
    
    // Exit with appropriate code
    if (results.disconnectedUsers > 0) {
      console.log(`\n⚠️ Found and disconnected ${results.disconnectedUsers} lingering users!`);
      process.exit(0);
    } else if (results.activeChannels > 0) {
      console.log(`\nℹ️ Found ${results.activeChannels} active channels (all recent)`);
      process.exit(0);
    } else {
      console.log('\n✅ No active channels found');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run the script
main();

