import { z } from 'zod'

export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: error.errors,
        })
      }
      return res.status(400).json({ message: 'Invalid request body' })
    }
  }
}
