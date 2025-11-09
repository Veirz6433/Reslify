const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = 3000;
const UPLOAD_DIR = './uploads';
const SERVER_ADDRESS = `127.0.0.1:${PORT}`;

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created uploads directory: ${UPLOAD_DIR}`);
}

// ============================================================
// DHT STORAGE NODE CLASS (REFACTORED)
// ============================================================

class DHTStorageNode {
  constructor() {
    this.swarm = new Hyperswarm();
    this.storedFiles = new Map(); // fileId -> { filePath, fileName, topic, size, uploadedAt }
    this.fileIdToPath = new Map(); // NEW: Direct mapping fileId -> filePath for quick lookup
    this.setupConnectionHandler();
    
    console.log('🌐 DHT Storage Node initialized');
  }

  // Announce a file to the DHT network
  async announceFile(fileId, filePath, fileName, fileSize) {
    console.log(`\n📢 Announcing file to DHT network:`);
    console.log(`   🔑 File ID: ${fileId}`);
    console.log(`   📄 File Name: ${fileName}`);
    
    // Create 32-byte topic from file ID
    const topic = crypto.createHash('sha256')
      .update(fileId)
      .digest();
    
    // Store file metadata locally
    const fileMetadata = {
      filePath: filePath,
      fileName: fileName,
      topic: topic,
      size: fileSize,
      uploadedAt: new Date().toISOString(),
      serverAddress: SERVER_ADDRESS
    };
    
    this.storedFiles.set(fileId, fileMetadata);
    
    // NEW: Create direct fileId -> filePath mapping for quick retrieval
    this.fileIdToPath.set(fileId, filePath);
    
    console.log(`   📦 Topic: ${topic.toString('hex').substring(0, 20)}...`);
    console.log(`   📍 Server Address: ${SERVER_ADDRESS}`);
    
    // Join swarm as SERVER for this file
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

  // NEW: Get file path by file ID
  getFilePath(fileId) {
    return this.fileIdToPath.get(fileId);
  }

  // NEW: Get complete file metadata by file ID
  getFileMetadata(fileId) {
    return this.storedFiles.get(fileId);
  }

  // NEW: Check if this server has the file
  hasFile(fileId) {
    return this.storedFiles.has(fileId);
  }

  // Handle incoming download requests from DHT clients
  setupConnectionHandler() {
    this.swarm.on('connection', (conn, info) => {
      console.log('\n🔗 DHT Client connected! Processing download request...');
      
      let requestData = '';
      
      conn.on('data', (data) => {
        requestData += data.toString();
        
        // Check for complete request (ends with newline)
        if (requestData.includes('\n')) {
          const fileId = requestData.trim();
          console.log(`   📥 Requested File ID: ${fileId}`);
          
          // Check if we have this file
          if (this.storedFiles.has(fileId)) {
            const fileInfo = this.storedFiles.get(fileId);
            
            try {
              // Read file content from disk
              const fileContent = fs.readFileSync(fileInfo.filePath);
              
              // Prepare response metadata
              const response = {
                success: true,
                fileId: fileId,
                fileName: fileInfo.fileName,
                size: fileContent.length,
                mimeType: this.getMimeType(fileInfo.fileName),
                serverAddress: SERVER_ADDRESS,
                content: fileContent.toString('base64') // Encode as base64 for binary files
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
            console.log(`   ❌ File not found: ${fileId}`);
          }
          
          // Close connection after sending response
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

  // Helper function to determine MIME type
  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.json': 'application/json',
      '.zip': 'application/zip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Get all stored files info
  getStoredFilesInfo() {
    const filesInfo = [];
    for (const [fileId, info] of this.storedFiles) {
      filesInfo.push({
        fileId,
        fileName: info.fileName,
        size: info.size,
        uploadedAt: info.uploadedAt,
        serverAddress: info.serverAddress
      });
    }
    return filesInfo;
  }

  async shutdown() {
    console.log('\n👋 Shutting down DHT node...');
    await this.swarm.destroy();
  }
}

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/\s+/g, '-');
    const uniqueFilename = `${timestamp}-${uniqueId}-${sanitizedName}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    console.log(`\n📤 Receiving file upload: ${file.originalname}`);
    cb(null, true);
  }
});

// ============================================================
// EXPRESS SERVER SETUP
// ============================================================

const app = express();

// Initialize DHT Storage Node
const dhtNode = new DHTStorageNode();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROUTES
// ============================================================

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'DHT File Upload & Retrieve Server',
    version: '2.0.0',
    endpoints: {
      upload: 'POST /upload - Upload a file and announce to DHT',
      retrieve: 'GET /retrieve/:fileId - Download a file by ID',
      files: 'GET /files - List all stored files',
      health: 'GET /health - Server health check'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    filesStored: dhtNode.storedFiles.size,
    timestamp: new Date().toISOString()
  });
});

// List all stored files
app.get('/files', (req, res) => {
  const files = dhtNode.getStoredFilesInfo();
  res.json({
    success: true,
    count: files.length,
    serverAddress: SERVER_ADDRESS,
    files: files
  });
});

