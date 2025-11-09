module.exports = {
  PORT: 3000,
  UPLOAD_DIR: './uploads',
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  get SERVER_ADDRESS() {
    return `127.0.0.1:${this.PORT}`;
  }
};
