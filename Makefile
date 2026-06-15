NPM ?= npm

.PHONY: install dev build start lint format test test-e2e test-live db-seed stack-smoke db-up db-down stack-up stack-down prisma-generate prisma-format prisma-migrate

install:
	$(NPM) install

dev:
	$(NPM) run start:dev

build:
	$(NPM) run build

start:
	$(NPM) run start

lint:
	$(NPM) run lint

format:
	$(NPM) run format

test:
	$(NPM) run test

test-e2e:
	$(NPM) run test:e2e

test-live:
	LIVE_TESTS=1 $(NPM) run test:live

db-seed:
	$(NPM) run db:seed

stack-smoke:
	bash scripts/run-live-tests.sh

db-up:
	docker compose up -d postgres mailhog

db-down:
	docker compose down

stack-up:
	docker compose up --build

stack-down:
	docker compose down

prisma-migrate:
	$(NPM) run prisma:migrate:deploy

prisma-generate:
	$(NPM) run prisma:generate

prisma-format:
	$(NPM) run prisma:format
