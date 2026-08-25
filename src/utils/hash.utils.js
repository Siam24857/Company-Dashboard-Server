import bcrypt from 'bcryptjs'

export const hashPassword = async (password) => {
  return bcrypt.hash(password, 12)
}

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash)
}

export const validatePassword = (password) => {
  const minLength = password.length >= 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

  return {
    isValid: minLength && hasUpperCase && hasNumber && hasSpecialChar,
    errors: {
      minLength: !minLength ? 'Password must be at least 8 characters' : null,
      hasUpperCase: !hasUpperCase ? 'Password must contain at least one uppercase letter' : null,
      hasNumber: !hasNumber ? 'Password must contain at least one number' : null,
      hasSpecialChar: !hasSpecialChar ? 'Password must contain at least one special character' : null,
    },
  }
}
