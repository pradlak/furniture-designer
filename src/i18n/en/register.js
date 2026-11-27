// Włącza angielski: język, słownik i mapa adresów stron. Importowany jako pierwszy w src/main-en.js.
import { setLang, addTranslations, setPathMap } from '../../i18n.js';
import { PATHS } from '../paths.js';
import en from './index.js';

setLang('en');
addTranslations(en);
setPathMap(PATHS);
