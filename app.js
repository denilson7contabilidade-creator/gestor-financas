"use strict";
/* Gestor de Finanças — app instalável, dados guardados só no aparelho e criptografados. */

const VERSAO_APP = "3.23";
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
const S = { u: null, chaveBytes: null, chave: null, d: null, aba: "inicio", mes: mesAtual(), graf: { tipo: "despesa", mes: mesAtual() }, relAba: "mes", relAno: Number(mesAtual().slice(0, 4)), cmp: { modo: "mes", mes: mesAtual(), ano: Number(mesAtual().slice(0, 4)) } };

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
  migrarPlanos(S.d);
  const migrou = migrarCategorias(S.d);
  S.mes = mesAtual();
  S.graf = { tipo: "despesa", mes: mesAtual() };
  S.relAno = Number(mesAtual().slice(0, 4));
  S.cmp = { modo: "mes", mes: mesAtual(), ano: Number(mesAtual().slice(0, 4)) }; S.relAba = "mes";
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
  // topo escuro (estilo "fintech"): a cor do tema misturada com azul-noite
  const base = t.claro ? t.fundo : t.graf;
  r.style.setProperty("--noite", misturar(base, "#0A0F1A", 0.78));
  r.style.setProperty("--noite2", misturar(base, "#070A12", 0.86));
  r.style.setProperty("--noite-tx", misturar(base, "#FFFFFF", 0.62));
  r.style.setProperty("--noite-tx2", misturar(base, "#FFFFFF", 0.8));
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = misturar(base, "#0A0F1A", 0.78);
  CORES[1] = t.graf;
  CORES[3] = clarear(t.graf, 0.55);
}
// mistura duas cores (q = quanto da segunda)
function misturar(a, b, q) {
  const h = (x) => { const n = parseInt(x.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const A = h(a), B = h(b);
  return "#" + A.map((v, i) => Math.round(v * (1 - q) + B[i] * q).toString(16).padStart(2, "0")).join("");
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
const ehBenef = (c) => !!(c && c.beneficio);
const icConta = (c) => (ehBenef(c) ? "ticket" : "wallet");
const conta = (id) => S.d.contas.find((c) => c.id === id) || { nome: "Conta removida" };
const cartao = (id) => S.d.cartoes.find((c) => c.id === id) || { nome: "Cartão removido", fechamento: 1, vencimento: 10 };

// Mês da fatura (pelo mês de vencimento) em que cai uma compra feita no cartão
function faturaDe(cid, iso) {
  const c = cartao(cid);
  const dia = Number(iso.slice(8));
  let fecha = iso.slice(0, 7);
  // fechaInclui: compras feitas no próprio dia do fechamento ainda entram na fatura que está fechando
  if (c.fechaInclui ? dia > c.fechamento : dia >= c.fechamento) fecha = somaMes(fecha, 1);
  return c.vencimento > c.fechamento ? fecha : somaMes(fecha, 1);
}
// Fatura a que uma compra pertence: a escolhida pela pessoa (fatMes) ou a calculada pelo fechamento
const faturaDoLanc = (l) => l.fatMes || faturaDe(l.cartao, l.data);
// Fatura que está aberta agora (ainda recebendo compras)
const faturaAberta = (cid) => faturaDe(cid, hoje());

function totaisMes(ym) {
  let des = 0, rec = 0, cart = 0, pagFat = 0, apl = 0, resg = 0, benD = 0, benR = 0;
  for (const l of S.d.lancs) {
    if (!l.data.startsWith(ym)) continue;
    const ben = l.conta && ehBenef(S.d.contas.find((c) => c.id === l.conta));
    if (l.tipo === "despesa") { des += l.valor; if (l.cartao) cart += l.valor; else if (ben) benD += l.valor; }
    else if (l.tipo === "receita") { rec += l.valor; if (ben) benR += l.valor; }
    else if (l.tipo === "fatura") pagFat += l.valor;
    else if (l.tipo === "aplic" && l.conta) apl += l.valor;
    else if (l.tipo === "resg") resg += l.valor;
  }
  // saldo do mês = o que entrou − o que saiu da conta (despesas pagas, faturas e aplicações) + resgates
  return { des, rec, cart, pagFat, apl, resg, saldo: (rec - benR) - (des - cart - benD) - pagFat - apl + resg };
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
  let total = 0, pago = 0, quitada = false; const itens = [];
  for (const l of S.d.lancs) {
    if (l.cartao !== cid) continue;
    if (l.tipo === "despesa" && faturaDoLanc(l) === ym) { total += l.valor; itens.push(l); }
    if (l.tipo === "fatura" && l.fatura === ym) { pago += l.valor; if (l.quita) quitada = true; }
  }
  itens.sort((a, b) => b.data.localeCompare(a.data));
  // "quitada": a pessoa marcou que pagou a fatura inteira (mesmo que o valor do banco seja diferente do app)
  return { total, pago, quitada, falta: quitada ? 0 : Math.max(0, total - pago), itens };
}
const vencimentoData = (cid, ym) => `${ym}-${p2(Math.min(cartao(cid).vencimento, new Date(...ym.split("-").map(Number), 0).getDate()))}`;

/* ================= INTERFACE: BÁSICO ================= */

function aviso(txt, acao) {
  const a = $("#aviso");
  a.textContent = txt; a.hidden = false;
  a.classList.toggle("com-acao", !!acao);
  if (acao) {
    const b = document.createElement("button");
    b.textContent = acao.rotulo;
    b.onclick = () => { a.hidden = true; acao.fn(); };
    a.appendChild(b);
  }
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), acao ? 6000 : 2400);
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
// Fecha a folha de cima e só depois abre outra (o "voltar" do navegador é assíncrono)
function trocarCamada(fn) { const n = pilha.length; if (!n) return fn(); fechar(); const t = setInterval(() => { if (pilha.length < n) { clearInterval(t); fn(); } }, 25); }
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
  agendarAvisosBackup();
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
// Resumo do mês (Início e Relatórios). Despesas = tudo do mês pela data da compra + fixos não confirmados,
// dividido em: pagas · a pagar (vence neste mês ou já venceu) · cartão (compras que só vencem numa fatura seguinte).
const temCartao = (cid) => !!cid && S.d.cartoes.some((c) => c.id === cid);
const vaiPraFaturaSeguinte = (l, ym) => l.tipo === "despesa" && temCartao(l.cartao) && faturaDoLanc(l) > ym;
const fixoNaFaturaSeguinte = (f, ym) => f.tipo === "despesa" && temCartao(f.cartao) && faturaDe(f.cartao, dataFixo(f, ym)) > ym;
function resumoMes(ym) {
  const hj = hoje(), jaFoi = criarJaFoi(hj);
  const r = { desPagas: 0, desAPagar: 0, desCartao: 0, recOk: 0, recFalta: 0 };
  const fats = new Set();
  for (const l of S.d.lancs) {
    if (!l.data.startsWith(ym)) continue;
    if (l.tipo === "despesa") {
      if (jaFoi(l)) r.desPagas += l.valor;
      else if (vaiPraFaturaSeguinte(l, ym)) { r.desCartao += l.valor; fats.add(faturaDoLanc(l)); }
      else r.desAPagar += l.valor;
    } else if (l.tipo === "receita") { if (l.data <= hj) r.recOk += l.valor; else r.recFalta += l.valor; }
    else if (l.tipo === "resg" && l.prog) r.recOk += l.valor;
  }
  for (const f of fixosPendentes(ym)) {
    if (f.tipo === "receita") r.recFalta += f.valor;
    else if (fixoNaFaturaSeguinte(f, ym)) { r.desCartao += f.valor; fats.add(faturaDe(f.cartao, dataFixo(f, ym))); }
    else r.desAPagar += f.valor;
  }
  r.recFalta += progAReceber(ym).reduce((t, x) => t + x.valor, 0);
  r.des = r.desPagas + r.desAPagar + r.desCartao; r.rec = r.recOk + r.recFalta;
  const fm = [...fats].sort();
  r.rotCartao = fm.length > 1 ? "faturas seguintes" : `fatura ${fm.length ? MES3[Number(fm[0].slice(5)) - 1] : ""}`;
  return r;
}
const mesCurto = (ym) => MES3[Number(ym.slice(5)) - 1].replace(".", "");
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
const diasAte = (iso, hj = hoje()) => Math.round((dataLocal(iso) - dataLocal(hj)) / 864e5);
// Faixa de meses para deslizar (12 para trás, 3 para frente)
function faixaMeses(ymSel, attr) {
  const atual = mesAtual(), ms = [];
  for (let i = -12; i <= 3; i++) ms.push(somaMes(atual, i));
  if (!ms.includes(ymSel)) ms.push(ymSel), ms.sort();
  const anoSel = ymSel.slice(0, 4);
  return `<div class="tn-meses" data-rolmeses>${ms.map((ym) => `<button ${attr}="${ym}" class="${ym === ymSel ? "on" : ""}">${ym === ymSel ? `${mesCurto(ym)} ${ym.slice(0, 4)}` : mesCurto(ym) + (ym.slice(0, 4) !== anoSel ? "/" + ym.slice(2, 4) : "")}</button>`).join("")}</div>`;
}
// Deslizar o dedo para o lado numa área: vai para o item anterior/seguinte de "lista"
function ligarDeslizar(el, lista, atual, ir) {
  if (!el) return;
  let x0 = null, y0 = 0;
  el.addEventListener("touchstart", (e) => { if (e.touches.length !== 1 || e.target.closest("[data-rolmeses], .grafb, .gi-rend")) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = lista.indexOf(atual()), j = i + (dx < 0 ? 1 : -1);
    if (j >= 0 && j < lista.length) ir(lista[j]);
  }, { passive: true });
}
function centralizarMeses() {
  document.querySelectorAll("[data-rolmeses]").forEach((rol) => { const at = rol.querySelector(".on"); if (at) rol.scrollLeft = at.offsetLeft - rol.clientWidth / 2 + at.clientWidth / 2; });
}
// Barra colorida: [[valor, classe], ...]
const barraPartes = (partes, total) => total ? `<div class="vbarra">${partes.filter(([v]) => v > 0).map(([v, c]) => `<i class="${c}" style="flex:${v}"></i>`).join("")}</div>` : `<div class="vbarra vazia"></div>`;
function blocosMes(r) {
  const des = `<div class="vb"><button class="vl" data-consid="despesa|ok"><span>Despesas do mês</span><b class="num">${fmt(r.des)}</b></button>
    ${barraPartes([[r.desPagas, "b1"], [r.desAPagar, "b2"], [r.desCartao, "b3"]], r.des)}
    <div class="vleg"><button data-consid="despesa|ok"><i class="b1"></i>${fmt(r.desPagas)} pagas</button><button data-consid="despesa|falta"><i class="b2"></i>${fmt(r.desAPagar)} a pagar</button>${r.desCartao ? `<button data-consid="despesa|cartao" class="cart">${ic("credit-card")}${fmt(r.desCartao)} ${r.rotCartao}</button>` : ""}</div></div>`;
  const rec = `<div class="vb"><button class="vl" data-consid="receita|ok"><span>Receitas do mês</span><b class="num">${fmt(r.rec)}</b></button>
    ${barraPartes([[r.recOk, "b1"], [r.recFalta, "b4"]], r.rec)}
    <div class="vleg"><button data-consid="receita|ok"><i class="b1"></i>${fmt(r.recOk)} recebidas</button><button data-consid="receita|falta"><i class="b4"></i>${fmt(r.recFalta)} a receber</button></div></div>`;
  // o maior fica em cima
  return r.rec > r.des ? rec + des : des + rec;
}

function telaInicio() {
  const [a, m] = S.mes.split("-");
  const hj = hoje();
  const porLanc = ordemInicio() === "lanc";
  const doMes = S.d.lancs.filter((l) => l.data.startsWith(S.mes))
    .sort(porLanc ? (x, y) => quandoLancado(y) - quandoLancado(x) || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0)
      : (x, y) => y.data.localeCompare(x.data) || y.id.localeCompare(x.id));

  // O que ainda vai acontecer no mês aparece na própria data: fixos, recebimentos de investimentos e faturas
  const pend = [];
  for (const f of fixosPendentes(S.mes)) {
    const c = cat(f.cat), cart = temCartao(f.cartao);
    pend.push({ data: dataFixo(f, S.mes), html: `<div class="item pendente"><button class="pend-abrir" data-fixo="${f.id}">${bola(c.icone, c.cor)}
      <span class="meio"><div>${esc(f.nota || c.nome)}</div><small>${ic("repeat")}Fixo${f.nota ? " · " + esc(c.nome) : ""}${cart ? ` · ${ic("credit-card")}${esc(cartao(f.cartao).nome)}` : ""}</small></span></button>
      <div class="pend-dir"><span class="val num">${f.tipo === "despesa" ? "- " : "+ "}${fmt(f.valor)}</span><button class="pend-conf" data-confirmar="${f.id}">${ic("check")}Confirmar</button></div></div>` });
  }
  for (const x of progAReceber(S.mes)) {
    pend.push({ data: x.data < S.mes + "-01" ? (hj.startsWith(S.mes) ? hj : S.mes + "-01") : x.data, html: `<div class="item pendente"><button class="pend-abrir" data-progok="${x.inv.id}|${x.p.id}|${x.ym}">${bola(x.inv.icone, corInv(x.inv))}
      <span class="meio"><div>${esc(x.inv.nome)}</div><small>${x.atrasada ? `<b style="color:#C62828">atrasada</b> · ` : ""}${ic("piggy-bank")}${x.rot}</small></span></button>
      <div class="pend-dir"><span class="val num">+ ${fmt(x.valor)}</span><button class="pend-conf" data-progok="${x.inv.id}|${x.p.id}|${x.ym}">${ic("check")}Confirmar</button></div></div>` });
  }
  for (const c of S.d.cartoes) {
    const f = infoFatura(c.id, S.mes);
    if (!(f.falta > 0)) continue;
    const venc = vencimentoData(c.id, S.mes), atras = venc < hj;
    pend.push({ data: venc, html: `<div class="item pendente"><button class="pend-abrir" data-verfat="${c.id}">${bola("credit-card")}
      <span class="meio"><div>Fatura ${esc(c.nome)} ${mesCurto(S.mes)}.</div><small>${atras ? `<b style="color:#C62828">venceu</b> · ` : "Vence · "}${f.itens.length} compra(s)${f.pago ? ` · falta ${fmt(f.falta)}` : ""}</small></span></button>
      <div class="pend-dir"><span class="val num">- ${fmt(f.falta)}</span><button class="pend-conf" data-pagar="${c.id}">Pagar</button></div></div>` });
  }

  let corpo = lembreteBackup() + cartaoFamilia();
  const mesNome = MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1);
  if (doMes.length || pend.length) {
    corpo += `<div class="lista-cab"><b>${mesNome}, ${porLanc ? "últimos lançados" : "dia a dia"}</b><button data-ordini="${porLanc ? "dia" : "lanc"}">${porLanc ? "Ver dia a dia" : "Últimos lançados"}</button></div>`;
  }
  const cabDia = (d, res) => {
    const n = diasAte(d, hj);
    const extra = d === hj ? `<em class="hoje-chip">Hoje</em>` : n > 0 ? `<em class="fut">${n === 1 ? "amanhã" : `em ${n} dias`}</em>` : "";
    return `<div class="dia-cab${d === hj ? " hoje" : ""}${n > 0 ? " futuro" : ""}"><span>${nomeDia(d)} ${extra}</span><span class="num">${res || ""}</span></div>`;
  };
  if (porLanc) {
    corpo += doMes.map((l) => itemLanc(l, true)).join("");
    if (pend.length) {
      corpo += `<div class="dia-cab futuro"><span>Ainda vão acontecer em ${MESES[m - 1]}</span><span></span></div>`;
      const pd = [...pend].sort((x, y) => x.data.localeCompare(y.data));
      let ult = "";
      for (const p of pd) { if (p.data !== ult) { corpo += cabDia(p.data); ult = p.data; } corpo += p.html; }
    }
  } else {
    const dias = {};
    for (const l of doMes) (dias[l.data] ||= { ls: [], ps: [] }).ls.push(l);
    for (const p of pend) (dias[p.data] ||= { ls: [], ps: [] }).ps.push(p);
    if (hj.startsWith(S.mes) && !dias[hj] && Object.keys(dias).length) dias[hj] = { ls: [], ps: [] };
    for (const d of Object.keys(dias).sort().reverse()) {
      const { ls, ps } = dias[d];
      const desDia = ls.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
      const recDia = ls.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
      const invDia = ls.filter((l) => l.tipo === "aplic").reduce((s, l) => s + l.valor, 0);
      const res0 = desDia && recDia ? `<span class="dd">− ${fmt(desDia)}</span> <span class="dr">+ ${fmt(recDia)}</span>`
        : desDia ? `Despesas: ${fmt(desDia)}` : recDia ? `Receitas: ${fmt(recDia)}` : "";
      const res = [res0, invDia ? `Investido: ${fmt(invDia)}` : ""].filter(Boolean).join(" · ");
      corpo += cabDia(d, res) + ps.map((p) => p.html).join("") + ls.map((l) => itemLanc(l)).join("");
    }
  }
  if (!doMes.length && !pend.length) corpo += `<div class="vazio">${ic("receipt")}Nenhum lançamento em ${MESES[m - 1]}.<br>Toque no <b>+</b> para adicionar.</div>`;

  const saldoReal = S.d.contas.filter((c) => !ehBenef(c)).reduce((s, c) => s + saldoConta(c.id), 0);
  const r = resumoMes(S.mes);
  // atalhos: benefícios, investido e a fatura do mês (com quantos dias faltam para vencer)
  const at = [];
  if (S.d.contas.some(ehBenef)) at.push(`<button class="at" data-irrel="benef"><small>${ic("ticket")}Benefícios</small><b class="num">${fmtR(S.d.contas.filter(ehBenef).reduce((t, c) => t + saldoConta(c.id), 0))}</b></button>`);
  if (S.d.invest.length) at.push(`<button class="at" data-abririnv><small>${ic("piggy-bank")}Investido</small><b class="num">${fmtR(totalInvestido())}</b></button>`);
  if (S.d.cartoes.length) {
    const fs = S.d.cartoes.map((c) => ({ c, f: infoFatura(c.id, S.mes) }));
    const tot = fs.reduce((t, x) => t + x.f.total, 0), falta = fs.reduce((t, x) => t + x.f.falta, 0);
    const vencs = fs.filter((x) => x.f.falta > 0).map((x) => vencimentoData(x.c.id, S.mes)).sort();
    let sub = "";
    if (vencs.length) {
      const n = diasAte(vencs[0], hj);
      sub = n < 0 ? `<em class="atras">venceu dia ${dataCurta(vencs[0])}</em>` : `<em>${n === 0 ? "vence hoje" : n === 1 ? "vence amanhã" : `vence em ${n} dias`}</em>`;
    } else if (tot) sub = `<em class="ok">✓ paga</em>`;
    at.push(`<button class="at" data-fatmes><small>${ic("credit-card")}Fatura${S.d.cartoes.length > 1 ? "s" : ""} ${mesCurto(S.mes)}.</small><b class="num">${fmtR(falta)}</b>${sub}</button>`);
  }
  const nome = (S.u.nome || "").trim().split(/\s+/)[0];
  return `<header class="topo-n">
      <div class="tn-linha"><div class="ola">${saudacao()}${nome ? "," : ""}<b>${esc(nome)}</b></div><button class="tn-bt" data-busca aria-label="Buscar">${ic("search")}</button></div>
      <button class="tn-saldo" data-irrel="contas"><small>${ic("wallet")}Saldo em conta hoje</small><b class="num">${fmtR(saldoReal)}</b></button>
      ${faixaMeses(S.mes, "data-mesch")}
      <div class="vidro">${blocosMes(r)}</div>
    </header>
    ${at.length ? `<div class="atalhos n${at.length}">${at.join("")}</div>` : ""}${faixaInstalar("Instale o app na tela inicial.")}
    <div class="conteudo" id="lista">${corpo}</div>`;
}

// Lembrete de backup: depois de X dias sem backup (padrão 20), aparece toda vez que abrir
// e manda notificação às 9h, 13h e 19h até ser feito, adiado para amanhã ou desligado.
const prazoBackup = (u) => (u.backupDias == null ? 20 : u.backupDias);
function diasSemBackup(u) {
  const base = u.ultimoBackup || u.criadoEm;
  return base ? Math.floor((dataLocal(hoje()) - dataLocal(String(base).slice(0, 10))) / 864e5) : 0;
}
const dataLocal = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
// adiado para amanhã: guarda a data de hoje (antigo: data e hora); vale até o fim do dia
const adiadoHoje = (u, iso = hoje()) => !!u.adiouBackup && String(u.adiouBackup).slice(0, 10) >= iso;
function backupAtrasado(u = S.u) {
  if (!u || !S.d || !S.d.lancs.length || !prazoBackup(u) || adiadoHoje(u)) return false;
  return diasSemBackup(u) >= prazoBackup(u);
}
function lembreteBackup() {
  const u = S.u;
  if (!backupAtrasado(u)) return "";
  return `<div class="lembrete alerta">${ic("download")}<div><b>${u.ultimoBackup ? `Faz ${diasSemBackup(u)} dias sem backup` : "Você ainda não fez backup"}</b><small>O backup protege seus lançamentos se você limpar o Chrome, trocar ou perder o celular.</small>
    <div class="lembrete-bt"><button data-bk-fazer>Fazer backup</button><button data-bk-adiar>Lembrar amanhã</button><button data-bk-nunca>Não perguntar mais</button></div></div></div>`;
}
function textoLembreteBackup(u) { const p = prazoBackup(u); return p ? `Avisa depois de ${p} dias sem backup` : "Desligado"; }
function configurarLembreteBackup() {
  const u = S.u, st = !("Notification" in window) ? "sem" : Notification.permission;
  const el = abrirCamada(`<h2>Lembrete de backup</h2>
    <p style="text-align:center;color:#555;margin:-6px 0 14px;font-size:14px">Depois desse prazo sem backup, o app avisa toda vez que você abrir e manda notificação às 9h, 13h e 19h até você fazer.</p>
    <div class="mov-sel quatro">${[[7, "7 dias"], [20, "20 dias"], [30, "30 dias"], [0, "Desligado"]].map(([k, v]) => `<button data-dias="${k}" class="${prazoBackup(u) === k ? "sel" : ""}">${v}</button>`).join("")}</div>
    <div class="linha-notif">${ic("bell")}<span>${st === "granted" ? "Notificações no celular: <b>ativadas</b>" : st === "denied" ? "Notificações bloqueadas. Libere em Configurações do celular → Notificações → Chrome." : st === "sem" ? "Este navegador não mostra notificações." : "Notificações no celular: desativadas"}</span>${st === "default" ? `<button class="btn preto" data-permitir>Permitir</button>` : ""}</div>
    <div class="botoes" style="margin-top:14px"><button class="btn preto" data-ok>Pronto</button></div>`, { aoFechar: () => desenhar() });
  el.querySelectorAll("[data-dias]").forEach((b) => (b.onclick = () => {
    u.backupDias = Number(b.dataset.dias); u.adiouBackup = null; gravarUsuario(u);
    el.querySelectorAll("[data-dias]").forEach((x) => x.classList.toggle("sel", x === b));
    aviso(u.backupDias ? `Aviso depois de ${u.backupDias} dias sem backup` : "Lembrete de backup desligado");
  }));
  const p = $("[data-permitir]", el);
  if (p) p.onclick = async () => { const r = await Notification.requestPermission(); fechar(); if (r === "granted") { aviso("Pronto! Você vai receber os avisos."); registrarAvisoPeriodico(); } };
  $("[data-ok]", el).onclick = () => fechar();
}

/* ---------- notificações do lembrete de backup ---------- */
let timersBackup = [];
async function lerMostrados() { try { const c = await caches.open("gf-agenda"); const r = await c.match("mostrados.json"); return r ? await r.json() : []; } catch { return []; } }
async function avisarBackup(a) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if ((await lerMostrados()).includes(a.id)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(a.titulo, { body: a.corpo, tag: "gf-backup", icon: "icons/icon-192.png", data: { url: "./" } });
    const c = await caches.open("gf-agenda"); const l = await lerMostrados(); l.push(a.id);
    await c.put("mostrados.json", new Response(JSON.stringify(l.slice(-200))));
  } catch {}
}
// guarda os horários dos avisos (sem nenhum dado financeiro) e agenda os do dia
async function agendarAvisosBackup() {
  timersBackup.forEach(clearTimeout); timersBackup = [];
  const lista = [];
  const u = S.u;
  if (u && S.d && S.d.lancs.length && prazoBackup(u) && "Notification" in window && Notification.permission === "granted") {
    const agora = Date.now();
    for (let i = 0; i < 2; i++) {
      const dia = isoMais(hoje(), i), dias = diasSemBackup(u) + i;
      if (dias < prazoBackup(u) || adiadoHoje(u, dia)) continue;
      for (const h of ["09:00", "13:00", "19:00"]) {
        const at = new Date(`${dia}T${h}:00`).getTime();
        if (at > agora - 60000) lista.push({ id: `bk-${u.id}-${dia}-${h}`, at, titulo: `Faz ${dias} dias sem backup`, corpo: "Abra o Gestor de Finanças e toque em Fazer backup. Leva 5 segundos." });
      }
    }
  }
  try { const c = await caches.open("gf-agenda"); await c.put("agenda.json", new Response(JSON.stringify({ avisos: lista }), { headers: { "content-type": "application/json" } })); } catch {}
  for (const a of lista) timersBackup.push(setTimeout(() => avisarBackup(a), Math.max(0, a.at - Date.now())));
}
const isoMais = (iso, n) => { const d = dataLocal(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
async function registrarAvisoPeriodico() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!("periodicSync" in reg)) return;
    const p = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (p.state === "granted") await reg.periodicSync.register("gf-lembretes", { minInterval: 60 * 60 * 1000 });
  } catch {}
}

/* ================= FAMÍLIA DE APPS ================= */
// Os apps ficam no mesmo endereço (…github.io), cada um na sua pasta.
ICONES.target = ICONES.target || '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" /> <circle cx="12" cy="12" r="2" />';
const FAMILIA = [
  { id: "financas", nome: "Gestor de Finanças", desc: "Despesas, receitas, cartões e investimentos", url: "../gestor-financas/", cor: "#E0560B", icone: "wallet", marca: "gf_usuarios" },
  { id: "metas", nome: "Gestor de Metas", desc: "Metas do ano, afazeres do dia e compras", url: "../gestor-metas/", cor: "#3A3FBF", icone: "target", marca: "gm_dados" },
];
const ESTE_APP = "financas";
const usaApp = (a) => { try { return !!localStorage.getItem(a.marca); } catch { return false; } };
function cartaoFamilia() {
  const outro = FAMILIA.find((a) => a.id !== ESTE_APP && !usaApp(a));
  let dispensado = false; try { dispensado = !!outro && localStorage.getItem("gf_sem_familia_" + outro.id) === "1"; } catch {}
  if (!outro || dispensado) return "";
  return `<div class="lembrete"><span class="bola cor" style="--cc:${outro.cor};width:38px;height:38px">${ic(outro.icone)}</span><div><b>Novo na família: ${outro.nome}</b><small>${outro.desc}. Instale também e use junto com este.</small>
    <div class="lembrete-bt"><a href="${outro.url}">Conhecer</a><button data-x-familia="${outro.id}">Agora não</button></div></div></div>`;
}
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-x-familia]");
  if (!x) return;
  e.stopPropagation();
  try { localStorage.setItem("gf_sem_familia_" + x.dataset.xFamilia, "1"); } catch {}
  x.closest(".lembrete").remove();
}, true);
const secaoFamilia = () => `<section class="secao"><h2>Apps da família</h2><div class="cartao-box">
  ${FAMILIA.map((a) => a.id === ESTE_APP
    ? `<div class="linha-opc"><span class="bola cor" style="--cc:${a.cor}">${ic(a.icone)}</span><span class="meio">${a.nome}<small>${a.desc}</small></span><small style="color:var(--cinza);font-weight:600">Este app</small></div>`
    : `<a class="linha-opc" href="${a.url}" style="color:inherit;text-decoration:none"><span class="bola cor" style="--cc:${a.cor}">${ic(a.icone)}</span><span class="meio">${a.nome}<small>${a.desc}</small></span><span class="seta">${ic("chevron-right")}</span></a>`).join("")}
</div></section>`;

