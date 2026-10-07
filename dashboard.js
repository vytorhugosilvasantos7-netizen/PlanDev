(() => {
  "use strict";

  // ---------- Utilitários ----------
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt; // sempre texto puro: nada digitado vira HTML
    return n;
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad2 = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtData = (s) => s.split("-").reverse().join("/");
  const dataIsoDePtBr = (s) => {
    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!partes) return null;
    const [, diaTexto, mesTexto, anoTexto] = partes;
    const dia = Number(diaTexto), mes = Number(mesTexto), ano = Number(anoTexto);
    const data = new Date(0);
    data.setFullYear(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
    return `${anoTexto}-${mesTexto}-${diaTexto}`;
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  let tt;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("on"), 5000);
  }

  function notificar(titulo, corpo) {
    toast(`${titulo}: ${corpo}`);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(titulo, { body: corpo }); } catch { /* ignora */ }
    }
  }

  // ---------- Tema ----------
  function aplicarTema(t) {
    document.documentElement.dataset.tema = t;
    try { localStorage.setItem("plandev:tema", t); } catch { /* ignora */ }
    $$(".tema-opcoes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === t)));
  }
  let temaInicial = "escuro";
  try { temaInicial = localStorage.getItem("plandev:tema") === "claro" ? "claro" : "escuro"; } catch { /* ignora */ }
  aplicarTema(temaInicial);

  // ---------- Dados (salvos neste navegador, separados por usuário) ----------
  const padrao = () => ({
    nome: "", avatar: "", projetos: [], entrevistas: [], metas: [], sessoes: 0, focoMin: 0,
    portfolio: { nome: "", cargo: "", bio: "", skills: "", html: "", css: "", js: "" },
    cfg: { sessao: true, pausa: true, avisos: true },
  });
  let uid = "local";
  let servidor = null;
  const modoLocal = window.location.protocol === "file:" || ["github.io", "netlify.app"].some((d) => window.location.hostname.endsWith(d));
  let publicacoesOnline = [];
  let S = padrao();
  let salvarTimer = null;
  let filaSalvamento = Promise.resolve();

  function carregar() {
    try {
      const r = JSON.parse(localStorage.getItem("plandev:v1:" + uid)) || {};
      const p = padrao();
      S = { ...p, ...r, cfg: { ...p.cfg, ...r.cfg }, portfolio: { ...p.portfolio, ...r.portfolio } };
      S.projetos = Array.isArray(S.projetos) ? S.projetos : [];
      S.entrevistas = Array.isArray(S.entrevistas) ? S.entrevistas : [];
      S.metas = Array.isArray(S.metas) ? S.metas : [];
    } catch { S = padrao(); }
  }
  function carregarWorkspace(workspace) {
    const p = padrao();
    S = {
      ...p,
      ...workspace,
      cfg: { ...p.cfg, ...(workspace.cfg || {}) },
      portfolio: { ...p.portfolio, ...(workspace.portfolio || {}) },
    };
    S.projetos = Array.isArray(S.projetos) ? S.projetos : [];
    S.entrevistas = Array.isArray(S.entrevistas) ? S.entrevistas : [];
    S.metas = Array.isArray(S.metas) ? S.metas : [];
  }
  function salvarLocal() {
    try {
      localStorage.setItem("plandev:v1:" + uid, JSON.stringify(S));
      return true;
    } catch {
      toast("Não foi possível salvar neste navegador. O espaço de armazenamento pode estar cheio.");
      return false;
    }
  }
  function sincronizarWorkspace(snapshot) {
    filaSalvamento = filaSalvamento.then(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: JSON.parse(snapshot) }),
        });
        const data = await response.json();
        if (response.status === 401) {
          window.location.replace("/pages/login.html");
          return;
        }
        if (!response.ok) throw new Error(data.message || "Erro ao salvar seus dados.");
      } catch (error) {
        toast(error instanceof Error
          ? `Não foi possível sincronizar os dados: ${error.message}`
          : "Não foi possível sincronizar os dados. Tente novamente.");
      }
    });
  }
  function salvar() {
    salvarLocal();
    if (modoLocal || !servidor) return;
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => sincronizarWorkspace(JSON.stringify(S)), 350);
  }

  // ---------- Navegação ----------
  function ir(view) {
    $$(".nav-item").forEach((a) => {
      const ativo = a.dataset.view === view;
      a.classList.toggle("active", ativo);
      if (ativo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $$(".view-panel").forEach((s) => s.classList.toggle("active", s.dataset.view === view));
    if (view === "relatorios") renderCal();
    if (view === "online") carregarComunidade();
  }
  $$(".nav-item").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); ir(a.dataset.view); }));
  $("btn-ver-projetos").addEventListener("click", () => ir("projetos"));
  $("community-refresh").addEventListener("click", carregarComunidade);
  $("community-search").addEventListener("input", renderComunidade);

  // ---------- Contagem animada ----------
  function animar(n, alvo, suf = "", pad = 0) {
    const de = n._v || 0;
    const id = (n._id = (n._id || 0) + 1);
    n._v = alvo;
    const fmt = (v) => String(Math.round(v)).padStart(pad, "0") + suf;
    if (reduce || de === alvo) { n.textContent = fmt(alvo); return; }
    const t0 = performance.now();
    const passo = (t) => {
      if (n._id !== id) return;
      const k = Math.min(1, (t - t0) / 900);
      n.textContent = fmt(de + (alvo - de) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // ---------- Entrevistas: datas e rótulos ----------
  const dataHora = (e) => new Date(`${e.data}T${e.hora || "09:00"}`);
  const diasAte = (e) => Math.round((dia0(dataHora(e)) - dia0(new Date())) / 86400000);
  const proximas = () => S.entrevistas.filter((e) => diasAte(e) >= 0).sort((a, b) => dataHora(a) - dataHora(b));
  function rotulo(d) {
    if (d < 0) return ["Passou", "waiting"];
    if (d === 0) return ["Hoje", "done"];
    if (d === 1) return ["Amanhã", "active"];
    return [`Em ${d} dias`, d <= 3 ? "active" : "waiting"];
  }
  const atrasada = (m) => !m.feita && m.prazo && m.prazo < iso(new Date());

  // ---------- Renderização ----------
  function vazio(texto) { return el("p", "empty-state", texto); }

  function renderStats() {
    const prox = proximas();
    const feitas = S.metas.filter((m) => m.feita).length;
    const tot = S.metas.length;
    const pct = tot ? Math.round((feitas / tot) * 100) : 0;
    const atras = S.metas.filter(atrasada).length;

    animar($("st-projetos"), S.projetos.length, "", 2);
    $("sm-projetos").textContent = `${S.projetos.filter((p) => p.status === "Concluído").length} concluído(s)`;
    animar($("st-entrevistas"), prox.length, "", 2);
    $("sm-entrevistas").textContent = prox[0] ? `Próxima: ${prox[0].empresa}` : "Nenhuma agendada";
    animar($("st-metas"), pct, "%");
    $("sm-metas").textContent = tot ? `${feitas} de ${tot} concluídas` : "Nenhuma meta criada";
    animar($("st-foco"), S.sessoes, "", 2);
    $("sm-foco").textContent = `${S.focoMin} min focados`;

    $("mc-valor").textContent = `${feitas}/${tot} metas`;
    $("mc-pct").textContent = tot ? `${pct}% concluído` : "Nenhuma meta ainda";
    $("ring-metas").style.setProperty("--p", pct);
    animar($("ring-val"), pct, "%");
    $("rl-feitas").textContent = `Concluídas: ${feitas}`;
    $("rl-abertas").textContent = `Em aberto: ${tot - feitas}`;
    $("rl-atrasadas").textContent = `Atrasadas: ${atras}`;

    $("rp-ent").textContent = prox.length;
    $("rp-metas").textContent = pct + "%";
    $("rp-foco").textContent = S.focoMin >= 60 ? `${Math.floor(S.focoMin / 60)}h ${S.focoMin % 60}m` : `${S.focoMin} min`;
    $("meta-barra").style.width = pct + "%";
    $("meta-resumo").textContent = tot ? `${feitas} de ${tot} metas concluídas (${pct}%)` : "Adicione sua primeira meta.";
  }

  function linhaEntrevista(e, comExcluir) {
    const row = el("div", "task-row");
    const info = el("div");
    info.append(el("p", "task-name", e.empresa),
      el("small", "", `${fmtData(e.data)} às ${e.hora || "09:00"}${e.notas ? " · " + e.notas : ""}`));
    const [txt, cls] = rotulo(diasAte(e));
    const lado = el("div", "lado");
    lado.append(el("span", "status " + cls, txt));
    if (comExcluir) {
      const b = el("button", "text-button sm", "Excluir");
      b.type = "button";
      b.setAttribute("aria-label", "Excluir entrevista com " + e.empresa);
      b.onclick = () => {
        if (!confirm("Excluir a entrevista com " + e.empresa + "?")) return;
        S.entrevistas = S.entrevistas.filter((x) => x.id !== e.id);
        salvar(); renderEntrevistas(); renderCal(); renderStats(); verificarAvisos();
      };
      lado.append(b);
    }
    row.append(info, lado);
    return row;
  }

  function renderEntrevistas() {
    const todas = [...S.entrevistas].sort((a, b) => dataHora(a) - dataHora(b));
    const lista = $("ent-lista");
    lista.replaceChildren(...(todas.length ? todas.map((e) => linhaEntrevista(e, true)) : [vazio("Nenhuma entrevista agendada.")]));
    const prox = proximas().slice(0, 4);
    $("lista-prox").replaceChildren(...(prox.length ? prox.map((e) => linhaEntrevista(e, false)) : [vazio("Nenhuma entrevista agendada. Agende uma em Relatórios.")]));
  }

  function renderMetas() {
    const itens = [...S.metas].sort((a, b) => Number(a.feita) - Number(b.feita));
    $("meta-lista").replaceChildren(...(itens.length ? itens.map((m) => {
      const row = el("div", "task-row meta-item" + (m.feita ? " feita" : ""));
      const esq = el("div", "meta-esq");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = m.feita;
      cb.setAttribute("aria-label", "Concluir meta: " + m.titulo);
      cb.onchange = () => { m.feita = cb.checked; salvar(); renderMetas(); renderStats(); };
      const info = el("div");
      info.append(el("p", "task-name", m.titulo),
        el("small", "", m.prazo ? `Prazo: ${fmtData(m.prazo)}${atrasada(m) ? " (atrasada)" : ""}` : "Sem prazo"));
      esq.append(cb, info);
      const del = el("button", "text-button sm", "Excluir");
      del.type = "button";
      del.onclick = () => { S.metas = S.metas.filter((x) => x.id !== m.id); salvar(); renderMetas(); renderStats(); };
      row.append(esq, del);
      return row;
    }) : [vazio("Nenhuma meta criada.")]));
  }

  const CLASSE_STATUS = { "Concluído": "done", "Em andamento": "active", "Planejado": "waiting" };

  function renderProjetos() {
    $("project-list").replaceChildren(...(S.projetos.length ? S.projetos.map((p) => {
      const card = el("article", "project-card");
      const topo = el("div", "project-card-header");
      const linguagens = p.linguagens || (p.linguagem ? p.linguagem.split(",").map((l) => l.trim()).filter(Boolean) : []);
      topo.append(el("h3", "", p.nome), el("span", "language-tag", linguagens.join(", ")));
      const conteudo = el("div", "project-card-content");
      conteudo.append(el("p", "", p.detalhes));
      const codigos = { ...(p.codigos || {}) };
      if (p.codigo && !Object.keys(codigos).length) codigos[linguagens[0] || p.linguagem || "Código"] = p.codigo;
      if (p.html || p.css || p.js) {
        if (p.html) codigos.HTML = p.html;
        if (p.css) codigos.CSS = p.css;
        if (p.js) codigos.JavaScript = p.js;
      }
      if (Object.values(codigos).some(Boolean)) {
        const detalhesCodigo = el("details", "project-source");
        const resumoCodigo = el("summary", "", "Ver código do projeto");
        detalhesCodigo.append(resumoCodigo);
        Object.entries(codigos).forEach(([linguagem, codigo]) => {
          if (!codigo) return;
          detalhesCodigo.append(el("h4", "", linguagem), el("pre", "", codigo));
        });
        conteudo.append(detalhesCodigo);
      }
      const acoes = el("div", "form-actions");
      const rodar = el("button", "text-button sm", "Rodar");
      rodar.type = "button";
      const codigoWeb = codigoWebDoProjeto(p);
      rodar.onclick = () => rodarProjeto(p);
      rodar.hidden = !temCodigo(codigoWeb);
      const publicar = el("button", "text-button sm", p.publicado ? "Retirar da comunidade" : "Publicar");
      publicar.type = "button";
      publicar.disabled = modoLocal;
      publicar.title = modoLocal ? "A publicação precisa do backend PlanDev hospedado." : "";
      publicar.onclick = () => alternarPublicacaoProjeto(p);
      const del = el("button", "text-button sm", "Excluir");
      del.type = "button";
      del.onclick = () => {
        if (!confirm('Excluir o projeto "' + p.nome + '"?')) return;
        S.projetos = S.projetos.filter((x) => x.id !== p.id);
        salvar(); renderProjetos(); renderStats();
      };
      acoes.append(el("span", "status " + (CLASSE_STATUS[p.status] || "active"), p.status), rodar, publicar, del);
      card.append(topo, conteudo, acoes);
      return card;
    }) : [vazio("Nenhum projeto cadastrado.")]));

    $("dash-projetos").replaceChildren(...(S.projetos.length ? S.projetos.slice(0, 4).map((p) => {
      const it = el("div", "project-item");
      const info = el("div");
      info.append(el("strong", "", p.nome), el("small", "", (p.linguagens || [p.linguagem]).filter(Boolean).join(", ")));
      it.append(info, el("span", "status " + (CLASSE_STATUS[p.status] || "active"), p.status));
      return it;
    }) : [vazio("Nenhum projeto cadastrado.")]));
  }

  async function persistirPublicacao() {
    if (modoLocal || !servidor) {
      throw new Error("A comunidade online precisa do backend PlanDev hospedado. No GitHub Pages, a publicação fica indisponível.");
    }
    clearTimeout(salvarTimer);
    await filaSalvamento;
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: S }),
    });
    const data = await response.json();
    if (response.status === 401) {
      window.location.replace("/pages/login.html");
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    if (!response.ok) throw new Error(data.message || "Não foi possível salvar a publicação.");
  }

  async function alternarPublicacaoProjeto(projeto) {
    if (modoLocal) {
      toast("Para publicar na comunidade, o backend PlanDev precisa estar hospedado. GitHub Pages não oferece essa API.");
      return;
    }
    const anterior = Boolean(projeto.publicado);
    projeto.publicado = !anterior;
    salvarLocal();
    renderProjetos();
    try {
      await persistirPublicacao();
      toast(projeto.publicado ? "Projeto publicado na comunidade." : "Projeto retirado da comunidade.");
      if ($(".view-panel[data-view='online'].active")) await carregarComunidade();
    } catch (error) {
      projeto.publicado = anterior;
      salvarLocal();
      renderProjetos();
      toast(error instanceof Error ? error.message : "Não foi possível atualizar a publicação.");
    }
  }

  function renderComunidade() {
    const termo = $("community-search").value.trim().toLocaleLowerCase();
    const projetos = publicacoesOnline.filter((item) => item.tipo === "project").filter((item) => (
      [item.nome, item.autor, item.detalhes, ...(Array.isArray(item.linguagens) ? item.linguagens : [])]
        .join(" ").toLocaleLowerCase().includes(termo)
    ));
    const portfolios = publicacoesOnline.filter((item) => item.tipo === "portfolio").filter((item) => (
      [item.nome, item.autor, item.cargo, item.bio, item.skills].join(" ").toLocaleLowerCase().includes(termo)
    ));

    $("community-projects").replaceChildren(...(projetos.length ? projetos.map((item) => {
      const card = el("article", "community-card");
      const heading = el("div", "project-card-header");
      heading.append(el("h4", "", item.nome || "Projeto sem nome"));
      const languages = Array.isArray(item.linguagens) ? item.linguagens.join(", ") : "";
      if (languages) heading.append(el("span", "language-tag", languages));
      card.append(heading, el("p", "community-author", `Publicado por ${item.autor || "Programador"}`));
      if (item.detalhes) card.append(el("p", "community-description", item.detalhes));

      const codigos = item.codigos && typeof item.codigos === "object" ? item.codigos : {};
      const codeEntries = Object.entries(codigos).filter(([, source]) => typeof source === "string" && source);
      if (codeEntries.length) {
        const source = el("details", "project-source");
        source.append(el("summary", "", "Ver código publicado"));
        codeEntries.forEach(([language, code]) => source.append(el("h4", "", language), el("pre", "", code)));
        card.append(source);
      }
      const codigoWeb = codigoWebDoProjeto({ codigos });
      if (temCodigo(codigoWeb)) {
        const button = el("button", "text-button sm", "Ver projeto");
        button.type = "button";
        button.onclick = () => {
          runOnline.rodar(codigoWeb, `Projeto de ${item.autor || "programador"}: ${item.nome || "Projeto"}`);
          runOnline.host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
        };
        card.append(button);
      }
      return card;
    }) : [vazio(termo ? "Nenhum projeto encontrado." : "Ainda não há projetos publicados.")]));

    $("community-portfolios").replaceChildren(...(portfolios.length ? portfolios.map((item) => {
      const card = el("article", "community-card");
      card.append(
        el("h4", "", item.nome || "Portfólio"),
        el("p", "community-author", `Publicado por ${item.autor || "Programador"}`),
        el("p", "community-role", item.cargo || ""),
        el("p", "community-description", item.bio || ""),
      );
      const skills = String(item.skills || "").split(",").map((skill) => skill.trim()).filter(Boolean);
      if (skills.length) {
        const tags = el("div", "portfolio-tags");
        tags.replaceChildren(...skills.map((skill) => el("span", "", skill)));
        card.append(tags);
      }
      return card;
    }) : [vazio(termo ? "Nenhum portfólio encontrado." : "Ainda não há portfólios publicados.")]));
  }

  async function carregarComunidade() {
    const notice = $("community-notice");
    if (modoLocal) {
      publicacoesOnline = [];
      notice.textContent = "A comunidade online precisa do backend PlanDev hospedado. No GitHub Pages, os dados locais não são compartilhados entre programadores.";
      renderComunidade();
      return;
    }
    notice.textContent = "Carregando publicações...";
    try {
      const response = await fetch("/api/online");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.publicacoes)) {
        throw new Error(data.message || "Não foi possível carregar a comunidade.");
      }
      publicacoesOnline = data.publicacoes;
      notice.textContent = publicacoesOnline.length
        ? `${publicacoesOnline.length} publicação(ões) compartilhada(s).`
        : "Ainda não há publicações. Publique um projeto ou portfólio para começar.";
      renderComunidade();
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "Não foi possível carregar a comunidade.";
      $("community-projects").replaceChildren(vazio("Publicações indisponíveis."));
      $("community-portfolios").replaceChildren(vazio("Publicações indisponíveis."));
    }
  }

  function renderPortfolio() {
    const p = S.portfolio;
    $("portfolio-preview-name").textContent = p.nome || "Seu nome";
    $("portfolio-preview-role").textContent = p.cargo || "Sua especialidade";
    $("portfolio-preview-bio").textContent = p.bio || "Preencha o formulário acima para montar o seu portfolio.";
    const tags = p.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    $("portfolio-preview-skills").replaceChildren(...tags.map((t) => el("span", "", t.slice(0, 30))));
    const publicar = $("portfolio-publish");
    publicar.textContent = p.publicado ? "Retirar portfólio da comunidade" : "Publicar meu portfólio";
    publicar.disabled = modoLocal || !p.nome || !p.cargo || !p.bio;
    publicar.title = modoLocal
      ? "A publicação precisa do backend PlanDev hospedado."
      : !p.nome || !p.cargo || !p.bio
        ? "Preencha e salve nome, especialidade e descrição antes de publicar."
        : "";
  }

  function nomeExibicao() { return S.nome || (servidor && servidor.nome) || ""; }

  function renderPerfil() {
    const nome = nomeExibicao();
    $("titulo").textContent = nome ? "Olá, " + nome.split(" ")[0] : "Bem-vindo ao seu workspace";
    $("perfil-nome").textContent = nome || "Seu perfil";
    $("perfil-email").textContent = servidor ? servidor.email : "";
    const inicial = (nome || "?").trim().charAt(0).toUpperCase() || "?";
    $("avatar-ini").textContent = inicial;
    $("brand-avatar-ini").textContent = inicial;
    [["avatar-img", "avatar-ini"], ["brand-avatar-img", "brand-avatar-ini"]].forEach(([imgId, inicialId]) => {
      const img = $(imgId);
      if (S.avatar) {
        img.src = S.avatar;
        img.hidden = false;
        $(inicialId).hidden = true;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
        $(inicialId).hidden = false;
      }
    });
  }

  // ---------- Calendário ----------
  let cal = new Date();
  cal = new Date(cal.getFullYear(), cal.getMonth(), 1);

  function renderCal() {
    const g = $("cal-grid");
    g.replaceChildren();
    $("cal-titulo").textContent = cal.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    "DSTQQSS".split("").forEach((l) => g.append(el("span", "cal-dow", l)));
    const ano = cal.getFullYear(), mes = cal.getMonth();
    for (let i = 0; i < new Date(ano, mes, 1).getDay(); i++) g.append(el("span"));
    const hoje = iso(new Date());
    for (let d = 1, total = new Date(ano, mes + 1, 0).getDate(); d <= total; d++) {
      const s = iso(new Date(ano, mes, d));
      const b = el("button", "cal-dia", d);
      b.type = "button";
      const marcadas = S.entrevistas.filter((e) => e.data === s);
      b.setAttribute("aria-label", fmtData(s) + (marcadas.length ? ": " + marcadas.map((e) => e.empresa).join(", ") : ""));
      if (marcadas.length) { b.classList.add("marcado"); b.title = marcadas.map((e) => e.empresa).join(", "); }
      if (s === hoje) b.classList.add("hoje");
      if (s === dataIsoDePtBr($("ent-data").value)) b.classList.add("sel");
      b.onclick = () => { $("ent-data").value = fmtData(s); renderCal(); };
      g.append(b);
    }
  }
  $("cal-prev").addEventListener("click", () => { cal = new Date(cal.getFullYear(), cal.getMonth() - 1, 1); renderCal(); });
  $("cal-next").addEventListener("click", () => { cal = new Date(cal.getFullYear(), cal.getMonth() + 1, 1); renderCal(); });

  // ---------- Avisos de entrevista (faltando poucos dias e no dia) ----------
  const descartados = new Set();
  function verificarAvisos() {
    const box = $("alertas");
    box.replaceChildren();
    let mudou = false;
    proximas().forEach((e) => {
      const d = diasAte(e);
      if (d > 3) return;
      const hora = e.hora || "09:00";
      const msg = d === 0 ? `Hoje é o dia da sua entrevista com ${e.empresa}, às ${hora}. Boa sorte!`
        : d === 1 ? `Amanhã: entrevista com ${e.empresa}, às ${hora}.`
        : `Em ${d} dias: entrevista com ${e.empresa} (${fmtData(e.data)}, às ${hora}).`;
      const etapa = d === 0 ? "hoje" : "perto";
      e.avisos = e.avisos || {};
      if (!e.avisos[etapa]) {
        e.avisos[etapa] = true; mudou = true;
        if (S.cfg.avisos) notificar(d === 0 ? "Entrevista hoje" : "Entrevista chegando", msg);
      }
      const chave = e.id + ":" + d;
      if (descartados.has(chave)) return;
      const b = el("div", "alerta" + (d === 0 ? " hoje" : ""));
      b.setAttribute("role", "alert");
      const x = el("button", "", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Dispensar aviso");
      x.onclick = () => { descartados.add(chave); b.remove(); };
      b.append(el("span", "", msg), x);
      box.append(b);
    });
    if (mudou) salvar();
  }

  // ---------- Rodador de código (área isolada) ----------
  const PONTE = `<script>(function(){var f=function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}};var p=function(t,m){try{parent.postMessage({plandev:1,t:t,m:m},"*")}catch(e){}};["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){p(k,[].slice.call(arguments).map(f).join(" "));try{o.apply(console,arguments)}catch(e){}}});window.addEventListener("error",function(e){p("error",e.message+(e.lineno?" (linha "+e.lineno+")":""))});window.addEventListener("unhandledrejection",function(e){p("error","Promise rejeitada: "+f(e.reason))})})();<\/script>`;

  function montarDoc({ html = "", css = "", js = "" }) {
    const estilo = css ? `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>` : "";
    const script = js ? `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>` : "";
    if (/<html[\s>]|<!doctype/i.test(html)) {
      let d = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, (m) => PONTE + estilo + m) : PONTE + estilo + html;
      return /<\/body>/i.test(d) ? d.replace(/<\/body>/i, (m) => script + m) : d + script;
    }
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${PONTE}${estilo}</head><body>${html}${script}</body></html>`;
  }

  const runners = [];
  function montarRunner(host) {
    const barra = el("div", "runner-bar");
    const titulo = el("strong", "", "Pré-visualização");
    const acoes = el("div", "runner-acoes");
    const stage = el("div", "runner-stage");
    const frame = document.createElement("iframe");
    frame.title = "Pré-visualização do código";
    // Sem allow-same-origin: o código rodado não enxerga cookies, sessão nem dados do dashboard.
    frame.setAttribute("sandbox", "allow-scripts allow-modals allow-forms allow-popups");
    stage.append(frame);
    const log = el("pre", "runner-console");
    log.setAttribute("aria-live", "polite");
    let ultimo = null;

    const r = { host, frame, erros: 0 };
    const botao = (txt, fn) => { const b = el("button", "text-button sm", txt); b.type = "button"; b.onclick = fn; acoes.append(b); };
    r.rodar = (codigo, nome) => {
      ultimo = codigo; r.erros = 0;
      host.hidden = false;
      if (nome) titulo.textContent = nome;
      log.textContent = "";
      frame.classList.remove("pronto");
      frame.srcdoc = montarDoc(codigo);
    };
    r.escrever = (tipo, msg) => {
      if (tipo === "error") r.erros++;
      const linhas = (log.textContent + `[${tipo}] ${msg}\n`).split("\n");
      log.textContent = linhas.slice(-200).join("\n");
      log.scrollTop = log.scrollHeight;
    };
    botao("Desktop", () => { frame.style.width = "100%"; });
    botao("Celular", () => { frame.style.width = "390px"; });
    botao("Recarregar", () => { if (ultimo) r.rodar(ultimo); });
    botao("Fechar", () => { host.hidden = true; frame.removeAttribute("srcdoc"); });
    frame.addEventListener("load", () => frame.classList.add("pronto"));
    barra.append(titulo, acoes);
    host.append(barra, stage, log);
    runners.push(r);
    return r;
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.plandev) return;
    const r = runners.find((x) => x.frame.contentWindow === e.source);
    if (r) r.escrever(String(d.t).slice(0, 10), String(d.m).slice(0, 500));
  });

  const runP = montarRunner($("runner-proj"));
  const runPort = montarRunner($("runner-port"));
  const runOnline = montarRunner($("runner-online"));
  const lerCodigo = (p) => ({ html: $(p + "-html").value, css: $(p + "-css").value, js: $(p + "-js").value });
  const temCodigo = (c) => (c.html + c.css + c.js).trim().length > 0;
  const exemplosCodigo = {
    HTML: "<!doctype html>\n<html lang=\"pt-BR\">\n  <body>\n    <h1>Meu projeto</h1>\n  </body>\n</html>",
    CSS: "body {\n  font-family: sans-serif;\n}",
    JavaScript: "console.log(\"Meu projeto\");",
    TypeScript: "const mensagem: string = \"Meu projeto\";\nconsole.log(mensagem);",
    Python: "print(\"Meu projeto\")",
    Java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Meu projeto\");\n    }\n}",
    "C": "#include <stdio.h>\n\nint main(void) {\n    printf(\"Meu projeto\\\\n\");\n    return 0;\n}",
    "C++": "#include <iostream>\n\nint main() {\n    std::cout << \"Meu projeto\\\\n\";\n    return 0;\n}",
    "C#": "using System;\n\nConsole.WriteLine(\"Meu projeto\");",
    PHP: "<?php\necho \"Meu projeto\";",
    Ruby: "puts \"Meu projeto\"",
    Go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Meu projeto\")\n}",
    Rust: "fn main() {\n    println!(\"Meu projeto\");\n}",
    Kotlin: "fun main() {\n    println(\"Meu projeto\")\n}",
    Swift: "print(\"Meu projeto\")",
    SQL: "SELECT 'Meu projeto' AS mensagem;",
  };
  const rascunhosCodigo = new Map();
  const linguagensWeb = "Web (HTML, CSS e JavaScript)";

  function linguagensSelecionadas() {
    const escolhidas = $$('input[name="project-language"]:checked').map((checkbox) => checkbox.value);
    const extras = $("project-language-custom").value.split(",").map((linguagem) => linguagem.trim()).filter(Boolean);
    const unicas = new Map();
    [...escolhidas, ...extras].forEach((linguagem) => {
      const chave = linguagem.toLocaleLowerCase();
      if (!unicas.has(chave)) unicas.set(chave, linguagem.slice(0, 40));
    });
    return [...unicas.values()];
  }

  function atualizarEditorProjeto() {
    [...$("project-code-editors").querySelectorAll("textarea[data-language-code]")].forEach((area) => {
      rascunhosCodigo.set(area.dataset.languageCode, area.value);
    });
    const linguagens = linguagensSelecionadas();
    const linguagensCodigo = linguagens.flatMap((linguagem) => (
      linguagem === linguagensWeb ? ["HTML", "CSS", "JavaScript"] : [linguagem]
    ));
    const editors = $("project-code-editors");
    editors.replaceChildren();
    linguagensCodigo.forEach((linguagem, index) => {
      const label = el("label");
      const id = `project-code-${index}`;
      const area = document.createElement("textarea");
      area.id = id;
      area.className = "code";
      area.rows = 12;
      area.maxLength = 50000;
      area.spellcheck = false;
      area.dataset.languageCode = linguagem;
      area.placeholder = exemplosCodigo[linguagem] || `Escreva o código ${linguagem} aqui`;
      area.value = rascunhosCodigo.get(linguagem) || "";
      area.addEventListener("input", () => {
        rascunhosCodigo.set(linguagem, area.value);
        if (linguagens.includes(linguagensWeb) && !runP.host.hidden) {
          runP.rodar(lerCodigoProjetoWeb(), "Pré-visualização do projeto");
        }
      });
      label.append(el("span", "", `Código ${linguagem}`), area);
      editors.append(label);
    });
    $("project-run").hidden = !linguagens.includes(linguagensWeb);
    $("project-code-help").hidden = !linguagens.length;
    $("project-code-help").textContent = linguagens.includes(linguagensWeb)
      ? "Pré-visualização executa HTML, CSS e JavaScript no navegador. As outras linguagens ficam salvas no projeto."
      : "O código de cada linguagem será salvo no projeto. A pré-visualização no navegador só executa projetos Web.";
  }

  function lerCodigoProjetoWeb() {
    return {
      html: rascunhosCodigo.get("HTML") || "",
      css: rascunhosCodigo.get("CSS") || "",
      js: rascunhosCodigo.get("JavaScript") || "",
    };
  }

  function codigoWebDoProjeto(projeto) {
    const codigos = projeto.codigos || {};
    return {
      html: projeto.html || codigos.HTML || codigos.html || "",
      css: projeto.css || codigos.CSS || codigos.css || "",
      js: projeto.js || codigos.JavaScript || codigos.javascript || codigos.js || "",
    };
  }

  function rodarProjeto(p) {
    const codigo = codigoWebDoProjeto(p);
    if (!temCodigo(codigo)) {
      return toast("A prévia do navegador executa HTML, CSS e JavaScript. Este projeto só tem código de outra linguagem.");
    }
    ir("projetos");
    runP.rodar(codigo, "Rodando: " + p.nome);
    runP.host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }

  $("project-run").addEventListener("click", () => {
    const c = lerCodigoProjetoWeb();
    if (!temCodigo(c)) return toast("Cole algum HTML, CSS ou JavaScript para rodar.");
    runP.rodar(c, "Pré-visualização do projeto");
    runP.host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  });

  $("project-language-options").addEventListener("change", atualizarEditorProjeto);
  $("project-language-custom").addEventListener("input", atualizarEditorProjeto);
  atualizarEditorProjeto();

  $("project-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("project-name").value.trim().slice(0, 80);
    if (!nome) return;
    const status = $("project-status").value;
    const linguagens = linguagensSelecionadas();
    if (!linguagens.length) return toast("Escolha pelo menos uma linguagem para o projeto.");
    const codigos = Object.fromEntries(
      [...$("project-code-editors").querySelectorAll("textarea")].map((area, index) => {
        const linguagem = linguagens.flatMap((item) => item === linguagensWeb ? ["HTML", "CSS", "JavaScript"] : [item])[index];
        return [linguagem, area.value];
      })
    );
    const codigoWeb = linguagens.includes(linguagensWeb);
    S.projetos.unshift({
      id: novoId(), nome,
      linguagem: linguagens.join(", "),
      linguagens,
      detalhes: $("project-details").value.trim().slice(0, 1000),
      status: CLASSE_STATUS[status] ? status : "Em andamento",
      codigos,
      html: codigoWeb ? codigos.HTML || "" : "",
      css: codigoWeb ? codigos.CSS || "" : "",
      js: codigoWeb ? codigos.JavaScript || "" : "",
    });
    salvar();
    e.target.reset();
    rascunhosCodigo.clear();
    $("project-code-editors").replaceChildren();
    atualizarEditorProjeto();
    runP.host.hidden = true;
    renderProjetos(); renderStats();
    toast("Projeto adicionado.");
  });

  // ---------- Portfolio: rodar e verificar ----------
  function verificar(codigo) {
    const doc = new DOMParser().parseFromString(montarDoc(codigo), "text/html"); // não executa scripts
    const imgs = [...doc.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
    const links = [...doc.querySelectorAll("a")].filter((a) => { const h = (a.getAttribute("href") || "").trim(); return !h || h === "#" || /^javascript:/i.test(h); }).length;
    return [
      [!!doc.title.trim(), "Tem título da página (<title>)"],
      [!!doc.documentElement.getAttribute("lang"), "Idioma definido (atributo lang)"],
      [!!doc.querySelector('meta[name="viewport"]'), "Preparado para celular (meta viewport)"],
      [doc.querySelectorAll("h1").length === 1, "Exatamente um título principal (h1)"],
      [imgs === 0, imgs ? `${imgs} imagem(ns) sem texto alternativo (alt)` : "Imagens com texto alternativo (alt)"],
      [links === 0, links ? `${links} link(s) sem destino válido` : "Links com destino válido"],
      [doc.body.textContent.trim().length >= 50, "Conteúdo suficiente na página"],
    ];
  }

  function rodarPortfolio() {
    const c = lerCodigo("port");
    if (!temCodigo(c)) return toast("Cole o HTML, CSS e JavaScript do seu portfolio.");
    runPort.rodar(c, "Seu portfolio");
    const lista = verificar(c);
    const ul = $("checks");
    const itens = lista.map(([ok, txt]) => el("li", ok ? "ok" : "falha", txt));
    const js = el("li", "espera", "Rodando o JavaScript...");
    ul.replaceChildren(...itens, js);
    ul.hidden = false;
    const resumo = $("port-resumo");
    resumo.hidden = false;
    setTimeout(() => {
      if (runPort.host.hidden) return;
      const semErro = runPort.erros === 0;
      js.className = semErro ? "ok" : "falha";
      js.textContent = semErro ? "Sem erros de JavaScript ao carregar" : `${runPort.erros} erro(s) de JavaScript (veja o console acima)`;
      const total = lista.length + 1;
      const ok = lista.filter((x) => x[0]).length + (semErro ? 1 : 0);
      resumo.textContent = ok === total ? `Perfeito: ${ok} de ${total} verificações passaram.` : `${ok} de ${total} verificações passaram. Corrija os itens marcados com ✕.`;
    }, 1500);
  }

  $("portfolio-code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    Object.assign(S.portfolio, lerCodigo("port"));
    salvar();
    rodarPortfolio();
    runPort.host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  });
  const aoDigitarPort = debounce(() => { if (!runPort.host.hidden) { const c = lerCodigo("port"); if (temCodigo(c)) runPort.rodar(c); } }, 800);
  ["port-html", "port-css", "port-js"].forEach((id) => $(id).addEventListener("input", aoDigitarPort));

  $("portfolio-form").addEventListener("submit", (e) => {
    e.preventDefault();
    Object.assign(S.portfolio, {
      nome: $("portfolio-name").value.trim().slice(0, 60),
      cargo: $("portfolio-role").value.trim().slice(0, 60),
      bio: $("portfolio-bio").value.trim().slice(0, 600),
      skills: $("portfolio-skills").value.trim().slice(0, 300),
    });
    salvar(); renderPortfolio();
    toast("Portfolio atualizado.");
  });
  $("portfolio-publish").addEventListener("click", async () => {
    if (modoLocal) {
      toast("Para publicar na comunidade, o backend PlanDev precisa estar hospedado. GitHub Pages não oferece essa API.");
      return;
    }
    if (!S.portfolio.nome || !S.portfolio.cargo || !S.portfolio.bio) {
      toast("Preencha e salve nome, especialidade e descrição antes de publicar.");
      return;
    }
    const anterior = Boolean(S.portfolio.publicado);
    S.portfolio.publicado = !anterior;
    salvarLocal();
    renderPortfolio();
    try {
      await persistirPublicacao();
      toast(S.portfolio.publicado ? "Portfólio publicado na comunidade." : "Portfólio retirado da comunidade.");
      if ($(".view-panel[data-view='online'].active")) await carregarComunidade();
    } catch (error) {
      S.portfolio.publicado = anterior;
      salvarLocal();
      renderPortfolio();
      toast(error instanceof Error ? error.message : "Não foi possível atualizar a publicação.");
    }
  });

  // ---------- Entrevistas e metas (formulários) ----------
  $("ent-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const empresa = $("ent-empresa").value.trim().slice(0, 80);
    const data = dataIsoDePtBr($("ent-data").value);
    if (!empresa || !data) return toast("Informe a empresa e uma data válida no formato DD/MM/AAAA.");
    S.entrevistas.push({ id: novoId(), empresa, data, hora: $("ent-hora").value || "09:00", notas: $("ent-notas").value.trim().slice(0, 200), avisos: {} });
    salvar();
    cal = new Date(+data.slice(0, 4), +data.slice(5, 7) - 1, 1);
    e.target.reset();
    renderEntrevistas(); renderCal(); renderStats(); verificarAvisos();
    toast("Entrevista agendada.");
  });

  $("meta-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const titulo = $("meta-titulo").value.trim().slice(0, 100);
    if (!titulo) return;
    S.metas.push({ id: novoId(), titulo, prazo: $("meta-prazo").value || "", feita: false });
    salvar();
    e.target.reset();
    renderMetas(); renderStats();
  });

  // ---------- Perfil e configurações ----------
  function abrirSet(nome) {
    $$(".perfil-menu button").forEach((b) => b.classList.toggle("active", b.dataset.set === nome));
    $$("[data-set-painel]").forEach((p) => { p.hidden = p.dataset.setPainel !== nome; });
  }
  $("avatar-btn").addEventListener("click", () => {
    const abrir = $("perfil-menu").hidden;
    $("perfil-menu").hidden = !abrir;
    $("avatar-btn").setAttribute("aria-expanded", String(abrir));
    if (abrir) abrirSet("config"); else $$("[data-set-painel]").forEach((p) => { p.hidden = true; });
  });
  $("brand-avatar").addEventListener("click", () => {
    ir("configuracoes");
    $("perfil-menu").hidden = false;
    $("avatar-btn").setAttribute("aria-expanded", "true");
    abrirSet("conta");
  });
  $$(".perfil-menu button").forEach((b) => b.addEventListener("click", () => abrirSet(b.dataset.set)));
  $$(".tema-opcoes button").forEach((b) => b.addEventListener("click", () => aplicarTema(b.dataset.tema)));

  [["cfg-sessao", "sessao"], ["cfg-pausa", "pausa"], ["cfg-avisos", "avisos"]].forEach(([id, chave]) => {
    $(id).addEventListener("change", (e) => {
      S.cfg[chave] = e.target.checked;
      salvar();
      if (chave === "avisos" && e.target.checked && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    });
  });

  $("conta-form").addEventListener("submit", (e) => {
    e.preventDefault();
    S.nome = $("conta-nome").value.trim().slice(0, 60);
    salvar(); renderPerfil();
    toast("Conta atualizada.");
  });
  $("conta-remover").addEventListener("click", () => { S.avatar = ""; salvar(); renderPerfil(); toast("Foto removida."); });
  $("conta-foto").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type) || f.size > 5 * 1024 * 1024) return toast("Escolha uma imagem PNG, JPG, WEBP ou GIF de até 5 MB.");
    try {
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas");
      c.width = c.height = 160;
      const lado = Math.min(bmp.width, bmp.height);
      c.getContext("2d").drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, 160, 160);
      S.avatar = c.toDataURL("image/jpeg", 0.85);
      salvar(); renderPerfil();
      toast("Foto atualizada.");
    } catch { toast("Não foi possível ler essa imagem."); }
  });

  // ---------- Pomodoro ----------
  const DURACAO = { work: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60 };
  let modo = "work", resta = DURACAO.work, timer = null, fim = 0;
  const fmtTempo = (s) => `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;

  function desenharTimer() {
    $("timer-display").textContent = fmtTempo(resta);
    document.querySelector(".timer-ring").style.setProperty("--p", (resta / DURACAO[modo]) * 100);
    $("start-pause").textContent = timer ? "Pausar" : resta < DURACAO[modo] ? "Continuar" : "Iniciar";
  }
  function trocarModo(m) {
    clearInterval(timer); timer = null;
    modo = m; resta = DURACAO[m];
    $$(".mode-button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    desenharTimer();
  }
  function terminar() {
    clearInterval(timer); timer = null;
    if (modo === "work") {
      S.sessoes++; S.focoMin += 25; salvar(); renderStats();
      if (S.cfg.sessao) notificar("Foco concluído", "Hora de uma pausa. Você mandou bem!");
      trocarModo(S.sessoes % 4 === 0 ? "longBreak" : "shortBreak");
    } else {
      if (S.cfg.pausa) notificar("Pausa encerrada", "Bora voltar ao foco!");
      trocarModo("work");
    }
  }
  function alternarTimer() {
    if (timer) {
      resta = Math.max(0, Math.round((fim - Date.now()) / 1000));
      clearInterval(timer); timer = null;
    } else {
      fim = Date.now() + resta * 1000; // baseado no relógio: não atrasa com a aba em segundo plano
      timer = setInterval(() => {
        resta = Math.max(0, Math.round((fim - Date.now()) / 1000));
        desenharTimer();
        if (resta <= 0) terminar();
      }, 250);
    }
    desenharTimer();
  }
  $("start-pause").addEventListener("click", alternarTimer);
  $("reset-timer").addEventListener("click", () => trocarModo(modo));
  $$(".mode-button").forEach((b) => b.addEventListener("click", () => trocarModo(b.dataset.mode)));
  $("session-button").addEventListener("click", () => {
    ir("pomodoro");
    if (!timer) { if (modo !== "work") trocarModo("work"); alternarTimer(); }
  });

  // ---------- Terminal que "digita" ----------
  function terminal() {
    const code = $("terminal");
    const feitas = S.metas.filter((m) => m.feita).length;
    const linhas = ["$ plandev status", `> ${S.projetos.length} projeto(s)`, `> ${proximas().length} entrevista(s) agendada(s)`, `> ${feitas}/${S.metas.length} meta(s) concluída(s)`];
    const cursor = el("span", "cursor");
    if (reduce) { code.textContent = linhas.join("\n"); code.append(cursor); return; }
    const texto = document.createTextNode("");
    code.textContent = "";
    code.append(texto, cursor);
    let l = 0, c = 0;
    const digitar = () => {
      if (l >= linhas.length) return;
      if (c < linhas[l].length) { texto.data += linhas[l][c++]; setTimeout(digitar, l === 0 ? 70 : 25); }
      else { texto.data += "\n"; l++; c = 0; setTimeout(digitar, 450); }
    };
    setTimeout(digitar, 500);
  }

  // ---------- Brilho que segue o mouse ----------
  $$(".panel, .stat-card").forEach((card) => card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
  }));

  // ---------- Sair ----------
  const sair = document.querySelector(".logout-link");
  sair.addEventListener("click", async (e) => {
    e.preventDefault();
    if (modoLocal) {
      localStorage.removeItem("plandev:sessao:local:v1");
      window.location.href = sair.getAttribute("href");
      return;
    }
    try { await fetch("/api/sair", { method: "POST" }); } catch { /* segue para o login */ }
    window.location.href = sair.getAttribute("href");
  });

  // ---------- Início ----------
  async function iniciar() {
    if (modoLocal) {
      try {
        const email = localStorage.getItem("plandev:sessao:local:v1");
        const usuarios = JSON.parse(localStorage.getItem("plandev:usuarios:local:v1") || "[]");
        const usuario = Array.isArray(usuarios) && usuarios.find((item) => item.email === email);
        if (!usuario) {
          localStorage.removeItem("plandev:sessao:local:v1");
          window.location.replace("login.html");
          return;
        }
        servidor = { email: usuario.email, nome: usuario.nome };
        uid = String(usuario.email).toLowerCase();
        carregar();
      } catch (error) {
        toast(error instanceof Error
          ? `Não foi possível carregar o perfil salvo: ${error.message}`
          : "Não foi possível carregar o perfil salvo.");
        return;
      }
      toast("Modo local: seus dados ficam salvos somente neste navegador.");
    } else {
      try {
        const r = await fetch("/api/eu");
        if (r.status === 401) {
          window.location.replace("/pages/login.html");
          return;
        }
        if (!r.ok) {
          toast("Não foi possível carregar sua conta. Tente novamente.");
          return;
        }
        servidor = await r.json();
      } catch {
        toast("Não foi possível conectar ao PlanDev. Abra o site pelo servidor e tente novamente.");
        return;
      }
      if (!servidor || !servidor.email) {
        toast("Não foi possível identificar sua conta. Entre novamente.");
        window.location.replace("/pages/login.html");
        return;
      }
      uid = String(servidor.email).toLowerCase();
      carregar();
      try {
        const response = await fetch("/api/workspace");
        const data = await response.json();
        if (response.status === 401) {
          window.location.replace("/pages/login.html");
          return;
        }
        if (!response.ok) throw new Error(data.message || "Não foi possível carregar os dados da conta.");
        if (data.exists) {
          if (!data.workspace || typeof data.workspace !== "object" || Array.isArray(data.workspace)) {
            throw new Error("Os dados salvos da conta estão inválidos.");
          }
          carregarWorkspace(data.workspace);
          salvarLocal();
        } else {
          sincronizarWorkspace(JSON.stringify(S));
        }
      } catch (error) {
        toast(error instanceof Error
          ? `Não foi possível carregar os dados: ${error.message}`
          : "Não foi possível carregar os dados da sua conta.");
        return;
      }
    }

    $("cfg-sessao").checked = S.cfg.sessao;
    $("cfg-pausa").checked = S.cfg.pausa;
    $("cfg-avisos").checked = S.cfg.avisos;
    $("conta-nome").value = nomeExibicao();
    $("conta-email").value = servidor.email;
    const p = S.portfolio;
    $("portfolio-name").value = p.nome; $("portfolio-role").value = p.cargo;
    $("portfolio-bio").value = p.bio; $("portfolio-skills").value = p.skills;
    $("port-html").value = p.html; $("port-css").value = p.css; $("port-js").value = p.js;

    renderPerfil(); renderProjetos(); renderPortfolio(); renderEntrevistas(); renderMetas(); renderCal(); renderStats();
    verificarAvisos();
    setInterval(verificarAvisos, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) verificarAvisos(); });
    desenharTimer();
    terminal();
  }
  iniciar();
})();