const bundled = new Set([
  ...['echo', 'faith', 'halo', 'horizon', 'lumen', 'orbit', 'pulse', 'sen'].map(name => `/assets/catalog/emoria-${name}.png`),
  '/assets/summer_box.png', '/assets/product_halo.png',
]);

export function productImageProps(image, sizes = '(max-width: 639px) 280px, 345px') {
  if (!bundled.has(image)) return { src: image };
  const name = image.split('/').at(-1).replace(/\.png$/, '');
  return {
    src: `/assets/optimized/${name}-640.webp`,
    srcSet: [320, 640, 960].map(width => `/assets/optimized/${name}-${width}.webp ${width}w`).join(', '),
    sizes,
    onError: event => {
      const img = event.currentTarget;
      img.removeAttribute('srcset');
      if (img.getAttribute('src') !== image) img.src = image;
    },
  };
}
