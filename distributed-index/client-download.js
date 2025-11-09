// node which downloads a file from the distributed index storage node
const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');  // Node.js built-in crypto
const b4a = require('b4a');
const fs = require('fs');
const path = require('path');

class FileDownloader {
  constructor() {
    this.swarm = new Hyperswarm();
    console.log('📥 File Downloader Client Starting...\n');
  }

  async findAndDownload(fileId, saveDir = './downloads') {
    console.log('🔍 Step 1: Querying DHT index for file location...');
    console.log(`🔑 Looking for: ${fileId}`);
    
    // FIX: Create 32-byte topic using SHA-256
    const topic = crypto.createHash('sha256')
      .update(fileId)
      .digest();
    
    console.log(`📦 Topic (32 bytes): ${topic.toString('hex').substring(0, 20)}...`);
    
    console.log('🌐 Connecting to DHT network...');
    this.swarm.join(topic, { server: false, client: true });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: Storage node not found in DHT'));
      }, 10000);
      
      this.swarm.once('connection', (conn, info) => {
        clearTimeout(timeout);
        
        console.log('✅ Step 2: Found storage node in DHT!');
        console.log(`📍 Storage Node Address: ${conn.remoteHost || 'localhost'}:${conn.remotePort || 'unknown'}`);
        console.log('📡 Requesting file from storage node...\n');
        
        conn.write(fileId + '\n');
        
        let responseData = '';
        
        conn.on('data', (data) => {
          responseData += data.toString();
        });
        
        conn.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            
            console.log('✅ Step 3: File received from storage node!');
            console.log(`📄 File Name: ${response.fileName}`);
            console.log(`📊 File Size: ${response.size} bytes`);
            
            if (!fs.existsSync(saveDir)) {
              fs.mkdirSync(saveDir, { recursive: true });
            }
            
            const savePath = path.join(saveDir, response.fileName);
            fs.writeFileSync(savePath, response.content);
            
            console.log(`💾 Saved to: ${savePath}\n`);
            console.log('📄 File Content:');
            console.log('─'.repeat(50));
            console.log(response.content);
            console.log('─'.repeat(50));
            
            resolve({
              fileId: response.fileId,
              fileName: response.fileName,
              size: response.size,
              savedTo: savePath,
              storageNode: `localhost:${conn.remotePort || 'unknown'}`
            });
            
          } catch (error) {
            reject(new Error('Failed to parse response: ' + error.message));
          }
        });
        
        conn.on('error', (err) => {
          if (err.code !== 'ECONNRESET') {
            reject(err);
          }
        });
      });
    });
  }

  async shutdown() {
    console.log('\n👋 Shutting down downloader...');
    await this.swarm.destroy();
  }
}

// ========== USAGE ==========

async function main() {
  const downloader = new FileDownloader();
  
  try {
    console.log('⏳ Waiting for DHT network to stabilize...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const result = await downloader.findAndDownload('file-abc123');
    
    console.log('\n🎉 SUCCESS! Complete Download Summary:');
    console.log(JSON.stringify(result, null, 2));
    
    
    setTimeout(async () => {
      await downloader.shutdown();
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await downloader.shutdown();
    process.exit(1);
  }
}

main();
