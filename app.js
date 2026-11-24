(function () {
  'use strict';
  // ===================================================================== utilidades
  var ls = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dd(n) { return String(n).padStart(2, '0'); }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(s) {
    s = String(s == null ? '' : s).replace(/\s|Bs\.?/gi, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(',', '.');
    var n = Number(s); return Number.isFinite(n) ? n : 0;
  }
  function bs(n) { return window.NBSpdf.bs(n); }
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(f) { var p = String(f || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MESES_C[Number(p[1]) - 1] + (p[0] !== hoy().slice(0, 4) ? ' ' + p[0] : '') : ''; }
  function aviso(texto, error) {
    var a = document.createElement('div'); a.className = 'aviso' + (error ? ' aviso--error' : ''); a.textContent = texto;
    $('#avisos').appendChild(a); setTimeout(function () { a.style.transition = 'opacity .3s'; a.style.opacity = '0'; }, 3200); setTimeout(function () { a.remove(); }, 3600);
  }

  // ===================================================================== estado
  var CFG_DEF = {
    url: '', clave: '',
    firmante: 'Adrian Pozo', firmaDe: 'Adrian Pozo', firmantes: ['Adrian Pozo'],
    tienda: { nombre: 'Notebooks Store', tel: '2-315657', dir: 'C/ México N° 1448', ciudad: 'La Paz - Bolivia' },
    cond: { pago: 'Al contado', entrega: 'Inmediata', garantia: '30 días', validez: '1 día', factura: true },
    titulo: 'Cotización', mostrarChip: true,
  };
  var cfg = Object.assign({}, CFG_DEF, ls.get('nbs:cfg', {}));
  cfg.tienda = Object.assign({}, CFG_DEF.tienda, cfg.tienda || {});
  cfg.cond = Object.assign({}, CFG_DEF.cond, cfg.cond || {});
  function guardarCfg() { ls.set('nbs:cfg', cfg); }

  var docs = ls.get('nbs:docs', {});           // id -> documento (incluye plantillas)
  var pendientes = ls.get('nbs:pend', {});     // id -> true (por subir)
  var porBorrar = ls.get('nbs:pendBorrar', {}); // id -> true
  var ultimaSync = ls.get('nbs:sync', 0);
  var activos = ls.get('nbs:activos', {});     // firma, sello (del script privado)
  var numeros = ls.get('nbs:numeros', null);
  function guardarDocs() { ls.set('nbs:docs', docs); ls.set('nbs:pend', pendientes); ls.set('nbs:pendBorrar', porBorrar); }

  // ===================================================================== sincronización (Google Apps Script)
  var estadoSync = 'off', sincronizando = false, temporizador = null;
  function conectado() { return !!(cfg.url && cfg.clave); }
  async function api(cuerpo) {
    var res;
    try {
      res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({ clave: cfg.clave }, cuerpo)), redirect: 'follow' });
    } catch (e) {
      var er = new Error('red'); er.codigo = navigator.onLine === false ? 'sin_internet' : 'red'; throw er;
    }
    var texto = await res.text(), datos = null;
    try { datos = JSON.parse(texto); } catch (e) {
      var er2 = new Error('respuesta');
      er2.codigo = /accounts\.google|ServiceLogin|Iniciar sesi|Sign in/i.test(texto) ? 'login'
        : /Script function not found|doPost/i.test(texto) ? 'sin_doPost'
        : /authoriz|autoriz|permiso/i.test(texto) ? 'permiso'
        : res.status === 404 ? 'no_existe' : 'respuesta';
      er2.detalle = 'HTTP ' + res.status;
      throw er2;
    }
    if (datos.error) { var e3 = new Error(datos.error); e3.codigo = datos.error; e3.detalle = datos.detalle || ''; throw e3; }
    return datos;
  }
  var ultimoError = null;
  function explicarError(e) {
    var c = e && e.codigo;
    if (c === 'sin_internet') return 'Este equipo no tiene internet.';
    if (c === 'red') return 'No se pudo llegar a tu script de Google. Revisa la dirección en Ajustes (debe terminar en /exec).';
    if (c === 'login') return 'Google está pidiendo iniciar sesión: el script quedó implementado con acceso restringido. En el script: Implementar → Gestionar implementaciones → ✏️ → "Quién tiene acceso: Cualquier usuario".';
    if (c === 'permiso') return 'Google pide volver a dar permiso al script. Ábrelo, ejecuta "probar" y acepta los permisos.';
    if (c === 'sin_doPost') return 'El código del script está incompleto. Vuelve a pegar el código completo de Codigo-Cotizador.gs y reimplementa.';
    if (c === 'no_existe') return 'Esa dirección del script ya no existe (quizá se creó una implementación nueva). Copia la URL /exec actual y pégala en Ajustes.';
    if (c === 'clave') return 'La clave no coincide con la de tu script. Revisa Ajustes.';
    if (c === 'interno') return 'El script respondió con un error: ' + (e.detalle || '') + '.';
    return 'Error al sincronizar (' + (c || 'desconocido') + (e && e.detalle ? ', ' + e.detalle : '') + ').';
  }

  function pintarSync() {
    var el = $('#estado-sync'); if (!el) return;
    var n = Object.keys(pendientes).length + Object.keys(porBorrar).length;
    var e = !conectado() ? 'off' : sincronizando ? 'pend' : estadoSync === 'error' ? 'error' : n ? 'pend' : 'ok';
    el.dataset.e = e;
    el.querySelector('span').textContent = e === 'off' ? 'Sin conectar' : e === 'error' ? 'Sin conexión' : e === 'pend' ? (sincronizando ? 'Sincronizando…' : n + ' por subir') : 'Sincronizado';
  }
  function programarSync(ms) { clearTimeout(temporizador); temporizador = setTimeout(sincronizar, ms == null ? 1200 : ms); }
  async function sincronizar() {
    if (!conectado() || sincronizando) return false;
    sincronizando = true; pintarSync();
    try {
      for (var id in porBorrar) { await api({ accion: 'borrar', id: id }); delete porBorrar[id]; guardarDocs(); }
      var ids = Object.keys(pendientes);
      for (var i = 0; i < ids.length; i++) {
        var d = docs[ids[i]]; if (!d) { delete pendientes[ids[i]]; continue; }
        var marca = d.editadoLocal;
        var r = await api({ accion: 'guardar', doc: limpio(d) });
        var actual = docs[ids[i]];
        if (actual) {
          actual.numero = r.doc.numero; actual.actualizado = r.doc.actualizado;
          if (actual.editadoLocal === marca) delete pendientes[ids[i]];
        }
        guardarDocs();
      }
      var l = await api({ accion: 'listar', desde: ultimaSync });
      (l.docs || []).forEach(function (rd) {
        if (pendientes[rd.id]) return; // lo local manda hasta que se suba
        if (rd.borrado) delete docs[rd.id];
        else if (!docs[rd.id]) docs[rd.id] = rd;
        else if ((rd.actualizado || 0) >= (docs[rd.id].actualizado || 0)) {
          // Se actualiza el mismo objeto: así el editor abierto no pierde la referencia.
          var loc = docs[rd.id];
          Object.keys(loc).forEach(function (k) { delete loc[k]; });
          Object.assign(loc, rd);
        }
      });
      ultimaSync = l.ahora || Date.now(); ls.set('nbs:sync', ultimaSync);
      if (l.numeros) { numeros = l.numeros; ls.set('nbs:numeros', numeros); }
      guardarDocs();
      estadoSync = 'ok';
      if (!activos.firma || !activos.cuando || Date.now() - activos.cuando > 7 * 864e5) cargarActivos();
    } catch (e) {
      estadoSync = 'error'; ultimoError = e;
      if (e.codigo === 'clave') aviso(explicarError(e), true);
    }
    sincronizando = false; pintarSync();
    if (Object.keys(pendientes).length && estadoSync === 'ok') programarSync(800);
    refrescarVista();
    return estadoSync === 'ok';
  }
  async function cargarActivos() {
    try {
      var r = await api({ accion: 'config' });
      activos = { firma: r.firma || '', sello: r.sello || '', cuando: Date.now() }; ls.set('nbs:activos', activos);
      if (r.numeros) { numeros = r.numeros; ls.set('nbs:numeros', numeros); }
      await prepararImagenes();
      return true;
    } catch (e) { ultimoError = e; return false; }
  }
  function limpio(d) { var c = Object.assign({}, d); delete c.editadoLocal; return c; }
  function guardarDoc(d) {
    d.editadoLocal = Date.now();
    docs[d.id] = d; pendientes[d.id] = true; guardarDocs(); pintarSync(); programarSync();
  }
  function borrarDoc(id) {
    delete docs[id]; delete pendientes[id]; porBorrar[id] = true; guardarDocs(); pintarSync(); programarSync(300);
  }

  // ===================================================================== imágenes para el PDF
  var imgs = { logo: null, chip: null, firma: null, sello: null };
  function cargarImg(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
          c.getContext('2d').drawImage(im, 0, 0);
          ok({ data: c.toDataURL('image/png'), ratio: im.naturalHeight / im.naturalWidth });
        } catch (e) { ok(null); }
      };
      im.onerror = function () { ok(null); };
      im.src = src;
    });
  }
  async function prepararImagenes() {
    if (!imgs.logo) imgs.logo = await cargarImg('logo.png');
    if (!imgs.chip) imgs.chip = await cargarImg('chip.png');
    if (!imgs.firma && activos.firma) imgs.firma = await cargarImg(activos.firma);
    if (!imgs.sello) imgs.sello = await cargarImg('sello.png');
  }
  function activosPDF() {
    var r = {};
    ['logo', 'chip', 'firma', 'sello'].forEach(function (k) { if (imgs[k]) { r[k] = imgs[k].data; r[k + 'Ratio'] = imgs[k].ratio; } });
    return r;
  }
  async function crearPDF(d) {
    await prepararImagenes();
    return window.NBSpdf.generar(d, activosPDF(), cfg);
  }

  // ===================================================================== compartir
  function celularIntl(c) {
    var n = String(c || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.length === 8 && /^[67]/.test(n)) n = '591' + n;
    return n;
  }
  function mensajeWA(d) {
    var nombre = String(d.cliente || '').trim().split(/\s+/)[0];
    var saludo = 'Hola' + (nombre ? ' ' + nombre : '') + ', ';
    if (d.tipo === 'informe') return saludo + 'le envío el informe técnico de su ' + ([d.equipo, d.modelo].filter(Boolean).join(' ') || 'equipo') + ' (' + window.NBSpdf.numeroTexto(d) + '). Cualquier consulta, estamos a su disposición. — Notebooks Store';
    var total = (d.items || []).reduce(function (s, it) { return s + (Number(it.cant) || 0) * (Number(it.precio) || 0); }, 0);
    return saludo + 'le envío la ' + String(d.titulo || 'cotización').toLowerCase() + ' ' + window.NBSpdf.numeroTexto(d) + ' por un total de ' + bs(total) + '. Quedamos atentos. — Notebooks Store';
  }
  async function asegurarNumero(d) {
    if (d.numero || !conectado()) return d;
    await sincronizar();
    return docs[d.id] || d;
  }
  async function enviar(d, soloDescargar) {
    d = await asegurarNumero(d);
    if (!d.numero) aviso(conectado() ? 'Sin conexión: el PDF sale como BORRADOR (sin número).' : 'Conecta tu script en Ajustes para numerar los documentos.', true);
    var pdf = await crearPDF(d), nombre = window.NBSpdf.nombreArchivo(d), blob = pdf.output('blob');
    var archivo = null;
    try { archivo = new File([blob], nombre, { type: 'application/pdf' }); } catch (e) {}
    if (!soloDescargar && archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: nombre, text: mensajeWA(d) }); marcarEnviado(d); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    descargar(blob, nombre);
    if (!soloDescargar) {
      var tel = celularIntl(d.celular);
      var url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensajeWA(d));
      window.open(url, '_blank', 'noopener');
      aviso('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.');
      marcarEnviado(d);
    } else aviso('PDF descargado.');
  }
  function descargar(blob, nombre) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 20000);
  }
  function marcarEnviado(d) {
    var x = docs[d.id]; if (!x) return;
    x.enviado = Date.now(); guardarDoc(x);
  }
  async function verPDF(d) {
    d = await asegurarNumero(d);
    var pdf = await crearPDF(d), u = URL.createObjectURL(pdf.output('blob'));
    var w = window.open(u, '_blank');
    if (!w) descargar(pdf.output('blob'), window.NBSpdf.nombreArchivo(d));
  }

  // ===================================================================== hojas (modales)
  function hoja(titulo, contenido) {
    var velo = document.createElement('div'); velo.className = 'velo';
    velo.innerHTML = '<div class="hoja" role="dialog" aria-modal="true"><div class="hoja-tit"><h3></h3><button class="boton boton--fant boton--chico" aria-label="Cerrar">✕</button></div><div class="hoja-cuerpo"></div></div>';
    velo.querySelector('h3').textContent = titulo;
    if (typeof contenido === 'string') velo.querySelector('.hoja-cuerpo').innerHTML = contenido; else velo.querySelector('.hoja-cuerpo').appendChild(contenido);
    function cerrar() { velo.remove(); document.removeEventListener('keydown', tecla); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    velo.addEventListener('mousedown', function (e) { if (e.target === velo) cerrar(); });
    velo.querySelector('.hoja-tit button').addEventListener('click', cerrar);
    document.addEventListener('keydown', tecla);
    document.body.appendChild(velo);
    var f = velo.querySelector('[autofocus]'); if (f) setTimeout(function () { f.focus(); }, 50);
    return { cerrar: cerrar, el: velo.querySelector('.hoja-cuerpo') };
  }

  // ===================================================================== rutas
  var vistaActual = null;
  function ir(ruta) { location.hash = ruta; }
  function ruta() { return (location.hash || '#/').slice(1); }
  window.addEventListener('hashchange', render);
  function refrescarVista() {
    if (vistaActual === 'inicio') { pintarSync(); pintarLista(); return; }
    pintarSync();
    var m = ruta().match(/^\/(cot|inf)\/(.+)$/), n = $('#ed-num');
    if (m && n && docs[m[2]]) n.textContent = window.NBSpdf.numeroTexto(docs[m[2]]);
    var ic = $('[data-caso]');
    if (m && ic && docs[m[2]] && document.activeElement !== ic && !docs[m[2]].caso) ic.value = docs[m[2]].numero || '';
  }

  function render() {
    var r = ruta(), app = $('#app');
    app.classList.remove('app--ancha');
    var m = r.match(/^\/(cot|inf)\/(.+)$/);
    if (m) {
      var d = docs[m[2]];
      if (!d) { vistaActual = null; ir('/'); return; }
      vistaActual = 'editor'; app.classList.add('app--ancha'); editor(d); return;
    }
    if (r !== '/' && r !== '') { seleccionando = false; elegidos = {}; }
    if (r === '/ajustes') { vistaActual = 'ajustes'; ajustes(); return; }
    if (r.indexOf('/unirse') === 0) { vistaActual = 'unirse'; unirse(r); return; }
    vistaActual = 'inicio'; inicio();
  }

  // ===================================================================== inicio
  var filtro = ls.get('nbs:filtro', 'todos'), busqueda = '';
  var seleccionando = false, elegidos = {};
  function inicio() {
    var app = $('#app');
    app.innerHTML =
      '<header class="barra"><img class="barra-logo" src="logo.png" alt="NotebooksStore"><div class="espacio"></div>' +
      '<button id="estado-sync" class="estado-sync" data-e="off" title="Sincronizar ahora"><i></i><span></span></button>' +
      '<button class="boton boton--fant boton--icono" data-ir="/ajustes" aria-label="Ajustes">⚙️</button></header>' +
      (conectado() ? '' : '<div class="tarjeta" style="display:flex;gap:12px;align-items:center"><img src="chip.png" alt="" style="width:64px;height:auto"><div style="flex:1"><b>Conecta tu hoja de Google</b><div class="ayuda" style="margin:2px 0 8px">Así tus cotizaciones e informes se ven en la PC y en el celular, con número correlativo y el sello de la tienda.</div><button class="boton boton--pri boton--chico" data-ir="/ajustes">Conectar</button></div></div>') +
      '<div class="nuevos"><button class="nuevo" data-nuevo="cotizacion"><span class="ico">🧾</span><b>Nueva cotización</b><span>Productos, precios y condiciones</span></button>' +
      '<button class="nuevo nuevo--inf" data-nuevo="informe"><span class="ico">🛠️</span><b>Nuevo informe técnico</b><span>Diagnóstico del servicio técnico</span></button></div>' +
      '<section class="tarjeta"><div class="buscar"><input class="entrada" id="buscar" type="search" placeholder="Buscar cliente, equipo, número…" autocomplete="off"></div>' +
      '<div class="chips" style="margin-bottom:6px">' + [['todos', 'Todos'], ['cotizacion', 'Cotizaciones'], ['informe', 'Informes']].map(function (f) {
        return '<button class="chip" data-filtro="' + f[0] + '" aria-pressed="' + (filtro === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '<span class="espacio"></span><button class="chip chip--sel" data-acc="sel" aria-pressed="' + seleccionando + '">' + (seleccionando ? 'Cancelar' : '☑️ Seleccionar') + '</button></div>' +
      '<div class="lista" id="lista"></div></section>' +
      '<div class="acciones" id="barra-sel"' + (seleccionando ? '' : ' hidden') + '><div class="acciones-in">' +
      '<button class="boton boton--fant" data-acc="sel-todo">Todos</button>' +
      '<button class="boton boton--borrar" data-acc="sel-borrar" disabled>🗑️ Borrar</button></div></div>';
    $('#buscar').value = busqueda;
    $('#buscar').addEventListener('input', function (e) { busqueda = e.target.value; pintarLista(); });
    app.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ir) ir(b.dataset.ir);
      else if (b.id === 'estado-sync') {
        if (!conectado()) ir('/ajustes');
        else if (!sincronizando) sincronizar().then(function (ok) { aviso(ok ? '✅ Sincronizado.' : explicarError(ultimoError), !ok); });
      }
      else if (b.dataset.nuevo) nuevo(b.dataset.nuevo);
      else if (b.dataset.filtro) { filtro = b.dataset.filtro; ls.set('nbs:filtro', filtro); $$('[data-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); pintarLista(); }
      else if (b.dataset.acc === 'sel') { seleccionando = !seleccionando; elegidos = {}; inicio(); }
      else if (b.dataset.acc === 'sel-todo') {
        var vis = $$('#lista [data-elegir]').map(function (x) { return x.dataset.elegir; });
        var todos = vis.length && vis.every(function (id) { return elegidos[id]; });
        vis.forEach(function (id) { if (todos) delete elegidos[id]; else elegidos[id] = true; });
        pintarLista();
      }
      else if (b.dataset.acc === 'sel-borrar') {
        var ids = Object.keys(elegidos).filter(function (id) { return docs[id]; });
        if (!ids.length) return;
        if (!window.confirm('¿Borrar ' + ids.length + (ids.length === 1 ? ' documento' : ' documentos') + '? Se borra en todos los equipos y no se puede deshacer.')) return;
        ids.forEach(borrarDoc);
        seleccionando = false; elegidos = {}; inicio();
        aviso(ids.length === 1 ? 'Documento borrado.' : ids.length + ' documentos borrados.');
      }
      else if (b.dataset.elegir) { var id = b.dataset.elegir; if (elegidos[id]) delete elegidos[id]; else elegidos[id] = true; pintarLista(); }
      else if (b.dataset.abrir) { var d = docs[b.dataset.abrir]; if (d) ir('/' + (d.tipo === 'informe' ? 'inf' : 'cot') + '/' + d.id); }
    };
    pintarSync(); pintarLista();
  }
  function totalDe(d) { return (d.items || []).reduce(function (s, it) { return s + (Number(it.cant) || 0) * (Number(it.precio) || 0); }, 0); }
  function pintarLista() {
    var cont = $('#lista'); if (!cont) return;
    var q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var lista = Object.keys(docs).map(function (k) { return docs[k]; })
      .filter(function (d) { return (d.tipo === 'cotizacion' || d.tipo === 'informe') && (filtro === 'todos' || d.tipo === filtro); })
      .filter(function (d) {
        if (!q) return true;
        var t = [d.cliente, d.celular, d.equipo, d.modelo, d.serie, d.numero, d.caso, window.NBSpdf.numeroTexto(d), (d.items || []).map(function (i) { return i.desc; }).join(' ')].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return t.indexOf(q) >= 0;
      })
      .sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0); });
    if (!lista.length) {
      cont.innerHTML = '<div class="vacio"><img src="chip.png" alt=""><div>' + (q ? 'No encontré nada con "' + esc(busqueda) + '".' : 'Todavía no hay documentos. ¡Crea tu primera cotización!') + '</div></div>';
      return;
    }
    cont.innerHTML = lista.slice(0, 200).map(function (d) {
      var inf = d.tipo === 'informe';
      var t2 = inf ? [d.equipo, d.modelo].filter(Boolean).join(' · ') || 'Sin equipo' : ((d.items || []).filter(function (i) { return i.desc; }).length + ' ítem(s)');
      if (d.atendio && String(d.atendio).trim().toLowerCase() !== String(cfg.firmante).trim().toLowerCase()) t2 += ' · por ' + d.atendio;
      var est = inf ? '<span class="etiqueta ' + (d.estado === 'Entregado' ? 'etiqueta--gris' : d.estado === 'Listo' ? 'etiqueta--verde' : 'etiqueta--ambar') + '">' + esc(d.estado || 'En revisión') + '</span>'
        : (d.enviado ? '<span class="etiqueta etiqueta--verde">Enviada</span>' : '');
      var sel = !!elegidos[d.id];
      return '<button class="fila-doc' + (sel ? ' fila-doc--elegida' : '') + '" ' + (seleccionando ? 'data-elegir="' + esc(d.id) + '" aria-pressed="' + sel + '"' : 'data-abrir="' + esc(d.id) + '"') + '>' +
        (seleccionando ? '<span class="marca' + (sel ? ' marca--si' : '') + '">' + (sel ? '✓' : '') + '</span>' : '') +
        '<span class="ico">' + (inf ? '🛠️' : '🧾') + '</span><span class="txt">' +
        '<span class="t1">' + esc(d.cliente || 'Sin cliente') + '</span><span class="t2">' + esc(window.NBSpdf.numeroTexto(d)) + ' · ' + esc(t2) + '</span></span>' +
        '<span class="der">' + (inf ? '' : '<b>' + esc(bs(totalDe(d))) + '</b>') + esc(fechaCorta(d.fecha)) + '<br>' + est + '</span></button>';
    }).join('');
    var n = Object.keys(elegidos).length, bb = $('[data-acc="sel-borrar"]');
    if (bb) { bb.disabled = !n; bb.textContent = n ? '🗑️ Borrar (' + n + ')' : '🗑️ Borrar'; }
  }
  function nuevo(tipo, base) {
    var d = tipo === 'informe'
      ? { id: uid('inf'), tipo: 'informe', fecha: hoy(), cliente: '', celular: '', equipo: 'Laptop', modelo: '', serie: '', diagnostico: '', procedimiento: '', final: '',
        opciones: [], conRepuestos: false, estado: 'En revisión', atendio: cfg.firmante, creado: Date.now() }
      : { id: uid('cot'), tipo: 'cotizacion', fecha: hoy(), titulo: cfg.titulo, cliente: '', celular: '', ciudad: cfg.tienda.ciudad,
        items: [{ cant: 1, desc: '', precio: '' }], cond: Object.assign({}, cfg.cond), obs: '', atendio: cfg.firmante, creado: Date.now() };
    if (base) Object.assign(d, base);
    guardarDoc(d);
    ir('/' + (tipo === 'informe' ? 'inf' : 'cot') + '/' + d.id);
  }

  // ===================================================================== productos recordados (para cotizar a mano)
  function productos() {
    var mapa = {};
    Object.keys(docs).forEach(function (k) {
      var d = docs[k];
      (d.items || []).forEach(function (it) {
        var desc = String(it.desc || '').trim(); if (!desc) return;
        var key = desc.toLowerCase(), f = d.fecha || '';
        if (!mapa[key] || f >= mapa[key].f) mapa[key] = { desc: desc, precio: Number(it.precio) || 0, f: f };
      });
      (d.opciones || []).forEach(function (o) {
        var desc = [o.componente, o.marca, o.capacidad].filter(Boolean).join(' ').trim(); if (!desc) return;
        var key = desc.toLowerCase(), f = d.fecha || '';
        if (!mapa[key] || f >= mapa[key].f) mapa[key] = { desc: desc, precio: Number(o.precio) || 0, f: f };
      });
    });
    return mapa;
  }

  // ===================================================================== plantillas de texto (informe)
  var PLANT_SEMILLA = [
    { campo: 'procedimiento', titulo: 'Formateo y reinstalación', texto: 'Para descartar errores de software y corrupción de archivos, se procedió a realizar un formateo profundo y la reinstalación en limpio del Sistema Operativo.' },
    { campo: 'final', titulo: 'Cambiar HDD por SSD', texto: 'Se concluye que el disco mecánico original se encuentra dañado o mecánicamente degradado, lo que impide el flujo normal de datos. Es altamente recomendable sustituir el disco duro actual por una Unidad de Estado Sólido (SSD). Esto resolverá el uso al 100%, garantizando un encendido rápido y un rendimiento óptimo del sistema.' },
  ];
  function plantillas(campo) {
    var propias = Object.keys(docs).map(function (k) { return docs[k]; }).filter(function (d) { return d.tipo === 'plantilla' && d.campo === campo; });
    var hayAlguna = Object.keys(docs).some(function (k) { return docs[k].tipo === 'plantilla'; });
    if (hayAlguna) ls.set('nbs:semilla', true);
    var listo = !conectado() || ultimaSync > 0; // si está conectado, esperar a traer las del otro equipo
    if (!ls.get('nbs:semilla', false) && !hayAlguna && listo) {
      ls.set('nbs:semilla', true);
      PLANT_SEMILLA.forEach(function (p) { guardarDoc(Object.assign({ id: uid('pl'), tipo: 'plantilla', creado: Date.now() }, p)); });
      return plantillas(campo);
    }
    return propias.sort(function (a, b) { return String(a.titulo).localeCompare(String(b.titulo)); });
  }

  // ===================================================================== editor
  var temporizadorVista = null, urlVista = null;
  function editor(d) {
    var app = $('#app'), inf = d.tipo === 'informe';
    var firmantes = Array.from(new Set([cfg.firmante].concat(cfg.firmantes || []))).filter(Boolean);
    function campo(k, et, tipo, extra, ancho) {
      return '<label class="campo' + (ancho ? ' campo--ancho' : '') + '"><span>' + et + '</span><input class="entrada" data-k="' + k + '" type="' + (tipo || 'text') + '" value="' + esc(d[k]) + '" ' + (extra || '') + '></label>';
    }
    var html = '<header class="barra"><button class="boton boton--fant boton--icono" data-acc="volver" aria-label="Volver">←</button>' +
      '<div style="min-width:0"><h1>' + (inf ? 'Informe técnico' : esc(d.titulo || 'Cotización')) + '</h1><div class="sub" id="ed-num">' + esc(window.NBSpdf.numeroTexto(d)) + '</div></div>' +
      '<div class="espacio"></div><button id="estado-sync" class="estado-sync" data-e="off"><i></i><span></span></button></header>' +
      '<div class="editor"><div class="formulario">';
    html += '<section class="tarjeta"><h2>👤 Cliente</h2><div class="campos">' +
      campo('cliente', 'Nombre o empresa', 'text', 'autocomplete="off" placeholder="Ej. UMSA, Juan Pérez"', true) +
      campo('celular', 'Celular (WhatsApp)', 'tel', 'inputmode="tel" placeholder="7XXXXXXX"') +
      campo('fecha', 'Fecha', 'date') +
      (inf ? '<label class="campo"><span>N° de caso</span><input class="entrada" data-caso="1" inputmode="numeric" value="' + esc(d.caso || d.numero || '') + '" placeholder="' + (d.numero ? d.numero : 'Se asigna solo') + '"></label>' : '') +
      (inf ? '' : campo('ciudad', 'Ciudad', 'text')) +
      (inf ? '' : '<label class="campo"><span>Título del documento</span><select class="entrada" data-k="titulo">' + ['Cotización', 'Nota de entrega', 'Proforma'].map(function (t) { return '<option' + (d.titulo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>') +
      '</div></section>';
    if (inf) {
      html += '<section class="tarjeta"><h2>💻 Equipo</h2><div class="campos">' +
        '<label class="campo"><span>Tipo de equipo</span><input class="entrada" data-k="equipo" list="dl-equipos" value="' + esc(d.equipo) + '"></label>' +
        campo('modelo', 'Marca / modelo', 'text', 'placeholder="Ej. Toshiba Satellite E55T-A"') +
        campo('serie', 'N° de serie (opcional)', 'text') +
        '<label class="campo"><span>Estado</span><select class="entrada" data-k="estado">' + ['En revisión', 'Listo', 'Entregado'].map(function (t) { return '<option' + (d.estado === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
        '</div><datalist id="dl-equipos"><option>Laptop</option><option>PC de escritorio</option><option>All in One</option><option>MacBook</option><option>Tablet</option><option>Impresora</option></datalist></section>';
      [['diagnostico', '1', 'Diagnóstico preliminar', 'Cómo ingresó el equipo y qué fallas presenta…'],
        ['procedimiento', '2', 'Procedimiento y causas probables', 'Qué se hizo y qué se encontró…'],
        ['final', '3', 'Informe final', 'Conclusión y recomendación…']].forEach(function (s) {
        html += '<section class="tarjeta"><h2><span class="num">' + s[1] + '</span>' + s[2] + '</h2><textarea class="entrada" data-k="' + s[0] + '" rows="5" placeholder="' + s[3] + '">' + esc(d[s[0]]) + '</textarea>' +
          '<div class="plant" data-plant="' + s[0] + '"></div></section>';
      });
      var conRep = conRepuestos(d);
      html += '<section class="tarjeta"><h2><span class="num">4</span>Repuestos recomendados</h2>' +
        '<label class="interruptor"><span>Incluir cotización de repuestos</span><input type="checkbox" data-acc-chk="repuestos"' + (conRep ? ' checked' : '') + '></label>' +
        '<p class="ayuda" id="rep-ayuda"' + (conRep ? ' hidden' : '') + '>Apagado: el informe sale solo con el texto del servicio realizado.</p>' +
        '<div id="rep-cuerpo"' + (conRep ? '' : ' hidden') + '><div class="chips" style="margin:12px 0 10px">' +
        REPUESTOS.map(function (rp) { return '<button class="chip" data-rep="' + esc(rp.n) + '">' + rp.e + ' ' + esc(rp.n) + '</button>'; }).join('') +
        '<button class="chip" data-rep="">➕ Otro</button></div>' +
        '<div class="items" id="items"></div>' +
        '<label class="campo" style="margin-top:12px"><span>Nota debajo de la tabla (opcional)</span><input class="entrada" data-k="notaOpciones" value="' + esc(d.notaOpciones) + '" placeholder="Ej. Precios incluyen instalación."></label></div></section>';
    } else {
      html += '<section class="tarjeta"><h2>📦 Productos</h2><div class="items" id="items"></div>' +
        '<button class="boton boton--suave boton--chico" data-acc="fila" style="margin-top:10px">+ Agregar producto</button>' +
        '<div class="total-linea"><span class="ayuda" style="margin:0">Total</span><b id="total">Bs 0,00</b></div><div class="son" id="son"></div></section>';
      var c = d.cond || {};
      html += '<section class="tarjeta"><h2>📝 Condiciones</h2><div class="campos">' +
        ['pago:Forma de pago', 'entrega:Tiempo de entrega', 'garantia:Garantía', 'validez:Validez de la oferta'].map(function (x) {
          var p = x.split(':'); return '<label class="campo"><span>' + p[1] + '</span><input class="entrada" data-c="' + p[0] + '" value="' + esc(c[p[0]]) + '"></label>';
        }).join('') +
        '<label class="interruptor campo--ancho"><span>Incluye factura</span><input type="checkbox" data-c="factura"' + (c.factura ? ' checked' : '') + '></label>' +
        '<label class="campo campo--ancho"><span>Observaciones (opcional)</span><input class="entrada" data-k="obs" value="' + esc(d.obs) + '"></label></div></section>';
    }
    html += '<section class="tarjeta"><h2>✍️ Firma</h2><div class="campos"><label class="campo campo--ancho"><span>Atendido por</span>' +
      '<input class="entrada" data-k="atendio" list="dl-firmantes" value="' + esc(d.atendio || cfg.firmante) + '"></label></div>' +
      '<datalist id="dl-firmantes">' + firmantes.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') + '</datalist>' +
      '<p class="ayuda" id="ayuda-firma"></p></section>';
    html += '</div><aside class="vista"><iframe id="vista" title="Vista previa del PDF"></iframe></aside></div>';
    html += '<datalist id="dl-productos"></datalist>';
    html += '<div class="acciones"><div class="acciones-in">' +
      '<button class="boton boton--fant boton--icono" data-acc="menu" aria-label="Más opciones">⋯</button>' +
      '<button class="boton" data-acc="ver">👁️ Ver PDF</button>' +
      '<button class="boton boton--wa" data-acc="enviar">Enviar por WhatsApp</button></div></div>';
    app.innerHTML = html;
    pintarItems(d); pintarPlantillas(d); pintarFirma(d); pintarSync();
    actualizarVista(d, 50);

    var cambio = function () { guardarDoc(d); actualizarVista(d); };
    app.oninput = function (e) {
      var t = e.target;
      if (t.dataset.k) { d[t.dataset.k] = t.value; if (t.dataset.k === 'atendio') pintarFirma(d); cambio(); }
      else if (t.dataset.accChk === 'repuestos') {
        d.conRepuestos = t.checked; $('#rep-cuerpo').hidden = !t.checked; $('#rep-ayuda').hidden = t.checked; cambio();
      }
      else if (t.dataset.c) { d.cond = d.cond || {}; d.cond[t.dataset.c] = t.type === 'checkbox' ? t.checked : t.value; cambio(); }
      else if (t.dataset.i != null) {
        var lista = inf ? d.opciones : d.items, it = lista[Number(t.dataset.i)], k = t.dataset.ik;
        it[k] = (k === 'precio' || k === 'cant') ? t.value : t.value;
        if (!inf && k === 'desc') { var pr = productos()[t.value.trim().toLowerCase()]; if (pr && !it.precio) { it.precio = pr.precio; var ip = $('[data-i="' + t.dataset.i + '"][data-ik="precio"]'); if (ip) ip.value = pr.precio; } }
        if (!inf) pintarTotal(d);
        cambio();
      }
    };
    app.onchange = function (e) {
      var t = e.target;
      if (t.dataset.ik === 'precio' || t.dataset.ik === 'cant') {
        var lista = inf ? d.opciones : d.items, it = lista[Number(t.dataset.i)];
        it[t.dataset.ik] = num(t.value) || (t.dataset.ik === 'cant' ? 1 : '');
        t.value = it[t.dataset.ik]; if (!inf) pintarTotal(d); cambio();
      }
      if (t.dataset.caso) {
        var nc = Math.floor(num(t.value));
        if (nc >= 1) d.caso = nc; else { delete d.caso; t.value = d.numero || ''; }
        cambio(); var en = $('#ed-num'); if (en) en.textContent = window.NBSpdf.numeroTexto(d);
        // que el siguiente informe siga desde este número
        if (nc >= 1 && conectado() && (!numeros || nc >= (numeros.informe || 0) + 1)) {
          api({ accion: 'numeros', numeros: { informe: nc + 1 } }).then(function (r) { numeros = r.numeros; ls.set('nbs:numeros', numeros); }).catch(function () {});
        }
      }
      if (t.dataset.k === 'titulo') { $('.barra h1').textContent = t.value; }
      if (t.dataset.k === 'atendio') {
        var n = t.value.trim();
        if (n && (cfg.firmantes || []).indexOf(n) < 0) { cfg.firmantes = (cfg.firmantes || []).concat(n).slice(-12); guardarCfg(); }
      }
    };
    app.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var acc = b.dataset.acc;
      if (acc === 'volver') ir('/');
      else if (b.dataset.rep != null) {
        var nombre = b.dataset.rep, vacia = d.opciones.length === 1 && !d.opciones[0].componente && !d.opciones[0].precio;
        var fila = { componente: nombre, marca: '', capacidad: '', precio: '' };
        if (vacia) d.opciones[0] = fila; else d.opciones.push(fila);
        cambio(); pintarItems(d);
        var filas = $$('#items .item--op:not(.items-cab)'), ult = filas[filas.length - 1];
        if (ult) $(nombre ? '[data-ik="marca"]' : '[data-ik="componente"]', ult).focus();
      }
      else if (acc === 'fila') {
        if (inf) d.opciones.push({ componente: '', marca: '', capacidad: '', precio: '' }); else d.items.push({ cant: 1, desc: '', precio: '' });
        cambio(); pintarItems(d);
        var ins = $$('#items .item:last-child input'); if (ins[0]) ins[inf ? 0 : 1].focus();
      } else if (acc === 'quitar') {
        var lista = inf ? d.opciones : d.items; lista.splice(Number(b.dataset.i), 1);
        if (!lista.length && !inf) lista.push({ cant: 1, desc: '', precio: '' });
        cambio(); pintarItems(d);
      } else if (acc === 'ver') verPDF(docs[d.id] || d);
      else if (acc === 'enviar') enviar(docs[d.id] || d);
      else if (acc === 'menu') menuEditor(d);
      else if (b.dataset.usar) {
        var pl = docs[b.dataset.usar]; if (!pl) return;
        var ta = $('textarea[data-k="' + pl.campo + '"]');
        d[pl.campo] = (d[pl.campo] ? d[pl.campo].replace(/\s+$/, '') + '\n' : '') + pl.texto;
        ta.value = d[pl.campo]; cambio(); ta.focus();
      } else if (b.dataset.guardarPlant) guardarPlantilla(d, b.dataset.guardarPlant);
      else if (b.dataset.borrarPlant) {
        var x = docs[b.dataset.borrarPlant];
        if (x && window.confirm('¿Borrar el texto guardado "' + x.titulo + '"?')) { borrarDoc(x.id); pintarPlantillas(d); }
      }
    };
  }
  var REPUESTOS = [
    { n: 'Pantalla', e: '🖥️', m: 'Ej. LG / AUO', d: 'Ej. 15.6" HD 30 pines' },
    { n: 'Teclado', e: '⌨️', m: 'Ej. Original HP', d: 'Ej. Español, retroiluminado' },
    { n: 'Unidad de Estado Sólido (SSD)', e: '💾', m: 'Ej. Kingston', d: 'Ej. 480 GB SATA' },
    { n: 'Memoria RAM', e: '🧠', m: 'Ej. Crucial', d: 'Ej. 8 GB DDR4 3200' },
    { n: 'Batería', e: '🔋', m: 'Ej. Compatible', d: 'Ej. 4 celdas 41Wh' },
    { n: 'Cargador', e: '🔌', m: 'Ej. Original Dell', d: 'Ej. 19.5V 3.34A 65W' },
  ];
  function ejemplo(comp, tipo) {
    var rp = REPUESTOS.find(function (x) { return x.n.toLowerCase() === String(comp || '').toLowerCase(); });
    return rp ? rp[tipo] : (tipo === 'm' ? 'Marca / modelo' : 'Detalle');
  }
  function conRepuestos(d) {
    if (d.conRepuestos != null) return !!d.conRepuestos;
    return (d.opciones || []).some(function (o) { return o.componente || o.precio; }); // informes viejos
  }
  function pintarItems(d) {
    var inf = d.tipo === 'informe', cont = $('#items'), prods = productos();
    $('#dl-productos').innerHTML = Object.keys(prods).slice(0, 300).map(function (k) { return '<option value="' + esc(prods[k].desc) + '">' + esc(bs(prods[k].precio)) + '</option>'; }).join('');
    if (inf) {
      if (!d.opciones.length) { cont.innerHTML = '<p class="ayuda" style="margin:0">Toca el repuesto que hay que cambiar. Puedes agregar varios.</p>'; return; }
      cont.innerHTML = '<div class="item item--op items-cab"><span>Repuesto</span><span>Marca / modelo</span><span>Detalle</span><span>Precio Bs</span><span></span></div>' +
        d.opciones.map(function (o, i) {
          return '<div class="item item--op">' +
            '<input class="entrada" data-i="' + i + '" data-ik="componente" value="' + esc(o.componente) + '" placeholder="Repuesto" list="dl-componentes">' +
            '<input class="entrada" data-i="' + i + '" data-ik="marca" value="' + esc(o.marca) + '" placeholder="' + esc(ejemplo(o.componente, 'm')) + '">' +
            '<input class="entrada" data-i="' + i + '" data-ik="capacidad" value="' + esc(o.capacidad) + '" placeholder="' + esc(ejemplo(o.componente, 'd')) + '">' +
            '<input class="entrada" data-i="' + i + '" data-ik="precio" value="' + esc(o.precio) + '" inputmode="decimal" placeholder="0">' +
            '<button class="quitar" data-acc="quitar" data-i="' + i + '" aria-label="Quitar opción">✕</button></div>';
        }).join('') +
        '<datalist id="dl-componentes">' + REPUESTOS.map(function (rp) { return '<option>' + esc(rp.n) + '</option>'; }).join('') + '<option>SSD M.2 NVMe</option><option>Pasta térmica y mantenimiento</option><option>Bisagras</option><option>Ventilador</option><option>Puerto de carga</option></datalist>';
    } else {
      cont.innerHTML = '<div class="item items-cab"><span>Cant.</span><span>Descripción</span><span>Precio unit.</span><span></span></div>' +
        d.items.map(function (it, i) {
          return '<div class="item"><input class="entrada" data-i="' + i + '" data-ik="cant" value="' + esc(it.cant) + '" inputmode="decimal" aria-label="Cantidad">' +
            '<input class="entrada" data-i="' + i + '" data-ik="desc" value="' + esc(it.desc) + '" list="dl-productos" placeholder="Ej. Memoria 8GB DDR4 3200 Kingston" aria-label="Descripción">' +
            '<input class="entrada" data-i="' + i + '" data-ik="precio" value="' + esc(it.precio) + '" inputmode="decimal" placeholder="0,00" aria-label="Precio unitario">' +
            '<button class="quitar" data-acc="quitar" data-i="' + i + '" aria-label="Quitar producto">✕</button></div>';
        }).join('');
      pintarTotal(d);
    }
  }
  function pintarTotal(d) {
    var t = totalDe(d);
    var a = $('#total'); if (a) a.textContent = bs(t);
    var s = $('#son'); if (s) s.textContent = t > 0 ? window.NBSpdf.sonLiteral(t) : '';
  }
  function pintarPlantillas(d) {
    $$('[data-plant]').forEach(function (cont) {
      var campo = cont.dataset.plant, lista = plantillas(campo);
      cont.innerHTML = lista.map(function (p) {
        return '<span style="display:inline-flex;gap:2px"><button class="chip" data-usar="' + esc(p.id) + '" title="' + esc(p.texto.slice(0, 160)) + '">+ ' + esc(p.titulo) + '</button>' +
          '<button class="chip chip--mas" data-borrar-plant="' + esc(p.id) + '" aria-label="Borrar ' + esc(p.titulo) + '">✕</button></span>';
      }).join('') + '<button class="chip chip--mas" data-guardar-plant="' + campo + '">⭐ Guardar este texto</button>';
    });
  }
  function guardarPlantilla(d, campo) {
    var texto = String(d[campo] || '').trim();
    if (!texto) { aviso('Primero escribe el texto que quieres guardar.', true); return; }
    var titulo = window.prompt('¿Con qué nombre guardo este texto? (ej. "No enciende - placa")', texto.split(/[.,\n]/)[0].slice(0, 34));
    if (!titulo) return;
    guardarDoc({ id: uid('pl'), tipo: 'plantilla', campo: campo, titulo: titulo.trim().slice(0, 40), texto: texto, creado: Date.now() });
    pintarPlantillas(d); aviso('Texto guardado. Aparecerá en todos tus informes.');
  }
  function pintarFirma(d) {
    var p = $('#ayuda-firma'); if (!p) return;
    var a = String(d.atendio || '').trim().toLowerCase(), es = a && a === String(cfg.firmaDe).toLowerCase();
    p.textContent = 'El PDF lleva el sello de la tienda y el nombre "' + (d.atendio || '') + '".';
  }
  function actualizarVista(d, ms) {
    if (window.innerWidth < 1100) return;
    clearTimeout(temporizadorVista);
    temporizadorVista = setTimeout(async function () {
      var f = $('#vista'); if (!f) return;
      var pdf = await crearPDF(docs[d.id] || d);
      if (urlVista) URL.revokeObjectURL(urlVista);
      urlVista = URL.createObjectURL(pdf.output('blob'));
      f.src = urlVista + '#toolbar=0&navpanes=0&view=FitH';
    }, ms == null ? 700 : ms);
  }
  function menuEditor(d) {
    var inf = d.tipo === 'informe';
    var h = hoja('Opciones',
      '<div class="pila" style="gap:2px">' +
      '<button class="menu-op" data-m="descargar">⬇️ Descargar PDF</button>' +
      (inf && conRepuestos(d) ? '<button class="menu-op" data-m="acot">🧾 Crear cotización con estos repuestos</button>' : '') +
      '<button class="menu-op" data-m="duplicar">📄 Duplicar (nuevo número)</button>' +
      '<button class="menu-op menu-op--peligro" data-m="borrar">🗑️ Borrar</button></div>');
    h.el.onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return; h.cerrar();
      var x = docs[d.id] || d;
      if (b.dataset.m === 'descargar') enviar(x, true);
      else if (b.dataset.m === 'duplicar') {
        var copia = JSON.parse(JSON.stringify(x)); delete copia.numero; delete copia.enviado; delete copia.actualizado;
        copia.id = uid(x.tipo === 'informe' ? 'inf' : 'cot'); copia.fecha = hoy(); copia.creado = Date.now();
        guardarDoc(copia); ir('/' + (x.tipo === 'informe' ? 'inf' : 'cot') + '/' + copia.id); aviso('Copia creada.');
      } else if (b.dataset.m === 'acot') {
        var items = (x.opciones || []).filter(function (o) { return o.componente || o.precio; }).map(function (o) {
          return { cant: 1, desc: [o.componente, o.marca, o.capacidad].filter(Boolean).join(' '), precio: Number(o.precio) || '' };
        });
        if (!items.length) { aviso('No hay opciones para cotizar.', true); return; }
        nuevo('cotizacion', { cliente: x.cliente, celular: x.celular, items: items, obs: 'Según informe técnico ' + window.NBSpdf.numeroTexto(x) + (x.modelo ? ' (' + x.modelo + ')' : '') });
      } else if (b.dataset.m === 'borrar') {
        if (window.confirm('¿Borrar este documento? Esto no se puede deshacer.')) { borrarDoc(x.id); ir('/'); aviso('Documento borrado.'); }
      }
    };
  }

  // ===================================================================== ajustes
  function ajustes() {
    var app = $('#app');
    var n = numeros ? { cotizacion: (numeros.cotizacion || 0) + 1, informe: (numeros.informe || 0) + 1 } : null;
    app.innerHTML =
      '<header class="barra"><button class="boton boton--fant boton--icono" data-acc="volver" aria-label="Volver">←</button><h1>Ajustes</h1><div class="espacio"></div>' +
      '<button id="estado-sync" class="estado-sync" data-e="off"><i></i><span></span></button></header>' +
      '<section class="tarjeta"><h2>🔗 Conexión con tu hoja de Google</h2><div class="campos">' +
      '<label class="campo campo--ancho"><span>Dirección de tu script (termina en /exec)</span><input class="entrada" id="a-url" type="url" value="' + esc(cfg.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>' +
      '<label class="campo campo--ancho"><span>Clave</span><input class="entrada" id="a-clave" type="password" value="' + esc(cfg.clave) + '" autocomplete="off"></label></div>' +
      '<button class="boton boton--pri bloque" data-acc="conectar" style="margin-top:12px">' + (conectado() ? 'Guardar y probar' : 'Conectar') + '</button>' +
      '<p class="ayuda">La dirección y la clave se guardan solo en este equipo. Hazlo una vez en la PC y otra en el celular.</p></section>' +
      '<section class="tarjeta"><h2>🔢 Numeración</h2>' + (n ? '<div class="campos">' +
        '<label class="campo"><span>Próxima cotización (COT-)</span><input class="entrada" id="a-ncot" inputmode="numeric" value="' + n.cotizacion + '"></label></div>' +
        '<p class="ayuda">El N° de caso de los informes se cambia dentro de cada informe.</p>' +
        '<button class="boton boton--suave bloque" data-acc="numeros" style="margin-top:10px">Guardar numeración</button><p class="ayuda">Los números los da tu hoja de Google, así nunca se repiten entre la PC y el celular.</p>'
        : '<p class="ayuda" style="margin:0">Conecta tu script para ver y ajustar los números.</p>') + '</section>' +
      '<section class="tarjeta"><h2>✍️ Nombre en el PDF</h2><div class="campos">' +
      '<label class="campo campo--ancho"><span>Nombre por defecto</span><input class="entrada" id="a-firmante" value="' + esc(cfg.firmante) + '"></label>' +
      '</div><p class="ayuda">El PDF lleva el sello de la tienda y el nombre de quien atendió. Puedes cambiarlo en cada documento.</p>' +
      (cfg.firmantes && cfg.firmantes.length > 1 ? '<div class="chips" style="margin-top:8px">' + cfg.firmantes.map(function (f) { return '<span class="chip">' + esc(f) + '</span>'; }).join('') + '<button class="chip" data-acc="limpiar-firmantes">Limpiar lista</button></div>' : '') +
      '</section>' +
      '<section class="tarjeta"><h2>👥 Compañeros de trabajo</h2>' +
      (conectado() ? '<p class="ayuda" style="margin:0 0 10px">Mándales este enlace por WhatsApp. Al abrirlo ponen su nombre y quedan conectados a la misma hoja: misma numeración e historial, y cada documento sale con el nombre de quien lo hizo.</p>' +
        '<button class="boton boton--wa bloque" data-acc="invitar">Invitar a un compañero</button>' +
        '<p class="ayuda">El enlace lleva la clave de tu hoja: compártelo solo con tu equipo. Si alguien deja de trabajar contigo, cambia la clave en tu script y vuelve a invitar a los demás.</p>'
        : '<p class="ayuda" style="margin:0">Primero conecta tu hoja de Google; después podrás invitar a tus compañeros.</p>') + '</section>' +
      '<section class="tarjeta"><h2>🏪 Datos de la tienda (pie del PDF)</h2><div class="campos">' +
      ['nombre:Nombre', 'tel:Teléfono', 'dir:Dirección', 'ciudad:Ciudad'].map(function (x) { var p = x.split(':'); return '<label class="campo"><span>' + p[1] + '</span><input class="entrada" data-t="' + p[0] + '" value="' + esc(cfg.tienda[p[0]]) + '"></label>'; }).join('') + '</div></section>' +
      '<section class="tarjeta"><h2>📝 Condiciones por defecto (cotización)</h2><div class="campos">' +
      ['pago:Forma de pago', 'entrega:Tiempo de entrega', 'garantia:Garantía', 'validez:Validez'].map(function (x) { var p = x.split(':'); return '<label class="campo"><span>' + p[1] + '</span><input class="entrada" data-cd="' + p[0] + '" value="' + esc(cfg.cond[p[0]]) + '"></label>'; }).join('') +
      '<label class="interruptor campo--ancho"><span>Incluye factura</span><input type="checkbox" data-cd="factura"' + (cfg.cond.factura ? ' checked' : '') + '></label>' +
      '<label class="campo"><span>Título por defecto</span><select class="entrada" id="a-titulo">' + ['Cotización', 'Nota de entrega', 'Proforma'].map(function (t) { return '<option' + (cfg.titulo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
      '<label class="interruptor"><span>Mostrar a Chip en el PDF</span><input type="checkbox" id="a-chip"' + (cfg.mostrarChip !== false ? ' checked' : '') + '></label>' +
      '</div></section>';
    pintarSync();
    app.oninput = function (e) {
      var t = e.target;
      if (t.dataset.t) { cfg.tienda[t.dataset.t] = t.value; guardarCfg(); }
      else if (t.dataset.cd) { cfg.cond[t.dataset.cd] = t.type === 'checkbox' ? t.checked : t.value; guardarCfg(); }
      else if (t.id === 'a-firmante') { cfg.firmante = t.value.trim(); guardarCfg(); }
      else if (t.id === 'a-firmade') { cfg.firmaDe = t.value.trim(); guardarCfg(); }
      else if (t.id === 'a-titulo') { cfg.titulo = t.value; guardarCfg(); }
      else if (t.id === 'a-chip') { cfg.mostrarChip = t.checked; guardarCfg(); }
    };
    app.onchange = app.oninput;
    app.onclick = async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.acc === 'volver') ir('/');
      else if (b.dataset.acc === 'conectar') {
        var url = $('#a-url').value.trim(), clave = $('#a-clave').value.trim();
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { aviso('Esa dirección no parece de Google Apps Script.', true); return; }
        if (!clave) { aviso('Falta la clave.', true); return; }
        cfg.url = url; cfg.clave = clave; guardarCfg();
        b.disabled = true; b.textContent = 'Probando…';
        var ok = await cargarActivos();
        if (ok) { ultimaSync = 0; await sincronizar(); aviso('✅ Conectado. El sello de la tienda ya está listo.'); render(); }
        else { aviso(explicarError(ultimoError), true); b.disabled = false; b.textContent = 'Conectar'; }
      } else if (b.dataset.acc === 'numeros') {
        try {
          var r = await api({ accion: 'numeros', numeros: { cotizacion: num($('#a-ncot').value) } });
          numeros = r.numeros; ls.set('nbs:numeros', numeros); aviso('Numeración guardada.');
        } catch (err) { aviso('No pude guardar la numeración (sin conexión).', true); }
      } else if (b.dataset.acc === 'invitar') invitar();
      else if (b.dataset.acc === 'limpiar-firmantes') { cfg.firmantes = [cfg.firmante]; guardarCfg(); ajustes(); }
      else if (b.id === 'estado-sync') sincronizar();
    };
  }

  // ===================================================================== equipo: invitar y unirse
  function enlaceInvitacion() {
    return location.origin + location.pathname + '#/unirse?u=' + encodeURIComponent(cfg.url) + '&k=' + encodeURIComponent(cfg.clave);
  }
  async function invitar() {
    var enlace = enlaceInvitacion();
    var texto = 'Te paso la app de cotizaciones e informes técnicos de Notebooks Store. Ábrela, pon tu nombre y listo:';
    if (navigator.share) {
      try { await navigator.share({ title: 'Cotizador NotebooksStore', text: texto, url: enlace }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(texto + ' ' + enlace); aviso('Enlace copiado. Pégalo en el chat de tu compañero.'); }
    catch (e) { window.prompt('Copia este enlace y mándalo por WhatsApp:', enlace); }
  }
  function unirse(r) {
    var q = {};
    (r.split('?')[1] || '').split('&').forEach(function (par) { var i = par.indexOf('='); if (i > 0) q[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1)); });
    if (!q.u || !q.k) { ir('/'); return; }
    var app = $('#app');
    app.innerHTML = '<div class="tarjeta" style="max-width:460px;margin:8vh auto 0;text-align:center">' +
      '<img src="chip.png" alt="" style="width:130px;height:auto;margin-bottom:4px">' +
      '<h1 style="margin:0 0 6px;font-size:1.3rem">¡Bienvenido al equipo!</h1>' +
      '<p class="ayuda" style="margin:0 0 16px;font-size:.9rem">Te invitaron a la app de cotizaciones e informes de Notebooks Store. Escribe tu nombre como quieres que salga en los PDF.</p>' +
      '<label class="campo" style="text-align:left"><span>Tu nombre</span><input class="entrada" id="u-nombre" autocomplete="name" placeholder="Ej. Luis Quispe" value="' +
      esc(cfg.url === q.u && cfg.firmante !== CFG_DEF.firmante ? cfg.firmante : '') + '"></label>' +
      '<button class="boton boton--pri bloque" id="u-entrar" style="margin-top:14px">Entrar</button></div>';
    var inp = $('#u-nombre'); setTimeout(function () { inp.focus(); }, 60);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#u-entrar').click(); });
    $('#u-entrar').onclick = async function () {
      var nombre = inp.value.trim().replace(/\s+/g, ' ');
      if (nombre.length < 2) { aviso('Escribe tu nombre.', true); inp.focus(); return; }
      var b = this; b.disabled = true; b.textContent = 'Conectando…';
      cfg.url = q.u; cfg.clave = q.k; cfg.firmante = nombre;
      cfg.firmantes = [nombre].concat((cfg.firmantes || []).filter(function (f) { return f !== nombre && f !== CFG_DEF.firmante; })).slice(0, 12);
      guardarCfg();
      ultimaSync = 0; ls.set('nbs:sync', 0);
      var ok = await cargarActivos();
      if (!ok) { b.disabled = false; b.textContent = 'Entrar'; aviso('No pude conectar. Pide a quien te invitó un enlace nuevo.', true); return; }
      await sincronizar();
      history.replaceState(null, '', location.pathname + '#/');
      render();
      aviso('✅ Listo, ' + nombre.split(' ')[0] + '. Instálala desde el menú del navegador: "Instalar" o "Añadir a pantalla de inicio".');
    };
  }

  // ===================================================================== arranque
  window.addEventListener('online', function () { programarSync(200); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && conectado()) programarSync(300); });
  setInterval(function () { if (conectado() && !document.hidden) sincronizar(); }, 60000);
  render();
  prepararImagenes();
  if (conectado()) programarSync(200);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  // Pedir al navegador que no borre los datos guardados de la app (conexión, borradores).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  window.__nbs = { docs: function () { return docs; }, cfg: cfg, sincronizar: sincronizar };
})();
