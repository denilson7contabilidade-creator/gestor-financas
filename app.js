"use strict";
/* Gestor de Finanças — app instalável, dados guardados só no aparelho e criptografados. */

const VERSAO_APP = "2.4";
const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24">${ICONES[n] || ICONES["circle-ellipsis"]}</svg>`;
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MES3 = MESES.map((m) => m.slice(0, 3) + ".");
const DIAS = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];

/* ---------- números ---------- */
const nf0 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (c) => (c % 100 === 0 ? nf0 : nf2).format(c / 100);
const fmtR = (c) => "R$ " + nf2.format(c / 100);
function lerValor(txt) {
  let s = String(txt).trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/* ---------- datas ---------- */
const p2 = (n) => String(n).padStart(2, "0");
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const mesAtual = () => hoje().slice(0, 7);
function somaMes(ym, n) {
  let [a, m] = ym.split("-").map(Number);
  m += n; a += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${a}-${p2(m)}`;
}
function somaMesData(iso, n) {
  const ym = somaMes(iso.slice(0, 7), n);
  const [a, m] = ym.split("-").map(Number);
  const ult = new Date(a, m, 0).getDate();
  return `${ym}-${p2(Math.min(Number(iso.slice(8)), ult))}`;
}
const nomeMes = (ym) => { const [a, m] = ym.split("-").map(Number); return `${MES3[m - 1]} de ${a}`; };
const dataCurta = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
function nomeDia(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MES3[m - 1].replace(".", "")}. ${DIAS[new Date(a, m - 1, d).getDay()]}`;
}

/* ================= CRIPTOGRAFIA E ARMAZENAMENTO ================= */

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder(), dec = new TextDecoder();

async function derivar(segredo, sal) {
  const base = await crypto.subtle.importKey("raw", enc.encode(segredo), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: deB64(sal), iterations: 210000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function cifrar(chave, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, bytes);
  return { iv: b64(iv), ct: b64(ct) };
}
async function decifrar(chave, pac) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(pac.iv) }, chave, deB64(pac.ct)));
}
const chaveDados = (bytes) => crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
const novoSal = () => b64(crypto.getRandomValues(new Uint8Array(16)));

