// Hero loop: four scenarios, each a short timeline of parts that switch on (.on / .tapped / .gone).
// Pauses while the tab is hidden; with prefers-reduced-motion it shows scene 2 fully, statically.
(function () {
  var root = document.querySelector('[data-scenes]');
  if (!root) return;
  var scenes = Array.prototype.slice.call(root.querySelectorAll('.scene'));
  var cap = document.querySelector('.scene-cap');
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dots span'));
  var SCENE_MS = 6800;
  var timers = [];
  var cur = 0;

  function clear() { timers.forEach(clearTimeout); timers = []; }
  function reset(scene) {
    scene.querySelectorAll('[data-at]').forEach(function (el) { el.classList.remove('on', 'tapped', 'gone'); });
  }
  function show(i) {
    clear();
    cur = i;
    scenes.forEach(function (s, j) { s.classList.toggle('is-active', j === i); if (j !== i) reset(s); });
    dots.forEach(function (d, j) { d.classList.toggle('on', j === i); });
    var s = scenes[i];
    reset(s);
    if (cap) cap.innerHTML = '<span class="n">0' + (i + 1) + '</span>' + s.getAttribute('data-caption');
    s.querySelectorAll('[data-at]').forEach(function (el) {
      el.getAttribute('data-at').split(' ').forEach(function (step) {
        var parts = step.split(':'); // "ms" or "ms:class"
        timers.push(setTimeout(function () { el.classList.add(parts[1] || 'on'); }, +parts[0]));
      });
    });
    timers.push(setTimeout(function () { show((cur + 1) % scenes.length); }, SCENE_MS));
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    var s = scenes[1];
    s.classList.add('is-active');
    s.querySelectorAll('[data-at]').forEach(function (el) {
      if (/:gone/.test(el.getAttribute('data-at'))) el.classList.add('gone'); else el.classList.add('on');
    });
    return;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clear(); else show(cur);
  });
  show(0);
  window.__crewbrainScenes = { show: show, current: function () { return cur; } };
})();