// Ordem da lista do Início: "lanc" (últimos lançados primeiro, padrão) ou "dia" (agrupado por data)
const ordemInicio = () => { try { return localStorage.getItem("gf_ordem_inicio") || "lanc"; } catch { return "lanc"; } };
// Momento em que o lançamento foi criado: o id começa com Date.now() em base 36
const quandoLancado = (l) => parseInt(String(l.id).slice(0, 8), 36) || 0;

function itemLanc(l, comData) {
  if (l.prog && ehInvest(l.tipo)) return itemReceb(l, comData);
  let icone, titulo, sub = "", sinal, cor = null;
  const partes = comData === true ? [dataCurta(l.data)] : [];
  if (ehInvest(l.tipo)) {
    const i = invest(l.inv);
    icone = i.icone; cor = corInv(i); sinal = l.tipo === "rend" ? (l.perda ? "- " : "+ ") : l.tipo === "aplic" ? "- " : "+ ";
    titulo = l.nota || (l.tipo === "aplic" ? `Aplicação · ${i.nome}` : l.tipo === "resg" ? `Resgate · ${i.nome}` : `${l.perda ? "Perda" : "Rendimento"} · ${i.nome}`);
    partes.push(l.tipo === "aplic" ? (l.conta ? `${esc(conta(l.conta).nome)} → ${esc(i.nome)}` : `Já investido antes → ${esc(i.nome)}`) : l.tipo === "resg" ? `${esc(i.nome)} → ${esc(conta(l.conta).nome)}` : "Investimento");
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
    if (l.cartao) {
      const fm = faturaDoLanc(l), paga = infoFatura(l.cartao, fm).falta === 0;
      partes.push(`${ic("credit-card")}${esc(cartao(l.cartao).nome)} · fat. ${MES3[Number(fm.slice(5)) - 1].replace(".", "")}${paga ? " ✓" : ""}`);
    }
    else if (l.conta && ehBenef(S.d.contas.find((x) => x.id === l.conta))) partes.push(`${ic("ticket")}${esc(conta(l.conta).nome)}`);
    if (l.parc) partes.push(`${l.parc.n}/${l.parc.t}`);
    if (l.fixo) partes.push(`${ic("repeat")}Fixo`);
  }
  sub = partes.join(" · ");
  return `<button class="item" data-lanc="${l.id}">${bola(icone, cor)}
    <span class="meio"><div>${esc(titulo)}</div>${sub ? `<small>${sub}</small>` : ""}</span>
    <span class="val num">${sinal}${fmt(l.valor)}</span></button>`;
}

ligar.inicio = () => {
  centralizarMeses();
  document.querySelectorAll("[data-mesch]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.mesch === S.mes) { const m = await escolherMes(S.mes); if (m) { S.mes = m; desenhar(); } return; }
    S.mes = b.dataset.mesch; desenhar();
  }));
  $("[data-busca]").onclick = abrirBusca;
  document.querySelectorAll("[data-irrel]").forEach((b) => (b.onclick = () => { S.aba = "relatorios"; S.rf = { per: { t: "mes", ym: S.mes }, rel: "es", det: b.dataset.irrel === "benef" ? "benef" : "" }; guardarFiltro(); desenhar(); scrollTo(0, 0); }));
  const ai = $(".atalhos [data-abririnv]"); if (ai) ai.onclick = abrirInvestimentos;
  const fm = $(".atalhos [data-fatmes]"); if (fm) fm.onclick = () => abrirFaturasMes(S.mes);
  document.querySelectorAll(".topo-n [data-consid]").forEach((b) => (b.onclick = () => { const [t, q] = b.dataset.consid.split("|"); verConsiderado(t, q, S.mes); }));
  $("#lista").onclick = (e) => {
    const oi = e.target.closest("[data-ordini]");
    if (oi) { try { localStorage.setItem("gf_ordem_inicio", oi.dataset.ordini); } catch {} return desenhar(); }
    const po = e.target.closest("[data-progok]");
    if (po) { const [iv, pl, pm] = po.dataset.progok.split("|"); return confirmarProg(iv, pl, pm || S.mes); }
    const ok = e.target.closest("[data-confirmar]");
    if (ok) return confirmarFixoRapido(ok.dataset.confirmar, S.mes);
    const pg = e.target.closest("[data-pagar]");
    if (pg) return pagarFatura(pg.dataset.pagar, S.mes);
    const vf = e.target.closest("[data-verfat]");
    if (vf) return verFaturas(vf.dataset.verfat, S.mes);
    const fx = e.target.closest("[data-fixo]");
    if (fx) return abrirEditor(null, { fixo: fixoPorId(fx.dataset.fixo), ym: S.mes });
    const b = e.target.closest("[data-lanc]"); if (b) abrirLanc(b.dataset.lanc);
  };
  const bkF = $("[data-bk-fazer]"); if (bkF) bkF.onclick = salvarBackup;
  const bkA = $("[data-bk-adiar]"); if (bkA) bkA.onclick = () => { S.u.adiouBackup = hoje(); gravarUsuario(S.u); desenhar(); aviso("Lembro de novo amanhã."); };
  const bkN = $("[data-bk-nunca]"); if (bkN) bkN.onclick = () => { S.u.backupDias = 0; gravarUsuario(S.u); desenhar(); aviso("Não vou mais lembrar. Dá para religar em Perfil → Lembrete de backup."); };
  const bi = $("[data-instalar]"); if (bi) bi.onclick = instalarApp;
};

function abrirLanc(id) {
  const l = S.d.lancs.find((x) => x.id === id);
  if (!l) return;
  if (l.prog && ehInvest(l.tipo)) return abrirReceb(l);
  if (l.tipo === "fatura") return pagarFatura(l.cartao, l.fatura, l);
  abrirEditor(l);
}

/* ----- Gráficos ----- */
const CORES = ["#111111", "#E0560B", "#8A8A8A", "#F5A372", "#D0D0D0"];
// cores do anel no topo escuro (as categorias com cor própria usam a delas)
const CORES_NOITE = ["#FFFFFF", "#34D399", "#F5B94B", "#F59E9E", "#A5B4FC"];
function telaGraficos() {
  if (S.graf.tipo === "invest") return telaGrafInv();
  const g = S.graf, ant = somaMes(g.mes, -1);
  const ordem = gastosPorCat(g.mes, g.tipo), antes = Object.fromEntries(gastosPorCat(ant, g.tipo).map((x) => [x.id, x.v]));
  const total = ordem.reduce((t, x) => t + x.v, 0);
  const fatias = ordem.slice(0, 4).map((x) => ({ nome: cat(x.id).nome, v: x.v, cor: cat(x.id).cor }));
  const resto = ordem.slice(4).reduce((s, x) => s + x.v, 0);
  if (resto) fatias.push({ nome: "Outros", v: resto });
  const pctTxt = (v) => (total ? Math.round((v / total) * 100) : 0) + "%";
  let rosca = "";
  if (total) {
    const R = 70, C = 2 * Math.PI * R; let acum = 0;
    rosca = fatias.map((f, i) => {
      const frac = f.v / total;
      const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${f.cor || CORES_NOITE[i]}" stroke-width="30"
        stroke-dasharray="${Math.max(0, frac * C - (fatias.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-acum * C}" transform="rotate(-90 100 100)"/>`;
      acum += frac; return seg;
    }).join("");
  }
  const varia = (id, v) => {
    const a = antes[id];
    if (!a) return `<small class="var nova">novo</small>`;
    const p = Math.round(((v - a) / a) * 100);
    if (p === 0) return `<small class="var">= igual</small>`;
    const ruim = g.tipo === "despesa" ? p > 0 : p < 0;
    return `<small class="var ${ruim ? "ruim" : "bom"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)}%</small>`;
  };
  const tot = fmt(total);
  return `<header class="topo-n graf-topo"><div class="tn-linha"><div class="ola">Para onde foi o dinheiro<b>Gráficos</b></div></div>
      ${faixaMeses(g.mes, "data-gm")}
      ${total ? `<div class="g-rosca"><svg viewBox="0 0 200 200"><circle r="70" cx="100" cy="100" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="30"/>${rosca}
        <text x="100" y="${tot.length > 9 ? 104 : 106}" text-anchor="middle" font-size="${tot.length > 9 ? 19 : 23}" font-weight="700" fill="#fff">${tot}</text>
        <text x="100" y="${tot.length > 9 ? 124 : 127}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,.65)">${g.tipo === "despesa" ? "despesas" : "receitas"}</text></svg>
        <div class="g-leg">${fatias.map((f, i) => `<div><i style="background:${f.cor || CORES_NOITE[i]}"></i><span>${esc(f.nome)}</span><b>${pctTxt(f.v)}</b></div>`).join("")}</div></div>`
        : `<p class="g-vazio">Nenhuma ${g.tipo === "despesa" ? "despesa" : "receita"} em ${nomeMes(g.mes)}.</p>`}
      ${chipsGraf(g.tipo)}
    </header>
    <div class="conteudo" id="grafcorpo">${ordem.length ? `<div class="box sem-pad"><h3 class="h3pad">Comparado com ${MESES[Number(ant.slice(5)) - 1]}</h3>
      ${ordem.map((x) => { const k = cat(x.id); return `<button class="g-linha" data-vercat="${x.id}">${bola(k.icone, k.cor)}<span class="mm"><span class="tt"><span>${esc(k.nome)}</span><b class="num">${fmt(x.v)}</b></span>
        <span class="g-sub"><span>${pctTxt(x.v)} do total</span>${varia(x.id, x.v)}</span></span><span class="seta">${ic("chevron-right")}</span></button>`; }).join("")}</div>` : ""}</div>`;
}
ligar.graficos = () => {
  centralizarMeses();
  document.querySelectorAll("[data-gt]").forEach((b) => (b.onclick = () => { S.graf.tipo = b.dataset.gt; desenhar(); }));
  document.querySelectorAll("[data-gm]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.gm === S.graf.mes) { const m = await escolherMes(S.graf.mes); if (m) { S.graf.mes = m; desenhar(); } return; }
    S.graf.mes = b.dataset.gm; desenhar();
  }));
  document.querySelectorAll("[data-vercat]").forEach((b) => (b.onclick = () => verCategoria(b.dataset.vercat, S.graf.mes)));
  ligarDeslizar($("#grafcorpo"), ["despesa", "receita", "invest"], () => S.graf.tipo, (t) => { S.graf.tipo = t; desenhar(); });
  document.querySelectorAll("[data-giper]").forEach((b) => (b.onclick = () => { S.graf.invPer = Number(b.dataset.giper); desenhar(); }));
  document.querySelectorAll("[data-verinv]").forEach((b) => (b.onclick = () => verInvest(b.dataset.verinv)));
  document.querySelectorAll("#grafcorpo [data-abririnv]").forEach((b) => (b.onclick = abrirInvestimentos));
};

/* ----- Gráficos → Investimentos (estilo plataforma de investimentos) ----- */
const CORES_TIPO_INV = ["#34D399", "#F5B94B", "#A5B4FC", "#F59E9E", "#67E8F9", "#FDBA74", "#C4B5FD", "#FFFFFF"];
const chipsGraf = (tipo) => `<div class="tn-chips"><button data-gt="despesa" class="${tipo === "despesa" ? "on" : ""}">Despesas</button><button data-gt="receita" class="${tipo === "receita" ? "on" : ""}">Receitas</button><button data-gt="invest" class="${tipo === "invest" ? "on" : ""}">Investimentos</button></div>`;
function telaGrafInv() {
  const cab = `<div class="tn-linha"><div class="ola">Para onde foi o dinheiro<b>Gráficos</b></div></div>${chipsGraf("invest")}`;
  if (!S.d.invest.length) return `<header class="topo-n graf-topo">${cab}<p class="g-vazio">Você ainda não cadastrou investimentos.</p><div style="height:6px"></div></header>
    <div class="conteudo" id="grafcorpo"><div class="box sem-pad"><button class="linha-opc" data-abririnv><span class="bola">${ic("plus")}</span><span class="meio">Começar a acompanhar investimentos<small>Cadastre poupança, CDB, Tesouro… e veja a evolução aqui.</small></span></button></div></div>`;
  const atual = mesAtual(), nMeses = S.graf.invPer || 12;
  // primeiro mês com dado de investimento
  const prim = [atual, ...S.d.lancs.filter((l) => ehInvest(l.tipo)).map((l) => l.data.slice(0, 7)), ...(S.u.criadoEm ? [S.u.criadoEm.slice(0, 7)] : [])].reduce((a, b) => (b < a ? b : a));
  let ini = nMeses === 99 ? prim : somaMes(atual, -(nMeses - 1));
  if (ini < prim) ini = prim;
  const meses = []; for (let m = ini; m <= atual; m = somaMes(m, 1)) meses.push(m);
  const serie = meses.map((m) => ({ m, v: totalInvestido(fimDoMes(m)) }));
  const agora = totalInvestido(), antes = totalInvestido(diaAntes(`${meses[0]}-01`)), cresc = agora - antes;
  // linha com área
  const W = 340, H = 120, vs = serie.map((x) => x.v), mn = Math.min(...vs, antes), mx = Math.max(...vs, antes), faixa = mx - mn || Math.max(1, mx * 0.1);
  const pts = (serie.length > 1 ? serie : [{ v: antes }, ...serie]).map((x, i, a) => [a.length > 1 ? (i / (a.length - 1)) * W : W, 8 + (H - 16) * (1 - (x.v - mn) / faixa)]);
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const ult = pts[pts.length - 1];
  const rotulos = serie.length > 1 ? `<div class="gi-rot"><span>${mesCurto(meses[0])}/${meses[0].slice(2, 4)}</span><span>${mesCurto(atual)}/${atual.slice(2, 4)}</span></div>` : "";
  // por tipo
  const porTipo = {};
  for (const i of S.d.invest) { const s = saldoInv(i.id); if (s > 0) porTipo[i.tipo] = (porTipo[i.tipo] || 0) + s; }
  const tipos = Object.entries(porTipo).sort((a, b) => b[1] - a[1]), totT = tipos.reduce((t, x) => t + x[1], 0);
  let anel = "", ac = 0; const C = 2 * Math.PI * 15.9;
  tipos.forEach(([, v], i) => { const fr = v / totT; anel += `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${CORES_TIPO_INV[i % CORES_TIPO_INV.length]}" stroke-width="5.5" stroke-dasharray="${Math.max(0, fr * C - (tipos.length > 1 ? 0.6 : 0))} ${C}" stroke-dashoffset="${-ac * C}" transform="rotate(-90 21 21)"/>`; ac += fr; });
  // rendimento por mês
  const rend = meses.map((m) => ({ m, v: movsPeriodo(m).rend }));
  const mxr = Math.max(1, ...rend.map((x) => Math.abs(x.v))), totR = rend.reduce((t, x) => t + x.v, 0);
  // cada investimento
  const lista = S.d.invest.map((i) => {
    const s = saldoInv(i.id), s0 = saldoInv(i.id, diaAntes(`${meses[0]}-01`));
    let apl = 0, rd = 0;
    for (const l of S.d.lancs) if (l.inv === i.id && l.data >= `${meses[0]}-01`) { if (l.tipo === "aplic") apl += l.valor; else if (l.tipo === "rend") rd += l.perda ? -l.valor : l.valor; }
    const base = s0 + apl;
    return { i, s, rd, rp: base > 0 ? (rd / base) * 100 : 0 };
  }).sort((a, b) => b.s - a.s);
  const perTxt = nMeses === 99 ? `desde ${mesCurto(meses[0])}/${meses[0].slice(2, 4)}` : `em ${nMeses} meses`;
  const pct1 = (v) => `${v < 0 ? "−" : "+"} ${Math.abs(v).toFixed(1).replace(".", ",")}%`;
  return `<header class="topo-n graf-topo">${cab}
      <div class="gi-tit"><small>Patrimônio investido</small><div><b class="num">${fmtR(agora)}</b><span class="gi-chip ${cresc < 0 ? "neg" : ""}">${cresc < 0 ? "↓" : "↑"} ${fmtR(Math.abs(cresc))} ${perTxt}</span></div></div>
      <div class="gi-graf"><svg class="gi-linha" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="giA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#34D399" stop-opacity=".45"/><stop offset="1" stop-color="#34D399" stop-opacity="0"/></linearGradient></defs>
        <path d="${linha} L${W} ${H} L0 ${H} Z" fill="url(#giA)"/><path d="${linha}" fill="none" stroke="#34D399" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <div class="gi-ponto" style="left:calc(${(ult[0] / W) * 100}% - 6px);top:${ult[1] - 6}px"></div></div>
      ${rotulos}
      <div class="tn-chips gi-per">${[[6, "6M"], [12, "12M"], [99, "Tudo"]].map(([n, r]) => `<button data-giper="${n}" class="${n === nMeses ? "on" : ""}">${r}</button>`).join("")}</div>
    </header>
    <div class="conteudo" id="grafcorpo">
      ${tipos.length ? `<div class="box"><h3>Onde está seu dinheiro<span>por tipo</span></h3><div class="gi-aloc"><svg viewBox="0 0 42 42">${anel}
        <text x="21" y="20.6" text-anchor="middle" font-size="${fmt(totT).length > 8 ? 3.4 : 4.2}" font-weight="700" fill="#111">${fmt(totT)}</text><text x="21" y="25.6" text-anchor="middle" font-size="2.8" fill="#888">${tipos.length} tipo${tipos.length > 1 ? "s" : ""}</text></svg>
        <div class="gi-leg">${tipos.map(([n, v], i) => `<div><i style="background:${CORES_TIPO_INV[i % CORES_TIPO_INV.length]}"></i><span>${esc(n)}</span><b>${pct(v, totT)}%</b></div>`).join("")}</div></div></div>` : ""}
      <div class="box"><h3>Rendimento por mês<span>total: ${totR < 0 ? "− " : ""}${fmtR(Math.abs(totR))}</span></h3>
        ${rend.some((x) => x.v) ? `<div class="gi-rend">${rend.map((x) => `<div><i class="${x.v < 0 ? "neg" : ""} ${x.m === atual ? "at" : ""}" style="height:${(Math.abs(x.v) / mxr) * 100}%"></i><small>${MESES[Number(x.m.slice(5)) - 1].charAt(0).toUpperCase()}</small></div>`).join("")}</div>`
          : `<p class="rel-nota" style="margin:0">Lance os rendimentos de cada investimento (botão <b>Rendimento</b>) para ver quanto seu dinheiro rende por mês.</p>`}</div>
      <div class="box sem-pad"><h3 class="h3pad">Seus investimentos<span>rendeu ${perTxt}</span></h3>
        ${lista.map((x) => `<button class="g-linha" data-verinv="${x.i.id}">${bola(x.i.icone, corInv(x.i))}<span class="mm"><span class="tt"><span>${esc(x.i.nome)}</span><b class="num">${fmt(x.s)}</b></span>
          <span class="g-sub"><span>${pct(Math.max(0, x.s), agora)}% da carteira · ${esc(x.i.tipo)}</span>${x.rd ? `<small class="var ${x.rd < 0 ? "ruim" : "bom"}">${pct1(x.rp)}</small>` : ""}</span></span></button>`).join("")}</div>
      <button class="btn contorno" style="margin-top:12px" data-abririnv>Aplicar, resgatar ou lançar rendimento</button>
    </div>`;
}

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

/* ----- Enviar para IA: texto com o histórico organizado + pedido de análise ----- */
function gerarTextoIA({ de, ate, esconder }) {
  const hj = hoje(), am = mesAtual(), R = (v) => nf2.format((v || 0) / 100), L = [];
  const lancsTodos = [...S.d.lancs].sort((a, b) => a.data.localeCompare(b.data));
  const prim = lancsTodos.length ? lancsTodos[0].data.slice(0, 7) : am;
  const ini = de || prim, fim = ate || somaMes(am, 2);
  const meses = []; for (let m = ini; m <= fim; m = somaMes(m, 1)) meses.push(m);
  const nomeMesC = (ym) => `${mesCurto(ym)}/${ym.slice(2, 4)}`;
  const nInv = {}; S.d.invest.forEach((i, k) => (nInv[i.id] = esconder ? `${i.tipo || "Investimento"} ${k + 1}` : i.nome));
  const desc = (l) => (esconder ? "" : (l.nota || "").replace(/[\n;]/g, " ").trim());
  const ehCart = (cid) => temCartao(cid);
  const forma = (l) => l.cartao && ehCart(l.cartao) ? `cartão ${cartao(l.cartao).nome}` : l.conta ? (S.d.contas.find((c) => c.id === l.conta) || {}).nome || "conta" : "";
  L.push(`Você é um consultor financeiro pessoal. Abaixo estão os dados do meu app de finanças pessoais (Gestor de Finanças), gerados em ${dataCurta(hj)}/${hj.slice(0, 4)}.
${de ? `Período enviado: ${nomeMesC(ini)} a ${nomeMesC(fim)}.` : `Envio completo: todo o histórico desde ${nomeMesC(prim)} e a previsão dos próximos meses.`}

COMO LER OS DADOS
- Valores em reais (R$), formato brasileiro (1.234,56).
- "Despesas" são contadas no mês da compra. Compras no cartão de crédito entram no mês em que foram feitas; o pagamento da fatura NÃO é uma despesa nova (só tira o dinheiro da conta).
- "Fixos" são contas e receitas recorrentes (aluguel, salário, assinaturas...). Meses futuros mostram o previsto.
- Aplicações em investimentos e empréstimos que fiz NÃO são despesa: o dinheiro continua meu, guardado ou a receber.
- "Rendimento" negativo (perda) significa dinheiro que não voltou.
- Meses marcados com (previsto) ainda não aconteceram.

O QUE EU QUERO
1. Um diagnóstico claro e simples da minha situação financeira.
2. Onde estou gastando demais e o que dá para cortar, com valores.
3. Um plano prático para sobrar mais dinheiro por mês.
4. Avalie meus fixos, cartões, investimentos e empréstimos (riscos e oportunidades).
5. Aponte padrões, meses fora do normal e tendências.
6. Se faltar alguma informação, me faça perguntas antes de concluir.
`);
  // resumo geral
  const contas = S.d.contas.filter((c) => !ehBenef(c)), benefs = S.d.contas.filter(ehBenef);
  const aReceber = S.d.invest.reduce((t, i) => t + progsDe(i).reduce((s, p) => s + faltaReceber(p), 0), 0);
  const fatAberto = S.d.cartoes.reduce((t, c) => t + [am, somaMes(am, 1)].reduce((s, ym) => s + infoFatura(c.id, ym).falta, 0), 0);
  L.push(`RESUMO GERAL (hoje, ${dataCurta(hj)}/${hj.slice(0, 4)})
- Saldo em contas: ${R(contas.reduce((t, c) => t + saldoConta(c.id), 0))}${contas.length > 1 ? ` (${contas.map((c) => `${c.nome}: ${R(saldoConta(c.id))}`).join("; ")})` : ""}
${benefs.length ? `- Benefícios (VA/VR): ${R(benefs.reduce((t, c) => t + saldoConta(c.id), 0))}\n` : ""}- Investido (inclui empréstimos a receber): ${R(totalInvestido())}
- Patrimônio (contas + investimentos): ${R(patrimonio())}
- Ainda a receber de planos/empréstimos: ${R(aReceber)}
- Faturas de cartão em aberto (este mês e o próximo): ${R(fatAberto)}
`);
  // mês a mês
  while (meses.length > 1 && meses[0] < am && !resumoMes(meses[0]).rec && !resumoMes(meses[0]).des) meses.shift();
  const linhaM = meses.map((m) => { const r = resumoMes(m), fd = totFixos(m, "despesa"), fr = totFixos(m, "receita");
    return `${nomeMesC(m)}${m > am ? " (previsto)" : m === am ? " (atual)" : ""}; ${R(r.rec)}; ${R(r.des)}; ${R(fd)}; ${R(fr)}; ${R(r.rec - r.des)}`; });
  L.push(`MÊS A MÊS (mês; receitas; despesas; despesas fixas; receitas fixas; resultado)\n${linhaM.join("\n")}\n`);
  // categorias
  const reais = meses.filter((m) => m <= am), cats = {};
  for (const l of S.d.lancs) if (l.tipo === "despesa" && reais.includes(l.data.slice(0, 7))) (cats[l.cat] ||= {})[l.data.slice(0, 7)] = ((cats[l.cat] || {})[l.data.slice(0, 7)] || 0) + l.valor;
  const ult3 = reais.slice(-3), ant3 = reais.slice(-6, -3);
  const catLin = Object.entries(cats).map(([id, pm]) => { const tot = Object.values(pm).reduce((t, v) => t + v, 0); const a = ult3.reduce((t, m) => t + (pm[m] || 0), 0) / Math.max(1, ult3.length), b = ant3.reduce((t, m) => t + (pm[m] || 0), 0) / Math.max(1, ant3.length);
    const tend = !ant3.length || !b ? "sem comparação" : Math.abs(a - b) / b < 0.05 ? "estável" : `${a > b ? "subindo" : "caindo"} ${Math.round((Math.abs(a - b) / b) * 100)}%`;
    return { t: `- ${cat(id).nome}: total ${R(tot)} · média ${R(tot / Math.max(1, reais.length))}/mês · últimos 3 meses ${tend}`, tot }; }).sort((x, y) => y.tot - x.tot);
  if (catLin.length) L.push(`DESPESAS POR CATEGORIA (de ${nomeMesC(reais[0])} a ${nomeMesC(reais[reais.length - 1])})\n${catLin.map((x) => x.t).join("\n")}\n`);
  // fixos
  if (S.d.fixos.length) L.push(`FIXOS / RECORRENTES (valor atual; o que mudou nos últimos 3 meses)\n${S.d.fixos.filter((f) => !f.fim || f.fim > am).map((f) => {
    const a = valorFixoMes(f, somaMes(am, -3)), b = valorFixoMes(f, am), nome = esconder ? cat(f.cat).nome : f.nota || cat(f.cat).nome;
    return `- ${f.tipo === "despesa" ? "Despesa" : "Receita"}: ${nome} · ${R(f.valor)} · todo dia ${f.dia}${f.cartao && ehCart(f.cartao) ? ` · no cartão ${cartao(f.cartao).nome}` : ""}${a && b && a.v !== b.v ? ` · era ${R(a.v)} há 3 meses` : ""}`; }).join("\n")}\n`);
  // cartões
  if (S.d.cartoes.length) L.push(`CARTÕES DE CRÉDITO\n${S.d.cartoes.map((c) => {
    const fs = Array.from({ length: 9 }, (_, k) => somaMes(am, k - 5)).map((ym) => { const f = infoFatura(c.id, ym); return f.total ? `${nomeMesC(ym)} ${R(f.total)}${ym > am ? " (prevista)" : f.falta ? " (falta pagar " + R(f.falta) + ")" : " (paga)"}` : ""; }).filter(Boolean);
    const parc = S.d.lancs.filter((l) => l.tipo === "despesa" && l.cartao === c.id && l.parc && faturaDoLanc(l) > am).reduce((t, l) => t + l.valor, 0);
    return `- ${c.nome} (fecha dia ${c.fechamento}, vence dia ${c.vencimento})\n  Faturas: ${fs.join(" · ") || "sem compras"}${parc ? `\n  Parcelas que ainda vão cair em faturas futuras: ${R(parc)}` : ""}`; }).join("\n")}\n`);
  // investimentos e empréstimos
  if (S.d.invest.length) {
    const ivs = S.d.invest.map((i) => {
      let rend = 0, apl = 0, res = 0;
      for (const l of S.d.lancs) if (l.inv === i.id && l.data >= `${ini}-01`) { if (l.tipo === "rend") rend += l.perda ? -l.valor : l.valor; else if (l.tipo === "aplic") apl += l.valor; else if (l.tipo === "resg") res += l.valor; }
      const planos = progsDe(i).filter((p) => !p.fim && faltaReceber(p) > 0).map((p) => `${p.acordo ? "acordo " : ""}${p.modo === "venc" ? `vencimento em ${dataCurta(p.data)}/${p.data.slice(2, 4)}: ${R(p.valor)}` : `${p.vals ? descrVals(p.vals) : `${p.n}x ${R(p.valor)}`}, faltam ${progFaltam(p).length} (${R(faltaReceber(p))})`}`);
      const perdas = progsDe(i).filter((p) => p.fim && (p.fim.motivo === "perda")).length;
      return `- ${nInv[i.id]} (${i.tipo || "investimento"}): saldo ${R(saldoInv(i.id))} · no período aplicou ${R(apl)}, resgatou ${R(res)}, rendeu ${R(rend)}${planos.length ? `\n  A receber: ${planos.join(" | ")}` : ""}${perdas ? `\n  ${perdas} plano(s) encerrado(s) como "não vou receber"` : ""}`; });
    L.push(`INVESTIMENTOS E EMPRÉSTIMOS\n${ivs.join("\n")}\n`);
  }
  // próximos meses
  const prox = [somaMes(am, 1), somaMes(am, 2), somaMes(am, 3)].map((ym) => { const r = resumoMes(ym), rec = progAReceber(ym).reduce((t, x) => t + x.valor, 0);
    const fat = S.d.cartoes.reduce((t, c) => t + infoFatura(c.id, ym).total, 0);
    return `- ${nomeMesC(ym)}: receitas previstas ${R(r.rec)} (inclui ${R(rec)} de recebimentos programados) · despesas previstas ${R(r.des)} · faturas que vencem ${R(fat)}`; });
  L.push(`PRÓXIMOS MESES (previsão com o que já está cadastrado)\n${prox.join("\n")}\n`);
  // lançamentos
  const nomeTipo = { despesa: "despesa", receita: "receita", transf: "transferência", fatura: "pagamento de fatura", aplic: "aplicação", resg: "resgate", rend: "rendimento" };
  let lan = lancsTodos.filter((l) => l.data.slice(0, 7) >= ini && l.data.slice(0, 7) <= fim), nota = "";
  if (lan.length > 2500) { const corte = somaMes(am, -11); lan = lan.filter((l) => l.data.slice(0, 7) >= corte); nota = ` (só os últimos 12 meses; os anteriores estão resumidos acima)`; }
  L.push(`LANÇAMENTOS${nota} — data; tipo; categoria; valor; conta/cartão; ${esconder ? "" : "descrição"}\n${lan.map((l) => {
    const c = l.cat ? cat(l.cat).nome : l.inv ? nInv[l.inv] || "" : "";
    const v = l.tipo === "rend" && l.perda ? -l.valor : l.valor;
    return `${l.data}; ${nomeTipo[l.tipo] || l.tipo}${l.parc ? ` ${l.parc.n}/${l.parc.t}` : ""}${l.tipo === "rend" && l.perda ? " (perda)" : ""}; ${c}; ${R(v)}; ${forma(l)}${esconder ? "" : "; " + desc(l)}`; }).join("\n")}`);
  return L.join("\n");
}