function novoCodigo() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map((x) => A[x % A.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normCodigo = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");

const lerUsuarios = () => { try { return JSON.parse(localStorage.getItem("gf_usuarios")) || []; } catch { return []; } };
const gravarUsuarios = (us) => localStorage.setItem("gf_usuarios", JSON.stringify(us));
function gravarUsuario(u) {
  const us = lerUsuarios().filter((x) => x.id !== u.id);
  us.push(u); gravarUsuarios(us);
}

// Sessão aberta (só na memória)
const S = { u: null, chaveBytes: null, chave: null, d: null, aba: "inicio", mes: mesAtual(), graf: { tipo: "despesa", mes: mesAtual() }, relAno: Number(mesAtual().slice(0, 4)), cmp: { modo: "mes", mes: mesAtual(), ano: Number(mesAtual().slice(0, 4)) } };

async function salvar() {
  const pac = await cifrar(S.chave, enc.encode(JSON.stringify(S.d)));
  localStorage.setItem("gf_dados_" + S.u.id, JSON.stringify(pac));
}

// Modelo padrão de categorias (sem nomes pessoais)
const DESPESAS_PADRAO = [
  ["Alimentação", "utensils"], ["Mercado", "shopping-cart"], ["Moradia", "house"], ["Contas da casa", "zap"],
  ["Internet e celular", "wifi"], ["Transporte", "bus"], ["Combustível", "fuel"], ["Saúde", "heart-pulse"],
  ["Farmácia", "pill"], ["Educação", "book-open"], ["Lazer", "tree-palm"], ["Roupas", "shirt"],
  ["Beleza", "scissors"], ["Academia", "dumbbell"], ["Filhos", "baby"], ["Pets", "paw-print"],
  ["Assinaturas", "tv"], ["Presentes", "gift"], ["Viagem", "plane"], ["Cartões", "credit-card"],
  ["Juros e taxas", "percent"], ["Outros", "circle-ellipsis"],
];
const RECEITAS_PADRAO = [
  ["Salário", "banknote"], ["Extra", "hand-coins"], ["Investimentos", "trending-up"],
  ["Reembolso", "receipt"], ["Presente", "gift"], ["Outros", "circle-ellipsis"],
];

// Troca, uma única vez, as categorias da primeira versão (com nomes pessoais) pelo modelo padrão.
// Nenhum lançamento é perdido: os que usavam uma categoria antiga passam para a equivalente,
// e, quando não há equivalente, vão para "Outros" com o nome antigo na nota.
function migrarCategorias(d) {
  if (d.modeloCats >= 2) return false;
  const PARA = {
    despesa: {
      "Comida": "Alimentação", "Compras": "Mercado", "Moradia": "Moradia", "Lar": "Moradia", "Internet": "Internet e celular",
      "Transporte": "Transporte", "Moto": "Transporte", "Saúde": "Saúde", "Dentista": "Saúde", "Educação": "Educação",
      "Lazer": "Lazer", "Esportes": "Lazer", "Roupas": "Roupas", "Beleza": "Beleza", "Academia": "Academia",
      "Filhos": "Filhos", "Presentes": "Presentes", "Viagem": "Viagem", "Cartões": "Cartões", "Juros": "Juros e taxas",
      "Wayne": "Outros", "Isabela": "Outros", "Gravidez": "Outros", "Pessoal": "Outros", "Outras situações": "Outros",
      "Poupar Dinheiro": "Outros", "Aposta Depositada": "Outros", "Eletrônicos": "Outros",
    },
    receita: { "Denilson Show": "Outros" },
  };
  const MANTER_NOTA = new Set(["Comida", "Internet", "Juros"]); // equivalentes diretos: não precisa anotar
  const padrao = { despesa: DESPESAS_PADRAO, receita: RECEITAS_PADRAO };
  for (const tipo of ["despesa", "receita"]) {
    // garante as categorias padrão (reaproveita as que já existem com o mesmo nome)
    for (const [nome, icone] of padrao[tipo]) {
      if (!d.categorias.some((c) => c.tipo === tipo && c.nome === nome)) d.categorias.push({ id: novoId(), tipo, nome, icone });
    }
    const porNome = (n) => d.categorias.find((c) => c.tipo === tipo && c.nome === n);
    for (const [antigo, novo] of Object.entries(PARA[tipo])) {
      if (antigo === novo) continue;
      const velha = porNome(antigo), nova = porNome(novo);
      if (!velha || !nova) continue;
      for (const l of d.lancs) if (l.cat === velha.id) {
        l.cat = nova.id;
        if (!l.nota && !MANTER_NOTA.has(antigo)) l.nota = antigo;
      }
      for (const f of d.fixos || []) if (f.cat === velha.id) { f.cat = nova.id; if (!f.nota && !MANTER_NOTA.has(antigo)) f.nota = antigo; }
      if (velha.cor && !nova.cor) nova.cor = velha.cor;
      d.categorias = d.categorias.filter((c) => c !== velha);
    }
  }
  // ordena: padrão primeiro, na ordem do modelo; criadas pelo usuário depois
  const ordem = (c) => { const lista = padrao[c.tipo] || []; const i = lista.findIndex(([n]) => n === c.nome); return i < 0 ? 999 : i; };
  d.categorias.sort((a, b) => (a.tipo === b.tipo ? ordem(a) - ordem(b) : a.tipo === "despesa" ? -1 : 1));
  d.modeloCats = 2;
  return true;
}

function dadosIniciais() {
  const D = (nome, icone) => ({ id: novoId(), tipo: "despesa", nome, icone });
  const R = (nome, icone) => ({ id: novoId(), tipo: "receita", nome, icone });
  return {
    versao: 1,
    modeloCats: 2,
    contas: [{ id: novoId(), nome: "Conta principal", saldoInicial: 0 }],
    cartoes: [],
    fixos: [],
    pulados: [],
    invest: [],
    categorias: [
      ...DESPESAS_PADRAO.map(([n, i]) => D(n, i)),
      ...RECEITAS_PADRAO.map(([n, i]) => R(n, i)),
    ],
    lancs: [],
  };
}

async function criarConta(nome, login, senha) {
  const chaveBytes = crypto.getRandomValues(new Uint8Array(32));
  const codigo = novoCodigo();
  const u = { id: novoId(), nome, login, criadoEm: new Date().toISOString(), salSenha: novoSal(), salCodigo: novoSal(), ultimoBackup: null };
  u.porSenha = await cifrar(await derivar(senha, u.salSenha), chaveBytes);
  u.porCodigo = await cifrar(await derivar(normCodigo(codigo), u.salCodigo), chaveBytes);
  gravarUsuario(u);
  await abrirSessao(u, chaveBytes, dadosIniciais());
  await salvar();
  return codigo;
}

async function abrirSessao(u, chaveBytes, dados) {
  S.u = u; S.chaveBytes = chaveBytes; S.chave = await chaveDados(chaveBytes);
  if (!dados) {
    const pac = JSON.parse(localStorage.getItem("gf_dados_" + u.id));
    dados = JSON.parse(dec.decode(await decifrar(S.chave, pac)));
  }
  S.d = dados;
  S.d.fixos ||= [];
  S.d.pulados ||= [];
  S.d.invest ||= [];
  const migrou = migrarCategorias(S.d);
  S.mes = mesAtual();
  S.graf = { tipo: "despesa", mes: mesAtual() };
  S.relAno = Number(mesAtual().slice(0, 4));
  S.cmp = { modo: "mes", mes: mesAtual(), ano: Number(mesAtual().slice(0, 4)) };
  S.aba = "inicio";
  lembrarSessao();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  if (migrou) await salvar();
}

async function entrar(login, senha) {
  const u = lerUsuarios().find((x) => x.login === login);
  if (!u) throw new Error("Usuário ou senha incorretos.");
  let bytes;
  try { bytes = await decifrar(await derivar(senha, u.salSenha), u.porSenha); }
  catch { throw new Error("Usuário ou senha incorretos."); }
  await abrirSessao(u, bytes);
}

async function trocarSenhaCom(u, chaveBytes, nova) {
  u.salSenha = novoSal();
  u.porSenha = await cifrar(await derivar(nova, u.salSenha), chaveBytes);
  gravarUsuario(u);
}

// Mantém a conta aberta por até 10 horas sem uso, mesmo fechando o app.
// Depois disso (ou ao tocar em "Sair"), a senha é pedida de novo.
const TEMPO_SESSAO = 10 * 60 * 60 * 1000;
function lembrarSessao() {
  try { localStorage.setItem("gf_sessao", JSON.stringify({ id: S.u.id, k: b64(S.chaveBytes), aba: S.aba, ts: Date.now() })); } catch {}
}
function marcarAtividade() {
  if (!S.u) return;
  try { const x = JSON.parse(localStorage.getItem("gf_sessao")); if (x) { x.ts = Date.now(); x.aba = S.aba; localStorage.setItem("gf_sessao", JSON.stringify(x)); } } catch {}
}
async function retomarSessao() {
  try {
    sessionStorage.removeItem("gf_sessao"); // formato antigo
    const x = JSON.parse(localStorage.getItem("gf_sessao"));
    if (!x || Date.now() - x.ts > TEMPO_SESSAO) { localStorage.removeItem("gf_sessao"); return false; }
    const u = lerUsuarios().find((y) => y.id === x.id);
    if (!u) return false;
    await abrirSessao(u, deB64(x.k));
    if (x.aba) S.aba = x.aba;
    return true;
  } catch { try { localStorage.removeItem("gf_sessao"); } catch {} return false; }
}

function sair() {
  try { localStorage.removeItem("gf_sessao"); } catch {}
  S.u = S.chave = S.chaveBytes = S.d = null;
  fecharTudo();
  telaLogin();
}

/* ================= TEMA (cor do app) ================= */
// claro: true quando o fundo do topo é escuro e o texto precisa ser branco
const TEMAS = [
  { id: "laranja", nome: "Laranja", fundo: "#E0560B", suave: "#FBE2D2", graf: "#E0560B", claro: false },
  { id: "pessego", nome: "Pêssego", fundo: "#F5C6A0", suave: "#FCEBDD", graf: "#E07A3A", claro: false },
  { id: "areia", nome: "Areia", fundo: "#E6DFD3", suave: "#F4F0EA", graf: "#8C7355", claro: false },
  { id: "azulclaro", nome: "Azul claro", fundo: "#B9DCF5", suave: "#E8F3FC", graf: "#2B7BBF", claro: false },
  { id: "menta", nome: "Menta", fundo: "#B5E3CB", suave: "#E7F6EE", graf: "#2E8B57", claro: false },
  { id: "lilas", nome: "Lilás", fundo: "#D8CCF0", suave: "#F1ECFA", graf: "#7550B8", claro: false },
  { id: "azul", nome: "Azul", fundo: "#1F5FAD", suave: "#E3ECF8", graf: "#1F5FAD", claro: true },
  { id: "verde", nome: "Verde", fundo: "#2C7A4E", suave: "#E2F1E8", graf: "#2C7A4E", claro: true },
  { id: "roxo", nome: "Roxo", fundo: "#5E43A0", suave: "#ECE7F6", graf: "#5E43A0", claro: true },
  { id: "rosa", nome: "Rosa", fundo: "#C9467A", suave: "#FBE5EE", graf: "#C9467A", claro: true },
  { id: "vinho", nome: "Vinho", fundo: "#7D2433", suave: "#F6E4E7", graf: "#9E2F42", claro: true },
  { id: "grafite", nome: "Grafite", fundo: "#2A2A2A", suave: "#EEEEEE", graf: "#555555", claro: true },
];
const temaAtual = () => { try { return TEMAS.find((t) => t.id === localStorage.getItem("gf_tema")) || TEMAS[0]; } catch { return TEMAS[0]; } };
function aplicarTema(t = temaAtual()) {
  const r = document.documentElement;
  r.style.setProperty("--fundo", t.fundo);
  r.style.setProperty("--fundo-suave", t.suave);
  r.style.setProperty("--laranja-graf", t.graf);
  r.dataset.contraste = t.claro ? "claro" : "escuro";
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t.fundo;
  CORES[1] = t.graf;
  CORES[3] = clarear(t.graf, 0.55);
}
// mistura uma cor com branco (0 = igual, 1 = branco)
function clarear(hex, q) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * q));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function escolherTema() {
  const atual = temaAtual();
  const el = abrirCamada(`<h2>Cor do app</h2>
    <p style="text-align:center;color:#666;margin:-6px 0 14px;font-size:14px">Toque numa cor para ver na hora. Vale para este celular.</p>
    <div class="temas">${TEMAS.map((t) => `<button data-tema="${t.id}" class="${t.id === atual.id ? "sel" : ""}">
      <span class="tema-amostra" style="background:${t.fundo}"><i style="background:${t.claro ? "#fff" : "#111"}"></i><i style="background:${t.graf}"></i></span>${t.nome}</button>`).join("")}</div>
    <div class="botoes" style="margin-top:16px"><button class="btn preto" data-ok>Pronto</button></div>`, { aoFechar: () => desenhar() });
  el.querySelectorAll("[data-tema]").forEach((b) => (b.onclick = () => {
    try { localStorage.setItem("gf_tema", b.dataset.tema); } catch {}
    aplicarTema();
    el.querySelectorAll("[data-tema]").forEach((x) => x.classList.toggle("sel", x === b));
    desenhar();
  }));
  $("[data-ok]", el).onclick = () => fechar();
}

/* ================= CÁLCULOS ================= */

// Bolinha do ícone, com a cor da categoria quando ela tiver uma
const bola = (icone, cor) => `<span class="bola${cor ? " cor" : ""}"${cor ? ` style="--cc:${cor}"` : ""}>${ic(icone)}</span>`;
const CORES_CAT = ["#E0560B", "#C62828", "#D81B60", "#8E24AA", "#3949AB", "#1E88E5", "#00897B", "#43A047", "#B8860B", "#6D4C41", "#546E7A", "#111111"];

const cat = (id) => S.d.categorias.find((c) => c.id === id) || { nome: "Sem categoria", icone: "tag" };
const conta = (id) => S.d.contas.find((c) => c.id === id) || { nome: "Conta removida" };
const cartao = (id) => S.d.cartoes.find((c) => c.id === id) || { nome: "Cartão removido", fechamento: 1, vencimento: 10 };

// Mês da fatura (pelo mês de vencimento) em que cai uma compra feita no cartão
function faturaDe(cid, iso) {
  const c = cartao(cid);
  const dia = Number(iso.slice(8));
  let fecha = iso.slice(0, 7);
  if (dia >= c.fechamento) fecha = somaMes(fecha, 1);
  return c.vencimento > c.fechamento ? fecha : somaMes(fecha, 1);
}
// Fatura que está aberta agora (ainda recebendo compras)
const faturaAberta = (cid) => faturaDe(cid, hoje());

function totaisMes(ym) {
  let des = 0, rec = 0, cart = 0, pagFat = 0;
  for (const l of S.d.lancs) {
    if (!l.data.startsWith(ym)) continue;
    if (l.tipo === "despesa") { des += l.valor; if (l.cartao) cart += l.valor; }
    else if (l.tipo === "receita") rec += l.valor;
    else if (l.tipo === "fatura") pagFat += l.valor;
  }
  return { des, rec, cart, pagFat, saldo: rec - (des - cart) - pagFat };
}

// Saldo real da conta: só conta o que já aconteceu (até hoje)
function saldoConta(id, ate) {
  let s = conta(id).saldoInicial || 0;
  const h = ate || hoje();
  for (const l of S.d.lancs) {
    if (l.data > h) continue;
    if (l.tipo === "receita" && l.conta === id) s += l.valor;
    else if (l.tipo === "despesa" && !l.cartao && l.conta === id) s -= l.valor;
    else if (l.tipo === "fatura" && l.conta === id) s -= l.valor;
    else if (l.tipo === "transf") { if (l.conta === id) s -= l.valor; if (l.destino === id) s += l.valor; }
    else if (l.tipo === "aplic" && l.conta === id) s -= l.valor;
    else if (l.tipo === "resg" && l.conta === id) s += l.valor;
  }
  return s;
}

function infoFatura(cid, ym) {
  let total = 0, pago = 0; const itens = [];
  for (const l of S.d.lancs) {
    if (l.cartao !== cid) continue;
    if (l.tipo === "despesa" && faturaDe(cid, l.data) === ym) { total += l.valor; itens.push(l); }
    if (l.tipo === "fatura" && l.fatura === ym) pago += l.valor;
  }
  itens.sort((a, b) => b.data.localeCompare(a.data));
  return { total, pago, falta: Math.max(0, total - pago), itens };
}
const vencimentoData = (cid, ym) => `${ym}-${p2(Math.min(cartao(cid).vencimento, new Date(...ym.split("-").map(Number), 0).getDate()))}`;

/* ================= INTERFACE: BÁSICO ================= */

function aviso(txt) {
  const a = $("#aviso");
  a.textContent = txt; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 2400);
}

// Camadas (telas e folhas por cima) com suporte ao botão "voltar" do Android
const pilha = [];
function abrirCamada(html, { tela = false, aoFechar } = {}) {
  const el = document.createElement("div");
  el.className = "camada";
  el.innerHTML = tela ? `<div class="tela">${html}</div>` : `<div class="fundo-escuro"></div><div class="folha"><div class="pegador"></div>${html}</div>`;
  $("#camadas").appendChild(el);
  pilha.push({ el, aoFechar });
  history.pushState({ camada: pilha.length }, "");
  if (!tela) $(".fundo-escuro", el).onclick = () => fechar();
  return el;
}
function removerTopo() {
  const t = pilha.pop();
  if (!t) return;
  t.el.remove();
  t.aoFechar && t.aoFechar();
}
function fechar() { if (pilha.length) history.back(); }
function fecharTudo() { while (pilha.length) removerTopo(); }
window.addEventListener("popstate", () => { if (pilha.length) removerTopo(); });

function confirmar(titulo, texto, rotuloOk = "Confirmar", perigo = false) {
  return new Promise((ok) => {
    let resp = false;
    const el = abrirCamada(`<h2>${esc(titulo)}</h2><p style="text-align:center;color:#555;margin:0 0 18px">${esc(texto)}</p>
      <div class="botoes"><button class="btn ${perigo ? "perigo" : "preto"}" data-ok>${esc(rotuloOk)}</button><button class="btn leve" data-nao>Cancelar</button></div>`,
      { aoFechar: () => ok(resp) });
    $("[data-ok]", el).onclick = () => { resp = true; fechar(); };
    $("[data-nao]", el).onclick = () => fechar();
  });
}

function escolher(titulo, opcoes, atual) {
  // opcoes: [{valor, rotulo, icone, sub, grupo}]
  return new Promise((ok) => {
    let resp = null, grupo = null;
    const html = opcoes.map((o, i) => {
      let g = "";
      if (o.grupo && o.grupo !== grupo) { grupo = o.grupo; g = `<div class="grupo-tit">${esc(o.grupo)}</div>`; }
      return `${g}<button data-i="${i}" class="${o.valor === atual ? "sel" : ""}">${o.icone ? `<span class="bola">${ic(o.icone)}</span>` : ""}
        <span>${esc(o.rotulo)}${o.sub ? `<br><small style="color:#777">${esc(o.sub)}</small>` : ""}</span>${o.valor === atual ? `<span class="ok">${ic("check")}</span>` : ""}</button>`;
    }).join("");
    const el = abrirCamada(`<h2>${esc(titulo)}</h2><div class="lista-escolha">${html}</div>`, { aoFechar: () => ok(resp) });
    el.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { resp = opcoes[b.dataset.i].valor; fechar(); }));
  });
}

function escolherMes(atual) {
  return new Promise((ok) => {
    let resp = null, ano = Number(atual.slice(0, 4));
    const el = abrirCamada(`<h2>Escolher mês</h2><div class="ano-nav"><button data-a="-1">${ic("chevron-left")}</button><span data-ano></span><button data-a="1">${ic("chevron-right")}</button></div>
      <div class="grade-meses" style="margin-top:12px"></div>`, { aoFechar: () => ok(resp) });
    const desenhar = () => {
      $("[data-ano]", el).textContent = ano;
      $(".grade-meses", el).innerHTML = MESES.map((m, i) => {
        const ym = `${ano}-${p2(i + 1)}`;
        return `<button data-m="${ym}" class="${ym === atual ? "sel" : ""}">${m.slice(0, 3)}</button>`;
      }).join("");
      el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { resp = b.dataset.m; fechar(); }));
    };
    el.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { ano += Number(b.dataset.a); desenhar(); }));
    desenhar();
  });
}

/* ================= LOGIN ================= */

let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; if (!S.u) telaLogin(); else if (S.aba === "perfil") desenhar(); });
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;

function telaLogin(modo) {
  const temContas = lerUsuarios().length > 0;
  modo = modo || (temContas ? "entrar" : "criar");
  const app = $("#app");
  const cab = `<img class="logo" src="icons/icon-192.png" alt=""><h1>Gestor de Finanças</h1>`;

  if (modo === "entrar") {
    app.innerHTML = `<main class="login">${cab}<p class="sub">Entre com seu usuário e senha.</p>
      <form id="f" autocomplete="off">
        <label>Usuário<input name="login" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label>Senha<input name="senha" type="password" required></label>
        <p class="erro" id="erro"></p>
        <button class="btn preto">Entrar</button>
      </form>
      <div class="opcoes">
        <a href="#" class="link" data-ir="esqueci">Esqueci minha senha</a>
        <a href="#" class="link" data-ir="criar">Criar outra conta</a>
        <a href="#" class="link" data-ir="restaurar">Restaurar um backup</a>
      </div>${bannerInstalar()}
      <p class="rodape">Seus dados ficam guardados só neste celular.</p></main>`;
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, b = $("button", f);
      b.disabled = true; b.textContent = "Abrindo…";
      try { await entrar(f.login.value.trim().toLowerCase(), f.senha.value); desenhar(); }
      catch (err) { $("#erro").textContent = err.message; b.disabled = false; b.textContent = "Entrar"; }
    };
  } else if (modo === "criar") {
    app.innerHTML = `<main class="login">${cab}<p class="sub">${temContas ? "Criar uma nova conta." : "Bem-vindo! Crie sua conta para começar."}</p>
      <form id="f" autocomplete="off">
        <label>Seu nome<input name="nome" maxlength="40" required></label>
        <label>Usuário (para entrar)<input name="login" maxlength="30" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label>Senha<input name="senha" type="password" minlength="4" required></label>
        <label>Repita a senha<input name="senha2" type="password" minlength="4" required></label>
        <p class="erro" id="erro"></p>
        <button class="btn preto">Criar conta</button>
      </form>
      <div class="opcoes">${temContas ? `<a href="#" class="link" data-ir="entrar">Já tenho conta</a>` : ""}
        <a href="#" class="link" data-ir="restaurar">Restaurar um backup</a></div>${bannerInstalar()}
      <p class="rodape">Seus dados ficam guardados só neste celular.</p></main>`;
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, erro = $("#erro");
      const login = f.login.value.trim().toLowerCase();
      if (f.senha.value !== f.senha2.value) return (erro.textContent = "As senhas não são iguais.");
      if (f.senha.value.length < 4) return (erro.textContent = "A senha precisa ter pelo menos 4 caracteres.");
      if (lerUsuarios().some((u) => u.login === login)) return (erro.textContent = "Esse usuário já existe neste celular.");
      $("button", f).disabled = true;
      const codigo = await criarConta(f.nome.value.trim(), login, f.senha.value);
      telaCodigo(codigo, true);
    };
  } else if (modo === "esqueci") {
    app.innerHTML = `<main class="login">${cab}<p class="sub">Use o código de recuperação que você anotou ao criar a conta.</p>
      <form id="f" autocomplete="off">
        <label>Usuário<input name="login" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label>Código de recuperação<input name="codigo" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false" required></label>
        <label>Nova senha<input name="senha" type="password" minlength="4" required></label>
        <p class="erro" id="erro"></p>
        <button class="btn preto">Criar nova senha</button>
      </form>
      <div class="opcoes"><a href="#" class="link" data-ir="entrar">Voltar</a></div></main>`;
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, erro = $("#erro");
      const u = lerUsuarios().find((x) => x.login === f.login.value.trim().toLowerCase());
      if (!u) return (erro.textContent = "Usuário não encontrado neste celular.");
      if (f.senha.value.length < 4) return (erro.textContent = "A senha precisa ter pelo menos 4 caracteres.");
      let bytes;
      try { bytes = await decifrar(await derivar(normCodigo(f.codigo.value), u.salCodigo), u.porCodigo); }
      catch { return (erro.textContent = "Código de recuperação incorreto."); }
      await trocarSenhaCom(u, bytes, f.senha.value);
      await abrirSessao(u, bytes);
      desenhar();
      aviso("Senha alterada. Bem-vindo de volta!");
    };
  } else if (modo === "restaurar") {
    app.innerHTML = `<main class="login">${cab}<p class="sub">Escolha o arquivo de backup (.json) que você salvou.</p>
      <form id="f"><label>Arquivo de backup<input type="file" name="arq" accept=".json,application/json" required></label>
        <p class="erro" id="erro"></p><button class="btn preto">Restaurar</button></form>
      <div class="opcoes"><a href="#" class="link" data-ir="${temContas ? "entrar" : "criar"}">Voltar</a></div></main>`;
    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const u = await restaurarBackup(e.target.arq.files[0]);
        if (!u) return;
        telaLogin("entrar");
        $("#f").login.value = u.login;
        $("#f").senha.focus();
        aviso("Backup restaurado. Entre com a senha da época do backup.");
      } catch (err) { $("#erro").textContent = err.message; }
    };
  }
  app.querySelectorAll("[data-ir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); telaLogin(a.dataset.ir); }));
  app.querySelectorAll("[data-instalar]").forEach((b) => (b.onclick = instalarApp));
}

// Faixa "Instalar app", que pode ser dispensada no X
function faixaInstalar(texto, estilo = "") {
  let dispensado = false;
  try { dispensado = localStorage.getItem("gf_sem_banner") === "1"; } catch {}
  if (instalado() || !pedidoInstalar || dispensado) return "";
  return `<div class="instalar" style="${estilo}"><img src="icons/icon-192.png" alt=""><span>${texto}</span><button data-instalar>Instalar</button>
    <button class="instalar-x" data-fechar-banner aria-label="Fechar">${ic("x")}</button></div>`;
}
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-fechar-banner]");
  if (!x) return;
  e.stopPropagation();
  try { localStorage.setItem("gf_sem_banner", "1"); } catch {}
  x.closest(".instalar").remove();
  aviso("Tudo bem. Para instalar depois, use o menu ⋮ do Chrome → Instalar app.");
}, true);

function bannerInstalar() {
  if (instalado() || !pedidoInstalar) return "";
  return faixaInstalar("Instale o app para ter o ícone na tela inicial.", "margin:20px 0 0");
}
async function instalarApp() {
  if (!pedidoInstalar) return aviso("No Chrome, toque em ⋮ e depois em “Instalar app”.");
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice;
  pedidoInstalar = null;
  S.u ? desenhar() : telaLogin();
}

function telaCodigo(codigo, novaConta) {
  const el = abrirCamada(`<div class="login" style="min-height:100%">
      <h1 style="font-size:22px">${novaConta ? "Conta criada!" : "Novo código de recuperação"}</h1>
      <p class="sub" style="margin-bottom:18px">Anote este código num lugar seguro (papel, bloco de notas, foto). Ele é a <b>única forma</b> de recuperar sua conta se você esquecer a senha.</p>
      <form id="fc" onsubmit="return false">
        <div class="codigo-rec">${codigo}</div>
        <button type="button" class="btn leve" data-copiar>Copiar código</button>
        <label class="marcar"><input type="checkbox" data-anotei> Anotei o código</label>
        <button type="button" class="btn preto" data-seguir disabled>Continuar</button>
      </form></div>`, { tela: true, aoFechar: () => desenhar() });
  $("[data-copiar]", el).onclick = async () => {
    try { await navigator.clipboard.writeText(codigo); aviso("Código copiado."); } catch { aviso("Não foi possível copiar. Anote à mão."); }
  };
  $("[data-anotei]", el).onchange = (e) => ($("[data-seguir]", el).disabled = !e.target.checked);
  $("[data-seguir]", el).onclick = () => fechar();
}

/* ================= TELAS PRINCIPAIS ================= */

function desenhar() {
  if (!S.u) return telaLogin();
  const telas = { inicio: telaInicio, graficos: telaGraficos, relatorios: telaRelatorios, perfil: telaPerfil };
  $("#app").innerHTML = telas[S.aba]() + nav();
  $("#app").querySelectorAll("[data-aba]").forEach((b) => (b.onclick = () => { S.aba = b.dataset.aba; marcarAtividade(); desenhar(); scrollTo(0, 0); }));
  $("[data-novo]").onclick = () => abrirEditor();
  ligar[S.aba] && ligar[S.aba]();
}

function nav() {
  const b = (aba, icone, rot) => `<button data-aba="${aba}" class="${S.aba === aba ? "ativo" : ""}">${ic(icone)}${rot}</button>`;
  return `<nav class="nav">${b("inicio", "list", "Início")}${b("graficos", "chart-pie", "Gráficos")}
    <button class="mais" data-novo aria-label="Adicionar"><span>${ic("plus")}</span></button>
    ${b("relatorios", "clipboard-list", "Relatórios")}${b("perfil", "user-round", "Perfil")}</nav>`;
}

const ligar = {};

/* ----- Início ----- */
function telaInicio() {
  const t = totaisMes(S.mes);
  const [a, m] = S.mes.split("-");
  const doMes = S.d.lancs.filter((l) => l.data.startsWith(S.mes))
    .sort((x, y) => y.data.localeCompare(x.data) || y.id.localeCompare(x.id));
  const pend = fixosPendentes(S.mes);
  let corpo = lembreteBackup();
  if (pend.length) {
    const pd = pend.filter((f) => f.tipo === "despesa").reduce((s, f) => s + f.valor, 0);
    const pr = pend.filter((f) => f.tipo === "receita").reduce((s, f) => s + f.valor, 0);
    corpo += `<div class="dia-cab fixos-cab"><span>${ic("repeat")} Fixos a confirmar</span><span class="num">${[pd ? `- ${fmt(pd)}` : "", pr ? `+ ${fmt(pr)}` : ""].filter(Boolean).join(" · ")}</span></div>`;
    corpo += pend.map((f) => {
      const c = cat(f.cat);
      return `<div class="item pendente"><button class="pend-abrir" data-fixo="${f.id}">${bola(c.icone, c.cor)}
        <span class="meio"><div>${esc(f.nota || c.nome)}</div><small>dia ${dataCurta(dataFixo(f, S.mes))}${f.nota ? " · " + esc(c.nome) : ""}${f.cartao ? " · " + esc(cartao(f.cartao).nome) : ""}</small></span>
        <span class="val num">${f.tipo === "despesa" ? "- " : "+ "}${fmt(f.valor)}</span></button>
        <button class="pend-ok" data-confirmar="${f.id}" aria-label="Confirmar">${ic("check")}</button></div>`;
    }).join("");
  }
  if (!doMes.length) {
    corpo += `<div class="vazio">${ic("receipt")}Nenhum lançamento em ${MESES[m - 1]}.<br>Toque no <b>+</b> para adicionar.</div>`;
  } else {
    const dias = {};
    for (const l of doMes) (dias[l.data] ||= []).push(l);
    for (const [d, ls] of Object.entries(dias)) {
      const desDia = ls.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
      const recDia = ls.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
      const res = desDia && recDia ? `<span class="dd">− ${fmt(desDia)}</span> <span class="dr">+ ${fmt(recDia)}</span>`
        : desDia ? `Despesas: ${fmt(desDia)}` : recDia ? `Receitas: ${fmt(recDia)}` : "";
      corpo += `<div class="dia-cab"><span>${nomeDia(d)}</span><span class="num">${res}</span></div>`;
      corpo += ls.map((l) => itemLanc(l)).join("");
    }
  }
  const saldoReal = S.d.contas.reduce((s, c) => s + saldoConta(c.id), 0);
  return `<header class="topo">
      <div class="topo-linha"><h1>Gestor de Finanças</h1><button class="bt-busca" data-busca aria-label="Buscar">${ic("search")}</button></div>
      <div class="resumo">
        <button class="sel-mes" data-mes><small>${a}</small><b>${MES3[m - 1]} ▾</b></button>
        <div class="col"><span>Despesas</span><b class="num">${fmt(t.des)}</b></div>
        <div class="col"><span>Receitas</span><b class="num">${fmt(t.rec)}</b></div>
        <div class="col"><span>Saldo</span><b class="num">${fmt(t.saldo)}</b></div>
      </div>
      <div class="faixa">
        <button class="faixa-it" data-aba="relatorios"><span>${ic("wallet")}Nas contas</span><b class="num">${fmtR(saldoReal)}</b></button>
        ${S.d.invest.length ? `<button class="faixa-it" data-abririnv><span>${ic("piggy-bank")}Investido</span><b class="num">${fmtR(totalInvestido())}</b></button>` : ""}
        ${t.cart ? `<div class="faixa-it"><span>${ic("credit-card")}No cartão</span><b class="num">${fmtR(t.cart)}</b></div>` : ""}
      </div>
    </header>${faixaInstalar("Instale o app na tela inicial.")}
    <div class="conteudo" id="lista">${corpo}</div>`;
}

// Lembrete de backup: aparece uma vez por mês, até ser feito ou adiado
function lembreteBackup() {
  const u = S.u, agora = Date.now(), MES_MS = 30 * 864e5;
  const ref = Math.max(...[u.ultimoBackup, u.criadoEm, u.adiouBackup].filter(Boolean).map((x) => new Date(x).getTime()));
  if (!S.d.lancs.length || agora - ref < MES_MS) return "";
  const txt = u.ultimoBackup ? `Seu último backup foi há ${Math.floor((agora - new Date(u.ultimoBackup)) / 864e5)} dias.` : "Você ainda não fez nenhum backup.";
  return `<div class="lembrete">${ic("download")}<div><b>Hora do backup do mês</b><small>${txt} Ele protege seus lançamentos se trocar ou perder o celular.</small>
    <div class="lembrete-bt"><button data-bk-fazer>Fazer backup</button><button data-bk-adiar>Agora não</button></div></div></div>`;
}

function itemLanc(l, comData) {
  let icone, titulo, sub = "", sinal, cor = null;
  const partes = comData === true ? [dataCurta(l.data)] : [];
  if (ehInvest(l.tipo)) {
    const i = invest(l.inv);
    icone = i.icone; cor = corInv(i); sinal = l.tipo === "rend" ? (l.perda ? "- " : "+ ") : "";
    titulo = l.nota || (l.tipo === "aplic" ? `Aplicação · ${i.nome}` : l.tipo === "resg" ? `Resgate · ${i.nome}` : `${l.perda ? "Perda" : "Rendimento"} · ${i.nome}`);
    partes.push(l.tipo === "aplic" ? `${esc(conta(l.conta).nome)} → ${esc(i.nome)}` : l.tipo === "resg" ? `${esc(i.nome)} → ${esc(conta(l.conta).nome)}` : "Investimento");
  } else if (l.tipo === "transf") {
    icone = "arrow-left-right"; titulo = l.nota || "Transferência"; sinal = "";
    partes.push(`${esc(conta(l.conta).nome)} → ${esc(conta(l.destino).nome)}`);
  } else if (l.tipo === "fatura") {
    icone = "credit-card"; titulo = l.nota || `Pagamento da fatura ${cartao(l.cartao).nome}`; sinal = "- ";
    partes.push(`Fatura de ${nomeMes(l.fatura)} · ${esc(conta(l.conta).nome)}`);
  } else {
    const c = cat(l.cat);
    icone = c.icone; cor = c.cor; titulo = l.nota || c.nome; sinal = l.tipo === "despesa" ? "- " : "+ ";
    if (l.nota) partes.push(esc(c.nome));
    if (l.cartao) partes.push(`${ic("credit-card")}${esc(cartao(l.cartao).nome)}`);
    if (l.parc) partes.push(`${l.parc.n}/${l.parc.t}`);
    if (l.fixo) partes.push(`${ic("repeat")}Fixo`);
  }
  sub = partes.join(" · ");
  return `<button class="item" data-lanc="${l.id}">${bola(icone, cor)}
    <span class="meio"><div>${esc(titulo)}</div>${sub ? `<small>${sub}</small>` : ""}</span>
    <span class="val num">${sinal}${fmt(l.valor)}</span></button>`;
}

ligar.inicio = () => {
  $("[data-mes]").onclick = async () => { const m = await escolherMes(S.mes); if (m) { S.mes = m; desenhar(); } };
  $("[data-busca]").onclick = abrirBusca;
  const ai = $("[data-abririnv]"); if (ai) ai.onclick = abrirInvestimentos;
  $("#lista").onclick = (e) => {
    const ok = e.target.closest("[data-confirmar]");
    if (ok) return confirmarFixoRapido(ok.dataset.confirmar, S.mes);
    const fx = e.target.closest("[data-fixo]");
    if (fx) return abrirEditor(null, { fixo: fixoPorId(fx.dataset.fixo), ym: S.mes });
    const b = e.target.closest("[data-lanc]"); if (b) abrirLanc(b.dataset.lanc);
  };
  const bkF = $("[data-bk-fazer]"); if (bkF) bkF.onclick = salvarBackup;
  const bkA = $("[data-bk-adiar]"); if (bkA) bkA.onclick = () => { S.u.adiouBackup = new Date().toISOString(); gravarUsuario(S.u); desenhar(); };
  const bi = $("[data-instalar]"); if (bi) bi.onclick = instalarApp;
};

function abrirLanc(id) {
  const l = S.d.lancs.find((x) => x.id === id);
  if (!l) return;
  if (l.tipo === "fatura") return pagarFatura(l.cartao, l.fatura, l);
  abrirEditor(l);
}

/* ----- Gráficos ----- */
const CORES = ["#111111", "#E0560B", "#8A8A8A", "#F5A372", "#D0D0D0"];
function telaGraficos() {
  const g = S.graf;
  const atual = mesAtual();
  const abas = [];
  for (let i = 11; i >= 0; i--) abas.push(somaMes(atual, -i));
  if (!abas.includes(g.mes)) abas.unshift(g.mes);
  const rotulo = (ym) => (ym === atual ? "Este mês" : ym === somaMes(atual, -1) ? "Mês passado" : nomeMes(ym));

  const porCat = {};
  let total = 0;
  for (const l of S.d.lancs) {
    if (l.tipo !== g.tipo || !l.data.startsWith(g.mes)) continue;
    porCat[l.cat] = (porCat[l.cat] || 0) + l.valor; total += l.valor;
  }
  const ordem = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  let fatias = ordem.slice(0, 4).map(([id, v]) => ({ nome: cat(id).nome, v, cor: cat(id).cor }));
  const resto = ordem.slice(4).reduce((s, [, v]) => s + v, 0);
  if (resto) fatias.push({ nome: "Outro", v: resto });

  const pct = (v) => (total ? (v / total) * 100 : 0);
  const pctTxt = (v) => nf2.format(pct(v)) + "%";
  let rosca = "", legenda = "";
  if (total) {
    const R = 70, C = 2 * Math.PI * R;
    let acum = 0;
    rosca = fatias.map((f, i) => {
      const frac = f.v / total;
      const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${f.cor || CORES[i]}" stroke-width="34"
        stroke-dasharray="${Math.max(0, frac * C - (fatias.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-acum * C}" transform="rotate(-90 100 100)"/>`;
      acum += frac; return seg;
    }).join("");
    legenda = fatias.map((f, i) => `<div><i style="background:${f.cor || CORES[i]}"></i><span>${esc(f.nome)}</span><b class="num">${pctTxt(f.v)}</b></div>`).join("");
  }
  const max = ordem.length ? ordem[0][1] : 1;
  const linhas = ordem.map(([id, v]) => {
    const c = cat(id);
    return `<button class="cat-linha" data-vercat="${id}">${bola(c.icone, c.cor)}<div class="meio">
      <div class="topo2"><span>${esc(c.nome)}</span><b class="num">${fmt(v)}</b></div>
      <div class="barra"><i style="width:${(v / max) * 72}%"></i><span>${pctTxt(v)}</span></div></div><span class="seta">${ic("chevron-right")}</span></button>`;
  }).join("");

  return `<header class="cab"><div class="alternar">
      <button data-gt="despesa" class="${g.tipo === "despesa" ? "ativo" : ""}">Despesas</button>
      <button data-gt="receita" class="${g.tipo === "receita" ? "ativo" : ""}">Receitas</button></div></header>
    <div class="meses-rol" id="rol">${abas.map((ym) => `<button data-gm="${ym}" class="${ym === g.mes ? "ativo" : ""}">${rotulo(ym)}</button>`).join("")}</div>
    <div class="conteudo">${total ? `<div class="rosca-area"><svg viewBox="0 0 200 200">${rosca}
        <text x="100" y="${g.tipo === "despesa" ? 98 : 98}" text-anchor="middle" font-size="13" fill="#777">Total</text>
        <text x="100" y="120" text-anchor="middle" font-size="${fmt(total).length > 9 ? 17 : 20}" font-weight="700" fill="#111">${fmt(total)}</text></svg>
        <div class="legenda">${legenda}</div></div>${linhas}`
      : `<div class="vazio">${ic("chart-pie")}Nenhuma ${g.tipo === "despesa" ? "despesa" : "receita"} em ${rotulo(g.mes).toLowerCase()}.</div>`}</div>`;
}
ligar.graficos = () => {
  document.querySelectorAll("[data-gt]").forEach((b) => (b.onclick = () => { S.graf.tipo = b.dataset.gt; desenhar(); }));
  document.querySelectorAll("[data-gm]").forEach((b) => (b.onclick = () => { S.graf.mes = b.dataset.gm; desenhar(); }));
  document.querySelectorAll("[data-vercat]").forEach((b) => (b.onclick = () => verCategoria(b.dataset.vercat, S.graf.mes)));
  const rol = $("#rol"), at = $("#rol .ativo");
  if (rol && at) rol.scrollLeft = at.offsetLeft - rol.clientWidth / 2 + at.clientWidth / 2;
};

