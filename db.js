const cassandra = require('cassandra-driver');

// ============================================================
// CASSANDRA CLIENT CONFIGURATION
// ============================================================

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1'],  // Cassandra server address
  localDataCenter: 'datacenter1',  // Default datacenter name
  keyspace: 'fs_metadata'  // Will be created if doesn't exist
});

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

/**
 * Initialize the database: create keyspace and table
 * This should be called once when the server starts
 */
async function initializeDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 INITIALIZING CASSANDRA DATABASE');
  console.log('='.repeat(60));

  try {
    // Step 1: Connect without keyspace (to create it)
    console.log('\n📡 Step 1: Connecting to Cassandra...');
    
    const tempClient = new cassandra.Client({
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'datacenter1'
    });
    
    await tempClient.connect();
    console.log('   ✅ Connected to Cassandra successfully!');

    // Step 2: Create keyspace if it doesn't exist
    console.log('\n🗄️  Step 2: Creating keyspace "fs_metadata"...');
    
    const createKeyspaceQuery = `
      CREATE KEYSPACE IF NOT EXISTS fs_metadata
      WITH replication = {
        'class': 'SimpleStrategy',
        'replication_factor': 1
      }
    `;
    
    await tempClient.execute(createKeyspaceQuery);
    console.log('   ✅ Keyspace "fs_metadata" created/verified!');

    // Step 3: Create table if it doesn't exist
    console.log('\n📋 Step 3: Creating table "files"...');
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS fs_metadata.files (
        file_id text PRIMARY KEY,
        file_path text,
        file_name text,
        file_size bigint,
        uploaded_at timestamp
      )
    `;
    
    await tempClient.execute(createTableQuery);
    console.log('   ✅ Table "files" created/verified!');

    // Close temporary client
    await tempClient.shutdown();

    // Step 4: Connect with keyspace
    console.log('\n🔗 Step 4: Connecting to keyspace "fs_metadata"...');
    await client.connect();
    console.log('   ✅ Connected to keyspace successfully!');

    console.log('\n✨ Database initialization complete!');
    console.log('='.repeat(60) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ Database initialization failed:', error.message);
    console.error('📝 Error details:', error);
    throw error;
  }
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Store file metadata in Cassandra
 * @param {string} fileId - Unique file identifier (UUID)
 * @param {string} filePath - Path to file on disk
 * @param {string} fileName - Original file name
 * @param {number} fileSize - File size in bytes
 * @returns {Promise<boolean>} - Success status
 */
async function storeFileMetadata(fileId, filePath, fileName, fileSize) {
  console.log(`\n💾 Storing file metadata in Cassandra:`);
  console.log(`   🔑 File ID: ${fileId}`);
  console.log(`   📄 File Name: ${fileName}`);
  console.log(`   📁 File Path: ${filePath}`);

  try {
    const query = `
      INSERT INTO files (file_id, file_path, file_name, file_size, uploaded_at)
      VALUES (?, ?, ?, ?, toTimestamp(now()))
    `;

    const params = [fileId, filePath, fileName, fileSize];
    
    await client.execute(query, params, { prepare: true });
    
    console.log('   ✅ File metadata stored in Cassandra!');
    return true;

  } catch (error) {
    console.error('   ❌ Error storing file metadata:', error.message);
    throw error;
  }
}

/**
 * Retrieve file metadata from Cassandra
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<object|null>} - File metadata or null if not found
 */
async function getFileMetadata(fileId) {
  console.log(`\n🔍 Retrieving file metadata from Cassandra:`);
  console.log(`   🔑 File ID: ${fileId}`);

  try {
    const query = 'SELECT * FROM files WHERE file_id = ?';
    const result = await client.execute(query, [fileId], { prepare: true });

    if (result.rows.length === 0) {
      console.log('   ❌ File not found in database');
      return null;
    }

    const file = result.rows[0];
    console.log('   ✅ File metadata retrieved!');
    console.log(`   📄 File Name: ${file.file_name}`);
    console.log(`   📁 File Path: ${file.file_path}`);

    return {
      fileId: file.file_id,
      filePath: file.file_path,
      fileName: file.file_name,
      fileSize: file.file_size ? file.file_size.toString() : '0',
      uploadedAt: file.uploaded_at
    };

  } catch (error) {
    console.error('   ❌ Error retrieving file metadata:', error.message);
    throw error;
  }
}

/**
 * Get all files from Cassandra
 * @returns {Promise<Array>} - Array of file metadata objects
 */
async function getAllFiles() {
  console.log('\n📂 Retrieving all files from Cassandra...');

  try {
    const query = 'SELECT * FROM files';
    const result = await client.execute(query);

    const files = result.rows.map(row => ({
      fileId: row.file_id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size ? row.file_size.toString() : '0',
      uploadedAt: row.uploaded_at
    }));

    console.log(`   ✅ Retrieved ${files.length} files from database`);
    return files;

  } catch (error) {
    console.error('   ❌ Error retrieving all files:', error.message);
    throw error;
  }
}

/**-*
 * Delete file metadata from Cassandra
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<boolean>} - Success status
 */
async function deleteFileMetadata(fileId) {
  console.log(`\n🗑️  Deleting file metadata from Cassandra:`);
  console.log(`   🔑 File ID: ${fileId}`);

  try {
    const query = 'DELETE FROM files WHERE file_id = ?';
    await client.execute(query, [fileId], { prepare: true });

    console.log('   ✅ File metadata deleted from Cassandra!');
    return true;

  } catch (error) {
    console.error('   ❌ Error deleting file metadata:', error.message);
    throw error;
  }
}

/**
 * Check if a file exists in Cassandra
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<boolean>} - True if file exists
 */
async function fileExists(fileId) {
  try {
    const query = 'SELECT file_id FROM files WHERE file_id = ?';
    const result = await client.execute(query, [fileId], { prepare: true });
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking file existence:', error.message);
    return false;
  }
}

/**
 * Gracefully shutdown the Cassandra client
 */
async function shutdown() {
  console.log('\n👋 Shutting down Cassandra client...');
  try {
    await client.shutdown();
    console.log('✅ Cassandra client closed successfully');
  } catch (error) {
    console.error('❌ Error shutting down Cassandra client:', error.message);
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  initializeDatabase,
  storeFileMetadata,
  getFileMetadata,
  getAllFiles,
  deleteFileMetadata,
  fileExists,
  shutdown,
  client  // Export client for advanced usage if needed
};