function abrirEnviarIA() {
  let tudo = true, esconder = true, de = somaMes(mesAtual(), -5), ate = mesAtual();
  const el = abrirCamada(`<div data-iac></div>`);
  const pintar = () => {
    const prim = S.d.lancs.reduce((m, l) => (l.data < m ? l.data : m), hoje()).slice(0, 7);
    $("[data-iac]", el).innerHTML = `<div class="ia-cab"><span class="ia-ic">${ic("sparkles")}</span><div><b>Peça uma análise para a sua IA</b><small>Envia todo o seu histórico, já organizado, para o ChatGPT, Claude ou Gemini.</small></div></div>
      <div class="seg3"><button data-tudo="1" class="${tudo ? "on" : ""}">Tudo (completo)</button><button data-tudo="0" class="${tudo ? "" : "on"}">Só um período</button></div>
      ${tudo ? "" : `<div class="dois"><label>De<input type="month" name="de" value="${de}"></label><label>Até<input type="month" name="ate" value="${ate}"></label></div>`}
      <div class="inc">${["Resumo geral e patrimônio", tudo ? `Mês a mês desde ${mesCurto(prim)}/${prim.slice(2, 4)}` : "Mês a mês do período", "Categorias, fixos e cartões", "Investimentos e empréstimos", "Previsão dos próximos meses", "Lançamentos detalhados"].map((t) => `<div>${ic("check")}<span>${t}</span></div>`).join("")}</div>
      <label class="tog"><span><b>Esconder nomes e descrições</b><small>Troca nomes de pessoas e descrições por “Empréstimo 1”, só a categoria etc.</small></span><input type="checkbox" data-esc ${esconder ? "checked" : ""}><i class="sw"></i></label>
      <p class="aviso-ia">${ic("eye-off")}<span>Os dados saem do seu celular quando você envia para a IA.</span></p>
      <div class="bts2"><button class="btn contorno" data-copiar>${ic("list")}Copiar texto</button><button class="btn preto" data-enviar>${ic("share-2")}Enviar para app</button></div>`;
    el.querySelectorAll("[data-tudo]").forEach((b) => (b.onclick = () => { tudo = b.dataset.tudo === "1"; pintar(); }));
    const fd = $("input[name=de]", el), fa = $("input[name=ate]", el);
    if (fd) fd.onchange = () => { de = fd.value || de; if (de > ate) ate = de; pintar(); };
    if (fa) fa.onchange = () => { ate = fa.value || ate; if (ate < de) de = ate; pintar(); };
    $("[data-esc]", el).onchange = (e) => { esconder = e.target.checked; };
    const texto = () => gerarTextoIA(tudo ? { esconder } : { de, ate, esconder });
    $("[data-copiar]", el).onclick = async () => {
      const t = texto();
      try { await navigator.clipboard.writeText(t); }
      catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      aviso(t.length > 60000 ? "Copiado! O texto é grande: se a IA cortar, use “Enviar para app” (vai como arquivo)." : "Copiado! Agora é só colar na sua IA.");
    };
    $("[data-enviar]", el).onclick = async () => {
      const t = texto(), nome = `financas-para-ia-${hoje()}.txt`;
      const arq = new File([t], nome, { type: "text/plain" });
      try {
        if (t.length > 20000 && navigator.canShare && navigator.canShare({ files: [arq] })) return await navigator.share({ files: [arq], title: "Minhas finanças", text: "Analise minhas finanças (dados no arquivo)." });
        if (navigator.share) return await navigator.share({ title: "Minhas finanças", text: t });
      } catch (e) { if (e && e.name === "AbortError") return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(arq); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      aviso("Arquivo salvo. Anexe ele na sua IA.");
    };
  };
  pintar();
}

/* ----- Relatórios com 3 filtros: Período · Relatório · Detalhe ----- */
function gastosPorCat(ym, tipo = "despesa") {
  const o = {};
  for (const l of S.d.lancs) if (l.tipo === tipo && l.data.startsWith(ym)) o[l.cat] = (o[l.cat] || 0) + l.valor;
  return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, v }));
}
const kpi = (rot, v, sub, cls = "") => `<div class="kp"><small>${rot}</small><b class="num">${v}</b>${sub ? `<em class="${cls}">${sub}</em>` : ""}</div>`;
const RELS = [
  ["gastos", "Gastos", "receipt", "O que você comprou, pela data da compra"],
  ["es", "Entrou e saiu", "arrow-left-right", "O que mexeu no saldo das contas"],
  ["cartoes", "Cartões", "credit-card", "Faturas, compras e parcelas de cada cartão"],
  ["inv", "Investimentos", "piggy-bank", "Aplicações, resgates e rendimentos"],
  ["comp", "Comparar meses", "chart-line", "Receitas x despesas, mês a mês"],
];
const relInfo = (k) => RELS.find((r) => r[0] === k) || RELS[0];
const filtroPadrao = () => ({ per: { t: "mes", ym: mesAtual() }, rel: "gastos", det: "" });
function filtroRel() {
  if (!S.rf) { try { S.rf = JSON.parse(localStorage.getItem("gf_rel_filtro")) || filtroPadrao(); } catch { S.rf = filtroPadrao(); } }
  if (!S.rf.per || !S.rf.rel) S.rf = filtroPadrao();
  return S.rf;
}
const guardarFiltro = () => { try { localStorage.setItem("gf_rel_filtro", JSON.stringify(S.rf)); } catch {} };
const ultimoDia = (ym) => { const [a, m] = ym.split("-").map(Number); return `${ym}-${p2(new Date(a, m, 0).getDate())}`; };
const diaAntes = (iso) => { const d = dataLocal(iso); d.setDate(d.getDate() - 1); return isoDe(d); };
function isoDe(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
// período → datas, meses, rótulo e o período anterior (para comparar)
function infoPer(p) {
  if (p.t === "ano") {
    const meses = Array.from({ length: 12 }, (_, i) => `${p.ano}-${p2(i + 1)}`);
    return { de: `${p.ano}-01-01`, ate: `${p.ano}-12-31`, meses, rot: String(p.ano), curto: String(p.ano), ant: { t: "ano", ano: p.ano - 1 }, antRot: String(p.ano - 1) };
  }
  if (p.t === "ult") {
    const fim = mesAtual(), meses = Array.from({ length: p.n }, (_, i) => somaMes(fim, i - p.n + 1));
    return { de: `${meses[0]}-01`, ate: ultimoDia(fim), meses, rot: `Últimos ${p.n} meses`, curto: `${p.n} meses`, ant: null };
  }
  if (p.t === "int") {
    const meses = []; for (let m = p.de.slice(0, 7); m <= p.ate.slice(0, 7); m = somaMes(m, 1)) meses.push(m);
    return { de: p.de, ate: p.ate, meses, rot: `${dataCurta(p.de)} a ${dataCurta(p.ate)}`, curto: `${dataCurta(p.de)}–${dataCurta(p.ate)}`, ant: null, int: true };
  }
  const nm = MESES[Number(p.ym.slice(5)) - 1];
  return { de: `${p.ym}-01`, ate: ultimoDia(p.ym), meses: [p.ym], rot: `${nm.charAt(0).toUpperCase() + nm.slice(1)} ${p.ym.slice(0, 4)}`, curto: nomeMes(p.ym),
    ant: { t: "mes", ym: somaMes(p.ym, -1) }, antRot: MESES[Number(somaMes(p.ym, -1).slice(5)) - 1], mes: p.ym };
}
const naFaixa = (l, P) => l.data >= P.de && l.data <= P.ate;
const somaV = (a) => a.reduce((t, x) => t + x.valor, 0);
const pct = (v, t) => (t ? Math.round((v / t) * 100) : 0);
const variacao = (v, a, ruimSeSobe = true) => {
  if (!a) return v ? `<small class="var nova">novo</small>` : "";
  const p = Math.round(((v - a) / a) * 100);
  if (!p) return `<small class="var">= igual</small>`;
  return `<small class="var ${(p > 0) === ruimSeSobe ? "ruim" : "bom"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)}%</small>`;
};
const linhaBarra = (attr, icone, cor, nome, v, max, sub = "", corBarra = "") => `<button class="cl" ${attr}>${bola(icone, cor)}<span class="mm"><span class="tt"><span>${esc(nome)}</span><b class="num">${fmt(v)}</b></span>
  ${sub ? `<span class="g-sub">${sub}</span>` : ""}<span class="br"><i style="width:${max ? Math.max(1, (v / max) * 100) : 0}%${corBarra ? `;background:${corBarra}` : cor ? `;background:${cor}` : ""}"></i></span></span></button>`;
const linhaValor = (rot, v, cls = "", sub = "") => `<div class="rl"><span>${rot}${sub ? `<small>${sub}</small>` : ""}</span><b class="num ${cls}">${v}</b></div>`;
// Folha com uma lista de lançamentos
function verLista(titulo, lancs, sub, semTotal) {
  const ord = [...lancs].sort((a, b) => b.data.localeCompare(a.data));
  const el = abrirCamada(`<h2>${esc(titulo)}</h2>${sub ? `<p style="text-align:center;color:#777;margin:-6px 0 6px;font-size:14px">${sub}</p>` : ""}
    ${semTotal ? `<div style="margin-bottom:8px"></div>` : `<div style="text-align:center;font-size:26px;font-weight:700;margin-bottom:10px" class="num">${fmtR(somaV(ord))}</div>`}
    <div style="margin:0 -18px">${ord.map((l) => itemLanc(l, true)).join("") || `<p class="vazio">Nada aqui.</p>`}</div>`);
  el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => trocarCamada(() => abrirLanc(b.dataset.lanc))));
}

/* --- 1. Gastos (data da compra) --- */
function dadosGastos(P, det) {
  const hj = hoje(), jaFoi = criarJaFoi(hj);
  const passa = (x) => !det ? true : det.startsWith("cat:") ? x.cat === det.slice(4) : det === "cartao" ? temCartao(x.cartao) : !temCartao(x.cartao);
  const itens = S.d.lancs.filter((l) => l.tipo === "despesa" && naFaixa(l, P) && passa(l));
  const fixos = P.int ? [] : P.meses.flatMap((ym) => fixosPendentes(ym).filter((f) => f.tipo === "despesa" && passa(f)).map((f) => ({ ...f, ym, data: dataFixo(f, ym) })));
  let pago = 0, aPagar = 0, cart = 0;
  for (const l of itens) { if (jaFoi(l)) pago += l.valor; else if (vaiPraFaturaSeguinte(l, l.data.slice(0, 7))) cart += l.valor; else aPagar += l.valor; }
  for (const f of fixos) { if (fixoNaFaturaSeguinte(f, f.ym)) cart += f.valor; else aPagar += f.valor; }
  return { itens, fixos, total: pago + aPagar + cart, pago, aPagar, cart };
}
function relGastos(P, det) {
  const g = dadosGastos(P, det), ga = P.ant ? dadosGastos(infoPer(P.ant), det) : null;
  const k = `<div class="kps">${kpi(P.mes ? "Gasto no mês" : "Gasto", fmt(g.total), ga ? (ga.total ? `${g.total >= ga.total ? "↑" : "↓"} ${Math.abs(Math.round(((g.total - ga.total) / ga.total) * 100))}% vs ${P.antRot.slice(0, 3)}.` : "") : "", ga && g.total > ga.total ? "verm" : "verde")}
    ${kpi("Pago", fmt(g.pago), `${pct(g.pago, g.total)}% do total`, "verde")}
    ${kpi("A pagar", fmt(g.aPagar), g.cart ? `+ ${fmt(g.cart)} fat. seg.` : "", "amarelo")}</div>`;
  let corpo = "";
  if (det.startsWith("cat:")) {
    const todos = [...g.itens].sort((a, b) => b.data.localeCompare(a.data));
    corpo += `<div class="box sem-pad"><h3 class="h3pad">Lançamentos<span>${todos.length}</span></h3><div class="lista-rel">${todos.map((l) => itemLanc(l, true)).join("") || `<p class="vazio">Nenhum gasto nessa categoria.</p>`}</div></div>`;
  } else {
    const por = {}; for (const l of g.itens) por[l.cat] = (por[l.cat] || 0) + l.valor;
    const porA = {}; if (ga) for (const l of ga.itens) porA[l.cat] = (porA[l.cat] || 0) + l.valor;
    const ord = Object.entries(por).sort((a, b) => b[1] - a[1]), tot = ord.reduce((t, x) => t + x[1], 0), max = ord.length ? ord[0][1] : 1;
    corpo += `<div class="box"><h3>Por categoria${ga ? `<span>vs ${P.antRot}</span>` : ""}</h3>${ord.map(([id, v]) => { const c = cat(id);
      return linhaBarra(`data-det="cat:${id}"`, c.icone, c.cor, c.nome, v, max, `<span>${pct(v, tot)}% do total</span>${ga ? variacao(v, porA[id]) : ""}`); }).join("") || `<p class="vazio">Nenhum gasto no período.</p>`}</div>`;
    if (!det) {
      const cartao = g.itens.filter((l) => temCartao(l.cartao)), ben = g.itens.filter((l) => !temCartao(l.cartao) && l.conta && ehBenef(S.d.contas.find((c) => c.id === l.conta)));
      const vista = g.itens.filter((l) => !cartao.includes(l) && !ben.includes(l)), mx = Math.max(somaV(cartao), somaV(vista), somaV(ben), 1);
      corpo += `<div class="box"><h3>Como foi pago</h3>${linhaBarra('data-det="cartao"', "credit-card", "", "No cartão de crédito", somaV(cartao), mx)}
        ${linhaBarra('data-det="vista"', "arrow-left-right", "", "Débito / Pix / dinheiro", somaV(vista), mx)}${ben.length ? linhaBarra('data-lista="ben"', "ticket", "", "Benefícios (VA/VR)", somaV(ben), mx) : ""}</div>`;
      relGastos.ben = ben;
    }
    if (g.fixos.length) corpo += `<div class="box"><h3>Fixos ainda não confirmados<span>${fmt(somaV(g.fixos))}</span></h3>${g.fixos.map((f) => { const c = cat(f.cat);
      return `<div class="rl"><span>${esc(f.nota || c.nome)}<small>dia ${dataCurta(f.data)}</small></span><b class="num">${fmt(f.valor)}</b></div>`; }).join("")}</div>`;
  }
  return { k, corpo };
}

/* --- 2. Entrou e saiu (pela conta) --- */
function relES(P, det) {
  const hj = hoje(), ate = P.ate > hj ? hj : P.ate;
  const contas = det === "benef" ? S.d.contas.filter(ehBenef) : det.startsWith("conta:") ? S.d.contas.filter((c) => c.id === det.slice(6)) : S.d.contas.filter((c) => !ehBenef(c));
  const ids = new Set(contas.map((c) => c.id));
  const ini = contas.reduce((t, c) => t + saldoConta(c.id, diaAntes(P.de)), 0);
  const fim = P.de > hj ? ini : contas.reduce((t, c) => t + saldoConta(c.id, ate), 0);
  const ent = { rec: [], resg: [], tr: [] }, sai = { fat: [], vista: [], aplic: [], tr: [] };
  for (const l of S.d.lancs) {
    if (l.data < P.de || l.data > ate) continue;
    if (l.tipo === "receita" && ids.has(l.conta)) ent.rec.push(l);
    else if (l.tipo === "resg" && ids.has(l.conta)) ent.resg.push(l);
    else if (l.tipo === "despesa" && !l.cartao && ids.has(l.conta)) sai.vista.push(l);
    else if (l.tipo === "fatura" && ids.has(l.conta)) sai.fat.push(l);
    else if (l.tipo === "aplic" && ids.has(l.conta)) sai.aplic.push(l);
    else if (l.tipo === "transf") { const a = ids.has(l.conta), b = ids.has(l.destino); if (a && !b) sai.tr.push(l); if (b && !a) ent.tr.push(l); }
  }
  const E = somaV(ent.rec) + somaV(ent.resg) + somaV(ent.tr), Sx = somaV(sai.fat) + somaV(sai.vista) + somaV(sai.aplic) + somaV(sai.tr);
  relES.listas = { fat: sai.fat, vista: sai.vista, aplic: sai.aplic, trs: sai.tr, resg: ent.resg, tre: ent.tr };
  const k = `<div class="kps">${kpi("Entrou", fmt(E), "na conta", "verde")}${kpi("Saiu", fmt(Sx), "da conta", "amarelo")}${kpi("Sobrou", `${E - Sx < 0 ? "− " : ""}${fmt(Math.abs(E - Sx))}`, E - Sx < 0 ? "saiu mais" : "no período", E - Sx < 0 ? "verm" : "verde")}</div>`;
  const porCartao = {}; for (const l of sai.fat) porCartao[l.cartao] = (porCartao[l.cartao] || 0) + l.valor;
  const subFat = Object.entries(porCartao).map(([c, v]) => `${esc(cartao(c).nome)} ${fmt(v)}`).join(" · ");
  const mxS = Math.max(1, somaV(sai.fat), somaV(sai.vista), somaV(sai.aplic), somaV(sai.tr));
  const recCat = {}; for (const l of ent.rec) recCat[l.cat] = (recCat[l.cat] || 0) + l.valor;
  const recOrd = Object.entries(recCat).sort((a, b) => b[1] - a[1]);
  const mxE = Math.max(1, ...recOrd.map((x) => x[1]), somaV(ent.resg), somaV(ent.tr));
  relES.recCat = ent.rec;
  let corpo = `<div class="box"><h3>Saldo ${det === "benef" ? "dos benefícios" : contas.length === 1 ? "da conta" : "das contas"}${ate < P.ate ? `<span>até hoje</span>` : ""}</h3>
      ${linhaValor(`Começou ${P.mes ? nomeMes(P.mes).split(" de ")[0] : "o período"} com`, fmt(ini))}${linhaValor("Entrou", "+ " + fmt(E), "pos")}${linhaValor("Saiu", "− " + fmt(Sx), "neg")}
      ${linhaValor(`<b>${ate < P.ate ? "Hoje está com" : "Terminou com"}</b>`, fmt(fim))}</div>
    <div class="box"><h3>Para onde saiu<span>toque para ver</span></h3>
      ${linhaBarra('data-lista="fat"', "credit-card", "", "Faturas de cartão pagas", somaV(sai.fat), mxS, subFat ? `<span>${subFat}</span>` : "")}
      ${linhaBarra('data-lista="vista"', "receipt", "", "Débito / Pix / dinheiro", somaV(sai.vista), mxS, `<span>${sai.vista.length} lançamento(s)</span>`)}
      ${sai.aplic.length ? linhaBarra('data-lista="aplic"', "piggy-bank", "", "Aplicações em investimentos", somaV(sai.aplic), mxS) : ""}
      ${sai.tr.length ? linhaBarra('data-lista="trs"', "arrow-left-right", "", "Transferências para outras contas", somaV(sai.tr), mxS) : ""}</div>
    <div class="box"><h3>De onde entrou</h3>
      ${recOrd.map(([id, v]) => { const c = cat(id); return linhaBarra(`data-listacat="${id}"`, c.icone, c.cor, c.nome, v, mxE, "", "#34D399"); }).join("")}
      ${ent.resg.length ? linhaBarra('data-lista="resg"', "trending-up", "", "Resgates de investimentos", somaV(ent.resg), mxE, "", "#34D399") : ""}
      ${ent.tr.length ? linhaBarra('data-lista="tre"', "arrow-left-right", "", "Transferências recebidas", somaV(ent.tr), mxE, "", "#34D399") : ""}
      ${!E ? `<p class="vazio" style="padding:8px">Nada entrou no período.</p>` : ""}</div>`;
  if (contas.length > 1) corpo += `<div class="box sem-pad"><h3 class="h3pad">Saldo de cada conta ${ate < P.ate ? "hoje" : `em ${dataCurta(ate)}`}</h3>${contas.map((c) => `<button class="linha-opc" data-det="conta:${c.id}"><span class="bola">${ic(icConta(c))}</span><span class="meio">${esc(c.nome)}${ehBenef(c) ? "<small>benefício</small>" : ""}</span><b class="num">${fmtR(saldoConta(c.id, ate))}</b></button>`).join("")}</div>`;
  return { k, corpo };
}

/* --- 3. Cartões --- */
function relCartoes(P, det) {
  if (!S.d.cartoes.length) return { k: "", corpo: `<p class="vazio">${ic("credit-card")}Nenhum cartão de crédito cadastrado.<br>Cadastre em Perfil → Cartões.</p>` };
  const cs = det ? S.d.cartoes.filter((c) => c.id === det) : S.d.cartoes;
  const fats = P.meses.flatMap((ym) => cs.map((c) => ({ c, ym, f: infoFatura(c.id, ym) })));
  const total = fats.reduce((t, x) => t + x.f.total, 0), pago = fats.reduce((t, x) => t + Math.min(x.f.total, x.f.quitada ? x.f.total : x.f.pago), 0), falta = fats.reduce((t, x) => t + x.f.falta, 0);
  const itens = fats.flatMap((x) => x.f.itens);
  const parcs = itens.filter((l) => l.parc).length;
  const venc = P.mes && cs.length === 1 ? `vence ${dataCurta(vencimentoData(cs[0].id, P.mes))}` : `${fats.filter((x) => x.f.total).length} fatura(s)`;
  const k = `<div class="kps">${kpi(P.mes ? `Fatura${cs.length > 1 ? "s" : ""} ${mesCurto(P.mes)}.` : "Faturas", fmt(total), venc)}
    ${kpi("Pago", fmt(pago), falta ? `falta ${fmt(falta)}` : total ? "✓ quitada" : "", falta ? "amarelo" : "verde")}${kpi("Compras", String(itens.length), parcs ? `${parcs} parcelada(s)` : "na fatura")}</div>`;
  let corpo = "";
  if (cs.length > 1) {
    const porC = cs.map((c) => { const fs = fats.filter((x) => x.c === c); return { c, t: fs.reduce((s, x) => s + x.f.total, 0), fl: fs.reduce((s, x) => s + x.f.falta, 0), n: fs.reduce((s, x) => s + x.f.itens.length, 0) }; });
    corpo += `<div class="box sem-pad"><h3 class="h3pad">Faturas ${P.mes ? `que vencem em ${nomeMes(P.mes)}` : "do período"}</h3>${porC.map((x) => `<button class="linha-opc" data-det="${x.c.id}"><span class="bola">${ic("credit-card")}</span>
      <span class="meio">${esc(x.c.nome)}<small>${P.mes ? `vence ${dataCurta(vencimentoData(x.c.id, P.mes))} · ` : ""}${x.n} compra(s)</small></span>
      <span class="fat-dir"><b class="num">${fmtR(x.t)}</b>${!x.t ? `<span class="etiqueta">Sem compras</span>` : x.fl ? `<span class="etiqueta">Falta ${fmt(x.fl)}</span>` : `<span class="etiqueta paga">Paga</span>`}</span></button>`).join("")}</div>`;
  }
  // compras uma por uma, por dia
  const ord = [...itens].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  const MOSTRA = 8;
  let html = "", ult = "";
  ord.forEach((l, i) => { if (l.data !== ult) { html += `<div class="dc${i >= MOSTRA ? " mais" : ""}">${nomeDia(l.data)}</div>`; ult = l.data; } html += `<div class="${i >= MOSTRA ? "mais" : ""}">${itemLanc(l)}</div>`; });
  corpo += `<div class="box sem-pad lista-compras"><h3 class="h3pad">Compras ${P.mes ? "da fatura" : "das faturas"}${cs.length === 1 && P.mes ? `<span>fecha dia ${cs[0].fechamento}</span>` : ""}</h3>
    ${html || `<p class="vazio">Nenhuma compra.</p>`}${ord.length > MOSTRA ? `<button class="ver-mais" data-vermais>ver as ${ord.length} compras ›</button>` : ""}</div>`;
  // por categoria
  const por = {}; for (const l of itens) por[l.cat] = (por[l.cat] || 0) + l.valor;
  const po = Object.entries(por).sort((a, b) => b[1] - a[1]);
  if (po.length) corpo += `<div class="box"><h3>Por categoria</h3>${po.slice(0, 6).map(([id, v]) => { const c = cat(id); return linhaBarra(`data-listacart="${id}"`, c.icone, c.cor, c.nome, v, po[0][1]); }).join("")}</div>`;
  relCartoes.itens = itens;
  // uso por mês (pela data da compra)
  const ref = P.mes || P.meses[P.meses.length - 1];
  const ms = P.mes ? Array.from({ length: 6 }, (_, i) => somaMes(ref, i - 5)) : P.meses;
  const uso = ms.map((m) => ({ m, v: S.d.lancs.filter((l) => l.tipo === "despesa" && cs.some((c) => c.id === l.cartao) && faturaDoLanc(l) === m).reduce((t, l) => t + l.valor, 0) }));
  const mxu = Math.max(1, ...uso.map((x) => x.v));
  corpo += `<div class="box"><h3>Valor das faturas por mês<span>${fmt(uso.reduce((t, x) => t + x.v, 0) / Math.max(1, uso.filter((x) => x.v).length))} de média</span></h3>
    <div class="grafb">${uso.map((x) => `<button class="gm ${x.m === P.mes ? "on" : ""}" data-irmes="${x.m}"><span class="p"><i class="d" style="height:${(x.v / mxu) * 100}%;width:16px"></i></span><small>${mesCurto(x.m)}</small></button>`).join("")}</div></div>`;
  // parcelas que ainda vão cair (depois deste período)
  const fimRef = P.meses[P.meses.length - 1], grupos = {};
  for (const l of S.d.lancs) if (l.tipo === "despesa" && l.parc && cs.some((c) => c.id === l.cartao) && faturaDoLanc(l) > fimRef) (grupos[l.parc.g] ||= []).push(l);
  const gs = Object.values(grupos).map((a) => a.sort((x, y) => x.data.localeCompare(y.data)));
  if (gs.length) corpo += `<div class="box"><h3>Parcelas que ainda vão cair<span>${fmt(gs.flat().reduce((t, l) => t + l.valor, 0))}</span></h3>${gs.map((a) => { const c = cat(a[0].cat), u = a[a.length - 1];
    return `<div class="rl"><span>${esc(a[0].nota || c.nome)}<small>${a.length} parcela(s) · até ${mesCurto(faturaDoLanc(u))}/${faturaDoLanc(u).slice(2, 4)}</small></span><b class="num">${fmt(a.reduce((t, l) => t + l.valor, 0))}</b></div>`; }).join("")}</div>`;
  corpo += `<button class="btn contorno" style="margin-top:12px" data-fatmes>Pagar ou ver faturas</button>`;
  return { k, corpo };
}