/* ----- Detalhe de uma categoria (ao tocar nos gráficos) ----- */
function verCategoria(cid, ymIni) {
  let ym = ymIni || mesAtual(), ordem = "valor";
  const c = cat(cid);
  const el = abrirCamada(`<div class="cab det-cab"><button data-x aria-label="Voltar">${ic("arrow-left")}</button>
      <b>${esc(c.nome)}</b><button class="det-mes" data-mesdet></button></div>
    <div class="det-corpo" data-detcat></div>`, { tela: true });
  $("[data-x]", el).onclick = () => fechar();
  $("[data-mesdet]", el).onclick = async () => { const m = await escolherMes(ym); if (m) { ym = m; pintar(); } };
  const pintar = () => {
    $("[data-mesdet]", el).innerHTML = `${nomeMes(ym)} ▾`;
    const itens = S.d.lancs.filter((l) => l.cat === cid && (l.tipo === "despesa" || l.tipo === "receita") && l.data.startsWith(ym));
    const total = itens.reduce((t, l) => t + l.valor, 0);
    const [a, m] = ym.split("-").map(Number);
    const nDias = new Date(a, m, 0).getDate();
    const porDia = Array(nDias).fill(0);
    itens.forEach((l) => (porDia[Number(l.data.slice(8)) - 1] += l.valor));
    const maxDia = Math.max(1, ...porDia);
    const corBarra = c.cor || "var(--laranja-graf)";
    const barras = porDia.map((v, i) => {
      const h = v ? Math.max(3, (v / maxDia) * 100) : 0;
      const x = i * (300 / nDias);
      return `<rect x="${x + 1}" y="${110 - h}" width="${300 / nDias - 2}" height="${h}" rx="2" style="fill:${corBarra}"><title>${i + 1}: ${fmt(v)}</title></rect>`;
    }).join("");
    const marcas = [1, 8, 15, 22, 29].filter((d) => d <= nDias).map((d) => `<text x="${(d - 0.5) * (300 / nDias)}" y="126" text-anchor="middle" font-size="10" fill="#888">${d}</text>`).join("");
    const lista = [...itens].sort((x, y) => (ordem === "valor" ? y.valor - x.valor : y.data.localeCompare(x.data)) || y.id.localeCompare(x.id));
    const maxV = lista.reduce((mx, l) => Math.max(mx, l.valor), 1);
    const dataLonga = (iso) => { const [aa, mm, dd] = iso.split("-").map(Number); return `${dd} de ${MES3[mm - 1]} de ${aa}`; };
    $("[data-detcat]", el).innerHTML = `
      <div class="det-resumo">
        <div><small>Total</small><b class="num">${fmtR(total)}</b></div>
        <div><small>Média por dia</small><b class="num">${fmtR(Math.round(total / nDias))}</b></div>
        <div><small>Lançamentos</small><b class="num">${itens.length}</b></div>
      </div>
      ${total ? `<svg class="det-graf" viewBox="0 0 300 130" preserveAspectRatio="none"><line x1="0" y1="110.5" x2="300" y2="110.5" stroke="#ddd"/>${barras}${marcas}</svg>` : ""}
      <div class="det-ord"><b>${c.tipo === "receita" ? "Receitas" : "Despesas"}</b>
        <div class="alternar det-alt"><button data-ord="valor" class="${ordem === "valor" ? "ativo" : ""}">Por valor</button><button data-ord="data" class="${ordem === "data" ? "ativo" : ""}">Por data</button></div></div>
      <div class="det-lista">${lista.length ? lista.map((l) => {
        const p = total ? (l.valor / total) * 100 : 0;
        const extra = [l.cartao ? esc(cartao(l.cartao).nome) : "", l.parc ? `${l.parc.n}/${l.parc.t}` : ""].filter(Boolean).join(" · ");
        return `<button class="det-item" data-lanc="${l.id}">${bola(c.icone, c.cor)}<span class="meio">
          <span class="det-l1"><span>${esc(l.nota || c.nome)}</span><b class="num">${fmt(l.valor)}</b></span>
          <span class="det-bar"><i style="width:${(l.valor / maxV) * 100}%;background:${corBarra}"></i><small>${nf2.format(p)}%</small></span>
          <small class="det-data">${dataLonga(l.data)}${extra ? " · " + extra : ""}</small></span></button>`;
      }).join("") : `<p class="vazio">${ic("receipt")}Nenhum lançamento de ${esc(c.nome)} em ${nomeMes(ym)}.</p>`}</div>`;
    el.querySelectorAll("[data-ord]").forEach((b) => (b.onclick = () => { ordem = b.dataset.ord; pintar(); }));
    el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
  };
  pintar();
  verCategoria.repintar = pintar;
}

/* ----- Comparativo receitas x despesas ----- */
function dadosPeriodo(filtro) {
  let rec = 0, des = 0; const pc = { receita: {}, despesa: {} };
  for (const l of S.d.lancs) {
    if ((l.tipo !== "receita" && l.tipo !== "despesa") || !filtro(l.data)) continue;
    if (l.tipo === "receita") rec += l.valor; else des += l.valor;
    pc[l.tipo][l.cat] = (pc[l.tipo][l.cat] || 0) + l.valor;
  }
  const ord = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, v }));
  const lr = ord(pc.receita), ld = ord(pc.despesa);
  return { rec, des, topRec: lr[0] || null, topDes: ld[0] || null, listaRec: lr, listaDes: ld };
}

// Lista pequena com a porcentagem de cada categoria
function listaPct(lista, total, cls) {
  if (!lista.length) return `<div class="pct-col"></div>`;
  const max = lista[0].v;
  return `<div class="pct-col">${lista.map((x) => {
    const k = cat(x.id), p = total ? (x.v / total) * 100 : 0;
    return `<div class="pct-l" data-vercat="${x.id}"><div class="pct-t"><span>${esc(k.nome)}</span><b class="num">${p < 1 && p > 0 ? "<1" : Math.round(p)}%</b></div>
      <div class="pct-b"><i class="${cls}" style="width:${(x.v / max) * 100}%${k.cor ? `;background:${k.cor}` : ""}"></i></div></div>`;
  }).join("")}</div>`;
}

function blocoComparativo() {
  const c = S.cmp, mes = c.modo === "mes";
  const pref = mes ? c.mes : String(c.ano);
  const d = dadosPeriodo((dt) => dt.startsWith(pref));
  const titulo = mes ? `${MESES[Number(c.mes.slice(5)) - 1]} ${c.mes.slice(0, 4)}` : String(c.ano);
  const max = Math.max(d.rec, d.des, 1);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dif = d.rec - d.des;

  let resultado = "";
  if (d.rec || d.des) {
    resultado = dif >= 0
      ? `<div class="cmp-res">Sobrou <b class="num">${fmtR(dif)}</b>${d.rec ? ` · ${pct(dif, d.rec)}% da receita` : ""}</div>`
      : `<div class="cmp-res neg">Gastou <b class="num">${fmtR(-dif)}</b> a mais do que recebeu</div>`;
  }

  const pesa = (rot, top, total, extra) => {
    if (!top) return `<div class="pesa vazio-p"><small>${rot}</small><span>Nenhum lançamento</span></div>`;
    const k = cat(top.id);
    return `<div class="pesa"><small>${rot}</small><div class="pesa-l">${bola(k.icone, k.cor)}<b>${esc(k.nome)}</b></div>
      <div class="pesa-v"><span class="num">${fmt(top.v)}</span><strong class="num">${pct(top.v, total)}%</strong></div>
      ${extra ? `<p>${extra}</p>` : ""}</div>`;
  };
  const extraDes = d.topDes && d.rec ? `Sozinha, consome <b>${pct(d.topDes.v, d.rec)}%</b> da sua receita.` : "";
  const extraRec = d.topRec ? `É <b>${pct(d.topRec.v, d.rec)}%</b> de tudo que entrou.` : "";

  // mini gráfico: 6 meses até o mês escolhido, ou os 12 meses do ano
  const meses = mes ? Array.from({ length: 6 }, (_, i) => somaMes(c.mes, i - 5)) : Array.from({ length: 12 }, (_, i) => `${c.ano}-${p2(i + 1)}`);
  const serie = meses.map((ym) => ({ ym, ...dadosPeriodo((dt) => dt.startsWith(ym)) }));
  const mx = Math.max(1, ...serie.map((x) => Math.max(x.rec, x.des)));
  const barras = serie.map((x) => `<button class="mb-col ${mes && x.ym === c.mes ? "sel" : ""}" data-cm="${x.ym}" title="${nomeMes(x.ym)}">
      <span class="mb-par"><i class="r" style="height:${(x.rec / mx) * 100}%"></i><i class="d" style="height:${(x.des / mx) * 100}%"></i></span>
      <small>${MES3[Number(x.ym.slice(5)) - 1].replace(".", "")}</small></button>`).join("");

  return `<section class="secao"><h2>Receitas x Despesas</h2><div class="cartao-box cmp">
    <div class="alternar" style="margin:14px auto 0;max-width:220px"><button data-cmodo="mes" class="${mes ? "ativo" : ""}">Mês</button><button data-cmodo="ano" class="${mes ? "" : "ativo"}">Ano</button></div>
    <div class="ano-nav"><button data-cnav="-1">${ic("chevron-left")}</button><span style="text-transform:capitalize">${titulo}</span><button data-cnav="1">${ic("chevron-right")}</button></div>
    <div class="cmp-barras">
      <div class="cmp-l"><span>Receitas</span><div class="cmp-trilho"><i class="r" style="width:${(d.rec / max) * 100}%"></i></div><b class="num">${fmt(d.rec)}</b></div>
      <div class="cmp-l"><span>Despesas</span><div class="cmp-trilho"><i class="d" style="width:${(d.des / max) * 100}%"></i></div><b class="num">${fmt(d.des)}</b></div>
    </div>${resultado}
    <div class="pesa-grade">${pesa("Despesa que mais pesa", d.topDes, d.des, extraDes)}${pesa("Receita que mais pesa", d.topRec, d.rec, extraRec)}</div>
    <div class="pct-grade">${listaPct(d.listaDes, d.des, "d")}${listaPct(d.listaRec, d.rec, "r")}</div>
    <div class="mini-barras">${barras}</div>
    <div class="mb-leg"><span><i class="r"></i>Receitas</span><span><i class="d"></i>Despesas</span></div>
  </div></section>`;
}

