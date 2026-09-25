// Page racine « / » : redirige vers /fr/ ou /nl/ selon le choix mémorisé ou la langue du navigateur.
// (Le serveur fait déjà cette redirection ; ce script sert de filet sur un hébergement 100 % statique.)
(function () {
  var saved = null;
  try { saved = localStorage.getItem('vs_lang'); } catch (e) { /* ignore */ }
  if (/[?&]choisir\b|[?&]kiezen\b/.test(location.search)) return;
  var langs = (navigator.languages || [navigator.language || '']).join(',').toLowerCase();
  var target = saved === 'nl' || saved === 'fr' ? saved : (/(^|,)nl/.test(langs) ? 'nl' : 'fr');
  var base = document.documentElement.getAttribute('data-base') || '';
  location.replace(base + '/' + target + '/');
})();
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('[data-lang-choice]');
  if (a) try { localStorage.setItem('vs_lang', a.getAttribute('data-lang-choice')); } catch (err) { /* ignore */ }
});