/* --- 4. Investimentos --- */
function relInv(P, det) {
  if (!S.d.invest.length) return { k: "", corpo: `<div class="box sem-pad"><button class="linha-opc" data-abririnv><span class="bola">${ic("plus")}</span><span class="meio">Começar a acompanhar investimentos<small>Aplicações não contam como despesa. Veja seu patrimônio crescer.</small></span></button></div>` };
  const hj = hoje(), ate = P.ate > hj ? hj : P.ate;
  const ivs = det ? S.d.invest.filter((i) => i.id === det) : S.d.invest;
  const ids = new Set(ivs.map((i) => i.id));
  const movs = S.d.lancs.filter((l) => ehInvest(l.tipo) && ids.has(l.inv) && l.data >= P.de && l.data <= ate);
  const apl = somaV(movs.filter((l) => l.tipo === "aplic")), res = somaV(movs.filter((l) => l.tipo === "resg"));
  const rend = movs.filter((l) => l.tipo === "rend").reduce((t, l) => t + (l.perda ? -l.valor : l.valor), 0);
  const ini = ivs.reduce((t, i) => t + saldoInv(i.id, diaAntes(P.de)), 0), fim = P.de > hj ? ini : ivs.reduce((t, i) => t + saldoInv(i.id, ate), 0);
  const base = ini + apl, rp = base > 0 ? (rend / base) * 100 : 0;
  const k = `<div class="kps">${kpi("Aplicou", fmt(apl))}${kpi("Resgatou", fmt(res))}${kpi("Rendeu", `${rend < 0 ? "− " : ""}${fmt(Math.abs(rend))}`, rend ? `${rend < 0 ? "−" : "+"} ${Math.abs(rp).toFixed(1).replace(".", ",")}% no período` : "", rend < 0 ? "verm" : "verde")}</div>`;
  let corpo = `<div class="box"><h3>Saldo investido${ate < P.ate ? "<span>até hoje</span>" : ""}</h3>${linhaValor(`Começou ${P.mes ? nomeMes(P.mes).split(" de ")[0] : "o período"} com`, fmt(ini))}
    ${linhaValor("Aplicou", "+ " + fmt(apl), "pos")}${linhaValor("Rendeu", (rend < 0 ? "− " : "+ ") + fmt(Math.abs(rend)), rend < 0 ? "neg" : "pos")}${linhaValor("Resgatou", "− " + fmt(res), "neg")}
    ${linhaValor(`<b>${ate < P.ate ? "Hoje está com" : "Terminou com"}</b>`, fmt(fim))}</div>`;
  const ord = [...movs].sort((a, b) => b.data.localeCompare(a.data));
  corpo += `<div class="box sem-pad"><h3 class="h3pad">Movimentações<span>${ord.length}</span></h3><div class="lista-rel">${ord.map((l) => itemLanc(l, true)).join("") || `<p class="vazio" style="padding:14px">Nenhuma movimentação no período.</p>`}</div></div>`;
  const prog = P.int ? [] : P.meses.flatMap((ym) => progAReceber(ym)).filter((x) => ids.has(x.inv.id));
  const vistos = new Set(), progU = prog.filter((x) => { const c = x.inv.id + x.p.id + x.ym; if (vistos.has(c)) return false; vistos.add(c); return true; });
  if (progU.length) corpo += `<div class="box"><h3>Recebimentos programados<span>${fmt(progU.reduce((t, x) => t + x.valor, 0))}</span></h3>${progU.map((x) => `<div class="rl"><span>${esc(x.inv.nome)}<small>${x.rot} · ${x.atrasada ? "atrasada" : `dia ${dataCurta(x.data)}`} · a receber</small></span><b class="num">${fmt(x.valor)}</b></div>`).join("")}</div>`;
  if (!det && ivs.length > 1) corpo += `<div class="box sem-pad"><h3 class="h3pad">Por investimento</h3>${ivs.map((i) => ({ i, s: saldoInv(i.id, ate) })).sort((a, b) => b.s - a.s).map((x) => `<button class="linha-opc" data-det="${x.i.id}">${bola(x.i.icone, corInv(x.i))}<span class="meio">${esc(x.i.nome)}<small>${esc(x.i.tipo)}</small></span><b class="num">${fmtR(x.s)}</b></button>`).join("")}</div>`;
  corpo += `<button class="btn contorno" style="margin-top:12px" data-abririnv>Abrir investimentos</button>`;
  return { k, corpo };
}

/* --- Fixos (recorrentes) no comparativo --- */
// Valor de um fixo num mês: o que foi confirmado; se ainda não, o valor cadastrado (previsto)
function valorFixoMes(f, ym) {
  const ls = S.d.lancs.filter((l) => l.fixo === f.id && (l.fixoMes || l.data.slice(0, 7)) === ym);
  if (ls.length) return { v: somaV(ls), st: "ok" };
  if (S.d.pulados.includes(f.id + "|" + ym)) return { v: 0, st: "pulou" };
  if (f.inicio <= ym && (!f.fim || ym < f.fim)) return { v: f.valor, st: "prev" };
  return null;
}
const totFixos = (ym, tipo) => S.d.fixos.filter((f) => f.tipo === tipo).reduce((t, f) => { const x = valorFixoMes(f, ym); return t + (x ? x.v : 0); }, 0);
function relFixos(P, meses) {
  if (!S.d.fixos.length) return { k: "", corpo: `<p class="vazio">${ic("repeat")}Nenhum lançamento fixo cadastrado.<br>Cadastre em Perfil → Lançamentos recorrentes.</p>` };
  const am = mesAtual(), ref = meses.includes(am) ? am : meses[meses.length - 1], ant = somaMes(ref, -1);
  const rf = totFixos(ref, "receita"), df = totFixos(ref, "despesa"), sobra = rf - df;
  const k = `<div class="rvd"><div><small>Receitas fixas</small><b class="num vd">${fmt(rf)}</b></div><span class="menos">−</span><div><small>Despesas fixas</small><b class="num">${fmt(df)}</b></div></div>
    <div class="sobra-fx"><span>Sobra depois dos fixos em ${mesCurto(ref)}.</span><b class="num ${sobra < 0 ? "neg" : ""}">${sobra < 0 ? "− " : ""}${fmtR(Math.abs(sobra))}</b>
      <em>${rf ? `os fixos comem ${Math.round((df / rf) * 100)}% da sua renda fixa` : "cadastre seu salário como receita fixa para ver quanto sobra"}</em></div>`;
  // gráfico: receitas fixas x despesas fixas, mês a mês
  let comecou = false;
  const serie = meses.map((m) => ({ m, r: totFixos(m, "receita"), d: totFixos(m, "despesa") }))
    .filter((x) => { if (!comecou && !x.r && !x.d) return false; comecou = true; return true; });
  const mx = Math.max(1, ...serie.map((x) => Math.max(x.r, x.d)));
  const com = serie.filter((x) => x.r || x.d), n = Math.max(1, com.length);
  const mR = com.reduce((t, x) => t + x.r, 0) / n, mD = com.reduce((t, x) => t + x.d, 0) / n;
  let corpo = `<div class="box"><h3>Receitas fixas x despesas fixas<span><i class="lg r"></i>Receitas <i class="lg d"></i>Despesas</span></h3>
    <div class="grafb">${serie.map((x) => `<button class="gm ${x.m === ref ? "on" : ""}" data-irmes="${x.m}"><span class="p"><i class="r" style="height:${(x.r / mx) * 100}%"></i><i class="d" style="height:${(x.d / mx) * 100}%"></i></span><small>${mesCurto(x.m)}</small></button>`).join("")}</div>
    <div class="med"><div><small>Média receitas fixas</small><b class="num">${fmt(mR)}</b></div><div><small>Média despesas fixas</small><b class="num">${fmt(mD)}</b></div><div><small>Média sobra</small><b class="num ${mR - mD < 0 ? "neg" : "pos"}">${mR - mD < 0 ? "− " : ""}${fmt(Math.abs(mR - mD))}</b></div></div></div>`;
  // cada fixo: mês passado → este mês
  const chip = (a, b, tipo) => {
    if (a === null) return `<span class="cv neu">novo</span>`;
    if (b === null) return `<span class="cv neu">pulou</span>`;
    if (!a) return `<span class="cv neu">${b ? "voltou" : "—"}</span>`;
    const p = Math.round(((b - a) / a) * 100);
    if (!p) return `<span class="cv neu">= igual</span>`;
    return `<span class="cv ${(p > 0) === (tipo === "despesa") ? "up" : "dn"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)}%</span>`;
  };
  const mudancas = [];
  const lista = (tipo) => {
    const linhas = [];
    for (const f of S.d.fixos.filter((x) => x.tipo === tipo)) {
      const va = valorFixoMes(f, ant), vb = valorFixoMes(f, ref);
      if (!va && !vb) continue;
      const a = va && va.st !== "pulou" ? va.v : (va ? 0 : null), b = vb && vb.st !== "pulou" ? vb.v : (vb ? 0 : null);
      const c = cat(f.cat), nome = f.nota || c.nome;
      linhas.push(`<div class="lvs"><span class="bo-l">${bola(c.icone, c.cor)}</span><span class="n">${esc(nome)}</span>
        <span class="a num">${a === null ? "—" : va.st === "pulou" ? "pulou" : fmt(a)}</span><b class="num ${vb && vb.st === "prev" ? "cinza" : ""}">${b === null ? "—" : vb.st === "pulou" ? "pulou" : fmt(b)}</b>${chip(va && va.st === "pulou" ? 0 : a, vb && vb.st === "pulou" ? null : b, tipo)}</div>`);
      // frases do "o que mais mudou"
      const A = a || 0, B = b || 0, d = B - A;
      if (va && va.st === "pulou" && B) mudancas.push({ p: B, v: `<span class="cv neu">volta</span>`, t: `${esc(nome)} voltou depois de pular ${mesCurto(ant)}.` });
      else if (!va && B) mudancas.push({ p: B, v: `<span class="cv neu">novo</span>`, t: `${esc(nome)} começou em ${mesCurto(ref)}.` });
      else if (vb && vb.st === "pulou" && A) mudancas.push({ p: A, v: `<span class="cv neu">pulou</span>`, t: `${esc(nome)} foi pulado em ${mesCurto(ref)}.` });
      else if (Math.abs(d) >= 0.01 && va && vb) {
        const bom = (d > 0) === (tipo === "receita");
        const t = tipo === "receita" ? (d > 0 ? "aumentou" : "diminuiu") : (d > 0 ? "ficou mais caro" : "veio mais baixo");
        mudancas.push({ p: Math.abs(d), v: `<span class="cv ${bom ? "dn" : "up"}">${d > 0 ? "+" : "−"} ${fmt(Math.abs(d))}</span>`, t: `${esc(nome)} ${t}.` });
      }
    }
    if (!linhas.length) return "";
    const ta = S.d.fixos.filter((x) => x.tipo === tipo).reduce((t, f) => { const v = valorFixoMes(f, ant); return t + (v ? v.v : 0); }, 0);
    const tb = totFixos(ref, tipo);
    return `<div class="box sem-pad"><h3 class="h3pad">${tipo === "despesa" ? "Despesas fixas" : "Receitas fixas"}: ${MESES[Number(ant.slice(5)) - 1]} → ${MESES[Number(ref.slice(5)) - 1]}</h3>
      <div class="cab-vs"><span></span><span></span><span>${mesCurto(ant)}</span><span>${mesCurto(ref)}</span><span></span></div>${linhas.join("")}
      <div class="lvs tot"><span></span><span class="n"><b>Total</b></span><span class="a num">${fmt(ta)}</span><b class="num">${fmt(tb)}</b>${chip(ta, tb, tipo)}</div></div>`;
  };
  corpo += lista("despesa") + lista("receita");
  const top = mudancas.sort((a, b) => b.p - a.p).slice(0, 4);
  if (top.length) corpo += `<div class="box"><h3>O que mais mudou</h3>${top.map((x) => `<div class="mud">${x.v}<span>${x.t}</span></div>`).join("")}</div>`;
  corpo += `<p class="rel-nota">Valores em <span class="cinza">cinza</span> ainda não foram confirmados (é o valor cadastrado do fixo).</p>`;
  return { k, corpo };
}

/* --- 5. Comparar meses --- */
function relComp(P, det) {
  const meses = P.mes ? Array.from({ length: 6 }, (_, i) => somaMes(P.mes, i - 5)) : P.meses;
  if (det === "fixos") return relFixos(P, meses);
  const val = (ym) => {
    if (det.startsWith("cat:")) { const v = S.d.lancs.filter((l) => l.cat === det.slice(4) && l.data.startsWith(ym) && (l.tipo === "despesa" || l.tipo === "receita")).reduce((t, l) => t + l.valor, 0); return { r: 0, d: v }; }
    const r = resumoMes(ym); return { r: det === "des" ? 0 : r.rec, d: det === "rec" ? 0 : r.des };
  };
  let comecou = false;
  const linhas = meses.map((m) => ({ m, ...val(m) })).filter((x) => { if (!comecou && !x.r && !x.d && x.m < mesAtual()) return false; comecou = true; return true; });
  const tR = linhas.reduce((t, x) => t + x.r, 0), tD = linhas.reduce((t, x) => t + x.d, 0), n = Math.max(1, linhas.filter((x) => x.r || x.d).length);
  const soCat = det.startsWith("cat:"), soD = det === "des" || soCat, soR = det === "rec";
  const k = `<div class="kps">${soD ? "" : kpi("Receitas", fmt(tR), `média ${fmt(tR / n)}`)}${soR ? "" : kpi(soCat ? cat(det.slice(4)).nome : "Despesas", fmt(tD), `média ${fmt(tD / n)}`)}
    ${soD || soR ? kpi("Meses", String(n), "com movimento") : kpi("Resultado", `${tR - tD < 0 ? "− " : ""}${fmt(Math.abs(tR - tD))}`, tR - tD < 0 ? "gastou mais" : "sobrou", tR - tD < 0 ? "verm" : "verde")}</div>`;
  const mx = Math.max(1, ...linhas.map((x) => Math.max(x.r, x.d)));
  let corpo = `<div class="box"><h3>Mês a mês<span>${soD ? "" : `<i class="lg r"></i>Receitas `}${soR ? "" : `<i class="lg d"></i>${soCat ? "Gasto" : "Despesas"}`}</span></h3>
    <div class="grafb gb-mini">${linhas.map((x) => `<button class="gm ${x.m === mesAtual() ? "on" : ""}" data-irmes="${x.m}"><span class="p">${soD ? "" : `<i class="r" style="height:${(x.r / mx) * 100}%"></i>`}${soR ? "" : `<i class="d" style="height:${(x.d / mx) * 100}%"></i>`}</span><small>${mesCurto(x.m)}</small></button>`).join("")}</div></div>
    <div class="box"><table class="ano"><tr><th>Mês</th>${soD ? "" : "<th>Receitas</th>"}${soR ? "" : `<th>${soCat ? "Gasto" : "Despesas"}</th>`}${soD || soR ? "" : "<th>Resultado</th>"}</tr>
    ${linhas.map((x) => { const d = x.r - x.d; return `<tr class="${x.m === mesAtual() ? "atual" : ""}" data-irmes="${x.m}"><td>${mesCurto(x.m)}${x.m.slice(0, 4) !== mesAtual().slice(0, 4) ? "/" + x.m.slice(2, 4) : ""}</td>${soD ? "" : `<td class="num">${x.r ? fmt(x.r) : "—"}</td>`}${soR ? "" : `<td class="num">${x.d ? fmt(x.d) : "—"}</td>`}${soD || soR ? "" : `<td class="num ${d < 0 ? "neg" : ""}">${x.r || x.d ? (d < 0 ? "− " : "") + fmt(Math.abs(d)) : "—"}</td>`}</tr>`; }).join("")}</table></div>`;
  const comMov = linhas.filter((x) => x.r || x.d);
  if (comMov.length > 1) {
    const chave = soD ? (x) => -x.d : soR ? (x) => x.r : (x) => x.r - x.d;
    const melhor = comMov.reduce((a, b) => (chave(b) > chave(a) ? b : a)), pior = comMov.reduce((a, b) => (chave(b) < chave(a) ? b : a));
    const fv = (x) => soD ? fmt(x.d) : soR ? fmt(x.r) : `${x.r - x.d < 0 ? "− " : "+ "}${fmt(Math.abs(x.r - x.d))}`;
    let maiorCat = "";
    if (!soCat && !soR) { const o = {}; for (const l of S.d.lancs) if (l.tipo === "despesa" && meses.includes(l.data.slice(0, 7))) o[l.cat] = (o[l.cat] || 0) + l.valor; const top = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; if (top) maiorCat = linhaValor("Onde mais gastou", `${esc(cat(top[0]).nome)} · ${fmt(top[1])}`, "", "categoria do período"); }
    corpo += `<div class="box"><h3>Destaques</h3>${linhaValor("Melhor mês", `${mesCurto(melhor.m)} · ${fv(melhor)}`, "pos", soD ? "gastou menos" : soR ? "recebeu mais" : "sobrou mais")}
      ${linhaValor("Pior mês", `${mesCurto(pior.m)} · ${fv(pior)}`, "neg", soD ? "gastou mais" : soR ? "recebeu menos" : "gastou mais")}${maiorCat}</div>`;
  }
  if (!det && S.d.fixos.some((f) => f.tipo === "despesa")) {
    const ref = P.mes || (meses.includes(mesAtual()) ? mesAtual() : meses[meses.length - 1]);
    const fx = totFixos(ref, "despesa"), fa = totFixos(somaMes(ref, -1), "despesa"), dt = resumoMes(ref).des;
    corpo += `<button class="box fx-resumo" data-det="fixos"><span class="mm"><b>Fixos de ${mesCurto(ref)}.: ${fmtR(fx)}</b>
      <small>${dt ? Math.round((fx / dt) * 100) : 0}% das despesas · ${mesCurto(somaMes(ref, -1))}.: ${fmt(fa)}</small></span><span class="fx-ver">ver fixos ${ic("chevron-right")}</span></button>`;
  }
  return { k, corpo };
}

// Opções do 3º filtro (Detalhe), conforme o relatório
function opcoesDetalhe(rel) {
  const cats = (tipo) => S.d.categorias.filter((c) => c.tipo === tipo).map((c) => ({ valor: "cat:" + c.id, rotulo: c.nome, icone: c.icone, grupo: "Uma categoria" }));
  if (rel === "gastos") return [{ valor: "", rotulo: "Todas as categorias", icone: "list" }, { valor: "cartao", rotulo: "Só no cartão de crédito", icone: "credit-card" }, { valor: "vista", rotulo: "Só à vista (débito, Pix, dinheiro)", icone: "arrow-left-right" }, ...cats("despesa")];
  if (rel === "es") return [{ valor: "", rotulo: "Todas as contas", icone: "wallet" }, ...(S.d.contas.some(ehBenef) ? [{ valor: "benef", rotulo: "Benefícios (VA/VR)", icone: "ticket" }] : []), ...S.d.contas.map((c) => ({ valor: "conta:" + c.id, rotulo: c.nome, icone: icConta(c), grupo: "Uma conta" }))];
  if (rel === "cartoes") return [{ valor: "", rotulo: "Todos os cartões", icone: "credit-card" }, ...S.d.cartoes.map((c) => ({ valor: c.id, rotulo: c.nome, icone: "credit-card", grupo: "Um cartão" }))];
  if (rel === "inv") return [{ valor: "", rotulo: "Todos os investimentos", icone: "piggy-bank" }, ...S.d.invest.map((i) => ({ valor: i.id, rotulo: i.nome, icone: i.icone, sub: i.tipo, grupo: "Um investimento" }))];
  return [{ valor: "", rotulo: "Receitas e despesas", icone: "chart-line" }, { valor: "des", rotulo: "Só despesas", icone: "receipt" }, { valor: "rec", rotulo: "Só receitas", icone: "trending-up" }, { valor: "fixos", rotulo: "Fixos (recorrentes)", icone: "repeat" }, ...cats("despesa")];
}
function rotuloDetalhe(rel, det) { const o = opcoesDetalhe(rel).find((x) => x.valor === det); return o ? o.rotulo : opcoesDetalhe(rel)[0].rotulo; }

function telaRelatorios() {
  const f = filtroRel();
  if (!opcoesDetalhe(f.rel).some((o) => o.valor === f.det)) f.det = "";
  const P = infoPer(f.per), [, rot, ico] = relInfo(f.rel);
  const r = { gastos: relGastos, es: relES, cartoes: relCartoes, inv: relInv, comp: relComp }[f.rel](P, f.det);
  const pil = (attr, icone, txt, on = true) => `<button class="fp${on ? " on" : ""}" ${attr}>${ic(icone)}<span>${esc(txt)}</span>${ic("chevron-down", "seta")}</button>`;
  return `<header class="topo-n rel-topo"><div class="tn-linha"><div class="ola">Seus números<b>Relatórios</b></div><button class="ia-pill" data-ia>${ic("sparkles")}Enviar para IA</button></div>
      <div class="fbar">${pil("data-fper", "calendar", P.rot)}${pil("data-frel", ico, rot)}${pil("data-fdet", "search", rotuloDetalhe(f.rel, f.det), !!f.det)}</div>
      ${r.k}</header>
    <div class="conteudo rel-corpo" id="relcorpo">${r.corpo}
      ${f.per.t !== "int" ? `<p class="rel-dica">${ic("arrow-left-right")}Deslize para o lado para ${f.per.t === "ano" ? "trocar de ano" : "trocar de mês"}</p>` : ""}</div>`;
}
async function escolherPeriodo() {
  const f = filtroRel(), atual = mesAtual(), ano = Number(atual.slice(0, 4));
  const ops = [
    { valor: "m0", rotulo: "Este mês", icone: "calendar", sub: nomeMes(atual) },
    { valor: "m-1", rotulo: "Mês passado", icone: "calendar", sub: nomeMes(somaMes(atual, -1)) },
    { valor: "m1", rotulo: "Próximo mês", icone: "calendar", sub: nomeMes(somaMes(atual, 1)) },
    { valor: "mx", rotulo: "Escolher um mês…", icone: "calendar" },
    { valor: "a0", rotulo: `Ano de ${ano}`, icone: "chart-line", grupo: "Ano" },
    { valor: "a-1", rotulo: `Ano de ${ano - 1}`, icone: "chart-line", grupo: "Ano" },
    { valor: "u3", rotulo: "Últimos 3 meses", icone: "chart-line", grupo: "Vários meses" },
    { valor: "u6", rotulo: "Últimos 6 meses", icone: "chart-line", grupo: "Vários meses" },
    { valor: "u12", rotulo: "Últimos 12 meses", icone: "chart-line", grupo: "Vários meses" },
    { valor: "int", rotulo: "De uma data até outra…", icone: "calendar", grupo: "Personalizado" },
  ];
  const v = await escolher("Período", ops, null);
  if (!v) return;
  if (v[0] === "m" && v !== "mx") f.per = { t: "mes", ym: somaMes(atual, Number(v.slice(1))) };
  else if (v === "mx") { const m = await escolherMes(f.per.ym || atual); if (!m) return; f.per = { t: "mes", ym: m }; }
  else if (v[0] === "u") f.per = { t: "ult", n: Number(v.slice(1)) };
  else if (v[0] === "a") f.per = { t: "ano", ano: ano + Number(v.slice(1)) };
  else {
    const per = await new Promise((ok) => {
      let resp = null;
      const de0 = f.per.t === "int" ? f.per.de : `${atual}-01`, ate0 = f.per.t === "int" ? f.per.ate : hoje();
      const el = abrirCamada(`<h2>De uma data até outra</h2><form data-f><div class="dois"><label>De<input type="date" name="de" value="${de0}" required></label><label>Até<input type="date" name="ate" value="${ate0}" required></label></div>
        <button class="btn preto" style="margin-top:14px">Ver período</button></form>`, { aoFechar: () => ok(resp) });
      $("[data-f]", el).onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); let de = fd.get("de"), ate = fd.get("ate"); if (de > ate) [de, ate] = [ate, de]; resp = { t: "int", de, ate }; fechar(); };
    });
    if (!per) return; f.per = per;
  }
  guardarFiltro(); desenhar();
}
ligar.relatorios = () => {
  const f = filtroRel();
  const ir = () => { guardarFiltro(); desenhar(); };
  $("[data-fper]").onclick = escolherPeriodo;
  $("[data-ia]").onclick = abrirEnviarIA;
  $("[data-frel]").onclick = async () => { const v = await escolher("O que você quer ver?", RELS.map(([valor, rotulo, icone, sub]) => ({ valor, rotulo, icone, sub })), f.rel); if (v && v !== f.rel) { f.rel = v; f.det = ""; if (v === "comp" && f.per.t === "mes") f.per = { t: "ult", n: 6 }; ir(); } };
  $("[data-fdet]").onclick = async () => { const v = await escolher("Detalhe", opcoesDetalhe(f.rel), f.det); if (v !== null && v !== undefined) { f.det = v; ir(); } };
  // deslizar troca o período (mês ou ano)
  const mover = (d) => { if (f.per.t === "mes") f.per = { t: "mes", ym: somaMes(f.per.ym, d) }; else if (f.per.t === "ano") f.per = { t: "ano", ano: f.per.ano + d }; else return; ir(); };
  if (f.per.t !== "int") ligarDeslizar($("#relcorpo"), [-1, 0, 1], () => 0, (d) => mover(d));
  const corpo = $("#relcorpo");
  corpo.querySelectorAll("[data-det]").forEach((b) => (b.onclick = () => { f.det = b.dataset.det; ir(); scrollTo(0, 0); }));
  corpo.querySelectorAll("[data-irmes]").forEach((b) => (b.onclick = () => { f.per = { t: "mes", ym: b.dataset.irmes }; if (f.rel === "comp") { f.rel = "gastos"; f.det = ""; } ir(); scrollTo(0, 0); }));
  corpo.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
  corpo.querySelectorAll("[data-abririnv]").forEach((b) => (b.onclick = abrirInvestimentos));
  corpo.querySelectorAll("[data-fatmes]").forEach((b) => (b.onclick = () => abrirFaturasMes(f.per.ym || mesAtual())));
  const vm = corpo.querySelector("[data-vermais]"); if (vm) vm.onclick = () => { corpo.querySelectorAll(".lista-compras .mais").forEach((x) => x.classList.remove("mais")); vm.remove(); };
  const P = infoPer(f.per);
  const nomes = { fat: "Faturas de cartão pagas", vista: "Débito / Pix / dinheiro", aplic: "Aplicações em investimentos", trs: "Transferências enviadas", resg: "Resgates de investimentos", tre: "Transferências recebidas" };
  corpo.querySelectorAll("[data-lista]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.lista;
    if (k === "ben") return verLista("Benefícios (VA/VR)", relGastos.ben || [], P.rot);
    verLista(nomes[k], (relES.listas || {})[k] || [], P.rot);
  }));
  corpo.querySelectorAll("[data-listacat]").forEach((b) => (b.onclick = () => verLista(cat(b.dataset.listacat).nome, (relES.recCat || []).filter((l) => l.cat === b.dataset.listacat), P.rot)));
  corpo.querySelectorAll("[data-listacart]").forEach((b) => (b.onclick = () => verLista(cat(b.dataset.listacart).nome, (relCartoes.itens || []).filter((l) => l.cat === b.dataset.listacart), P.rot)));
};

