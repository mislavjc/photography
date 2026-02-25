interface SearchCategory {
  id: string;
  label: string;
  query: string;
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  { id: 'sunset', label: 'Sunset', query: 'sunset' },
  { id: 'night', label: 'Night', query: 'night city' },
  { id: 'architecture', label: 'Architecture', query: 'architecture' },
  { id: 'nature', label: 'Nature', query: 'nature landscape' },
  { id: 'street', label: 'Street', query: 'street photography' },
  { id: 'ocean', label: 'Ocean', query: 'ocean beach' },
  { id: 'mountains', label: 'Mountains', query: 'mountains' },
  { id: 'urban', label: 'Urban', query: 'urban city' },
];
