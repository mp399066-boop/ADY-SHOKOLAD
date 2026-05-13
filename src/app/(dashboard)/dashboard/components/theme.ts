// Centralised colour tokens for the v4 dashboard. Premium boutique-confectionery
// palette: warm cream surfaces, deep mocha text, restrained gold/olive accents.
// Status colours are reserved for badges + alert bars — no big pastel blocks.

export const C = {
  // Surfaces
  bg:         '#F8F3EC',
  card:       '#FFFDF9',
  cardSoft:   '#FFFFFF',
  surface:    '#EFE2D3',

  // Borders
  border:     '#E8D8C6',
  borderSoft: '#F0E5D8',

  // Text
  text:       '#2F1B14',
  textSoft:   '#7B604D',
  textMuted:  '#AF9A87',

  // Brand
  brand:      '#5A3424',
  espresso:   '#2F1B14',
  cocoa:      '#7B4A35',
  brandSoft:  '#F4E9DC',

  // Accents
  gold:       '#C49A6C',
  goldSoft:   '#F3E4D0',

  // Status (used only on small badges / urgency bars)
  green:      '#476D53',
  greenSoft:  '#E8F0E7',
  red:        '#9D4B4A',
  redSoft:    '#F4E4E1',
  amber:      '#A8753D',
  amberSoft:  '#F4E3C9',
  blue:       '#496D7D',
  blueSoft:   '#E5EEF1',
} as const;