/* ----- Relatórios ----- */
function telaRelatorios() {
  const contas = S.d.contas.map((c) => {
    const s = saldoConta(c.id);
    return `<div class="linha-opc"><span class="bola">${ic("wallet")}</span><span class="meio">${esc(c.nome)}</span><b class="num">${fmtR(s)}</b></div>`;
  }).join("");
  const totalContas = S.d.contas.reduce((s, c) => s + saldoConta(c.id), 0);

  const cartoes = S.d.cartoes.map((c) => {
    const ym = faturaAberta(c.id);
    const ant = somaMes(ym, -1);
    const fa = infoFatura(c.id, ant);
    const fb = infoFatura(c.id, ym);
    const bloco = (rot, mes, f, aberta) => {
      const st = f.total === 0 ? "" : f.falta === 0 ? `<span class="etiqueta paga">Paga</span>` : aberta ? `<span class="etiqueta aberta">Aberta</span>` : `<span class="etiqueta">Fechada</span>`;
      return `<div style="flex:1"><small>${rot} · vence ${dataCurta(vencimentoData(c.id, mes))}</small>
        <div class="valf num" style="font-size:19px">${fmtR(f.total)}</div>${st}${f.pago && f.falta ? `<small> falta ${fmtR(f.falta)}</small>` : ""}</div>`;
    };
    return `<div class="fatura"><div class="cabf"><span class="bola">${ic("credit-card")}</span><div class="meio"><b>${esc(c.nome)}</b>
        <small style="display:block">Fecha dia ${c.fechamento} · vence dia ${c.vencimento}</small></div></div>
      <div style="display:flex;gap:12px;margin-top:10px">${fa.total || fa.pago ? bloco("Fatura anterior", ant, fa, false) : ""}${bloco("Fatura atual", ym, fb, true)}</div>
      <div class="acoes"><button class="btn contorno" data-verfat="${c.id}">Ver faturas</button><button class="btn preto" data-pagar="${c.id}">Pagar fatura</button></div></div>`;
  }).join("");

  const ano = S.relAno;
  let tR = 0, tD = 0, tS = 0;
  const linhasAno = MESES.map((m, i) => {
    const ym = `${ano}-${p2(i + 1)}`, t = totaisMes(ym);
    tR += t.rec; tD += t.des; tS += t.saldo;
    return `<tr class="${ym === mesAtual() ? "atual" : ""}"><td>${m.slice(0, 3)}</td><td class="num">${fmt(t.rec)}</td><td class="num">${fmt(t.des)}</td><td class="num">${fmt(t.saldo)}</td></tr>`;
  }).join("");

  return `<header class="cab"><h1>Relatórios</h1></header><div class="conteudo">${blocoComparativo()}
    <section class="secao"><h2>Saldo das contas</h2><div class="cartao-box">${contas}
      <div class="total-linha"><span>Total</span><span class="num">${fmtR(totalContas)}</span></div></div></section>
    <section class="secao"><h2>Investimentos e patrimônio</h2><div class="cartao-box">${S.d.invest.length
      ? `<div class="linha-opc"><span class="bola">${ic("trending-up")}</span><span class="meio">Patrimônio total<small>Contas + investimentos</small></span><b class="num">${fmtR(patrimonio())}</b></div>
         <div class="linha-opc"><span class="bola">${ic("piggy-bank")}</span><span class="meio">Investido<small>Rendeu ${sinalR(movsPeriodo(mesAtual().slice(0, 4)).rend)} em ${mesAtual().slice(0, 4)}</small></span><b class="num">${fmtR(totalInvestido())}</b></div>
         <button class="linha-opc" data-abririnv><span class="bola">${ic("chart-line")}</span><span class="meio">Ver investimentos<small>Evolução, metas e onde está seu dinheiro</small></span><span class="seta">${ic("chevron-right")}</span></button>`
      : `<button class="linha-opc" data-abririnv><span class="bola">${ic("plus")}</span><span class="meio">Começar a acompanhar investimentos<small>Aplicações não contam como despesa. Veja seu patrimônio crescer.</small></span></button>`}</div></section>
    <section class="secao"><h2>Cartões de crédito</h2>${S.d.cartoes.length ? `<div class="cartao-box">${cartoes}</div>`
      : `<div class="cartao-box"><button class="linha-opc" data-novocartao><span class="bola">${ic("plus")}</span><span class="meio">Cadastrar um cartão<small>Compras no cartão não saem do saldo até você pagar a fatura.</small></span></button></div>`}</section>
    <section class="secao"><h2>Resumo do ano</h2><div class="cartao-box">
      <div class="ano-nav"><button data-ano="-1">${ic("chevron-left")}</button><span>${ano}</span><button data-ano="1">${ic("chevron-right")}</button></div>
      <table class="ano"><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr>${linhasAno}
      <tr class="tot"><td>Total</td><td class="num">${fmt(tR)}</td><td class="num">${fmt(tD)}</td><td class="num">${fmt(tS)}</td></tr></table></div>
      <p style="font-size:12.5px;color:#777;margin:10px 2px 0">Saldo = receitas − despesas pagas com saldo − pagamentos de fatura. Compras no cartão entram em “Despesas”, mas só saem do saldo quando a fatura é paga.</p></section>
    </div>`;
}
ligar.relatorios = () => {
  document.querySelectorAll("[data-abririnv]").forEach((b) => (b.onclick = abrirInvestimentos));
  document.querySelectorAll("[data-cmodo]").forEach((b) => (b.onclick = () => { S.cmp.modo = b.dataset.cmodo; if (S.cmp.modo === "ano") S.cmp.ano = Number(S.cmp.mes.slice(0, 4)); desenhar(); }));
  document.querySelectorAll("[data-cnav]").forEach((b) => (b.onclick = () => {
    const n = Number(b.dataset.cnav);
    if (S.cmp.modo === "mes") S.cmp.mes = somaMes(S.cmp.mes, n); else S.cmp.ano += n;
    desenhar();
  }));
  document.querySelectorAll("[data-vercat]").forEach((b) => (b.onclick = () => verCategoria(b.dataset.vercat, S.cmp.modo === "mes" ? S.cmp.mes : mesAtual())));
  document.querySelectorAll("[data-cm]").forEach((b) => (b.onclick = () => { S.cmp.mes = b.dataset.cm; S.cmp.modo = "mes"; desenhar(); }));
  document.querySelectorAll("[data-ano]").forEach((b) => (b.onclick = () => { S.relAno += Number(b.dataset.ano); desenhar(); }));
  document.querySelectorAll("[data-pagar]").forEach((b) => (b.onclick = () => {
    const cid = b.dataset.pagar, ym = faturaAberta(cid), ant = somaMes(ym, -1);
    pagarFatura(cid, infoFatura(cid, ant).falta > 0 ? ant : ym);
  }));
  document.querySelectorAll("[data-verfat]").forEach((b) => (b.onclick = () => verFaturas(b.dataset.verfat)));
  const nc = $("[data-novocartao]"); if (nc) nc.onclick = () => editarCartao();
};

function verFaturas(cid) {
  let ym = faturaAberta(cid);
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    const f = infoFatura(cid, ym);
    $("[data-c]", el).innerHTML = `<h2>${esc(cartao(cid).nome)}</h2>
      <div class="ano-nav"><button data-m="-1">${ic("chevron-left")}</button><span>Fatura de ${nomeMes(ym)}</span><button data-m="1">${ic("chevron-right")}</button></div>
      <p style="text-align:center;color:#777;margin:0 0 4px;font-size:14px">Vence ${dataCurta(vencimentoData(cid, ym))}</p>
      <div style="text-align:center;font-size:28px;font-weight:700" class="num">${fmtR(f.total)}</div>
      <p style="text-align:center;margin:2px 0 12px;font-size:14px;color:#555">${f.total === 0 ? "Sem compras" : f.falta === 0 ? "Fatura paga" : f.pago ? `Pago ${fmtR(f.pago)} · falta ${fmtR(f.falta)}` : "Não paga"}</p>
      <div style="margin:0 -18px">${f.itens.map((l) => itemLanc(l, true)).join("") || `<p class="vazio" style="padding:20px">Nenhuma compra nesta fatura.</p>`}</div>
      <div class="botoes" style="margin-top:14px">${f.falta > 0 ? `<button class="btn preto" data-pg>Pagar esta fatura</button>` : ""}</div>`;
    el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { ym = somaMes(ym, Number(b.dataset.m)); pintar(); }));
    el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
    const pg = $("[data-pg]", el); if (pg) pg.onclick = () => pagarFatura(cid, ym);
  };
  pintar();
  verFaturas.repintar = pintar;
}