// ============================================================
// UPLOAD ENDPOINT (REFACTORED)
// ============================================================

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('📥 NEW FILE UPLOAD REQUEST');
  console.log('='.repeat(60));
  
  try {
    // Check if file was uploaded
    if (!req.file) {
      console.log('❌ No file provided in request');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a file in the "file" field'
      });
    }

    // Generate unique file ID
    const fileId = uuidv4();
    
    console.log(`\n✅ File received successfully:`);
    console.log(`   📄 Original Name: ${req.file.originalname}`);
    console.log(`   💾 Saved As: ${req.file.filename}`);
    console.log(`   📊 Size: ${req.file.size} bytes (${(req.file.size / 1024).toFixed(2)} KB)`);
    console.log(`   📁 Location: ${req.file.path}`);
    console.log(`   🔑 Generated File ID: ${fileId}`);

    // Announce file to DHT network (NOW INCLUDES FILE SIZE)
    const dhtInfo = await dhtNode.announceFile(
      fileId,
      req.file.path,
      req.file.originalname,
      req.file.size
    );

    // Send success response
    const response = {
      success: true,
      fileId: fileId,
      fileName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      dht: {
        announced: true,
        topic: dhtInfo.topic,
        serverAddress: dhtInfo.serverAddress
      },
      retrieveUrl: `http://localhost:${PORT}/retrieve/${fileId}`,
      message: 'File uploaded and announced to DHT network successfully'
    };

    console.log('\n✨ Upload complete! Sending response to client...');
    console.log(`   🔗 Retrieve URL: ${response.retrieveUrl}`);
    console.log('='.repeat(60) + '\n');

    res.status(200).json(response);

  } catch (error) {
    console.error('\n❌ Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

// ============================================================
// RETRIEVE ENDPOINT (NEW)
// ============================================================

app.get('/retrieve/:fileId', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('📥 NEW FILE RETRIEVE REQUEST');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Extract fileId from URL parameters
    const fileId = req.params.fileId;
    console.log(`\n🔍 Step 1: Extracting file ID from URL`);
    console.log(`   🔑 Requested File ID: ${fileId}`);
    
    // Validate fileId format (should be UUID v4)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      console.log('   ❌ Invalid file ID format');
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID',
        message: 'File ID must be a valid UUID v4'
      });
    }

    // Step 2: DHT Lookup - Check if this server has the file
    console.log(`\n🔍 Step 2: Performing DHT lookup`);
    
    const hasFile = dhtNode.hasFile(fileId);
    
    if (!hasFile) {
      console.log('   ❌ File not found on this server');
      console.log(`   💡 This server (${SERVER_ADDRESS}) does not have file: ${fileId}`);
      
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: `File with ID "${fileId}" not found on this server`,
        serverAddress: SERVER_ADDRESS,
        hint: 'The file may be on a different DHT node'
      });
    }
    
    console.log(`   ✅ File found on this server (${SERVER_ADDRESS})`);

    // Step 3: Local Lookup - Get the file path
    console.log(`\n📂 Step 3: Performing local file lookup`);
    
    const filePath = dhtNode.getFilePath(fileId);
    const fileMetadata = dhtNode.getFileMetadata(fileId);
    
    console.log(`   📁 File Path: ${filePath}`);
    console.log(`   📄 File Name: ${fileMetadata.fileName}`);
    console.log(`   📊 File Size: ${fileMetadata.size} bytes`);

    // Step 4: Verify file exists on disk
    if (!fs.existsSync(filePath)) {
      console.error('   ❌ File exists in DHT index but not on disk!');
      return res.status(500).json({
        success: false,
        error: 'File system error',
        message: 'File metadata exists but physical file is missing'
      });
    }

    // Step 5: Send the file to the client
    console.log(`\n📤 Step 4: Sending file to client`);
    console.log(`   ✅ Initiating file download: ${fileMetadata.fileName}`);
    
    // Set appropriate headers
    res.setHeader('Content-Type', dhtNode.getMimeType(fileMetadata.fileName));
    res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.fileName}"`);
    res.setHeader('X-File-ID', fileId);
    res.setHeader('X-Server-Address', SERVER_ADDRESS);
    
    // Send the file
    res.download(filePath, fileMetadata.fileName, (err) => {
      if (err) {
        console.error('   ❌ Error sending file:', err.message);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Download failed',
            message: err.message
          });
        }
      } else {
        console.log('   ✅ File sent successfully!');
        console.log('='.repeat(60) + '\n');
      }
    });

  } catch (error) {
    console.error('\n❌ Retrieve error:', error);
    console.log('='.repeat(60) + '\n');
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Retrieval failed',
        message: error.message
      });
    }
  }
});

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

// Handle multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size exceeds 10MB limit'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'Upload error',
      message: error.message
    });
  }
  next(error);
});

// General error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// ============================================================
// START SERVER
// ============================================================

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 DHT FILE UPLOAD & RETRIEVE SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`📍 Server running at: http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${path.resolve(UPLOAD_DIR)}`);
  console.log(`🌐 DHT network: Active and listening`);
  console.log(`🏠 Server Address: ${SERVER_ADDRESS}`);
  console.log('\n📚 Available Endpoints:');
  console.log(`   POST http://localhost:${PORT}/upload           - Upload files`);
  console.log(`   GET  http://localhost:${PORT}/retrieve/:fileId - Download files`);
  console.log(`   GET  http://localhost:${PORT}/files            - List files`);
  console.log(`   GET  http://localhost:${PORT}/health           - Health check`);
  console.log('\n💡 Ready to accept file uploads and retrieve requests!');
  console.log('='.repeat(60) + '\n');
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Received shutdown signal...');
  
  server.close(() => {
    console.log('✅ Express server closed');
  });
  
  await dhtNode.shutdown();
  
  console.log('👋 Server shutdown complete');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
