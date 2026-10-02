import type { CollectionConfig } from 'payload'

import { adminOnly, isAdmin, isStaff } from '@/access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'role', 'phone'],
    group: '登山隊管理',
  },
  auth: true,
  access: {
    read: ({ req: { user } }) => {
      if (isStaff(user)) return true
      if (!user) return false
      const currentUser = user as { id: string | number }

      return {
        id: {
          equals: currentUser.id,
        },
      }
    },
    create: adminOnly,
    update: ({ req: { user } }) => {
      if (isStaff(user)) return true
      if (!user) return false
      const currentUser = user as { id: string | number }

      return {
        id: {
          equals: currentUser.id,
        },
      }
    },
    delete: adminOnly,
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
      required: true,
      label: '顯示名稱',
      admin: {
        description: '隊員常用稱呼。',
      },
    },
    {
      name: 'realName',
      type: 'text',
      label: '真實姓名',
      admin: {
        description: '報名活動使用的姓名。',
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      label: '角色',
      access: {
        update: ({ req: { user } }) => isAdmin(user),
      },
      options: [
        { label: '管理員', value: 'admin' },
        { label: '幹部', value: 'cadre' },
        { label: '一般隊員', value: 'user' },
      ],
    },
    {
      name: 'phone',
      type: 'text',
      label: '主聯絡電話',
    },
    {
      name: 'emergencyContact',
      type: 'group',
      label: '緊急聯絡人',
      fields: [
        {
          name: 'name',
          type: 'text',
          label: '姓名',
        },
        {
          name: 'phone',
          type: 'text',
          label: '電話',
        },
        {
          name: 'relationship',
          type: 'text',
          label: '關係',
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      label: '備註',
      access: {
        read: ({ req: { user } }) => isStaff(user),
        update: ({ req: { user } }) => isStaff(user),
      },
    },
  ],
}
