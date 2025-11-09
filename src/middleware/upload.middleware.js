const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { UPLOAD_DIR, MAX_FILE_SIZE } = require('../config/constants');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/\s+/g, '-');
    const uniqueFilename = `${timestamp}-${uniqueId}-${sanitizedName}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    console.log(`\n📤 Receiving file upload: ${file.originalname}`);
    cb(null, true);
  }
});

module.exports = upload;
