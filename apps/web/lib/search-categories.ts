export interface SearchCategory {
  id: string;
  label: string;
  query: string;
  previewIds: string[]; // Multiple images for collage effect
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'sunset',
    label: 'Sunset',
    query: 'sunset',
    previewIds: [
      '00000000-0000-7b90-a66a-536eba096900',
      '00000000-0000-7bca-b1fc-9a56eb7fd22c',
      '00000000-0000-76b2-8228-738ceda2fea6',
    ],
  },
  {
    id: 'night',
    label: 'Night',
    query: 'night city',
    previewIds: [
      '00000000-0000-794a-9cca-ccc943e5582b',
      '00000000-0000-7fc5-8e9a-87905a987fc9',
      '00000000-0000-7cec-922d-e91ec6900474',
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    query: 'architecture',
    previewIds: [
      '00000000-0000-7be1-9963-49a219469f23',
      '00000000-0000-7d82-9376-46c58a35b062',
      '00000000-0000-7550-8e4e-babd0bbefd82',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    query: 'nature landscape',
    previewIds: [
      '00000000-0000-7e2c-828b-5810a71e18af',
      '00000000-0000-7c9a-83ba-97147f838c1f',
      '00000000-0000-7e09-8860-58cd733276d8',
    ],
  },
  {
    id: 'street',
    label: 'Street',
    query: 'street photography',
    previewIds: [
      '00000000-0000-7dff-99b7-6ba2bb5dd5e4',
      '00000000-0000-732f-9a60-7ec92a1d7874',
      '00000000-0000-7729-9168-4b012163a813',
    ],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    query: 'ocean beach',
    previewIds: [
      '00000000-0000-7575-946d-491f1b21b93c',
      '00000000-0000-7fbb-91e7-fd8677b435ea',
      '00000000-0000-7156-96e6-86d09cad9994',
    ],
  },
  {
    id: 'mountains',
    label: 'Mountains',
    query: 'mountains',
    previewIds: [
      '00000000-0000-7e09-8860-58cd733276d8',
      '00000000-0000-7e2c-828b-5810a71e18af',
      '00000000-0000-76a8-8ed4-a00f829656b9',
    ],
  },
  {
    id: 'urban',
    label: 'Urban',
    query: 'urban city',
    previewIds: [
      '00000000-0000-7d82-9376-46c58a35b062',
      '00000000-0000-794a-9cca-ccc943e5582b',
      '00000000-0000-7be1-9963-49a219469f23',
    ],
  },
];