function verFaturas(cid, mesIni) {
  let ym = mesIni || faturaAberta(cid);
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

// Diz se um lançamento já foi pago/recebido. Compra no cartão de crédito só conta como paga
// quando a fatura em que ela caiu estiver quitada (é aí que o dinheiro sai da conta).
function criarJaFoi(hj) {
  const cache = {};
  const quitada = (cid, ym) => { const k = cid + "|" + ym; if (!(k in cache)) cache[k] = infoFatura(cid, ym).falta === 0; return cache[k]; };
  return (l) => (l.tipo === "despesa" && l.cartao && S.d.cartoes.some((c) => c.id === l.cartao)) ? quitada(l.cartao, faturaDoLanc(l)) : l.data <= hj;
}

// Relatório básico: quanto foi usado no cartão (compras) em cada mês, até o mês exibido
function usoCartaoMensal(ate) {
  const meses = Array.from({ length: 12 }, (_, i) => somaMes(ate, i - 11));
  const linhas = meses.map((ym) => {
    const por = S.d.cartoes.map((c) => ({ c, v: S.d.lancs.filter((l) => l.tipo === "despesa" && l.cartao === c.id && l.data.startsWith(ym)).reduce((t, l) => t + l.valor, 0) }));
    return { ym, por, tot: por.reduce((t, x) => t + x.v, 0) };
  });
  const comUso = linhas.filter((x) => x.tot > 0);
  if (!comUso.length) return "";
  while (linhas.length && !linhas[0].tot) linhas.shift(); // não mostra meses antes do primeiro uso
  const max = Math.max(...linhas.map((x) => x.tot), 1);
  const media = Math.round(comUso.reduce((t, x) => t + x.tot, 0) / comUso.length);
  const varios = S.d.cartoes.length > 1;
  return `<section class="uso-cartao"><h3>Uso do cartão por mês</h3>
    <p class="uso-sub">Total das compras feitas no cartão em cada mês · média ${fmtR(media)}</p>
    ${linhas.slice().reverse().map((x) => `<div class="uso-l ${x.ym === mesAtual() ? "atual" : ""}">
      <span class="uso-m">${MES3[Number(x.ym.slice(5)) - 1].replace(".", "")}/${x.ym.slice(2, 4)}</span>
      <span class="uso-b"><i style="width:${(x.tot / max) * 100}%"></i>${varios && x.tot ? `<small>${x.por.filter((p) => p.v).map((p) => `${esc(p.c.nome)} ${fmt(p.v)}`).join(" · ")}</small>` : ""}</span>
      <b class="num">${x.tot ? fmt(x.tot) : "—"}</b></div>`).join("")}</section>`;
}

// Folha aberta por "Faturas cartões" no Início: as faturas que vencem no mês exibido
function abrirFaturasMes(mesIni) {
  let ym = mesIni;
  const el = abrirCamada(`<div data-fatmesc></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    const fs = S.d.cartoes.map((c) => ({ c, f: infoFatura(c.id, ym) }));
    const total = fs.reduce((t, x) => t + x.f.total, 0), falta = fs.reduce((t, x) => t + x.f.falta, 0);
    const pago = fs.reduce((t, x) => t + Math.min(x.f.pago, x.f.total), 0);
    const aberta = (cid) => faturaAberta(cid) === ym;
    const etq = (x) => x.f.total === 0 ? `<span class="etiqueta">Sem compras</span>` : x.f.falta === 0 ? `<span class="etiqueta paga">Paga</span>`
      : aberta(x.c.id) ? `<span class="etiqueta aberta">Aberta</span>` : `<span class="etiqueta">Fechada</span>`;
    $("[data-fatmesc]", el).innerHTML = `<h2>Faturas dos cartões</h2>
      <div class="ano-nav"><button data-m="-1">${ic("chevron-left")}</button><span>Vencem em ${nomeMes(ym)}</span><button data-m="1">${ic("chevron-right")}</button></div>
      <div style="text-align:center;font-size:28px;font-weight:700" class="num">${fmtR(total)}</div>
      <p style="text-align:center;margin:2px 0 12px;font-size:14px;color:#555">${total === 0 ? "Nenhuma compra nessas faturas" : falta === 0 ? "Tudo pago" : pago ? `Pago ${fmtR(pago)} · falta ${fmtR(falta)}` : "Nada pago ainda"}</p>
      <div class="cartao-box">${fs.map((x) => `<div class="fatura"><div class="cabf"><span class="bola">${ic("credit-card")}</span><div class="meio"><b>${esc(x.c.nome)}</b>
          <small style="display:block">Fecha dia ${x.c.fechamento} · vence ${dataCurta(vencimentoData(x.c.id, ym))} · ${x.f.itens.length} compra(s)</small></div></div>
        <div class="valf num">${fmtR(x.f.total)}</div>${etq(x)}${x.f.pago && x.f.falta ? `<small> falta ${fmtR(x.f.falta)}</small>` : ""}
        <div class="acoes"><button class="btn contorno" data-verfat="${x.c.id}">Ver compras</button>${x.f.falta > 0 ? `<button class="btn preto" data-pagar="${x.c.id}">Pagar fatura</button>` : ""}</div>
        ${x.f.pago && x.f.falta ? `<button class="link" style="font-size:13.5px;margin-top:10px" data-quitar="${x.c.id}">Já paguei a fatura inteira (valor do banco diferente) → marcar como paga</button>` : ""}</div>`).join("")}</div>
      <p style="font-size:12.5px;color:#777;margin:10px 2px 0">Compras no cartão entram em “Despesas do mês” na data da compra, mas só saem do saldo quando você paga a fatura.</p>
      ${usoCartaoMensal(ym)}`;
    el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { ym = somaMes(ym, Number(b.dataset.m)); pintar(); }));
    el.querySelectorAll("[data-verfat]").forEach((b) => (b.onclick = () => verFaturas(b.dataset.verfat, ym)));
    el.querySelectorAll("[data-pagar]").forEach((b) => (b.onclick = () => pagarFatura(b.dataset.pagar, ym)));
    el.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = async () => {
      const pg = S.d.lancs.filter((l) => l.tipo === "fatura" && l.cartao === b.dataset.quitar && l.fatura === ym).pop();
      if (!pg) return;
      pg.quita = true; await salvar(); pintar(); desenhar(); aviso("Fatura marcada como paga. As compras dela saíram de “a pagar”.");
    }));
  };
  pintar();
  abrirFaturasMes.repintar = pintar;
}

// Mostra o que entra em "pagas / a pagar" (despesas) ou "recebidas / a receber" (receitas) no Início
function verConsiderado(tipo, qual, ym) {
  const el = abrirCamada(`<div data-considc></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    const hj = hoje(), des = tipo === "despesa", ok = qual === "ok", cart = qual === "cartao", jaFoi = criarJaFoi(hj);
    // "a pagar" = vence neste mês; "cartao" = compras que só vencem numa fatura seguinte
    const passa = (l) => ok ? jaFoi(l) : !jaFoi(l) && (!des || vaiPraFaturaSeguinte(l, ym) === cart);
    const lancs = S.d.lancs.filter((l) => l.tipo === tipo && l.data.startsWith(ym) && passa(l))
      .sort((x, y) => (ok ? y.data.localeCompare(x.data) : x.data.localeCompare(y.data)) || x.id.localeCompare(y.id));
    const fixos = ok ? [] : fixosPendentes(ym).filter((f) => f.tipo === tipo && (!des || fixoNaFaturaSeguinte(f, ym) === cart));
    const invOk = !des && ok ? S.d.lancs.filter((l) => l.tipo === "resg" && l.prog && l.data.startsWith(ym)).sort((x, y) => y.data.localeCompare(x.data)) : [];
    const invFalta = !des && !ok ? progAReceber(ym) : [];
    const total = lancs.reduce((t, l) => t + l.valor, 0) + fixos.reduce((t, f) => t + f.valor, 0) + invOk.reduce((t, l) => t + l.valor, 0) + invFalta.reduce((t, x) => t + x.valor, 0);
    const noCartao = lancs.filter((l) => l.cartao);
    const titulo = cart ? "Compras para as próximas faturas" : des ? (ok ? "Despesas pagas" : "Despesas a pagar") : (ok ? "Receitas recebidas" : "Receitas a receber");
    const regra = cart
      ? `Compras no cartão feitas em ${nomeMes(ym)} que só vencem numa <b>fatura dos próximos meses</b>. Elas contam nas despesas de ${nomeMes(ym)} (mês da compra), mas o dinheiro só sai quando você pagar aquela fatura.`
      : ok
      ? `Lançamentos de ${des ? "despesa" : "receita"} de ${nomeMes(ym)} com data <b>até hoje (${dataCurta(hj)})</b>.${des ? "" : " Inclui as parcelas de investimentos/empréstimos recebidas no mês."}${des ? " Compras no cartão só entram aqui depois que a fatura delas for paga." : ""}`
      : `Lançamentos de ${des ? "despesa" : "receita"} de ${nomeMes(ym)} com data <b>depois de hoje (${dataCurta(hj)})</b>${des ? ", como parcelas futuras," : ""} e os <b>fixos ainda não confirmados</b> do mês.${des ? "" : " Inclui as <b>parcelas de investimentos/empréstimos</b> ainda não recebidas (e as atrasadas)."}${des ? " Inclui as <b>compras no cartão cuja fatura vence neste mês</b> e ainda não foi paga. As que vão para faturas seguintes ficam separadas, com o ícone do cartão." : ""}`;
    const secao = (rot, v, html) => html ? `<div class="dia-cab"><span>${rot}</span><span class="num">${fmt(v)}</span></div>${html}` : "";
    const htmlFixos = fixos.map((f) => { const c = cat(f.cat); return `<div class="item pendente"><button class="pend-abrir" data-fixo="${f.id}">${bola(c.icone, c.cor)}
        <span class="meio"><div>${esc(f.nota || c.nome)}</div><small>dia ${dataCurta(dataFixo(f, ym))} · ${ic("repeat")}Fixo a confirmar${f.cartao ? " · " + esc(cartao(f.cartao).nome) : ""}</small></span>
        <span class="val num">${des ? "- " : "+ "}${fmt(f.valor)}</span></button></div>`; }).join("");
    $("[data-considc]", el).innerHTML = `<h2>${titulo}</h2>
      <p style="text-align:center;color:#777;margin:-6px 0 4px;font-size:14px">${nomeMes(ym)}</p>
      <div style="text-align:center;font-size:28px;font-weight:700" class="num">${fmtR(total)}</div>
      <p class="consid-regra">${regra}${des && !cart && noCartao.length ? `<br>Destas, <b>${fmtR(noCartao.reduce((t, l) => t + l.valor, 0))}</b> são compras no cartão${ok ? " (fatura já paga)" : " (fatura ainda não paga)"}.` : ""}</p>
      <div style="margin:0 -18px">${secao("Lançamentos", lancs.reduce((t, l) => t + l.valor, 0), lancs.map((l) => itemLanc(l, true)).join(""))}
      ${secao("Fixos a confirmar", fixos.reduce((t, f) => t + f.valor, 0), htmlFixos)}
      ${secao("Investimentos recebidos", invOk.reduce((t, l) => t + l.valor, 0), invOk.map((l) => itemLanc(l, true)).join(""))}
      ${secao("Investimentos a receber", invFalta.reduce((t, x) => t + x.valor, 0), invFalta.map((x) => `<div class="item pendente"><button class="pend-abrir" data-progok="${x.inv.id}|${x.p.id}|${x.ym}">${bola(x.inv.icone, corInv(x.inv))}
        <span class="meio"><div>${esc(x.inv.nome)}</div><small>${x.atrasada ? `<b style="color:#C62828">atrasada</b> · ` : ""}${x.sub}</small></span><span class="val num">+ ${fmt(x.valor)}</span></button></div>`).join(""))}
      ${!lancs.length && !fixos.length && !invOk.length && !invFalta.length ? `<p class="vazio" style="padding:20px">Nada aqui em ${nomeMes(ym)}.</p>` : ""}</div>`;
    el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
    el.querySelectorAll("[data-fixo]").forEach((b) => (b.onclick = () => abrirEditor(null, { fixo: fixoPorId(b.dataset.fixo), ym })));
    el.querySelectorAll("[data-progok]").forEach((b) => (b.onclick = () => { const [iv, pl, pm] = b.dataset.progok.split("|"); confirmarProg(iv, pl, pm); }));
  };
  pintar();
  verConsiderado.repintar = pintar;
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
      <label class="marcar"><input type="checkbox" name="quita" ${!existente || existente.quita ? "checked" : ""}> Paguei a fatura inteira</label>
      <p style="font-size:12.5px;color:#777;margin:-4px 0 10px">Marcado: todas as compras desta fatura passam a contar como pagas, mesmo se o valor do banco for um pouco diferente do app. Desmarque se pagou só uma parte.</p>
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
    if (fm.quita.checked) l.quita = true; else delete l.quita;
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
    if (abrirFaturasMes.repintar && $("[data-fatmesc]")) abrirFaturasMes.repintar();
    if (verConsiderado.repintar && $("[data-considc]")) verConsiderado.repintar();
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
      ${op("contas", "wallet", "Contas e benefícios", "Banco, carteira, VA, VR, vale combustível…")}
      ${op("invest", "piggy-bank", "Investimentos", S.d.invest.length ? `${S.d.invest.length} cadastrado${S.d.invest.length > 1 ? "s" : ""} · ${fmtR(totalInvestido())}` : "Poupança, CDB, Tesouro, metas…")}
      ${op("fixos", "repeat", "Lançamentos recorrentes (fixos)", S.d.fixos.length ? `${S.d.fixos.length} todo mês` : "Aluguel, salário, internet…")}
      ${op("cartoes", "credit-card", "Cartões de crédito", S.d.cartoes.length ? S.d.cartoes.map((c) => c.nome).join(", ") : "Nenhum cadastrado")}
    </div></section>
    <section class="secao"><h2>Seus dados</h2><div class="cartao-box">
      ${op("backup", "download", "Salvar backup", txtBk)}
      ${op("lembrete", "calendar-clock", "Lembrete de backup", textoLembreteBackup(u))}
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
    ${secaoFamilia()}
    <p style="text-align:center;color:#999;font-size:12px;margin:22px 0 0">Gestor de Finanças ${VERSAO_APP} · criado por <b style="color:#666">Denilson Carvalho</b><br>Dados guardados só neste aparelho · Ícones: Lucide (licença ISC)</p>
    <p style="text-align:center;margin:10px 0 0"><button class="link" style="font-size:13.5px" data-atualizar>Procurar atualização</button></p>
    </div>`;
}
ligar.perfil = () => {
  const acoes = { invest: abrirInvestimentos, tema: escolherTema, fixos: gerirFixos, categorias: gerirCategorias, contas: gerirContas, cartoes: gerirCartoes, backup: salvarBackup, lembrete: configurarLembreteBackup, restaurar: restaurarNoPerfil, csv: exportarCSV, senha: trocarSenha, codigo: gerarCodigo, sair: sairConfirmar };
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
    ? { tipo: fonte.tipo, cat: fonte.cat, nota: fonte.nota || "", conta: fonte.conta || S.d.contas[0]?.id, cartao: fonte.cartao || null, fatMes: editando ? l.fatMes || null : null,
        destino: fonte.destino || S.d.contas[1]?.id, data: editando ? l.data : hoje(), expr: nf0.format(fonte.valor / 100).replace(/\./g, ""), parcelas: 1, repetir: 0 }
    : { tipo: "despesa", cat: null, expr: "", nota: "", data: hoje(), conta: S.d.contas[0]?.id, cartao: null, parcelas: 1, destino: S.d.contas[1]?.id, repetir: 0 };
  if (!fonte && S.mes !== mesAtual()) E.data = `${S.mes}-01`;
  if (opc.fixo) { const v = dataFixo(opc.fixo, opc.ym); E.data = v < hoje() ? v : hoje(); }
  if (E.conta && !S.d.contas.some((c) => c.id === E.conta)) E.conta = S.d.contas[0]?.id;
  if (E.cartao && !S.d.cartoes.some((c) => c.id === E.cartao)) E.cartao = null;
  // investimentos
  E.mov = "aplic"; E.inv = S.d.invest[0]?.id || null; E.perda = false;
  if (fonte && ehInvest(fonte.tipo)) { E.mov = fonte.tipo; E.inv = fonte.inv; E.perda = !!fonte.perda; E.tipo = "invest"; E.semConta = fonte.tipo === "aplic" && !fonte.conta; }
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
      <div class="sug" data-sug hidden></div>
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
  nota.oninput = () => { E.nota = nota.value; pintarSugestoes(); };
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
      const titInv = E.mov === "aplic" ? "Para qual investimento?" : E.mov === "resg" ? "De qual investimento?" : "Qual investimento?";
      const blocoInv = `<div class="inv-tit">${titInv}</div><div class="grade-inv">${S.d.invest.map((i) => `<button data-escinv="${i.id}" class="${i.id === E.inv ? "sel" : ""}">${bola(i.icone, corInv(i))}
          <span class="gi-n">${esc(i.nome)}</span><small class="num">${fmtR(saldoInv(i.id))}</small></button>`).join("")}
        <button data-novoinv>${`<span class="bola">${ic("plus")}</span>`}<span class="gi-n">Novo investimento</span><small>CDB, poupança, cripto…</small></button></div>`;
      const semC = E.mov === "aplic" && E.semConta;
      const blocoConta = semC
        ? `<button class="escolha-conta" data-escconta><span class="bola">${ic("piggy-bank")}</span><span><small>De onde veio</small>Já estava investido antes do app · não mexe nas contas</span></button>`
        : `<button class="escolha-conta" data-escconta><span class="bola">${ic("wallet")}</span><span><small>${E.mov === "aplic" ? "Sai da conta" : "Volta para a conta"}</small>${esc(conta(E.conta).nome)} · <span class="num">${fmtR(saldoConta(E.conta))}</span></span></button>`;
      const iSel = invest(E.inv);
      const progAtual = E.progNovo || null;
      const planoLig = editando && l.tipo === "aplic" && l.inv === E.inv ? planoDaAplic(l) : null;
      const blocoReceb = `<button class="escolha-conta como-receb ${planoLig || progAtual ? "tem" : ""}" data-comoreceb><span class="bola">${ic("calendar-clock")}</span>
        <span><small>Como vai receber de volta (só esta aplicação)</small>${planoLig ? `${resumoProg(planoLig)}<br><b>Toque para alterar parcelas, valor ou dia</b>` : progAtual ? resumoProg(progAtual) : "Quando eu quiser · toque para parcelar ou pôr vencimento"}</span></button>`;
      corpo.innerHTML = `<div class="transf">
        <div class="mov-sel">${Object.entries(MOVS).map(([k, r]) => `<button data-mv="${k}" class="${E.mov === k ? "sel" : ""}" ${editando && k !== E.mov ? "disabled" : ""}>${r}</button>`).join("")}</div>
        <p class="mov-dica">${dica}</p>
        ${E.mov === "aplic" ? (planoLig ? blocoReceb : "") + blocoConta + `<div class="seta-meio">↓</div>` + blocoInv + (planoLig ? "" : blocoReceb) : E.mov === "resg" ? blocoInv + `<div class="seta-meio">↓</div>` + blocoConta
          : blocoInv + `<div class="mov-sel dois-op"><button data-pd="0" class="${!E.perda ? "sel" : ""}">Rendeu</button><button data-pd="1" class="${E.perda ? "sel" : ""}">Perdeu</button></div>`}</div>`;
      corpo.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { E.mov = b.dataset.mv; pintarCorpo(); }));
      corpo.querySelectorAll("[data-pd]").forEach((b) => (b.onclick = () => { E.perda = b.dataset.pd === "1"; pintarCorpo(); }));
      corpo.querySelectorAll("[data-escinv]").forEach((b) => (b.onclick = () => { E.inv = b.dataset.escinv; E.progNovo = undefined; pintarCorpo(); }));
      const cr = $("[data-comoreceb]", corpo);
      if (cr && planoLig) cr.onclick = () => editarPlano(S.d.invest.find((x) => x.id === E.inv), planoLig, () => pintarCorpo());
      else if (cr) cr.onclick = () => {
        const sh = abrirCamada(`<h2>Como vai receber de volta?</h2><form data-f>${blocoProg(progAtual)}<p class="erro" data-e></p>
          <div class="botoes"><button class="btn preto">Usar</button></div></form>`);
        ligarModo(sh);
        $("[data-f]", sh).onsubmit = (e) => {
          e.preventDefault();
          const lp = lerProg(e.target);
          if (lp.erro) return ($("[data-e]", sh).textContent = lp.erro);
          E.progNovo = lp.prog; fechar(); pintarCorpo();
        };
      };
      $("[data-novoinv]", corpo).onclick = () => editarInvest(null, (n) => { if (n) E.inv = n.id; pintarCorpo(); });
      const ec = $("[data-escconta]", corpo);
      if (ec) ec.onclick = async () => {
        const ops = S.d.contas.map((c) => ({ valor: c.id, rotulo: c.nome, icone: icConta(c), sub: fmtR(saldoConta(c.id)), grupo: E.mov === "aplic" ? "Sai da conta" : undefined }));
        if (E.mov === "aplic") ops.push({ valor: "__ja", rotulo: "Já estava investido antes do app", icone: "piggy-bank", grupo: "Não sai de nenhuma conta", sub: "Entra no investimento sem mexer no saldo" });
        const v = await escolher(E.mov === "aplic" ? "De onde veio o dinheiro?" : "Qual conta?", ops, E.semConta && E.mov === "aplic" ? "__ja" : E.conta);
        if (v === "__ja") { E.semConta = true; pintarCorpo(); }
        else if (v) { E.conta = v; E.semConta = false; pintarCorpo(); }
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
      pintarSugestoes();
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
      : `<button class="chip" data-pg>${ic(icConta(conta(E.conta)))}<span>${esc(conta(E.conta).nome)}</span></button>`;
    const podeParc = (E.cartao || E.tipo === "receita") && !(editando && l.parc) && !opc.fixo && !E.repetir;
    const parc = podeParc ? `<button class="chip" data-parc>${E.parcelas}x</button>` : "";
    const fatAuto = E.cartao ? faturaDe(E.cartao, E.data) : null, fatSel = E.fatMes || fatAuto;
    const fat = E.cartao ? `<button class="chip ${E.fatMes ? "cartao" : ""}" data-fat>${ic("calendar")}<span>Fatura ${MES3[Number(fatSel.slice(5)) - 1].replace(".", "")} · vence ${dataCurta(vencimentoData(E.cartao, fatSel))}</span></button>` : "";
    box.innerHTML = pagoCom + parc + fat;
    const bf = $("[data-fat]", box);
    if (bf) bf.onclick = async () => {
      const c = cartao(E.cartao);
      const ops = [-1, 0, 1, 2].map((k) => somaMes(fatAuto, k)).map((ym) => ({ valor: ym, rotulo: `Fatura de ${nomeMes(ym)}`, icone: "credit-card",
        sub: `vence ${dataCurta(vencimentoData(E.cartao, ym))}${ym === fatAuto ? ` · automática (fecha dia ${c.fechamento})` : ""}${infoFatura(E.cartao, ym).quitada || (infoFatura(E.cartao, ym).total && !infoFatura(E.cartao, ym).falta) ? " · já paga" : ""}` }));
      const v = await escolher("Em qual fatura entra?", ops, fatSel);
      if (!v) return;
      E.fatMes = v === fatAuto ? null : v;
      pintarChips();
    };
    pintarRepetir();
    $("[data-pg]", box).onclick = async () => {
      const ops = S.d.contas.filter((c) => !ehBenef(c)).map((c) => ({ valor: "conta:" + c.id, rotulo: c.nome, icone: "wallet", grupo: E.tipo === "despesa" ? "Sai do saldo em conta" : "Conta", sub: "Dinheiro, Pix ou débito" }));
      const gB = "Cartão de benefício (VA, VR, combustível)";
      S.d.contas.filter(ehBenef).forEach((c) => ops.push({ valor: "conta:" + c.id, rotulo: c.nome, icone: "ticket", grupo: gB, sub: `Saldo do benefício: ${fmtR(saldoConta(c.id))} · sem fatura` }));
      ops.push({ valor: "novobenef", rotulo: "Cadastrar cartão de benefício", icone: "plus", grupo: S.d.contas.some(ehBenef) ? undefined : gB, sub: "Vale alimentação, refeição, combustível…" });
      if (E.tipo === "despesa") {
        S.d.cartoes.forEach((c) => ops.push({ valor: "cartao:" + c.id, rotulo: c.nome, icone: "credit-card", grupo: "Cartão de crédito (não sai do saldo)", sub: `Entra na fatura de ${nomeMes(faturaDe(c.id, E.data))}` }));
        ops.push({ valor: "novo", rotulo: "Cadastrar cartão de crédito", icone: "plus", grupo: S.d.cartoes.length ? undefined : "Cartão de crédito (não sai do saldo)" });
      }
      const v = await escolher(E.tipo === "despesa" ? "Pago com" : "Recebido em", ops, E.cartao ? "cartao:" + E.cartao : "conta:" + E.conta);
      if (!v) return;
      if (v === "novo") return editarCartao(null, (c) => { E.cartao = c.id; pintarChips(); });
      if (v === "novobenef") return editarConta(null, (c) => { if (c) { E.cartao = null; E.conta = c.id; E.parcelas = 1; } pintarChips(); }, { beneficio: true });
      const [k, id] = v.split(":");
      if (k === "cartao") { if (E.cartao !== id) E.fatMes = null; E.cartao = id; } else { E.cartao = null; E.fatMes = null; E.conta = id; E.parcelas = 1; }
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
      const mov = { tipo: E.mov, valor: r.valor, nota: (E.nota || "").trim(), data: E.data, inv: E.inv, conta: E.mov === "rend" || (E.mov === "aplic" && E.semConta) ? null : E.conta };
      if (E.mov === "rend" && E.perda) mov.perda = true;
      let idAplic;
      if (editando) {
        const alvo = S.d.lancs.find((x) => x.id === l.id);
        const plLig = alvo.tipo === "aplic" ? planoDaAplic(alvo) : null, antigo = alvo.valor;
        for (const k of ["cat", "cartao", "destino", "perda", "parc", "fixo"]) delete alvo[k];
        Object.assign(alvo, mov);
        // o plano de recebimento acompanha o valor emprestado/aplicado
        if (plLig) { plLig.aplic = alvo.id; if (!plLig.principal || plLig.principal === antigo) plLig.principal = r.valor; }
        idAplic = plLig ? null : alvo.id;
      } else { idAplic = novoId(); S.d.lancs.push({ ...mov, id: idAplic }); }
      if (idAplic && E.mov === "aplic" && E.progNovo) {
        const alvoInv = S.d.invest.find((x) => x.id === E.inv);
        (alvoInv.progs ||= []).push({ ...E.progNovo, id: novoId(), principal: r.valor, aplic: idAplic });
      }
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
    if (base.cartao && E.fatMes) base.fatMes = E.fatMes;

    let msg = "Lançamento adicionado.";
    const parcelado = (E.cartao || E.tipo === "receita") && E.parcelas > 1;
    if (editando && parcelado && !l.parc) {
      // lançamento existente passou a ser parcelado: vira N parcelas
      const n = E.parcelas, cada = Math.floor(r.valor / n), sobra = r.valor - cada * n, g = novoId();
      S.d.lancs = S.d.lancs.filter((x) => x.id !== l.id);
      for (let i = 0; i < n; i++) S.d.lancs.push({ ...base, id: novoId() + i, valor: cada + (i === 0 ? sobra : 0), data: somaMesData(E.data, i), parc: { n: i + 1, t: n, g }, ...(base.fatMes ? { fatMes: somaMes(base.fatMes, i) } : {}) });
      msg = E.tipo === "receita" ? `Alterado para receber em ${n}x de ${fmtR(cada)}.` : `Alterado para o cartão em ${n}x de ${fmtR(cada)}.`;
    } else if (editando) {
      const alvo = S.d.lancs.find((x) => x.id === l.id);
      Object.assign(alvo, base);
      if (!base.fatMes) delete alvo.fatMes;
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
      for (let i = 0; i < n; i++) S.d.lancs.push({ ...base, id: novoId() + i, valor: cada + (i === 0 ? sobra : 0), data: somaMesData(E.data, i), parc: { n: i + 1, t: n, g }, ...(base.fatMes ? { fatMes: somaMes(base.fatMes, i) } : {}) });
      msg = E.tipo === "receita" ? `Receita lançada em ${n}x de ${fmtR(cada)}, uma por mês.` : `Lançado no cartão em ${n}x. Não saiu do saldo.`;
    } else {
      const novo = { ...base, id: novoId() };
      if (opc.fixo) { novo.fixo = opc.fixo.id; novo.fixoMes = opc.ym; msg = "Confirmado."; }
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
      const ehFixo = alvo.fixo && fixoPorId(alvo.fixo);
      const txtFixo = ehFixo ? " Ele sai do saldo e volta para “Fixos a confirmar”, como se não tivesse sido pago." : "";
      if (!(await confirmar(ehFixo ? "Desfazer confirmação" : "Apagar lançamento", `${alvo.nota || (ehInvest(alvo.tipo) ? `${MOVS[alvo.tipo]} · ${invest(alvo.inv).nome}` : alvo.tipo === "transf" ? "Transferência" : cat(alvo.cat).nome)} · ${fmtR(alvo.valor)}.${txtFixo}`, ehFixo ? "Desfazer" : "Apagar", true))) return;
      S.d.lancs = S.d.lancs.filter((x) => x.id !== alvo.id);
    }
    await salvar(); fechar(); aviso("Lançamento apagado."); atualizarFundo();
  };

  if (!E.cat && E.tipo !== "transf") E.cat = ultimo(E.tipo);
  // Sugestões de nota: as 5 mais recentes (primeiro as da categoria escolhida)
  function pintarSugestoes() {
    const box = $("[data-sug]", el);
    if (E.tipo !== "despesa" && E.tipo !== "receita") { box.hidden = true; return; }
    const sem = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const digitado = sem(nota.value);
    const vistos = new Set(), mesma = [], outras = [];
    const recentes = S.d.lancs.filter((x) => x.tipo === E.tipo && x.nota && x.nota.trim())
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
    for (const x of recentes) {
      const k = sem(x.nota);
      if (vistos.has(k) || k === digitado || (digitado && !k.includes(digitado))) continue;
      vistos.add(k);
      (x.cat === E.cat ? mesma : outras).push(x);
    }
    const lista = [...mesma, ...outras].slice(0, 5);
    box.hidden = !lista.length;
    box.innerHTML = lista.map((x) => `<button type="button" data-n="${esc(x.nota)}" data-nc="${x.cat || ""}">${ic("clock")}${esc(x.nota)}</button>`).join("");
    box.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => {
      nota.value = E.nota = b.dataset.n;
      // usa também a categoria que costuma acompanhar essa nota
      if (b.dataset.nc && b.dataset.nc !== E.cat && S.d.categorias.some((c) => c.id === b.dataset.nc && c.tipo === E.tipo)) { E.cat = b.dataset.nc; pintarCorpo(); }
      pintarSugestoes();
    }));
  }
  const pintarCorpo0 = pintarCorpo;
  pintarCorpo = function () { pintarCorpo0(); pintarSugestoes(); };

  pintarTipos(); pintarCorpo(); pintarChips(); pintarVisor(); pintarData();
}

/* ================= INVESTIMENTOS ================= */

const TIPOS_INV = [
  ["Poupança", "piggy-bank"], ["CDB / RDB", "landmark"], ["Tesouro Direto", "building"], ["LCI / LCA", "shield"],
  ["Fundos", "coins"], ["Ações", "chart-line"], ["Fundos imobiliários", "house"], ["Cripto", "gem"],
  ["Previdência", "umbrella"], ["Conta remunerada", "wallet"], ["Empréstimo", "handshake"], ["Outros", "trending-up"],
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

/* ----- Lista de planos do investimento: acordos com o histórico dentro, quitados e encerrados recolhidos ----- */
const faltaBruta = (p) => faltaReceber({ ...p, fim: undefined });
// todos os planos que entraram (direta ou indiretamente) num acordo
function origemAcordo(inv, ac) {
  const out = [];
  for (const p of progsDe(inv)) if (p.fim && p.fim.acordo === ac.id) { out.push(p); if (p.acordo) out.push(...origemAcordo(inv, p)); }
  return out;
}
const recebidoDe = (p) => S.d.lancs.filter((l) => l.prog === p.id && l.tipo === "resg").reduce((t, l) => t + l.valor, 0);
const nomePlano = (p) => p.acordo ? `Acordo de ${dataCurta(p.acordo.data)}` : p.modo === "venc" ? `Vencimento ${dataCurta(p.data)}` : p.modo === "mensal" ? "Rendimento mensal" : `Empréstimo ${fmt(p.principal || 0)}`;
function blocoPlanos(i) {
  const ps = progsDe(i), abertos = (blocoPlanos.abertos ||= new Set());
  const ativos = ps.filter((p) => !p.fim && (p.modo === "mensal" || faltaReceber(p) > 0));
  const quitados = ps.filter((p) => !p.fim && p.modo !== "mensal" && faltaReceber(p) === 0);
  const encerrados = ps.filter((p) => p.fim && p.fim.motivo !== "acordo");
  const linha = (p) => `<button class="plano plano-bt${p.fim ? " fim" : ""}" data-edplano="${p.id}"><span>${resumoProg(p)}</span><span class="plano-ed">${p.fim ? ic("chevron-right") : ic("pencil") + "Mudar"}</span></button>`;
  const cartaoAcordo = (ac) => {
    const orig = origemAcordo(i, ac).filter((p) => !p.acordo), recebidas = ac.n - progFaltam(ac).length;
    const F = orig.reduce((t, p) => t + faltaBruta(p), 0), C = orig.reduce((t, p) => t + Math.max(0, progRestante(p)), 0), T = ac.vals.reduce((t, v) => t + v, 0);
    const prox = progFaltam(ac)[0], ab = abertos.has(ac.id);
    return `<div class="acc${ab ? " ab" : ""}"><div class="acc-top"><span class="tag-ac">Acordo de ${dataCurta(ac.acordo.data)}</span><button class="btnc" data-edplano="${ac.id}">${ic("pencil")}Mudar</button></div>
      <b class="acc-v">${descrVals(ac.vals)}</b><div class="acc-s">${recebidas} de ${ac.n} recebidas${prox ? ` · próxima: ${dataCurta(`${prox}-${p2(ac.dia)}`)}` : ""} · falta receber <b class="num">${fmt(faltaReceber(ac))}</b></div>
      <div class="prog-b"><i style="width:${(recebidas / ac.n) * 100}%"></i></div>
      ${orig.length ? `<button class="acc-or" data-abreac="${ac.id}"><span class="seta-ac${ab ? " ab" : ""}">${ic("chevron-down")}</span><span>Juntou ${orig.length} empréstimo(s) · faltava ${fmt(F)}</span></button>
      ${ab ? `<div class="orig">${orig.map((p) => { const rec = p.modo === "parcelas" ? p.n - progFaltam({ ...p, fim: undefined }).length : 0;
        return `<div class="or-l"><div><b>${nomePlano(p)}</b><small>${p.modo === "parcelas" ? `${p.vals ? descrVals(p.vals) : `${p.n}x ${fmt(p.valor)}`} · recebeu ${rec}${rec ? ` (${fmt(recebidoDe(p))})` : ""}` : `vencimento ${fmt(p.valor)}`}</small></div><div class="fr"><small>faltava</small><b class="num">${fmt(faltaBruta(p))}</b></div></div>`; }).join("")}
        <div class="or-t"><span>Faltava receber</span><b class="num">${fmt(F)}</b></div><div class="or-t"><span>Valor emprestado que faltava voltar</span><b class="num">${fmt(C)}</b></div>
        ${F - C > 0 ? `<div class="or-t"><span>Juros que estavam previstos</span><b class="num">${fmt(F - C)}</b></div>` : ""}<div class="or-t"><span><b>Acordo</b></span><b class="num">${fmt(T)}</b></div>
        <button class="or-h" data-movac="${ac.id}">${ic("list")}Ver as movimentações desses empréstimos</button></div>` : ""}` : ""}</div>`;
  };
  // verificação: dinheiro do saldo que não está em nenhum plano a receber
  const comPlano = ps.some((p) => p.modo !== "mensal");
  const dentro = ps.filter((p) => !p.fim && p.modo !== "mensal").reduce((t, p) => t + Math.max(0, progRestante(p)), 0);
  const fora = saldoInv(i.id) - dentro;
  return `<div class="planos"><div class="planos-cab"><b>${ic("calendar-clock")}Recebimentos programados</b><button class="link" data-novoplano>+ Adicionar</button></div>
    ${ativos.map((p) => (p.acordo ? cartaoAcordo(p) : linha(p))).join("") || `<p>Nenhum a receber. Use para parcelas de empréstimo, vencimento de pré-fixado ou rendimento mensal.</p>`}
    ${ativos.filter((p) => p.modo !== "mensal").length ? `<button class="btn contorno ac-bt" data-juntar>${ic("repeat")}Juntar e reparcelar</button>` : ""}
    ${comPlano && Math.abs(fora) >= 1 && ativos.some((p) => p.modo !== "mensal") ? `<p class="fora-plano">${ic("search")}<span>${fora > 0 ? `<b class="num">${fmtR(fora)}</b> do saldo não estão em nenhum plano a receber.` : `Os planos esperam <b class="num">${fmtR(-fora)}</b> a mais do que o saldo do investimento.`} Confira as aplicações e os recebimentos abaixo.</span></p>` : ""}
    ${quitados.length ? `<details class="encerrados"><summary>${ic("check")}${quitados.length} ${quitados.length > 1 ? "planos já quitados" : "plano já quitado"}</summary>${quitados.map(linha).join("")}</details>` : ""}
    ${encerrados.length ? `<details class="encerrados"><summary>${ic("x")}Encerrados (${encerrados.length})</summary>${encerrados.map(linha).join("")}</details>` : ""}</div>`;
}
// movimentações dos empréstimos que entraram num acordo ficam guardadas dentro do acordo
function movsDoAcordo(i, ac) {
  const orig = origemAcordo(i, ac), ids = new Set(orig.map((p) => p.id)), aplics = new Set(orig.map((p) => p.aplic).filter(Boolean));
  return S.d.lancs.filter((l) => l.inv === i.id && ((l.prog && ids.has(l.prog)) || aplics.has(l.id) || (l.acordo && (l.acordo === ac.id || ids.has(l.acordo)))));
}
function listaMovs(i, movs) {
  const acs = progsDe(i).filter((p) => p.acordo && !(p.fim && p.fim.motivo === "acordo"));
  const escondidos = new Map();
  for (const ac of acs) for (const l of movsDoAcordo(i, ac)) escondidos.set(l.id, ac);
  const vistos = new Set(); let html = "";
  for (const l of movs) {
    const ac = escondidos.get(l.id);
    if (!ac) { html += itemLanc(l, true); continue; }
    if (vistos.has(ac.id)) continue; vistos.add(ac.id);
    const n = origemAcordo(i, ac).filter((p) => !p.acordo).length, qt = movsDoAcordo(i, ac).length;
    html += `<button class="item" data-movac="${ac.id}">${bola(i.icone, corInv(i))}<span class="meio"><div>Acordo de ${dataCurta(ac.acordo.data)}</div><small>${n} empréstimo(s) juntados · ${qt} movimentação(ões) guardadas</small></span><span class="val num">${fmt(ac.vals.reduce((t, v) => t + v, 0))}</span></button>`;
  }
  return html;
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
      <div class="inv-saldo"><small>Saldo hoje</small><b class="num">${fmtR(s)}</b><span>Rendimentos acumulados: <b class="num">${sinalR(rendTot)}</b></span>
</div>
      ${blocoPlanos(i)}
      ${i.saldoInicial > 0 ? `<div class="inv-aviso"><span><b class="num">${fmtR(i.saldoInicial)}</b> foi cadastrado como "já estava investido", por isso não saiu do saldo da conta nem aparece no histórico.</span>
        <button class="btn preto" data-converter>Esse valor saiu da minha conta</button></div>` : ""}
      ${i.meta > 0 ? `<div class="meta" style="padding:0 0 12px"><div class="meta-l"><b>Meta${i.metaNome ? ": " + esc(i.metaNome) : ""}</b><span class="num">${Math.floor(p)}%</span></div>
        <div class="meta-b"><i style="width:${p}%;background:${corInv(i)}"></i></div><small>${fmtR(s)} de ${fmtR(i.meta)} · ${s >= i.meta ? "meta alcançada!" : `faltam ${fmtR(i.meta - s)}`}</small></div>` : ""}
      <div class="inv-acoes" style="margin:4px 0 12px"><button data-mov="aplic">${ic("download")}Aplicar</button><button data-mov="resg">${ic("upload")}Resgatar</button><button data-mov="rend">${ic("trending-up")}Rendimento</button></div>
      <div style="margin:0 -18px">${listaMovs(i, movs) || `<p class="vazio" style="padding:20px">Nenhuma movimentação ainda.</p>`}</div>`;
    $("[data-ed]", el).onclick = () => editarInvest(i, pintar);
    $("[data-novoplano]", el).onclick = () => editarPlano(i, null, pintar);
    el.querySelectorAll("[data-edplano]").forEach((b) => (b.onclick = () => gerenciarPlano(i, progsDe(i).find((x) => x.id === b.dataset.edplano), pintar)));
    const jt = $("[data-juntar]", el); if (jt) jt.onclick = () => abrirAcordo(i, null, pintar);
    el.querySelectorAll("[data-abreac]").forEach((b) => (b.onclick = () => { const A = (blocoPlanos.abertos ||= new Set()); A.has(b.dataset.abreac) ? A.delete(b.dataset.abreac) : A.add(b.dataset.abreac); pintar(); }));
    el.querySelectorAll("[data-movac]").forEach((b) => (b.onclick = () => { const ac = progsDe(i).find((x) => x.id === b.dataset.movac); verLista(`Histórico do acordo de ${dataCurta(ac.acordo.data)}`, movsDoAcordo(i, ac), "Aplicações, parcelas recebidas e o desconto dos empréstimos juntados", true); }));
    const cv = $("[data-converter]", el);
    if (cv) cv.onclick = () => {
      const sh = abrirCamada(`<h2>Lançar como aplicação</h2>
        <p style="text-align:center;color:#555;margin:-6px 0 14px">${fmtR(i.saldoInicial)} vai sair da conta escolhida e aparecer no histórico como aplicação em ${esc(i.nome)}.</p>
        <form data-f><div class="dois"><label>Saiu da conta<select name="conta">${S.d.contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></label>
        <label>Data<input type="date" name="data" value="${hoje()}" required></label></div>
        <div class="botoes"><button class="btn preto">Confirmar</button></div></form>`);
      $("[data-f]", sh).onsubmit = async (e) => {
        e.preventDefault();
        S.d.lancs.push({ id: novoId(), tipo: "aplic", valor: i.saldoInicial, nota: "", data: e.target.data.value, inv: i.id, conta: e.target.conta.value });
        i.saldoInicial = 0;
        await salvar(); fechar(); aviso("Pronto: saiu da conta e entrou no histórico.");
        atualizarFundo();
      };
    };
    el.querySelectorAll("[data-mov]").forEach((b) => (b.onclick = () => abrirEditor(null, { inv: { mov: b.dataset.mov, inv: id } })));
    el.querySelectorAll("[data-lanc]").forEach((b) => (b.onclick = () => abrirLanc(b.dataset.lanc)));
  };
  pintar();
  verInvest.repintar = pintar;
}

