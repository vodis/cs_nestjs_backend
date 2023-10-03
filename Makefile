.ONESHELL:

docker-build:
	@docker compose -f docker-compose.yaml build

docker-run:
	@docker compose -f docker-compose.yaml up -d

docker-stop:
	@docker compose -f docker-compose.yaml down --remove-orphans

docker-db-migrate:
	@docker compose -f docker-compose.yaml run app npm run db:migrate

docker-db-rollback:
	@docker compose -f docker-compose.yaml run app npm run db:migrate:undo
