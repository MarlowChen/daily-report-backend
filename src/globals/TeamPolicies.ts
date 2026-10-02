import type { GlobalConfig } from 'payload'

import { staffOnly } from '@/access/roles'

export const TeamPolicies: GlobalConfig = {
  slug: 'teamPolicies',
  label: '團隊規範',
  admin: {
    group: '登山隊管理',
  },
  access: {
    read: () => true,
    update: staffOnly,
  },
  fields: [
    {
      name: 'policyContent',
      type: 'richText',
      required: true,
      label: '活動規範',
    },
    {
      name: 'refundPolicy',
      type: 'array',
      label: '退費規則',
      labels: {
        singular: '退費規則',
        plural: '退費規則',
      },
      fields: [
        {
          name: 'tripType',
          type: 'select',
          required: true,
          label: '行程類型',
          options: [
            { label: '百岳行程', value: 'hundredPeaks' },
            { label: '一般行程', value: 'regular' },
          ],
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
          label: '規則說明',
        },
      ],
    },
    {
      name: 'aiSummary',
      type: 'textarea',
      label: 'AI 規範摘要',
      admin: {
        description: '建議整理成 AI 可以直接引用的簡短版本。',
      },
    },
  ],
}
