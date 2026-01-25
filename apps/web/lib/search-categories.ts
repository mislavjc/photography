export interface SearchCategory {
  id: string;
  label: string;
  query: string;
  previewId: string;
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'sunset',
    label: 'Sunset',
    query: 'sunset',
    previewId: '00000000-0000-7b90-a66a-536eba096900',
  },
  {
    id: 'night',
    label: 'Night',
    query: 'night city',
    previewId: '00000000-0000-794a-9cca-ccc943e5582b',
  },
  {
    id: 'architecture',
    label: 'Architecture',
    query: 'architecture',
    previewId: '00000000-0000-7be1-9963-49a219469f23',
  },
  {
    id: 'nature',
    label: 'Nature',
    query: 'nature landscape',
    previewId: '00000000-0000-7e2c-828b-5810a71e18af',
  },
  {
    id: 'street',
    label: 'Street',
    query: 'street photography',
    previewId: '00000000-0000-7dff-99b7-6ba2bb5dd5e4',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    query: 'ocean beach',
    previewId: '00000000-0000-7575-946d-491f1b21b93c',
  },
  {
    id: 'mountains',
    label: 'Mountains',
    query: 'mountains',
    previewId: '00000000-0000-7e09-8860-58cd733276d8',
  },
  {
    id: 'urban',
    label: 'Urban',
    query: 'urban city',
    previewId: '00000000-0000-7d82-9376-46c58a35b062',
  },
  {
    id: 'forest',
    label: 'Forest',
    query: 'forest trees',
    previewId: '00000000-0000-7c9a-83ba-97147f838c1f',
  },
  {
    id: 'reflection',
    label: 'Reflection',
    query: 'reflection water',
    previewId: '00000000-0000-7fbb-91e7-fd8677b435ea',
  },
];
