.ONESHELL:

docker-build:
	@docker compose -f docker-compose.yaml build

docker-run:
	@docker compose -f docker-compose.yaml up -d

docker-stop:
	@docker compose -f docker-compose.yaml down --remove-orphans
