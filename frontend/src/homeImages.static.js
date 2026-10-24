// Flask serve estas imagens em /static/home (com cache) para não inchar o HTML.
export default ['circuito', 'garagem', 'testes', 'soldadura'].map(name => `/static/home/lart-${name}.webp`)
// Fotografia de uma etiqueta Mouser para o tutorial do inventário.
export const scanPhoto = '/static/tutorial/mouser-label.webp'
