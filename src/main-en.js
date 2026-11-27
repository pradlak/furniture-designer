// Wejście wersji angielskiej (en/index.html): najpierw język i słownik, potem program — kolejność importów
// gwarantuje, że moduły programu (także ich stałe z napisami) liczą się już po angielsku.
import './i18n/en/register.js';
import './main.js';
