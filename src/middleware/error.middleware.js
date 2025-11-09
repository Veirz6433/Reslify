const multer = require('multer');

function handleMulterErrors(error, req, res, next) {
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
}

function handleGeneralErrors(error, req, res, next) {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
}

module.exports = {
  handleMulterErrors,
  handleGeneralErrors
};
