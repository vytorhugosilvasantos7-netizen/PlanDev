import sys
import os
import secrets
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory, session

if __package__ in (None, ""):
    ROOT_DIR = Path(__file__).resolve().parent.parent
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))
    from backend.database import (
        create_user,
        get_public_publications,
        get_user_workspace,
        init_db,
        login_user,
        save_user_workspace,
    )
else:
    from backend.database import (
        create_user,
        get_public_publications,
        get_user_workspace,
        init_db,
        login_user,
        save_user_workspace,
    )

BASE_DIR = Path(__file__).resolve().parent.parent
PAGES_DIR = BASE_DIR / "pages"
SRC_DIR = BASE_DIR / "src"

app = Flask(__name__)
if os.environ.get("PLANDEV_SECRET_KEY"):
    app.secret_key = os.environ["PLANDEV_SECRET_KEY"]
else:
    INSTANCE_DIR = BASE_DIR / "instance"
    INSTANCE_DIR.mkdir(exist_ok=True)
    SECRET_KEY_PATH = INSTANCE_DIR / "secret_key"
    try:
        app.secret_key = SECRET_KEY_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        app.secret_key = secrets.token_hex(32)
        SECRET_KEY_PATH.write_text(app.secret_key, encoding="utf-8")
app.config.update(
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.environ.get("RENDER")),
)
init_db()


@app.route("/")
def home():
    if "user" in session:
        return redirect("/pages/dashboard.html")
    return redirect("/pages/cadastro.html")


@app.route("/dashboard")
def dashboard_route():
    if "user" not in session:
        return redirect("/pages/login.html")
    return send_from_directory(str(PAGES_DIR), "dashboard.html")


@app.route("/pages/<path:filename>")
def page_files(filename):
    if filename == "dashboard.html" and "user" not in session:
        return redirect("/pages/login.html")
    return send_from_directory(str(PAGES_DIR), filename)


@app.route("/src/<path:filename>")
def src_files(filename):
    return send_from_directory(str(SRC_DIR), filename)


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or request.form
    nome = (data.get("nome") or "").strip()
    email = (data.get("email") or "").strip().lower()
    senha = data.get("senha") or data.get("password") or ""

    try:
        create_user(nome, email, senha)
        user = login_user(email, senha)
        session.clear()
        session["user"] = user
        return jsonify({
            "success": True,
            "message": "Cadastro realizado com sucesso.",
            "user": user
        }), 201
    except ValueError as exc:
        return jsonify({
            "success": False,
            "message": str(exc)
        }), 400


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    email = (data.get("email") or "").strip().lower()
    senha = data.get("senha") or data.get("password") or ""

    user = login_user(email, senha)
    if not user:
        return jsonify({
            "success": False,
            "message": "E-mail ou senha inválidos."
        }), 401

    session.clear()
    session["user"] = user
    return jsonify({
        "success": True,
        "message": "Login realizado com sucesso.",
        "is_demo": user["email"] == "teste@plandev.local",
        "user": user
    }), 200


@app.route("/api/eu", methods=["GET"])
def api_current_user():
    user = session.get("user")
    if not user:
        return jsonify({
            "success": False,
            "message": "É necessário entrar na sua conta."
        }), 401

    return jsonify(user), 200


@app.route("/api/sair", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({
        "success": True,
        "message": "Sessão encerrada."
    }), 200


@app.route("/api/workspace", methods=["GET", "PUT"])
def api_workspace():
    user = session.get("user")
    if not user:
        return jsonify({
            "success": False,
            "message": "Sua sessão expirou. Entre novamente."
        }), 401

    if request.method == "GET":
        workspace = get_user_workspace(user["id"])
        return jsonify({
            "success": True,
            "exists": workspace is not None,
            "workspace": workspace
        }), 200

    data = request.get_json(silent=True)
    workspace = data.get("workspace") if isinstance(data, dict) else None
    if not isinstance(workspace, dict):
        return jsonify({
            "success": False,
            "message": "Os dados do workspace estão em formato inválido."
        }), 400

    if len(request.get_data()) > 5 * 1024 * 1024:
        return jsonify({
            "success": False,
            "message": "Os dados do workspace ultrapassam o limite permitido."
        }), 413

    try:
        save_user_workspace(user["id"], workspace)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "Não foi possível salvar os dados do workspace."
        }), 400

    return jsonify({
        "success": True,
        "message": "Workspace salvo."
    }), 200


@app.route("/api/online", methods=["GET"])
def api_online():
    try:
        publications = get_public_publications()
    except (ValueError, TypeError):
        app.logger.exception("Não foi possível ler as publicações da comunidade.")
        return jsonify({
            "success": False,
            "message": "Não foi possível carregar as publicações agora."
        }), 500
    return jsonify({
        "success": True,
        "publicacoes": publications,
    }), 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
