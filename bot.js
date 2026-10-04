(() => {
  const bot = document.querySelector(".dev-bot");
  const form = document.querySelector(".cadastro-form");
  if (!bot || !form) return;

  const head = bot.querySelector("#bot-head");
  const bubble = bot.querySelector("#bot-bubble");
  const eyes = [...bot.querySelectorAll(".eye")];
  const pupils = [...bot.querySelectorAll(".pupil")];
  const DEFAULT_MSG = 'console.log("oi!");';
  const MSG = {
    nome: "qual é o seu nome?",
    email: "seu e-mail, por favor",
    "email-login": "vamos entrar na sua conta",
    senha: "não vou olhar, prometo",
    "senha-login": "sua senha está segura",
    "confirmar-senha": "ainda de olhos fechados",
  };

  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let focusPoint = null;
  let lastKey = 0;
  let typingTimer;

  const say = (text) => { bubble.textContent = text; };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Olhos e cabeça acompanham o alvo (mouse ou campo que está sendo preenchido)
  function update() {
    const t = focusPoint && Date.now() - lastKey < 1600 ? focusPoint : mouse;
    eyes.forEach((eye, i) => {
      const r = eye.getBoundingClientRect();
      const dx = t.x - (r.left + r.width / 2);
      const dy = t.y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(6, d / 12);
      pupils[i].style.transform = `translate(${(dx / d) * m}px, ${(dy / d) * m}px)`;
    });
    const h = head.getBoundingClientRect();
    const tilt = clamp(((t.x - (h.left + h.width / 2)) / window.innerWidth) * 16, -8, 8);
    head.style.transform = `rotate(${tilt}deg)`;
    requestAnimationFrame(update);
  }

  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  const pointOf = (input) => {
    const r = input.getBoundingClientRect();
    const x = r.left + Math.min(r.width - 20, 24 + input.value.length * 9);
    return { x, y: r.top + r.height / 2 };
  };

  form.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el.tagName !== "INPUT") return;
    lastKey = Date.now();
    focusPoint = pointOf(el);
    bot.classList.toggle("shy", el.type === "password");
    say(MSG[el.id] || DEFAULT_MSG);
  });

  form.addEventListener("focusout", (e) => {
    if (e.target.tagName !== "INPUT") return;
    focusPoint = null;
    bot.classList.remove("shy", "typing");
    say(DEFAULT_MSG);
  });

  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.tagName !== "INPUT") return;
    lastKey = Date.now();
    if (el.type !== "password") focusPoint = pointOf(el);
    bot.classList.add("typing");
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => bot.classList.remove("typing"), 450);

    if (el.id === "nome") {
      const first = el.value.trim().split(/\s+/)[0];
      say(first ? `oi, ${first}!` : MSG.nome);
    }
  });

  // Comemora quando o mouse chega no botão de criar conta ou entrar
  const btn = form.querySelector("button");
  const cheer = () => { bot.classList.add("happy"); say(form.id === "login-form" ? "vamos entrar!" : "bora codar!"); };
  const calm = () => { bot.classList.remove("happy"); say(DEFAULT_MSG); };
  btn.addEventListener("mouseenter", cheer);
  btn.addEventListener("focus", cheer);
  btn.addEventListener("mouseleave", calm);
  btn.addEventListener("blur", calm);
  btn.addEventListener("click", () => {
    bot.classList.add("happy");
    say(form.id === "login-form" ? "login autorizado!" : "conta criada!");
    setTimeout(() => {
      bot.classList.remove("happy");
      say(DEFAULT_MSG);
    }, 1200);
  });

  // Piscar de vez em quando
  (function blink() {
    setTimeout(() => {
      bot.classList.add("blink");
      setTimeout(() => bot.classList.remove("blink"), 140);
      blink();
    }, 2500 + Math.random() * 2500);
  })();

  requestAnimationFrame(update);
})();