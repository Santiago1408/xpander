# Identidad XPANDER: recursos provisionales para la web

Fuente recibida: `../xpander-1.png`. Es un PNG con fondo incorporado; no es un archivo vectorial maestro.

## Archivos

- `xpander-wordmark-dark-transparent.png`: nombre completo, fondo transparente, para fondos claros.
- `xpander-x-dark-transparent.png`: monograma X, fondo transparente, para favicon y espacios cuadrados.

La variante negativa para fondos oscuros debe obtenerse del mismo archivo transparente mediante CSS, preservando exactamente su silueta:

```html
<img class="xpander-logo xpander-logo--inverse" src="/brand/xpander-wordmark-dark-transparent.png" alt="XPANDER">
```

```css
.xpander-logo--inverse { filter: brightness(0) invert(1); }
```

Esta es una solución para uso web. Para impresión, señalética y archivos finales en SVG/PDF, hace falta el archivo vectorial original o reconstruir y revisar manualmente cada letra. No usar el PNG original con fondo como si fuera transparente.

## Procedencia

Los dos PNG finales se crearon con la herramienta integrada de edición de imágenes a partir de `../xpander-1.png`. Se seleccionaron solo las variantes que conservaron el rótulo sin manchas visibles.

El primer prompt dice por error «six letterforms»; la palabra XPANDER tiene siete letras y el archivo seleccionado conserva las siete.

Prompt del rótulo transparente:

> Use case: background-extraction. Image 1 is the edit target: the supplied XPANDER black wordmark. Create a faithful transparent-background cutout for production web branding. Preserve the exact six letterforms, relative proportions, spacing, strokes, curvature, baseline, dark charcoal color, and horizontal arrangement of the word XPANDER. Remove only the off-white background, gray shadows/noise, and the tiny sparkle at lower right. Leave crisp anti-aliased edges and generous but minimal transparent padding around the wordmark. Do not redraw or restyle the letters, add a slogan, invent a symbol, alter the spelling, or create a white matte. Text must remain exactly 'XPANDER'.

Prompt de la X:

> Use case: precise-object-edit. Image 1 is the edit target, the clean transparent XPANDER wordmark. Extract ONLY its leftmost stylized letter X as a separate brand mark for a square website favicon. Preserve that exact X shape, stroke geometry and dark charcoal color faithfully. Center it on a square, genuinely transparent canvas with balanced clear padding. Delete all other letters completely. No other text, no background, no shadow, no sparkle, no decoration, no added design. Sharp clean edges.
