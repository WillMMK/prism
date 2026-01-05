export interface Palette {
  background: string;
  card: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  positive: string;
  negative: string;
  border: string;
  wash: string;
  highlight: string;
}

export const lightPalette: Palette = {
  background: '#F6F3EF',
  card: '#FFFFFF',
  ink: '#1E1B16',
  muted: '#6B645C',
  accent: '#0F766E',
  accentSoft: '#D6EFE8',
  positive: '#2F9E44',
  negative: '#D64550',
  border: '#E6DED4',
  wash: '#F2ECE4',
  highlight: '#F2A15F',
};

export const darkPalette: Palette = {
  background: '#1A1A1E',
  card: '#2A2A2E',
  ink: '#F5F5F5',
  muted: '#9CA3AF',
  accent: '#14B8A6',
  accentSoft: '#134E4A',
  positive: '#4ADE80',
  negative: '#F87171',
  border: '#3F3F46',
  wash: '#27272A',
  highlight: '#FB923C',
};

// Accent color options for customization
export const accentColors = [
  { name: 'Teal', value: '#0F766E' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Purple', value: '#7C3AED' },
  { name: 'Pink', value: '#DB2777' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Green', value: '#16A34A' },
];

// Category colors for charts
export const categoryColors = [
  '#0072B2',
  '#E69F00',
  '#009E73',
  '#D55E00',
  '#CC79A7',
  '#56B4E9',
  '#F0E442',
  '#000000',
  '#6A3D9A',
  '#B15928',
  '#1B9E77',
  '#E7298A',
];