function lerProg(f) {
  const modo = f.modo.value;
  let prog = null;
  if (modo === "venc") {
    const v = lerValor(f.vValor.value);
    if (!f.vData.value || !(v > 0)) return { erro: "Informe a data e o valor que vai receber no vencimento." };
    prog = { modo, data: f.vData.value, valor: v };
  } else if (modo === "parcelas") {
    const n = Math.round(Number(f.pN.value)), v = lerValor(f.pValor.value);
    if (!(n >= 1 && n <= 360) || !(v > 0) || !f.pInicio.value) return { erro: "Informe quantas parcelas, o valor de cada uma e o mês da primeira." };
    prog = { modo, n, valor: v, dia: Number(f.pDia.value), inicio: f.pInicio.value };
  } else if (modo === "mensal") {
    const v = lerValor(f.mValor.value);
    if (!(v > 0) || !f.mInicio.value) return { erro: "Informe o valor médio do rendimento e o mês em que começa." };
    prog = { modo, valor: v, dia: Number(f.mDia.value), inicio: f.mInicio.value };
  }
  if (prog) prog.conta = f.progConta.value;
  return { prog };
}
const ligarModo = (el) => {
  const mostrar = () => { const m = $("[name=modo]", el).value; el.querySelectorAll("[data-modo]").forEach((d) => (d.hidden = d.dataset.modo !== m)); $("[data-progconta]", el).hidden = m === "livre"; };
  $("[name=modo]", el).onchange = mostrar; mostrar();
  return mostrar;
};

