import type { Access } from 'payload'

type UserWithRole = {
  id?: string | number
  role?: 'admin' | 'cadre' | 'user' | null
}

export const isStaff = (user: unknown): user is UserWithRole => {
  const role = (user as UserWithRole | null)?.role

  return role === 'admin' || role === 'cadre'
}

export const isAdmin = (user: unknown): user is UserWithRole => {
  return (user as UserWithRole | null)?.role === 'admin'
}

export const staffOnly: Access = ({ req: { user } }) => {
  return isStaff(user)
}

export const adminOnly: Access = ({ req: { user } }) => {
  return isAdmin(user)
}

export const authenticated: Access = ({ req: { user } }) => {
  return Boolean(user)
}
