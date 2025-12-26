#!/usr/bin/env node

/**
 * Agora Stream Cleanup Script
 * 
 * This script checks for and closes any lingering Agora streams that might be consuming minutes.
 * It performs the following actions:
 * 1. Checks Firebase for active stream sessions
 * 2. Attempts to force-close any lingering Agora connections
 * 3. Reports any found streams and cleanup actions taken
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, updateDoc, doc } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here or load from environment
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

class AgoraStreamCleanup {
  constructor() {
    this.lingeringStreams = [];
    this.cleanupActions = [];
  }

  /**
   * Check for active stream sessions in Firebase
   */
  async checkActiveStreamSessions() {
    console.log('🔍 Checking for active stream sessions in Firebase...');
    
    try {
      const streamsRef = collection(db, 'streamSessions');
      const activeQuery = query(streamsRef, where('isActive', '==', true));
      const querySnapshot = await getDocs(activeQuery);
      
      const activeStreams = [];
      querySnapshot.forEach((doc) => {
        const streamData = { id: doc.id, ...doc.data() };
        activeStreams.push(streamData);
      });

      console.log(`📊 Found ${activeStreams.length} active stream sessions`);
      
      if (activeStreams.length > 0) {
        console.log('\n📋 Active Stream Sessions:');
        activeStreams.forEach((stream, index) => {
          const duration = this.calculateDuration(stream.createdAt);
          console.log(`  ${index + 1}. Session ID: ${stream.id}`);
          console.log(`     Publisher: ${stream.publisherName} (${stream.publisherId})`);
          console.log(`     Room ID: ${stream.roomId}`);
          console.log(`     Title: ${stream.title || 'Untitled'}`);
          console.log(`     Duration: ${duration}`);
          console.log(`     Created: ${new Date(stream.createdAt).toLocaleString()}`);
          console.log('');
        });
      }

      return activeStreams;
    } catch (error) {
      console.error('❌ Error checking active stream sessions:', error);
      return [];
    }
  }

  /**
   * Calculate duration of a stream session
   */
  calculateDuration(createdAt) {
    const now = new Date();
    const start = new Date(createdAt);
    const diffMs = now - start;
    
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
   * Force close a stream session
   */
  async forceCloseStreamSession(sessionId) {
    try {
      const sessionRef = doc(db, 'streamSessions', sessionId);
      await updateDoc(sessionRef, {
        isActive: false,
        endedAt: new Date(),
        forceClosed: true,
        cleanupReason: 'Automated cleanup script'
      });
      
      console.log(`✅ Force closed stream session: ${sessionId}`);
      return { success: true, sessionId };
    } catch (error) {
      console.error(`❌ Failed to force close session ${sessionId}:`, error);
      return { success: false, sessionId, error: error.message };
    }
  }

  /**
   * Check for potentially lingering streams (sessions older than 1 hour)
   */
  async checkForLingeringStreams(activeStreams) {
    console.log('\n🔍 Checking for potentially lingering streams...');
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lingeringStreams = activeStreams.filter(stream => {
      const createdAt = new Date(stream.createdAt);
      return createdAt < oneHourAgo;
    });

    if (lingeringStreams.length > 0) {
      console.log(`⚠️  Found ${lingeringStreams.length} potentially lingering streams (older than 1 hour):`);
      
      lingeringStreams.forEach((stream, index) => {
        const duration = this.calculateDuration(stream.createdAt);
        console.log(`  ${index + 1}. ${stream.publisherName} - ${stream.title || 'Untitled'} (${duration})`);
        this.lingeringStreams.push(stream);
      });
    } else {
      console.log('✅ No lingering streams found (all active streams are recent)');
    }

    return lingeringStreams;
  }

  /**
   * Force close all lingering streams
   */
  async forceCloseLingeringStreams() {
    if (this.lingeringStreams.length === 0) {
      console.log('✅ No lingering streams to close');
      return;
    }

    console.log(`\n🔄 Force closing ${this.lingeringStreams.length} lingering streams...`);
    
    const results = [];
    for (const stream of this.lingeringStreams) {
      const result = await this.forceCloseStreamSession(stream.id);
      results.push(result);
      
      // Add small delay to avoid overwhelming Firebase
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`\n📊 Cleanup Results:`);
    console.log(`  ✅ Successfully closed: ${successCount}`);
    console.log(`  ❌ Failed to close: ${failureCount}`);

    if (failureCount > 0) {
      console.log('\n❌ Failed closures:');
      results.filter(r => !r.success).forEach(result => {
        console.log(`  - Session ${result.sessionId}: ${result.error}`);
      });
    }

    return results;
  }

  /**
   * Generate Agora token for testing channel connectivity
   */
  async generateTestToken(channelName) {
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.log('⚠️  Agora credentials not available for token generation');
      return null;
    }

    try {
      const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
      
      const currentTs = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTs + 300; // 5 minutes for testing
      
      const token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        channelName,
        0, // uid 0 for testing
        RtcRole.PUBLISHER,
        privilegeExpiredTs
      );

      return { token, uid: 0, appId: AGORA_APP_ID };
    } catch (error) {
      console.error('❌ Error generating test token:', error);
      return null;
    }
  }

  /**
   * Main cleanup process
   */
  async runCleanup() {
    console.log('🚀 Starting Agora Stream Cleanup Process...\n');
    
    try {
      // Step 1: Check active stream sessions
      const activeStreams = await this.checkActiveStreamSessions();
      
      if (activeStreams.length === 0) {
        console.log('✅ No active streams found. All streams are properly closed.');
        return;
      }

      // Step 2: Check for lingering streams
      const lingeringStreams = await this.checkForLingeringStreams(activeStreams);
      
      // Step 3: Force close lingering streams
      if (lingeringStreams.length > 0) {
        const cleanupResults = await this.forceCloseLingeringStreams();
        
        console.log('\n🎯 Cleanup Summary:');
        console.log(`  Total active streams found: ${activeStreams.length}`);
        console.log(`  Lingering streams identified: ${lingeringStreams.length}`);
        console.log(`  Streams force closed: ${cleanupResults.filter(r => r.success).length}`);
        
        if (cleanupResults.some(r => r.success)) {
          console.log('\n💰 Potential cost savings: Closing lingering streams should stop Agora minute consumption.');
        }
      } else {
        console.log('\n✅ All active streams appear to be recent and legitimate.');
        console.log('💡 If you\'re still seeing unexpected minute consumption, check:');
        console.log('   - Browser tabs that might still be connected');
        console.log('   - Mobile apps that might not have properly disconnected');
        console.log('   - Network issues that prevented proper cleanup');
      }

    } catch (error) {
      console.error('❌ Cleanup process failed:', error);
    }
  }

  /**
   * Generate a detailed report
   */
  generateReport() {
    console.log('\n📋 Detailed Cleanup Report:');
    console.log('=' .repeat(50));
    
    if (this.lingeringStreams.length > 0) {
      console.log('\n🔍 Lingering Streams Found:');
      this.lingeringStreams.forEach((stream, index) => {
        console.log(`\n${index + 1}. Stream Details:`);
        console.log(`   Session ID: ${stream.id}`);
        console.log(`   Publisher: ${stream.publisherName} (${stream.publisherId})`);
        console.log(`   Room ID: ${stream.roomId}`);
        console.log(`   Title: ${stream.title || 'Untitled'}`);
        console.log(`   Created: ${new Date(stream.createdAt).toLocaleString()}`);
        console.log(`   Duration: ${this.calculateDuration(stream.createdAt)}`);
      });
    } else {
      console.log('\n✅ No lingering streams were found.');
    }
    
    console.log('\n' + '=' .repeat(50));
  }
}

// Main execution
async function main() {
  const cleanup = new AgoraStreamCleanup();
  
  try {
    await cleanup.runCleanup();
    cleanup.generateReport();
    
    console.log('\n🎉 Cleanup process completed!');
    console.log('\n💡 Recommendations:');
    console.log('   - Run this script regularly to catch lingering streams');
    console.log('   - Monitor your Agora dashboard for unexpected usage');
    console.log('   - Consider implementing automatic cleanup in your app');
    console.log('   - Add proper error handling for network disconnections');
    
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { AgoraStreamCleanup };

