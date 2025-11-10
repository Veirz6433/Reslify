const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');
const fs = require('fs');
const { SERVER_ADDRESS } = require('../config/constants');
const { getMimeType } = require('../utils/mime-types');

class DHTService {
  constructor() {
    this.swarm = new Hyperswarm();
    this.activeTopics = new Map();
    this.setupConnectionHandler();
    console.log('🌐 DHT Storage Node initialized');
  }

  async announceFile(fileId, filePath, fileName, fileSize) {
    console.log(`\n📢 Announcing file to DHT network:`);
    console.log(`   🔑 File ID: ${fileId}`);
    console.log(`   📄 File Name: ${fileName}`);
    
    const topic = crypto.createHash('sha256').update(fileId).digest();
    
    this.activeTopics.set(fileId, {
      topic,
      fileName,
      filePath,
      announcedAt: new Date().toISOString()
    });
    
    console.log(`   📦 Topic: ${topic.toString('hex').substring(0, 20)}...`);
    console.log(`   📍 Server Address: ${SERVER_ADDRESS}`);
    
    this.swarm.join(topic, { server: true, client: false });
    await this.swarm.flush();
    
    console.log(`   ✅ File successfully announced to DHT network!`);
    
    return {
      fileId,
      fileName,
      topic: topic.toString('hex'),
      serverAddress: SERVER_ADDRESS
    };
  }

  setupConnectionHandler() {
    this.swarm.on('connection', (conn) => {
      console.log('\n🔗 DHT Client connected! Processing download request...');
      
      let requestData = '';
      
      conn.on('data', (data) => {
        requestData += data.toString();
        
        if (requestData.includes('\n')) {
          const fileId = requestData.trim();
          console.log(`   📥 Requested File ID: ${fileId}`);
          
          if (this.activeTopics.has(fileId)) {
            const fileInfo = this.activeTopics.get(fileId);
            
            try {
              const fileContent = fs.readFileSync(fileInfo.filePath);
              
              const response = {
                success: true,
                fileId,
                fileName: fileInfo.fileName,
                size: fileContent.length,
                mimeType: getMimeType(fileInfo.fileName),
                serverAddress: SERVER_ADDRESS,
                content: fileContent.toString('base64')
              };
              
              conn.write(JSON.stringify(response));
              console.log(`   ✅ Sent file: ${fileInfo.fileName} (${fileContent.length} bytes)`);
              
            } catch (error) {
              const errorResponse = {
                success: false,
                error: 'Failed to read file',
                message: error.message
              };
              conn.write(JSON.stringify(errorResponse));
              console.error(`   ❌ Error reading file:`, error.message);
            }
          } else {
            const errorResponse = {
              success: false,
              error: 'File not found',
              message: `No file with ID: ${fileId}`
            };
            conn.write(JSON.stringify(errorResponse));
            console.log(`   ❌ File not found in DHT: ${fileId}`);
          }
          
          setTimeout(() => conn.end(), 100);
        }
      });
      
      conn.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {
          console.error('   ⚠️  Connection error:', err.message);
        }
      });
    });
  }

  async shutdown() {
    console.log('\n👋 Shutting down DHT node...');
    await this.swarm.destroy();
  }
}

module.exports = DHTService;
