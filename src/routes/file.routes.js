const express = require('express');
const upload = require('../middleware/upload.middleware');

function createFileRoutes(fileController) {
  const router = express.Router();

  router.get('/', (req, res) => fileController.getInfo(req, res));
  router.get('/health', (req, res) => fileController.getHealth(req, res));
  router.get('/files', (req, res) => fileController.listFiles(req, res));
  router.post('/upload', upload.single('file'), (req, res) => fileController.uploadFile(req, res));
  router.get('/retrieve/:fileId', (req, res) => fileController.retrieveFile(req, res));

  return router;
}

module.exports = createFileRoutes;
