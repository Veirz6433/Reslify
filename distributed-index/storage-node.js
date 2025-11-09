const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');  // Node.js built-in crypto
const b4a = require('b4a');
const fs = require('fs');
const path = require('path');

class StorageNode {
  constructor(port = 8080) {
    this.swarm = new Hyperswarm();
    this.port = port;
    this.storedFiles = new Map();
    this.fileTopics = new Map();
    
    console.log('🗄️  Storage Node Initializing...');
    console.log(`📍 Node Address: 127.0.0.1:${this.port}`);
  }

  async storeFile(fileId, filePath) {
    console.log(`\n📁 Storing file: ${fileId}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.storedFiles.set(fileId, filePath); // creates a mapping of fileId to filePath
    
    // Create 32-byte topic using SHA-256 // basically hashing the fileId
    const topic = crypto.createHash('sha256')
      .update(fileId)
      .digest();
    
    this.fileTopics.set(fileId, topic);
    
    console.log(`File ID: ${fileId}`);
    console.log(`Topic (32 bytes): ${topic.toString('hex').substring(0, 20)}...`);
    console.log(`Local Path: ${filePath}`);

    this.swarm.join(topic, { server: true, client: false });
    await this.swarm.flush();
    
    console.log(`✅ File announced to network! Storage Node is ready to serve.`);
  }

  startServer() {
    this.swarm.on('connection', (conn, info) => {
      console.log('\n🔗 Client connected! Processing request...');
      
      let requestData = '';
      
      conn.on('data', (data) => {
        requestData += data.toString();
        
        if (requestData.includes('\n')) {
          const fileId = requestData.trim();
          console.log(`Client requested: ${fileId}`);
          // checks if file exists in local storage
          // if yes, sends file metadata and content in a json format to the client which requested it
          if (this.storedFiles.has(fileId)) {
            const filePath = this.storedFiles.get(fileId);
            
            try {
              const fileContent = fs.readFileSync(filePath, 'utf-8');
              const metadata = {
                fileId: fileId,
                fileName: path.basename(filePath),
                size: fileContent.length,
                content: fileContent
              };
              
              conn.write(JSON.stringify(metadata));
              console.log(`✅ Sent file to client: ${metadata.fileName} (${metadata.size} bytes)`);
              
            } catch (error) {
              conn.write(JSON.stringify({ error: 'Failed to read file' }));
              console.error('Error reading file:', error.message);
            }
          } else {
            conn.write(JSON.stringify({ error: 'File not found' }));
            console.log(`File not found: ${fileId}`);
          }
          
          setTimeout(() => conn.end(), 100);
        }
      });
      
      conn.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {
          console.error('Connection error:', err.message);
        }
      });
    });

    console.log('\n🚀 Storage Node is running and listening for requests...\n');
  }

  async shutdown() {
    console.log('\n👋 Shutting down Storage Node...');
    await this.swarm.destroy();
    process.exit(0);
  }
}

// ========== USAGE ==========

const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir);
}

const sampleFilePath = path.join(filesDir, 'hello-world.txt');
fs.writeFileSync(sampleFilePath, 'Hello from the distributed file system! This is the actual file content stored on the storage node.');

const storageNode = new StorageNode(8080);

storageNode.storeFile('file-abc123', sampleFilePath)
  .then(() => {
    storageNode.startServer();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

process.on('SIGINT', () => storageNode.shutdown());
