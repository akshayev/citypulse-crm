.PHONY: build up down logs seed test

build:        ## Build backend + frontend images
	docker compose build

up:           ## Start the full stack (backend :8000, frontend :3000)
	docker compose up --build

down:         ## Stop and remove containers
	docker compose down

logs:         ## Tail logs
	docker compose logs -f

seed:         ## Load demo leads + a demo admin (uses backend container env)
	docker compose run --rm backend python -m backend.scripts.seed

test:         ## Run backend tests in the backend image
	docker compose run --rm backend python -m pytest backend/tests -q
