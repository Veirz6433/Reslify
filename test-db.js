const db = require('./db');

async function testDatabase() {
  console.log('🧪 Testing Cassandra Database Module\n');

  try {
    // Initialize database
    await db.initializeDatabase();

    // Test 1: Store a file
    console.log('\n📝 TEST 1: Storing file metadata...');
    await db.storeFileMetadata(
      'test-file-123',
      '/uploads/test.txt',
      'test.txt',
      1024
    );

    // Test 2: Retrieve the file
    console.log('\n📝 TEST 2: Retrieving file metadata...');
    const file = await db.getFileMetadata('test-file-123');
    console.log('Retrieved:', file);

    // Test 3: Get all files
    console.log('\n📝 TEST 3: Getting all files...');
    const allFiles = await db.getAllFiles();
    console.log('Total files:', allFiles.length);

    // Test 4: Check if file exists
    console.log('\n📝 TEST 4: Checking file existence...');
    const exists = await db.fileExists('test-file-123');
    console.log('File exists:', exists);

    // Test 5: Delete the file
    console.log('\n📝 TEST 5: Deleting file metadata...');
    await db.deleteFileMetadata('test-file-123');

    // Test 6: Verify deletion
    console.log('\n📝 TEST 6: Verifying deletion...');
    const stillExists = await db.fileExists('test-file-123');
    console.log('File still exists:', stillExists);

    console.log('\n✅ All tests passed!');

    // Cleanup
    await db.shutdown();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await db.shutdown();
    process.exit(1);
  }
}

testDatabase();
