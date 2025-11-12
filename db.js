const cassandra = require('cassandra-driver');

// Use environment variables for Docker compatibility
const client = new cassandra.Client({
  contactPoints: [process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1'],
  localDataCenter: process.env.CASSANDRA_LOCAL_DATACENTER || 'datacenter1',
  keyspace: process.env.CASSANDRA_KEYSPACE || 'fs_metadata'
});

async function initializeDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 INITIALIZING CASSANDRA DATABASE');
  console.log('='.repeat(60));

  try {
    console.log('\n📡 Step 1: Connecting to Cassandra...');
    console.log(`   🔗 Contact Point: ${process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1'}`);
    
    // Use environment variables here too
    const tempClient = new cassandra.Client({
      contactPoints: [process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1'],
      localDataCenter: process.env.CASSANDRA_LOCAL_DATACENTER || 'datacenter1'
    });
    
    await tempClient.connect();
    console.log('   ✅ Connected to Cassandra successfully!');

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

    console.log('\n📋 Step 4: Creating table "access_logs"...');
    
    const createLogsTableQuery = `
      CREATE TABLE IF NOT EXISTS fs_metadata.access_logs (
        log_id timeuuid PRIMARY KEY,
        file_id text,
        client_id text,
        operation_type text,
        timestamp timestamp
      )
    `;
    
    await tempClient.execute(createLogsTableQuery);
    console.log('   ✅ Table "access_logs" created/verified!');

    await tempClient.shutdown();

    console.log('\n🔗 Step 5: Connecting to keyspace "fs_metadata"...');
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

async function storeFileMetadata(fileId, filePath, fileName, fileSize) {
  console.log(`\n💾 Storing file metadata in Cassandra:`);
  console.log(`   🔑 File ID: ${fileId}`);
  console.log(`   📄 File Name: ${fileName}`);

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

async function logAccess(fileId, clientId, operationType) {
  try {
    const query = `
      INSERT INTO access_logs (log_id, file_id, client_id, operation_type, timestamp)
      VALUES (now(), ?, ?, ?, toTimestamp(now()))
    `;
    
    await client.execute(query, [fileId, clientId, operationType], { prepare: true });
    
    console.log(`   📝 Access logged: ${operationType} by ${clientId}`);
    return true;
    
  } catch (error) {
    console.error(`   ⚠️  Failed to log access:`, error.message);
    return false;
  }
}

async function getAccessLogs(fileId, limit = 100) {
  try {
    const query = `
      SELECT log_id, file_id, client_id, operation_type, timestamp
      FROM access_logs
      WHERE file_id = ?
      LIMIT ?
    `;
    
    const result = await client.execute(query, [fileId, limit], { prepare: true });
    
    return result.rows.map(row => ({
      logId: row.log_id,
      fileId: row.file_id,
      clientId: row.client_id,
      operationType: row.operation_type,
      timestamp: row.timestamp
    }));
    
  } catch (error) {
    console.error('Error retrieving access logs:', error.message);
    throw error;
  }
}

async function getAllAccessLogs(limit = 1000) {
  try {
    const query = 'SELECT * FROM access_logs LIMIT ?';
    const result = await client.execute(query, [limit]);
    
    return result.rows.map(row => ({
      logId: row.log_id.toString(),
      fileId: row.file_id,
      clientId: row.client_id,
      operationType: row.operation_type,
      timestamp: row.timestamp
    }));
    
  } catch (error) {
    console.error('Error retrieving all access logs:', error.message);
    throw error;
  }
}

async function shutdown() {
  console.log('\n👋 Shutting down Cassandra client...');
  try {
    await client.shutdown();
    console.log('✅ Cassandra client closed successfully');
  } catch (error) {
    console.error('❌ Error shutting down Cassandra client:', error.message);
  }
}

module.exports = {
  initializeDatabase,
  storeFileMetadata,
  getFileMetadata,
  getAllFiles,
  deleteFileMetadata,
  fileExists,
  logAccess,
  getAccessLogs,
  getAllAccessLogs,
  shutdown,
  client
};
