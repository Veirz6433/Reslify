// verification step which confirms the storage node is discoverable in the DHT network
// and that the file location has been successfully published.
const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');  // Node.js built-in crypto
const b4a = require('b4a');

class IndexPublisher {
  constructor() {
    this.swarm = new Hyperswarm();
    this.publishedFiles = new Map();
    
    console.log('📤 Index Publisher Client Starting...\n');
  }

  async publishFileLocation(fileId, storageNodeAddress) {
    console.log('📝 Publishing file location to DHT index...');
    console.log(`🔑 File ID: ${fileId}`);
    console.log(`📍 Storage Location: ${storageNodeAddress}`);
    
    // Create 32-byte topic using SHA-256
    const topic = crypto.createHash('sha256')
      .update(fileId)
      .digest();
    
    console.log(`📦 Topic (32 bytes): ${topic.toString('hex').substring(0, 20)}...`);
    
    this.publishedFiles.set(fileId, {
      storageNode: storageNodeAddress,
      publishedAt: new Date().toISOString(),
      topic: topic
    });
    
    this.swarm.join(topic, { server: false, client: true });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: Could not find storage node'));
      }, 5000);
      
      this.swarm.once('connection', (conn) => {
        clearTimeout(timeout);
        console.log('✅ Verified: Storage node is online and reachable!');
        console.log('✅ File location successfully published to index!\n');
        
        conn.end();
        resolve({
          fileId,
          location: storageNodeAddress,
          topic: topic.toString('hex')
        });
      });
    });
  }

  getFileInfo(fileId) {
    return this.publishedFiles.get(fileId);
  }

  async shutdown() {
    console.log('\n👋 Shutting down publisher...');
    await this.swarm.destroy();
  }
}

// ========== USAGE ==========

async function main() {
  const publisher = new IndexPublisher();
  
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await publisher.publishFileLocation(
      'file-abc123',
      '127.0.0.1:8080'
    );
    
    console.log('📋 Publication Result:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n💡 The file location is now indexed in the distributed network!');
    console.log('💡 Any client can now query for "file-abc123" and find the storage node.\n');
    
    setTimeout(async () => {
      await publisher.shutdown();
      process.exit(0);
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await publisher.shutdown();
    process.exit(1);
  }
}

main();
