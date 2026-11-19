// NotebooksStore · generación de PDF (cotización e informe técnico) con jsPDF.
(function () {
  var AZUL = [21, 85, 143], AZUL_CLARO = [47, 127, 208], CIAN = [19, 166, 216];
  var TINTA = [22, 30, 48], GRIS = [96, 106, 128], GRIS_CLARO = [232, 238, 247], LINEA = [206, 216, 232];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function fechaLarga(f, ciudad) {
    var p = String(f || '').split('-').map(Number);
    if (p.length < 3 || !p[0]) return '';
    return (ciudad ? ciudad + ', ' : '') + p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
  }
  function bs(n) {
    n = Number(n) || 0;
    return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---- número a letras (para "Son: ... 00/100 Bolivianos")
  var U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
    'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  var D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  var C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function menosDeMil(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    var c = Math.floor(n / 100), r = n % 100, s = C[c];
    if (r) {
      var t = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
      s = (s ? s + ' ' : '') + t;
    }
    return s;
  }
  function letras(n) {
    n = Math.floor(n);
    if (n === 0) return 'cero';
    var mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000, s = [];
    if (mill) s.push(mill === 1 ? 'un millón' : menosDeMil(mill).replace(/uno$/, 'un') + ' millones');
    if (miles) s.push(miles === 1 ? 'mil' : menosDeMil(miles).replace(/uno$/, 'un') + ' mil');
    if (resto) s.push(menosDeMil(resto));
    return s.join(' ');
  }
  function sonLiteral(total) {
    var ent = Math.floor(total + 1e-9), cent = Math.round((total - ent) * 100);
    var t = letras(ent);
    return 'Son: ' + t.charAt(0).toUpperCase() + t.slice(1) + ' ' + String(cent).padStart(2, '0') + '/100 Bolivianos';
  }

  function nuevoDoc() {
    var J = window.jspdf.jsPDF;
    return new J({ unit: 'mm', format: 'letter', compress: true });
  }

  function Hoja(pdf, a, opciones) {
    this.pdf = pdf; this.a = a; this.o = opciones;
    this.W = pdf.internal.pageSize.getWidth(); this.H = pdf.internal.pageSize.getHeight();
    this.M = 18; this.y = 0; this.pagina = 0;
  }
  Hoja.prototype.nuevaPagina = function () {
    var p = this.pdf;
    if (this.pagina) p.addPage();
    this.pagina++;
    // Marca de agua
    if (this.a.logo) {
      try {
        p.saveGraphicsState();
        p.setGState(new p.GState({ opacity: 0.06 }));
        var w = 130, h = w * this.a.logoRatio;
        p.addImage(this.a.logo, 'PNG', (this.W - w) / 2, (this.H - h) / 2 + 8, w, h, 'logo', 'FAST');
        p.restoreGraphicsState();
      } catch (e) {}
    }
    // Barra superior fina
    p.setFillColor.apply(p, AZUL); p.rect(0, 0, this.W, 3.2, 'F');
    p.setFillColor.apply(p, CIAN); p.rect(this.W * 0.62, 0, this.W * 0.38, 3.2, 'F');
    this.y = this.M;
    if (this.pagina === 1) this.encabezado();
    else this.y = this.M + 2;
    this.pie();
  };
  Hoja.prototype.encabezado = function () {
    var p = this.pdf, o = this.o, M = this.M;
    var lw = 50, lh = lw * this.a.logoRatio;
    if (this.a.logo) p.addImage(this.a.logo, 'PNG', M - 2, M - 6, lw, lh, 'logo', 'FAST');
    var x = this.W - M;
    p.setTextColor.apply(p, AZUL); p.setFont('helvetica', 'bold'); p.setFontSize(19);
    p.text(o.titulo, x, M + 4, { align: 'right' });
    p.setFontSize(11); p.setTextColor.apply(p, TINTA);
    p.text(o.numero, x, M + 11, { align: 'right' });
    p.setFont('helvetica', 'normal'); p.setFontSize(9); p.setTextColor.apply(p, GRIS);
    p.text(o.fecha, x, M + 17, { align: 'right' });
    if (o.borrador) { p.setTextColor(200, 60, 80); p.setFont('helvetica', 'bold'); p.text('BORRADOR', x, M + 22.5, { align: 'right' }); }
    this.y = M - 6 + lh + 4;
    p.setDrawColor.apply(p, LINEA); p.setLineWidth(0.4); p.line(M, this.y, this.W - M, this.y);
    this.y += 7;
  };
  Hoja.prototype.pie = function () {
    var p = this.pdf, t = this.o.tienda || {};
    p.setFont('helvetica', 'normal'); p.setFontSize(7.5); p.setTextColor.apply(p, GRIS);
    var linea = [t.nombre || 'Notebooks Store', 'Accesorios para Portátiles', t.tel ? 'Tel. ' + t.tel : '', t.dir || '', t.ciudad || ''].filter(Boolean).join('  ·  ');
    p.setDrawColor.apply(p, LINEA); p.setLineWidth(0.3); p.line(this.M, this.H - 14, this.W - this.M, this.H - 14);
    p.text(this.o.pie || linea, this.M, this.H - 9);
    p.text('Pág. ' + this.pagina, this.W - this.M, this.H - 9, { align: 'right' });
  };
  Hoja.prototype.limite = function () { return this.H - 20; };
  Hoja.prototype.asegurar = function (h) { if (this.y + h > this.limite()) this.nuevaPagina(); };

  Hoja.prototype.parrafo = function (texto, opts) {
    var p = this.pdf; opts = opts || {};
    p.setFont('helvetica', opts.negrita ? 'bold' : 'normal'); p.setFontSize(opts.tam || 10); p.setTextColor.apply(p, opts.color || TINTA);
    var ancho = opts.ancho || this.W - 2 * this.M, x = opts.x || this.M, alto = (opts.tam || 10) * 0.45;
    String(texto || '').split(/\n/).forEach(function (bloque, bi, todos) {
      var lineas = p.splitTextToSize(bloque, ancho);
      if (!lineas.length) lineas = [''];
      for (var i = 0; i < lineas.length; i++) {
        this.asegurar(alto + 1);
        var ultima = i === lineas.length - 1;
        p.text(lineas[i], x, this.y, ultima || !opts.justificar ? {} : { align: 'justify', maxWidth: ancho });
        this.y += alto;
      }
      if (bi < todos.length - 1) this.y += alto * 0.35;
    }, this);
  };
  Hoja.prototype.seccion = function (numero, titulo) {
    var p = this.pdf;
    this.asegurar(16);
    this.y += 2;
    p.setFillColor.apply(p, AZUL); p.roundedRect(this.M, this.y - 4.6, 6.4, 6.4, 1.2, 1.2, 'F');
    p.setFont('helvetica', 'bold'); p.setFontSize(9.5); p.setTextColor(255, 255, 255);
    p.text(String(numero), this.M + 3.2, this.y, { align: 'center' });
    p.setFontSize(11); p.setTextColor.apply(p, AZUL);
    p.text(titulo, this.M + 9.5, this.y);
    this.y += 6;
  };

  // Tabla simple: columnas [{t, w (mm, 0 = flexible), a: 'left'|'right'|'center'}]
  Hoja.prototype.tabla = function (cols, filas, pieFila) {
    var p = this.pdf, M = this.M, ancho = this.W - 2 * M;
    var fijo = cols.reduce(function (s, c) { return s + (c.w || 0); }, 0);
    var flex = cols.filter(function (c) { return !c.w; }).length;
    var anchos = cols.map(function (c) { return c.w || (ancho - fijo) / flex; });
    var self = this;
    function cabecera() {
      p.setFillColor.apply(p, AZUL); p.roundedRect(M, self.y, ancho, 8, 1.6, 1.6, 'F');
      p.setFont('helvetica', 'bold'); p.setFontSize(9); p.setTextColor(255, 255, 255);
      var x = M;
      cols.forEach(function (c, i) {
        var tx = c.a === 'right' ? x + anchos[i] - 2.5 : c.a === 'center' ? x + anchos[i] / 2 : x + 2.5;
        p.text(c.t, tx, self.y + 5.3, { align: c.a || 'left' });
        x += anchos[i];
      });
      self.y += 8;
    }
    this.asegurar(18); cabecera();
    p.setFont('helvetica', 'normal'); p.setFontSize(9.5);
    filas.forEach(function (f, fi) {
      var celdas = f.map(function (v, i) { return p.splitTextToSize(String(v == null ? '' : v), anchos[i] - 5); });
      var alto = Math.max.apply(null, celdas.map(function (l) { return l.length; })) * 4.3 + 3.6;
      if (self.y + alto > self.limite()) { self.nuevaPagina(); cabecera(); p.setFont('helvetica', 'normal'); p.setFontSize(9.5); }
      if (fi % 2 === 1) { p.setFillColor(244, 247, 252); p.rect(M, self.y, ancho, alto, 'F'); }
      p.setTextColor.apply(p, TINTA);
      var x = M;
      celdas.forEach(function (lin, i) {
        var c = cols[i], tx = c.a === 'right' ? x + anchos[i] - 2.5 : c.a === 'center' ? x + anchos[i] / 2 : x + 2.5;
        p.setFont('helvetica', c.negrita ? 'bold' : 'normal');
        p.text(lin, tx, self.y + 5, { align: c.a || 'left' });
        x += anchos[i];
      });
      self.y += alto;
      p.setDrawColor.apply(p, LINEA); p.setLineWidth(0.2); p.line(M, self.y, M + ancho, self.y);
    });
    if (pieFila) {
      this.asegurar(12);
      var w = anchos.slice(-2).reduce(function (s, v) { return s + v; }, 0) + 14;
      p.setFillColor.apply(p, GRIS_CLARO); p.roundedRect(M + ancho - w, self.y + 2, w, 9, 1.6, 1.6, 'F');
      p.setFont('helvetica', 'bold'); p.setFontSize(10.5); p.setTextColor.apply(p, AZUL);
      p.text(pieFila[0], M + ancho - w + 3, self.y + 8);
      p.setTextColor.apply(p, TINTA);
      p.text(pieFila[1], M + ancho - 2.5, self.y + 8, { align: 'right' });
      self.y += 14;
    } else self.y += 4;
  };

  Hoja.prototype.cajaDatos = function (pares) {
    var p = this.pdf, M = this.M, ancho = this.W - 2 * M, col = ancho / 2;
    var filas = Math.ceil(pares.length / 2), alto = filas * 7 + 5;
    this.asegurar(alto + 4);
    p.setFillColor(244, 247, 252); p.setDrawColor.apply(p, LINEA); p.setLineWidth(0.3);
    p.roundedRect(M, this.y, ancho, alto, 2.2, 2.2, 'FD');
    var y0 = this.y + 6.5, self = this;
    pares.forEach(function (par, i) {
      var x = M + 4 + (i % 2) * col, y = y0 + Math.floor(i / 2) * 7;
      p.setFont('helvetica', 'bold'); p.setFontSize(8); p.setTextColor.apply(p, GRIS);
      p.text(par[0].toUpperCase(), x, y);
      var etW = p.getTextWidth(par[0].toUpperCase()) + 2.5;
      p.setFont('helvetica', 'normal'); p.setFontSize(10); p.setTextColor.apply(p, TINTA);
      var v = p.splitTextToSize(String(par[1] || '—'), col - etW - 8)[0];
      p.text(v, x + etW, y);
    });
    this.y += alto + 7;
  };

  Hoja.prototype.firma = function (nombre, cargo, conFirma) {
    var p = this.pdf, a = this.a;
    this.asegurar(36);
    var cx = this.W / 2, y = this.y + 2;
    if (a.sello) { var sw = 36, sh = sw * a.selloRatio; p.addImage(a.sello, 'PNG', cx - sw / 2, y, sw, sh, 'sello', 'FAST'); y += sh; }
    if (conFirma && a.firma) { var fw = 29, fh = fw * a.firmaRatio; p.addImage(a.firma, 'PNG', cx - fw / 2 + 2, y - 4, fw, fh, 'firma', 'FAST'); y += fh - 8; }
    else y += 12;
    p.setDrawColor.apply(p, GRIS); p.setLineWidth(0.3); p.line(cx - 32, y, cx + 32, y);
    p.setFont('helvetica', 'bold'); p.setFontSize(10); p.setTextColor.apply(p, TINTA);
    p.text(String(nombre || '').toUpperCase(), cx, y + 5, { align: 'center' });
    p.setFont('helvetica', 'normal'); p.setFontSize(9); p.setTextColor.apply(p, GRIS);
    p.text(cargo, cx, y + 9.5, { align: 'center' });
    this.y = y + 13;
  };
  Hoja.prototype.chip = function (texto) {
    var p = this.pdf, a = this.a;
    if (!a.chip) return;
    var w = 24, h = w * a.chipRatio, x = this.M - 2, y = this.H - 16 - h;
    if (this.y > y - 2) return; // no tapar contenido
    p.addImage(a.chip, 'PNG', x, y, w, h, 'chip', 'FAST');
    p.setFont('helvetica', 'bold'); p.setFontSize(9); p.setTextColor.apply(p, AZUL);
    p.text(texto, x + w + 1, y + h * 0.45);
    p.setFont('helvetica', 'normal'); p.setFontSize(8); p.setTextColor.apply(p, GRIS);
    p.text('notebooksstore.com', x + w + 1, y + h * 0.45 + 4.2);
  };

  function numeroCot(d) { return d.numero ? 'N° COT-' + String(d.numero).padStart(4, '0') : 'Sin número'; }
  function numeroInf(d) { return d.numero ? 'Caso #' + d.numero : 'Caso sin número'; }

  function cotizacion(d, a, cfg) {
    var pdf = nuevoDoc();
    var h = new Hoja(pdf, a, { titulo: (d.titulo || 'COTIZACIÓN').toUpperCase(), numero: numeroCot(d), fecha: fechaLarga(d.fecha, 'La Paz'), tienda: cfg.tienda, borrador: !d.numero });
    h.nuevaPagina();
    var p = pdf;
    p.setFont('helvetica', 'normal'); p.setFontSize(9); p.setTextColor.apply(p, GRIS); p.text('Señores:', h.M, h.y);
    p.setFont('helvetica', 'bold'); p.setFontSize(12); p.setTextColor.apply(p, TINTA); p.text(d.cliente || '—', h.M + 15, h.y);
    h.y += 5.5;
    var sub = [d.ciudad || 'La Paz - Bolivia', d.celular ? 'Cel. ' + d.celular : ''].filter(Boolean).join('   ·   ');
    p.setFont('helvetica', 'normal'); p.setFontSize(9.5); p.setTextColor.apply(p, GRIS); p.text(sub, h.M + 15, h.y);
    h.y += 9;
    var items = (d.items || []).filter(function (it) { return it.desc || Number(it.precio); });
    var total = 0;
    var filas = items.map(function (it) {
      var c = Number(it.cant) || 0, pu = Number(it.precio) || 0; total += c * pu;
      return [c, it.desc, bs(pu), bs(c * pu)];
    });
    h.tabla([{ t: 'Cant.', w: 16, a: 'center' }, { t: 'Descripción' }, { t: 'Precio unit.', w: 32, a: 'right' }, { t: 'Total', w: 32, a: 'right', negrita: true }],
      filas, ['Total Bs.', bs(total)]);
    if (total > 0) { h.parrafo(sonLiteral(total), { tam: 9, color: GRIS }); h.y += 3; }
    // Condiciones
    var c = d.cond || {};
    var pares = [['Forma de pago', c.pago], ['Tiempo de entrega', c.entrega], ['Garantía', c.garantia], ['Validez de la oferta', c.validez]];
    if (c.factura) pares.push(['Factura', 'Incluye factura']);
    pares = pares.filter(function (x) { return x[1]; });
    if (pares.length) {
      h.asegurar(10 + pares.length * 5.4);
      p.setFont('helvetica', 'bold'); p.setFontSize(10); p.setTextColor.apply(p, AZUL); p.text('NOTA', h.M, h.y); h.y += 5.5;
      pares.forEach(function (x) {
        p.setFont('helvetica', 'normal'); p.setFontSize(9.5); p.setTextColor.apply(p, GRIS); p.text(x[0], h.M, h.y);
        p.setTextColor.apply(p, TINTA); p.setFont('helvetica', 'bold'); p.text(String(x[1]), h.M + 42, h.y); h.y += 5.4;
      });
    }
    if (d.obs) { h.y += 2; h.parrafo('Observaciones: ' + d.obs, { tam: 9.5, color: GRIS }); }
    h.y += 6;
    h.firma(d.atendio || cfg.firmante, (cfg.tienda && cfg.tienda.nombre) || 'Notebooks Store', esFirmante(d, cfg));
    if (cfg.mostrarChip !== false) h.chip('¡Gracias por su preferencia!');
    return pdf;
  }

  function informe(d, a, cfg) {
    var pdf = nuevoDoc();
    var h = new Hoja(pdf, a, { titulo: 'INFORME TÉCNICO', numero: numeroInf(d), fecha: fechaLarga(d.fecha, 'La Paz'), tienda: cfg.tienda, borrador: !d.numero,
      pie: 'Notebooks Store  ·  Soporte Técnico' + (cfg.tienda && cfg.tienda.tel ? '  ·  Tel. ' + cfg.tienda.tel : '') + (cfg.tienda && cfg.tienda.dir ? '  ·  ' + cfg.tienda.dir : '') });
    h.nuevaPagina();
    h.cajaDatos([['Cliente', d.cliente], ['Celular', d.celular], ['Tipo de equipo', d.equipo], ['Marca / modelo', d.modelo], ['N° de serie', d.serie], ['Estado', d.estado]]);
    var secs = [['Diagnóstico preliminar', d.diagnostico], ['Procedimiento y causas probables', d.procedimiento], ['Informe final', d.final]];
    var n = 0;
    secs.forEach(function (s) {
      if (!String(s[1] || '').trim()) return;
      n++; h.seccion(n, s[0]); h.parrafo(s[1], { justificar: true, tam: 9.8 }); h.y += 3;
    });
    var ops = (d.opciones || []).filter(function (o) { return o.componente || o.precio; });
    if (ops.length) {
      n++; h.seccion(n, 'Opciones de actualización (cotización)');
      h.tabla([{ t: 'Componente recomendado' }, { t: 'Marca', w: 30 }, { t: 'Capacidad', w: 28, a: 'center' }, { t: 'Precio', w: 30, a: 'right', negrita: true }],
        ops.map(function (o) { return [o.componente, o.marca, o.capacidad, o.precio ? bs(o.precio) : '']; }));
      if (d.notaOpciones) h.parrafo(d.notaOpciones, { tam: 9, color: GRIS });
    }
    h.y += 1;
    h.firma(d.atendio || cfg.firmante, 'Notebooks Store · Soporte Técnico', esFirmante(d, cfg));
    if (cfg.mostrarChip !== false) h.chip('Gracias por confiar en nosotros');
    return pdf;
  }

  function esFirmante(d, cfg) {
    var a = String(d.atendio || cfg.firmante || '').trim().toLowerCase();
    return !!cfg.firmaDe && a === String(cfg.firmaDe).trim().toLowerCase();
  }

  window.NBSpdf = {
    generar: function (d, activos, cfg) { return d.tipo === 'informe' ? informe(d, activos, cfg) : cotizacion(d, activos, cfg); },
    nombreArchivo: function (d) {
      var base = d.tipo === 'informe' ? 'Informe_caso_' + (d.numero || 'borrador') : 'Cotizacion_' + (d.numero ? 'COT-' + String(d.numero).padStart(4, '0') : 'borrador');
      var cli = String(d.cliente || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      return base + (cli ? '_' + cli : '') + '.pdf';
    },
    numeroTexto: function (d) { return d.tipo === 'informe' ? numeroInf(d) : numeroCot(d).replace('N° ', ''); },
    bs: bs, sonLiteral: sonLiteral, fechaLarga: fechaLarga,
  };
})();