function pagarFatura(cid, ym, existente) {
  const f = infoFatura(cid, ym);
  const valorIni = existente ? existente.valor : f.falta;
  const el = abrirCamada(`<h2>${existente ? "Pagamento de fatura" : "Pagar fatura"}</h2>
    <p style="text-align:center;margin:-6px 0 16px;color:#555">${esc(cartao(cid).nome)} · fatura de ${nomeMes(ym)}<br>Total da fatura: <b>${fmtR(f.total)}</b></p>
    <form data-f>
      <label>Valor pago (R$)<input name="valor" inputmode="decimal" value="${valorIni ? nf2.format(valorIni / 100) : ""}" required></label>
      <div class="dois"><label>Pago com<select name="conta">${S.d.contas.map((c) => `<option value="${c.id}" ${existente && existente.conta === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
      <label>Data<input type="date" name="data" value="${existente ? existente.data : hoje()}" required></label></div>
      <p class="erro" data-e></p>
      <div class="botoes"><button class="btn preto">${existente ? "Salvar" : "Confirmar pagamento"}</button>
      ${existente ? `<button type="button" class="btn perigo" data-apagar>Apagar pagamento</button>` : ""}</div>
    </form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const fm = e.target, v = lerValor(fm.valor.value);
    if (!(v > 0)) return ($("[data-e]", el).textContent = "Digite um valor válido.");
    const l = existente || { id: novoId(), tipo: "fatura", cartao: cid, fatura: ym };
    Object.assign(l, { valor: v, conta: fm.conta.value, data: fm.data.value });
    if (!existente) S.d.lancs.push(l);
    await salvar(); fechar(); aviso(existente ? "Pagamento atualizado." : "Fatura paga. O valor saiu do saldo.");
    atualizarFundo();
  };
  const ap = $("[data-apagar]", el);
  if (ap) ap.onclick = async () => {
    S.d.lancs = S.d.lancs.filter((x) => x.id !== existente.id);
    await salvar(); fechar(); aviso("Pagamento apagado."); atualizarFundo();
  };
}

// Redesenha o que estiver por baixo depois de uma alteração
function atualizarFundo() {
  setTimeout(() => {
    if (pilha.length && verFaturas.repintar && document.contains($("[data-c]"))) verFaturas.repintar();
    if (abrirBusca.repintar && $("[data-q]")) abrirBusca.repintar();
    if (verCategoria.repintar && $("[data-detcat]")) verCategoria.repintar();
    if (abrirInvestimentos.repintar && $("[data-invtela]")) abrirInvestimentos.repintar();
    if (verInvest.repintar && $(".inv-top")) verInvest.repintar();
    if (gerirContas.repintar && $("[data-contas]")) gerirContas.repintar();
    desenhar();
  }, 0);
}

/* ----- Perfil ----- */
function telaPerfil() {
  const u = S.u;
  const diasBk = u.ultimoBackup ? Math.floor((Date.now() - new Date(u.ultimoBackup)) / 864e5) : null;
  const txtBk = diasBk === null ? "Nunca feito — recomendado!" : diasBk === 0 ? "Último: hoje" : `Último: há ${diasBk} dia${diasBk > 1 ? "s" : ""}`;
  const op = (dado, icone, tit, sub) => `<button class="linha-opc" data-op="${dado}"><span class="bola">${ic(icone)}</span><span class="meio">${tit}${sub ? `<small>${sub}</small>` : ""}</span><span class="seta">${ic("chevron-right")}</span></button>`;
  return `<header class="cab"><div class="perfil-topo"><div class="avatar">${esc(u.nome.slice(0, 1).toUpperCase())}</div>
      <div><b style="font-size:18px">${esc(u.nome)}</b><br><small style="color:rgba(0,0,0,.68)">usuário: ${esc(u.login)}</small></div></div></header>
    <div class="conteudo">${faixaInstalar("Instale o app na tela inicial.")}
    <section class="secao"><h2>Cadastros</h2><div class="cartao-box">
      ${op("categorias", "tag", "Categorias", `${S.d.categorias.length} categorias`)}
      ${op("contas", "wallet", "Contas", "Onde fica seu dinheiro (banco, carteira…)")}
      ${op("invest", "piggy-bank", "Investimentos", S.d.invest.length ? `${S.d.invest.length} cadastrado${S.d.invest.length > 1 ? "s" : ""} · ${fmtR(totalInvestido())}` : "Poupança, CDB, Tesouro, metas…")}
      ${op("fixos", "repeat", "Lançamentos recorrentes (fixos)", S.d.fixos.length ? `${S.d.fixos.length} todo mês` : "Aluguel, salário, internet…")}
      ${op("cartoes", "credit-card", "Cartões de crédito", S.d.cartoes.length ? S.d.cartoes.map((c) => c.nome).join(", ") : "Nenhum cadastrado")}
    </div></section>
    <section class="secao"><h2>Seus dados</h2><div class="cartao-box">
      ${op("backup", "download", "Salvar backup", txtBk)}
      ${op("restaurar", "upload", "Restaurar backup", "Trazer dados de outro celular")}
      ${op("csv", "file-spreadsheet", "Exportar planilha", "Arquivo para abrir no Excel")}
    </div></section>
    <section class="secao"><h2>Aparência</h2><div class="cartao-box">
      ${op("tema", "palette", "Cor do app", temaAtual().nome)}
    </div></section>
    <section class="secao"><h2>Segurança</h2><div class="cartao-box">
      ${op("senha", "key-round", "Trocar senha", "")}
      ${op("codigo", "lock", "Gerar novo código de recuperação", "O código antigo deixa de valer")}
      ${op("sair", "log-out", "Sair", "")}
    </div></section>
    <p style="text-align:center;color:#999;font-size:12px;margin:22px 0 0">Gestor de Finanças ${VERSAO_APP} · criado por <b style="color:#666">Denilson Carvalho</b><br>Dados guardados só neste aparelho · Ícones: Lucide (licença ISC)</p>
    <p style="text-align:center;margin:10px 0 0"><button class="link" style="font-size:13.5px" data-atualizar>Procurar atualização</button></p>
    </div>`;
}
ligar.perfil = () => {
  const acoes = { invest: abrirInvestimentos, tema: escolherTema, fixos: gerirFixos, categorias: gerirCategorias, contas: gerirContas, cartoes: gerirCartoes, backup: salvarBackup, restaurar: restaurarNoPerfil, csv: exportarCSV, senha: trocarSenha, codigo: gerarCodigo, sair: sairConfirmar };
  document.querySelectorAll("[data-op]").forEach((b) => (b.onclick = () => acoes[b.dataset.op]()));
  const bi = $("[data-instalar]"); if (bi) bi.onclick = instalarApp;
  $("[data-atualizar]").onclick = procurarAtualizacao;
};

async function sairConfirmar() { if (await confirmar("Sair", "Você vai precisar da senha para entrar de novo.", "Sair")) sair(); }

/* ================= ADICIONAR / EDITAR ================= */

// Abre a tela de lançamento.
//  abrirEditor()                          → novo lançamento
//  abrirEditor(l)                         → editar um lançamento existente
//  abrirEditor(null, { modelo: l })       → "lançar de novo" (novo, copiando de l)
//  abrirEditor(null, { fixo: f, ym })     → confirmar um lançamento fixo do mês
function abrirEditor(l, opc = {}) {
  const ultimo = (tipo) => { const x = [...S.d.lancs].reverse().find((y) => y.tipo === tipo && y.cat); return x ? x.cat : null; };
  const editando = !!l;
  const fonte = l || opc.modelo || opc.fixo;
  const E = fonte
    ? { tipo: fonte.tipo, cat: fonte.cat, nota: fonte.nota || "", conta: fonte.conta || S.d.contas[0]?.id, cartao: fonte.cartao || null,
        destino: fonte.destino || S.d.contas[1]?.id, data: editando ? l.data : hoje(), expr: nf0.format(fonte.valor / 100).replace(/\./g, ""), parcelas: 1, repetir: 0 }
    : { tipo: "despesa", cat: null, expr: "", nota: "", data: hoje(), conta: S.d.contas[0]?.id, cartao: null, parcelas: 1, destino: S.d.contas[1]?.id, repetir: 0 };
  if (!fonte && S.mes !== mesAtual()) E.data = `${S.mes}-01`;
  if (opc.fixo) E.data = dataFixo(opc.fixo, opc.ym);
  if (E.conta && !S.d.contas.some((c) => c.id === E.conta)) E.conta = S.d.contas[0]?.id;
  if (E.cartao && !S.d.cartoes.some((c) => c.id === E.cartao)) E.cartao = null;
  // investimentos
  E.mov = "aplic"; E.inv = S.d.invest[0]?.id || null; E.perda = false;
  if (fonte && ehInvest(fonte.tipo)) { E.mov = fonte.tipo; E.inv = fonte.inv; E.perda = !!fonte.perda; E.tipo = "invest"; }
  if (opc.inv) { E.tipo = "invest"; E.mov = opc.inv.mov || "aplic"; if (opc.inv.inv) E.inv = opc.inv.inv; if (!fonte) E.data = hoje(); }
  if (opc.transf) { E.tipo = "transf"; E.data = hoje(); }
  let todasCats = false;

  const titulo = editando ? "Editar" : opc.fixo ? "Confirmar fixo" : opc.modelo ? "Lançar de novo" : "Adicionar";
  const direita = editando
    ? `<button data-repetir aria-label="Lançar de novo">${ic("copy-plus")}</button><button data-del aria-label="Apagar">${ic("trash")}</button>`
    : opc.fixo ? `<button data-pular style="font-size:15px">Pular mês</button>` : "";
  const el = abrirCamada(`<div class="add-cab"><div class="linha"><button data-x>Cancelar</button><b>${titulo}</b>
      <span class="add-acoes">${direita}</span></div>
      <div class="alternar tres" data-tipos></div></div>
    <div class="add-corpo" data-corpo></div>
    <div class="teclado-area">
      <div class="visor"><div class="chips" data-chips></div><div class="valor"><div class="num" data-vis>0</div><small data-res></small></div></div>
      <div class="nota"><span>Nota:</span><input data-nota maxlength="80" placeholder="Insira uma nota…" enterkeyhint="done"><button class="bt-repetir" data-repetirmes hidden></button></div>
      <div class="teclado">
        <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button class="data" data-data>${ic("calendar")}<span data-datatxt></span></button>
        <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button data-k="+">+</button>
        <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button data-k="-">−</button>
        <button data-k=",">,</button><button data-k="0">0</button><button data-k="apagar">${ic("delete")}</button><button class="ok" data-ok>${ic("check")}</button>
      </div>
    </div>`, { tela: true });

  const nota = $("[data-nota]", el);
  nota.value = E.nota || "";
  nota.oninput = () => (E.nota = nota.value);
  // ✓ / Enter do teclado do celular: fecha o teclado para voltar ao valor e finalizar
  nota.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); nota.blur(); } };

  function pintarTipos() {
    const t = (v, r) => `<button data-t="${v}" class="${E.tipo === v ? "ativo" : ""}">${r}</button>`;
    const box = $("[data-tipos]", el);
    if (E.tipo === "transf" && (editando || opc.transf)) box.innerHTML = t("transf", "Transferência");
    else if (E.tipo === "invest" && editando) box.innerHTML = t("invest", "Investimento");
    else if (editando || opc.fixo) box.innerHTML = t("despesa", "Despesa") + t("receita", "Receita");
    else box.innerHTML = t("despesa", "Despesa") + t("receita", "Receita") + t("invest", "Investimento");
    box.style.gridTemplateColumns = `repeat(${box.children.length}, 1fr)`;
    box.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
      if (E.tipo === b.dataset.t) return;
      E.tipo = b.dataset.t; E.cat = fonte && fonte.tipo === E.tipo ? fonte.cat : ultimo(E.tipo);
      if (E.tipo !== "despesa") E.cartao = null;
      if (E.tipo === "transf" || E.tipo === "invest") E.repetir = 0;
      E.parcelas = 1;
      todasCats = false;
      pintarTipos(); pintarCorpo(); pintarChips();
    }));
  }

  function pintarCorpo() {
    const corpo = $("[data-corpo]", el);
    if (E.tipo === "invest") {
      if (!S.d.invest.length) {
        corpo.innerHTML = `<div class="vazio">${ic("piggy-bank")}Você ainda não cadastrou investimentos.<br><br><button class="btn preto" data-cadinv style="width:auto;margin:0 auto">Cadastrar investimento</button></div>`;
        $("[data-cadinv]", corpo).onclick = () => editarInvest(null, (n) => { if (n) E.inv = n.id; pintarCorpo(); });
        return;
      }
      if (!S.d.invest.some((i) => i.id === E.inv)) E.inv = S.d.invest[0].id;
      const dica = { aplic: "Tira da conta e coloca no investimento. Não conta como despesa.", resg: "Tira do investimento e volta para a conta. Não conta como receita.", rend: "Quanto o investimento rendeu (ou perdeu). O dinheiro continua aplicado." }[E.mov];
      const inv = invest(E.inv);
      const blocoInv = `<button class="escolha-conta" data-escinv>${bola(inv.icone, corInv(inv))}<span><small>Investimento</small>${esc(inv.nome)} · <span class="num">${fmtR(saldoInv(E.inv))}</span></span></button>`;
      const blocoConta = `<button class="escolha-conta" data-escconta><span class="bola">${ic("wallet")}</span><span><small>${E.mov === "aplic" ? "Sai da conta" : "Volta para a conta"}</small>${esc(conta(E.conta).nome)} · <span class="num">${fmtR(saldoConta(E.conta))}</span></span></button>`;
      corpo.innerHTML = `<div class="transf">
        <div class="mov-sel">${Object.entries(MOVS).map(([k, r]) => `<button data-mv="${k}" class="${E.mov === k ? "sel" : ""}" ${editando && k !== E.mov ? "disabled" : ""}>${r}</button>`).join("")}</div>
        <p class="mov-dica">${dica}</p>
        ${E.mov === "aplic" ? blocoConta + `<div class="seta-meio">↓</div>` + blocoInv : E.mov === "resg" ? blocoInv + `<div class="seta-meio">↓</div>` + blocoConta
          : blocoInv + `<div class="mov-sel dois-op"><button data-pd="0" class="${!E.perda ? "sel" : ""}">Rendeu</button><button data-pd="1" class="${E.perda ? "sel" : ""}">Perdeu</button></div>`}</div>`;
      corpo.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { E.mov = b.dataset.mv; pintarCorpo(); }));
      corpo.querySelectorAll("[data-pd]").forEach((b) => (b.onclick = () => { E.perda = b.dataset.pd === "1"; pintarCorpo(); }));
      $("[data-escinv]", corpo).onclick = async () => {
        const ops = S.d.invest.map((i) => ({ valor: i.id, rotulo: i.nome, icone: i.icone, sub: `${i.tipo} · ${fmtR(saldoInv(i.id))}` }));
        ops.push({ valor: "novo", rotulo: "Novo investimento", icone: "plus" });
        const v = await escolher("Qual investimento?", ops, E.inv);
        if (v === "novo") return editarInvest(null, (n) => { if (n) E.inv = n.id; pintarCorpo(); });
        if (v) { E.inv = v; pintarCorpo(); }
      };
      const ec = $("[data-escconta]", corpo);
      if (ec) ec.onclick = async () => {
        const v = await escolher("Qual conta?", S.d.contas.map((c) => ({ valor: c.id, rotulo: c.nome, icone: "wallet", sub: fmtR(saldoConta(c.id)) })), E.conta);
        if (v) { E.conta = v; pintarCorpo(); }
      };
      return;
    }
    if (E.tipo === "transf") {
      const bloco = (rot, id, chave) => `<button class="escolha-conta" data-ec="${chave}"><span class="bola">${ic("wallet")}</span><span><small>${rot}</small>${esc(conta(id).nome)}</span></button>`;
      corpo.innerHTML = S.d.contas.length < 2
        ? `<div class="vazio">${ic("arrow-left-right")}Para transferir, cadastre pelo menos duas contas em <b>Perfil → Contas</b>.</div>`
        : `<div class="transf">${bloco("De", E.conta, "conta")}<div class="seta-meio">↓</div>${bloco("Para", E.destino, "destino")}</div>`;
      corpo.querySelectorAll("[data-ec]").forEach((b) => (b.onclick = async () => {
        const v = await escolher(b.dataset.ec === "conta" ? "Sair de qual conta?" : "Para qual conta?", S.d.contas.map((c) => ({ valor: c.id, rotulo: c.nome, icone: "wallet", sub: fmtR(saldoConta(c.id)) })), E[b.dataset.ec]);
        if (v) { E[b.dataset.ec] = v; pintarCorpo(); }
      }));
      return;
    }
    // Na ordem escolhida em Perfil → Categorias; mostra as 12 primeiras até tocar em "Todas"
    const cats = S.d.categorias.filter((c) => c.tipo === E.tipo);
    const LIM = 12;
    let mostrar = cats;
    if (!todasCats && cats.length > LIM + 1) {
      mostrar = cats.slice(0, LIM);
      const sel = cats.find((c) => c.id === E.cat);
      if (sel && !mostrar.includes(sel)) mostrar = [...cats.slice(0, LIM - 1), sel];
    }
    const mais = mostrar.length < cats.length ? `<button data-todas><span class="bola">${ic("circle-ellipsis")}</span>Todas (${cats.length})</button>`
      : `<button data-organizar><span class="bola">${ic("arrow-up-down")}</span>Organizar</button>`;
    corpo.innerHTML = cats.length
      ? `<div class="grade-cat">${mostrar.map((c) => `<button data-c="${c.id}" class="${E.cat === c.id ? "sel" : ""}">${bola(c.icone, c.cor)}${esc(c.nome)}</button>`).join("")}${mais}</div>`
      : `<div class="vazio">${ic("tag")}Nenhuma categoria de ${E.tipo}.<br>Crie em <b>Perfil → Categorias</b>.</div>`;
    corpo.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => {
      E.cat = b.dataset.c;
      corpo.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("sel", x === b));
    }));
    const bt = $("[data-todas]", corpo);
    if (bt) bt.onclick = () => { todasCats = true; pintarCorpo(); };
    const org = $("[data-organizar]", corpo);
    if (org) org.onclick = () => gerirCategorias(() => { todasCats = false; pintarCorpo(); });
  }

  function pintarChips() {
    const box = $("[data-chips]", el);
    if (E.tipo === "transf" || E.tipo === "invest") { box.innerHTML = ""; pintarRepetir(); return; }
    const pagoCom = E.cartao ? `<button class="chip cartao" data-pg>${ic("credit-card")}<span>${esc(cartao(E.cartao).nome)}</span></button>`
      : `<button class="chip" data-pg>${ic("wallet")}<span>${esc(conta(E.conta).nome)}</span></button>`;
    const podeParc = (E.cartao || E.tipo === "receita") && !(editando && l.parc) && !opc.fixo && !E.repetir;
    const parc = podeParc ? `<button class="chip" data-parc>${E.parcelas}x</button>` : "";
    box.innerHTML = pagoCom + parc;
    pintarRepetir();
    $("[data-pg]", box).onclick = async () => {
      const ops = S.d.contas.map((c) => ({ valor: "conta:" + c.id, rotulo: c.nome, icone: "wallet", grupo: "Sai do saldo", sub: "Dinheiro, Pix ou débito" }));
      if (E.tipo === "despesa") {
        S.d.cartoes.forEach((c) => ops.push({ valor: "cartao:" + c.id, rotulo: c.nome, icone: "credit-card", grupo: "Cartão de crédito (não sai do saldo)", sub: `Entra na fatura de ${nomeMes(faturaDe(c.id, E.data))}` }));
        ops.push({ valor: "novo", rotulo: "Cadastrar cartão de crédito", icone: "plus", grupo: S.d.cartoes.length ? undefined : "Cartão de crédito (não sai do saldo)" });
      }
      const v = await escolher(E.tipo === "despesa" ? "Pago com" : "Recebido em", ops, E.cartao ? "cartao:" + E.cartao : "conta:" + E.conta);
      if (!v) return;
      if (v === "novo") return editarCartao(null, (c) => { E.cartao = c.id; pintarChips(); });
      const [k, id] = v.split(":");
      if (k === "cartao") { E.cartao = id; } else { E.cartao = null; E.conta = id; E.parcelas = 1; }
      pintarChips();
    };
    const pc = $("[data-parc]", box);
    if (pc) pc.onclick = async () => {
      const total = calc().valor;
      const rec = E.tipo === "receita";
      const ops = Array.from({ length: 24 }, (_, i) => ({ valor: i + 1, rotulo: i ? `${i + 1}x` : rec ? "De uma vez (1x)" : "À vista (1x)",
        sub: total > 0 && i ? `${i + 1}x de ${fmtR(Math.floor(total / (i + 1)))}${rec ? " · uma por mês" : ""}` : "" }));
      const v = await escolher(rec ? "Vou receber em quantas vezes?" : "Parcelas", ops, E.parcelas);
      if (v) { E.parcelas = v; pintarChips(); }
    };
  }

  // Recorrente (repete todo mês)
  const btRep = $("[data-repetirmes]", el);
  const txtRep = (n) => (n === -1 ? "Todo mês" : n > 0 ? `${n}x` : "Recorrente");
  const fixoLigado = () => (editando && l.fixo ? fixoPorId(l.fixo) : null);
  function pintarRepetir() {
    const fx = fixoLigado();
    const pode = !opc.fixo && E.tipo !== "transf" && E.tipo !== "invest" && E.parcelas === 1 && !(editando && l.parc);
    btRep.hidden = !pode && !fx;
    btRep.classList.toggle("ativo", !!E.repetir || !!fx);
    btRep.innerHTML = `${ic("repeat")}<span>${fx ? "Recorrente" : txtRep(E.repetir)}</span>`;
  }
  btRep.onclick = () => {
    const fx = fixoLigado();
    if (fx) return editarFixo(fx, () => { pintarRepetir(); });
    const dia = Number(E.data.slice(8)), mesIni = E.data.slice(0, 7);
    const qtdIni = E.repetir > 0 ? E.repetir : 12;
    const sh = abrirCamada(`<h2>Recorrente</h2>
      <p style="text-align:center;color:#666;margin:-6px 0 14px;font-size:14px">Nos próximos meses ele aparece em “Fixos a confirmar”, no Início, todo dia ${dia}.</p>
      <div class="lista-escolha">
        <button data-rop="0" class="${!E.repetir ? "sel" : ""}"><span class="bola">${ic("x")}</span><span>Não é recorrente</span>${!E.repetir ? `<span class="ok">${ic("check")}</span>` : ""}</button>
        <button data-rop="-1" class="${E.repetir === -1 ? "sel" : ""}"><span class="bola">${ic("repeat")}</span><span>Sem prazo<br><small style="color:#777">Aluguel, salário, internet… até você parar</small></span>${E.repetir === -1 ? `<span class="ok">${ic("check")}</span>` : ""}</button>
      </div>
      <div class="rep-qtd ${E.repetir > 0 ? "sel" : ""}">
        <div class="rep-qtd-l"><span class="bola">${ic("calendar-clock")}</span><b>Por quantos meses?</b></div>
        <div class="rep-qtd-c">
          <button type="button" data-menos aria-label="Menos">−</button>
          <input data-qtd type="number" inputmode="numeric" min="2" max="120" value="${qtdIni}">
          <button type="button" data-mais aria-label="Mais">+</button>
          <span>meses</span>
        </div>
        <small data-ate></small>
        <button class="btn preto" data-usar style="margin-top:12px">Recorrente por <span data-n>${qtdIni}</span> meses</button>
      </div>`);
    const inp = $("[data-qtd]", sh);
    const val = () => Math.max(2, Math.min(120, Math.round(Number(inp.value) || 2)));
    const atualizar = () => {
      const n = val();
      $("[data-ate]", sh).textContent = `Este mês e mais ${n - 1} — até ${nomeMes(somaMes(mesIni, n - 1))}.`;
      $("[data-n]", sh).textContent = n;
    };
    inp.oninput = atualizar;
    inp.onblur = () => { inp.value = val(); atualizar(); };
    $("[data-menos]", sh).onclick = () => { inp.value = val() - 1; inp.value = val(); atualizar(); };
    $("[data-mais]", sh).onclick = () => { inp.value = val() + 1; inp.value = val(); atualizar(); };
    atualizar();
    const usar = (n) => { E.repetir = n; pintarChips(); fechar(); if (n) aviso(n === -1 ? "Recorrente todo mês, sem prazo." : `Recorrente por ${n} meses.`); };
    sh.querySelectorAll("[data-rop]").forEach((b) => (b.onclick = () => usar(Number(b.dataset.rop))));
    $("[data-usar]", sh).onclick = () => usar(val());
  };

  // Calculadora: aceita "12+4,50-3"
  function calc() {
    const s = E.expr.replace(/,/g, ".");
    if (!s) return { valor: 0, temOp: false };
    const partes = s.match(/[+-]?[^+-]+/g) || [];
    let tot = 0;
    for (const p of partes) { const n = Number(p); if (!Number.isFinite(n)) return { valor: NaN, temOp: true }; tot += n; }
    return { valor: Math.round(tot * 100), temOp: /[0-9.][+-]/.test(s) };
  }
  function pintarVisor() {
    $("[data-vis]", el).textContent = E.expr ? E.expr.replace(/-/g, "−") : "0";
    const r = calc();
    $("[data-res]", el).textContent = r.temOp && Number.isFinite(r.valor) ? "= " + nf2.format(r.valor / 100) : "";
  }
  function tecla(k) {
    let x = E.expr;
    const ultimoNum = x.split(/[+-]/).pop();
    if (k === "apagar") x = x.slice(0, -1);
    else if (k === "+" || k === "-") { if (!x) return; if (/[+-]$/.test(x)) x = x.slice(0, -1); x += k; }
    else if (k === ",") { if (ultimoNum.includes(",")) return; x += ultimoNum ? "," : "0,"; }
    else { if (/,\d\d$/.test(ultimoNum)) return; if (ultimoNum === "0") x = x.slice(0, -1); x += k; }
    if (x.length > 22) return;
    E.expr = x; pintarVisor();
  }
  el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => tecla(b.dataset.k)));

  // Data: Hoje / Ontem / Anteontem / outra
  const ontem = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const pintarData = () => ($("[data-datatxt]", el).textContent = E.data === hoje() ? "Hoje" : E.data === ontem(1) ? "Ontem" : dataCurta(E.data));
  $("[data-data]", el).onclick = () => {
    const op = (v, rot) => `<button type="button" class="${E.data === v ? "sel" : ""}" data-dt="${v}">${rot}<small>${dataCurta(v)}</small></button>`;
    const sh = abrirCamada(`<h2>Data</h2><div class="datas-rapidas">${op(hoje(), "Hoje")}${op(ontem(1), "Ontem")}${op(ontem(2), "Anteontem")}</div>
      <label style="margin-top:14px">Outra data<input type="date" data-outra value="${E.data}"></label>`);
    const usar = (v) => { E.data = v; pintarData(); pintarChips(); fechar(); };
    sh.querySelectorAll("[data-dt]").forEach((b) => (b.onclick = () => usar(b.dataset.dt)));
    $("[data-outra]", sh).onchange = (e) => { if (e.target.value) usar(e.target.value); };
  };

  $("[data-x]", el).onclick = () => fechar();

  // Salvar
  $("[data-ok]", el).onclick = async () => {
    const r = calc();
    if (r.temOp) { if (Number.isFinite(r.valor) && r.valor > 0) { E.expr = nf2.format(r.valor / 100).replace(/\./g, ""); pintarVisor(); } return; }
    if (!(r.valor > 0)) return aviso("Digite o valor.");
    if (E.tipo === "invest") {
      if (!E.inv || !S.d.invest.some((i) => i.id === E.inv)) return aviso("Escolha ou cadastre um investimento.");
      if (E.mov === "resg") {
        const disp = saldoInv(E.inv, "9999-12-31") + (editando && l.tipo === "resg" && l.inv === E.inv ? l.valor : 0);
        if (r.valor > disp) return aviso(`Esse investimento tem só ${fmtR(disp)}.`);
      }
      const mov = { tipo: E.mov, valor: r.valor, nota: (E.nota || "").trim(), data: E.data, inv: E.inv, conta: E.mov === "rend" ? null : E.conta };
      if (E.mov === "rend" && E.perda) mov.perda = true;
      if (editando) {
        const alvo = S.d.lancs.find((x) => x.id === l.id);
        for (const k of ["cat", "cartao", "destino", "perda", "parc", "fixo"]) delete alvo[k];
        Object.assign(alvo, mov);
      } else S.d.lancs.push({ ...mov, id: novoId() });
      await salvar(); fechar();
      aviso(editando ? "Alterações salvas." : E.mov === "aplic" ? `Aplicado em ${invest(E.inv).nome}. Não conta como despesa.` : E.mov === "resg" ? `Resgatado para ${conta(E.conta).nome}.` : E.perda ? "Perda registrada." : "Rendimento registrado.");
      if (!editando && !E.data.startsWith(S.mes)) S.mes = E.data.slice(0, 7);
      atualizarFundo();
      return;
    }
    if (E.tipo === "transf") {
      if (S.d.contas.length < 2) return aviso("Cadastre outra conta em Perfil → Contas.");
      if (E.conta === E.destino) return aviso("Escolha contas diferentes.");
    } else if (!E.cat) return aviso("Escolha uma categoria.");

    const base = { tipo: E.tipo, valor: r.valor, nota: (E.nota || "").trim(), data: E.data };
    if (E.tipo === "transf") Object.assign(base, { conta: E.conta, destino: E.destino });
    else Object.assign(base, { cat: E.cat, conta: E.cartao ? null : E.conta, cartao: E.cartao || null });

    let msg = "Lançamento adicionado.";
    const parcelado = (E.cartao || E.tipo === "receita") && E.parcelas > 1;
    if (editando && parcelado && !l.parc) {
      // lançamento existente passou a ser parcelado: vira N parcelas
      const n = E.parcelas, cada = Math.floor(r.valor / n), sobra = r.valor - cada * n, g = novoId();
      S.d.lancs = S.d.lancs.filter((x) => x.id !== l.id);
      for (let i = 0; i < n; i++) S.d.lancs.push({ ...base, id: novoId() + i, valor: cada + (i === 0 ? sobra : 0), data: somaMesData(E.data, i), parc: { n: i + 1, t: n, g } });
      msg = E.tipo === "receita" ? `Alterado para receber em ${n}x de ${fmtR(cada)}.` : `Alterado para o cartão em ${n}x de ${fmtR(cada)}.`;
    } else if (editando) {
      const alvo = S.d.lancs.find((x) => x.id === l.id);
      Object.assign(alvo, base);
      if (!alvo.cartao && alvo.tipo !== "receita") delete alvo.parc;
      msg = "Alterações salvas.";
      if (E.repetir && !fixoLigado() && !alvo.parc && alvo.tipo !== "transf") {
        const f = { id: novoId(), tipo: alvo.tipo, cat: alvo.cat, valor: alvo.valor, nota: alvo.nota, conta: alvo.conta, cartao: alvo.cartao, dia: Number(alvo.data.slice(8)), inicio: alvo.data.slice(0, 7) };
        if (E.repetir > 0) f.fim = somaMes(f.inicio, E.repetir);
        S.d.fixos.push(f); alvo.fixo = f.id;
        msg = `Agora é recorrente: aparece todo dia ${f.dia} para confirmar${f.fim ? `, até ${nomeMes(somaMes(f.fim, -1))}` : ""}.`;
      }
    } else if (parcelado) {
      const n = E.parcelas, cada = Math.floor(r.valor / n), sobra = r.valor - cada * n, g = novoId();
      for (let i = 0; i < n; i++) S.d.lancs.push({ ...base, id: novoId() + i, valor: cada + (i === 0 ? sobra : 0), data: somaMesData(E.data, i), parc: { n: i + 1, t: n, g } });
      msg = E.tipo === "receita" ? `Receita lançada em ${n}x de ${fmtR(cada)}, uma por mês.` : `Lançado no cartão em ${n}x. Não saiu do saldo.`;
    } else {
      const novo = { ...base, id: novoId() };
      if (opc.fixo) { novo.fixo = opc.fixo.id; msg = "Fixo confirmado."; }
      else if (E.repetir) {
        const f = { id: novoId(), tipo: base.tipo, cat: base.cat, valor: base.valor, nota: base.nota, conta: base.conta, cartao: base.cartao, dia: Number(E.data.slice(8)), inicio: E.data.slice(0, 7) };
        if (E.repetir > 0) f.fim = somaMes(f.inicio, E.repetir);
        S.d.fixos.push(f); novo.fixo = f.id;
        msg = `Recorrente criado: aparece todo dia ${f.dia} para confirmar${f.fim ? `, até ${nomeMes(somaMes(f.fim, -1))}` : ""}.`;
      } else if (E.cartao) msg = "Lançado no cartão. Não saiu do saldo.";
      S.d.lancs.push(novo);
    }

    await salvar();
    fechar();
    aviso(msg);
    if (!editando && !E.data.startsWith(S.mes)) S.mes = E.data.slice(0, 7);
    atualizarFundo();
  };

  // Lançar de novo (a partir de um lançamento aberto)
  const rep = $("[data-repetir]", el);
  if (rep) rep.onclick = () => { fechar(); setTimeout(() => abrirEditor(null, { modelo: l }), 60); };

  // Pular um fixo neste mês
  const pul = $("[data-pular]", el);
  if (pul) pul.onclick = async () => {
    S.d.pulados.push(opc.fixo.id + "|" + opc.ym);
    await salvar(); fechar(); aviso("Pulado neste mês."); atualizarFundo();
  };

  // Apagar
  const del = $("[data-del]", el);
  if (del) del.onclick = async () => {
    const alvo = S.d.lancs.find((x) => x.id === l.id);
    if (alvo.parc) {
      const v = await escolher("Apagar parcelado", [{ valor: "uma", rotulo: `Só esta parcela (${alvo.parc.n}/${alvo.parc.t})`, icone: "trash" }, { valor: "todas", rotulo: `Todas as ${alvo.parc.t} parcelas`, icone: "trash" }]);
      if (!v) return;
      S.d.lancs = v === "todas" ? S.d.lancs.filter((x) => !(x.parc && x.parc.g === alvo.parc.g)) : S.d.lancs.filter((x) => x.id !== alvo.id);
    } else {
      const txtFixo = alvo.fixo && fixoPorId(alvo.fixo) ? " Ele volta a aparecer como fixo a confirmar neste mês." : "";
      if (!(await confirmar("Apagar lançamento", `${alvo.nota || (ehInvest(alvo.tipo) ? `${MOVS[alvo.tipo]} · ${invest(alvo.inv).nome}` : alvo.tipo === "transf" ? "Transferência" : cat(alvo.cat).nome)} · ${fmtR(alvo.valor)}.${txtFixo}`, "Apagar", true))) return;
      S.d.lancs = S.d.lancs.filter((x) => x.id !== alvo.id);
    }
    await salvar(); fechar(); aviso("Lançamento apagado."); atualizarFundo();
  };

  if (!E.cat && E.tipo !== "transf") E.cat = ultimo(E.tipo);
  pintarTipos(); pintarCorpo(); pintarChips(); pintarVisor(); pintarData();
}

