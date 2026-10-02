import type { CollectionConfig } from 'payload'

import { staffOnly } from '@/access/roles'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'tripType', 'startDate', 'status', 'price'],
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
      path: '/open',
      method: 'get',
      handler: async (req) => {
        const url = new URL(req.url || 'http://payload.local')
        const limit = Number(url.searchParams.get('limit') ?? 10)

        const events = await req.payload.find({
          collection: 'events',
          where: {
            status: {
              equals: 'open',
            },
          },
          sort: 'startDate',
          limit: Number.isFinite(limit) ? limit : 10,
          depth: 1,
        })

        return Response.json(events)
      },
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: '活動名稱',
    },
    {
      name: 'tripType',
      type: 'select',
      required: true,
      defaultValue: 'regular',
      label: '行程類型',
      options: [
        { label: '百岳行程', value: 'hundredPeaks' },
        { label: '一般行程', value: 'regular' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planning',
      label: '活動狀態',
      options: [
        { label: '籌備中', value: 'planning' },
        { label: '報名中', value: 'open' },
        { label: '已滿團', value: 'full' },
        { label: '已結束', value: 'ended' },
        { label: '已取消', value: 'canceled' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startDate',
          type: 'date',
          required: true,
          label: '開始日期',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'endDate',
          type: 'date',
          required: true,
          label: '結束日期',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          type: 'number',
          required: true,
          min: 0,
          label: '費用',
        },
        {
          name: 'capacity',
          type: 'number',
          min: 1,
          label: '名額',
        },
      ],
    },
    {
      name: 'leaders',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: '帶隊幹部',
      filterOptions: {
        role: {
          in: ['admin', 'cadre'],
        },
      },
    },
    {
      name: 'mountains',
      type: 'array',
      label: '登頂/路線紀錄點',
      labels: {
        singular: '山岳',
        plural: '山岳',
      },
      admin: {
        description: '查詢個人登山履歷時會優先使用這裡的名稱。',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: '名稱',
        },
        {
          name: 'elevationMeters',
          type: 'number',
          min: 0,
          label: '海拔（公尺）',
        },
        {
          name: 'isHundredPeak',
          type: 'checkbox',
          defaultValue: false,
          label: '百岳',
        },
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
      label: '活動摘要',
      admin: {
        description: '給活動列表與摘要使用，建議 1-3 句。',
      },
    },
    {
      name: 'itinerary',
      type: 'richText',
      label: '行程內容',
    },
    {
      name: 'meetingPoint',
      type: 'text',
      label: '集合地點',
    },
    {
      name: 'registrationNote',
      type: 'textarea',
      label: '報名注意事項',
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: '封面圖',
    },
  ],
  timestamps: true,
}
