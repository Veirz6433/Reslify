const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');

const swarm1 = new Hyperswarm();

// Create a topic (32-byte key)
const topic = crypto.createHash('sha256')
  .update('test-key')
  .digest();

console.log('🚀 Node 1 (Server) starting...');
console.log('📍 Topic:', topic.toString('hex').substring(0, 20) + '...');

// Node 1 acts as a server - it will receive connections
const discovery = swarm1.join(topic, { server: true, client: false });

swarm1.on('connection', (conn, info) => {
  console.log('🔗 Node 1 received connection from Node 2!');
  
  // Listen for data from Node 2
  conn.on('data', data => {
    console.log('✅ SUCCESS! Node 1 received:', data.toString('utf-8'));
    console.log('📦 Connection info:', {
      publicKey: info.publicKey.toString('hex').substring(0, 20) + '...',
      topics: info.topics ? info.topics.length : 0
    });
  });

  conn.on('error', err => console.error('Connection error:', err));
});

// Wait for full announcement
discovery.flushed().then(() => {
  console.log('✅ Node 1 fully announced and listening...');
});

process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down Node 1...');
  await swarm1.destroy();
  process.exit(0);
});
