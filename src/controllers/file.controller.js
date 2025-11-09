const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { PORT, SERVER_ADDRESS } = require('../config/constants');
const { getMimeType } = require('../utils/mime-types');

class FileController {
  constructor(dhtService) {
    this.dhtService = dhtService;
  }

  async uploadFile(req, res) {
    console.log('\n' + '='.repeat(60));
    console.log('📥 NEW FILE UPLOAD REQUEST');
    console.log('='.repeat(60));
    
    try {
      if (!req.file) {
        console.log('❌ No file provided in request');
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'Please provide a file in the "file" field'
        });
      }

      const fileId = uuidv4();
      
      console.log(`\n✅ File received successfully:`);
      console.log(`   📄 Original Name: ${req.file.originalname}`);
      console.log(`   💾 Saved As: ${req.file.filename}`);
      console.log(`   📊 Size: ${req.file.size} bytes (${(req.file.size / 1024).toFixed(2)} KB)`);
      console.log(`   📁 Location: ${req.file.path}`);
      console.log(`   🔑 Generated File ID: ${fileId}`);

      const dhtInfo = await this.dhtService.announceFile(
        fileId,
        req.file.path,
        req.file.originalname,
        req.file.size
      );

      const response = {
        success: true,
        fileId,
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
  }

  async retrieveFile(req, res) {
    console.log('\n' + '='.repeat(60));
    console.log('📥 NEW FILE RETRIEVE REQUEST');
    console.log('='.repeat(60));
    
    try {
      const fileId = req.params.fileId;
      console.log(`\n🔍 Step 1: Extracting file ID from URL`);
      console.log(`   🔑 Requested File ID: ${fileId}`);
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(fileId)) {
        console.log('   ❌ Invalid file ID format');
        return res.status(400).json({
          success: false,
          error: 'Invalid file ID',
          message: 'File ID must be a valid UUID v4'
        });
      }

      console.log(`\n🔍 Step 2: Performing DHT lookup`);
      
      const hasFile = this.dhtService.hasFile(fileId);
      
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

      console.log(`\n📂 Step 3: Performing local file lookup`);
      
      const filePath = this.dhtService.getFilePath(fileId);
      const fileMetadata = this.dhtService.getFileMetadata(fileId);
      
      console.log(`   📁 File Path: ${filePath}`);
      console.log(`   📄 File Name: ${fileMetadata.fileName}`);
      console.log(`   📊 File Size: ${fileMetadata.size} bytes`);

      if (!fs.existsSync(filePath)) {
        console.error('   ❌ File exists in DHT index but not on disk!');
        return res.status(500).json({
          success: false,
          error: 'File system error',
          message: 'File metadata exists but physical file is missing'
        });
      }

      console.log(`\n📤 Step 4: Sending file to client`);
      console.log(`   ✅ Initiating file download: ${fileMetadata.fileName}`);
      
      res.setHeader('Content-Type', getMimeType(fileMetadata.fileName));
      res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.fileName}"`);
      res.setHeader('X-File-ID', fileId);
      res.setHeader('X-Server-Address', SERVER_ADDRESS);
      
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
  }

  listFiles(req, res) {
    const files = this.dhtService.getStoredFilesInfo();
    res.json({
      success: true,
      count: files.length,
      serverAddress: SERVER_ADDRESS,
      files
    });
  }

  getHealth(req, res) {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      filesStored: this.dhtService.storedFiles.size,
      timestamp: new Date().toISOString()
    });
  }

  getInfo(req, res) {
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
  }
}

module.exports = FileController;
