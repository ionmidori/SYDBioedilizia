import type { MeasureSource } from '@/types/confirmation';

/** The backend labels start in lower case ("pavimento della stanza (m²)", "lascia in posa"). */
/** A measure as the client reads it ("1.250,5"). */
export const formatNumber = (value: number) => value.toLocaleString('it-IT');

/** Shown where a measure has no value yet. */
export const NO_VALUE_LABEL = 'da indicare';

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Where a value comes from, as the client reads it (`null` source: nobody gave it yet). */
export const SOURCE_LABEL: Record<MeasureSource, string> = {
  declared: 'indicata da te',
  photo: 'dalle tue foto',
  estimated: 'stimata da SYD',
  brief: 'dalla tua descrizione',
  confirmed: 'confermata',
  calculated: 'calcolata dalle misure della stanza',
};
