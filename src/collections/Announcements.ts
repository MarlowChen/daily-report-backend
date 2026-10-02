import type { CollectionConfig } from 'payload'

import { staffOnly } from '@/access/roles'

export const Announcements: CollectionConfig = {
  slug: 'announcements',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'status', 'publishAt', 'pinned'],
    group: '登山隊管理',
  },
  access: {
    read: () => true,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  endpoints: [
    {
      path: '/latest',
      method: 'get',
      handler: async (req) => {
        const url = new URL(req.url || 'http://payload.local')
        const limit = Number(url.searchParams.get('limit') ?? 5)

        const announcements = await req.payload.find({
          collection: 'announcements',
          where: {
            status: {
              equals: 'published',
            },
          },
          sort: '-publishAt',
          limit: Number.isFinite(limit) ? limit : 5,
          depth: 1,
        })

        return Response.json(announcements)
      },
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: '公告主旨',
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'general',
      label: '公告類型',
      options: [
        { label: '一般公告', value: 'general' },
        { label: '活動異動', value: 'eventChange' },
        { label: '尋物啟事', value: 'lostAndFound' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      label: '發布狀態',
      options: [
        { label: '草稿', value: 'draft' },
        { label: '已發布', value: 'published' },
        { label: '封存', value: 'archived' },
      ],
    },
    {
      name: 'publishAt',
      type: 'date',
      label: '發布時間',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'pinned',
      type: 'checkbox',
      defaultValue: false,
      label: '置頂',
    },
    {
      name: 'summary',
      type: 'textarea',
      label: 'AI 回覆摘要',
      admin: {
        description: '給公告摘要快速列點使用；未填時可退回讀公告內容。',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: '公告內容',
    },
    {
      name: 'relatedEvent',
      type: 'relationship',
      relationTo: 'events',
      label: '關聯活動',
    },
  ],
  timestamps: true,
}
