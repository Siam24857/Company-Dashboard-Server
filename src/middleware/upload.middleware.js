import multer from 'multer'

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const DOC_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']

const makeFilter = (allowed) => (req, file, cb) => {
  if (allowed.includes(file.mimetype)) {
    return cb(null, true)
  }
  cb(new Error(`File type not allowed. Accepted: ${allowed.join(', ')}`))
}

export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: makeFilter(IMAGE_MIMES),
})

export const uploadDocMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: makeFilter([...IMAGE_MIMES, ...DOC_MIMES]),
})

export const handleUploadErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File is too large. Maximum allowed size is 10MB.' })
    }
    return res.status(400).json({ message: `Upload error: ${error.message}` })
  }
  if (error && error.message && error.message.includes('not allowed')) {
    return res.status(400).json({ message: error.message })
  }
  next(error)
}
