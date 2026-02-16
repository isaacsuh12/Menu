# Menu Studio

A Starbucks-style menu builder with account-based ordering.

## Setup

1. Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Copy environment variables:

```bash
cp .env.example .env
```

Set `MASTER_EMAIL`, `MASTER_PASSWORD`, and `SECRET_KEY` in `.env`.

3. Run the API:

```bash
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

## Notes

- The master account is created on startup if it does not exist.
- Anyone can enable master mode from the UI once logged in.
- Menu items seeded on first run for a demo experience.
- The admin panel appears only for the master account.
