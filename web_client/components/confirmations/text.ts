/** The backend labels start in lower case ("pavimento della stanza (m²)", "lascia in posa"). */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
