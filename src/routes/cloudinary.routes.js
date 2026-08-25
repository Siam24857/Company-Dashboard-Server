import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { uploadBuffer, deleteFile } from '../services/cloudinary.service.js'
import { uploadImageMiddleware, uploadDocMiddleware, handleUploadErrors } from '../middleware/upload.middleware.js'

const router = Router()

const folders = {
  avatar: 'idon/profiles',
  cover: 'idon/covers',
  resume: 'idon/resumes',
  attendance: 'idon/attendance',
  taskEvidence: 'idon/task-evidence',
}

const uploadToCloudinary = (file, folderKey, resourceType = 'image') =>
  uploadBuffer(file.buffer, {
    folder: folders[folderKey] || folderKey,
    resource_type: resourceType,
  })

const handleAvatarLikeUpload = async (req, res, userField) => {
  try {
    let url = req.body?.url
    let publicId = req.body?.publicId

    if (req.file) {
      const resourceType = req.file.mimetype === 'application/pdf' || req.file.mimetype.startsWith('text/') ? 'raw' : 'image'
      const uploaded = await uploadToCloudinary(req.file, userField, resourceType)
      url = uploaded.url
      publicId = uploaded.publicId
    }

    if (!url || !publicId) {
      return errorResponse(res, 'A file or url/publicId pair is required', 400)
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatarPublicId: true, coverPublicId: true, resumePublicId: true },
    })

    const oldPublicId = existingUser?.[userField === 'avatar' ? 'avatarPublicId' : userField === 'cover' ? 'coverPublicId' : 'resumePublicId']

    if (oldPublicId) {
      try {
        await deleteFile(oldPublicId)
      } catch (error) {
        console.error('Failed to delete old file:', error)
      }
    }

    const data = {}
    if (userField === 'avatar') {
      data.avatarUrl = url
      data.avatarPublicId = publicId
    } else if (userField === 'cover') {
      data.coverImageUrl = url
      data.coverPublicId = publicId
    } else {
      data.resumeUrl = url
      data.resumePublicId = publicId
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
    })

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

router.post('/avatar', authenticate, uploadImageMiddleware.single('file'), (req, res, next) => handleAvatarLikeUpload(req, res, 'avatar').catch(next))
router.post('/cover', authenticate, uploadImageMiddleware.single('file'), (req, res, next) => handleAvatarLikeUpload(req, res, 'cover').catch(next))
router.post('/resume', authenticate, uploadDocMiddleware.single('file'), (req, res, next) => handleAvatarLikeUpload(req, res, 'resume').catch(next))

router.post('/attendance-screenshot', authenticate, uploadImageMiddleware.single('file'), async (req, res, next) => {
  try {
    let url = req.body?.url
    let publicId = req.body?.publicId

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file, 'attendance')
      url = uploaded.url
      publicId = uploaded.publicId
    }

    if (!url || !publicId) {
      return errorResponse(res, 'A file or url/publicId pair is required', 400)
    }

    return successResponse(res, { url, publicId })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/task-evidence', authenticate, uploadImageMiddleware.single('file'), async (req, res, next) => {
  try {
    let url = req.body?.url
    let publicId = req.body?.publicId

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file, 'taskEvidence')
      url = uploaded.url
      publicId = uploaded.publicId
    }

    if (!url || !publicId) {
      return errorResponse(res, 'A file or url/publicId pair is required', 400)
    }

    return successResponse(res, { url, publicId })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/delete', authenticate, async (req, res) => {
  try {
    const { publicId } = req.body

    if (!publicId) {
      return errorResponse(res, 'publicId is required', 400)
    }

    await deleteFile(publicId)

    return successResponse(res, { message: 'File deleted successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.use(handleUploadErrors)

export default router
