import type { CollectionConfig } from 'payload'

import { staffOnly } from '@/access/roles'

export const Registrations: CollectionConfig = {
  slug: 'registrations',
  admin: {
    useAsTitle: 'displayTitle',
    defaultColumns: ['displayTitle', 'mainContact', 'event', 'status', 'attendance'],
    group: '登山隊管理',
  },
  access: {
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'displayTitle',
      type: 'text',
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [
          ({ siblingData }) => {
            const event = siblingData.event ? `活動 ${String(siblingData.event)}` : '未選活動'
            const contact = siblingData.mainContact ? `主報名人 ${String(siblingData.mainContact)}` : '未選主報名人'

            return `${event} / ${contact}`
          },
        ],
      },
    },
    {
      name: 'mainContact',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: '主報名人',
    },
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      label: '活動',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pendingDocuments',
      label: '報名狀態',
      options: [
        { label: '待補件', value: 'pendingDocuments' },
        { label: '待繳費', value: 'pendingPayment' },
        { label: '已完成', value: 'completed' },
        { label: '已取消', value: 'canceled' },
      ],
    },
    {
      name: 'attendance',
      type: 'select',
      required: true,
      defaultValue: 'notSet',
      label: '主報名人出席狀態',
      options: [
        { label: '未標記', value: 'notSet' },
        { label: '未出席', value: 'absent' },
        { label: '已出席', value: 'attended' },
        { label: '中途撤退', value: 'retreated' },
      ],
    },
    {
      name: 'participants',
      type: 'array',
      label: '攜伴名單',
      labels: {
        singular: '攜伴',
        plural: '攜伴',
      },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'linkedUser',
          type: 'relationship',
          relationTo: 'users',
          label: '已綁定隊員',
        },
        {
          name: 'name',
          type: 'text',
          required: true,
          label: '姓名',
        },
        {
          name: 'idNumber',
          type: 'text',
          label: '身分證/證件號（選填）',
        },
        {
          name: 'birthDate',
          type: 'date',
          label: '生日（選填）',
        },
        {
          name: 'phone',
          type: 'text',
          label: '聯絡電話（選填）',
        },
        {
          name: 'attendance',
          type: 'select',
          defaultValue: 'notSet',
          label: '出席狀態',
          options: [
            { label: '未標記', value: 'notSet' },
            { label: '未出席', value: 'absent' },
            { label: '已出席', value: 'attended' },
            { label: '中途撤退', value: 'retreated' },
          ],
        },
      ],
    },
    {
      name: 'agreedToTerms',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: '已同意活動規範',
    },
    {
      name: 'payment',
      type: 'group',
      label: '付款資訊',
      fields: [
        {
          name: 'amount',
          type: 'number',
          min: 0,
          label: '付款金額',
        },
        {
          name: 'paidAt',
          type: 'date',
          label: '付款時間',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'note',
          type: 'textarea',
          label: '付款備註',
        },
      ],
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      label: '內部備註',
    },
  ],
  timestamps: true,
}
