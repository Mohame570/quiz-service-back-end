NPM ?= npm

.PHONY: install dev build start lint format test test-e2e db-up db-down prisma-generate prisma-format

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

db-up:
	docker compose up -d postgres mailhog

db-down:
	docker compose down

prisma-generate:
	$(NPM) run prisma:generate

prisma-format:
	$(NPM) run prisma:format