/* ================= INVESTIMENTOS ================= */

const TIPOS_INV = [
  ["Poupança", "piggy-bank"], ["CDB / RDB", "landmark"], ["Tesouro Direto", "building"], ["LCI / LCA", "shield"],
  ["Fundos", "coins"], ["Ações", "chart-line"], ["Fundos imobiliários", "house"], ["Cripto", "gem"],
  ["Previdência", "umbrella"], ["Conta remunerada", "wallet"], ["Outros", "trending-up"],
];
const CORES_INV = ["#111111", "#E0560B", "#1E88E5", "#43A047", "#8E24AA", "#B8860B", "#00897B", "#D81B60", "#546E7A", "#6D4C41", "#3949AB"];
const MOVS = { aplic: "Aplicar", resg: "Resgatar", rend: "Rendimento" };
const ehInvest = (t) => t === "aplic" || t === "resg" || t === "rend";
const invest = (id) => S.d.invest.find((i) => i.id === id) || { nome: "Investimento removido", icone: "trending-up", tipo: "Outros" };
const corInv = (i) => i.cor || CORES_INV[Math.max(0, S.d.invest.indexOf(i)) % CORES_INV.length];

// Saldo de um investimento até uma data (hoje, se não informar)
function saldoInv(id, ate = hoje()) {
  let s = invest(id).saldoInicial || 0;
  for (const l of S.d.lancs) {
    if (l.inv !== id || l.data > ate) continue;
    if (l.tipo === "aplic") s += l.valor;
    else if (l.tipo === "resg") s -= l.valor;
    else if (l.tipo === "rend") s += l.perda ? -l.valor : l.valor;
  }
  return s;
}
const totalInvestido = (ate) => S.d.invest.reduce((t, i) => t + saldoInv(i.id, ate), 0);
const totalContas = (ate) => S.d.contas.reduce((t, c) => t + saldoConta(c.id, ate), 0);
const patrimonio = (ate) => totalContas(ate) + totalInvestido(ate);
function movsPeriodo(pref) {
  let apl = 0, resg = 0, rend = 0;
  for (const l of S.d.lancs) {
    if (!ehInvest(l.tipo) || !l.data.startsWith(pref)) continue;
    if (l.tipo === "aplic") apl += l.valor; else if (l.tipo === "resg") resg += l.valor; else rend += l.perda ? -l.valor : l.valor;
  }
  return { apl, resg, rend };
}
const fimDoMes = (ym) => { const [a, m] = ym.split("-").map(Number); const f = `${ym}-${p2(new Date(a, m, 0).getDate())}`; return f > hoje() ? hoje() : f; };
const sinalR = (v) => (v < 0 ? "- " : "+ ") + fmtR(Math.abs(v));

function rosquinha(fatias, centro1, centro2) {
  const total = fatias.reduce((t, f) => t + Math.max(0, f.v), 0);
  if (!total) return "";
  const R = 70, C = 2 * Math.PI * R; let acum = 0;
  const segs = fatias.filter((f) => f.v > 0).map((f, i, arr) => {
    const frac = f.v / total;
    const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${f.cor}" stroke-width="30" stroke-dasharray="${Math.max(0, frac * C - (arr.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-acum * C}" transform="rotate(-90 100 100)"/>`;
    acum += frac; return s;
  }).join("");
  return `<svg viewBox="0 0 200 200">${segs}<text x="100" y="96" text-anchor="middle" font-size="12" fill="#777">${centro1}</text>
    <text x="100" y="118" text-anchor="middle" font-size="${centro2.length > 11 ? 15 : 18}" font-weight="700" fill="#111">${centro2}</text></svg>`;
}

function abrirInvestimentos() {
  const el = abrirCamada(`<div class="cab det-cab"><button data-x aria-label="Voltar">${ic("arrow-left")}</button><b>Investimentos</b>
      <button class="det-mes" data-novoinv>${ic("plus")}</button></div><div class="det-corpo" data-invtela></div>`, { tela: true, aoFechar: () => desenhar() });
  $("[data-x]", el).onclick = () => fechar();
  $("[data-novoinv]", el).onclick = () => editarInvest(null, pintar);
  const pintar = () => {
    const corpo = $("[data-invtela]", el);
    const btMov = `<div class="inv-acoes"><button data-mov="aplic">${ic("download")}Aplicar</button><button data-mov="resg">${ic("upload")}Resgatar</button><button data-mov="rend">${ic("trending-up")}Rendimento</button></div>`;
    if (!S.d.invest.length) {
      corpo.innerHTML = `<div class="inv-intro">${ic("piggy-bank")}<h3>Organize seus investimentos</h3>
        <p>Cadastre onde seu dinheiro está guardado (poupança, CDB, Tesouro…). Aplicar e resgatar <b>não contam como despesa ou receita</b>: o dinheiro só muda de lugar. Rendimentos aumentam seu patrimônio.</p>
        <button class="btn preto" data-primeiro>Cadastrar primeiro investimento</button></div>`;
      $("[data-primeiro]", corpo).onclick = () => editarInvest(null, pintar);
      return;
    }
    const ym = mesAtual(), ano = ym.slice(0, 4);
    const nasContas = totalContas(), investido = totalInvestido(), pat = nasContas + investido;
    const mm = movsPeriodo(ym), ma = movsPeriodo(ano);
    // evolução do patrimônio (12 meses)
    // começa no mês em que a pessoa começou a usar o app (no máximo 12 meses)
    const primeiro = [S.u.criadoEm ? S.u.criadoEm.slice(0, 7) : ym, ...S.d.lancs.map((l) => l.data.slice(0, 7))].reduce((a, b) => (b < a ? b : a), ym);
    const inicio = primeiro < somaMes(ym, -11) ? somaMes(ym, -11) : primeiro;
    const meses = []; for (let m = inicio; m <= ym; m = somaMes(m, 1)) meses.push(m);
    const serie = meses.map((m) => ({ m, c: totalContas(fimDoMes(m)), i: totalInvestido(fimDoMes(m)) }));
    const mx = Math.max(1, ...serie.map((x) => Math.max(0, x.c) + Math.max(0, x.i)));
    const antes = fimDoMes(somaMes(meses[0], -1));
    const varia = pat - patrimonio(antes);
    const barras = serie.map((x) => `<div class="pat-col" title="${nomeMes(x.m)}: ${fmtR(x.c + x.i)}">
        <span class="pat-bar"><i class="pi" style="height:${(Math.max(0, x.i) / mx) * 100}%"></i><i class="pc" style="height:${(Math.max(0, x.c) / mx) * 100}%"></i></span>
        <small>${MES3[Number(x.m.slice(5)) - 1].replace(".", "")}</small></div>`).join("");
    // metas
    const comMeta = S.d.invest.filter((i) => i.meta > 0);
    const metas = comMeta.map((i) => {
      const s = saldoInv(i.id), p = Math.min(100, Math.max(0, (s / i.meta) * 100));
      return `<button class="meta" data-inv="${i.id}"><div class="meta-l"><b>${esc(i.metaNome || i.nome)}</b><span class="num">${Math.floor(p)}%</span></div>
        <div class="meta-b"><i style="width:${p}%;background:${corInv(i)}"></i></div>
        <small>${fmtR(s)} de ${fmtR(i.meta)} · ${s >= i.meta ? "meta alcançada!" : `faltam ${fmtR(i.meta - s)}`}</small></button>`;
    }).join("");
    // onde está
    const lista = S.d.invest.map((i) => ({ i, s: saldoInv(i.id) })).sort((a, b) => b.s - a.s);
    const fat = lista.map((x) => ({ v: x.s, cor: corInv(x.i) }));
    const onde = lista.map((x) => `<button class="inv-l" data-inv="${x.i.id}">${bola(x.i.icone, corInv(x.i))}<span class="meio"><b>${esc(x.i.nome)}</b><small>${esc(x.i.tipo)}</small></span>
        <span class="inv-v"><b class="num">${fmtR(x.s)}</b><small>${investido > 0 ? Math.round((Math.max(0, x.s) / investido) * 100) : 0}%</small></span></button>`).join("");
    corpo.innerHTML = `
      <div class="pat-card"><small>Patrimônio total</small><div class="pat-v num">${fmtR(pat)}</div>
        <div class="pat-div"><div><i class="pc"></i><span>Nas contas</span><b class="num">${fmtR(nasContas)}</b></div><div><i class="pi"></i><span>Investido</span><b class="num">${fmtR(investido)}</b></div></div>
        <div class="pat-mes"><span>Este mês: aplicou <b class="num">${fmtR(mm.apl)}</b> · resgatou <b class="num">${fmtR(mm.resg)}</b> · rendeu <b class="num">${sinalR(mm.rend)}</b></span>
        <span>Rendimentos em ${ano}: <b class="num">${sinalR(ma.rend)}</b></span></div></div>
      ${btMov}
      <section class="secao"><h2>Evolução do patrimônio</h2><div class="cartao-box" style="padding:14px 10px 10px">
        <div class="pat-graf">${barras}</div>
        <div class="mb-leg"><span><i class="pc"></i>Nas contas</span><span><i class="pi"></i>Investido</span></div>
        <p class="pat-varia">Desde ${nomeMes(meses[0])}: <b class="num">${sinalR(varia)}</b></p></div></section>
      <section class="secao"><h2>Metas</h2>${comMeta.length ? `<div class="cartao-box">${metas}</div>`
        : `<div class="cartao-box"><p class="vazio-meta">Defina uma meta num investimento (ex.: Reserva de emergência, R$ 10.000) e acompanhe aqui. Toque num investimento abaixo → Editar.</p></div>`}</section>
      <section class="secao"><h2>Onde está</h2><div class="cartao-box">${investido > 0 ? `<div class="rosca-area inv-rosca">${rosquinha(fat, "Investido", fmt(investido))}
        <div class="legenda">${lista.filter((x) => x.s > 0).slice(0, 6).map((x) => `<div><i style="background:${corInv(x.i)}"></i><span>${esc(x.i.nome)}</span><b class="num">${Math.round((x.s / investido) * 100)}%</b></div>`).join("")}</div></div>` : ""}
        ${onde}<button class="inv-l nova" data-novo2><span class="bola">${ic("plus")}</span><span class="meio"><b>Novo investimento</b></span></button></div></section>`;
    corpo.querySelectorAll("[data-mov]").forEach((b) => (b.onclick = () => abrirEditor(null, { inv: { mov: b.dataset.mov } })));
    corpo.querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => verInvest(b.dataset.inv)));
    $("[data-novo2]", corpo).onclick = () => editarInvest(null, pintar);
  };
  pintar();
  abrirInvestimentos.repintar = pintar;
}

