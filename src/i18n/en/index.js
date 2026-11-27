// Słownik angielski programu (klucz — polski tekst, patrz src/i18n.js). Podzielony na pliki według części kodu,
// żeby łatwiej było go uzupełniać; kolejność nie ma znaczenia (te same klucze powinny mieć te same tłumaczenia).
import ui1 from './ui1.js';
import ui2 from './ui2.js';
import ui3 from './ui3.js';
import model from './model.js';
import scene from './scene.js';
import app from './app.js';

export default { ...ui1, ...ui2, ...ui3, ...model, ...scene, ...app };
