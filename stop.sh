#!/bin/bash

docker-compose -f artifacts/docker-compose.yaml down
docker rm -v -f $(docker ps -aq)
docker rmi -f $(docker images | grep dev- | awk '{print $3}')
rm -rf artifacts/channel/crypto-config
rm -rf artifacts/channel/genesis.block
rm -rf artifacts/channel/*.tx
rm -rf fabric-client-kv-org[1-3]
rm -rf /tmp/fabric-client-kv-org[1-3]
./scripts/restore-config.sh 
docker network prune
docker container prune
docker volume prune