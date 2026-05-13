// Centralised colour tokens for the v4 dashboard. Premium boutique-confectionery
// palette: warm cream surfaces, deep mocha text, restrained gold/olive accents.
// Status colours are reserved for badges + alert bars — no big pastel blocks.

export const C = {
  // Surfaces
  bg:         '#F7F3EC',  // page background — cream/warm grey
  card:       '#FFFFFF',  // primary card surface
  cardSoft:   '#FFFCF7',  // softer card variant for headers / panels
  surface:    '#FBF8F1',  // intermediate fill (e.g. row hover)

  // Borders
  border:     '#E5DACA',  // primary card / table border
  borderSoft: '#EFE6D5',  // hairline row separator

  // Text
  text:       '#2A1B12',  // primary text
  textSoft:   '#85705C',  // secondary text
  textMuted:  '#B0A08D',  // tertiary text

  // Brand
  brand:      '#8B5E34',  // primary brown
  espresso:   '#7A4A27',  // primary CTA — deeper than brand
  brandSoft:  '#FAF3E5',  // brand-tinted fill

  // Accents
  gold:       '#B89870',  // muted gold — used for ord# + completed states
  goldSoft:   '#F4E8D8',  // gold-tinted chip fill

  // Status (used only on small badges / urgency bars)
  green:      '#0F766E',
  greenSoft:  '#E5F4EE',
  red:        '#B43A2B',
  redSoft:    '#FBE6E1',
  amber:      '#A66A1F',
  amberSoft:  '#F8EAD0',
  blue:       '#1E5B8C',
  blueSoft:   '#DDE9F5',
} as const;
