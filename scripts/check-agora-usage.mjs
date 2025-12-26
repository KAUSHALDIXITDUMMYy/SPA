#!/usr/bin/env node

/**
 * Agora Stream Cleanup Script - Usage API Version
 * 
 * This script checks Agora's Usage API to see current usage and billing information.
 * It can help identify if there are any unexpected charges or usage patterns.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

// Agora configuration
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

class AgoraUsageChecker {
  constructor() {
    this.usageData = null;
    this.errors = [];
  }

  /**
   * Check if we have the required credentials
   */
  checkCredentials() {
    console.log('🔍 Checking Agora credentials...');
    
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE environment variables are required');
    }
    
    console.log(`✅ Found APP_ID: ${AGORA_APP_ID.substring(0, 8)}...`);
    console.log(`✅ Found APP_CERTIFICATE: ${AGORA_APP_CERTIFICATE.substring(0, 8)}...`);
    
    return true;
  }

  /**
   * Try to get usage information from Agora Analytics API
   */
  async getUsageInfo() {
    console.log('\n📊 Attempting to fetch usage information...');
    
    try {
      // Try different Agora API endpoints that might work with APP_ID/APP_CERTIFICATE
      const endpoints = [
        `https://api.agora.io/v1/projects/${AGORA_APP_ID}/usage`,
        `https://api.agora.io/v1/projects/${AGORA_APP_ID}/analytics`,
        `https://api.agora.io/v1/projects/${AGORA_APP_ID}/billing`,
        `https://api.agora.io/dev/v1/projects/${AGORA_APP_ID}/usage`,
        `https://api.agora.io/dev/v1/projects/${AGORA_APP_ID}/analytics`
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`🔍 Trying endpoint: ${endpoint}`);
          
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from(`${AGORA_APP_ID}:${AGORA_APP_CERTIFICATE}`).toString('base64')}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`✅ Successfully fetched data from: ${endpoint}`);
            this.usageData = data;
            return data;
          } else {
            console.log(`❌ Failed: HTTP ${response.status} - ${response.statusText}`);
          }
        } catch (error) {
          console.log(`❌ Error: ${error.message}`);
        }
      }

      throw new Error('All API endpoints failed - may need Customer ID and Customer Secret');
    } catch (error) {
      console.error('❌ Error fetching usage information:', error);
      this.errors.push({ type: 'get_usage', error: error.message });
      return null;
    }
  }

  /**
   * Generate recommendations based on what we found
   */
  generateRecommendations() {
    console.log('\n💡 Recommendations:');
    
    if (this.errors.length > 0) {
      console.log('❌ Unable to access Agora APIs with current credentials');
      console.log('   - You need Customer ID and Customer Secret for REST API access');
      console.log('   - APP_ID and APP_CERTIFICATE are only for client-side token generation');
      console.log('');
      console.log('🔧 To get Customer ID and Customer Secret:');
      console.log('   1. Go to Agora Console (console.agora.io)');
      console.log('   2. Select your project');
      console.log('   3. Go to "Project Management" > "RESTful API"');
      console.log('   4. Generate Customer ID and Customer Secret');
      console.log('');
      console.log('🔄 Alternative approaches:');
      console.log('   - Check your Agora dashboard manually for usage');
      console.log('   - Monitor your billing statements');
      console.log('   - Implement client-side connection monitoring');
      console.log('   - Use Agora webhooks for real-time updates');
    } else if (this.usageData) {
      console.log('✅ Successfully retrieved usage data');
      console.log('   - Monitor this data regularly');
      console.log('   - Set up alerts for unusual usage patterns');
    } else {
      console.log('⚠️ No usage data available');
      console.log('   - Check your Agora dashboard manually');
      console.log('   - Monitor billing statements');
    }
  }

  /**
   * Main process
   */
  async runCheck() {
    console.log('🚀 Starting Agora Usage Check...\n');
    
    try {
      // Step 1: Check credentials
      this.checkCredentials();
      
      // Step 2: Try to get usage information
      await this.getUsageInfo();
      
      // Step 3: Generate recommendations
      this.generateRecommendations();
      
      console.log('\n🎉 Usage check completed!');
      
      return {
        success: this.errors.length === 0,
        hasUsageData: !!this.usageData,
        errors: this.errors
      };
      
    } catch (error) {
      console.error('❌ Usage check failed:', error);
      return {
        success: false,
        hasUsageData: false,
        errors: [{ type: 'general', error: error.message }]
      };
    }
  }
}

// Main execution
async function main() {
  const checker = new AgoraUsageChecker();
  
  try {
    const result = await checker.runCheck();
    
    if (result.success) {
      console.log('\n✅ Usage check completed successfully');
      process.exit(0);
    } else {
      console.log('\n⚠️ Usage check completed with issues');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run the script
main();

