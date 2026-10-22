# CampusVote Backend Service

The backend service for CampusVote is built on Django 5 and Django REST Framework, with Django Channels for asynchronous real-time events.

## Prerequisites
* Python 3.10+ (tested with Python 3.13)
* Windows PowerShell / Linux Bash

## Quick Start (Local Development with SQLite Fallback)

1. **Activate Virtual Environment:**
   ```powershell
   # Windows PowerShell
   .\backend\venv\Scripts\Activate.ps1
   ```

2. **Install Dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Run Database Migrations:**
   ```powershell
   python manage.py migrate
   ```

4. **Run Unit and API Tests:**
   ```powershell
   python manage.py test tests
   ```

5. **Start Development Server:**
   ```powershell
   python manage.py runserver 127.0.0.1:8000
   ```

## Production & PostgreSQL Mode
To run against PostgreSQL (e.g., via Docker Compose):
1. Start the database service:
   ```powershell
   docker-compose up -d postgres redis
   ```
2. Set environment variables in `.env`:
   ```dotenv
   DB_ENGINE=postgresql
   DB_NAME=campusvote_db
   DB_USER=campusvote_user
   DB_PASSWORD=your_secure_password
   DB_HOST=127.0.0.1
   DB_PORT=5432
   ```
3. Run migrations and start the server as usual.

## API Health Check
* `GET /api/v1/health/`
  Returns process status, service version, environment, and database dependency status.
