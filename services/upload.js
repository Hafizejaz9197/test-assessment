/**
 * Multer upload handlers with file-type and size validation.
 * Errors are turned into friendly messages by uploadErrorHandler().
 */
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

/** Error with an HTTP status and a message safe to show teachers. */
class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Disk storage that gives every file a unique, safe name. */
function diskStorage(dir) {
  return multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      cb(null, id + ext);
    },
  });
}

const PDF_TYPES = ['application/pdf'];
const SHEET_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const SHEET_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];

/** Single chapter PDF (field "pdf"), max 25 MB. */
const chapterPdfUpload = multer({
  storage: diskStorage(config.dirs.uploads),
  limits: { fileSize: config.limits.chapterPdfBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (PDF_TYPES.includes(file.mimetype) && ext === '.pdf') return cb(null, true);
    cb(new UserError(`"${file.originalname}" is not a PDF. Please upload the chapter as a .pdf file.`));
  },
}).single('pdf');

/** Answer-sheet pages (JPG/PNG/PDF), max 10 MB each. Any field name allowed. */
const sheetUpload = multer({
  storage: diskStorage(config.dirs.sheets),
  limits: {
    fileSize: config.limits.sheetFileBytes,
    files: config.limits.maxStudents * config.limits.maxSheetFilesPerStudent,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (SHEET_TYPES.includes(file.mimetype) && SHEET_EXTS.includes(ext)) return cb(null, true);
    cb(new UserError(`"${file.originalname}" is not allowed. Answer sheets must be JPG, PNG or PDF.`));
  },
}).any();

/** Express error middleware: converts multer/user errors into JSON. */
function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const mb = (bytes) => Math.round(bytes / 1024 / 1024);
    const messages = {
      LIMIT_FILE_SIZE: req.path.includes('evaluate')
        ? `A file is too big. Each answer-sheet file must be under ${mb(config.limits.sheetFileBytes)} MB.`
        : `The PDF is too big. Maximum size is ${mb(config.limits.chapterPdfBytes)} MB.`,
      LIMIT_FILE_COUNT: 'Too many files uploaded at once.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field in upload.',
    };
    return res.status(400).json({ error: messages[err.code] || err.message });
  }
  if (err instanceof UserError) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
}

module.exports = { chapterPdfUpload, sheetUpload, uploadErrorHandler, UserError };
