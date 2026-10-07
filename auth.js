const iniciarAutenticacao = () => {
  const cadastroForm = document.getElementById('cadastro-form');
  const loginForm = document.getElementById('login-form');
  const modoLocal = window.location.protocol === 'file:' || ['github.io', 'netlify.app'].some((d) => window.location.hostname.endsWith(d));
  const CHAVE_USUARIOS = 'plandev:usuarios:local:v1';
  const CHAVE_SESSAO = 'plandev:sessao:local:v1';
  const ITERACOES_HASH = 120000;

  if (modoLocal) {
    const aviso = document.createElement('p');
    aviso.className = 'local-mode-note';
    aviso.textContent = 'Modo local: perfil e projetos ficam somente neste navegador.';
    document.querySelector('.card-header')?.appendChild(aviso);
  }

  const lerUsuarios = () => {
    const usuarios = JSON.parse(localStorage.getItem(CHAVE_USUARIOS) || '[]');
    if (!Array.isArray(usuarios)) {
      throw new Error('Os perfis locais estão inválidos. Limpe os dados deste site e tente novamente.');
    }
    return usuarios;
  };

  const hashSenha = async (senha, salt) => {
    if (!window.crypto?.subtle) {
      throw new Error('Seu navegador não oferece suporte ao cadastro local seguro. Atualize o navegador.');
    }
    const chave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(senha),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const saltBytes = Uint8Array.from(salt.match(/.{2}/g), (byte) => parseInt(byte, 16));
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERACOES_HASH,
      hash: 'SHA-256'
    }, chave, 256);
    return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const criarPerfilLocal = async (nome, email, senha) => {
    const usuarios = lerUsuarios();
    const emailNormalizado = email.toLowerCase();
    if (usuarios.some((usuario) => usuario.email === emailNormalizado)) {
      throw new Error('Já existe um perfil local com este e-mail. Entre na sua conta.');
    }
    const salt = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    usuarios.push({
      nome,
      email: emailNormalizado,
      salt,
      senhaHash: await hashSenha(senha, salt)
    });
    localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios));
    localStorage.setItem(CHAVE_SESSAO, emailNormalizado);
  };

  const entrarLocal = async (email, senha) => {
    const emailNormalizado = email.toLowerCase();
    const usuario = lerUsuarios().find((item) => item.email === emailNormalizado);
    if (!usuario || await hashSenha(senha, usuario.salt) !== usuario.senhaHash) {
      throw new Error('E-mail ou senha inválidos neste navegador. Se ainda não se cadastrou aqui, crie um perfil local.');
    }
    localStorage.setItem(CHAVE_SESSAO, emailNormalizado);
  };

  const requisicaoApi = async (url, options) => {
    if (window.location.protocol === 'file:') {
      throw new Error('Abra o PlanDev pelo servidor: http://127.0.0.1:5000/pages/cadastro.html');
    }
    try {
      return await fetch(url, options);
    } catch {
      throw new Error('Não foi possível conectar ao PlanDev. Verifique se o servidor está iniciado.');
    }
  };

  const entrar = async (email, senha) => {
    if (modoLocal) {
      await entrarLocal(email, senha);
      return { is_demo: email.toLowerCase() === 'teste@plandev.local' };
    }
    const response = await requisicaoApi('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Erro ao fazer login.');
    }
    return data;
  };

  if (cadastroForm) {
    cadastroForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nome = document.getElementById('nome').value.trim();
      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('senha').value;
      const confirmarSenha = document.getElementById('confirmar-senha').value;
      if (senha !== confirmarSenha) {
        alert('As senhas precisam ser iguais.');
        return;
      }

      try {
        if (modoLocal) {
          await criarPerfilLocal(nome, email, senha);
        } else {
          const response = await requisicaoApi('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha })
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.message || 'Erro ao cadastrar usuário.');
          }
        }
        window.location.href = 'dashboard.html';
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao cadastrar usuário.');
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('email-login').value.trim();
      const senha = document.getElementById('senha-login').value;
      try {
        const data = await entrar(email, senha);
        window.location.href = data.is_demo ? 'dashboard.html?demo=1' : 'dashboard.html';
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao fazer login.');
      }
    });
  }

  const demoLoginButton = document.getElementById('demo-login-button');
  if (demoLoginButton) {
    demoLoginButton.addEventListener('click', async () => {
      demoLoginButton.disabled = true;
      try {
        if (modoLocal) {
          const email = 'teste@plandev.local';
          const senha = 'PlanDevTeste2026!';
          if (!lerUsuarios().some((usuario) => usuario.email === email)) {
            await criarPerfilLocal('Conta de teste', email, senha);
          } else {
            await entrarLocal(email, senha);
          }
          window.location.href = 'dashboard.html?demo=1';
          return;
        }
        const data = await entrar('teste@plandev.local', 'PlanDevTeste2026!');
        window.location.href = data.is_demo ? 'dashboard.html?demo=1' : 'dashboard.html';
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Não foi possível entrar na conta de teste.');
      } finally {
        demoLoginButton.disabled = false;
      }
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAutenticacao, { once: true });
} else {
  iniciarAutenticacao();
}