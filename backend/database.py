import hashlib
import json
import os
import secrets
import sqlite3

DB_PATH = os.path.abspath(
    os.environ.get(
        "PLANDEV_DATABASE_PATH",
        os.path.join(os.path.dirname(__file__), "..", "users.db"),
    )
)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_workspaces (
            user_id INTEGER PRIMARY KEY,
            workspace_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS public_publications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('project', 'portfolio')),
            item_id TEXT NOT NULL,
            content_json TEXT NOT NULL,
            published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, kind, item_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_public_publications_date ON public_publications(published_at DESC)"
    )
    demo_email = "teste@plandev.local"
    demo_user = conn.execute(
        "SELECT id FROM users WHERE email = ?",
        (demo_email,),
    ).fetchone()
    if not demo_user:
        password_hash, password_salt = hash_password("PlanDevTeste2026!")
        conn.execute(
            "INSERT INTO users (nome, email, password_hash, password_salt) VALUES (?, ?, ?, ?)",
            ("Conta de teste", demo_email, password_hash, password_salt),
        )
    conn.commit()
    conn.close()
    return DB_PATH


def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)

    password_bytes = password.encode("utf-8")
    salt_bytes = salt.encode("utf-8")
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password_bytes, salt_bytes, 200_000)
    return hash_bytes.hex(), salt


def validate_email(email: str) -> str:
    return email.strip().lower()


def create_user(nome: str, email: str, password: str):
    if not nome or not email or not password:
        raise ValueError("Nome, e-mail e senha são obrigatórios.")

    if len(password) < 8:
        raise ValueError("A senha deve ter pelo menos 8 caracteres.")

    email_normalizado = validate_email(email)
    password_hash, salt = hash_password(password)

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (nome, email, password_hash, password_salt) VALUES (?, ?, ?, ?)",
            (nome.strip(), email_normalizado, password_hash, salt),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError as exc:
        raise ValueError("Este e-mail já está cadastrado.") from exc
    finally:
        conn.close()


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    hash_gerado, _ = hash_password(password, salt)
    return secrets.compare_digest(hash_gerado, stored_hash)


def get_user_by_email(email: str):
    email_normalizado = validate_email(email)
    conn = get_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE email = ?",
        (email_normalizado,),
    ).fetchone()
    conn.close()
    return dict(user) if user else None


def login_user(email: str, password: str):
    user = get_user_by_email(email)
    if not user:
        return None

    if verify_password(password, user["password_hash"], user["password_salt"]):
        return {
            "id": user["id"],
            "nome": user["nome"],
            "email": user["email"],
        }

    return None


def get_user_workspace(user_id: int):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT workspace_json FROM user_workspaces WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return json.loads(row["workspace_json"]) if row else None
    finally:
        conn.close()


def save_user_workspace(user_id: int, workspace: dict):
    workspace_json = json.dumps(workspace, ensure_ascii=False, separators=(",", ":"))
    conn = get_connection()
    try:
        conn.execute("BEGIN")
        conn.execute(
            """
            INSERT INTO user_workspaces (user_id, workspace_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                workspace_json = excluded.workspace_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, workspace_json),
        )
        conn.execute(
            "DELETE FROM public_publications WHERE user_id = ?",
            (user_id,),
        )
        for project in workspace.get("projetos", []):
            if not isinstance(project, dict) or not project.get("publicado"):
                continue
            project_id = str(project.get("id") or "")
            if not project_id:
                continue
            codigos = project.get("codigos")
            codigos = codigos if isinstance(codigos, dict) else {}
            codigos = dict(codigos)
            aliases = {
                "html": {"html"},
                "css": {"css"},
                "javascript": {"javascript", "js"},
            }
            for key, value in (
                ("HTML", project.get("html")),
                ("CSS", project.get("css")),
                ("JavaScript", project.get("js")),
            ):
                if value and not any(str(name).lower() in aliases[key.lower()] for name in codigos):
                    codigos[key] = value
            codigos_publicos = {}
            total_codigo = 0
            for language, source in list(codigos.items())[:20]:
                if not isinstance(source, str) or total_codigo >= 50_000:
                    continue
                source = source[: min(50_000, 50_000 - total_codigo)]
                if source:
                    codigos_publicos[str(language)[:40]] = source
                    total_codigo += len(source)
            languages = project.get("linguagens")
            if not isinstance(languages, list):
                languages = str(project.get("linguagem") or "").split(",")
            content = {
                "nome": str(project.get("nome") or "Projeto sem nome")[:80],
                "detalhes": str(project.get("detalhes") or "")[:1000],
                "linguagens": [str(language)[:40] for language in languages[:20]],
                "codigos": codigos_publicos,
                "status": str(project.get("status") or "Em andamento")[:30],
            }
            conn.execute(
                """
                INSERT INTO public_publications (user_id, kind, item_id, content_json)
                VALUES (?, 'project', ?, ?)
                """,
                (user_id, project_id, json.dumps(content, ensure_ascii=False, separators=(",", ":"))),
            )

        portfolio = workspace.get("portfolio")
        if isinstance(portfolio, dict) and portfolio.get("publicado"):
            content = {
                "nome": str(portfolio.get("nome") or "")[:60],
                "cargo": str(portfolio.get("cargo") or "")[:60],
                "bio": str(portfolio.get("bio") or "")[:600],
                "skills": str(portfolio.get("skills") or "")[:300],
            }
            if content["nome"] and content["cargo"] and content["bio"]:
                conn.execute(
                    """
                    INSERT INTO public_publications (user_id, kind, item_id, content_json)
                    VALUES (?, 'portfolio', 'portfolio', ?)
                    """,
                    (user_id, json.dumps(content, ensure_ascii=False, separators=(",", ":"))),
                )
        conn.commit()
    finally:
        conn.close()


def get_public_publications(limit: int = 50):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT p.kind, p.item_id, p.content_json, p.published_at, u.nome AS autor
            FROM public_publications AS p
            JOIN users AS u ON u.id = p.user_id
            ORDER BY p.published_at DESC, p.id DESC
            LIMIT ?
            """,
            (max(1, min(limit, 50)),),
        ).fetchall()
        return [
            {
                "tipo": row["kind"],
                "id": row["item_id"],
                "autor": row["autor"],
                "publicado_em": row["published_at"],
                **json.loads(row["content_json"]),
            }
            for row in rows
        ]
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Banco criado em: {DB_PATH}")
