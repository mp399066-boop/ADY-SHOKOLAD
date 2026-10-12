// Centralised colour tokens for the v4 dashboard. Premium boutique-confectionery
// palette: warm cream surfaces, deep mocha text, restrained gold/olive accents.
// Status colours are reserved for badges + alert bars — no big pastel blocks.

export const C = {
  // Surfaces
  bg:         '#F5F1EB',
  card:       '#FFFDF9',
  cardSoft:   '#FFFFFF',
  surface:    '#E8DED2',

  // Borders
  border:     '#E0D4C2',
  borderSoft: '#E8DED2',

  // Text
  text:       '#2B1A10',
  textSoft:   '#7B604D',
  textMuted:  '#B0A090',

  // Brand
  brand:      '#5A3424',
  espresso:   '#2B1A10',
  cocoa:      '#7B4A35',
  brandSoft:  '#FBF0E4',

  // Accents
  gold:       '#C9A46A',
  goldSoft:   '#E8DED2',

  // Status (used only on small badges / urgency bars)
  green:      '#2D6648',
  greenSoft:  '#EAF0E7',
  red:        '#9D4B4A',
  redSoft:    '#F0EAE8',
  amber:      '#A8753D',
  amberSoft:  '#EDD9B4',
  blue:       '#496D7D',
  blueSoft:   '#EAF0F5',
} as const;