function blocoProg(plano) {
  const p = plano || {}, m = p.modo || "livre";
  const prox = somaMes(mesAtual(), 1), dias = (sel) => Array.from({ length: 31 }, (_, k) => `<option ${k + 1 === sel ? "selected" : ""}>${k + 1}</option>`).join("");
  const val = (x) => (x ? nf2.format(x / 100) : "");
  return `<div class="prog-box"><label>Como você recebe?<select name="modo">
      <option value="livre" ${m === "livre" ? "selected" : ""}>Quando eu quiser (resgate livre)</option>
      <option value="venc" ${m === "venc" ? "selected" : ""}>Tudo no vencimento (pré-fixado, CDB, Tesouro)</option>
      <option value="parcelas" ${m === "parcelas" ? "selected" : ""}>Em parcelas mensais (empréstimo)</option>
      <option value="mensal" ${m === "mensal" ? "selected" : ""}>Rendimento todo mês (fundo imobiliário)</option></select></label>
    <div data-modo="venc"><div class="dois"><label>Vencimento<input type="date" name="vData" value="${p.data || ""}"></label>
      <label>Valor que vai receber (R$)<input name="vValor" inputmode="decimal" value="${val(p.modo === "venc" && p.valor)}" placeholder="Ex.: 5.600,00"></label></div>
      <small>No mês do vencimento ele aparece no Início para você confirmar. O app separa o que é rendimento.</small></div>
    <div data-modo="parcelas"><div class="dois"><label>Quantas parcelas<input name="pN" type="number" inputmode="numeric" min="1" max="360" value="${p.n || ""}" placeholder="Ex.: 10"></label>
      <label>Valor de cada parcela (R$)<input name="pValor" inputmode="decimal" value="${val(p.modo === "parcelas" && p.valor)}" placeholder="Ex.: 600,00"></label></div>
      <div class="dois"><label>Todo dia<select name="pDia">${dias(p.dia || 10)}</select></label>
      <label>Primeira parcela em<input type="month" name="pInicio" value="${p.modo === "parcelas" ? p.inicio : prox}"></label></div>
      <small>Cada mês aparece no Início. Ao confirmar, o app separa os juros do valor que você emprestou.</small></div>
    <div data-modo="mensal"><div class="dois"><label>Valor médio por mês (R$)<input name="mValor" inputmode="decimal" value="${val(p.modo === "mensal" && p.valor)}" placeholder="Ex.: 85,00"></label>
      <label>Todo dia<select name="mDia">${dias(p.dia || 15)}</select></label></div>
      <label>Começa em<input type="month" name="mInicio" value="${p.modo === "mensal" ? p.inicio : prox}"></label>
      <small>Todo mês aparece no Início. Você ajusta o valor real ao confirmar ou marca “Reinvesti”.</small></div>
    <label data-progconta>Cai na conta<select name="progConta">${S.d.contas.filter((c) => !ehBenef(c)).map((c) => `<option value="${c.id}" ${c.id === p.conta ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
  </div>`;
}

// Criar/editar um plano de recebimento de um investimento já existente
function editarPlano(inv, pl, depois) {
  const sugest = pl ? pl.principal : Math.max(0, saldoInv(inv.id, "9999-12-31") - progsDe(inv).reduce((t, x) => t + Math.max(0, progRestante(x)), 0));
  const sh = abrirCamada(`<h2>${pl ? "Editar parcelas / recebimento" : "Novo recebimento programado"}</h2>${pl && progRecebidas(pl) ? `<p style="text-align:center;color:#666;margin:-6px 0 12px;font-size:13.5px">${progRecebidas(pl)} já recebida(s). Elas continuam no histórico; a mudança vale para o que falta.</p>` : ""}<form data-f>
    <label>Valor aplicado/emprestado neste plano (R$)<input name="principal" inputmode="decimal" value="${sugest ? nf2.format(sugest / 100) : ""}" placeholder="Ex.: 300,00">
      <small style="color:#888">Só a parte deste plano. Ex.: emprestou 100 em 2x e 300 em 3x → crie dois planos.</small></label>
    ${blocoProg(pl)}<p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button>${pl ? `<button type="button" class="btn perigo" data-rem>Remover este plano</button>` : ""}</div></form>`);
  ligarModo(sh);
  const sel = $("[name=modo]", sh); if (!pl && sel.value === "livre") { sel.value = "parcelas"; sel.onchange(); }
  $("[data-f]", sh).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, er = $("[data-e]", sh);
    const lp = lerProg(f);
    if (lp.erro) return (er.textContent = lp.erro);
    if (!lp.prog) return (er.textContent = "Escolha como vai receber.");
    const pr = f.principal.value.trim() ? lerValor(f.principal.value) : 0;
    if (!Number.isFinite(pr) || pr < 0) return (er.textContent = "Valor inválido.");
    if (lp.prog.modo !== "mensal" && !(pr > 0)) return (er.textContent = "Informe quanto foi aplicado/emprestado neste plano.");
    if (pl) Object.assign(pl, lp.prog, { principal: pr });
    else (inv.progs ||= []).push({ ...lp.prog, id: novoId(), principal: pr });
    await salvar(); fechar(); aviso("Recebimento salvo."); setTimeout(() => { depois && depois(); atualizarFundo(); }, 0);
  };
  const rm = $("[data-rem]", sh);
  if (rm) rm.onclick = async () => {
    if (!(await confirmar("Remover plano", "Ele deixa de aparecer em “Investimentos a receber”. O que já foi recebido continua no histórico.", "Remover", true))) return;
    inv.progs = progsDe(inv).filter((x) => x.id !== pl.id);
    await salvar(); fechar(); aviso("Plano removido."); setTimeout(() => { depois && depois(); atualizarFundo(); }, 0);
  };
}

function editarInvest(i, depois) {
  let tipo = i ? i.tipo : TIPOS_INV[0][0];
  const el = abrirCamada(`<h2>${i ? "Editar investimento" : "Novo investimento"}</h2><form data-f>
    <label>Nome<input name="nome" maxlength="28" value="${esc(i ? i.nome : "")}" placeholder="Ex.: Reserva Nubank, Tesouro Selic" required></label>
    <label style="margin-bottom:6px">Tipo</label>
    <div class="tipos-inv">${TIPOS_INV.map(([n, ico]) => `<button type="button" data-tp="${esc(n)}" class="${n === tipo ? "sel" : ""}">${ic(ico)}<span>${esc(n)}</span></button>`).join("")}</div>
    ${i ? `<label style="margin-top:12px">Já estava aplicado antes do app (R$)<input name="saldo" inputmode="decimal" value="${nf2.format((i.saldoInicial || 0) / 100)}">
      <small style="color:#888">Valor que já existia antes de usar o app. Não mexe nas suas contas. Aplicações novas, lance pelo botão Aplicar.</small></label>`
    : `<label style="margin-top:12px">Valor inicial (R$, opcional)<input name="saldo" inputmode="decimal" placeholder="0,00"></label>
      <div class="origem">
        <label class="marcar"><input type="radio" name="origem" value="conta" checked> Saiu da conta agora (desconta do saldo)</label>
        <div class="dois"><select name="contaOrigem">${S.d.contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select>
        <input type="date" name="dataOrigem" value="${hoje()}" max="${hoje()}" aria-label="Data em que saiu da conta"></div>
        <label class="marcar"><input type="radio" name="origem" value="ja"> Já estava investido antes do app (não mexe nas contas)</label>
      </div>`}
    ${i ? `<p style="font-size:13px;color:#777;margin:0 0 12px">Parcelas, vencimentos e rendimentos mensais ficam na tela do investimento (toque nele → “Recebimentos programados”).</p>` : blocoProg(null)}
    <div class="dois"><label>Meta (opcional, R$)<input name="meta" inputmode="decimal" value="${i && i.meta ? nf2.format(i.meta / 100) : ""}" placeholder="Ex.: 10.000"></label>
    <label>Nome da meta<input name="metaNome" maxlength="28" value="${esc(i && i.metaNome ? i.metaNome : "")}" placeholder="Ex.: Reserva de emergência"></label></div>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button>${i ? `<button type="button" class="btn perigo" data-apagar>Apagar investimento</button>` : ""}</div></form>`);
  el.querySelectorAll("[data-tp]").forEach((b) => (b.onclick = () => {
    tipo = b.dataset.tp; el.querySelectorAll("[data-tp]").forEach((x) => x.classList.toggle("sel", x === b));
    if (!i && tipo === "Empréstimo" && $("[name=modo]", el).value === "livre") { $("[name=modo]", el).value = "parcelas"; mostrarModo(); }
  }));
  const mostrarModo = i ? () => {} : ligarModo(el);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, erro = $("[data-e]", el);
    // recebimento programado
    const lp = i ? {} : lerProg(f);
    if (lp.erro) return (erro.textContent = lp.erro);
    const prog = lp.prog || null;
    const saldo = f.saldo.value.trim() ? lerValor(f.saldo.value) : 0;
    const meta = f.meta.value.trim() ? lerValor(f.meta.value) : 0;
    if (!Number.isFinite(saldo) || saldo < 0) return (erro.textContent = "Valor aplicado inválido.");
    if (!Number.isFinite(meta) || meta < 0) return (erro.textContent = "Meta inválida.");
    const icone = (TIPOS_INV.find(([n]) => n === tipo) || TIPOS_INV[0])[1];
    const deConta = !i && f.origem.value === "conta" && saldo > 0;
    const dados = { nome: f.nome.value.trim(), tipo, icone, saldoInicial: deConta ? 0 : saldo, meta, metaNome: f.metaNome.value.trim() };
    let alvo = i;
    if (i) Object.assign(i, dados); else { alvo = { id: novoId(), ...dados }; S.d.invest.push(alvo); }
    const idAplic = deConta ? novoId() : null;
    if (deConta) S.d.lancs.push({ id: idAplic, tipo: "aplic", valor: saldo, nota: "", data: f.dataOrigem.value || hoje(), inv: alvo.id, conta: f.contaOrigem.value });
    if (prog) (alvo.progs ||= []).push({ ...prog, id: novoId(), principal: saldo, ...(idAplic ? { aplic: idAplic } : {}) });
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

/* ----- Recebimentos programados de investimentos ----- */
// Cada investimento pode ter vários planos (inv.progs), um para cada aplicação/empréstimo:
// modo "venc" (tudo no vencimento), "parcelas" (empréstimo / parcelas fixas), "mensal" (rendimento todo mês, ex.: FII)
const mesesEntre = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const contaPadrao = (id) => (S.d.contas.some((c) => c.id === id) ? id : (S.d.contas.find((c) => !ehBenef(c)) || S.d.contas[0]).id);
const progFeito = (p, ym) => S.d.lancs.some((l) => l.prog === p.id && l.progMes === ym) || S.d.pulados.includes("inv:" + p.id + "|" + ym);
const progRecebidas = (p) => new Set(S.d.lancs.filter((l) => l.prog === p.id).map((l) => l.progMes)).size;
// quanto do valor aplicado neste plano ainda falta voltar
function progRestante(p) {
  let volta = 0;
  for (const l of S.d.lancs) {
    if (l.prog !== p.id) continue;
    if (l.tipo === "resg") volta += l.valor;
    else if (l.tipo === "rend") volta -= l.perda ? -l.valor : l.valor;
  }
  return (p.principal || 0) - volta;
}
const progsDe = (inv) => inv.progs || [];

function progItem(inv, p, ym) {
  if (p.fim || progFeito(p, ym)) return null;
  const diaEm = (dia) => { const [a, m] = ym.split("-").map(Number); return `${ym}-${p2(Math.min(dia, new Date(a, m, 0).getDate()))}`; };
  const de = progsDe(inv).length > 1 && p.principal ? ` · de ${fmtR(p.principal)}` : "";
  if (p.modo === "venc") {
    if (p.data.slice(0, 7) !== ym) return null;
    return { inv, p, ym, data: p.data, valor: p.valor, rot: "Vencimento", sub: `vence ${dataCurta(p.data)}${de}` };
  }
  if (p.modo === "parcelas") {
    const k = mesesEntre(p.inicio, ym);
    if (k < 0 || k >= p.n) return null;
    return { inv, p, ym, data: diaEm(p.dia), valor: valParc(p, k), rot: `Parcela ${k + 1}/${p.n}`, sub: `parcela ${k + 1}/${p.n} · dia ${dataCurta(diaEm(p.dia))}${de}`, k, ultima: k === p.n - 1 };
  }
  if (p.modo === "mensal") {
    if (mesesEntre(p.inicio, ym) < 0) return null;
    return { inv, p, ym, data: diaEm(p.dia), valor: p.valor, rot: "Rendimento do mês", sub: `rendimento · dia ${dataCurta(diaEm(p.dia))}` };
  }
  return null;
}
const progPendentes = (ym) => S.d.invest.flatMap((i) => progsDe(i).map((p) => progItem(i, p, ym))).filter(Boolean).sort((a, b) => a.data.localeCompare(b.data));
// Parcelas e vencimentos de meses anteriores que ainda não foram confirmados
function progAtrasadas(ymAtual) {
  const out = [];
  for (const i of S.d.invest) for (const p of progsDe(i)) {
    const meses = p.modo === "parcelas" ? Array.from({ length: p.n }, (_, k) => somaMes(p.inicio, k)) : p.modo === "venc" ? [p.data.slice(0, 7)] : [];
    for (const ym of meses) { if (ym >= ymAtual) break; const it = progItem(i, p, ym); if (it) out.push({ ...it, atrasada: true }); }
  }
  return out;
}
// O que mostrar em "Investimentos a receber": no mês atual, inclui as atrasadas
const progAReceber = (ym) => [...(ym === mesAtual() ? progAtrasadas(ym) : []), ...progPendentes(ym)].sort((a, b) => a.data.localeCompare(b.data));
// Meses do plano ainda não recebidos
const progFaltam = (p) => p.fim ? [] : p.modo === "parcelas" ? Array.from({ length: p.n }, (_, k) => somaMes(p.inicio, k)).filter((ym) => !progFeito(p, ym)) : p.modo === "venc" ? [p.data.slice(0, 7)].filter((ym) => !progFeito(p, ym)) : [];

/* ----- Encerrar, mudar ou juntar planos de recebimento (empréstimos, CDB…) ----- */
const valParc = (p, k) => (p.vals ? p.vals[k] : p.valor);
// quanto ainda falta receber das parcelas/vencimento deste plano
const faltaReceber = (p) => p.fim ? 0 : p.modo === "parcelas" ? progFaltam(p).reduce((t, ym) => t + valParc(p, mesesEntre(p.inicio, ym)), 0) : p.modo === "venc" ? (progFaltam(p).length ? p.valor : 0) : 0;
const descrVals = (vals) => { const g = []; for (const v of vals) { const u = g[g.length - 1]; if (u && u.v === v) u.n++; else g.push({ v, n: 1 }); } return g.map((x) => `${x.n}x ${fmt(x.v)}`).join(" + "); };
const MOTIVO_FIM = { resgate: "Resgatado antes do vencimento", perda: "Não vai receber o que faltava", parado: "Parcelas que faltavam foram tiradas", acordo: "Entrou num novo acordo" };
const lancsFim = (p) => S.d.lancs.filter((l) => l.prog === p.id && l.progMes === "fim");

function gerenciarPlano(inv, p, depois) {
  const pronto = async (msg) => { await salvar(); fechar(); aviso(msg); setTimeout(() => { depois && depois(); atualizarFundo(); }, 0); };
  const op = (attr, icone, t, sub, perigo) => `<button class="opt-l${perigo ? " perigo" : ""}" ${attr}><span class="bo2">${ic(icone)}</span><span class="mm"><b>${t}</b><small>${sub}</small></span>${ic("chevron-right")}</button>`;
  const falta = faltaReceber(p), resta = Math.max(0, progRestante(p));
  let ops = "";
  if (p.fim) {
    const novo = p.fim.acordo && progsDe(inv).find((x) => x.id === p.fim.acordo);
    ops += p.fim.motivo === "acordo"
      ? (novo ? op("data-desacordo", "repeat", "Desfazer o acordo", "Os empréstimos voltam como estavam antes do acordo.") : "")
      : op("data-reabrir", "calendar-clock", "Reabrir este plano", p.fim.motivo === "parado" ? "As parcelas que faltavam voltam para “a receber”." : "Apaga o lançamento de encerramento e as parcelas voltam para “a receber”.");
  } else {
    if (!p.vals) ops += op("data-editar", "pencil", "Editar o plano", "Mudar valor, parcelas ou datas.");
    if (p.modo !== "mensal") {
      ops += op("data-resg", "trending-up", p.modo === "venc" ? "Resgatei antes do vencimento" : "Recebi tudo de uma vez", "Informe quanto caiu na conta. O app calcula o rendimento real.");
      ops += op("data-mudou", "repeat", "Mudou o combinado (recalcular)", "Novo valor, nº de parcelas ou data para o que falta.");
      ops += op("data-perda", "x", "Não vou receber o que falta", `O que falta voltar (${fmtR(resta)}) vira perda e o plano é encerrado.`, true);
    }
    ops += op("data-parar", "calendar", p.modo === "mensal" ? "Parar este rendimento" : "Só tirar as parcelas que faltam", p.modo === "mensal" ? "Deixa de aparecer todo mês." : "Para de mostrar “a receber”. O valor fica no investimento para decidir depois.");
    if (p.acordo) ops += op("data-desacordo", "repeat", "Desfazer este acordo", "Os empréstimos antigos voltam como estavam.");
  }
  const el = abrirCamada(`<h2>${p.acordo ? "Acordo" : "Recebimento programado"}</h2>
    <p class="gp-res">${resumoProg(p)}</p>${p.fim ? "" : `<p class="gp-sub">O que já foi recebido continua no histórico.</p>`}
    <div class="opts">${ops}</div>`);
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  on("[data-editar]", () => trocarCamada(() => editarPlano(inv, p, depois)));
  on("[data-mudou]", () => trocarCamada(() => abrirAcordo(inv, [p.id], depois)));
  on("[data-parar]", async () => {
    if (!(await confirmar(p.modo === "mensal" ? "Parar rendimento" : "Tirar parcelas que faltam", p.modo === "mensal" ? "Ele deixa de aparecer todo mês. Dá para reabrir depois." : `Saem ${progFaltam(p).length} parcela(s) de “a receber”. O valor continua no investimento. Dá para reabrir depois.`, "Confirmar"))) return;
    p.fim = { data: hoje(), motivo: "parado" }; pronto("Pronto. Parcelas tiradas.");
  });
  on("[data-perda]", async () => {
    const txt = resta > 0 ? `${fmtR(resta)} (o que ainda faltava voltar do valor ${p.modo === "venc" ? "aplicado" : "emprestado"}) vira perda no investimento. Não mexe no saldo da conta nem entra como despesa.`
      : "O valor emprestado já voltou todo; só deixa de receber os juros. O plano é encerrado.";
    if (!(await confirmar("Não vou receber", txt, "Confirmar", true))) return;
    if (resta > 0) S.d.lancs.push({ id: novoId(), tipo: "rend", perda: true, valor: resta, nota: "Não recebido", data: hoje(), inv: inv.id, conta: null, prog: p.id, progMes: "fim" });
    p.fim = { data: hoje(), motivo: "perda" }; pronto("Plano encerrado.");
  });
  on("[data-resg]", () => {
    const contas = S.d.contas.filter((c) => !ehBenef(c));
    const sh = abrirCamada(`<h2>${p.modo === "venc" ? "Resgatei antes do vencimento" : "Recebi tudo de uma vez"}</h2>
      <form data-f><label>Quanto caiu na conta (R$)<input name="valor" inputmode="decimal" placeholder="Ex.: ${nf2.format(resta / 100)}" required></label>
      <div class="dois"><label>Data<input type="date" name="data" value="${hoje()}" max="${hoje()}" required></label>
      <label>Caiu na conta<select name="conta">${contas.map((c) => `<option value="${c.id}" ${c.id === contaPadrao(p.conta) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
      <div class="calc" data-calc></div><div class="botoes"><button class="btn preto">Confirmar e encerrar</button></div></form>`);
    const f = $("[data-f]", sh), calc = $("[data-calc]", sh);
    const conta0 = () => {
      const v = lerValor(f.valor.value) || 0, d = v - resta;
      calc.innerHTML = `<div class="rl"><span>Faltava voltar do valor ${p.modo === "venc" ? "aplicado" : "emprestado"}</span><b class="num">${fmt(resta)}</b></div><div class="rl"><span>Recebido agora</span><b class="num">${fmt(v)}</b></div>
        <div class="rl"><span><b>${d < 0 ? "Perda" : "Rendeu de verdade"}</b>${falta > resta ? `<small>em vez dos ${fmt(falta - resta)} previstos</small>` : ""}</span><b class="num ${d < 0 ? "neg" : "pos"}">${d < 0 ? "− " : "+ "}${fmt(Math.abs(d))}</b></div>`;
    };
    f.valor.oninput = conta0; conta0();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = lerValor(f.valor.value);
      if (!(v > 0)) return aviso("Digite quanto caiu na conta.");
      registrarReceb(inv, p, "fim", v, f.data.value, f.conta.value, false);
      p.fim = { data: f.data.value, motivo: "resgate" };
      await salvar(); fechar(); fechar(); aviso("Resgate lançado e plano encerrado."); setTimeout(() => { depois && depois(); atualizarFundo(); }, 0);
    };
  });
  on("[data-reabrir]", async () => {
    if (!(await confirmar("Reabrir plano", p.fim.motivo === "parado" ? "As parcelas que faltavam voltam para “a receber”." : "O lançamento de encerramento é apagado e as parcelas voltam para “a receber”.", "Reabrir"))) return;
    const ids = lancsFim(p).map((x) => x.id); S.d.lancs = S.d.lancs.filter((x) => !ids.includes(x.id));
    delete p.fim; pronto("Plano reaberto.");
  });
  on("[data-desacordo]", async () => {
    const ac = p.acordo ? p : progsDe(inv).find((x) => x.id === p.fim.acordo);
    if (progRecebidas(ac)) return aviso("Esse acordo já tem parcela recebida. Desfaça os recebimentos dele antes.");
    if (!(await confirmar("Desfazer acordo", "O acordo é apagado e os empréstimos antigos voltam como estavam.", "Desfazer", true))) return;
    S.d.lancs = S.d.lancs.filter((l) => l.acordo !== ac.id);
    for (const x of progsDe(inv)) if (x.fim && x.fim.acordo === ac.id) delete x.fim;
    inv.progs = progsDe(inv).filter((x) => x.id !== ac.id);
    pronto("Acordo desfeito.");
  });
}

// Juntar um ou mais planos num novo acordo, com parcelas do jeito que você quiser
function abrirAcordo(inv, pre, depois) {
  const cand = progsDe(inv).filter((p) => !p.fim && p.modo !== "mensal" && faltaReceber(p) > 0);
  if (!cand.length) return aviso("Não há parcelas faltando para reparcelar.");
  const sel = new Set(pre && pre.length ? pre : cand.map((p) => p.id));
  let passo = 1, total = 0, vals = [], inicio = somaMes(mesAtual(), 1), dia = (cand.find((p) => p.dia) || {}).dia || 10, vParc = 0, nParc = 0, modoP = "valor";
  const el = abrirCamada(`<div data-ac></div>`, { aoFechar: () => setTimeout(() => { depois && depois(); atualizarFundo(); }, 0) });
  const escolhidos = () => cand.filter((p) => sel.has(p.id));
  const somaFalta = () => escolhidos().reduce((t, p) => t + faltaReceber(p), 0);
  const somaCap = () => escolhidos().reduce((t, p) => t + Math.max(0, progRestante(p)), 0);
  const montar = () => {
    if (modoP === "valor" && vParc > 0) { const n = Math.floor(total / vParc), r = total - n * vParc; vals = Array(n).fill(vParc); if (r > 0) { if (n && r < vParc / 2) vals[n - 1] += r; else vals.push(r); } }
    else if (modoP === "n" && nParc > 0) { const b = Math.floor(total / nParc); vals = Array(nParc).fill(b); vals[nParc - 1] += total - b * nParc; }
  };
  const pintar = () => {
    const c = $("[data-ac]", el);
    const cab = (t) => `<div class="ac-cab">${passo > 1 ? `<button class="ac-volta" data-volta>${ic("chevron-left")}</button>` : "<span></span>"}<h2>${t}</h2><small>${passo} de 3</small></div>`;
    if (passo === 1) {
      c.innerHTML = cab("Juntar e reparcelar") + `<p class="gp-sub">Escolha o que entra no novo acordo. O que já foi recebido fica no histórico.</p>
        <div class="box sem-pad ac-lista">${cand.map((p) => `<label class="ac-pl"><input type="checkbox" value="${p.id}" ${sel.has(p.id) ? "checked" : ""}>
          <span class="mm"><b>${p.modo === "venc" ? "Vencimento " + dataCurta(p.data) : p.acordo ? "Acordo " + mesCurto(p.inicio) + "/" + p.inicio.slice(2, 4) : "Empréstimo " + fmt(p.principal || 0)}</b>
          <small>${p.modo === "parcelas" ? `${p.vals ? descrVals(p.vals) : `${p.n}x de ${fmt(p.valor)}`} · recebeu ${p.n - progFaltam(p).length}` : `vai receber ${fmt(p.valor)}`}</small></span>
          <span class="fr"><small>falta</small><b class="num">${fmt(faltaReceber(p))}</b></span></label>`).join("")}</div>
        <div class="ac-tot"><span>${sel.size} selecionado(s)${somaFalta() > somaCap() ? `<small>${fmt(somaCap())} emprestado que falta voltar + ${fmt(somaFalta() - somaCap())} de juros previstos</small>` : ""}</span><b class="num">Falta ${fmtR(somaFalta())}</b></div>
        <button class="btn preto" data-seg ${sel.size ? "" : "disabled"}>Continuar</button>`;
      c.querySelectorAll("input[type=checkbox]").forEach((x) => (x.onchange = () => { x.checked ? sel.add(x.value) : sel.delete(x.value); total = 0; vals = []; pintar(); }));
    } else if (passo === 2) {
      const soma = vals.reduce((t, v) => t + v, 0), ok = vals.length && soma === total;
      c.innerHTML = cab("Novo acordo") + `<form data-f onsubmit="return false">
        <label>Quanto vai receber no total (R$)<input name="total" inputmode="decimal" value="${total ? nf2.format(total / 100) : ""}"></label>
        <div class="dois"><label>Primeira parcela<input type="month" name="ini" value="${inicio}"></label><label>Todo dia<input name="dia" inputmode="numeric" value="${dia}"></label></div>
        <div class="seg3"><button type="button" data-mp="valor" class="${modoP === "valor" ? "on" : ""}">Valor de cada parcela</button><button type="button" data-mp="n" class="${modoP === "n" ? "on" : ""}">Nº de parcelas</button></div>
        ${modoP === "valor" ? `<label>Valor de cada parcela (R$)<input name="vp" inputmode="decimal" value="${vParc ? nf2.format(vParc / 100) : ""}" placeholder="Ex.: 100,00"></label>`
          : `<label>Em quantas parcelas<input name="np" inputmode="numeric" value="${nParc || ""}" placeholder="Ex.: 10"></label>`}</form>
        ${vals.length ? `<div class="ac-parc-cab"><b>Parcelas</b><small>toque num valor para mudar</small></div>
          <div class="grade-p">${vals.map((v, k) => `<button class="pc" data-pc="${k}"><small>${k + 1} · ${mesCurto(somaMes(inicio, k))}/${somaMes(inicio, k).slice(2, 4)}</small><b class="num">${fmt(v)}</b></button>`).join("")}
            <button class="pc mais" data-maispc>${ic("plus")}</button></div>
          <p class="soma ${ok ? "ok" : "erro"}">${ok ? `${ic("check")} Soma das parcelas: ${fmt(soma)}` : `Soma das parcelas ${fmt(soma)} ≠ total ${fmt(total)}`}</p>` : `<p class="gp-sub">Digite o valor de cada parcela ou o número de parcelas.</p>`}
        <button class="btn preto" data-seg ${ok ? "" : "disabled"}>Ver resumo</button>`;
      const f = $("[data-f]", c);
      f.total.onchange = () => { total = lerValor(f.total.value) || 0; montar(); pintar(); };
      f.ini.onchange = () => { inicio = f.ini.value || inicio; pintar(); };
      f.dia.onchange = () => { dia = Math.min(28, Math.max(1, parseInt(f.dia.value) || dia)); pintar(); };
      if (f.vp) f.vp.onchange = () => { vParc = lerValor(f.vp.value) || 0; montar(); pintar(); };
      if (f.np) f.np.onchange = () => { nParc = Math.min(120, parseInt(f.np.value) || 0); montar(); pintar(); };
      c.querySelectorAll("[data-mp]").forEach((b) => (b.onclick = () => { modoP = b.dataset.mp; montar(); pintar(); }));
      c.querySelectorAll("[data-pc]").forEach((b) => (b.onclick = () => {
        const k = Number(b.dataset.pc);
        const sh = abrirCamada(`<h2>Parcela ${k + 1}</h2><form data-f><label>Valor (R$)<input name="v" inputmode="decimal" value="${nf2.format(vals[k] / 100)}"></label>
          <div class="botoes"><button class="btn preto">Salvar</button><button type="button" class="btn perigo" data-tira>Tirar esta parcela</button></div></form>`);
        $("[data-f]", sh).onsubmit = (e) => { e.preventDefault(); const v = lerValor(e.target.v.value); if (!(v > 0)) return aviso("Valor inválido."); vals[k] = v; fechar(); pintar(); };
        $("[data-tira]", sh).onclick = () => { vals.splice(k, 1); fechar(); pintar(); };
      }));
      const mp = $("[data-maispc]", c); if (mp) mp.onclick = () => { const r = total - vals.reduce((t, v) => t + v, 0); vals.push(r > 0 ? r : vals[vals.length - 1] || 0); pintar(); };
    } else {
      const F = somaFalta(), C = somaCap(), dif = total - F, perda = Math.max(0, C - total);
      c.innerHTML = cab("Resumo") + `<div class="antes-dep"><div class="ad"><small>Antes</small><b>${sel.size} plano(s)</b><em class="num">falta ${fmt(F)}</em></div>
          <div class="seta2">${ic("chevron-right")}</div><div class="ad dep"><small>Depois</small><b>1 acordo</b><span>${descrVals(vals)}</span><em class="num">vai receber ${fmt(total)}</em></div></div>
        <div class="box"><div class="rl"><span>Faltava receber</span><b class="num">${fmt(F)}</b></div><div class="rl"><span>Novo acordo</span><b class="num">${fmt(total)}</b></div>
          <div class="rl"><span><b>Diferença</b><small>${dif < 0 ? (perda ? `${fmt(perda)} do valor emprestado não volta: entra como perda` : "você deixa de ganhar esse valor de juros (não é perda do valor emprestado)") : dif > 0 ? "a mais: entra como juros quando receber" : "mesmo valor"}</small></span><b class="num ${dif < 0 ? "neg" : dif > 0 ? "pos" : ""}">${dif < 0 ? "− " : dif > 0 ? "+ " : ""}${fmt(Math.abs(dif))}</b></div></div>
        <div class="box"><h3>O que acontece</h3>
          <div class="li">${ic("check")}<span>As parcelas antigas que faltavam saem de “a receber”.</span></div>
          <div class="li">${ic("check")}<span>O que você já recebeu continua no histórico.</span></div>
          <div class="li">${ic("check")}<span>Entra 1 acordo com ${vals.length} parcela(s), a primeira em ${dataCurta(`${inicio}-${p2(dia)}`)}/${inicio.slice(2, 4)}.</span></div>
          <div class="li">${ic("check")}<span>Dá para desfazer: tocando no acordo → “Desfazer este acordo”.</span></div></div>
        <button class="btn preto" data-ok>Confirmar novo acordo</button>`;
      $("[data-ok]", c).onclick = async () => {
        const ids = [...sel], base = escolhidos()[0];
        const novo = { id: novoId(), modo: "parcelas", n: vals.length, valor: vals[0], vals: [...vals], inicio, dia, conta: base.conta, principal: Math.min(C, total), acordo: { data: hoje(), de: ids } };
        inv.progs.push(novo);
        for (const p of escolhidos()) p.fim = { data: hoje(), motivo: "acordo", acordo: novo.id };
        if (perda > 0) S.d.lancs.push({ id: novoId(), tipo: "rend", perda: true, valor: perda, nota: "Desconto no acordo", data: hoje(), inv: inv.id, conta: null, acordo: novo.id });
        await salvar(); fechar(); aviso("Novo acordo criado.");
      };
    }
    const v = $("[data-volta]", c); if (v) v.onclick = () => { passo--; pintar(); };
    const sg = $("[data-seg]", c); if (sg) sg.onclick = () => {
      if (passo === 1) { if (!total || !vals.length) { total = somaFalta(); vParc = 0; vals = []; } }
      passo++; pintar();
    };
  };
  pintar();
}

// Quanto de um recebimento é juros/rendimento. O resto é o valor emprestado/aplicado voltando.
// Parcelas: cada uma devolve 1/n do valor emprestado; a última devolve o que faltar. Nunca vira "perda".
function jurosDe(p, v, tudo) {
  if (p.modo === "mensal" && !tudo) return v;
  const resta = Math.max(0, progRestante(p));
  if (p.modo === "venc" || tudo) return v - resta; // vencimento, ou recebeu tudo de uma vez/resgatou antes
  const faltam = p.n - progRecebidas(p);
  const parte = p.vals ? Math.round(((p.principal || 0) * v) / p.vals.reduce((t, x) => t + x, 0)) : Math.round((p.principal || 0) / p.n);
  const capital = Math.min(v, faltam <= 1 ? resta : Math.min(resta, parte));
  return v - capital;
}
// Grava um recebimento: resgate do valor (cai na conta) + juros/rendimento
function registrarReceb(inv, p, ym, v, data, conta, reinv) {
  const j = jurosDe(p, v, ym === "fim"), novos = [];
  if (j !== 0) { const r = { id: novoId(), tipo: "rend", valor: Math.abs(j), nota: "", data, inv: inv.id, conta: null, prog: p.id, progMes: ym }; if (j < 0) r.perda = true; novos.push(r); }
  if (!reinv) novos.push({ id: novoId() + "r", tipo: "resg", valor: v, nota: "", data, inv: inv.id, conta, prog: p.id, progMes: ym });
  novos.forEach((n) => S.d.lancs.push(n));
  return novos;
}
// Plano de recebimento criado junto com esta aplicação (empréstimo → parcelas)
function planoDaAplic(l) {
  const ps = progsDe(invest(l.inv));
  const lig = ps.find((p) => p.aplic === l.id);
  if (lig) return lig;
  // dados antigos, sem ligação: o plano sem dona com o mesmo valor; ou o único plano, se só houver uma aplicação
  const soltos = ps.filter((p) => !p.aplic && p.modo !== "mensal");
  const mesmo = soltos.filter((p) => p.principal === l.valor);
  if (mesmo.length === 1) return mesmo[0];
  const aplics = S.d.lancs.filter((x) => x.inv === l.inv && x.tipo === "aplic");
  return soltos.length === 1 && aplics.length === 1 ? soltos[0] : null;
}
const planoDe = (l) => (l.prog ? progsDe(invest(l.inv)).find((p) => p.id === l.prog) || null : null);
const grupoReceb = (l) => S.d.lancs.filter((x) => x.prog === l.prog && x.progMes === l.progMes && x.inv === l.inv && ehInvest(x.tipo));
const rotuloReceb = (p, ym) => !p ? "Recebimento" : ym === "fim" ? (p.fim && p.fim.motivo === "perda" ? "Não recebido" : p.modo === "venc" ? "Resgate antecipado" : "Recebido de uma vez") : p.modo === "parcelas" ? `Parcela ${mesesEntre(p.inicio, ym) + 1}/${p.n}` : p.modo === "venc" ? "Vencimento" : "Rendimento do mês";

// Uma linha por recebimento (em vez de "Resgate" + "Rendimento" separados)
function itemReceb(l, comData) {
  const g = grupoReceb(l), r = g.find((x) => x.tipo === "resg"), j = g.find((x) => x.tipo === "rend");
  if (l.tipo !== "resg" && r) return "";
  const i = invest(l.inv), p = planoDe(l), partes = comData === true ? [dataCurta(l.data)] : [];
  const nomeJ = p && p.modo === "parcelas" ? "juros" : "rendimento";
  if (!r && l.progMes === "fim" && j && j.perda) return `<button class="item" data-lanc="${l.id}">${bola(i.icone, corInv(i))}
    <span class="meio"><div>Não recebido · ${esc(i.nome)}</div><small>${comData === true ? dataCurta(l.data) + " · " : ""}perda · plano encerrado</small></span>
    <span class="val num neg">- ${fmt(j.valor)}</span></button>`;
  if (r) { partes.push(esc(conta(r.conta).nome)); if (j) partes.push(`${j.perda ? "- " : ""}${fmt(j.valor)} de ${nomeJ}`); }
  else if (p && p.modo !== "mensal") partes.push(`<b style="color:#C62828">incompleto · toque para corrigir</b>`);
  else partes.push("reinvestido");
  return `<button class="item" data-lanc="${l.id}">${bola(i.icone, corInv(i))}
    <span class="meio"><div>${esc(rotuloReceb(p, l.progMes))} · ${esc(i.nome)}</div><small>${partes.join(" · ")}</small></span>
    <span class="val num">+ ${fmt(r ? r.valor : l.valor)}</span></button>`;
}

