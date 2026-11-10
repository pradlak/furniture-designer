// Proste rysunki (SVG) na karty wyboru: rodzaje przestrzeni i przykładowe projekty.
// Kolory z klas .pic-* w style.css (ściana, podłoga, korpus, fronty, blat…).

const svg = (body) => `<svg viewBox="0 0 160 110" aria-hidden="true">${body}</svg>`;
const wall = '<rect x="8" y="6" width="144" height="98" rx="2" class="pic-wall" />';
const floor = '<line x1="4" y1="104" x2="156" y2="104" class="pic-floor" />';

export const PICTURES = {
  // wnęka (widok z przodu): ściany, podłoga, szafa z trzema drzwiami
  niche: svg(`${wall}
    <rect x="20" y="20" width="120" height="82" class="pic-body" />
    <rect x="22" y="22" width="38" height="78" class="pic-front" />
    <rect x="61" y="22" width="38" height="78" class="pic-front" />
    <rect x="100" y="22" width="38" height="78" class="pic-front" />
    <line x1="56" y1="52" x2="56" y2="66" class="pic-handle" />
    <line x1="65" y1="52" x2="65" y2="66" class="pic-handle" />
    <line x1="104" y1="52" x2="104" y2="66" class="pic-handle" />
    ${floor}`),

  // poddasze (przekrój z boku): ścianka kolankowa, skos, szafa ze skośną górą i półkami
  attic: svg(`<path d="M8 104 V64 L84 8 H152 V104 Z" class="pic-wall" />
    <path d="M14 104 V66 L82 16 V104 Z" class="pic-body" />
    <line x1="14" y1="86" x2="82" y2="86" class="pic-shelf" />
    <line x1="14" y1="66" x2="82" y2="66" class="pic-shelf" />
    <line x1="40" y1="47" x2="82" y2="47" class="pic-shelf" />
    <path d="M84 8 L8 64" class="pic-slope" />
    ${floor}`),

  // szafki kuchenne: szafki dolne z blatem, drzwiami, szufladami i cokołem
  kitchen: svg(`${wall}
    <rect x="14" y="52" width="132" height="7" class="pic-top" />
    <rect x="18" y="59" width="62" height="36" class="pic-front" />
    <rect x="81" y="59" width="61" height="17" class="pic-front" />
    <rect x="81" y="77" width="61" height="18" class="pic-front" />
    <line x1="72" y1="66" x2="72" y2="80" class="pic-handle" />
    <line x1="104" y1="67" x2="118" y2="67" class="pic-handle" />
    <line x1="104" y1="86" x2="118" y2="86" class="pic-handle" />
    <rect x="20" y="95" width="120" height="9" class="pic-plinth" />
    ${floor}`),

  // szafa we wnęce do sufitu: blenda górna, blendy boczne, trzy pary drzwi z frezem ramką, cokół (blenda dolna)
  wardrobe: svg(`${wall}
    <rect x="12" y="6" width="136" height="8" class="pic-front" />
    <rect x="12" y="15" width="4" height="89" class="pic-front" />
    <rect x="144" y="15" width="4" height="89" class="pic-front" />
    ${[0, 1, 2]
      .map((i) => {
        const x = 17 + i * 42.4;
        return `<rect x="${x}" y="15" width="20.6" height="81" class="pic-front" />
          <rect x="${x + 21.2}" y="15" width="20.6" height="81" class="pic-front" />
          <rect x="${x + 3}" y="19" width="14.6" height="73" class="pic-frame" />
          <rect x="${x + 24.2}" y="19" width="14.6" height="73" class="pic-frame" />
          <line x1="${x + 18.6}" y1="48" x2="${x + 18.6}" y2="64" class="pic-handle" />
          <line x1="${x + 23.6}" y1="48" x2="${x + 23.6}" y2="64" class="pic-handle" />`;
      })
      .join('')}
    <rect x="17" y="97" width="126" height="7" class="pic-plinth" />
    ${floor}`),

  // regał na książki: dwa otwarte korpusy z półkami
  bookcase: svg(`${wall}
    <rect x="30" y="18" width="50" height="86" class="pic-body" />
    <rect x="80" y="18" width="50" height="86" class="pic-body" />
    ${[32, 46, 60, 74, 88]
      .map((y) => `<line x1="30" y1="${y}" x2="130" y2="${y}" class="pic-shelf" />`)
      .join('')}
    <rect x="36" y="22" width="5" height="10" class="pic-book" /><rect x="42" y="24" width="4" height="8" class="pic-book2" />
    <rect x="92" y="50" width="5" height="10" class="pic-book2" /><rect x="98" y="51" width="4" height="9" class="pic-book" />
    <rect x="50" y="64" width="6" height="10" class="pic-book" /><rect x="110" y="78" width="5" height="10" class="pic-book" />
    ${floor}`),

  // komoda: szuflady i drzwi na nóżkach, z blatem
  chest: svg(`${wall}
    <rect x="20" y="50" width="120" height="6" class="pic-top" />
    <rect x="22" y="57" width="57" height="9" class="pic-front" />
    <rect x="22" y="67" width="57" height="9" class="pic-front" />
    <rect x="22" y="77" width="57" height="9" class="pic-front" />
    <rect x="22" y="87" width="57" height="8" class="pic-front" />
    <rect x="81" y="57" width="28" height="38" class="pic-front" />
    <rect x="110" y="57" width="28" height="38" class="pic-front" />
    ${[61, 71, 81, 91].map((y) => `<line x1="44" y1="${y}" x2="57" y2="${y}" class="pic-handle" />`).join('')}
    <circle cx="105" cy="62" r="1.8" class="pic-knob" /><circle cx="114" cy="62" r="1.8" class="pic-knob" />
    <line x1="26" y1="96" x2="26" y2="104" class="pic-leg" /><line x1="134" y1="96" x2="134" y2="104" class="pic-leg" />
    ${floor}`),
};
