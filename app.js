"use strict";
/* Gestor de Finanças — app instalável, dados guardados só no aparelho e criptografados. */

const VERSAO_APP = "1.2";
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

function dadosIniciais() {
  const D = (nome, icone) => ({ id: novoId(), tipo: "despesa", nome, icone });
  const R = (nome, icone) => ({ id: novoId(), tipo: "receita", nome, icone });
  return {
    versao: 1,
    contas: [{ id: novoId(), nome: "Conta principal", saldoInicial: 0 }],
    cartoes: [],
    categorias: [
      D("Wayne", "shirt"), D("Cartões", "credit-card"), D("Compras", "shopping-cart"), D("Comida", "utensils"),
      D("Juros", "percent"), D("Lazer", "tree-palm"), D("Moradia", "paint-roller"), D("Lar", "sofa"),
      D("Pessoal", "gem"), D("Outras situações", "settings"), D("Moto", "motorbike"), D("Transporte", "bus"),
      D("Gravidez", "baby"), D("Isabela", "briefcase"), D("Internet", "router"), D("Beleza", "scissors"),
      D("Poupar Dinheiro", "piggy-bank"), D("Aposta Depositada", "dices"), D("Academia", "dumbbell"), D("Dentista", "toothbrush"),
      D("Filhos", "users"), D("Educação", "book-open"), D("Roupas", "shirt"), D("Viagem", "plane"),
      D("Saúde", "heart-pulse"), D("Presentes", "gift"), D("Eletrônicos", "smartphone"), D("Esportes", "trophy"),
      R("Salário", "banknote"), R("Extra", "hand-coins"), R("Investimentos", "trending-up"),
      R("Reembolso", "receipt"), R("Presente", "gift"), R("Outros", "circle-ellipsis"),
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
  S.mes = mesAtual();
  S.graf = { tipo: "despesa", mes: mesAtual() };
  S.relAno = Number(mesAtual().slice(0, 4));
  S.cmp = { modo: "mes", mes: mesAtual(), ano: Number(mesAtual().slice(0, 4)) };
  S.aba = "inicio";
  lembrarSessao();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
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

// Mantém a conta aberta ao recarregar a tela (puxar para atualizar).
// Fica só na memória desta janela do app: some ao fechar o app.
function lembrarSessao() {
  try { sessionStorage.setItem("gf_sessao", JSON.stringify({ id: S.u.id, k: b64(S.chaveBytes), aba: S.aba, ts: Date.now() })); } catch {}
}
function marcarAtividade() {
  if (!S.u) return;
  try { const x = JSON.parse(sessionStorage.getItem("gf_sessao")); if (x) { x.ts = Date.now(); x.aba = S.aba; sessionStorage.setItem("gf_sessao", JSON.stringify(x)); } } catch {}
}
async function retomarSessao() {
  try {
    const x = JSON.parse(sessionStorage.getItem("gf_sessao"));
    if (!x || Date.now() - x.ts > 5 * 60 * 1000) { sessionStorage.removeItem("gf_sessao"); return false; }
    const u = lerUsuarios().find((y) => y.id === x.id);
    if (!u) return false;
    await abrirSessao(u, deB64(x.k));
    if (x.aba) S.aba = x.aba;
    return true;
  } catch { try { sessionStorage.removeItem("gf_sessao"); } catch {} return false; }
}

function sair() {
  try { sessionStorage.removeItem("gf_sessao"); } catch {}
  S.u = S.chave = S.chaveBytes = S.d = null;
  fecharTudo();
  telaLogin();
}

/* ================= CÁLCULOS ================= */

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

function saldoConta(id) {
  let s = conta(id).saldoInicial || 0;
  for (const l of S.d.lancs) {
    if (l.tipo === "receita" && l.conta === id) s += l.valor;
    else if (l.tipo === "despesa" && !l.cartao && l.conta === id) s -= l.valor;
    else if (l.tipo === "fatura" && l.conta === id) s -= l.valor;
    else if (l.tipo === "transf") { if (l.conta === id) s -= l.valor; if (l.destino === id) s += l.valor; }
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

function bannerInstalar() {
  if (instalado() || !pedidoInstalar) return "";
  return `<div class="instalar" style="margin:20px 0 0"><img src="icons/icon-192.png" alt=""><span>Instale o app para ter o ícone na tela inicial.</span><button data-instalar>Instalar</button></div>`;
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
  let corpo = "";
  if (!doMes.length) {
    corpo = `<div class="vazio">${ic("receipt")}Nenhum lançamento em ${MESES[m - 1]}.<br>Toque no <b>+</b> para adicionar.</div>`;
  } else {
    const dias = {};
    for (const l of doMes) (dias[l.data] ||= []).push(l);
    for (const [d, ls] of Object.entries(dias)) {
      const desDia = ls.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
      const recDia = ls.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
      const res = [desDia ? `Despesas: ${fmt(desDia)}` : "", recDia ? `Receitas: ${fmt(recDia)}` : ""].filter(Boolean).join(" · ");
      corpo += `<div class="dia-cab"><span>${nomeDia(d)}</span><span class="num">${res}</span></div>`;
      corpo += ls.map(itemLanc).join("");
    }
  }
  return `<header class="topo">
      <div class="topo-linha"><h1>Gestor de Finanças</h1></div>
      <div class="resumo">
        <button class="sel-mes" data-mes><small>${a}</small><b>${MES3[m - 1]} ▾</b></button>
        <div class="col"><span>Despesas</span><b class="num">${fmt(t.des)}</b></div>
        <div class="col"><span>Receitas</span><b class="num">${fmt(t.rec)}</b></div>
        <div class="col"><span>Saldo</span><b class="num">${fmt(t.saldo)}</b></div>
      </div>
      ${t.cart ? `<div class="no-cartao">${ic("credit-card")}<span>No cartão (fora do saldo)</span><b class="num">${fmt(t.cart)}</b></div>` : ""}
    </header>${!instalado() && pedidoInstalar ? `<div class="instalar"><img src="icons/icon-192.png" alt=""><span>Instale o app na tela inicial.</span><button data-instalar>Instalar</button></div>` : ""}
    <div class="conteudo" id="lista">${corpo}</div>`;
}

function itemLanc(l) {
  let icone, titulo, sub = "", sinal, extra = "";
  if (l.tipo === "transf") {
    icone = "arrow-left-right"; titulo = l.nota || "Transferência"; sinal = "";
    sub = `${esc(conta(l.conta).nome)} → ${esc(conta(l.destino).nome)}`;
  } else if (l.tipo === "fatura") {
    icone = "credit-card"; titulo = l.nota || `Pagamento da fatura ${cartao(l.cartao).nome}`; sinal = "- ";
    sub = `Fatura de ${nomeMes(l.fatura)} · ${esc(conta(l.conta).nome)}`;
  } else {
    const c = cat(l.cat);
    icone = c.icone; titulo = l.nota || c.nome; sinal = l.tipo === "despesa" ? "- " : "+ ";
    const partes = [];
    if (l.nota) partes.push(esc(c.nome));
    if (l.cartao) { partes.push(`${ic("credit-card")}${esc(cartao(l.cartao).nome)}`); }
    if (l.parc) partes.push(`${l.parc.n}/${l.parc.t}`);
    sub = partes.join(" · ");
  }
  return `<button class="item" data-lanc="${l.id}"><span class="bola">${ic(icone)}</span>
    <span class="meio"><div>${esc(titulo)}</div>${sub ? `<small>${sub}</small>` : ""}</span>
    <span class="val num">${sinal}${fmt(l.valor)}</span>${extra}</button>`;
}

ligar.inicio = () => {
  $("[data-mes]").onclick = async () => { const m = await escolherMes(S.mes); if (m) { S.mes = m; desenhar(); } };
  $("#lista").onclick = (e) => { const b = e.target.closest("[data-lanc]"); if (b) abrirLanc(b.dataset.lanc); };
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
  let fatias = ordem.slice(0, 4).map(([id, v]) => ({ nome: cat(id).nome, v }));
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
      const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${CORES[i]}" stroke-width="34"
        stroke-dasharray="${Math.max(0, frac * C - (fatias.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-acum * C}" transform="rotate(-90 100 100)"/>`;
      acum += frac; return seg;
    }).join("");
    legenda = fatias.map((f, i) => `<div><i style="background:${CORES[i]}"></i><span>${esc(f.nome)}</span><b class="num">${pctTxt(f.v)}</b></div>`).join("");
  }
  const max = ordem.length ? ordem[0][1] : 1;
  const linhas = ordem.map(([id, v]) => {
    const c = cat(id);
    return `<div class="cat-linha"><span class="bola">${ic(c.icone)}</span><div class="meio">
      <div class="topo2"><span>${esc(c.nome)}</span><b class="num">${fmt(v)}</b></div>
      <div class="barra"><i style="width:${(v / max) * 72}%"></i><span>${pctTxt(v)}</span></div></div></div>`;
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
  const rol = $("#rol"), at = $("#rol .ativo");
  if (rol && at) rol.scrollLeft = at.offsetLeft - rol.clientWidth / 2 + at.clientWidth / 2;
};

/* ----- Comparativo receitas x despesas ----- */
function dadosPeriodo(filtro) {
  let rec = 0, des = 0; const pc = { receita: {}, despesa: {} };
  for (const l of S.d.lancs) {
    if ((l.tipo !== "receita" && l.tipo !== "despesa") || !filtro(l.data)) continue;
    if (l.tipo === "receita") rec += l.valor; else des += l.valor;
    pc[l.tipo][l.cat] = (pc[l.tipo][l.cat] || 0) + l.valor;
  }
  const maior = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return e ? { id: e[0], v: e[1] } : null; };
  return { rec, des, topRec: maior(pc.receita), topDes: maior(pc.despesa) };
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
    return `<div class="pesa"><small>${rot}</small><div class="pesa-l"><span class="bola">${ic(k.icone)}</span><b>${esc(k.nome)}</b></div>
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
  document.querySelectorAll("[data-cmodo]").forEach((b) => (b.onclick = () => { S.cmp.modo = b.dataset.cmodo; if (S.cmp.modo === "ano") S.cmp.ano = Number(S.cmp.mes.slice(0, 4)); desenhar(); }));
  document.querySelectorAll("[data-cnav]").forEach((b) => (b.onclick = () => {
    const n = Number(b.dataset.cnav);
    if (S.cmp.modo === "mes") S.cmp.mes = somaMes(S.cmp.mes, n); else S.cmp.ano += n;
    desenhar();
  }));
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
      <div style="margin:0 -18px">${f.itens.map(itemLanc).join("") || `<p class="vazio" style="padding:20px">Nenhuma compra nesta fatura.</p>`}</div>
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
    <div class="conteudo">${!instalado() && pedidoInstalar ? `<div class="instalar"><img src="icons/icon-192.png" alt=""><span>Instale o app na tela inicial.</span><button data-instalar>Instalar</button></div>` : ""}
    <section class="secao"><h2>Cadastros</h2><div class="cartao-box">
      ${op("categorias", "tag", "Categorias", `${S.d.categorias.length} categorias`)}
      ${op("contas", "wallet", "Contas", "Onde fica seu dinheiro (banco, carteira…)")}
      ${op("cartoes", "credit-card", "Cartões de crédito", S.d.cartoes.length ? S.d.cartoes.map((c) => c.nome).join(", ") : "Nenhum cadastrado")}
    </div></section>
    <section class="secao"><h2>Seus dados</h2><div class="cartao-box">
      ${op("backup", "download", "Salvar backup", txtBk)}
      ${op("restaurar", "upload", "Restaurar backup", "Trazer dados de outro celular")}
      ${op("csv", "file-spreadsheet", "Exportar planilha", "Arquivo para abrir no Excel")}
    </div></section>
    <section class="secao"><h2>Segurança</h2><div class="cartao-box">
      ${op("senha", "key-round", "Trocar senha", "")}
      ${op("codigo", "lock", "Gerar novo código de recuperação", "O código antigo deixa de valer")}
      ${op("sair", "log-out", "Sair", "")}
    </div></section>
    <p style="text-align:center;color:#999;font-size:12px;margin:22px 0 0">Gestor de Finanças ${VERSAO_APP} · dados guardados só neste aparelho<br>Ícones: Lucide (licença ISC)</p>
    </div>`;
}
ligar.perfil = () => {
  const acoes = { categorias: gerirCategorias, contas: gerirContas, cartoes: gerirCartoes, backup: salvarBackup, restaurar: restaurarNoPerfil, csv: exportarCSV, senha: trocarSenha, codigo: gerarCodigo, sair: sairConfirmar };
  document.querySelectorAll("[data-op]").forEach((b) => (b.onclick = () => acoes[b.dataset.op]()));
  const bi = $("[data-instalar]"); if (bi) bi.onclick = instalarApp;
};

async function sairConfirmar() { if (await confirmar("Sair", "Você vai precisar da senha para entrar de novo.", "Sair")) sair(); }

/* ================= ADICIONAR / EDITAR ================= */

function abrirEditor(l) {
  const ultimo = (tipo) => { const x = [...S.d.lancs].reverse().find((y) => y.tipo === tipo && y.cat); return x ? x.cat : null; };
  const E = l ? { ...l, expr: nf0.format(l.valor / 100).replace(/\./g, ""), parcelas: 1 }
    : { tipo: "despesa", cat: null, expr: "", nota: "", data: hoje(), conta: S.d.contas[0]?.id, cartao: null, parcelas: 1, destino: S.d.contas[1]?.id };
  if (!l && S.mes !== mesAtual()) E.data = `${S.mes}-01`;
  const editando = !!l;

  const el = abrirCamada(`<div class="add-cab"><div class="linha"><button data-x>Cancelar</button><b>${editando ? "Editar" : "Adicionar"}</b>
      <button data-del>${editando ? ic("trash") : ""}</button></div>
      <div class="alternar tres" data-tipos></div></div>
    <div class="add-corpo" data-corpo></div>
    <div class="teclado-area">
      <div class="visor"><div class="chips" data-chips></div><div class="valor"><div class="num" data-vis>0</div><small data-res></small></div></div>
      <div class="nota"><span>Nota:</span><input data-nota maxlength="80" placeholder="Insira uma nota…"></div>
      <div class="teclado">
        <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button class="data" data-data>${ic("calendar")}<span data-datatxt></span></button>
        <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button data-k="+">+</button>
        <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button data-k="-">−</button>
        <button data-k=",">,</button><button data-k="0">0</button><button data-k="apagar">${ic("delete")}</button><button class="ok" data-ok>${ic("check")}</button>
      </div>
      <input type="date" data-dataif style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px">
    </div>`, { tela: true });

  const nota = $("[data-nota]", el);
  nota.value = E.nota || "";
  nota.oninput = () => (E.nota = nota.value);

  function pintarTipos() {
    const t = (v, r) => `<button data-t="${v}" class="${E.tipo === v ? "ativo" : ""}">${r}</button>`;
    const box = $("[data-tipos]", el);
    if (editando && E.tipo === "transf") box.innerHTML = t("transf", "Transferência");
    else if (editando) box.innerHTML = t("despesa", "Despesa") + t("receita", "Receita");
    else box.innerHTML = t("despesa", "Despesa") + t("receita", "Receita") + t("transf", "Transferência");
    box.style.gridTemplateColumns = `repeat(${box.children.length}, 1fr)`;
    box.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
      if (E.tipo === b.dataset.t) return;
      E.tipo = b.dataset.t; E.cat = l && l.tipo === E.tipo ? l.cat : ultimo(E.tipo);
      if (E.tipo !== "despesa") E.cartao = null;
      pintarTipos(); pintarCorpo(); pintarChips();
    }));
  }

  function pintarCorpo() {
    const corpo = $("[data-corpo]", el);
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
    const cats = S.d.categorias.filter((c) => c.tipo === E.tipo);
    corpo.innerHTML = `<div class="grade-cat">${cats.map((c) => `<button data-c="${c.id}" class="${E.cat === c.id ? "sel" : ""}"><span class="bola">${ic(c.icone)}</span>${esc(c.nome)}</button>`).join("")}
      <button data-novacat><span class="bola">${ic("plus")}</span>Nova</button></div>`;
    corpo.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => {
      E.cat = b.dataset.c;
      corpo.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("sel", x === b));
    }));
    $("[data-novacat]", corpo).onclick = () => editarCategoria(null, E.tipo, (nova) => { E.cat = nova.id; pintarCorpo(); });
  }

  function pintarChips() {
    const box = $("[data-chips]", el);
    if (E.tipo === "transf") { box.innerHTML = ""; return; }
    const pagoCom = E.cartao ? `<button class="chip cartao" data-pg>${ic("credit-card")}<span>${esc(cartao(E.cartao).nome)}</span></button>`
      : `<button class="chip" data-pg>${ic("wallet")}<span>${esc(conta(E.conta).nome)}</span></button>`;
    const parc = E.cartao && !editando ? `<button class="chip" data-parc>${E.parcelas}x</button>` : "";
    box.innerHTML = pagoCom + parc;
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
      const ops = Array.from({ length: 24 }, (_, i) => ({ valor: i + 1, rotulo: i ? `${i + 1}x` : "À vista (1x)", sub: total > 0 && i ? `${i + 1}x de ${fmtR(Math.floor(total / (i + 1)))}` : "" }));
      const v = await escolher("Parcelas", ops, E.parcelas);
      if (v) { E.parcelas = v; pintarChips(); }
    };
  }

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

  // Data
  const dataIf = $("[data-dataif]", el);
  const pintarData = () => ($("[data-datatxt]", el).textContent = E.data === hoje() ? "Hoje" : dataCurta(E.data));
  $("[data-data]", el).onclick = () => { dataIf.value = E.data; try { dataIf.showPicker(); } catch { dataIf.click(); } };
  dataIf.onchange = () => { if (dataIf.value) { E.data = dataIf.value; pintarData(); pintarChips(); } };

  $("[data-x]", el).onclick = () => fechar();

  // Salvar
  $("[data-ok]", el).onclick = async () => {
    const r = calc();
    if (r.temOp) { if (Number.isFinite(r.valor) && r.valor > 0) { E.expr = nf2.format(r.valor / 100).replace(/\./g, ""); pintarVisor(); } return; }
    if (!(r.valor > 0)) return aviso("Digite o valor.");
    if (E.tipo === "transf") {
      if (S.d.contas.length < 2) return aviso("Cadastre outra conta em Perfil → Contas.");
      if (E.conta === E.destino) return aviso("Escolha contas diferentes.");
    } else if (!E.cat) return aviso("Escolha uma categoria.");

    const base = { tipo: E.tipo, valor: r.valor, nota: (E.nota || "").trim(), data: E.data };
    if (E.tipo === "transf") Object.assign(base, { conta: E.conta, destino: E.destino });
    else Object.assign(base, { cat: E.cat, conta: E.cartao ? null : E.conta, cartao: E.cartao || null });

    if (editando) {
      const alvo = S.d.lancs.find((x) => x.id === l.id);
      Object.assign(alvo, base);
      if (!alvo.cartao) delete alvo.parc;
    } else if (E.cartao && E.parcelas > 1) {
      const n = E.parcelas, cada = Math.floor(r.valor / n), sobra = r.valor - cada * n, g = novoId();
      for (let i = 0; i < n; i++) S.d.lancs.push({ ...base, id: novoId() + i, valor: cada + (i === 0 ? sobra : 0), data: somaMesData(E.data, i), parc: { n: i + 1, t: n, g } });
    } else S.d.lancs.push({ ...base, id: novoId() });

    await salvar();
    fechar();
    aviso(editando ? "Alterações salvas." : E.cartao ? `Lançado no cartão${E.parcelas > 1 ? ` em ${E.parcelas}x` : ""}. Não saiu do saldo.` : "Lançamento adicionado.");
    if (!editando && !E.data.startsWith(S.mes)) S.mes = E.data.slice(0, 7);
    atualizarFundo();
  };

  // Apagar
  if (editando) $("[data-del]", el).onclick = async () => {
    const alvo = S.d.lancs.find((x) => x.id === l.id);
    if (alvo.parc) {
      const v = await escolher("Apagar parcelado", [{ valor: "uma", rotulo: `Só esta parcela (${alvo.parc.n}/${alvo.parc.t})`, icone: "trash" }, { valor: "todas", rotulo: `Todas as ${alvo.parc.t} parcelas`, icone: "trash" }]);
      if (!v) return;
      S.d.lancs = v === "todas" ? S.d.lancs.filter((x) => !(x.parc && x.parc.g === alvo.parc.g)) : S.d.lancs.filter((x) => x.id !== alvo.id);
    } else {
      if (!(await confirmar("Apagar lançamento", `${alvo.nota || cat(alvo.cat).nome} · ${fmtR(alvo.valor)}`, "Apagar", true))) return;
      S.d.lancs = S.d.lancs.filter((x) => x.id !== alvo.id);
    }
    await salvar(); fechar(); aviso("Lançamento apagado."); atualizarFundo();
  };

  if (!E.cat && E.tipo !== "transf") E.cat = ultimo(E.tipo);
  pintarTipos(); pintarCorpo(); pintarChips(); pintarVisor(); pintarData();
}

/* ================= CADASTROS ================= */

function gerirCategorias() {
  let tipo = "despesa";
  const el = abrirCamada(`<div data-c></div>`, { aoFechar: () => desenhar() });
  const pintar = () => {
    const cats = S.d.categorias.filter((c) => c.tipo === tipo);
    $("[data-c]", el).innerHTML = `<h2>Categorias</h2><div class="alternar" style="margin:0 auto 12px">
      <button data-t="despesa" class="${tipo === "despesa" ? "ativo" : ""}">Despesas</button><button data-t="receita" class="${tipo === "receita" ? "ativo" : ""}">Receitas</button></div>
      <div class="lista-escolha">${cats.map((c) => `<button data-e="${c.id}"><span class="bola">${ic(c.icone)}</span><span>${esc(c.nome)}</span><span class="ok">${ic("pencil")}</span></button>`).join("")}
      <button data-nova><span class="bola">${ic("plus")}</span><b>Nova categoria</b></button></div>`;
    el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tipo = b.dataset.t; pintar(); }));
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarCategoria(S.d.categorias.find((c) => c.id === b.dataset.e), tipo, pintar)));
    $("[data-nova]", el).onclick = () => editarCategoria(null, tipo, pintar);
  };
  pintar();
}

function editarCategoria(c, tipo, depois) {
  let icone = c ? c.icone : ICONES_CATEGORIA[0];
  const el = abrirCamada(`<h2>${c ? "Editar categoria" : "Nova categoria"}</h2>
    <form data-f><label>Nome<input name="nome" maxlength="24" value="${esc(c ? c.nome : "")}" required></label>
      <label style="margin-bottom:6px">Ícone</label><div class="grade-icones">${ICONES_CATEGORIA.map((n) => `<button type="button" data-i="${n}" class="${n === icone ? "sel" : ""}">${ic(n)}</button>`).join("")}</div>
      <div class="botoes"><button class="btn preto">Salvar</button>${c ? `<button type="button" class="btn perigo" data-apagar>Apagar categoria</button>` : ""}</div></form>`);
  el.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { icone = b.dataset.i; el.querySelectorAll("[data-i]").forEach((x) => x.classList.toggle("sel", x === b)); }));
  $("[data-f]", el).onsubmit = async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    if (!nome) return;
    let alvo = c;
    if (c) Object.assign(c, { nome, icone });
    else { alvo = { id: novoId(), tipo, nome, icone }; S.d.categorias.push(alvo); }
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
      <div class="lista-escolha">${S.d.contas.map((c) => `<button data-e="${c.id}"><span class="bola">${ic("wallet")}</span><span>${esc(c.nome)}<br><small style="color:#777">Saldo: ${fmtR(saldoConta(c.id))}</small></span><span class="ok">${ic("pencil")}</span></button>`).join("")}
      <button data-nova><span class="bola">${ic("plus")}</span><b>Nova conta</b></button></div>`;
    el.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editarConta(S.d.contas.find((c) => c.id === b.dataset.e), pintar)));
    $("[data-nova]", el).onclick = () => editarConta(null, pintar);
  };
  pintar();
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
  const nomes = { despesa: "Despesa", receita: "Receita", transf: "Transferência", fatura: "Pagamento de fatura" };
  for (const l of [...S.d.lancs].sort((a, b) => a.data.localeCompare(b.data))) {
    const onde = l.tipo === "transf" ? `${conta(l.conta).nome} → ${conta(l.destino).nome}` : l.cartao && l.tipo === "despesa" ? `Cartão ${cartao(l.cartao).nome}` : l.tipo === "fatura" ? `${conta(l.conta).nome} (fatura ${cartao(l.cartao).nome})` : conta(l.conta).nome;
    const v = (l.tipo === "receita" ? 1 : l.tipo === "transf" ? 1 : -1) * l.valor / 100;
    linhas.push([`${l.data.slice(8)}/${l.data.slice(5, 7)}/${l.data.slice(0, 4)}`, nomes[l.tipo], l.cat ? cat(l.cat).nome : "", l.nota || "", onde, l.parc ? `${l.parc.n}/${l.parc.t}` : "", nf2.format(v).replace(/\./g, "")]);
  }
  const csv = "﻿" + linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  await entregarArquivo(`gestor-financas-${hoje()}.csv`, csv, "text/csv");
}

/* ================= INÍCIO ================= */

// Bloqueia de novo se o app ficar mais de 5 minutos em segundo plano
let escondidoEm = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { escondidoEm = Date.now(); marcarAtividade(); }
  else if (S.u && escondidoEm && Date.now() - escondidoEm > 5 * 60 * 1000) { sair(); aviso("Por segurança, entre novamente."); }
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.addEventListener("pagehide", () => { if (!document.hidden) marcarAtividade(); });

retomarSessao().then((ok) => (ok ? desenhar() : telaLogin()));
