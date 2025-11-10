const express = require("express");
const path = require("path");
const fs = require("fs");
const { PORT, UPLOAD_DIR } = require("./src/config/constants");
const DHTService = require("./src/services/dht.service");
const FileController = require("./src/controllers/file.controller");
const createFileRoutes = require("./src/routes/file.routes");
const {
  handleMulterErrors,
  handleGeneralErrors,
} = require("./src/middleware/error.middleware");
const db = require("./db");
const { start } = require("repl");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created uploads directory: ${UPLOAD_DIR}`);
}

const app = express();
const dhtService = new DHTService();
const fileController = new FileController(dhtService);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", createFileRoutes(fileController));

app.use(handleMulterErrors);
app.use(handleGeneralErrors);

async function rehydrateDHT() {
  console.log("\n♻️ Rehydrating DHT from Cassandra database...");

  try {
    const files = await db.getAllFiles();
    
    if (files.length === 0) {
      console.log("no files in databse to rehydrate");
      return;
    }

    console.log(`found ${fileController.fileName} filke(s) in databse`);

    for (const file of files){
      if(!file.fieldId){
        console.log(` ⚠️  Skipping invalid file entry with missing fileId ${file.fileName}`);
        continue;
      }

      if(fs.existsSync(file.filePath)){
        await dhtService.announceFile(
          file.field,
          file.filePath,
          file.fileName,
          parseInt(file.fileSize)
        );
        console.log(` Rehydrated ${file.fileName}`);
      } else {
        console.log(` ⚠️ File missing on disk, skipping: ${file.fileName}`);
      } 
    }
    console.log("DHT rehydration complete!");
  } catch(error) {
    console.error("❌ Error during DHT rehydration:", error.message);
  }  
}

rehydrateDHT();

async function startServer() {
  try {
    await db.initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 DHT FILE UPLOAD & RETRIEVE SERVER STARTED");
      console.log("=".repeat(60));
      console.log(`📍 Server running at: http://localhost:${PORT}`);
      console.log(`📁 Upload directory: ${path.resolve(UPLOAD_DIR)}`);
      console.log(`🌐 DHT network: Active and listening`);
      console.log("\n📚 Available Endpoints:");
      console.log(
        `   POST http://localhost:${PORT}/upload           - Upload files`
      );
      console.log(
        `   GET  http://localhost:${PORT}/retrieve/:fileId - Download files`
      );
      console.log(
        `   GET  http://localhost:${PORT}/files            - List files`
      );
      console.log(
        `   GET  http://localhost:${PORT}/health           - Health check`
      );
      console.log("\n💡 Ready to accept file uploads and retrieve requests!");
      console.log("=".repeat(60) + "\n");
    });
    global.serverInstance = server;
  } catch (error) {
    console.error("\n failed to start server:", error);
    console.error("make sure cassandra is running and accessible");
    process.exit(1);
  }
}
startServer();

process.on("SIGINT", async () => {
  console.log("\n\n🛑 Received shutdown signal...");

  if(global.serverInstance) {
    global.serverInstance.close(() => {
      console.log("🛑 Express server closed");
    });

  await dhtService.shutdown();
  await db.shutdown();
  console.log("👋 Server shutdown complete");
  process.exit(0);
  }
});   

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
