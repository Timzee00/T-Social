export function hashtags(caption: string) {
  return [
    ...new Set(
      [
        ...caption.toLowerCase().matchAll(/(?:^|\s)#([\p{L}\p{N}_]{1,50})/gu),
      ].map(m => m[1])
    ),
  ].slice(0, 30);
}