function verInvest(id) {
  const el = abrirCamada(`<div data-c></div>`);
  const pintar = () => {
    const i = S.d.invest.find((x) => x.id === id);
    if (!i) return fechar();
    const s = saldoInv(id);
    const movs = S.d.lancs.filter((l) => l.inv === id).sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
    const rendTot = movs.filter((l) => l.tipo === "rend").reduce((t, l) => t + (l.perda ? -l.valor : l.valor), 0);
    const p = i.meta > 0 ? Math.min(100, Math.max(0, (s / i.meta) * 100)) : 0;
    $("[data-c]", el).innerHTML = `<div class="inv-top">${bola(i.icone, corInv(i))}<div><h2 style="text-align:left;margin:0">${esc(i.nome)}</h2><small>${esc(i.tipo)}</small></div>
        <button class="btn contorno" data-ed style="width:auto;padding:8px 14px;margin-left:auto">${ic("pencil")}Editar</button></div>
      <div class="inv-saldo"><small>Saldo hoje</small><b class="num">${fmtR(s)}</b><span>Rendimentos acumulados: <b class="num">${sinalR(rendTot)}</b></span></div>
      ${i.meta > 0 ? `<div class="meta" style="padding:0 0 12px"><div class="meta-l"><b>Meta${i.metaNome ? ": " + esc(i.metaNome) : ""}</b><span class="num">${Math.floor(p)}%</span></div>
        <div class="meta-b"><i style="width:${p}%;background:${corInv(i)}"></i></div><small>${fmtR(s)} de ${fmtR(i.meta)} · ${s >= i.meta ? "meta alcançada!" : `faltam ${fmtR(i.meta - s)}`}</small></div>` : ""}
      <div class="inv-acoes" style="margin:4px 0 12px"><button data-mov="aplic">${ic("download")}Aplicar</button><button data-mov="resg">${ic("upload")}Resgatar</button><button data-mov="rend">${ic("trending-up")}Rendimento</button></div>
      <div style="margin:0 -18px">${movs.map((l) => itemLanc(l, true)).join("") || `<p class="vazio" style="padding:20px">Nenhuma movimentação ainda.</p>`}</div>`;
    $("[data-ed]", el).onclick = () => editarInvest(i, pintar);
    el.querySelectorAll("[data-mov]").forEach((b) => (b.onclick = () => abrirEditor(null, { inv: { mov: b.dataset.mov, inv: id } })));
    el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
  };
  pintar();
  verInvest.repintar = pintar;
}

function editarInvest(i, depois) {
  let tipo = i ? i.tipo : TIPOS_INV[0][0];
  const el = abrirCamada(`<h2>${i ? "Editar investimento" : "Novo investimento"}</h2><form data-f>
    <label>Nome<input name="nome" maxlength="28" value="${esc(i ? i.nome : "")}" placeholder="Ex.: Reserva Nubank, Tesouro Selic" required></label>
    <label style="margin-bottom:6px">Tipo</label>
    <div class="tipos-inv">${TIPOS_INV.map(([n, ico]) => `<button type="button" data-tp="${esc(n)}" class="${n === tipo ? "sel" : ""}">${ic(ico)}<span>${esc(n)}</span></button>`).join("")}</div>
    <label style="margin-top:12px">Quanto já tem aplicado hoje (R$)<input name="saldo" inputmode="decimal" value="${i ? nf2.format((i.saldoInicial || 0) / 100) : "0,00"}">
      <small style="color:#888">Valor que já estava investido antes de começar a usar o app. Não sai das suas contas.</small></label>
    <div class="dois"><label>Meta (opcional, R$)<input name="meta" inputmode="decimal" value="${i && i.meta ? nf2.format(i.meta / 100) : ""}" placeholder="Ex.: 10.000"></label>
    <label>Nome da meta<input name="metaNome" maxlength="28" value="${esc(i && i.metaNome ? i.metaNome : "")}" placeholder="Ex.: Reserva de emergência"></label></div>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button>${i ? `<button type="button" class="btn perigo" data-apagar>Apagar investimento</button>` : ""}</div></form>`);
  el.querySelectorAll("[data-tp]").forEach((b) => (b.onclick = () => { tipo = b.dataset.tp; el.querySelectorAll("[data-tp]").forEach((x) => x.classList.toggle("sel", x === b)); }));
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, erro = $("[data-e]", el);
    const saldo = f.saldo.value.trim() ? lerValor(f.saldo.value) : 0;
    const meta = f.meta.value.trim() ? lerValor(f.meta.value) : 0;
    if (!Number.isFinite(saldo) || saldo < 0) return (erro.textContent = "Valor aplicado inválido.");
    if (!Number.isFinite(meta) || meta < 0) return (erro.textContent = "Meta inválida.");
    const icone = (TIPOS_INV.find(([n]) => n === tipo) || TIPOS_INV[0])[1];
    const dados = { nome: f.nome.value.trim(), tipo, icone, saldoInicial: saldo, meta, metaNome: f.metaNome.value.trim() };
    let alvo = i;
    if (i) Object.assign(i, dados); else { alvo = { id: novoId(), ...dados }; S.d.invest.push(alvo); }
    await salvar(); fechar(); aviso("Investimento salvo.");
    setTimeout(() => { depois && depois(alvo); atualizarFundo(); }, 0);
  };
  const ap = $("[data-apagar]", el);
  if (ap) ap.onclick = async () => {
    if (S.d.lancs.some((l) => l.inv === i.id)) return aviso("Esse investimento tem movimentações. Apague-as antes.");
    if (!(await confirmar("Apagar investimento", `Apagar “${i.nome}”?`, "Apagar", true))) return;
    S.d.invest = S.d.invest.filter((x) => x.id !== i.id);
    await salvar(); fechar(); aviso("Investimento apagado.");
    setTimeout(() => { depois && depois(); atualizarFundo(); }, 0);
  };
}

/* ================= LANÇAMENTOS FIXOS ================= */

const fixoPorId = (id) => S.d.fixos.find((f) => f.id === id);
function dataFixo(f, ym) {
  const [a, m] = ym.split("-").map(Number);
  return `${ym}-${p2(Math.min(f.dia, new Date(a, m, 0).getDate()))}`;
}
// Fixos que ainda não foram confirmados (nem pulados) no mês
function fixosPendentes(ym) {
  return S.d.fixos
    .filter((f) => f.inicio <= ym && (!f.fim || ym < f.fim) && !S.d.pulados.includes(f.id + "|" + ym) && !S.d.lancs.some((l) => l.fixo === f.id && l.data.startsWith(ym)))
    .sort((a, b) => a.dia - b.dia);
}
async function confirmarFixoRapido(fid, ym) {
  const f = fixoPorId(fid);
  if (!f) return;
  const novo = { id: novoId(), tipo: f.tipo, valor: f.valor, nota: f.nota || "", data: dataFixo(f, ym), cat: f.cat, conta: f.cartao ? null : (S.d.contas.some((c) => c.id === f.conta) ? f.conta : S.d.contas[0].id), cartao: f.cartao && S.d.cartoes.some((c) => c.id === f.cartao) ? f.cartao : null, fixo: f.id };
  S.d.lancs.push(novo);
  await salvar(); aviso("Fixo confirmado."); desenhar();
}

function gerirFixos() {
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    $("[data-c]", el).innerHTML = `<h2>Lançamentos recorrentes</h2>
      <p style="text-align:center;color:#666;margin:-6px 0 10px;font-size:14px">Aparecem todo mês no Início para você confirmar com um toque. Para criar, toque em <b>↻ Recorrente</b> ao adicionar ou editar um lançamento.</p>
      <div class="lista-escolha">${S.d.fixos.length ? S.d.fixos.map((f) => `<button data-e="${f.id}">${bola(cat(f.cat).icone, cat(f.cat).cor)}
        <span>${esc(f.nota || cat(f.cat).nome)}<br><small style="color:#777">${f.tipo === "receita" ? "Receita" : "Despesa"} · todo dia ${f.dia}${f.fim ? ` até ${nomeMes(somaMes(f.fim, -1))}` : ""} · ${fmtR(f.valor)}${f.cartao ? " · " + esc(cartao(f.cartao).nome) : ""}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")
        : `<p class="vazio" style="padding:24px">Nenhum lançamento fixo ainda.</p>`}</div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarFixo(fixoPorId(b.dataset.e), pintar)));
  };
  pintar();
}

function editarFixo(f, depois) {
  const dias = Array.from({ length: 31 }, (_, i) => `<option ${i + 1 === f.dia ? "selected" : ""}>${i + 1}</option>`).join("");
  const cats = S.d.categorias.filter((c) => c.tipo === f.tipo);
  const el = abrirCamada(`<h2>Editar fixo</h2><form data-f>
    <label>Nota<input name="nota" maxlength="80" value="${esc(f.nota || "")}" placeholder="Ex.: Aluguel"></label>
    <div class="dois"><label>Valor (R$)<input name="valor" inputmode="decimal" value="${nf2.format(f.valor / 100)}" required></label>
    <label>Todo dia<select name="dia">${dias}</select></label></div>
    <label>Categoria<select name="cat">${cats.map((c) => `<option value="${c.id}" ${c.id === f.cat ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
    <p style="font-size:13px;color:#777;margin:-4px 0 12px">As mudanças valem para os próximos meses. O que já foi confirmado não muda.</p>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button><button type="button" class="btn perigo" data-parar>Parar de repetir</button></div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const fm = e.target, v = lerValor(fm.valor.value);
    if (!(v > 0)) return ($("[data-e]", el).textContent = "Digite um valor válido.");
    Object.assign(f, { nota: fm.nota.value.trim(), valor: v, dia: Number(fm.dia.value), cat: fm.cat.value });
    await salvar(); fechar(); aviso("Fixo atualizado."); setTimeout(depois, 0);
  };
  $("[data-parar]", el).onclick = async () => {
    if (!(await confirmar("Parar de repetir", "Ele deixa de aparecer nos próximos meses. Os lançamentos já confirmados continuam.", "Parar", true))) return;
    S.d.fixos = S.d.fixos.filter((x) => x.id !== f.id);
    await salvar(); fechar(); aviso("Não vai mais se repetir."); setTimeout(depois, 0);
  };
}

/* ================= BUSCA ================= */

function abrirBusca() {
  const el = abrirCamada(`<div class="busca-cab"><button data-x aria-label="Voltar">${ic("arrow-left")}</button>
      <input data-q type="search" placeholder="Buscar por nota, categoria ou valor" autocomplete="off"></div>
    <div class="busca-res" data-r><p class="vazio">${ic("search")}Digite pelo menos 2 letras.</p></div>`, { tela: true });
  const q = $("[data-q]", el), res = $("[data-r]", el);
  $("[data-x]", el).onclick = () => fechar();
  const sem = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const buscar = () => {
    const t = sem(q.value.trim());
    if (t.length < 2) { res.innerHTML = `<p class="vazio">${ic("search")}Digite pelo menos 2 letras.</p>`; return; }
    const achados = S.d.lancs.filter((l) => {
      const txt = [l.nota, l.cat && cat(l.cat).nome, l.cartao && cartao(l.cartao).nome, l.conta && conta(l.conta).nome, fmt(l.valor), l.tipo === "fatura" ? "fatura" : "", l.tipo === "transf" ? "transferencia" : "", l.inv && invest(l.inv).nome, ehInvest(l.tipo) ? "investimento " + MOVS[l.tipo] : ""].map(sem).join(" ");
      return txt.includes(t);
    }).sort((a, b) => b.data.localeCompare(a.data));
    if (!achados.length) { res.innerHTML = `<p class="vazio">${ic("search")}Nada encontrado.</p>`; return; }
    const des = achados.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
    const rec = achados.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
    let html = `<div class="busca-tot">${achados.length} lançamento${achados.length > 1 ? "s" : ""}${des ? ` · despesas <b class="num">${fmtR(des)}</b>` : ""}${rec ? ` · receitas <b class="num">${fmtR(rec)}</b>` : ""}</div>`;
    let mesAtualGrupo = "";
    for (const l of achados.slice(0, 300)) {
      const ym = l.data.slice(0, 7);
      if (ym !== mesAtualGrupo) { mesAtualGrupo = ym; html += `<div class="dia-cab"><span style="text-transform:capitalize">${MESES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}</span></div>`; }
      html += itemLanc(l, true);
    }
    res.innerHTML = html;
  };
  q.oninput = buscar;
  res.onclick = (e) => { const b = e.target.closest("[data-lanc]"); if (b) abrirLanc(b.dataset.lanc); };
  buscar.repintar = buscar;
  abrirBusca.repintar = buscar;
  setTimeout(() => q.focus(), 250);
}

/* ================= CADASTROS ================= */

function gerirCategorias(depois) {
  let tipo = "despesa";
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => { desenhar(); depois && depois(); } });
  const pintar = () => {
    const cats = S.d.categorias.filter((c) => c.tipo === tipo);
    $("[data-c]", el).innerHTML = `<h2>Categorias</h2><div class="alternar" style="margin:0 auto 10px">
      <button data-t="despesa" class="${tipo === "despesa" ? "ativo" : ""}">Despesas</button><button data-t="receita" class="${tipo === "receita" ? "ativo" : ""}">Receitas</button></div>
      <p class="dica-ordem">${ic("grip-vertical")} Segure e arraste pelos pontinhos para mudar a ordem. As primeiras aparecem primeiro na hora de lançar.</p>
      <button class="nova-cat" data-nova><span class="bola">${ic("plus")}</span><b>Nova categoria</b></button>
      <div class="lista-ordem" data-lista>${cats.map((c) => `<div class="ordem-l" data-id="${c.id}">
        <button class="ordem-ed" data-e="${c.id}">${bola(c.icone, c.cor)}<span>${esc(c.nome)}</span></button>
        <span class="ordem-pega" data-arrastar aria-label="Arrastar">${ic("grip-vertical")}</span></div>`).join("")}</div>`;
    el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tipo = b.dataset.t; pintar(); }));
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarCategoria(S.d.categorias.find((c) => c.id === b.dataset.e), tipo, pintar)));
    $("[data-nova]", el).onclick = () => editarCategoria(null, tipo, pintar);
    ordenavel($("[data-lista]", el), async (de, para) => {
      const lista = S.d.categorias.filter((c) => c.tipo === tipo);
      const [mov] = lista.splice(de, 1);
      lista.splice(para, 0, mov);
      const outras = S.d.categorias.filter((c) => c.tipo !== tipo);
      S.d.categorias = tipo === "despesa" ? [...lista, ...outras] : [...outras, ...lista];
      await salvar();
      pintar();
    });
  };
  pintar();
}

