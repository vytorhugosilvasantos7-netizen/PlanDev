document.addEventListener('DOMContentLoaded', () => {
  const cadastroForm = document.getElementById('cadastro-form');
  const loginForm = document.getElementById('login-form');

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
    const response = await requisicaoApi('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
        const response = await requisicaoApi('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ nome, email, senha })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Erro ao cadastrar usuário.');
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
        const data = await entrar('teste@plandev.local', 'PlanDevTeste2026!');
        window.location.href = data.is_demo ? 'dashboard.html?demo=1' : 'dashboard.html';
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Não foi possível entrar na conta de teste.');
      } finally {
        demoLoginButton.disabled = false;
      }
    });
  }
});
