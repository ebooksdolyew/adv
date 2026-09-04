/* ==========================================================================
   Nogueira Advocacia Criminal | motor das animações
   Só orquestra classes e variáveis CSS. Toda a aparência mora em style.css.
   ========================================================================== */
(function () {
  'use strict';

  var preferenciaMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduzido = preferenciaMovimento.matches;

  /* ---------- 1. Cascata: distribui data-reveal e atraso nos filhos ------ */
  document.querySelectorAll('[data-stagger]').forEach(function (grupo) {
    var tipo = grupo.getAttribute('data-stagger') || 'up';
    var passo = parseFloat(grupo.getAttribute('data-passo')) || 0.07;
    Array.prototype.forEach.call(grupo.children, function (filho, i) {
      filho.setAttribute('data-reveal', tipo);
      filho.style.setProperty('--d', (i * passo).toFixed(3) + 's');
    });
  });

  /* ---------- 2. Reveal na entrada em tela ------------------------------- */
  var alvos = document.querySelectorAll('[data-reveal]');

  if (reduzido || !('IntersectionObserver' in window)) {
    alvos.forEach(function (el) { el.classList.add('revelado'); });
  } else {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('revelado');
        observador.unobserve(e.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });

    alvos.forEach(function (el) { observador.observe(el); });
  }

  /* ---------- 3. Título do hero: palavras sobem sob máscara -------------- */
  var titulo = document.querySelector('[data-split]');
  if (titulo && !reduzido) {
    var indice = 0;

    (function quebrar(no) {
      Array.prototype.slice.call(no.childNodes).forEach(function (filho) {
        if (filho.nodeType === 3) {
          var palavras = filho.textContent.split(/(\s+)/);
          var fragmento = document.createDocumentFragment();
          palavras.forEach(function (p) {
            if (!p.trim()) { fragmento.appendChild(document.createTextNode(p)); return; }
            var caixa = document.createElement('span');
            caixa.className = 'palavra';
            var interno = document.createElement('span');
            interno.textContent = p;
            interno.style.setProperty('--i', indice++);
            caixa.appendChild(interno);
            fragmento.appendChild(caixa);
          });
          no.replaceChild(fragmento, filho);
        } else if (filho.nodeType === 1) {
          quebrar(filho);
        }
      });
    })(titulo);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { titulo.classList.add('titulo-pronto'); });
    });
  } else if (titulo) {
    titulo.classList.add('titulo-pronto');
  }

  /* ---------- 4. Texto que acende palavra a palavra --------------------- */
  var iluminados = Array.prototype.map.call(
    document.querySelectorAll('[data-iluminar]'),
    function (el) {
      var palavras = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      var spans = palavras.map(function (palavra, i) {
        var sp = document.createElement('span');
        sp.className = 'pal-luz';
        sp.textContent = palavra;
        el.appendChild(sp);
        if (i < palavras.length - 1) el.appendChild(document.createTextNode(' '));
        return sp;
      });
      return { el: el, spans: spans, acesas: reduzido ? spans.length : 0 };
    }
  );
  if (reduzido) {
    iluminados.forEach(function (t) {
      t.spans.forEach(function (sp) { sp.classList.add('aceso'); });
    });
  }

  function acender() {
    iluminados.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      var inicio = window.innerHeight * 0.86;
      var fim = window.innerHeight * 0.34;
      var p = (inicio - r.top) / Math.max(1, inicio - fim);
      p = Math.max(0, Math.min(1, p));
      var alvo = Math.round(p * t.spans.length);
      if (alvo === t.acesas) return;
      for (var i = 0; i < t.spans.length; i++) {
        t.spans[i].classList.toggle('aceso', i < alvo);
      }
      t.acesas = alvo;
    });
  }

  /* ---------- 5. Scroll: header, tarja, whatsapp, parallax --------------- */
  var cabecalho = document.querySelector('.topo-fixo');
  var zap = document.querySelector('.zap-float');
  var zapBloqueado = false;
  var camadas = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var trilho = document.querySelector('.tarja-trilho');
  var tarja = document.querySelector('.tarja');
  var pendente = false;
  var ultimoY = 0;

  function sincronizarZap() {
    if (!zap) return;
    var temFoco = document.activeElement === zap;
    var deveriaEstarDisponivel = zap.classList.contains('visivel') && !zapBloqueado;
    var disponivel = deveriaEstarDisponivel || temFoco;
    zap.classList.toggle('recolhido', zapBloqueado && !temFoco);
    if (disponivel) {
      zap.removeAttribute('tabindex');
      zap.removeAttribute('aria-hidden');
    } else {
      zap.setAttribute('tabindex', '-1');
      zap.setAttribute('aria-hidden', 'true');
    }
  }

  function aoRolar() {
    var y = window.pageYOffset;
    var descendo = y > ultimoY;

    if (cabecalho) {
      cabecalho.classList.toggle('compacto', y > 90);
      cabecalho.classList.toggle('escondido', descendo && y > 520);
    }
    if (zap) {
      var deveMostrarZap = y > 380;
      if (deveMostrarZap || document.activeElement !== zap) {
        zap.classList.toggle('visivel', deveMostrarZap);
      }
      sincronizarZap();
    }

    /* a tarja responde ao próprio trecho, sem depender da altura da página */
    if (trilho && !reduzido) {
      var volta = trilho.scrollWidth / 2 || 1;
      var rTarja = tarja ? tarja.getBoundingClientRect() : { top: 0 };
      var percurso = Math.max(0, window.innerHeight - rTarja.top);
      trilho.style.transform = 'translate3d(' + (-((percurso * 0.28) % volta)).toFixed(1) + 'px,0,0)';
    }

    acender();
    ultimoY = y;

    if (!reduzido) {
      camadas.forEach(function (el) {
        var fator = parseFloat(el.getAttribute('data-parallax')) || 0.08;
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        var centro = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.setProperty('--parallax-y', (-centro * fator).toFixed(1) + 'px');
      });
    }
    pendente = false;
  }

  function agendar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(aoRolar);
  }

  if (trilho) {
    Array.prototype.slice.call(trilho.children).forEach(function (item) {
      var copia = item.cloneNode(true);
      copia.setAttribute('aria-hidden', 'true');
      trilho.appendChild(copia);
    });
  }

  window.addEventListener('scroll', agendar, { passive: true });
  window.addEventListener('resize', agendar);
  if (zap) {
    zap.addEventListener('blur', function () {
      zap.classList.toggle('visivel', window.pageYOffset > 380);
      sincronizarZap();
    });
  }
  aoRolar();

  /* ---------- 6. Mouse: brilho do hero e dos cartões --------------------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('pointermove', function (e) {
        if (reduzido) return;
        var r = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        hero.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      });
    }

    document.querySelectorAll('.card, .dif, .serv-media, .urg-box, .galeria figure, .local-card, .cta-final').forEach(function (bloco) {
      bloco.addEventListener('pointermove', function (e) {
        if (reduzido) return;
        var r = bloco.getBoundingClientRect();
        bloco.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        bloco.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      });
      bloco.addEventListener('pointerleave', function () {
        bloco.style.removeProperty('--px');
        bloco.style.removeProperty('--py');
      });
    });
  }

  /* ---------- 7. FAQ: uma resposta por vez + índice ativo --------------- */
  var perguntas = Array.prototype.slice.call(document.querySelectorAll('.faq details'));
  var indiceFaq = document.querySelector('[data-faq-current]');

  function atualizarIndiceFaq(item) {
    if (!indiceFaq || !item) return;
    var indice = perguntas.indexOf(item) + 1;
    indiceFaq.textContent = (indice < 10 ? '0' : '') + indice;
  }

  perguntas.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      perguntas.forEach(function (outra) {
        if (outra !== item) outra.open = false;
      });
      atualizarIndiceFaq(item);
    });
  });
  atualizarIndiceFaq(perguntas.filter(function (item) { return item.open; })[0] || perguntas[0]);

  /* ---------- 8. Rodapé atual + WhatsApp fora do CTA principal ---------- */
  document.querySelectorAll('[data-year]').forEach(function (ano) {
    ano.textContent = String(new Date().getFullYear());
  });

  var zonasZap = [document.querySelector('.cta-final'), document.querySelector('footer')]
    .filter(function (zona) { return zona; });
  var zonasZapAtivas = [];

  if (zap && zonasZap.length && 'IntersectionObserver' in window) {
    var observadorZap = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        var indice = zonasZapAtivas.indexOf(entrada.target);
        if (entrada.isIntersecting && indice === -1) zonasZapAtivas.push(entrada.target);
        if (!entrada.isIntersecting && indice !== -1) zonasZapAtivas.splice(indice, 1);
      });

      var deveBloquear = zonasZapAtivas.length > 0;
      zapBloqueado = deveBloquear;
      sincronizarZap();
    }, { threshold: 0.08 });

    zonasZap.forEach(function (zona) { observadorZap.observe(zona); });
  }

  function atualizarPreferenciaMovimento(evento) {
    reduzido = evento.matches;
    if (!reduzido) {
      agendar();
      return;
    }

    alvos.forEach(function (el) { el.classList.add('revelado'); });
    iluminados.forEach(function (trecho) {
      trecho.spans.forEach(function (sp) { sp.classList.add('aceso'); });
      trecho.acesas = trecho.spans.length;
    });
    camadas.forEach(function (el) { el.style.removeProperty('--parallax-y'); });
    if (trilho) trilho.style.removeProperty('transform');
    document.querySelectorAll('.card, .dif, .serv-media, .urg-box, .galeria figure, .local-card, .cta-final').forEach(function (bloco) {
      bloco.style.removeProperty('--px');
      bloco.style.removeProperty('--py');
    });
  }

  if (typeof preferenciaMovimento.addEventListener === 'function') {
    preferenciaMovimento.addEventListener('change', atualizarPreferenciaMovimento);
  } else if (typeof preferenciaMovimento.addListener === 'function') {
    preferenciaMovimento.addListener(atualizarPreferenciaMovimento);
  }
})();