// Arrastar para reordenar (funciona com o dedo e com o mouse)
function ordenavel(lista, aoSoltar) {
  lista.querySelectorAll("[data-arrastar]").forEach((h) => (h.onpointerdown = (e) => {
    e.preventDefault();
    const item = h.closest("[data-id]");
    const itens = [...lista.querySelectorAll("[data-id]")];
    const rolavel = lista.closest(".folha") || document.scrollingElement;
    const alt = item.offsetHeight;
    const ini = itens.indexOf(item);
    const y0 = e.clientY, s0 = rolavel.scrollTop;
    let alvo = ini, ultY = e.clientY, rolar = 0, raf = 0;
    try { h.setPointerCapture(e.pointerId); } catch {}
    item.classList.add("arrastando");
    lista.classList.add("ordenando");
    const atualizar = () => {
      const dy = ultY - y0 + (rolavel.scrollTop - s0);
      item.style.transform = `translateY(${dy}px)`;
      alvo = Math.max(0, Math.min(itens.length - 1, ini + Math.round(dy / alt)));
      itens.forEach((it, i) => {
        if (it === item) return;
        let d = 0;
        if (ini < alvo && i > ini && i <= alvo) d = -alt;
        if (ini > alvo && i < ini && i >= alvo) d = alt;
        it.style.transform = d ? `translateY(${d}px)` : "";
      });
    };
    const loop = () => {
      if (rolar) { rolavel.scrollTop += rolar; atualizar(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    h.onpointermove = (ev) => {
      ultY = ev.clientY;
      const r = rolavel.getBoundingClientRect ? rolavel.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const topo = Math.max(r.top, 0), base = Math.min(r.bottom, innerHeight);
      rolar = ev.clientY < topo + 70 ? -7 : ev.clientY > base - 70 ? 7 : 0;
      atualizar();
    };
    const fim = () => {
      cancelAnimationFrame(raf);
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      itens.forEach((it) => (it.style.transform = ""));
      item.classList.remove("arrastando");
      lista.classList.remove("ordenando");
      if (alvo !== ini) aoSoltar(ini, alvo);
    };
    h.onpointerup = fim;
    h.onpointercancel = fim;
  }));
}

function editarCategoria(c, tipo, depois) {
  let icone = c ? c.icone : "tag", cor = c ? c.cor || null : null;
  const grupos = GRUPOS_ICONES.map(([nome, ns]) => `<div class="grupo-ic">${esc(nome)}</div>
    <div class="grade-icones">${ns.map((n) => `<button type="button" data-i="${n}" class="${n === icone ? "sel" : ""}">${ic(n)}</button>`).join("")}</div>`).join("");
  const cores = `<button type="button" data-cor="" class="cor-op padrao ${!cor ? "sel" : ""}" aria-label="Sem cor"></button>` +
    CORES_CAT.map((h) => `<button type="button" data-cor="${h}" class="cor-op ${cor === h ? "sel" : ""}" style="background:${h}" aria-label="Cor"></button>`).join("");
  const el = abrirCamada(`<h2>${c ? "Editar categoria" : "Nova categoria"}</h2>
    <form data-f>
      <div class="cat-prev"><span data-prev></span><label style="flex:1;margin:0">Nome<input name="nome" maxlength="24" value="${esc(c ? c.nome : "")}" required></label></div>
      <div class="grupo-ic">Cor</div><div class="cores">${cores}</div>
      ${grupos}
      <div class="botoes" style="position:sticky;bottom:0;background:#fff;padding-top:10px"><button class="btn preto">Salvar</button>${c ? `<button type="button" class="btn perigo" data-apagar>Apagar categoria</button>` : ""}</div></form>`);
  const prev = () => ($("[data-prev]", el).innerHTML = bola(icone, cor));
  el.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { icone = b.dataset.i; el.querySelectorAll("[data-i]").forEach((x) => x.classList.toggle("sel", x === b)); prev(); }));
  el.querySelectorAll("[data-cor]").forEach((b) => (b.onclick = () => { cor = b.dataset.cor || null; el.querySelectorAll("[data-cor]").forEach((x) => x.classList.toggle("sel", x === b)); prev(); }));
  prev();
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    if (!nome) return;
    let alvo = c;
    if (c) { Object.assign(c, { nome, icone }); if (cor) c.cor = cor; else delete c.cor; }
    else {
      alvo = { id: novoId(), tipo, nome, icone }; if (cor) alvo.cor = cor;
      const i = S.d.categorias.findIndex((x) => x.tipo === tipo);
      S.d.categorias.splice(i < 0 ? S.d.categorias.length : i, 0, alvo); // entra no topo
    }
    await salvar(); fechar(); aviso("Categoria salva.");
    setTimeout(() => depois && depois(alvo), 0);
  };
  const ap = $("[data-apagar]", el);
  if (ap) ap.onclick = async () => {
    const usos = S.d.lancs.filter((l) => l.cat === c.id).length;
    if (!(await confirmar("Apagar categoria", usos ? `${usos} lançamento(s) usam “${c.nome}” e ficarão como “Sem categoria”.` : `Apagar “${c.nome}”?`, "Apagar", true))) return;
    S.d.categorias = S.d.categorias.filter((x) => x.id !== c.id);
    await salvar(); fechar(); aviso("Categoria apagada.");
    setTimeout(() => depois && depois(), 0);
  };
}

function gerirContas() {
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    $("[data-c]", el).innerHTML = `<h2>Contas</h2><p style="text-align:center;color:#666;margin:-6px 0 10px;font-size:14px">Onde seu dinheiro fica: banco, carteira, poupança…</p>
      ${S.d.contas.length > 1 ? `<button class="btn contorno" data-transf style="margin-bottom:10px">${ic("arrow-left-right")}Transferir entre contas</button>`
        : `<p class="dica-ordem">${ic("arrow-left-right")} Com duas ou mais contas, aparece aqui a opção de transferir dinheiro entre elas.</p>`}
      <div class="lista-escolha" data-contas>${S.d.contas.map((c) => `<button data-e="${c.id}"><span class="bola">${ic("wallet")}</span><span>${esc(c.nome)}<br><small style="color:#777">Saldo: ${fmtR(saldoConta(c.id))}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")}
      <button data-nova><span class="bola">${ic("plus")}</span><b>Nova conta</b></button></div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarConta(S.d.contas.find((c) => c.id === b.dataset.e), pintar)));
    $("[data-nova]", el).onclick = () => editarConta(null, pintar);
    const tr = $("[data-transf]", el); if (tr) tr.onclick = () => abrirEditor(null, { transf: true });
  };
  pintar();
  gerirContas.repintar = pintar;
}

function editarConta(c, depois) {
  const el = abrirCamada(`<h2>${c ? "Editar conta" : "Nova conta"}</h2><form data-f>
    <label>Nome<input name="nome" maxlength="24" value="${esc(c ? c.nome : "")}" placeholder="Ex.: Banco, Carteira" required></label>
    <label>Saldo inicial (R$)<input name="saldo" inputmode="decimal" value="${c ? nf2.format((c.saldoInicial || 0) / 100) : "0,00"}"><small style="color:#888">Quanto havia na conta quando você começou a usar o app. Pode ser negativo.</small></label>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button>${c ? `<button type="button" class="btn perigo" data-apagar>Apagar conta</button>` : ""}</div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, txt = f.saldo.value.trim(), neg = txt.startsWith("-");
    let s = txt ? lerValor(txt.replace(/^-/, "")) : 0;
    if (!Number.isFinite(s)) return ($("[data-e]", el).textContent = "Saldo inválido.");
    if (neg) s = -s;
    if (c) Object.assign(c, { nome: f.nome.value.trim(), saldoInicial: s });
    else S.d.contas.push({ id: novoId(), nome: f.nome.value.trim(), saldoInicial: s });
    await salvar(); fechar(); aviso("Conta salva."); setTimeout(depois, 0);
  };
  const ap = $("[data-apagar]", el);
  if (ap) ap.onclick = async () => {
    if (S.d.contas.length === 1) return aviso("É preciso ter pelo menos uma conta.");
    if (S.d.lancs.some((l) => l.conta === c.id || l.destino === c.id)) return aviso("Essa conta tem lançamentos. Apague ou mude os lançamentos antes.");
    if (!(await confirmar("Apagar conta", `Apagar “${c.nome}”?`, "Apagar", true))) return;
    S.d.contas = S.d.contas.filter((x) => x.id !== c.id);
    await salvar(); fechar(); aviso("Conta apagada."); setTimeout(depois, 0);
  };
}

function gerirCartoes() {
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    $("[data-c]", el).innerHTML = `<h2>Cartões de crédito</h2><p style="text-align:center;color:#666;margin:-6px 0 10px;font-size:14px">Compras no cartão não saem do saldo. O valor só sai quando você registra o pagamento da fatura.</p>
      <div class="lista-escolha">${S.d.cartoes.map((c) => `<button data-e="${c.id}"><span class="bola">${ic("credit-card")}</span><span>${esc(c.nome)}<br><small style="color:#777">Fecha dia ${c.fechamento} · vence dia ${c.vencimento}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")}
      <button data-novo><span class="bola">${ic("plus")}</span><b>Novo cartão</b></button></div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarCartao(S.d.cartoes.find((c) => c.id === b.dataset.e), pintar)));
    $("[data-novo]", el).onclick = () => editarCartao(null, pintar);
  };
  pintar();
}

function editarCartao(c, depois) {
  const dias = (sel) => Array.from({ length: 31 }, (_, i) => `<option ${i + 1 === sel ? "selected" : ""}>${i + 1}</option>`).join("");
  const el = abrirCamada(`<h2>${c ? "Editar cartão" : "Novo cartão"}</h2><form data-f>
    <label>Nome do cartão<input name="nome" maxlength="24" value="${esc(c ? c.nome : "")}" placeholder="Ex.: Nubank, Itaú" required></label>
    <div class="dois"><label>Dia que fecha<select name="fech">${dias(c ? c.fechamento : 1)}</select></label>
    <label>Dia que vence<select name="venc">${dias(c ? c.vencimento : 10)}</select></label></div>
    <p style="font-size:13px;color:#777;margin:-4px 0 14px">Compras feitas a partir do dia do fechamento entram na fatura seguinte.</p>
    <div class="botoes"><button class="btn preto">Salvar</button>${c ? `<button type="button" class="btn perigo" data-apagar>Apagar cartão</button>` : ""}</div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, dados = { nome: f.nome.value.trim(), fechamento: Number(f.fech.value), vencimento: Number(f.venc.value) };
    let alvo = c;
    if (c) Object.assign(c, dados); else { alvo = { id: novoId(), ...dados }; S.d.cartoes.push(alvo); }
    await salvar(); fechar(); aviso("Cartão salvo."); setTimeout(() => depois ? depois(alvo) : desenhar(), 0);
  };
  const ap = $("[data-apagar]", el);
  if (ap) ap.onclick = async () => {
    if (S.d.lancs.some((l) => l.cartao === c.id)) return aviso("Esse cartão tem lançamentos. Apague-os antes.");
    if (!(await confirmar("Apagar cartão", `Apagar “${c.nome}”?`, "Apagar", true))) return;
    S.d.cartoes = S.d.cartoes.filter((x) => x.id !== c.id);
    await salvar(); fechar(); aviso("Cartão apagado."); setTimeout(() => depois ? depois() : desenhar(), 0);
  };
}

/* ================= SEGURANÇA ================= */

function trocarSenha() {
  const el = abrirCamada(`<h2>Trocar senha</h2><form data-f>
    <label>Senha atual<input type="password" name="atual" required></label>
    <label>Nova senha<input type="password" name="nova" minlength="4" required></label>
    <label>Repita a nova senha<input type="password" name="nova2" minlength="4" required></label>
    <p class="erro" data-e></p><div class="botoes"><button class="btn preto">Salvar</button></div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, erro = $("[data-e]", el);
    if (f.nova.value !== f.nova2.value) return (erro.textContent = "As senhas novas não são iguais.");
    try { await decifrar(await derivar(f.atual.value, S.u.salSenha), S.u.porSenha); }
    catch { return (erro.textContent = "Senha atual incorreta."); }
    await trocarSenhaCom(S.u, S.chaveBytes, f.nova.value);
    fechar(); aviso("Senha alterada.");
  };
}

function gerarCodigo() {
  const el = abrirCamada(`<h2>Novo código de recuperação</h2><form data-f>
    <p style="color:#555;margin:-4px 0 14px;text-align:center">Confirme sua senha. O código antigo deixará de funcionar.</p>
    <label>Senha<input type="password" name="senha" required></label>
    <p class="erro" data-e></p><div class="botoes"><button class="btn preto">Gerar código</button></div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    try { await decifrar(await derivar(e.target.senha.value, S.u.salSenha), S.u.porSenha); }
    catch { return ($("[data-e]", el).textContent = "Senha incorreta."); }
    const codigo = novoCodigo();
    S.u.salCodigo = novoSal();
    S.u.porCodigo = await cifrar(await derivar(normCodigo(codigo), S.u.salCodigo), S.chaveBytes);
    gravarUsuario(S.u);
    fechar();
    setTimeout(() => telaCodigo(codigo, false), 50);
  };
}

/* ================= BACKUP E PLANILHA ================= */

async function entregarArquivo(nome, conteudo, tipo) {
  const arq = new File([conteudo], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: nome }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(arq); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

async function salvarBackup() {
  await salvar();
  const pac = JSON.parse(localStorage.getItem("gf_dados_" + S.u.id));
  const bk = { app: "gestor-financas", versao: 1, criadoEm: new Date().toISOString(), usuario: { ...S.u, ultimoBackup: null }, dados: pac };
  const nome = `backup-gestor-financas-${S.u.login}-${hoje()}.json`;
  const ok = await entregarArquivo(nome, JSON.stringify(bk), "application/json");
  if (ok) {
    S.u.ultimoBackup = new Date().toISOString(); gravarUsuario(S.u);
    aviso("Backup gerado. Guarde no Drive, e-mail ou WhatsApp.");
    desenhar();
  }
}

async function restaurarBackup(arq) {
  if (!arq) throw new Error("Escolha um arquivo.");
  let bk;
  try { bk = JSON.parse(await arq.text()); } catch { throw new Error("Esse arquivo não é um backup válido."); }
  if (bk.app !== "gestor-financas" || !bk.usuario || !bk.dados) throw new Error("Esse arquivo não é um backup do Gestor de Finanças.");
  const existe = lerUsuarios().find((u) => u.login === bk.usuario.login);
  if (existe && !(await confirmar("Substituir dados?", `Já existe a conta “${bk.usuario.login}” neste celular. Os dados dela serão trocados pelos do backup.`, "Substituir", true))) return null;
  const u = { ...bk.usuario, id: existe ? existe.id : bk.usuario.id };
  gravarUsuarios(lerUsuarios().filter((x) => x.login !== u.login));
  gravarUsuario(u);
  localStorage.setItem("gf_dados_" + u.id, JSON.stringify(bk.dados));
  return u;
}

function restaurarNoPerfil() {
  const el = abrirCamada(`<h2>Restaurar backup</h2><form data-f>
    <p style="color:#555;margin:-4px 0 14px;text-align:center">Depois de restaurar, entre com o usuário e a senha que valiam quando o backup foi feito.</p>
    <label>Arquivo de backup<input type="file" name="arq" accept=".json,application/json" required></label>
    <p class="erro" data-e></p><div class="botoes"><button class="btn preto">Restaurar</button></div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    try {
      const u = await restaurarBackup(e.target.arq.files[0]);
      if (!u) return;
      fecharTudo(); S.u = null;
      telaLogin("entrar"); $("#f").login.value = u.login;
      aviso("Backup restaurado. Entre com a senha da época do backup.");
    } catch (err) { $("[data-e]", el).textContent = err.message; }
  };
}

async function exportarCSV() {
  const linhas = [["Data", "Tipo", "Categoria", "Nota", "Conta/Cartão", "Parcela", "Valor"]];
  const nomes = { despesa: "Despesa", receita: "Receita", transf: "Transferência", fatura: "Pagamento de fatura", aplic: "Aplicação", resg: "Resgate", rend: "Rendimento" };
  for (const l of [...S.d.lancs].sort((a, b) => a.data.localeCompare(b.data))) {
    const onde = ehInvest(l.tipo) ? (l.tipo === "rend" ? invest(l.inv).nome : l.tipo === "aplic" ? `${conta(l.conta).nome} → ${invest(l.inv).nome}` : `${invest(l.inv).nome} → ${conta(l.conta).nome}`) : l.tipo === "transf" ? `${conta(l.conta).nome} → ${conta(l.destino).nome}` : l.cartao && l.tipo === "despesa" ? `Cartão ${cartao(l.cartao).nome}` : l.tipo === "fatura" ? `${conta(l.conta).nome} (fatura ${cartao(l.cartao).nome})` : conta(l.conta).nome;
    const v = (l.tipo === "receita" || l.tipo === "transf" || l.tipo === "aplic" || l.tipo === "resg" || (l.tipo === "rend" && !l.perda) ? 1 : -1) * l.valor / 100;
    linhas.push([`${l.data.slice(8)}/${l.data.slice(5, 7)}/${l.data.slice(0, 4)}`, nomes[l.tipo], l.cat ? cat(l.cat).nome : "", l.nota || "", onde, l.parc ? `${l.parc.n}/${l.parc.t}` : "", nf2.format(v).replace(/\./g, "")]);
  }
  const csv = "﻿" + linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  await entregarArquivo(`gestor-financas-${hoje()}.csv`, csv, "text/csv");
}

/* ================= INÍCIO ================= */

// Bloqueia de novo depois de 10 horas sem uso
let escondidoEm = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { escondidoEm = Date.now(); marcarAtividade(); }
  else if (S.u && escondidoEm && Date.now() - escondidoEm > TEMPO_SESSAO) { sair(); aviso("Por segurança, entre novamente."); }
  else marcarAtividade();
});

// Atualizações: procura versão nova ao abrir o app e ao voltar para ele;
// quando chega uma versão nova, recarrega sozinho (a conta continua aberta).
let registroSW = null;
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const tinhaControle = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaControle || recarregou) return;
    recarregou = true; marcarAtividade(); location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
    .then((r) => { registroSW = r; r.update().catch(() => {}); })
    .catch(() => {});
  document.addEventListener("visibilitychange", () => { if (!document.hidden && registroSW) registroSW.update().catch(() => {}); });
}
async function procurarAtualizacao() {
  aviso("Procurando atualização…");
  try { if (registroSW) await registroSW.update(); } catch {}
  marcarAtividade();
  setTimeout(() => location.reload(), 900);
}
try {
  const antes = localStorage.getItem("gf_versao");
  if (antes && antes !== VERSAO_APP) setTimeout(() => aviso(`App atualizado para a versão ${VERSAO_APP}.`), 800);
  localStorage.setItem("gf_versao", VERSAO_APP);
} catch {}
window.addEventListener("pagehide", () => { if (!document.hidden) marcarAtividade(); });

aplicarTema();
retomarSessao().then((ok) => (ok ? desenhar() : telaLogin()));
