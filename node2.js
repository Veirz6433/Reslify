const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');

// Wait a moment for Node 1 to be ready
setTimeout(async () => {
  const swarm2 = new Hyperswarm();

  // Same topic as Node 1
  const topic = crypto.createHash('sha256')
    .update('test-key')
    .digest();

  console.log('🚀 Node 2 (Client) starting...');
  console.log('🔗 Joining the DHT network...');
  console.log('📍 Topic:', topic.toString('hex').substring(0, 20) + '...');

  // Node 2 acts as a client - it will connect to servers
  swarm2.join(topic, { server: false, client: true });

  swarm2.on('connection', (conn, info) => {
    console.log('✅ Node 2 connected to Node 1!');
    
    // Send data to Node 1
    const message = 'hello from node 2';
    conn.write(message);
    console.log('📤 Node 2 sent:', message);

    setTimeout(() => {
      conn.end();
      console.log('👋 Node 2 closing connection...');
      
      setTimeout(async () => {
        await swarm2.destroy();
        console.log('✅ Node 2 shutdown complete');
        process.exit(0);
      }, 1000);
    }, 2000);
  });

  // Wait for connections to establish
  await swarm2.flush();
  console.log('⏳ Waiting for peer discovery...');

}, 2000); // Wait 2 seconds for Node 1 to be ready
