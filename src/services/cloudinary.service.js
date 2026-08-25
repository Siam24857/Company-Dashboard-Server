import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const folders = {
  avatar: 'idon/profiles',
  cover: 'idon/covers',
  resume: 'idon/resumes',
  attendance: 'idon/attendance',
  taskEvidence: 'idon/task-evidence',
}

const uploadStream = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error)
      resolve(result)
    })
    stream.end(buffer)
  })

export const uploadImage = async (file, folderKey = 'avatar') => {
  try {
    const folder = folders[folderKey] || folderKey
    const result = await cloudinary.uploader.upload(file, {
      folder,
      resource_type: 'image',
    })

    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
}

export const uploadBuffer = async (fileBuffer, options = {}) => {
  try {
    const result = await uploadStream(fileBuffer, options)
    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }
}

export const uploadResume = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: folders.resume,
      resource_type: 'raw',
    })

    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error) {
    throw new Error(`Resume upload failed: ${error.message}`)
  }
}

export const uploadAttendanceScreenshot = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: folders.attendance,
      resource_type: 'image',
    })

    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error) {
    throw new Error(`Attendance screenshot upload failed: ${error.message}`)
  }
}

export const uploadTaskEvidence = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: folders.taskEvidence,
      resource_type: 'image',
    })

    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error) {
    throw new Error(`Task evidence upload failed: ${error.message}`)
  }
}

export const deleteFile = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId)
    return { message: 'File deleted successfully' }
  } catch (error) {
    throw new Error(`File deletion failed: ${error.message}`)
  }
}