// Ver / corrigir / desfazer um recebimento já confirmado (mexe no resgate e nos juros juntos)
function abrirReceb(l0) {
  const g = grupoReceb(l0), r = g.find((x) => x.tipo === "resg"), j = g.find((x) => x.tipo === "rend");
  const base = r || j || l0, inv = S.d.invest.find((x) => x.id === base.inv), p = planoDe(base);
  if (!inv || !p) {
    // plano removido: só dá para desfazer
    return (async () => { if (await confirmar("Apagar recebimento", "O plano deste recebimento não existe mais. Apagar o recebimento?", "Apagar", true)) {
      const ids = g.map((x) => x.id); S.d.lancs = S.d.lancs.filter((x) => !ids.includes(x.id)); await salvar(); aviso("Apagado."); atualizarFundo(); desenhar(); } })();
  }
  if (base.progMes === "fim" && !r) return (async () => {
    if (!(await confirmar("Desfazer “não vou receber”", `A perda de ${fmtR(j ? j.valor : 0)} é apagada e as parcelas voltam para “a receber”.`, "Desfazer", true))) return;
    const ids = g.map((x) => x.id); S.d.lancs = S.d.lancs.filter((x) => !ids.includes(x.id)); delete p.fim;
    await salvar(); aviso("Desfeito."); atualizarFundo(); desenhar();
  })();
  const ym = base.progMes, hj = hoje(), jv = j ? (j.perda ? -j.valor : j.valor) : 0, total = r ? r.valor : 0;
  const nomeJ = p.modo === "parcelas" ? "juros" : "rendimento";
  const contas = S.d.contas.filter((c) => !ehBenef(c));
  const explica = r ? `Recebido ${fmtR(total)}${p.modo !== "mensal" ? `: ${fmtR(total - jv)} do valor ${p.modo === "parcelas" ? "emprestado" : "aplicado"} voltou + ${fmtR(jv)} de ${nomeJ}` : ""}`
    : p.modo === "mensal" ? `Rendimento de ${fmtR(jv)} reinvestido` : `<b style="color:#C62828">Falta o valor que caiu na conta.</b> Confira e salve para corrigir.`;
  const el = abrirCamada(`<h2>${esc(rotuloReceb(p, ym))}</h2>
    <p style="text-align:center;color:#555;margin:-6px 0 12px">${esc(inv.nome)}<br>${explica}</p>
    <form data-f>
      <div class="dois"><label>Valor recebido (R$)<input name="valor" inputmode="decimal" value="${nf2.format((r ? r.valor : (p.modo === "mensal" ? j.valor : p.valor)) / 100)}" required></label>
      <label>Caiu na conta<select name="conta">${contas.map((c) => `<option value="${c.id}" ${c.id === contaPadrao(r ? r.conta : p.conta) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
      ${p.modo === "mensal" ? `<label class="marcar" style="margin:-4px 0 12px"><input type="checkbox" name="reinv" ${r ? "" : "checked"}> Reinvesti (não caiu na conta)</label>` : ""}
      <label>Data<input type="date" name="data" value="${base.data}" max="${hj}" required></label>
      <p style="font-size:12.5px;color:#777;margin:0 0 10px">Ao salvar, o app recalcula quanto é ${nomeJ}.</p>
      <div class="botoes"><button class="btn preto">Salvar</button>
        <button type="button" class="btn perigo" data-desf>Desfazer recebimento</button></div>
    </form>`);
  const tirar = () => { const ids = grupoReceb(base).map((x) => x.id); S.d.lancs = S.d.lancs.filter((x) => !ids.includes(x.id)); };
  $("[data-desf]", el).onclick = async () => {
    if (!(await confirmar("Desfazer recebimento", `${rotuloReceb(p, ym)} de ${inv.nome} volta para “Investimentos a receber” e o valor sai do saldo da conta.`, "Desfazer", true))) return;
    tirar(); if (ym === "fim") delete p.fim; await salvar(); fechar(); aviso("Desfeito. Voltou para “a receber”."); atualizarFundo();
  };
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, v = lerValor(f.valor.value);
    if (!(v > 0)) return aviso("Digite o valor recebido.");
    if (f.data.value > hj) return aviso("A data não pode ser no futuro.");
    tirar();
    registrarReceb(inv, p, ym, v, f.data.value, f.conta.value, f.reinv && f.reinv.checked);
    await salvar(); fechar(); aviso("Recebimento atualizado."); atualizarFundo();
  };
}

function confirmarProg(invId, planoId, ym) {
  const inv = S.d.invest.find((x) => x.id === invId);
  const p = inv && progsDe(inv).find((x) => x.id === planoId);
  const it = p && progItem(inv, p, ym);
  if (!it) return;
  const hj = hoje(), atrasada = ym < mesAtual();
  const j0 = jurosDe(p, it.valor);
  const explica = p.modo === "mensal" ? "Rendimento do mês" : `${fmtR(it.valor - j0)} do valor ${p.modo === "parcelas" ? "emprestado" : "aplicado"} volta + <b>${fmtR(j0)}</b> de ${p.modo === "parcelas" ? "juros" : "rendimento"}`;
  const contas = S.d.contas.filter((c) => !ehBenef(c));
  const el = abrirCamada(`<h2>Recebeu?</h2>
    <p style="text-align:center;color:#555;margin:-6px 0 12px">${esc(inv.nome)} · ${it.rot}${atrasada ? ` · <b style="color:#C62828">de ${nomeMes(ym)}</b>` : ""}<br>${explica}</p>
    <form data-f>
      <div class="dois"><label>Valor recebido (R$)<input name="valor" inputmode="decimal" value="${nf2.format(it.valor / 100)}" required></label>
      <label>Caiu na conta<select name="conta">${contas.map((c) => `<option value="${c.id}" ${c.id === contaPadrao(p.conta) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
      ${p.modo === "mensal" ? `<label class="marcar" style="margin:-4px 0 12px"><input type="checkbox" name="reinv"> Reinvesti (não caiu na conta, ficou no investimento)</label>` : ""}
      <label>Data<input type="date" name="data" value="${atrasada ? hj : it.data < hj ? it.data : hj}" max="${hj}" required></label>
      <div class="botoes"><button class="btn preto">Confirmar recebimento</button>
        ${p.modo === "mensal" ? `<button type="button" class="btn leve" data-pular>Não veio este mês</button>` : `<button type="button" class="btn leve" data-nao>Ainda não recebi</button>`}</div>
    </form>`);
  const nao = $("[data-nao]", el); if (nao) nao.onclick = () => fechar();
  const pul = $("[data-pular]", el);
  if (pul) pul.onclick = async () => { S.d.pulados.push("inv:" + p.id + "|" + ym); await salvar(); fechar(); desenhar(); aviso("Ok, pulado neste mês."); };
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, v = lerValor(f.valor.value);
    if (!(v > 0)) return aviso("Digite o valor recebido.");
    if (f.data.value > hj) return aviso("A data não pode ser no futuro.");
    const reinv = f.reinv && f.reinv.checked;
    const novos = registrarReceb(inv, p, ym, v, f.data.value, f.conta.value, reinv);
    await salvar(); fechar(); atualizarFundo();
    aviso(reinv ? "Rendimento registrado e reinvestido." : `Recebido: ${fmtR(v)}.`, { rotulo: "Desfazer", fn: async () => {
      const ids = novos.map((n) => n.id); S.d.lancs = S.d.lancs.filter((x) => !ids.includes(x.id)); await salvar(); atualizarFundo(); aviso("Desfeito.");
    } });
  };
}

function resumoProg(p) {
  if (!p) return "";
  if (p.fim) {
    const r = p.modo === "venc" ? `Vencimento ${dataCurta(p.data)}/${p.data.slice(0, 4)}` : p.modo === "mensal" ? "Rendimento mensal" : p.vals ? `Acordo ${descrVals(p.vals)}` : `${p.n}x de ${fmtR(p.valor)}`;
    return `${r} · <b>${MOTIVO_FIM[p.fim.motivo] || "Encerrado"}</b> em ${dataCurta(p.fim.data)}`;
  }
  const de = p.principal ? ` (aplicado ${fmtR(p.principal)})` : "";
  if (p.modo === "venc") return `Vence ${dataCurta(p.data)}/${p.data.slice(0, 4)} · vai receber ${fmtR(p.valor)}${de}`;
  if (p.modo === "parcelas") {
    const faltam = progFaltam(p), atr = faltam.filter((m) => m < mesAtual()).length;
    const prox = faltam.length ? `próxima: ${nomeMes(faltam[0])}` : "todas recebidas";
    return `${p.vals ? descrVals(p.vals) : `${p.n}x de ${fmtR(p.valor)}`}${de} · ${p.n - faltam.length} de ${p.n} recebidas · ${prox}${atr ? ` · <b style="color:#C62828">${atr} atrasada(s)</b>` : ""}${faltam.length ? ` · falta receber ${fmtR(faltaReceber(p))}` : ""}`;
  }
  return `Rendimento todo dia ${p.dia} · cerca de ${fmtR(p.valor)} por mês`;
}

// Migra o plano único antigo (inv.prog) para a lista de planos
function migrarPlanos(d) {
  for (const i of d.invest || []) {
    if (i.prog && !i.progs) {
      const p = { ...i.prog, id: i.id };
      if (!p.principal && p.modo !== "mensal") {
        let s = i.saldoInicial || 0;
        for (const l of d.lancs) if (l.inv === i.id && l.tipo === "aplic") s += l.valor;
        p.principal = s;
      }
      i.progs = [p];
    }
    delete i.prog;
  }
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
    .filter((f) => f.inicio <= ym && (!f.fim || ym < f.fim) && !S.d.pulados.includes(f.id + "|" + ym) && !S.d.lancs.some((l) => l.fixo === f.id && (l.fixoMes || l.data.slice(0, 7)) === ym))
    .sort((a, b) => a.dia - b.dia);
}
// Confirmar = já paguei/recebi. Pergunta a data, porque normalmente é antes ou depois do vencimento.
function confirmarFixoRapido(fid, ym) {
  const f = fixoPorId(fid);
  if (!f) return;
  const venc = dataFixo(f, ym), hj = hoje(), rec = f.tipo === "receita";
  const c = cat(f.cat);
  const el = abrirCamada(`<h2>${rec ? "Já recebeu?" : "Já pagou?"}</h2>
    <p style="text-align:center;color:#555;margin:-6px 0 14px">${esc(f.nota || c.nome)} · <b>${fmtR(f.valor)}</b><br>${rec ? "Previsto" : "Vence"} dia ${dataCurta(venc)}.
      Só confirme quando o dinheiro ${rec ? "entrar" : "sair"} de verdade: aí ele entra no saldo.</p>
    <div class="botoes">
      <button class="btn preto" data-dt="${hj}">${rec ? "Recebi" : "Paguei"} hoje (${dataCurta(hj)})</button>
      ${venc < hj ? `<button class="btn contorno" data-dt="${venc}">${rec ? "Recebi" : "Paguei"} no dia ${dataCurta(venc)}</button>` : ""}
      <label style="margin:4px 0 0">Outra data<input type="date" data-outra max="${hj}"></label>
      <button class="btn leve" data-nao>${rec ? "Ainda não recebi" : "Ainda não paguei"}</button>
    </div>`);
  const usar = async (data) => {
    const novo = { id: novoId(), tipo: f.tipo, valor: f.valor, nota: f.nota || "", data, cat: f.cat, conta: f.cartao ? null : (S.d.contas.some((x) => x.id === f.conta) ? f.conta : S.d.contas[0].id), cartao: f.cartao && S.d.cartoes.some((x) => x.id === f.cartao) ? f.cartao : null, fixo: f.id, fixoMes: ym };
    S.d.lancs.push(novo);
    await salvar(); fechar(); desenhar();
    aviso(rec ? "Recebimento confirmado." : "Pagamento confirmado.", { rotulo: "Desfazer", fn: async () => {
      S.d.lancs = S.d.lancs.filter((x) => x.id !== novo.id); await salvar(); desenhar(); aviso("Desfeito. Voltou para “Fixos a confirmar”.");
    } });
  };
  el.querySelectorAll("[data-dt]").forEach((b) => (b.onclick = () => usar(b.dataset.dt)));
  $("[data-outra]", el).onchange = (e) => { if (e.target.value) usar(e.target.value); };
  $("[data-nao]", el).onclick = () => fechar();
}

function gerirFixos() {
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    $("[data-c]", el).innerHTML = `<h2>Lançamentos recorrentes</h2>
      <p style="text-align:center;color:#666;margin:-6px 0 10px;font-size:14px">Aparecem todo mês no Início para você confirmar com um toque. Crie aqui ou toque em <b>↻ Recorrente</b> ao adicionar ou editar um lançamento.</p>
      <button class="btn preto" data-novofixo style="margin-bottom:10px">${ic("plus")}Novo recorrente</button>
      <div class="lista-escolha">${S.d.fixos.length ? S.d.fixos.map((f) => `<button data-e="${f.id}">${bola(cat(f.cat).icone, cat(f.cat).cor)}
        <span>${esc(f.nota || cat(f.cat).nome)}<br><small style="color:#777">${f.tipo === "receita" ? "Receita" : "Despesa"} · todo dia ${f.dia}${f.fim ? ` até ${nomeMes(somaMes(f.fim, -1))}` : ""} · ${fmtR(f.valor)}${f.cartao ? " · " + esc(cartao(f.cartao).nome) : ""}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")
        : `<p class="vazio" style="padding:24px">Nenhum lançamento fixo ainda.</p>`}</div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarFixo(fixoPorId(b.dataset.e), pintar)));
    $("[data-novofixo]", el).onclick = () => novoFixo(pintar);
  };
  pintar();
}

// Criar um recorrente direto pela lista (sem lançar nada agora)
function novoFixo(depois) {
  let tipo = "despesa";
  const ym = mesAtual(), diaHoje = Number(hoje().slice(8));
  const dias = Array.from({ length: 31 }, (_, i) => `<option ${i + 1 === diaHoje ? "selected" : ""}>${i + 1}</option>`).join("");
  const el = abrirCamada(`<h2>Novo recorrente</h2><form data-f>
    <div class="alternar" style="margin:0 auto 14px"><button type="button" data-tp="despesa" class="ativo">Despesa</button><button type="button" data-tp="receita">Receita</button></div>
    <label>Nota<input name="nota" maxlength="80" placeholder="Ex.: Aluguel, Internet, Salário" required></label>
    <div class="dois"><label>Valor (R$)<input name="valor" inputmode="decimal" placeholder="0,00" required></label>
    <label>Todo dia<select name="dia">${dias}</select></label></div>
    <label>Categoria<select name="cat" data-cats></select></label>
    <label>${"Pago com"}<select name="onde" data-onde></select></label>
    <div class="dois"><label>Começa em<select name="inicio">
      <option value="${ym}">Este mês</option><option value="${somaMes(ym, 1)}">Próximo mês</option></select></label>
    <label>Por quanto tempo<select name="prazo"><option value="0">Sem prazo</option>
      ${[2, 3, 4, 5, 6, 10, 12, 18, 24, 36, 48, 60].map((n) => `<option value="${n}">${n} meses</option>`).join("")}</select></label></div>
    <p style="font-size:13px;color:#777;margin:-4px 0 12px">Todo mês ele aparece no Início em “Fixos a confirmar”. Só entra no saldo quando você confirma.</p>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Criar recorrente</button></div></form>`);
  const f = $("[data-f]", el);
  const pintarOpcoes = () => {
    $("[data-cats]", el).innerHTML = S.d.categorias.filter((c) => c.tipo === tipo).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
    const contas = S.d.contas.map((c) => `<option value="conta:${c.id}">${esc(c.nome)}</option>`).join("");
    const cartoes = tipo === "despesa" ? S.d.cartoes.map((c) => `<option value="cartao:${c.id}">Cartão ${esc(c.nome)}</option>`).join("") : "";
    $("[data-onde]", el).innerHTML = contas + cartoes;
    $("[data-onde]", el).closest("label").firstChild.textContent = tipo === "despesa" ? "Pago com" : "Recebido em";
  };
  el.querySelectorAll("[data-tp]").forEach((b) => (b.onclick = () => {
    tipo = b.dataset.tp;
    el.querySelectorAll("[data-tp]").forEach((x) => x.classList.toggle("ativo", x === b));
    pintarOpcoes();
  }));
  pintarOpcoes();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = lerValor(f.valor.value);
    if (!(v > 0)) return ($("[data-e]", el).textContent = "Digite um valor válido.");
    if (!f.cat.value) return ($("[data-e]", el).textContent = "Escolha uma categoria.");
    const [k, id] = f.onde.value.split(":");
    const novo = { id: novoId(), tipo, cat: f.cat.value, valor: v, nota: f.nota.value.trim(), conta: k === "conta" ? id : null, cartao: k === "cartao" ? id : null, dia: Number(f.dia.value), inicio: f.inicio.value };
    const n = Number(f.prazo.value);
    if (n > 0) novo.fim = somaMes(novo.inicio, n);
    S.d.fixos.push(novo);
    await salvar(); fechar();
    aviso(`Recorrente criado: aparece todo dia ${novo.dia}${novo.fim ? `, até ${nomeMes(somaMes(novo.fim, -1))}` : ""}.`);
    setTimeout(() => { depois && depois(); atualizarFundo(); }, 0);
  };
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
      <div class="lista-escolha" data-contas>${S.d.contas.map((c) => `<button data-e="${c.id}"><span class="bola">${ic(icConta(c))}</span><span>${esc(c.nome)}<br><small style="color:#777">${ehBenef(c) ? "Benefício · " : ""}Saldo: ${fmtR(saldoConta(c.id))}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")}
      <button data-nova><span class="bola">${ic("plus")}</span><b>Nova conta</b></button>
      <button data-novab><span class="bola">${ic("ticket")}</span><span><b>Novo cartão de benefício</b><br><small style="color:#777">VA, VR, vale combustível (sem fatura)</small></span></button></div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarConta(S.d.contas.find((c) => c.id === b.dataset.e), pintar)));
    $("[data-nova]", el).onclick = () => editarConta(null, pintar);
    $("[data-novab]", el).onclick = () => editarConta(null, pintar, { beneficio: true });
    const tr = $("[data-transf]", el); if (tr) tr.onclick = () => abrirEditor(null, { transf: true });
  };
  pintar();
  gerirContas.repintar = pintar;
}

function editarConta(c, depois, opc = {}) {
  const benef = c ? ehBenef(c) : !!opc.beneficio;
  const el = abrirCamada(`<h2>${c ? (benef ? "Editar cartão de benefício" : "Editar conta") : benef ? "Novo cartão de benefício" : "Nova conta"}</h2><form data-f>
    <label>Nome<input name="nome" maxlength="24" value="${esc(c ? c.nome : "")}" placeholder="${benef ? "Ex.: VA Alelo, VR Sodexo, Vale combustível" : "Ex.: Banco, Carteira"}" required></label>
    <label class="marcar benef-op"><input type="checkbox" name="benef" ${benef ? "checked" : ""}> É cartão de benefício (VA, VR, vale combustível)</label>
    <p class="benef-dica" style="font-size:13px;color:#777;margin:-4px 0 12px">Funciona como uma carteira: o crédito do benefício entra como <b>receita</b> recebida nele, e o que você gasta sai do saldo dele. <b>Não gera fatura</b> e não mexe no "Saldo em conta".</p>
    <label>${benef ? "Saldo disponível hoje (R$)" : "Saldo inicial (R$)"}<input name="saldo" inputmode="decimal" value="${c ? nf2.format((benef ? saldoConta(c.id) : c.saldoInicial || 0) / 100) : "0,00"}"><small style="color:#888">${benef ? "Quanto tem no cartão agora. O app ajusta para bater com esse valor." : "Quanto havia na conta quando você começou a usar o app. Pode ser negativo."}</small></label>
    <p class="erro" data-e></p>
    <div class="botoes"><button class="btn preto">Salvar</button>${c ? `<button type="button" class="btn perigo" data-apagar>Apagar conta</button>` : ""}</div></form>`);
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, txt = f.saldo.value.trim(), neg = txt.startsWith("-");
    let s = txt ? lerValor(txt.replace(/^-/, "")) : 0;
    if (!Number.isFinite(s)) return ($("[data-e]", el).textContent = "Saldo inválido.");
    if (neg) s = -s;
    const ehB = f.benef.checked;
    let alvo = c;
    if (!c) { alvo = { id: novoId(), nome: "", saldoInicial: 0 }; S.d.contas.push(alvo); }
    alvo.nome = f.nome.value.trim();
    if (ehB) alvo.beneficio = true; else delete alvo.beneficio;
    // benefício: o valor digitado é o saldo de hoje; conta comum: é o saldo inicial
    if (benef && c) { alvo.saldoInicial = 0; alvo.saldoInicial = s - saldoConta(alvo.id); }
    else alvo.saldoInicial = s;
    await salvar(); fechar(); aviso(ehB ? "Cartão de benefício salvo." : "Conta salva."); setTimeout(() => depois && depois(alvo), 0);
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
    <div class="origem" style="margin-top:0">
      <span style="font-size:13.5px;color:#444">Compra feita <b>no dia do fechamento</b> entra:</span>
      <label class="marcar"><input type="radio" name="inclui" value="0" ${!c || !c.fechaInclui ? "checked" : ""}> Na próxima fatura</label>
      <label class="marcar"><input type="radio" name="inclui" value="1" ${c && c.fechaInclui ? "checked" : ""}> Ainda na fatura que está fechando</label>
    </div>
    <p style="font-size:12.5px;color:#777;margin:-4px 0 12px" data-exfat></p>
    <p style="font-size:12.5px;color:#777;margin:0 0 14px">Use as datas que aparecem no app do banco. Ao salvar, o app recalcula a fatura de todas as compras deste cartão (menos as que você escolheu a fatura na mão).</p>
    <div class="botoes"><button class="btn preto">Salvar</button>
      ${c ? `<button type="button" class="btn contorno" data-virarbenef>${ic("ticket")}É um cartão de benefício (VA/VR)</button>` : `<p style="font-size:13px;color:#777;margin:0;text-align:center">Vale alimentação, refeição ou combustível? Cadastre em <b>Perfil → Contas</b> como cartão de benefício, sem fatura.</p>`}
      ${c ? `<button type="button" class="btn perigo" data-apagar>Apagar cartão</button>` : ""}</div></form>`);
  const vb = $("[data-virarbenef]", el);
  if (vb) vb.onclick = () => converterEmBeneficio(c, depois);
  // exemplo ao vivo de para qual fatura vai uma compra no dia do fechamento
  const fm = $("[data-f]", el);
  const exemplo = () => {
    const fe = Number(fm.fech.value), ve = Number(fm.venc.value), inc = fm.inclui.value === "1";
    const ym = mesAtual(), dia = `${ym}-${p2(fe)}`;
    let fecha = ym; if (!inc) fecha = somaMes(fecha, 1);
    const fat = ve > fe ? fecha : somaMes(fecha, 1);
    $("[data-exfat]", el).textContent = `Ex.: compra em ${dataCurta(dia)} → fatura de ${nomeMes(fat)} (vence ${p2(ve)}/${fat.slice(5)}).`;
  };
  fm.querySelectorAll("select, input[type=radio]").forEach((x) => (x.onchange = exemplo)); exemplo();
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, dados = { nome: f.nome.value.trim(), fechamento: Number(f.fech.value), vencimento: Number(f.venc.value), fechaInclui: f.inclui.value === "1" };
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

// Um cartão cadastrado como crédito que na verdade é VA/VR: vira cartão de benefício.
// As compras passam a sair do saldo dele e os "pagamentos de fatura" (que tiravam da conta) são apagados.
function converterEmBeneficio(c, depois) {
  const compras = S.d.lancs.filter((l) => l.cartao === c.id && l.tipo === "despesa");
  const pagas = S.d.lancs.filter((l) => l.cartao === c.id && l.tipo === "fatura");
  const totPag = pagas.reduce((s, l) => s + l.valor, 0);
  const sh = abrirCamada(`<h2>Transformar em cartão de benefício</h2>
    <p style="color:#555;margin:-6px 0 12px;text-align:center;font-size:14.5px">“${esc(c.nome)}” deixa de ter fatura. ${compras.length} compra(s) passam a sair do saldo do benefício.
      ${pagas.length ? `<br><b>${pagas.length} pagamento(s) de fatura (${fmtR(totPag)})</b> serão apagados e esse valor <b>volta para o seu Saldo em conta</b>.` : ""}</p>
    <form data-f><label>Saldo disponível hoje no cartão (R$)<input name="saldo" inputmode="decimal" placeholder="0,00"><small style="color:#888">Olhe no app do benefício quanto tem agora.</small></label>
    <div class="botoes"><button class="btn preto">Transformar</button></div></form>`);
  $("[data-f]", sh).onsubmit = async (e) => {
    e.preventDefault();
    const s = e.target.saldo.value.trim() ? lerValor(e.target.saldo.value) : 0;
    if (!Number.isFinite(s)) return aviso("Saldo inválido.");
    const nova = { id: novoId(), nome: c.nome, saldoInicial: 0, beneficio: true };
    S.d.contas.push(nova);
    for (const l of compras) { l.cartao = null; l.conta = nova.id; }
    for (const f of S.d.fixos) if (f.cartao === c.id) { f.cartao = null; f.conta = nova.id; }
    S.d.lancs = S.d.lancs.filter((l) => !(l.cartao === c.id && l.tipo === "fatura"));
    S.d.cartoes = S.d.cartoes.filter((x) => x.id !== c.id);
    nova.saldoInicial = s - saldoConta(nova.id);
    await salvar(); fecharTudo(); desenhar();
    aviso(`Pronto: “${c.nome}” agora é cartão de benefício, sem fatura.`);
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
    S.u.ultimoBackup = new Date().toISOString(); S.u.adiouBackup = null; gravarUsuario(S.u);
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
    const onde = ehInvest(l.tipo) ? (l.tipo === "rend" ? invest(l.inv).nome : l.tipo === "aplic" ? `${l.conta ? conta(l.conta).nome : "Já investido"} → ${invest(l.inv).nome}` : `${invest(l.inv).nome} → ${conta(l.conta).nome}`) : l.tipo === "transf" ? `${conta(l.conta).nome} → ${conta(l.destino).nome}` : l.cartao && l.tipo === "despesa" ? `Cartão ${cartao(l.cartao).nome}` : l.tipo === "fatura" ? `${conta(l.conta).nome} (fatura ${cartao(l.cartao).nome})` : conta(l.conta).nome;
    const v = (l.tipo === "receita" || l.tipo === "transf" || l.tipo === "aplic" || l.tipo === "resg" || (l.tipo === "rend" && !l.perda) ? 1 : -1) * l.valor / 100;
    linhas.push([`${l.data.slice(8)}/${l.data.slice(5, 7)}/${l.data.slice(0, 4)}`, nomes[l.tipo], l.cat ? cat(l.cat).nome : "", l.nota || "", onde, l.parc ? `${l.parc.n}/${l.parc.t}` : "", nf2.format(v).replace(/\./g, "")]);
  }
  const csv = "﻿" + linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  await entregarArquivo(`gestor-financas-${hoje()}.csv`, csv, "text/csv");
}

/* ================= MOSTRAR SENHA ================= */
// Coloca um "olho" em todo campo de senha para ver o que foi digitado
function olhosSenha(raiz = document) {
  raiz.querySelectorAll('input[type="password"]:not([data-olho])').forEach((inp) => {
    inp.dataset.olho = "1";
    const caixa = document.createElement("span");
    caixa.className = "senha-caixa";
    inp.replaceWith(caixa);
    const bt = document.createElement("button");
    bt.type = "button"; bt.className = "olho"; bt.setAttribute("aria-label", "Mostrar senha"); bt.innerHTML = ic("eye");
    bt.onclick = (e) => {
      e.preventDefault();
      const ver = inp.type === "password";
      inp.type = ver ? "text" : "password";
      bt.innerHTML = ic(ver ? "eye-off" : "eye");
      bt.setAttribute("aria-label", ver ? "Esconder senha" : "Mostrar senha");
      inp.focus();
    };
    caixa.append(inp, bt);
  });
}
new MutationObserver(() => olhosSenha()).observe(document.body, { childList: true, subtree: true });

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
