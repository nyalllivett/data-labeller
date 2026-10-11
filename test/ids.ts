export const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`;
