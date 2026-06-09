PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
RUFF := $(VENV)/bin/ruff
UVICORN := $(VENV)/bin/uvicorn

.PHONY: install run test lint db-up db-down

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[dev]"

run:
	$(UVICORN) app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	$(PYTEST)

lint:
	$(RUFF) check .

db-up:
	docker compose up -d postgres

db-down:
	docker compose down
