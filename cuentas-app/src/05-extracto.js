/* ================= extracto del banco ================= */
const EXT = { cuenta: "", rows: [], busy: false, msg: "", err: "", file: "", saldo: null, useSaldo: true };
function extractoHTML(){
  if (!sample) return `<div class="banner">Para leer el extracto hace falta la IA, y aquí no está disponible.</div>`;
  const banks = cuentas().filter(c => c.tipo !== "efectivo" && c.tipo !== "prestamo");
  if (!EXT.cuenta || !cuenta(EXT.cuenta)) EXT.cuenta = (banks[0] || {}).id || "";
  let h = `<div class="fgrid"><div class="f"><label for="ext-cuenta">¿De qué cuenta es?</label><select id="ext-cuenta">${banks.length ? accOptions(EXT.cuenta) : `<option value="">Primero añade tus cuentas</option>`}</select></div></div>`;
  if (!banks.length) return h + `<div class="row" style="margin-top:10px"><button class="btn primary" data-go="dinero" data-sub="cuentas">Añadir mis cuentas</button></div>`;
  if (!EXT.rows.length && !EXT.busy) {
    h += `<div class="drop" id="drop-ext" tabindex="0" role="button" aria-label="Elegir el extracto" style="margin-top:12px">${ICON.hoja.replace("<svg", '<svg style="width:40px;height:40px;fill:none;stroke:var(--acc);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"')}<b>Elige el fichero del banco</b><span class="small muted">El que te bajas de la web del banco: Excel, CSV, Norma 43 o PDF. La IA lo lee, reparte cada movimiento en su categoría y te avisa de lo que ya tenías apuntado por un ticket.</span></div>`;
    if (EXT.err) h += `<p class="err">${esc(EXT.err)}</p>`;
    return h;
  }
  if (EXT.busy) return h + `<div class="thinking" style="margin-top:14px"><span class="spin"></span>${esc(EXT.msg || "Leyendo…")}</div>`;
  const sel = EXT.rows.filter(r => r.sel);
  const G = sum(sel.filter(r => r.imp < 0).map(r => -r.imp)), I = sum(sel.filter(r => r.imp > 0).map(r => r.imp));
  const dups = EXT.rows.filter(r => r.dup).length;
  h += `<div class="panel-head" style="margin:14px 0 6px"><div><b>${esc(EXT.file)}</b><p>${EXT.rows.length} movimientos leídos${dups ? ` · ${dups} ya los tenías (quedan sin marcar)` : ""}. Marcados: ${sel.length} · salen ${eur(G)} · entran ${eur(I)}.</p></div>
    <div class="row"><button class="btn sm ghost" id="ext-cancel">Empezar de nuevo</button></div></div>`;
  h += `<div class="ext">`;
  EXT.rows.forEach((r, i) => {
    const tipo = r.imp < 0 ? "gasto" : "ingreso";
    let opts = catOptions(tipo, r.dest ? "" : r.cat);
    opts += `<optgroup label="Paso entre mis cuentas">${cuentas().filter(c => c.id !== EXT.cuenta).map(c => `<option value="tr:${c.id}"${r.dest === c.id ? " selected" : ""}>${r.imp < 0 ? "A " : "Desde "}${esc(c.nombre)}</option>`).join("")}</optgroup>`;
    h += `<div class="ext-row${r.sel ? "" : " off"}"><input type="checkbox" data-exsel="${i}"${r.sel ? " checked" : ""} aria-label="Guardar este"><span class="small">${shortDate(r.fecha)}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(r.concepto)}${r.low ? ` <span class="flag" title="La IA no lo tiene claro">●</span>` : ""}</span><span class="c"><select data-excat="${i}" aria-label="Categoría">${opts}</select></span><span class="a" style="color:${r.imp > 0 ? "var(--ok)" : "inherit"}">${r.imp > 0 ? "+" : "−"}${eur(Math.abs(r.imp))}</span>${r.dup ? `<span class="dup">${esc(r.dup)}</span>` : ""}</div>`;
  });
  h += `</div>`;
  if (EXT.saldo) h += `<label class="small" style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="ext-saldo"${EXT.useSaldo ? " checked" : ""}> Poner el saldo de la cuenta como dice el extracto: <b class="num">${eur(EXT.saldo.v)}</b> el ${shortDate(EXT.saldo.fecha)}</label>`;
  h += `<div class="row" style="margin-top:14px"><button class="btn primary" id="ext-save"${sel.length || EXT.saldo ? "" : " disabled"}>Guardar ${sel.length} movimientos</button><span class="err" id="ext-err"></span></div>`;
  return h;
}
function decodeText(buf){
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes(String.fromCharCode(0xFFFD))) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
async function extractText(file){
  const name = file.name.toLowerCase();
  if (/\.xlsx?$/.test(name)) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const wb = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true, dateNF: "dd/mm/yyyy" });
    return wb.SheetNames.slice(0, 3).map(n => window.XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ";", blankrows: false, dateNF: "dd/mm/yyyy" })).join("\n");
  }
  if (/\.pdf$/.test(name) || file.type === "application/pdf") { const r = await pdfRead(file, 0); return r.text; }
  return decodeText(await file.arrayBuffer());
}
function extPrompt(head, chunk, i, n){
  const c = cuenta(EXT.cuenta);
  return `Eres el contable personal de Juan (España). Te paso un trozo (${i} de ${n}) del extracto de su cuenta «${c ? c.nombre : ""}». Saca cada movimiento y devuelve SOLO JSON:
{"movimientos":[{"fecha":"AAAA-MM-DD","concepto":texto tal cual,"comercio":nombre corto o null,"importe":número (NEGATIVO si sale dinero, POSITIVO si entra),"saldo":número o null,"cat":id o null,"traspaso_a":id de cuenta o null,"confianza":0-1}]}
Reglas:
- Sólo movimientos de verdad: ni cabeceras, ni totales, ni saldos iniciales.
- Mira bien qué columna es el cargo y cuál el abono; el signo es lo más importante. Fechas de España (dd/mm/aa). Usa la fecha de operación si hay dos.
- "saldo": el saldo que pone el extracto después de ese movimiento, si viene.
- "traspaso_a": SÓLO si es dinero que va o viene de otra cuenta suya (sacar del cajero = efectivo; la cuota de uno de sus préstamos o el pago de su tarjeta de crédito = el id de ese préstamo o tarjeta). Si no, null. Sus cuentas:
${accountsForIA()}
- "cat", uno de estos ids exactamente (gasto si sale, ingreso si entra):
${catListForIA()}
- Así ha clasificado Juan otras veces (manda sobre tu criterio):
${learnedForIA()}
- No inventes nada. Si no sabes la categoría, null.

Cabecera del fichero:
${head}

Trozo:
${chunk}`;
}
async function onExtractFile(file){
  if (!file) return;
  Object.assign(EXT, { rows: [], busy: true, msg: "Abriendo el fichero…", err: "", file: file.name, saldo: null, useSaldo: true });
  renderView();
  try {
    const text = (await extractText(file)).replace(/\r/g, "");
    const lines = text.split("\n").map(l => l.replace(/;+$/, "").trim()).filter(l => l && /\d/.test(l));
    if (!lines.length) throw { mine: "El fichero está vacío o no lo sé abrir." };
    const head = text.split("\n").slice(0, 12).join("\n").slice(0, 3000);
    const chunks = []; let cur = [], size = 0;
    for (const l of lines) { if (cur.length >= 90 || size + l.length > 24000) { chunks.push(cur.join("\n")); cur = []; size = 0; } cur.push(l.slice(0, 400)); size += l.length; }
    if (cur.length) chunks.push(cur.join("\n"));
    if (chunks.length > 30) throw { mine: "El fichero es muy grande. Bájate el extracto por meses o por trimestres." };
    const out = [];
    for (let i = 0; i < chunks.length; i++) {
      EXT.msg = chunks.length > 1 ? `La IA está leyendo el extracto: trozo ${i + 1} de ${chunks.length}…` : "La IA está leyendo el extracto…"; renderView();
      const o = await sample.json(extPrompt(head, chunks[i], i + 1, chunks.length), { cache: false });
      for (const m of (o && o.movimientos) || []) if (m && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha || "") && num(m.importe)) out.push(m);
    }
    if (!out.length) throw { mine: "No he encontrado movimientos en el fichero." };
    const acc = EXT.cuenta;
    EXT.rows = out.map(m => {
      const imp = r2(num(m.importe));
      const tipo = imp < 0 ? "gasto" : "ingreso";
      const dest = m.traspaso_a && cuenta(m.traspaso_a) && m.traspaso_a !== acc ? m.traspaso_a : "";
      const r = { fecha: m.fecha, concepto: String(m.concepto || m.comercio || "").slice(0, 120), comercio: String(m.comercio || "").slice(0, 60), imp, cat: CATIDX[m.cat] && CATIDX[m.cat].tipo === tipo ? m.cat : "", dest, saldo: m.saldo == null ? null : num(m.saldo), low: num(m.confianza) < 0.6, sel: true, dup: "", match: null };
      return r;
    });
    markDups();
    // el último saldo que da el extracto sirve para poner la cuenta al día
    const withSaldo = EXT.rows.map((r, i) => ({ r, i })).filter(x => x.r.saldo != null);
    if (withSaldo.length) {
      const maxF = withSaldo.reduce((a, x) => x.r.fecha > a ? x.r.fecha : a, "");
      const lastDay = withSaldo.filter(x => x.r.fecha === maxF);
      // si el extracto va de más nuevo a más antiguo, el primero del día es el último; se toma el que siga a los demás
      const pick = lastDay.length === 1 ? lastDay[0] : (withSaldo[0].r.fecha >= withSaldo[withSaldo.length - 1].r.fecha ? lastDay[0] : lastDay[lastDay.length - 1]);
      EXT.saldo = { v: r2(pick.r.saldo), fecha: pick.r.fecha };
    }
  } catch (e) {
    EXT.err = e && e.mine ? e.mine : e && e.code === "not_granted" ? "No has dado permiso para usar la IA." : e && e.code === "rate_limited" ? "La IA está saturada. Espera un minuto y vuelve a probar." : "No he podido leer el fichero.";
    EXT.rows = [];
  }
  EXT.busy = false; renderView();
}
function markDups(){
  const acc = EXT.cuenta, used = new Set();
  for (const r of EXT.rows) {
    const tipo = r.dest ? "traspaso" : r.imp < 0 ? "gasto" : "ingreso";
    const tot = Math.abs(r.imp);
    // ya importado de un extracto anterior
    const same = MOVS.find(m => m.origen === "extracto" && (m.cuenta === acc || m.destino === acc) && m.fecha === r.fecha && (m.deuda ? norm(m.nota).startsWith(norm(r.concepto)) : Math.abs(num(m.total) - tot) < 0.01 && norm(m.nota) === norm(r.concepto)));
    if (same) { r.dup = "Ya estaba importado."; r.sel = false; continue; }
    // apuntado antes con un ticket, dictado o a mano
    const dd = d => Math.abs((parseISO(d) - parseISO(r.fecha)) / 864e5);
    const cand = MOVS.filter(m => m.origen !== "extracto" && !m.banco && !used.has(m.id) && m.tipo === tipo && Math.abs(num(m.total) - tot) < 0.01 && dd(m.fecha) <= 4 && (!m.cuenta || m.cuenta === acc || (tipo === "traspaso" && m.destino === acc)))
      .sort((a, b) => dd(a.fecha) - dd(b.fecha));
    if (cand.length) { used.add(cand[0].id); r.match = cand[0].id; r.sel = false; r.dup = `Ya lo tenías: ${movTitle(cand[0])} del ${shortDate(cand[0].fecha)}. Se queda el tuyo.`; }
  }
}
async function extSave(){
  const errBox = $("#ext-err"), btn = $("#ext-save");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  const acc = EXT.cuenta;
  try {
    const list = [];
    for (const r of EXT.rows.filter(r => r.sel)) {
      const out = r.imp < 0;
      const dc = r.dest && out ? cuenta(r.dest) : null;
      if (dc && dc.tipo === "prestamo") {
        // la cuota de un préstamo: lo que devuelves baja la deuda, los intereses son gasto
        const q = repartoCuota(dc, Math.abs(r.imp), r.fecha);
        if (q.capital) list.push(cleanMov({ fecha: r.fecha, tipo: "traspaso", cuenta: acc, destino: dc.id, comercio: dc.nombre, nota: r.concepto, total: q.capital, origen: "extracto", banco: true, deuda: dc.id }));
        if (q.interes) list.push(cleanMov({ fecha: r.fecha, tipo: "gasto", cuenta: acc, comercio: dc.nombre, nota: r.concepto + " (intereses)", total: q.interes, lineas: [{ concepto: "Intereses de " + dc.nombre, cat: "finanzas.intereses", importe: q.interes }], origen: "extracto", banco: true, deuda: dc.id }));
      }
      else if (r.dest) list.push(cleanMov({ fecha: r.fecha, tipo: "traspaso", cuenta: out ? acc : r.dest, destino: out ? r.dest : acc, comercio: r.comercio || r.concepto, nota: r.concepto, total: Math.abs(r.imp), origen: "extracto", banco: true }));
      else {
        const tipo = out ? "gasto" : "ingreso";
        list.push(cleanMov({ fecha: r.fecha, tipo, cuenta: acc, comercio: r.comercio || r.concepto, nota: r.concepto, total: Math.abs(r.imp), lineas: [{ concepto: r.concepto, cat: r.cat, importe: Math.abs(r.imp) }], origen: "extracto", banco: true, revisar: !r.cat || r.low }));
      }
    }
    // lo que ya estaba apuntado queda marcado como visto en el banco, y con su cuenta si no la tenía
    const touched = [];
    for (const r of EXT.rows.filter(r => r.match && !r.sel)) {
      const m = MOVS.find(x => x.id === r.match); if (!m) continue;
      touched.push({ ...m, banco: true, cuenta: m.cuenta || (m.tipo === "traspaso" ? m.cuenta : acc) });
    }
    await saveMovs(list.concat(touched));
    if (EXT.saldo && EXT.useSaldo) {
      const cs = (cfg.cuentas || cuentas()).map(c => c.id === acc ? { ...c, ancla: { fecha: EXT.saldo.fecha, saldo: EXT.saldo.v, ts: Date.now() + 1e12 } } : c);
      await saveCfg("cuentas", { items: cs });
    }
    toast(`Guardados ${list.length} movimientos`);
    Object.assign(EXT, { rows: [], file: "", saldo: null });
    renderView();
  } catch (e) {
    if (errBox) errBox.textContent = saveErr(e);
    if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
  }
}
